// ============================================================
// G2 — Bot AI per NEON TENNIS (1v1 / 2v2 Pong)
// ============================================================

const { BotManager, SkillTracker, BASE_DIFF_PARAMS } = require('./bot-core.js');

// ─── Nomi a tema ───────────────────────────────────────────
const BOT_NAMES_G2 = [
  'Ace', 'Volley', 'Smash', 'Rally', 'Serve',
  'Net', 'Spin', 'Dash', 'Blitz', 'Swift',
  'Bounce', 'Flip', 'Drift', 'Pulse', 'Laser',
];

const ARENA_H = 600;
const PADDLE_H = 80;
const BALL_RADIUS = 8;
const BALL_SPEED_INIT = 200;
const BALL_SPEED_MAX = 420;
const PADDLE_SPEED = 200;
const TICK_RATE = 30;

// ─── G2BotBrain ────────────────────────────────────────────
class G2BotBrain {
  constructor(playerId, difficulty, paramOverrides = {}) {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty], ...paramOverrides };

    this.state = 'track';          // track | serve | idle
    this.reactionDelay = this.params.reactionDelay || 4;
    this.reactionCounter = 0;
    this.paddleMargin = this.difficulty === 'easy' ? 80 : this.difficulty === 'medium' ? 40 : 15;
    this.lastBallY = ARENA_H / 2;
    this.predictedY = ARENA_H / 2;
  }

  think(player, room, now) {
    const ball = room.ball;
    if (!ball) return null;

    // Calcola dove la palla arriverà al nostro lato
    this.predictBallY(player, ball);

    // Movimento paddle verso la palla predetta
    const centerY = player.y + PADDLE_H / 2;
    const targetY = this.predictedY;
    const diff = targetY - centerY;

    // Errore di mira (difficoltà)
    const error = (Math.random() - 0.5) * this.params.aimError * 1.5;
    const adjustedTarget = targetY + error;

    let up = false, down = false;
    const threshold = this.paddleMargin;

    if (adjustedTarget < centerY - threshold) up = true;
    else if (adjustedTarget > centerY + threshold) down = true;

    // Movimento erratico easy
    if (Math.random() < this.params.moveRandomness) {
      up = Math.random() > 0.5;
      down = Math.random() > 0.5;
    }

    return { up, down };
  }

  predictBallY(player, ball) {
    // Se la palla si sta allontanando o è ferma, torna al centro
    const comingToward = player.side === 'left' ? ball.vx < 0 : ball.vx > 0;
    if (!comingToward || ball.speed < 1) {
      // Torna al centro dell'arena
      this.predictedY = ARENA_H / 2;
      return;
    }

    // Calcola il tempo stimato prima che la palla raggiunga la nostra paddle X
    const paddleX = player.side === 'left' ? 30 : 900 - 30 - 12;
    const dx = paddleX - ball.x;
    const timeToReach = dx / ball.vx; // negativo se si allontana

    if (timeToReach < 0) {
      this.predictedY = ARENA_H / 2;
      return;
    }

    // Simula rimbalzi sulle pareti superiore/inferiore
    let simY = ball.y;
    let simVy = ball.vy;
    let simTime = 0;
    const dt = 1 / TICK_RATE;

    while (simTime < timeToReach) {
      simY += simVy * dt;
      // Rimbalzo pareti
      if (simY - BALL_RADIUS <= 0) { simY = BALL_RADIUS; simVy = Math.abs(simVy); }
      else if (simY + BALL_RADIUS >= ARENA_H) { simY = ARENA_H - BALL_RADIUS; simVy = -Math.abs(simVy); }
      simTime += dt;
    }

    // Aggiungi un piccolo margine di errore proporzionale alla distanza
    const errorMargin = this.params.aimError * 0.3;
    this.predictedY = simY + (Math.random() - 0.5) * errorMargin;
    this.predictedY = Math.max(PADDLE_H / 2, Math.min(ARENA_H - PADDLE_H / 2, this.predictedY));
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty] };
    this.paddleMargin = difficulty === 'easy' ? 80 : difficulty === 'medium' ? 40 : 15;
    this.reactionDelay = this.params.reactionDelay || 4;
  }
}

// ─── G2BotManager ──────────────────────────────────────────
class G2BotManager extends BotManager {
  createBrain(botId, difficulty) {
    return new G2BotBrain(botId, difficulty);
  }

  getBotNames() {
    return BOT_NAMES_G2;
  }
}

module.exports = { G2BotManager, G2BotBrain, SkillTracker, BotManager };
