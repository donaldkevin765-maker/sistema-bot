/**
 * Titan Wars — 3D Mech Combat
 *
 * Pilot customizable mechs in wave-based arena combat.
 * Features: heat management, weapon loadouts, shield system,
 * enemy mechs, upgrade system between waves, and destructible environments.
 *
 * @license MIT
 * @version 1.0.0
 */

(function () {
  'use strict';

  var E = null;
  var THREE = null;

  var state = 'ready';
  var health = 200;
  var maxHealth = 200;
  var shield = 100;
  var maxShield = 100;
  var heat = 0;
  var maxHeat = 100;
  var energy = 100;
  var maxEnergy = 100;
  var score = 0;
  var wave = 0;
  var kills = 0;
  var playTime = 0;
  var credits = 0;

  var weapons = {
    cannon: { name: 'Plasma Cannon', damage: 30, heatPerShot: 15, fireRate: 0.6, energyCost: 5, color: 0xff4444, type: 'cannon' },
    laser: { name: 'Laser Beam', damage: 12, heatPerShot: 5, fireRate: 0.12, energyCost: 2, color: 0x44ff44, type: 'laser' },
    missiles: { name: 'Missile Pod', damage: 50, heatPerShot: 25, fireRate: 1.2, energyCost: 10, color: 0xffaa44, type: 'missile' },
  };
  var currentWeapon = 'cannon';
  var weaponList = ['cannon', 'laser', 'missiles'];
  var weaponIndex = 0;
  var fireTimer = 0;

  var mech, arena, enemies, projectiles;
  var hudContainer = null;
  var damageFlash = 0;
  var overheatTimer = 0;

  function init(engine) {
    E = engine; THREE = engine.THREE;
    if (!THREE) return;
    resetState(); buildArena(); buildMech(); buildHUD();
    state = 'ready';
    E.emit('gameReady', { name: 'Titan Wars' });
  }

  function resetState() {
    health = 200; shield = 100; heat = 0; energy = 100;
    score = 0; wave = 0; kills = 0; playTime = 0; credits = 0;
    weaponIndex = 0; currentWeapon = 'cannon'; fireTimer = 0;
    overheatTimer = 0; enemies = []; projectiles = [];
  }

  function buildArena() {
    if (arena) E.scene.remove(arena);
    arena = new THREE.Group();
    var S = 30;

    // Floor
    var floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8, metalness: 0.3 });
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, S * 2), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.05; floor.receiveShadow = true;
    arena.add(floor);

    // Grid
    var grid = new THREE.GridHelper(S * 2, 20, 0x4466ff, 0x2233aa);
    grid.position.y = 0.01; arena.add(grid);

    // Walls
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4a, roughness: 0.6, metalness: 0.4 });
    var H = 8;
    for (var i = 0; i < 4; i++) {
      var a = (i / 4) * Math.PI * 2;
      var w = new THREE.Mesh(new THREE.BoxGeometry(S * 2, H, 1.5), wallMat);
      w.position.set(Math.cos(a) * S, H / 2, Math.sin(a) * S);
      w.rotation.y = -a;
      w.castShadow = true; w.receiveShadow = true;
      arena.add(w);

      // Neon strip
      var neon = new THREE.Mesh(
        new THREE.BoxGeometry(S * 2 - 2, 0.1, 1.7),
        new THREE.MeshBasicMaterial({ color: 0x4466ff })
      );
      neon.position.set(Math.cos(a) * S, 0.3, Math.sin(a) * S);
      neon.rotation.y = -a;
      arena.add(neon);
    }

    // Obstacles (cover)
    var coverMat = new THREE.MeshStandardMaterial({ color: 0x3a3a5a, roughness: 0.7 });
    var coverPos = [
      [-6, -5], [8, 6], [-4, 10], [7, -8], [-10, 3], [5, -3], [-2, -9], [9, 2], [-7, 7], [3, -6]
    ];
    for (var ci = 0; ci < coverPos.length; ci++) {
      var c = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 1.5), coverMat);
      c.position.set(coverPos[ci][0], 1.25, coverPos[ci][1]);
      c.castShadow = true; c.receiveShadow = true;
      arena.add(c);
    }

    E.scene.add(arena);
  }

  function buildMech() {
    var group = new THREE.Group();

    // Legs
    var legMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.5, metalness: 0.7 });
    for (var s = -1; s <= 1; s += 2) {
      var thigh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), legMat);
      thigh.position.set(s * 0.6, 0.3, 0); group.add(thigh);
      var shin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), legMat);
      shin.position.set(s * 0.6, 0.85, 0); group.add(shin);
      var foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.7), legMat);
      foot.position.set(s * 0.6, 0.08, 0.15); group.add(foot);
    }

    // Torso
    var torsoMat = new THREE.MeshStandardMaterial({ color: 0x556688, roughness: 0.3, metalness: 0.8 });
    var torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), torsoMat);
    torso.position.y = 1.2; torso.castShadow = true; group.add(torso);

    // Shoulders
    var shMat = new THREE.MeshStandardMaterial({ color: 0x667799, metalness: 0.8 });
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      var sh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), shMat);
      sh.position.set(s2 * 0.8, 1.5, 0); group.add(sh);
    }

    // Head
    var headMat = new THREE.MeshStandardMaterial({ color: 0x7788aa, metalness: 0.6 });
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), headMat);
    head.position.y = 1.85; group.add(head);

    // Visor (glowing)
    var visorMat = new THREE.MeshBasicMaterial({ color: 0x44aaff });
    var visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), visorMat);
    visor.position.set(0, 1.8, 0.3); group.add(visor);

    // Weapon arm
    var armMat = new THREE.MeshStandardMaterial({ color: 0x556688, metalness: 0.7 });
    var arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), armMat);
    arm.position.set(1.0, 1.0, 0); group.add(arm);

    // Cannon barrel
    var barrelMat = new THREE.MeshStandardMaterial({ color: 0x334455, metalness: 0.9 });
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.8, 6), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(1.2, 1.0, -0.4);
    group.add(barrel);
    group.userData.barrel = barrel;

    group.position.set(0, 0, 0);
    E.scene.add(group);

    // Jetpack
    var jetMat = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.5 });
    var jet = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.4), jetMat);
    jet.position.set(0, 1.3, -0.6); group.add(jet);

    // Camera (third-person, closer than RPG)
    mech = { group: group, yaw: 0, pitch: -0.2, speed: 7, boostTimer: 0, jumpTimer: 0 };
    camPivot = new THREE.Object3D(); E.scene.add(camPivot);
  }

  var camPivot = null;

  function updateCamera(dt) {
    if (!mech) return;
    var behind = new THREE.Vector3(0, 5, 10);
    var yaw = mech.yaw;
    var rotated = new THREE.Vector3(
      behind.x * Math.cos(yaw) - behind.z * Math.sin(yaw),
      behind.y,
      behind.x * Math.sin(yaw) + behind.z * Math.cos(yaw)
    );
    var target = mech.group.position.clone().add(rotated);
    E.camera.position.lerp(target, 3 * dt);
    var lookAt = mech.group.position.clone(); lookAt.y += 2;
    E.camera.lookAt(lookAt);
  }

  function spawnEnemyWave() {
    wave++;
    var count = 2 + wave * 2;
    for (var i = 0; i < count; i++) {
      setTimeout(function () {
        if (state !== 'playing') return;
        var hp = 30 + wave * 15;
        var color = Math.random() < 0.3 ? 0xff2222 : 0xff6600;
        var bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, metalness: 0.6 });
        var body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.9), bodyMat);
        body.castShadow = true;
        body.userData = {
          hp: hp, maxHp: hp, damage: 5 + wave * 3, speed: 3 + Math.random() * 2,
          score: 50 + wave * 30, attackCD: 0,
        };

        var angle = Math.random() * Math.PI * 2;
        var dist = 15 + Math.random() * 8;
        body.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
        body.rotation.y = -angle;

        // Enemy weapon glow
        var glowMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
        var glow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), glowMat);
        glow.position.set(0, 0.3, 0.5); body.add(glow);

        E.scene.add(body);
        enemies.push(body);
      }, i * 300);
    }
  }

  function buildHUD() {
    clearHUD();
    hudContainer = E.createHUD('\
      <div id="tw-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">\
        <div style="position:absolute;bottom:30px;left:20px;width:200px;">\
          <div style="font-size:10px;color:#ff4444;">HP <span id="tw-hp">200</span>/200</div>\
          <div style="width:100%;height:6px;background:rgba(0,0,0,0.5);border-radius:3px;overflow:hidden;">\
            <div id="tw-hp-fill" style="width:100%;height:100%;background:linear-gradient(90deg,#ff4444,#ff8866);border-radius:3px;"></div>\
          </div>\
          <div style="margin-top:2px;font-size:10px;color:#44aaff;">SHIELD <span id="tw-shield">100</span>/100</div>\
          <div style="width:100%;height:4px;background:rgba(0,0,0,0.5);border-radius:2px;overflow:hidden;">\
            <div id="tw-shield-fill" style="width:100%;height:100%;background:linear-gradient(90deg,#4444ff,#44aaff);border-radius:2px;"></div>\
          </div>\
        </div>\
        <div style="position:absolute;bottom:30px;right:20px;text-align:right;width:200px;">\
          <div style="font-size:10px;color:#ff8800;">HEAT <span id="tw-heat">0</span>/100</div>\
          <div style="width:100%;height:6px;background:rgba(0,0,0,0.5);border-radius:3px;overflow:hidden;">\
            <div id="tw-heat-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#ff8800,#ff4400);border-radius:3px;"></div>\
          </div>\
          <div style="margin-top:4px;font-size:10px;color:#aaff44;">ENERGY <span id="tw-energy">100</span>/100</div>\
          <div id="tw-overheat" style="margin-top:2px;font-size:11px;color:#ff2222;display:none;">⚠ OVERHEAT</div>\
        </div>\
        <div style="position:absolute;bottom:80px;left:50%;transform:translateX(-50%);text-align:center;">\
          <div id="tw-weapon" style="font-size:12px;color:#88aacc;">Plasma Cannon</div>\
          <div style="font-size:9px;color:#666;">1/2/3 switch weapons</div>\
        </div>\
        <div style="position:absolute;top:15px;left:50%;transform:translateX(-50%);text-align:center;">\
          <div id="tw-score" style="font-size:20px;font-weight:bold;">0</div>\
          <div id="tw-wave" style="font-size:11px;color:#88aacc;">WAVE <span id="tw-wave-val">0</span></div>\
        </div>\
        <div style="position:absolute;top:15px;right:20px;text-align:right;font-size:11px;color:#ffdd00;">\
          KILLS: <span id="tw-kills">0</span><br>\
          CREDITS: <span id="tw-credits">0</span>\
        </div>\
        <div id="tw-msg" style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);font-size:18px;color:#ffdd00;text-shadow:0 0 15px rgba(255,221,0,0.5);opacity:0;text-align:center;"></div>\
        <div id="tw-dmg" style="position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse,transparent 60%,rgba(255,0,0,0.3) 100%);opacity:0;"></div>\
        <div id="tw-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">\
          <div style="font-size:36px;font-weight:bold;color:#ff6600;text-shadow:0 0 20px rgba(255,102,0,0.5);">TITAN WARS</div>\
          <div style="font-size:14px;color:#88aacc;margin-top:10px;">WASD move · CLICK/SPACE fire · 1/2/3 weapons</div>\
          <div style="font-size:12px;color:#666;margin-top:6px;">SHIFT boost · Manage heat to avoid overheat!</div>\
          <div id="tw-start-btn" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#ff6600;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO DEPLOY</div>\
        </div>\
        <div id="tw-gameover" style="position:absolute;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);">\
          <div style="font-size:36px;font-weight:bold;color:#ff4444;">SYSTEM OFFLINE</div>\
          <div style="font-size:16px;color:#ffaa00;margin-top:10px;">SCORE: <span id="tw-final-score">0</span></div>\
          <div style="font-size:12px;color:#88aacc;">WAVE <span id="tw-final-wave">0</span> · <span id="tw-final-kills">0</span> KILLS</div>\
          <div id="tw-restart-btn" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#ff4444;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO RECALL</div>\
        </div>\
      </div>');
  }

  function clearHUD() {
    if (hudContainer && hudContainer.parentNode) hudContainer.parentNode.removeChild(hudContainer);
    hudContainer = null;
  }

  function msg(text, dur) {
    var el = document.getElementById('tw-msg');
    if (!el) return;
    el.textContent = text; el.style.opacity = 1;
    setTimeout(function () { el.style.opacity = 0; }, dur || 2000);
  }

  function updateHUD() {
    document.getElementById('tw-hp').textContent = Math.ceil(health);
    document.getElementById('tw-hp-fill').style.width = (health / maxHealth * 100) + '%';
    document.getElementById('tw-shield').textContent = Math.ceil(shield);
    document.getElementById('tw-shield-fill').style.width = (shield / maxShield * 100) + '%';
    document.getElementById('tw-heat').textContent = Math.ceil(heat);
    document.getElementById('tw-heat-fill').style.width = (heat / maxHeat * 100) + '%';
    document.getElementById('tw-energy').textContent = Math.ceil(energy);
    document.getElementById('tw-score').textContent = score;
    document.getElementById('tw-wave-val').textContent = wave;
    document.getElementById('tw-kills').textContent = kills;
    document.getElementById('tw-credits').textContent = credits;
    document.getElementById('tw-weapon').textContent = weapons[currentWeapon].name;

    var overheatEl = document.getElementById('tw-overheat');
    overheatEl.style.display = overheatTimer > 0 ? 'block' : 'none';

    var dmgEl = document.getElementById('tw-dmg');
    if (damageFlash > 0) { dmgEl.style.opacity = Math.min(0.4, damageFlash); damageFlash -= 0.016; }
    else dmgEl.style.opacity = 0;

    if (state === 'ready') {
      var btn = document.getElementById('tw-start-btn');
      var p = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
      btn.style.transform = 'scale(' + (1 + p * 0.05) + ')';
    }
  }

  function update(dt, input) {
    if (state === 'ready') {
      if (input.action) { state = 'playing';
        document.getElementById('tw-ready').style.display = 'none';
        spawnEnemyWave(); msg('WAVE ' + wave + ' — Engage!', 2000); }
      updateHUD(); return;
    }
    if (state === 'gameover') {
      updateHUD();
      if (input.action) init(E);
      return;
    }

    playTime += dt;

    // Heat dissipation
    if (overheatTimer > 0) {
      overheatTimer -= dt;
      heat -= 30 * dt;
      if (heat < 0) heat = 0;
      if (overheatTimer <= 0) msg('Systems recovered', 1500);
    } else {
      heat -= 8 * dt;
      if (heat < 0) heat = 0;
    }

    // Energy regen
    if (energy < maxEnergy) energy += 8 * dt;

    // Shield regen (slow)
    if (shield < maxShield && damageFlash <= 0) shield += 2 * dt;

    // Movement
    var dx = 0, dz = 0;
    if (input.left) dx -= 1; if (input.right) dx += 1;
    if (input.up) dz -= 1; if (input.down) dz += 1;
    if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

    var yaw = mech.yaw;
    var wdx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    var wdz = dx * Math.sin(yaw) + dz * Math.cos(yaw);

    var boosting = input.keys['ShiftLeft'] || input.keys['ShiftRight'];
    var speed = mech.speed * (boosting && energy > 0 ? 1.8 : 1);
    if (boosting && energy > 0) energy -= 20 * dt;

    var bound = 28;
    mech.group.position.x = Math.max(-bound, Math.min(bound, mech.group.position.x + wdx * speed * dt));
    mech.group.position.z = Math.max(-bound, Math.min(bound, mech.group.position.z + wdz * speed * dt));

    if (dx !== 0 || dz !== 0) {
      mech.group.rotation.y = Math.atan2(wdx, wdz);
    }

    // Mouse look
    if (input.pointerLocked) {
      mech.yaw -= input.mouseDeltaX * 0.003;
      mech.pitch = Math.max(-0.3, Math.min(0.3, mech.pitch - input.mouseDeltaY * 0.003));
    }

    // Weapon switch
    if (input.keysPressed['Digit1']) { weaponIndex = 0; currentWeapon = 'cannon'; }
    if (input.keysPressed['Digit2']) { weaponIndex = 1; currentWeapon = 'laser'; }
    if (input.keysPressed['Digit3']) { weaponIndex = 2; currentWeapon = 'missiles'; }

    // Fire
    fireTimer -= dt;
    var w = weapons[currentWeapon];
    if ((input.shoot || input.action) && fireTimer <= 0 && overheatTimer <= 0 && energy >= w.energyCost) {
      fireTimer = w.fireRate;
      heat += w.heatPerShot;
      energy -= w.energyCost;

      if (heat >= maxHeat) {
        overheatTimer = 3;
        msg('OVERHEAT! Systems cooling...', 2000);
        return;
      }

      E.playBeep(200, 0.08, 'square', 0.15);

      // Hit detection
      var origin = mech.group.position.clone(); origin.y += 1.2;
      var dir = new THREE.Vector3(0, 0, -1);
      dir.applyQuaternion(E.camera.quaternion);

      // Camera shake
      mech.group.rotation.z = (Math.random() - 0.5) * 0.05;
      setTimeout(function () { if (mech) mech.group.rotation.z = 0; }, 100);

      // Weapon-specific effects
      if (currentWeapon === 'missiles') {
        // Missiles: fire multiple projectiles
        for (var mi = 0; mi < 3; mi++) {
          var mDir = dir.clone();
          mDir.x += (Math.random() - 0.5) * 0.2;
          mDir.z += (Math.random() - 0.5) * 0.2;
          fireProjectile(origin, mDir, w.damage);
        }
      } else if (currentWeapon === 'laser') {
        // Laser: instant hit scan
        hitScan(origin, dir, w.damage);
      } else {
        // Cannon: single projectile
        fireProjectile(origin, dir, w.damage);
      }
    }

    // Enemies
    for (var ei = enemies.length - 1; ei >= 0; ei--) {
      var e = enemies[ei];
      var tp = mech.group.position;
      var dx2 = tp.x - e.position.x, dz2 = tp.z - e.position.z;
      var dist = Math.sqrt(dx2 * dx2 + dz2 * dz2);

      // Move toward player
      if (dist > 2) {
        var spd = e.userData.speed * dt;
        e.position.x += (dx2 / dist) * spd;
        e.position.z += (dz2 / dist) * spd;
        e.rotation.y = Math.atan2(dx2, dz2);
      }

      // Attack player
      e.userData.attackCD -= dt;
      if (dist < 3 && e.userData.attackCD <= 0) {
        e.userData.attackCD = 0.8;
        var dmg = e.userData.damage;
        if (shield > 0) {
          var absorbed = Math.min(shield, dmg * 0.5);
          shield -= absorbed;
          dmg -= absorbed;
        }
        health -= dmg;
        damageFlash = 0.3;
        E.playBeep(100, 0.15, 'sawtooth', 0.3);
        if (health <= 0) {
          health = 0;
          state = 'gameover';
          document.getElementById('tw-gameover').style.display = 'flex';
          document.getElementById('tw-final-score').textContent = score;
          document.getElementById('tw-final-wave').textContent = wave;
          document.getElementById('tw-final-kills').textContent = kills;
          return;
        }
      }

      // Bound check
      e.position.x = Math.max(-27, Math.min(27, e.position.x));
      e.position.z = Math.max(-27, Math.min(27, e.position.z));
    }

    // Projectiles
    for (var pi = projectiles.length - 1; pi >= 0; pi--) {
      var proj = projectiles[pi];
      proj.life -= dt;
      if (proj.life <= 0) {
        E.scene.remove(proj.mesh);
        projectiles.splice(pi, 1);
        continue;
      }
      proj.mesh.position.add(proj.vel.clone().multiplyScalar(dt));

      // Check enemy hits
      var hit = false;
      for (var ej = enemies.length - 1; ej >= 0; ej--) {
        var e2 = enemies[ej];
        if (proj.mesh.position.distanceTo(e2.position) < 1.2) {
          e2.userData.hp -= proj.damage;
          hit = true;
          score += proj.damage;

          if (e2.userData.hp <= 0) {
            kills++;
            credits += 10 + wave * 2;
            score += e2.userData.score;
            E.scene.remove(e2);
            enemies.splice(ej, 1);
            E.playBeep(300, 0.2, 'sawtooth', 0.2);
          } else {
            e2.material.color.setHex(0xffffff);
            var thatMesh = e2;
            setTimeout(function () { if (thatMesh.material) thatMesh.material.color.setHex(0xff6600); }, 100);
          }
          break;
        }
      }
      if (hit) {
        E.scene.remove(proj.mesh);
        projectiles.splice(pi, 1);
      }
    }

    // Wave check
    if (enemies.length === 0 && state === 'playing') {
      credits += wave * 5;
      msg('Wave ' + wave + ' cleared! +' + (wave * 5) + ' credits', 2000);
      setTimeout(function () {
        if (state === 'playing') spawnEnemyWave();
      }, 2000);
    }

    updateCamera(dt);
    updateHUD();
  }

  function fireProjectile(origin, dir, damage) {
    var geo = new THREE.SphereGeometry(0.12, 6, 6);
    var mat = new THREE.MeshBasicMaterial({
      color: currentWeapon === 'missiles' ? 0xffaa44 : 0x44aaff,
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.position.add(dir.clone().multiplyScalar(2));
    E.scene.add(mesh);
    projectiles.push({
      mesh: mesh, vel: dir.clone().multiplyScalar(25),
      life: 2, damage: damage,
    });
  }

  function hitScan(origin, dir, damage) {
    var hit = false;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var toEnemy = new THREE.Vector3().copy(e.position).sub(origin);
      var dist = toEnemy.length();
      if (dist < 15) {
        var angle = dir.angleTo(toEnemy);
        if (angle < 0.15) {
          e.userData.hp -= damage;
          score += damage;
          if (e.userData.hp <= 0) {
            kills++; credits += 10 + wave * 2;
            score += e.userData.score;
            E.scene.remove(e);
            enemies.splice(i, 1);
          }
          hit = true;
          break;
        }
      }
    }
  }

  function render3D() {
    if (E.renderer && E.scene && E.camera) E.renderer.render(E.scene, E.camera);
  }
  function render2D(ctx) {}

  function destroy() {
    clearHUD();
    if (mech && mech.group) E.scene.remove(mech.group);
    if (camPivot) E.scene.remove(camPivot);
    if (arena) E.scene.remove(arena);
    for (var i = 0; i < enemies.length; i++) E.scene.remove(enemies[i]);
    for (var j = 0; j < projectiles.length; j++) E.scene.remove(projectiles[j].mesh);
    enemies = []; projectiles = [];
    mech = null; E = null; THREE = null;
  }

  window.TitanWars = {
    init: init, update: update, render3D: render3D, render2D: render2D, destroy: destroy,
    name: 'Titan Wars', description: '3D Mech Combat — Pilot giant mechs in arena battles', genre: 'mech',
  };
  console.log('[TitanWars] Loaded. Deploying Titan!');
})();
