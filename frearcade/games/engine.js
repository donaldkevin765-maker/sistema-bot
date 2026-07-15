/**
 * FreeArcade Game Engine — lightweight retro game framework
 * Provides: game loop, input, canvas rendering, simple audio, level system, screen shake, pause
 *
 * Performance design:
 *  - Single requestAnimationFrame loop with clamped delta (max 50ms)
 *  - Particle/object array cleanup via splice on reverse iteration
 *  - Audio context resumed on first user gesture (Chrome autoplay policy)
 *  - Canvas cleared per frame, no stacking or stale pixels
 */
window.FreeArcadeEngine = (function () {
  'use strict';

  var canvas, ctx, W, H;
  var _listenersAttached = false;
  var _audioResumed = false;

  // ── Input ──
  var keys = {};
  var keysJustPressed = {};
  var _prevKeys = {};

  function onKeyDown(e) {
    if (!keys[e.code]) {
      keysJustPressed[e.code] = true;
    }
    keys[e.code] = true;
    e.preventDefault();
    _resumeAudio();
  }
  function onKeyUp(e) {
    keys[e.code] = false;
    e.preventDefault();
  }

  // Touch → directional mapping (multi-touch virtual joystick)
  var touchStartX = 0, touchStartY = 0;
  var touchDir = null;
  var touchJustTapped = false;
  var _joystickData = []; // multi-touch support

  function onTouchStart(e) {
    e.preventDefault();
    _resumeAudio();
    // Multi-touch joystick
    _joystickData = [];
    for (var ti = 0; ti < e.touches.length; ti++) {
      var t = e.touches[ti];
      _joystickData.push({
        id: t.identifier,
        startX: t.clientX, startY: t.clientY,
        currentX: t.clientX, currentY: t.clientY,
        dx: 0, dy: 0,
        active: true,
      });
    }
    // Legacy single-touch mapping
    var t2 = e.touches[0];
    touchStartX = t2.clientX;
    touchStartY = t2.clientY;
    touchDir = null;
  }
  function onTouchEnd(e) {
    e.preventDefault();
    if (e.touches.length === 0) {
      if (touchDir === null) touchJustTapped = true;
      touchDir = null;
      _joystickData = [];
      return;
    }
    // Remove ended touches from multi-touch
    var remainingIds = {};
    for (var ti2 = 0; ti2 < e.touches.length; ti2++) {
      remainingIds[e.touches[ti2].identifier] = true;
    }
    for (var ti3 = _joystickData.length - 1; ti3 >= 0; ti3--) {
      if (!remainingIds[_joystickData[ti3].id]) {
        _joystickData.splice(ti3, 1);
      }
    }
    // Update legacy mapping
    if (e.touches.length > 0) {
      var t3 = e.touches[0];
      touchStartX = t3.clientX;
      touchStartY = t3.clientY;
      touchDir = null;
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    // Update multi-touch
    for (var ti4 = 0; ti4 < e.touches.length; ti4++) {
      var t4 = e.touches[ti4];
      for (var ti5 = 0; ti5 < _joystickData.length; ti5++) {
        if (_joystickData[ti5].id === t4.identifier) {
          _joystickData[ti5].currentX = t4.clientX;
          _joystickData[ti5].currentY = t4.clientY;
          _joystickData[ti5].dx = t4.clientX - _joystickData[ti5].startX;
          _joystickData[ti5].dy = t4.clientY - _joystickData[ti5].startY;
          break;
        }
      }
    }
    // Legacy single-touch mapping
    var t5 = e.touches[0];
    var dx2 = t5.clientX - touchStartX;
    var dy2 = t5.clientY - touchStartY;
    var threshold = 20;
    if (Math.abs(dx2) > threshold || Math.abs(dy2) > threshold) {
      if (Math.abs(dx2) > Math.abs(dy2)) {
        touchDir = dx2 > 0 ? 'right' : 'left';
      } else {
        touchDir = dy2 > 0 ? 'down' : 'up';
      }
    }
  }

  function getJoysticks() {
    return _joystickData;
  }

  // ── Audio ──
  var audioCtx = null;

  function _resumeAudio() {
    if (!_audioResumed && audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function (err) { console.warn('AudioContext resume error:', err); });
      _audioResumed = true;
    }
  }

  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { console.warn('AudioContext creation failed:', e); }
    }
    return audioCtx;
  }

  function playBeep(freq, duration, type, volume) {
    try {
      var ctx = getAudioCtx();
      if (!ctx) return;
      // Slight random pitch variation for more organic sound
      var pFreq = freq * (0.95 + Math.random() * 0.1);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(pFreq, ctx.currentTime);
      gain.gain.setValueAtTime(volume || 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) { console.warn('playBeep error:', e); }
  }

  // Predefined sounds with slight randomization for richness
  var _soundDefs = {
    shoot:    { freq: 800,  dur: 0.08, type: 'square', vol: 0.08 },
    hit:      { freq: 300,  dur: 0.12, type: 'sawtooth', vol: 0.10 },
    explode:  { freq: 120,  dur: 0.30, type: 'sawtooth', vol: 0.14 },
    powerup:  { freq: 900,  dur: 0.08, type: 'square', vol: 0.07 },
    coin:     { freq: 1200, dur: 0.06, type: 'square', vol: 0.06 },
    blip:     { freq: 500,  dur: 0.04, type: 'square', vol: 0.05 },
    warning:  { freq: 400,  dur: 0.10, type: 'square', vol: 0.07 },
  };

  function playSound(name) {
    var s = _soundDefs[name];
    if (!s) { playBeep(440, 0.1, 'square', 0.05); return; }
    playBeep(s.freq, s.dur, s.type, s.vol);
  }

  // Play a sequence of notes scheduled on AudioContext time (no setTimeout)
  function playSynth(notes) {
    try {
      var ctx = getAudioCtx();
      if (!ctx || !notes) return;
      for (var si = 0; si < notes.length; si++) {
        var n = notes[si];
        var startT = ctx.currentTime + (n.t || 0);
        var dur = n.d || 0.1;
        var osc2 = ctx.createOscillator();
        var gain2 = ctx.createGain();
        osc2.type = n.type || 'square';
        osc2.frequency.setValueAtTime(n.freq || 440, startT);
        if (n.sweep) osc2.frequency.linearRampToValueAtTime(n.sweep, startT + dur);
        gain2.gain.setValueAtTime(n.vol || 0.1, startT);
        gain2.gain.exponentialRampToValueAtTime(0.001, startT + dur);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(startT);
        osc2.stop(startT + dur);
      }
    } catch (e) { console.warn('playSynth error:', e); }
  }

  function playShoot()   { playSound('shoot'); }
  function playHit()     { playSound('hit'); }
  function playExplode() { playSound('explode'); }
  function playPowerup() { playSynth([{t:0, freq:900, d:0.08, vol:0.07},{t:0.08, freq:1400, d:0.08, vol:0.06}]); }
  function playLevelUp() { playSynth([{t:0, freq:600, d:0.10, vol:0.08},{t:0.12, freq:800, d:0.10, vol:0.08},{t:0.24, freq:1000, d:0.15, vol:0.08}]); }
  function playGameOver(){ playSynth([{t:0, freq:200, d:0.30, vol:0.12, type:'sawtooth'},{t:0.32, freq:150, d:0.40, vol:0.12, type:'sawtooth'}]); }
  function playCoin()    { playSynth([{t:0, freq:1200, d:0.06, vol:0.06},{t:0.07, freq:1600, d:0.08, vol:0.06}]); }

  // ── Screen Shake ──
  var _shakeIntensity = 0;
  var _shakeDuration = 0;
  var _shakeX = 0, _shakeY = 0;

  // ── Hitstop (freeze-frame su impatto) ──
  var _hitstop = 0;

  function triggerHitstop(duration) {
    _hitstop = duration || 0.08;
  }

  function isHitstop() {
    return _hitstop > 0;
  }

  function getHitstopFactor() {
    return _hitstop > 0 ? 0 : 1;
  }

  function shake(intensity, duration) {
    _shakeIntensity = intensity || 4;
    _shakeDuration = duration || 0.2;
  }

  function _updateShake(dt) {
    // Hitstop freezes shake decay too
    if (_hitstop > 0) {
      _hitstop -= dt;
      if (_hitstop < 0) _hitstop = 0;
      return;
    }
    if (_shakeDuration > 0) {
      _shakeDuration -= dt;
      _shakeX = (Math.random() - 0.5) * _shakeIntensity * 2;
      _shakeY = (Math.random() - 0.5) * _shakeIntensity * 2;
      if (_shakeDuration <= 0) {
        _shakeIntensity = 0;
        _shakeX = 0;
        _shakeY = 0;
      }
    }
  }

  // ── Pause ──
  var _paused = false;
  var _pauseCooldown = 0;

  function isPaused() { return _paused; }

  // ── Rendering utilities ──
  function clear(color) {
    ctx.fillStyle = color || '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color || '#fff';
    ctx.fillRect((x + _shakeX) | 0, (y + _shakeY) | 0, w | 0, h | 0);
  }

  function rectStroke(x, y, w, h, color, lw) {
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = lw || 2;
    ctx.strokeRect((x + _shakeX) | 0, (y + _shakeY) | 0, w | 0, h | 0);
  }

  function text(txt, x, y, size, color, align) {
    ctx.font = (size || 14) + 'px "Press Start 2P", monospace';
    ctx.fillStyle = color || '#fff';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(txt, (x + _shakeX) | 0, (y + _shakeY) | 0);
  }

  function textShadow(txt, x, y, size, color, shadowColor) {
    text(txt, x + 2, y + 2, size, shadowColor || 'rgba(0,0,0,0.5)');
    text(txt, x, y, size, color || '#fff');
  }

  function textCenter(txt, x, y, size, color) {
    text(txt, x, y, size, color, 'center');
  }

  function textCenterShadow(txt, x, y, size, color, shadowColor) {
    text(txt, x + 2, y + 2, size, shadowColor || 'rgba(0,0,0,0.6)', 'center');
    text(txt, x, y, size, color || '#fff', 'center');
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color || '#fff';
    ctx.beginPath();
    ctx.arc((x + _shakeX) | 0, (y + _shakeY) | 0, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Particle system helper (lightweight) ──
  var MAX_PARTICLES = 300;

  function emitParticles(list, x, y, color, count, opts) {
    if (!list) return;
    opts = opts || {};
    var speedMin = opts.speedMin || 30;
    var speedMax = opts.speedMax || 120;
    var sizeMin = opts.sizeMin || 2;
    var sizeMax = opts.sizeMax || 5;
    var lifeMin = opts.lifeMin || 0.3;
    var lifeMax = opts.lifeMax || 0.5;
    var count2 = Math.min(count || 10, MAX_PARTICLES - list.length);
    for (var i = 0; i < count2; i++) {
      var angle = Math.random() * Math.PI * 2;
      var spd = speedMin + Math.random() * (speedMax - speedMin);
      list.push({
        x: x, y: y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 20, // slight upward bias
        life: lifeMin + Math.random() * (lifeMax - lifeMin),
        maxLife: lifeMax,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        color: color || '#ff6600'
      });
    }
  }

  function updateParticles(list, dt) {
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt; // gravity
      p.life -= dt;
      p.size *= 0.97;
      if (p.life <= 0 || p.size < 0.3) {
        list.splice(i, 1);
      }
    }
  }

  function drawParticles(ctx, list) {
    var len = list.length;
    if (len === 0) return;
    for (var i = 0; i < len; i++) {
      var p = list[i];
      var alpha = Math.max(0, p.life / p.maxLife);
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      var px = (p.x + _shakeX) | 0;
      var py = (p.y + _shakeY) | 0;
      var s = p.size | 0;
      ctx.fillRect(px - (s >> 1), py - (s >> 1), s, s);
    }
    ctx.globalAlpha = 1;
  }

  // ── Game module system ──
  var currentGame = null;
  var animFrameId = null;
  var lastTime = 0;
  var running = false;

  var _level = 1;
  var _score = 0;
  var _lives = 3;
  var _levelCallbacks = {};

  function getLevel()   { return _level; }
  function setLevel(l)  { _level = l; }
  function getScore()   { return _score; }
  function addScore(p)  { _score += p; }
  function setScore(s)  { _score = s; }
  function getLives()   { return _lives; }
  function setLives(l)  { _lives = l; }
  function addLife()    { _lives++; }
  function loseLife()   { _lives--; return _lives >= 0; }

  function onLevelCleared(cb) { _levelCallbacks.onLevelCleared = cb; }
  function onGameOver(cb)     { _levelCallbacks.onGameOver = cb; }
  function triggerLevelCleared() { if (_levelCallbacks.onLevelCleared) _levelCallbacks.onLevelCleared(_level); }
  function triggerGameOver()     { if (_levelCallbacks.onGameOver) _levelCallbacks.onGameOver(_score); }

  var _canvasId = 'canvas';

  function loadGame(gameModule) {
    if (currentGame && currentGame.destroy) {
      try { currentGame.destroy(); } catch (e) { console.warn('Game destroy error (loadGame):', e); }
    }
    stopLoop();

    canvas = document.getElementById(_canvasId);
    if (!canvas) return console.error('Canvas not found');
    ctx = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;

    _level = 1;
    _score = 0;
    _lives = 3;
    _levelCallbacks = {};
    _paused = false;
    _pauseCooldown = 0;
    _shakeIntensity = 0;
    _shakeDuration = 0;
    _shakeX = 0;
    _shakeY = 0;
    currentGame = null;

    if (gameModule && gameModule.init) {
      currentGame = gameModule;
      gameModule.engine = {
        W: W, H: H,
        clear: clear,
        rect: rect,
        rectStroke: rectStroke,
        text: text,
        textShadow: textShadow,
        textCenter: textCenter,
        textCenterShadow: textCenterShadow,
        circle: circle,
        playShoot: playShoot,
        playHit: playHit,
        playExplode: playExplode,
        playLevelUp: playLevelUp,
        playGameOver: playGameOver,
        playCoin: playCoin,
        playPowerup: playPowerup,
        playBeep: playBeep,
        playSound: playSound,
        playSynth: playSynth,
        getLevel: getLevel,
        setLevel: setLevel,
        getScore: getScore,
        addScore: addScore,
        setScore: setScore,
        getLives: getLives,
        setLives: setLives,
        addLife: addLife,
        loseLife: loseLife,
        onLevelCleared: onLevelCleared,
        onGameOver: onGameOver,
        triggerLevelCleared: triggerLevelCleared,
        triggerGameOver: triggerGameOver,
        emitParticles: emitParticles,
        updateParticles: updateParticles,
        drawParticles: drawParticles,
        isPaused: isPaused,
        shake: shake,
        triggerHitstop: triggerHitstop,
        isHitstop: isHitstop,
        getHitstopFactor: getHitstopFactor,
        getJoysticks: getJoysticks,
      };
      gameModule.init();
    }
    startLoop();
  }

  function startLoop() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    loop(lastTime);
  }

  function stopLoop() {
    running = false;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function loop(now) {
    if (!running) return;
    animFrameId = requestAnimationFrame(loop);

    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Compute just-pressed keys (delta from previous frame)
    keysJustPressed = {};
    for (var k in keys) {
      if (keys[k] && !_prevKeys[k]) keysJustPressed[k] = true;
    }
    _prevKeys = {};
    for (var k in keys) {
      _prevKeys[k] = keys[k];
    }

    var hadTap = touchJustTapped;
    touchJustTapped = false;

    // ── Pause toggle ──
    _pauseCooldown -= dt;
    if (keysJustPressed['KeyP'] && _pauseCooldown <= 0) {
      _paused = !_paused;
      _pauseCooldown = 0.3;
    }

    // ── Build input frame ──
    var input = {
      keys: keys,
      keysPressed: keysJustPressed,
      touchDir: touchDir,
      touchTapped: hadTap,
      left:  keys['ArrowLeft']  || keys['KeyA'],
      right: keys['ArrowRight'] || keys['KeyD'],
      up:    keys['ArrowUp']    || keys['KeyW'],
      down:  keys['ArrowDown']  || keys['KeyS'],
      action: keysJustPressed['Space'] || keysJustPressed['Enter'] || hadTap,
      escape: keysJustPressed['Escape'],
    };

    // ── Clear canvas ──

    var skipUpdate = _hitstop > 0 || _paused;

    if (currentGame && currentGame.update && !skipUpdate) {
      currentGame.update(dt, input);
    }

    // Update shake even when paused/hitstop (counts down hitstop)
    _updateShake(dt);

    if (currentGame && currentGame.render) {
      if (_paused) {
        // Render game state behind pause overlay
        currentGame.render(ctx);
        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        textCenterShadow('PAUSED', W / 2, H / 2 - 20, 18, '#ffcc00', '#000');
        textCenter('P to resume', W / 2, H / 2 + 25, 9, 'rgba(255,255,255,0.5)');
      } else {
        currentGame.render(ctx);
      }
    } else if (!currentGame) {
      // No game loaded
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);
      textCenter('Select a game to play', W / 2, H / 2 - 10, 10, '#555');
    }
  }

  function init(canvasId) {
    if (_listenersAttached) return; // prevent double-wiring
    _canvasId = canvasId || 'canvas';
    canvas = document.getElementById(_canvasId);
    if (!canvas) return console.error('Canvas element not found');
    ctx = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    _listenersAttached = true;

    // Pre-warm audio context (will be suspended, resumed on first gesture)
    getAudioCtx();
  }

  function destroy() {
    stopLoop();
    if (_listenersAttached) {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      if (canvas) {
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchend', onTouchEnd);
        canvas.removeEventListener('touchmove', onTouchMove);
      }
      _listenersAttached = false;
    }
    if (currentGame && currentGame.destroy) {
      try { currentGame.destroy(); } catch (e) { console.warn('Game destroy error (destroy):', e); }
    }
    currentGame = null;
    _audioResumed = false;
  }

  return {
    init: init,
    destroy: destroy,
    loadGame: loadGame,
    startLoop: startLoop,
    stopLoop: stopLoop,
  };
})();
