// ============================================================
// RING OF FIRE — G6_ Game Server
// Node.js + Socket.io — 4-Player FFA Combat in Shrinking Ring
// ============================================================
// Quality targets:
//  1. ObjectPooler for projectiles + fire particles
//  2. Minimal netcode (only input)
//  3. Client-side prediction supported
//  4. Room isolation via G6_ prefix
//  5. 30-second reconnect window
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────
const PORT = process.env.PORT || 3006;
const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const ROOM_PREFIX = 'G6_';
const ARENA_W = 900;
const ARENA_H = 600;
const MAX_PLAYERS = 4;
const RECONNECT_SEC = 30;

const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 155;          // px/s
const MAX_HP = 3;                  // 3 hits to eliminate
const ATK_COOLDOWN = 0.4;          // seconds
const PROJ_SPEED = 320;            // px/s
const PROJ_RADIUS = 5;
const PROJ_LIFETIME = 1.2;         // seconds
const RING_INITIAL = 260;          // initial ring radius
const RING_MIN = 40;               // minimum ring radius
const RING_SHRINK_INTERVAL = 12;   // seconds between shrinks
const RING_SHRINK_AMOUNT = 22;     // px per shrink
const RING_DAMAGE = 1;             // HP per tick in fire
const RING_DAMAGE_INTERVAL = 0.8;  // seconds between ring damage ticks
const WIN_KILLS = 3;
const RESPAWN_TIME = 2.5;

const PLAYER_COLORS = ['#ff4400', '#ff8800', '#ffcc00', '#ff3366'];
const SPAWN_POSITIONS = [
  { x: 300, y: 100 }, { x: 600, y: 100 },
  { x: 300, y: 500 }, { x: 600, y: 500 },
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
      if (!this._pool[i]._active) { this._pool[i]._active = true; return this._pool[i]; }
    }
    const obj = this._factory(); obj._active = true; this._pool.push(obj); return obj;
  }
  release(obj) { if (obj) obj._active = false; }
  releaseAll() { for (const obj of this._pool) obj._active = false; }
  each(fn) { for (const obj of this._pool) { if (obj._active) fn(obj); } }
}

function createProj() {
  return { x: 0, y: 0, vx: 0, vy: 0, ownerId: null, lifetime: 0, _active: false };
}
function createFirePt() {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, _active: false };
}

