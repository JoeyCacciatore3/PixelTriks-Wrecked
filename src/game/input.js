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
    joyZone.style.cssText = 'position:absolute;left:0;top:0;width:50%;height:100%;pointer-events:auto;touch-action:none;'
    container.appendChild(joyZone)

    // Joystick visuals (hidden until touch)
    const joyRing = document.createElement('div')
    joyRing.style.cssText = 'position:absolute;width:120px;height:120px;border-radius:50%;border:2px solid rgba(255,68,0,0.3);display:none;transform:translate(-50%,-50%);pointer-events:none;'
    container.appendChild(joyRing)

    const joyDot = document.createElement('div')
    joyDot.style.cssText = 'position:absolute;width:40px;height:40px;border-radius:50%;background:rgba(255,68,0,0.4);display:none;transform:translate(-50%,-50%);pointer-events:none;'
    container.appendChild(joyDot)

    // Buttons (right side)
    const btnWrap = document.createElement('div')
    btnWrap.style.cssText = 'position:absolute;right:20px;bottom:30px;display:flex;flex-direction:column;gap:16px;pointer-events:auto;touch-action:none;'
    container.appendChild(btnWrap)

    const fireBtn = this._makeTouchBtn('FIRE', 60, '#ff6600')
    const jumpBtn = this._makeTouchBtn('BOOST', 60, '#44ddff')
    btnWrap.appendChild(fireBtn)
    btnWrap.appendChild(jumpBtn)

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
    const orientOverlay = document.createElement('div')
    orientOverlay.id = 'orient-overlay'
    orientOverlay.style.cssText = 'position:fixed;inset:0;z-index:50;background:rgba(8,0,14,0.95);display:none;align-items:center;justify-content:center;flex-direction:column;gap:16px;font-family:ui-monospace,monospace;color:#ff4400;text-align:center;pointer-events:auto;'
    orientOverlay.innerHTML = '<div style="font-size:36px;">📱↔️</div><div style="font-size:14px;letter-spacing:0.2em;">ROTATE FOR BEST EXPERIENCE</div><div style="font-size:10px;color:#666;letter-spacing:0.15em;">TAP TO DISMISS</div>'
    document.body.appendChild(orientOverlay)

    const checkOrientation = () => {
      if (isPortrait()) {
        orientOverlay.style.display = 'flex'
      } else {
        orientOverlay.style.display = 'none'
      }
    }
    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    orientOverlay.addEventListener('pointerdown', () => {
      orientOverlay.style.display = 'none'
      window.removeEventListener('resize', checkOrientation)
    })

    // Fullscreen toggle
    const fsBtn = document.createElement('div')
    fsBtn.style.cssText = 'position:fixed;top:8px;left:8px;z-index:7;width:36px;height:36px;border-radius:6px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;color:#aaa;cursor:pointer;pointer-events:auto;'
    fsBtn.textContent = '⛶'
    document.body.appendChild(fsBtn)
    fsBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      const el = document.documentElement
      if (!document.fullscreenElement) {
        (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen).call(el)
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      }
    })

    this._touchEls = { container, joyZone, joyRing, joyDot, btnWrap, fireBtn, jumpBtn, orientOverlay, fsBtn }
  }

  _makeTouchBtn(label, size, color) {
    const btn = document.createElement('div')
    btn.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:10px;letter-spacing:0.2em;color:${color};font-family:ui-monospace,monospace;opacity:0.6;user-select:none;`
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
      el.style.opacity = '0.6'
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

  get mutePressed() {
    return this._keys.has('KeyM') && !this._prev.has('KeyM')
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

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup',   this._onKeyUp)
    if (this._touchEls) {
      this._touchEls.container.remove()
      if (this._touchEls.orientOverlay) this._touchEls.orientOverlay.remove()
      if (this._touchEls.fsBtn) this._touchEls.fsBtn.remove()
      this._touchEls = null
    }
  }
}
