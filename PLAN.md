# WRECKYARD — Master Plan (Source of Truth)

**Deadline:** May 1, 2026 @ 13:37 UTC
**Judges:** @levelsio, @s13k_, @timsoret, @nicolamanzini
**Prizes:** Gold $25K, Silver $10K, Bronze $5K
**Project:** `/home/joey/Desktop/wreckyard/`

---

## Current State — What's Done

### Phase 0 — Mobile ✅ COMPLETE
- Touch controls (virtual joystick + buttons), orientation overlay, fullscreen toggle
- Mobile-responsive lobby, HUD, effects caps
- `src/util/detect.js` for `isMobile` / `isPortrait`

### Phase 1 — Physics ✅ COMPLETE
16 issues fixed across car.js, physics.js, camera.js, derby.js, effects.js, ai.js:
- Wall detection removed, air control 8%, ground ray 0.55, fixed timestep 1/60s
- DAMAGE_SCALE fixed (was 0.000859375 = zero damage, now 2.0)
- Camera/AI per-frame allocations pooled, triple damage number system consolidated
- Per-frame `.filter()` replaced with for-loops

### Phase 2 — Gameplay ✅ COMPLETE
- Asymmetric collision damage (attacker: 0.4x, defender: 1.5x)
- AI with ramp seeking, stuck recovery, swerve, bomb usage
- Engine sound (sawtooth oscillator)
- Skid marks (ring buffer pool)

### Phase 3 — Compliance ✅ COMPLETE
- No loading screen, progressive boot, vite config optimized

### Phase 4 — Polish ✅ COMPLETE
- Speed lines, landing impact, elimination explosion, debris

### Textures ✅ ADDED
- 11 PNG texture files in `public/textures/` loaded via TextureLoader
- CLAUDE.md reference to "no external assets" is outdated — textures are now real files

---

### Phase 9 — Machine Gun + Barrel Rework + Bug Fixes ✅ COMPLETE
- Removed all bomb code (car.js, derby.js, effects.js, audio.js, AI)
- Added machine gun: InstancedMesh bullet pool (20/car), 5 rounds/sec, 8 damage, 60 units/sec speed
- Barrels now have HP (1 hit to explode), deal 30 damage in radius 8 on explosion
- Host-authoritative bullet-car and bullet-barrel collision detection
- `barrel:explode` event drives area damage, particles, sound
- AI auto-fires at targets within 20 units
- `firePressed` changed from edge-triggered to level-triggered (hold to fire)
- Touch button label: BOMB → FIRE
- Sync: `attackerSlot` passed through damage broadcasts
- Room: removed `reliable: true` for lower-latency data channel
- Room: added `room_full` message before closing excess connections
- New audio: `gunfire` (high-pass noise burst + square wave), `barrel_explode` (reused bomb explosion sound)
- Events removed: `car:bomb`, `car:bomb_explode`, `car:bomb_timer`
- Events added: `car:fire` (slot, pos), `barrel:explode` (pos, radius, damage, attackerSlot)

### Phase 10 — Horde Mode + Map Scale + Bug Fixes ✅ COMPLETE

**Bug fixes:**
- Camera: snaps behind local car on match start instead of staring at origin
- Half-pipe walls: replaced trimesh colliders with all-convex hull wedge colliders (8 per side, 48 per corner) — eliminates seam escapes and enables reliable CCD for fast bodies
- Visual damage feedback: car body emissive flash on hit (ramps to 0.6, decays over 200ms)

**Map scale (25% bigger):**
- ARENA_W: 160 → 200, ARENA_D: 200 → 250
- Second floor: platHalf 30 → 37, third floor: FLOOR3_HALF 8 → 10
- All spawn points, stump positions, ramp fills, death ramps, shadow camera, fog, skybox, physics ground, AI wall avoidance, barrel positions, OOB checks scaled accordingly