// ─── Game Room ──────────────────────────────────────────────
class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.projectiles = new ObjectPooler(createProj, 30);
    this.fireParticles = new ObjectPooler(createFirePt, 80);
    this.state = 'waiting';
    this.winner = -1;
    this._endedAt = 0;
    this._disconnectedTimers = new Map();
    this._startTimer = null;

    this.ringX = ARENA_W / 2;
    this.ringY = ARENA_H / 2;
    this.ringRadius = RING_INITIAL;
    this.shrinkTimer = RING_SHRINK_INTERVAL;
    this.ringDmgTimer = 0;
    this._shrinkWarned = false;
  }

  // ── Helpers ──

  _isInRing(x, y) {
    const dx = x - this.ringX;
    const dy = y - this.ringY;
    return (dx * dx + dy * dy) <= (this.ringRadius - PLAYER_RADIUS) * (this.ringRadius - PLAYER_RADIUS);
  }

  _randomSpawnInRing() {
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * (this.ringRadius - 40);
      const x = this.ringX + Math.cos(ang) * r;
      const y = this.ringY + Math.sin(ang) * r;
      if (this._isInRing(x, y)) return { x, y };
    }
    return { x: this.ringX, y: this.ringY - 30 };
  }

  // ── Player management ──

  addPlayer(id, username) {
    if (this.players.has(id)) return this.players.get(id);
    if (this.players.size >= MAX_PLAYERS) return null;

    const spawn = this._randomSpawnInRing();
    const pi = this.players.size;
    const player = {
      id, username,
      x: spawn.x, y: spawn.y,
      aimX: spawn.x + 1, aimY: spawn.y,
      hp: MAX_HP,
      maxHp: MAX_HP,
      alive: true,
      respawnTimer: 0,
      lastAttackTime: 0,
      kills: 0,
      color: PLAYER_COLORS[pi],
      playerIndex: pi,
      disconnected: false,
      disconnectTimer: 0,
    };
    this.players.set(id, player);

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
    this._disconnectedTimers.delete(id);
    if (this.state === 'playing') this._checkWinCondition();
  }

  handleDisconnect(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.disconnected = true; p.disconnectTimer = RECONNECT_SEC;
    this._disconnectedTimers.set(id, RECONNECT_SEC);
  }

  handleReconnect(newId, oldId) {
    const p = this.players.get(oldId);
    if (!p || !p.disconnected) return null;
    p.id = newId; p.disconnected = false; p.disconnectTimer = 0;
    this.players.delete(oldId); this.players.set(newId, p);
    this._disconnectedTimers.delete(oldId);
    return p;
  }

  handleInput(id, data) {
    const p = this.players.get(id);
    if (!p || !p.alive || p.disconnected) return;
    if (this.state !== 'playing') return;

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

    if (dx !== 0 || dy !== 0) {
      p.x = nx; p.y = ny;
    }

    if (data.mx != null && data.my != null) {
      p.aimX = data.mx; p.aimY = data.my;
    }

    // Attack
    if (data.shoot) {
      const now = Date.now() / 1000;
      if (now - p.lastAttackTime >= ATK_COOLDOWN) {
        p.lastAttackTime = now;
        const angle = Math.atan2(p.aimY - p.y, p.aimX - p.x);
        const b = this.projectiles.get();
        b.x = p.x + Math.cos(angle) * PLAYER_RADIUS;
        b.y = p.y + Math.sin(angle) * PLAYER_RADIUS;
        b.vx = Math.cos(angle) * PROJ_SPEED;
        b.vy = Math.sin(angle) * PROJ_SPEED;
        b.ownerId = id;
        b.lifetime = PROJ_LIFETIME;
      }
    }
  }

  // ── Game lifecycle ──

  _startGame() {
    this.state = 'playing';
    this.projectiles.releaseAll();
    this.fireParticles.releaseAll();
    this.winner = -1;
    this.ringX = ARENA_W / 2;
    this.ringY = ARENA_H / 2;
    this.ringRadius = RING_INITIAL;
    this.shrinkTimer = RING_SHRINK_INTERVAL;
    this.ringDmgTimer = 0;

    let idx = 0;
    this.players.forEach(p => {
      const sp = this._randomSpawnInRing();
      p.x = sp.x; p.y = sp.y;
      p.hp = MAX_HP; p.alive = true; p.respawnTimer = 0;
      p.lastAttackTime = 0; p.kills = 0;
      idx++;
    });
  }

  _endGame(winnerId) {
    this.state = 'ended';
    this.winner = winnerId;
    this._endedAt = Date.now();
  }

  _checkWinCondition() {
    const alive = [...this.players.values()].filter(p => p.alive && !p.disconnected).length;
    if (alive <= 1 && this.players.size > 0 && this.state === 'playing') {
      const last = [...this.players.values()].find(p => p.alive && !p.disconnected);
      if (last) {
        this._endGame(last.id);
      }
    }
  }

  // ── Update ──

  update() {
    const dt = 1 / TICK_RATE;

    // Disconnect cleanup
    for (const [oldId, timer] of this._disconnectedTimers) {
      const remaining = timer - dt;
      if (remaining <= 0) this.removePlayer(oldId);
      else {
        this._disconnectedTimers.set(oldId, remaining);
        const p = this.players.get(oldId);
        if (p) p.disconnectTimer = remaining;
      }
    }

    if (this.state !== 'playing') {
      // Still emit fire particles for visual even in waiting
      this._spawnFireParticles(dt);
      this.fireParticles.each(pt => { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; if (pt.life <= 0) this.fireParticles.release(pt); });
      return;
    }

    // ── Ring shrink ──
    if (this.ringRadius > RING_MIN) {
      this.shrinkTimer -= dt;
      if (this.shrinkTimer <= 0) {
        this.shrinkTimer = RING_SHRINK_INTERVAL;
        this.ringRadius = Math.max(RING_MIN, this.ringRadius - RING_SHRINK_AMOUNT);
      }
    }

    // ── Fire particles ──
    this._spawnFireParticles(dt);
    this.fireParticles.each(pt => { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; if (pt.life <= 0) this.fireParticles.release(pt); });

    // ── Ring damage ──
    this.ringDmgTimer += dt;
    if (this.ringDmgTimer >= RING_DAMAGE_INTERVAL) {
      this.ringDmgTimer = 0;
      this.players.forEach(p => {
        if (!p.alive || p.disconnected) return;
        if (!this._isInRing(p.x, p.y)) {
          p.hp -= RING_DAMAGE;
          if (p.hp <= 0) {
            p.hp = 0; p.alive = false; p.respawnTimer = RESPAWN_TIME;
            this._checkWinCondition();
          }
        }
      });
    }

    // ── Projectiles ──
    this.projectiles.each(b => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.lifetime -= dt;

      if (b.lifetime <= 0 || b.x < -60 || b.x > ARENA_W + 60 || b.y < -60 || b.y > ARENA_H + 60) {
        this.projectiles.release(b); return;
      }

      for (const p of this.players.values()) {
        if (!p.alive || p.disconnected || p.id === b.ownerId) continue;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        if (dx * dx + dy * dy < (PLAYER_RADIUS + PROJ_RADIUS) ** 2) {
          p.hp--;
          this.projectiles.release(b);
          if (p.hp <= 0) {
            p.hp = 0; p.alive = false; p.respawnTimer = RESPAWN_TIME;
            const owner = this.players.get(b.ownerId);
            if (owner) { owner.kills++; }
            this._checkWinCondition();
          }
          return;
        }
      }
    });

    // ── Respawn ──
    this.players.forEach(p => {
      if (!p.alive && p.respawnTimer > 0) {
        p.respawnTimer = Math.max(0, p.respawnTimer - dt);
        if (p.respawnTimer <= 0) {
          const sp = this._randomSpawnInRing();
          p.x = sp.x; p.y = sp.y;
          p.hp = MAX_HP; p.alive = true;
        }
      }
    });
  }

  _spawnFireParticles(dt) {
    // Spawn particles around the ring edge
    if (Math.random() < 0.5) {
      const ang = Math.random() * Math.PI * 2;
      const r = this.ringRadius;
      const pt = this.fireParticles.get();
      pt.x = this.ringX + Math.cos(ang) * r;
      pt.y = this.ringY + Math.sin(ang) * r;
      const outward = ang + Math.PI + (Math.random() - 0.5) * 0.5;
      pt.vx = Math.cos(outward) * (10 + Math.random() * 30);
      pt.vy = Math.sin(outward) * (10 + Math.random() * 30);
      pt.life = 0.4 + Math.random() * 0.4;
      pt.maxLife = pt.life;
    }
  }

  // ── State ──

  getState() {
    const players = [];
    this.players.forEach(p => {
      players.push({
        id: p.id, username: p.username,
        x: p.x | 0, y: p.y | 0,
        aimX: p.aimX | 0, aimY: p.aimY | 0,
        hp: p.hp, maxHp: p.maxHp,
        alive: p.alive, respawnTimer: +(p.respawnTimer.toFixed(1)),
        kills: p.kills,
        color: p.color,
        playerIndex: p.playerIndex,
        disconnected: p.disconnected,
      });
    });

    const projs = [];
    this.projectiles.each(b => { projs.push({ x: b.x | 0, y: b.y | 0 }); });

    const fps = [];
    this.fireParticles.each(pt => {
      fps.push({ x: pt.x | 0, y: pt.y | 0, life: +(pt.life / pt.maxLife).toFixed(2) });
    });

    return {
      type: 'state',
      roomId: this.id,
      gameState: this.state,
      players,
      projs,
      fireParticles: fps,
      ringX: this.ringX | 0,
      ringY: this.ringY | 0,
      ringRadius: this.ringRadius | 0,
      shrinkTimer: +this.shrinkTimer.toFixed(1),
      winner: this.winner >= 0 ? this.winner : -1,
    };
  }
}

