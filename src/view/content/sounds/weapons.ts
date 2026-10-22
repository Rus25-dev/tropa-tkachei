// Оружие (weapons.js): полный заряд и особые удары.
// Звук — функция от синтезатора s (tone, hiss, later, ctx, master) и R = Math.random. Новый звук — строка здесь или новый файл в этой папке.
import { defineSounds } from '../regs';

export default defineSounds({
  chargeFull: (s) => { s.tone('sine', 880, 1760, 0.18, 0.12); s.tone('triangle', 1320, 1320, 0.3, 0.07); s.hiss(0.1, 0.1, 3600, 2); },
  wave: (s) => { s.hiss(0.32, 0.22, 1300, 0.8); s.tone('sawtooth', 520, 170, 0.3, 0.1); },
  whirl: (s) => { s.hiss(0.34, 0.2, 1900, 1.1); s.tone('triangle', 760, 300, 0.28, 0.1); },
  reap: (s) => { s.hiss(0.26, 0.26, 950, 0.8); s.tone('sine', 210, 60, 0.3, 0.2); },
  hammer: (s) => { s.hiss(0.14, 0.2, 600, 0.7); s.tone('triangle', 170, 70, 0.18, 0.14); },
  quake: (s) => { s.hiss(0.45, 0.32, 130, 0.6); s.tone('sine', 75, 28, 0.6, 0.4); s.tone('square', 220, 60, 0.15, 0.06); },
  lunge: (s) => { s.hiss(0.18, 0.24, 2600, 1.5); s.tone('square', 950, 220, 0.16, 0.06); },
});
