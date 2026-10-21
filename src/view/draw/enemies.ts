// Враги (legacy/src/game.js drawEnemy, enemies2.js draw*).
import { E2_UNDER, clamp } from '../../core/balance';
import type { Enemy } from '../../core/types';
import type { G } from './common';

export function drawEnemy(e: Enemy, g: G, now: number): void {
  g.clear();
  if (e['e2']) { drawEnemy2(e, g, now); return; }
  const fl = e.flash > 0;
  const cx = e.x + e.w / 2, fy = e.y + e.h, f = e.face || 1;
  if (e.type === 'crawler') {
    const legs = Math.sin(now * 12 + e.t) * 2;
    g.lineStyle(1.6, 0x1a1a14, 1);
    for (let i = -1; i <= 1; i++) g.lineBetween(cx + i * 7, fy - 5, cx + i * 7 + (i % 2 ? legs : -legs), fy);
    g.fillStyle(fl ? 0xffffff : 0x4d6b3a, 1); g.fillEllipse(cx, fy - 9, 28, 17);
    g.fillStyle(fl ? 0xffffff : 0x6f9a4e, 1); g.fillEllipse(cx - 2 * f, fy - 12, 18, 7);
    g.fillStyle(0x3b7448, 1); g.fillCircle(cx - 6, fy - 16, 3); g.fillCircle(cx + 2, fy - 17, 2.5);
    g.fillStyle(0xffb347, 1); g.fillCircle(cx + 11 * f, fy - 7, 2.2);
  } else if (e.type === 'gnat') {
    const cy = e.y + 9, wing = Math.sin(now * 50 + e.t) > 0;
    g.fillStyle(0xd8f0e8, wing ? 0.55 : 0.25); g.fillEllipse(cx - 5, cy - 9, 12, 7); g.fillEllipse(cx + 5, cy - 9, 12, 7);
    g.fillStyle(fl ? 0xffffff : 0x6b4a6e, 1); g.fillCircle(cx, cy, 8);
    g.fillStyle(fl ? 0xffffff : 0x8d6a90, 1); g.fillEllipse(cx - 2 * f, cy - 3, 8, 4);
    g.fillStyle(0x2a1c2c, 1); g.fillTriangle(cx - 6 * f, cy + 2, cx - 14 * f, cy + 6, cx - 5 * f, cy + 6);
    g.fillStyle(0xff7a6b, 1); g.fillCircle(cx + 4 * f, cy - 1, 2.2);
  } else {
    const angry = e['state'] === 'wind' || e['state'] === 'charge';
    const shake = e['state'] === 'wind' ? Math.sin(now * 60) * 1.5 : 0;
    const x = cx + shake;
    g.lineStyle(2, 0x15161c, 1);
    const legs = e['state'] === 'charge' ? Math.sin(now * 30) * 3 : Math.sin(now * 10) * 2;
    for (let i = -1; i <= 1; i++) g.lineBetween(x + i * 10, fy - 6, x + i * 10 + legs * (i % 2 ? 1 : -1), fy);
    g.fillStyle(fl ? 0xffffff : 0x3d4a5c, 1); g.fillEllipse(x, fy - 12, 38, 22);
    g.fillStyle(fl ? 0xffffff : 0x56667d, 1); g.fillEllipse(x - 4 * f, fy - 16, 22, 8);
    g.fillStyle(0xcfc6a8, 1); g.fillTriangle(x + 14 * f, fy - 14, x + 30 * f, fy - 22, x + 16 * f, fy - 8);
    g.fillStyle(angry ? 0xff4d3c : 0xffb347, 1); g.fillCircle(x + 12 * f, fy - 10, 2.6);
    if (e['state'] === 'stun') { g.fillStyle(0xffe3a3, 0.8); for (let i = 0; i < 3; i++) g.fillCircle(x + Math.cos(now * 6 + i * 2.1) * 12, fy - 30 + Math.sin(now * 6 + i * 2.1) * 4, 2); }
  }
}

