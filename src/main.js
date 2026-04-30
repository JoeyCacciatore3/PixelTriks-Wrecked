import { Engine }     from './game/engine.js';
import { Physics }    from './game/physics.js';
import { Input }      from './game/input.js';
import { GameCamera } from './game/camera.js';
import { AudioBus }   from './game/audio.js';
import { Effects }    from './game/effects.js';
import { Arena }      from './game/arena.js';
import { Obstacles }  from './game/obstacles.js';
import { DerbyGame, DerbyState } from './game/derby.js';
import { MAX_HEALTH, setCarCamera } from './game/car.js';
import { RoomManager } from './net/room.js';
import { SyncManager } from './net/sync.js';
import { LobbyUI }    from './ui/lobby.js';
import { DerbyHUD }   from './ui/hud.js';
import { ResultsUI }  from './ui/results.js'
import { Minimap }    from './ui/minimap.js'
import { KillFeed }   from './ui/killfeed.js'

const errorBox  = document.getElementById('error-box');
const errorMsg  = document.getElementById('error-message');

function showError(err) {
  console.error(err);
  if (errorBox && errorMsg) {
    errorMsg.textContent = String(err?.stack || err?.message || err);
    errorBox.classList.add('show');
  }
}

const portalParams = new URLSearchParams(window.location.search)
const isPortalUser = portalParams.get('portal') === 'true'
const portalRef = portalParams.get('ref') || ''
if (isPortalUser) {
  window.__portalRef = portalRef
  window.__isPortalUser = true
}

async function boot() {
  const engine = new Engine(document.getElementById('app'));
  engine.addGroundMesh({ size: 500 });
  engine.render();

  const physics = new Physics();
  await physics.init();

  const arena  = new Arena(engine.scene, physics);
  engine.render();

  const obstacles = new Obstacles(engine.scene, physics);
  const input     = new Input();
  const audio     = new AudioBus();
  audio.init();

  const camera  = new GameCamera(engine.camera);
  setCarCamera(engine.camera);
  const effects = new Effects(engine.scene, camera);
  const derby   = new DerbyGame(engine.scene, physics);
  derby.setObstacles(obstacles);
  const room    = new RoomManager();
  const sync    = new SyncManager(room, derby);

  const lobby   = new LobbyUI()
  const hud     = new DerbyHUD()
  const results = new ResultsUI()
  const minimap = new Minimap()
  const killfeed = new KillFeed()
  hud.hide()
  minimap.hide()

  // ── State transitions ──

  derby.onStateChange = (state) => {
    room.setGameState(state)
    if (room.isHost && state === DerbyState.COUNTDOWN) room.broadcastState('COUNTDOWN')
    if (state === DerbyState.COUNTDOWN) {
      if (derby.localCar) camera.snapTo(derby.localCar)
    }
    if (state === DerbyState.PLAYING) {
      lobby.hide()
      hud.show()
      minimap.show()
    }
    if (state === DerbyState.FINISHED) {
      audio.stopEngine()
      setTimeout(() => results.show(derby.winner, derby), 1200)
    }
  }

  derby.onCountdown = (secs) => {
    if (derby.state === DerbyState.COUNTDOWN) {
      hud.showCountdown(secs)
      audio.playCountdownBeep(secs)
    } else if (derby.state === DerbyState.LOBBY) {
      lobby.setCountdown(secs)
    }
  }

  // ── Play (public matchmaking — try join, fallback to host) ──

  let _playStarted = false

  async function startPlay() {
    if (_playStarted || derby.state !== DerbyState.LOBBY || derby.allCars.length > 0) return
    _playStarted = true
    try {
      const joined = await room.findAndJoinPublic()
      if (joined) {
        lobby.showSlotGrid()
        derby.setSyncManager(sync, false)
        return
      }
      await room.createPublicRoom()
      startAsHost()
    } catch (err) {
      startOffline()
    }
  }

  function startAsHost() {
    derby.addLocalPlayer(0)
    hud.setLocalSlot(0)
    effects.setLocalSlot(0)
    derby.setSyncManager(sync, true)
    derby.spawnInitialAI()
    lobby.hide()
    hud.show()
    derby.beginMatchCountdown()
  }

  function startOffline() {
    derby.addLocalPlayer(0)
    hud.setLocalSlot(0)
    effects.setLocalSlot(0)
    derby.spawnInitialAI()
    lobby.hide()
    hud.show()
    derby.beginMatchCountdown()
  }

  window.addEventListener('lobby:play', () => startPlay());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && derby.state === DerbyState.LOBBY && derby.allCars.length === 0) startPlay();
  });

  // ── Private room — host flow ──

  lobby.onStart = async () => {
    const code = await room.createRoom()
    lobby.showRoomCode(code)
    lobby.setSlot(0, 'YOU (HOST)')
    derby.addLocalPlayer(0)
    hud.setLocalSlot(0)
    derby.setSyncManager(sync, true)
    derby.startLobby()
  };

  // ── Private room — join flow ──

  lobby.onJoin = async (code) => {
    await room.joinRoom(code)
    lobby.showSlotGrid()
    derby.setSyncManager(sync, false)
  };

  // ── Room events ──

  window.addEventListener('room:player_join', (e) => {
    const { slot, playerId } = e.detail;
    if (playerId === room.myId) {
      derby.addLocalPlayer(slot)
      hud.setLocalSlot(slot)
      effects.setLocalSlot(slot)
      lobby.setSlot(slot, 'YOU')
    } else {
      if (derby.drivers[slot]) {
        delete derby.drivers[slot]
        derby._aiSlots.delete(slot)
      }
      derby.addRemotePlayer(slot)
      lobby.setSlot(slot, 'P' + (slot + 1))
    }
  });

  window.addEventListener('room:player_leave', (e) => {
    const { slot } = e.detail
    lobby.setSlotEmpty(slot)
    const car = derby.cars[slot]
    if (car && !car.eliminated && !derby.drivers[slot]) {
      derby.addAI(slot)
    }
  })

  window.addEventListener('room:state_change', (e) => {
    if (e.detail.state === 'COUNTDOWN' && !room.isHost) {
      derby.spawnInitialAI()
      derby.beginMatchCountdown()
    }
    if (e.detail.state === 'PLAYING' && !room.isHost) {
      lobby.hide()
      hud.show()
      minimap.show()
    }
  })

  // ── Results ──

  results.onPlayAgain = () => { results.hide(); window.location.reload(); };

  // ── Mute ──

  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') audio.setMuted(!audio.muted);
  });

  // ── Main loop ──

  let last = performance.now();

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    physics.step(dt);
    arena.update(dt, derby.allCars);

    if (derby.state === DerbyState.PLAYING) {
      const localInput = derby.localCar ? input : null;
      derby.update(dt, localInput);
      obstacles.update(dt);
      sync.update(dt);
      camera.update(dt, derby.localCar);
      effects.update(dt);
      hud.update(dt, derby)
      minimap.update(derby)
      if (derby.localCar) {
        audio.updateEngine(derby.localCar.speed)
        audio.updateLowHealth(derby.localCar.health, MAX_HEALTH)
        effects.updateSpeedLines(derby.localCar.speed)
      }
    } else if (derby.state === DerbyState.COUNTDOWN) {
      derby.update(dt, null);
      camera.update(dt, derby.localCar);
    } else if (derby.state === DerbyState.LOBBY) {
      derby.update(dt, null);
    }

    engine.render();
    input.endFrame();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  window.__wy = { engine, physics, derby, room, sync, audio, effects };

  if (isPortalUser) startOffline()
}

boot().catch(showError);
window.addEventListener('error',              (e) => showError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));
