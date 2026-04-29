import * as THREE from 'three';
import { isMobile } from '../util/detect.js';

// ── Particle pool ──

class ParticleSystem {
  constructor(scene, poolSize = 160) {
    this.pool = [];
    const geom = new THREE.SphereGeometry(0.08, 5, 3);
    for (let i = 0; i < poolSize; i++) {
      const mat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, mat, alive: false, x:0, y:0, z:0, vx:0, vy:0, vz:0, gravity:-18, age:0, lifetime:0.6, size:1 });
    }
  }

  burst(pos, count, color, opts = {}) {
    if (!pos) return;
    const speed = opts.speed ?? 9; const lifetime = opts.lifetime ?? 0.6;
    const gravity = opts.gravity ?? -18; const size = opts.size ?? 1.0; const upBias = opts.upBias ?? 0;
    for (let i = 0; i < count; i++) {
      const p = this.pool.find(x => !x.alive);
      if (!p) return;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const sp    = (0.4 + Math.random() * 0.6) * speed;
      p.x = pos.x; p.y = pos.y; p.z = pos.z;
      p.vx = Math.sin(phi) * Math.cos(theta) * sp;
      p.vy = Math.sin(phi) * Math.sin(theta) * sp + upBias;
      p.vz = Math.cos(phi) * sp;
      p.gravity = gravity; p.age = 0;
      p.lifetime = lifetime * (0.7 + Math.random() * 0.6);
      p.size = size * (0.7 + Math.random() * 0.6);
      p.alive = true;
      p.mat.color.set(color); p.mat.opacity = 1;
      p.mesh.position.set(p.x, p.y, p.z); p.mesh.scale.setScalar(p.size); p.mesh.visible = true;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.lifetime) { p.alive = false; p.mesh.visible = false; continue; }
      p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.mesh.position.set(p.x, p.y, p.z);
      const t = p.age / p.lifetime;
      p.mat.opacity = 1 - t; p.mesh.scale.setScalar(p.size * (1 - t * 0.5));
    }
  }
}

// ── Skid mark system ──

class SkidMarkSystem {
  constructor(scene, poolSize) {
    this._marks = []
    this._idx = 0
    this._poolSize = poolSize
    const geom = new THREE.PlaneGeometry(0.3, 0.6)
    for (let i = 0; i < poolSize; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x88ccff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
      })
      const mesh = new THREE.Mesh(geom, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      scene.add(mesh)
      this._marks.push({ mesh, mat, age: 99 })
    }
  }

  add(pos, angle) {
    const m = this._marks[this._idx]
    this._idx = (this._idx + 1) % this._poolSize
    m.mesh.position.set(pos.x, pos.y, pos.z)
    m.mesh.rotation.y = angle
    m.mat.opacity = 0.4
    m.mesh.visible = true
    m.age = 0
  }

  update(dt) {
    for (const m of this._marks) {
      if (m.age >= 4) continue
      m.age += dt
      m.mat.opacity = Math.max(0, 0.4 * (1 - m.age / 4))
      if (m.age >= 4) m.mesh.visible = false
    }
  }
}

// ── Damage numbers (floating text) ──

class DamageNumbers {
  constructor(scene, camera, poolSize = 32) {
    this._scene = scene
    this._camera = camera
    this._numbers = []
    const geom = new THREE.PlaneGeometry(0.6, 0.6)

    for (let i = 0; i < poolSize; i++) {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const tex = new THREE.CanvasTexture(canvas)
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })
      const mesh = new THREE.Mesh(geom, mat)
      mesh.visible = false
      scene.add(mesh)
      this._numbers.push({ mesh, mat, canvas, tex, age: 99, lifetime: 1.2, x: 0, y: 0, z: 0, vy: 4 })
    }
  }

  spawn(pos, damage) {
    const n = this._numbers.find(x => x.age >= x.lifetime)
    if (!n) return
    n.x = pos.x
    n.y = pos.y + 1.5
    n.z = pos.z
    n.age = 0
    n.mesh.position.set(n.x, n.y, n.z)
    n.mesh.visible = true
    n.mat.opacity = 1

    const ctx = n.canvas.getContext('2d')
    ctx.clearRect(0, 0, 128, 128)
    ctx.fillStyle = '#ff4444'
    ctx.font = 'bold 64px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(Math.floor(damage)), 64, 64)
    n.tex.needsUpdate = true
  }

  update(dt) {
    for (const n of this._numbers) {
      if (n.age >= n.lifetime) continue
      n.age += dt
      n.y += n.vy * dt
      n.mesh.position.y = n.y
      if (this._camera) n.mesh.quaternion.copy(this._camera.quaternion)
      const t = n.age / n.lifetime
      n.mat.opacity = Math.max(0, 1 - t)
      n.mesh.scale.setScalar(1 + t * 0.3)
      if (n.age >= n.lifetime) n.mesh.visible = false
    }
  }
}

