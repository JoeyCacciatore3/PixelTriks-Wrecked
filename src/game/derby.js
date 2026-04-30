import * as THREE from 'three'
import { Car, MAX_HEALTH, BULLET_DAMAGE } from './car.js'
import { AIDriver } from './ai.js'
import { SPAWN_POINTS, ARENA_W, ARENA_D } from './arena.js'
import { heartTexture } from './textures.js'

const _collQ = new THREE.Quaternion()
const _collFwd = new THREE.Vector3()

export const DerbyState = {
  LOBBY:      'LOBBY',
  COUNTDOWN:  'COUNTDOWN',
  PLAYING:    'PLAYING',
  FINISHED:   'FINISHED'
}

const MATCH_COUNTDOWN = 3
const CRASH_RADIUS    = 2.8
const MIN_CRASH_SPEED = 2.5
const DAMAGE_SCALE    = 2.0

const MAX_AI_ALIVE    = 8
const AI_SPAWN_INTERVAL = 15
const INITIAL_AI_COUNT  = 3
const AI_DAMAGE_OUT = 0.15
const AI_DAMAGE_IN  = 2.0

const HEAL_AMOUNT = MAX_HEALTH * 0.25
const PICKUP_RADIUS = 3.0
const PICKUP_RESPAWN = 5.0
const GROUND_PICKUP_COUNT = 2
const FLOOR3_Y = 15.4

export class DerbyGame {
  constructor(scene, physics) {
    this.scene   = scene
    this.physics = physics

    this.state      = DerbyState.LOBBY
    this.cars       = []
    this.drivers    = []
    this._localSlots = new Set()
    this._humanSlots = new Set()
    this._aiSlots    = new Set()
    this._countdown  = Infinity
    this._initialAISpawned = false
    this._matchTimer = 0
    this._winner     = null
    this._elapsed    = 0
    this._allCarsCache = []
    this._sync = null
    this._isHost = true
    this._obstacles = null

    this._aiSpawnTimer = 0
    this._aiTotalKilled = 0
    this.playerStats = {}
    this._lastAttacker = {}
    this._pickups = []
    this._pickupTime = 0

    this.onStateChange = null
    this.onCountdown   = null

    window.addEventListener('car:hit', (e) => {
      const { slot, damage, attackerSlot } = e.detail
      if (attackerSlot !== undefined && attackerSlot !== slot) {
        this._lastAttacker[slot] = attackerSlot
      }
      this._ensureStats(slot)
      this.playerStats[slot].damageTaken += damage

      const actualAttacker = this._lastAttacker[slot]
      if (actualAttacker !== undefined && actualAttacker !== slot) {
        this._ensureStats(actualAttacker)
        this.playerStats[actualAttacker].damageDealt += damage
      }
    })

    window.addEventListener('car:eliminated', (e) => {
      const slot = e.detail.slot
      if (this._aiSlots.has(slot)) this._aiTotalKilled++

      const attackerSlot = this._lastAttacker[slot]
      if (attackerSlot !== undefined && attackerSlot !== slot) {
        this._ensureStats(attackerSlot)
        this.playerStats[attackerSlot].kills++
      }

      this._rebuildCarCaches()
    })
    window.addEventListener('barrel:explode', (e) => {
      if (this._isHost) {
        this._applyExplosion(e.detail)
        if (this._sync) {
          const d = e.detail
          this._sync.broadcastBarrelExplode(d.barrelIdx, d.pos, d.radius, d.damage, d.attackerSlot)
        }
      }
    })
  }

  _ensureStats(slot) {
    if (!this.playerStats[slot]) {
      this.playerStats[slot] = { kills: 0, damageDealt: 0, damageTaken: 0 }
    }
  }

  setSyncManager(sync, isHost) {
    this._sync = sync
    this._isHost = isHost
  }

  setObstacles(obstacles) {
    this._obstacles = obstacles
  }

  addLocalPlayer(slotIndex) {
    this._localSlots.add(slotIndex)
    this._humanSlots.add(slotIndex)
    const car = this._ensureCar(slotIndex, true)
    car.isHuman = true
    if (SPAWN_POINTS[slotIndex]) car.spawnAt(SPAWN_POINTS[slotIndex], 0)
  }

  addRemotePlayer(slotIndex) {
    this._humanSlots.add(slotIndex)
    const car = this._ensureCar(slotIndex, false)
    car.isHuman = true
    if (SPAWN_POINTS[slotIndex]) car.spawnAt(SPAWN_POINTS[slotIndex], 0)
  }

