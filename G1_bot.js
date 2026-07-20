// ============================================================
// G1 — Bot AI Module
// Bot giocatori con difficoltà adattiva per NEON CONQUEST
// Skill tracking integrato per calibrazione in tempo reale
// ============================================================

// ─── Costanti bot ───────────────────────────────────────────
const BOT_NAMES_G1 = [
  'Nova', 'Viper', 'Pixel', 'Hex', 'Phantom',
  'Blitz', 'Raven', 'Cipher', 'Frost', 'Storm',
  'Shadow', 'Neon', 'Crusher', 'Wraith', 'Flux',
];

// Parametri base per difficoltà (0 = facile, 1 = difficile)
const DIFF_PARAMS = {
  // aimError: pixel di offset casuale nel mirare
  // reactionDelay: tick di ritardo prima di reagire
  // moveRandomness: probabilità di movimento erratico (0-1)
  // retreatThreshold: %HP sotto cui ritirarsi
  // shootCooldown: moltiplicatore del cooldown di sparo
  easy:   { aimError: 40, reactionDelay: 8, moveRandomness: 0.4, retreatThreshold: 0.2, shootCooldown: 1.5, dodgeChance: 0.1 },
  medium: { aimError: 20, reactionDelay: 4, moveRandomness: 0.2, retreatThreshold: 0.3, shootCooldown: 1.0, dodgeChance: 0.3 },
  hard:   { aimError: 8,  reactionDelay: 2, moveRandomness: 0.1, retreatThreshold: 0.4, shootCooldown: 0.8, dodgeChance: 0.5 },
};

// ─── Skill Tracker ─────────────────────────────────────────
// Monitora le prestazioni dei giocatori umani e calibra i bot
class SkillTracker {
  constructor() {
    this.playerStats = new Map();
  }

  // Crea un nuovo tracker per un giocatore
  initPlayer(playerId) {
    this.playerStats.set(playerId, {
      shotsFired: 0,
      shotsHit: 0,
      kills: 0,
      deaths: 0,
      capturePoints: 0,
      survivalTime: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      gamesPlayed: 0,
      lastGameTime: 0,
      // Rolling window per calcoli recenti
      recentGames: [],
    });
  }

  // Registra un evento
  recordEvent(playerId, eventType, data = {}) {
    const stats = this.playerStats.get(playerId);
    if (!stats) return;

    switch (eventType) {
      case 'shot':
        stats.shotsFired++;
        break;
      case 'hit':
        stats.shotsHit++;
        stats.totalDamageDealt += data.damage || 0;
        break;
      case 'kill':
        stats.kills++;
        break;
      case 'death':
        stats.deaths++;
        if (data.survivalTime) stats.survivalTime += data.survivalTime;
        break;
      case 'capture':
        stats.capturePoints++;
        break;
      case 'damage_taken':
        stats.totalDamageTaken += data.damage || 0;
        break;
      case 'game_end':
        stats.gamesPlayed++;
        stats.recentGames.push({
          kills: stats.kills - (stats.recentGames.reduce((s, g) => s + g.kills, 0)),
          deaths: stats.deaths - (stats.recentGames.reduce((s, g) => s + g.deaths, 0)),
          captures: stats.capturePoints - (stats.recentGames.reduce((s, g) => s + g.captures, 0)),
          survived: data.survivalTime || 0,
        });
        // Mantieni solo le ultime 10 partite
        if (stats.recentGames.length > 10) stats.recentGames.shift();
        break;
    }
  }

