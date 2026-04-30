import * as THREE from 'three';
import { wallTexture, rampTexture, pillarTexture } from './textures.js'
import { isMobile } from '../util/detect.js'

function makeQuaternion(yaw, pitch) {
  const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
  qY.multiply(qX);
  return { x: qY.x, y: qY.y, z: qY.z, w: qY.w };
}

// Arena dimensions
export const ARENA_W  = 200;  // X: -100 … +100
export const ARENA_D  = 250;  // Z: -125 … +125
const WALL_H   = 12;

const FLOOR2_H = 7.0
const FLOOR2_THICK = 0.4

const FLOOR3_H = 15.0
const FLOOR3_THICK = 0.4
export const FLOOR3_HALF = 10

const F2_RAMP_W = 17

// Spawn positions (slot 0-3) + facing angles — spread for bigger map
export const SPAWN_POINTS = [
  { x: -65, y: 0.82, z: -85, angle: -2.489 },
  { x:  65, y: 0.82, z:  85, angle: 0.653 },
  { x:  65, y: 0.82, z: -85, angle: 2.489 },
  { x: -65, y: 0.82, z:  85, angle: -0.653 },
]

export class Arena {
  constructor(scene, physics) {
    this.scene   = scene;
    this.physics = physics;

    this._portalRing = null
    this._portalInner = null
    this._portalUsed = false
    this._exitPortals = []
    this._portalTime = 0
    this._exitPortalUsed = [false, false]
    this._flags = []
    this._flagTime = 0

    this._buildFloor();
    this._buildWalls();
    this._buildPerimeterBarriers();
    this._buildDeathRamps();
    this._buildSecondFloor();
    this._buildFloorRamps();
    this._buildThirdFloor();
    this._buildThirdFloorRamps();
    this._buildAmbientGeometry();
    this._buildPortal();
    this._buildRampFills();
    this._buildCornerHalfPipes();
    this._buildBoostStrip();
  }

  // Convex perimeter cage — ultimate backstop behind the half-pipe wedges.
  // The wedge colliders handle normal containment; this cage catches anything
  // that launches over the top of the half-pipe curve.
  _buildPerimeterBarriers() {
    const hw = ARENA_W / 2
    const hd = ARENA_D / 2
    const H     = 50
    const T     = 2
    const INSET = 1.5
    const cy = H / 2
    const innerX = hw - INSET
    const innerZ = hd - INSET
    const GAP = 7

    const zWalls = [-1, 1]
    for (const sign of zWalls) {
      const wallZ = sign * (innerZ + T / 2)
      const leftHW = (innerX - GAP) / 2
      this.physics.addStaticBox({ cx: -(innerX + GAP) / 2, cy, cz: wallZ, hw: leftHW, hh: H / 2, hd: T / 2, friction: 0.5, restitution: 0.1 })
      this.physics.addStaticBox({ cx:  (innerX + GAP) / 2, cy, cz: wallZ, hw: leftHW, hh: H / 2, hd: T / 2, friction: 0.5, restitution: 0.1 })
    }

    const xWalls = [-1, 1]
    for (const sign of xWalls) {
      const wallX = sign * (innerX + T / 2)
      this.physics.addStaticBox({ cx: wallX, cy, cz: 0, hw: T / 2, hh: H / 2, hd: innerZ, friction: 0.5, restitution: 0.1 })
    }
  }

  _buildFloor() {
    this.physics.addGround({ size: Math.max(ARENA_W, ARENA_D) * 1.2 })
  }

