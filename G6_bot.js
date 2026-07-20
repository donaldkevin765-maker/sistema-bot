// ============================================================
// G6 — Bot AI per RING OF FIRE (4-Player FFA Shrinking Ring)
// ============================================================

const { BotManager, SkillTracker, BASE_DIFF_PARAMS } = require('./bot-core.js');

// ─── Nomi a tema ───────────────────────────────────────────
const BOT_NAMES_G6 = [
  'Ember', 'Blaze', 'Cinder', 'Ash', 'Flare',
  'Inferno', 'Sear', 'Spark', 'Torch', 'Volt',
  'Scorch', 'Bolt', 'Flash', 'Glow', 'Burn',
];

const ARENA_W = 900;
const ARENA_H = 600;
const PLAYER_RADIUS = 14;
const PROJ_SPEED = 320;

// ─── G6BotBrain ────────────────────────────────────────────
// Resta dentro l'anello, cerca nemici, spara, schiva proiettili
class G6BotBrain {
  constructor(playerId, difficulty, paramOverrides = {}) {
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty], ...paramOverrides };

    this.state = 'seek'; // seek | fight | avoid_ring | dodge
    this.shootCooldown = 0;
    this.targetId = null;
    this.lastTargetChange = 0;
    this.dodgeTimer = 0;
    this.dodgeDir = { x: 0, y: 0 };
  }

  think(player, room, now) {
    if (!player || !player.alive) return null;

    const dt = 1 / 30;

    // Trova il miglior target (nemico più vicino/vulnerabile)
    this._selectTarget(player, room);

    // Calcola movimento
    let dx = 0, dy = 0;
    let shoot = false;
    let mx = player.x, my = player.y;

    // Priorità 1: Stai dentro l'anello
    const ringCenterX = room.ringX || ARENA_W / 2;
    const ringCenterY = room.ringY || ARENA_H / 2;
    const ringRadius = room.ringRadius || 260;
    const distFromCenter = Math.sqrt(
      (player.x - ringCenterX) ** 2 + (player.y - ringCenterY) ** 2
    );
    const safetyMargin = ringRadius * 0.7;

    if (distFromCenter > safetyMargin) {
      // Troppo vicino al bordo — torna verso il centro
      const toCenterX = ringCenterX - player.x;
      const toCenterY = ringCenterY - player.y;
      const dist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
      const normX = toCenterX / dist;
      const normY = toCenterY / dist;
      dx += normX;
      dy += normY;
      this.state = 'avoid_ring';
    } else if (this.state === 'dodge' && this.dodgeTimer > 0) {
      // Schivata in corso
      dx += this.dodgeDir.x;
      dy += this.dodgeDir.y;
      this.dodgeTimer -= dt;
      if (this.dodgeTimer <= 0) this.state = 'seek';
    } else if (this.targetId) {
      const target = room.players.get(this.targetId);
      if (target && target.alive && !target.disconnected) {
        // Muoviti verso il target
        const tdx = target.x - player.x;
        const tdy = target.y - player.y;
        const tDist = Math.sqrt(tdx * tdx + tdy * tdy);

        if (tDist > 0) {
          const normX = tdx / tDist;
          const normY = tdy / tDist;

          // A media distanza: insegui e spara
          if (tDist > 120) {
            dx += normX;
            dy += normY;
            this.state = 'seek';
          } else {
            // Vicino: strafe leggermente
            dx += normY * 0.5; // strafe laterale
            dy -= normX * 0.5;
            dx += normX * 0.3;
            dy += normY * 0.3;
            this.state = 'fight';
          }
        }

        // Punta e spara al target
        mx = target.x;
        my = target.y;
        shoot = this._shouldShoot(player, target, tDist);

        // Schiva proiettili in arrivo
        if (room.projectiles) {
          this._dodgeProjectiles(player, room, dt);
        }
      } else {
        this.targetId = null;
        this.state = 'seek';
      }
    } else {
      // Nessun target — esplora
      this.state = 'seek';
      // Muoviti verso il centro
      const toCenterX = ringCenterX - player.x;
      const toCenterY = ringCenterY - player.y;
      const dist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
      if (dist > 0) {
        dx += toCenterX / dist;
        dy += toCenterY / dist;
      }
    }

    // Movimento erratico per difficoltà
    if (this.difficulty === 'easy') {
      if (Math.random() < 0.15) { dx += (Math.random() - 0.5) * 2; dy += (Math.random() - 0.5) * 2; }
      if (Math.random() < 0.1) shoot = false;
    } else if (this.difficulty === 'medium') {
      if (Math.random() < 0.05) { dx += (Math.random() - 0.5); dy += (Math.random() - 0.5); }
    }

    // Normalizza movimento diagonale
    if (dx !== 0 && dy !== 0) {
      const mag = Math.sqrt(dx * dx + dy * dy);
      dx /= mag;
      dy /= mag;
    }

    const w = dy < 0;
    const s = dy > 0;
    const a = dx < 0;
    const d = dx > 0;

    return { w, s, a, d, mx, my, shoot };
  }

  _selectTarget(player, room) {
    let bestTarget = null;
    let bestScore = Infinity;

    room.players.forEach((p, id) => {
      if (id === player.id || !p.alive || p.disconnected) return;

      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Score: distanza (più vicino = meglio), hp (più basso = meglio)
      let score = dist;
      score += p.hp * 30; // preferisci target con poca vita

      // Bonus per target già identificato (persistenza)
      if (id === this.targetId) score -= 50;

      if (score < bestScore) {
        bestScore = score;
        bestTarget = id;
      }
    });

    if (bestTarget) {
      this.targetId = bestTarget;
    }
  }

  _shouldShoot(player, target, dist) {
    // Non sparare se troppo lontano
    if (dist > 500) return false;

    // Calcola dove il target sarà (lead prediction)
    const projTravelTime = dist / PROJ_SPEED;
    const targetFutureX = target.x + (target.x - player.x) * 0.1 * projTravelTime;
    const targetFutureY = target.y + (target.y - player.y) * 0.1 * projTravelTime;

    // L'angolo verso il target futuro è allineato con l'aim?
    const aimDx = targetFutureX - player.x;
    const aimDy = targetFutureY - player.y;
    const aimDist = Math.sqrt(aimDx * aimDx + aimDy * aimDy);
    if (aimDist < 1) return false;

    const currentAngle = Math.atan2(player.aimY - player.y, player.aimX - player.x);
    const targetAngle = Math.atan2(aimDy, aimDx);
    let angleDiff = targetAngle - currentAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Sparo se siamo allineati o se il target è vicino
    return Math.abs(angleDiff) < 0.5 || dist < 100;
  }

  _dodgeProjectiles(player, room, dt) {
    let threatX = 0, threatY = 0, threatCount = 0;

    room.projectiles.each(b => {
      if (!b._active) return;
      const dx = b.x - player.x;
      const dy = b.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Proiettile in arrivo pericoloso
      if (dist < 150) {
        // Calcola se sta venendo verso di noi
        const relVx = b.vx;
        const relVy = b.vy;
        const dot = relVx * (-dx) + relVy * (-dy);
        if (dot > 0) {
          threatX += -dy; // schiva perpendicolare
          threatY += dx;
          threatCount++;
        }
      }
    });

    if (threatCount > 0) {
      threatX /= threatCount;
      threatY /= threatCount;
      const mag = Math.sqrt(threatX * threatX + threatY * threatY);
      if (mag > 0) {
        this.dodgeDir = { x: threatX / mag, y: threatY / mag };
        this.dodgeTimer = 0.3;
        this.state = 'dodge';
      }
    }
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.params = { ...BASE_DIFF_PARAMS[difficulty] };
  }
}

// ─── G6BotManager ──────────────────────────────────────────
class G6BotManager extends BotManager {
  createBrain(botId, difficulty) {
    return new G6BotBrain(botId, difficulty);
  }

  getBotNames() {
    return BOT_NAMES_G6;
  }
}

module.exports = { G6BotManager, G6BotBrain, SkillTracker, BotManager };
