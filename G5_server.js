// ============================================================
// SIGNAL — G5_ Game Server
// Node.js + Socket.io — 4-player Stealth/Bluff FFA
// ============================================================
// Core mechanic:
//   Each player has an INVISIBLE real body + a VISIBLE decoy signal.
//   Decoy follows real position with lag + noise proportional to speed.
//   Stand still → decoy wanders (you're hidden).
//   Sprint → decoy tracks you (you're exposed).
//   Click near an enemy's REAL position to eliminate them.
//   5 eliminations wins.
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { G5BotManager, SkillTracker } = require('./G5_bot.js');

// ─── Constants ───────────────────────────────────────────────
const PORT = process.env.PORT || 3005;
const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const ROOM_PREFIX = 'G5_';
const ARENA_W = 900;
const ARENA_H = 600;
const MAX_PLAYERS = 4;
const RECONNECT_SEC = 30;
const PLAYER_RADIUS = 13;
const PLAYER_SPEED = 150;           // max px/s
const DECOY_FOLLOW_MIN = 0.03;      // lerp factor when idle
const DECOY_FOLLOW_MAX = 0.88;      // lerp factor when sprinting
const DECOY_NOISE_MIN = 7;          // px noise when sprinting
const DECOY_NOISE_MAX = 90;         // px noise when idle
const ELIM_RADIUS = 35;             // click must be within this of real body
const ELIM_COOLDOWN = 0.8;          // seconds between clicks
const WIN_KILLS = 5;
const RESPAWN_TIME = 3;
const INVINCIBLE_TIME = 1.5;        // after respawn

// ─── Obstacles (static walls for cover) ──────────────────────
const OBSTACLES = [
  { x: 180, y: 130, w: 40, h: 130 },
  { x: 680, y: 340, w: 40, h: 130 },
  { x: 330, y: 460, w: 140, h: 30 },
  { x: 430, y: 100, w: 140, h: 30 },
  { x: 80,  y: 420, w: 100, h: 30 },
  { x: 720, y: 150, w: 100, h: 30 },
  { x: 420, y: 260, w: 60,  h: 60  },
];

// ─── Object Pooler ──────────────────────────────────────────
class ObjectPooler {
  constructor(factory, initialSize = 50) {
    this._factory = factory;
    this._pool = [];
    for (let i = 0; i < initialSize; i++) {
      const obj = this._factory();
      obj._active = false;
      this._pool.push(obj);
    }
  }

  get() {
    for (let i = 0; i < this._pool.length; i++) {
      if (!this._pool[i]._active) {
        this._pool[i]._active = true;
        return this._pool[i];
      }
    }
    const obj = this._factory();
    obj._active = true;
    this._pool.push(obj);
    return obj;
  }

  release(obj) { if (obj) obj._active = false; }

  releaseAll() { for (const obj of this._pool) obj._active = false; }

  each(fn) { for (const obj of this._pool) { if (obj._active) fn(obj); } }
}

// ─── Particle factory ───────────────────────────────────────
function createParticle() {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '', size: 0, _active: false };
}

