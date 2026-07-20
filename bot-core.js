// ============================================================
// bot-core.js — Infrastruttura condivisa per bot multiplayer
// SkillTracker + BotManager base, riutilizzabile da G1..G6
// ============================================================

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
        const last = stats.recentGames.length > 0
          ? stats.recentGames[stats.recentGames.length - 1] : { kills: 0, deaths: 0, captures: 0 };
        stats.recentGames.push({
          kills: stats.kills - last.kills,
          deaths: stats.deaths - last.deaths,
          captures: stats.capturePoints - last.captures,
          survived: data.survivalTime || 0,
        });
        if (stats.recentGames.length > 10) stats.recentGames.shift();
        break;
    }
  }

  // Calcola il livello di abilità del giocatore (0-1)
  getSkillLevel(playerId) {
    const stats = this.playerStats.get(playerId);
    if (!stats || stats.gamesPlayed < 1) return 0.5;

    const accuracy = stats.shotsFired > 0 ? stats.shotsHit / stats.shotsFired : 0.3;
    const kd = stats.deaths > 0 ? Math.min(stats.kills / stats.deaths, 5) / 5 : 0.5;
    const capturesPerGame = stats.gamesPlayed > 0 ? stats.capturePoints / stats.gamesPlayed / 5 : 0.3;
    const avgSurvival = stats.gamesPlayed > 0 ? stats.survivalTime / stats.gamesPlayed / 30 : 0.3;

    return Math.max(0.1, Math.min(0.95,
      accuracy * 0.3 + kd * 0.3 + capturesPerGame * 0.2 + Math.min(avgSurvival, 1) * 0.2));
  }

  // Restituisce la difficoltà consigliata (easy/medium/hard) per i bot
  getRecommendedDifficulty(playerIds) {
    if (playerIds.length === 0) return 'medium';
    let totalSkill = 0, count = 0;
    for (const id of playerIds) {
      const stats = this.playerStats.get(id);
      if (stats && stats.gamesPlayed > 0) {
        totalSkill += this.getSkillLevel(id);
        count++;
      }
    }
    if (count === 0) return 'medium';
    const avgSkill = totalSkill / count;
    if (avgSkill < 0.3) return 'easy';
    if (avgSkill < 0.6) return 'medium';
    return 'hard';
  }
}

// ─── Parametri base per difficoltà ─────────────────────────
// Sovrascrivibili dai moduli gioco specifici
const BASE_DIFF_PARAMS = {
  easy:   { aimError: 40, reactionDelay: 8, moveRandomness: 0.4, retreatThreshold: 0.2, shootCooldown: 1.5, dodgeChance: 0.1 },
  medium: { aimError: 20, reactionDelay: 4, moveRandomness: 0.2, retreatThreshold: 0.3, shootCooldown: 1.0, dodgeChance: 0.3 },
  hard:   { aimError: 8,  reactionDelay: 2, moveRandomness: 0.1, retreatThreshold: 0.4, shootCooldown: 0.8, dodgeChance: 0.5 },
};

// ─── BotManager Base ───────────────────────────────────────
// Gestisce creazione, aggiornamento e rimozione bot
// I giochi estendono questa classe sovrascrivendo createBrain() e getBotNames()
class BotManager {
  constructor(room, skillTracker, options = {}) {
    this.room = room;
    this.skillTracker = skillTracker;
    this.options = options;
    this.bots = new Map();         // playerId → brain
    this.botPlayerIds = new Set(); // playerId dei bot
    this._humanPlayers = new Set(); // playerId umani attivi
    this._nameIndex = 0;
    this._addTimer = null;
    this._disposed = false;
  }

  // 🔧 Da sovrascrivere nelle sottoclassi — restituisce un cervello bot
  createBrain(botId, difficulty) {
    throw new Error('createBrain() must be overridden by game-specific BotManager');
  }

