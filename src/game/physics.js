import RAPIER from '@dimforge/rapier3d-compat';

const GRAVITY = { x: 0, y: -22, z: 0 };

const FIXED_STEP = 1 / 60
const MAX_SUBSTEPS = 4

const _rapierReady = RAPIER.init()

export class Physics {
  constructor() {
    this.world      = null;
    this.RAPIER     = RAPIER;
    this.initialized = false;
  }

  async init() {
    await _rapierReady;
    this.world      = new RAPIER.World(GRAVITY);
    this.initialized = true;
  }

  addGround({ size = 200, thickness = 0.2 } = {}) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -thickness / 2, 0);
    const body = this.world.createRigidBody(bodyDesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size / 2, thickness / 2, size / 2)
        .setFriction(0.8).setRestitution(0.1),
      body
    );
    return body;
  }

  addStaticBox({ cx, cy, cz, hw, hh, hd, friction = 0.5, restitution = 0.3 }) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, hh, hd).setFriction(friction).setRestitution(restitution),
      body
    );
    return body;
  }

  addStaticCylinder({ cx, cy, cz, radius, halfHeight, friction = 0.5, restitution = 0.3 }) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz)
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(halfHeight, radius).setFriction(friction).setRestitution(restitution),
      body
    )
    return body
  }

  addStaticConvexHull({ cx, cy, cz, points, friction = 0.5, restitution = 0.3 }) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz)
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.convexHull(points).setFriction(friction).setRestitution(restitution),
      body
    )
    return body
  }

  // Box body for cars — Y-rotation enabled, X/Z locked to stay flat
  createBoxBody({ position, hw = 1.1, hh = 0.38, hd = 0.65,
                  linearDamping = 0.55, angularDamping = 3.5 }) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(linearDamping)
      .setAngularDamping(angularDamping)
      .setCcdEnabled(true)
      .enabledRotations(true, true, true);

    const body = this.world.createRigidBody(bodyDesc);
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, hh, hd)
        .setFriction(0.6)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0.35)
        .setDensity(0.8),
      body
    );
    return { body, collider };
  }

  // Dynamic box for obstacles (barrels, crates)
  createDynamicBox({ position, hw, hh, hd, density = 0.5, restitution = 0.6 }) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.4)
        .setAngularDamping(1.2)
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, hh, hd)
        .setFriction(0.5).setRestitution(restitution).setDensity(density),
      body
    );
    return { body, collider };
  }

  raycast(origin, direction, maxDistance = 100) {
    const ray = new RAPIER.Ray(origin, direction)
    const hit = this.world.castRayAndGetNormal(ray, maxDistance, true)
    if (!hit) return null
    const d = hit.timeOfImpact
    return {
      distance: d,
      point: {
        x: origin.x + direction.x * d,
        y: origin.y + direction.y * d,
        z: origin.z + direction.z * d
      },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }
    }
  }

  step(dt) {
    if (!this.initialized) return
    this._accumulator = (this._accumulator || 0) + Math.min(dt, 0.05)
    let steps = 0
    while (this._accumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
      this.world.timestep = FIXED_STEP
      this.world.step()
      this._accumulator -= FIXED_STEP
      steps++
    }
    if (this._accumulator > FIXED_STEP) this._accumulator = FIXED_STEP
  }
}