  // Calcola il livello di abilità del giocatore (0-1)
  getSkillLevel(playerId) {
    const stats = this.playerStats.get(playerId);
    if (!stats || stats.gamesPlayed < 1) return 0.5; // Default: medio

    // Fattori ponderati
    const accuracy = stats.shotsFired > 0 ? stats.shotsHit / stats.shotsFired : 0.3;
    const kd = stats.deaths > 0 ? Math.min(stats.kills / stats.deaths, 5) / 5 : 0.5;
    const capturesPerGame = stats.gamesPlayed > 0 ? stats.capturePoints / stats.gamesPlayed / 5 : 0.3;
    const avgSurvival = stats.gamesPlayed > 0 ? stats.survivalTime / stats.gamesPlayed / 30 : 0.3;

    // Pesi: accuracy 30%, K/D 30%, captures 20%, survival 20%
    const skill = accuracy * 0.3 + kd * 0.3 + capturesPerGame * 0.2 + Math.min(avgSurvival, 1) * 0.2;

    return Math.max(0.1, Math.min(0.95, skill));
  }

  // Restituisce la difficoltà consigliata per un bot contro questo giocatore
  getRecommendedDifficulty(playerIds) {
    if (playerIds.length === 0) return 'medium';

    // Media del skill level di tutti i giocatori umani
    let totalSkill = 0;
    let count = 0;
    for (const id of playerIds) {
      const stats = this.playerStats.get(id);
      if (stats && stats.gamesPlayed > 0) {
        totalSkill += this.getSkillLevel(id);
        count++;
      }
    }

    if (count === 0) return 'medium';

    const avgSkill = totalSkill / count;

    // Mappa skill 0-1 a difficoltà
    if (avgSkill < 0.3) return 'easy';
    if (avgSkill < 0.6) return 'medium';
    return 'hard';
  }
}

// ─── Bot AI ────────────────────────────────────────────────
// Cervello di un bot, istanziato per ogni bot in partita
class BotBrain {
  constructor(playerId, difficulty, paramOverrides = {}) {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.params = { ...DIFF_PARAMS[difficulty], ...paramOverrides };

    // Stato interno del bot
    this.targetX = 0;
    this.targetY = 0;
    this.targetEnemy = null;
    this.state = 'roam';           // roam | attack | retreat | capture
    this.stateTimer = 0;
    this.reactionCounter = 0;
    this.inputQueue = [];          // Input in uscita
    this.decisionInterval = 10;    // Ridecisione ogni N tick
    this.decisionCounter = 0;
    this.stuckCounter = 0;
    this.lastPos = { x: 0, y: 0 };
    this.dodgeTimer = 0;

    // Input attuali
    this.w = false;
    this.a = false;
    this.s = false;
    this.d = false;
    this.shoot = false;
    this.mx = 0;
    this.my = 0;
  }

  // Pensiero principale del bot (chiamato ogni tick)
  think(player, room, now) {
    this.decisionCounter++;

    // Aggiorna il timer di schivata
    if (this.dodgeTimer > 0) this.dodgeTimer--;

    // Ogni decisionInterval tick, ricalcola la strategia
    if (this.decisionCounter >= this.decisionInterval) {
      this.decisionCounter = 0;
      this.decisionInterval = 5 + Math.floor(Math.random() * 8); // Varia per non sincronizzare
      this.chooseStrategy(player, room);
    }

    // Esegui la strategia corrente
    switch (this.state) {
      case 'attack': this.thinkAttack(player, room, now); break;
      case 'retreat': this.thinkRetreat(player, room); break;
      case 'capture': this.thinkCapture(player, room, now); break;
      default: this.thinkRoam(player, room); break;
    }

    // Stuck detection: se il bot non si muove per N tick, forza movimento casuale
    const moved = Math.abs(player.x - this.lastPos.x) > 2 || Math.abs(player.y - this.lastPos.y) > 2;
    if (!moved) {
      this.stuckCounter++;
      if (this.stuckCounter > 15) {
        // Stuck! Forza movimento in direzione casuale
        const dir = Math.floor(Math.random() * 4);
        this.w = dir === 0;
        this.s = dir === 1;
        this.a = dir === 2;
        this.d = dir === 3;
        this.stuckCounter = 0;
      }
    } else {
      this.stuckCounter = Math.max(0, this.stuckCounter - 2);
    }
    this.lastPos.x = player.x;
    this.lastPos.y = player.y;

    // Applica ritardo di reazione
    if (this.reactionCounter > 0) {
      this.reactionCounter--;
      return; // Non emette input questo tick
    }

    return {
      w: this.w, a: this.a, s: this.s, d: this.d,
      mx: this.mx, my: this.my, shoot: this.shoot,
    };
  }

