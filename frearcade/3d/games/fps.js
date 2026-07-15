/**
 * Echo Point — FPS Arena Shooter
 *
 * 3D first-person shooter with wave-based combat, multiple weapons,
 * enemy AI, upgrade system, and full game feel (screen shake, particles, sound).
 *
 * Architecture: This game module follows the FreeArcade3D game interface:
 *   init(engine), update(dt, input), render3D(), render2D(ctx), destroy()
 *
 * @license MIT
 * @version 1.0.0
 */

(function () {
  'use strict';

  var E = null; // engine reference
  var THREE = null;

  // ── State ──
  var state = 'ready'; // ready | playing | paused | gameover | waveComplete
  var score = 0;
  var wave = 0;
  var health = 100;
  var maxHealth = 100;
  var shield = 0;
  var maxShield = 50;
  var ammo = { pistol: Infinity, rifle: 120, shotgun: 24 };
  var maxAmmo = { pistol: Infinity, rifle: 120, shotgun: 24 };
  var currentWeapon = 'pistol';
  var kills = 0;
  var headshots = 0;
  var accuracy = { hits: 0, shots: 0 };
  var coins = 0;
  var playTime = 0;

  // ── Weapons config ──
  var weapons = {
    pistol: { name: 'Pistol', damage: 15, fireRate: 0.25, spread: 0.03, ammoPerShot: 0, reloadTime: 0.8, color: 0xffaa00, auto: false, pellets: 1 },
    rifle: { name: 'Assault Rifle', damage: 10, fireRate: 0.1, spread: 0.05, ammoPerShot: 1, reloadTime: 1.5, color: 0x44aaff, auto: true, pellets: 1 },
    shotgun: { name: 'Shotgun', damage: 8, fireRate: 0.7, spread: 0.15, ammoPerShot: 1, reloadTime: 2.0, color: 0xff4444, auto: false, pellets: 8 },
  };
  var weaponList = ['pistol', 'rifle', 'shotgun'];
  var weaponIndex = 0;

  // ── Timers ──
  var fireTimer = 0;
  var reloadTimer = 0;
  var isReloading = false;
  var damageFlash = 0;
  var killFeed = [];
  var comboCount = 0;
  var comboTimer = 0;
  var waveEnemyCount = 0;
  var enemiesAlive = 0;
  var enemiesKilledThisWave = 0;
  var waveDelay = 0;
  var bossWave = false;

  // ── 3D Objects ──
  var player = null; // { cam, body, height, radius }
  var ground = null;
  var arena = null;
  var enemies = [];
  var bullets = [];
  var pickups = [];
  var decals = []; // bullet marks
  var muzzleFlash = null;
  var crosshair = null;
  var weaponModel = null;

  // ── Particles ──
  var sparkSystem = null;
  var bloodSystem = null;
  var explosionSystem = null;

  // ── Enemies ──
  var enemyTypes = {
    grunt: { hp: 30, speed: 4, damage: 8, score: 100, color: 0xff4444, size: 0.8 },
    heavy: { hp: 80, speed: 2.5, damage: 15, score: 250, color: 0xff8800, size: 1.2 },
    fast: { hp: 15, speed: 7, damage: 5, score: 150, color: 0xff44ff, size: 0.6 },
    sniper: { hp: 20, speed: 1.5, damage: 25, score: 200, color: 0x44ff44, size: 0.7 },
  };
  var enemySpawnPositions = [];

  // ── Config ──
  var ARENA_SIZE = 40;
  var WALL_HEIGHT = 12;
  var PLAYER_HEIGHT = 1.7;
  var PLAYER_RADIUS = 0.3;
  var PLAYER_SPEED = 8;
  var SPRINT_SPEED = 12;
  var MOUSE_SENSITIVITY = 0.002;

  // ──────────────────────────────────────────────
  // INIT
  // ──────────────────────────────────────────────

  function init(engine) {
    E = engine;
    THREE = engine.THREE;
    if (!THREE) { console.error('Three.js not available'); return; }

    resetState();
    buildArena();
    buildPlayer();
    buildWeaponModel();
    buildParticles();
    buildHUD();
    buildSpawnPositions();
    setupEnemyPool();

    state = 'ready';
    E.emit('gameReady', { name: 'Echo Point' });
  }

  function resetState() {
    score = 0; wave = 0; health = 100; shield = 0;
    kills = 0; headshots = 0; coins = 0; playTime = 0;
    ammo = { pistol: Infinity, rifle: 120, shotgun: 24 };
    currentWeapon = 'pistol'; weaponIndex = 0;
    fireTimer = 0; reloadTimer = 0; isReloading = false;
    damageFlash = 0; killFeed = []; comboCount = 0; comboTimer = 0;
    waveEnemyCount = 0; enemiesAlive = 0; enemiesKilledThisWave = 0;
    waveDelay = 0; bossWave = false;
    enemies = []; bullets = []; pickups = []; decals = [];
    accuracy = { hits: 0, shots: 0 };
  }

  // ──────────────────────────────────────────────
  // ARENA
  // ──────────────────────────────────────────────

  function buildArena() {
    // Clear old arena
    if (arena) {
      E.scene.remove(arena);
    }

    arena = new THREE.Group();
    var S = ARENA_SIZE;
    var H = WALL_HEIGHT;

    // Floor
    var floorGeo = new THREE.PlaneGeometry(S * 2, S * 2);
    var floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
      metalness: 0.1,
    });
    ground = new THREE.Mesh(floorGeo, floorMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    arena.add(ground);

    // Grid pattern on floor
    var gridHelper = new THREE.GridHelper(S * 2, 20, 0x333366, 0x222244);
    gridHelper.position.y = 0.01;
    arena.add(gridHelper);

    // Walls with material
    var wallMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a4a,
      roughness: 0.7,
      metalness: 0.3,
    });

    var wallPositions = [
      { x: 0, y: H / 2, z: -S, ry: 0 },
      { x: 0, y: H / 2, z: S, ry: 0 },
      { x: -S, y: H / 2, z: 0, ry: Math.PI / 2 },
      { x: S, y: H / 2, z: 0, ry: Math.PI / 2 },
    ];

    for (var i = 0; i < wallPositions.length; i++) {
      var w = wallPositions[i];
      var wall = new THREE.Mesh(new THREE.BoxGeometry(S * 2, H, 1), wallMat);
      wall.position.set(w.x, w.y, w.z);
      wall.rotation.y = w.ry;
      wall.castShadow = true;
      wall.receiveShadow = true;
      arena.add(wall);

      // Neon trim on walls
      var trim = new THREE.Mesh(
        new THREE.BoxGeometry(S * 2 - 1, 0.1, 1.1),
        new THREE.MeshBasicMaterial({ color: 0x4466ff })
      );
      trim.position.set(w.x, 0.3, w.z);
      trim.rotation.y = w.ry;
      arena.add(trim);

      var trim2 = new THREE.Mesh(
        new THREE.BoxGeometry(S * 2 - 1, 0.1, 1.1),
        new THREE.MeshBasicMaterial({ color: 0x4466ff })
      );
      trim2.position.set(w.x, H - 0.3, w.z);
      trim2.rotation.y = w.ry;
      arena.add(trim2);
    }

    // Central pillar
    var pillarMat = new THREE.MeshStandardMaterial({
      color: 0x334466,
      roughness: 0.5,
      metalness: 0.6,
    });
    var pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, H * 0.6, 8), pillarMat);
    pillar.position.set(0, H * 0.3, 0);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    arena.add(pillar);

    // Obstacles (cover)
    var coverMat = new THREE.MeshStandardMaterial({ color: 0x3a3a5a, roughness: 0.8 });
    var coverPositions = [
      { x: -8, z: -5, w: 3, h: 2, d: 1 },
      { x: 10, z: 7, w: 2, h: 1.5, d: 2 },
      { x: -5, z: 12, w: 4, h: 1.2, d: 1 },
      { x: 7, z: -10, w: 1.5, h: 2.5, d: 1.5 },
      { x: -12, z: -8, w: 2, h: 1, d: 3 },
      { x: 14, z: -3, w: 3, h: 2, d: 1 },
      { x: -3, z: -14, w: 1, h: 3, d: 1 },
    ];
    for (var ci = 0; ci < coverPositions.length; ci++) {
      var c = coverPositions[ci];
      var cover = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), coverMat);
      cover.position.set(c.x, c.h / 2, c.z);
      cover.castShadow = true;
      cover.receiveShadow = true;
      arena.add(cover);
    }

    // Neon ambient lights
    var colors = [0x4466ff, 0xff44aa, 0x44ffaa, 0xffaa44];
    var lightPos = [
      { x: -S + 2, z: -S + 2 }, { x: S - 2, z: -S + 2 },
      { x: -S + 2, z: S - 2 }, { x: S - 2, z: S - 2 },
    ];
    for (var li = 0; li < lightPos.length; li++) {
      var lp = lightPos[li];
      var light = new THREE.PointLight(colors[li], 0.5, 15);
      light.position.set(lp.x, H - 1, lp.z);
      arena.add(light);

      // Light fixture
      var fix = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshBasicMaterial({ color: colors[li] })
      );
      fix.position.copy(light.position);
      arena.add(fix);
    }

    E.scene.add(arena);
  }

  // ──────────────────────────────────────────────
  // PLAYER
  // ──────────────────────────────────────────────

  function buildPlayer() {
    // Camera is attached to a pivot for head bobbing
    player = {
      cam: E.camera,
      pivot: new THREE.Object3D(),
      body: new THREE.Object3D(),
      height: PLAYER_HEIGHT,
      radius: PLAYER_RADIUS,
      yaw: 0,
      pitch: 0,
      velocity: { x: 0, z: 0 },
      grounded: true,
      sprinting: false,
      bobPhase: 0,
    };

    // Player body (invisible, for collisions)
    E.camera.position.set(0, PLAYER_HEIGHT, 0);
    E.camera.rotation.set(0, 0, 0);

    // Weapon bob parent
    var wp = new THREE.Object3D();
    wp.position.set(0.3, -0.2, -0.5);
    E.camera.add(wp);
    player.weaponPivot = wp;
  }

  function buildWeaponModel() {
    // Simple weapon model (a shape representing current weapon)
    var group = new THREE.Group();

    // Barrel
    var barrelMat = new THREE.MeshStandardMaterial({ color: 0x666688, metalness: 0.8, roughness: 0.3 });
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.2);
    group.add(barrel);

    // Body
    var bodyMat = new THREE.MeshStandardMaterial({ color: 0x444466, roughness: 0.5 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.15), bodyMat);
    body.position.set(0, 0, -0.05);
    group.add(body);

    // Grip
    var gripMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.8 });
    var grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), gripMat);
    grip.position.set(0, -0.05, 0.05);
    group.add(grip);

    // Muzzle flash light
    var flashMat = new THREE.MeshBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0 });
    var flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), flashMat);
    flash.position.set(0, 0, -0.38);
    group.add(flash);
    muzzleFlash = flash;

    weaponModel = group;
    if (player && player.weaponPivot) {
      player.weaponPivot.add(group);
    }
  }

  // ──────────────────────────────────────────────
  // PARTICLES
  // ──────────────────────────────────────────────

  function buildParticles() {
    sparkSystem = E.createParticleSystem({
      count: 200,
      size: 0.08,
      spread: 0.3,
      speed: 8,
      lifeMax: 0.6,
      colorR: 1, colorG: 0.8, colorB: 0.3,
    });

    bloodSystem = E.createParticleSystem({
      count: 300,
      size: 0.1,
      spread: 0.5,
      speed: 5,
      lifeMax: 0.8,
      colorR: 0.8, colorG: 0.1, colorB: 0.1,
    });

    explosionSystem = E.createParticleSystem({
      count: 500,
      size: 0.15,
      spread: 2,
      speed: 12,
      lifeMax: 1.0,
      colorR: 1, colorG: 0.5, colorB: 0.1,
    });
  }

  // ──────────────────────────────────────────────
  // SPAWN POSITIONS
  // ──────────────────────────────────────────────

  function buildSpawnPositions() {
    enemySpawnPositions = [];
    var S = ARENA_SIZE - 4;
    for (var i = 0; i < 16; i++) {
      var angle = (i / 16) * Math.PI * 2;
      var radius = S * 0.85;
      enemySpawnPositions.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      });
    }
  }

  // ──────────────────────────────────────────────
  // ENEMY POOL
  // ──────────────────────────────────────────────

  var enemyPool = [];

  function setupEnemyPool() {
    // Pre-create enemy meshes for pooling
    for (var i = 0; i < 50; i++) {
      var geo = new THREE.BoxGeometry(0.8, 1.6, 0.8);
      var mat = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.6 });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.visible = false;
      mesh.position.set(0, -100, 0);
      E.scene.add(mesh);
      enemyPool.push({
        mesh: mesh,
        active: false,
        hp: 30,
        maxHp: 30,
        type: 'grunt',
        speed: 4,
        damage: 8,
        score: 100,
        attackCooldown: 0,
        state: 'idle', // idle | chase | attack | hurt
        stateTimer: 0,
        targetPos: null,
        idleTimer: 0,
        eyeOffset: 0.6,
      });
    }
  }

  function spawnEnemy(type, pos) {
    var data = enemyTypes[type] || enemyTypes.grunt;
    var pool = null;

    for (var i = 0; i < enemyPool.length; i++) {
      if (!enemyPool[i].active) { pool = enemyPool[i]; break; }
    }
    if (!pool) return null;

    var sp = pos || enemySpawnPositions[Math.floor(Math.random() * enemySpawnPositions.length)];

    pool.active = true;
    pool.hp = data.hp * (1 + wave * 0.15);
    pool.maxHp = pool.hp;
    pool.type = type;
    pool.speed = data.speed * (1 + wave * 0.05);
    pool.damage = data.damage * (1 + wave * 0.1);
    pool.score = data.score + wave * 50;
    pool.attackCooldown = 0;
    pool.state = 'idle';
    pool.stateTimer = 0.5 + Math.random() * 0.5;
    pool.targetPos = null;
    pool.idleTimer = 0;

    // Position
    pool.mesh.position.set(sp.x, 0.8, sp.z);
    pool.mesh.visible = true;
    pool.mesh.scale.set(data.size || 1, 1, data.size || 1);

    // Color based on type
    pool.mesh.material.color.setHex(data.color || 0xff4444);

    // Health bar as child
    updateEnemyHealthBar(pool);

    enemies.push(pool);
    enemiesAlive++;
    return pool;
  }

  function updateEnemyHealthBar(enemy) {
    // Remove old bar
    if (enemy._healthBar) {
      E.scene.remove(enemy._healthBar);
    }
    var barGroup = new THREE.Group();
    var bw = 0.8;
    var bh = 0.06;

    var bg = new THREE.Mesh(
      new THREE.PlaneGeometry(bw, bh),
      new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.6, depthWrite: false })
    );
    bg.position.y = 1.1;
    barGroup.add(bg);

    var fg = new THREE.Mesh(
      new THREE.PlaneGeometry(bw * (enemy.hp / enemy.maxHp), bh),
      new THREE.MeshBasicMaterial({
        color: enemy.hp / enemy.maxHp > 0.5 ? 0x44ff44 : (enemy.hp / enemy.maxHp > 0.25 ? 0xffaa00 : 0xff4444),
        transparent: true, opacity: 0.8, depthWrite: false,
      })
    );
    fg.position.y = 1.1;
    fg.position.x = -(bw * (1 - enemy.hp / enemy.maxHp)) / 2;
    barGroup.add(fg);
    enemy._healthBar = barGroup;
    enemy.mesh.add(barGroup);
  }

  // ──────────────────────────────────────────────
  // HUD
  // ──────────────────────────────────────────────

  var hudContainer = null;

  function buildHUD() {
    clearHUD();
    hudContainer = E.createHUD('\
      <div id="fps-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">\
        <div id="fps-health" style="position:absolute;bottom:40px;left:30px;font-size:14px;">\
          <div style="font-size:28px;font-weight:bold;text-shadow:0 0 10px rgba(255,0,0,0.5);">100</div>\
          <div style="font-size:11px;color:#88aacc;">HP</div>\
          <div id="fps-shield-bar" style="margin-top:4px;width:120px;height:6px;background:rgba(0,0,0,0.5);border-radius:3px;overflow:hidden;">\
            <div id="fps-shield-fill" style="width:0%;height:100%;background:#44aaff;border-radius:3px;transition:width 0.2s;"></div>\
          </div>\
        </div>\
        <div id="fps-ammo" style="position:absolute;bottom:40px;right:30px;text-align:right;">\
          <div id="fps-ammo-count" style="font-size:28px;font-weight:bold;text-shadow:0 0 10px rgba(0,0,0,0.5);">∞</div>\
          <div id="fps-weapon-name" style="font-size:11px;color:#88aacc;">PISTOL</div>\
          <div id="fps-reload" style="font-size:10px;color:#ffaa00;display:none;">RELOADING...</div>\
        </div>\
        <div id="fps-score" style="position:absolute;top:15px;left:50%;transform:translateX(-50%);text-align:center;">\
          <div id="fps-score-val" style="font-size:22px;font-weight:bold;text-shadow:0 0 15px rgba(0,0,0,0.8);">0</div>\
          <div id="fps-wave" style="font-size:12px;color:#88aacc;">WAVE 0</div>\
        </div>\
        <div id="fps-combo" style="position:absolute;top:60px;left:50%;transform:translateX(-50%);font-size:16px;color:#ffdd00;text-shadow:0 0 10px rgba(255,221,0,0.5);opacity:0;"></div>\
        <div id="fps-kills" style="position:absolute;top:50px;right:20px;font-size:12px;color:#88aacc;text-align:right;">\
          <div>KILLS: <span id="fps-kills-val">0</span></div>\
          <div>WAVE: <span id="fps-wave-kills">0</span>/<span id="fps-wave-total">0</span></div>\
        </div>\
        <div id="fps-crosshair" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">\
          <svg width="24" height="24" viewBox="0 0 24 24">\
            <line x1="12" y1="4" x2="12" y2="8" stroke="rgba(255,255,255,0.8)" stroke-width="2"/>\
            <line x1="12" y1="16" x2="12" y2="20" stroke="rgba(255,255,255,0.8)" stroke-width="2"/>\
            <line x1="4" y1="12" x2="8" y2="12" stroke="rgba(255,255,255,0.8)" stroke-width="2"/>\
            <line x1="16" y1="12" x2="20" y2="12" stroke="rgba(255,255,255,0.8)" stroke-width="2"/>\
            <circle cx="12" cy="12" r="1.5" fill="rgba(255,255,255,0.3)"/>\
          </svg>\
        </div>\
        <div id="fps-damage-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center, transparent 60%, rgba(255,0,0,0.4) 100%);opacity:0;transition:opacity 0.1s;"></div>\
        <div id="fps-kill-feed" style="position:absolute;top:80px;left:20px;font-size:11px;color:#aaa;"></div>\
        <div id="fps-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">\
          <div style="font-size:36px;font-weight:bold;color:#44aaff;text-shadow:0 0 20px rgba(68,170,255,0.5);">ECHO POINT</div>\
          <div style="font-size:14px;color:#88aacc;margin-top:10px;">WASD move · MOUSE aim · CLICK shoot · 1/2/3 weapons</div>\
          <div style="font-size:12px;color:#666;margin-top:6px;">R reload · SHIFT sprint · P pause</div>\
          <div id="fps-start-btn" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#44aaff;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;box-shadow:0 0 20px rgba(68,170,255,0.4);">PRESS ENTER TO START</div>\
        </div>\
        <div id="fps-gameover" style="position:absolute;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);">\
          <div style="font-size:36px;font-weight:bold;color:#ff4444;text-shadow:0 0 20px rgba(255,0,0,0.5);">GAME OVER</div>\
          <div style="font-size:18px;color:#ffaa00;margin-top:10px;">SCORE: <span id="fps-final-score">0</span></div>\
          <div style="font-size:13px;color:#88aacc;margin-top:6px;">WAVE <span id="fps-final-wave">0</span> · <span id="fps-final-kills">0</span> KILLS</div>\
          <div id="fps-restart-btn" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#ff4444;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO RETRY</div>\
        </div>\
        <div id="fps-wave-announce" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);font-size:32px;font-weight:bold;color:#ffdd00;text-shadow:0 0 30px rgba(255,221,0,0.5);opacity:0;transition:opacity 0.5s;"></div>\
      </div>');
  }

  function clearHUD() {
    if (hudContainer) {
      if (hudContainer.parentNode) hudContainer.parentNode.removeChild(hudContainer);
      hudContainer = null;
    }
  }

  function updateHUD() {
    var healthPct = Math.max(0, health / maxHealth * 100);
    document.getElementById('fps-health').children[0].textContent = Math.ceil(health);
    document.getElementById('fps-health').children[0].style.color = health > 50 ? '#ffffff' : (health > 25 ? '#ffaa00' : '#ff4444');
    document.getElementById('fps-shield-fill').style.width = (shield / maxShield * 100) + '%';

    var w = weapons[currentWeapon];
    document.getElementById('fps-ammo-count').textContent = ammo[currentWeapon] === Infinity ? '∞' : ammo[currentWeapon];
    document.getElementById('fps-weapon-name').textContent = w.name;
    document.getElementById('fps-reload').style.display = isReloading ? 'block' : 'none';

    document.getElementById('fps-score-val').textContent = score;
    document.getElementById('fps-wave').textContent = 'WAVE ' + wave;
    document.getElementById('fps-kills-val').textContent = kills;
    document.getElementById('fps-wave-kills').textContent = enemiesKilledThisWave;
    document.getElementById('fps-wave-total').textContent = waveEnemyCount;

    // Combo
    var comboEl = document.getElementById('fps-combo');
    if (comboCount > 1) {
      comboEl.textContent = comboCount + 'x COMBO!';
      comboEl.style.opacity = Math.min(1, comboTimer);
    } else {
      comboEl.style.opacity = 0;
    }

    // Damage flash
    var dmgEl = document.getElementById('fps-damage-overlay');
    dmgEl.style.opacity = damageFlash > 0 ? Math.min(1, damageFlash * 2) : 0;

    // Wave announcement
    var waEl = document.getElementById('fps-wave-announce');
    if (waEl.style.opacity > 0.01) {
      waEl.style.opacity = parseFloat(waEl.style.opacity) - 0.01;
    }

    // Ready screen pulsing
    if (state === 'ready') {
      var btn = document.getElementById('fps-start-btn');
      var p = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
      btn.style.transform = 'scale(' + (1 + p * 0.05) + ')';
      btn.style.boxShadow = '0 0 ' + (15 + p * 15) + 'px rgba(68,170,255,' + (0.3 + p * 0.3) + ')';
    }
  }

  // ──────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────

  function update(dt, input) {
    if (state === 'ready') {
      if (input.action || input.shoot) {
        startWave();
      }
      updateHUD();
      return;
    }

    if (state === 'gameover') {
      playTime += dt;
      updateKillFeed(dt);
      updateHUD();
      if (input.action) {
        init(E);
      }
      return;
    }

    if (state === 'waveComplete') {
      waveDelay -= dt;
      updateKillFeed(dt);
      updateHUD();
      if (waveDelay <= 0 || input.action) {
        startNextWave();
      }
      return;
    }

    playTime += dt;

    // ── Player input ──
    updatePlayerMovement(dt, input);
    updatePlayerLook(dt, input);
    updateWeapons(dt, input);
    updateHeadBob(dt, input);

    // ── Enemies ──
    updateEnemies(dt);

    // ── Bullets ──
    updateBullets(dt);

    // ── Pickups ──
    updatePickups(dt);

    // ── Decals ──
    updateDecals(dt);

    // ── Timers ──
    damageFlash = Math.max(0, damageFlash - dt);
    comboTimer = Math.max(0, comboTimer - dt);
    if (comboTimer <= 0) comboCount = 0;

    // ── Kill feed ──
    updateKillFeed(dt);

    // ── HUD ──
    updateHUD();

    // ── Check wave complete ──
    if (enemiesAlive <= 0 && enemiesKilledThisWave >= waveEnemyCount) {
      state = 'waveComplete';
      waveDelay = 3;
      var bonus = waveEnemyCount * 10;
      score += bonus;
      coins += wave;
      E.playBeep(600, 0.15, 'sine', 0.2);
      setTimeout(function () { E.playBeep(800, 0.15, 'sine', 0.2); }, 150);
      setTimeout(function () { E.playBeep(1000, 0.2, 'sine', 0.3); }, 300);
    }

    // ── Spawn health if needed ──
    if (Math.random() < 0.002 && health < maxHealth) {
      spawnPickup({ x: (Math.random() - 0.5) * ARENA_SIZE * 1.2, z: (Math.random() - 0.5) * ARENA_SIZE * 1.2 }, 'health');
    }
  }

  // ──────────────────────────────────────────────
  // PLAYER MOVEMENT
  // ──────────────────────────────────────────────

  function updatePlayerMovement(dt, input) {
    var speed = input.keys['ShiftLeft'] || input.keys['ShiftRight'] ? SPRINT_SPEED : PLAYER_SPEED;
    player.sprinting = (input.keys['ShiftLeft'] || input.keys['ShiftRight']);

    var dx = 0, dz = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dz -= 1;
    if (input.down) dz += 1;

    // Normalize
    if (dx !== 0 && dz !== 0) {
      dx *= 0.707;
      dz *= 0.707;
    }

    // Rotate movement relative to camera yaw
    var yaw = player.yaw;
    var worldDx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    var worldDz = dx * Math.sin(yaw) + dz * Math.cos(yaw);

    var newX = E.camera.position.x + worldDx * speed * dt;
    var newZ = E.camera.position.z + worldDz * speed * dt;

    // Arena bounds collision
    var bound = ARENA_SIZE - 1;
    newX = Math.max(-bound, Math.min(bound, newX));
    newZ = Math.max(-bound, Math.min(bound, newZ));

    // Obstacle collision (simple AABB)
    var obsCheck = checkObstacleCollision(newX, newZ);
    if (!obsCheck) {
      E.camera.position.x = newX;
      E.camera.position.z = newZ;
    } else {
      // Try sliding along walls
      var slideX = checkObstacleCollision(newX, E.camera.position.z);
      if (!slideX) E.camera.position.x = newX;
      var slideZ = checkObstacleCollision(E.camera.position.x, newZ);
      if (!slideZ) E.camera.position.z = newZ;
    }

    // Velocity for bob
    player.velocity.x = worldDx * speed;
    player.velocity.z = worldDz * speed;
  }

  function checkObstacleCollision(x, z) {
    var pr = PLAYER_RADIUS + 0.5;
    var obs = [
      { x: 0, z: 0, w: 0.8, h: 2, d: 0.8 }, // pillar
      { x: -8, z: -5, w: 3, h: 2, d: 1 },
      { x: 10, z: 7, w: 2, h: 1.5, d: 2 },
      { x: -5, z: 12, w: 4, h: 1.2, d: 1 },
      { x: 7, z: -10, w: 1.5, h: 2.5, d: 1.5 },
      { x: -12, z: -8, w: 2, h: 1, d: 3 },
      { x: 14, z: -3, w: 3, h: 2, d: 1 },
      { x: -3, z: -14, w: 1, h: 3, d: 1 },
    ];
    for (var i = 0; i < obs.length; i++) {
      var o = obs[i];
      var hw = o.w / 2 + pr;
      var hd = o.d / 2 + pr;
      if (x > o.x - hw && x < o.x + hw && z > o.z - hd && z < o.z + hd) {
        return true;
      }
    }
    return false;
  }

  // ──────────────────────────────────────────────
  // PLAYER LOOK
  // ──────────────────────────────────────────────

  function updatePlayerLook(dt, input) {
    if (!input.pointerLocked && state === 'playing') {
      // Try to lock pointer on click
      return;
    }

    var sensitivity = MOUSE_SENSITIVITY;
    if (player.sprinting) sensitivity *= 0.7;

    player.yaw -= input.mouseDeltaX * sensitivity;
    player.pitch -= input.mouseDeltaY * sensitivity;
    player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, player.pitch));

    E.camera.rotation.order = 'YXZ';
    E.camera.rotation.y = player.yaw;
    E.camera.rotation.x = player.pitch;
  }

  // ──────────────────────────────────────────────
  // HEAD BOB
  // ──────────────────────────────────────────────

  function updateHeadBob(dt, input) {
    var moving = input.up || input.down || input.left || input.right;
    if (moving && state === 'playing') {
      var speed = player.sprinting ? 12 : 8;
      player.bobPhase += dt * speed;
      var bobb = Math.sin(player.bobPhase) * 0.03;
      var bobb2 = Math.sin(player.bobPhase * 2) * 0.015;
      E.camera.position.y = PLAYER_HEIGHT + bobb;
      if (player.weaponPivot) {
        player.weaponPivot.position.x = 0.3 + Math.sin(player.bobPhase * 2) * 0.01;
        player.weaponPivot.position.y = -0.2 + bobb2;
      }
    } else {
      // Return to center
      E.camera.position.y += (PLAYER_HEIGHT - E.camera.position.y) * 0.1;
      if (player.weaponPivot) {
        player.weaponPivot.position.x += (0.3 - player.weaponPivot.position.x) * 0.1;
        player.weaponPivot.position.y += (-0.2 - player.weaponPivot.position.y) * 0.1;
      }
      player.bobPhase = 0;
    }
  }

  // ──────────────────────────────────────────────
  // WEAPONS
  // ──────────────────────────────────────────────

  function updateWeapons(dt, input) {
    // Weapon switch
    if (input.keysPressed['Digit1']) { switchWeapon(0); }
    if (input.keysPressed['Digit2']) { switchWeapon(1); }
    if (input.keysPressed['Digit3']) { switchWeapon(2); }

    // Reload
    if (input.keysPressed['KeyR'] && !isReloading) {
      startReload();
    }

    // Fire rate timer
    if (fireTimer > 0) fireTimer -= dt;
    if (reloadTimer > 0) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) finishReload();
      return;
    }

    // Shooting
    var w = weapons[currentWeapon];
    var shouldFire = false;
    if (w.auto) {
      shouldFire = input.shoot && fireTimer <= 0 && !isReloading;
    } else {
      shouldFire = (input.keysPressed['Space'] || input.mousePressed.left) && fireTimer <= 0 && !isReloading;
    }

    if (shouldFire) {
      fireWeapon();
    }
  }

  function switchWeapon(idx) {
    if (idx === weaponIndex || idx >= weaponList.length) return;
    weaponIndex = idx;
    currentWeapon = weaponList[idx];
    fireTimer = 0;
    isReloading = false;
    reloadTimer = 0;
    E.playBeep(500, 0.05, 'sine', 0.1);
  }

  function startReload() {
    var w = weapons[currentWeapon];
    if (ammo[currentWeapon] >= maxAmmo[currentWeapon] || ammo[currentWeapon] === Infinity) return;
    isReloading = true;
    reloadTimer = w.reloadTime;
    E.playSound('reload');
  }

  function finishReload() {
    var w = weapons[currentWeapon];
    ammo[currentWeapon] = maxAmmo[currentWeapon];
    isReloading = false;
    E.playBeep(800, 0.1, 'sine', 0.15);
  }

  function fireWeapon() {
    var w = weapons[currentWeapon];
    if (ammo[currentWeapon] <= 0 || isReloading) {
      E.playBeep(200, 0.05, 'square', 0.05);
      return;
    }

    if (ammo[currentWeapon] !== Infinity) ammo[currentWeapon]--;
    fireTimer = w.fireRate;
    accuracy.shots++;

    // Muzzle flash
    if (muzzleFlash) {
      muzzleFlash.material.opacity = 1;
      var that = muzzleFlash;
      setTimeout(function () { that.material.opacity = 0; }, 50);
    }

    // Screen shake
    shakeScreen(w.damage * 0.02, w.fireRate * 0.3);

    // Sound
    var freq = currentWeapon === 'pistol' ? 600 : (currentWeapon === 'rifle' ? 400 : 200);
    E.playBeep(freq, w.fireRate * 0.8, 'square', 0.08);

    // Spread
    for (var p = 0; p < w.pellets; p++) {
      var spreadX = (Math.random() - 0.5) * w.spread;
      var spreadY = (Math.random() - 0.5) * w.spread;
      var dir = new THREE.Vector3(spreadX, spreadY, -1);
      dir.applyQuaternion(E.camera.quaternion);
      dir.normalize();

      // Raycast from camera
      var origin = E.camera.position.clone();
      var raycaster = new THREE.Raycaster(origin, dir, 0.1, 100);
      var intersects = [];

      // Check enemy meshes
      for (var ei = 0; ei < enemies.length; ei++) {
        var enemy = enemies[ei];
        if (!enemy.active) continue;
        var box = new THREE.Box3().setFromObject(enemy.mesh);
        var rayIntersect = raycaster.ray.intersectBox(box, new THREE.Vector3());
        if (rayIntersect) {
          intersects.push({ distance: origin.distanceTo(rayIntersect), enemy: enemy, point: rayIntersect });
        }
      }

      // Also check arena bounds (walls)
      var wallHit = checkWallHit(origin, dir);

      if (intersects.length > 0) {
        // Sort by distance
        intersects.sort(function (a, b) { return a.distance - b.distance; });
        var hit = intersects[0];
        var isHeadshot = hit.enemy.type !== 'heavy' && Math.random() < 0.15; // 15% headshot chance
        var dmg = w.damage;
        if (isHeadshot) dmg *= 2.5;
        damageEnemy(hit.enemy, dmg, isHeadshot);
        E.emitParticles(sparkSystem, hit.point, 5);
        if (isHeadshot) {
          addKillFeed('HEADSHOT! +' + Math.floor(dmg) + ' (' + hit.enemy.type + ')');
        }
        accuracy.hits++;
      } else if (wallHit) {
        // Bullet mark on wall
        addDecal(wallHit.point, wallHit.normal);
        E.emitParticles(sparkSystem, wallHit.point, 3);
      }
    }
  }

  function checkWallHit(origin, dir) {
    var S = ARENA_SIZE;
    var tMin = Infinity;
    var hitPoint = null;
    var hitNormal = null;

    // Check 4 walls (infinite plane for simplicity)
    var walls = [
      { n: new THREE.Vector3(0, 0, 1), p: new THREE.Vector3(0, 0, -S) },
      { n: new THREE.Vector3(0, 0, -1), p: new THREE.Vector3(0, 0, S) },
      { n: new THREE.Vector3(1, 0, 0), p: new THREE.Vector3(-S, 0, 0) },
      { n: new THREE.Vector3(-1, 0, 0), p: new THREE.Vector3(S, 0, 0) },
    ];

    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var denom = dir.dot(w.n);
      if (Math.abs(denom) < 0.001) continue;
      var t = (w.p.clone().sub(origin)).dot(w.n) / denom;
      if (t > 0 && t < tMin && t < 100) {
        var point = origin.clone().add(dir.clone().multiplyScalar(t));
        if (Math.abs(point.y) < WALL_HEIGHT) {
          tMin = t;
          hitPoint = point;
          hitNormal = w.n;
        }
      }
    }
    if (hitPoint) return { point: hitPoint, normal: hitNormal };
    return null;
  }

  // ──────────────────────────────────────────────
  // DECALS (bullet marks)
  // ──────────────────────────────────────────────

  function addDecal(point, normal) {
    if (decals.length > 50) {
      var old = decals.shift();
      E.scene.remove(old.mesh);
    }
    var geo = new THREE.CircleGeometry(0.1, 6);
    var mat = new THREE.MeshBasicMaterial({
      color: 0x444444,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    mesh.position.y = Math.max(0.1, mesh.position.y);
    mesh.lookAt(point.clone().add(normal));
    mesh.rotation.x += Math.PI / 2;
    E.scene.add(mesh);
    decals.push({ mesh: mesh, life: 10 });
  }

  function updateDecals(dt) {
    for (var i = decals.length - 1; i >= 0; i--) {
      decals[i].life -= dt;
      decals[i].mesh.material.opacity = Math.max(0, decals[i].life / 10) * 0.6;
      if (decals[i].life <= 0) {
        E.scene.remove(decals[i].mesh);
        decals[i].mesh.geometry.dispose();
        decals[i].mesh.material.dispose();
        decals.splice(i, 1);
      }
    }
  }

  // ──────────────────────────────────────────────
  // ENEMY DAMAGE
  // ──────────────────────────────────────────────

  function damageEnemy(enemy, damage, isHeadshot) {
    if (!enemy.active) return;
    enemy.hp -= damage;
    enemy.state = 'hurt';
    enemy.stateTimer = 0.1;

    if (isHeadshot) headshots++;

    if (enemy.hp <= 0) {
      killEnemy(enemy, isHeadshot);
    } else {
      // Flash red
      enemy.mesh.material.color.setHex(0xffffff);
      var eMesh = enemy.mesh;
      setTimeout(function () {
        if (eMesh.material) eMesh.material.color.setHex(enemyTypes[enemy.type] ? enemyTypes[enemy.type].color : 0xff4444);
      }, 80);
    }
  }

  function killEnemy(enemy, isHeadshot) {
    if (!enemy.active) return;
    enemy.active = false;
    enemy.mesh.visible = false;
    if (enemy._healthBar) {
      enemy.mesh.remove(enemy._healthBar);
      enemy._healthBar = null;
    }

    // Remove from active list
    var idx = enemies.indexOf(enemy);
    if (idx >= 0) enemies.splice(idx, 1);

    enemiesAlive--;
    enemiesKilledThisWave++;
    kills++;

    // Combo
    comboCount++;
    comboTimer = 2;

    // Score
    var mult = 1 + Math.floor(comboCount / 5) * 0.5;
    var points = Math.floor(enemy.score * mult * (isHeadshot ? 2 : 1));
    score += points;

    // Particles
    E.emitParticles(explosionSystem, enemy.mesh.position, 15);
    E.emitParticles(bloodSystem, enemy.mesh.position, 10);

    // Shell shake
    shakeScreen(3, 0.1);

    // Sound
    E.playBeep(200 + enemy.score, 0.08, 'sawtooth', 0.1);

    // Coin drop chance
    if (Math.random() < 0.3) {
      coins++;
    }

    // Kill feed
    addKillFeed((isHeadshot ? 'HEADSHOT ' : '') + enemy.type + ' +' + points);
  }

  // ──────────────────────────────────────────────
  // ENEMY AI
  // ──────────────────────────────────────────────

  function updateEnemies(dt) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.active) continue;

      e.attackCooldown -= dt;
      e.stateTimer -= dt;

      var toPlayer = new THREE.Vector3(
        E.camera.position.x - e.mesh.position.x,
        0,
        E.camera.position.z - e.mesh.position.z
      );
      var dist = toPlayer.length();

      // Face player (always)
      if (dist > 0.5) {
        var angle = Math.atan2(toPlayer.x, toPlayer.z);
        e.mesh.rotation.y = angle;
      }

      switch (e.state) {
        case 'idle':
          if (e.stateTimer <= 0 || dist < 15) {
            e.state = 'chase';
            e.stateTimer = 2 + Math.random() * 2;
          }
          break;

        case 'chase':
          if (dist < 3) {
            e.state = 'attack';
            e.stateTimer = 0.5;
          } else if (dist > 25) {
            e.state = 'idle';
            e.stateTimer = 1 + Math.random();
          } else {
            // Move toward player
            var moveSpeed = e.speed * dt;
            var newX = e.mesh.position.x + (toPlayer.x / dist) * moveSpeed;
            var newZ = e.mesh.position.z + (toPlayer.z / dist) * moveSpeed;
            // Avoid walls
            var bound = ARENA_SIZE - 2;
            newX = Math.max(-bound, Math.min(bound, newX));
            newZ = Math.max(-bound, Math.min(bound, newZ));
            e.mesh.position.x = newX;
            e.mesh.position.z = newZ;

            // Update health bar position
            if (e._healthBar) {
              e._healthBar.position.y = 1.1;
            }

            // Sniper stops at range
            if (e.type === 'sniper' && dist < 10) {
              // Back up
              e.mesh.position.x -= (toPlayer.x / dist) * moveSpeed * 0.5;
              e.mesh.position.z -= (toPlayer.z / dist) * moveSpeed * 0.5;
            }
            if (e.type === 'fast') {
              // Fast enemies move extra
              e.mesh.position.x += (toPlayer.x / dist) * moveSpeed * 0.5;
              e.mesh.position.z += (toPlayer.z / dist) * moveSpeed * 0.5;
            }
          }
          break;

        case 'attack':
          if (dist > 4) { e.state = 'chase'; break; }
          if (e.stateTimer <= 0) {
            e.stateTimer = 0.5 + Math.random() * 0.5;

            // Deal damage to player
            if (e.attackCooldown <= 0) {
              dealDamage(e.damage);
              e.attackCooldown = 0.8;
              E.playBeep(150, 0.1, 'sawtooth', 0.15);
              E.emitParticles(bloodSystem, E.camera.position, 3);
              shakeScreen(4, 0.15);
            }

            // Back off slightly
            if (dist < 2) {
              e.mesh.position.x -= (toPlayer.x / dist) * 2 * dt;
              e.mesh.position.z -= (toPlayer.z / dist) * 2 * dt;
            }
          }
          break;

        case 'hurt':
          if (e.stateTimer <= 0) {
            e.state = 'chase';
          }
          break;
      }

      // Update health bar
      if (e.active && e._healthBar) {
        var pct = e.hp / e.maxHp;
        e._healthBar.children[1].scale.x = pct;
        e._healthBar.children[1].position.x = -(0.4 * (1 - pct));
        e._healthBar.children[1].material.color.setHex(
          pct > 0.5 ? 0x44ff44 : (pct > 0.25 ? 0xffaa00 : 0xff4444)
        );
      }
    }
  }

  // ──────────────────────────────────────────────
  // BULLETS
  // ──────────────────────────────────────────────

  function updateBullets(dt) {
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.life -= dt;
      if (b.life <= 0) {
        if (b.mesh.parentNode) E.scene.remove(b.mesh);
        bullets.splice(i, 1);
        continue;
      }
      // Movement handled by raytrace on fire, not physics bullets
    }
  }

  // ──────────────────────────────────────────────
  // PICKUPS
  // ──────────────────────────────────────────────

  function spawnPickup(pos, type) {
    if (pickups.length > 10) return;
    var geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    var mat = new THREE.MeshStandardMaterial({
      color: type === 'health' ? 0x44ff44 : 0xffdd00,
      emissive: type === 'health' ? 0x44ff44 : 0xffdd00,
      emissiveIntensity: 0.3,
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 0.5, pos.z);
    mesh.castShadow = true;
    E.scene.add(mesh);

    // Glow
    var glow = new THREE.PointLight(type === 'health' ? 0x44ff44 : 0xffdd00, 0.3, 3);
    glow.position.copy(mesh.position);
    E.scene.add(glow);

    pickups.push({
      mesh: mesh,
      glow: glow,
      type: type,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  function updatePickups(dt) {
    for (var i = pickups.length - 1; i >= 0; i--) {
      var p = pickups[i];
      p.bobPhase += dt * 3;
      p.mesh.position.y = 0.5 + Math.sin(p.bobPhase) * 0.2;
      p.mesh.rotation.y += dt * 2;
      if (p.glow) p.glow.position.copy(p.mesh.position);

      // Check collection by player
      var dist = new THREE.Vector3(
        E.camera.position.x - p.mesh.position.x,
        0,
        E.camera.position.z - p.mesh.position.z
      ).length();

      if (dist < 1.5) {
        if (p.type === 'health') {
          health = Math.min(maxHealth, health + 30);
          addKillFeed('+30 HP');
        } else {
          ammo.rifle = Math.min(maxAmmo.rifle, ammo.rifle + 30);
          ammo.shotgun = Math.min(maxAmmo.shotgun, ammo.shotgun + 5);
          addKillFeed('+Ammo');
        }
        E.playBeep(800, 0.15, 'sine', 0.2);
        E.scene.remove(p.mesh);
        if (p.glow) E.scene.remove(p.glow);
        pickups.splice(i, 1);
      }
    }
  }

  // ──────────────────────────────────────────────
  // DAMAGE / SHAKE
  // ──────────────────────────────────────────────

  function dealDamage(amount) {
    if (state !== 'playing' && state !== 'waveComplete') return;

    // Shield absorbs first
    if (shield > 0) {
      var absorbed = Math.min(shield, amount);
      shield -= absorbed;
      amount -= absorbed;
    }

    health -= amount;
    damageFlash = 0.3;

    if (health <= 0) {
      health = 0;
      gameOver();
    }
  }

  function shakeScreen(intensity, duration) {
    // Apply to camera position offset for next frame
    if (player) {
      player._shakeIntensity = (player._shakeIntensity || 0) + intensity;
      player._shakeDuration = Math.max(player._shakeDuration || 0, duration || 0.15);
    }
  }

  var shakeTimer = 0;
  var shakeIntensity = 0;

  function applyShake(dt) {
    if (shakeTimer > 0) {
      shakeTimer -= dt;
      var sx = (Math.random() - 0.5) * shakeIntensity * 2;
      var sy = (Math.random() - 0.5) * shakeIntensity * 2;
      E.camera.position.x += sx;
      E.camera.position.y += sy;
      if (shakeTimer <= 0) shakeIntensity = 0;
    }
  }

  // ──────────────────────────────────────────────
  // KILL FEED
  // ──────────────────────────────────────────────

  var feedMessages = [];

  function addKillFeed(msg) {
    feedMessages.push({ text: msg, life: 3 });
    if (feedMessages.length > 5) feedMessages.shift();
  }

  function updateKillFeed(dt) {
    var el = document.getElementById('fps-kill-feed');
    if (!el) return;
    for (var i = feedMessages.length - 1; i >= 0; i--) {
      feedMessages[i].life -= dt;
      if (feedMessages[i].life <= 0) feedMessages.splice(i, 1);
    }
    el.innerHTML = feedMessages.map(function (m) {
      var alpha = Math.min(1, m.life);
      return '<div style="opacity:' + alpha + ';">' + m.text + '</div>';
    }).join('');
  }

  // ──────────────────────────────────────────────
  // WAVES
  // ──────────────────────────────────────────────

  function startWave() {
    if (state === 'ready') {
      document.getElementById('fps-ready').style.display = 'none';
    }
    state = 'playing';
    wave++;
    bossWave = (wave % 10 === 0);

    var count = 3 + wave * 2;
    waveEnemyCount = count;
    enemiesKilledThisWave = 0;

    // Announce
    var waEl = document.getElementById('fps-wave-announce');
    waEl.textContent = 'WAVE ' + wave + (bossWave ? ' — BOSS!' : '');
    waEl.style.opacity = 1;

    E.playBeep(400, 0.1, 'sine', 0.2);
    setTimeout(function () { E.playBeep(600, 0.1, 'sine', 0.2); }, 100);
    setTimeout(function () { E.playBeep(800, 0.15, 'sine', 0.3); }, 200);

    // Spawn enemies with small delays
    for (var i = 0; i < count; i++) {
      (function (idx) {
        setTimeout(function () {
          if (state !== 'playing') return;
          var type = pickEnemyType();
          spawnEnemy(type);
        }, idx * 400);
      })(i);
    }
  }

  function startNextWave() {
    startWave();
  }

  function pickEnemyType() {
    var r = Math.random();
    if (wave < 3) return r < 0.7 ? 'grunt' : 'fast';
    if (wave < 6) return r < 0.4 ? 'grunt' : (r < 0.7 ? 'heavy' : 'fast');
    return r < 0.3 ? 'grunt' : (r < 0.5 ? 'heavy' : (r < 0.7 ? 'fast' : 'sniper'));
  }

  function gameOver() {
    state = 'gameover';
    document.getElementById('fps-gameover').style.display = 'flex';
    document.getElementById('fps-final-score').textContent = score;
    document.getElementById('fps-final-wave').textContent = wave;
    document.getElementById('fps-final-kills').textContent = kills;

    E.playBeep(300, 0.3, 'sawtooth', 0.3);
    setTimeout(function () { E.playBeep(200, 0.5, 'sawtooth', 0.3); }, 300);
  }

  // ──────────────────────────────────────────────
  // RENDER 3D
  // ──────────────────────────────────────────────

  function render3D() {
    // Apply screen shake
    if (player && player._shakeDuration && player._shakeDuration > 0) {
      player._shakeDuration -= 0.016;
      var si = player._shakeIntensity || 0;
      var sx = (Math.random() - 0.5) * si * 0.02;
      var sy = (Math.random() - 0.5) * si * 0.02;
      E.camera.position.x += sx;
      E.camera.position.y += sy;
      if (player._shakeDuration <= 0) {
        player._shakeIntensity = 0;
        player._shakeDuration = 0;
      }
    }

    // Animate pickup bobbing
    for (var i = 0; i < pickups.length; i++) {
      var p = pickups[i];
      p.mesh.rotation.y += 0.03;
    }

    // Render scene
    if (E.renderer && E.scene && E.camera) {
      E.renderer.render(E.scene, E.camera);
    }
  }

  // ──────────────────────────────────────────────
  // RENDER 2D (overlay)
  // ──────────────────────────────────────────────

  function render2D(ctx) {
    // Done via HTML HUD, no canvas 2D overlay needed
  }

  // ──────────────────────────────────────────────
  // DESTROY
  // ──────────────────────────────────────────────

  function destroy() {
    clearHUD();
    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].active) {
        enemies[i].mesh.visible = false;
        if (enemies[i]._healthBar) {
          enemies[i].mesh.remove(enemies[i]._healthBar);
        }
      }
    }
    for (var i2 = 0; i2 < pickups.length; i2++) {
      E.scene.remove(pickups[i2].mesh);
      if (pickups[i2].glow) E.scene.remove(pickups[i2].glow);
    }
    for (var i3 = 0; i3 < decals.length; i3++) {
      E.scene.remove(decals[i3].mesh);
      decals[i3].mesh.geometry.dispose();
      decals[i3].mesh.material.dispose();
    }
    // Return enemy pool meshes to hidden state
    for (var i4 = 0; i4 < enemyPool.length; i4++) {
      enemyPool[i4].active = false;
      enemyPool[i4].mesh.visible = false;
      if (enemyPool[i4]._healthBar) {
        enemyPool[i4].mesh.remove(enemyPool[i4]._healthBar);
      }
    }
    if (arena) E.scene.remove(arena);
    // Remove weapon model from camera
    if (weaponModel && player && player.weaponPivot) {
      player.weaponPivot.remove(weaponModel);
    }
    if (muzzleFlash) {
      muzzleFlash.material.dispose();
    }

    player = null;
    enemies = [];
    bullets = [];
    pickups = [];
    decals = [];
    enemyPool = [];
    E = null;
    THREE = null;
  }

  // ──────────────────────────────────────────────
  // EXPORT
  // ──────────────────────────────────────────────

  window.EchoPoint = {
    init: init,
    update: update,
    render3D: render3D,
    render2D: render2D,
    destroy: destroy,
    name: 'Echo Point',
    description: 'FPS Arena Shooter — Wave-based combat with multiple weapons',
    genre: 'fps',
    requiresPointerLock: true,
  };

  console.log('[EchoPoint] Loaded. ' + weapons.pistol.name + ', ' + weapons.rifle.name + ', ' + weapons.shotgun.name);
})();
