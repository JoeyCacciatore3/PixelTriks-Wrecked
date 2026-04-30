import * as THREE from 'three';
import { carBodyTexture, bulletTexture } from './textures.js';
import { isMobile } from '../util/detect.js';

export const CAR_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#eab308'];
export const CAR_NAMES  = ['P1', 'P2', 'P3', 'P4'];

export const MAX_HEALTH = 500;

const ENGINE_FORCE     = 55
const STEER_TORQUE     = 18
const BOOST_FORCE      = 220
const BOOST_DURATION   = 0.6
const BOOST_COOLDOWN   = 3.0
const BOOST_MAX_SPEED  = 38
const GROUND_RAY_DIST  = 0.55
const LEVEL_TORQUE     = 12
const LEVEL_SLOPE_MAX  = 0.52
const SELF_RIGHT_TORQUE = 25
const SELF_RIGHT_THRESHOLD = 0.7

const BULLET_SPEED     = 60
const BULLET_LIFETIME  = 1.5
const FIRE_RATE        = 0.2
const BULLET_POOL_SIZE = 20
export const BULLET_DAMAGE    = 20
export const SUPER_BULLET_DAMAGE = 120
export const SUPER_EXPLODE_RADIUS = 24
const MAX_AMMO         = 6
const AMMO_REGEN       = 1.0

const _tmpQ = new THREE.Quaternion()
const _tmpV = new THREE.Vector3()
const _tmpV2 = new THREE.Vector3()
const _tmpV3 = new THREE.Vector3()
const _bulletM4 = new THREE.Matrix4()
const _bulletScale = new THREE.Vector3(1, 1, 1)
const _superBulletScale = new THREE.Vector3(4, 4, 4)
const _hideM4 = new THREE.Matrix4().makeScale(0, 0, 0)

let _sharedCamera = null
export function setCarCamera(cam) { _sharedCamera = cam }

const _shared = {
  bodyGeom: null, cabinGeom: null, bumperGeom: null,
  hlGeom: null, tlGeom: null, wheelGeom: null, tireGeom: null, glowGeom: null,
  hlMat: null, tlMat: null, wheelMat: null, tireMat: null,
  bulletGeom: null, bulletMat: null,
  refCount: 0,
}

function _initShared() {
  if (_shared.refCount++ > 0) return
  _shared.bodyGeom = new THREE.BoxGeometry(1.3, 0.68, 2.2)
  _shared.cabinGeom = new THREE.BoxGeometry(0.96, 0.46, 1.05)
  _shared.bumperGeom = new THREE.BoxGeometry(1.42, 0.38, 0.18)
  _shared.hlGeom = new THREE.BoxGeometry(0.26, 0.14, 0.06)
  _shared.tlGeom = new THREE.BoxGeometry(0.24, 0.12, 0.06)
  _shared.wheelGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12)
  _shared.tireGeom = new THREE.TorusGeometry(0.28, 0.1, 8, 12)
  _shared.glowGeom = new THREE.PlaneGeometry(1.1, 2.0)
  _shared.hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  _shared.tlMat = new THREE.MeshBasicMaterial({ color: 0xff2200 })
  _shared.wheelMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.4, metalness: 0.5 })
  _shared.tireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
  _shared.bulletGeom = new THREE.PlaneGeometry(1.2, 1.2)
  _shared.bulletMat = new THREE.MeshBasicMaterial({ map: bulletTexture(), transparent: true, depthWrite: false })
}

function _releaseShared() {
  if (--_shared.refCount > 0) return
  for (const key of Object.keys(_shared)) {
    if (key === 'refCount') continue
    const v = _shared[key]
    if (v && typeof v.dispose === 'function') v.dispose()
    _shared[key] = null
  }
  _shared.refCount = 0
}

const _skidDetail = { left: { x: 0, y: 0.02, z: 0 }, right: { x: 0, y: 0.02, z: 0 }, angle: 0 }
const _skidEvent = new CustomEvent('car:skid', { detail: _skidDetail })

