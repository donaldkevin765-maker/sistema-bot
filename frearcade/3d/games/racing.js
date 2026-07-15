/**
 * Neon Velocity — 3D Arcade Racing
 *
 * High-speed futuristic racing with drift mechanics, turbo boost,
 * AI opponents, lap system, and neon visual style.
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
  var score = 0;
  var lap = 0;
  var totalLaps = 3;
  var position = 1;
  var totalRacers = 6;
  var speed = 0;
  var maxSpeed = 200;
  var acceleration = 40;
  var braking = 60;
  var friction = 15;
  var steerAngle = 0;
  var maxSteer = 3;
  var boost = 100;
  var maxBoost = 100;
  var isDrifting = false;
  var driftAngle = 0;
  var driftPoints = 0;
  var playTime = 0;
  var finishTime = 0;

  // ── 3D Objects ──
  var playerCar = null;
  var cameraPivot = null;
  var track = null;
  var aiCars = [];
  var waypoints = [];
  var speedLines = [];
  var ground = null;
  var cityElements = [];

  // ── Particles ──
  var trailSystem = null;
  var boostSystem = null;

  // ── Track config ──
  var TRACK_RADIUS = 35;
  var TRACK_WIDTH = 10;
  var TRACK_SEGMENTS = 48;

  // ──────────────────────────────────────────────
  // INIT
  // ──────────────────────────────────────────────

  function init(engine) {
    E = engine;
    THREE = engine.THREE;
    if (!THREE) return;

    resetState();
    buildTrack();
    buildPlayerCar();
    buildAICars();
    buildCamera();
    buildParticles();
    buildSpeedLines();
    buildHUD();
    buildWaypoints();

    state = 'ready';

    // Setup finish line detection
    setupFinishLine();

    E.emit('gameReady', { name: 'Neon Velocity' });
  }

  function resetState() {
    score = 0; lap = 0; position = 1;
    speed = 0; boost = 100; playTime = 0; finishTime = 0;
    isDrifting = false; driftAngle = 0; driftPoints = 0;
    aiCars = []; cityElements = []; speedLines = [];
  }

  // ──────────────────────────────────────────────
  // TRACK
  // ──────────────────────────────────────────────

  function buildTrack() {
    if (track) E.scene.remove(track);
    track = new THREE.Group();

    var R = TRACK_RADIUS;
    var W = TRACK_WIDTH;
    var SEGS = TRACK_SEGMENTS;

    // Build track from segments
    var roadMat = new THREE.MeshStandardMaterial({
      color: 0x222244,
      roughness: 0.9,
      metalness: 0.1,
    });

    var borderMat = new THREE.MeshStandardMaterial({
      color: 0x4466ff,
      emissive: 0x4466ff,
      emissiveIntensity: 0.3,
    });

    var kerbMat = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      emissive: 0xff4444,
      emissiveIntensity: 0.2,
    });

    // Create flat ground under track
    var groundGeo = new THREE.CircleGeometry(R * 1.8, 64);
    var groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a1a,
      roughness: 1,
    });
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    track.add(ground);

    var roadPoints = [];

    for (var i = 0; i < SEGS; i++) {
      var angle = (i / SEGS) * Math.PI * 2;
      var nextAngle = ((i + 1) / SEGS) * Math.PI * 2;

      var innerR = R - W / 2;
      var outerR = R + W / 2;

      var x1 = Math.cos(angle) * innerR;
      var z1 = Math.sin(angle) * innerR;
      var x2 = Math.cos(angle) * outerR;
      var z2 = Math.sin(angle) * outerR;
      var x3 = Math.cos(nextAngle) * outerR;
      var z3 = Math.sin(nextAngle) * outerR;
      var x4 = Math.cos(nextAngle) * innerR;
      var z4 = Math.sin(nextAngle) * innerR;

      // Road segment
      var shape = new THREE.Shape();
      shape.moveTo(x1, z1);
      shape.lineTo(x2, z2);
      shape.lineTo(x3, z3);
      shape.lineTo(x4, z4);
      shape.closePath();

      // Use a simple plane per segment instead
      var segGeo = new THREE.PlaneGeometry(W, (2 * Math.PI * R) / SEGS);
      var seg = new THREE.Mesh(segGeo, roadMat);
      var midAngle = (angle + nextAngle) / 2;
      seg.position.set(Math.cos(midAngle) * R, 0, Math.sin(midAngle) * R);
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = -midAngle;
      seg.receiveShadow = true;
      track.add(seg);

      // Inner wall
      var wall = new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, (2 * Math.PI * R) / SEGS - 0.3),
        borderMat
      );
      wall.position.set(Math.cos(midAngle) * (innerR - 0.5), 1, Math.sin(midAngle) * (innerR - 0.5));
      wall.rotation.y = -midAngle;
      wall.castShadow = true;
      track.add(wall);

      // Outer wall
      var wall2 = new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, (2 * Math.PI * R) / SEGS - 0.3),
        borderMat
      );
      wall2.position.set(Math.cos(midAngle) * (outerR + 0.5), 1, Math.sin(midAngle) * (outerR + 0.5));
      wall2.rotation.y = -midAngle;
      wall2.castShadow = true;
      track.add(wall2);

      // Store center point for waypoints
      roadPoints.push({
        x: Math.cos(midAngle) * R,
        z: Math.sin(midAngle) * R,
        angle: midAngle,
      });

      // Kerbs (checkered pattern on inner edge)
      if (i % 2 === 0) {
        var kerb = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.2, (2 * Math.PI * R) / SEGS / 2),
          kerbMat
        );
        kerb.position.set(Math.cos(midAngle) * (innerR + 0.5), 0.1, Math.sin(midAngle) * (innerR + 0.5));
        kerb.rotation.y = -midAngle;
        track.add(kerb);
      }
    }

    // Finish line
    var finishMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    var checkMat1 = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
    var checkMat2 = new THREE.MeshBasicMaterial({ color: 0x222222 });

    for (var ci = 0; ci < 8; ci++) {
      var cx = Math.cos(0) * (R - W / 2 + (ci / 8) * W);
      var cz = Math.sin(0) * (R - W / 2 + (ci / 8) * W);
      var checker = new THREE.Mesh(
        new THREE.PlaneGeometry(W / 8, 0.5),
        (ci % 2 === 0) ? checkMat1 : checkMat2
      );
      checker.position.set(cx, 0.1, cz);
      checker.rotation.x = -Math.PI / 2;
      track.add(checker);
    }

    // Neon arch over finish line
    var archMat = new THREE.MeshBasicMaterial({
      color: 0x44ffaa,
      transparent: true,
      opacity: 0.6,
    });
    var arch = new THREE.Mesh(new THREE.TorusGeometry(4, 0.1, 8, 16, Math.PI), archMat);
    arch.position.set(R, 4, 0);
    track.add(arch);

    E.scene.add(track);

    // City buildings / scenery
    buildScenery();
  }

  function buildScenery() {
    var buildingMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.6,
      metalness: 0.4,
    });
    var windowMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.3,
    });

    var R = TRACK_RADIUS + TRACK_WIDTH / 2 + 8;

    for (var i = 0; i < 30; i++) {
      var angle = Math.random() * Math.PI * 2;
      var dist = R + 5 + Math.random() * 15;
      var bw = 1.5 + Math.random() * 3;
      var bh = 3 + Math.random() * 12;
      var bd = 1.5 + Math.random() * 3;

      var building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildingMat);
      building.position.set(
        Math.cos(angle) * dist,
        bh / 2,
        Math.sin(angle) * dist
      );
      building.rotation.y = Math.random() * Math.PI;
      building.castShadow = true;
      building.receiveShadow = true;
      track.add(building);
      cityElements.push(building);

      // Windows (rows of small lit squares)
      for (var wy = 1; wy < bh - 1; wy += 1.5) {
        for (var wx = -1; wx <= 1; wx += 1.2) {
          if (Math.random() < 0.5) {
            var win = new THREE.Mesh(
              new THREE.PlaneGeometry(0.3, 0.4),
              windowMat
            );
            win.position.set(
              wx * (bw / 4),
              wy - bh / 2 + 0.5,
              bd / 2 + 0.01
            );
            building.add(win);
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  // WAYPOINTS
  // ──────────────────────────────────────────────

  function buildWaypoints() {
    waypoints = [];
    var R = TRACK_RADIUS;
    var count = 32;
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * Math.PI * 2;
      waypoints.push({
        x: Math.cos(angle) * R,
        z: Math.sin(angle) * R,
        angle: angle,
      });
    }
  }

  function getNearestWaypointIndex(x, z) {
    var minDist = Infinity;
    var minIdx = 0;
    for (var i = 0; i < waypoints.length; i++) {
      var dx = x - waypoints[i].x;
      var dz = z - waypoints[i].z;
      var d = dx * dx + dz * dz;
      if (d < minDist) { minDist = d; minIdx = i; }
    }
    return minIdx;
  }

  // ──────────────────────────────────────────────
  // FINISH LINE
  // ──────────────────────────────────────────────

  var lastWaypointIndex = 0;
  var finishLinePassed = false;
  var aiLapData = [];

  function setupFinishLine() {
    lastWaypointIndex = -1;
    finishLinePassed = false;

    // AI lap tracking
    aiLapData = [];
    for (var i = 0; i < aiCars.length; i++) {
      aiLapData.push({ lastWp: -1, lap: 0, passed: false, finished: false, finishTime: 0 });
    }
  }

  function checkLapProgress(carX, carZ, carData) {
    var wpIdx = getNearestWaypointIndex(carX, carZ);

    // Track waypoint progression (clockwise)
    var threshold = Math.floor(waypoints.length * 0.6);

    if (carData.lastWp < 0) {
      carData.lastWp = wpIdx;
      return false;
    }

    var diff = wpIdx - carData.lastWp;
    if (diff < -threshold) {
      // Completed a full lap (wrapped around)
      carData.lastWp = wpIdx;
      return true;
    }

    // Normal progression
    if (diff > 0 && diff < threshold) {
      carData.lastWp = wpIdx;
    } else if (diff < -threshold) {
      // Wrapped around backward — ignore
    } else if (diff < 0 && Math.abs(diff) < threshold) {
      // Going backward — don't update
    }

    return false;
  }

  // ──────────────────────────────────────────────
  // PLAYER CAR
  // ──────────────────────────────────────────────

  function buildPlayerCar() {
    var group = new THREE.Group();

    // Body
    var bodyMat = new THREE.MeshStandardMaterial({
      color: 0x4466ff,
      roughness: 0.3,
      metalness: 0.7,
      emissive: 0x4466ff,
      emissiveIntensity: 0.1,
    });
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 3.5), bodyMat);
    body.position.y = 0.4;
    body.castShadow = true;
    group.add(body);

    // Cabin
    var cabinMat = new THREE.MeshStandardMaterial({
      color: 0x224488,
      roughness: 0.2,
      metalness: 0.8,
    });
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.5), cabinMat);
    cabin.position.set(0, 0.7, -0.3);
    cabin.castShadow = true;
    group.add(cabin);

    // Spoiler
    var spoilerMat = new THREE.MeshStandardMaterial({
      color: 0x222244,
      roughness: 0.5,
      metalness: 0.5,
    });
    var spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.3), spoilerMat);
    spoiler.position.set(0, 0.75, -1.7);
    group.add(spoiler);
    var spoilerLeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3), spoilerMat);
    spoilerLeg1.position.set(0.6, 0.55, -1.7);
    group.add(spoilerLeg1);
    var spoilerLeg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3), spoilerMat);
    spoilerLeg2.position.set(-0.6, 0.55, -1.7);
    group.add(spoilerLeg2);

    // Wheels (simple)
    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    var wheelPos = [
      { x: -1.0, z: 1.2 }, { x: 1.0, z: 1.2 },
      { x: -1.0, z: -1.2 }, { x: 1.0, z: -1.2 },
    ];
    for (var i = 0; i < wheelPos.length; i++) {
      var wp = wheelPos[i];
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.15, 8), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wp.x, 0.15, wp.z);
      group.add(wheel);
    }

    // Neon underglow
    var glowMat = new THREE.MeshBasicMaterial({
      color: 0x4466ff,
      transparent: true,
      opacity: 0.4,
    });
    var glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.5), glowMat);
    glow.position.set(0, 0.02, 0);
    glow.rotation.x = -Math.PI / 2;
    group.add(glow);

    // Headlights
    var lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var hl1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), lightMat);
    hl1.position.set(-0.5, 0.3, 1.8);
    group.add(hl1);
    var hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), lightMat);
    hl2.position.set(0.5, 0.3, 1.8);
    group.add(hl2);

    // Taillights
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    var tl1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), tailMat);
    tl1.position.set(-0.5, 0.3, -1.8);
    group.add(tl1);
    var tl2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), tailMat);
    tl2.position.set(0.5, 0.3, -1.8);
    group.add(tl2);

    group.position.set(TRACK_RADIUS - 2, 0, 0);
    group.rotation.y = 0;

    E.scene.add(group);

    playerCar = {
      group: group,
      speed: 0,
      steer: 0,
      angle: 0,
      driftAngle: 0,
      isDrifting: false,
      boost: 100,
      lap: 0,
      lastWp: -1,
      passedFinish: false,
      finished: false,
      finishTime: 0,
    };
  }

  // ──────────────────────────────────────────────
  // AI CARS
  // ──────────────────────────────────────────────

  function buildAICars() {
    var aiColors = [0xff4444, 0x44ff44, 0xffaa44, 0xff44ff, 0x44ffff];
    var startAngle = 0.3;

    for (var i = 0; i < totalRacers - 1; i++) {
      var group = new THREE.Group();

      var bodyMat = new THREE.MeshStandardMaterial({
        color: aiColors[i % aiColors.length],
        roughness: 0.4,
        metalness: 0.6,
      });
      var body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 3.5), bodyMat);
      body.position.y = 0.4;
      body.castShadow = true;
      group.add(body);

      var cabinMat = new THREE.MeshStandardMaterial({ color: 0x222244, roughness: 0.3, metalness: 0.7 });
      var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.5), cabinMat);
      cabin.position.set(0, 0.7, -0.3);
      cabin.castShadow = true;
      group.add(cabin);

      var wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
      var wheelPos = [
        { x: -1.0, z: 1.2 }, { x: 1.0, z: 1.2 },
        { x: -1.0, z: -1.2 }, { x: 1.0, z: -1.2 },
      ];
      for (var j = 0; j < wheelPos.length; j++) {
        var wp = wheelPos[j];
        var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.15, 8), wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wp.x, 0.15, wp.z);
        group.add(wheel);
      }

      var aiAngle = startAngle + (i + 1) * 0.4;
      group.position.set(
        Math.cos(aiAngle) * TRACK_RADIUS,
        0,
        Math.sin(aiAngle) * TRACK_RADIUS
      );
      group.rotation.y = -aiAngle + Math.PI / 2;

      E.scene.add(group);

      var skill = 0.7 + Math.random() * 0.3;
      aiCars.push({
        group: group,
        speed: 0,
        angle: aiAngle,
        targetSpeed: 80 + Math.random() * 60,
        skill: skill,
        aggression: 0.3 + Math.random() * 0.4,
        lap: 0,
        lastWp: -1,
        passedFinish: false,
        finished: false,
        finishTime: 0,
        color: aiColors[i % aiColors.length],
      });
    }
  }

  // ──────────────────────────────────────────────
  // CAMERA
  // ──────────────────────────────────────────────

  function buildCamera() {
    if (!cameraPivot) {
      cameraPivot = new THREE.Object3D();
      E.scene.add(cameraPivot);
    }
  }

  function updateCamera(dt) {
    if (!playerCar || !playerCar.group) return;

    var target = playerCar.group.position.clone();
    var behind = new THREE.Vector3(0, 3, 7);
    behind.applyQuaternion(playerCar.group.quaternion);
    var camPos = target.clone().add(behind);

    E.camera.position.lerp(camPos, 3 * dt);
    E.camera.lookAt(target);
  }

  // ──────────────────────────────────────────────
  // PARTICLES
  // ──────────────────────────────────────────────

  function buildParticles() {
    trailSystem = E.createParticleSystem({
      count: 200,
      size: 0.1,
      spread: 0.2,
      speed: 2,
      lifeMax: 0.5,
      colorR: 0.3, colorG: 0.4, colorB: 1.0,
    });

    boostSystem = E.createParticleSystem({
      count: 300,
      size: 0.15,
      spread: 0.5,
      speed: 10,
      lifeMax: 0.6,
      colorR: 1.0, colorG: 0.6, colorB: 0.0,
    });
  }

  // ──────────────────────────────────────────────
  // SPEED LINES
  // ──────────────────────────────────────────────

  function buildSpeedLines() {
    for (var i = 0; i < 50; i++) {
      var geo = new THREE.BufferGeometry();
      var positions = new Float32Array(6);
      var line = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color: 0x4466ff,
          transparent: true,
          opacity: 0,
        })
      );
      line.frustumCulled = false;
      speedLines.push(line);
      E.scene.add(line);
    }
  }

  function updateSpeedLines(dt) {
    var spd = Math.abs(playerCar ? playerCar.speed : 0) / maxSpeed;
    for (var i = 0; i < speedLines.length; i++) {
      var line = speedLines[i];
      if (spd > 0.3 && state === 'playing') {
        line.material.opacity = Math.min(0.3, spd * 0.3);

        // Random positions around camera view
        var side = (Math.random() - 0.5) * 20;
        var up = (Math.random() - 0.5) * 10;
        var depth = 10 + Math.random() * 30;

        var pos = E.camera.position.clone();
        var forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(E.camera.quaternion);
        var right = new THREE.Vector3(1, 0, 0);
        right.applyQuaternion(E.camera.quaternion);
        var upVec = new THREE.Vector3(0, 1, 0);

        var start = pos.clone().add(forward.clone().multiplyScalar(-depth));
        start.add(right.clone().multiplyScalar(side));
        start.add(upVec.clone().multiplyScalar(up));

        var end = start.clone().add(forward.clone().multiplyScalar(-5 - spd * 10));

        var posAttr = line.geometry.attributes.position;
        if (!posAttr) {
          var positions = new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]);
          line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        } else {
          posAttr.array[0] = start.x; posAttr.array[1] = start.y; posAttr.array[2] = start.z;
          posAttr.array[3] = end.x; posAttr.array[4] = end.y; posAttr.array[5] = end.z;
          posAttr.needsUpdate = true;
        }
      } else {
        line.material.opacity = 0;
      }
    }
  }

  // ──────────────────────────────────────────────
  // HUD
  // ──────────────────────────────────────────────

  var hudContainer = null;

  function buildHUD() {
    clearHUD();
    hudContainer = E.createHUD('\
      <div id="nv-hud" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:\'Segoe UI\',Arial,sans-serif;color:#fff;user-select:none;">\
        <div id="nv-speed" style="position:absolute;bottom:50px;left:50%;transform:translateX(-50%);text-align:center;">\
          <div id="nv-speed-val" style="font-size:48px;font-weight:bold;text-shadow:0 0 20px rgba(68,102,255,0.5);">0</div>\
          <div style="font-size:11px;color:#88aacc;">KM/H</div>\
        </div>\
        <div id="nv-lap" style="position:absolute;top:15px;left:50%;transform:translateX(-50%);text-align:center;">\
          <div id="nv-lap-val" style="font-size:18px;font-weight:bold;">LAP <span id="nv-lap-current">0</span>/<span id="nv-lap-total">3</span></div>\
          <div id="nv-pos" style="font-size:13px;color:#88aacc;">POSITION: <span id="nv-pos-val">1</span>/<span id="nv-total-val">6</span></div>\
        </div>\
        <div id="nv-boost" style="position:absolute;bottom:100px;left:50%;transform:translateX(-50%);width:200px;height:8px;background:rgba(0,0,0,0.5);border-radius:4px;overflow:hidden;">\
          <div id="nv-boost-fill" style="width:100%;height:100%;background:linear-gradient(90deg,#ff4400,#ffaa00,#44ffaa);border-radius:4px;transition:width 0.1s;"></div>\
        </div>\
        <div id="nv-drift" style="position:absolute;bottom:120px;left:50%;transform:translateX(-50%);font-size:12px;color:#ffdd00;text-shadow:0 0 10px rgba(255,221,0,0.5);opacity:0;"></div>\
        <div id="nv-ready" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);">\
          <div style="font-size:36px;font-weight:bold;color:#44aaff;text-shadow:0 0 20px rgba(68,170,255,0.5);">NEON VELOCITY</div>\
          <div style="font-size:14px;color:#88aacc;margin-top:10px;">WASD/Arrow drive · SHIFT boost · SPACE drift</div>\
          <div style="font-size:12px;color:#666;margin-top:6px;">3 laps · 6 racers</div>\
          <div id="nv-start-btn" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#44aaff;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO RACE</div>\
        </div>\
        <div id="nv-finish" style="position:absolute;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);">\
          <div style="font-size:36px;font-weight:bold;color:#ffdd00;text-shadow:0 0 20px rgba(255,221,0,0.5);">RACE COMPLETE!</div>\
          <div style="font-size:20px;color:#fff;margin-top:10px;">POSITION: <span id="nv-final-pos">1</span></div>\
          <div style="font-size:13px;color:#88aacc;margin-top:6px;">TIME: <span id="nv-final-time">0.0</span>s</div>\
          <div id="nv-restart-btn" style="margin-top:30px;padding:12px 40px;font-size:18px;background:#ffaa00;color:#fff;border:none;border-radius:6px;cursor:pointer;pointer-events:auto;">PRESS ENTER TO CONTINUE</div>\
        </div>\
      </div>');
  }

  function clearHUD() {
    if (hudContainer && hudContainer.parentNode) {
      hudContainer.parentNode.removeChild(hudContainer);
      hudContainer = null;
    }
  }

  function updateHUD() {
    if (!playerCar) return;
    var spd = Math.round(Math.abs(playerCar.speed));
    document.getElementById('nv-speed-val').textContent = spd;
    document.getElementById('nv-lap-current').textContent = Math.min(playerCar.lap + 1, totalLaps);
    document.getElementById('nv-lap-total').textContent = totalLaps;
    document.getElementById('nv-pos-val').textContent = position;
    document.getElementById('nv-total-val').textContent = totalRacers;

    document.getElementById('nv-boost-fill').style.width = (playerCar.boost || 0) + '%';

    // Drift indicator
    var driftEl = document.getElementById('nv-drift');
    if (playerCar.isDrifting && Math.abs(playerCar.driftAngle) > 0.1) {
      driftEl.textContent = 'DRIFT +' + Math.floor(Math.abs(playerCar.driftAngle) * 10);
      driftEl.style.opacity = 1;
    } else {
      driftEl.style.opacity = Math.max(0, parseFloat(driftEl.style.opacity) - 0.05);
    }

    // Ready screen pulsing
    if (state === 'ready') {
      var btn = document.getElementById('nv-start-btn');
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
      if (input.action) {
        startRace();
      }
      updateHUD();
      return;
    }

    if (state === 'finished') {
      playTime += dt;
      updateHUD();
      if (input.action) {
        init(E);
      }
      return;
    }

    playTime += dt;

    // Update player
    updatePlayer(dt, input);

    // Update AI
    updateAI(dt);

    // Update positions
    calculatePositions();

    // Update effects
    updateSpeedLines(dt);
    updateBoostTrail(dt);

    // Camera
    updateCamera(dt);

    // HUD
    updateHUD();

    // Check race complete
    checkRaceComplete();
  }

  // ──────────────────────────────────────────────
  // PLAYER PHYSICS
  // ──────────────────────────────────────────────

  function updatePlayer(dt, input) {
    if (playerCar.finished) return;

    var accel = input.up || input.keys['ArrowUp'] || input.keys['KeyW'];
    var brake = input.down || input.keys['ArrowDown'] || input.keys['KeyS'];
    var steer = 0;
    if (input.left || input.keys['ArrowLeft'] || input.keys['KeyA']) steer = 1;
    if (input.right || input.keys['ArrowRight'] || input.keys['KeyD']) steer = -1;

    var boosting = input.keys['ShiftLeft'] || input.keys['ShiftRight'];
    var drifting = input.keys['Space'];

    // Acceleration
    if (accel) {
      playerCar.speed += acceleration * dt;
    } else if (brake) {
      playerCar.speed -= braking * dt;
    } else {
      // Friction
      if (playerCar.speed > 0) playerCar.speed -= friction * dt;
      if (playerCar.speed < 0) playerCar.speed = 0;
    }

    // Speed limits
    var currentMax = maxSpeed;
    if (boosting && playerCar.boost > 0) {
      currentMax = maxSpeed * 1.4;
      playerCar.boost -= 15 * dt;
      if (playerCar.boost < 0) playerCar.boost = 0;
      playerCar.speed += acceleration * 0.5 * dt;
    } else {
      // Recharge boost slowly
      if (playerCar.boost < maxBoost) {
        playerCar.boost += 5 * dt;
      }
    }
    playerCar.speed = Math.max(0, Math.min(currentMax, playerCar.speed));

    // Steering
    var steerFactor = Math.min(1, playerCar.speed / 60);
    var steerAmount = steer * maxSteer * steerFactor * dt;

    if (drifting && playerCar.speed > 30) {
      // Drift mode
      playerCar.isDrifting = true;
      playerCar.driftAngle += steerAmount * 2.5;
      playerCar.driftAngle *= 0.97; // Drift decay
      playerCar.angle += playerCar.driftAngle * dt;

      // Drift bonus points
      if (Math.abs(playerCar.driftAngle) > 0.5) {
        driftPoints += Math.abs(playerCar.driftAngle) * dt * 10;
      }
    } else {
      playerCar.isDrifting = false;
      playerCar.driftAngle *= 0.9;
      playerCar.angle += steerAmount;
    }

    // Move car
    var moveX = Math.sin(playerCar.angle) * playerCar.speed * dt;
    var moveZ = Math.cos(playerCar.angle) * playerCar.speed * dt;

    var newX = playerCar.group.position.x + moveX;
    var newZ = playerCar.group.position.z + moveZ;

    // Track bounds (keep on track using distance from center)
    var distFromCenter = Math.sqrt(newX * newX + newZ * newZ);
    var innerBound = TRACK_RADIUS - TRACK_WIDTH / 2 + 1;
    var outerBound = TRACK_RADIUS + TRACK_WIDTH / 2 - 1;

    if (distFromCenter < innerBound) {
      // Push outward
      var ratio = innerBound / Math.max(distFromCenter, 0.1);
      newX *= ratio;
      newZ *= ratio;
      playerCar.speed *= 0.9;
    } else if (distFromCenter > outerBound) {
      // Push inward
      var ratio2 = outerBound / distFromCenter;
      newX *= ratio2;
      newZ *= ratio2;
      playerCar.speed *= 0.9;
    }

    playerCar.group.position.x = newX;
    playerCar.group.position.z = newZ;

    // Update rotation
    var targetAngle = playerCar.angle;
    playerCar.group.rotation.y = targetAngle;

    // Tilt in drift
    if (playerCar.isDrifting) {
      playerCar.group.rotation.z = -playerCar.driftAngle * 0.05;
    } else {
      playerCar.group.rotation.z *= 0.9;
    }

    // Tilt in steering
    playerCar.group.rotation.z += steer * steerAmount * 0.05;

    // Check lap progress
    var finishedLap = checkLapProgress(newX, newZ, playerCar);
    if (finishedLap) {
      playerCar.lap++;
      if (playerCar.lap >= totalLaps) {
        playerCar.finished = true;
        playerCar.finishTime = playTime;
        finishTime = playTime;
        E.playSynth([
          { freq: 523, duration: 0.15, delay: 0, type: 'sine', volume: 0.2 },
          { freq: 659, duration: 0.15, delay: 0.15, type: 'sine', volume: 0.2 },
          { freq: 784, duration: 0.15, delay: 0.3, type: 'sine', volume: 0.2 },
          { freq: 1047, duration: 0.3, delay: 0.45, type: 'sine', volume: 0.3 },
        ]);
      } else {
        E.playSynth([
          { freq: 440, duration: 0.1, delay: 0, type: 'sine', volume: 0.15 },
          { freq: 660, duration: 0.15, delay: 0.1, type: 'sine', volume: 0.15 },
        ]);
      }
    }

    // Trail particles
    if (playerCar.speed > 30) {
      E.emitParticles(trailSystem, playerCar.group.position, 2);
    }
  }

  // ──────────────────────────────────────────────
  // AI
  // ──────────────────────────────────────────────

  function updateAI(dt) {
    for (var i = 0; i < aiCars.length; i++) {
      var ai = aiCars[i];
      if (ai.finished) continue;

      // Find nearest waypoint ahead
      var idx = getNearestWaypointIndex(ai.group.position.x, ai.group.position.z);
      var targetIdx = (idx + 2) % waypoints.length;
      var target = waypoints[targetIdx];

      // Direction to target
      var dx = target.x - ai.group.position.x;
      var dz = target.z - ai.group.position.z;
      var targetAngle = Math.atan2(dx, dz);

      // Steer toward target
      var angleDiff = targetAngle - ai.group.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      ai.group.rotation.y += angleDiff * 2 * dt;

      // Speed control
      var distFromCenter = Math.sqrt(
        ai.group.position.x * ai.group.position.x + ai.group.position.z * ai.group.position.z
      );
      var speedMod = 1.0;
      if (distFromCenter < TRACK_RADIUS - TRACK_WIDTH / 3 ||
          distFromCenter > TRACK_RADIUS + TRACK_WIDTH / 3) {
        speedMod = 0.6; // Slow down on edges
      }

      var targetSpd = ai.targetSpeed * speedMod * (0.9 + ai.skill * 0.2);
      if (ai.speed < targetSpd) {
        ai.speed += acceleration * 0.8 * dt;
      } else {
        ai.speed -= friction * 0.5 * dt;
      }
      ai.speed = Math.max(0, Math.min(maxSpeed * 0.85, ai.speed));

      // Move
      ai.group.position.x += Math.sin(ai.group.rotation.y) * ai.speed * dt;
      ai.group.position.z += Math.cos(ai.group.rotation.y) * ai.speed * dt;

      // Track bounds
      var newDist = Math.sqrt(
        ai.group.position.x * ai.group.position.x + ai.group.position.z * ai.group.position.z
      );
      if (newDist < TRACK_RADIUS - TRACK_WIDTH / 2) {
        var ratio = (TRACK_RADIUS - TRACK_WIDTH / 2 + 0.5) / Math.max(newDist, 0.1);
        ai.group.position.x *= ratio;
        ai.group.position.z *= ratio;
      } else if (newDist > TRACK_RADIUS + TRACK_WIDTH / 2) {
        var ratio2 = (TRACK_RADIUS + TRACK_WIDTH / 2 - 0.5) / newDist;
        ai.group.position.x *= ratio2;
        ai.group.position.z *= ratio2;
      }

      // Lap progress
      var finishedLap = checkLapProgress(ai.group.position.x, ai.group.position.z, ai);
      if (finishedLap) {
        ai.lap++;
        if (ai.lap >= totalLaps) {
          ai.finished = true;
          ai.finishTime = playTime;
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  // POSITIONS
  // ──────────────────────────────────────────────

  function calculatePositions() {
    var allRacers = [{ ref: playerCar, isPlayer: true }];
    for (var i = 0; i < aiCars.length; i++) {
      allRacers.push({ ref: aiCars[i], isPlayer: false });
    }

    // Sort by lap (higher = better), then by waypoint progress, then by distance to next waypoint
    allRacers.sort(function (a, b) {
      var aLap = a.ref.lap || 0;
      var bLap = b.ref.lap || 0;
      if (aLap !== bLap) return bLap - aLap;

      var aWp = a.ref.lastWp || 0;
      var bWp = b.ref.lastWp || 0;
      if (aWp !== bWp) return bWp - aWp;

      // Distance to next waypoint
      var aNext = waypoints[(aWp + 1) % waypoints.length];
      var bNext = waypoints[(bWp + 1) % waypoints.length];
      var aDist = 0, bDist = 0;
      if (a.ref.group) {
        aDist = -Math.sqrt(
          Math.pow(a.ref.group.position.x - aNext.x, 2) +
          Math.pow(a.ref.group.position.z - aNext.z, 2)
        );
      }
      if (b.ref.group) {
        bDist = -Math.sqrt(
          Math.pow(b.ref.group.position.x - bNext.x, 2) +
          Math.pow(b.ref.group.position.z - bNext.z, 2)
        );
      }
      return aDist - bDist;
    });

    for (var j = 0; j < allRacers.length; j++) {
      if (allRacers[j].isPlayer) {
        position = j + 1;
        break;
      }
    }
  }

  // ──────────────────────────────────────────────
  // BOOST TRAIL
  // ──────────────────────────────────────────────

  function updateBoostTrail(dt) {
    if (!playerCar) return;
    var boosting = playerCar.boost < 100 && playerCar.speed > 50;
    if (boosting) {
      E.emitParticles(boostSystem, playerCar.group.position, 3);
    }
  }

  // ──────────────────────────────────────────────
  // RACE FLOW
  // ──────────────────────────────────────────────

  function startRace() {
    state = 'playing';
    document.getElementById('nv-ready').style.display = 'none';
    playTime = 0;

    E.playSynth([
      { freq: 400, duration: 0.2, delay: 0, type: 'sine', volume: 0.3 },
      { freq: 600, duration: 0.2, delay: 0.3, type: 'sine', volume: 0.3 },
      { freq: 800, duration: 0.3, delay: 0.6, type: 'sine', volume: 0.4 },
    ]);
  }

  function checkRaceComplete() {
    if (state === 'finished') return;

    // Player finished
    if (playerCar.finished) {
      state = 'finished';
      document.getElementById('nv-finish').style.display = 'flex';
      document.getElementById('nv-final-pos').textContent = position;
      document.getElementById('nv-final-time').textContent = finishTime.toFixed(1);
      return;
    }

    // Check if all AI finished and player hasn't (shouldn't happen in normal play)
    var allFinished = true;
    for (var i = 0; i < aiCars.length; i++) {
      if (!aiCars[i].finished) { allFinished = false; break; }
    }
    // Don't end if player hasn't finished
  }

  // ──────────────────────────────────────────────
  // RENDER 3D
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
    for (var i = 0; i < aiCars.length; i++) {
      E.scene.remove(aiCars[i].group);
    }
    if (playerCar && playerCar.group) {
      E.scene.remove(playerCar.group);
    }
    if (track) E.scene.remove(track);
    if (cameraPivot) E.scene.remove(cameraPivot);
    for (var j = 0; j < speedLines.length; j++) {
      E.scene.remove(speedLines[j]);
      speedLines[j].geometry.dispose();
      speedLines[j].material.dispose();
    }
    playerCar = null;
    aiCars = [];
    cityElements = [];
    speedLines = [];
    E = null;
    THREE = null;
  }

  // ──────────────────────────────────────────────
  // EXPORT
  // ──────────────────────────────────────────────

  window.NeonVelocity = {
    init: init,
    update: update,
    render3D: render3D,
    render2D: render2D,
    destroy: destroy,
    name: 'Neon Velocity',
    description: '3D Arcade Racing — Drift, boost, and race through neon tracks',
    genre: 'racing',
  };

  console.log('[NeonVelocity] Loaded. 3 laps, ' + totalRacers + ' racers.');
})();