// ─── Room ────────────────────────────────────────────────────
class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.particles = new ObjectPooler(createParticle, 120);
    this.scores = new Map();        // playerId → kills
    this.eliminationLog = [];       // [{killer, victim, time}]
    this.state = 'waiting';
    this.winner = -1;
    this._endedAt = 0;
    this._disconnectedTimers = new Map();
    this._startTimer = null;
    this.maxPlayers = MAX_PLAYERS;
    this._notified = false;
    this._forceStartReady = false;
    this._playerSurvivalStart = new Map();
  }

  // ── Helpers ──

  _randomSpawn() {
    // Try to find a spawn not inside obstacles
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = 50 + Math.random() * (ARENA_W - 100);
      const y = 50 + Math.random() * (ARENA_H - 100);
      if (!this._collidesWithObstacle(x, y, PLAYER_RADIUS)) return { x, y };
    }
    return { x: 100, y: 100 };
  }

  _collidesWithObstacle(x, y, r) {
    for (const o of OBSTACLES) {
      const cx = Math.max(o.x, Math.min(x, o.x + o.w));
      const cy = Math.max(o.y, Math.min(y, o.y + o.h));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  _resolveObstacleCollision(x, y, r) {
    let rx = x, ry = y;
    let iterations = 5;
    while (this._collidesWithObstacle(rx, ry, r) && iterations > 0) {
      for (const o of OBSTACLES) {
        const cx = Math.max(o.x, Math.min(rx, o.x + o.w));
        const cy = Math.max(o.y, Math.min(ry, o.y + o.h));
        const dx = rx - cx;
        const dy = ry - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < r) {
          if (dist === 0) { rx += 5; ry += 5; continue; }
          const push = (r - dist) * 1.05;
          rx += (dx / dist) * push;
          ry += (dy / dist) * push;
        }
      }
      rx = Math.max(PLAYER_RADIUS, Math.min(ARENA_W - PLAYER_RADIUS, rx));
      ry = Math.max(PLAYER_RADIUS, Math.min(ARENA_H - PLAYER_RADIUS, ry));
      iterations--;
    }
    return { x: rx, y: ry };
  }

  // ── Player management ──

  addPlayer(id, username, isBot = false) {
    if (this.players.has(id)) return this.players.get(id);
    if (this.players.size >= MAX_PLAYERS) return null;

    const spawn = this._randomSpawn();
    const player = {
      id, username,
      x: spawn.x, y: spawn.y,          // REAL position (invisible to others)
      decoyX: spawn.x, decoyY: spawn.y, // DECOY position (visible to all)
      px: spawn.x, py: spawn.y,         // previous position (for speed calc)
      hp: 100,
      alive: true,
      respawnTimer: 0,
      invincibleTimer: 0,
      lastActionTime: 0,
      kills: 0,
      disconnected: false,
      disconnectTimer: 0,
      isBot,
    };

    this.players.set(id, player);
    this.scores.set(id, 0);

    // Auto-start: when all 4 join, or after 12s with at least 2
    if (this.players.size === MAX_PLAYERS && this.state === 'waiting') {
      if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null; }
      this._startGame();
    } else if (this.players.size >= 2 && this.state === 'waiting' && !this._startTimer) {
      this._startTimer = setTimeout(() => {
        if (this.state === 'waiting' && this.players.size >= 2) this._startGame();
        this._startTimer = null;
      }, 12000);
    }

    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    this.scores.delete(id);
    this._disconnectedTimers.delete(id);
    if (this.state === 'playing') this._checkWinCondition();
  }

  handleDisconnect(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.disconnected = true;
    p.disconnectTimer = RECONNECT_SEC;
    this._disconnectedTimers.set(id, RECONNECT_SEC);
  }

  handleReconnect(newId, oldId) {
    const p = this.players.get(oldId);
    if (!p || !p.disconnected) return null;
    p.id = newId;
    p.disconnected = false;
    p.disconnectTimer = 0;
    this.players.delete(oldId);
    this.players.set(newId, p);
    this._disconnectedTimers.delete(oldId);
    return p;
  }

  // ── Movement ──

  handleInput(id, data) {
    const p = this.players.get(id);
    if (!p || !p.alive || p.disconnected) return;

    let dx = 0, dy = 0;
    if (data.w) dy -= 1;
    if (data.s) dy += 1;
    if (data.a) dx -= 1;
    if (data.d) dx += 1;
    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

    const step = PLAYER_SPEED / TICK_RATE;
    let nx = p.x + dx * step;
    let ny = p.y + dy * step;
    nx = Math.max(PLAYER_RADIUS, Math.min(ARENA_W - PLAYER_RADIUS, nx));
    ny = Math.max(PLAYER_RADIUS, Math.min(ARENA_H - PLAYER_RADIUS, ny));

    // Obstacle collision
    if (!this._collidesWithObstacle(nx, ny, PLAYER_RADIUS)) {
      p.px = p.x;
      p.py = p.y;
      p.x = nx;
      p.y = ny;
    } else if (!this._collidesWithObstacle(nx, p.y, PLAYER_RADIUS)) {
      // Slide along X
      p.px = p.x;
      p.x = nx;
    } else if (!this._collidesWithObstacle(p.x, ny, PLAYER_RADIUS)) {
      // Slide along Y
      p.py = p.y;
      p.y = ny;
    }

    // Elimination attempt
    if (data.action === 'eliminate' && data.ex != null && data.ey != null) {
      this._handleElimination(id, data.ex, data.ey);
    }
  }

  // ── Elimination ──

  _handleElimination(attackerId, cx, cy) {
    const attacker = this.players.get(attackerId);
    if (!attacker || !attacker.alive) return;

    const now = Date.now() / 1000;
    if (now - attacker.lastActionTime < ELIM_COOLDOWN) return;
    attacker.lastActionTime = now;

    for (const [targetId, target] of this.players) {
      if (targetId === attackerId || !target.alive || target.disconnected) continue;
      if (target.invincibleTimer > 0) continue;

      const dx = target.x - cx;
      const dy = target.y - cy;
      if (dx * dx + dy * dy < ELIM_RADIUS * ELIM_RADIUS) {
        // ELIMINATION!
        target.alive = false;
        target.respawnTimer = RESPAWN_TIME;
        attacker.kills++;
        this.scores.set(attackerId, attacker.kills);

        this.eliminationLog.push({
          killer: attackerId,
          victim: targetId,
          x: target.x,
          y: target.y,
          time: Date.now(),
        });

        // Spawn particles at elim point
        for (let i = 0; i < 20; i++) {
          const pt = this.particles.get();
          pt.x = target.x;
          pt.y = target.y;
          const ang = Math.random() * Math.PI * 2;
          const spd = 30 + Math.random() * 100;
          pt.vx = Math.cos(ang) * spd;
          pt.vy = Math.sin(ang) * spd;
          pt.life = 0.4 + Math.random() * 0.3;
          pt.maxLife = pt.life;
          pt.color = '#ff3366';
          pt.size = 2 + Math.random() * 3;
        }

        this._checkWinCondition();
        return; // one elim per click
      }
    }
  }

  // ── Game lifecycle ──

  startIfReady() {
    if (this.state === 'waiting' && this.players.size >= 2) {
      if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null; }
      this._startGame();
    }
  }

  _startGame() {
    this.state = 'playing';
    this.scores.clear();
    this.eliminationLog = [];
    this.particles.releaseAll();
    this.players.forEach(p => {
      const spawn = this._randomSpawn();
      p.x = spawn.x; p.y = spawn.y;
      p.decoyX = spawn.x; p.decoyY = spawn.y;
      p.px = spawn.x; p.py = spawn.y;
      p.alive = true;
      p.respawnTimer = 0;
      p.invincibleTimer = 0;
      p.kills = 0;
      p.lastActionTime = 0;
      this.scores.set(p.id, 0);
    });

    // Survival tracking
    const now = Date.now();
    this.players.forEach(p => this._playerSurvivalStart.set(p.id, now));
    if (this.botManager) this.botManager.recalibrate();
  }

  _endGame(winnerId) {
    this.state = 'ended';
    this.winner = winnerId;
    this._endedAt = Date.now();

    // Skill tracking
    this.players.forEach(p => {
      if (!p.isBot) skillTracker.recordEvent(p.id, 'game_end');
    });
    this._playerSurvivalStart.clear();
    if (this.botManager) this.botManager.recalibrate();

    // Reset stanza dopo 3s
    setTimeout(() => {
      if (this.state !== 'ended') return;
      if (this.botManager) this.botManager.clear();
      if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null; }
      this.state = 'waiting';
      this.scores.clear();
      this.winner = -1;
      this._notified = false;
      this._endedAt = 0;
      this._forceStartReady = false;
    }, 3000);
  }

  _checkWinCondition() {
    for (const [id, kills] of this.scores) {
      if (kills >= WIN_KILLS) {
        this._endGame(id);
        return;
      }
    }
    // If only one player remains alive and game has been going
    const alive = [...this.players.values()].filter(p => p.alive && !p.disconnected).length;
    if (alive <= 1 && this.state === 'playing') {
      const remaining = [...this.players.values()].find(p => p.alive && !p.disconnected);
      if (remaining) {
        // Check at least 1 elim to avoid early win
        if (remaining.kills > 0 || Date.now() > 5000) {
          this._endGame(remaining.id);
        }
      }
    }
  }

  // ── Update (called every tick) ──

  update() {
    const dt = 1 / TICK_RATE;

    // Disconnect cleanup
    for (const [oldId, timer] of this._disconnectedTimers) {
      const remaining = timer - dt;
      if (remaining <= 0) {
        this.removePlayer(oldId);
      } else {
        this._disconnectedTimers.set(oldId, remaining);
        const p = this.players.get(oldId);
        if (p) p.disconnectTimer = remaining;
      }
    }

    if (this.state !== 'playing') return;

    // Update each player's DECOY position based on movement speed
    this.players.forEach(p => {
      if (p.disconnected) return;

      // Calculate movement speed from real position change
      const realDx = p.x - p.px;
      const realDy = p.y - p.py;
      const realSpeed = Math.sqrt(realDx * realDx + realDy * realDy) * TICK_RATE; // px/s

      // Map speed to follow intensity (0 = idle, 1 = sprinting)
      const intensity = Math.min(1, realSpeed / PLAYER_SPEED);

      // Decoy lerp factor: at rest barely moves, at sprint follows tightly
      const followLerp = DECOY_FOLLOW_MIN + (DECOY_FOLLOW_MAX - DECOY_FOLLOW_MIN) * intensity;
      // Noise radius: at rest large, at sprint small
      const noiseRadius = DECOY_NOISE_MAX - (DECOY_NOISE_MAX - DECOY_NOISE_MIN) * intensity;

      // Update decoy position with lag + noise
      p.decoyX += (p.x - p.decoyX) * followLerp;
      p.decoyY += (p.y - p.decoyY) * followLerp;
      // Add noise proportional to inverse of speed
      p.decoyX += (Math.random() - 0.5) * noiseRadius * 1.8;
      p.decoyY += (Math.random() - 0.5) * noiseRadius * 1.8;

      // Keep decoy in bounds
      p.decoyX = Math.max(10, Math.min(ARENA_W - 10, p.decoyX));
      p.decoyY = Math.max(10, Math.min(ARENA_H - 10, p.decoyY));

      // Update previous position
      p.px = p.x;
      p.py = p.y;
    });

    // Respawn dead players
    this.players.forEach(p => {
      if (!p.alive && p.respawnTimer > 0) {
        p.respawnTimer = Math.max(0, p.respawnTimer - dt);
        if (p.respawnTimer <= 0) {
          const spawn = this._randomSpawn();
          p.x = spawn.x; p.y = spawn.y;
          p.decoyX = spawn.x; p.decoyY = spawn.y;
          p.alive = true;
          p.invincibleTimer = INVINCIBLE_TIME;
        }
      }

      // Decrement invincibility
      if (p.invincibleTimer > 0) p.invincibleTimer = Math.max(0, p.invincibleTimer - dt);
    });

    // Update particles
    this.particles.each(pt => {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      pt.vx *= 0.95;
      pt.vy *= 0.95;
      if (pt.life <= 0) this.particles.release(pt);
    });

    // Clean old elim log entries (keep last 5)
    while (this.eliminationLog.length > 10) this.eliminationLog.shift();
  }

  // ── State serialisation ──

  getCommonState() {
    const decoys = [];
    this.players.forEach(p => {
      decoys.push({
        id: p.id,
        x: p.decoyX | 0,
        y: p.decoyY | 0,
        alive: p.alive,
        invincible: p.invincibleTimer > 0,
        disconnected: p.disconnected,
        isBot: !!p.isBot,
      });
    });

    const kills = [];
    this.players.forEach(p => {
      kills.push({
        id: p.id,
        username: p.username,
        kills: p.kills,
        alive: p.alive,
      });
    });

    const particles = [];
    this.particles.each(pt => {
      particles.push({ x: pt.x | 0, y: pt.y | 0, color: pt.color, life: +(pt.life / pt.maxLife).toFixed(2) });
    });

    return {
      type: 'state',
      gameState: this.state,
      decoys,
      kills,
      scores: Object.fromEntries(this.scores),
      obstacles: OBSTACLES,
      particles,
      elimLog: this.eliminationLog.slice(-5).map(e => ({
        x: e.x, y: e.y, time: e.time,
      })),
      winner: this.winner >= 0 ? this.winner : -1,
    };
  }
}