  _buildWalls() {
    const hw = ARENA_W / 2
    const hd = ARENA_D / 2
    const R = 36
    const r = 12
    const SINK = 1
    const VSEG = 16
    const WEDGE_SLICES = 8
    const WEDGE_DEPTH = 1.5

    const wallTex = wallTexture()
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex, color: 0xffffff, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide
    })
    const trimMat = new THREE.MeshBasicMaterial({ color: 0xeab308 })

    const segments = [
      { axis: 'x', wallPos: -hd, sign: 1, from: -(hw - R), to: hw - R },
      { axis: 'x', wallPos: hd, sign: -1, from: -(hw - R), to: hw - R },
      { axis: 'z', wallPos: -hw, sign: 1, from: -(hd - R), to: hd - R },
      { axis: 'z', wallPos: hw, sign: -1, from: -(hd - R), to: hd - R },
    ]

    const PHI_MAX = Math.PI * 0.483

    for (const seg of segments) {
      const len = seg.to - seg.from
      const LSEG = Math.max(4, Math.round(len / 2))

      // ── Visual mesh (smooth, decoupled from physics) ──
      const positions = []
      const uvs = []
      const idxArr = []
      const uTiles = len / 10
      for (let j = 0; j <= VSEG; j++) {
        const phi = (j / VSEG) * PHI_MAX
        const offset = r * (1 - Math.sin(phi))
        const y = r * (1 - Math.cos(phi)) - SINK
        const v = j / VSEG
        for (let i = 0; i <= LSEG; i++) {
          const u = (i / LSEG) * uTiles
          const t = seg.from + (i / LSEG) * len
          if (seg.axis === 'x') {
            positions.push(t, y, seg.wallPos + seg.sign * offset)
          } else {
            positions.push(seg.wallPos + seg.sign * offset, y, t)
          }
          uvs.push(u, v)
        }
      }
      for (let j = 0; j < VSEG; j++) {
        for (let i = 0; i < LSEG; i++) {
          const a = j * (LSEG + 1) + i
          const b = a + 1
          const d = a + (LSEG + 1)
          const e = d + 1
          idxArr.push(a, b, d, b, e, d)
        }
      }
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
      geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
      geom.setIndex(idxArr)
      geom.computeVertexNormals()
      const mesh = new THREE.Mesh(geom, wallMat)
      mesh.castShadow = !isMobile
      mesh.receiveShadow = !isMobile
      this.scene.add(mesh)

      // ── Physics: convex wedge slices along the curve ──
      // Each wedge is a thick slab spanning one phi-slice. Outer face is
      // pushed laterally toward the wall plane (same Y, reduced offset) so
      // the base of the curve transitions smoothly from the ground.
      for (let s = 0; s < WEDGE_SLICES; s++) {
        const phi0 = (s / WEDGE_SLICES) * PHI_MAX
        const phi1 = ((s + 1) / WEDGE_SLICES) * PHI_MAX
        const offset0 = r * (1 - Math.sin(phi0))
        const offset1 = r * (1 - Math.sin(phi1))
        const y0 = r * (1 - Math.cos(phi0)) - SINK
        const y1 = r * (1 - Math.cos(phi1)) - SINK
        // Outer face: same Y, pushed laterally toward wall plane
        const MIN_THICK = 0.5
        const outerOffset0 = offset0 < MIN_THICK ? 0 : Math.max(0, offset0 - Math.max(WEDGE_DEPTH, MIN_THICK))
        const outerOffset1 = offset1 < MIN_THICK ? 0 : Math.max(0, offset1 - Math.max(WEDGE_DEPTH, MIN_THICK))

        const tStart = seg.from
        const tEnd = seg.to
        const pts = new Float32Array(8 * 3)
        let pi = 0
        for (const t of [tStart, tEnd]) {
          for (const [off, y] of [[offset0, y0], [offset1, y1], [outerOffset0, y0], [outerOffset1, y1]]) {
            if (seg.axis === 'x') {
              pts[pi++] = t; pts[pi++] = y; pts[pi++] = seg.wallPos + seg.sign * off
            } else {
              pts[pi++] = seg.wallPos + seg.sign * off; pts[pi++] = y; pts[pi++] = t
            }
          }
        }
        const wedgeBody = this.physics.world.createRigidBody(
          this.physics.RAPIER.RigidBodyDesc.fixed()
        )
        const desc = this.physics.RAPIER.ColliderDesc.convexHull(pts)
        if (desc) {
          desc.setFriction(0.5).setRestitution(0.1)
          this.physics.world.createCollider(desc, wedgeBody)
        }
      }

      // ── Trim strip (visual only) ──
      const trimY = r * (1 - Math.cos(PHI_MAX)) - SINK + 0.06
      if (seg.axis === 'x') {
        const tGeom = new THREE.BoxGeometry(len, 0.12, 0.15)
        const tMesh = new THREE.Mesh(tGeom, trimMat)
        tMesh.position.set((seg.from + seg.to) / 2, trimY, seg.wallPos)
        this.scene.add(tMesh)
      } else {
        const tGeom = new THREE.BoxGeometry(0.15, 0.12, len)
        const tMesh = new THREE.Mesh(tGeom, trimMat)
        tMesh.position.set(seg.wallPos, trimY, (seg.from + seg.to) / 2)
        this.scene.add(tMesh)
      }
    }
  }

  _buildDeathRamps() {
    const rampTex = rampTexture(true)
    const rampWidth = 17.25
    const rampLen = 30
    rampTex.repeat.set(rampWidth / 5, rampLen / 5)
    rampTex.needsUpdate = true
    const rampMat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.6, metalness: 0.1, color: 0xffffff })
    const warnMat = new THREE.MeshBasicMaterial({ color: 0xef4444 })

    const rampHalfLen = rampLen / 2
    const tilt = Math.asin(12 / rampLen)
    const horizHalf = Math.cos(tilt) * rampHalfLen
    const rise = Math.sin(tilt) * rampHalfLen

    const hw = ARENA_W / 2
    const hd = ARENA_D / 2

    const configs = [
      { x: 0,  z: -(hd - horizHalf + 2), rotY: 0 },
      { x: 0,  z:  (hd - horizHalf + 2), rotY: Math.PI },
    ]

    for (const r of configs) {
      const centerY = rise - 0.35
      const rampGroup = new THREE.Group()
      rampGroup.position.set(r.x, centerY, r.z)
      rampGroup.rotation.y = r.rotY

      const rampGeom = new THREE.BoxGeometry(rampWidth, 0.3, rampLen)
      const mesh = new THREE.Mesh(rampGeom, rampMat)
      mesh.rotation.x = tilt
      rampGroup.add(mesh)

      const warnGeom = new THREE.BoxGeometry(rampWidth + 0.2, 0.06, 0.6)
      for (let i = 0; i < 3; i++) {
        const t = -rampHalfLen + 2 + i * 3
        const stripeY = -Math.sin(tilt) * t + 0.16
        const stripe = new THREE.Mesh(warnGeom, warnMat)
        stripe.position.set(0, stripeY, t)
        stripe.rotation.x = tilt
        rampGroup.add(stripe)
      }

      this.scene.add(rampGroup)

      const rampBodyDesc = this.physics.RAPIER.RigidBodyDesc.fixed()
        .setTranslation(r.x, centerY, r.z)
        .setRotation(makeQuaternion(r.rotY, tilt))
      const rampBody = this.physics.world.createRigidBody(rampBodyDesc)
      this.physics.world.createCollider(
        this.physics.RAPIER.ColliderDesc.cuboid(rampWidth / 2, 0.2, rampHalfLen).setFriction(0.05).setRestitution(0.3),
        rampBody
      )
    }
  }

  _buildSecondFloor() {
    const platHalf = 60
    const trimMat = new THREE.MeshBasicMaterial({ color: 0xeab308 })

    const tex = rampTexture(true)
    tex.repeat.set((platHalf * 2) / 10, (platHalf * 2) / 10)
    tex.needsUpdate = true
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.7, metalness: 0.1 })

    const geom = new THREE.BoxGeometry(platHalf * 2, FLOOR2_THICK, platHalf * 2)
    const mesh = new THREE.Mesh(geom, mat)
    mesh.position.set(0, FLOOR2_H, 0)
    mesh.castShadow = !isMobile
    mesh.receiveShadow = !isMobile
    this.scene.add(mesh)

    this.physics.addStaticBox({
      cx: 0, cy: FLOOR2_H, cz: 0,
      hw: platHalf, hh: FLOOR2_THICK / 2, hd: platHalf,
      friction: 0.4, restitution: 0.3
    })

    const trimH = 0.08
    const trimW = 0.15
    const trimY = FLOOR2_H + FLOOR2_THICK / 2 + 0.04
    const edges = [
      { w: platHalf * 2, d: trimW, ox: 0, oz: -platHalf + trimW / 2 },
      { w: platHalf * 2, d: trimW, ox: 0, oz:  platHalf - trimW / 2 },
      { w: trimW, d: platHalf * 2, ox: -platHalf + trimW / 2, oz: 0 },
      { w: trimW, d: platHalf * 2, ox:  platHalf - trimW / 2, oz: 0 },
    ]
    for (const e of edges) {
      const tg = new THREE.BoxGeometry(e.w, trimH, e.d)
      const tm = new THREE.Mesh(tg, trimMat)
      tm.position.set(e.ox, trimY, e.oz)
      this.scene.add(tm)
    }
  }

  _buildFloorRamps() {
    const rampTex = rampTexture(true);
    rampTex.repeat.set(F2_RAMP_W / 5, 22 / 5);
    rampTex.needsUpdate = true;
    const rampMat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.6, metalness: 0.1, color: 0xffffff });

    const rampLen = 22
    const rampHalfLen = rampLen / 2
    const tilt = Math.asin((FLOOR2_H + 0.5) / rampLen)
    const platHalf = 60
    const horizLen = Math.cos(tilt) * rampHalfLen
    const rise = Math.sin(tilt) * rampHalfLen
    const centerY = rise - 0.5

    const accessRamps = [
      { x: 0,                      z: -(platHalf + horizLen), rotY: Math.PI },
      { x: 0,                      z:  (platHalf + horizLen), rotY: 0 },
      { x: -(platHalf + horizLen), z: 0,                      rotY: -Math.PI / 2 },
      { x:  (platHalf + horizLen), z: 0,                      rotY: Math.PI / 2 },
    ];

    const floorRailMat = new THREE.MeshBasicMaterial({ color: 0xeab308 })

    for (const r of accessRamps) {
      const rampGeom = new THREE.BoxGeometry(F2_RAMP_W, 0.3, rampLen);
      const mesh = new THREE.Mesh(rampGeom, rampMat);

      const rampGroup = new THREE.Group();
      rampGroup.position.set(r.x, centerY, r.z);
      rampGroup.rotation.y = r.rotY;
      mesh.rotation.x = tilt;
      rampGroup.add(mesh);

      for (const side of [-1, 1]) {
        const railGeom = new THREE.BoxGeometry(0.2, 0.5, rampLen);
        const rail = new THREE.Mesh(railGeom, floorRailMat);
        rail.position.set(side * (F2_RAMP_W / 2 + 0.1), 0.25, 0);
        rail.rotation.x = tilt;
        rampGroup.add(rail);
      }

      this.scene.add(rampGroup);

      const rampBodyDesc = this.physics.RAPIER.RigidBodyDesc.fixed()
        .setTranslation(r.x, centerY, r.z)
        .setRotation(makeQuaternion(r.rotY, tilt));
      const rampBody = this.physics.world.createRigidBody(rampBodyDesc);
      this.physics.world.createCollider(
        this.physics.RAPIER.ColliderDesc.cuboid(F2_RAMP_W / 2, 0.2, rampHalfLen).setFriction(0.05).setRestitution(0.2),
        rampBody
      );
    }
  }

  _buildThirdFloor() {
    const platTex3 = rampTexture(true)
    platTex3.repeat.set((FLOOR3_HALF * 2) / 10, (FLOOR3_HALF * 2) / 10)
    platTex3.needsUpdate = true
    const floorMat = new THREE.MeshStandardMaterial({ map: platTex3, color: 0xffffff, roughness: 0.65, metalness: 0.1 })
    const trimMat = new THREE.MeshBasicMaterial({ color: 0xeab308 })

    const geom = new THREE.BoxGeometry(FLOOR3_HALF * 2, FLOOR3_THICK, FLOOR3_HALF * 2)
    const mesh = new THREE.Mesh(geom, floorMat)
    mesh.position.set(0, FLOOR3_H, 0)
    mesh.castShadow = !isMobile
    mesh.receiveShadow = !isMobile
    this.scene.add(mesh)

    this.physics.addStaticBox({
      cx: 0, cy: FLOOR3_H, cz: 0,
      hw: FLOOR3_HALF, hh: FLOOR3_THICK / 2, hd: FLOOR3_HALF,
      friction: 0.4, restitution: 0.3
    })

    const wingLen = 50
    const wings = [
      { cx: -(FLOOR3_HALF + wingLen / 2), cz: 0 },
      { cx:  (FLOOR3_HALF + wingLen / 2), cz: 0 },
    ]
    for (const w of wings) {
      const wGeom = new THREE.BoxGeometry(wingLen, FLOOR3_THICK, FLOOR3_HALF * 2)
      const wMesh = new THREE.Mesh(wGeom, floorMat)
      wMesh.position.set(w.cx, FLOOR3_H, w.cz)
      wMesh.castShadow = !isMobile
      wMesh.receiveShadow = !isMobile
      this.scene.add(wMesh)

      this.physics.addStaticBox({
        cx: w.cx, cy: FLOOR3_H, cz: w.cz,
        hw: wingLen / 2, hh: FLOOR3_THICK / 2, hd: FLOOR3_HALF,
        friction: 0.4, restitution: 0.3
      })
    }

    const trimH = 0.08
    const trimW = 0.15
    const trimY = FLOOR3_H + FLOOR3_THICK / 2 + 0.04
    const f3 = FLOOR3_HALF
    const totalX = FLOOR3_HALF + wingLen
    const f3Edges = [
      { w: totalX * 2, d: trimW, ox: 0, oz: -f3 + trimW / 2 },
      { w: totalX * 2, d: trimW, ox: 0, oz:  f3 - trimW / 2 },
      { w: trimW, d: f3 * 2, ox: -totalX + trimW / 2, oz: 0 },
      { w: trimW, d: f3 * 2, ox:  totalX - trimW / 2, oz: 0 },
    ]
    for (const e of f3Edges) {
      const tg = new THREE.BoxGeometry(e.w, trimH, e.d)
      const tm = new THREE.Mesh(tg, trimMat)
      tm.position.set(e.ox, trimY, e.oz)
      this.scene.add(tm)
    }
  }

  _buildThirdFloorRamps() {
    const rampTex = rampTexture(true)
    const f3RampW = 8.625
    rampTex.repeat.set(f3RampW / 5, 24 / 5)
    rampTex.needsUpdate = true
    const rampMat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.6, metalness: 0.1, color: 0xffffff })

    const climbH = FLOOR3_H - FLOOR2_H
    const rampLen = 24
    const rampHalfLen = rampLen / 2
    const tilt = Math.asin((climbH + 0.5) / rampLen)
    const horizLen = Math.cos(tilt) * rampHalfLen
    const rise = Math.sin(tilt) * rampHalfLen
    const centerY = FLOOR2_H + rise - 0.5

    const ramps = [
      { x: 0, z: -(FLOOR3_HALF + horizLen), rotY: Math.PI },
      { x: 0, z:  (FLOOR3_HALF + horizLen), rotY: 0 },
    ]

    const f3RailMat = new THREE.MeshBasicMaterial({ color: 0xeab308 })

    for (const r of ramps) {
      const rampGeom = new THREE.BoxGeometry(f3RampW, 0.3, rampLen)
      const mesh = new THREE.Mesh(rampGeom, rampMat)

      const rampGroup = new THREE.Group()
      rampGroup.position.set(r.x, centerY, r.z)
      rampGroup.rotation.y = r.rotY
      mesh.rotation.x = tilt
      rampGroup.add(mesh)

      for (const side of [-1, 1]) {
        const railGeom = new THREE.BoxGeometry(0.2, 0.5, rampLen)
        const rail = new THREE.Mesh(railGeom, f3RailMat)
        rail.position.set(side * (f3RampW / 2 + 0.1), 0.25, 0)
        rail.rotation.x = tilt
        rampGroup.add(rail)
      }

      this.scene.add(rampGroup)

      const rampBodyDesc = this.physics.RAPIER.RigidBodyDesc.fixed()
        .setTranslation(r.x, centerY, r.z)
        .setRotation(makeQuaternion(r.rotY, tilt))
      const rampBody = this.physics.world.createRigidBody(rampBodyDesc)
      this.physics.world.createCollider(
        this.physics.RAPIER.ColliderDesc.cuboid(f3RampW / 2, 0.2, rampHalfLen).setFriction(0.05).setRestitution(0.2),
        rampBody
      )
    }
  }

  _buildPortal() {
    const isPortalUser = !!window.__isPortalUser

    if (isPortalUser) {
      const portalPos = { x: 0, y: FLOOR3_H + FLOOR3_THICK / 2 + 3.0, z: 0 }
      const ringGeom = new THREE.TorusGeometry(3, 0.2, 16, 32)
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xf97316 })
      this._portalRing = new THREE.Mesh(ringGeom, ringMat)
      this._portalRing.position.set(portalPos.x, portalPos.y, portalPos.z)
      this.scene.add(this._portalRing)

      const innerGeom = new THREE.TorusGeometry(2.2, 0.08, 12, 32)
      const innerMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.5 })
      this._portalInner = new THREE.Mesh(innerGeom, innerMat)
      this._portalInner.position.set(portalPos.x, portalPos.y, portalPos.z)
      this.scene.add(this._portalInner)

      const glowLight = new THREE.PointLight(0xf97316, 4, 25)
      glowLight.position.set(portalPos.x, portalPos.y, portalPos.z)
      this.scene.add(glowLight)

      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 64
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#f97316'
      ctx.font = 'bold 36px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('RETURN', 128, 32)
      const tex = new THREE.CanvasTexture(canvas)
      const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
      this._portalLabel = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), labelMat)
      this._portalLabel.position.set(portalPos.x, portalPos.y + 4.5, portalPos.z)
      this.scene.add(this._portalLabel)

      this._portalCenter = portalPos
    }

    this._buildExitPortals()
  }

  _buildExitPortals() {
    const hw = ARENA_W / 2
    const hd = ARENA_D / 2
    const rampLen = 30
    const tilt = Math.asin(12 / rampLen)
    const rampHalfLen = rampLen / 2
    const horizHalf = Math.cos(tilt) * rampHalfLen
    const rise = Math.sin(tilt) * rampHalfLen
    const centerY = rise - 0.35
    const topY = centerY + rise + 3

    const rampConfigs = [
      { x: 0,  z: -(hd - horizHalf + 2), rotY: 0 },
      { x: 0,  z:  (hd - horizHalf + 2), rotY: Math.PI },
    ]

    const ringGeom = new THREE.TorusGeometry(2.5, 0.18, 16, 32)
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: 0x00ff66, emissiveIntensity: 3, toneMapped: false })
    const innerGeom = new THREE.TorusGeometry(1.8, 0.06, 12, 32)
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x66ffaa, transparent: true, opacity: 0.6 })

    const beamGeom = new THREE.CylinderGeometry(2.8, 3.5, 40, 16, 1, true)
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x44ff88, transparent: true, opacity: 0.07,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    })
    const beamCoreGeom = new THREE.CylinderGeometry(0.8, 1.5, 40, 8, 1, true)
    const beamCoreMat = new THREE.MeshBasicMaterial({
      color: 0xaaffcc, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    })

    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#00ff66'
    ctx.font = 'bold 32px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('VIBEJAM', 128, 32)
    const labelTex = new THREE.CanvasTexture(canvas)
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })

    for (let i = 0; i < rampConfigs.length; i++) {
      const r = rampConfigs[i]
      const offZ = -horizHalf * 0.7
      const wx = r.x + Math.sin(r.rotY) * offZ
      const wz = r.z + Math.cos(r.rotY) * offZ

      const ring = new THREE.Mesh(ringGeom, ringMat)
      ring.position.set(wx, topY, wz)
      this.scene.add(ring)

      const inner = new THREE.Mesh(innerGeom, innerMat)
      inner.position.set(wx, topY, wz)
      this.scene.add(inner)

      const glow = new THREE.PointLight(0x44ff88, 6, 30)
      glow.position.set(wx, topY, wz)
      this.scene.add(glow)

      const beam = new THREE.Mesh(beamGeom, beamMat)
      beam.position.set(wx, topY + 20, wz)
      this.scene.add(beam)

      const beamCore = new THREE.Mesh(beamCoreGeom, beamCoreMat)
      beamCore.position.set(wx, topY + 20, wz)
      this.scene.add(beamCore)

      const topGlow = new THREE.PointLight(0x44ff88, 4, 25)
      topGlow.position.set(wx, topY + 35, wz)
      this.scene.add(topGlow)

      const label = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.9), labelMat)
      label.position.set(wx, topY + 3.5, wz)
      this.scene.add(label)

      this._exitPortals.push({ ring, inner, beam, beamCore, center: { x: wx, y: topY, z: wz } })
    }
  }

  update(dt, allCars) {
    this._portalTime += dt
    this._flagTime += dt
    for (const flag of this._flags) {
      const pos = flag.geometry.attributes.position
      const base = flag._basePositions
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3]
        const t = this._flagTime * 3 + bx * 0.5
        pos.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t) * (0.3 + bx * 0.08)
      }
      pos.needsUpdate = true
    }
    if (this._portalRing) {
      this._portalRing.rotation.y += dt * 0.5
      this._portalRing.rotation.z += dt * 0.3
      this._portalInner.rotation.y -= dt * 0.7
      this._portalInner.rotation.x += dt * 0.4
    }

    for (const ep of this._exitPortals) {
      ep.ring.rotation.y += dt * 0.6
      ep.ring.rotation.z += dt * 0.35
      ep.inner.rotation.y -= dt * 0.8
      ep.inner.rotation.x += dt * 0.45
      if (ep.beam) {
        const pulse = 0.06 + Math.sin(this._portalTime * 1.5) * 0.03
        ep.beam.material.opacity = pulse
        ep.beamCore.material.opacity = pulse * 2
        ep.beam.rotation.y += dt * 0.15
      }
    }

    if (!allCars) return

    for (const car of allCars) {
      if (!car || car.eliminated) continue
      if (this.isOnBoostStrip(car.position)) car.triggerStripBoost()
    }

    if (this._portalCenter && !this._portalUsed) {
      for (const car of allCars) {
        if (car.eliminated || !car.isHuman) continue
        const p = car.position
        const dx = p.x - this._portalCenter.x
        const dy = p.y - this._portalCenter.y
        const dz = p.z - this._portalCenter.z
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 3) {
          this._portalUsed = true
          const baseUrl = window.__portalRef || 'https://vibej.am/portal/2026'
          const url = new URL(baseUrl.startsWith('http') ? baseUrl : 'https://' + baseUrl)
          const incoming = new URLSearchParams(window.location.search)
          for (const [k, v] of incoming) {
            if (k !== 'ref' && k !== 'portal') url.searchParams.set(k, v)
          }
          url.searchParams.set('portal', 'true')
          url.searchParams.set('ref', window.location.origin)
          url.searchParams.set('color', car.color)
          url.searchParams.set('speed', String(Math.round(car.speed)))
          url.searchParams.set('hp', String(Math.round(car.health / 5)))
          window.location.href = url.toString()
          break
        }
      }
    }

    for (let i = 0; i < this._exitPortals.length; i++) {
      if (this._exitPortalUsed[i]) continue
      const c = this._exitPortals[i].center
      for (const car of allCars) {
        if (car.eliminated || !car.isHuman) continue
        const p = car.position
        const dx = p.x - c.x
        const dy = p.y - c.y
        const dz = p.z - c.z
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 4) {
          this._exitPortalUsed[i] = true
          const url = new URL('https://vibej.am/portal/2026')
          url.searchParams.set('ref', window.location.origin)
          url.searchParams.set('portal', 'true')
          url.searchParams.set('color', car.color)
          url.searchParams.set('speed', String(Math.round(car.speed)))
          url.searchParams.set('hp', String(Math.round(car.health / 5)))
          window.location.href = url.toString()
          break
        }
      }
    }
  }

  _buildAmbientGeometry() {
    const pilTex = pillarTexture()
    pilTex.repeat.set(1, 8)
    pilTex.needsUpdate = true
    const pillarMat = new THREE.MeshStandardMaterial({ map: pilTex, roughness: 0.9, metalness: 0.1 })
    const corners = [
      [-ARENA_W/2, ARENA_D/2], [ARENA_W/2, ARENA_D/2],
      [-ARENA_W/2, -ARENA_D/2], [ARENA_W/2, -ARENA_D/2]
    ];
    for (const [x, z] of corners) {
      const geom = new THREE.BoxGeometry(2.5, WALL_H * 2, 2.5);
      const mesh = new THREE.Mesh(geom, pillarMat);
      mesh.position.set(x, WALL_H, z);
      mesh.castShadow = !isMobile;
      this.scene.add(mesh);

      const tipGeom = new THREE.BoxGeometry(2.6, 0.4, 2.6);
      const tipMat  = new THREE.MeshBasicMaterial({ color: 0xff3300 });
      const tip = new THREE.Mesh(tipGeom, tipMat);
      tip.position.set(x, WALL_H * 2 + 0.2, z);
      this.scene.add(tip);

      const poleGeom = new THREE.CylinderGeometry(0.12, 0.12, 10, 6)
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.3 })
      const pole = new THREE.Mesh(poleGeom, poleMat)
      pole.position.set(x, WALL_H * 2 + 0.4 + 5, z)
      this.scene.add(pole)

      const flagCanvas = document.createElement('canvas')
      flagCanvas.width = 512
      flagCanvas.height = 256
      const fc = flagCanvas.getContext('2d')
      fc.fillStyle = '#22c55e'
      fc.fillRect(0, 0, 512, 256)
      fc.fillStyle = '#ffffff'
      fc.font = 'bold 96px ui-monospace, monospace'
      fc.textAlign = 'center'
      fc.textBaseline = 'middle'
      fc.fillText('VIBEJAM', 256, 110)
      fc.font = 'bold 48px ui-monospace, monospace'
      fc.fillText('2026', 256, 190)
      const flagTex = new THREE.CanvasTexture(flagCanvas)
      const flagGeom = new THREE.PlaneGeometry(12, 6, 20, 1)
      const flagMat = new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide })
      const flag = new THREE.Mesh(flagGeom, flagMat)
      flag.position.set(x + 6, WALL_H * 2 + 0.4 + 5, z)
      flag._basePositions = flagGeom.attributes.position.array.slice()
      this._flags.push(flag)
      this.scene.add(flag)
    }

    // Scatter jump mounds across the ground floor (drivable ramps)
    const moundPositions = [
      [-50, -50], [50, -50], [-50, 50], [50, 50],
      [-80, -80], [80, -80], [-80, 80], [80, 80],
      [-30, 0], [30, 0], [0, -70], [0, 70],
      [-70, -25], [70, -25], [-70, 25], [70, 25]
    ]
    const moundRadius = 2.0
    const moundHeight = 0.7
    const moundSegs = 32
    const moundTex = pillarTexture(true)
    moundTex.wrapS = THREE.RepeatWrapping
    moundTex.wrapT = THREE.RepeatWrapping
    moundTex.repeat.set(2, 2)
    const moundMat = new THREE.MeshStandardMaterial({ map: moundTex, roughness: 0.85, metalness: 0.2 })
    const moundGeom = new THREE.SphereGeometry(moundRadius, moundSegs, moundSegs, 0, Math.PI * 2, 0, Math.PI / 2)
    moundGeom.scale(1, moundHeight / moundRadius, 1)
    const moundMesh = new THREE.InstancedMesh(moundGeom, moundMat, moundPositions.length)
    moundMesh.castShadow = !isMobile
    moundMesh.receiveShadow = !isMobile
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xeab308 })
    const stripeGeom = new THREE.TorusGeometry(moundRadius * 0.7, 0.05, 6, 16)
    const stripeMesh = new THREE.InstancedMesh(stripeGeom, stripeMat, moundPositions.length)
    const _m4 = new THREE.Matrix4()
    const _rotQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    const hullPts = new Float32Array(moundSegs * 3 + 3)
    for (let i = 0; i < moundSegs; i++) {
      const a = (i / moundSegs) * Math.PI * 2
      hullPts[i * 3] = Math.cos(a) * moundRadius
      hullPts[i * 3 + 1] = 0
      hullPts[i * 3 + 2] = Math.sin(a) * moundRadius
    }
    hullPts[moundSegs * 3] = 0
    hullPts[moundSegs * 3 + 1] = moundHeight
    hullPts[moundSegs * 3 + 2] = 0
    for (let i = 0; i < moundPositions.length; i++) {
      const [x, z] = moundPositions[i]
      _m4.makeTranslation(x, 0, z)
      moundMesh.setMatrixAt(i, _m4)
      _m4.makeRotationFromQuaternion(_rotQ)
      _m4.setPosition(x, moundHeight * 0.4, z)
      stripeMesh.setMatrixAt(i, _m4)
      this.physics.addStaticConvexHull({ cx: x, cy: 0, cz: z, points: hullPts, friction: 0.3, restitution: 0.2 })
    }
    this.scene.add(moundMesh)
    this.scene.add(stripeMesh)
  }

  _buildRampFills() {
    const hw = ARENA_W / 2
    const hd = ARENA_D / 2

    const f2tilt = Math.asin((FLOOR2_H + 0.5) / 22)
    const f2Rise = Math.sin(f2tilt) * 11
    const f2Horiz = Math.cos(f2tilt) * 11
    const platHalf = 60

    const floorRamps = [
      { x: 0,                       z: -(platHalf + f2Horiz), dirX: 0,  dirZ: 1 },
      { x: 0,                       z:  (platHalf + f2Horiz), dirX: 0,  dirZ: -1 },
      { x: -(platHalf + f2Horiz),   z: 0,                     dirX: 1,  dirZ: 0 },
      { x:  (platHalf + f2Horiz),   z: 0,                     dirX: -1, dirZ: 0 },
    ]
    for (const r of floorRamps) {
      const fillH = f2Rise * 0.2
      const shiftAmt = f2Horiz * 0.2
      this.physics.addStaticBox({
        cx: r.x + r.dirX * shiftAmt, cy: fillH / 2, cz: r.z + r.dirZ * shiftAmt,
        hw: r.dirZ !== 0 ? F2_RAMP_W / 2 : f2Horiz * 0.2,
        hh: fillH / 2,
        hd: r.dirZ !== 0 ? f2Horiz * 0.2 : F2_RAMP_W / 2,
        friction: 0.1, restitution: 0.1
      })
    }

    const f3tilt = Math.asin((FLOOR3_H - FLOOR2_H + 0.5) / 24)
    const f3Rise = Math.sin(f3tilt) * 12
    const f3Horiz = Math.cos(f3tilt) * 12

    const thirdRamps = [
      { x: 0, z: -(FLOOR3_HALF + f3Horiz), dirZ: 1 },
      { x: 0, z:  (FLOOR3_HALF + f3Horiz), dirZ: -1 },
    ]
    for (const r of thirdRamps) {
      const fillH = f3Rise * 0.2
      const shiftAmt = f3Horiz * 0.2
      this.physics.addStaticBox({
        cx: r.x, cy: FLOOR2_H + fillH / 2, cz: r.z + r.dirZ * shiftAmt,
        hw: 2.625, hh: fillH / 2, hd: f3Horiz * 0.2,
        friction: 0.1, restitution: 0.1
      })
    }
  }

  _buildCornerHalfPipes() {
    const hw = ARENA_W / 2
    const hd = ARENA_D / 2
    const R = 36
    const r = 12
    const SINK = 1
    const HSEG = 24
    const VSEG = 16
    const WEDGE_THETA_SLICES = 6
    const WEDGE_PHI_SLICES = 8
    const WEDGE_DEPTH = 1.5

    const cornerWallTex = wallTexture()
    const wallMat = new THREE.MeshStandardMaterial({
      map: cornerWallTex, color: 0x9999bb, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide
    })
    const trimMat = new THREE.MeshBasicMaterial({ color: 0xff4400 })

    const corners = [
      { cx: -hw + R, cz: -hd + R, thetaStart: Math.PI       },  // NW
      { cx:  hw - R, cz: -hd + R, thetaStart: Math.PI * 0.5 },  // NE
      { cx:  hw - R, cz:  hd - R, thetaStart: 0              },  // SE
      { cx: -hw + R, cz:  hd - R, thetaStart: Math.PI * 1.5 },  // SW
    ]

    const PHI_MAX = Math.PI * 0.483
    const trimPts = 12
    const trimGeom = new THREE.BoxGeometry(0.15, 0.12, 1)
    const totalTrims = corners.length * trimPts
    const trimInstanced = new THREE.InstancedMesh(trimGeom, trimMat, totalTrims)
    let trimIdx = 0
    const _tm4 = new THREE.Matrix4()
    const _tq = new THREE.Quaternion()
    const _ts = new THREE.Vector3()

    for (const c of corners) {
      // ── Visual mesh (smooth, decoupled from physics) ──
      const positions = []
      const uvs = []
      const idxArr = []

      const arcLen = (R - r) * (Math.PI / 2)
      const uTiles = arcLen / 10
      for (let j = 0; j <= VSEG; j++) {
        const phi = (j / VSEG) * PHI_MAX
        const v = j / VSEG
        for (let i = 0; i <= HSEG; i++) {
          const theta = c.thetaStart + (i / HSEG) * Math.PI / 2
          const radial = (R - r) + r * Math.sin(phi)
          positions.push(
            c.cx + radial * Math.sin(theta),
            r * (1 - Math.cos(phi)) - SINK,
            c.cz + radial * Math.cos(theta)
          )
          uvs.push((i / HSEG) * uTiles, v)
        }
      }
      for (let j = 0; j < VSEG; j++) {
        for (let i = 0; i < HSEG; i++) {
          const a = j * (HSEG + 1) + i
          const b = a + 1
          const d = a + (HSEG + 1)
          const e = d + 1
          idxArr.push(a, b, d, b, e, d)
        }
      }
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
      geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
      geom.setIndex(idxArr)
      geom.computeVertexNormals()
      const mesh = new THREE.Mesh(geom, wallMat)
      mesh.castShadow = !isMobile
      mesh.receiveShadow = !isMobile
      this.scene.add(mesh)

      // ── Physics: convex wedge grid (theta × phi slices) ──
      // Outer face pushed radially outward (same Y) so ground-level
      // wedges don't create a lip above the floor.
      for (let ti = 0; ti < WEDGE_THETA_SLICES; ti++) {
        const theta0 = c.thetaStart + (ti / WEDGE_THETA_SLICES) * (Math.PI / 2)
        const theta1 = c.thetaStart + ((ti + 1) / WEDGE_THETA_SLICES) * (Math.PI / 2)

        for (let pj = 0; pj < WEDGE_PHI_SLICES; pj++) {
          const phi0 = (pj / WEDGE_PHI_SLICES) * PHI_MAX
          const phi1 = ((pj + 1) / WEDGE_PHI_SLICES) * PHI_MAX
          const pts = new Float32Array(8 * 3)
          let idx = 0

          for (const theta of [theta0, theta1]) {
            for (const phi of [phi0, phi1]) {
              const radial = (R - r) + r * Math.sin(phi)
              const y = r * (1 - Math.cos(phi)) - SINK
              // Inner vertex (on the curve surface)
              pts[idx++] = c.cx + radial * Math.sin(theta)
              pts[idx++] = y
              pts[idx++] = c.cz + radial * Math.cos(theta)
              // Outer vertex (same Y, pushed radially outward)
              const outerRadial = radial + WEDGE_DEPTH
              pts[idx++] = c.cx + outerRadial * Math.sin(theta)
              pts[idx++] = y
              pts[idx++] = c.cz + outerRadial * Math.cos(theta)
            }
          }

          const wedgeBody = this.physics.world.createRigidBody(
            this.physics.RAPIER.RigidBodyDesc.fixed()
          )
          const desc = this.physics.RAPIER.ColliderDesc.convexHull(pts)
          if (desc) {
            desc.setFriction(0.5).setRestitution(0.1)
            this.physics.world.createCollider(desc, wedgeBody)
          }
        }
      }

      // ── Trim strip instances (visual only) ──
      const radTop = (R - r) + r * Math.sin(PHI_MAX)
      const trimY = r * (1 - Math.cos(PHI_MAX)) - SINK + 0.06
      for (let i = 0; i < trimPts; i++) {
        const t0 = c.thetaStart + (i / trimPts) * (Math.PI / 2)
        const t1 = c.thetaStart + ((i + 1) / trimPts) * (Math.PI / 2)
        const x0 = c.cx + radTop * Math.sin(t0), z0 = c.cz + radTop * Math.cos(t0)
        const x1 = c.cx + radTop * Math.sin(t1), z1 = c.cz + radTop * Math.cos(t1)
        const segLen = Math.hypot(x1 - x0, z1 - z0)
        const angle = Math.atan2(x1 - x0, z1 - z0)

        _tq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle)
        _ts.set(1, 1, segLen)
        _tm4.compose(new THREE.Vector3((x0 + x1) / 2, trimY, (z0 + z1) / 2), _tq, _ts)
        trimInstanced.setMatrixAt(trimIdx++, _tm4)
      }
    }
    this.scene.add(trimInstanced)
  }

  _buildBoostStrip() {
    const hw = ARENA_W / 2
    const hd = ARENA_D / 2
    const R = 36
    const r = 12
    const SINK = 1
    const STRIP_W = 3.5
    const STRIP_H = 0.12
    const STRIP_Y = 0.08

    const stripMat = new THREE.MeshStandardMaterial({
      color: 0xeab308, emissive: 0xeab308, emissiveIntensity: 1.5,
      toneMapped: false, roughness: 0.3, metalness: 0.6
    })

    const floorPhi = Math.acos(1 - SINK / r)
    const wallBaseOffset = r * (1 - Math.sin(floorPhi))

    const segments = [
      { axis: 'x', wallPos: -hd, sign: 1, from: -(hw - R), to: hw - R },
      { axis: 'x', wallPos: hd, sign: -1, from: -(hw - R), to: hw - R },
      { axis: 'z', wallPos: -hw, sign: 1, from: -(hd - R), to: hd - R },
      { axis: 'z', wallPos: hw, sign: -1, from: -(hd - R), to: hd - R },
    ]

    for (const seg of segments) {
      const len = seg.to - seg.from
      const stripPos = seg.wallPos + seg.sign * wallBaseOffset
      if (seg.axis === 'x') {
        const geom = new THREE.BoxGeometry(len, STRIP_H, STRIP_W)
        const mesh = new THREE.Mesh(geom, stripMat)
        mesh.position.set((seg.from + seg.to) / 2, STRIP_Y, stripPos)
        this.scene.add(mesh)
      } else {
        const geom = new THREE.BoxGeometry(STRIP_W, STRIP_H, len)
        const mesh = new THREE.Mesh(geom, stripMat)
        mesh.position.set(stripPos, STRIP_Y, (seg.from + seg.to) / 2)
        this.scene.add(mesh)
      }
    }

    const cornerArcRadius = R - r + wallBaseOffset
    const corners = [
      { cx: -hw + R, cz: -hd + R, thetaStart: Math.PI },
      { cx:  hw - R, cz: -hd + R, thetaStart: Math.PI * 0.5 },
      { cx:  hw - R, cz:  hd - R, thetaStart: 0 },
      { cx: -hw + R, cz:  hd - R, thetaStart: Math.PI * 1.5 },
    ]
    const ARC_SEGS = 16

    for (const c of corners) {
      const pts = []
      for (let i = 0; i <= ARC_SEGS; i++) {
        const theta = c.thetaStart + (i / ARC_SEGS) * (Math.PI / 2)
        pts.push(new THREE.Vector3(
          c.cx + cornerArcRadius * Math.sin(theta),
          STRIP_Y,
          c.cz + cornerArcRadius * Math.cos(theta)
        ))
      }
      const curve = new THREE.CatmullRomCurve3(pts)
      const extGeom = new THREE.TubeGeometry(curve, ARC_SEGS, STRIP_W / 2, 4, false)
      const mesh = new THREE.Mesh(extGeom, stripMat)
      this.scene.add(mesh)
    }

    this._boostStripParams = { hw, hd, R, r, wallBaseOffset, cornerArcRadius }
  }

  isOnBoostStrip(pos) {
    if (!this._boostStripParams) return false
    if (pos.y > 2) return false

    const { hw, hd, R, wallBaseOffset, cornerArcRadius } = this._boostStripParams
    const HALF_W = 1.5
    const x = pos.x, z = pos.z

    const stripN = -hd + wallBaseOffset
    const stripS = hd - wallBaseOffset
    const stripW = -hw + wallBaseOffset
    const stripE = hw - wallBaseOffset

    if (Math.abs(z - stripN) < HALF_W && x > -(hw - R) && x < (hw - R)) return true
    if (Math.abs(z - stripS) < HALF_W && x > -(hw - R) && x < (hw - R)) return true
    if (Math.abs(x - stripW) < HALF_W && z > -(hd - R) && z < (hd - R)) return true
    if (Math.abs(x - stripE) < HALF_W && z > -(hd - R) && z < (hd - R)) return true

    const corners = [
      { cx: -hw + R, cz: -hd + R, thetaStart: Math.PI },
      { cx:  hw - R, cz: -hd + R, thetaStart: Math.PI * 0.5 },
      { cx:  hw - R, cz:  hd - R, thetaStart: 0 },
      { cx: -hw + R, cz:  hd - R, thetaStart: Math.PI * 1.5 },
    ]
    for (const c of corners) {
      const dx = x - c.cx, dz = z - c.cz
      const dist = Math.hypot(dx, dz)
      if (Math.abs(dist - cornerArcRadius) < HALF_W) {
        let a = Math.atan2(dx, dz) - c.thetaStart
        while (a < 0) a += Math.PI * 2
        while (a > Math.PI * 2) a -= Math.PI * 2
        if (a <= Math.PI / 2 + 0.05) return true
      }
    }
    return false
  }
}
