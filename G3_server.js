// ============================================================
// QUANTUM GRID — G3_ Game Server
// Node.js + Socket.io — 4-Player FFA Grid Territory Capture
// ============================================================
// Quality targets:
//  1. ObjectPooler for capture effects
//  2. Minimal netcode (only input)
//  3. Client-side prediction supported
//  4. Room isolation via G3_ prefix
//  5. 30-second reconnect window
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────
const PORT = process.env.PORT || 3003;
const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const ROOM_PREFIX = 'G3_';
const ARENA_W = 900;
const ARENA_H = 600;
const MAX_PLAYERS = 4;
const RECONNECT_SEC = 30;

const COLS = 10;
const ROWS = 7;
const CELL_W = ARENA_W / COLS;   // 90
const CELL_H = ARENA_H / ROWS;   // ~85.7
const MOVE_COOLDOWN = 0.15;       // seconds between moves
const CAPTURE_TIME = 2.0;         // seconds to capture a neutral cell
const CONTEST_TIME = 1.0;         // seconds to neutralize enemy cell
const SCORE_INTERVAL = 2.0;       // seconds between point awards
const WIN_SCORE = 50;

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

// ─── Particle factory ───────────────────────────────────────
function createParticle() {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '', _active: false };
}

// ─── Player colors ─────────────────────────────────────────
const PLAYER_COLORS = ['#00ccff', '#ff66cc', '#ffcc00', '#44ff88'];
const PLAYER_NAMES = ['Cyan', 'Pink', 'Gold', 'Green'];

// ─── Grid cell ──────────────────────────────────────────────
function createCell(col, row) {
  return { col, row, owner: -1, progress: 0, capturing: false };
}