// ─── Room Manager ──────────────────────────────────────────
const rooms = new Map();
function getOrCreateRoom(n) { const f = ROOM_PREFIX + n; if (!rooms.has(f)) rooms.set(f, new GameRoom(f)); return rooms.get(f); }
setInterval(() => { for (const [id, r] of rooms) { if (r.state === 'ended' && Date.now() - r._endedAt > 60000) rooms.delete(id); } }, 30000);

// ─── Express + Socket.io ────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 15000, pingInterval: 5000 });
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'G6_client.html')));

io.on('connection', (socket) => {
  let currentRoom = null, currentPlayerId = null;

  socket.on('reconnect-game', (data) => {
    if (!data || !data.playerId || !data.roomName) return;
    const fullId = ROOM_PREFIX + data.roomName;
    const room = rooms.get(fullId);
    if (!room) { socket.emit('reconnect-failed', { message: 'Room gone' }); return; }
    const player = room.handleReconnect(socket.id, data.playerId);
    if (player) {
      currentRoom = room; currentPlayerId = socket.id;
      socket.join(fullId);
      socket.emit('connected', { playerId: socket.id, roomId: fullId, gameState: room.state, reconnected: true, playerIndex: player.playerIndex });
      io.to(fullId).emit('game-state', room.getState());
    } else { socket.emit('reconnect-failed', { message: 'Expired or invalid' }); }
  });

  socket.on('join', (data) => {
    if (!data || !data.username) { socket.emit('error', { message: 'Name required' }); return; }
    if (!data.roomName) data.roomName = 'room1';
    const room = getOrCreateRoom(data.roomName);
    if (room.players.size >= MAX_PLAYERS) { socket.emit('error', { message: 'Room full (max 4)' }); return; }
    if (room.state !== 'waiting') { socket.emit('error', { message: 'Game in progress' }); return; }
    const player = room.addPlayer(socket.id, data.username);
    if (!player) { socket.emit('error', { message: 'Cannot join' }); return; }
    currentRoom = room; currentPlayerId = socket.id;
    socket.join(room.id);
    socket.emit('connected', { playerId: socket.id, roomId: room.id, gameState: room.state, reconnected: false, playerIndex: player.playerIndex });
    io.to(room.id).emit('game-state', room.getState());
  });

  socket.on('input', (data) => { if (!currentRoom || !data) return; currentRoom.handleInput(currentPlayerId, data); });
  socket.on('disconnect', () => { if (currentRoom) { currentRoom.handleDisconnect(currentPlayerId); io.to(currentRoom.id).emit('game-state', currentRoom.getState()); } });
});

setInterval(() => {
  for (const room of rooms.values()) {
    room.update();
    if (room.state === 'waiting' || room.state === 'playing') {
      io.to(room.id).emit('game-state', room.getState());
    } else if (room.state === 'ended') {
      io.to(room.id).emit('game-state', room.getState());
      if (!room._notified) {
        room._notified = true;
        const winner = room.winner >= 0 ? room.players.get(room.winner) : null;
        io.to(room.id).emit('game-over', { winner: room.winner, winnerName: winner ? winner.username : 'Unknown', kills: winner ? winner.kills : 0 });
      }
    }
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     RING OF FIRE  —  G6 Server          ║');
  console.log('║     http://localhost:' + String(PORT).padEnd(5) + '                    ║');
  console.log('║     Room prefix: ' + ROOM_PREFIX + '                    ║');
  console.log('║     4-Player FFA Combat / Shrinking Ring║');
  console.log('╚══════════════════════════════════════════╝');
});
