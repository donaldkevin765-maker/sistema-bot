// ============================================================
// G1 — Bot AI per NEON CONQUEST (2v2 Capture Point Arena)
// Usa bot-core.js come infrastruttura condivisa
// ============================================================

const { BotManager, SkillTracker, BASE_DIFF_PARAMS } = require('./bot-core.js');

// Esporta SkillTracker per compatibilità con G1_server.js
// (usa l'istanza condivisa da bot-core)
module.exports = { BotManager, SkillTracker };

// ─── Nomi a tema per NEON CONQUEST ─────────────────────────
const BOT_NAMES_G1 = [
  'Nova', 'Viper', 'Pixel', 'Hex', 'Phantom',
  'Blitz', 'Raven', 'Cipher', 'Frost', 'Storm',
  'Shadow', 'Neon', 'Crusher', 'Wraith', 'Flux',
];

// ─── BotBrain G1 ───────────────────────────────────────────
// Cervello specifico per NEON CONQUEST
class G1BotBrain {
  constructor(playerId, difficulty, paramOverrides = {}) {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty], ...paramOverrides };

    // Stato interno
    this.targetX = 0;
    this.targetY = 0;
    this.targetEnemy = null;
    this.state = 'roam';             // roam | attack | retreat | capture
    this.stateTimer = 0;
    this.decisionCounter = 0;
    this.decisionInterval = 10;
    this.stuckCounter = 0;
    this.lastPos = { x: 0, y: 0 };
    this.dodgeTimer = 0;

    // Input correnti
    this.w = this.a = this.s = this.d = false;
    this.shoot = false;
    this.mx = 0;
    this.my = 0;
  }

  // ── Ciclo principale ──────────────────────────────────────
  think(player, room, now) {
    this.decisionCounter++;
    if (this.dodgeTimer > 0) this.dodgeTimer--;

    if (this.decisionCounter >= this.decisionInterval) {
      this.decisionCounter = 0;
      this.decisionInterval = 5 + Math.floor(Math.random() * 8);
      this.chooseStrategy(player, room);
    }

    switch (this.state) {
      case 'attack':  this.thinkAttack(player, room, now); break;
      case 'retreat':  this.thinkRetreat(player, room); break;
      case 'capture':  this.thinkCapture(player, room, now); break;
      default:         this.thinkRoam(player, room); break;
    }

    // Stuck detection
    const moved = Math.abs(player.x - this.lastPos.x) > 2
               || Math.abs(player.y - this.lastPos.y) > 2;
    if (!moved) {
      this.stuckCounter++;
      if (this.stuckCounter > 15) {
        const dir = Math.floor(Math.random() * 4);
        this.w = dir === 0; this.s = dir === 1;
        this.a = dir === 2; this.d = dir === 3;
        this.stuckCounter = 0;
      }
    } else {
      this.stuckCounter = Math.max(0, this.stuckCounter - 2);
    }
    this.lastPos.x = player.x;
    this.lastPos.y = player.y;

    return {
      w: this.w, a: this.a, s: this.s, d: this.d,
      mx: this.mx, my: this.my, shoot: this.shoot,
    };
  }

  // ── Scelta strategia ─────────────────────────────────────
  chooseStrategy(player, room) {
    const enemies = this.findEnemies(player, room);
    const nearestEnemy = this.findNearest(player, enemies);
    const nearestCp = this.findNearestCapturePoint(player, room);
    const hpRatio = player.hp / player.maxHp;

    // P0: Ritirata se HP basso
    if (hpRatio < this.params.retreatThreshold && nearestEnemy) {
      this.state = 'retreat';
      this.stateTimer = 30 + Math.floor(Math.random() * 20);
      return;
    }

    // P1: Nemico sta decatturando un nostro punto
    if (nearestCp && nearestCp.owner === player.team && nearestCp.progress > 0 && nearestCp.progress < 1) {
      const enemyAtCp = enemies.find(e => {
        if (!e.alive || e.disconnected) return false;
        const dx = e.x - nearestCp.x, dy = e.y - nearestCp.y;
        return dx * dx + dy * dy < 6400;
      });
      if (enemyAtCp) {
        this.state = 'attack'; this.targetEnemy = enemyAtCp;
        this.stateTimer = 50 + Math.floor(Math.random() * 30);
        return;
      }
    }

    // P2: Nemico vicino → attacca il più debole
    if (nearestEnemy) {
      const dist = this.distance(player, nearestEnemy);
      if (dist < 250 || (nearestCp && nearestCp.owner !== player.team && dist < 300)) {
        this.state = 'attack';
        const weakest = enemies.reduce((a, b) => (!a || a.hp > b.hp) ? b : a, null);
        this.targetEnemy = (weakest && this.distance(player, weakest) < 300) ? weakest : nearestEnemy;
        this.stateTimer = 40 + Math.floor(Math.random() * 30);
        return;
      }
    }

    // P3: Cattura punto non posseduto
    if (nearestCp && nearestCp.owner !== player.team && nearestCp.progress < 1) {
      this.state = 'capture';
      this.targetX = nearestCp.x; this.targetY = nearestCp.y;
      this.stateTimer = 60 + Math.floor(Math.random() * 30);
      return;
    }

    // Default: roaming
    this.state = 'roam';
    this.stateTimer = 40 + Math.floor(Math.random() * 40);
  }

  // ── Attacco ──────────────────────────────────────────────
  thinkAttack(player, room, now) {
    const enemy = this.targetEnemy;
    if (!enemy || !enemy.alive || enemy.disconnected) {
      this.state = 'roam'; this.targetEnemy = null; return;
    }

    const dist = this.distance(player, enemy);
    const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);

    // Mira con errore (difficoltà)
    this.mx = enemy.x + (Math.random() - 0.5) * this.params.aimError * 2;
    this.my = enemy.y + (Math.random() - 0.5) * this.params.aimError * 2;

    // Movimento orbitale
    const orbitAngle = angle + (Math.random() > 0.5 ? 1 : -1) * 1.2;
    if (Math.random() < this.params.moveRandomness) {
      this.w = Math.random() > 0.5; this.s = Math.random() > 0.5;
      this.a = Math.random() > 0.5; this.d = Math.random() > 0.5;
    } else {
      this.w = Math.sin(orbitAngle) < -0.2;
      this.s = Math.sin(orbitAngle) > 0.2;
      this.a = Math.cos(orbitAngle) < -0.2;
      this.d = Math.cos(orbitAngle) > 0.2;
    }

    // Sparo: solo se mirato verso il nemico
    const aimAngle = Math.atan2(this.my - player.y, this.mx - player.x);
    const enemyAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    let angleDiff = Math.abs(aimAngle - enemyAngle);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
    const onTarget = angleDiff < 0.6;
    const shootTiming = this.difficulty === 'easy' ? Math.random() < 0.7 : Math.random() < 0.95;
    this.shoot = dist < 300 && onTarget && shootTiming;

    this.dodgeProjectiles(player, room);

    if (dist > 400) {
      this.targetEnemy = this.findNearest(player, this.findEnemies(player, room));
    }
  }

  // ── Ritirata ─────────────────────────────────────────────
  thinkRetreat(player, room) {
    const enemies = this.findEnemies(player, room);
    const nearest = this.findNearest(player, enemies);
    if (!nearest) { this.state = 'roam'; return; }

    const angle = Math.atan2(player.y - nearest.y, player.x - nearest.x);
    this.w = Math.sin(angle) < -0.2; this.s = Math.sin(angle) > 0.2;
    this.a = Math.cos(angle) < -0.2; this.d = Math.cos(angle) > 0.2;
    this.shoot = Math.random() < 0.3 && this.distance(player, nearest) < 250;
    this.mx = nearest.x; this.my = nearest.y;
    this.dodgeProjectiles(player, room);
  }

  // ── Cattura punto ────────────────────────────────────────
  thinkCapture(player, room, now) {
    const cp = this.findNearestCapturePoint(player, room);
    if (!cp || cp.owner === player.team) { this.state = 'roam'; return; }

    const dist = this.distanceTo(player, cp.x, cp.y);
    const angle = Math.atan2(cp.y - player.y, cp.x - player.x);

    if (dist > 44) { // ~80% di CAPTURE_RADIUS
      this.w = Math.sin(angle) < -0.2; this.s = Math.sin(angle) > 0.2;
      this.a = Math.cos(angle) < -0.2; this.d = Math.cos(angle) > 0.2;
    } else {
      this.w = this.s = this.a = this.d = false;
    }

    const enemies = this.findEnemies(player, room);
    const nearest = this.findNearest(player, enemies);
    if (nearest && this.distance(player, nearest) < 250) {
      this.mx = nearest.x; this.my = nearest.y; this.shoot = true;
    } else {
      this.mx = cp.x + Math.sin(now * 0.001) * 50;
      this.my = cp.y + Math.cos(now * 0.001) * 50;
      this.shoot = false;
    }

    this.dodgeProjectiles(player, room);
  }

  // ── Roaming ───────────────────────────────────────────────
  thinkRoam(player, room) {
    const enemies = this.findEnemies(player, room);
    const nearest = this.findNearest(player, enemies);
    if (nearest && this.distance(player, nearest) < 300) {
      this.state = 'attack'; this.targetEnemy = nearest; return;
    }

    const cp = this.findNearestCapturePoint(player, room);
    if (cp) {
      const angle = Math.atan2(cp.y - player.y, cp.x - player.x);
      this.w = Math.sin(angle) < -0.2; this.s = Math.sin(angle) > 0.2;
      this.a = Math.cos(angle) < -0.2; this.d = Math.cos(angle) > 0.2;
      this.mx = cp.x; this.my = cp.y;
    } else {
      this.w = Math.random() > 0.6; this.s = Math.random() > 0.7;
      this.a = Math.random() > 0.7; this.d = Math.random() > 0.6;
      this.mx = 450 + (Math.random() - 0.5) * 200;
      this.my = 300 + (Math.random() - 0.5) * 200;
    }
    this.shoot = false;
  }

  // ── Utility ──────────────────────────────────────────────
  findEnemies(player, room) {
    const enemies = [];
    room.players.forEach(p => {
      if (p.team !== player.team && p.alive && !p.disconnected) enemies.push(p);
    });
    return enemies;
  }

  findNearest(player, targets) {
    let nearest = null, minDist = Infinity;
    for (const t of targets) {
      const d = this.distance(player, t);
      if (d < minDist) { minDist = d; nearest = t; }
    }
    return nearest;
  }

  findNearestCapturePoint(player, room) {
    let nearest = null, minDist = Infinity;
    for (const cp of room.capturePoints) {
      const d = this.distanceTo(player, cp.x, cp.y);
      if (d < minDist) { minDist = d; nearest = cp; }
    }
    return nearest;
  }

  distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distanceTo(a, x, y) {
    const dx = a.x - x, dy = a.y - y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  dodgeProjectiles(player, room) {
    if (this.dodgeTimer > 0) return;
    if (Math.random() > this.params.dodgeChance) return;

    let nearestProj = null, nearestDist = Infinity;
    if (room.projectiles && typeof room.projectiles.each === 'function') {
      room.projectiles.each(b => {
        if (!b._active) return;
        const dist = this.distanceTo(player, b.x, b.y);
        if (dist < 100 && dist < nearestDist) { nearestProj = b; nearestDist = dist; }
      });
    }

    if (nearestProj) {
      const angle = Math.atan2(player.y - nearestProj.y, player.x - nearestProj.x);
      this.w = Math.sin(angle) < -0.3; this.s = Math.sin(angle) > 0.3;
      this.a = Math.cos(angle) < -0.3; this.d = Math.cos(angle) > 0.3;
      this.dodgeTimer = 5;
    }
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty] };
  }
}

// ─── G1BotManager ──────────────────────────────────────────
// Estende BotManager base con logica specifica per G1
class G1BotManager extends BotManager {
  createBrain(botId, difficulty) {
    return new G1BotBrain(botId, difficulty);
  }

  getBotNames() {
    return BOT_NAMES_G1;
  }

  // Hook: dopo aver aggiunto bot, controlla se la stanza è piena per far partire
  addBot() {
    const id = super.addBot();
    if (id && typeof this.room.startIfReady === 'function') {
      this.room.startIfReady();
    }
    return id;
  }
}

// Esporta anche G1BotBrain per test
module.exports = { G1BotManager, G1BotBrain, SkillTracker, BotManager };
