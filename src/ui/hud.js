import { CAR_COLORS, MAX_HEALTH } from '../game/car.js'
import { isMobile } from '../util/detect.js'

export class DerbyHUD {
  constructor() {
    this._el        = null
    this._localSlot = -1
    this._bars      = {}
    this._elapsed   = 0
    this._barsContainer = null
    this._lastCd     = -1

    this._build()
    window.addEventListener('car:eliminated', (e) => this._onEliminated(e.detail.slot))
  }

  setLocalSlot(slot) {
    this._localSlot = slot
  }

  _build() {
    this._el = document.createElement('div')
    this._el.id = 'derby-hud'
    this._el.innerHTML = `
      <div id="hud-health-bars"></div>
      <div id="hud-countdown" class="hud-countdown hidden"></div>
    `
    document.body.appendChild(this._el)
    this._injectStyles()

    this._barsContainer = document.getElementById('hud-health-bars')
    this._countdownEl = document.getElementById('hud-countdown')
  }

  _ensureBar(car) {
    const slot = car.slot
    if (this._bars[slot]) return this._bars[slot]
    const color = CAR_COLORS[slot % CAR_COLORS.length]
    const label = car.isHuman ? 'P' + (slot + 1) : 'AI'
    const row = document.createElement('div')
    row.className = 'hb-row'
    row.id = `hb-${slot}`
    row.innerHTML = `
      <div class="hb-label" style="color:${color}">${label}</div>
      <div class="hb-track">
        <div class="hb-fill" style="background:${color};box-shadow:0 0 8px ${color}"></div>
      </div>
    `
    if (slot === this._localSlot) row.classList.add('local')
    this._barsContainer.appendChild(row)
    this._bars[slot] = { wrap: row, fill: row.querySelector('.hb-fill') }
    return this._bars[slot]
  }

  update(dt, derby) {
    if (!derby) return
    this._elapsed += dt

    for (const car of derby.allCars) {
      if (!car) continue
      if (isMobile && !car.isHuman) continue
      const bar = this._ensureBar(car)
      const pct = (car.health / MAX_HEALTH) * 100
      bar.fill.style.width = pct.toFixed(1) + '%'
      if (car.eliminated) bar.wrap.classList.add('dead')
    }

  }

  showCountdown(secs) {
    if (!this._countdownEl) return
    const num = secs <= 0 ? 0 : secs
    if (num === this._lastCd) return
    this._lastCd = num
    const isGo = num === 0
    const text = isGo ? 'WRECKED!' : String(num)
    const cls = isGo ? 'cd-go' : 'cd-num'
    this._countdownEl.innerHTML = `<div class="cd-text ${cls}">${text}</div>`
    this._countdownEl.classList.remove('hidden')
    if (isGo) {
      setTimeout(() => {
        this._countdownEl.classList.add('hidden')
        this._lastCd = -1
      }, 1500)
    }
  }

  _onEliminated(slot) {
    if (this._bars[slot]) {
      this._bars[slot].wrap.classList.add('dead')
      this._bars[slot].wrap.classList.add('elim-flash')
      setTimeout(() => this._bars[slot]?.wrap.classList.remove('elim-flash'), 600)
    }
  }

  hide() { if (this._el) this._el.style.display = 'none'; }
  show() { if (this._el) this._el.style.display = ''; }

  _injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      #derby-hud { position: fixed; inset: 0; pointer-events: none; z-index: 5; font-family: ui-monospace, monospace; }

      #hud-health-bars {
        position: absolute; top: 12px; left: calc(12px + env(safe-area-inset-left, 0px));
        display: flex; flex-direction: column; gap: 4px;
        max-height: 40vh; overflow: hidden;
      }
      .hb-row { display: flex; align-items: center; gap: 8px; opacity: 1; transition: opacity 0.4s; }
      .hb-row.dead { opacity: 0.3; }
      .hb-row.local { outline: 1px solid rgba(255,255,255,0.18); padding: 3px 5px; margin: -3px -5px; }
      .hb-label { font-size: 11px; font-weight: bold; letter-spacing: 0.05em; width: 13px; text-align: center; }
      .hb-track { width: 120px; height: 7px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); overflow: hidden; }
      .hb-fill  { height: 100%; transition: width 0.12s ease; }


      .hb-row.elim-flash { animation: hb-elim-pulse 0.2s ease-in-out 3; }
      @keyframes hb-elim-pulse {
        0%, 100% { outline-color: transparent; }
        50% { outline: 3px solid #ef4444; }
      }
      #hud-countdown {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10;
      }
      .cd-text {
        font-family: ui-monospace, monospace;
        font-weight: 900; text-transform: uppercase;
        text-align: center; line-height: 1;
      }
      .cd-num {
        font-size: clamp(100px, 25vw, 200px);
        color: #fff;
        text-shadow: 0 0 40px rgba(255,255,255,0.6), 0 0 80px rgba(234,179,8,0.4), 4px 4px 0 #ef4444;
        animation: cd-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      .cd-go {
        font-size: clamp(60px, 18vw, 140px);
        color: #eab308;
        text-shadow: 0 0 60px rgba(234,179,8,0.8), 0 0 120px rgba(239,68,68,0.5), 4px 4px 0 #ef4444;
        animation: cd-go-pop 1.2s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      @keyframes cd-pop {
        0% { transform: scale(2.5); opacity: 0; }
        40% { transform: scale(0.9); opacity: 1; }
        60% { transform: scale(1.05); }
        100% { transform: scale(1); opacity: 0.3; }
      }
      @keyframes cd-go-pop {
        0% { transform: scale(0.3); opacity: 0; }
        30% { transform: scale(1.15); opacity: 1; }
        50% { transform: scale(1.0); }
        100% { transform: scale(1.8); opacity: 0; }
      }
      @media (max-width: 600px) {
        #hud-health-bars { top: max(8px, env(safe-area-inset-top, 0px)); left: max(8px, env(safe-area-inset-left, 0px)); }
        .hb-track { width: clamp(60px, 18vw, 120px); height: 5px; }
        .hb-label { font-size: 9px; }
        .hb-row.local { padding: 2px 3px; margin: -2px -3px; }

      }
    `;
    document.head.appendChild(s);
  }
}
