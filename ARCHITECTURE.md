# WRECKYARD — Architecture Reference

## File Map

| File | Lines | Purpose |
|---|---|---|
| `src/main.js` | 283 | Boot sequence, game loop, state wiring, module instantiation, background matchmaking scan, portal auto-start |
| **Game** | | |
| `src/game/arena.js` | 776 | Arena geometry: floor, walls (convex hull wedges), death ramps, platforms, half-pipe corners, InstancedMesh stumps/trims |
| `src/game/car.js` | 474 | Car mesh (body, cabin, bumpers, wheels, underglow), machine gun (InstancedMesh bullet pool), hit flash, physics body, controls, damage |
| `src/game/effects.js` | 327 | Particle system, skid marks, damage numbers, speed lines, debris, muzzle flash, barrel explosions |
| `src/game/derby.js` | 412 | Horde mode state machine, co-op damage rules, AI wave spawning, host-auth collision/bullet/barrel damage |
| `src/game/audio.js` | 262 | Web Audio procedural SFX: 13 SFX (hit, boost, land, eliminate, gunfire, barrel_explode, barrel_hit, derby_start, winner, countdown_beep, countdown_go, low_health) + engine loop |
| `src/game/input.js` | 235 | Keyboard + touch input: virtual joystick, action buttons, unified input interface |
| `src/game/ai.js` | 164 | AI drivers: target selection (humans only), chase, stuck recovery, auto-fire |
| `src/game/physics.js` | 111 | Rapier WASM init, fixed timestep (1/60s, max 4 substeps), body factories, raycast |
| `src/game/obstacles.js` | 148 | 22 explosive barrels (1 HP, 200% size), InstancedMesh, respawn system |
| `src/game/camera.js` | 109 | Chase camera with trail smoothing, screen shake, snapTo (pooled vectors) |
| `src/game/textures.js` | 68 | TextureLoader wrapper with cache + unique clones |
| `src/game/engine.js` | 99 | Three.js renderer, scene, lights, skybox, ground mesh. Mobile: no shadows, no antialias, boosted ambient, reduced fog |
| **Networking** | | |
| `src/net/room.js` | 338 | PeerJS WebRTC room: public matchmaking (predictable IDs), availability check, private rooms, star topology, heartbeat, drop-in support |
| `src/net/sync.js` | 180 | 20Hz state broadcast, snapshot interpolation (100ms delay, slerp), host-auth damage relay, barrel explosion sync |
| **UI** | | |
| `src/ui/lobby.js` | 303 | Lobby screen: instant PLAY, JOIN GAME (background scan), private rooms, slot grid, portal link |
| `src/ui/hud.js` | 228 | Dynamic health bars, timer, speed, kill counter, countdown overlay |
| `src/ui/results.js` | 164 | Match results: stat boxes, leaderboard table, play again, portal link |
| `src/ui/minimap.js` | 107 | Radar-style canvas minimap: car dots, local triangle, arena outline, top-right, 120px |
| `src/ui/killfeed.js` | 58 | Elimination notifications with damage attribution (auto-fade) |
| **Util** | | |
| `src/util/detect.js` | 4 | `isMobile` / `isPortrait` detection |
| **Total** | **4677** | |

## Boot Sequence

```
main.js boot()
├── Engine (renderer, scene, lights, skybox)
├── Physics.init() (async — Rapier WASM)
├── Arena (geometry + physics colliders)
├── Obstacles (12 barrels)
├── Input (keyboard + touch)
├── AudioBus.init() (Web Audio context)
├── GameCamera
├── Effects (particles, skid marks, damage numbers)
├── DerbyGame (state machine)
├── RoomManager (PeerJS)
├── SyncManager (room + derby)
├── LobbyUI, DerbyHUD, ResultsUI, Minimap, KillFeed
└── requestAnimationFrame(tick)
```

## Game Loop (tick)

```
tick(now)
├── physics.step(dt)              — fixed timestep accumulator
├── arena.update(dt, allCars)     — portal proximity check
├── if PLAYING:
│   ├── derby.update(dt, input)   — car physics, AI, host-only damage
│   ├── obstacles.update(dt)      — barrel physics sync
│   ├── sync.update(dt)           — send/receive network state
│   ├── camera.update(dt, car)    — chase cam + shake
│   ├── effects.update(dt)        — particles, skid marks, damage numbers
│   ├── hud.update(dt, derby)     — health bars, timer, rank
│   ├── minimap.update(derby)     — radar overlay
│   ├── audio.updateEngine(speed) — engine pitch
│   ├── audio.updateLowHealth()   — heartbeat pulse
│   └── effects.updateSpeedLines()
├── elif LOBBY/COUNTDOWN:
│   └── derby.update(dt, null)    — countdown timer
└── engine.render()
```

## Event Bus

All inter-module communication uses `window.dispatchEvent(new CustomEvent(...))`.