**Core gameplay pivot — PvE Survival Horde Mode:**
- 3 AI spawn at match start, 1 more every 15 seconds, max 8 alive at once
- AI deals 50% damage (AI_DAMAGE_MULT = 0.5), speed unchanged
- AI targets humans only (`humansOnly` flag on AIDriver)
- Co-op: human-vs-human collision/bullet damage disabled
- Victory: all currently-alive AI eliminated (must kill faster than they spawn)
- Defeat: all humans eliminated
- Dynamic slot system: slots 0-3 for humans, 4-15 for AI horde
- HUD: dynamic health bars (created on demand), kill counter
- Results screen: "VICTORY" / "DEFEATED" with AI kill count
- Killfeed, results, minimap: all use modulo indexing for extended slot range

**Files modified (13):** arena.js, car.js, derby.js, ai.js, engine.js, camera.js, obstacles.js, main.js, hud.js, results.js, killfeed.js, minimap.js, effects.js

### Phase 11 — Final Polish & Compliance ✅ COMPLETE

**Mobile UX overhaul:**
- Touch buttons: FIRE 60→80px, BOOST 60→72px, thicker borders, background fills, bold text
- Joystick: ring 120→130px, dot 40→48px, border + glow for visibility
- Orientation overlay: CSS animated phone icon replacing emoji, persistent resize listener
- Fullscreen button: Unicode ⛶ replaced with "FULLSCREEN" text label
- HUD safe area insets for notched devices (iPhone X+)

**Gameplay fixes:**
- Death ramps: lowered centerY offset 0.15→0.35, bottom edge now below ground (zero bump)
- Bullet impact mini-explosions: 85% smaller than barrel (scale 1.2, 300ms)
- Dead cars non-collidable: `collider.setEnabled(false)` on elimination

**Minimap:**
- Moved from bottom-left to top-right
- 20% larger (100→120px)
- Visible on mobile (was hidden)
- Top-right stats panel (timer/speed/kills) removed

**Multiplayer barrel sync (was completely missing):**
- obstacles.js: `barrel:explode` event includes `barrelIdx`
- derby.js: host broadcasts barrel explosions via sync
- sync.js: new `barrel_explode` message type, guests fire local visual + hide barrel + schedule respawn

**Vibe Jam compliance — incoming portal support:**
- main.js: detects `?portal=true` URL param, auto-starts solo (skips lobby)
- arena.js: portal ring redirects to `ref` URL for return-path capability
- Passes all Vibe Jam 2026 rules

**Portal restructure:**
- 3rd floor portal → return portal (orange), only visible for `?portal=true` users
- 4 green exit portals at top of death ramps, link to vibej.am/portal/2026

### Phase 12 — Drop-In Multiplayer ✅ COMPLETE

**Public matchmaking (zero infrastructure):**
- Predictable PeerJS peer IDs (`wy-pub-001` through `wy-pub-010`) as matchmaking pool
- PLAY button: instant solo as public host (zero delay)
- Background scan uses persistent probe peer (no create/destroy churn)
- JOIN GAME uses single peer with sequential host scan

**Drop-in mid-game:**
- Host accepts connections during PLAYING state
- New player replaces AI driver in slot 1-3
- Host sends `gameState` in `assign_slot` message so guest skips lobby if match is active
- Guest receives `room:state_change` with PLAYING → lobby hides, HUD shows

**Lobby UI restructured:**
- Primary: "ONE PLAYER" button → instant solo as public host (zero delay)
- "JOIN GAME" button → disabled by default, highlights green when background scan finds a game
- Background scan (4s interval) probes via persistent probe peer
- Multiplayer section: CREATE ROOM / JOIN ROOM with shareable room codes
- Events: `lobby:play` (instant solo), `lobby:join_public` (join discovered game), `lobby:host_start` (host starts early)

**Public rooms — 3-minute lobby + host start:**
- CREATE ROOM → public room with shareable code, 180-second countdown with slot grid
- Host sees START GAME button to begin early at any time
- JOIN ROOM → enter code to join a specific room
- `lobby:host_start` event skips countdown, spawns AI, begins match

---

## Completed Phases — Audit Issues