  // Sceglie la strategia in base allo stato del gioco
  chooseStrategy(player, room) {
    const enemies = this.findEnemies(player, room);
    const nearestEnemy = this.findNearest(player, enemies);
    const nearestCp = this.findNearestCapturePoint(player, room);
    const hpRatio = player.hp / player.maxHp;

    // Priorità 0: Se HP è basso, ritirata
    if (hpRatio < this.params.retreatThreshold && nearestEnemy) {
      this.state = 'retreat';
      this.stateTimer = 30 + Math.floor(Math.random() * 20);
      return;
    }

    // Priorità 1: Nemico sta catturando un nostro punto → difendi
    if (nearestCp && nearestCp.owner === player.team && nearestCp.progress < 1 && nearestCp.progress > 0) {
      // Un nemico sta decatturando il nostro punto? Controlla se ci sono nemici vicini al CP
      const enemyAtCp = enemies.find(e => {
        if (!e.alive || e.disconnected) return false;
        const dx = e.x - nearestCp.x, dy = e.y - nearestCp.y;
        return dx * dx + dy * dy < 6400; // 80px dal CP
      });
      if (enemyAtCp) {
        this.state = 'attack';
        this.targetEnemy = enemyAtCp;
        this.stateTimer = 50 + Math.floor(Math.random() * 30);
        return;
      }
    }

    // Priorità 2: Nemico vicino → attacca
    if (nearestEnemy) {
      const dist = this.distance(player, nearestEnemy);
      if (dist < 250 || (nearestCp && nearestCp.owner !== player.team && dist < 300)) {
        this.state = 'attack';
        this.targetEnemy = nearestEnemy;
        // Scegli il nemico più debole (HP più basso) se ce ne sono multipli
        const weakest = enemies.reduce((a, b) => (!a || a.hp > b.hp) ? b : a, null);
        if (weakest && this.distance(player, weakest) < 300) this.targetEnemy = weakest;
        this.stateTimer = 40 + Math.floor(Math.random() * 30);
        return;
      }
    }

    // Priorità 3: Cattura punto non posseduto
    if (nearestCp && nearestCp.owner !== player.team && nearestCp.progress < 1) {
      this.state = 'capture';
      this.targetX = nearestCp.x;
      this.targetY = nearestCp.y;
      this.stateTimer = 60 + Math.floor(Math.random() * 30);
      return;
    }

    // Default: roaming verso il centro
    this.state = 'roam';
    this.stateTimer = 40 + Math.floor(Math.random() * 40);
  }

  // Attacco: mira e spara al nemico, muoviti strategicamente
  thinkAttack(player, room, now) {
    const enemy = this.targetEnemy;
    if (!enemy || !enemy.alive || enemy.disconnected) {
      // Nemico morto o scomparso, torna a roam
      this.state = 'roam';
      this.targetEnemy = null;
      return;
    }

    const dist = this.distance(player, enemy);
    const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);

    // Mira con errore (in base alla difficoltà)
    const aimError = (Math.random() - 0.5) * this.params.aimError * 2;
    this.mx = enemy.x + aimError;
    this.my = enemy.y + aimError;

    // Movimento: orbita intorno al nemico
    const orbitAngle = angle + (Math.random() > 0.5 ? 1 : -1) * 1.2;
    const moveX = Math.cos(orbitAngle);
    const moveY = Math.sin(orbitAngle);