// ─── Game Room ──────────────────────────────────────────────
class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.particles = new ObjectPooler(createParticle, 80);
    this.state = 'waiting';
    this.scores = [0, 0, 0, 0];
    this.winner = -1;
    this._endedAt = 0;
    this._disconnectedTimers = new Map();
    this._startTimer = null;

    // Grid
    this.grid = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.grid.push(createCell(c, r));
      }
    }

    this.scoreTimer = 0;
  }

  _cellIndex(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1;
    return row * COLS + col;
  }

  _getCell(col, row) {
    const idx = this._cellIndex(col, row);
    return idx >= 0 ? this.grid[idx] : null;
  }

  _getCellAtPixel(x, y) {
    const col = Math.floor(x / CELL_W);
    const row = Math.floor(y / CELL_H);
    return this._getCell(col, row);
  }

  _randomSpawn() {
    // Spawn at corners
    const corners = [
      { col: 0, row: 0 },
      { col: COLS - 1, row: 0 },
      { col: 0, row: ROWS - 1 },
      { col: COLS - 1, row: ROWS - 1 },
    ];
    const idx = this.players.size % corners.length;
    return { ...corners[idx] };
  }

  // ── Player management ──

  addPlayer(id, username) {
    if (this.players.has(id)) return this.players.get(id);
    if (this.players.size >= MAX_PLAYERS) return null;

    const spawn = this._randomSpawn();
    const playerIndex = this.players.size;
    const player = {
      id,
      username,
      col: spawn.col,
      row: spawn.row,
      targetCol: spawn.col,
      targetRow: spawn.row,
      color: PLAYER_COLORS[playerIndex],
      playerIndex,
      moveTimer: 0,
      disconnected: false,
      disconnectTimer: 0,
    };

    this.players.set(id, player);

    // Claim spawn cell
    const cell = this._getCell(spawn.col, spawn.row);
    if (cell) { cell.owner = playerIndex; cell.progress = 1; }

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
    const p = this.players.get(id);
    if (!p) return;
    // Release owned cells
    for (const cell of this.grid) {
      if (cell.owner === p.playerIndex) {
        cell.owner = -1;
        cell.progress = 0;
      }
    }
    this.players.delete(id);
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

  // ── Input / Movement ──

  handleInput(id, data) {
    const p = this.players.get(id);
    if (!p || p.disconnected) return;
    if (this.state !== 'playing') return;

    const now = Date.now() / 1000;
    if (now - p.moveTimer < MOVE_COOLDOWN) return;

    let dc = 0, dr = 0;
    if (data.up) dr -= 1;
    if (data.down) dr += 1;
    if (data.left) dc -= 1;
    if (data.right) dc += 1;
    if (dc === 0 && dr === 0) return;

    const nc = p.col + dc;
    const nr = p.row + dr;
    const cell = this._getCell(nc, nr);
    if (!cell) return;

    // Move
    p.col = nc;
    p.row = nr;
    p.targetCol = nc;
    p.targetRow = nr;
    p.moveTimer = now;
  }

  // ── Game lifecycle ──

  _startGame() {
    this.state = 'playing';
    this.scores = [0, 0, 0, 0];
    this.particles.releaseAll();
    this.scoreTimer = 0;
    this.winner = -1;

    // Reset grid
    for (const cell of this.grid) {
      cell.owner = -1;
      cell.progress = 0;
    }

    // Re-assign spawn cells
    this.players.forEach(p => {
      const cell = this._getCell(p.col, p.row);
      if (cell) { cell.owner = p.playerIndex; cell.progress = 1; }
    });
  }

  _endGame(playerIndex) {
    this.state = 'ended';
    this.winner = playerIndex;
    this._endedAt = Date.now();
  }

  _checkWinCondition() {
    for (let i = 0; i < this.players.size; i++) {
      if (this.scores[i] >= WIN_SCORE) {
        this._endGame(i);
        return;
      }
    }

    // Check if only one player remains
    const alive = [...this.players.values()].filter(p => !p.disconnected).length;
    if (alive <= 1 && this.players.size > 0) {
      const remaining = [...this.players.values()].find(p => !p.disconnected);
      if (remaining && this.scores[remaining.playerIndex] > 0) {
        this._endGame(remaining.playerIndex);
      }
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

    // ── Cell capture ──
    // Track which cells have how many players on them
    const cellPlayerCount = {};
    for (const cell of this.grid) {
      cellPlayerCount[cell.col + ',' + cell.row] = { owners: new Set(), players: [] };
    }

    this.players.forEach(p => {
      if (p.disconnected) return;
      const key = p.col + ',' + p.row;
      if (cellPlayerCount[key]) {
        for (const other of this.players.values()) {
          if (other.disconnected) continue;
          if (other.col === p.col && other.row === p.row) {
            cellPlayerCount[key].owners.add(other.playerIndex);
            if (!cellPlayerCount[key].players.includes(other.playerIndex)) {
              cellPlayerCount[key].players.push(other.playerIndex);
            }
          }
        }
      }
    });

    // Update each cell
    for (const cell of this.grid) {
      const key = cell.col + ',' + cell.row;
      const info = cellPlayerCount[key];
      if (!info || info.players.length === 0) {
        // No one on this cell
        if (cell.capturing) {
          cell.progress = Math.max(0, cell.progress - dt * 0.5);
          if (cell.progress <= 0) { cell.progress = 0; cell.owner = -1; cell.capturing = false; }
        }
        continue;
      }

      // Multiple players on same cell → contested (no capture)
      if (info.owners.size > 1) continue;

      const occupant = info.players[0];

      if (cell.owner === occupant) {
        // Already owned by this player
        cell.progress = Math.min(1, cell.progress + dt * 0.3);
        cell.capturing = false;
      } else if (cell.owner === -1) {
        // Neutral cell → capture
        cell.capturing = true;
        cell.progress = Math.min(1, cell.progress + dt / CAPTURE_TIME);
        if (cell.progress >= 1) {
          cell.owner = occupant;
          cell.progress = 1;
          cell.capturing = false;
          // Spawn particles
          const cx = cell.col * CELL_W + CELL_W / 2;
          const cy = cell.row * CELL_H + CELL_H / 2;
          for (let i = 0; i < 10; i++) {
            const pt = this.particles.get();
            pt.x = cx;
            pt.y = cy;
            const ang = Math.random() * Math.PI * 2;
            const spd = 20 + Math.random() * 60;
            pt.vx = Math.cos(ang) * spd;
            pt.vy = Math.sin(ang) * spd;
            pt.life = 0.3 + Math.random() * 0.2;
            pt.maxLife = pt.life;
            pt.color = PLAYER_COLORS[occupant] || '#fff';
          }
        }
      } else {
        // Enemy cell → contest
        cell.capturing = true;
        cell.progress = Math.max(0, cell.progress - dt / CONTEST_TIME);
        if (cell.progress <= 0) {
          cell.owner = -1;
          cell.progress = 0;
          cell.capturing = false;
        }
      }
    }

    // ── Scoring ──
    this.scoreTimer += dt;
    if (this.scoreTimer >= SCORE_INTERVAL) {
      this.scoreTimer = 0;
      const ownedCount = [0, 0, 0, 0];
      for (const cell of this.grid) {
        if (cell.owner >= 0) ownedCount[cell.owner]++;
      }
      for (let i = 0; i < this.players.size; i++) {
        // Points = owned cells (capped at 6 per interval for balance)
        this.scores[i] += Math.min(6, ownedCount[i]);
      }
      this._checkWinCondition();
    }

    // ── Particle update ──
    this.particles.each(pt => {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      if (pt.life <= 0) this.particles.release(pt);
    });
  }

  // ── State serialisation ──

  getState() {
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r * COLS + c];
        cells.push({
          c, r,
          owner: cell.owner,
          progress: Math.round(cell.progress * 100) / 100,
        });
      }
    }

    const players = [];
    this.players.forEach(p => {
      players.push({
        id: p.id,
        username: p.username,
        col: p.col,
        row: p.row,
        color: p.color,
        playerIndex: p.playerIndex,
        disconnected: p.disconnected,
      });
    });

    const particles = [];
    this.particles.each(pt => {
      particles.push({
        x: pt.x | 0, y: pt.y | 0,
        life: +(pt.life / pt.maxLife).toFixed(2),
        color: pt.color,
      });
    });

    return {
      type: 'state',
      roomId: this.id,
      gameState: this.state,
      cells,
      players,
      scores: [...this.scores],
      particles,
      winner: this.winner,
    };
  }
}

