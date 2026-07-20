// ============================================================
// G3 — Bot AI per QUANTUM GRID (4-Player FFA Grid Territory)
// ============================================================

const { BotManager, SkillTracker, BASE_DIFF_PARAMS } = require('./bot-core.js');

// ─── Nomi a tema ───────────────────────────────────────────
const BOT_NAMES_G3 = [
  'Quantum', 'Pixel', 'Flux', 'Neon', 'Nova',
  'Glitch', 'Echo', 'Void', 'Prism', 'Photon',
  'Orbit', 'Spark', 'Wave', 'Core', 'Grid',
];

const COLS = 10;
const ROWS = 7;

// ─── G3BotBrain ────────────────────────────────────────────
// Stati: idle | navigate | capture | contest
class G3BotBrain {
  constructor(playerId, difficulty, paramOverrides = {}) {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty], ...paramOverrides };

    this.state = 'idle';
    this.targetCol = -1;
    this.targetRow = -1;
    this.lastPickTime = 0;
    this.pickInterval = 1000; // ms between target re-evaluations
    this.stuckTimer = 0;
    this.lastCol = -1;
    this.lastRow = -1;
    this.idleDriftTimer = 0;
  }

  think(player, room, now) {
    if (!player) return null;

    // Stuck detection: if same cell for too long, force re-target
    if (player.col === this.lastCol && player.row === this.lastRow) {
      this.stuckTimer += (1000 / 20); // ~50ms per tick at 20Hz
    } else {
      this.stuckTimer = 0;
    }
    this.lastCol = player.col;
    this.lastRow = player.row;

    // Se bloccato per 3+ secondi su cella già posseduta, cambia target
    if (this.stuckTimer > 3000 && this._isOwnedByPlayer(player, room, player.col, player.row)) {
      this.targetCol = -1;
      this.state = 'idle';
      this.stuckTimer = 0;
    }

    // Rivaluta target ogni ~1 secondo (o se stuck/idle)
    const reEvaluate = (now - this.lastPickTime > this.pickInterval)
      || this.targetCol < 0 || this.state === 'idle'
      || this.stuckTimer > 2000;

    if (reEvaluate) {
      this.lastPickTime = now;
      this._pickTarget(player, room);
    }

    if (this.targetCol < 0 || this.targetRow < 0) {
      // Nessun target valido — movimento casuale
      return this._randomMove(player);
    }

    // Siamo già sul target?
    if (player.col === this.targetCol && player.row === this.targetRow) {
      // Mantieni la posizione — stai catturando/contestando
      return null; // No input = stai fermo
    }

    // Muoviti verso il target
    return this._moveToward(player, this.targetCol, this.targetRow);
  }

  _pickTarget(player, room) {
    const myIndex = player.playerIndex;
    const grid = room.grid;

    // 1. Trova celle neutrali (priorità alta)
    let bestCell = null;
    let bestScore = -Infinity;

    for (const cell of grid) {
      // Salta celle non valide o già nostre
      if (cell.owner === myIndex) continue;

      // Calcola distanza Manhattan
      const dist = Math.abs(cell.col - player.col) + Math.abs(cell.row - player.row);
      if (dist === 0) continue; // già qui

      const isNeutral = cell.owner === -1;
      const isEnemy = cell.owner >= 0 && cell.owner !== myIndex;

      if (!isNeutral && !isEnemy && cell.owner !== myIndex) continue;

      // Penalizza celle con altri giocatori sopra
      let playersOnCell = 0;
      let enemiesOnCell = 0;
      room.players.forEach(p => {
        if (p.disconnected || p.id === player.id) return;
        if (p.col === cell.col && p.row === cell.row) {
          playersOnCell++;
          if (!p.isBot) enemiesOnCell += 2; // umani più pericolosi
          else enemiesOnCell++;
        }
      });

      // Se ci sono troppi giocatori, non conviene
      if (playersOnCell > 1) continue;

      // Scoring
      let score = 0;
      if (isNeutral) score = 100 + (1 / (dist + 1)) * 50; // neutral = good
      else if (isEnemy) {
        // Enemy cell: preferisci celle con basso progress (quasi neutralizzate)
        const progressBonus = (1 - cell.progress) * 30;
        score = 60 + (1 / (dist + 1)) * 30 + progressBonus;
      }

      // Penalità distanza per easy
      if (this.difficulty === 'easy') score -= dist * 5;
      else if (this.difficulty === 'medium') score -= dist * 2;

      // Penalità per celle affollate
      score -= playersOnCell * 20;

      // Leggera randomizzazione per varietà
      score += Math.random() * 10;

      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    }

    if (bestCell) {
      this.targetCol = bestCell.col;
      this.targetRow = bestCell.row;
      const isNeutral = bestCell.owner === -1;
      this.state = isNeutral ? 'capture' : 'contest';
    } else {
      // Nessuna cella raggiungibile — idle
      this.targetCol = -1;
      this.targetRow = -1;
      this.state = 'idle';
    }
  }

  _moveToward(player, targetCol, targetRow) {
    let up = false, down = false, left = false, right = false;

    const dc = targetCol - player.col;
    const dr = targetRow - player.row;

    // Movimento erratico per easy
    if (this.difficulty === 'easy' && Math.random() < 0.25) {
      const dirs = ['up', 'down', 'left', 'right'];
      const rand = dirs[Math.floor(Math.random() * 4)];
      if (rand === 'up') up = true;
      else if (rand === 'down') down = true;
      else if (rand === 'left') left = true;
      else if (rand === 'right') right = true;
      return { up, down, left, right };
    }

    // Scegli direzione principale (con occasionali deviazioni)
    if (Math.abs(dc) + Math.abs(dr) <= 1) {
      // Adiacente — muovi direttamente
      if (dc > 0) right = true;
      else if (dc < 0) left = true;
      else if (dr > 0) down = true;
      else if (dr < 0) up = true;
    } else {
      // Decidi se muovere orizzontalmente o verticalmente prima
      if (Math.abs(dc) >= Math.abs(dr)) {
        if (dc > 0) right = true;
        else left = true;
      } else {
        if (dr > 0) down = true;
        else up = true;
      }
    }

    // Rumorosità difficoltà media
    if (this.difficulty === 'medium' && Math.random() < 0.1) {
      const dirs = ['up', 'down', 'left', 'right'];
      const rand = dirs[Math.floor(Math.random() * 4)];
      up = rand === 'up'; down = rand === 'down'; left = rand === 'left'; right = rand === 'right';
    }

    return { up, down, left, right };
  }

  _isOwnedByPlayer(player, room, col, row) {
    const cell = room.grid.find(c => c.col === col && c.row === row);
    return cell && cell.owner === player.playerIndex;
  }

  _randomMove(player) {
    this.idleDriftTimer++;
    // Cambia direzione ogni ~2 secondi
    if (this.idleDriftTimer % 40 === 0) {
      const dirs = [
        { up: true }, { down: true }, { left: true }, { right: true },
        { up: true, left: true }, { up: true, right: true },
        { down: true, left: true }, { down: true, right: true },
      ];
      return dirs[Math.floor(Math.random() * dirs.length)];
    }
    return null;
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty] };
    this.pickInterval = difficulty === 'easy' ? 2000 : difficulty === 'medium' ? 1500 : 800;
  }
}

// ─── G3BotManager ──────────────────────────────────────────
class G3BotManager extends BotManager {
  createBrain(botId, difficulty) {
    return new G3BotBrain(botId, difficulty);
  }

  getBotNames() {
    return BOT_NAMES_G3;
  }
}

module.exports = { G3BotManager, G3BotBrain, SkillTracker, BotManager };