// ─── Room Manager ──────────────────────────────────────────
const rooms = new Map();
const socketToPlayer = new Map(); // socketId → { playerId, roomId }
const skillTracker = new SkillTracker();

function getOrCreateRoom(roomName) {
  const fullId = ROOM_PREFIX + roomName;
  if (!rooms.has(fullId)) {
    const room = new GameRoom(fullId);
    room.botManager = new G5BotManager(room, skillTracker);
    rooms.set(fullId, room);
  }
  return rooms.get(fullId);
}

// Clean up ended rooms
setInterval(() => {
  for (const [id, room] of rooms) {
    if (room.state === 'ended' && Date.now() - room._endedAt > 60000) {
      rooms.delete(id);
    }
  }
}, 30000);

// ─── Express + Socket.io ────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 15000,
  pingInterval: 5000,
});

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'G5_client.html'));
});

// ─── Socket Events ─────────────────────────────────────────

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentPlayerId = null;

  socket.on('reconnect-game', (data) => {
    if (!data || !data.playerId || !data.roomName) return;
    const fullId = ROOM_PREFIX + data.roomName;
    const room = rooms.get(fullId);
    if (!room) {
      socket.emit('reconnect-failed', { message: 'Room gone' });
      return;
    }
    const player = room.handleReconnect(socket.id, data.playerId);
    if (player) {
      currentRoom = room;
      currentPlayerId = socket.id;
      socket.join(fullId);
      socketToPlayer.set(socket.id, { playerId: socket.id, roomId: fullId });
      socket.emit('connected', {
        playerId: socket.id,
        roomId: fullId,
        gameState: room.state,
        reconnected: true,
        realX: player.x, realY: player.y,
      });
      io.to(fullId).emit('game-state', room.getCommonState());
    } else {
      socket.emit('reconnect-failed', { message: 'Expired or invalid' });
    }
  });

  socket.on('join', (data) => {
    if (!data || !data.username) {
      socket.emit('error', { message: 'Name required' });
      return;
    }
    if (!data.roomName) data.roomName = 'room1';
    const room = getOrCreateRoom(data.roomName);

    if (room.players.size >= MAX_PLAYERS) {
      socket.emit('error', { message: 'Room full (max 4)' });
      return;
    }
    if (room.state !== 'waiting') {
      socket.emit('error', { message: 'Game in progress' });
      return;
    }

    const player = room.addPlayer(socket.id, data.username);
    if (!player) {
      socket.emit('error', { message: 'Cannot join' });
      return;
    }

    currentRoom = room;
    currentPlayerId = socket.id;
    socket.join(room.id);
    socketToPlayer.set(socket.id, { playerId: socket.id, roomId: room.id });

    socket.emit('connected', {
      playerId: socket.id,
      roomId: room.id,
      gameState: room.state,
      reconnected: false,
      realX: player.x, realY: player.y,
    });

    io.to(room.id).emit('game-state', room.getCommonState());
    if (room.botManager) room.botManager.registerHuman(socket.id);
  });

  socket.on('input', (data) => {
    if (!currentRoom || !data) return;
    currentRoom.handleInput(currentPlayerId, data);
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      currentRoom.handleDisconnect(currentPlayerId);
      io.to(currentRoom.id).emit('game-state', currentRoom.getCommonState());
      if (currentRoom.botManager) {
        currentRoom.botManager.unregisterPlayer(currentPlayerId);
        currentRoom.botManager.scheduleBotFill();
      }
    }
    socketToPlayer.delete(socket.id);
  });
});

