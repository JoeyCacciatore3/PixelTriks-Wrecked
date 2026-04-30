import { isMobile } from '../util/detect.js'

export class Input {
  constructor() {
    this._keys = new Set()
    this._onKeyDown = (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault()
      this._keys.add(e.code)
    }
    this._onKeyUp = (e) => this._keys.delete(e.code)

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup',   this._onKeyUp)
    window.addEventListener('blur', () => { this._keys.clear() })

    // Touch state
    this._touchSteer = 0
    this._touchThrottle = 0
    this._touchJump = false
    this._touchFire = false
    this._touchSuperShot = false

    this._joystickId = null
    this._joystickOrigin = null

    this._buttonPointers = new Map()

    this._touchEls = null
    this._buildActionButtons()
    if (isMobile) this._buildTouchUI()
  }

  // ── Action Buttons (all platforms) ──

  _buildActionButtons() {
    const style = document.createElement('style')
    style.textContent = `
      #action-buttons {
        position:fixed;right:calc(16px + env(safe-area-inset-right, 0px));bottom:80px;
        z-index:6;display:flex;flex-direction:column;gap:10px;align-items:flex-end;
        pointer-events:auto;touch-action:none;
      }
      #action-buttons .btn-row {
        display:flex;flex-direction:row;gap:14px;align-items:flex-end;
      }
      .act-btn {
        border-radius:50%;display:flex;align-items:center;justify-content:center;
        font-weight:900;letter-spacing:0.12em;
        font-family:ui-monospace,'SF Mono',monospace;
        user-select:none;position:relative;
        transition:transform 0.08s ease, opacity 0.25s ease;
      }
      .act-btn::after {
        content:'';position:absolute;inset:3px;border-radius:50%;
        border:1px solid rgba(255,255,255,0.12);pointer-events:none;
      }
      .btn-fire {
        width:80px;height:80px;font-size:13px;color:#fff;
        background:radial-gradient(circle at 40% 35%, #ff8c00 0%, #cc4400 60%, #991100 100%);
        border:3px solid #ff6600;
        box-shadow:0 0 20px rgba(255,102,0,0.5),0 0 40px rgba(255,102,0,0.2),
                   inset 0 -4px 8px rgba(0,0,0,0.4),inset 0 2px 4px rgba(255,200,100,0.3);
        text-shadow:0 0 8px rgba(255,100,0,0.8),0 1px 2px rgba(0,0,0,0.6);
      }
      .btn-fire:active, .btn-fire.pressed {
        transform:scale(0.92);
        box-shadow:0 0 30px rgba(255,102,0,0.8),0 0 60px rgba(255,102,0,0.4),
                   inset 0 -2px 4px rgba(0,0,0,0.3),inset 0 2px 8px rgba(255,200,100,0.5);
      }
      .btn-boost {
        width:72px;height:72px;font-size:11px;
      }
      .btn-boost.boost-ready {
        color:#ccffff;
        background:radial-gradient(circle at 40% 35%, #44eeff 0%, #0099cc 55%, #005577 100%);
        border:3px solid #44ddff;
        box-shadow:0 0 18px rgba(68,221,255,0.5),0 0 36px rgba(68,221,255,0.2),
                   inset 0 -4px 8px rgba(0,0,0,0.4),inset 0 2px 4px rgba(150,240,255,0.3);
        text-shadow:0 0 8px rgba(68,221,255,0.8),0 1px 2px rgba(0,0,0,0.6);
        animation:boost-pulse 1.8s ease-in-out infinite;
      }
      .btn-boost.boost-cooldown {
        color:#667788;
        background:radial-gradient(circle at 40% 35%, #334455 0%, #1a2a3a 60%, #0d1520 100%);
        border:3px solid #334455;
        box-shadow:0 0 4px rgba(68,221,255,0.05),
                   inset 0 -4px 8px rgba(0,0,0,0.5),inset 0 2px 2px rgba(100,120,140,0.1);
        text-shadow:none;
        animation:none;
        opacity:0.6;
      }
      .btn-boost:active, .btn-boost.pressed { transform:scale(0.92); }
      .btn-super {
        width:64px;height:64px;font-size:11px;color:#fff;
        background:radial-gradient(circle at 40% 35%, #ffcc00 0%, #ff6600 60%, #cc2200 100%);
        border:3px solid #ffaa00;
        box-shadow:0 0 20px rgba(255,170,0,0.6),0 0 40px rgba(255,102,0,0.3),
                   inset 0 -4px 8px rgba(0,0,0,0.4),inset 0 2px 4px rgba(255,220,100,0.4);
        text-shadow:0 0 8px rgba(255,170,0,0.9),0 1px 2px rgba(0,0,0,0.6);
        animation:super-pulse 1.2s ease-in-out infinite;
        display:none;flex-direction:column;gap:2px;
      }
      .btn-super.has-ammo { display:flex; }
      .btn-super:active, .btn-super.pressed { transform:scale(0.92); }
      .btn-super .super-icon { width:24px;height:24px;image-rendering:pixelated; }
      .btn-super .super-count { font-size:14px;font-weight:900; }
      @keyframes super-pulse {
        0%,100% { box-shadow:0 0 20px rgba(255,170,0,0.6),0 0 40px rgba(255,102,0,0.3),
                             inset 0 -4px 8px rgba(0,0,0,0.4),inset 0 2px 4px rgba(255,220,100,0.4); }
        50% { box-shadow:0 0 35px rgba(255,170,0,0.9),0 0 60px rgba(255,102,0,0.5),
                          inset 0 -4px 8px rgba(0,0,0,0.3),inset 0 2px 6px rgba(255,220,100,0.6); }
      }
      @keyframes boost-pulse {
        0%,100% { box-shadow:0 0 18px rgba(68,221,255,0.5),0 0 36px rgba(68,221,255,0.2),
                             inset 0 -4px 8px rgba(0,0,0,0.4),inset 0 2px 4px rgba(150,240,255,0.3); }
        50% { box-shadow:0 0 28px rgba(68,221,255,0.7),0 0 56px rgba(68,221,255,0.35),
                          inset 0 -4px 8px rgba(0,0,0,0.3),inset 0 2px 6px rgba(150,240,255,0.5); }
      }
    `
    document.head.appendChild(style)

    const btnWrap = document.createElement('div')
    btnWrap.id = 'action-buttons'
    btnWrap.addEventListener('contextmenu', e => e.preventDefault())
    document.body.appendChild(btnWrap)

    const superBtn = document.createElement('div')
    superBtn.className = 'act-btn btn-super'
    superBtn.innerHTML = '<img class="super-icon" src="textures/firebullet.png"><span class="super-count">2</span>'

    const btnRow = document.createElement('div')
    btnRow.className = 'btn-row'

    const jumpBtn = document.createElement('div')
    jumpBtn.className = 'act-btn btn-boost boost-ready'
    jumpBtn.textContent = 'BOOST'

    const fireBtn = document.createElement('div')
    fireBtn.className = 'act-btn btn-fire'
    fireBtn.textContent = 'FIRE'

    btnRow.appendChild(jumpBtn)
    btnRow.appendChild(fireBtn)
    btnWrap.appendChild(superBtn)
    btnWrap.appendChild(btnRow)

    this._wireButton(fireBtn, 'fire')
    this._wireButton(jumpBtn, 'jump')
    this._wireButton(superBtn, 'supershot')

    this._actionEls = { btnWrap, jumpBtn, fireBtn, superBtn }
  }

