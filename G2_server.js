// ============================================================
// NEON TENNIS — G2_ Game Server
// Node.js + Socket.io — 1v1 / 2v2 Neon Pong/Tennis
// ============================================================
// Quality targets:
//  1. ObjectPooler for ball trail particles (zero GC)
//  2. Minimal netcode (only input state)
//  3. Client-side prediction supported
//  4. Room isolation via G2_ prefix
//  5. 30-second reconnect window
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { G2BotManager, SkillTracker } = require('./G2_bot.js');

// ─── Constants ───────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const ROOM_PREFIX = 'G2_';
const ARENA_W = 900;
const ARENA_H = 600;
const MAX_PLAYERS = 4;
const RECONNECT_SEC = 30;

const PADDLE_W = 12;
const PADDLE_H = 80;
const PADDLE_SPEED = 200;               // px/s
const PADDLE_OFFSET = 30;               // from edge
const BALL_RADIUS = 8;
const BALL_SPEED_INIT = 200;            // px/s initial
const BALL_SPEED_MAX = 420;
const BALL_ACCEL = 8;                   // speed increase per hit
const WIN_SCORE = 7;

// Paddle starting Y positions per slot:
// 1v1: slot 0=center-left, slot 1=center-right
// 2v2: slot 0=top-left,   slot 2=bottom-left
//       slot 1=top-right,  slot 3=bottom-right
const PADDLE_SLOTS = [
  { side: 'left',  yRatio: 0.5 },   // P0 left top (1v1 center)
  { side: 'right', yRatio: 0.5 },   // P1 right top
  { side: 'left',  yRatio: 0.5 },   // P2 left bottom (alias for 1v1)
  { side: 'right', yRatio: 0.5 },   // P3 right bottom
];

const SERVE_DELAY = 1.0;               // seconds between point and serve

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
    const obj = this._factory();
    obj._active = true;
    this._pool.push(obj);
    return obj;
  }
  release(obj) { if (obj) obj._active = false; }
  releaseAll() { for (const obj of this._pool) obj._active = false; }
  each(fn) { for (const obj of this._pool) { if (obj._active) fn(obj); } }
}

// ─── Trail particle factory ─────────────────────────────────
function createTrail() {
  return { x: 0, y: 0, life: 0, maxLife: 0, speed: 0, _active: false };
}

