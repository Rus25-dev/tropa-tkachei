// Набор приёмов (v2.5): теневой рывок, вспышка, кристальный рывок, нитяные заклинания, нырок.
// Звук — функция от синтезатора s (tone, hiss, later, ctx, master) и R = Math.random. Новый звук — строка здесь или новый файл в этой папке.
import { defineSounds } from '../regs';

export default defineSounds({
  shadow: (s) => { s.hiss(0.2, 0.12, 500, 0.5); s.tone('sawtooth', 300, 90, 0.2, 0.07); s.tone('sine', 150, 60, 0.22, 0.1); },
  flash: (s) => { s.tone('square', 1100, 2400, 0.07, 0.06); s.hiss(0.1, 0.12, 3200, 1.2); s.tone('sine', 1800, 900, 0.12, 0.05); },
  crystalCharge: (s) => { s.tone('sine', 360, 1200, 0.5, 0.07); s.tone('triangle', 540, 1800, 0.5, 0.04); },
  crystalReady: (s) => { s.tone('sine', 1760, 1760, 0.3, 0.1); s.tone('triangle', 2637, 2637, 0.4, 0.07); s.later([80], () => s.tone('sine', 3520, 3520, 0.3, 0.05)); },
  crystalGo: (s) => { s.hiss(0.3, 0.26, 2200, 0.8); s.tone('sawtooth', 220, 1400, 0.22, 0.1); s.tone('sine', 90, 40, 0.3, 0.2); },
  spirit: (s) => { s.tone('sine', 520, 1040, 0.22, 0.12); s.hiss(0.2, 0.1, 1700, 1); s.tone('triangle', 780, 1560, 0.18, 0.05); },
  wraith: (s) => { s.tone('sawtooth', 200, 900, 0.4, 0.09); s.hiss(0.4, 0.18, 1100, 0.7); s.tone('sine', 400, 1200, 0.4, 0.08); },
  diveGo: (s) => { s.tone('sawtooth', 700, 120, 0.3, 0.1); s.hiss(0.3, 0.12, 1400, 0.8); },
  diveLand: (s) => { s.hiss(0.4, 0.34, 150, 0.6); s.tone('sine', 110, 32, 0.5, 0.4); s.tone('triangle', 1400, 500, 0.18, 0.08); },
});
