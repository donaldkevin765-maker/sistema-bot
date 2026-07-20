// ============================================================
// NEON CONQUEST — G1_ Game Server
// Node.js + Socket.io — 2v2 Capture Point Arena
// ============================================================
// Quality targets:
//  1. ObjectPooler for projectiles (zero GC during gameplay)
//  2. Minimal netcode (only input state, never game state dumps)
//  3. Client-side prediction supported (server sends authoritative)
//  4. Room isolation via G1_ prefix
//  5. 30-second reconnect window after disconnect/refresh
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { G1BotManager, SkillTracker } = require('./G1_bot.js');

// ─── Constants ───────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const TICK_RATE = 30;                       // server ticks per second
const TICK_MS = 1000 / TICK_RATE;
const ROOM_PREFIX = 'G1_';
const ARENA_W = 900;
const ARENA_H = 600;
const MAX_PLAYERS = 4;
const RECONNECT_SEC = 30;
const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 160;                   // px/s
const MAX_HP = 100;
const HP_REGEN_RATE = 5;                    // hp/s
const HP_REGEN_DELAY = 2;                   // seconds after damage
const ATK_COOLDOWN = 0.5;                   // seconds
const PROJ_SPEED = 350;                     // px/s
const PROJ_RADIUS = 5;
const PROJ_LIFETIME = 1.5;                  // seconds
const PROJ_DAMAGE = 10;
const CAPTURE_RADIUS = 55;
const CAPTURE_TIME = 3;                     // seconds alone
const CAPTURE_TEAM_BONUS = 1.5;             // multiplier with teammate
const SCORE_INTERVAL = 3;                   // seconds between point awards
const WIN_SCORE = 30;
const RESPAWN_TIME = 3;                     // seconds

// ─── Object Pooler ──────────────────────────────────────────
// Pre-allocates objects so runtime never calls `new` during gameplay.
// Active flag marks in-use entries; inactive ones are reused.
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

  release(obj) {
    if (obj) obj._active = false;
  }

  releaseAll() {
    for (const obj of this._pool) obj._active = false;
  }

  each(fn) {
    for (const obj of this._pool) {
      if (obj._active) fn(obj);
    }
  }
}

// ─── Projectile factory ─────────────────────────────────────
function createProjectile() {
  return {
    x: 0, y: 0,
    vx: 0, vy: 0,
    ownerId: null,
    team: -1,
    lifetime: 0,
    _active: false,
  };
}

