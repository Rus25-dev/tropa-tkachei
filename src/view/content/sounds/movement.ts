// Движение (movement2.js): уступ, планирование, скольжение по стене.
// Звук — функция от синтезатора s (tone, hiss, later, ctx, master) и R = Math.random. Новый звук — строка здесь или новый файл в этой папке.
import { defineSounds } from '../regs';

export default defineSounds({
  ledge: (s) => { s.hiss(0.07, 0.07, 700, 1); },
  glide: (s) => { s.hiss(0.18, 0.06, 900, 0.7); },
  slide: (s, R) => { s.hiss(0.1, 0.035, 1500 + R() * 400, 1.2); },
});