### Phase 5 — Code Cleanup & Performance ✅ COMPLETE
- Dead code removed (`car:damage` listener, per-frame `.filter()` allocations)
- `aliveCars`/`allCars` getters cached (rebuild only on car add/eliminate)
- Bomb code fully removed (replaced by machine gun in Phase 9)
- `_applyExplosion()` extracted as shared explosion handler
- HUD rank calculation cached (recalculates only on `car:hit`/`car:eliminated`)

---

### Phase 6 — Draw Call Optimization ✅ COMPLETE

**Target:** Under 100 draw calls per frame. Current estimate: ~150-200 (4 cars x ~12 meshes each = 48, arena walls/ramps/platforms ~40, 16 stumps + 16 rings = 32, 12 barrels, particles, etc).

**6.1 InstancedMesh for stumps** (saves ~30 draw calls)
arena.js:534-555 — 16 stumps are identical CylinderGeometry + same material. 16 torus rings are identical TorusGeometry + same material.

**Fix:**
```js
const stumpGeom = new THREE.CylinderGeometry(0.6, 0.7, 1.4, 8)
const stumpMesh = new THREE.InstancedMesh(stumpGeom, stumpMat, stumps.length)
const ringGeom = new THREE.TorusGeometry(0.6, 0.06, 6, 16)
const ringMesh = new THREE.InstancedMesh(ringGeom, ringMat, stumps.length)
const matrix = new THREE.Matrix4()
stumps.forEach(([x, z], i) => {
  matrix.setPosition(x, 0.7, z)
  stumpMesh.setMatrixAt(i, matrix)
  matrix.setPosition(x, 1.44, z)
  // rotate for ring
  ringMesh.setMatrixAt(i, matrix)
})
```
32 draw calls → 2.

**6.2 InstancedMesh for barrels** (saves ~10 draw calls)
obstacles.js — 12 barrels use same CylinderGeometry + same material. But barrels move dynamically, so InstancedMesh needs per-frame matrix updates.

**Fix:** One InstancedMesh with `count=12`. In `update()`, set matrix per barrel from physics body. More complex than stumps since barrels respawn, but still worth it.

**6.3 Merge corner trim segments** (saves ~44 draw calls)
arena.js:681-696 — 48 individual BoxGeometry trim meshes (12 per corner x 4 corners). All use same material.

**Fix:** Use BufferGeometryUtils.mergeGeometries() at construction time to merge all 12 trim boxes per corner into one geometry. 48 → 4 draw calls.

**6.4 Share car sub-geometries** (saves ~24 draw calls)
car.js — Each car creates its own `wheelGeom`, `tireGeom`, `hlGeom`, `tlGeom` etc. 4 cars x 8 wheel meshes = 32 meshes with duplicated geometry.

**Fix:** Move geometry creation to module scope (like `_tmpQ`). All 4 cars share the same `wheelGeom`, `tireGeom`, etc. Doesn't reduce draw calls but reduces GPU memory.

---

### Phase 7 — Multiplayer Stability ✅ COMPLETE

**Architecture decision needed:** The current system has each client independently computing physics and collision damage. This causes desync. Research points to two viable approaches for P2P:

#### Option A: Host-Authoritative State (RECOMMENDED)
Host runs all physics. Guests send inputs, receive state snapshots.
- **Pro:** Single source of truth, no desync, damage is consistent
- **Con:** Host has 0 latency advantage, guests feel input delay (~50-100ms)
- **Complexity:** Medium — rewrite sync.js, modify derby.js update loop

#### Option B: Independent Simulation + Reconciliation
Each client runs physics, host resolves conflicts.
- **Pro:** Everyone feels responsive
- **Con:** Complex reconciliation, health can still diverge, edge cases everywhere
- **Complexity:** High

**Recommendation: Option A.** For a jam game with 4 players, host-authoritative is simpler, more reliable, and the latency is fine for a car game (not twitch FPS).

**7.1 Client-side interpolation for remote cars**
Current: `updateRemote()` snaps position/rotation directly from 20Hz snapshots. At 60fps, remote cars teleport every 3 frames.