// ── Speed lines (desktop only) ──

class SpeedLines {
  constructor() {
    this._el = document.createElement('div')
    this._el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden;opacity:0'
    this._lines = []
    const angles = [15, 45, 75, 105, 135, 165]
    for (const deg of angles) {
      const line = document.createElement('div')
      const rad = deg * Math.PI / 180
      const x = 50 + Math.cos(rad) * 55
      const y = 50 + Math.sin(rad) * 55
      line.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:2px;height:120px;background:white;transform-origin:center bottom;transform:rotate(${deg + 90}deg);opacity:0.6`
      this._el.appendChild(line)
      this._lines.push(line)
    }
    document.body.appendChild(this._el)
  }

  update(speed) {
    const opacity = Math.max(0, Math.min(0.3, (speed - 15) / 15))
    this._el.style.opacity = String(opacity)
  }
}

// ── Effects manager ──

export class Effects {
  constructor(scene, camera) {
    this.particles = new ParticleSystem(scene, isMobile ? 80 : 160);
    this.skidMarks = new SkidMarkSystem(scene, isMobile ? 40 : 80);
    this.camera    = camera;
    this.damageNumbers = new DamageNumbers(scene, camera.camera, 32);
    this.flashEl   = document.getElementById('flash-overlay');
    this._speedLines = isMobile ? null : new SpeedLines();

    window.addEventListener('car:hit',        (e) => this._onHit(e.detail));
    window.addEventListener('car:boost',      (e) => this._onBoost(e.detail));
    window.addEventListener('car:eliminated', (e) => this._onEliminated(e.detail));
    window.addEventListener('obstacle:hit',   (e) => this._onBarrelHit(e.detail));
    window.addEventListener('car:skid',       (e) => this._onSkid(e.detail));
    window.addEventListener('car:land',       (e) => this._onLand(e.detail));
    window.addEventListener('car:fire',       (e) => this._onFire(e.detail));
    window.addEventListener('barrel:explode', (e) => this._onBarrelExplode(e.detail));
    this._scene = scene;
    this._localSlot = -1;
  }

  setLocalSlot(slot) { this._localSlot = slot }

  _onHit(d) {
    const damage = d?.damage ?? 10;
    this.particles.burst(d?.pos, 16, 0xff3300, { speed: 10, lifetime: 0.5 });
    if (d?.pos) this.damageNumbers.spawn(d.pos, damage);
    if (d?.slot === this._localSlot) {
      this.camera.shake(Math.min(0.6, 0.15 + damage * 0.015));
      this._flash(Math.min(0.3, damage / 60));
    }
  }

  _onBoost(d) {
    this.particles.burst(d?.pos, 14, 0x44ddff, { speed: 8, lifetime: 0.35, gravity: 0 });
    this.particles.burst(d?.pos, 8, 0xffffff, { speed: 5, lifetime: 0.25, gravity: 0 });
    if (d?.slot === this._localSlot) this.camera.shake(0.18);
  }

  _onEliminated(d) {
    this.particles.burst(d?.pos, 40, 0xffaa00, { speed: 14, lifetime: 1.0, upBias: 5 });
    this.particles.burst(d?.pos, 20, 0xffff00, { speed: 8,  lifetime: 0.8 });
    this.camera.shake(0.6);
    this._flash(0.45);

    if (d?.pos) {
      const light = new THREE.PointLight(0xffaa00, 5, 30)
      light.position.set(d.pos.x, d.pos.y + 1, d.pos.z)
      this._scene.add(light)
      const start = performance.now()
      const fade = () => {
        const elapsed = performance.now() - start
        if (elapsed >= 300) { this._scene.remove(light); light.dispose(); return }
        light.intensity = 5 * (1 - elapsed / 300)
        requestAnimationFrame(fade)
      }
      requestAnimationFrame(fade)

      const colorTable = [0xef4444, 0x22c55e, 0x3b82f6, 0xeab308]
      const carColor = d.slot != null ? colorTable[d.slot % colorTable.length] : 0xffaa00
      const debrisColors = [carColor, 0xe2e8f0, 0x94a3b8, carColor]
      for (let i = 0; i < 4; i++) {
        const size = 0.15 + Math.random() * 0.2
        const geom = new THREE.BoxGeometry(size, size, size)
        const mat = new THREE.MeshBasicMaterial({ color: debrisColors[i], transparent: true, opacity: 1 })
        const mesh = new THREE.Mesh(geom, mat)
        mesh.position.set(d.pos.x, d.pos.y + 0.5, d.pos.z)
        this._scene.add(mesh)
        const vx = (Math.random() - 0.5) * 8
        const vy = 3 + Math.random() * 5
        const vz = (Math.random() - 0.5) * 8
        const dStart = performance.now()
        const animateDebris = () => {
          const dt = (performance.now() - dStart) / 1000
          if (dt >= 2) { this._scene.remove(mesh); geom.dispose(); mat.dispose(); return }
          mesh.position.x = d.pos.x + vx * dt
          mesh.position.y = d.pos.y + 0.5 + vy * dt - 9.8 * dt * dt
          mesh.position.z = d.pos.z + vz * dt
          mesh.rotation.x += 0.1; mesh.rotation.z += 0.08
          mat.opacity = Math.max(0, 1 - dt / 2)
          requestAnimationFrame(animateDebris)
        }
        requestAnimationFrame(animateDebris)
      }
    }
  }

  _onBarrelHit(d) {
    this.particles.burst(d?.pos, 12, 0xff8800, { speed: 8, lifetime: 0.45 });
    this.camera.shake(0.14);
  }

  _flash(intensity) {
    if (!this.flashEl) return;
    this.flashEl.style.opacity = String(Math.min(1, intensity));
    setTimeout(() => { if (this.flashEl) this.flashEl.style.opacity = '0'; }, 120);
  }

  _onLand(d) {
    const intensity = Math.min(1, (d.fallSpeed || 0) / 15)
    this.particles.burst(d?.pos, 20, 0xfbbf24, { speed: 6 * intensity + 3, lifetime: 0.7, gravity: -12, upBias: 3 })
    this.camera.shake(0.15 + intensity * 0.4)
  }

  _onFire(d) {
    if (!d?.pos) return
    const colorTable = [0xef4444, 0x22c55e, 0x3b82f6, 0xeab308]
    const color = d.slot != null ? colorTable[d.slot % colorTable.length] : 0xeab308
    this.particles.burst(d.pos, 4, color, { speed: 5, lifetime: 0.15, size: 0.5 })
  }

  _onBarrelExplode(d) {
    if (!d?.pos) return
    this.particles.burst(d.pos, 30, 0xffaa00, { speed: 12, lifetime: 0.8, upBias: 4 })
    this.particles.burst(d.pos, 15, 0xffff00, { speed: 8, lifetime: 0.5, upBias: 2 })
    this.particles.burst(d.pos, 10, 0xe2e8f0, { speed: 6, lifetime: 1.0, gravity: -8 })
    this.camera.shake(0.4)
    this._flash(0.25)

    const light = new THREE.PointLight(0xffaa00, 6, 25)
    light.position.set(d.pos.x, d.pos.y + 1, d.pos.z)
    this._scene.add(light)
    const start = performance.now()
    const fade = () => {
      const elapsed = performance.now() - start
      if (elapsed >= 400) { this._scene.remove(light); light.dispose(); return }
      light.intensity = 6 * (1 - elapsed / 400)
      requestAnimationFrame(fade)
    }
    requestAnimationFrame(fade)
  }

  _onSkid(d) {
    if (d.left) this.skidMarks.add(d.left, d.angle)
    if (d.right) this.skidMarks.add(d.right, d.angle)
  }

  updateSpeedLines(speed) {
    if (this._speedLines) this._speedLines.update(speed)
  }

  update(dt) {
    this.particles.update(dt);
    this.skidMarks.update(dt);
    this.damageNumbers.update(dt);
  }
}
