// Универсальный рисовальщик сущностей арены (sc.arena): платформы, барьеры, лучи и зоны урона, точки появления. Файлов арта на босса не требует.
// Предупреждения подчиняются цвету типа удара (жёлтый — можно отбить, красный — только уворот, фиолетовый — не отбивается), как телеграф босса:
// игрок читает арену теми же цветами, что и боссов. Платформы, которые вот-вот исчезнут или появятся, мигают белым контуром.
import { T } from '../../core/balance';
import { entDef, type EntRt } from '../../core/boss/arena';
import type { World } from '../../core/world';
import { HIT_RGB } from './bosses';
import type { G } from './common';

/** контур-пунктир вокруг прямоугольника */
function dashed(g: G, x: number, y: number, w: number, h: number): void {
  const seg = 8;
  for (let i = 0; i < w; i += seg * 2) { g.lineBetween(x + i, y, x + Math.min(w, i + seg), y); g.lineBetween(x + i, y + h, x + Math.min(w, i + seg), y + h); }
  for (let i = 0; i < h; i += seg * 2) { g.lineBetween(x, y + i, x, y + Math.min(h, i + seg)); g.lineBetween(x + w, y + i, x + w, y + Math.min(h, i + seg)); }
}

export function drawArena(w: World, g: G, now: number): void {
  g.clear();
  const A = w.arena; if (!A) return;
  for (const e of A.ents) {
    const d = entDef(w, e); if (!d) continue;
    if (d.kind === 'platform' || d.kind === 'barrier') drawPlat(g, e, d.kind === 'barrier' || d.solid, d.kind === 'barrier', now);
    else if (d.kind === 'beam') {
      const c = HIT_RGB[d.hit] ?? 0xffffff;
      for (const s of e.strikes) {
        const r = s.rect;
        if (s.f <= s.tell) { // замах: контур и слабая заливка, мигание ускоряется к концу
          const k = s.f / s.tell, on = Math.sin(now * (6 + k * 16) * Math.PI * 2) > -0.2;
          g.fillStyle(c, 0.05 + 0.2 * k); g.fillRect(r.x, r.y, r.w, r.h);
          g.lineStyle(2, c, on ? 0.95 : 0.3); g.strokeRect(r.x, r.y, r.w, r.h);
        } else { g.fillStyle(c, 0.4); g.fillRect(r.x, r.y, r.w, r.h); g.lineStyle(3, c, 1); g.strokeRect(r.x, r.y, r.w, r.h); g.fillStyle(0xffffff, 0.18); g.fillRect(r.x + 3, r.y + 3, Math.max(0, r.w - 6), Math.max(0, r.h - 6)); }
      }
    } else if (d.kind === 'spawner') {
      const x = A.x0 + d.pos.x, y = A.floor - d.pos.y;
      g.lineStyle(1.5, 0x8fb8a8, e.on || e.q.length ? 0.55 : 0.18); g.strokeCircle(x, y, 7);
      for (const q of e.q) {
        const left = Math.max(0, q.due - e.t), c = HIT_RGB[q.kind] ?? 0xffffff, p = 1 - Math.min(1, left / 40);
        g.lineStyle(2.5, c, 0.4 + 0.5 * Math.abs(Math.sin(now * (8 + p * 18)))); g.strokeCircle(x, y, 8 + 10 * p);
        g.fillStyle(c, 0.2 + 0.3 * p); g.fillCircle(x, y, 6 + 6 * p);
      }
    }
  }
}

function drawPlat(g: G, e: EntRt, solid: boolean, barrier: boolean, now: number): void {
  const x = e.tx * T, y = e.ty * T, wd = e.tw * T, h = e.th * T;
  if (e.shown) {
    const flick = e.warnHide > 0 ? (Math.sin(now * 28) > 0 ? 1 : 0.35) : 1;
    if (barrier) { g.fillStyle(0x3a2f2a, flick); g.fillRect(x, y, wd, h); g.lineStyle(2, 0x8a6a52, flick); for (let i = 0; i < h; i += 16) g.lineBetween(x, y + i, x + wd, y + i + 10); g.strokeRect(x, y, wd, h); }
    else if (solid) { g.fillStyle(0x4a4a52, flick); g.fillRect(x, y, wd, h); g.fillStyle(0x7e8590, flick); g.fillRect(x, y, wd, 4); g.lineStyle(1.5, 0x2a2a30, flick); g.strokeRect(x, y, wd, h); }
    else { g.fillStyle(0x6b4a2c, flick); g.fillRect(x, y, wd, Math.min(h, 12)); g.fillStyle(0xb98a52, flick); g.fillRect(x, y, wd, 3); g.lineStyle(1.5, 0x2c1c0e, flick); g.strokeRect(x, y, wd, Math.min(h, 12)); }
    if (e.warnHide > 0) { g.lineStyle(2.5, 0xffffff, 0.5 + 0.4 * Math.sin(now * 28)); dashed(g, x - 2, y - 2, wd + 4, h + 4); }
  } else if (e.warnShow > 0 || e.pend) { // скоро появится: мигающий пунктир там, где вырастет
    g.lineStyle(2.5, 0xffffff, 0.35 + 0.45 * Math.abs(Math.sin(now * 14))); dashed(g, x, y, wd, h);
    g.fillStyle(0xffffff, 0.06); g.fillRect(x, y, wd, h);
  }
}