// ─── Game Room ──────────────────────────────────────────────
// One room per game session. Rooms never share state.
class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();         // playerId → player object
    this.projectiles = new ObjectPooler(createProjectile, 80);
    this.capturePoints = [
      { x: 450, y: 300, progress: 0, owner: -1 },  // center
      { x: 240, y: 180, progress: 0, owner: -1 },  // top-left
      { x: 660, y: 420, progress: 0, owner: -1 },  // bottom-right
    ];
    this.scores = [0, 0];
    this.state = 'waiting';           // waiting | playing | ended
    this.scoreTimer = 0;
    this.teamCounts = [0, 0];
    this.winner = -1;
    this._endedAt = 0;
    this._startTimer = null;
    this.maxPlayers = MAX_PLAYERS;
    this.botManager = null;
    this._playerSurvivalStart = new Map(); // playerId → start time (for skill tracking)
    // Reconnect map: oldPlayerId → { player, timer } for cleanup
    this._disconnectedTimers = new Map();
  }

  // ── Player management ──

  addPlayer(id, username, isBot = false) {
    // Return existing player if already in room (duplicate join guard)
    if (this.players.has(id)) return this.players.get(id);

    if (this.players.size >= MAX_PLAYERS) return null;

    // Auto-balance: assign to smaller team
    const team = this.teamCounts[0] <= this.teamCounts[1] ? 0 : 1;
    this.teamCounts[team]++;

    const spawnX = team === 0 ? 80 : ARENA_W - 80;
    const offsetY = (this.teamCounts[team] - 1) * 60 - 30;

    const player = {
      id,
      username,
      team,
      x: spawnX,
      y: 300 + offsetY,
      aimX: spawnX,
      aimY: 300,
      hp: MAX_HP,
      maxHp: MAX_HP,
      alive: true,
      respawnTimer: 0,
      lastDmgTime: 0,
      lastAttackTime: 0,
      disconnected: false,
      disconnectTimer: 0,
      isBot,
    };

    this.players.set(id, player);

    return player;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.teamCounts[p.team] = Math.max(0, this.teamCounts[p.team] - 1);
    this.players.delete(id);
    this._disconnectedTimers.delete(id);

    // Check if remaining team has no players → forfeit
    if (this.state === 'playing') {
      const alive0 = [...this.players.values()].filter(pp => pp.team === 0 && !pp.disconnected).length;
      const alive1 = [...this.players.values()].filter(pp => pp.team === 1 && !pp.disconnected).length;
      if (alive0 === 0) this._endGame(1);
      else if (alive1 === 0) this._endGame(0);
    }

    // Notify bot manager (solo per umani — i bot si auto-gestiscono)
    if (this.botManager && p && !p.isBot) {
      this.botManager.unregisterPlayer(id);
    }
  }

  handleDisconnect(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.isBot) {
      // Bots disconnect immediately, no reconnect window
      this.removePlayer(id);
      return;
    }
    p.disconnected = true;
    p.disconnectTimer = RECONNECT_SEC;
    this._disconnectedTimers.set(id, RECONNECT_SEC);
  }

  handleReconnect(newId, oldId) {
    const p = this.players.get(oldId);
    if (!p || !p.disconnected) return null;

    // Reassign the socket id to the player
    p.id = newId;
    p.disconnected = false;
    p.disconnectTimer = 0;
    this.players.delete(oldId);
    this.players.set(newId, p);
    this._disconnectedTimers.delete(oldId);
    return p;
  }

  startIfReady() {
    if (this.state !== 'waiting') return;
    if (this.players.size < 2) return;

    // Avvia solo se tutti gli slot hanno un giocatore (umano + bot)
    // oppure se sono passati 3 secondi da quando l'ultimo umano si è unito
    if (this.players.size >= this.maxPlayers || this._forceStartReady) {
      if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null; }
      this._startGame();
    } else if (!this._startTimer) {
      // Timer di sicurezza: dopo 8 secondi parte comunque se ci sono almeno 2 giocatori
      this._startTimer = setTimeout(() => {
        this._startTimer = null;
        if (this.state === 'waiting' && this.players.size >= 2) {
          this._startGame();
        }
      }, 8000);
    }
  }

  // ── Input ──

  handleInput(id, data) {
    const p = this.players.get(id);
    if (!p || !p.alive || p.disconnected) return;

    // Movement (authoritative every tick)
    let dx = 0, dy = 0;
    if (data.w) dy -= 1;
    if (data.s) dy += 1;
    if (data.a) dx -= 1;
    if (data.d) dx += 1;
    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

    const step = PLAYER_SPEED / TICK_RATE;
    p.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_W - PLAYER_RADIUS, p.x + dx * step));
    p.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_H - PLAYER_RADIUS, p.y + dy * step));
    p.aimX = data.mx != null ? data.mx : p.aimX;
    p.aimY = data.my != null ? data.my : p.aimY;

    // Attack
    if (data.shoot) {
      const now = Date.now();
      if (now - p.lastAttackTime >= ATK_COOLDOWN * 1000) {
        p.lastAttackTime = now;
        // Track shots fired per giocatori umani
        if (!p.isBot) skillTracker.recordEvent(p.id, 'shot');
        const angle = Math.atan2(p.aimY - p.y, p.aimX - p.x);
        const b = this.projectiles.get();
        b.x = p.x + Math.cos(angle) * PLAYER_RADIUS;
        b.y = p.y + Math.sin(angle) * PLAYER_RADIUS;
        b.vx = Math.cos(angle) * PROJ_SPEED;
        b.vy = Math.sin(angle) * PROJ_SPEED;
        b.ownerId = id;
        b.team = p.team;
        b.lifetime = PROJ_LIFETIME;
      }
    }
  }

  // ── Game loop ──

  _startGame() {
    this.state = 'playing';
    this.scores = [0, 0];
    this.scoreTimer = 0;
    this.capturePoints.forEach(cp => { cp.progress = 0; cp.owner = -1; });
    this.projectiles.releaseAll();
    let idx0 = 0, idx1 = 0;
    const now = Date.now();
    this.players.forEach(p => {
      p.hp = MAX_HP;
      p.alive = true;
      p.respawnTimer = 0;
      p.lastDmgTime = 0;
      p.lastAttackTime = 0;
      if (p.team === 0) {
        p.x = 80 + idx0 * 40;
        p.y = 250 + idx0 * 60;
        idx0++;
      } else {
        p.x = ARENA_W - 80 - idx1 * 40;
        p.y = 250 + idx1 * 60;
        idx1++;
      }
      // Track survival start
      this._playerSurvivalStart.set(p.id, now);
    });
    // Ricalibra bot all'inizio della partita
    if (this.botManager) this.botManager.recalibrate();
  }

  _endGame(team) {
    this.state = 'ended';
    this.winner = team;
    this._endedAt = Date.now();

    // Skill tracking per giocatori umani
    const now = Date.now();
    this.players.forEach(p => {
      if (p.isBot) return;
      const start = this._playerSurvivalStart.get(p.id);
      const survivalTime = start ? (now - start) / 1000 : 0;
      skillTracker.recordEvent(p.id, 'game_end', { survivalTime });
    });
    this._playerSurvivalStart.clear();

    // Ricalibra bot dopo la partita
    if (this.botManager) this.botManager.recalibrate();

    // Dopo 3 secondi, rimuovi bot e resetta la stanza per nuove partite
    setTimeout(() => {
      if (this.state !== 'ended') return;
      if (this.botManager) this.botManager.clear();
      // Pulisci timer pendenti
      if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null; }
      // Resetta la stanza per nuove partite
      this.state = 'waiting';
      this.scores = [0, 0];
      this.winner = -1;
      this._notified = false;
      this._endedAt = 0;
      this._forceStartReady = false;
      this.projectiles.releaseAll();
      console.log(`[G1] Room ${this.id} reset to waiting`);
    }, 3000);
  }

  _checkWinCondition() {
    // Score threshold
    if (this.scores[0] >= WIN_SCORE) { this._endGame(0); return; }
    if (this.scores[1] >= WIN_SCORE) { this._endGame(1); return; }

    // Team wipe check (no players left on one team)
    const alive0 = [...this.players.values()].filter(p => p.team === 0 && !p.disconnected).length;
    const alive1 = [...this.players.values()].filter(p => p.team === 1 && !p.disconnected).length;
    if (alive0 === 0 && this.scores[1] > this.scores[0]) { this._endGame(1); }
    else if (alive1 === 0 && this.scores[0] > this.scores[1]) { this._endGame(0); }
  }

  update() {
    if (this.state !== 'playing') return;
    const dt = 1 / TICK_RATE;

    // ── Disconnect cleanup ──
    for (const [oldId, timer] of this._disconnectedTimers) {
      const remaining = timer - dt;
      if (remaining <= 0) {
        this.removePlayer(oldId);
      } else {
        this._disconnectedTimers.set(oldId, remaining);
        // Also update the player's own timer
        const p = this.players.get(oldId);
        if (p) p.disconnectTimer = remaining;
      }
    }

    // ── Projectiles ──
    this.projectiles.each(b => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.lifetime -= dt;

      // Out of bounds / expired
      if (b.lifetime <= 0 || b.x < -60 || b.x > ARENA_W + 60 || b.y < -60 || b.y > ARENA_H + 60) {
        this.projectiles.release(b);
        return;
      }

      // Collision with players
      for (const p of this.players.values()) {
        if (!p.alive || p.disconnected || p.id === b.ownerId || p.team === b.team) continue;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        if (dx * dx + dy * dy < (PLAYER_RADIUS + PROJ_RADIUS) ** 2) {
          p.hp -= PROJ_DAMAGE;
          p.lastDmgTime = Date.now() / 1000;

          // Skill tracking: chi ha sparato ha colpito
          const shooter = this.players.get(b.ownerId);
          if (shooter && !shooter.isBot) {
            skillTracker.recordEvent(shooter.id, 'hit', { damage: PROJ_DAMAGE });
          }
          // Track damage subito (se umano)
          if (!p.isBot) {
            skillTracker.recordEvent(p.id, 'damage_taken', { damage: PROJ_DAMAGE });
          }

          this.projectiles.release(b);
          if (p.hp <= 0) {
            p.hp = 0;
            p.alive = false;
            p.respawnTimer = RESPAWN_TIME;
            // Skill tracking kill
            if (shooter && !shooter.isBot) {
              skillTracker.recordEvent(shooter.id, 'kill');
            }
            if (!p.isBot) {
              skillTracker.recordEvent(p.id, 'death');
            }
          }
          return; // projectile consumed
        }
      }
    });

    // ── Respawn ──
    this.players.forEach(p => {
      if (!p.alive && p.respawnTimer > 0) {
        p.respawnTimer = Math.max(0, p.respawnTimer - dt);
        if (p.respawnTimer <= 0) {
          p.alive = true;
          p.hp = MAX_HP;
          const baseX = p.team === 0 ? 80 : ARENA_W - 80;
          p.x = baseX + (Math.random() - 0.5) * 80;
          p.y = 250 + (Math.random() - 0.5) * 120;
          p.lastDmgTime = Date.now() / 1000;
        }
      }
    });

    // ── HP Regen ──
    const now = Date.now() / 1000;
    this.players.forEach(p => {
      if (p.alive && p.hp < MAX_HP && (now - p.lastDmgTime) > HP_REGEN_DELAY) {
        p.hp = Math.min(MAX_HP, p.hp + HP_REGEN_RATE * dt);
      }
    });

    // ── Capture points ──
    for (const cp of this.capturePoints) {
      let near0 = 0, near1 = 0;
      this.players.forEach(p => {
        if (!p.alive || p.disconnected) return;
        const dx = p.x - cp.x;
        const dy = p.y - cp.y;
        if (dx * dx + dy * dy < CAPTURE_RADIUS * CAPTURE_RADIUS) {
          if (p.team === 0) near0++;
          else near1++;
        }
      });

      // Contested → no progress
      if (near0 > 0 && near1 > 0) continue;

      // Team 0 capturing
      if (near0 > 0) {
        if (cp.owner === 0) continue;
        const speed = (near0 >= 2 ? CAPTURE_TEAM_BONUS : 1) / CAPTURE_TIME;
        if (cp.owner === 1) {
          cp.progress = Math.max(0, cp.progress - speed * dt);
          if (cp.progress <= 0) { cp.progress = 0; cp.owner = -1; }
        } else {
          cp.progress = Math.min(1, cp.progress + speed * dt);
          if (cp.progress >= 1) {
            cp.progress = 1; cp.owner = 0;
            // Track capture for nearby human players
            this.players.forEach(pp => {
              if (!pp.isBot) {
                const ddx = pp.x - cp.x, ddy = pp.y - cp.y;
                if (ddx * ddx + ddy * ddy < CAPTURE_RADIUS * CAPTURE_RADIUS) {
                  skillTracker.recordEvent(pp.id, 'capture');
                }
              }
            });
          }
        }
      }

      // Team 1 capturing
      if (near1 > 0) {
        if (cp.owner === 1) continue;
        const speed = (near1 >= 2 ? CAPTURE_TEAM_BONUS : 1) / CAPTURE_TIME;
        if (cp.owner === 0) {
          cp.progress = Math.max(0, cp.progress - speed * dt);
          if (cp.progress <= 0) { cp.progress = 0; cp.owner = -1; }
        } else {
          cp.progress = Math.min(1, cp.progress + speed * dt);
          if (cp.progress >= 1) {
            cp.progress = 1; cp.owner = 1;
            // Track capture for nearby human players
            this.players.forEach(pp => {
              if (!pp.isBot) {
                const ddx = pp.x - cp.x, ddy = pp.y - cp.y;
                if (ddx * ddx + ddy * ddy < CAPTURE_RADIUS * CAPTURE_RADIUS) {
                  skillTracker.recordEvent(pp.id, 'capture');
                }
              }
            });
          }
        }
      }
    }

    // ── Score ──
    this.scoreTimer += dt;
    if (this.scoreTimer >= SCORE_INTERVAL) {
      this.scoreTimer = 0;
      for (const cp of this.capturePoints) {
        if (cp.owner >= 0) this.scores[cp.owner]++;
      }
      this._checkWinCondition();
    }
  }

  // ── State serialisation (minimal payload) ──

  getState() {
    const players = [];
    this.players.forEach(p => {
      players.push({
        id: p.id,
        username: p.username,
        team: p.team,
        x: p.x | 0,
        y: p.y | 0,
        aimX: p.aimX | 0,
        aimY: p.aimY | 0,
        hp: p.hp | 0,
        maxHp: p.maxHp,
        alive: p.alive,
        disconnected: p.disconnected,
        isBot: !!p.isBot,
      });
    });

    const proj = [];
    this.projectiles.each(b => {
      proj.push({ x: b.x | 0, y: b.y | 0 });
    });

    return {
      type: 'state',
      roomId: this.id,
      gameState: this.state,
      players,
      proj,
      cp: this.capturePoints.map(c => ({
        x: c.x, y: c.y,
        owner: c.owner,
        progress: Math.round(c.progress * 100) / 100,
      })),
      scores: [this.scores[0], this.scores[1]],
      winner: this.winner,
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
    room.botManager = new G1BotManager(room, skillTracker);
    rooms.set(fullId, room);
  }
  return rooms.get(fullId);
}

