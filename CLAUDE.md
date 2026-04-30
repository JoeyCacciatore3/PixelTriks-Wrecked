# WRECKYARD

Co-op PvE survival derby. Humans vs endless AI horde — kill them all or be overwhelmed. Built for Vibe Jam 2026.

## Vibe Jam 2026 Rules

**Deadline:** May 1, 2026 @ 13:37 UTC

1. **Widget required** — `<script async src="https://vibej.am/2026/widget.js"></script>` must be in index.html. Already included.
2. **90%+ AI-written code** — all code must be AI-generated.
3. **New game only** — created after April 1, 2026. No pre-existing games.
4. **Web-accessible** — no login, no signup, free-to-play. Own domain preferred.
5. **Multiplayer preferred** — not required but gives an edge. We have PeerJS P2P.
6. **NO loading screens** — must be almost instantly playable. No heavy downloads.
7. **One entry per person** — focus on quality.
8. **Any engine** — Three.js recommended. We use Three.js r170.
9. **Portal links** — optional cross-game portals via `https://vibej.am/portal/2026`. Already wired in lobby + results.

**Prizes:** Gold $25K, Silver $10K, Bronze $5K. Judges include @levelsio, @s13k_, @timsoret, @nicolamanzini.

## Tech Stack

- Three.js r170 (3D rendering)
- Rapier3D WASM (@dimforge/rapier3d-compat ^0.14.0)
- PeerJS (WebRTC P2P multiplayer)
- Vite 5 (build)
- Vanilla JS (no framework, no TypeScript)
- Textures loaded from `public/textures/` (11 PNGs) + procedural CanvasTextures
- Audio generated procedurally via Web Audio API (zero audio files)

## Project Structure

```
src/
  main.js          — boot, game loop, state wiring
  game/
    engine.js      — Three.js renderer, scene, lights, skybox
    physics.js     — Rapier world, fixed timestep, body factories, raycast
    arena.js       — floor, walls (convex hull wedges), ramps, half-pipe corners, InstancedMesh stumps
    car.js         — car mesh + physics + controls + machine gun (InstancedMesh bullets)
    derby.js       — horde mode state machine, co-op damage, AI wave spawning, barrel explosions
    ai.js          — AI driver behavior (ramp seeking, stuck recovery, auto-fire)
    obstacles.js   — explosive barrels (1 HP, 200% size), InstancedMesh
    effects.js     — particles, skid marks, damage numbers, speed lines, debris
    camera.js      — chase camera with shake (pooled vectors)
    audio.js       — Web Audio procedural SFX (13 SFX + engine loop): hit, boost, land, eliminate, gunfire, barrel_explode, barrel_hit, derby_start, winner, countdown_beep, countdown_go, low_health
    textures.js    — TextureLoader wrapper with cache
    input.js       — keyboard + touch input (virtual joystick + buttons)
  net/
    room.js        — PeerJS room management, star topology, heartbeat/keepalive
    sync.js        — network state sync at 20Hz, snapshot interpolation, host-auth damage
  ui/
    lobby.js       — lobby screen with solo/multiplayer options
    hud.js         — health bars, timer, speed, cached rank display
    results.js     — match results + play again
    minimap.js     — radar-style canvas minimap (desktop only)
    killfeed.js    — elimination notifications with damage attribution
  util/
    detect.js      — isMobile / isPortrait detection
```

## Build & Test

```sh
npm run dev       # dev server → localhost:3000
npm run build     # production build → dist/
```

Test mobile: DevTools → device toolbar → select phone.
Test after every phase, not just at the end.

## Code Style

- No semicolons, single quotes, 2-space indent
- No TypeScript — vanilla JS only
- No comments unless explaining a non-obvious WHY
- No new npm packages — only three, rapier3d-compat, peerjs

## Architecture Patterns

