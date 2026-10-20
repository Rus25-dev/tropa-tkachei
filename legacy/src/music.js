// ===== МУЗЫКА: процедурный секвенсор на WebAudio (без файлов) =====
// Каждый трек — темп, аккорды и набор партий. Шаг = шестнадцатая (или восьмая в вальсе).
const noteNum = (name) => { const m = { C: 0, 'C#': 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 }; return m[name]; };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const chordNotes = (root, q) => { const r = noteNum(root); return q === 'm' ? [r, r + 3, r + 7] : q === '7' ? [r, r + 4, r + 7, r + 10] : [r, r + 4, r + 7]; };

const TRACKS = {
  menu: { bpm: 68, steps: 16, chords: [['D', 'm'], ['Bb', ''], ['F', ''], ['C', '']], parts: ['pad', 'arpSoft', 'bassLong'] },
  cave: { bpm: 62, steps: 16, chords: [['A', 'm'], ['F', ''], ['C', ''], ['G', ''], ['A', 'm'], ['E', 'm'], ['F', ''], ['G', '']], parts: ['pad', 'drops', 'bassLong'] },
  boss: { bpm: 128, steps: 16, chords: [['E', 'm'], ['C', ''], ['D', ''], ['B', 'm']], parts: ['padDark', 'bass8', 'kick', 'hat', 'arpFast'] },
  misha: { bpm: 140, steps: 16, chords: [['G', 'm'], ['Eb', ''], ['Bb', ''], ['F', '']], parts: ['bass8', 'kick', 'type', 'leadSquare', 'snare'] },
  vladik: { bpm: 168, steps: 12, waltz: true, chords: [['A', 'm'], ['D', 'm'], ['E', ''], ['A', 'm'], ['F', ''], ['D', 'm'], ['E', '7'], ['A', 'm']], parts: ['waltzBass', 'waltzChord', 'violin'] },
  tima: { bpm: 150, steps: 16, chords: [['C', 'm'], ['Ab', ''], ['Bb', ''], ['G', '']], parts: ['chipBass', 'kick', 'snare', 'chipArp', 'hat'] },
};

