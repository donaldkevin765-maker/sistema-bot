// ============================================================
// VOID RACERS — G4_ Game Server
// Node.js + Socket.io — 4-Player Top-Down Racing
// ============================================================
// Quality targets:
//  1. ObjectPooler for tire trails
//  2. Minimal netcode (only input)
//  3. Client-side prediction supported
//  4. Room isolation via G4_ prefix
//  5. 30-second reconnect window
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────
const PORT = process.env.PORT || 3004;
const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const ROOM_PREFIX = 'G4_';
const ARENA_W = 900;
const ARENA_H = 600;
const MAX_PLAYERS = 4;
const RECONNECT_SEC = 30;

const CAR_ACCEL = 220;     // px/s² forward
const CAR_BRAKE = 150;     // px/s² backward
const CAR_FRICTION = 0.97; // per-frame multiplier
const CAR_MAX_SPEED = 220; // px/s
const CAR_TURN_SPEED = 2.8;// rad/s
const CAR_RADIUS = 12;
const WIN_LAPS = 3;

// ─── Track waypoints (define the racing line) ──────────────
// Inner and outer bounds create the track walls
const TRACK_INNER = [
  { x: 350, y: 80 }, { x: 550, y: 80 }, { x: 750, y: 180 },
  { x: 800, y: 300 }, { x: 750, y: 420 }, { x: 550, y: 520 },
  { x: 350, y: 520 }, { x: 150, y: 420 }, { x: 100, y: 300 },
  { x: 150, y: 180 },
];
const TRACK_OUTER = [
  { x: 300, y: 30 }, { x: 600, y: 30 }, { x: 820, y: 140 },
  { x: 870, y: 300 }, { x: 820, y: 460 }, { x: 600, y: 570 },
  { x: 300, y: 570 }, { x: 80, y: 460 }, { x: 30, y: 300 },
  { x: 80, y: 140 },
];

// Waypoints for lap counting (center of track segments)
const LAP_WAYPOINTS = [];
for (let i = 0; i < TRACK_INNER.length; i++) {
  LAP_WAYPOINTS.push({
    x: (TRACK_INNER[i].x + TRACK_OUTER[i].x) / 2,
    y: (TRACK_INNER[i].y + TRACK_OUTER[i].y) / 2,
  });
}
const WAYPOINT_RADIUS = 60; // how close to count as passing

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

function createTrail() {
  return { x: 0, y: 0, life: 0, maxLife: 0, color: '', _active: false };
}

// ─── Car colours ───────────────────────────────────────────
const CAR_COLORS = ['#00ccff', '#ff66cc', '#ffcc00', '#44ff88'];
const CAR_NAMES = ['Cyan', 'Pink', 'Gold', 'Green'];
const SPAWN_POSITIONS = [
  { x: 450, y: 110, angle: 0 },
  { x: 470, y: 110, angle: 0 },
  { x: 430, y: 110, angle: 0 },
  { x: 490, y: 110, angle: 0 },
];