  setSuperShots(count) {
    const btn = this._actionEls?.superBtn
    if (!btn) return
    if (count > 0) {
      btn.classList.add('has-ammo')
      btn.querySelector('.super-count').textContent = count
    } else {
      btn.classList.remove('has-ammo')
    }
  }

  setBoostReady(ready) {
    const btn = this._actionEls?.jumpBtn
    if (!btn) return
    if (ready) {
      btn.classList.add('boost-ready')
      btn.classList.remove('boost-cooldown')
    } else {
      btn.classList.remove('boost-ready')
      btn.classList.add('boost-cooldown')
    }
  }

  // ── Touch UI (mobile only) ──

  _buildTouchUI() {
    const canvas = document.querySelector('canvas')
    if (canvas) {
      canvas.style.touchAction = 'none'
      canvas.addEventListener('contextmenu', e => e.preventDefault())
    }

    const container = document.createElement('div')
    container.id = 'touch-controls'
    container.style.cssText = 'position:fixed;inset:0;z-index:6;pointer-events:none;'
    document.body.appendChild(container)

    // Joystick zone (left half)
    const joyZone = document.createElement('div')
    joyZone.style.cssText = 'position:absolute;left:0;top:0;width:50%;height:100%;pointer-events:auto;touch-action:none;padding-left:env(safe-area-inset-left, 0);'
    joyZone.addEventListener('contextmenu', e => e.preventDefault())
    container.appendChild(joyZone)

    // Joystick visuals (hidden until touch)
    const joyRing = document.createElement('div')
    joyRing.style.cssText = 'position:absolute;width:130px;height:130px;border-radius:50%;border:3px solid rgba(255,68,0,0.4);background:rgba(255,68,0,0.05);display:none;transform:translate(-50%,-50%);pointer-events:none;'
    container.appendChild(joyRing)

    const joyDot = document.createElement('div')
    joyDot.style.cssText = 'position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(255,68,0,0.5);border:2px solid rgba(255,68,0,0.7);display:none;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 10px rgba(255,68,0,0.3);'
    container.appendChild(joyDot)

    // Joystick pointer events
    joyZone.addEventListener('pointerdown', (e) => {
      if (this._joystickId !== null) return
      e.preventDefault()
      joyZone.setPointerCapture(e.pointerId)
      this._joystickId = e.pointerId
      this._joystickOrigin = { x: e.clientX, y: e.clientY }
      joyRing.style.left = e.clientX + 'px'
      joyRing.style.top = e.clientY + 'px'
      joyDot.style.left = e.clientX + 'px'
      joyDot.style.top = e.clientY + 'px'
      joyRing.style.display = 'block'
      joyDot.style.display = 'block'
    })

    joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._joystickId || !this._joystickOrigin) return
      e.preventDefault()
      const dx = e.clientX - this._joystickOrigin.x
      const dy = e.clientY - this._joystickOrigin.y
      const maxR = 50

