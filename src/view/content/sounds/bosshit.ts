// Удары по боссам: у каждого свой тембр, у оглушённого и у финишера — свои; смерть босса, попадание в рюкзак.
// Звук — функция от синтезатора s (tone, hiss, later, ctx, master) и R = Math.random. Новый звук — строка здесь или новый файл в этой папке.
import { defineSounds } from '../regs';

export default defineSounds({
  hitCrit: (s) => { s.tone('triangle', 320, 90, 0.15, 0.26); s.tone('square', 1250, 700, 0.1, 0.08); s.hiss(0.06, 0.2, 1900, 1.5); },
  hitHeavy: (s) => { s.tone('triangle', 140, 45, 0.24, 0.32); s.tone('sawtooth', 230, 100, 0.15, 0.1); s.hiss(0.12, 0.26, 520, 0.8); },
  stagger: (s) => { s.hiss(0.28, 0.3, 300, 0.7); s.tone('sine', 85, 32, 0.5, 0.34); s.tone('square', 960, 380, 0.14, 0.08); s.tone('triangle', 1400, 1400, 0.3, 0.05); },
  exec: (s) => { s.hiss(0.35, 0.34, 1400, 0.7); s.tone('sawtooth', 700, 120, 0.3, 0.16); s.tone('sine', 70, 28, 0.6, 0.4); window.setTimeout(() => { s.tone('triangle', 1760, 1760, 0.4, 0.09); s.tone('triangle', 2349, 2349, 0.5, 0.06); }, 110); },
  bossdie: (s) => { s.tone('sawtooth', 220, 30, 1.6, 0.2); s.hiss(1.4, 0.2, 200, 0.5); s.tone('sine', 60, 25, 1.8, 0.4); s.later([500, 800, 1100], (i) => s.tone('triangle', 880 - i * 200, 440 - i * 100, 0.6, 0.06)); },
  bag: (s) => { s.tone('sine', 120, 60, 0.16, 0.28); s.hiss(0.12, 0.2, 420, 0.7); },
});
