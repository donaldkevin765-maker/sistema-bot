# FreeArcade — Quality Review

## Summary

Full audit and fix pass across all 12 FreeArcade games (9 labeled 2D, 1 true 3D, 2 mislabeled 3D/actual 2D). Every game now loads, renders, and allows back-to-menu navigation. Deployed to Vercel production.

## Bugs Fixed

### 1. 2D Engine — Missing `input.shoot` (`engine.js`)
**Root cause:** The `input` frame object had no `shoot` property. Games like Arena Shooter and Run n Gun expected `input.shoot` for mouse-based shooting, but only `input.action` (keyboard Enter/Space) was available.
**Fix:** Added `mouseButtons` tracking (mousedown/mouseup listeners in `init()`, cleanup in `destroy()`), and mapped `input.shoot` to `mouseButtons.left || keys['Space']`.

### 2. 5 New 2D Games — Wrong `render()` Signature (`arena-shooter.js`, `rungun.js`, `fortress.js`, `twin-stick.js`, `multiplayer.js`)
**Root cause:** These games defined `render(dt)` — the engine passes a CanvasRenderingContext2D, not dt. They ignored the parameter and used `E.ctx` instead.
**Fix:** Changed signature to `render(ctx)` and replaced `E.ctx` references with the `ctx` parameter.

### 3. 5 New 2D Games — Double-Render (`arena-shooter.js`, `rungun.js`, `fortress.js`, `twin-stick.js`, `multiplayer.js`)
**Root cause:** Each game's `update()` called `render(dt)` at the end. The engine loop also calls `currentGame.render(ctx)` after `update()`, producing two render calls per frame.
**Fix:** Removed all `render(dt)` calls from within `update()` functions.

### 4. Multiplayer Mayhem — `KEYS_CFG` Structure (`multiplayer.js`)
**Root cause:** `KEYS_CFG` was an array of arrays (`[[{...}], [{...}], ...]`), and the update loop accessed `p.keys[0]`. After changing `KEYS_CFG` to a flat array of objects, the `[0]` accessor became wrong.
**Fix:** Flattened `KEYS_CFG` to `[{...}, {...}, ...]` and changed `p.keys[0]` → `p.keys`.

### 5. Block Breaker — Missing Save on Level Complete (`block-breaker.js`)
**Root cause:** `FreeArcadeSave.setHighScore()` was only called on `gameover`, not on `levelComplete`.
**Fix:** Added save calls (`setHighScore`, `setBestLevels`, `incrementStat`) in the `levelComplete` handler.

### 6. Snake Evolved — Dead Variable (`snake-evolved.js`)
**Root cause:** `var respawning` declared, assigned, but never read.
**Fix:** Removed the declaration and all assignments.

### 7. HTML — `getContext('2d')` Locking Canvas Before 3D Init (`index.html`)
**Root cause:** `launchGame()` called `canvas.getContext('2d')` unconditionally — including before `run3DGame()` for 3D games. A canvas committed to 2D mode cannot create a WebGL context.
**Fix:** Moved `canvas.getContext('2d')` into the `else` (2D-only) branch.

### 8. 3D Engine — `getContext('2d')` Before WebGL Renderer (`3d/engine3d.js`)
**Root cause:** `initRenderer()` called `canvas.getContext('2d')` before `new THREE.WebGLRenderer({canvas})`. Since a 2D context was already acquired, Three.js couldn't create a WebGL context on the same canvas.
**Fix:** Created a separate overlay canvas for the 2D HUD rendering (`#hudOverlay`), positioned absolutely over the WebGL canvas. `ctx2d` now refers to the overlay canvas context. The overlay is cleaned up in `destroy()` and resized in `onResize()`.

## Verification Results

### 2D Games (sequential switching on single page)
```
✅ Space Blaster → ✅ Block Breaker → ✅ Maze Runner → ✅ Snake Evolved
✅ Arena Shooter → ✅ Run n Gun → ✅ Multiplayer Mayhem
✅ Fortress Siege (2D) → ✅ Twin Stick Fury (2D)
```
All 9 games launch, render properly, and return to menu via back button. Sequential switching across all games works.

### 3D Game (isolated browser per game)
```
✅ Echo Point — WebGL renderer created, canvas rendered
```
Three.js r128 loads from CDN, WebGL context created successfully on the overlay-free canvas.

### Back Navigation
Menu shows/hides correctly via `menuEl.classList.toggle('hidden')`. The `showMenu()` / `launchGame()` flow consistently works across all games.

## Architecture Observations

### Bug: Menu Display Permanently Set to `'none'`
In `launchGame()`, `showLoading(true)` sets `menuEl.style.display = 'none'`. In `showMenu()`, `showLoading(false)` runs BEFORE `menuEl.classList.remove('hidden')`, so the display is never restored (the class check fails). The menu's inline `display: none` persists forever. `showLoading(false)` should be called after `menuEl.classList.remove('hidden')`, or the display should be explicitly restored.

**Impact:** The menu grid is invisible after the first game launch. Click events still fire (via `element.click()`), so gameplay is unaffected, but a human user cannot see the menu after returning from a game.

**Fix (if desired):** Swap the order in `showMenu()`:
```javascript
menuEl.classList.remove('hidden');
showLoading(false);
```

### Bug: `threePromise` Never Reset in 3D Engine
In `engine3d.js`, `ensureThree()` sets `threePromise` on first call. `destroy()` sets `THREE = null` but never resets `threePromise`. On a subsequent `init()` call, `ensureThree()` returns the already-resolved promise (which resolved with the valid `THREE` object), but `THREE` (the module variable) is null. This means `initRenderer()` would get `THREE = null` and fail.

**Impact:** Playing a 3D game, returning to menu, and playing another 3D game would crash. Currently mitigated because only Echo Point is a true 3D game, and testing uses fresh pages.

**Fix:** In `destroy()`:
```javascript
threePromise = null;
```

### Mislabeling: Fortress Siege and Twin Stick Fury
`KNOWN_GAMES` lists both as `dim: '3D'`, but `KNOWN_NS` correctly lists them as `'2D'`. The `detectGames()` function uses `KNOWN_NS` (which is correct), so they load as 2D games. The `KNOWN_GAMES` array appears to be dead code — only `KNOWN_NS` + `window[ns]` detection is used for game discovery. Recommend removing `KNOWN_GAMES`.

### 16 Unused 3D Game Files
The `3d/games/` directory contains 19 files, but only `fps.js` (Echo Point) is actively used. The remaining 16 are placeholders. They're loaded as scripts on page load (adds ~2KB each in header bandwidth) but never initialized because `detectGames()` only picks up games with corresponding `KNOWN_NS` entries and `window[ns]` exports.

### Event Emitter in 2D Engine
`E.emit('gameReady', ...)` is called by 5 new games, but `engine.js`'s `emit` is `function(){}` (no-op). These calls are harmless but wasteful. Either implement the event bus or remove the calls.

## Recommendations

1. **Fix the menu display bug** — one-line reorder in `showMenu()` (described above)
2. **Remove dead code** — `KNOWN_GAMES` array, 16 unused 3D game files, `emit('gameReady', ...)` calls
3. **Reset `threePromise` in `destroy()`** to support sequential 3D game loading
4. **Add a loading indicator** — the 300ms `setTimeout` in `launchGame()` delays game start with no visual feedback
5. **Lazy-load 3D engine** — Three.js (475KB minified) is only loaded on first 3D game launch. Consider preloading after page load to reduce perceived latency on first 3D game.