export class Car {
  constructor(scene, physics, slotIndex, isLocal = false) {
    this.scene     = scene;
    this.physics   = physics;
    this.slot      = slotIndex;
    this.isLocal   = isLocal;
    this._isHuman  = false;
    this.color     = CAR_COLORS[slotIndex % CAR_COLORS.length];

    this.health       = MAX_HEALTH;
    this.eliminated   = false;
    this._grounded    = false
    this._wasGrounded  = false
    this._squashTimer  = 0
    this._fireCooldown = 0
    this._ammo         = MAX_AMMO
    this._hitFlash     = 0
    this._spawnShield  = 0
    this._boostTimer   = 0
    this._boostCooldown = 0
    this.superShots    = 0

    this._body    = null;
    this._collider = null;
    this._group   = null;
    this._wheels  = [];
    this._glowMat = null;
    this._bullets = [];
    this._bulletMesh = null;
    this.activeBullets = 0;

    this.displayName = CAR_NAMES[this.slot % CAR_NAMES.length]

    this._buildMesh();
    this._buildPhysics({ x: 0, y: 1.12, z: 0 });
    this._buildBulletPool();
  }

  get name() {
    return this.displayName;
  }

  get isHuman() { return this._isHuman; }
  set isHuman(val) {
    this._isHuman = val;
    const isAI = !val
    const tex = carBodyTexture(this.color, isAI)
    if (this._bodyMat) {
      this._bodyMat.map = tex
      this._bodyMat.needsUpdate = true
    }
    if (this._cabinMat) {
      this._cabinMat.map = isAI ? tex : null
      this._cabinMat.color.set(isAI ? 0xffffff : 0x334155)
      this._cabinMat.needsUpdate = true
    }
    if (this._bumperMat) {
      this._bumperMat.map = isAI ? tex : null
      this._bumperMat.color.set(isAI ? 0xffffff : 0x475569)
      this._bumperMat.needsUpdate = true
    }
  }

