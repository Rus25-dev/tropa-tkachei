// Боссы на данных: универсальное тело («манекен»), общий телеграф (контур замаха, коробки ударов, окно наказания) и уязвимые точки.
// Свой вид босса — src/view/draw/boss/<id>.ts (см. bossdraw.ts).
import { clamp } from '../../core/balance';
import type { Boss } from '../../core/types';
import type { World } from '../../core/world';
import { liveBoxes, weakStates, type DState } from '../../core/boss/exec';
import { effForm } from '../../core/boss/form';
import { bodyDrawer, type DrawCtx } from './bossdraw';
import { bossDef } from '../../core/boss/registry';
import type { G } from './common';
import '../content';
import { projViewReg } from '../content/regs';

/** цвет подсказки замаха и удара по типу: жёлтое — можно отбить, красное — только уворот, фиолетовое — не отбивается, белое — нейтральный замах */
export const CUE_RGB: Record<string, number> = { yellow: 0xffd447, red: 0xff4a3a, purple: 0xb877ff, white: 0xffffff };
export const HIT_RGB: Record<string, number> = { parry: CUE_RGB['yellow']!, dodge: CUE_RGB['red']!, unblockable: CUE_RGB['purple']! };

/** Универсальное тело босса («манекен»): столбик, голова, руки по позе. Размер берётся из b.w, b.h — после трансформации тело меняется само. */
function drawMannequin(_w: World, b: Boss, g: G, _now: number, c: DrawCtx): void {
  const f = b.face, cx = b.x + b.w / 2, fy = b.y + b.h, fl = b.flash > 0, body = fl ? 0xffffff : c.e.color, shade = fl ? 0xffffff : 0x5d5446;
  const lean = c.lean, h = b.h, s = Math.min(1.6, Math.max(0.7, h / 78));
  // подставка и ноги
  g.fillStyle(0x23262e, 1); g.fillEllipse(cx, fy - 2, b.w + 14, 8);
  g.lineStyle(5, shade, 1); g.lineBetween(cx - 8 * s, fy - 22 * s, cx - 8 * s, fy - 3); g.lineBetween(cx + 8 * s, fy - 22 * s, cx + 8 * s, fy - 3);
  // туловище и голова
  g.fillStyle(body, 1); g.fillRoundedRect(cx - b.w / 2 + 3 + lean, b.y + 24 * s, b.w - 6, b.h - 44 * s, 8);
  g.fillStyle(shade, 1); g.fillRect(cx - 9 + lean, b.y + 38 * s, 18, 3); g.fillRect(cx - 9 + lean, b.y + 46 * s, 18, 3);
  g.fillStyle(body, 1); g.fillCircle(cx + lean * 1.4, b.y + 14 * s, 14 * s);
  g.fillStyle(0x1a1410, 1); g.fillRect(cx + lean * 1.4 + f * 3 - 6, b.y + 10 * s, 4, 4); g.fillRect(cx + lean * 1.4 + f * 3 + 2, b.y + 10 * s, 4, 4);
  // руки: поднимаются в замахе, бьют вперёд в активных кадрах, висят в покое
  const ang = c.tell ? -1.9 + c.k * 0.5 : b.state === 'active' ? 0.1 : b.state === 'recover' ? 1.1 : 0.8;
  g.lineStyle(6, shade, 1);
  for (const side of [-1, 1]) {
    const sx = cx + side * 15 + lean, sy = b.y + 30 * s, a = side * f > 0 ? ang : 0.9;
    g.lineBetween(sx, sy, sx + Math.cos(a) * f * 30, sy + Math.sin(a) * 30);
  }
}