- **Event-driven communication** — components talk via `window.dispatchEvent(new CustomEvent(...))`. Events: `car:hit` (slot, health, damage, pos, attackerSlot), `car:boost`, `car:land`, `car:eliminated`, `car:skid`, `car:fire` (slot, pos), `barrel:explode` (pos, radius, damage, attackerSlot, barrelIdx), `derby:start`, `derby:winner`, `obstacle:hit`, `lobby:play`, `room:player_join`, `room:player_leave`, `room:state_change`, `room:msg`.
- **Input interface** — car.js reads from an input object with getters: `throttle`, `brake`, `steerLeft`, `steerRight`, `boostPressed`, `firePressed`, `steerAxis`, `throttleAxis`. Both keyboard Input class and AI drivers produce this same interface. Touch controls must also produce this interface.
- **Physics-first** — Rapier bodies are authoritative. Meshes sync from physics each frame, not the other way around.
- **State machine** — DerbyGame.state: LOBBY → COUNTDOWN → PLAYING → FINISHED. Horde mode: 3 AI at start, +1 every 15s, max 8 alive. Defeat = all humans dead.
- **Drop-in multiplayer** — PLAY button tries to join an existing public game, falls back to hosting. Host computes all collision/bullet/barrel damage, broadcasts to guests. Guests send inputs, receive state snapshots with 100ms interpolation delay. Private rooms available via room codes.
- **Heartbeat/keepalive** — 2s ping/pong, 6s timeout. Dead connections trigger AI takeover of abandoned cars.
- **Assets** — textures from `public/textures/` (11 PNGs), sounds via Web Audio oscillators/noise (zero audio files).

## Constraints

- Must work on: Chrome 90+, Firefox 90+, Safari 15+, Edge 90+, Chrome Android, Safari iOS
- Must work on phones and tablets, both orientations
- Touch and keyboard input must coexist
- AudioContext needs user gesture to unlock (already handled via pointerdown/keydown listeners)
- Rapier WASM init is async — scene must render before physics loads

## Development Methodology

### Research Before Implementation
Before writing code for any feature, research current best practices for the specific technique. WebSearch for up-to-date API docs, proven patterns, and known pitfalls. Don't rely on training data alone — libraries evolve, browser APIs change, and stale patterns cause subtle bugs. Cross-reference findings against the installed package versions in package.json.

### Use Skills
Load the matching domain skill before implementing. Skills inject research-backed patterns, pitfalls, and techniques that general knowledge lacks. **Always load skills before writing code — never skip this step.**

**Primary skills for this project:**
- **threejs** — Three.js scene architecture, renderer optimization, GLSL shaders, post-processing, glTF pipeline, asset compression, PBR materials. Use when building or optimizing 3D scenes.
- **r3f-game-dev** — React Three Fiber patterns, ECS with bitECS, Rapier physics, game loop architecture, input handling. Use when building 3D scenes or games.
- **security** — OWASP top 10, input validation, auth patterns, secrets management, CSP, Node.js security hardening. Use when reviewing security or implementing auth.
- **code-quality** — SOLID principles, refactoring patterns, code smells, performance profiling, bundling, lazy loading, Web Workers, caching. Use when reviewing code quality or optimizing performance.
- **testing-excellence** — Vitest patterns, test architecture, mocking strategies, integration vs unit, snapshot testing. Use when writing or reviewing tests.

**Supporting skills (load when the task touches these domains):**
- **typescript-patterns** — Discriminated unions, branded types, conditional types, exhaustive checks, type-safe event emitters. Use when designing type systems or reviewing type safety.
- **prompt-engineering** — System prompt architecture, XML tags, few-shot patterns, chain of thought, production prompt optimization. Use when designing or debugging prompts or procedural generation logic.
- **agent-architecture** — MCP server design, tool dispatch, memory systems, context management, multi-turn state. Use when building AI agent infrastructure.
- **sqlite-patterns** — SQLite WAL mode, FTS5 full-text search, JSON support, migration patterns. Use when working with SQLite databases.
- **claude-api** — Anthropic SDK patterns, streaming, tool use, prompt caching, batch API, token management. Use when building Claude API integrations.

**Skill protocol:**
1. Match the task to available skills before writing any code
2. Load the skill — it activates automatically when the task matches the skill description
3. If no skill matches, research the domain via WebSearch before implementing
4. Cross-reference skill patterns against the installed package versions in package.json
5. When multiple skills apply (e.g., threejs + code-quality for a render optimization), load both

### Verify Visually
Type-checking proves code correctness, not feature correctness. After any visual or gameplay change:
1. Start dev server (`npm run dev`)
2. Open localhost:3000 in browser
3. Test the golden path and edge cases
4. For mobile changes: open DevTools → device toolbar → test on iPhone 12 and Pixel 5 emulations
5. Take screenshots to confirm before reporting done

### Quality Gates
- `npm run build` must pass after every significant change
- No regressions — test adjacent systems after multi-file changes
- Fix root causes, never symptoms. If the proper solution takes longer, take longer.
- Every change ships production-ready. There is no "clean it up later."

### Decision Points
Pause and ask before:
- Choosing between multiple valid architectural approaches
- Making changes that affect the public API of any module
- Removing or significantly restructuring existing code
- Any change with performance implications on mobile

## Implementation Plan

See [PLAN.md](./PLAN.md) for the full phased implementation plan.
All phases 0-11 complete. See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed code map.
