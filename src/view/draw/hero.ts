// Герои: фигура, эффекты поз, дуги ударов и клинки (legacy/src/game.js drawPlayer, combat2/qol/movement2 drawPlayerFx, weapons.js drawSwing/drawWeaponBody).
import { CH_SHOW, CH_T, P, PARRY2 } from '../../core/balance';
import { kitCode } from '../../core/kit/moves';
import { isHeroProj } from '../../core/proj-kit';
import type { Player } from '../../core/types';
import type { Swing } from '../../core/weapons';
import { atkBox, wdef } from '../../core/weapons';
import type { World } from '../../core/world';
import { type G, MASK, PI, drawWeaver, pts } from './common';
import '../content'; // отрисовка содержимого (src/view/content) регистрируется сама
import { abilityViewReg, kitFxView, type SwingCtx, trailView, weaponViewReg } from '../content/regs';

/** Поза героя и сжатие/растяжение; возвращает масштаб и позу для тега */
export function drawPlayer(w: World, p: Player, g: G, now: number): { sx: number; sy: number; blink: boolean; a: { leg: number; bob: number; sway: number; lift: number }; cx: number; fy: number } {
  g.clear();
  const cx = p.x + p.w / 2, fy = p.y + p.h;
  g.setPosition(0, 0); g.setScale(1);
  const a0 = { leg: 0, bob: 0, sway: 0, lift: 0 };
  if (p.downed) {
    g.setAlpha(1);
    const pulse = 0.5 + Math.sin(now * 3 + p.i) * 0.2;
    g.fillStyle(p.pal.accent, 0.15 * pulse + 0.05); g.fillCircle(cx, fy - 14, 22);
    g.fillStyle(0xe9e4d4, 1); g.fillEllipse(cx, fy - 13, 20, 27);
    g.lineStyle(1.2, 0xb9b3a0, 1);
    for (let i = 0; i < 5; i++) g.lineBetween(cx - 10, fy - 24 + i * 5, cx + 10, fy - 20 + i * 5);
    g.fillStyle(p.pal.cloak, 1); g.fillTriangle(cx - 4, fy - 1, cx + 4, fy - 1, cx, fy + 3);
    return { sx: 1, sy: 1, blink: false, a: a0, cx, fy };
  }
  const blink = p.inv > 0 && Math.floor(now * 20) % 2 === 0;
  const kc = kitCode(p), ghost = ((p['kgF'] as number) | 0) > 0;
  g.setAlpha(blink ? 0.35 : ghost ? 0.5 : 1);
  let sx = 1, sy = 1;
  if (!p.onGround) { if (p.vy < -150) { sx = 0.88; sy = 1.12; } else if (p.vy > 250) { sx = 0.93; sy = 1.07; } }
  if (p.landT > 0) { sx = 1.15; sy = 0.86; }
  if (p.dashT > 0) { sx = 1.25; sy = 0.82; }
  if (p.sit) { sy = 0.82; sx = 1.08; }
  if (kc === 2) { sx = 1.22; sy = 0.86; } else if (kc === 3 || kc === 4) { sx = 1.1; sy = 0.88; } else if (kc === 5) { sx = 1.4; sy = 0.8; } else if (kc === 6) { sx = 0.8; sy = 1.3; }
  g.setPosition(cx, fy); g.setScale(sx, sy);
  const run = p.onGround && Math.abs(p.vx) > 10 && !p.sit;
  const ph = now * 14;
  const a = {
    leg: run ? Math.sin(ph) * 5 : (p.onGround ? 0 : 2),
    bob: run ? Math.abs(Math.sin(ph)) * 1.5 : Math.sin(now * 2.5 + p.i) * 0.8,
    sway: run ? -4 : (!p.onGround ? (p.vy < 0 ? -2 : 3) : Math.sin(now * 2) * 1),
    lift: (!p.onGround && p.vy > 0) ? -4 : 0,
  };
  if (p.healT > 0) { g.fillStyle(p.pal.accent, 0.25 * (p.healT / 0.6)); g.fillCircle(0, -14, 24); }
  drawPlayerFx(w, p, g, now);
  drawWeaver(g, 0, 0, p.face, p.pal, a, 1);
  if (drawWeaponBody(p, g, a, now)) { /* клинок и свечение заряда */ }
  else if (p.atkT <= 0 && !p.sit) {
    const f = p.face;
    g.lineStyle(1.8, 0xcfd6dc, 1); g.lineBetween(-6 * f, -10 - a.bob, -13 * f, -25 - a.bob);
    g.lineStyle(1, p.pal.accent, 0.9); g.strokeCircle(-13 * f, -26 - a.bob, 2);
  }
  return { sx, sy, blink, a, cx, fy };
}

