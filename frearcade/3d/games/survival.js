/**
 * Wild Frontier — 3D Survival Open World
 *
 * Open-world survival with day/night cycle, resource gathering,
 * crafting, base building, enemy wildlife, and hunger/thirst management.
 *
 * @license MIT
 * @version 1.0.0
 */

(function () {
  'use strict';

  var E = null;
  var THREE = null;

  // ── State ──
  var state = 'ready';
  var health = 100;
  var maxHealth = 100;
  var hunger = 100;
  var thirst = 100;
  var stamina = 100;
  var maxStamina = 100;
  var score = 0;
  var dayTime = 0;
  var dayLength = 120; // seconds per day cycle
  var playTime = 0;

  // Resources
  var resources = {
    wood: 0,
    stone: 0,
    food: 0,
    water: 0,
    metal: 0,
    fiber: 0,
  };

  // Inventory
  var inventory = [];
  var maxInventory = 20;

  // Crafting recipes
  var recipes = {
    'campfire': { wood: 3, stone: 2, label: 'Campfire' },
    'wood_wall': { wood: 4, label: 'Wood Wall' },
    'stone_axe': { wood: 2, metal: 1, label: 'Stone Axe' },
    'spear': { wood: 2, metal: 1, fiber: 1, label: 'Spear' },
    'bandage': { fiber: 2, label: 'Bandage' },
    'shelter': { wood: 8, stone: 4, fiber: 3, label: 'Shelter' },
    'storage_box': { wood: 5, metal: 2, label: 'Storage Box' },
  };

  // 3D objects
  var terrain = null;
  var player = null;
  var resources3D = [];
  var buildings = [];
  var enemies = [];
  var droppedItems = [];
  var skySphere = null;
  var sunLight = null;
  var ambientLight = null;

  // ──────────────────────────────────────────────
  // INIT
  // ──────────────────────────────────────────────

  function init(engine) {
    E = engine;
    THREE = engine.THREE;
    if (!THREE) return;
    resetState();
    buildTerrain();
    buildPlayer();
    buildSky();
    buildResources();
    buildHUD();
    spawnInitialEnemies();
    state = 'ready';
    E.emit('gameReady', { name: 'Wild Frontier' });
  }

  function resetState() {
    health = 100; hunger = 100; thirst = 100; stamina = 100;
    score = 0; dayTime = 0; playTime = 0;
    resources = { wood: 0, stone: 0, food: 0, water: 0, metal: 0, fiber: 0 };
    inventory = [];
    resources3D = []; buildings = []; enemies = []; droppedItems = [];
  }

  // ──────────────────────────────────────────────
  // TERRAIN
  // ──────────────────────────────────────────────

  var TERRAIN_SIZE = 80;

  function buildTerrain() {
    if (terrain) E.scene.remove(terrain);
    terrain = new THREE.Group();

    // Ground
    var groundGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 20, 20);
    var groundMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a1e,
      roughness: 0.9,
      metalness: 0.0,
    });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    terrain.add(ground);

    // Modify vertices for gentle hills
    var posAttr = groundGeo.attributes.position;
    for (var i = 0; i < posAttr.count; i++) {
      var x = posAttr.getX(i);
      var z = posAttr.getZ(i);
      var h = Math.sin(x * 0.05) * Math.cos(z * 0.07) * 0.5 +
              Math.sin(x * 0.1 + z * 0.08) * 0.3;
      posAttr.setY(i, h);
    }
    posAttr.needsUpdate = true;
    groundGeo.computeVertexNormals();

    // Grass patches (simple small cylinders)
    var grassMat = new THREE.MeshStandardMaterial({ color: 0x3a7a2a, roughness: 0.8 });
    for (var gi = 0; gi < 200; gi++) {
      var gx = (Math.random() - 0.5) * TERRAIN_SIZE * 0.9;
      var gz = (Math.random() - 0.5) * TERRAIN_SIZE * 0.9;
      var grass = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.1 + Math.random() * 0.2, 3), grassMat);
      grass.position.set(gx, 0.05, gz);
      grass.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
      terrain.add(grass);
    }

    // Trees (simple)
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 });
    var leafMat = new THREE.MeshStandardMaterial({ color: 0x2a7a1a, roughness: 0.8 });
    for (var ti = 0; ti < 40; ti++) {
      var tx = (Math.random() - 0.5) * TERRAIN_SIZE * 0.8;
      var tz = (Math.random() - 0.5) * TERRAIN_SIZE * 0.8;
      if (Math.abs(tx) < 5 && Math.abs(tz) < 5) continue; // Keep center clear

      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 1 + Math.random() * 0.5, 5), trunkMat);
      trunk.position.set(tx, 0.5, tz);
      trunk.castShadow = true;
      terrain.add(trunk);

      var leafSize = 0.8 + Math.random() * 0.6;
      var leaf = new THREE.Mesh(new THREE.SphereGeometry(leafSize, 6, 6), leafMat);
      leaf.position.set(tx, 1.5 + Math.random() * 0.5, tz);
      leaf.castShadow = true;
      terrain.add(leaf);
    }

    // Rocks
    var rockMat = new THREE.MeshStandardMaterial({ color: 0x666677, roughness: 0.9 });
    for (var ri = 0; ri < 30; ri++) {
      var rx = (Math.random() - 0.5) * TERRAIN_SIZE * 0.85;
      var rz = (Math.random() - 0.5) * TERRAIN_SIZE * 0.85;
      var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.4), rockMat);
      rock.position.set(rx, 0.1, rz);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      terrain.add(rock);
    }

    E.scene.add(terrain);
  }

  // ──────────────────────────────────────────────
  // SKY
  // ──────────────────────────────────────────────

  function buildSky() {
    // Sky sphere
    var skyGeo = new THREE.SphereGeometry(150, 16, 16);
    var skyMat = new THREE.MeshBasicMaterial({
      color: 0x4477cc,
      side: THREE.BackSide,
    });
    skySphere = new THREE.Mesh(skyGeo, skyMat);
    E.scene.add(skySphere);

    // Sun
    sunLight = new THREE.DirectionalLight(0xffeedd, 1.0);
    sunLight.position.set(50, 80, 30);
    sunLight.castShadow = true;
    if (E.CONFIG && E.CONFIG.SHADOWS) {
      sunLight.shadow.mapSize.width = 1024;
      sunLight.shadow.mapSize.height = 1024;
    }
    E.scene.add(sunLight);

    ambientLight = new THREE.AmbientLight(0x334466, 0.3);
    E.scene.add(ambientLight);
  }

  function updateSky(dt) {
    dayTime += dt;
    if (dayTime > dayLength) dayTime -= dayLength;
    var cycle = dayTime / dayLength;
    var angle = cycle * Math.PI * 2;

    // Sun position
    var sunX = Math.cos(angle) * 80;
    var sunY = Math.sin(angle) * 80;
    if (sunLight) {
      sunLight.position.set(sunX, Math.max(0, sunY), 30);
      var intensity = Math.max(0.1, Math.sin(angle));
      sunLight.intensity = intensity * 0.8 + 0.2;
    }

    // Sky color
    if (skySphere) {
      if (sunY > 10) {
        skySphere.material.color.setHex(0x4477cc);
        if (ambientLight) ambientLight.intensity = 0.04;
      } else if (sunY > -10) {
        // Sunset
        var t = (sunY + 10) / 20;
        skySphere.material.color.setHSL(0.6 - t * 0.1, 0.6, 0.3 + t * 0.3);
        if (ambientLight) ambientLight.intensity = 0.02 + t * 0.02;
      } else {
        // Night
        skySphere.material.color.setHex(0x0a0a1a);
        if (ambientLight) ambientLight.intensity = 0.015;
      }
    }
  }

  // ──────────────────────────────────────────────
  // PLAYER
  // ──────────────────────────────────────────────

  function buildPlayer() {
    var group = new THREE.Group();

    // Body
    var bodyMat = new THREE.MeshStandardMaterial({ color: 0x3355aa, roughness: 0.6 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);

    // Head
    var headMat = new THREE.MeshStandardMaterial({ color: 0xddbb88, roughness: 0.7 });
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), headMat);
    head.position.set(0, 1.5, 0);
    group.add(head);

    // Arms
    var armMat = new THREE.MeshStandardMaterial({ color: 0x3355aa, roughness: 0.6 });
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), armMat);
    armL.position.set(-0.35, 0.9, 0);
    group.add(armL);
    var armR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), armMat);
    armR.position.set(0.35, 0.9, 0);
    group.add(armR);

    // Legs
    var legMat = new THREE.MeshStandardMaterial({ color: 0x223366, roughness: 0.7 });
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), legMat);
    legL.position.set(-0.15, 0.25, 0);
    group.add(legL);
    var legR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), legMat);
    legR.position.set(0.15, 0.25, 0);
    group.add(legR);

    group.position.set(0, 0, 0);
    E.scene.add(group);

    // Third-person camera pivot
    var camPivot = new THREE.Object3D();
    E.scene.add(camPivot);

    player = {
      group: group,
      camPivot: camPivot,
      yaw: 0,
      pitch: -0.3,
      speed: 5,
      velocity: { x: 0, z: 0 },
      grounded: true,
      attacking: false,
      attackTimer: 0,
      selectedItem: null,
      buildingMode: false,
      buildPreview: null,
    };

    // Position camera behind player
    updateCamera(0);
  }

  function updateCamera(dt) {
    if (!player || !player.group) return;
    var behind = new THREE.Vector3(0, 3, 6);
    var yaw = player.yaw;
    var rotated = new THREE.Vector3(
      behind.x * Math.cos(yaw) - behind.z * Math.sin(yaw),
      behind.y,
      behind.x * Math.sin(yaw) + behind.z * Math.cos(yaw)
    );
    var target = player.group.position.clone().add(rotated);

    E.camera.position.lerp(target, 3 * dt);
    var lookTarget = player.group.position.clone();
    lookTarget.y += 1.2;
    E.camera.lookAt(lookTarget);
  }

  // ──────────────────────────────────────────────
  // RESOURCES (gatherable)
  // ──────────────────────────────────────────────

  function buildResources() {
    var woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
    var stoneMat = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.9 });
    var bushMat = new THREE.MeshStandardMaterial({ color: 0x3a8a2a, roughness: 0.8 });

    // Wood piles
    for (var i = 0; i < 20; i++) {
      var rx = (Math.random() - 0.5) * TERRAIN_SIZE * 0.7;
      var rz = (Math.random() - 0.5) * TERRAIN_SIZE * 0.7;
      var pile = new THREE.Group();
      for (var j = 0; j < 3; j++) {
        var log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 5), woodMat);
        log.position.set((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3);
        log.rotation.set(Math.random(), Math.random(), Math.random());
        pile.add(log);
      }
      pile.position.set(rx, 0, rz);
      pile.userData = { type: 'wood', amount: 3 + Math.floor(Math.random() * 3) };
      E.scene.add(pile);
      resources3D.push(pile);
    }

    // Stone deposits
    for (var si = 0; si < 15; si++) {
      var sx = (Math.random() - 0.5) * TERRAIN_SIZE * 0.7;
      var sz = (Math.random() - 0.5) * TERRAIN_SIZE * 0.7;
      var stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.3, 0), stoneMat);
      stone.position.set(sx, 0.1, sz);
      stone.rotation.set(Math.random(), Math.random(), Math.random());
      stone.userData = { type: 'stone', amount: 2 + Math.floor(Math.random() * 3) };
      E.scene.add(stone);
      resources3D.push(stone);
    }

    // Berry bushes
    for (var bi = 0; bi < 25; bi++) {
      var bx = (Math.random() - 0.5) * TERRAIN_SIZE * 0.7;
      var bz = (Math.random() - 0.5) * TERRAIN_SIZE * 0.7;
      var bush = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), bushMat);
      bush.position.set(bx, 0.2, bz);
      bush.userData = { type: 'food', amount: 1 + Math.floor(Math.random() * 2) };
      E.scene.add(bush);
      resources3D.push(bush);
    }
  }

  function gatherResource(resourceObj) {
    var data = resourceObj.userData;
    resources[data.type] = (resources[data.type] || 0) + data.amount;
    score += data.amount * 5;
    E.scene.remove(resourceObj);
    var idx = resources3D.indexOf(resourceObj);
    if (idx >= 0) resources3D.splice(idx, 1);
    E.playBeep(600, 0.1, 'sine', 0.15);
    // Respawn after delay
    var thatType = data.type;
    var thatAmount = data.amount;
    setTimeout(function () {
      if (resources3D.length < 80) {
        var pos = {
          x: (Math.random() - 0.5) * TERRAIN_SIZE * 0.7,
          z: (Math.random() - 0.5) * TERRAIN_SIZE * 0.7,
        };
        spawnResource(thatType, thatAmount, pos);
      }
    }, 15000);
  }

  function spawnResource(type, amount, pos) {
    var mat = type === 'wood' ? new THREE.MeshStandardMaterial({ color: 0x6b4423 }) :
             type === 'stone' ? new THREE.MeshStandardMaterial({ color: 0x888899 }) :
             new THREE.MeshStandardMaterial({ color: 0x3a8a2a });
    var obj;
    if (type === 'wood') {
      obj = new THREE.Group();
      for (var j = 0; j < 3; j++) {
        var log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 5), mat);
        log.position.set((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3);
        obj.add(log);
      }
    } else if (type === 'stone') {
      obj = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.3, 0), mat);
    } else {
      obj = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), mat);
    }
    obj.position.set(pos.x, 0.05, pos.z);
    obj.userData = { type: type, amount: amount };
    E.scene.add(obj);
    resources3D.push(obj);
  }

  // ──────────────────────────────────────────────
  // ENEMIES
  // ──────────────────────────────────────────────

  function spawnInitialEnemies() {
    // Spawn some wildlife
    for (var i = 0; i < 8; i++) {
      spawnEnemy();
    }
  }

  function spawnEnemy() {
    var ex = (Math.random() - 0.5) * TERRAIN_SIZE * 0.6;
    var ez = (Math.random() - 0.5) * TERRAIN_SIZE * 0.6;
    if (Math.abs(ex) < 4 && Math.abs(ez) < 4) return;

    var isWolf = Math.random() < 0.5;
    var bodyMat = new THREE.MeshStandardMaterial({
      color: isWolf ? 0x665544 : 0x44aa44,
      roughness: 0.8,
    });

    var body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.8), bodyMat);
    body.position.set(ex, 0.2, ez);
    body.castShadow = true;
    body.userData = {
      isEnemy: true,
      isWolf: isWolf,
      hp: isWolf ? 30 : 20,
      maxHp: isWolf ? 30 : 20,
      speed: isWolf ? 3 : 2,
      damage: isWolf ? 8 : 4,
      state: 'idle',
      stateTimer: Math.random() * 3,
    };
    E.scene.add(body);

    // Head
    var headMat = new THREE.MeshStandardMaterial({
      color: isWolf ? 0x887766 : 0x55bb55,
    });
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), headMat);
    head.position.set(isWolf ? 0.25 : 0.2, 0.35, isWolf ? 0.3 : 0.2);
    body.add(head);

    enemies.push(body);
  }

  function updateEnemies(dt) {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      var data = e.userData;
      if (data.hp <= 0) {
        E.scene.remove(e);
        enemies.splice(i, 1);
        continue;
      }

      data.stateTimer -= dt;
      var toPlayer = new THREE.Vector3(
        player.group.position.x - e.position.x,
        0,
        player.group.position.z - e.position.z
      );
      var dist = toPlayer.length();

      switch (data.state) {
        case 'idle':
          if (dist < 10) data.state = 'alert';
          else if (data.stateTimer <= 0) {
            // Wander
            e.position.x += (Math.random() - 0.5) * 2 * dt;
            e.position.z += (Math.random() - 0.5) * 2 * dt;
            var bound = TERRAIN_SIZE / 2 - 2;
            e.position.x = Math.max(-bound, Math.min(bound, e.position.x));
            e.position.z = Math.max(-bound, Math.min(bound, e.position.z));
            data.stateTimer = 2 + Math.random() * 2;
          }
          break;

        case 'alert':
          if (dist > 15) data.state = 'idle';
          else if (data.isWolf) {
            // Wolves attack
            data.state = 'chase';
          } else {
            // Prey flee
            data.state = 'flee';
          }
          break;

        case 'chase':
          if (dist > 20) data.state = 'idle';
          else if (dist < 2) {
            // Attack player
            if (data.stateTimer <= 0) {
              health -= data.damage;
              damageFlash = 0.3;
              E.playBeep(150, 0.15, 'sawtooth', 0.2);
              data.stateTimer = 1;
            }
          } else {
            var move = data.speed * dt;
            e.position.x += (toPlayer.x / dist) * move;
            e.position.z += (toPlayer.z / dist) * move;
          }
          break;

        case 'flee':
          if (dist > 20) data.state = 'idle';
          else {
            var move2 = data.speed * 1.5 * dt;
            e.position.x -= (toPlayer.x / dist) * move2;
            e.position.z -= (toPlayer.z / dist) * move2;
          }
          break;
      }

      // Face movement direction
      if (data.state === 'chase' || data.state === 'flee') {
        e.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        if (data.state === 'flee') e.rotation.y += Math.PI;
      }
    }

    // Respawn enemies if too few
    if (enemies.length < 5 && Math.random() < 0.01) {
      spawnEnemy();
    }
  }

  // ──────────────────────────────────────────────
  // HUD
  // ──────────────────────────────────────────────

  var damageFlash = 0;
  var hudContainer = null;

  function buildHUD() {
    clearHUD();
    hudContainer = E.createHUD('\
      <div id="wf-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">\
        <div style="position:absolute;bottom:30px;left:20px;">\
          <div style="font-size:11px;color:#88aacc;">HP</div>\
          <div id="wf-health" style="width:150px;height:10px;background:rgba(0,0,0,0.5);border-radius:5px;overflow:hidden;">\
            <div id="wf-health-fill" style="width:100%;height:100%;background:linear-gradient(90deg,#ff4444,#44ff44);border-radius:5px;"></div>\
          </div>\
          <div style="margin-top:4px;font-size:10px;">\
            <span style="color:#ffaa44;">🍖 <span id="wf-hunger">100</span></span>\
            <span style="margin-left:10px;color:#44aaff;">💧 <span id="wf-thirst">100</span></span>\
            <span style="margin-left:10px;color:#88ff88;">⚡ <span id="wf-stamina">100</span></span>\
          </div>\
        </div>\
        <div id="wf-resources" style="position:absolute;bottom:30px;left:190px;font-size:11px;color:#aaa;">\
          <div>Wood: <span id="wf-wood">0</span>  Stone: <span id="wf-stone">0</span></div>\
          <div>Food: <span id="wf-food">0</span>  Water: <span id="wf-water">0</span></div>\
          <div>Metal: <span id="wf-metal">0</span>  Fiber: <span id="wf-fiber">0</span></div>\
        </div>\
        <div style="position:absolute;top:15px;left:50%;transform:translateX(-50%);text-align:center;">\
          <div id="wf-score" style="font-size:18px;font-weight:bold;">0</div>\
          <div id="wf-time" style="font-size:11px;color:#88aacc;">Day 1</div>\
        </div>\
        <div id="wf-msg" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:16px;color:#ffdd00;text-shadow:0 0 15px rgba(255,221,0,0.5);opacity:0;text-align:center;"></div>\
        <div id="wf-damage" style="position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center,transparent 60%,rgba(255,0,0,0.4) 100%);opacity:0;"></div>\
        <div id="wf-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">\
          <div style="font-size:36px;font-weight:bold;color:#44ff88;text-shadow:0 0 20px rgba(68,255,136,0.5);">WILD FRONTIER</div>\
          <div style="font-size:14px;color:#88aacc;margin-top:10px;">WASD move · CLICK gather/attack · E interact · Q craft</div>\
          <div style="font-size:12px;color:#666;margin-top:6px;">Survive, gather, craft, build!</div>\
          <div id="wf-start-btn" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#44ff88;color:#000;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO BEGIN</div>\
        </div>\
        <div id="wf-gameover" style="position:absolute;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);">\
          <div style="font-size:36px;font-weight:bold;color:#ff4444;">GAME OVER</div>\
          <div style="font-size:16px;color:#ffaa00;margin-top:10px;">SCORE: <span id="wf-final-score">0</span></div>\
          <div style="font-size:12px;color:#88aacc;">Days survived: <span id="wf-final-days">0</span></div>\
          <div id="wf-restart-btn" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#ff4444;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO RETRY</div>\
        </div>\
      </div>');
  }

  function clearHUD() {
    if (hudContainer && hudContainer.parentNode) {
      hudContainer.parentNode.removeChild(hudContainer);
      hudContainer = null;
    }
  }

  function showMessage(text, duration) {
    var el = document.getElementById('wf-msg');
    if (!el) return;
    el.textContent = text;
    el.style.opacity = 1;
    el.style.transition = 'opacity 0.5s';
    setTimeout(function () { el.style.opacity = 0; }, (duration || 2000));
  }

  function updateHUD() {
    if (!player) return;
    document.getElementById('wf-health-fill').style.width = Math.max(0, health) + '%';
    document.getElementById('wf-hunger').textContent = Math.max(0, Math.round(hunger));
    document.getElementById('wf-thirst').textContent = Math.max(0, Math.round(thirst));
    document.getElementById('wf-stamina').textContent = Math.max(0, Math.round(stamina));
    document.getElementById('wf-score').textContent = score;

    for (var r in resources) {
      var el = document.getElementById('wf-' + r);
      if (el) el.textContent = resources[r];
    }

    var day = Math.floor(playTime / dayLength) + 1;
    document.getElementById('wf-time').textContent = 'Day ' + day;

    var dmgEl = document.getElementById('wf-damage');
    if (damageFlash > 0) {
      dmgEl.style.opacity = Math.min(0.6, damageFlash * 2);
      damageFlash -= 0.016;
    } else {
      dmgEl.style.opacity = 0;
    }

    if (state === 'ready') {
      var btn = document.getElementById('wf-start-btn');
      var p = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
      btn.style.transform = 'scale(' + (1 + p * 0.05) + ')';
    }
  }

  // ──────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────

  function update(dt, input) {
    if (state === 'ready') {
      if (input.action) { state = 'playing';
        document.getElementById('wf-ready').style.display = 'none';
        showMessage('Welcome to Wild Frontier! Gather resources to survive.', 3000); }
      updateHUD();
      return;
    }

    if (state === 'gameover') {
      updateHUD();
      if (input.action) init(E);
      return;
    }

    playTime += dt;

    // Stats decay
    hunger -= 1.5 * dt;
    thirst -= 2 * dt;
    if (hunger <= 0) { health -= 3 * dt; hunger = 0; }
    if (thirst <= 0) { health -= 4 * dt; thirst = 0; }

    // Stamina regen
    if (stamina < maxStamina) stamina += 8 * dt;

    // Player movement
    updatePlayerMovement(dt, input);

    // Player interaction
    if (input.shoot || input.action) {
      handleInteraction(input);
    }

    // Crafting
    if (input.keysPressed['KeyQ']) {
      openCrafting();
    }

    // Enemies
    updateEnemies(dt);

    // Sky
    updateSky(dt);

    // Camera
    updateCamera(dt);

    // HUD
    updateHUD();

    // Death check
    if (health <= 0) {
      health = 0;
      state = 'gameover';
      document.getElementById('wf-gameover').style.display = 'flex';
      document.getElementById('wf-final-score').textContent = score;
      document.getElementById('wf-final-days').textContent = Math.floor(playTime / dayLength) + 1;
    }
  }

  function updatePlayerMovement(dt, input) {
    if (!player) return;
    var dx = 0, dz = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dz -= 1;
    if (input.down) dz += 1;

    if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

    var yaw = player.yaw;
    var worldDx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    var worldDz = dx * Math.sin(yaw) + dz * Math.cos(yaw);

    var speed = player.speed * (1 + 0.3 * (input.keys['ShiftLeft'] || input.keys['ShiftRight'] ? 1 : 0));
    if (input.keys['ShiftLeft'] || input.keys['ShiftRight']) stamina -= 10 * dt;

    var bound = TERRAIN_SIZE / 2 - 1;
    var newX = player.group.position.x + worldDx * speed * dt;
    var newZ = player.group.position.z + worldDz * speed * dt;
    newX = Math.max(-bound, Math.min(bound, newX));
    newZ = Math.max(-bound, Math.min(bound, newZ));
    player.group.position.x = newX;
    player.group.position.z = newZ;

    // Rotate player toward movement direction
    if (dx !== 0 || dz !== 0) {
      var targetAngle = Math.atan2(worldDx, worldDz);
      player.group.rotation.y = targetAngle;
    }

    // Mouse look (yaw) — rotate camera around player
    if (input.pointerLocked) {
      player.yaw -= input.mouseDeltaX * 0.003;
      player.pitch -= input.mouseDeltaY * 0.003;
      player.pitch = Math.max(-0.8, Math.min(0.5, player.pitch));
    }
  }

  function handleInteraction(input) {
    if (!player) return;

    // Check nearby resources
    var origin = player.group.position.clone();
    origin.y += 0.5;

    for (var i = 0; i < resources3D.length; i++) {
      var res = resources3D[i];
      var dist = origin.distanceTo(res.position);
      if (dist < 2.5) {
        gatherResource(res);
        return;
      }
    }

    // Check nearby enemies
    for (var ei = 0; ei < enemies.length; ei++) {
      var e = enemies[ei];
      var dist2 = origin.distanceTo(e.position);
      if (dist2 < 2.5) {
        e.userData.hp -= 15;
        E.playBeep(400, 0.08, 'square', 0.15);
        E.emitParticles(E.getPlugin('particles') ? null : null, e.position, 3);
        if (e.userData.hp <= 0) {
          score += e.userData.isWolf ? 30 : 15;
          resources.food = (resources.food || 0) + 1;
          showMessage((e.userData.isWolf ? 'Wolf' : 'Deer') + ' defeated! +Food', 1500);
        }
        return;
      }
    }
  }

  function openCrafting() {
    // Simple crafting: check recipes and apply if resources available
    var available = [];
    for (var recipe in recipes) {
      var r = recipes[recipe];
      var canCraft = true;
      for (var mat in r) {
        if (mat === 'label') continue;
        if ((resources[mat] || 0) < r[mat]) { canCraft = false; break; }
      }
      if (canCraft) available.push(recipe);
    }

    if (available.length > 0) {
      var chosen = available[0]; // Auto-craft first available
      var recipe = recipes[chosen];
      for (var mat2 in recipe) {
        if (mat2 === 'label') continue;
        resources[mat2] -= recipe[mat2];
      }
      score += 50;
      showMessage('Crafted: ' + recipe.label, 2000);
      E.playBeep(800, 0.15, 'sine', 0.2);

      // Special effects for certain crafts
      if (chosen === 'bandage') health = Math.min(maxHealth, health + 25);
    } else {
      showMessage('Not enough resources to craft!', 1500);
    }
  }

  // ──────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────

  function render3D() {
    if (E.renderer && E.scene && E.camera) {
      E.renderer.render(E.scene, E.camera);
    }
  }

  function render2D(ctx) {}

  // ──────────────────────────────────────────────
  // DESTROY
  // ──────────────────────────────────────────────

  function destroy() {
    clearHUD();
    if (player) {
      if (player.group) E.scene.remove(player.group);
      if (player.camPivot) E.scene.remove(player.camPivot);
    }
    if (terrain) E.scene.remove(terrain);
    if (skySphere) E.scene.remove(skySphere);
    if (sunLight) E.scene.remove(sunLight);
    if (ambientLight) E.scene.remove(ambientLight);
    for (var i = 0; i < resources3D.length; i++) E.scene.remove(resources3D[i]);
    for (var j = 0; j < enemies.length; j++) E.scene.remove(enemies[j]);
    for (var k = 0; k < buildings.length; k++) E.scene.remove(buildings[k]);
    resources3D = []; enemies = []; buildings = [];
    player = null;
    E = null;
    THREE = null;
  }

  // ──────────────────────────────────────────────
  // EXPORT
  // ──────────────────────────────────────────────

  window.WildFrontier = {
    init: init,
    update: update,
    render3D: render3D,
    render2D: render2D,
    destroy: destroy,
    name: 'Wild Frontier',
    description: '3D Survival — Gather, craft, build, and survive in the wilderness',
    genre: 'survival',
  };

  console.log('[WildFrontier] Loaded. Survive the wild!');
})();