// Clean up ended rooms after 60 seconds
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
  pingTimeout: 15000,     // detect dead sockets faster
  pingInterval: 5000,
});

// Serve client HTML
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'G1_client.html'));
});

// ─── Socket Events ─────────────────────────────────────────
io.on('connection', (socket) => {
  let currentRoom = null;

  // ── Reconnect (must be attempted before join) ──
  socket.on('reconnect-game', (data) => {
    if (!data || !data.playerId || !data.roomName) return;
    const fullId = ROOM_PREFIX + data.roomName;
    const room = rooms.get(fullId);
    if (!room) {
      socket.emit('reconnect-failed', { message: 'Room no longer exists' });
      return;
    }
    const player = room.handleReconnect(socket.id, data.playerId);
    if (player) {
      currentRoom = room;
      socket.join(fullId);
      socket.emit('connected', {
        playerId: socket.id,
        roomId: fullId,
        team: player.team,
        gameState: room.state,
        reconnected: true,
      });
      io.to(fullId).emit('game-state', room.getState());
    } else {
      socket.emit('reconnect-failed', { message: 'Reconnect expired or invalid ID' });
    }
  });

  // ── Join room ──
  socket.on('join', (data) => {
    if (!data || !data.username) {
      socket.emit('error', { message: 'Username required' });
      return;
    }
    if (!data.roomName) data.roomName = 'room1';
    const room = getOrCreateRoom(data.roomName);

    if (room.players.size >= MAX_PLAYERS) {
      socket.emit('error', { message: 'Room is full (max 4 players)' });
      return;
    }
    if (room.state !== 'waiting') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }

    const player = room.addPlayer(socket.id, data.username);
    if (!player) {
      socket.emit('error', { message: 'Could not join room' });
      return;
    }

    currentRoom = room;
    socket.join(room.id);

    socket.emit('connected', {
      playerId: socket.id,
      roomId: room.id,
      team: player.team,
      gameState: room.state,
      reconnected: false,
    });

    io.to(room.id).emit('game-state', room.getState());

    // Registra l'umano e riempi con bot
    if (room.botManager) {
      room.botManager.registerHuman(socket.id);
    }
  });

  // ── Input (lightweight: only keys + mouse + shoot) ──
  socket.on('input', (data) => {
    if (!currentRoom || !data) return;
    currentRoom.handleInput(socket.id, data);
  });

  // ── Disconnect ──
  socket.on('disconnect', (reason) => {
    if (currentRoom) {
      currentRoom.handleDisconnect(socket.id);
      io.to(currentRoom.id).emit('game-state', currentRoom.getState());
      if (currentRoom.botManager) {
        currentRoom.botManager.unregisterPlayer(socket.id);
        currentRoom.botManager.scheduleBotFill();
      }
    }
  });
});

// ─── Game Loop (30 Hz) ─────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    // Bot AI si attiva prima del game update
    if (room.botManager) {
      room.botManager.update(now);
    }

    room.update();

    if (room.state === 'playing') {
      io.to(room.id).emit('game-state', room.getState());
    } else if (room.state === 'ended') {
      // Send final state + game-over event once
      io.to(room.id).emit('game-state', room.getState());
      if (!room._notified) {
        room._notified = true;
        io.to(room.id).emit('game-over', {
          winner: room.winner,
          scores: room.scores,
        });
      }
    }
  }
}, TICK_MS);

// ─── Start ─────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     NEON CONQUEST  —  G1 Server         ║');
  console.log('║     http://localhost:' + String(PORT).padEnd(5) + '                    ║');
  console.log('║     Room prefix: ' + ROOM_PREFIX + '                    ║');
  console.log('╚══════════════════════════════════════════╝');
});
