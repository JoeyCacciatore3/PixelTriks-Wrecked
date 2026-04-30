import * as THREE from 'three'
import { barrelTexture } from './textures.js'
import { SPAWN_POINTS } from './arena.js'
import { isMobile } from '../util/detect.js'

const BARREL_COUNT       = 22
const BARREL_HP          = 1
const BARREL_EXPLODE_RADIUS = 12
const BARREL_EXPLODE_DMG = 80
const RESPAWN_DELAY_MS   = 10000

const SPAWN_AREA_HW = 80   // X half-extent (arena is ±100, leave a wall buffer)
const SPAWN_AREA_HD = 100  // Z half-extent (arena is ±125)
const MIN_SEPARATION = 8   // barrels won't spawn within this many m of each other
const SPAWN_CLEARANCE = 14 // barrels won't spawn within this of a player spawn point
const FLOOR3_HALF = 12     // central elevated platform footprint to avoid

const _m4 = new THREE.Matrix4()
const _q4 = new THREE.Quaternion()
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0)

function pickPositions(count) {
  const out = []
  let attempts = 0
  while (out.length < count && attempts < count * 60) {
    attempts++
    const x = (Math.random() * 2 - 1) * SPAWN_AREA_HW
    const z = (Math.random() * 2 - 1) * SPAWN_AREA_HD
    if (Math.abs(x) < FLOOR3_HALF && Math.abs(z) < FLOOR3_HALF) continue
    let ok = true
    for (const sp of SPAWN_POINTS) {
      if (Math.hypot(sp.x - x, sp.z - z) < SPAWN_CLEARANCE) { ok = false; break }
    }
    if (!ok) continue
    for (const p of out) {
      if (Math.hypot(p[0] - x, p[1] - z) < MIN_SEPARATION) { ok = false; break }
    }
    if (!ok) continue
    out.push([x, z])
  }
  return out
}

export class Obstacles {
  constructor(scene, physics) {
    this.scene   = scene
    this.physics = physics
    this._barrels = []

    const positions = pickPositions(BARREL_COUNT)
    const tex = barrelTexture()
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.7, metalness: 0.3, color: 0xcc4400
    })
    const geom = new THREE.CylinderGeometry(0.84, 0.90, 2.0, 10)
    this._instancedMesh = new THREE.InstancedMesh(geom, mat, positions.length)
    this._instancedMesh.castShadow = !isMobile
    scene.add(this._instancedMesh)

    for (let i = 0; i < positions.length; i++) {
      const [x, z] = positions[i]
      const y = 1.04
      const { body, collider } = physics.createDynamicBox({
        position: { x, y, z }, hw: 0.88, hh: 1.0, hd: 0.88,
        density: 0.4, restitution: 0.65
      })
      _m4.makeTranslation(x, y, z)
      this._instancedMesh.setMatrixAt(i, _m4)
      this._barrels.push({ idx: i, body, collider, alive: true, hp: BARREL_HP, x, z })
    }
    this._instancedMesh.instanceMatrix.needsUpdate = true
  }

  update(dt) {
    let dirty = false
    for (const b of this._barrels) {
      if (!b.alive) continue
      const pos = b.body.translation()
      const rot = b.body.rotation()
      _q4.set(rot.x, rot.y, rot.z, rot.w)
      _m4.makeRotationFromQuaternion(_q4)
      _m4.setPosition(pos.x, pos.y, pos.z)
      this._instancedMesh.setMatrixAt(b.idx, _m4)
      dirty = true

      if (pos.y < -3 || Math.abs(pos.x) > 110 || Math.abs(pos.z) > 130) {
        this._resetBarrel(b)
      }
    }
    if (dirty) this._instancedMesh.instanceMatrix.needsUpdate = true
  }

  damageBarrel(barrel, attackerSlot) {
    if (!barrel.alive) return
    barrel.hp--
    const pos = barrel.body.translation()
    window.dispatchEvent(new CustomEvent('obstacle:hit', {
      detail: { pos: { x: pos.x, y: pos.y, z: pos.z } }
    }))
    if (barrel.hp <= 0) {
      this._explodeBarrel(barrel, attackerSlot)
    }
  }

  _explodeBarrel(barrel, attackerSlot) {
    const pos = barrel.body.translation()
    window.dispatchEvent(new CustomEvent('barrel:explode', {
      detail: {
        barrelIdx: barrel.idx,
        pos: { x: pos.x, y: pos.y, z: pos.z },
        radius: BARREL_EXPLODE_RADIUS,
        damage: BARREL_EXPLODE_DMG,
        attackerSlot
      }
    }))
    this._hideBarrel(barrel)
    setTimeout(() => {
      if (!barrel.alive) this._respawnBarrel(barrel)
    }, RESPAWN_DELAY_MS)
  }

  _resetBarrel(b) {
    this._hideBarrel(b)
    setTimeout(() => this._respawnBarrel(b), RESPAWN_DELAY_MS / 2)
  }

  _hideBarrel(b) {
    b.alive = false
    this._instancedMesh.setMatrixAt(b.idx, _zeroMatrix)
    this._instancedMesh.instanceMatrix.needsUpdate = true
    this.physics.world.removeRigidBody(b.body)
  }

  _respawnBarrel(b) {
    const { body, collider } = this.physics.createDynamicBox({
      position: { x: b.x, y: 1.04, z: b.z },
      hw: 0.88, hh: 1.0, hd: 0.88, density: 0.4, restitution: 0.65
    })
    b.body = body
    b.collider = collider
    b.alive = true
    b.hp = BARREL_HP
    _m4.makeTranslation(b.x, 1.04, b.z)
    this._instancedMesh.setMatrixAt(b.idx, _m4)
    this._instancedMesh.instanceMatrix.needsUpdate = true
  }

  get barrels() { return this._barrels }
}
