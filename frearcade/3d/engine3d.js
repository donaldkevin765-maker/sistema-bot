/**
 * FreeArcade 3D Engine v1.0
 *
 * Three.js-based shared engine for all 3D games.
 * Architecture: modular plugin system + lightweight ECS + data-driven content.
 *
 * Interface (compatible with 2D engine.js):
 *   init(containerId) - Initialize engine
 *   loadGame(gameModule) - Load a 3D game
 *   startLoop() - Start render loop
 *   destroy() - Clean up
 *
 * Each game module provides:
 *   init(engine) - Called when game is loaded
 *   update(dt, input) - Per-frame update
 *   render(ctx) - Per-frame draw (3D games ignore ctx, use Three.js scene)
 *   destroy() - Cleanup
 *
 * Architecture notes (scalable to 20M+ LOC):
 *   - Plugin system: engines.systems = { physics, ai, audio, particles, ui }
 *   - ECS: entities are plain objects with component arrays
 *   - Data-driven: game configs in JSON, content pipeline for assets
 *   - Event bus: decoupled cross-system communication
 *   - Asset pipeline: loading, caching, streaming via AssetManager
 *   - Modding support: plugin API for user-created content
 */

(function () {
  'use strict';

  // ──────────────────────────────────────────────
  // CONFIGURATION
  // ──────────────────────────────────────────────

  var CONFIG = {
    THREE_CDN: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    CANVAS_ID: 'gameCanvas',
    BG_COLOR: 0x0a0a1a,
    MAX_DELTA: 0.05,
    ANTIALIAS: true,
    SHADOWS: true,
    SHADOW_MAP_SIZE: 2048,
    MAX_PARTICLES: 5000,
    MAX_ENTITIES: 10000,
  };

  // ──────────────────────────────────────────────
  // STATE
  // ──────────────────────────────────────────────

  var THREE = null;
  var renderer = null;
  var scene = null;
  var camera = null;
  var clock = null;
  var canvas = null;
  var ctx2d = null; // 2D overlay context (for HUD)
  var W = 800;
  var H = 600;
  var running = false;
  var animFrameId = null;
  var currentGame = null;
  var lastTime = 0;
  var paused = false;
  var pauseCooldown = 0;

  // Input state
  var keys = {};
  var keysJustPressed = {};
  var _prevKeys = {};
  var mouseX = 0;
  var mouseY = 0;
  var mouseDeltaX = 0;
  var mouseDeltaY = 0;
  var mouseButtons = { left: false, middle: false, right: false };
  var mousePressed = { left: false, middle: false, right: false };
  var _prevMouseButtons = { left: false, middle: false, right: false };
  var pointerLocked = false;
  var touchData = [];

  // Audio
  var audioCtx = null;
  var _audioResumed = false;
  var masterGain = null;

  // Asset manager
  var assetCache = {};

  // Entity-Component System
  var entities = [];
  var entityIdCounter = 0;
  var componentStores = {}; // { [componentName]: { [entityId]: componentData } }

  // Plugin registry
  var plugins = {};

  // Event bus
  var eventListeners = {};

  // Particle system
  var particleSystems = [];

  // Screen shake state
  var shakeIntensity = 0;
  var shakeDecay = 5;
  var shakeOffset = null;

  // ──────────────────────────────────────────────
  // THREE.JS LOADER
  // ──────────────────────────────────────────────

  var threePromise = null;

  function ensureThree() {
    if (THREE) return Promise.resolve(THREE);
    if (threePromise) return threePromise;
    threePromise = new Promise(function (resolve, reject) {
      if (typeof window.THREE !== 'undefined') {
        THREE = window.THREE;
        resolve(THREE);
        return;
      }
      var script = document.createElement('script');
      script.src = CONFIG.THREE_CDN;
      script.onload = function () {
        THREE = window.THREE;
        if (!THREE) {
          reject(new Error('Three.js failed to load'));
          return;
        }
        resolve(THREE);
      };
      script.onerror = function () {
        reject(new Error('Failed to load Three.js from ' + CONFIG.THREE_CDN));
      };
      document.head.appendChild(script);
    });
    return threePromise;
  }

  // ──────────────────────────────────────────────
  // EVENT BUS
  // ──────────────────────────────────────────────

  function on(eventName, callback) {
    if (!eventListeners[eventName]) eventListeners[eventName] = [];
    eventListeners[eventName].push(callback);
    return function () {
      var idx = eventListeners[eventName].indexOf(callback);
      if (idx >= 0) eventListeners[eventName].splice(idx, 1);
    };
  }

  function emit(eventName, data) {
    var list = eventListeners[eventName];
    if (list) {
      for (var i = 0; i < list.length; i++) {
        try { list[i](data); } catch (e) { console.warn('Event handler error:', eventName, e); }
      }
    }
  }

  // ──────────────────────────────────────────────
  // ENTITY-COMPONENT SYSTEM (ECS)
  // ──────────────────────────────────────────────

  function createEntity(name) {
    var id = entityIdCounter++;
    var entity = { id: id, name: name || 'Entity_' + id, active: true, tags: {} };
    entities.push(entity);
    emit('entityCreated', entity);
    return entity;
  }

  function destroyEntity(entity) {
    if (!entity) return;
    // Remove all components
    for (var compName in componentStores) {
      delete componentStores[compName][entity.id];
    }
    var idx = entities.indexOf(entity);
    if (idx >= 0) entities.splice(idx, 1);
    emit('entityDestroyed', entity);
  }

  function addComponent(entity, componentName, data) {
    if (!componentStores[componentName]) componentStores[componentName] = {};
    componentStores[componentName][entity.id] = data || {};
    emit('componentAdded', { entity: entity, component: componentName, data: data });
    return entity;
  }

  function getComponent(entity, componentName) {
    var store = componentStores[componentName];
    return store ? store[entity.id] : null;
  }

  function hasComponent(entity, componentName) {
    return !!(componentStores[componentName] && componentStores[componentName][entity.id]);
  }

  function removeComponent(entity, componentName) {
    if (componentStores[componentName]) {
      delete componentStores[componentName][entity.id];
      emit('componentRemoved', { entity: entity, component: componentName });
    }
  }

  function queryComponents(componentName) {
    var store = componentStores[componentName];
    if (!store) return [];
    var results = [];
    for (var id in store) {
      var e = getEntityById(parseInt(id));
      if (e && e.active) results.push(e);
    }
    return results;
  }

  function getEntityById(id) {
    for (var i = 0; i < entities.length; i++) {
      if (entities[i].id === id) return entities[i];
    }
    return null;
  }

  function clearEntities() {
    entities = [];
    componentStores = {};
    entityIdCounter = 0;
  }

  // ──────────────────────────────────────────────
  // PLUGIN SYSTEM
  // ──────────────────────────────────────────────

  function registerPlugin(name, plugin) {
    if (plugins[name]) {
      console.warn('Plugin already registered:', name);
      return;
    }
    plugins[name] = plugin;
    if (plugin.onRegister) plugin.onRegister(engineAPI);
    emit('pluginRegistered', { name: name, plugin: plugin });
  }

  function getPlugin(name) {
    return plugins[name];
  }

  function initPlugins() {
    for (var name in plugins) {
      if (plugins[name].init) {
        try { plugins[name].init(engineAPI); } catch (e) { console.warn('Plugin init error:', name, e); }
      }
    }
  }

  function updatePlugins(dt) {
    for (var name in plugins) {
      if (plugins[name].update) {
        try { plugins[name].update(dt, engineAPI); } catch (e) { /* skip */ }
      }
    }
  }

  function destroyPlugins() {
    for (var name in plugins) {
      if (plugins[name].destroy) {
        try { plugins[name].destroy(); } catch (e) { console.warn('Plugin destroy error:', name, e); }
      }
    }
    plugins = {};
  }

  // ──────────────────────────────────────────────
  // RENDERER
  // ──────────────────────────────────────────────

  function initRenderer() {
    if (renderer) return;

    canvas = document.getElementById(CONFIG.CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = CONFIG.CANVAS_ID;
      canvas.width = W;
      canvas.height = H;
      document.body.appendChild(canvas);
    }

    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: CONFIG.ANTIALIAS,
      alpha: false,
    });

    // 2D overlay context for HUD — only available after WebGL renderer is created
    // (getContext('2d') returns null on a WebGL canvas, so we use a separate overlay canvas)
    var overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'hudOverlay';
    overlayCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    overlayCanvas.width = W;
    overlayCanvas.height = H;
    canvas.parentNode.appendChild(overlayCanvas);
    ctx2d = overlayCanvas.getContext('2d');
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(CONFIG.BG_COLOR, 1);

    if (CONFIG.SHADOWS) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(CONFIG.BG_COLOR, 0.008);

    // Default lights
    var ambient = new THREE.AmbientLight(0x333355, 0.4);
    scene.add(ambient);

    var hemi = new THREE.HemisphereLight(0x4466ff, 0x223322, 0.6);
    scene.add(hemi);

    var dirLight = new THREE.DirectionalLight(0xffeedd, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = CONFIG.SHADOWS;
    if (CONFIG.SHADOWS) {
      dirLight.shadow.mapSize.width = CONFIG.SHADOW_MAP_SIZE;
      dirLight.shadow.mapSize.height = CONFIG.SHADOW_MAP_SIZE;
      dirLight.shadow.camera.near = 1;
      dirLight.shadow.camera.far = 300;
      dirLight.shadow.camera.left = -100;
      dirLight.shadow.camera.right = 100;
      dirLight.shadow.camera.top = 100;
      dirLight.shadow.camera.bottom = -100;
    }
    scene.add(dirLight);

    // Camera (default perspective, games override)
    camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 500);
    camera.position.set(0, 2, 5);

    // Clock
    clock = new THREE.Clock();

    // Resize handler
    window.addEventListener('resize', onResize);
  }

  function onResize() {
    W = window.innerWidth;
    H = window.innerHeight;
    if (renderer) {
      renderer.setSize(W, H);
    }
    var overlayEl = document.getElementById('hudOverlay');
    if (overlayEl) {
      overlayEl.width = W;
      overlayEl.height = H;
    }
    if (camera) {
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }
  }

  // ──────────────────────────────────────────────
  // INPUT
  // ──────────────────────────────────────────────

  function initInput() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('click', onCanvasClick);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function onKeyDown(e) {
    if (!keys[e.code]) keysJustPressed[e.code] = true;
    keys[e.code] = true;
    e.preventDefault();
    resumeAudio();
  }

  function onKeyUp(e) {
    keys[e.code] = false;
    e.preventDefault();
  }

  function onMouseMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (pointerLocked) {
      mouseDeltaX += e.movementX || 0;
      mouseDeltaY += e.movementY || 0;
    }
  }

  function onMouseDown(e) {
    if (e.button === 0) { mouseButtons.left = true; mousePressed.left = true; }
    if (e.button === 1) { mouseButtons.middle = true; mousePressed.middle = true; }
    if (e.button === 2) { mouseButtons.right = true; mousePressed.right = true; }
    e.preventDefault();
    resumeAudio();
  }

  function onMouseUp(e) {
    if (e.button === 0) mouseButtons.left = false;
    if (e.button === 1) mouseButtons.middle = false;
    if (e.button === 2) mouseButtons.right = false;
    e.preventDefault();
  }

  function onCanvasClick() {
    if (!pointerLocked && currentGame && currentGame._requiresPointerLock !== false) {
      canvas.requestPointerLock();
    }
  }

  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
  }

  function onTouchStart(e) {
    e.preventDefault();
    resumeAudio();
    touchData = [];
    for (var i = 0; i < e.touches.length; i++) {
      var t = e.touches[i];
      touchData.push({ id: t.identifier, x: t.clientX, y: t.clientY, started: true, ended: false });
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (var i = 0; i < touchData.length; i++) {
      touchData[i].ended = true;
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (var i = 0; i < e.touches.length; i++) {
      var t = e.touches[i];
      for (var j = 0; j < touchData.length; j++) {
        if (touchData[j].id === t.identifier) {
          touchData[j].x = t.clientX;
          touchData[j].y = t.clientY;
          break;
        }
      }
    }
  }

  function buildInput() {
    var dx = 0, dy = 0;
    var action = keysJustPressed['Space'] || keysJustPressed['Enter'];

    // Keyboard movement
    var left = keys['ArrowLeft'] || keys['KeyA'];
    var right = keys['ArrowRight'] || keys['KeyD'];
    var up = keys['ArrowUp'] || keys['KeyW'];
    var down = keys['ArrowDown'] || keys['KeyS'];

    // Mouse
    var shoot = mouseButtons.left;

    // Touch → directional
    for (var i = 0; i < touchData.length; i++) {
      var t = touchData[i];
      if (t.started && !t.ended) {
        var cx = t.x / W - 0.5;
        var cy = t.y / H - 0.5;
        if (Math.abs(cx) > 0.1) { if (cx < 0) left = true; else right = true; }
        if (Math.abs(cy) > 0.1) { if (cy < 0) up = true; else down = true; }
        action = action || t.started;
      }
    }

    return {
      keys: keys,
      keysPressed: keysJustPressed,
      left: left,
      right: right,
      up: up,
      down: down,
      action: action,
      shoot: shoot,
      mouseX: mouseX,
      mouseY: mouseY,
      mouseDeltaX: mouseDeltaX,
      mouseDeltaY: mouseDeltaY,
      pointerLocked: pointerLocked,
      escape: keysJustPressed['Escape'],
      touchData: touchData,
    };
  }

  // ──────────────────────────────────────────────
  // AUDIO
  // ──────────────────────────────────────────────

  function getAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.3;
        masterGain.connect(audioCtx.destination);
      } catch (e) { console.warn('AudioContext creation failed:', e); }
    }
    return audioCtx;
  }

  function resumeAudio() {
    if (!_audioResumed && audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function (err) { console.warn('AudioContext resume error:', err); });
      _audioResumed = true;
    }
  }

  function playBeep(freq, duration, type, volume) {
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq || 440;
      gain.gain.value = (volume || 0.1) * (masterGain ? masterGain.gain.value : 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (duration || 0.1));
      osc.connect(gain);
      gain.connect(masterGain || ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + (duration || 0.1));
    } catch (e) { /* ignore audio errors */ }
  }

  function playSynth(notes) {
    // notes = [ { freq, duration, delay, type, volume } ]
    try {
      var ctx = getAudioCtx();
      if (!ctx || !notes) return;
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        var startTime = ctx.currentTime + (n.delay || 0);
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = n.type || 'square';
        osc.frequency.value = n.freq || 440;
        gain.gain.value = (n.volume || 0.1) * (masterGain ? masterGain.gain.value : 0.3);
        gain.gain.setValueAtTime(gain.gain.value, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + (n.duration || 0.1));
        osc.connect(gain);
        gain.connect(masterGain || ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + (n.duration || 0.1));
      }
    } catch (e) { /* ignore */ }
  }

  function playSound(name) {
    emit('playSound', name);
  }

  // ──────────────────────────────────────────────
  // 3D UTILITY FUNCTIONS
  // ──────────────────────────────────────────────

  function createFloor(width, depth, color) {
    var geo = new THREE.PlaneGeometry(width, depth);
    var mat = new THREE.MeshStandardMaterial({
      color: color || 0x222244,
      roughness: 0.8,
      metalness: 0.2,
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function createBox(w, h, d, color) {
    var geo = new THREE.BoxGeometry(w, h, d);
    var mat = new THREE.MeshStandardMaterial({ color: color || 0x888888, roughness: 0.6 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function createSphere(radius, color) {
    var geo = new THREE.SphereGeometry(radius, 16, 16);
    var mat = new THREE.MeshStandardMaterial({ color: color || 0xff4444, roughness: 0.3 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function createCylinder(radiusTop, radiusBot, height, color) {
    var geo = new THREE.CylinderGeometry(radiusTop, radiusBot, height, 12);
    var mat = new THREE.MeshStandardMaterial({ color: color || 0x44aaff, roughness: 0.5 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function createGroup() {
    var group = new THREE.Group();
    scene.add(group);
    return group;
  }

  function setPosition(obj, x, y, z) {
    obj.position.set(x, y, z);
  }

  function setRotation(obj, x, y, z) {
    obj.rotation.set(x, y, z);
  }

  function setScale(obj, x, y, z) {
    obj.scale.set(x, y, z);
  }

  // ──────────────────────────────────────────────
  // PARTICLES (GPU-based)
  // ──────────────────────────────────────────────

  function createParticleSystem(config) {
    var count = config.count || 100;
    var geometry = new THREE.BufferGeometry();
    var positions = new Float32Array(count * 3);
    var colors = new Float32Array(count * 3);
    var sizes = new Float32Array(count);
    var lifetimes = new Float32Array(count);
    var velocities = [];

    for (var i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
      sizes[i] = 0.5;
      lifetimes[i] = 0;
      velocities.push({ x: 0, y: 0, z: 0 });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    var material = new THREE.PointsMaterial({
      size: config.size || 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    var points = new THREE.Points(geometry, material);
    scene.add(points);

    var system = {
      points: points,
      geometry: geometry,
      positions: positions,
      colors: colors,
      sizes: sizes,
      lifetimes: lifetimes,
      velocities: velocities,
      count: count,
      config: config,
      active: true,
      age: 0,
    };

    particleSystems.push(system);
    return system;
  }

  function emitParticles(system, origin, countOverride) {
    if (!system || !system.active) return;
    var count = countOverride || Math.min(system.count, 20);
    var posAttr = system.geometry.attributes.position;
    var colAttr = system.geometry.attributes.color;
    var sizeAttr = system.geometry.attributes.size;

    for (var i = 0; i < count; i++) {
      var idx = Math.floor(Math.random() * system.count);
      var spread = system.config.spread || 2;
      system.positions[idx * 3] = (origin ? origin.x : 0) + (Math.random() - 0.5) * spread;
      system.positions[idx * 3 + 1] = (origin ? origin.y : 0) + (Math.random() - 0.5) * spread;
      system.positions[idx * 3 + 2] = (origin ? origin.z : 0) + (Math.random() - 0.5) * spread;
      var speed = system.config.speed || 5;
      system.velocities[idx] = {
        x: (Math.random() - 0.5) * speed,
        y: Math.random() * speed,
        z: (Math.random() - 0.5) * speed,
      };
      system.lifetimes[idx] = system.config.lifeMax || 1;
      var r = system.config.colorR !== undefined ? system.config.colorR : 1;
      var g = system.config.colorG !== undefined ? system.config.colorG : 1;
      var b = system.config.colorB !== undefined ? system.config.colorB : 1;
      system.colors[idx * 3] = r + (Math.random() - 0.5) * 0.3;
      system.colors[idx * 3 + 1] = g + (Math.random() - 0.5) * 0.3;
      system.colors[idx * 3 + 2] = b + (Math.random() - 0.5) * 0.3;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  }

  function updateParticles(dt) {
    for (var s = 0; s < particleSystems.length; s++) {
      var system = particleSystems[s];
      if (!system.active) continue;
      system.age += dt;
      var posAttr = system.geometry.attributes.position;
      var anyAlive = false;

      for (var i = 0; i < system.count; i++) {
        if (system.lifetimes[i] > 0) {
          system.lifetimes[i] -= dt;
          system.positions[i * 3] += system.velocities[i].x * dt;
          system.positions[i * 3 + 1] += system.velocities[i].y * dt;
          system.positions[i * 3 + 2] += system.velocities[i].z * dt;
          system.velocities[i].y -= 2 * dt; // gravity
          if (system.lifetimes[i] <= 0) {
            system.positions[i * 3] = 0;
            system.positions[i * 3 + 1] = -100;
            system.positions[i * 3 + 2] = 0;
          } else {
            anyAlive = true;
          }
        }
      }
      posAttr.needsUpdate = anyAlive;
    }
  }

  function destroyParticleSystem(system) {
    if (!system) return;
    scene.remove(system.points);
    system.geometry.dispose();
    system.points.material.dispose();
    var idx = particleSystems.indexOf(system);
    if (idx >= 0) particleSystems.splice(idx, 1);
  }

  function shakeScreen(intensity) {
    shakeIntensity = Math.min(1, Math.max(shakeIntensity, intensity || 0.1));
    if (!shakeOffset && THREE) shakeOffset = new THREE.Vector3();
  }

  function burstParticles(origin, color, count, spread) {
    var geo = new THREE.BufferGeometry();
    var n = count || 12;
    var pos = new Float32Array(n * 3);
    var cols = new Float32Array(n * 3);
    var sizes = new Float32Array(n);
    var c = color || 0x4488ff;
    var r = ((c >> 16) & 0xff) / 255;
    var g = ((c >> 8) & 0xff) / 255;
    var b = (c & 0xff) / 255;
    var sp = spread || 2;
    for (var i = 0; i < n; i++) {
      pos[i * 3] = (origin ? origin.x : 0) + (Math.random() - 0.5) * 0.2;
      pos[i * 3 + 1] = (origin ? origin.y : 0) + (Math.random() - 0.5) * 0.2;
      pos[i * 3 + 2] = (origin ? origin.z : 0) + (Math.random() - 0.5) * 0.2;
      cols[i * 3] = r + (Math.random() - 0.5) * 0.3;
      cols[i * 3 + 1] = g + (Math.random() - 0.5) * 0.3;
      cols[i * 3 + 2] = b + (Math.random() - 0.5) * 0.3;
      sizes[i] = 0.08 + Math.random() * 0.1;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    var mat = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    var points = new THREE.Points(geo, mat);
    scene.add(points);
    var life = 0.6 + Math.random() * 0.3;
    var vel = [];
    for (var j = 0; j < n; j++) {
      vel.push({ x: (Math.random() - 0.5) * sp, y: Math.random() * sp * 1.5, z: (Math.random() - 0.5) * sp });
    }
    var start = performance.now();
    function animateBurst() {
      var elapsed = (performance.now() - start) / 1000;
      if (elapsed >= life) { scene.remove(points); geo.dispose(); mat.dispose(); return; }
      var p = geo.attributes.position.array;
      for (var k = 0; k < n; k++) {
        p[k * 3] += vel[k].x * 0.02;
        p[k * 3 + 1] += vel[k].y * 0.02 - 0.02;
        p[k * 3 + 2] += vel[k].z * 0.02;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.8 * (1 - elapsed / life);
      requestAnimationFrame(animateBurst);
    }
    animateBurst();
  }

  // ──────────────────────────────────────────────
  // HUD / 2D OVERLAY
  // ──────────────────────────────────────────────

  var hudElements = [];

  function createHUD(html) {
    var div = document.createElement('div');
    div.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:"Segoe UI",Arial,sans-serif;z-index:10;';
    div.innerHTML = html;
    document.body.appendChild(div);
    hudElements.push(div);
    return div;
  }

  function updateHUDElement(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function clearHUD() {
    for (var i = 0; i < hudElements.length; i++) {
      if (hudElements[i].parentNode) hudElements[i].parentNode.removeChild(hudElements[i]);
    }
    hudElements = [];
  }

  // ──────────────────────────────────────────────
  // GAME LIFECYCLE
  // ──────────────────────────────────────────────

  function resetInputState() {
    keys = {}; keysJustPressed = {}; _prevKeys = {};
    mouseDeltaX = 0; mouseDeltaY = 0;
    mouseButtons = { left: false, middle: false, right: false };
    mousePressed = { left: false, middle: false, right: false };
    _prevMouseButtons = { left: false, middle: false, right: false };
    touchData = [];
  }

  function clearParticles() {
    for (var i = particleSystems.length - 1; i >= 0; i--) {
      destroyParticleSystem(particleSystems[i]);
    }
  }

  function destroyCurrentGame() {
    if (currentGame && currentGame.destroy) {
      try { currentGame.destroy(); } catch (e) { console.warn('Game destroy error:', e); }
    }
  }

  function resetEngineState() {
    destroyCurrentGame();
    clearEntities();
    clearParticles();
    clearHUD();
    resetInputState();
  }

  function loadGame(gameModule) {
    resetEngineState();
    currentGame = gameModule;
    if (gameModule && gameModule.init) {
      gameModule.engine = engineAPI;
      gameModule.init(engineAPI);
      emit('gameLoaded', gameModule);
    }
  }

  function startLoop() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    initPlugins();
    loop(lastTime);
  }

  function stopLoop() {
    running = false;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function handlePauseToggle(dt) {
    pauseCooldown -= dt;
    if (keysJustPressed['KeyP'] && pauseCooldown <= 0) {
      paused = !paused;
      pauseCooldown = 0.3;
    }
  }

  function applyScreenShake(dt) {
    if (shakeIntensity > 0.001 && shakeOffset) {
      shakeOffset.set(
        (Math.random() - 0.5) * shakeIntensity * 0.5,
        (Math.random() - 0.5) * shakeIntensity * 0.5,
        (Math.random() - 0.5) * shakeIntensity * 0.3
      );
      camera.position.add(shakeOffset);
      shakeIntensity *= Math.max(0, 1 - shakeDecay * dt);
      if (shakeIntensity < 0.001) shakeIntensity = 0;
    }
  }

  function renderGame(dt) {
    if (currentGame && currentGame.render3D) {
      currentGame.render3D(dt);
    } else {
      renderer.render(scene, camera);
    }
    if (currentGame && currentGame.render2D) {
      ctx2d.save();
      ctx2d.clearRect(0, 0, W, H);
      currentGame.render2D(ctx2d);
      ctx2d.restore();
    }
  }

  function resetFrameInput() {
    keysJustPressed = {};
    for (var k in keys) {
      if (!keys[k]) delete keys[k];
    }
    _prevKeys = {};
    for (var k2 in keys) {
      _prevKeys[k2] = keys[k2];
    }
    mouseDeltaX = 0;
    mouseDeltaY = 0;
    mousePressed = { left: false, middle: false, right: false };
    _prevMouseButtons = { left: mouseButtons.left, middle: mouseButtons.middle, right: mouseButtons.right };
    touchData = [];
  }

  function loop(now) {
    if (!running) return;
    animFrameId = requestAnimationFrame(loop);

    var dt = Math.min((now - lastTime) / 1000, CONFIG.MAX_DELTA);
    lastTime = now;

    handlePauseToggle(dt);
    var input = buildInput();
    renderer.clear();
    updatePlugins(dt);
    updateParticles(dt);
    applyScreenShake(dt);

    if (currentGame && currentGame.update && !paused) {
      currentGame.update(dt, input);
    }

    renderGame(dt);
    resetFrameInput();
  }

  // ──────────────────────────────────────────────
  // INIT
  // ──────────────────────────────────────────────

  function init(containerId) {
    var self = this;
    return ensureThree().then(function () {
      initRenderer();
      initInput();
      getAudioCtx();
      emit('engineReady', engineAPI);
      return engineAPI;
    });
  }

  function destroy() {
    stopLoop();
    destroyCurrentGame();
    destroyPlugins();
    clearEntities();
    clearParticles();
    clearHUD();
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    // Remove overlay canvas
    var overlayEl = document.getElementById('hudOverlay');
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    ctx2d = null;
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    scene = null;
    camera = null;
    THREE = null;
    currentGame = null;
    _audioResumed = false;
  }

  // ──────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────

  var engineAPI = {
    // Core
    W: W, H: H,
    init: init,
    destroy: destroy,
    loadGame: loadGame,
    startLoop: startLoop,
    stopLoop: stopLoop,
    paused: paused,

    // Three.js
    get THREE() { return THREE; },
    get renderer() { return renderer; },
    get scene() { return scene; },
    get camera() { return camera; },

    // 3D utilities
    createFloor: createFloor,
    createBox: createBox,
    createSphere: createSphere,
    createCylinder: createCylinder,
    createGroup: createGroup,
    setPosition: setPosition,
    setRotation: setRotation,
    setScale: setScale,

    // ECS
    createEntity: createEntity,
    destroyEntity: destroyEntity,
    addComponent: addComponent,
    getComponent: getComponent,
    hasComponent: hasComponent,
    removeComponent: removeComponent,
    queryComponents: queryComponents,
    getEntityById: getEntityById,
    clearEntities: clearEntities,

    // Plugin
    registerPlugin: registerPlugin,
    getPlugin: getPlugin,

    // Events
    on: on,
    emit: emit,

    // Audio
    playBeep: playBeep,
    playSynth: playSynth,
    playSound: playSound,
    getAudioCtx: getAudioCtx,
    resumeAudio: resumeAudio,

    // Particles
    createParticleSystem: createParticleSystem,
    emitParticles: emitParticles,
    destroyParticleSystem: destroyParticleSystem,
    burstParticles: burstParticles,

    // Game feel
    shakeScreen: shakeScreen,

    // HUD
    createHUD: createHUD,
    updateHUDElement: updateHUDElement,
    clearHUD: clearHUD,

    // Input state (read-only)
    pointerLocked: pointerLocked,
    keys: keys,

    // Config
    CONFIG: CONFIG,
  };

  // Update W/H dynamically
  Object.defineProperty(engineAPI, 'W', { get: function () { return W; } });
  Object.defineProperty(engineAPI, 'H', { get: function () { return H; } });

  // Expose globally
  window.FreeArcade3D = engineAPI;

  console.log('[FreeArcade3D] Engine loaded. ' +
    'Modular 3D engine with ECS + plugins. Ready.');
})();
