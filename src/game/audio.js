// AudioBus — procedural Web Audio synthesis for WRECKYARD
// All sounds generated on-the-fly; no external files needed.

const SOUNDS = {};

export class AudioBus {
  constructor() {
    this.ctx        = null;
    this.masterGain = null;
    this.muted      = false;
    this.volume     = 0.5;
    this._unlocked  = false;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return

    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);

    const unlock = () => {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this._unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);

    this._wireEvents();
  }

  _wireEvents() {
    window.addEventListener('car:boost',      () => this.play('boost'))
    window.addEventListener('car:hit',        (e) => {
      const d = e.detail
      this.play(d.damage < 0 ? 'heal' : 'hit', d)
    })
    window.addEventListener('car:eliminated', () => this.play('eliminate'))
    window.addEventListener('derby:start',    () => this.play('derby_start'))
    window.addEventListener('derby:winner',   () => this.play('winner'))
    window.addEventListener('obstacle:hit',   () => this.play('barrel_hit'))
    window.addEventListener('car:fire',         () => this.play('gunfire'))
    window.addEventListener('barrel:explode',  () => this.play('barrel_explode'))
    window.addEventListener('car:land',       (e) => this.play('land', e.detail))
  }

  playCountdownBeep(sec) {
    if (!this.ctx || this.muted || !this._unlocked) return
    if (sec > 0) this.play('countdown_beep')
    else this.play('countdown_go')
  }

  updateLowHealth(hp, maxHp) {
    if (!this.ctx || this.muted) return
    if (this.ctx.state !== 'running') return
    const ratio = hp / maxHp
    if (ratio <= 0.25 && ratio > 0) {
      const now = this.ctx.currentTime
      if (!this._lastPulse || now - this._lastPulse > 0.8) {
        this._lastPulse = now
        this.play('low_health')
      }
    }
  }

  play(name, opts = {}) {
    if (!this.ctx || this.muted || !this._unlocked) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    try { fn(this.ctx, this.masterGain, opts); }
    catch (_) {}
  }

  updateEngine(speed) {
    if (!this.ctx || this.muted) return
    if (this.ctx.state !== 'running') return

    if (!this._engineOsc) {
      this._engineOsc = this.ctx.createOscillator()
      this._engineOsc.type = 'sawtooth'
      this._engineOsc.frequency.value = 60
      this._engineGain = this.ctx.createGain()
      this._engineGain.gain.value = 0
      this._engineOsc.connect(this._engineGain)
      this._engineGain.connect(this.masterGain)
      this._engineOsc.start()
    }

    const t = this.ctx.currentTime
    const norm = Math.min(1, speed / 25)
    const freq = 60 + norm * 160
    const gain = 0.03 + norm * 0.12
    this._engineOsc.frequency.setTargetAtTime(freq, t, 0.05)
    this._engineGain.gain.setTargetAtTime(Math.min(0.15, gain), t, 0.05)
  }

  stopEngine() {
    if (!this._engineOsc) return
    try { this._engineOsc.stop() } catch (_) {}
    this._engineOsc.disconnect()
    this._engineGain.disconnect()
    this._engineOsc = null
    this._engineGain = null
  }

  setMuted(m) {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : this.volume;
    if (m && this._engineGain) this._engineGain.gain.value = 0
  }
}

function noise(ctx, sec) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// ── Boost (whoosh) ──
SOUNDS.boost = (ctx, out) => {
  const t = ctx.currentTime
  const ns = ctx.createBufferSource(); ns.buffer = noise(ctx, 0.45)
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'
  f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.4); f.Q.value = 1.2
  const g = ctx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
  ns.connect(f); f.connect(g); g.connect(out); ns.start(t); ns.stop(t + 0.45)
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(120, t); osc.frequency.exponentialRampToValueAtTime(360, t + 0.35)
  const og = ctx.createGain(); og.gain.setValueAtTime(0.18, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
  osc.connect(og); og.connect(out); osc.start(t); osc.stop(t + 0.42)
}