// ─── Room Manager ──────────────────────────────────────────
const rooms = new Map();

function getOrCreateRoom(roomName) {
  const fullId = ROOM_PREFIX + roomName;
  if (!rooms.has(fullId)) {
    rooms.set(fullId, new GameRoom(fullId));
  }
  return rooms.get(fullId);
}

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
  res.sendFile(path.join(__dirname, 'G3_client.html'));
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
        playerIndex: player.playerIndex,
        col: player.col,
        row: player.row,
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
      playerIndex: player.playerIndex,
      col: player.col,
      row: player.row,
    });

    io.to(room.id).emit('game-state', room.getState());
  });

  socket.on('input', (data) => {
    if (!currentRoom || !data) return;
    currentRoom.handleInput(currentPlayerId, data);
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      currentRoom.handleDisconnect(currentPlayerId);
      io.to(currentRoom.id).emit('game-state', currentRoom.getState());
    }
  });
});

// ─── Game Loop (20 Hz) ─────────────────────────────────────
setInterval(() => {
  for (const room of rooms.values()) {
    room.update();

    if (room.state === 'waiting') {
      io.to(room.id).emit('game-state', room.getState());
    } else if (room.state === 'playing') {
      io.to(room.id).emit('game-state', room.getState());
    } else if (room.state === 'ended') {
      io.to(room.id).emit('game-state', room.getState());
      if (!room._notified) {
        room._notified = true;
        const winnerName = room.winner >= 0 && room.players.size > room.winner
          ? [...room.players.values()].find(p => p.playerIndex === room.winner)?.username
          : ('Player ' + room.winner);
        io.to(room.id).emit('game-over', {
          winner: room.winner,
          winnerName: winnerName || 'Unknown',
          scores: room.scores,
        });
      }
    }
  }
}, TICK_MS);

// ─── Start ─────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     QUANTUM GRID  —  G3 Server          ║');
  console.log('║     http://localhost:' + String(PORT).padEnd(5) + '                    ║');
  console.log('║     Room prefix: ' + ROOM_PREFIX + '                    ║');
  console.log('║     4-Player FFA Grid Territory          ║');
  console.log('╚══════════════════════════════════════════╝');
});