      const dist = Math.hypot(dx, dy)
      const clampedX = dist > maxR ? dx / dist * maxR : dx
      const clampedY = dist > maxR ? dy / dist * maxR : dy

      joyDot.style.left = (this._joystickOrigin.x + clampedX) + 'px'
      joyDot.style.top = (this._joystickOrigin.y + clampedY) + 'px'

      const DEADZONE = 12
      this._touchSteer = Math.abs(dx) > DEADZONE
        ? Math.max(-1, Math.min(1, dx / maxR))
        : 0
      this._touchThrottle = Math.abs(dy) > DEADZONE
        ? Math.max(-0.65, Math.min(1, -dy / maxR))
        : 0
    })

    const joystickEnd = (e) => {
      if (e.pointerId !== this._joystickId) return
      this._joystickId = null
      this._joystickOrigin = null
      this._touchSteer = 0
      this._touchThrottle = 0
      joyRing.style.display = 'none'
      joyDot.style.display = 'none'
    }
    joyZone.addEventListener('pointerup', joystickEnd)
    joyZone.addEventListener('pointercancel', joystickEnd)
    joyZone.addEventListener('lostpointercapture', joystickEnd)

    window.addEventListener('pointerup', (e) => {
      if (e.pointerId === this._joystickId) joystickEnd(e)
    })

    const isIPhone = /iPhone/i.test(navigator.userAgent)
    const canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)

    const safeAreaStyle = document.createElement('style')
    safeAreaStyle.textContent = `
      #touch-controls, .touch-fs-btn {
        padding-left:env(safe-area-inset-left, 0);
        padding-right:env(safe-area-inset-right, 0);
      }
    `
    document.head.appendChild(safeAreaStyle)

    // Fullscreen + orientation lock
    const fsBtn = document.createElement('div')
    fsBtn.className = 'touch-fs-btn'
    fsBtn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:7;padding:6px 14px;border-radius:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;letter-spacing:0.15em;color:rgba(255,255,255,0.5);font-family:ui-monospace,monospace;cursor:pointer;pointer-events:auto;'

    const updateFsLabel = () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement)
      fsBtn.textContent = isFs ? 'EXIT FS' : 'FULLSCREEN'
    }

    if (isIPhone && !canFullscreen) {
      fsBtn.style.display = 'none'
    }

    updateFsLabel()
    document.body.appendChild(fsBtn)

    const enterFullscreen = async () => {
      const el = document.documentElement
      const reqFs = el.requestFullscreen || el.webkitRequestFullscreen
      if (!reqFs) return
      try {
        await reqFs.call(el)
        if (screen.orientation && screen.orientation.lock) {
          try { await screen.orientation.lock('landscape') } catch (_) {}
        }
      } catch (_) {}
    }

    const exitFullscreen = async () => {
      const exitFs = document.exitFullscreen || document.webkitExitFullscreen
      if (!exitFs) return
      if (screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock() } catch (_) {}
      }
      try { await exitFs.call(document) } catch (_) {}
    }

    fsBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement)
      if (!isFs) enterFullscreen()
      else exitFullscreen()
    })

    document.addEventListener('fullscreenchange', updateFsLabel)
    document.addEventListener('webkitfullscreenchange', updateFsLabel)

    this._touchEls = { container, joyZone, joyRing, joyDot, fsBtn }
  }

  _wireButton(el, type) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      this._buttonPointers.set(e.pointerId, type)
      if (type === 'fire') this._touchFire = true
      if (type === 'jump') this._touchJump = true
      if (type === 'supershot') this._touchSuperShot = true
      el.classList.add('pressed')
    })

    const up = (e) => {
      if (!this._buttonPointers.has(e.pointerId)) return
      const t = this._buttonPointers.get(e.pointerId)
      this._buttonPointers.delete(e.pointerId)
      if (t === 'fire') this._touchFire = false
      if (t === 'jump') this._touchJump = false
      if (t === 'supershot') this._touchSuperShot = false
      el.classList.remove('pressed')
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  // ── Getters (merge keyboard + touch) ──

  get throttle()   { return this._keys.has('KeyW') || this._keys.has('ArrowUp') || this._touchThrottle > 0.15 }
  get brake()      { return this._keys.has('KeyS') || this._keys.has('ArrowDown') || this._touchThrottle < -0.15 }
  get steerLeft()  { return this._keys.has('KeyA') || this._keys.has('ArrowLeft') || this._touchSteer < -0.15 }
  get steerRight() { return this._keys.has('KeyD') || this._keys.has('ArrowRight') || this._touchSteer > 0.15 }
  get boostPressed() {
    return this._keys.has('Space') || this._keys.has('KeyZ') || this._touchJump
  }

  get firePressed() {
    return this._keys.has('Enter') || this._touchFire
  }

  get superShotPressed() {
    return this._keys.has('KeyQ') || this._touchSuperShot
  }

  get steerAxis() {
    const kb = (this.steerRight ? 1 : 0) - (this.steerLeft ? 1 : 0)
    return Math.abs(this._touchSteer) > 0.15 ? this._touchSteer : kb
  }

  endFrame() {
  }

}
