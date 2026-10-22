// Герои: фигура, эффекты поз, дуги ударов и клинки (legacy/src/game.js drawPlayer, combat2/qol/movement2 drawPlayerFx, weapons.js drawSwing/drawWeaponBody).
import { CH_SHOW, CH_T, P, PARRY2 } from '../../core/balance';
import { kitChargeFrac, kitCode } from '../../core/kit/moves';
import type { Player } from '../../core/types';
import type { Swing } from '../../core/weapons';
import { atkBox, wdef } from '../../core/weapons';
import type { World } from '../../core/world';
import { type G, MASK, PI, drawWeaver, pts } from './common';
import '../content'; // отрисовка содержимого (src/view/content) регистрируется сама
import { type SwingCtx, weaponViewReg } from '../content/regs';

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
  if ((p['cxFx'] as number) > 0) { // Контрудар: кольцо и перекрестье у руки
    const k = (p['cxFx'] as number) / 0.4, r = 30 + (1 - k) * 24;
    g.lineStyle(4, 0xbfe9ff, k); g.strokeCircle(p.face * 18, -14, 12 + (1 - k) * 40);
    g.lineStyle(2, 0xffffff, k); g.lineBetween(p.face * 6, -22, p.face * r, -6); g.lineBetween(p.face * 6, -6, p.face * r, -22);
  }
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
    for (const pr of w.projs) if (!pr.dead && pr.kind !== 'bomb' && pr.kind !== 'pad' && Math.hypot(pr.x - cx, pr.y - cy) < 95) {
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
/** цвета следа по виду: 0 плащ, 1 тень, 2 вспышка, 3 кристальный рывок, 4 нырок */
const TRAIL_COL: Record<number, number> = { 1: 0x5a4aa8, 2: 0x7fd8ff, 3: 0xff8ae0, 4: 0xcfe8ff };
export function trailStyle(p: Player, tr: { s?: number; a: number }): { col: number; a: number; w: number; h: number } {
  const s = tr.s ?? 0;
  return { col: s ? TRAIL_COL[s]! : p.pal.cloak, a: tr.a * (s === 1 ? 0.5 : s === 3 ? 0.55 : 0.35), w: s === 3 ? 26 : 18, h: s === 4 ? 30 : 22 };
}
function drawKitFx(p: Player, g: G, now: number): void {
  const kc = kitCode(p);
  if (!kc) return;
  const fl = p['fl'] as { dx: number; dy: number } | null, pulse = 0.6 + 0.4 * Math.sin(now * 40);
  if (kc === 1) { // теневой рывок: тёмный силуэт с фиолетовой каймой и клочьями за спиной
    g.fillStyle(0x140a2a, 0.55); g.fillEllipse(0, -14, 22, 32);
    g.lineStyle(2, 0xa28cff, 0.8); g.strokeEllipse(0, -14, 24, 34);
    for (let i = 0; i < 3; i++) { g.lineStyle(2, 0x6a5ac8, 0.5 - i * 0.12); g.lineBetween(-p.face * (14 + i * 9), -22 + i * 7, -p.face * (30 + i * 12), -20 + i * 8); }
  } else if (kc === 2 && fl) { // вспышка: полосы против направления и кольцо
    const ux = fl.dx, uy = fl.dy;
    for (let i = -1; i <= 1; i++) { g.lineStyle(2.4, i ? 0x7fd8ff : 0xffffff, 0.8); g.lineBetween(-ux * 6 - uy * i * 7, -14 - uy * 6 + ux * i * 7, -ux * 34 - uy * i * 7, -14 - uy * 34 + ux * i * 7); }
    g.lineStyle(2, 0xffffff, 0.7); g.strokeCircle(0, -14, 15 + pulse * 3);
  } else if (kc === 3 || kc === 4) { // заряд: свечение растёт, искры сходятся, в конце — белое кольцо
    const k = kitChargeFrac(p), full = kc === 4;
    g.fillStyle(0xff8ae0, (0.1 + 0.22 * k) * (full ? pulse + 0.4 : 1)); g.fillCircle(0, -14, 12 + 18 * k);
    g.lineStyle(2, full ? 0xffffff : 0xff8ae0, 0.4 + 0.5 * k); g.strokeCircle(0, -14, full ? 32 + Math.sin(now * 40) * 3 : 46 - 26 * k);
    for (let i = 0; i < 6; i++) { const an = now * 7 + i * PI / 3, r = full ? 28 : 46 - 24 * k; g.fillStyle(full ? 0xffffff : 0xffc6f2, 0.9); g.fillCircle(Math.cos(an) * r, -14 + Math.sin(an) * r, 2); }
    g.lineStyle(2, 0xff8ae0, 0.7); g.lineBetween(-10, 1, 10, 1);
  } else if (kc === 5) { // суперрывок: длинный розовый росчерк
    for (let i = 0; i < 4; i++) { g.lineStyle(3 - i * 0.5, i ? 0xff8ae0 : 0xffffff, 0.8 - i * 0.15); g.lineBetween(-p.face * 10, -22 + i * 5, -p.face * (60 + i * 24), -22 + i * 5); }
    g.fillStyle(0xff8ae0, 0.25); g.fillEllipse(-p.face * 14, -14, 40, 30);
  } else if (kc === 6) { // нырок: голубой шлейф вверх и остриё вниз
    g.lineStyle(3, 0xcfe8ff, 0.8); g.lineBetween(0, -34, 0, -80); g.lineStyle(2, 0xffffff, 0.7); g.lineBetween(-5, -34, -5, -62); g.lineBetween(5, -34, 5, -62);
    g.fillStyle(0xcfe8ff, 0.7); g.fillTriangle(-6, 0, 6, 0, 0, 12);
  }
}