function drawEnemy2(e: Enemy, g: G, now: number): void {
  if (e.type === 'spitter') drawSpitter(g, e, now);
  else if (e.type === 'shell') drawShell(g, e, now);
  else if (e.type === 'bat') drawBat(g, e, now);
  else if (e.type === 'lurker') drawLurker(g, e, now);
}
function drawSpitter(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0, cx = e.x + e.w / 2, fy = e.y + e.h, f = e.face || 1;
  const wind = e['state'] === 'wind', k = wind ? clamp(1 - e['st'] / 0.65, 0, 1) : 0, flee = e['state'] === 'flee' || e['state'] === 'hop';
  const sx = e['state'] === 'hop' ? 0.9 : 1, sh = wind ? Math.sin(now * 50) * k : 0;
  g.lineStyle(2, 0x2a3414, 1);
  const lg = flee ? Math.sin(now * 28) * 4 : 0;
  g.lineBetween(cx - 5, fy - 5, cx - 7 + lg, fy); g.lineBetween(cx + 5, fy - 5, cx + 7 - lg, fy);
  g.fillStyle(fl ? 0xffffff : 0x6f8a34, 1); g.fillEllipse(cx + sh, fy - 9, 22 * sx, 16 / sx + k * 2);
  g.fillStyle(fl ? 0xffffff : 0xa9bf5a, 1); g.fillEllipse(cx + sh - 2 * f, fy - 6, 14, 8);
  g.fillStyle(fl ? 0xffffff : (wind ? 0xd5f26a : 0x86a342), 1); g.fillCircle(cx + sh + 7 * f, fy - 10, 6 + k * 5); // щёки раздуваются
  g.fillStyle(0x15200a, 1); g.fillCircle(cx + sh + 8 * f, fy - 16, 3.2);
  g.fillStyle(flee ? 0xffffff : 0xffe36b, 1); g.fillCircle(cx + sh + 8 * f, fy - 16, 2.2);
  g.fillStyle(0x15200a, 1); g.fillCircle(cx + sh + 9 * f, fy - 16, flee ? 0.7 : 1.1);
  if (wind) { // светящийся рот и кольцо-предупреждение
    g.fillStyle(0xc7f08a, 0.5 + 0.4 * k); g.fillCircle(cx + sh + 13 * f, fy - 9, 2 + 3 * k);
    g.lineStyle(1.5, 0xc7f08a, 0.3 + 0.4 * Math.abs(Math.sin(now * 24))); g.strokeCircle(cx + 13 * f, fy - 9, 6 + 10 * k);
  }
  if (e['state'] === 'recover') { g.fillStyle(0xc7f08a, 0.7); g.fillCircle(cx + 15 * f, fy - 7 + Math.sin(now * 20), 1.6); }
}
function drawShell(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0, cx = e.x + e.w / 2, fy = e.y + e.h, f = e.face || 1, cracked = e['armorT'] > 0, st = e['state'];
  const blink = cracked && Math.sin(now * 22) > 0;
  const plate = fl ? 0xffffff : (cracked ? 0x7a5a48 : 0x5a6470), shine = fl ? 0xffffff : (cracked ? 0xa07a5c : 0x8d9aab), rim = 0x20262e;
  if (st === 'spin') { // шар: вращающиеся швы
    const cy = fy - 16, a = now * 20 * f;
    g.fillStyle(plate, 1); g.fillCircle(cx, cy, 16); g.lineStyle(2.5, rim, 1); g.strokeCircle(cx, cy, 16);
    g.lineStyle(2, shine, 1); for (let i = 0; i < 3; i++) g.lineBetween(cx + Math.cos(a + i * 2.1) * 4, cy + Math.sin(a + i * 2.1) * 4, cx + Math.cos(a + i * 2.1) * 15, cy + Math.sin(a + i * 2.1) * 15);
    g.fillStyle(0xffe3a3, 0.5); g.fillEllipse(cx - f * 14, fy - 1, 22, 4); // след от искр
  } else {
    const wind = st === 'wind', rush = st === 'rush';
    const k = wind ? clamp(1 - e['st'] / 0.7, 0, 1) : 0, sh = wind ? Math.sin(now * 60) * 1.8 : 0, x = cx + sh;
    const lean = rush ? 3 * f : -k * 3 * f, rise = wind ? k * 5 : 0;
    g.lineStyle(2.4, rim, 1); const lg = rush ? Math.sin(now * 40) * 4 : st === 'walk' ? Math.sin(now * 9) * 2.5 : 0;
    for (let i = -1; i <= 1; i++) g.lineBetween(x + i * 12, fy - 7 - rise * 0.5, x + i * 12 + lg * (i % 2 ? 1 : -1), fy);
    g.fillStyle(plate, 1); g.fillEllipse(x + lean, fy - 14 - rise, 44, 26 + rise * 0.3);
    g.fillStyle(shine, 1); g.fillEllipse(x + lean - 4 * f, fy - 20 - rise, 26, 9);
    g.lineStyle(2, rim, 1); g.lineBetween(x + lean, fy - 26 - rise, x + lean - 2 * f, fy - 4 - rise);
    g.lineBetween(x + lean - 10, fy - 24 - rise, x + lean - 12, fy - 8 - rise); g.lineBetween(x + lean + 10, fy - 24 - rise, x + lean + 12, fy - 8 - rise);
    g.fillStyle(0xcfc6a8, 1); g.fillTriangle(x + lean + 18 * f, fy - 16 - rise, x + lean + 34 * f, fy - 22 - rise, x + lean + 20 * f, fy - 8 - rise); // рог
    g.fillStyle(wind || rush ? 0xff4d3c : 0xffb347, 1); g.fillCircle(x + lean + 15 * f, fy - 12 - rise, 2.8);
    if (st === 'stun' || st === 'tire') { g.fillStyle(0xffe3a3, 0.8); for (let i = 0; i < 3; i++) g.fillCircle(x + Math.cos(now * 6 + i * 2.1) * 14, fy - 34 + Math.sin(now * 6 + i * 2.1) * 4, 2); }
  }
  if (cracked) { // раскалённые трещины: броню можно пробить
    g.lineStyle(2, blink ? 0xffffff : 0xffa040, 1);
    g.lineBetween(cx - 8, fy - 24, cx - 2, fy - 16); g.lineBetween(cx - 2, fy - 16, cx - 7, fy - 8); g.lineBetween(cx + 6, fy - 25, cx + 10, fy - 14);
  }
  if (e['blockT'] > 0) { g.lineStyle(2.5, 0xffffff, 0.9); g.strokeCircle(cx, fy - 14, 24 + (0.15 - e['blockT']) * 80); }
}
function drawBat(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0, cx = e.x + e.w / 2, cy = e.y + e.h / 2, f = e.face || 1, st = e['state'];
  if (st === 'roost') { // висит вниз головой, крылья сложены
    g.fillStyle(0x2a2233, 1); g.fillEllipse(cx, cy + 2, 10, 14); g.fillTriangle(cx - 5, cy - 4, cx - 12, cy + 8, cx - 1, cy + 8); g.fillTriangle(cx + 5, cy - 4, cx + 12, cy + 8, cx + 1, cy + 8);
    g.fillStyle(0x5a3f66, 1); g.fillCircle(cx, cy + 8, 4); g.fillStyle(0xff9a7a, 0.7); g.fillCircle(cx - 1.5, cy + 9, 1); g.fillCircle(cx + 1.5, cy + 9, 1);
    return;
  }
  const wind = st === 'wind', dive = st === 'dive', k = wind ? clamp(1 - e['st'] / 0.55, 0, 1) : 0;
  const flap = dive ? 0.3 : Math.sin(now * (wind ? 38 : 24) + e['k'] * 2), sh = wind ? Math.sin(now * 70) * 1.6 * k : 0, x = cx + sh;
  if (dive) { g.lineStyle(2, 0xff7a6b, 0.35); g.lineBetween(x, cy, x - (e.vx || 0) * 0.07, cy - (e.vy || 0) * 0.07); }
  g.fillStyle(fl ? 0xffffff : 0x3a2a48, 1);
  g.fillTriangle(x - 3, cy - 2, x - 20, cy - 8 - flap * 9, x - 14, cy + 6); g.fillTriangle(x + 3, cy - 2, x + 20, cy - 8 - flap * 9, x + 14, cy + 6);
  g.fillStyle(fl ? 0xffffff : 0x5a3f66, 1); g.fillEllipse(x, cy, 12, 14);
  g.fillTriangle(x - 5, cy - 6, x - 3, cy - 12, x - 1, cy - 6); g.fillTriangle(x + 5, cy - 6, x + 3, cy - 12, x + 1, cy - 6);
  g.fillStyle(wind || dive ? 0xff3a2a : 0xffb347, 1); g.fillCircle(x - 2 * f + 1, cy - 2, 1.8); g.fillCircle(x + 3 * f, cy - 2, 1.8);
  if (wind) { g.lineStyle(1.5, 0xff3a2a, 0.3 + 0.5 * k); g.strokeCircle(x, cy, 10 + 8 * k); }
}
function drawLurker(g: G, e: Enemy, now: number): void {
  const fl = e.flash > 0, cx = e.x + e.w / 2, st = e['state'], f = e.face || 1;
  const fy: number = E2_UNDER.includes(st) ? e.y - 50 : e['fy']; // уровень пола (view не меняет состояние ядра)
  if (st === 'hidden') { // еле заметные трещинки и пыль
    g.lineStyle(1.5, 0x1b120a, 0.5); g.lineBetween(cx - 12, fy, cx - 4, fy - 1.5); g.lineBetween(cx + 3, fy - 1, cx + 13, fy);
    g.fillStyle(0x6b5a44, 0.35); g.fillEllipse(cx, fy - 1, 22, 3);
    return;
  }
  if (st === 'track') { // ползущий бугор
    const w = 30 + Math.sin(now * 20) * 3;
    g.fillStyle(0x4a3a2a, 0.9); g.fillEllipse(cx, fy - 2, w, 8); g.fillStyle(0x7a6850, 0.8); g.fillEllipse(cx, fy - 4, w * 0.6, 4);
    g.lineStyle(1.5, 0x2a1d10, 0.8); for (let i = -2; i <= 2; i++) g.lineBetween(cx + i * 7, fy - 1, cx + i * 9, fy + 2);
    return;
  }
  if (st === 'warn') { // красная печать, трещины, камешки
    const k = clamp(1 - e['st'] / 0.75, 0, 1), p = Math.abs(Math.sin(now * (14 + 14 * k)));
    g.fillStyle(0xd23a2a, 0.15 + 0.25 * p); g.fillEllipse(cx, fy - 1, 54, 12);
    g.lineStyle(2, 0xff5a3a, 0.5 + 0.5 * p); g.strokeEllipse(cx, fy - 1, 54 * (0.6 + 0.4 * k), 12);
    g.lineStyle(2, 0x1b120a, 1); for (let i = 0; i < 5; i++) { const a = i * 1.25 - 2.5; g.lineBetween(cx, fy, cx + Math.cos(a) * 26, fy + Math.sin(a) * 5); }
    g.fillStyle(0x7a6850, 1); for (let i = 0; i < 4; i++) g.fillRect(cx - 14 + i * 9, fy - 3 - k * 10 * ((i * 37) % 5 / 5 + 0.3) - Math.abs(Math.sin(now * 18 + i)) * 3, 3, 3);
    return;
  }
  // тело: присел перед броском / дигинг (сплющивается в землю) / обычное
  let sy = 1, by = e.y + e.h;
  if (st === 'dig') { sy = clamp(e['st'] / 0.5, 0.05, 1); by = fy; }
  if (st === 'tell') sy = 0.8 + 0.1 * Math.sin(now * 50);
  const h = 24 * sy, y0 = by - h, sh = st === 'tell' ? Math.sin(now * 60) * 1.4 : 0, x = cx + sh;
  g.fillStyle(fl ? 0xffffff : 0x7a5434, 1); g.fillEllipse(x, y0 + h * 0.6, 28, h * 0.9);
  g.fillStyle(fl ? 0xffffff : 0xa87a4c, 1); g.fillEllipse(x - 3 * f, y0 + h * 0.4, 16, h * 0.35);
  g.fillStyle(fl ? 0xffffff : 0x4a3220, 1); for (let i = -1; i <= 1; i++) g.fillTriangle(x + i * 8 - 3, y0 + h * 0.3, x + i * 8 + 3, y0 + h * 0.3, x + i * 8, y0 - 5 * sy);
  g.fillStyle(0x1b120a, 1); g.fillEllipse(x + 8 * f, y0 + h * 0.65, 9, 7 * sy); // пасть
  g.fillStyle(st === 'tell' || st === 'pounce' || st === 'erupt' ? 0xff3a2a : 0xffe36b, 1); g.fillCircle(x + 7 * f, y0 + h * 0.35, 2.2);
  if (st === 'tired') { g.fillStyle(0xffe3a3, 0.8); for (let i = 0; i < 3; i++) g.fillCircle(x + Math.cos(now * 6 + i * 2.1) * 12, y0 - 8 + Math.sin(now * 6 + i * 2.1) * 3, 2); }
}
