/**
 * Shadow Realm — 3D Action RPG
 *
 * Third-person action RPG with dungeon crawling, boss fights,
 * loot system, skill tree, XP progression, and elemental magic.
 *
 * @license MIT
 * @version 1.0.0
 */

(function () {
  'use strict';

  var E = null;
  var THREE = null;

  var state = 'ready';
  var level = 1;
  var xp = 0;
  var xpToNext = 100;
  var health = 100;
  var maxHealth = 100;
  var mana = 50;
  var maxMana = 50;
  var stamina = 100;
  var maxStamina = 100;
  var gold = 0;
  var dungeonLevel = 1;
  var maxDungeonLevels = 10;
  var score = 0;
  var playTime = 0;

  var stats = { strength: 5, dexterity: 5, intelligence: 5, vitality: 5 };
  var skillPoints = 0;
  var skills = {
    fireball: { name: 'Fireball', unlocked: true, level: 1, maxLevel: 5, manaCost: 10, damage: 25 },
    heal: { name: 'Heal', unlocked: true, level: 1, maxLevel: 5, manaCost: 15, healAmt: 20 },
    lightning: { name: 'Lightning', unlocked: false, level: 0, maxLevel: 5, manaCost: 20, damage: 35 },
    shield: { name: 'Magic Shield', unlocked: false, level: 0, maxLevel: 3, manaCost: 25, duration: 5 },
  };

  var inventory = [];
  var equipped = { weapon: null, armor: null, ring: null };

  var player, dungeon, enemies, loot, projectiles;
  var hudContainer = null;
  var dmgFlash = 0;

  function init(engine) {
    E = engine; THREE = engine.THREE;
    if (!THREE) return;
    resetState(); buildPlayer(); buildDungeon(); buildHUD();
    spawnEnemies(); state = 'ready';
    E.emit('gameReady', { name: 'Shadow Realm' });
  }

  function resetState() {
    level = 1; xp = 0; health = 100; mana = 50; stamina = 100;
    gold = 0; dungeonLevel = 1; score = 0; playTime = 0;
    stats = { strength: 5, dexterity: 5, intelligence: 5, vitality: 5 };
    skillPoints = 1;
    skills.fireball.unlocked = true; skills.heal.unlocked = true;
    skills.lightning.unlocked = false; skills.shield.unlocked = false;
    inventory = []; equipped = { weapon: null, armor: null, ring: null };
    enemies = []; loot = []; projectiles = [];
  }

  function buildPlayer() {
    var group = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({ color: 0x4444aa, roughness: 0.5, metalness: 0.3 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), bodyMat);
    body.position.y = 0.9; body.castShadow = true; group.add(body);

    var headMat = new THREE.MeshStandardMaterial({ color: 0xddbb88 });
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), headMat);
    head.position.set(0, 1.55, 0); group.add(head);

    var shoulderMat = new THREE.MeshStandardMaterial({ color: 0x6666cc, metalness: 0.6 });
    for (var s = -1; s <= 1; s += 2) {
      var sh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), shoulderMat);
      sh.position.set(s * 0.4, 1.25, 0); group.add(sh);
    }

    group.position.set(0, 0, 0); E.scene.add(group);

    // Weapon (sword)
    var swordMat = new THREE.MeshStandardMaterial({ color: 0xccccdd, metalness: 0.8, roughness: 0.2 });
    var blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), swordMat);
    blade.position.set(0.35, 0.7, 0.15);
    blade.rotation.x = 0.3; group.add(blade);
    var handleMat = new THREE.MeshStandardMaterial({ color: 0x4a3520 });
    var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 5), handleMat);
    handle.position.set(0.35, 0.4, 0.15); group.add(handle);

    // Third person camera
    player = { group: group, yaw: 0, pitch: -0.3, speed: 6, attackTimer: 0, attacking: false, comboCount: 0, invincible: 0 };
    cameraPivot = new THREE.Object3D(); E.scene.add(cameraPivot);
  }

  var cameraPivot = null;

  function updateCamera(dt) {
    if (!player) return;
    var behind = new THREE.Vector3(0, 4, 7);
    var yaw = player.yaw;
    var rotated = new THREE.Vector3(
      behind.x * Math.cos(yaw) - behind.z * Math.sin(yaw),
      behind.y,
      behind.x * Math.sin(yaw) + behind.z * Math.cos(yaw)
    );
    var target = player.group.position.clone().add(rotated);
    E.camera.position.lerp(target, 4 * dt);
    var lookAt = player.group.position.clone(); lookAt.y += 1.2;
    E.camera.lookAt(lookAt);
  }

  function buildDungeon() {
    if (dungeon) E.scene.remove(dungeon);
    dungeon = new THREE.Group();

    var size = 30 + dungeonLevel * 3;
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x3a2a4a, roughness: 0.8, metalness: 0.2 });
    var floorMat = new THREE.MeshStandardMaterial({ color: 0x2a1a3a, roughness: 0.9 });

    // Floor
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.05; floor.receiveShadow = true;
    dungeon.add(floor);

    // Grid lines
    var grid = new THREE.GridHelper(size, 10, 0x6644aa, 0x442266);
    grid.position.y = 0.01; dungeon.add(grid);

    // Walls
    var wallH = 4;
    var wallPos = [
      { x: 0, z: -size / 2, ry: 0 }, { x: 0, z: size / 2, ry: 0 },
      { x: -size / 2, z: 0, ry: Math.PI / 2 }, { x: size / 2, z: 0, ry: Math.PI / 2 },
    ];
    for (var i = 0; i < wallPos.length; i++) {
      var w = new THREE.Mesh(new THREE.BoxGeometry(size, wallH, 1), wallMat);
      w.position.set(wallPos[i].x, wallH / 2, wallPos[i].z);
      w.rotation.y = wallPos[i].ry; w.castShadow = true; w.receiveShadow = true;
      dungeon.add(w);
    }

    // Pillars
    var pillarMat = new THREE.MeshStandardMaterial({ color: 0x4a3a5a, roughness: 0.7, metalness: 0.3 });
    for (var pi = 0; pi < 8; pi++) {
      var a = (pi / 8) * Math.PI * 2;
      var r = size * 0.3;
      var p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, wallH, 6), pillarMat);
      p.position.set(Math.cos(a) * r, wallH / 2, Math.sin(a) * r);
      p.castShadow = true; dungeon.add(p);

      // Torch
      var torchMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
      var torch = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), torchMat);
      torch.position.set(Math.cos(a) * r, wallH - 0.3, Math.sin(a) * r);
      dungeon.add(torch);
      var light = new THREE.PointLight(0xff6600, 0.3, 5);
      light.position.copy(torch.position); dungeon.add(light);
    }

    // Exit portal
    var portalMat = new THREE.MeshBasicMaterial({
      color: 0xaa44ff, transparent: true, opacity: 0.6,
      side: THREE.DoubleSide,
    });
    var portal = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.1, 8, 16), portalMat);
    portal.position.set(0, 1.5, -size / 2 + 2);
    portal.userData.isPortal = true;
    dungeon.add(portal);

    E.scene.add(dungeon);
  }

  function spawnEnemies() {
    for (var i = enemies.length - 1; i >= 0; i--) E.scene.remove(enemies[i]);
    enemies = [];

    var size = 30 + dungeonLevel * 3;
    var count = 3 + dungeonLevel * 2;

    for (var i = 0; i < count; i++) {
      var isBoss = (i === count - 1 && dungeonLevel % 3 === 0);
      var hp = 20 + dungeonLevel * 10 + (isBoss ? 80 : 0);
      var color = isBoss ? 0xff2222 : (Math.random() < 0.5 ? 0x8844aa : 0xaa4488);

      var bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.7), bodyMat);
      body.castShadow = true;
      body.userData = {
        hp: hp, maxHp: hp, damage: 5 + dungeonLevel * 3 + (isBoss ? 15 : 0),
        speed: 2 + Math.random() * 2, score: 30 + dungeonLevel * 20 + (isBoss ? 200 : 0),
        state: 'idle', timer: Math.random() * 2, isBoss: isBoss, dropGold: 5 + dungeonLevel * 3,
      };

      var angle = Math.random() * Math.PI * 2;
      var dist = 2 + Math.random() * (size * 0.35);
      body.position.set(Math.cos(angle) * dist, 0.5, Math.sin(angle) * dist);

      // Eyes
      if (isBoss) {
        var eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        for (var e = -1; e <= 1; e += 2) {
          var eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat);
          eye.position.set(e * 0.2, 0.2, 0.4); body.add(eye);
        }
        body.scale.set(1.5, 1.5, 1.5);
      }

      E.scene.add(body);
      enemies.push(body);
    }
  }

  function buildHUD() {
    clearHUD();
    hudContainer = E.createHUD('\
      <div id="sr-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">\
        <div style="position:absolute;bottom:30px;left:20px;">\
          <div style="font-size:10px;color:#ff4444;">HP <span id="sr-hp-val">100</span>/<span id="sr-hp-max">100</span></div>\
          <div style="width:180px;height:8px;background:rgba(0,0,0,0.5);border-radius:4px;overflow:hidden;">\
            <div id="sr-hp-fill" style="width:100%;height:100%;background:linear-gradient(90deg,#ff4444,#ff6688);border-radius:4px;"></div>\
          </div>\
          <div style="margin-top:4px;font-size:10px;color:#4488ff;">MP <span id="sr-mp-val">50</span>/<span id="sr-mp-max">50</span></div>\
          <div style="width:180px;height:6px;background:rgba(0,0,0,0.5);border-radius:3px;overflow:hidden;">\
            <div id="sr-mp-fill" style="width:100%;height:100%;background:linear-gradient(90deg,#4444ff,#4488ff);border-radius:3px;"></div>\
          </div>\
        </div>\
        <div style="position:absolute;bottom:30px;right:20px;text-align:right;">\
          <div style="font-size:12px;">LVL <span id="sr-lvl">1</span></div>\
          <div style="width:120px;height:4px;background:rgba(0,0,0,0.5);border-radius:2px;margin-left:auto;">\
            <div id="sr-xp-fill" style="width:0%;height:100%;background:#ffdd00;border-radius:2px;"></div>\
          </div>\
          <div style="font-size:9px;color:#ffdd00;margin-top:2px;">GOLD: <span id="sr-gold">0</span></div>\
        </div>\
        <div style="position:absolute;top:15px;left:50%;transform:translateX(-50%);text-align:center;">\
          <div id="sr-title" style="font-size:16px;font-weight:bold;">SHADOW REALM</div>\
          <div id="sr-dlevel" style="font-size:11px;color:#aa88cc;">Dungeon <span id="sr-dlvl">1</span>/10</div>\
        </div>\
        <div id="sr-msg" style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);font-size:16px;color:#ffdd00;text-shadow:0 0 15px rgba(255,221,0,0.5);opacity:0;"></div>\
        <div id="sr-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">\
          <div style="font-size:36px;font-weight:bold;color:#aa44ff;text-shadow:0 0 20px rgba(170,68,255,0.5);">SHADOW REALM</div>\
          <div style="font-size:14px;color:#cc88ff;margin-top:10px;">WASD move · CLICK attack · 1/2/3 skills · E interact</div>\
          <div style="font-size:12px;color:#666;margin-top:6px;">Clear 10 dungeon levels. Defeat the final boss!</div>\
          <div id="sr-start-btn" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#aa44ff;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO ENTER</div>\
        </div>\
        <div id="sr-complete" style="position:absolute;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);">\
          <div style="font-size:36px;font-weight:bold;color:#ffdd00;text-shadow:0 0 30px rgba(255,221,0,0.5);">DUNGEON CLEAR!</div>\
          <div style="font-size:16px;color:#fff;margin-top:10px;">SCORE: <span id="sr-final-score">0</span></div>\
          <div style="font-size:12px;color:#88aacc;">Level <span id="sr-final-lvl">1</span> · Gold <span id="sr-final-gold">0</span></div>\
          <div id="sr-next-btn" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#ffaa00;color:#000;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO ADVANCE</div>\
        </div>\
        <div id="sr-dmg" style="position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse,transparent 60%,rgba(255,0,0,0.3) 100%);opacity:0;"></div>\
      </div>');
  }

  function clearHUD() {
    if (hudContainer && hudContainer.parentNode) hudContainer.parentNode.removeChild(hudContainer);
    hudContainer = null;
  }

  function msg(text, dur) {
    var el = document.getElementById('sr-msg');
    if (!el) return;
    el.textContent = text; el.style.opacity = 1;
    setTimeout(function () { el.style.opacity = 0; }, dur || 2000);
  }

  function updateHUD() {
    document.getElementById('sr-hp-val').textContent = Math.ceil(health);
    document.getElementById('sr-hp-max').textContent = maxHealth;
    document.getElementById('sr-hp-fill').style.width = (health / maxHealth * 100) + '%';
    document.getElementById('sr-mp-val').textContent = Math.ceil(mana);
    document.getElementById('sr-mp-max').textContent = maxMana;
    document.getElementById('sr-mp-fill').style.width = (mana / maxMana * 100) + '%';
    document.getElementById('sr-lvl').textContent = level;
    document.getElementById('sr-xp-fill').style.width = (xp / xpToNext * 100) + '%';
    document.getElementById('sr-gold').textContent = gold;
    document.getElementById('sr-dlvl').textContent = dungeonLevel;

    var dmgEl = document.getElementById('sr-dmg');
    if (dmgFlash > 0) { dmgEl.style.opacity = Math.min(0.5, dmgFlash); dmgFlash -= 0.016; }
    else dmgEl.style.opacity = 0;

    if (state === 'ready') {
      var btn = document.getElementById('sr-start-btn');
      var p = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
      btn.style.transform = 'scale(' + (1 + p * 0.05) + ')';
    }
  }

  function update(dt, input) {
    if (state === 'ready') {
      if (input.action) { state = 'playing';
        document.getElementById('sr-ready').style.display = 'none';
        msg('Dungeon Level ' + dungeonLevel + ' — Find the exit!', 2500); }
      updateHUD(); return;
    }
    if (state === 'complete') {
      updateHUD();
      if (input.action) {
        if (dungeonLevel >= maxDungeonLevels) { init(E); return; }
        dungeonLevel++; buildDungeon(); spawnEnemies(); state = 'playing';
        document.getElementById('sr-complete').style.display = 'none';
        msg('Dungeon Level ' + dungeonLevel, 2000);
        health = Math.min(maxHealth, health + 30);
        mana = Math.min(maxMana, mana + 20);
      }
      return;
    }

    playTime += dt;
    if (player.invincible > 0) player.invincible -= dt;
    if (player.attackTimer > 0) player.attackTimer -= dt;

    // Movement
    var dx = 0, dz = 0;
    if (input.left) dx -= 1; if (input.right) dx += 1;
    if (input.up) dz -= 1; if (input.down) dz += 1;
    if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

    var yaw = player.yaw;
    var wdx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    var wdz = dx * Math.sin(yaw) + dz * Math.cos(yaw);

    var size = 30 + dungeonLevel * 3;
    var bound = size / 2 - 1;
    player.group.position.x = Math.max(-bound, Math.min(bound, player.group.position.x + wdx * player.speed * dt));
    player.group.position.z = Math.max(-bound, Math.min(bound, player.group.position.z + wdz * player.speed * dt));

    if (dx !== 0 || dz !== 0) player.group.rotation.y = Math.atan2(wdx, wdz);

    // Mouse look
    if (input.pointerLocked) {
      player.yaw -= input.mouseDeltaX * 0.003;
      player.pitch = Math.max(-0.5, Math.min(0.5, player.pitch - input.mouseDeltaY * 0.003));
    }

    // Attack
    if (input.shoot && player.attackTimer <= 0 && !player.attacking) {
      player.attacking = true; player.attackTimer = 0.4;
      player.comboCount = (player.comboCount + 1) % 3;
      E.playBeep(500 + player.comboCount * 100, 0.1, 'square', 0.15);

      var origin = player.group.position.clone(); origin.y += 0.8;
      for (var i = enemies.length - 1; i >= 0; i--) {
        var e = enemies[i];
        if (origin.distanceTo(e.position) < 2.5) {
          var dmg = 10 + stats.strength * 2 + (player.comboCount * 5);
          e.userData.hp -= dmg;
          score += dmg;
          if (e.userData.hp <= 0) {
            var xpGain = 20 + dungeonLevel * 10 + (e.userData.isBoss ? 100 : 0);
            xp += xpGain; gold += e.userData.dropGold || 5;
            score += e.userData.score;
            E.scene.remove(e); enemies.splice(i, 1);
            E.playBeep(300, 0.15, 'sawtooth', 0.2);
            msg('+' + xpGain + ' XP +' + (e.userData.dropGold || 5) + ' Gold', 1500);
            checkLevelUp();
          } else {
            e.userData.timer = 0.2;
            e.material.color.setHex(0xffffff);
            var that = e;
            setTimeout(function () { if (that.material) that.material.color.setHex(0x8844aa); }, 100);
          }
          break;
        }
      }
      setTimeout(function () { if (player) player.attacking = false; }, 400);
    }

    // Skills
    if (input.keysPressed['Digit1'] && skills.fireball.unlocked) useSkill('fireball');
    if (input.keysPressed['Digit2'] && skills.heal.unlocked) useSkill('heal');

    // Mana regen
    if (mana < maxMana) mana += 2 * dt;

    // Enemies
    for (var ei = enemies.length - 1; ei >= 0; ei--) {
      var e = enemies[ei];
      e.userData.timer -= dt;
      var tp = player.group.position;
      var dx2 = tp.x - e.position.x, dz2 = tp.z - e.position.z;
      var dist = Math.sqrt(dx2 * dx2 + dz2 * dz2);

      if (e.userData.timer <= 0 && dist < 12) {
        var spd = e.userData.speed * dt;
        e.position.x += (dx2 / dist) * spd;
        e.position.z += (dz2 / dist) * spd;
        e.rotation.y = Math.atan2(dx2, dz2);
      }

      if (dist < 1.5 && player.invincible <= 0) {
        health -= e.userData.damage;
        dmgFlash = 0.3;
        player.invincible = 0.5;
        E.playBeep(150, 0.1, 'sawtooth', 0.2);
        if (health <= 0) {
          health = 0; state = 'ready';
          msg('Defeated! Try again.', 2000);
          setTimeout(function () {
            if (E) init(E);
          }, 1500);
        }
      }

      // Enemy boundary
      var b2 = size / 2 - 2;
      e.position.x = Math.max(-b2, Math.min(b2, e.position.x));
      e.position.z = Math.max(-b2, Math.min(b2, e.position.z));
    }

    // Check dungeon clear
    if (enemies.length === 0) {
      state = 'complete';
      document.getElementById('sr-complete').style.display = 'flex';
      document.getElementById('sr-final-score').textContent = score;
      document.getElementById('sr-final-lvl').textContent = level;
      document.getElementById('sr-final-gold').textContent = gold;
      E.playSynth([
        { freq: 523, duration: 0.15, delay: 0, type: 'sine', volume: 0.2 },
        { freq: 659, duration: 0.15, delay: 0.15, type: 'sine', volume: 0.2 },
        { freq: 784, duration: 0.3, delay: 0.3, type: 'sine', volume: 0.3 },
      ]);
    }

    updateCamera(dt);
    updateHUD();
  }

  function useSkill(skillId) {
    var skill = skills[skillId];
    if (!skill || mana < skill.manaCost) return;
    mana -= skill.manaCost;

    if (skillId === 'fireball') {
      // Fireball projectile toward nearest enemy
      var nearest = null, nearDist = Infinity;
      for (var i = 0; i < enemies.length; i++) {
        var d = player.group.position.distanceTo(enemies[i].position);
        if (d < nearDist) { nearDist = d; nearest = enemies[i]; }
      }
      if (nearest) {
        var dmg = skill.damage + stats.intelligence * 3;
        nearest.userData.hp -= dmg;
        score += dmg;
        E.playBeep(200, 0.2, 'sawtooth', 0.25);
        if (nearest.userData.hp <= 0) {
          xp += 30; gold += nearest.userData.dropGold || 5;
          score += nearest.userData.score;
          E.scene.remove(nearest);
          var idx = enemies.indexOf(nearest);
          if (idx >= 0) enemies.splice(idx, 1);
          checkLevelUp();
        }
      }
    } else if (skillId === 'heal') {
      health = Math.min(maxHealth, health + skill.healAmt + stats.vitality * 2);
      E.playBeep(800, 0.2, 'sine', 0.2);
    }
  }

  function checkLevelUp() {
    if (xp >= xpToNext) {
      xp -= xpToNext;
      level++;
      xpToNext = Math.floor(100 * Math.pow(1.15, level));
      maxHealth = 100 + level * 10;
      health = maxHealth;
      maxMana = 50 + level * 5;
      mana = maxMana;
      skillPoints++;
      score += 200;
      msg('LEVEL UP! You are now level ' + level + '!', 2500);
      E.playSynth([
        { freq: 523, duration: 0.1, delay: 0, type: 'sine', volume: 0.3 },
        { freq: 659, duration: 0.1, delay: 0.1, type: 'sine', volume: 0.3 },
        { freq: 784, duration: 0.1, delay: 0.2, type: 'sine', volume: 0.3 },
        { freq: 1047, duration: 0.3, delay: 0.3, type: 'sine', volume: 0.4 },
      ]);

      // Auto-assign skill point
      if (skillPoints > 0 && !skills.lightning.unlocked && level >= 3) {
        skills.lightning.unlocked = true;
        msg('New skill unlocked: Lightning!', 2000);
      }
      if (skillPoints > 0 && !skills.shield.unlocked && level >= 5) {
        skills.shield.unlocked = true;
        msg('New skill unlocked: Magic Shield!', 2000);
      }
    }
  }

  function render3D() {
    if (E.renderer && E.scene && E.camera) E.renderer.render(E.scene, E.camera);
  }
  function render2D(ctx) {}

  function destroy() {
    clearHUD();
    if (player && player.group) E.scene.remove(player.group);
    if (cameraPivot) E.scene.remove(cameraPivot);
    if (dungeon) E.scene.remove(dungeon);
    for (var i = 0; i < enemies.length; i++) E.scene.remove(enemies[i]);
    enemies = [];
    player = null; E = null; THREE = null;
  }

  window.ShadowRealm = {
    init: init, update: update, render3D: render3D, render2D: render2D, destroy: destroy,
    name: 'Shadow Realm', description: '3D Action RPG — Dungeon crawl, level up, defeat bosses', genre: 'rpg',
  };
  console.log('[ShadowRealm] Loaded. Enter the dungeon!');
})();
