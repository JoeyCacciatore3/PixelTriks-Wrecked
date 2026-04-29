# WRECKYARD

4-player demolition derby. Last car standing wins. Vibe Jam 2026 entry.

## Run it

```bash
npm install
npm run dev
# → http://localhost:3000
```

Press Enter or click "PLAY SOLO vs 3 AI" to start. No account needed.

## Controls

| Key | Action |
|---|---|
| W / ↑ | Throttle |
| S / ↓ | Brake / Reverse |
| A / ← | Steer left |
| D / → | Steer right |
| Space | Jump |
| Shift | Boost (3 charges) |
| M | Mute |

## Multiplayer

Click CREATE GAME to host. Share the 6-character room code. Up to 3 others join — empty slots fill with AI after 20 seconds. Uses PeerJS (WebRTC P2P) — no server required.

## Build

```bash
npm run build    # → dist/
```

## Tech

- Three.js r170
- Rapier3D WASM
- PeerJS (WebRTC)
- Vite 5
- Vanilla JS — zero external assets, all procedural