// ── Car hit / crunch ──
SOUNDS.hit = (ctx, out, detail = {}) => {
  const t = ctx.currentTime;
  const intensity = Math.min(1, (detail.damage || 10) / 30);

  const ns = ctx.createBufferSource(); ns.buffer = noise(ctx, 0.25);
  const f  = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.5 + intensity * 0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  ns.connect(f); f.connect(g); g.connect(out); ns.start(t);

  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
  const og = ctx.createGain(); og.gain.setValueAtTime(0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(og); og.connect(out); osc.start(t); osc.stop(t + 0.24);
};

// ── Heal pickup (bright ascending chime) ──
SOUNDS.heal = (ctx, out) => {
  const t = ctx.currentTime
  const notes = [523, 659, 784]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = ctx.createGain()
    const s = t + i * 0.08
    g.gain.setValueAtTime(0.3, s)
    g.gain.exponentialRampToValueAtTime(0.001, s + 0.3)
    osc.connect(g)
    g.connect(out)
    osc.start(s)
    osc.stop(s + 0.32)
  })
  const shimmer = ctx.createOscillator()
  shimmer.type = 'triangle'
  shimmer.frequency.value = 1568
  const sg = ctx.createGain()
  sg.gain.setValueAtTime(0.12, t + 0.15)
  sg.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
  shimmer.connect(sg)
  sg.connect(out)
  shimmer.start(t + 0.15)
  shimmer.stop(t + 0.52)
}

// ── Barrel hit ──
SOUNDS.barrel_hit = (ctx, out) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'square';
  osc.frequency.setValueAtTime(260, t); osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.18);
};

// ── Car eliminated ──
SOUNDS.eliminate = (ctx, out) => {
  const t = ctx.currentTime;
  [280, 220, 160].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const g = ctx.createGain(); const s = t + i * 0.09;
    g.gain.setValueAtTime(0.4, s); g.gain.exponentialRampToValueAtTime(0.001, s + 0.18);
    o.connect(g); g.connect(out); o.start(s); o.stop(s + 0.2);
  });
  const ns = ctx.createBufferSource(); ns.buffer = noise(ctx, 0.4);
  const f  = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  ns.connect(f); f.connect(ng); ng.connect(out); ns.start(t);
};

// ── Derby start countdown beep ──
SOUNDS.derby_start = (ctx, out) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 880;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.25);
};

// ── Winner fanfare ──
SOUNDS.winner = (ctx, out) => {
  const t = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); const s = t + i * 0.1;
    g.gain.setValueAtTime(0.35, s); g.gain.exponentialRampToValueAtTime(0.001, s + 0.3);
    o.connect(g); g.connect(out); o.start(s); o.stop(s + 0.35);
  });
};

// ── Machine gun fire ──
SOUNDS.gunfire = (ctx, out) => {
  const t = ctx.currentTime
  const ns = ctx.createBufferSource(); ns.buffer = noise(ctx, 0.08)
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000
  const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
  ns.connect(f); f.connect(g); g.connect(out); ns.start(t)
  const osc = ctx.createOscillator(); osc.type = 'square'
  osc.frequency.setValueAtTime(400, t); osc.frequency.exponentialRampToValueAtTime(200, t + 0.05)
  const og = ctx.createGain(); og.gain.setValueAtTime(0.15, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
  osc.connect(og); og.connect(out); osc.start(t); osc.stop(t + 0.08)
}

// ── Barrel explosion ──
SOUNDS.barrel_explode = (ctx, out) => {
  const t = ctx.currentTime
  const ns = ctx.createBufferSource(); ns.buffer = noise(ctx, 0.5)
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'
  f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.4)
  const g = ctx.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
  ns.connect(f); f.connect(g); g.connect(out); ns.start(t)
  const osc = ctx.createOscillator(); osc.type = 'sine'
  osc.frequency.setValueAtTime(120, t); osc.frequency.exponentialRampToValueAtTime(30, t + 0.3)
  const og = ctx.createGain(); og.gain.setValueAtTime(0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
  osc.connect(og); og.connect(out); osc.start(t); osc.stop(t + 0.4)
}

// ── Countdown beep (3, 2, 1) ──
SOUNDS.countdown_beep = (ctx, out) => {
  const t = ctx.currentTime
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 660
  const g = ctx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
  osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.18)
}

// ── Countdown GO! ──
SOUNDS.countdown_go = (ctx, out) => {
  const t = ctx.currentTime
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 1320
  const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
  osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.35)
}

// ── Low health warning pulse ──
SOUNDS.low_health = (ctx, out) => {
  const t = ctx.currentTime
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 80
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.2, t); g.gain.setValueAtTime(0.25, t + 0.08)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
  osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.35)
}

// ── Landing impact ──
SOUNDS.land = (ctx, out, detail = {}) => {
  const t = ctx.currentTime
  const intensity = Math.min(1, (detail.fallSpeed || 0) / 15)
  if (intensity < 0.15) return
  const osc = ctx.createOscillator(); osc.type = 'sine'
  osc.frequency.setValueAtTime(100 + intensity * 80, t)
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.15)
  const g = ctx.createGain(); g.gain.setValueAtTime(0.2 + intensity * 0.3, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
  osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.25)
}
