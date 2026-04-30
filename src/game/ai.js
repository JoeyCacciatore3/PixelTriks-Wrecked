import * as THREE from 'three'

const _aiQ = new THREE.Quaternion()
const _aiFwd = new THREE.Vector3()

// Simple chase-AI. Finds nearest valid target, steers toward it, drives.
// Reverses out of stuck states, fires/boosts when in range, softly biases away
// from arena walls. No ramp-seeking, no random swerve.

const EVADE_HEALTH       = 30
const RAM_DISTANCE       = 12
const FIRE_DISTANCE      = 22
const BOOST_DISTANCE_MIN = 6
const BOOST_DISTANCE_MAX = 18
const BOOST_CHANCE       = 0.08
const STEER_SMOOTH       = 6
const THINK_INTERVAL     = 0.18
const STUCK_SPEED        = 1
const STUCK_TIME         = 0.6
const REVERSE_TIME       = 0.7
const WALL_MARGIN        = 10  // soft-bias zone, not a hard override

const ARENA_HW = 100
const ARENA_HD = 125

const RAMP_SEEK_Y_THRESH = 4
const PLAT_HALF = 45
const RAMP_BASES = [
  { x: 0,  z: -56, targetZ: -45 },
  { x: 0,  z:  56, targetZ:  45 },
  { x: -56, z: 0, targetX: -45 },
  { x:  56, z: 0, targetX:  45 },
]
const FLOOR3_RAMP_BASES = [
  { x: 0, z: -21 },
  { x: 0, z:  21 },
]

const AI_NAMES = ['HAL-9K', 'R.U.S.T', 'DEMOLON', 'WREX-4']

export class AIDriver {
  constructor(car, slotIndex) {
    this.car  = car
    this.name = AI_NAMES[slotIndex % AI_NAMES.length]

    this._input = {
      throttle: false, brake: false,
      steerLeft: false, steerRight: false,
      boostPressed: false, firePressed: false,
      steerAxis: 0, throttleAxis: 0,
      endFrame() { this.boostPressed = false }
    }

    this._target       = null
    this._targetDist   = Infinity
    this._thinkTimer   = Math.random() * THINK_INTERVAL
    this._steerSmooth  = 0
    this._stuckTimer   = 0
    this._reverseTimer = 0
    this._reverseSteer = 0
    this.humansOnly    = false
  }

  update(dt, allCars) {
    if (this.car.eliminated) return

    this._thinkTimer -= dt
    if (this._thinkTimer <= 0) {
      this._thinkTimer = THINK_INTERVAL
      this._think(allCars)
    }

    this._drive(dt)
    this.car.update(dt, this._input)
    this._input.endFrame()
  }

  _think(allCars) {
    let nearest = null, nearestDist = Infinity
    const p = this.car.position
    for (const c of allCars) {
      if (!c || c === this.car || c.eliminated) continue
      if (this.humansOnly && !c.isHuman) continue
      const cp = c.position
      const d = Math.hypot(p.x - cp.x, p.z - cp.z)
      if (d < nearestDist) { nearestDist = d; nearest = c }
    }
    this._target = nearest
    this._targetDist = nearestDist
    this._rampGoal = null

    if (nearest && nearest.position.y - p.y > RAMP_SEEK_Y_THRESH) {
      let ramps = null
      if (p.y < 3) ramps = RAMP_BASES
      else if (p.y > 5 && p.y < 12) ramps = FLOOR3_RAMP_BASES
      if (ramps) {
        let bestRamp = null, bestDist = Infinity
        for (const rb of ramps) {
          const d = Math.hypot(p.x - rb.x, p.z - rb.z)
          if (d < bestDist) { bestDist = d; bestRamp = rb }
        }
        if (bestRamp) this._rampGoal = bestRamp
      }
    }

    this._input.firePressed = nearest != null && nearestDist < FIRE_DISTANCE

    const isRamming = nearest != null && nearestDist < RAM_DISTANCE
    if (isRamming &&
        nearestDist > BOOST_DISTANCE_MIN &&
        nearestDist < BOOST_DISTANCE_MAX &&
        Math.random() < BOOST_CHANCE) {
      this._input.boostPressed = true
    }

    const speed = Math.hypot(this.car.velocity.x, this.car.velocity.z)
    if (speed < STUCK_SPEED) {
      this._stuckTimer += THINK_INTERVAL
      if (this._stuckTimer >= STUCK_TIME && this._reverseTimer <= 0) {
        this._reverseTimer = REVERSE_TIME
        this._reverseSteer = Math.random() < 0.5 ? -1 : 1
        this._stuckTimer = 0
      }
    } else {
      this._stuckTimer = 0
    }
  }

  _drive(dt) {
    const inp = this._input
    inp.throttle = inp.brake = inp.steerLeft = inp.steerRight = false

    if (this._reverseTimer > 0) {
      this._reverseTimer -= dt
      inp.brake = true
      inp.steerAxis = this._reverseSteer
      inp.steerLeft  = inp.steerAxis < 0
      inp.steerRight = inp.steerAxis > 0
      return
    }

    if (!this._target || this._target.eliminated) {
      inp.throttle = true
      return
    }

    const pos = this.car.position
    const tp  = this._target.position

    // Evade: if low HP and target is close, drive directly away
    let goalX = tp.x, goalZ = tp.z
    if (this._rampGoal) {
      goalX = this._rampGoal.x
      goalZ = this._rampGoal.z
    } else if (this.car.health < EVADE_HEALTH && this._targetDist < 18) {
      goalX = pos.x + (pos.x - tp.x)
      goalZ = pos.z + (pos.z - tp.z)
    }

    const dx = goalX - pos.x
    const dz = goalZ - pos.z
    const angleToGoal = Math.atan2(dx, -dz)

    const rot = this.car.rotation
    _aiQ.set(rot.x, rot.y, rot.z, rot.w)
    const fwd = _aiFwd.set(0, 0, -1).applyQuaternion(_aiQ)
    const carAngle = Math.atan2(fwd.x, -fwd.z)

    let da = angleToGoal - carAngle
    while (da >  Math.PI) da -= Math.PI * 2
    while (da < -Math.PI) da += Math.PI * 2

    this._steerSmooth += (da - this._steerSmooth) * Math.min(1, STEER_SMOOTH * dt)
    let steer = THREE.MathUtils.clamp(this._steerSmooth * 4.0, -1, 1)

    // Soft wall avoidance — gently bias steering toward the centre instead of
    // hard-overriding it. Strength scales with how far past the margin we are.
    const overX = Math.abs(pos.x) - (ARENA_HW - WALL_MARGIN)
    if (overX > 0) {
      const bias = Math.min(1, overX / WALL_MARGIN)
      steer = THREE.MathUtils.clamp(steer + (pos.x > 0 ? -bias : bias), -1, 1)
    }
    const overZ = Math.abs(pos.z) - (ARENA_HD - WALL_MARGIN)
    if (overZ > 0) {
      const bias = Math.min(1, overZ / WALL_MARGIN)
      steer = THREE.MathUtils.clamp(steer + (pos.z > 0 ? -bias : bias), -1, 1)
    }

    inp.steerAxis  = steer
    inp.steerLeft  = steer < -0.15
    inp.steerRight = steer >  0.15
    inp.throttle   = true
    if (Math.abs(steer) > 0.6) inp.throttleAxis = 0.7
  }
}