  addAI(slotIndex) {
    const car = this._ensureCar(slotIndex, false)
    const driver = new AIDriver(car, slotIndex)
    driver.humansOnly = true
    this.drivers[slotIndex] = driver
    this._aiSlots.add(slotIndex)
    return car
  }

  _ensureCar(slotIndex, isLocal) {
    if (this.cars[slotIndex]) return this.cars[slotIndex]
    const car = new Car(this.scene, this.physics, slotIndex, isLocal)
    this.cars[slotIndex] = car
    this._rebuildCarCaches()
    return car
  }

  _allocateSlot() {
    for (let i = 4; i < 4 + MAX_AI_ALIVE + 4; i++) {
      if (!this.cars[i] || this.cars[i].eliminated) return i
    }
    return -1
  }

  startLobby() {
    this._setState(DerbyState.LOBBY)
    this._countdown = 20
  }

  beginMatchCountdown() {
    this._setState(DerbyState.COUNTDOWN)
    this._matchTimer = MATCH_COUNTDOWN
  }

  spawnInitialAI() {
    if (this._initialAISpawned) return
    this._initialAISpawned = true
    for (let i = 0; i < INITIAL_AI_COUNT; i++) {
      this._spawnHordeAI()
    }
  }

  _spawnHordeAI() {
    const aliveAI = this._countAliveAI()
    if (aliveAI >= MAX_AI_ALIVE) return

    const slot = this._allocateSlot()
    if (slot < 0) return

    if (this.cars[slot]) {
      this.cars[slot].dispose()
      this.cars[slot] = null
      this.drivers[slot] = null
      this._aiSlots.delete(slot)
    }

    const car = this.addAI(slot)
    const angle = Math.random() * Math.PI * 2
    const spawnX = (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 40)
    const spawnZ = (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 50)
    car.spawnAt({ x: spawnX, y: 0.7, z: spawnZ }, angle)
  }

  _countAliveAI() {
    let count = 0
    for (const slot of this._aiSlots) {
      const car = this.cars[slot]
      if (car && !car.eliminated) count++
    }
    return count
  }

  _startPlaying() {
    this._elapsed = 0
    this._aiSpawnTimer = AI_SPAWN_INTERVAL
    this._initPickups()
    this._setState(DerbyState.PLAYING)
    window.dispatchEvent(new CustomEvent('derby:start'))
  }

  _setState(s) {
    this.state = s
    if (this.onStateChange) this.onStateChange(s)
  }

  update(dt, localInput) {
    this._elapsed += dt

    if (this.state === DerbyState.LOBBY) {
      if (Number.isFinite(this._countdown)) {
        this._countdown -= dt
        if (this.onCountdown) this.onCountdown(Math.ceil(this._countdown))
        if (this._countdown <= 0) {
          this.spawnInitialAI()
          this.beginMatchCountdown()
        }
      }
      return
    }

    if (this.state === DerbyState.COUNTDOWN) {
      this._matchTimer -= dt
      if (this.onCountdown) this.onCountdown(Math.ceil(this._matchTimer))
      this._syncAllMeshes(dt)
      if (this._matchTimer <= 0) this._startPlaying()
      return
    }

    if (this.state !== DerbyState.PLAYING) return

    for (const slot of this._localSlots) {
      const car = this.cars[slot]
      if (car && !car.eliminated) car.update(dt, localInput)
    }

    for (const driver of this.drivers) {
      if (driver) driver.update(dt, this.cars)
    }

    if (this._isHost) {
      for (const car of this.cars) {
        if (!car || car.eliminated) continue
        const p = car.position
        if (p.y < -5 || p.y > 50 || Math.abs(p.x) > 125 || Math.abs(p.z) > 150) {
          car.applyDamage(car.health)
          if (this._sync) this._sync.broadcastDamage(car.slot, car.health)
        }
      }
      this._checkCarCollisions()
      this._checkBulletHits()
      this._updatePickups(dt)

      this._aiSpawnTimer -= dt
      if (this._aiSpawnTimer <= 0) {
        this._aiSpawnTimer = AI_SPAWN_INTERVAL
        this._spawnHordeAI()
      }
    }

    if (this._elapsed > 3) {
      let humansAlive = false
      for (const slot of this._humanSlots) {
        const car = this.cars[slot]
        if (car && !car.eliminated) { humansAlive = true; break }
      }
      if (!humansAlive) {
        this._winner = -1
        this._disposePickups()
        this._setState(DerbyState.FINISHED)
        window.dispatchEvent(new CustomEvent('derby:winner', { detail: { slot: -1 } }))
      }
    }
  }

