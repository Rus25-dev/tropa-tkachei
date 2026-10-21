// Звук: маленький синтезатор на WebAudio (legacy/src/sound.js + звуки оружия из weapons.js и движения из movement2.js). Файлов нет.
// Ядро только называет звук (событие 'snd'); играет его этот модуль.
type OscType = OscillatorType;

class SndImpl {
  ctx: AudioContext | null = null;
  noise: AudioBuffer | null = null;
  master: GainNode | null = null;
  /** громкость звуков 0..100 (настройка «Звук») */
  vol = 80;
  /** вызывается после успешной инициализации (музыка подхватывается) */
  onInit: (() => void) | null = null;
  private charge = new Map<number, { stop(): void }>();

  init(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return;
        this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.35 * (this.vol / 100); this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = b;
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
      if (this.onInit) window.setTimeout(this.onInit, 60);
    } catch { /* звук недоступен */ }
  }
  setVolume(v: number): void { this.vol = v; if (this.master) this.master.gain.value = 0.35 * (v / 100); }

  tone(type: OscType, f0: number, f1: number, dur: number, vol: number): void {
    const c = this.ctx; if (!c || !this.master) return; const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  hiss(dur: number, vol: number, freq: number, q?: number): void {
    const c = this.ctx; if (!c || !this.noise || !this.master) return; const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  }
  private later(ms: number[], fn: (i: number) => void): void { ms.forEach((d, i) => window.setTimeout(() => fn(i), d)); }

  play(n: string): void {
    if (!this.ctx) return;
    const R = Math.random;
    switch (n) {
      case 'jump': this.tone('square', 260, 420, 0.09, 0.05); break;
      case 'land': this.hiss(0.06, 0.08, 400, 0.8); break;
      case 'slash': this.hiss(0.09, 0.18, 2600, 1.4); break;
      case 'hit': this.tone('triangle', 220, 70, 0.12, 0.25); this.hiss(0.05, 0.12, 1200, 2); break;
      case 'pogo': this.tone('square', 500, 900, 0.07, 0.06); break;
      case 'dash': this.hiss(0.16, 0.14, 900, 0.6); break;
      case 'hurt': this.tone('sawtooth', 240, 60, 0.3, 0.16); break;
      case 'heal': this.tone('sine', 420, 880, 0.35, 0.16); this.tone('sine', 630, 1260, 0.35, 0.08); break;
      case 'bead': this.tone('sine', 1300 + R() * 300, 1800, 0.07, 0.05); break;
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
      case 'cough': this.later([0, 160, 320], () => { this.hiss(0.12, 0.2, 900, 1.5); this.tone('sawtooth', 180, 120, 0.1, 0.06); }); break;
      case 'pickup': this.tone('sine', 660, 990, 0.12, 0.1); break;
      case 'letter': this.tone('triangle', 900 + R() * 300, 500, 0.08, 0.04); this.hiss(0.06, 0.05, 3000, 2); break;
      case 'violin': {
        const c = this.ctx, t = c.currentTime, o = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(660, t); o.frequency.linearRampToValueAtTime(990, t + 0.35); l.frequency.value = 7; lg.gain.value = 14;
        l.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g); g.connect(this.master!); o.start(t); l.start(t); o.stop(t + 0.55); l.stop(t + 0.55); break;
      }
      case 'squish': this.hiss(0.35, 0.18, 260, 2.5); this.tone('sine', 140, 70, 0.3, 0.12); break;
      case 'glug': this.later([0, 220, 440], () => this.tone('sine', 220, 140, 0.15, 0.12)); break;
      case 'burp': this.tone('sawtooth', 110, 70, 0.6, 0.18); this.hiss(0.5, 0.06, 200, 0.6); break;
      case 'glass': this.tone('triangle', 2600, 1800, 0.12, 0.08); this.hiss(0.2, 0.12, 4000, 2); break;
      case 'coin': this.later([0, 90], (i) => this.tone('square', i ? 1320 : 990, i ? 1320 : 990, 0.12, 0.05)); break;
      case 'sparkle': this.later([0, 60, 120, 180, 240], () => this.tone('sine', 1500 + R() * 1500, 2500, 0.1, 0.04)); break;
      case 'buzz': this.tone('square', 120, 120, 0.35, 0.05); this.tone('square', 123, 123, 0.35, 0.05); break;
      // удары по боссам: у каждого свой тембр, у оглушённого и у финишера — свои
      case 'hitWood': this.tone('triangle', 190, 60, 0.14, 0.26); this.tone('square', 95, 50, 0.1, 0.1); this.hiss(0.07, 0.16, 700, 1.2); break;
      case 'hitString': this.tone('sawtooth', 540, 330, 0.17, 0.11); this.tone('triangle', 810, 610, 0.13, 0.08); this.hiss(0.04, 0.1, 2600, 2); break;
      case 'hitDull': this.tone('sine', 150, 55, 0.2, 0.32); this.hiss(0.06, 0.14, 340, 0.8); break;
      case 'hitCrit': this.tone('triangle', 320, 90, 0.15, 0.26); this.tone('square', 1250, 700, 0.1, 0.08); this.hiss(0.06, 0.2, 1900, 1.5); break;
      case 'hitHeavy': this.tone('triangle', 140, 45, 0.24, 0.32); this.tone('sawtooth', 230, 100, 0.15, 0.1); this.hiss(0.12, 0.26, 520, 0.8); break;
      case 'stagger': this.hiss(0.28, 0.3, 300, 0.7); this.tone('sine', 85, 32, 0.5, 0.34); this.tone('square', 960, 380, 0.14, 0.08); this.tone('triangle', 1400, 1400, 0.3, 0.05); break;
      case 'exec': this.hiss(0.35, 0.34, 1400, 0.7); this.tone('sawtooth', 700, 120, 0.3, 0.16); this.tone('sine', 70, 28, 0.6, 0.4); window.setTimeout(() => { this.tone('triangle', 1760, 1760, 0.4, 0.09); this.tone('triangle', 2349, 2349, 0.5, 0.06); }, 110); break;
      case 'bossdie': this.tone('sawtooth', 220, 30, 1.6, 0.2); this.hiss(1.4, 0.2, 200, 0.5); this.tone('sine', 60, 25, 1.8, 0.4); this.later([500, 800, 1100], (i) => this.tone('triangle', 880 - i * 200, 440 - i * 100, 0.6, 0.06)); break;
      case 'bag': this.tone('sine', 120, 60, 0.16, 0.28); this.hiss(0.12, 0.2, 420, 0.7); break;
      case 'parry': this.tone('square', 1900, 1500, 0.07, 0.06); this.tone('triangle', 2800, 2300, 0.14, 0.06); this.tone('sine', 1400, 1400, 0.2, 0.05); break;
      case 'win': this.later([0, 140, 280, 420], (i) => this.tone('triangle', [523, 659, 784, 1047][i]!, [523, 659, 784, 1047][i]!, 0.5, 0.12)); break;
      // оружие (weapons.js)
      case 'chargeFull': this.tone('sine', 880, 1760, 0.18, 0.12); this.tone('triangle', 1320, 1320, 0.3, 0.07); this.hiss(0.1, 0.1, 3600, 2); break;
      case 'wave': this.hiss(0.32, 0.22, 1300, 0.8); this.tone('sawtooth', 520, 170, 0.3, 0.1); break;
      case 'whirl': this.hiss(0.34, 0.2, 1900, 1.1); this.tone('triangle', 760, 300, 0.28, 0.1); break;
      case 'reap': this.hiss(0.26, 0.26, 950, 0.8); this.tone('sine', 210, 60, 0.3, 0.2); break;
      case 'hammer': this.hiss(0.14, 0.2, 600, 0.7); this.tone('triangle', 170, 70, 0.18, 0.14); break;
      case 'quake': this.hiss(0.45, 0.32, 130, 0.6); this.tone('sine', 75, 28, 0.6, 0.4); this.tone('square', 220, 60, 0.15, 0.06); break;
      case 'lunge': this.hiss(0.18, 0.24, 2600, 1.5); this.tone('square', 950, 220, 0.16, 0.06); break;
      // движение (movement2.js)
      case 'ledge': this.hiss(0.07, 0.07, 700, 1); break;
      case 'glide': this.hiss(0.18, 0.06, 900, 0.7); break;
      case 'slide': this.hiss(0.1, 0.035, 1500 + R() * 400, 1.2); break;
    }
  }

  /** нарастающий гул заряда: частота и громкость растут за dur секунд (weapons.js chargeStart) */
  chargeStart(owner: number, dur: number, id: string): void {
    this.chargeStop(owner);
    const c = this.ctx; if (!c || !this.master) return;
    try {
      const t = c.currentTime, f0 = ({ needle: 200, twin: 320, sickle: 170, mace: 110, lance: 260 } as Record<string, number>)[id] || 200;
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth'; o2.type = 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 3.4, t + dur);
      o2.frequency.setValueAtTime(f0 * 2, t); o2.frequency.exponentialRampToValueAtTime(f0 * 6.8, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.085, t + dur);
      o.connect(g); o2.connect(g); g.connect(this.master); o.start(t); o2.start(t);
      this.charge.set(owner, {
        stop() {
          const n = c.currentTime;
          try { g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), n); g.gain.exponentialRampToValueAtTime(0.0001, n + 0.07); o.stop(n + 0.1); o2.stop(n + 0.1); } catch { /* уже остановлен */ }
        },
      });
    } catch { /* звук недоступен */ }
  }
  chargeStop(owner: number): void { const h = this.charge.get(owner); if (h) { h.stop(); this.charge.delete(owner); } }
}

export const Snd = new SndImpl();
