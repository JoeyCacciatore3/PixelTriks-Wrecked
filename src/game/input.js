import { isMobile, isPortrait } from '../util/detect.js'

export class Input {
  constructor() {
    this._keys = new Set()
    this._prev = new Set()
    this._onKeyDown = (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault()
      this._keys.add(e.code)
    }
    this._onKeyUp = (e) => this._keys.delete(e.code)

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup',   this._onKeyUp)
    window.addEventListener('blur', () => { this._keys.clear(); this._prev.clear() })

    // Touch state
    this._touchSteer = 0
    this._touchThrottle = 0
    this._touchJump = false
    this._touchFire = false

    this._joystickId = null
    this._joystickOrigin = null

    this._buttonPointers = new Map()

    this._touchEls = null
    if (isMobile) this._buildTouchUI()
  }

  // ── Touch UI ──

  _buildTouchUI() {
    const canvas = document.querySelector('canvas')
    if (canvas) canvas.style.touchAction = 'none'

    const container = document.createElement('div')
    container.id = 'touch-controls'
    container.style.cssText = 'position:fixed;inset:0;z-index:6;pointer-events:none;'
    document.body.appendChild(container)

    // Joystick zone (left half)
    const joyZone = document.createElement('div')
    joyZone.style.cssText = 'position:absolute;left:0;top:0;width:50%;height:100%;pointer-events:auto;touch-action:none;padding-left:env(safe-area-inset-left, 0);'
    container.appendChild(joyZone)

    // Joystick visuals (hidden until touch)
    const joyRing = document.createElement('div')
    joyRing.style.cssText = 'position:absolute;width:130px;height:130px;border-radius:50%;border:3px solid rgba(255,68,0,0.4);background:rgba(255,68,0,0.05);display:none;transform:translate(-50%,-50%);pointer-events:none;'
    container.appendChild(joyRing)

    const joyDot = document.createElement('div')
    joyDot.style.cssText = 'position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(255,68,0,0.5);border:2px solid rgba(255,68,0,0.7);display:none;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 10px rgba(255,68,0,0.3);'
    container.appendChild(joyDot)

    // Buttons (right side) — two large buttons, stacked with FIRE on bottom (thumb reach)
    const btnWrap = document.createElement('div')
    btnWrap.style.cssText = 'position:absolute;right:calc(16px + env(safe-area-inset-right, 0px));bottom:20px;display:flex;flex-direction:column;gap:12px;pointer-events:auto;touch-action:none;align-items:center;'
    container.appendChild(btnWrap)

    const jumpBtn = this._makeTouchBtn('BOOST', 72, '#44ddff')
    const fireBtn = this._makeTouchBtn('FIRE', 80, '#ff6600')
    btnWrap.appendChild(jumpBtn)
    btnWrap.appendChild(fireBtn)

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

    // Button events
    this._wireButton(fireBtn, 'fire')
    this._wireButton(jumpBtn, 'jump')

    // Orientation overlay
    let orientDismissed = false
    const orientOverlay = document.createElement('div')
    orientOverlay.id = 'orient-overlay'
    document.body.appendChild(orientOverlay)

    const isIPhone = /iPhone/i.test(navigator.userAgent)
    const canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)

    const orientStyle = document.createElement('style')
    orientStyle.textContent = `
      #orient-overlay {
        position:fixed;inset:0;z-index:50;
        background:linear-gradient(135deg, rgba(8,0,14,0.97) 0%, rgba(30,10,50,0.97) 100%);
        display:none;align-items:center;justify-content:center;flex-direction:column;gap:20px;
        font-family:ui-monospace,'SF Mono',monospace;text-align:center;pointer-events:auto;
        padding:env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
      }
      .orient-icon {
        width:80px;height:48px;border:3px solid #eab308;border-radius:8px;position:relative;
        animation:orient-rotate 2s ease-in-out infinite;
      }
      .orient-icon::after {
        content:'';position:absolute;bottom:6px;left:50%;transform:translateX(-50%);
        width:16px;height:3px;border-radius:2px;background:#eab308;
      }
      @keyframes orient-rotate { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(-90deg)} }
      .orient-title {
        font-size:18px;font-weight:900;letter-spacing:0.2em;color:#eab308;
        text-shadow:2px 2px 0 #ef4444;
      }
      .orient-sub {
        font-size:11px;letter-spacing:0.15em;color:rgba(255,255,255,0.5);font-weight:bold;
      }
      .orient-dismiss {
        margin-top:8px;padding:10px 28px;
        background:transparent;border:2px solid rgba(255,255,255,0.2);border-radius:8px;
        color:rgba(255,255,255,0.6);font-family:inherit;font-size:10px;font-weight:bold;
        letter-spacing:0.2em;cursor:pointer;transition:border-color 0.2s,color 0.2s;
      }
      .orient-dismiss:active { border-color:#eab308;color:#eab308; }
      #touch-controls, .touch-fs-btn {
        padding-left:env(safe-area-inset-left, 0);
        padding-right:env(safe-area-inset-right, 0);
      }
    `
    document.head.appendChild(orientStyle)

    orientOverlay.innerHTML = `
      <div class="orient-icon"></div>
      <div class="orient-title">ROTATE DEVICE</div>
      <div class="orient-sub">LANDSCAPE MODE REQUIRED</div>
      <button class="orient-dismiss">CONTINUE ANYWAY</button>
    `

    const checkOrientation = () => {
      if (orientDismissed) return
      if (isPortrait()) {
        orientOverlay.style.display = 'flex'
      } else {
        orientOverlay.style.display = 'none'
      }
    }
    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    orientOverlay.querySelector('.orient-dismiss').addEventListener('pointerdown', () => {
      orientDismissed = true
      orientOverlay.style.display = 'none'
    })

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

    this._touchEls = { container, joyZone, joyRing, joyDot, btnWrap, fireBtn, jumpBtn, orientOverlay, fsBtn }
  }

  _makeTouchBtn(label, size, color) {
    const btn = document.createElement('div')
    btn.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;border:3px solid ${color};background:rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;letter-spacing:0.15em;color:${color};font-family:ui-monospace,'SF Mono',monospace;opacity:0.7;user-select:none;box-shadow:0 0 12px ${color}33,inset 0 0 8px ${color}22;`
    btn.textContent = label
    return btn
  }

  _wireButton(el, type) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      this._buttonPointers.set(e.pointerId, type)
      if (type === 'fire') this._touchFire = true
      if (type === 'jump') this._touchJump = true
      el.style.opacity = '1'
      el.style.transform = 'scale(0.92)'
    })

    const up = (e) => {
      if (!this._buttonPointers.has(e.pointerId)) return
      const t = this._buttonPointers.get(e.pointerId)
      this._buttonPointers.delete(e.pointerId)
      if (t === 'fire') this._touchFire = false
      if (t === 'jump') this._touchJump = false
      el.style.opacity = '0.7'
      el.style.transform = ''
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

  get steerAxis() {
    const kb = (this.steerRight ? 1 : 0) - (this.steerLeft ? 1 : 0)
    return Math.abs(this._touchSteer) > 0.15 ? this._touchSteer : kb
  }

  get throttleAxis() {
    const kb = (this._keys.has('KeyW') || this._keys.has('ArrowUp') ? 1 : 0)
             - (this._keys.has('KeyS') || this._keys.has('ArrowDown') ? 0.65 : 0)
    return Math.abs(this._touchThrottle) > 0.15 ? this._touchThrottle : kb
  }

  endFrame() {
    this._prev.clear()
    this._keys.forEach(k => this._prev.add(k))
  }

}