// ─── Game Room ──────────────────────────────────────────────
class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.trails = new ObjectPooler(createTrail, 100);
    this.state = 'waiting';
    this.winner = -1;
    this._endedAt = 0;
    this._disconnectedTimers = new Map();
    this._startTimer = null;
  }

  // ── Player management ──

  addPlayer(id, username) {
    if (this.players.has(id)) return this.players.get(id);
    if (this.players.size >= MAX_PLAYERS) return null;

    const idx = this.players.size;
    const spawn = SPAWN_POSITIONS[idx] || { x: 450, y: 110, angle: 0 };

    const player = {
      id, username,
      x: spawn.x, y: spawn.y,
      angle: spawn.angle,
      speed: 0,
      lap: 0,
      waypointIndex: 0,
      color: CAR_COLORS[idx],
      playerIndex: idx,
      disconnected: false,
      disconnectTimer: 0,
      finished: false,
      finishedAt: 0,
    };

    this.players.set(id, player);

    // Auto-start
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

  // ── Car physics ──

  handleInput(id, data) {
    const p = this.players.get(id);
    if (!p || p.disconnected || p.finished) return;
    if (this.state !== 'playing') return;

    const dt = 1 / TICK_RATE;

    // Acceleration / braking
    if (data.up) p.speed += CAR_ACCEL * dt;
    if (data.down) p.speed -= CAR_BRAKE * dt;

    // Friction
    p.speed *= CAR_FRICTION;

    // Clamp speed
    if (p.speed > CAR_MAX_SPEED) p.speed = CAR_MAX_SPEED;
    if (p.speed < -CAR_MAX_SPEED * 0.4) p.speed = -CAR_MAX_SPEED * 0.4;

    // Steering (only when moving)
    if (Math.abs(p.speed) > 5) {
      const turnFactor = Math.min(1, Math.abs(p.speed) / CAR_MAX_SPEED);
      if (data.left) p.angle -= CAR_TURN_SPEED * turnFactor * dt;
      if (data.right) p.angle += CAR_TURN_SPEED * turnFactor * dt;
    }

    // Move
    p.x += Math.cos(p.angle) * p.speed * dt;
    p.y += Math.sin(p.angle) * p.speed * dt;

    // Track bounds collision (simple: push back to nearest track edge)
    this._constrainToTrack(p);

    // Spawn trail particles when sliding/drifting
    if (Math.abs(p.speed) > 80 && (data.left || data.right)) {
      if (Math.random() < 0.3) {
        const t = this.trails.get();
        t.x = p.x - Math.cos(p.angle) * CAR_RADIUS * 1.5;
        t.y = p.y - Math.sin(p.angle) * CAR_RADIUS * 1.5;
        t.life = 0.4 + Math.random() * 0.3;
        t.maxLife = t.life;
        t.color = p.color;
      }
    }

    // Lap/waypoint detection
    this._checkWaypoint(p);
  }

  _constrainToTrack(p) {
    // Simple containment: keep within outer polygon, outside inner polygon
    // Using point-in-polygon check for both inner and outer
    if (!this._isInOuterTrack(p.x, p.y) || this._isInInnerTrack(p.x, p.y)) {
      // Push back toward center
      const cx = 450, cy = 300;
      const dx = p.x - cx, dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        p.x -= (dx / dist) * 10;
        p.y -= (dy / dist) * 10;
        p.speed *= 0.5;
      }
    }

    // Absolute bounds
    p.x = Math.max(20, Math.min(ARENA_W - 20, p.x));
    p.y = Math.max(20, Math.min(ARENA_H - 20, p.y));
  }

  _isInOuterTrack(x, y) {
    return this._pointInPolygon(x, y, TRACK_OUTER);
  }

  _isInInnerTrack(x, y) {
    return this._pointInPolygon(x, y, TRACK_INNER);
  }

  _pointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  _checkWaypoint(p) {
    const wp = LAP_WAYPOINTS[p.waypointIndex];
    if (!wp) return;

    const dx = p.x - wp.x;
    const dy = p.y - wp.y;
    if (dx * dx + dy * dy < WAYPOINT_RADIUS * WAYPOINT_RADIUS) {
      p.waypointIndex = (p.waypointIndex + 1) % LAP_WAYPOINTS.length;

      // Completed a lap
      if (p.waypointIndex === 0) {
        p.lap++;
        if (p.lap >= WIN_LAPS) {
          p.finished = true;
          p.finishedAt = Date.now();
          this._checkWinCondition();
        }
      }
    }
  }

  // ── Game lifecycle ──

  _startGame() {
    this.state = 'playing';
    this.trails.releaseAll();
    this.winner = -1;

    let idx = 0;
    this.players.forEach(p => {
      const spawn = SPAWN_POSITIONS[idx] || { x: 450, y: 110, angle: 0 };
      p.x = spawn.x;
      p.y = spawn.y;
      p.angle = spawn.angle;
      p.speed = 0;
      p.lap = 0;
      p.waypointIndex = 0;
      p.finished = false;
      p.finishedAt = 0;
      idx++;
    });
  }

  _endGame(playerIndex) {
    this.state = 'ended';
    this.winner = playerIndex;
    this._endedAt = Date.now();
  }

  _checkWinCondition() {
    if (this.state !== 'playing') return;
    // First to finish wins
    const finished = [...this.players.values()]
      .filter(p => p.finished)
      .sort((a, b) => a.finishedAt - b.finishedAt);
    if (finished.length > 0) {
      this._endGame(finished[0].playerIndex);
    }
  }

  // ── Update ──

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

    // Trail decay
    this.trails.each(t => {
      t.life -= dt;
      if (t.life <= 0) this.trails.release(t);
    });
  }

  // ── State ──

  getState() {
    const cars = [];
    this.players.forEach(p => {
      cars.push({
        id: p.id,
        username: p.username,
        x: p.x | 0, y: p.y | 0,
        angle: +p.angle.toFixed(3),
        speed: p.speed | 0,
        lap: p.lap,
        waypointIndex: p.waypointIndex,
        color: p.color,
        playerIndex: p.playerIndex,
        finished: p.finished,
        disconnected: p.disconnected,
      });
    });

    const trails = [];
    this.trails.each(t => {
      trails.push({
        x: t.x | 0, y: t.y | 0, life: +(t.life / t.maxLife).toFixed(2), color: t.color,
      });
    });

    return {
      type: 'state',
      roomId: this.id,
      gameState: this.state,
      cars,
      trails,
      trackInner: TRACK_INNER,
      trackOuter: TRACK_OUTER,
      waypoints: LAP_WAYPOINTS,
      winner: this.winner,
    };
  }
}

// ─── Room Manager ──────────────────────────────────────────
const rooms = new Map();

function getOrCreateRoom(roomName) {
  const fullId = ROOM_PREFIX + roomName;
  if (!rooms.has(fullId)) rooms.set(fullId, new GameRoom(fullId));
  return rooms.get(fullId);
}

setInterval(() => {
  for (const [id, room] of rooms) {
    if (room.state === 'ended' && Date.now() - room._endedAt > 60000) rooms.delete(id);
  }
}, 30000);

// ─── Express + Socket.io ────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }, pingTimeout: 15000, pingInterval: 5000,
});

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'G4_client.html')));

// ─── Socket Events ─────────────────────────────────────────
io.on('connection', (socket) => {
  let currentRoom = null;
  let currentPlayerId = null;

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

// ─── Game Loop ─────────────────────────────────────────────
setInterval(() => {
  for (const room of rooms.values()) {
    room.update();
    if (room.state === 'waiting') { io.to(room.id).emit('game-state', room.getState()); }
    else if (room.state === 'playing') { io.to(room.id).emit('game-state', room.getState()); }
    else if (room.state === 'ended') {
      io.to(room.id).emit('game-state', room.getState());
      if (!room._notified) {
        room._notified = true;
        const winnerName = room.winner >= 0 && [...room.players.values()].find(p => p.playerIndex === room.winner)?.username || 'Unknown';
        io.to(room.id).emit('game-over', { winner: room.winner, winnerName, laps: WIN_LAPS });
      }
    }
  }
}, TICK_MS);

// ─── Start ─────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     VOID RACERS  —  G4 Server           ║');
  console.log('║     http://localhost:' + String(PORT).padEnd(5) + '                    ║');
  console.log('║     Room prefix: ' + ROOM_PREFIX + '                    ║');
  console.log('║     4-Player Top-Down Racing            ║');
  console.log('╚══════════════════════════════════════════╝');
});