const Music = {
  out: null, cur: null, want: null, timer: null, nextT: 0, step: 0, bar: 0, duck: 1,
  ctx() { return Snd.ctx; },
  vol() { return (typeof Settings !== 'undefined' && Settings.s ? Settings.s.mvol : 60) / 100; },
  ensure() {
    const c = this.ctx(); if (!c) return false;
    if (!this.out) {
      this.out = c.createGain(); this.out.gain.value = 0;
      this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 9000;
      // общий «зал»: короткое эхо делает звук объёмнее
      this.dly = c.createDelay(1); this.dly.delayTime.value = 0.27; this.fb = c.createGain(); this.fb.gain.value = 0.28;
      this.wet = c.createGain(); this.wet.gain.value = 0.22;
      this.bus = c.createGain();
      this.bus.connect(this.lp); this.lp.connect(this.out);
      this.bus.connect(this.dly); this.dly.connect(this.fb); this.fb.connect(this.dly); this.dly.connect(this.wet); this.wet.connect(this.out);
      this.out.connect(c.destination);
    }
    return true;
  },
  setVolume() { if (!this.out) return; const c = this.ctx(); this.out.gain.setTargetAtTime(0.32 * this.vol() * this.duck, c.currentTime, 0.15); },
  setDuck(d) { this.duck = d; this.setVolume(); if (this.lp) this.lp.frequency.setTargetAtTime(d < 1 ? 1400 : 9000, this.ctx().currentTime, 0.2); },
  play(name) {
    this.want = name;
    if (!this.ensure()) return; // запустится после первого касания/клика
    if (this.cur === name && this.timer) return;
    const c = this.ctx();
    this.cur = name; this.step = 0; this.bar = 0; this.nextT = c.currentTime + 0.12;
    this.out.gain.cancelScheduledValues(c.currentTime); this.out.gain.setValueAtTime(0.0001, c.currentTime); this.setVolume();
    if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
  },
  stop() { this.want = null; this.cur = null; if (this.timer) { clearInterval(this.timer); this.timer = null; } if (this.out) this.out.gain.setTargetAtTime(0.0001, this.ctx().currentTime, 0.2); },
  resume() { if (this.want && this.cur !== this.want) { const w = this.want; this.cur = null; this.play(w); } },
  tick() {
    const c = this.ctx(), tr = TRACKS[this.cur]; if (!c || !tr || c.state !== 'running') return;
    const dt = 60 / (tr.bpm * (this.intensity || 1)) / (tr.waltz ? 2 : 4);
    while (this.nextT < c.currentTime + 0.15) {
      const cd = tr.chords[this.bar % tr.chords.length], ch = chordNotes(cd[0], cd[1]);
      for (const part of tr.parts) this.parts[part].call(this, this.step, ch, this.nextT, dt, tr);
      this.nextT += dt; this.step++;
      if (this.step >= tr.steps) { this.step = 0; this.bar++; }
    }
  },
  // ----- инструменты -----
  osc(type, f, t, dur, vol, opt) {
    const c = this.ctx(), o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (opt && opt.detune) o.detune.value = opt.detune;
    if (opt && opt.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = opt.vib; lg.gain.value = f * 0.012; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
    const a = (opt && opt.att) || 0.005, r = (opt && opt.rel) || dur;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + r);
    let node = o;
    if (opt && opt.lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = opt.lp; o.connect(f2); node = f2; }
    node.connect(g); g.connect(this.bus); o.start(t); o.stop(t + a + r + 0.05);
  },
  noise(t, dur, vol, freq, type) {
    const c = this.ctx(); if (!Snd.noise) return;
    const s = c.createBufferSource(); s.buffer = Snd.noise; const f = c.createBiquadFilter(); f.type = type || 'highpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  },
  parts: {
    pad(s, ch, t, dt) { if (s !== 0) return; for (const n of ch.slice(0, 3)) for (const d of [-7, 7]) this.osc('sawtooth', mtof(48 + n), t, dt * 16, 0.018, { att: dt * 5, rel: dt * 13, detune: d, lp: 900 }); },
    padDark(s, ch, t, dt) { if (s !== 0) return; for (const n of ch.slice(0, 3)) this.osc('sawtooth', mtof(45 + n), t, dt * 16, 0.016, { att: dt * 2, rel: dt * 15, detune: 6, lp: 700 }); },
    arpSoft(s, ch, t, dt) { if (s % 2) return; const seq = [0, 1, 2, 1, 0, 2, 1, 2]; const n = ch[seq[(s / 2) % 8] % ch.length]; this.osc('triangle', mtof(64 + n), t, dt * 2, 0.04, { rel: dt * 3 }); },
    drops(s, ch, t, dt) { if (s % 3 || Math.random() > 0.45) return; const n = ch[Math.floor(Math.random() * ch.length)] + (Math.random() < 0.4 ? 12 : 0); this.osc('sine', mtof(72 + n), t, dt * 4, 0.035, { rel: dt * 6 }); },
    bassLong(s, ch, t, dt) { if (s === 0) this.osc('sine', mtof(36 + ch[0]), t, dt * 16, 0.07, { att: 0.05, rel: dt * 14 }); },
    bass8(s, ch, t, dt) { if (s % 2) return; const oct = s % 8 === 6 ? 12 : 0; this.osc('square', mtof(33 + ch[0] + oct), t, dt * 1.6, 0.045, { rel: dt * 1.4, lp: 600 }); },
    kick(s, ch, t) { if (s % 4) return; const c = this.ctx(), o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.2); },
    hat(s, ch, t) { if (s % 4 === 2) this.noise(t, 0.04, 0.05, 7000); },
    snare(s, ch, t) { if (s === 4 || s === 12) { this.noise(t, 0.14, 0.12, 1800, 'bandpass'); this.osc('triangle', 190, t, 0.08, 0.05, { rel: 0.08 }); } },
    arpFast(s, ch, t, dt) { const seq = [0, 1, 2, 1]; this.osc('sawtooth', mtof(60 + ch[seq[s % 4] % ch.length] + (s >= 8 ? 12 : 0)), t, dt, 0.022, { rel: dt * 0.9, lp: 2200 }); },
    type(s, ch, t) { if (Math.random() < 0.55) this.noise(t, 0.02, 0.06, 4500 + Math.random() * 3000); if (s === 15) this.osc('sine', 2093, t, 0.1, 0.03, { rel: 0.12 }); },
    leadSquare(s, ch, t, dt) {
      const mel = [0, -1, 2, -1, 1, -1, 0, -1, 2, -1, 3, -1, 2, 1, 0, -1];
      const i = mel[s]; if (i < 0) return; const n = i === 3 ? ch[0] + 12 : ch[i % ch.length];
      this.osc('square', mtof(67 + n), t, dt * 1.5, 0.028, { rel: dt * 1.4, lp: 2600 });
    },
    waltzBass(s, ch, t, dt) { if (s === 0 || s === 6) this.osc('triangle', mtof(36 + ch[0] + (s === 6 ? 7 : 0)), t, dt * 2, 0.08, { rel: dt * 2 }); },
    waltzChord(s, ch, t, dt) { if (s === 2 || s === 4 || s === 8 || s === 10) for (const n of ch.slice(0, 3)) this.osc('triangle', mtof(57 + n), t, dt, 0.022, { rel: dt * 0.9 }); },
    violin(s, ch, t, dt) {
      const mel = [[0, 0, 4], [2, 1, 2], [4, 2, 2], [6, 1, 4], [10, 0, 2]];
      for (const [st, idx, len] of mel) if (s === st) {
        const up = this.bar % 2 ? 12 : 0, n = ch[idx % ch.length];
        this.osc('sawtooth', mtof(69 + n + up - 12), t, dt * len, 0.03, { att: 0.06, rel: dt * len, vib: 5.5, lp: 3000 });
      }
    },
    chipBass(s, ch, t, dt) { if (s % 2) return; const n = ch[0] + (s % 4 === 2 ? 12 : 0); this.osc('triangle', mtof(36 + n), t, dt * 1.8, 0.09, { rel: dt * 1.7 }); },
    chipArp(s, ch, t, dt) { const n = ch[s % ch.length] + (Math.floor(s / 4) % 2 ? 12 : 0); this.osc('square', mtof(72 + n), t, dt * 0.9, 0.02, { rel: dt * 0.8 }); },
  },
};