| Event | Payload | Producers | Consumers |
|---|---|---|---|
| `car:hit` | slot, health, damage, pos, attackerSlot | car.js `applyDamage()` | effects, audio, hud, killfeed |
| `car:boost` | slot, pos | car.js `_applyInput()` | effects, audio |
| `car:land` | pos, fallSpeed, slot | car.js `_updateSkidMarks()` | effects, audio |
| `car:eliminated` | slot, pos | car.js `_eliminate()` | effects, audio, hud, derby, killfeed |
| `car:skid` | left, right, angle | car.js `_updateSkidMarks()` | effects |
| `car:fire` | slot, pos | car.js `_fireBullet()` | effects, audio |
| `barrel:explode` | pos, radius, damage, attackerSlot, barrelIdx | obstacles.js `_explodeBarrel()` | derby, effects, audio, sync |
| `obstacle:hit` | pos | obstacles.js `damageBarrel()` | effects, audio |
| `derby:start` | — | derby.js `_startPlaying()` | audio |
| `derby:winner` | slot | derby.js `update()` | audio |
| `lobby:play` | — | lobby.js | main.js (instant solo) |
| `lobby:join_public` | — | lobby.js | main.js (join discovered game) |
| `room:player_join` | slot, playerId | room.js | main.js |
| `room:player_leave` | slot | room.js | main.js (AI takeover) |
| `room:state_change` | state | room.js | main.js |
| `room:msg` | type, payload, from | room.js | sync.js |

## Network Protocol

**Transport:** PeerJS WebRTC DataChannel (unreliable for lower latency)
**Topology:** Star (host relays to all guests)
**Matchmaking:** PLAY starts instant solo + registers as public host (`wy-pub-001` through `wy-pub-010`). Background scan (4s interval) probes for available public games; JOIN GAME button highlights green when found. Joining uses parallel scan with race-safe `found` flag.
**Tick rate:** 20Hz send, 60Hz interpolated render

| Message Type | Direction | Payload |
|---|---|---|
| `assign_slot` | Host → Guest | slot |
| `move` | Broadcast | slot, pos, rot, vel, hp |
| `damage` | Host → All | slot, amount, attackerSlot |
| `elim` | Host → All | slot |
| `barrel_explode` | Host → All | barrelIdx, pos, radius, damage, attackerSlot |
| `state` | Host → All | state (COUNTDOWN) |
| `ping` | Bidirectional | t |
| `pong` | Bidirectional | t |

**Interpolation:** 100ms render delay, circular buffer of 6 snapshots, quaternion slerp.
**Authority:** Host computes all collision/bomb damage. Guests apply received damage.
**Disconnect:** 6s no-pong timeout → `room:player_leave` → AI takeover.

## Key Constants

| Constant | Value | File |
|---|---|---|
| ENGINE_FORCE | 55 | car.js |
| STEER_TORQUE | 18 | car.js |
| BOOST_FORCE | 220 | car.js |
| BOOST_DURATION | 0.6s | car.js |
| BOOST_COOLDOWN | 3.0s | car.js |
| MAX_HEALTH | 500 | car.js |
| GROUND_RAY_DIST | 0.55 | car.js |
| LEVEL_TORQUE | 12 | car.js |
| DAMAGE_SCALE | 2.0 | derby.js |
| MIN_CRASH_SPEED | 2.5 | derby.js |
| CRASH_RADIUS | 2.8 | derby.js |
| BULLET_SPEED | 60 | car.js |
| BULLET_DAMAGE | 20 | car.js |
| BULLET_LIFETIME | 1.5s | car.js |
| FIRE_RATE | 0.2s (5/sec) | car.js |
| BULLET_POOL_SIZE | 20 per car | car.js |
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
| AI_DAMAGE_OUT | 0.15 | derby.js |
| AI_DAMAGE_IN | 2.0 | derby.js |
| ARENA_W / ARENA_D | 200 / 250 | arena.js |
| SEND_INTERVAL | 0.05 (20Hz) | sync.js |
| INTERP_DELAY | 100ms | sync.js |
| HEARTBEAT | 2s ping, 6s timeout | room.js |

## Input Interface

All input sources (keyboard, touch, AI) produce this same interface:

```js
{
  throttle: bool,      // forward
  brake: bool,         // reverse
  steerLeft: bool,     // (keyboard only)
  steerRight: bool,    // (keyboard only)
  steerAxis: -1..1,    // analog steering
  throttleAxis: -1..1, // analog throttle
  boostPressed: bool,  // boost activation
  firePressed: bool,   // held = continuous fire (machine gun)
}
```

## Performance Optimizations

- **Convex hull walls:** half-pipe walls use convex hull wedge colliders (8 per side, 48 per corner) instead of trimeshes — enables reliable CCD for fast bodies
- **InstancedMesh:** stumps (16→1 draw call), stump rings (16→1), barrels (22→1), corner trims (48→1)
- **Pooled vectors:** camera, AI, collision code use module-level temp vectors
- **Cached getters:** `aliveCars`/`allCars` rebuild only on car add/eliminate events
- **Cached rank:** HUD recalculates rank only on `car:hit`/`car:eliminated` events
- **InstancedMesh bullets:** 20 bullets per car pooled in 1 InstancedMesh each (4 draw calls total for all bullets)
- **Fixed timestep:** physics runs at 1/60s with max 4 substeps, preventing explosion on tab-switch