**Fix:** Buffer 2 snapshots, lerp between them with a render delay of ~100ms (2 server ticks). Based on [Gaffer On Games snapshot interpolation](https://gafferongames.com/post/snapshot_interpolation/):

```js
// In SyncManager:
this._snapshotBuffer = {} // slot → [{ time, pos, rot, vel }, ...]

_onMove(data, from) {
  const { slot, pos, rot, vel, hp } = data
  if (!this._snapshotBuffer[slot]) this._snapshotBuffer[slot] = []
  const buf = this._snapshotBuffer[slot]
  buf.push({ time: performance.now(), pos, rot, vel, hp })
  if (buf.length > 4) buf.shift() // keep last 4 snapshots
}

// In update(), interpolate between buffered snapshots:
const renderTime = performance.now() - 100 // 100ms behind
// Find two snapshots bracketing renderTime, lerp between them
```

**7.2 Host-authoritative damage**
Current: `broadcastDamage()` and `broadcastElim()` exist in sync.js but are NEVER called. Each client independently detects collisions and applies damage, causing desync.

**Fix:**
- Only the HOST runs `_checkCarCollisions()` and `_checkBombHits()` in derby.js
- Host broadcasts damage events: `{ type: 'damage', slot, amount, pos }`
- Host broadcasts eliminations: `{ type: 'elim', slot }`
- Guests receive and apply — no local collision detection for remote cars
- Wire `broadcastDamage` and `broadcastElim` into `car.applyDamage` and `car._eliminate`

**7.3 Heartbeat / keepalive**
Current: No heartbeat. PeerJS DataConnection can silently die. Disconnect takes ~60s to detect.

**Fix:** Host sends `{ type: 'ping', t: Date.now() }` every 2 seconds. Guests respond with `{ type: 'pong', t }`. If no pong received in 6 seconds, mark connection dead and dispatch `room:player_leave`. Guest does the same — if no ping in 6s, treat host as dead.

```js
// In RoomManager:
_startHeartbeat() {
  this._heartbeatInterval = setInterval(() => {
    const now = Date.now()
    for (const [slot, conn] of Object.entries(this._conns)) {
      if (!conn.open) continue
      conn.send({ type: 'ping', t: now })
      if (this._lastPong[slot] && now - this._lastPong[slot] > 6000) {
        this._handleDisconnect(Number(slot))
      }
    }
  }, 2000)
}
```

**7.4 Graceful disconnect → AI takeover**
Current: When a player drops, their car freezes forever.

**Fix:** On `room:player_leave`, convert the disconnected player's car to AI control:
```js
window.addEventListener('room:player_leave', (e) => {
  const { slot } = e.detail
  if (!derby.drivers[slot] && derby.cars[slot] && !derby.cars[slot].eliminated) {
    derby.drivers[slot] = new AIDriver(derby.cars[slot], slot)
  }
})
```

**7.5 Health authority reconciliation**
Current: sync.js:66 syncs health from sender, but damage is computed independently. Two clients can disagree on who's dead.

**Fix:** With host-authoritative damage (7.2), this resolves itself. Host's health is canonical. Host includes `hp` in move broadcasts, guests snap to it if diverged by >5.

---

### Phase 8 — Winning Polish ✅ COMPLETE

What makes judges pick a game (from 2025 jam research: "very cool original and weird games", "a lot of effort", "range of different types"):

**8.1 Screen shake tuning**
Current shake values feel generic. Tune per event:
- Ram collision: proportional to damage, max 0.6
- Bomb explosion: 0.4 (already set)
- Elimination: 0.6 (already set)
- Jump land: proportional to fall speed (already set)

**8.2 Sound variety**
Current: only 8 sound types. Add:
- Countdown beeps (3, 2, 1... already have `derby_start` but no per-second beeps)
- Low health warning (heartbeat-like pulse when < 25% HP)
- Bomb fuse sizzle (looping noise while bomb timer counts down)

**8.3 Minimap**
Small radar-style minimap in corner showing car positions as colored dots. Arena outline. Simple canvas overlay, no Three.js overhead:
```js
// 100x100 canvas, position: fixed, bottom-left on desktop, hidden on mobile
// Draw arena rectangle, car dots as colored circles, local car as triangle
```

**8.4 Kill feed**
Text notifications when a car is eliminated: "CYAN wrecked MAGENTA!" — appears top-center, fades after 3s. Track who dealt the most recent damage to each car for attribution.

---

## File Map — Current Architecture

```
src/
  main.js          — boot, game loop, state wiring (295 lines)
  game/
    engine.js      — Three.js renderer, scene, lights, skybox (92 lines)
    physics.js     — Rapier world, fixed timestep, body factories (122 lines)
    arena.js       — floor, walls (convex hull wedges), ramps, platforms, portal, half-pipes (1019 lines)
    car.js         — car mesh + physics + controls + machine gun + hit flash (500 lines)
    derby.js       — horde mode state machine, co-op damage, AI wave spawning, health pickups (514 lines)
    ai.js          — AI driver behavior, humans-only targeting (164 lines)
    obstacles.js   — explosive barrels (1 HP, 200% size), InstancedMesh (149 lines)
    effects.js     — particles, skid marks, damage numbers, speed lines, muzzle flash (374 lines)
    camera.js      — chase camera with shake + snapTo (109 lines)
    audio.js       — Web Audio procedural SFX, 13 SFX + engine loop (261 lines)
    textures.js    — TextureLoader wrapper with cache + unique clones (68 lines)
    input.js       — keyboard + touch input merged (304 lines)
  net/
    room.js        — PeerJS room management, persistent probe peer, private rooms (3-min lobby + host start), heartbeat (321 lines)
    sync.js        — network state sync at 20Hz, snapshot interpolation (170 lines)
  ui/
    lobby.js       — lobby screen with solo/multiplayer, START GAME button (315 lines)
    hud.js         — health bars, kill counter, countdown (167 lines)
    results.js     — match results, stat boxes, leaderboard table (165 lines)
    minimap.js     — radar-style canvas minimap (103 lines)
    killfeed.js    — elimination notifications with attribution (58 lines)
  util/
    detect.js      — mobile/portrait detection (4 lines)
```
**Total: 5274 lines across 21 files**

**Event bus (window CustomEvent):**
- `car:hit` — collision damage applied (slot, health, damage, pos, attackerSlot)
- `car:jump` — car jumped (pos)
- `car:land` — car landed (pos, fallSpeed, slot)
- `car:eliminated` — car health reached 0 (slot, pos)
- `car:skid` — skid mark positions (left, right, angle)
- `car:fire` — machine gun fired (slot, pos)
- `barrel:explode` — barrel exploded (pos, radius, damage, attackerSlot)
- `obstacle:hit` — barrel damaged (pos)
- `derby:start` — match began
- `derby:winner` — match ended (slot)
- `lobby:play` — solo button clicked
- `lobby:host_start` — host start button clicked (skips lobby countdown)
- `room:player_join` — player joined room (slot, playerId)
- `room:player_leave` — player left room (slot)
- `room:state_change` — room state changed (state)
- `room:msg` — raw message from peer (type, payload, from)

**Key constants:**
| Constant | Value | Location |
|---|---|---|
| ENGINE_FORCE | 55 | car.js |
| STEER_TORQUE | 18 | car.js |
| BOOST_FORCE | 220 | car.js |
| BOOST_DURATION / COOLDOWN | 0.6s / 3.0s | car.js |
| GROUND_RAY_DIST | 0.55 | car.js |
| LEVEL_TORQUE | 12 | car.js |
| LEVEL_SLOPE_MAX | 0.52 rad (~30deg) | car.js |
| MAX_HEALTH | 500 | car.js |
| DAMAGE_SCALE | 2.0 | derby.js |
| MIN_CRASH_SPEED | 2.5 | derby.js |
| CRASH_RADIUS | 2.8 | derby.js |
| BULLET_SPEED | 60 | car.js |
| BULLET_DAMAGE | 20 | car.js |
| FIRE_RATE | 0.2s (5/sec) | car.js |
| MAX_AMMO (AI) | 6 | car.js |
| BARREL_HP | 1 | obstacles.js |
| BARREL_EXPLODE_RADIUS | 8 | obstacles.js |
| BARREL_EXPLODE_DMG | 30 | obstacles.js |
| FIXED_STEP | 1/60 | physics.js |
| MAX_SUBSTEPS | 4 | physics.js |
| GRAVITY | -22 Y | physics.js |
| MAX_AI_ALIVE | 8 | derby.js |
| AI_SPAWN_INTERVAL | 15s | derby.js |
| INITIAL_AI_COUNT | 3 | derby.js |
| AI_DAMAGE_OUT / IN | 0.15 / 2.0 | derby.js |
| ARENA_W | 200 | arena.js |
| ARENA_D | 250 | arena.js |
| SEND_INTERVAL | 0.05 (20Hz) | sync.js |

---

## Execution Order

**Priority 1 — Quick wins (Phase 5):** ~30 min
- 5.1 Dead code removal
- 5.2 Dedup bomb explosion
- 5.3 Share bomb materials
- 5.4 Fix onStateChange overwrite

**Priority 2 — Multiplayer (Phase 7):** ~2-3 hours
- 7.1 Client interpolation (smooth remote cars)
- 7.2 Host-authoritative damage (fix desync)
- 7.3 Heartbeat (detect dead connections)
- 7.4 AI takeover on disconnect
- 7.5 Health reconciliation

**Priority 3 — Draw calls (Phase 6):** ~1 hour
- 6.1 InstancedMesh stumps
- 6.2 InstancedMesh barrels
- 6.3 Merge corner trims
- 6.4 Share car geometries

**Priority 4 — Polish (Phase 8):** ~1 hour
- 8.3 Minimap
- 8.4 Kill feed
- 8.2 Sound variety

**Priority 5 — HUD/rank cache (5.5, 5.6):** ~15 min

---

## Decisions — LOCKED IN

1. **Multiplayer architecture:** Host-authoritative (Option A). Host computes all damage/collisions, broadcasts results. Guests send inputs, receive state.
2. **CLAUDE.md:** Updated to reflect real texture files and current architecture.
3. **Minimap:** YES — radar-style canvas overlay, desktop only.
4. **Kill feed:** YES — top-center elimination notifications with damage attribution.

---

## Verification Protocol

After each phase:
1. `npm run build` — must pass clean
2. `npm run dev` → localhost:3000 in browser
3. Play solo match — all 4 cars active, damage works, effects fire
4. DevTools mobile emulator — touch controls, responsive HUD
5. For multiplayer changes: open 2 browser tabs, create room, join, verify sync

## Research Sources

- [Gaffer On Games: Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/)
- [SnapNet: Netcode Architectures](https://snapnet.dev/blog/netcode-architectures-part-3-snapshot-interpolation/)
- [geckos.io/snapshot-interpolation](https://github.com/geckosio/snapshot-interpolation)
- [PeerJS Heartbeat Issue #227](https://github.com/peers/peerjs/issues/227)
- [PeerJS Broken Connections #769](https://github.com/peers/peerjs/issues/769)
- [boardgame.io P2P Transport](https://github.com/boardgameio/p2p)
- [Draw Calls: The Silent Killer](https://threejsroadmap.com/blog/draw-calls-the-silent-killer)
- [Three.js InstancedMesh Docs](https://threejs.org/docs/pages/InstancedMesh.html)
- [Three.js Performance Tips 2026](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [Game Networking Complete Guide 2025](https://generalistprogrammer.com/tutorials/game-networking-complete-multiplayer-guide-2025)
- [WebRTC DataChannel for P2P Gaming](https://webrtchacks.com/datachannel-multiplayer-game/)
- [Vibe Jam 2026 Rules](https://jam.pieter.com/2026/)
- [2025 Jam Judging](https://x.com/levelsio/status/1907903828437144026)