    // A volte muoviti erraticamente
    if (Math.random() < this.params.moveRandomness) {
      this.w = Math.random() > 0.5;
      this.s = Math.random() > 0.5;
      this.a = Math.random() > 0.5;
      this.d = Math.random() > 0.5;
    } else {
      this.w = moveY < -0.2;
      this.s = moveY > 0.2;
      this.a = moveX < -0.2;
      this.d = moveX > 0.2;
    }

    // Sparo: quando abbastanza vicino e mirato verso il nemico
    const aimAngle = Math.atan2(this.my - player.y, this.mx - player.x);
    const enemyAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    let angleDiff = Math.abs(aimAngle - enemyAngle);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
    const onTarget = angleDiff < 0.6;
    // EASY bot a volte sbaglia il timing del tiro
    const shootTiming = this.difficulty === 'easy' ? Math.random() < 0.7 : Math.random() < 0.95;
    this.shoot = dist < 300 && onTarget && shootTiming;

    // Schivata proiettili: se un proiettile si avvicina, schiva
    this.dodgeProjectiles(player, room);

    // Aggiorna bersaglio se il nemico si allontana troppo
    if (dist > 400) {
      this.targetEnemy = this.findNearest(player, this.findEnemies(player, room));
    }
  }

  // Ritirata: muoviti lontano dai nemici
  thinkRetreat(player, room) {
    const enemies = this.findEnemies(player, room);
    const nearest = this.findNearest(player, enemies);
    if (!nearest) { this.state = 'roam'; return; }

    // Muoviti nella direzione opposta al nemico più vicino
    const angle = Math.atan2(player.y - nearest.y, player.x - nearest.x);
    this.w = Math.sin(angle) < -0.2;
    this.s = Math.sin(angle) > 0.2;
    this.a = Math.cos(angle) < -0.2;
    this.d = Math.cos(angle) > 0.2;

    // Sparo difensivo mentre arretra
    this.shoot = Math.random() < 0.3 && this.distance(player, nearest) < 250;
    this.mx = nearest.x;
    this.my = nearest.y;

    this.dodgeProjectiles(player, room);
  }

  // Cattura: vai al punto di cattura
  thinkCapture(player, room, now) {
    const cp = this.findNearestCapturePoint(player, room);
    if (!cp || cp.owner === player.team) {
      this.state = 'roam';
      return;
    }

    const dist = this.distanceTo(player, cp.x, cp.y);
    const angle = Math.atan2(cp.y - player.y, cp.x - player.x);

    // Muoviti verso il punto
    if (dist > CAPTURE_RADIUS * 0.8) {
      this.w = Math.sin(angle) < -0.2;
      this.s = Math.sin(angle) > 0.2;
      this.a = Math.cos(angle) < -0.2;
      this.d = Math.cos(angle) > 0.2;
    } else {
      // Siamo sul punto, fermati e difendi
      this.w = this.s = this.a = this.d = false;
    }

    // Sparo difensivo contro nemici vicini
    const enemies = this.findEnemies(player, room);
    const nearest = this.findNearest(player, enemies);
    if (nearest && this.distance(player, nearest) < 250) {
      this.mx = nearest.x;
      this.my = nearest.y;
      this.shoot = true;
    } else {
      // Mira verso il prossimo punto di cattura o direzione casuale
      this.mx = cp.x + Math.sin(now * 0.001) * 50;
      this.my = cp.y + Math.cos(now * 0.001) * 50;
      this.shoot = false;
    }

    this.dodgeProjectiles(player, room);
  }

  // Roaming: esplora l'arena, cerca azione
  thinkRoam(player, room) {
    const enemies = this.findEnemies(player, room);
    const nearest = this.findNearest(player, enemies);

    // Se vede un nemico, passa ad attacco
    if (nearest && this.distance(player, nearest) < 300) {
      this.state = 'attack';
      this.targetEnemy = nearest;
      return;
    }

    // Vai verso il centro dell'arena o un punto interessante
    const cp = this.findNearestCapturePoint(player, room);
    if (cp) {
      const angle = Math.atan2(cp.y - player.y, cp.x - player.x);
      this.w = Math.sin(angle) < -0.2;
      this.s = Math.sin(angle) > 0.2;
      this.a = Math.cos(angle) < -0.2;
      this.d = Math.cos(angle) > 0.2;
      this.mx = cp.x;
      this.my = cp.y;
    } else {
      // Movimento casuale ma diretto verso l'arena centrale
      this.w = Math.random() > 0.6;
      this.s = Math.random() > 0.7;
      this.a = Math.random() > 0.7;
      this.d = Math.random() > 0.6;
      this.mx = 450 + (Math.random() - 0.5) * 200;
      this.my = 300 + (Math.random() - 0.5) * 200;
    }

    this.shoot = false;
  }

  // Schivata proiettili
  dodgeProjectiles(player, room) {
    if (this.dodgeTimer > 0) return;
    if (Math.random() > this.params.dodgeChance) return;

    let nearestProj = null;
    let nearestDist = Infinity;
    room.projectiles.each(b => {
      if (!b._active) return;
      const dist = this.distanceTo(player, b.x, b.y);
      if (dist < 100 && dist < nearestDist) {
        nearestProj = b;
        nearestDist = dist;
      }
    });

    if (nearestProj) {
      const angle = Math.atan2(player.y - nearestProj.y, player.x - nearestProj.x);
      this.w = Math.sin(angle) < -0.3;
      this.s = Math.sin(angle) > 0.3;
      this.a = Math.cos(angle) < -0.3;
      this.d = Math.cos(angle) > 0.3;
      this.dodgeTimer = 5;
    }
  }

  // Utility
  findEnemies(player, room) {
    const enemies = [];
    room.players.forEach(p => {
      if (p.team !== player.team && p.alive && !p.disconnected) {
        enemies.push(p);
      }
    });
    return enemies;
  }

  findNearest(player, targets) {
    let nearest = null;
    let minDist = Infinity;
    for (const t of targets) {
      const d = this.distance(player, t);
      if (d < minDist) { minDist = d; nearest = t; }
    }
    return nearest;
  }

  findNearestCapturePoint(player, room) {
    let nearest = null;
    let minDist = Infinity;
    for (const cp of room.capturePoints) {
      const d = this.distanceTo(player, cp.x, cp.y);
      if (d < minDist) { minDist = d; nearest = cp; }
    }
    return nearest;
  }

  distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distanceTo(a, x, y) {
    const dx = a.x - x;
    const dy = a.y - y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.params = { ...DIFF_PARAMS[difficulty] };
  }
}

