// ===== ЗВУК: маленький синтезатор на WebAudio =====
const Snd = {
  ctx: null, noise: null, master: null,
  init() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.35 * ((typeof Settings !== 'undefined' && Settings.s ? Settings.s.vol : 80) / 100); this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = b;
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
      if (typeof Music !== 'undefined') setTimeout(() => Music.resume(), 60);
    } catch (e) { /* звук недоступен */ }
  },
  tone(type, f0, f1, dur, vol) {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  hiss(dur, vol, freq, q) {
    const c = this.ctx; if (!c || !this.noise) return; const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  },
  play(n) {
    if (!this.ctx) return;
    switch (n) {
      case 'jump': this.tone('square', 260, 420, 0.09, 0.05); break;
      case 'land': this.hiss(0.06, 0.08, 400, 0.8); break;
      case 'slash': this.hiss(0.09, 0.18, 2600, 1.4); break;
      case 'hit': this.tone('triangle', 220, 70, 0.12, 0.25); this.hiss(0.05, 0.12, 1200, 2); break;
      case 'pogo': this.tone('square', 500, 900, 0.07, 0.06); break;
      case 'dash': this.hiss(0.16, 0.14, 900, 0.6); break;
      case 'hurt': this.tone('sawtooth', 240, 60, 0.3, 0.16); break;
      case 'heal': this.tone('sine', 420, 880, 0.35, 0.16); this.tone('sine', 630, 1260, 0.35, 0.08); break;
      case 'bead': this.tone('sine', 1300 + Math.random() * 300, 1800, 0.07, 0.05); break;
      case 'kill': this.tone('triangle', 400, 90, 0.25, 0.2); break;
      case 'roar': this.tone('sawtooth', 110, 45, 1.1, 0.22); this.hiss(1.0, 0.12, 300, 0.5); break;
      case 'slam': this.hiss(0.35, 0.3, 160, 0.6); this.tone('sine', 90, 35, 0.4, 0.3); break;
      case 'spit': this.tone('square', 300, 120, 0.12, 0.06); break;
      case 'bench': this.tone('sine', 523, 523, 0.25, 0.1); this.tone('sine', 784, 784, 0.4, 0.07); break;
      case 'revive': this.tone('sine', 330, 990, 0.5, 0.14); break;
      case 'gate': this.hiss(0.5, 0.2, 220, 0.7); break;
      case 'clink': this.tone('square', 1500, 1100, 0.06, 0.05); this.tone('triangle', 2400, 2000, 0.08, 0.04); break;
      case 'throw': this.hiss(0.1, 0.08, 1500, 1); this.tone('sine', 300, 500, 0.08, 0.05); break;
      case 'puff': this.hiss(0.45, 0.22, 500, 0.4); break;
      case 'cough': [0, 160, 320].forEach((d) => setTimeout(() => { this.hiss(0.12, 0.2, 900, 1.5); this.tone('sawtooth', 180, 120, 0.1, 0.06); }, d)); break;
      case 'pickup': this.tone('sine', 660, 990, 0.12, 0.1); break;
      case 'letter': this.tone('triangle', 900 + Math.random() * 300, 500, 0.08, 0.04); this.hiss(0.06, 0.05, 3000, 2); break;
      case 'violin': { const c = this.ctx, t = c.currentTime, o = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(660, t); o.frequency.linearRampToValueAtTime(990, t + 0.35); l.frequency.value = 7; lg.gain.value = 14;
        l.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g); g.connect(this.master); o.start(t); l.start(t); o.stop(t + 0.55); l.stop(t + 0.55); break; }
      case 'squish': this.hiss(0.35, 0.18, 260, 2.5); this.tone('sine', 140, 70, 0.3, 0.12); break;
      case 'glug': [0, 220, 440].forEach((d) => setTimeout(() => this.tone('sine', 220, 140, 0.15, 0.12), d)); break;
      case 'burp': this.tone('sawtooth', 110, 70, 0.6, 0.18); this.hiss(0.5, 0.06, 200, 0.6); break;
      case 'glass': this.tone('triangle', 2600, 1800, 0.12, 0.08); this.hiss(0.2, 0.12, 4000, 2); break;
      case 'coin': [0, 90].forEach((d, i) => setTimeout(() => this.tone('square', i ? 1320 : 990, i ? 1320 : 990, 0.12, 0.05), d)); break;
      case 'sparkle': for (let i = 0; i < 5; i++) setTimeout(() => this.tone('sine', 1500 + Math.random() * 1500, 2500, 0.1, 0.04), i * 60); break;
      case 'buzz': this.tone('square', 120, 120, 0.35, 0.05); this.tone('square', 123, 123, 0.35, 0.05); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone('triangle', f, f, 0.5, 0.12), i * 140)); break;
    }
  },
};
