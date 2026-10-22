// Общие звуки (legacy/src/sound.js): движение, бой, мир, предметы, Владик (скрипка), Тима (кашель, стекло).
// Звук — функция от синтезатора s (tone, hiss, later, ctx, master) и R = Math.random. Новый звук — строка здесь или новый файл в этой папке.
import { defineSounds } from '../regs';

export default defineSounds({
  jump: (s) => { s.tone('square', 260, 420, 0.09, 0.05); },
  land: (s) => { s.hiss(0.06, 0.08, 400, 0.8); },
  slash: (s) => { s.hiss(0.09, 0.18, 2600, 1.4); },
  hit: (s) => { s.tone('triangle', 220, 70, 0.12, 0.25); s.hiss(0.05, 0.12, 1200, 2); },
  pogo: (s) => { s.tone('square', 500, 900, 0.07, 0.06); },
  dash: (s) => { s.hiss(0.16, 0.14, 900, 0.6); },
  hurt: (s) => { s.tone('sawtooth', 240, 60, 0.3, 0.16); },
  heal: (s) => { s.tone('sine', 420, 880, 0.35, 0.16); s.tone('sine', 630, 1260, 0.35, 0.08); },
  bead: (s, R) => { s.tone('sine', 1300 + R() * 300, 1800, 0.07, 0.05); },
  kill: (s) => { s.tone('triangle', 400, 90, 0.25, 0.2); },
  roar: (s) => { s.tone('sawtooth', 110, 45, 1.1, 0.22); s.hiss(1.0, 0.12, 300, 0.5); },
  slam: (s) => { s.hiss(0.35, 0.3, 160, 0.6); s.tone('sine', 90, 35, 0.4, 0.3); },
  spit: (s) => { s.tone('square', 300, 120, 0.12, 0.06); },
  bench: (s) => { s.tone('sine', 523, 523, 0.25, 0.1); s.tone('sine', 784, 784, 0.4, 0.07); },
  revive: (s) => { s.tone('sine', 330, 990, 0.5, 0.14); },
  gate: (s) => { s.hiss(0.5, 0.2, 220, 0.7); },
  clink: (s) => { s.tone('square', 1500, 1100, 0.06, 0.05); s.tone('triangle', 2400, 2000, 0.08, 0.04); },
  throw: (s) => { s.hiss(0.1, 0.08, 1500, 1); s.tone('sine', 300, 500, 0.08, 0.05); },
  puff: (s) => { s.hiss(0.45, 0.22, 500, 0.4); },
  cough: (s) => { s.later([0, 160, 320], () => { s.hiss(0.12, 0.2, 900, 1.5); s.tone('sawtooth', 180, 120, 0.1, 0.06); }); },
  pickup: (s) => { s.tone('sine', 660, 990, 0.12, 0.1); },
  violin: (s) => {
    const c = s.ctx, t = c.currentTime, o = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(660, t); o.frequency.linearRampToValueAtTime(990, t + 0.35); l.frequency.value = 7; lg.gain.value = 14;
    l.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(s.master); o.start(t); l.start(t); o.stop(t + 0.55); l.stop(t + 0.55);
  },
  squish: (s) => { s.hiss(0.35, 0.18, 260, 2.5); s.tone('sine', 140, 70, 0.3, 0.12); },
  glass: (s) => { s.tone('triangle', 2600, 1800, 0.12, 0.08); s.hiss(0.2, 0.12, 4000, 2); },
  coin: (s) => { s.later([0, 90], (i) => s.tone('square', i ? 1320 : 990, i ? 1320 : 990, 0.12, 0.05)); },
  sparkle: (s, R) => { s.later([0, 60, 120, 180, 240], () => s.tone('sine', 1500 + R() * 1500, 2500, 0.1, 0.04)); },
  buzz: (s) => { s.tone('square', 120, 120, 0.35, 0.05); s.tone('square', 123, 123, 0.35, 0.05); },
});