/** эффекты поз: отбив, казнь, всполох (combat2) → подсказка отбива (qol) → уступ и парус (movement2) */
function drawPlayerFx(w: World, p: Player, g: G, now: number): void {
  if ((p['parryT'] as number) > 0) { // первые кадры окна — золотое кольцо («идеальный» отбив), дальше обычное белое
    const gold = typeof p['parryF'] === 'number' && p['parryF'] < PARRY2.PERFECT_F;
    g.lineStyle(gold ? 3.5 : 2.5, gold ? 0xffd96a : 0xffffff, 0.9); g.strokeCircle(0, -14, 20 + (P.PARRY_T - p['parryT']) * 50);
  }
  if ((p['perfFx'] as number) > 0) { const k = p['perfFx'] / 0.45; g.lineStyle(4, 0xffd96a, k); g.strokeCircle(0, -14, 20 + (1 - k) * 46); g.lineStyle(2, 0xffffff, k); g.strokeCircle(0, -14, 14 + (1 - k) * 30); }
  for (const v of abilityViewReg.list()) v.pose?.(g, p, w); // позы приёмов (кольцо контрудара и т. п.)
  if ((p['counterT'] as number) > 0) { const k = p['counterT'] / PARRY2.COUNTER_T; g.lineStyle(2, 0xffd96a, 0.4 + 0.4 * Math.sin(w.animT * 30)); g.strokeCircle(p.face * 12, -14, 7 + 5 * k); } // контратака готова: золотая искра у руки
  if ((p['execT'] as number) > 0) { // казнь: огромный росчерк вверх или вниз
    const k = p['execT'] / 0.42, up = p['execDir'] === 'u', dy = up ? -1 : 1, f = p.face;
    g.lineStyle(7, 0xfff6d8, k); g.beginPath(); g.arc(f * 8, -14 + dy * 6, 50 + (1 - k) * 22, up ? -Math.PI * 0.95 : Math.PI * 0.05, up ? -Math.PI * 0.05 : Math.PI * 0.95, false); g.strokePath();
    g.lineStyle(3, p.pal.accent, k); g.beginPath(); g.arc(f * 8, -14 + dy * 6, 62 + (1 - k) * 22, up ? -Math.PI * 0.9 : Math.PI * 0.1, up ? -Math.PI * 0.1 : Math.PI * 0.9, false); g.strokePath();
  }
  if ((p['burstFx'] as number) > 0) { const r = 120 * (1 - p['burstFx'] / 0.35); g.lineStyle(3, p.pal.accent, p['burstFx'] / 0.35); g.strokeCircle(0, -14, r); }
  // подсказка: кольцо вокруг героя, когда рядом летит опасное и отбив готов
  if (!p.remote && !((p['parryT'] as number) > 0) && !((p['parryCd'] as number) > 0)) {
    const cx = p.x + 7, cy = p.y + 13;
    for (const pr of w.projs) if (!pr.dead && !isHeroProj(pr.kind) && Math.hypot(pr.x - cx, pr.y - cy) < 95) {
      g.lineStyle(1.5, 0xffffff, 0.35 + 0.25 * Math.sin(w.animT * 18)); g.strokeCircle(0, -14, 27); break;
    }
  }
  drawKitFx(p, g, now);
  // висение на уступе (руки вверх)
  const ld = p['ledge'] ? (p['ledge'] as { side: number }).side : 0;
  if (ld) {
    const climb = p['ledge'] && (p['ledge'] as { climb: number }).climb > 0;
    g.lineStyle(2.4, 0x1a1a14, 1); g.lineBetween(0, -17, ld * 8, climb ? -24 : -22);
    g.lineBetween(ld * 2, -17, ld * 9, climb ? -26 : -23);
    g.fillStyle(MASK, 1); g.fillCircle(ld * 8.5, climb ? -24 : -22, 2.2);
    g.fillStyle(p.pal.accent, 0.55); g.fillCircle(ld * 9, -21, 4);
  }
  if (p['gliding']) {
    const fl = Math.sin(now * 9) * 1.5;
    g.fillStyle(p.pal.accent, 0.28);
    g.fillPoints(pts([{ x: -19, y: -44 }, { x: -11, y: -57 + fl }, { x: 0, y: -61 }, { x: 11, y: -57 - fl }, { x: 19, y: -44 }, { x: 9, y: -47 }, { x: 0, y: -45 }, { x: -9, y: -47 }]), true);
    g.lineStyle(1.4, 0xf4f1e6, 0.85);
    g.lineBetween(-19, -44, -2, -22); g.lineBetween(19, -44, 2, -22); g.lineBetween(0, -45, 0, -26);
    g.beginPath(); g.moveTo(-19, -44); g.lineTo(-11, -57 + fl); g.lineTo(0, -61); g.lineTo(11, -57 - fl); g.lineTo(19, -44); g.strokePath();
  }
}

