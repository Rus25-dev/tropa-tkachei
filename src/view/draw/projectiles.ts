// Снаряды и вещи на карте: снаряды (по виду из src/view/content/projectiles), инструменты, бусины, предметы, шкала стойкости, статусы.
import { POISE_MAX, STAGGER_T, STATUS_KINDS } from '../../core/balance';
import '../content';
import { projViewReg, tfxView, toolEntView, toolViewReg } from '../content/regs';
import type { World } from '../../core/world';
import { type G, PI } from './common';

type Q = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- сущности: мешок полей ядра

export function drawProjectiles(w: World, fx: G, now: number): void {
  // снаряды: отрисовка по виду из src/view/content/projectiles/<kind>.ts
  for (const pr of w.projs) if (!pr.dead) projViewReg.get(pr.kind)?.draw(fx, pr, now);
  drawToolEntities(w, fx, now);
}

function drawToolEntities(w: World, fx: G, now: number): void {
  // сущности инструментов: отрисовка по виду из src/view/content/tools/<id>.ts
  for (const q of w.tl as Q[]) toolEntView.get(q['kind'])?.(fx, q, now, q['x'] + q['w'] / 2, q['y'] + q['h'] / 2);
  // замёрзшие враги: нитяная сеть
  for (const e of w.enemies) if (!e.dead && e['frozenT'] > 0) {
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2, rx = e.w / 2 + 4, ry = e.h / 2 + 4;
    fx.lineStyle(1.5, 0xe8f6ff, 0.8); fx.strokeEllipse(ex, ey, rx * 2, ry * 2);
    fx.lineBetween(ex - rx, ey - ry * 0.5, ex + rx, ey + ry * 0.5); fx.lineBetween(ex - rx, ey + ry * 0.5, ex + rx, ey - ry * 0.5); fx.lineBetween(ex, ey - ry, ex, ey + ry);
  }
  for (const v of toolViewReg.list()) v.world?.(fx, w, now); // общие слои инструментов (нить крюка)
  for (const f of w.tfx as Q[]) tfxView.get(f['f'])?.(fx, f, Math.max(0, f['t'] / (f['T'] || 0.3)), w);
}

/** цвет контура по виду удара: жёлтый — отбить, красный — уйти рывком, фиолетовый — не отбить и не проскочить */
export const HK_COLOR = { parry: 0xffd447, dodge: 0xff4a3c, unblockable: 0xb066ff } as const;

/** Контуры снарядов с явно заданным видом удара (hk). Снаряды без hk рисуются по-старому. strong — настройка «Контуры опасного» (толще и ярче). */
export function drawHitKinds(w: World, fx: G, now: number, strong: boolean): void {
  for (const pr of w.projs) {
    if (!pr.hk || pr.dead || (pr.delay ?? 0) > 0 || !(pr.w > 0)) continue;
    const c = HK_COLOR[pr.hk], pulse = 0.65 + 0.35 * Math.sin(now * 14);
    if (strong) { fx.lineStyle(6, 0x000000, 0.6); fx.strokeRect(pr.x - 2, pr.y - 2, pr.w + 4, pr.h + 4); }
    fx.lineStyle(strong ? 3 : 2, c, strong ? 1 : pulse); fx.strokeRect(pr.x - 2, pr.y - 2, pr.w + 4, pr.h + 4);
    if (pr.hk === 'unblockable') { fx.lineBetween(pr.x - 2, pr.y - 2, pr.x + pr.w + 2, pr.y + pr.h + 2); fx.lineBetween(pr.x + pr.w + 2, pr.y - 2, pr.x - 2, pr.y + pr.h + 2); } // крест: «не отбить»
  }
}

/** шкала стойкости над боссом: видна, только пока стойкость копится или босс оглушён */
export function drawPoiseBars(w: World, fx: G, now: number): void {
  for (const b of w.bosses) {
    const dy = -20, wd = 70;
    if (['dead', 'gone', 'sleep', 'intro'].includes(b.state) || b.y < -50) continue;
    const pz = b['poise'] || 0, sg = b.stagger || 0;
    if (pz <= 0 && sg <= 0) continue;
    const mx = POISE_MAX[b.phase || 1]!, x = b.x + b.w / 2 - wd / 2, y = b.y + dy, h = 6;
    fx.fillStyle(0x0b0f0e, 0.7); fx.fillRoundedRect(x - 2, y - 2, wd + 4, h + 4, 3);
    if (sg > 0) {
      const pulse = 0.65 + Math.sin(now * 22) * 0.35;
      fx.fillStyle(0xff6a4a, pulse); fx.fillRect(x, y, wd * Math.min(1, sg / STAGGER_T), h);
      fx.lineStyle(1.5, 0xffd47a, pulse); fx.strokeRoundedRect(x - 2, y - 2, wd + 4, h + 4, 3);
    } else {
      const f = Math.min(1, pz / mx);
      fx.fillStyle(f > 0.7 ? 0xffa23c : 0xffd47a, 1); fx.fillRect(x, y, wd * f, h);
      fx.lineStyle(1, 0x0b0f0e, 0.8); for (let i = 1; i < mx; i++) fx.lineBetween(x + (wd * i) / mx, y, x + (wd * i) / mx, y + h);
    }
  }
}

