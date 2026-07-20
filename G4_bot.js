// ============================================================
// G4 — Bot AI per VOID RACERS (4-Player Top-Down Racing)
// ============================================================

const { BotManager, SkillTracker, BASE_DIFF_PARAMS } = require('./bot-core.js');

// ─── Nomi a tema ───────────────────────────────────────────
const BOT_NAMES_G4 = [
  'Turbo', 'Drift', 'Boost', 'Rocket', 'Flash',
  'Storm', 'Dash', 'Blaze', 'Vortex', 'Nitro',
  'Pulse', 'Sprint', 'Swift', 'Zoom', 'Blitz',
];

const TICK_RATE = 30;
const CAR_ACCEL = 220;
const CAR_MAX_SPEED = 220;
const CAR_TURN_SPEED = 2.8;
const CAR_FRICTION = 0.97;

// ─── G4BotBrain ────────────────────────────────────────────
// Segue waypoint, accelera in rettilineo, frena in curva
class G4BotBrain {
  constructor(playerId, difficulty, paramOverrides = {}) {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty], ...paramOverrides };

    this.currentWaypoint = 0;
    this.lastWaypoint = -1;
    this.stuckTimer = 0;
    this.lastX = 0;
    this.lastY = 0;
  }

  think(player, room, now) {
    if (!player || !room.waypoints) return null;

    const waypoints = room.waypoints;
    const wp = waypoints[this.currentWaypoint % waypoints.length];

    if (!wp) return null;

    // Calcola angolo verso waypoint
    const dx = wp.x - player.x;
    const dy = wp.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Angolo verso il waypoint
    const targetAngle = Math.atan2(dy, dx);

    // Differenza tra angolo attuale e target
    let angleDiff = targetAngle - player.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Stuck detection
    const moved = Math.sqrt((player.x - this.lastX) ** 2 + (player.y - this.lastY) ** 2);
    if (moved < 1) this.stuckTimer++;
    else this.stuckTimer = 0;
    this.lastX = player.x;
    this.lastY = player.y;

    // Se bloccato > 2 secondi, forza avanzamento waypoint
    if (this.stuckTimer > 60) {
      this.currentWaypoint = (this.currentWaypoint + 1) % waypoints.length;
      this.stuckTimer = 0;
      return { up: true, left: false, right: false, down: false };
    }

    // Rileva cambio waypoint
    if (player.waypointIndex !== this.lastWaypoint) {
      if (player.waypointIndex === 0 && this.lastWaypoint > 0) {
        // Lap completato
      }
      this.currentWaypoint = player.waypointIndex;
      this.lastWaypoint = player.waypointIndex;
    }

    // Se hai superato il waypoint, vai al prossimo
    if (dist < 50 && this.currentWaypoint === player.waypointIndex) {
      this.currentWaypoint = (this.currentWaypoint + 1) % waypoints.length;
    }

    // Decisioni di guida
    const absAngleDiff = Math.abs(angleDiff);

    // Sterzo
    let left = false, right = false;
    if (absAngleDiff > 0.05) {
      if (angleDiff > 0) right = true;
      else left = true;
    }

    // Accelerazione/freno in base all'angolo
    let up = false, down = false;

    const speedRatio = Math.abs(player.speed) / CAR_MAX_SPEED;

    // Curva stretta: frena
    if (absAngleDiff > 0.8) {
      if (speedRatio > 0.4) down = true;
      up = speedRatio < 0.6;
    }
    // Curva media: rilascia acceleratore / frena leggero
    else if (absAngleDiff > 0.4) {
      if (speedRatio > 0.6) down = true;
      up = speedRatio < 0.7;
    }
    // Rettilineo: accelera
    else {
      up = speedRatio < 0.95;
    }

    // Movimento erratico per difficoltà
    if (this.difficulty === 'easy') {
      // Easy: a volte sterza nella direzione sbagliata
      if (Math.random() < 0.08) {
        left = Math.random() > 0.5;
        right = !left;
      }
      // Easy: accelera meno
      if (Math.random() < 0.15) up = false;
      // Easy: sbanda di più
      if (Math.random() < 0.05) { up = false; down = true; }
    } else if (this.difficulty === 'medium') {
      if (Math.random() < 0.03) {
        left = Math.random() > 0.5;
        right = !left;
      }
    }

    // Non invertire quando si è nella direzione giusta per la pista
    // (solo se bloccati)
    if (this.stuckTimer > 30 && absAngleDiff > 1.5) {
      down = true;
    }

    return { up, down, left, right };
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty] };
  }
}

// ─── G4BotManager ──────────────────────────────────────────
class G4BotManager extends BotManager {
  createBrain(botId, difficulty) {
    return new G4BotBrain(botId, difficulty);
  }

  getBotNames() {
    return BOT_NAMES_G4;
  }
}

module.exports = { G4BotManager, G4BotBrain, SkillTracker, BotManager };