/** Телеграф для отрисовки: контур замаха, места ударов, окно наказания, оглушение, рёв — один для всех боссов, как бы ни выглядело тело */
function drawTelegraph(w: World, b: Boss, g: G, now: number, c: DrawCtx): void {
  const cx = b.x + b.w / 2, fy = b.y + b.h, lean = c.lean;
  if (c.tell) {
    // Форма сигнала дублирует тип удара: читается и без различения цветов.
    const a = c.def.attacks.find((x) => x.id === c.d.atk), kinds = [...new Set([...(a?.active.map((x) => x.kind) ?? []), ...(a?.spawn.map((x) => x.kind) ?? [])])];
    kinds.forEach((kind, i) => {
      const x = cx + (i - (kinds.length - 1) / 2) * 20, y = b.y - 20;
      g.lineStyle(2, HIT_RGB[kind] ?? 0xffffff, 1);
      if (kind === 'parry') g.strokeCircle(x, y, 6);
      else if (kind === 'dodge') { g.lineBetween(x - 6, y - 6, x + 1, y); g.lineBetween(x + 1, y, x - 6, y + 6); g.lineBetween(x + 1, y - 6, x + 8, y); g.lineBetween(x + 8, y, x + 1, y + 6); }
      else { g.lineBetween(x - 6, y - 6, x + 6, y + 6); g.lineBetween(x - 6, y + 6, x + 6, y - 6); }
    });
    const hz = 5 + c.k * 16, on = Math.sin(now * hz * Math.PI * 2) > -0.2;
    if (on) { g.lineStyle(3, c.rgb, 0.95); g.strokeRoundedRect(cx - b.w / 2 - 2 + lean, b.y - 4, b.w + 4, b.h + 6, 10); }
    for (const x of liveBoxes(w, b)) {
      g.fillStyle(c.rgb, 0.05 + 0.2 * c.k); g.fillRect(x.r.x, x.r.y, x.r.w, x.r.h);
      g.lineStyle(2, c.rgb, on ? 0.9 : 0.3); g.strokeRect(x.r.x, x.r.y, x.r.w, x.r.h);
    }
  } else if (b.state === 'active') {
    for (const x of liveBoxes(w, b)) { const k = HIT_RGB[x.kind] ?? 0xffffff; g.fillStyle(k, 0.35); g.fillRect(x.r.x, x.r.y, x.r.w, x.r.h); g.lineStyle(2, k, 1); g.strokeRect(x.r.x, x.r.y, x.r.w, x.r.h); }
  }
  // окно наказания: зелёное кольцо у ног — бей сейчас
  if (c.d.punish) { g.lineStyle(3, 0x7be39a, 0.5 + Math.sin(now * 14) * 0.3); g.strokeEllipse(cx, fy - 3, b.w + 30, 12); }
  if (b.stagger > 0) { g.fillStyle(0xffe3a3, 0.9); for (let i = 0; i < 4; i++) g.fillCircle(cx + Math.cos(now * 5 + i * 1.6) * 24, b.y - 12 + Math.sin(now * 5 + i * 1.6) * 5, 2.5); }
  if (b.state === 'rage') { g.lineStyle(3, 0xff8a5a, 0.6 + Math.sin(now * 30) * 0.3); g.strokeRoundedRect(cx - b.w / 2 - 6, b.y - 8, b.w + 12, b.h + 10, 12); }
}

/** Уязвимые точки: открытая светится зелёно-золотым и пульсирует, закрытая — тёмный контур брони */
function drawWeak(b: Boss, g: G, now: number): void {
  for (const s of weakStates(b)) {
    if (s.open) {
      const a = 0.5 + Math.sin(now * 10) * 0.25;
      g.fillStyle(0xb8ff7a, 0.22 + a * 0.2); g.fillRect(s.r.x, s.r.y, s.r.w, s.r.h);
      g.lineStyle(2.5, 0xe8ff9a, 0.55 + a * 0.4); g.strokeRect(s.r.x, s.r.y, s.r.w, s.r.h);
      g.lineStyle(1.5, 0xffffff, a); g.strokeCircle(s.r.x + s.r.w / 2, s.r.y + s.r.h / 2, Math.max(s.r.w, s.r.h) * 0.62);
    } else { g.lineStyle(2, 0x6c7480, 0.65); g.strokeRect(s.r.x, s.r.y, s.r.w, s.r.h); g.lineBetween(s.r.x, s.r.y, s.r.x + s.r.w, s.r.y + s.r.h); g.lineBetween(s.r.x + s.r.w, s.r.y, s.r.x, s.r.y + s.r.h); }
  }
}

/** Босс на данных: тело (файл src/view/draw/boss/<id>.ts или универсальный «манекен»), поверх — общий телеграф и уязвимые точки. */
export function drawDataBoss(w: World, b: Boss, g: G, now: number): void {
  g.clear();
  const d = b['d'] as DState | undefined; if (!d) return;
  const def = bossDef(d.id)!, e = effForm(def, d.formPh), dead = b.state === 'dead';
  g.setAlpha(dead ? clamp(b.t / (def.deathFrames / 60), 0, 1) : 1);
  const tell = b.state === 'tell' && !!d.cue, rgb = tell ? (CUE_RGB[d.cue!.color] ?? 0xffffff) : 0xffffff;
  const k = tell ? 1 - d.cue!.left / d.cue!.total : 0; // прогресс замаха 0..1
  const lean = b.state === 'active' ? 5 * b.face : tell ? -4 * b.face * k : 0;
  const c: DrawCtx = { def, d, e, tell, k, rgb, lean };
  if (e.fly && !e.still) { g.fillStyle(0x000000, 0.28); g.fillEllipse(b.x + b.w / 2, d.floor - 3, b.w * 0.9, 8); } // тень летающего на полу
  (bodyDrawer(def.id, e.draw) ?? drawMannequin)(w, b, g, now, c);
  drawTelegraph(w, b, g, now, c);
  drawWeak(b, g, now);
}

/** Контуры снарядов боссов на данных по типу удара (универсальная подсказка поверх обычной отрисовки снаряда). */
export function drawDataProjs(w: World, g: G, now: number): void {
  for (const pr of w.projs) {
    if (pr.dead || pr['src'] !== 'd') continue;
    const c = HIT_RGB[pr.hk ?? 'parry'] ?? 0xffffff, blink = 0.55 + Math.sin(now * 18) * 0.3;
    g.lineStyle(2, c, blink); g.strokeRect(pr.x - 2, pr.y - 2, pr.w + 4, pr.h + 4);
    if (projViewReg.get(pr.kind)?.round) { g.fillStyle(c, 0.35); g.fillCircle(pr.x + pr.w / 2, pr.y + pr.h / 2, Math.max(pr.w, pr.h) / 2); }
  }
}
