// Скрипичный ключ Владика: отрисовка (пока ключ не вылетел, t0 > 0, его не видно).
import { drawClef } from '../../draw/common';
import { defineProjView } from '../regs';

export default defineProjView({
  id: 'clef',
  draw: (g, pr, now) => { if ((pr['t0'] ?? 0) > 0) return; drawClef(g, pr.x + 14, pr.y + 20, 1.05, pr['rot'] ?? now * 10, 0xf4efe0); },
});
