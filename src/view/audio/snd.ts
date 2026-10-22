// Звук: маленький синтезатор на WebAudio (legacy/src/sound.js + звуки оружия из weapons.js и движения из movement2.js). Файлов нет.
// Ядро только называет звук (событие 'snd'); играет его этот модуль по описанию из src/view/content/sounds.
import '../content';
import { type Synth, soundReg, weaponViewReg } from '../content/regs';

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
  later(ms: number[], fn: (i: number) => void): void { ms.forEach((d, i) => window.setTimeout(() => fn(i), d)); }

  /** сыграть звук по имени (src/view/content/sounds); неизвестное имя — одно предупреждение в консоль на имя */
  play(n: string): void {
    if (!this.ctx || !this.master) return;
    const d = soundReg.get(n);
    if (d) { d.play(this as unknown as Synth, Math.random); return; }
    if (!this.warned.has(n)) { this.warned.add(n); console.warn(`[snd] звук «${n}» не заведён (src/view/content/sounds)`); }
  }
  private warned = new Set<string>();

  /** нарастающий гул заряда: частота и громкость растут за dur секунд (weapons.js chargeStart) */
  chargeStart(owner: number, dur: number, id: string): void {
    this.chargeStop(owner);
    const c = this.ctx; if (!c || !this.master) return;
    try {
      const t = c.currentTime, f0 = weaponViewReg.get(id)?.chargePitch || 200;
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
