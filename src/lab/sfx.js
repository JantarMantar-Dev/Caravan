// Procedural sound for the asset lab: no audio files, everything is synthesised
// with WebAudio so it stays tiny and can follow the water shader's timing.
//
//   ambient  surf: brown-ish noise through a low-pass, its level swelling with
//            each shore wave (same period as the foam band in water.js)
//   splash   short band-passed noise burst + a falling "plip", panned to the
//            rock it belongs to
//   drop     one hit per asset kind when it lands in the build animation
//
// Browsers only start audio from a user gesture, so nothing plays until
// enable() is called from a click.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.on = false;
  }

  enable() {
    if (!this.ctx) this.#init();
    this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.15);
  }

  disable() {
    this.on = false;
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  #init() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // gentle bus compression so stacked drops never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // brown noise for the surf body
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const e = this.brown.getChannelData(0);
    for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; e[i] = b * 3.5; }

    const surf = ctx.createBufferSource();
    surf.buffer = this.brown; surf.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520;
    this.surfGain = ctx.createGain(); this.surfGain.gain.value = 0;
    surf.connect(lp).connect(this.surfGain).connect(this.master);
    surf.start();

    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise; hiss.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    hiss.connect(bp).connect(this.hissGain).connect(this.master);
    hiss.start();
  }

  // wave: 0..1 phase of the shore wave; water: share of the view that is water
  ambient(wave, water) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const swell = Math.sin(Math.PI * wave) ** 2;
    this.surfGain.gain.setTargetAtTime(water * (0.05 + 0.2 * swell), t, 0.12);
    // the wash: hiss peaks as the wave breaks on the sand (late in the cycle)
    const wash = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (wave - 0.55) / 0.45))));
    this.hissGain.gain.setTargetAtTime(water * (0.012 + 0.05 * wash), t, 0.1);
  }

  #out(pan) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  #burst({ at = 0, freq = 1800, q = 1, type = 'bandpass', attack = 0.004, decay = 0.25, gain = 0.3, pan = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(this.#out(pan));
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }

  #tone({ at = 0, f0 = 200, f1 = 100, dur = 0.15, gain = 0.3, type = 'sine', pan = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.#out(pan));
    o.start(t); o.stop(t + dur + 0.05);
  }

  // water slapping a rock or a post
  splash(pan = 0, vol = 1) {
    if (!this.ctx || !this.on) return;
    this.#burst({ freq: 1500 + Math.random() * 900, q: 0.9, decay: 0.22 + Math.random() * 0.12, gain: 0.16 * vol, pan });
    this.#burst({ at: 0.03, freq: 600, q: 0.7, type: 'lowpass', decay: 0.3, gain: 0.12 * vol, pan });
    if (Math.random() < 0.6) this.#tone({ at: 0.02 + Math.random() * 0.05, f0: 900 + Math.random() * 500, f1: 380, dur: 0.07, gain: 0.04 * vol, pan });
  }

  // an asset landing during the build animation
  drop(kind, pan = 0, wet = false) {
    if (!this.ctx || !this.on) return;
    const k = KIND_SOUND[kind] ?? 'wood';
    if (k === 'water') {
      this.#burst({ freq: 900, q: 0.5, type: 'lowpass', attack: 0.12, decay: 0.7, gain: 0.25, pan });
      this.#burst({ at: 0.1, freq: 2600, q: 0.8, decay: 0.4, gain: 0.08, pan });
    } else if (k === 'land') {
      this.#tone({ f0: 70, f1: 40, dur: 0.35, gain: 0.35, pan });
      this.#burst({ freq: 400, q: 0.7, type: 'lowpass', decay: 0.35, gain: 0.2, pan });
    } else if (k === 'rock') {
      this.#tone({ f0: 120, f1: 50, dur: 0.22, gain: 0.4, pan });
      this.#burst({ freq: 900, q: 1.2, decay: 0.12, gain: 0.18, pan });
    } else if (k === 'build') {
      this.#tone({ f0: 95, f1: 55, dur: 0.3, gain: 0.45, pan });
      this.#burst({ freq: 1400, q: 1.5, decay: 0.08, gain: 0.2, pan });
      this.#burst({ at: 0.06, freq: 300, q: 0.7, type: 'lowpass', decay: 0.4, gain: 0.18, pan });
    } else if (k === 'tile') {
      for (let i = 0; i < 3; i++) this.#tone({ at: i * 0.035, f0: 1800 - i * 200, f1: 1200, dur: 0.05, gain: 0.07, type: 'triangle', pan });
      this.#tone({ f0: 160, f1: 90, dur: 0.15, gain: 0.25, pan });
    } else if (k === 'leaf') {
      this.#burst({ freq: 3200, q: 0.5, attack: 0.03, decay: 0.28, gain: 0.12, pan });
      this.#tone({ f0: 160, f1: 90, dur: 0.12, gain: 0.18, pan });
    } else {                                    // wood: crates, barrels, posts
      this.#tone({ f0: 240, f1: 120, dur: 0.12, gain: 0.3, type: 'triangle', pan });
      this.#burst({ freq: 2200, q: 2, decay: 0.05, gain: 0.2, pan });
    }
    if (wet) this.splash(pan, 0.8);
  }

  chime() {
    if (!this.ctx || !this.on) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.#tone({ at: i * 0.09, f0: f, f1: f * 0.995, dur: 0.6, gain: 0.07, type: 'triangle' }));
  }

  click() {
    if (!this.ctx || !this.on) return;
    this.#tone({ f0: 1400, f1: 900, dur: 0.04, gain: 0.05, type: 'triangle' });
  }
}

const KIND_SOUND = {
  water: 'water', sand: 'land', ground: 'land', road: 'land',
  rock: 'rock', ledge: 'rock', wall: 'rock', tower: 'build', building: 'build', body: 'build', roof: 'tile',
  tree: 'leaf', bush: 'leaf', heather: 'leaf', palm: 'leaf', crop: 'leaf',
};