  // 🔧 Da sovrascrivere — restituisce array di nomi bot per questo gioco
  getBotNames() {
    return ['Bot1', 'Bot2', 'Bot3', 'Bot4', 'Bot5'];
  }

  // Registra un giocatore umano
  registerHuman(playerId) {
    this._humanPlayers.add(playerId);
    this.skillTracker.initPlayer(playerId);
    this.scheduleBotFill();
  }

  // Rimuovi un giocatore
  unregisterPlayer(playerId) {
    if (this._disposed) return;
    this._humanPlayers.delete(playerId);
    this.removeBot(playerId);
    this.scheduleBotFill();
  }

  // Programma riempimento bot
  scheduleBotFill() {
    if (this._disposed) return;
    if (this._addTimer) clearTimeout(this._addTimer);
    this._addTimer = setTimeout(() => {
      this._addTimer = null;
      if (this._disposed || !this._roomExists()) return;
      this.fillWithBots();
    }, 1500);
  }

  // Verifica che la room esista ancora
  _roomExists() {
    return this.room && this.room.state !== undefined;
  }

  // Riempie gli slot vuoti con bot
  fillWithBots() {
    if (this._disposed || this.room.state !== 'waiting') return;

    const targetCount = this.room.maxPlayers || 4;
    const currentHumans = this._humanPlayers.size;
    const totalPlayers = currentHumans + this.botPlayerIds.size;

    let neededBots = targetCount - totalPlayers;
    if (currentHumans === 0) neededBots = 0;

    // Rimuovi surplus bot
    while (this.botPlayerIds.size > neededBots) {
      const botId = this.botPlayerIds.values().next().value;
      this.removeBot(botId);
    }

    // Aggiungi bot necessari
    while (this.botPlayerIds.size < neededBots) {
      this.addBot();
    }

    if (typeof this.room.startIfReady === 'function') {
      this.room.startIfReady();
    }
  }

  // Crea e aggiunge un bot alla stanza
  addBot() {
    const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const names = this.getBotNames();
    const botName = names[this._nameIndex % names.length];
    this._nameIndex++;

    const difficulty = this.skillTracker.getRecommendedDifficulty([...this._humanPlayers]);

    const player = this.room.addPlayer(botId, botName, true);
    if (!player) return null;

    const brain = this.createBrain(botId, difficulty);
    if (!brain) { this.room.removePlayer(botId); return null; }

    this.bots.set(botId, brain);
    this.botPlayerIds.add(botId);
    return botId;
  }

  // Rimuovi un bot
  removeBot(botId) {
    if (this._disposed || !this.botPlayerIds.has(botId)) return;
    this.room.removePlayer(botId);
    this.bots.delete(botId);
    this.botPlayerIds.delete(botId);
  }

  // Aggiorna tutti i bot (chiamato ogni tick)
  update(now) {
    if (this._disposed || this.room.state !== 'playing') return;

    for (const botId of this.botPlayerIds) {
      const player = this.room.players.get(botId);
      const brain = this.bots.get(botId);
      if (!player || !brain || player.disconnected || !player.alive) continue;

      const input = brain.think(player, this.room, now);
      if (input) this.room.handleInput(botId, input);
    }
  }

  // Calibra difficoltà
  recalibrate() {
    const humanIds = [...this._humanPlayers];
    if (humanIds.length === 0) return;
    const difficulty = this.skillTracker.getRecommendedDifficulty(humanIds);
    for (const brain of this.bots.values()) {
      if (typeof brain.setDifficulty === 'function') brain.setDifficulty(difficulty);
    }
  }

  // Pulisci tutto
  clear() {
    this._disposed = true;
    const botIds = [...this.botPlayerIds];
    for (const id of botIds) this.removeBot(id);
    this._humanPlayers.clear();
    if (this._addTimer) { clearTimeout(this._addTimer); this._addTimer = null; }
  }
}

module.exports = { SkillTracker, BotManager, BASE_DIFF_PARAMS };