// ─── Game Room ──────────────────────────────────────────────
class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();       // playerId → paddle player
    this.trails = new ObjectPooler(createTrail, 60);
    this.state = 'waiting';         // waiting | playing | ended
    this.scores = [0, 0];           // [leftScore, rightScore]
    this.winner = -1;
    this._endedAt = 0;
    this._disconnectedTimers = new Map();
    this._startTimer = null;
    this.maxPlayers = MAX_PLAYERS;
    this.botManager = null;
    this._playerSurvivalStart = new Map();

    // Ball state
    this.ball = { x: 0, y: 0, vx: 0, vy: 0, speed: BALL_SPEED_INIT };
    this.serveTimer = 0;
    this.lastHitById = null;
  }

  // ── Helpers ──

  _getPaddleX(side) {
    return side === 'left' ? PADDLE_OFFSET : ARENA_W - PADDLE_OFFSET - PADDLE_W;
  }

  _resetBall(direction) {
    const b = this.ball;
    b.x = ARENA_W / 2;
    b.y = ARENA_H / 2;
    b.speed = BALL_SPEED_INIT;
    const angle = (Math.random() * 0.8 + 0.3) * (Math.random() < 0.5 ? 1 : -1); // ±0.3–1.1 rad
    const dir = direction || (Math.random() < 0.5 ? 1 : -1);
    b.vx = Math.cos(angle) * b.speed * dir;
    b.vy = Math.sin(angle) * b.speed;
    this.lastHitById = null;
    this.serveTimer = SERVE_DELAY;
  }

  // ── Player management ──

  addPlayer(id, username, isBot = false) {
    if (this.players.has(id)) return this.players.get(id);
    if (this.players.size >= MAX_PLAYERS) return null;

    const slot = this.players.size; // 0, 1, 2, 3
    const side = slot === 0 || slot === 2 ? 'left' : 'right';

    // In 1v1, left/right each have 1 paddle at center
    // In 2v2, each side has 2 paddles stacked
    const isTwoVtwo = this.players.size >= 2 || (this.players.size === 1 && slot === 1);
    // Actually, determine 2v2 mode later when all players are known
    // For now each paddle is independent

    const player = {
      id, username,
      side,
      slot,
      y: ARENA_H / 2,
      paddleIndex: slot,
      disconnected: false,
      disconnectTimer: 0,
      isBot,
    };

    this.players.set(id, player);

    // Reassign paddle positions based on count
    this._reassignPaddles();

    return player;
  }

  _reassignPaddles() {
    const pArr = [...this.players.values()];
    const leftCount = pArr.filter(p => p.side === 'left').length;
    const rightCount = pArr.filter(p => p.side === 'right').length;

    pArr.forEach(p => {
      const isLeft = p.side === 'left';
      const sidePlayers = pArr.filter(pp => pp.side === p.side).sort((a, b) => a.slot - b.slot);
      const idx = sidePlayers.indexOf(p);
      const total = sidePlayers.length;

      if (total === 1) {
        p.y = ARENA_H / 2 - PADDLE_H / 2;
      } else {
        // Stack paddles
        const gap = (ARENA_H - PADDLE_H * total) / (total + 1);
        p.y = gap + idx * (PADDLE_H + gap);
      }
    });
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this._disconnectedTimers.delete(id);
    if (this.state === 'playing') this._checkWinCondition();
    if (this.botManager && !p.isBot) this.botManager.unregisterPlayer(id);
  }

  handleDisconnect(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.isBot) { this.removePlayer(id); return; }
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

  startIfReady() {
    if (this.state !== 'waiting' || this.players.size < 2) return;
    if (this.players.size >= this.maxPlayers || this._forceStartReady) {
      if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null; }
      this._startGame();
    } else if (!this._startTimer) {
      this._startTimer = setTimeout(() => {
        this._startTimer = null;
        if (this.state === 'waiting' && this.players.size >= 2) this._startGame();
      }, 8000);
    }
  }

  // ── Input ──

  handleInput(id, data) {
    const p = this.players.get(id);
    if (!p || p.disconnected) return;
    if (this.state !== 'playing') return;

    let dy = 0;
    if (data.up) dy -= 1;
    if (data.down) dy += 1;

    const step = PADDLE_SPEED / TICK_RATE;
    p.y += dy * step;
    p.y = Math.max(0, Math.min(ARENA_H - PADDLE_H, p.y));
  }

  // ── Game lifecycle ──

  _startGame() {
    this.state = 'playing';
    this.scores = [0, 0];
    this.trails.releaseAll();
    this.winner = -1;

    // Reset paddle positions
    this._reassignPaddles();

    // Reset ball
    this._resetBall(Math.random() < 0.5 ? 1 : -1);

    // Survival tracking
    const now = Date.now();
    this.players.forEach(p => this._playerSurvivalStart.set(p.id, now));
    if (this.botManager) this.botManager.recalibrate();
  }

  _endGame(teamIndex) {
    this.state = 'ended';
    this.winner = teamIndex;
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
      this.scores = [0, 0];
      this.winner = -1;
      this._notified = false;
      this._endedAt = 0;
      this._forceStartReady = false;
    }, 3000);
  }

  _checkWinCondition() {
    if (this.scores[0] >= WIN_SCORE) { this._endGame(0); return; }
    if (this.scores[1] >= WIN_SCORE) { this._endGame(1); return; }

    // Forfeit if one side has no active players
    if (this.state === 'playing') {
      const leftAlive = [...this.players.values()].filter(p => p.side === 'left' && !p.disconnected).length;
      const rightAlive = [...this.players.values()].filter(p => p.side === 'right' && !p.disconnected).length;
      if (leftAlive === 0) { this._endGame(1); return; }
      if (rightAlive === 0) { this._endGame(0); return; }
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

    if (this.state !== 'playing') return;

    // Serve countdown
    if (this.serveTimer > 0) {
      this.serveTimer = Math.max(0, this.serveTimer - dt);
      return; // ball frozen during serve delay
    }

    // ── Ball physics ──
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Trail particle every few ticks (sampled via position change)
    if (Math.random() < 0.4) {
      const t = this.trails.get();
      t.x = b.x;
      t.y = b.y;
      t.life = 0.5 + Math.random() * 0.3;
      t.maxLife = t.life;
      t.speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    }

    // Top / bottom wall bounce
    if (b.y - BALL_RADIUS <= 0) {
      b.y = BALL_RADIUS;
      b.vy = Math.abs(b.vy);
    } else if (b.y + BALL_RADIUS >= ARENA_H) {
      b.y = ARENA_H - BALL_RADIUS;
      b.vy = -Math.abs(b.vy);
    }

    // ── Paddle collisions ──
    const leftPaddleX = this._getPaddleX('left');
    const rightPaddleX = this._getPaddleX('right');

    // Check ball against all paddles
    for (const p of this.players.values()) {
      if (p.disconnected) continue;
      const paddleX = p.side === 'left' ? leftPaddleX : rightPaddleX;

      // Ball approaching paddle from correct direction
      const approachingLeft = p.side === 'left' && b.vx < 0 && b.x - BALL_RADIUS <= paddleX + PADDLE_W;
      const approachingRight = p.side === 'right' && b.vx > 0 && b.x + BALL_RADIUS >= paddleX;

      if (!approachingLeft && !approachingRight) continue;

      // Check Y overlap
      if (b.y + BALL_RADIUS > p.y && b.y - BALL_RADIUS < p.y + PADDLE_H) {
        // HIT!
        const hitCenter = (b.y - (p.y + PADDLE_H / 2)) / (PADDLE_H / 2); // -1..1
        const angle = hitCenter * Math.PI * 0.38; // max ~68° deflection

        b.speed = Math.min(BALL_SPEED_MAX, b.speed + BALL_ACCEL);
        const dir = p.side === 'left' ? 1 : -1;
        b.vx = Math.cos(angle) * b.speed * dir;
        b.vy = Math.sin(angle) * b.speed;

        // Push ball out of paddle
        if (p.side === 'left') b.x = paddleX + PADDLE_W + BALL_RADIUS + 1;
        else b.x = paddleX - BALL_RADIUS - 1;

        this.lastHitById = p.id;
        break; // one paddle per frame
      }
    }

    // ── Scoring ──
    if (b.x + BALL_RADIUS < 0) {
      // Right side scores
      this.scores[1]++;
      this._checkWinCondition();
      if (this.state === 'playing') this._resetBall(1);
    } else if (b.x - BALL_RADIUS > ARENA_W) {
      // Left side scores
      this.scores[0]++;
      this._checkWinCondition();
      if (this.state === 'playing') this._resetBall(-1);
    }

    // ── Trail cleanup ──
    this.trails.each(t => {
      t.life -= dt;
      if (t.life <= 0) this.trails.release(t);
    });
  }

  // ── State serialisation ──

  getState() {
    const paddles = [];
    this.players.forEach(p => {
      paddles.push({
        id: p.id,
        username: p.username,
        side: p.side,
        y: p.y | 0,
        disconnected: p.disconnected,
        isBot: !!p.isBot,
      });
    });

    const trailArr = [];
    this.trails.each(t => {
      trailArr.push({
        x: t.x | 0, y: t.y | 0,
        life: +(t.life / t.maxLife).toFixed(2),
        speed: t.speed | 0,
      });
    });

    return {
      type: 'state',
      roomId: this.id,
      gameState: this.state,
      ball: {
        x: this.ball.x | 0,
        y: this.ball.y | 0,
        vx: (this.ball.vx * TICK_RATE) | 0, // send as px/frame for client lerp
        vy: (this.ball.vy * TICK_RATE) | 0,
        speed: this.ball.speed | 0,
      },
      paddles,
      scores: [this.scores[0], this.scores[1]],
      trail: trailArr,
      winner: this.winner,
      serveTimer: this.serveTimer > 0 ? +this.serveTimer.toFixed(1) : 0,
      lastHitById: this.lastHitById,
    };
  }
}