// ─── Constanti del gioco (da G1_server) ─────────────────────
const CAPTURE_RADIUS = 55;
const CP_X = 450;
const CP_Y = 300;
const CP_RANGE = 250;

// ─── Bot Manager ────────────────────────────────────────────
// Gestisce la creazione, aggiornamento e rimozione dei bot
class BotManager {
  constructor(room, skillTracker) {
    this.room = room;
    this.skillTracker = skillTracker;
    this.bots = new Map(); // playerId → BotBrain
    this.botPlayerIds = new Set(); // playerId dei bot
    this._nameIndex = 0;
    this._humanPlayers = new Set(); // playerId umani

    // Timer per aggiungere bot
    this._addTimer = null;
    this._disposed = false;
  }

  // Registra un giocatore umano
  registerHuman(playerId) {
    this._humanPlayers.add(playerId);
    this.skillTracker.initPlayer(playerId);
    // Dopo che un umano si unisce, programma l'aggiunta di bot
    this.scheduleBotFill();
  }

  // Rimuovi un giocatore (umano o bot)
  unregisterPlayer(playerId) {
    this._humanPlayers.delete(playerId);
    this.removeBot(playerId);
    // Ricalcola se servono bot
    this.scheduleBotFill();
  }

  // Programma il riempimento con bot
  scheduleBotFill() {
    if (this._disposed) return;
    if (this._addTimer) {
      clearTimeout(this._addTimer);
    }
    this._addTimer = setTimeout(() => {
      this._addTimer = null;
      if (this._disposed || !this._checkValid()) return;
      this.fillWithBots();
    }, 1500); // Aspetta 1.5s per vedere se arrivano altri umani
  }

