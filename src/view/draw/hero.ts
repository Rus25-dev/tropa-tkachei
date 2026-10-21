// Герои: фигура, эффекты поз, дуги ударов и клинки (legacy/src/game.js drawPlayer, combat2/qol/movement2 drawPlayerFx, weapons.js drawSwing/drawWeaponBody).
import { CH_SHOW, CH_T, P } from '../../core/balance';
import type { Player } from '../../core/types';
import type { Swing } from '../../core/weapons';
import { atkBox, wdef } from '../../core/weapons';
import type { World } from '../../core/world';
import { type G, MASK, PI, band, drawWeaver, edge, ease, pts } from './common';

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
  g.setAlpha(blink ? 0.35 : 1);
  let sx = 1, sy = 1;
  if (!p.onGround) { if (p.vy < -150) { sx = 0.88; sy = 1.12; } else if (p.vy > 250) { sx = 0.93; sy = 1.07; } }
  if (p.landT > 0) { sx = 1.15; sy = 0.86; }
  if (p.dashT > 0) { sx = 1.25; sy = 0.82; }
  if (p.sit) { sy = 0.82; sx = 1.08; }
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
  if ((p['parryT'] as number) > 0) { g.lineStyle(2.5, 0xffffff, 0.9); g.strokeCircle(0, -14, 20 + (P.PARRY_T - p['parryT']) * 50); }
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
  const pull = ch > CH_SHOW;
  if (W.id === 'needle' && !pull) return false;
  if (!pull && (p.atkT > 0 || p.sit)) return true;
  const y0 = -10 - bob;
  if (pull) { // оружие занесено назад горизонтально
    const jx = (Math.random() - 0.5) * Math.min(1, ch / CH_T) * 1.6;
    g.lineStyle(2.2, 0xcfd6dc, 1); g.lineBetween(-4 * f, -15, -24 * f + jx, -15 + jx);
    g.lineStyle(1.4, col, 1);
    if (W.id === 'twin') g.lineBetween(-4 * f, -11, -20 * f + jx, -11);
    else if (W.id === 'sickle') { g.lineBetween(-24 * f, -15, -30 * f, -23); g.lineBetween(-30 * f, -23, -24 * f, -29); }
    else if (W.id === 'mace') { g.fillStyle(0xd0b080, 1); g.fillCircle(-26 * f + jx, -15, 6); g.lineStyle(1.2, 0x6b4f2a, 1); g.strokeCircle(-26 * f + jx, -15, 6); }
    else if (W.id === 'lance') { g.lineBetween(-4 * f, -15, 8 * f, -15); g.fillStyle(0xffffff, 1); g.fillTriangle(-26 * f, -17, -26 * f, -13, -34 * f, -15); }
    else g.strokeCircle(-26 * f, -15, 2);
    return true;
  }
  if (W.id === 'twin') {
    g.lineStyle(1.7, 0xcfd6dc, 1); g.lineBetween(-6 * f, y0, -14 * f, -25 - bob); g.lineBetween(-6 * f, y0 - 3, -16 * f, -19 - bob);
    g.lineStyle(1, col, 0.95); g.strokeCircle(-14 * f, -26 - bob, 1.8); g.strokeCircle(-17 * f, -19 - bob, 1.8);
  } else if (W.id === 'sickle') {
    g.lineStyle(2, 0xcfd6dc, 1); g.lineBetween(-6 * f, y0 + 2, -13 * f, -27 - bob);
    g.lineStyle(2.6, col, 1); g.beginPath(); g.moveTo(-13 * f, -27 - bob); g.lineTo(-10 * f, -33 - bob); g.lineTo(-3 * f, -35 - bob); g.lineTo(0, -31 - bob); g.strokePath();
  } else if (W.id === 'mace') {
    g.lineStyle(2.6, 0x8a6a46, 1); g.lineBetween(-6 * f, y0 + 1, -14 * f, -24 - bob);
    g.fillStyle(0xd0b080, 1); g.fillCircle(-15 * f, -27 - bob, 4.6); g.lineStyle(1.2, 0x6b4f2a, 1); g.strokeCircle(-15 * f, -27 - bob, 4.6);
    g.fillStyle(0x6b4f2a, 1); g.fillCircle(-17 * f, -28 - bob, 1); g.fillCircle(-13 * f, -26 - bob, 1);
  } else if (W.id === 'lance') {
    g.lineStyle(1.8, 0xcfd6dc, 1); g.lineBetween(-7 * f, -4 - bob, -20 * f, -37 - bob);
    g.fillStyle(0xffffff, 1); g.fillTriangle(-20 * f, -37 - bob, -17 * f, -45 - bob, -23 * f, -42 - bob);
    g.lineStyle(1, col, 0.9); g.strokeCircle(-9 * f, -8 - bob, 2);
  } else return false;
  return true;
}