  _buildMesh() {
    _initShared()
    this._group = new THREE.Group()
    const colorHex = parseInt(this.color.replace('#', ''), 16)

    this._bodyMat = new THREE.MeshStandardMaterial({
      map: carBodyTexture(this.color, !this._isHuman), color: 0xffffff,
      roughness: 0.3, metalness: 0.1
    })
    const body = new THREE.Mesh(_shared.bodyGeom, this._bodyMat)
    body.position.y = 0.1
    body.castShadow = !isMobile
    this._group.add(body)
    this._bodyMesh = body

    const aiTex = !this._isHuman ? carBodyTexture(this.color, true) : null
    this._cabinMat = new THREE.MeshStandardMaterial({
      color: aiTex ? 0xffffff : 0x334155, roughness: 0.5, metalness: 0.1,
      map: aiTex || null
    })
    const cabin = new THREE.Mesh(_shared.cabinGeom, this._cabinMat)
    cabin.position.set(0, 0.57, -0.12)
    cabin.castShadow = !isMobile
    this._group.add(cabin)

    this._bumperMat = new THREE.MeshStandardMaterial({
      color: aiTex ? 0xffffff : 0x475569, roughness: 0.7, metalness: 0.6,
      emissive: new THREE.Color(this.color), emissiveIntensity: 0,
      map: aiTex || null
    })
    const frontBumper = new THREE.Mesh(_shared.bumperGeom, this._bumperMat)
    frontBumper.position.set(0, -0.04, -1.17)
    this._group.add(frontBumper)
    const rearBumper = new THREE.Mesh(_shared.bumperGeom, this._bumperMat)
    rearBumper.position.set(0, -0.04, 1.17)
    this._group.add(rearBumper)

    ;[-0.43, 0.43].forEach(x => {
      const hl = new THREE.Mesh(_shared.hlGeom, _shared.hlMat)
      hl.position.set(x, 0.06, -1.14)
      this._group.add(hl)
    })

    ;[-0.42, 0.42].forEach(x => {
      const tl = new THREE.Mesh(_shared.tlGeom, _shared.tlMat)
      tl.position.set(x, 0.06, 1.14)
      this._group.add(tl)
    })

    const wPositions = [[-0.79, -0.27, -0.72], [0.79, -0.27, -0.72], [-0.79, -0.27, 0.72], [0.79, -0.27, 0.72]]
    this._wheels = wPositions.map(([x, y, z]) => {
      const wg = new THREE.Group()
      const w = new THREE.Mesh(_shared.wheelGeom, _shared.wheelMat)
      w.rotation.z = Math.PI / 2
      wg.add(w)
      const tire = new THREE.Mesh(_shared.tireGeom, _shared.tireMat)
      tire.rotation.y = Math.PI / 2
      wg.add(tire)
      wg.position.set(x, y, z)
      this._group.add(wg)
      return wg
    })

    this._glowMat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide
    })
    const glow = new THREE.Mesh(_shared.glowGeom, this._glowMat)
    glow.rotation.x = Math.PI / 2
    glow.position.y = -0.44
    this._group.add(glow)

    this._group.scale.set(1.25, 1.25, 1.25)
    this.scene.add(this._group)
  }

  _buildBulletPool() {
    this._bulletMesh = new THREE.InstancedMesh(_shared.bulletGeom, _shared.bulletMat, BULLET_POOL_SIZE)
    this._bulletMesh.frustumCulled = false
    const hide = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < BULLET_POOL_SIZE; i++) {
      this._bulletMesh.setMatrixAt(i, hide)
      this._bullets.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, isSuper: false })
    }
    this._bulletMesh.instanceMatrix.needsUpdate = true
    this.scene.add(this._bulletMesh)
  }

  _buildPhysics(position) {
    const { body, collider } = this.physics.createBoxBody({
      position, hw: 0.65, hh: 0.38, hd: 1.1,
      linearDamping: 0.6, angularDamping: isMobile ? 4.5 : 3.5
    });
    this._body     = body;
    this._collider = collider;
  }

  get position() { return this._body.translation(); }
  get rotation() { return this._body.rotation(); }
  get velocity() { return this._body.linvel(); }
  get speed()    { const v = this.velocity; return Math.hypot(v.x, v.y, v.z); }
  get boostCooldown() { return this._boostCooldown }

  spawnAt(pos, angle = 0, shieldTime = 0) {
    this._body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    _tmpQ.setFromAxisAngle(_tmpV.set(0, 1, 0), angle);
    this._body.setRotation({ x: _tmpQ.x, y: _tmpQ.y, z: _tmpQ.z, w: _tmpQ.w }, true);
    this._body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this._body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this._spawnShield = shieldTime
  }

  update(dt, input = null) {
    if (this.eliminated) return

    const pos = this._body.translation()
    const rot = this._body.rotation()
    const vel = this._body.linvel()
    _tmpQ.set(rot.x, rot.y, rot.z, rot.w)

    this._updateGroundCheck(pos, dt)
    this._applySelfRighting(dt)
    if (input) this._applyInput(dt, input, vel)
    this._updateWheels(vel, dt)
    this._updateSkidMarks(pos, vel, input, dt)
    this._syncMesh(pos, rot, dt)
    this._updateBullets(dt)
  }

  // Called every tick for remote cars — just sync mesh from received state
  updateRemote(pos, rotQ, vel) {
    if (this.eliminated) return;
    this._group.position.set(pos.x, pos.y + 0.18, pos.z);
    this._group.quaternion.set(rotQ.x, rotQ.y, rotQ.z, rotQ.w);
    this._body.setTranslation(pos, true);
    this._body.setRotation(rotQ, true);
    this._body.setLinvel(vel, true);
  }

  _updateGroundCheck(pos, dt) {
    const hit = this.physics.raycast(
      { x: pos.x, y: pos.y, z: pos.z },
      { x: 0, y: -1, z: 0 },
      GROUND_RAY_DIST
    )
    this._grounded = !!hit
    if (!this._grounded || !hit.normal) return

    const slopeAngle = Math.acos(Math.min(1, hit.normal.y))
    if (slopeAngle > LEVEL_SLOPE_MAX) return

    const carUp = _tmpV.set(0, 1, 0).applyQuaternion(_tmpQ)
    const surfaceNormal = _tmpV3.set(hit.normal.x, hit.normal.y, hit.normal.z)
    const correction = _tmpV2.crossVectors(carUp, surfaceNormal)
    this._body.applyTorqueImpulse({
      x: correction.x * LEVEL_TORQUE * dt,
      y: 0,
      z: correction.z * LEVEL_TORQUE * dt
    }, true)
  }

  _applySelfRighting(dt) {
    const carUp = _tmpV.set(0, 1, 0).applyQuaternion(_tmpQ)
    const upDot = carUp.y
    if (upDot > SELF_RIGHT_THRESHOLD) return
    const worldUp = _tmpV3.set(0, 1, 0)
    const correction = _tmpV2.crossVectors(carUp, worldUp)
    const strength = SELF_RIGHT_TORQUE * (1 - upDot)
    this._body.applyTorqueImpulse({
      x: correction.x * strength * dt,
      y: 0,
      z: correction.z * strength * dt
    }, true)
  }

  _updateWheels(vel, dt) {
    const groundSpeed = Math.hypot(vel.x, vel.z)
    const spin = groundSpeed * dt * 2.8
    const dir = vel.z < 0 ? -1 : 1
    for (let i = 0; i < this._wheels.length; i++) {
      this._wheels[i].children[0].rotation.x += (i < 2 ? -spin : spin) * dir
    }
  }

  _updateSkidMarks(pos, vel, input, dt) {
    const justLanded = this._grounded && !this._wasGrounded
    if (justLanded && Math.abs(vel.y) > 2) {
      window.dispatchEvent(new CustomEvent('car:land', {
        detail: { pos: { x: pos.x, y: pos.y, z: pos.z }, fallSpeed: Math.abs(vel.y), slot: this.slot }
      }))
      this._squashTimer = 0.1
    }
    if (this._grounded && input && (Math.abs(input.steerAxis) > 0.7 || justLanded)) {
      const back = _tmpV2.set(0, 0, 1).applyQuaternion(_tmpQ)
      const right = _tmpV3.set(1, 0, 0).applyQuaternion(_tmpQ)
      _skidDetail.left.x = pos.x - right.x * 0.7 + back.x * 0.7
      _skidDetail.left.z = pos.z - right.z * 0.7 + back.z * 0.7
      _skidDetail.right.x = pos.x + right.x * 0.7 + back.x * 0.7
      _skidDetail.right.z = pos.z + right.z * 0.7 + back.z * 0.7
      _skidDetail.angle = Math.atan2(back.x, back.z)
      window.dispatchEvent(_skidEvent)
    }
    this._wasGrounded = this._grounded
  }

  _syncMesh(pos, rot, dt) {
    this._group.position.set(pos.x, pos.y + 0.18, pos.z)
    this._group.quaternion.set(rot.x, rot.y, rot.z, rot.w)

    if (this._squashTimer > 0) {
      this._squashTimer -= dt
      this._group.scale.y = this._squashTimer > 0 ? 1.25 * 0.85 : 1.25
    }


    if (this._spawnShield > 0) this._spawnShield -= dt
    if (this._hitFlash > 0) {
      this._hitFlash = Math.max(0, this._hitFlash - dt * 5)
      if (this._bodyMat) this._bodyMat.emissiveIntensity = 0.12 + this._hitFlash * 0.88
      if (this._bumperMat) this._bumperMat.emissiveIntensity = 0.55 + this._hitFlash * 0.45
    }
  }

  _applyInput(dt, input, vel) {
    const forward = _tmpV.set(0, 0, -1).applyQuaternion(_tmpQ).normalize()
    // Drive/brake/boost only apply when grounded — no airborne thrust hacks.
    const driveActive = this._grounded ? 1.0 : 0

    if (input.throttle && driveActive) {
      const f = ENGINE_FORCE * dt
      this._body.applyImpulse({ x: forward.x * f, y: 0, z: forward.z * f }, true)
    }
    if (input.brake && driveActive) {
      const f = ENGINE_FORCE * 0.6 * dt
      this._body.applyImpulse({ x: -forward.x * f, y: 0, z: -forward.z * f }, true)
    }

    const groundSpeed = Math.hypot(vel.x, vel.z)
    if (this._grounded && groundSpeed > 0.5 && Math.abs(input.steerAxis) > 0.01) {
      const dotFwd = forward.x * vel.x + forward.z * vel.z
      this._body.applyTorqueImpulse({
        x: 0, y: -input.steerAxis * (dotFwd >= 0 ? 1 : -1) * STEER_TORQUE * dt, z: 0
      }, true)
    }

    this._boostCooldown = Math.max(0, this._boostCooldown - dt)
    if (this._boostTimer > 0) this._boostTimer = Math.max(0, this._boostTimer - dt)
    if (input.boostPressed && this._boostTimer <= 0 && this._boostCooldown <= 0) {
      this._boostTimer    = BOOST_DURATION
      this._boostCooldown = BOOST_COOLDOWN
      window.dispatchEvent(new CustomEvent('car:boost', { detail: { slot: this.slot, pos: this._body.translation() } }))
    }
    if (this._boostTimer > 0 && this._grounded) {
      const speed = Math.hypot(vel.x, vel.z)
      if (speed < BOOST_MAX_SPEED) {
        const f = BOOST_FORCE * dt
        this._body.applyImpulse({ x: forward.x * f, y: 0, z: forward.z * f }, true)
      }
    }

    this._fireCooldown = Math.max(0, this._fireCooldown - dt)
    if (this.isHuman) {
      // Humans: unlimited ammo, only gated by fire-rate cooldown.
      if (input.firePressed && this._fireCooldown <= 0) {
        this._fireBullet()
        this._fireCooldown = FIRE_RATE
      }
    } else {
      // AI: 6-round magazine that refills at AMMO_REGEN bullets/sec.
      this._ammo = Math.min(MAX_AMMO, this._ammo + AMMO_REGEN * dt)
      if (input.firePressed && this._fireCooldown <= 0 && this._ammo >= 1) {
        this._fireBullet()
        this._ammo -= 1
        this._fireCooldown = FIRE_RATE
      }
    }

    if (input.superShotPressed && this.superShots > 0 && this._fireCooldown <= 0) {
      this._fireSuperBullet()
      this.superShots--
      this._fireCooldown = FIRE_RATE * 2
      window.dispatchEvent(new CustomEvent('car:supershot_update', {
        detail: { slot: this.slot, superShots: this.superShots }
      }))
    }
  }

  _fireBullet() {
    const b = this._bullets.find(x => !x.alive)
    if (!b) return

    const pos = this._body.translation()
    const rot = this._body.rotation()
    _tmpQ.set(rot.x, rot.y, rot.z, rot.w)
    const fwd = _tmpV.set(0, 0, -1).applyQuaternion(_tmpQ)
    const vel = this._body.linvel()

    b.alive = true
    b.age = 0
    b.x = pos.x + fwd.x * 1.5
    b.y = pos.y + 0.3
    b.z = pos.z + fwd.z * 1.5
    b.vx = fwd.x * BULLET_SPEED + vel.x * 0.3
    b.vy = 0
    b.vz = fwd.z * BULLET_SPEED + vel.z * 0.3
    this.activeBullets++

    window.dispatchEvent(new CustomEvent('car:fire', {
      detail: { slot: this.slot, pos: { x: b.x, y: b.y, z: b.z } }
    }))
  }

  _fireSuperBullet() {
    const b = this._bullets.find(x => !x.alive)
    if (!b) return

    const pos = this._body.translation()
    const rot = this._body.rotation()
    _tmpQ.set(rot.x, rot.y, rot.z, rot.w)
    const fwd = _tmpV.set(0, 0, -1).applyQuaternion(_tmpQ)
    const vel = this._body.linvel()

    b.alive = true
    b.age = 0
    this.activeBullets++
    b.isSuper = true
    b.x = pos.x + fwd.x * 1.5
    b.y = pos.y + 0.3
    b.z = pos.z + fwd.z * 1.5
    b.vx = fwd.x * BULLET_SPEED + vel.x * 0.3
    b.vy = 0
    b.vz = fwd.z * BULLET_SPEED + vel.z * 0.3

    window.dispatchEvent(new CustomEvent('car:fire', {
      detail: { slot: this.slot, pos: { x: b.x, y: b.y, z: b.z }, isSuper: true }
    }))
  }

  _updateBullets(dt) {
    let dirty = false
    for (let i = 0; i < this._bullets.length; i++) {
      const b = this._bullets[i]
      if (!b.alive) continue
      b.age += dt
      if (b.age >= BULLET_LIFETIME) {
        b.alive = false
        b.isSuper = false
        this.activeBullets--
        this._bulletMesh.setMatrixAt(i, _hideM4)
        dirty = true
        continue
      }
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.z += b.vz * dt
      const scale = b.isSuper ? _superBulletScale : _bulletScale
      if (_sharedCamera) {
        _bulletM4.compose(
          _tmpV.set(b.x, b.y, b.z),
          _sharedCamera.quaternion,
          scale
        )
      } else {
        _bulletM4.makeTranslation(b.x, b.y, b.z)
      }
      this._bulletMesh.setMatrixAt(i, _bulletM4)
      dirty = true
    }
    if (dirty) this._bulletMesh.instanceMatrix.needsUpdate = true
  }

  // Damage from collision — called by derby.js
  triggerStripBoost() {
    if (this._boostTimer > 0) return
    this._boostTimer = BOOST_DURATION
    window.dispatchEvent(new CustomEvent('car:boost', { detail: { slot: this.slot, pos: this._body.translation() } }))
  }

  applyDamage(amount, attackerSlot) {
    if (this.eliminated) return
    if (this._spawnShield > 0) return
    const was = this.health
    this.health = Math.max(0, this.health - amount)
    this._hitFlash = 1.0
    window.dispatchEvent(new CustomEvent('car:hit', {
      detail: { slot: this.slot, name: this.displayName, health: this.health, damage: amount, pos: this.position, attackerSlot }
    }))
    if (this.health === 0 && was > 0) this._eliminate()
  }

  _eliminate() {
    this.eliminated = true;
    this._body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this._body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this._body.setLinearDamping(50);
    this._body.setAngularDamping(50);
    if (this._collider) this._collider.setEnabled(false);

    for (let i = 0; i < this._bullets.length; i++) {
      this._bullets[i].alive = false
      this._bulletMesh.setMatrixAt(i, _hideM4)
    }
    this.activeBullets = 0
    this._bulletMesh.instanceMatrix.needsUpdate = true

    // Visual: wrecked
    if (this._bodyMat) {
      this._bodyMat.color.setHex(0x222222);
      this._bodyMat.emissiveIntensity = 0;
    }
    if (this._bumperMat) { this._bumperMat.color.setHex(0x222222); this._bumperMat.emissiveIntensity = 0; }
    if (this._glowMat)   this._glowMat.opacity = 0;

    window.dispatchEvent(new CustomEvent('car:eliminated', {
      detail: { slot: this.slot, pos: this.position, name: this.displayName }
    }));
  }

  killBullet(idx) {
    if (idx < 0 || idx >= this._bullets.length) return
    if (this._bullets[idx].alive) this.activeBullets--
    this._bullets[idx].alive = false
    this._bulletMesh.setMatrixAt(idx, _hideM4)
    this._bulletMesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.scene.remove(this._group)
    if (this._bulletMesh) {
      this.scene.remove(this._bulletMesh)
      this._bulletMesh.dispose()
    }
    if (this._bodyMat) this._bodyMat.dispose()
    if (this._cabinMat) this._cabinMat.dispose()
    if (this._bumperMat) this._bumperMat.dispose()
    if (this._glowMat) this._glowMat.dispose()
    if (this._body && this.physics.world) this.physics.world.removeRigidBody(this._body)
    _releaseShared()
  }
}