  _isHumanSlot(slot) {
    return this._humanSlots.has(slot)
  }

  _checkCarCollisions() {
    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i]
      if (!a || a.eliminated) continue
      for (let j = i + 1; j < this.cars.length; j++) {
        const b = this.cars[j]
        if (!b || b.eliminated) continue

        const aHuman = this._isHumanSlot(i)
        const bHuman = this._isHumanSlot(j)
        if (aHuman && bHuman) continue
        if (!aHuman && !bHuman) continue

        const ap = a.position; const bp = b.position
        const dx = bp.x - ap.x; const dz = bp.z - ap.z
        const dist = Math.hypot(dx, dz)
        if (dist > CRASH_RADIUS) continue

        const av = a.velocity; const bv = b.velocity
        const nx = dx / dist; const nz = dz / dist
        const relVel = (bv.x - av.x) * nx + (bv.z - av.z) * nz
        if (relVel > -MIN_CRASH_SPEED) continue

        const impactSpeed = Math.abs(relVel)
        const damage = (impactSpeed - MIN_CRASH_SPEED) * DAMAGE_SCALE
        if (damage < 1) continue

        const ar = a.rotation
        _collQ.set(ar.x, ar.y, ar.z, ar.w)
        const aFwd = _collFwd.set(0, 0, -1).applyQuaternion(_collQ)
        const aDot = aFwd.x * nx + aFwd.z * nz
        const br = b.rotation
        _collQ.set(br.x, br.y, br.z, br.w)
        const bFwd = _collFwd.set(0, 0, -1).applyQuaternion(_collQ)
        const bDot = -(bFwd.x * nx + bFwd.z * nz)
        const aIsAttacker = aDot > bDot
        let aDmg = damage * (aIsAttacker ? 0.4 : 1.5)
        let bDmg = damage * (aIsAttacker ? 1.5 : 0.4)
        // Human-vs-AI collision (only case that reaches here — human/human and AI/AI
        // are filtered above). Damage AI deal is dampened, damage they take is amplified.
        if (aHuman) { aDmg *= AI_DAMAGE_OUT; bDmg *= AI_DAMAGE_IN }
        else        { bDmg *= AI_DAMAGE_OUT; aDmg *= AI_DAMAGE_IN }
        a.applyDamage(aDmg, aIsAttacker ? undefined : b.slot)
        b.applyDamage(bDmg, aIsAttacker ? a.slot : undefined)
        if (this._sync) {
          this._sync.broadcastDamage(a.slot, aDmg)
          this._sync.broadcastDamage(b.slot, bDmg)
        }
      }
    }

    if (this._obstacles) {
      for (const car of this.cars) {
        if (!car || car.eliminated) continue
        const cp = car.position
        for (const barrel of this._obstacles._barrels) {
          if (!barrel.alive) continue
          const bp = barrel.body.translation()
          const d = Math.hypot(cp.x - bp.x, cp.z - bp.z)
          if (d < 2.5) {
            this._obstacles.damageBarrel(barrel, car.slot)
          }
        }
      }
    }
  }

  _applyExplosion({ pos, radius, damage, attackerSlot }) {
    for (const target of this.cars) {
      if (!target || target.eliminated) continue
      const tp = target.position
      const d = Math.hypot(pos.x - tp.x, pos.y - tp.y, pos.z - tp.z)
      if (d >= radius) continue
      let dmg = damage * (1 - d / radius)
      const attackerIsHuman = attackerSlot != null && this._isHumanSlot(attackerSlot)
      if (!attackerIsHuman)              dmg *= AI_DAMAGE_OUT
      if (!this._isHumanSlot(target.slot)) dmg *= AI_DAMAGE_IN
      target.applyDamage(dmg, attackerSlot)
      if (this._sync) this._sync.broadcastDamage(target.slot, dmg, attackerSlot)
      const kx = tp.x - pos.x, kz = tp.z - pos.z
      const len = Math.hypot(kx, kz) || 1
      target._body.applyImpulse({ x: (kx / len) * 15, y: 8, z: (kz / len) * 15 }, true)
    }
  }

  _checkBulletHits() {
    const BULLET_HIT_RADIUS_CAR = 1.8
    const BULLET_HIT_RADIUS_BARREL = 2.0

    for (const car of this.cars) {
      if (!car) continue
      const shooterIsHuman = this._isHumanSlot(car.slot)
      for (let bi = 0; bi < car._bullets.length; bi++) {
        const b = car._bullets[bi]
        if (!b.alive) continue

        for (const target of this.cars) {
          if (!target || target.eliminated || target === car) continue
          const targetIsHuman = this._isHumanSlot(target.slot)
          if (shooterIsHuman && targetIsHuman) continue
          if (!shooterIsHuman && !targetIsHuman) continue

          const tp = target.position
          const d = Math.hypot(b.x - tp.x, b.y - tp.y, b.z - tp.z)
          if (d < BULLET_HIT_RADIUS_CAR) {
            car.killBullet(bi)
            let dmg = BULLET_DAMAGE
            if (!shooterIsHuman) dmg *= AI_DAMAGE_OUT
            if (!targetIsHuman)  dmg *= AI_DAMAGE_IN
            target.applyDamage(dmg, car.slot)
            if (this._sync) this._sync.broadcastDamage(target.slot, dmg, car.slot)
            break
          }
        }

        if (!b.alive || !this._obstacles) continue
        for (const barrel of this._obstacles.barrels) {
          if (!barrel.alive) continue
          const bp = barrel.body.translation()
          const d = Math.hypot(b.x - bp.x, b.y - bp.y, b.z - bp.z)
          if (d < BULLET_HIT_RADIUS_BARREL) {
            car.killBullet(bi)
            this._obstacles.damageBarrel(barrel, car.slot)
            break
          }
        }
      }
    }
  }

  _syncAllMeshes(dt) {
    for (const car of this.cars) {
      if (!car || car.eliminated) continue
      car.update(dt, null)
    }
  }

  _rebuildCarCaches() {
    this._allCarsCache.length = 0
    for (const c of this.cars) {
      if (c) this._allCarsCache.push(c)
    }
  }

  _initPickups() {
    if (this._pickups.length) return
    const tex = heartTexture()
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })

    const hw = ARENA_W / 2 - 20
    const hd = ARENA_D / 2 - 20
    const positions = [
      { x: 0, y: FLOOR3_Y, z: 0 },
    ]
    for (let i = 0; i < GROUND_PICKUP_COUNT; i++) {
      positions.push({
        x: (Math.random() * 2 - 1) * hw,
        y: 1.5,
        z: (Math.random() * 2 - 1) * hd,
      })
    }

    for (const pos of positions) {
      const sprite = new THREE.Sprite(mat.clone())
      sprite.scale.set(3, 3, 1)
      sprite.position.set(pos.x, pos.y, pos.z)
      this.scene.add(sprite)
      this._pickups.push({ sprite, baseY: pos.y, cooldown: 0, active: true })
    }
  }

  _updatePickups(dt) {
    this._pickupTime += dt
    for (const p of this._pickups) {
      if (!p.active) {
        p.cooldown -= dt
        if (p.cooldown <= 0) {
          p.active = true
          p.sprite.visible = true
        }
        continue
      }
      p.sprite.position.y = p.baseY + Math.sin(this._pickupTime * 2.5) * 0.4
      p.sprite.material.rotation = Math.sin(this._pickupTime * 1.5) * 0.15

      for (const car of this.cars) {
        if (!car || car.eliminated || car.health >= MAX_HEALTH) continue
        const dx = car.position.x - p.sprite.position.x
        const dy = car.position.y - p.sprite.position.y
        const dz = car.position.z - p.sprite.position.z
        if (dx * dx + dy * dy + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
          car.health = Math.min(MAX_HEALTH, car.health + HEAL_AMOUNT)
          window.dispatchEvent(new CustomEvent('car:hit', {
            detail: { slot: car.slot, health: car.health, damage: -HEAL_AMOUNT, pos: car.position }
          }))
          p.active = false
          p.sprite.visible = false
          p.cooldown = PICKUP_RESPAWN
          break
        }
      }
    }
  }

  _disposePickups() {
    for (const p of this._pickups) {
      this.scene.remove(p.sprite)
      p.sprite.material.dispose()
    }
    this._pickups = []
  }

  get localCar() {
    for (const slot of this._localSlots) {
      const car = this.cars[slot]
      if (car && !car.eliminated) return car
    }
    return null
  }
  get allCars()   { return this._allCarsCache }
  get winner()    { return this._winner }
  get aiKills()   { return this._aiTotalKilled }
}