// ---------- дуга удара ----------
/** рисует дугу удара героя; для обычных ударов иглы по земле — исходный росчерк v1.8 */
export function drawSwingArc(w: World, p: Player, fx: G): void {
  if (p.downed || p.atkT <= 0) return;
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
  if (W.id === 'needle' && (sw.k === 'g' || sw.k === 'f')) return false; // обычные удары иглы рисует исходный код
  const k = Math.max(0, Math.min(1, p.atkT / sw.dur)), el = 1 - k;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2 - 2, dir = p.atkDir, f = dir === 'f' ? (sw.k === 'g' || sw.k === 'f' ? p.face : sw.f0) : 1;
  const th = dir === 'f' ? (f > 0 ? 0 : PI) : dir === 'u' ? -PI / 2 : PI / 2, col = W.col!, acc = p.pal.accent;
  const box = atkBox(w, p), id = W.id, th0 = sw.f0 > 0 ? 0 : PI;
  if (sw.k === 'c') {
    if (id === 'needle') { // волна: полумесяц летит вперёд и тает
      const L = Math.max(10, sw.len * Math.min(1, el / 0.7)), fxX = sw.x0 + sw.f0 * L;
      for (let i = 0; i < 4; i++) band(fx, fxX - sw.f0 * (16 + i * 18), sw.y0, th0, sw.f0, -1.05, 1.05, 34 - i * 2, 9 + (3 - i) * 2, i ? acc : 0xffffff, (0.85 - i * 0.2) * k);
      edge(fx, fxX - sw.f0 * 16, sw.y0, th0, sw.f0, -1.05, 1.05, 36, 2, 0xffffff, k);
    } else if (id === 'twin') { // шквал: три вращающихся кольца
      const t0 = el * 26;
      for (let i = 0; i < 3; i++) band(fx, cx, cy, 0, 1, t0 + i * 2.09, t0 + i * 2.09 + 1.5, 50 + i * 2, 7, i === 1 ? acc : col, 0.8 * (0.4 + 0.6 * k));
      fx.lineStyle(2, 0xffffff, 0.6 * k); fx.strokeCircle(cx, cy, 36 + 22 * Math.sin(el * PI));
    } else if (id === 'sickle') { // жатва: гигантский взмах от затылка через верх вперёд
      const cur = -2.5 + 3.4 * ease(Math.min(1, el * 1.5)), r0 = Math.max(-2.5, cur - 1.9), cxx = cx - sw.f0 * 8, cyy = cy + 10;
      band(fx, cxx, cyy, th0, sw.f0, r0, cur, 88, 34, col, 0.9 * k + 0.1); band(fx, cxx, cyy, th0, sw.f0, r0 + 0.5, cur, 70, 10, 0xffffff, 0.7 * k);
      edge(fx, cxx, cyy, th0, sw.f0, r0, cur, 90, 3, acc, k);
    } else if (id === 'mace') { // удар оземь: ударная волна по земле в обе стороны
      const half = 200 * Math.min(1, el / 0.5) + 10, fy = sw.fy;
      for (const s of [-1, 1]) {
        const x = sw.x0 + s * half;
        fx.fillStyle(col, 0.85 * k); fx.fillTriangle(x, fy, x - s * 30, fy - 8, x - s * 18, fy - 34 * (0.4 + 0.6 * k));
        fx.fillStyle(0xffffff, 0.6 * k); fx.fillTriangle(x - s * 34, fy, x - s * 56, fy - 6, x - s * 46, fy - 22 * k);
      }
      fx.lineStyle(3, 0xffffff, 0.8 * k); fx.lineBetween(sw.x0 - half, fy - 1, sw.x0 + half, fy - 1);
      fx.fillStyle(col, 0.3 * k); fx.fillEllipse(sw.x0, fy - 4, half * 2, 26);
    } else { // копьё: рывок-прокол — длинный росчерк
      const xa = sw.f0 > 0 ? box.x : box.x + box.w, xb = sw.f0 > 0 ? box.x + box.w : box.x, yy = box.y + box.h / 2;
      fx.fillStyle(col, 0.5 * k); fx.fillTriangle(xa, yy - 9, xa, yy + 9, xb, yy);
      fx.fillStyle(0xffffff, 0.9 * k); fx.fillTriangle(xa, yy - 3, xa, yy + 3, xb, yy);
      fx.lineStyle(2, acc, 0.8 * k); for (let i = -1; i <= 1; i += 2) fx.lineBetween(xa + sw.f0 * 10, yy + i * 14, xa + sw.f0 * 90, yy + i * 4);
    }
    return true;
  }
  const ox = cx + (dir === 'f' ? 0 : Math.cos(th) * 4), oy = cy + (dir === 'f' ? 0 : Math.sin(th) * 4);
  if (id === 'twin') {
    if (sw.k === 'f') { // вихрь
      const t0 = el * 18;
      for (let i = 0; i < 3; i++) band(fx, cx, cy, 0, 1, t0 + i * 2.09, t0 + i * 2.09 + 1.45, 46, 8, i === 1 ? acc : col, 0.85 * k);
      fx.lineStyle(2, 0xffffff, 0.7 * k); fx.strokeCircle(cx, cy, 30 + 20 * el);
    } else if (sw.k === 'a2') {
      band(fx, cx, cy, 0, 1, el * 12, el * 12 + 3.6, 40, 9, col, 0.85 * k); fx.lineStyle(2, acc, 0.8 * k); fx.strokeCircle(cx, cy, 30 + 10 * el);
    } else {
      const j = (sw.k === 'a1' ? 0.7 : 0.25) * (((p['combo'] as number) || 0) % 2 ? 1 : -1);
      band(fx, ox, oy, th, f, -0.85 + j * 0.3, 0.85 + j * 0.3, 32, 9, col, 0.9 * k); band(fx, ox, oy + (dir === 'f' ? 7 : 0), th, f, -0.7, 0.7 - j * 0.3, 25, 6, acc, 0.75 * k);
      if (sw.k === 'a1') { fx.lineStyle(2, 0xffffff, 0.8 * k); fx.lineBetween(ox + f * 6, oy - 10, ox + f * 40, oy + 10); fx.lineBetween(ox + f * 6, oy + 10, ox + f * 40, oy - 10); }
    }
  } else if (id === 'sickle') {
    if (sw.k === 'a2') { const cur = -PI / 2 + el * PI * 2; band(fx, cx, cy - 6, 0, 1, cur - 2.6, cur, 62, 20, col, 0.9 * k); edge(fx, cx, cy - 6, 0, 1, cur - 2.6, cur, 63, 2.5, 0xffffff, k); }
    else if (dir === 'f') {
      const a = sw.k === 'a1' ? [-1.2, 1.3] : [-2.2, 0.55], cur = a[0]! + (a[1]! - a[0]!) * ease(Math.min(1, el * 1.4)), r0 = Math.max(a[0]!, cur - 1.5);
      const cxx = cx - f * 6, cyy = cy + (sw.k === 'a1' ? -4 : 10), R = sw.k === 'f' ? 76 : 68;
      band(fx, cxx, cyy, th, f, r0, cur, R, 24, col, 0.92 * k + 0.08); band(fx, cxx, cyy, th, f, r0 + 0.3, cur, R - 6, 6, 0xffffff, 0.75 * k);
      edge(fx, cxx, cyy, th, f, r0, cur, R + 1, 2.4, acc, k);
    } else {
      const cur = -1.4 + 2.8 * ease(Math.min(1, el * 1.4)); band(fx, ox, oy, th, 1, -1.4, cur, 60, 20, col, 0.9 * k + 0.1); edge(fx, ox, oy, th, 1, -1.4, cur, 61, 2.4, acc, k);
    }
  } else if (id === 'mace') {
    if (sw.k === 'a2') { band(fx, cx, cy, 0, 1, el * 9, el * 9 + 3.9, 46, 24, col, 0.88 * k); fx.lineStyle(3, 0xffffff, 0.7 * k); fx.strokeCircle(cx, cy, 46 + 8 * el); }
    else {
      const cur = -1.1 + 2.2 * ease(Math.min(1, el * 2)), R = 44 + (dir === 'f' ? 0 : 6);
      band(fx, ox, oy, th, f, -1.1, cur, R, 28, col, 0.92 * k + 0.08); edge(fx, ox, oy, th, f, -1.1, cur, R + 1, 3, 0xffffff, 0.9 * k);
      if (el > 0.25) { // вспышка в точке удара
        const hx = box.x + (dir === 'f' ? (f > 0 ? box.w : 0) : box.w / 2), hy = box.y + (dir === 'u' ? 6 : dir === 'd' ? box.h - 6 : box.h / 2);
        fx.lineStyle(3, 0xffffff, 0.8 * k); for (let i = 0; i < 6; i++) { const an = i * 1.05 + el * 2; fx.lineBetween(hx + Math.cos(an) * 6, hy + Math.sin(an) * 6, hx + Math.cos(an) * 18, hy + Math.sin(an) * 18); }
      }
    }
  } else if (id === 'lance') {
    if (dir === 'f') {
      const xa = cx + f * 8, xb = box.x + (f > 0 ? box.w : 0), yy = box.y + box.h / 2, tx = xa + (xb - xa) * Math.min(1, el * 3.4 + 0.25), hh = (sw.k === 'f' ? 8 : 6) * (0.5 + 0.5 * k);
      fx.fillStyle(col, 0.7 * k + 0.1); fx.fillTriangle(xa, yy - hh, xa, yy + hh, tx, yy);
      fx.fillStyle(0xffffff, 0.95 * k); fx.fillTriangle(xa, yy - hh * 0.35, xa, yy + hh * 0.35, tx, yy);
      fx.fillStyle(acc, 0.8 * k); fx.fillCircle(tx, yy, 4 + 3 * k);
      if (sw.k === 'a1' || sw.k === 'a2') { fx.lineStyle(2, acc, 0.7 * k); fx.lineBetween(xa + f * 20, yy - 14, xa + f * 70, yy - 6); fx.lineBetween(xa + f * 20, yy + 14, xa + f * 70, yy + 6); }
    } else {
      const xm = box.x + box.w / 2, y0 = dir === 'u' ? box.y + box.h : box.y, y1 = dir === 'u' ? box.y : box.y + box.h, ty = y0 + (y1 - y0) * Math.min(1, el * 3.4 + 0.25);
      fx.fillStyle(col, 0.7 * k + 0.1); fx.fillTriangle(xm - 6, y0, xm + 6, y0, xm, ty); fx.fillStyle(0xffffff, 0.95 * k); fx.fillTriangle(xm - 2, y0, xm + 2, y0, xm, ty);
    }
  } else if (id === 'needle') { // воздушные взмахи иглы
    if (sw.k === 'a2') { band(fx, cx, cy, 0, 1, el * 9, el * 9 + 3.2, 40, 12, 0xf6f3e8, 0.85 * k); edge(fx, cx, cy, 0, 1, el * 9, el * 9 + 3.2, 41, 2, acc, 0.8 * k); }
    else { const cur = -1.9 + 2.4 * ease(Math.min(1, el * 1.6)), r0 = Math.max(-1.9, cur - 1.5); band(fx, cx - f * 4, cy + 2, th, f, r0, cur, 50, 15, 0xf6f3e8, 0.9 * k); edge(fx, cx - f * 4, cy + 2, th, f, r0, cur, 51, 2, acc, 0.8 * k); }
  }
  return true;
}
