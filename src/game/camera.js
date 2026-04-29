import * as THREE from 'three';

const BASE_FOV    = 72;
const MAX_FOV     = 90;
const CHASE_H     = 5.5;
const CHASE_DIST  = 13;
const RATE_POS    = 5.5;
const RATE_LOOK   = 10;
const RATE_FOV    = 5;

const _camQ = new THREE.Quaternion()
const _camV = new THREE.Vector3()
const _camBehind = new THREE.Vector3()
const _camOffset = new THREE.Vector3()

function smoothAlpha(rate, dt) {
  return 1 - Math.exp(-rate * Math.max(0, dt));
}

export class GameCamera {
  constructor(threeCamera) {
    this.camera        = threeCamera;
    this._desiredPos   = new THREE.Vector3();
    this._desiredLook  = new THREE.Vector3();
    this._currentLook  = new THREE.Vector3();
    this._fovTarget    = BASE_FOV;
    this._shakeAmount  = 0;
    this._shakeDecay   = 5.0;
    this._shakeOffset  = new THREE.Vector3();

    // Direction the camera trails behind (updated from car heading)
    this._trailDir = new THREE.Vector3(0, 0, 1);
  }

  shake(amplitude) {
    this._shakeAmount = Math.max(this._shakeAmount, amplitude);
  }

  snapTo(car) {
    if (!car) return
    const pos = car.position
    const rot = car.rotation
    _camQ.set(rot.x, rot.y, rot.z, rot.w)
    const facing = _camV.set(0, 0, -1).applyQuaternion(_camQ)
    this._trailDir.set(-facing.x, 0, -facing.z).normalize()
    _camOffset.copy(this._trailDir).multiplyScalar(CHASE_DIST)
    this.camera.position.set(pos.x + _camOffset.x, pos.y + CHASE_H, pos.z + _camOffset.z)
    this._desiredPos.copy(this.camera.position)
    this._currentLook.set(pos.x, pos.y + 1.2, pos.z)
    this._desiredLook.copy(this._currentLook)
    this.camera.lookAt(this._currentLook)
    this.camera.fov = BASE_FOV
    this.camera.updateProjectionMatrix()
  }

  update(dt, car) {
    if (!car) return;

    const pos = car.position;
    const vel = car.velocity;
    const speed = Math.hypot(vel.x, vel.z);

    // Chase direction: blend toward car's current facing
    const rot = car.rotation;
    _camQ.set(rot.x, rot.y, rot.z, rot.w);
    const facing = _camV.set(0, 0, -1).applyQuaternion(_camQ);
    _camBehind.set(-facing.x, 0, -facing.z).normalize();
    this._trailDir.lerp(_camBehind, smoothAlpha(3.0, dt));

    _camOffset.copy(this._trailDir).multiplyScalar(CHASE_DIST);
    this._desiredPos.set(
      pos.x + _camOffset.x,
      pos.y + CHASE_H,
      pos.z + _camOffset.z
    );

    this.camera.position.lerp(this._desiredPos, smoothAlpha(RATE_POS, dt));

    // Look at car, slightly ahead in movement direction
    const lookAhead = 0.22;
    this._desiredLook.set(
      pos.x + vel.x * lookAhead,
      pos.y + 1.2,
      pos.z + vel.z * lookAhead
    );
    this._currentLook.lerp(this._desiredLook, smoothAlpha(RATE_LOOK, dt));
    this.camera.lookAt(this._currentLook);

    // FOV widens with speed
    this._fovTarget = BASE_FOV + THREE.MathUtils.clamp((speed - 8) * 0.8, 0, MAX_FOV - BASE_FOV);
    const fovDelta = this._fovTarget - this.camera.fov;
    if (Math.abs(fovDelta) > 0.01) {
      this.camera.fov += fovDelta * smoothAlpha(RATE_FOV, dt);
      this.camera.fov  = THREE.MathUtils.clamp(this.camera.fov, BASE_FOV - 5, MAX_FOV);
      this.camera.updateProjectionMatrix();
    }

    // Screenshake
    if (this._shakeAmount > 0.001) {
      this._shakeOffset.set(
        (Math.random() - 0.5) * this._shakeAmount * 2,
        (Math.random() - 0.5) * this._shakeAmount,
        (Math.random() - 0.5) * this._shakeAmount * 2
      );
      this.camera.position.add(this._shakeOffset);
      this._shakeAmount = Math.max(0, this._shakeAmount - this._shakeDecay * dt);
    }
  }
}