/** цветная вуаль статусов на цели и значки над головой */
export function drawStatus(w: World, g: G, now: number, spawn: (col: number, x: number, y: number) => void): void {
  for (const t of [...w.enemies, ...w.bosses] as (Q | null)[]) {
    if (!t || t['dead'] || t['w'] < 2) continue;
    const s = t['status']; if (!s) continue;
    let m = 0; for (const k in s) if (s[k]) m |= STATUS_KINDS[k as keyof typeof STATUS_KINDS].bit;
    if (!m) continue;
    const cx = t['x'] + t['w'] / 2, cy = t['y'] + t['h'] / 2, pul = 0.5 + Math.sin(now * 8 + cx) * 0.5;
    const kinds = (Object.keys(STATUS_KINDS) as (keyof typeof STATUS_KINDS)[]).filter((k) => m & STATUS_KINDS[k].bit);
    for (const k of kinds) {
      const K = STATUS_KINDS[k];
      g.fillStyle(K.col, 0.16 + pul * 0.1); g.fillEllipse(cx, cy, t['w'] * 0.95, t['h'] * 0.95);
      if (Math.random() < 0.06) spawn(K.col, cx + (Math.random() - 0.5) * t['w'] * 0.7, t['y'] + t['h'] * (0.3 + Math.random() * 0.5));
    }
    // значки
    const iy = t['y'] - 10, x0 = cx - (kinds.length - 1) * 8;
    kinds.forEach((k, i) => {
      const K = STATUS_KINDS[k], x = x0 + i * 16;
      g.fillStyle(0x0b0f0e, 0.75); g.fillCircle(x, iy, 7);
      g.fillStyle(K.col, 1);
      if (k === 'poison') { g.fillCircle(x, iy + 1.5, 3); g.fillTriangle(x - 2.6, iy + 0.5, x + 2.6, iy + 0.5, x, iy - 4); }
      else if (k === 'burn') { g.fillTriangle(x - 3.2, iy + 4, x + 3.2, iy + 4, x, iy - 5); g.fillStyle(0xffe3a3, 1); g.fillTriangle(x - 1.4, iy + 4, x + 1.4, iy + 4, x, iy - 1); }
      else { g.lineStyle(1.5, K.col, 1); g.lineBetween(x - 4, iy, x + 4, iy); g.lineBetween(x, iy - 4, x, iy + 4); g.lineBetween(x - 3, iy - 3, x + 3, iy + 3); g.lineBetween(x - 3, iy + 3, x + 3, iy - 3); }
    });
  }
}

/** предметы-способности на карте */
export function drawItems(w: World, g: G, now: number): void {
  g.clear();
  for (const it of w.items as Q[]) {
    const bob = Math.sin(now * 2.4) * 4;
    g.fillStyle(0xffd47a, 0.1); g.fillCircle(it['px'], it['py'] + bob, 34); g.fillStyle(0xffd47a, 0.22); g.fillCircle(it['px'], it['py'] + bob, 20);
    g.fillStyle(0xfff2c8, 1); g.fillTriangle(it['px'], it['py'] + bob - 11, it['px'] + 9, it['py'] + bob, it['px'] - 9, it['py'] + bob); g.fillTriangle(it['px'], it['py'] + bob + 11, it['px'] + 9, it['py'] + bob, it['px'] - 9, it['py'] + bob);
  }
}

/** бусины, прогресс оживления */
export function drawBeads(w: World, fx: G): void {
  for (const bd of w.beadsArr as unknown as { x: number; y: number }[]) {
    fx.fillStyle(0xffd47a, 0.25); fx.fillCircle(bd.x + 4, bd.y + 4, 7);
    fx.fillStyle(0xffe3a3, 1); fx.fillCircle(bd.x + 4, bd.y + 4, 3.5);
  }
  for (const p of w.players) if (p.downed && p.reviveT > 0) {
    fx.lineStyle(3, p.pal.accent, 1); fx.beginPath(); fx.arc(p.x + 7, p.y - 6, 12, -PI / 2, -PI / 2 + PI * 2 * p.reviveT, false); fx.strokePath();
  }
}