// ---------- клинок за спиной, поза заряда и свечение ----------
function drawWeaponBody(p: Player, g: G, a: { bob: number }, now: number): boolean {
  const W = wdef(p), f = p.face, ch = (p['chg'] as number) || 0, col = W.col || 0xcfd6dc, bob = a ? a.bob : 0;
  if (ch > CH_SHOW * 0.8) { // свечение и сходящееся кольцо
    const k = Math.min(1, ch / CH_T), full = ch >= CH_T, pulse = 0.6 + Math.sin(now * (full ? 40 : 18)) * 0.4;
    g.fillStyle(col, (0.1 + 0.22 * k) * (full ? pulse + 0.4 : 1)); g.fillCircle(0, -14, 14 + 16 * k);
    g.fillStyle(0xffffff, 0.12 * k); g.fillCircle(0, -14, 8 + 8 * k);
    g.lineStyle(2, full ? 0xffffff : col, 0.35 + 0.5 * k); g.strokeCircle(0, -14, full ? 34 + Math.sin(now * 40) * 3 : 44 - 26 * k);
    if (full) { g.lineStyle(1.5, p.pal.accent, 0.8); for (let i = 0; i < 6; i++) { const an = now * 6 + i * PI / 3; g.lineBetween(Math.cos(an) * 26, -14 + Math.sin(an) * 26, Math.cos(an) * 38, -14 + Math.sin(an) * 38); } }
  }
  const pull = ch > CH_SHOW, v = weaponViewReg.get(W.id);
  if (!v?.back && !pull) return false; // своего клинка нет — рисуется стандартная игла героя
  if (!pull && (p.atkT > 0 || p.sit)) return true;
  const y0 = -10 - bob;
  if (pull) { // оружие занесено назад горизонтально
    const jx = (Math.random() - 0.5) * Math.min(1, ch / CH_T) * 1.6;
    g.lineStyle(2.2, 0xcfd6dc, 1); g.lineBetween(-4 * f, -15, -24 * f + jx, -15 + jx);
    g.lineStyle(1.4, col, 1);
    if (v?.pull) v.pull(g, f, jx, col); else g.strokeCircle(-26 * f, -15, 2);
    return true;
  }
  v!.back!(g, f, y0, bob, col);
  return true;
}

