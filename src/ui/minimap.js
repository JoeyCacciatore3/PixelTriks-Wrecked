import { CAR_COLORS } from '../game/car.js'

// Player-centered radar minimap.
// MAP_SIZE is the canvas size in pixels. MAP_RANGE is the world-space radius (m)
// that fits inside the canvas — anything further than this gets clamped to the rim.
const MAP_SIZE  = 120
const MAP_RANGE = 90
const SCALE     = (MAP_SIZE / 2) / MAP_RANGE
const ARENA_W   = 200
const ARENA_D   = 250

export class Minimap {
  constructor() {

    this._canvas = document.createElement('canvas')
    this._canvas.width = MAP_SIZE
    this._canvas.height = MAP_SIZE
    this._canvas.style.cssText = `
      position:fixed;top:12px;right:calc(12px + env(safe-area-inset-right, 0px));z-index:6;
      width:${MAP_SIZE}px;height:${MAP_SIZE}px;
      border:1px solid rgba(255,255,255,0.18);
      background:rgba(0,0,0,0.55);pointer-events:none;
      border-radius:50%;
      box-shadow:0 0 12px rgba(0,0,0,0.6);
    `
    document.body.appendChild(this._canvas)
    this._ctx = this._canvas.getContext('2d')
  }

  update(derby) {
    if (!this._ctx || !derby) return
    const ctx = this._ctx
    const player = derby.localCar
    const cx = MAP_SIZE / 2, cy = MAP_SIZE / 2
    const radius = MAP_SIZE / 2 - 1

    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

    const px = player ? player.position.x : 0
    const pz = player ? player.position.z : 0

    // Arena bounds, drawn relative to player position
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1
    ctx.strokeRect(
      cx + (-ARENA_W / 2 - px) * SCALE,
      cy + (-ARENA_D / 2 - pz) * SCALE,
      ARENA_W * SCALE,
      ARENA_D * SCALE
    )

    for (const car of derby.cars) {
      if (!car || car === player) continue
      const dx = (car.position.x - px) * SCALE
      const dz = (car.position.z - pz) * SCALE
      const dist = Math.hypot(dx, dz)
      // Clamp off-screen contacts to the rim so you still see direction
      const clamp = dist > radius - 2 ? (radius - 2) / dist : 1
      const sx = cx + dx * clamp
      const sy = cy + dz * clamp

      if (car.eliminated) {
        ctx.fillStyle = 'rgba(80,80,80,0.5)'
        ctx.fillRect(sx - 2, sy - 2, 4, 4)
        continue
      }

      ctx.fillStyle = CAR_COLORS[car.slot % CAR_COLORS.length]
      ctx.beginPath()
      ctx.arc(sx, sy, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Player at canvas center, rotated to match world heading
    if (player) {
      const rot = player.rotation
      const heading = Math.atan2(
        2 * (rot.w * rot.y + rot.x * rot.z),
        1 - 2 * (rot.y * rot.y + rot.z * rot.z)
      )
      ctx.fillStyle = CAR_COLORS[player.slot % CAR_COLORS.length]
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(-heading)
      ctx.beginPath()
      ctx.moveTo(0, -6)
      ctx.lineTo(-4, 4)
      ctx.lineTo(4, 4)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    ctx.restore()
  }

  hide() { if (this._canvas) this._canvas.style.display = 'none' }
  show() { if (this._canvas) this._canvas.style.display = '' }
}