  // Riempie gli slot vuoti con bot
  fillWithBots() {
    if (this.room.state !== 'waiting') return;

    const targetCount = this.room.maxPlayers || 4;
    const currentHumans = this._humanPlayers.size;
    const currentBots = this.botPlayerIds.size;
    const totalPlayers = currentHumans + currentBots;

    // Calcola quanti bot servono per riempire
    let neededBots = targetCount - totalPlayers;

    // Se non ci sono umani, non aggiungere bot
    if (currentHumans === 0) {
      neededBots = 0;
    }

    // Se ci sono troppi bot, rimuovi i surplus
    while (this.botPlayerIds.size > neededBots) {
      const botId = this.botPlayerIds.values().next().value;
      this.removeBot(botId);
    }

    // Aggiungi bot necessari
    while (this.botPlayerIds.size < neededBots) {
      this.addBot();
    }

    // Dopo aver aggiunto bot, verifica se la partita può iniziare
    this.room.startIfReady();
  }

  // Crea e aggiunge un bot alla stanza
  addBot() {
    const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const botName = BOT_NAMES_G1[this._nameIndex % BOT_NAMES_G1.length];
    this._nameIndex++;

    // Determina difficoltà in base ai giocatori umani
    const difficulty = this.skillTracker.getRecommendedDifficulty(
      [...this._humanPlayers]
    );

    // Aggiungi il bot come giocatore nella room
    const player = this.room.addPlayer(botId, botName, true); // isBot flag
    if (!player) return null;

    // Crea il cervello del bot
    const brain = new BotBrain(botId, difficulty);
    this.bots.set(botId, brain);
    this.botPlayerIds.add(botId);

    return botId;
  }

  // Rimuovi un bot
  removeBot(botId) {
    if (!this.botPlayerIds.has(botId)) return;
    this.room.removePlayer(botId);
    this.bots.delete(botId);
    this.botPlayerIds.delete(botId);
  }

  // Aggiorna tutti i bot (chiamato ogni tick di gioco)
  update(now) {
    if (this.room.state !== 'playing') return;

    for (const botId of this.botPlayerIds) {
      const player = this.room.players.get(botId);
      const brain = this.bots.get(botId);
      if (!player || !brain) continue;
      if (player.disconnected || !player.alive) continue;

      // Il bot pensa e produce input
      const input = brain.think(player, this.room, now);
      if (input) {
        this.room.handleInput(botId, input);
      }
    }
  }

  // Calibra la difficoltà dei bot in base alle performance umane
  recalibrate() {
    const humanIds = [...this._humanPlayers];
    if (humanIds.length === 0) return;

    const difficulty = this.skillTracker.getRecommendedDifficulty(humanIds);

    for (const botId of this.botPlayerIds) {
      const brain = this.bots.get(botId);
      if (brain) {
        brain.setDifficulty(difficulty);
      }
    }
  }

  // Pulisci tutti i bot e resetta lo stato
  clear() {
    this._disposed = true;
    const botIds = [...this.botPlayerIds];
    for (const id of botIds) {
      this.removeBot(id);
    }
    this._humanPlayers.clear();
    if (this._addTimer) {
      clearTimeout(this._addTimer);
      this._addTimer = null;
    }
  }

  // Verifica se il manager è ancora valido
  _checkValid() {
    if (this._disposed) return false;
    // Verifica che la room esista ancora nella mappa globale
    return true;
  }
}

module.exports = { BotManager, SkillTracker, BotBrain, DIFF_PARAMS };