// ─── Room Manager ──────────────────────────────────────────
const rooms = new Map();
const skillTracker = new SkillTracker();

function getOrCreateRoom(roomName) {
  const fullId = ROOM_PREFIX + roomName;
  if (!rooms.has(fullId)) {
    const room = new GameRoom(fullId);
    room.botManager = new G2BotManager(room, skillTracker);
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
  res.sendFile(path.join(__dirname, 'G2_client.html'));
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
      socket.emit('connected', {
        playerId: socket.id,
        roomId: fullId,
        gameState: room.state,
        reconnected: true,
        side: player.side,
        paddleIndex: player.paddleIndex,
      });
      io.to(fullId).emit('game-state', room.getState());
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

    socket.emit('connected', {
      playerId: socket.id,
      roomId: room.id,
      gameState: room.state,
      reconnected: false,
      side: player.side,
      paddleIndex: player.paddleIndex,
    });

    io.to(room.id).emit('game-state', room.getState());

    // Bot fill
    if (room.botManager) room.botManager.registerHuman(socket.id);
  });

  socket.on('input', (data) => {
    if (!currentRoom || !data) return;
    currentRoom.handleInput(currentPlayerId, data);
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      currentRoom.handleDisconnect(currentPlayerId);
      io.to(currentRoom.id).emit('game-state', currentRoom.getState());
      if (currentRoom.botManager) {
        currentRoom.botManager.unregisterPlayer(currentPlayerId);
        currentRoom.botManager.scheduleBotFill();
      }
    }
  });
});

// ─── Game Loop (30 Hz) ─────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.botManager) room.botManager.update(now);
    room.update();

    if (room.state === 'waiting') {
      io.to(room.id).emit('game-state', room.getState());
    } else if (room.state === 'playing') {
      io.to(room.id).emit('game-state', room.getState());
    } else if (room.state === 'ended') {
      io.to(room.id).emit('game-state', room.getState());
      if (!room._notified) {
        room._notified = true;
        const winnerSide = room.winner === 0 ? 'left' : 'right';
        const winnerPlayer = [...room.players.values()].find(p => p.side === winnerSide);
        io.to(room.id).emit('game-over', {
          winner: room.winner,
          winnerName: winnerPlayer ? winnerPlayer.username : 'Team ' + (room.winner === 0 ? 'Left' : 'Right'),
          scores: room.scores,
        });
      }
    }
  }
}, TICK_MS);

// ─── Start ─────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     NEON TENNIS  —  G2 Server           ║');
  console.log('║     http://localhost:' + String(PORT).padEnd(5) + '                    ║');
  console.log('║     Room prefix: ' + ROOM_PREFIX + '                    ║');
  console.log('║     1v1 / 2v2 Neon Pong/Tennis          ║');
  console.log('╚══════════════════════════════════════════╝');
});