// ---------- дуга удара ----------
/** рисует дугу удара героя; для обычных ударов иглы по земле — исходный росчерк v1.8 */
export function drawSwingArc(w: World, p: Player, fx: G): void {
  if (p.downed || p.atkT <= 0) return;
  if ((p['counterFx'] as number) > 0) { // удар-контратака: золотая дуга пошире поверх обычной
    const k = p['counterFx'] / 0.3, th = p.face > 0 ? 0 : Math.PI, cx = p.x + p.w / 2 + p.face * 6, cy = p.y + p.h / 2 - 2;
    fx.lineStyle(7, 0xffd96a, 0.85 * k); fx.beginPath(); fx.arc(cx, cy, 52 + (1 - k) * 16, th - 1.0, th + 1.0, false); fx.strokePath();
    fx.lineStyle(3, 0xffffff, k); fx.beginPath(); fx.arc(cx, cy, 58 + (1 - k) * 16, th - 0.8, th + 0.8, false); fx.strokePath();
  }
  if (drawWeaponSwing(w, p, fx)) return;
  const k = p.atkT / P.ATK_T, cx = p.x + p.w / 2, cy = p.y + p.h / 2 - 2;
  const th = p.atkDir === 'f' ? (p.face > 0 ? 0 : Math.PI) : p.atkDir === 'u' ? -Math.PI / 2 : Math.PI / 2;
  const ux = Math.cos(th), uy = Math.sin(th);
  const R = 36, ox = cx + ux * 4, oy = cy + uy * 4;
  fx.fillStyle(0xf6f3e8, 0.9 * k);
  fx.beginPath(); fx.arc(ox, oy, R, th - 1.15, th + 1.15, false); fx.arc(ox - ux * 12, oy - uy * 12, R - 2, th + 1.15, th - 1.15, true); fx.closePath(); fx.fillPath();
  fx.lineStyle(2, p.pal.accent, 0.8 * k); fx.beginPath(); fx.arc(ox, oy, R + 2, th - 1.0, th + 1.0, false); fx.strokePath();
}

function drawWeaponSwing(w: World, p: Player, fx: G): boolean {
  const W = wdef(p), sw = p['sw'] as Swing | undefined; if (!sw || !sw.dur || sw.wid !== W.id) return false;
  const v = weaponViewReg.get(W.id); if (!v || v.defaultArc?.(sw.k)) return false; // без своей отрисовки — исходная дуга v1.8
  const k = Math.max(0, Math.min(1, p.atkT / sw.dur)), el = 1 - k;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2 - 2, dir = p.atkDir, f = dir === 'f' ? (sw.k === 'g' || sw.k === 'f' ? p.face : sw.f0) : 1;
  const th = dir === 'f' ? (f > 0 ? 0 : PI) : dir === 'u' ? -PI / 2 : PI / 2;
  const ox = cx + (dir === 'f' ? 0 : Math.cos(th) * 4), oy = cy + (dir === 'f' ? 0 : Math.sin(th) * 4);
  const c: SwingCtx = { w, p, sw, k, el, cx, cy, dir, f, th, th0: sw.f0 > 0 ? 0 : PI, ox, oy, col: W.col!, acc: p.pal.accent, box: atkBox(w, p) };
  if (sw.k === 'c') v.charge?.(fx, c); else v.swing?.(fx, c);
  return true;
}

// ---------- приёмы набора игрока (v2.5): теневой рывок, вспышка, кристальный рывок, нырок ----------
/** вид следа по коду s (0 — плащ; остальные задают приёмы в src/view/content/abilities) */
export function trailStyle(p: Player, tr: { s?: number; a: number }): { col: number; a: number; w: number; h: number } {
  const s = tr.s ?? 0, t = s ? trailView.get(s) : undefined;
  return { col: t ? t.col : p.pal.cloak, a: tr.a * (t ? t.a : 0.35), w: t?.w ?? 18, h: t?.h ?? 22 };
}
function drawKitFx(p: Player, g: G, now: number): void {
  const kc = kitCode(p);
  if (kc) kitFxView.get(kc)?.(g, p, now, kc);
}
