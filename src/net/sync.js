// SyncManager — broadcasts local car state, interpolates remote car snapshots.
// Host-authoritative: only host computes collision damage and broadcasts results.

const SEND_INTERVAL = 0.05   // 50ms = 20Hz
const INTERP_DELAY  = 100    // ms behind real-time for smooth interpolation
const SNAP_BUF_SIZE = 6      // keep last 6 snapshots per remote car

export class SyncManager {
  constructor(room, derby) {
    this.room  = room
    this.derby = derby
    this._sendTimer = 0
    this._snapBuf = {}  // slot → [{ t, pos, rot, vel, hp }, ...]

    window.addEventListener('room:msg', (e) => {
      const { type, payload, from } = e.detail
      if (type === 'move')           this._onMove(payload, from)
      if (type === 'damage')         this._onDamage(payload)
      if (type === 'barrel_explode') this._onBarrelExplode(payload)
    })
  }

  update(dt) {
    this._sendTimer -= dt
    if (this._sendTimer <= 0) {
      this._sendTimer = SEND_INTERVAL
      this._sendLocalState()
    }

    this._interpolateRemoteCars()
  }

  _sendLocalState() {
    const car = this.derby.localCar
    if (!car || car.eliminated) return

    const pos = car.position
    const rot = car.rotation
    const vel = car.velocity

    const payload = {
      slot: this.room.mySlot,
      pos:  { x: pos.x, y: pos.y, z: pos.z },
      rot:  { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
      vel:  { x: vel.x, y: vel.y, z: vel.z },
      hp:   car.health
    }
    if (this.room.isHost) payload.tr = this.derby.timeRemaining
    this.room.broadcast('move', payload)
  }

  _onMove(data, from) {
    const { slot, pos, rot, vel, hp, tr } = data
    if (slot === this.room.mySlot) return
    if (tr !== undefined) this.derby._timeRemaining = tr

    if (!this._snapBuf[slot]) this._snapBuf[slot] = []
    const buf = this._snapBuf[slot]
    buf.push({ t: performance.now(), pos, rot, vel, hp })
    if (buf.length > SNAP_BUF_SIZE) buf.shift()
  }

  _interpolateRemoteCars() {
    const renderTime = performance.now() - INTERP_DELAY

    for (const [slotStr, buf] of Object.entries(this._snapBuf)) {
      const slot = Number(slotStr)
      if (slot === this.room.mySlot) continue
      const car = this.derby.cars[slot]
      if (!car || car.eliminated || buf.length < 2) continue

      let i0 = 0, i1 = 1
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].t <= renderTime && buf[i + 1].t >= renderTime) {
          i0 = i
          i1 = i + 1
          break
        }
      }

      // If renderTime is past all snapshots, use the two most recent
      if (renderTime > buf[buf.length - 1].t) {
        i0 = buf.length - 2
        i1 = buf.length - 1
      }

      const s0 = buf[i0], s1 = buf[i1]
      const span = s1.t - s0.t
      const alpha = span > 0 ? Math.max(0, Math.min(1, (renderTime - s0.t) / span)) : 1

      const pos = {
        x: s0.pos.x + (s1.pos.x - s0.pos.x) * alpha,
        y: s0.pos.y + (s1.pos.y - s0.pos.y) * alpha,
        z: s0.pos.z + (s1.pos.z - s0.pos.z) * alpha
      }

      // Slerp quaternion
      const rot = this._slerpQuat(s0.rot, s1.rot, alpha)

      const vel = {
        x: s0.vel.x + (s1.vel.x - s0.vel.x) * alpha,
        y: s0.vel.y + (s1.vel.y - s0.vel.y) * alpha,
        z: s0.vel.z + (s1.vel.z - s0.vel.z) * alpha
      }

      car.updateRemote(pos, rot, vel)

      // Health reconciliation — host's value is canonical
      const hp = s1.hp
      if (hp !== undefined && Math.abs(car.health - hp) > 5) {
        car.health = hp
      }
    }
  }

  _slerpQuat(a, b, t) {
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
    let bx = b.x, by = b.y, bz = b.z, bw = b.w
    if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw }

    if (dot > 0.9995) {
      const rx = a.x + (bx - a.x) * t
      const ry = a.y + (by - a.y) * t
      const rz = a.z + (bz - a.z) * t
      const rw = a.w + (bw - a.w) * t
      const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw) || 1
      return { x: rx / len, y: ry / len, z: rz / len, w: rw / len }
    }

    const theta = Math.acos(dot)
    const sinTheta = Math.sin(theta)
    const w0 = Math.sin((1 - t) * theta) / sinTheta
    const w1 = Math.sin(t * theta) / sinTheta
    return {
      x: a.x * w0 + bx * w1,
      y: a.y * w0 + by * w1,
      z: a.z * w0 + bz * w1,
      w: a.w * w0 + bw * w1
    }
  }

  _onDamage(data) {
    const { slot, amount, attackerSlot } = data
    if (slot === this.room.mySlot) return
    const car = this.derby.cars[slot]
    if (car) car.applyDamage(amount, attackerSlot)
  }

  broadcastDamage(slot, amount, attackerSlot) {
    this.room.broadcast('damage', { slot, amount, attackerSlot })
  }

  broadcastBarrelExplode(barrelIdx, pos, radius, damage, attackerSlot) {
    this.room.broadcast('barrel_explode', { barrelIdx, pos, radius, damage, attackerSlot })
  }

  _onBarrelExplode(data) {
    const { barrelIdx, pos, radius, damage, attackerSlot } = data
    window.dispatchEvent(new CustomEvent('barrel:explode', {
      detail: { pos, radius, damage, attackerSlot }
    }))
    const obstacles = this.derby._obstacles
    if (obstacles) {
      const barrel = obstacles._barrels[barrelIdx]
      if (barrel && barrel.alive) {
        obstacles._hideBarrel(barrel)
        setTimeout(() => {
          if (!barrel.alive) obstacles._respawnBarrel(barrel)
        }, 10000)
      }
    }
  }
}
