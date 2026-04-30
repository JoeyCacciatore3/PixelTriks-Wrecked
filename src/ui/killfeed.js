import { CAR_COLORS, CAR_NAMES } from '../game/car.js'

const MAX_ENTRIES = 4
const FADE_TIME  = 4000

export class KillFeed {
  constructor() {
    this._el = document.createElement('div')
    this._el.style.cssText = `
      position:fixed;top:60px;left:50%;transform:translateX(-50%);
      z-index:6;pointer-events:none;display:flex;flex-direction:column;
      align-items:center;gap:4px;font-family:ui-monospace,monospace;
    `
    document.body.appendChild(this._el)
    this._lastAttacker = {}
    this._names = {}

    window.addEventListener('car:hit', (e) => {
      const d = e.detail
      if (d.name) this._names[d.slot] = d.name
      if (d.attackerSlot !== undefined) {
        this._lastAttacker[d.slot] = d.attackerSlot
      }
    })

    window.addEventListener('car:eliminated', (e) => {
      const d = e.detail
      if (d.name) this._names[d.slot] = d.name
      const attackerSlot = this._lastAttacker[d.slot]
      this._addEntry(attackerSlot, d.slot)
    })
  }

  _addEntry(attackerSlot, victimSlot) {
    const entry = document.createElement('div')
    entry.style.cssText = `
      padding:6px 14px;background:rgba(0,0,0,0.65);border:2px solid rgba(255,255,255,0.15);border-radius:10px;
      font-size:14px;font-weight:bold;letter-spacing:0.1em;box-shadow:3px 3px 0 rgba(0,0,0,0.4);
      white-space:nowrap;opacity:1;transition:opacity 0.5s;backdrop-filter:blur(4px);
    `

    const victimName = this._names[victimSlot] || CAR_NAMES[victimSlot % CAR_NAMES.length] || 'UNKNOWN'
    const victimColor = CAR_COLORS[victimSlot % CAR_COLORS.length] || '#fff'

    if (attackerSlot !== undefined && attackerSlot !== victimSlot) {
      const attackerName = this._names[attackerSlot] || CAR_NAMES[attackerSlot % CAR_NAMES.length] || 'UNKNOWN'
      const attackerColor = CAR_COLORS[attackerSlot % CAR_COLORS.length] || '#fff'
      entry.innerHTML = `<span style="color:${attackerColor}">${attackerName}</span> <span style="color:#ffffff">WRECKED</span> <span style="color:${victimColor}">${victimName}</span>`
    } else {
      entry.innerHTML = `<span style="color:${victimColor}">${victimName}</span> <span style="color:#ffffff">WRECKED</span>`
    }

    this._el.appendChild(entry)

    while (this._el.children.length > MAX_ENTRIES) {
      this._el.removeChild(this._el.firstChild)
    }

    setTimeout(() => { entry.style.opacity = '0' }, FADE_TIME - 500)
    setTimeout(() => { if (entry.parentNode) entry.parentNode.removeChild(entry) }, FADE_TIME)
  }
}