// ─── Game Loop (30 Hz) ─────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.botManager) room.botManager.update(now);
    room.update();

    if (room.state === 'waiting') {
      // Still broadcast so clients see other players in lobby
      io.to(room.id).emit('game-state', room.getCommonState());
    } else if (room.state === 'playing') {
      // Broadcast common state (decoys, scores, obstacles)
      const commonState = room.getCommonState();
      io.to(room.id).emit('game-state', commonState);

      // Send PRIVATE real position to each player individually
      room.players.forEach(p => {
        const sock = io.sockets.sockets.get(p.id);
        if (sock && sock.connected && !p.disconnected) {
          sock.emit('private', {
            realX: p.x | 0,
            realY: p.y | 0,
            myKills: p.kills,
            alive: p.alive,
            invincibleTimer: p.invincibleTimer,
          });
        }
      });
    } else if (room.state === 'ended') {
      io.to(room.id).emit('game-state', room.getCommonState());
      if (!room._notified) {
        room._notified = true;
        const winner = room.winner;
        const winnerName = winner >= 0 && room.players.has(winner)
          ? room.players.get(winner).username : 'Unknown';
        io.to(room.id).emit('game-over', {
          winner,
          winnerName,
          scores: Object.fromEntries(room.scores),
        });
      }
    }
  }
}, TICK_MS);

// ─── Start ─────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     SIGNAL  —  G5 Server               ║');
  console.log('║     http://localhost:' + String(PORT).padEnd(5) + '                    ║');
  console.log('║     Room prefix: ' + ROOM_PREFIX + '                    ║');
  console.log('║     4-Player Stealth / Bluff FFA        ║');
  console.log('╚══════════════════════════════════════════╝');
});
