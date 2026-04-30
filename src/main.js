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

let _vfxOverlay = null

function showEndMatchVFX(winnerSlot) {
  _vfxOverlay = document.createElement('div')
  _vfxOverlay.id = 'end-match-vfx'
  _vfxOverlay.style.cssText = 'position:fixed;inset:0;z-index:15;pointer-events:none;overflow:hidden'

  const isVictory = winnerSlot >= 0
  const text = isVictory ? 'HUMANS WIN!' : 'OVERWHELMED!'
  const color = isVictory ? '#22c55e' : '#ef4444'

  const msg = document.createElement('div')
  msg.textContent = text
  msg.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:ui-monospace,monospace;font-size:clamp(40px,10vw,80px);font-weight:900;color:${color};text-shadow:0 0 40px ${color}80,4px 4px 0 #1e293b;z-index:2;animation:cd-go-pop 1.2s cubic-bezier(0.34,1.56,0.64,1) both`
  _vfxOverlay.appendChild(msg)

  const count = isVictory ? 25 : 18
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    const angle = Math.random() * Math.PI * 2
    const speed = 150 + Math.random() * 300
    const vx = Math.cos(angle) * speed
    const vy = Math.sin(angle) * speed
    const size = 20 + Math.random() * 30
    const delay = Math.random() * 0.3

    if (isVictory) {
      el.textContent = '❤'
      el.style.cssText = `position:absolute;left:50%;top:50%;font-size:${size}px;opacity:0;animation:vfx-scatter 2s ${delay}s ease-out both;--vx:${vx}px;--vy:${vy}px`
    } else {
      el.style.cssText = `position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;background:url(textures/explosion.png) center/contain no-repeat;opacity:0;animation:vfx-scatter 2s ${delay}s ease-out both;--vx:${vx}px;--vy:${vy}px`
    }
    _vfxOverlay.appendChild(el)
  }

  const style = document.createElement('style')
  style.id = 'vfx-style'
  style.textContent = `
    @keyframes vfx-scatter {
      0% { transform: translate(-50%,-50%) scale(0.3); opacity: 1; }
      20% { opacity: 1; }
      100% { transform: translate(calc(-50% + var(--vx)), calc(-50% + var(--vy))) scale(1); opacity: 0; }
    }
  `
  document.head.appendChild(style)
  document.body.appendChild(_vfxOverlay)
}

function removeEndMatchVFX() {
  if (_vfxOverlay) { _vfxOverlay.remove(); _vfxOverlay = null }
  const style = document.getElementById('vfx-style')
  if (style) style.remove()
}

async function boot() {
  const loader = document.createElement('div')
  loader.id = 'boot-loader'
  loader.textContent = 'LOADING...'
  loader.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;color:#eab308;font:bold clamp(18px,4vw,32px) ui-monospace,monospace;background:#1a1a2e;z-index:99'
  document.getElementById('app').appendChild(loader)

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
  minimap.setAudio(audio)
  const killfeed = new KillFeed()
  hud.hide()
  minimap.hide()
  loader.remove()

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
      hud.showTimer()
      minimap.show()
    }
    if (state === DerbyState.FINISHED) {
      audio.stopEngine()
      hud.hideTimer()
      showEndMatchVFX(derby.winner)
      setTimeout(() => {
        removeEndMatchVFX()
        results.show(derby.winner, derby)
      }, 2000)
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

  // ── Play (instant solo as public host) ──

  let _playStarted = false

  async function startPlay() {
    if (_playStarted || derby.state !== DerbyState.LOBBY || derby.allCars.length > 0) return
    _playStarted = true
    derby.addLocalPlayer(0)
    hud.setLocalSlot(0)
    effects.setLocalSlot(0)
    derby.spawnInitialAI()
    lobby.hide()
    hud.show()
    derby.beginMatchCountdown()
  }

  // ── Join any available room ──

  window.addEventListener('lobby:play', () => startPlay());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && derby.state === DerbyState.LOBBY && derby.allCars.length === 0 && !_playStarted) startPlay();
  });

  // ── Host start button — skip lobby countdown ──

  window.addEventListener('lobby:host_start', () => {
    if (derby.state !== DerbyState.LOBBY) return
    derby.spawnInitialAI()
    derby.beginMatchCountdown()
    if (room.isHost) room.broadcastState('COUNTDOWN')
  })

  // ── Create room — host flow ──

  lobby.onStart = async () => {
    const code = await room.createRoom()
    lobby.showRoomCode(code)
    lobby.showHostStart()
    lobby.setSlot(0, 'YOU (HOST)')
    derby.addLocalPlayer(0)
    hud.setLocalSlot(0)
    effects.setLocalSlot(0)
    derby.setSyncManager(sync, true)
    derby.startLobby()
  };

  // ── Join room — guest flow ──

  lobby.onJoin = async (code) => {
    await room.joinRoom(code)
    lobby.enterAsGuest()
    derby.setSyncManager(sync, false)
    derby.startLobby()
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
    if (slot === 0 && !room.isHost && derby.state === DerbyState.LOBBY) {
      room.leave()
      lobby._exitRoomView()
      lobby.showToast('HOST DISCONNECTED')
      _playStarted = false
      return
    }
    const car = derby.cars[slot]
    if (car && !car.eliminated && !derby.drivers[slot]) {
      derby.addAI(slot)
    }
  })

  window.addEventListener('lobby:leave_room', () => {
    room.leave()
    _playStarted = false
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

  const cleanup = () => room.leave()
  window.addEventListener('beforeunload', cleanup)
  window.addEventListener('pagehide', cleanup)

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
        input.setBoostReady(derby.localCar.boostCooldown <= 0)
        input.setSuperShots(derby.localCar.superShots)
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

  if (isPortalUser) startPlay()
}

boot().catch(showError);
window.addEventListener('error',              (e) => showError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));
