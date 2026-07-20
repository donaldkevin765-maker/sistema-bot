// ============================================================
// G5 — Bot AI per SIGNAL (4-Player Stealth/Bluff FFA)
// ============================================================

const { BotManager, SkillTracker, BASE_DIFF_PARAMS } = require('./bot-core.js');

// ─── Nomi a tema ───────────────────────────────────────────
const BOT_NAMES_G5 = [
  'Ghost', 'Shadow', 'Wraith', 'Phantom', 'Specter',
  'Shade', 'Mirage', 'Vapor', 'Smoke', 'Echo',
  'Stealth', 'Cloak', 'Veil', 'Murmur', 'Whisper',
];

const ARENA_W = 900;
const ARENA_H = 600;
const PLAYER_RADIUS = 13;
const PLAYER_SPEED = 150;
const DECOY_FOLLOW_MIN = 0.03;
const DECOY_FOLLOW_MAX = 0.88;
const DECOY_NOISE_MIN = 7;
const DECOY_NOISE_MAX = 90;
const ELIM_RADIUS = 35;
const ELIM_COOLDOWN = 0.8;

// ─── G5BotBrain ────────────────────────────────────────────
// Gioco stealth: corpo reale invisibile, decoy (segnale) visibile.
// Stare fermi → decoy vaga lontano (ci si nasconde).
// Sprintare → decoy segue (ci si espone).
// Click vicino alla posizione REALE nemica per eliminare.
class G5BotBrain {
  constructor(playerId, difficulty, paramOverrides = {}) {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty], ...paramOverrides };

    this.state = 'stealth';   // stealth | reposition | attack | evade
    this.targetId = null;
    this.lastElimTime = 0;
    this.lastReposTime = 0;
    this.repositionInterval = 3000 + Math.random() * 3000; // ms

    // Mappa posizioni stimate dei nemici: playerId → { x, y, confidence, lastUpdate }
    this.enemyEstimates = new Map();

    this.decoyHistory = []; // per tracciare pattern dei decoy
    this.lastRealX = 0;
    this.lastRealY = 0;
    this.idleTimer = 0;
  }

  think(player, room, now) {
    if (!player || !player.alive) return null;

    this._updateEnemyEstimates(player, room, now);

    // Se non ci sono nemici vivi, non fare nulla
    const aliveEnemies = this._getAliveEnemies(player, room);
    if (aliveEnemies.length === 0) return null;

    // Trova il nemico più vicino stimato
    const nearestEnemy = this._getNearestEstimatedEnemy(player, room, now);

    if (!nearestEnemy) {
      // Nessuna stima — esplora
      return this._wander(player, room, now);
    }

    const distToEnemy = Math.sqrt(
      (nearestEnemy.estX - player.x) ** 2 + (nearestEnemy.estY - player.y) ** 2
    );

    // Decidi strategia
    if (distToEnemy < 100 && nearestEnemy.confidence > 0.6) {
      // Nemico vicino e stimato con buona confidenza → attacca!
      this.state = 'attack';
      return this._attack(player, nearestEnemy, now, room);
    } else if (distToEnemy < 150) {
      // Nemico nelle vicinanze → stealth (muoviti lentamente, nasconditi)
      this.state = 'stealth';
      return this._stealthMove(player, nearestEnemy, now);
    } else {
      // Nemico lontano → riposizionati velocemente
      this.state = 'reposition';
      return this._reposition(player, nearestEnemy, now);
    }
  }

  // Stima posizione reale del nemico dal suo decoy + pattern
  _updateEnemyEstimates(player, room, now) {
    room.players.forEach((p, id) => {
      if (id === player.id || !p.alive || p.disconnected) return;

      // Il decoy è sempre visibile nel common state
      // La posizione reale = decoy con correzione basata su velocità di movimento
      // Se il decoy è VICINO alla posizione reale → il nemico si sta muovendo
      // Se il decoy è LONTANO → il nemico è fermo

      const decoyX = p.decoyX || p.x;
      const decoyY = p.decoyY || p.y;

      // Stima: la posizione reale è in un raggio intorno al decoy
      // Se il giocatore è fermo, il decoy può essere fino a NOISE_MAX lontano
      // Se il giocatore sprinta, il decoy è quasi sulla posizione reale

      // Usiamo la storia del decoy per stimare la direzione e velocità
      if (!this.decoyHistory[id]) this.decoyHistory[id] = [];
      this.decoyHistory[id].push({ x: decoyX, y: decoyY, time: now });
      if (this.decoyHistory[id].length > 10) this.decoyHistory[id].shift();

      // Calcola velocità media del decoy negli ultimi frame
      const hist = this.decoyHistory[id];
      let avgSpeed = 0;
      if (hist.length >= 2) {
        const first = hist[0];
        const last = hist[hist.length - 1];
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        avgSpeed = Math.sqrt(dx * dx + dy * dy) / (hist.length * (1 / 30)); // px/s
      }

      // Stima raggio di incertezza: decoy si muove poco → nemico fermo → alto rumore
      // decoy si muove molto → nemico sprinta → basso rumore
      const noiseSigma = DECOY_NOISE_MAX - (DECOY_NOISE_MAX - DECOY_NOISE_MIN) *
        Math.min(1, avgSpeed / PLAYER_SPEED);

      // La posizione reale è probabilmente vicina al centro del movimento del decoy
      // ma con offset casuale dovuto al rumore
      let estX = decoyX;
      let estY = decoyY;

      // Più il decoy si muove veloce, più la stima è accurata
      const confidence = Math.min(0.9, avgSpeed / PLAYER_SPEED * 0.5 +
        (1 - noiseSigma / DECOY_NOISE_MAX) * 0.5);

      // Aggiungi offset basato sulla direzione recente (il decoy lagga dietro)
      if (hist.length >= 3) {
        const dirX = hist[hist.length - 1].x - hist[Math.floor(hist.length / 2)].x;
        const dirY = hist[hist.length - 1].y - hist[Math.floor(hist.length / 2)].y;
        const dirMag = Math.sqrt(dirX * dirX + dirY * dirY);
        if (dirMag > 0) {
          // Il corpo reale è probabilmente avanti rispetto al decoy
          const lead = Math.min(noiseSigma * 0.3, 20);
          estX += (dirX / dirMag) * lead;
          estY += (dirY / dirMag) * lead;
        }
      }

      // Aggiungi esplorazione casuale per easy/medium
      if (this.difficulty !== 'hard') {
        const uncertainty = this.difficulty === 'easy' ? noiseSigma * 0.5 : noiseSigma * 0.25;
        estX += (Math.random() - 0.5) * uncertainty;
        estY += (Math.random() - 0.5) * uncertainty;
      }

      estX = Math.max(PLAYER_RADIUS, Math.min(ARENA_W - PLAYER_RADIUS, estX));
      estY = Math.max(PLAYER_RADIUS, Math.min(ARENA_H - PLAYER_RADIUS, estY));

      this.enemyEstimates.set(id, {
        estX, estY,
        confidence,
        lastUpdate: now,
        decoyX,
        decoyY,
        noiseSigma,
      });
    });

    // Pulisci stime per nemici morti
    for (const [id] of this.enemyEstimates) {
      if (!room.players.has(id) || !room.players.get(id).alive) {
        this.enemyEstimates.delete(id);
      }
    }
  }

  _getAliveEnemies(player, room) {
    const enemies = [];
    room.players.forEach((p, id) => {
      if (id !== player.id && p.alive && !p.disconnected) {
        enemies.push({ id, player: p });
      }
    });
    return enemies;
  }

  _getNearestEstimatedEnemy(player, room, now) {
    let nearest = null;
    let nearestDist = Infinity;

    this.enemyEstimates.forEach((est, id) => {
      if (!room.players.has(id) || !room.players.get(id).alive) return;

      const dx = est.estX - player.x;
      const dy = est.estY - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Distanza pesata per confidenza (più confidenza = più "vicino")
      const weightedDist = dist * (1.5 - est.confidence);

      if (weightedDist < nearestDist) {
        nearestDist = weightedDist;
        nearest = { id, ...est, dist };
      }
    });

    return nearest;
  }

  _stealthMove(player, enemy, now) {
    // Muoviti lentamente e in modo imprevedibile
    // Stare fermi = decoy si allontana = più nascosti
    // Ma dobbiamo comunque avvicinarci per attaccare

    let dx = 0, dy = 0;

    // Muoviti verso il nemico ma lentamente e a scatti
    const toEnemyX = enemy.estX - player.x;
    const toEnemyY = enemy.estY - player.y;
    const dist = Math.sqrt(toEnemyX * toEnemyX + toEnemyY * toEnemyY);

    if (dist > 30 && Math.random() < 0.3) {
      // Movimento lento verso il nemico
      dx += (toEnemyX / dist) * 0.3;
      dy += (toEnemyY / dist) * 0.3;
    }

    // A volte muoviti lateralmente per confondere
    if (Math.random() < 0.2) {
      dx += (Math.random() - 0.5) * 0.4;
      dy += (Math.random() - 0.5) * 0.4;
    }

    // Se il nemico ha alta confidenza (ci sta vedendo), fermati
    if (enemy.confidence > 0.7 && Math.random() < 0.5) {
      dx = 0;
      dy = 0;
    }

    // Per easy: muoviti più casualmente
    if (this.difficulty === 'easy') {
      dx += (Math.random() - 0.5) * 1.0;
      dy += (Math.random() - 0.5) * 1.0;
    }

    return this._normalizeInput(dx, dy, now);
  }

  _reposition(player, enemy, now) {
    // Sprinta verso una posizione strategicamente vantaggiosa
    // (dietro il nemico o verso un ostacolo per copertura)

    // Scegli un punto di riposizionamento: leggermente偏移 dalla linea verso il nemico
    const toEnemyX = enemy.estX - player.x;
    const toEnemyY = enemy.estY - player.y;
    const dist = Math.sqrt(toEnemyX * toEnemyX + toEnemyY * toEnemyY);

    let targetX, targetY;

    if (dist > 200) {
      // Lontano: punta leggermente a lato del nemico per approccio
      const offset = (Math.random() - 0.5) * 100;
      targetX = enemy.estX + (enemy.estY - player.y) * 0.1 + offset;
      targetY = enemy.estY - (enemy.estX - player.x) * 0.1 + offset;
    } else {
      // Abbastanza vicino: vai dritto verso il nemico
      targetX = enemy.estX;
      targetY = enemy.estY;
    }

    targetX = Math.max(50, Math.min(ARENA_W - 50, targetX));
    targetY = Math.max(50, Math.min(ARENA_H - 50, targetY));

    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const tDist = Math.sqrt(dx * dx + dy * dy);

    if (tDist > 5) {
      return this._normalizeInput(dx / tDist, dy / tDist, now);
    }

    return null;
  }

  _attack(player, enemy, now) {
    // Avvicinati e cerca di eliminare
    const dx = enemy.estX - player.x;
    const dy = enemy.estY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Se siamo abbastanza vicini e abbiamo confidenza → click!
    const elimCooldown = ELIM_COOLDOWN * 1000;
    if (dist < 100 && enemy.confidence > 0.6 &&
        (now - this.lastElimTime) > elimCooldown) {
      this.lastElimTime = now;

      // Il click deve essere sulla posizione REALE stimata
      // Aggiungi piccola dispersione per difficoltà
      const spread = this.difficulty === 'easy' ? 15 : this.difficulty === 'medium' ? 8 : 3;
      const clickX = enemy.estX + (Math.random() - 0.5) * spread;
      const clickY = enemy.estY + (Math.random() - 0.5) * spread;

      return {
        w: false, s: false, a: false, d: false,
        action: 'eliminate', ex: clickX, ey: clickY,
      };
    }

    // Avvicinati ancora
    if (dist > 20) {
      const normX = dx / dist;
      const normY = dy / dist;
      // Vai più lentamente quando sei vicino (stealth)
      const speedFactor = Math.min(1, dist / 60);
      return this._normalizeInput(normX * speedFactor, normY * speedFactor, now);
    }

    return null;
  }

  _wander(player, room, now) {
    // Esplorazione casuale
    const dir = Math.random();
    let dx = 0, dy = 0;

    if (dir < 0.25) dy = -1;
    else if (dir < 0.5) dy = 1;
    else if (dir < 0.75) dx = -1;
    else dx = 1;

    // Tieni dentro l'arena
    if (player.x < 100) dx = 1;
    if (player.x > ARENA_W - 100) dx = -1;
    if (player.y < 100) dy = 1;
    if (player.y > ARENA_H - 100) dy = -1;

    return this._normalizeInput(dx, dy, now);
  }

  _normalizeInput(dx, dy, now) {
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0) {
      dx /= mag;
      dy /= mag;
    } else {
      return null;
    }

    const w = dy < -0.1;
    const s = dy > 0.1;
    const a = dx < -0.1;
    const d = dx > 0.1;

    // Non inviare input se entrambe le direzioni sono annullate
    if (!w && !s && !a && !d) return null;

    return { w, s, a, d };
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty] };
  }
}

// ─── G5BotManager ──────────────────────────────────────────
class G5BotManager extends BotManager {
  createBrain(botId, difficulty) {
    return new G5BotBrain(botId, difficulty);
  }

  getBotNames() {
    return BOT_NAMES_G5;
  }
}

module.exports = { G5BotManager, G5BotBrain, SkillTracker, BotManager };
