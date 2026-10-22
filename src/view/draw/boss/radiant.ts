// Рисунок «Сияющей»: светящийся диск на невысоком постаменте с венцом лучей. Цвет замаха и контур рисует общий код, здесь только тело.
// Фаза 2 добавляет второй венец, фаза 3 — третий и яркую сердцевину; в замахе венец сжимается, в ударе раскрывается.
import type { BossDrawFn, BossDrawSet } from '../bossdraw';

const RAYS = 12;
const base: BossDrawFn = (_w, b, g, now, c) => {
  const cx = b.x + b.w / 2, cy = b.y + b.h * 0.46, fl = b.flash > 0;
  const ph = c.d.formPh >= 3 ? 3 : c.d.formPh >= 2 ? 2 : 1;
  const core = fl ? 0xffffff : c.e.color, halo = fl ? 0xffffff : 0xfff6cf;
  const open = b.state === 'active' ? 1.25 : c.tell ? 1 - 0.25 * c.k : 1;
  const r0 = b.w * 0.34;
  // постамент
  g.fillStyle(0x23262e, 1); g.fillEllipse(cx, b.y + b.h - 4, b.w + 10, 10);
  g.fillStyle(0x4a4538, 1); g.fillRect(cx - 14, cy + r0 - 2, 28, b.y + b.h - (cy + r0) - 2);
  // венцы лучей
  for (let ring = 0; ring < ph; ring++) {
    const len = (b.w * 0.5 + ring * 14) * open, spin = now * (0.5 + ring * 0.3) * (ring % 2 ? -1 : 1);
    g.lineStyle(3 - ring * 0.5, ring === 0 ? halo : core, 0.85 - ring * 0.15);
    for (let k = 0; k < RAYS; k++) {
      const a = spin + (k / RAYS) * Math.PI * 2 + ring * 0.13;
      g.lineBetween(cx + Math.cos(a) * (r0 + 3), cy + Math.sin(a) * (r0 + 3), cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
    }
  }
  // диск и сердцевина
  g.fillStyle(halo, 0.35); g.fillCircle(cx, cy, r0 * 1.35);
  g.fillStyle(core, 1); g.fillCircle(cx, cy, r0);
  g.fillStyle(0xffffff, 0.55 + 0.25 * Math.sin(now * 3)); g.fillCircle(cx, cy, r0 * (ph === 3 ? 0.62 : 0.42));
  // «глаз» следит за героем
  g.fillStyle(0x2a2218, 1); g.fillCircle(cx + b.face * 4, cy, 4);
};

export default { base } satisfies BossDrawSet;
