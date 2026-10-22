// Отбив 2.0: обычный, идеальный (колокольный тон выше), сорванный; контрудар; победа.
// Звук — функция от синтезатора s (tone, hiss, later, ctx, master) и R = Math.random. Новый звук — строка здесь или новый файл в этой папке.
import { defineSounds } from '../regs';

export default defineSounds({
  parry: (s) => { s.tone('square', 1900, 1500, 0.07, 0.06); s.tone('triangle', 2800, 2300, 0.14, 0.06); s.tone('sine', 1400, 1400, 0.2, 0.05); },
  parryPerfect: (s) => { s.tone('square', 2200, 1800, 0.06, 0.06); s.tone('triangle', 3520, 3520, 0.32, 0.08); s.tone('sine', 2637, 2637, 0.45, 0.07); s.later([70], () => s.tone('sine', 3951, 3951, 0.4, 0.05)); },
  parryFail: (s) => { s.tone('square', 520, 380, 0.09, 0.06); s.hiss(0.06, 0.08, 1800, 1.5); },
  counter: (s) => { s.tone('sawtooth', 880, 1760, 0.12, 0.09); s.tone('triangle', 1320, 2640, 0.2, 0.07); },
  counterStrike: (s) => { s.hiss(0.1, 0.22, 3000, 1.4); s.tone('square', 1500, 600, 0.09, 0.08); s.tone('triangle', 2093, 3136, 0.3, 0.09); s.later([60], () => s.tone('sine', 3136, 3136, 0.35, 0.06)); },
  win: (s) => { s.later([0, 140, 280, 420], (i) => s.tone('triangle', [523, 659, 784, 1047][i]!, [523, 659, 784, 1047][i]!, 0.5, 0.12)); },
});
