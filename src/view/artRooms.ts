// Арены Владика (класс) и Тимы (берлога): статичные картинки целиком (legacy/src/vladik.js drawClassroom, tima.js drawDen).
import type Phaser from 'phaser';
import { PLAT, SOLID, T } from '../core/balance';
import { mulberry32 } from '../core/rng';
import type { Level } from '../core/types';
import type { Chunk } from './art';

const TAU = Math.PI * 2;
function put(scene: Phaser.Scene, key: string, cv: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
}

/** Пол, стены, окна, доска и парты — одной картинкой */
export function drawClassroom(scene: Phaser.Scene, L: Level): Chunk[] {
  const key = 'classroom', w = L.W * T, h = L.H * T;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!, R = mulberry32(77);
  const floorY = L.floorY! * T, top = 4 * T;
  // стена
  const wall = c.createLinearGradient(0, top, 0, floorY);
  wall.addColorStop(0, '#24302e'); wall.addColorStop(1, '#2d3b37');
  c.fillStyle = wall; c.fillRect(0, 0, w, h);
  // окна с вечерним небом
  for (const [a, b] of L.windows!) {
    const x = a! * T, ww = (b! - a! + 1) * T, y = 5 * T + 8, wh = 7 * T;
    const sky = c.createLinearGradient(0, y, 0, y + wh); sky.addColorStop(0, '#16203a'); sky.addColorStop(1, '#3b3352');
    c.fillStyle = sky; c.fillRect(x, y, ww, wh);
    c.fillStyle = 'rgba(255,240,200,0.8)'; for (let i = 0; i < 6; i++) c.fillRect(x + R() * ww, y + R() * wh * 0.6, 1.5, 1.5);
    c.strokeStyle = '#5a4634'; c.lineWidth = 6; c.strokeRect(x, y, ww, wh);
    c.lineWidth = 4; c.beginPath(); c.moveTo(x + ww / 2, y); c.lineTo(x + ww / 2, y + wh); c.moveTo(x, y + wh * 0.45); c.lineTo(x + ww, y + wh * 0.45); c.stroke();
    c.fillStyle = '#6b5236'; c.fillRect(x - 10, y + wh, ww + 20, 8);
  }
  // карниз над шторами
  c.fillStyle = '#4a3726'; c.fillRect(T, 4 * T + 6, (L.W - 2) * T, 6);
  // деревянные панели внизу
  c.fillStyle = '#3b2f27'; c.fillRect(0, floorY - 70, w, 70);
  c.strokeStyle = '#2a211b'; c.lineWidth = 2;
  for (let x = 20; x < w; x += 90) c.strokeRect(x, floorY - 60, 74, 50);
  c.fillStyle = '#5a4634'; c.fillRect(0, floorY - 72, w, 5);
  // доска
  const bx = 11 * T + 6, by = 5 * T + 10, bw = 6 * T - 12, bh = 4 * T;
  c.fillStyle = '#5a4634'; c.fillRect(bx - 8, by - 8, bw + 16, bh + 16);
  c.fillStyle = '#1f3a2c'; c.fillRect(bx, by, bw, bh);
  c.strokeStyle = 'rgba(232,234,223,0.55)'; c.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(bx + 14, by + 60 + i * 9); c.lineTo(bx + bw - 14, by + 60 + i * 9); c.stroke(); }
  c.fillStyle = 'rgba(232,234,223,0.6)';
  for (let i = 0; i < 6; i++) { const nx = bx + 60 + i * 22, ny = by + 64 + ((i * 7) % 4) * 9; c.beginPath(); c.ellipse(nx, ny, 4, 3, -0.4, 0, 6.3); c.fill(); c.fillRect(nx + 3, ny - 22, 1.4, 22); }
  c.fillStyle = '#8a7a66'; c.fillRect(bx, by + bh, bw, 5);
  // портреты и часы на второй стене
  for (let i = 0; i < 2; i++) {
    const px = 27 * T + 20 + i * 100, py = 6 * T;
    c.fillStyle = '#6b5236'; c.fillRect(px, py, 64, 80); c.fillStyle = '#2b2622'; c.fillRect(px + 6, py + 6, 52, 68);
    c.fillStyle = '#5c5047'; c.beginPath(); c.ellipse(px + 32, py + 34, 13, 16, 0, 0, 6.3); c.fill(); c.fillRect(px + 16, py + 50, 32, 24);
  }
  c.fillStyle = '#e8e2cf'; c.beginPath(); c.arc(22 * T, 5 * T + 12, 16, 0, 6.3); c.fill();
  c.strokeStyle = '#2b2622'; c.lineWidth = 2; c.beginPath(); c.arc(22 * T, 5 * T + 12, 16, 0, 6.3); c.stroke();
  c.beginPath(); c.moveTo(22 * T, 5 * T + 12); c.lineTo(22 * T, 5 * T + 2); c.moveTo(22 * T, 5 * T + 12); c.lineTo(22 * T + 8, 5 * T + 15); c.stroke();
  // сплошные тайлы: потолок, стены, паркет
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    if (L.grid[y]![x] !== SOLID) continue;
    c.fillStyle = y >= L.floorY! ? '#2a1f18' : '#1a2220'; c.fillRect(x * T, y * T, T, T);
  }
  // паркет
  for (let x = 0; x < w; x += 24) {
    c.fillStyle = (x / 24) % 2 ? '#7a5534' : '#6b4a2d'; c.fillRect(x, floorY, 24, 12);
    c.fillStyle = 'rgba(255,220,170,0.12)'; c.fillRect(x, floorY, 24, 2);
  }
  c.fillStyle = '#3b2a1c'; c.fillRect(0, floorY + 12, w, 4);
  c.fillStyle = '#4a3726'; c.fillRect(0, top - 8, w, 8);
  // парты: столешница и ножки до пола
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    if (L.grid[y]![x] !== PLAT || L.grid[y]![x - 1] === PLAT) continue;
    let x1 = x; while (L.grid[y]![x1 + 1] === PLAT) x1++;
    const dx = x * T, dw = (x1 - x + 1) * T, dy = y * T;
    c.fillStyle = '#2b2622'; c.fillRect(dx + 8, dy + 10, 5, floorY - dy - 10); c.fillRect(dx + dw - 13, dy + 10, 5, floorY - dy - 10);
    c.fillRect(dx + 8, dy + 40, dw - 16, 4);
    c.fillStyle = '#8a6440'; c.fillRect(dx, dy, dw, 10); c.fillStyle = '#a77b4f'; c.fillRect(dx, dy, dw, 3);
    c.strokeStyle = 'rgba(30,20,10,0.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(dx + 20, dy + 5); c.lineTo(dx + 40, dy + 6); c.stroke();
  }
  // ---- свет и объём ----
  // фактура штукатурки
  for (let i = 0; i < 2600; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)'; c.fillRect(T + R() * (w - 2 * T), top + R() * (floorY - top - 72), 2 + R() * 3, 1 + R() * 2); }
  // лунные лучи из окон на пол
  for (const [a, b] of L.windows!) {
    const x0 = a! * T, x1 = (b! + 1) * T, y1 = 12 * T + 8, y0 = 5 * T + 8;
    const lg = c.createLinearGradient(0, y0, 0, floorY); lg.addColorStop(0, 'rgba(150,170,255,0.10)'); lg.addColorStop(1, 'rgba(150,170,255,0.02)');
    c.fillStyle = lg; c.beginPath(); c.moveTo(x0, y1); c.lineTo(x1, y1); c.lineTo(x1 + 110, floorY); c.lineTo(x0 + 110, floorY); c.closePath(); c.fill();
    c.fillStyle = 'rgba(160,180,255,0.07)'; c.fillRect(x0 + 110, floorY, x1 - x0, 12);
  }
  // потолочные лампы с тёплыми конусами света
  for (const lx of [8 * T, 22 * T, 35 * T]) {
    c.strokeStyle = '#1a1410'; c.lineWidth = 2; c.beginPath(); c.moveTo(lx, top); c.lineTo(lx, top + 26); c.stroke();
    c.fillStyle = '#2b2622'; c.beginPath(); c.moveTo(lx - 22, top + 40); c.lineTo(lx + 22, top + 40); c.lineTo(lx + 10, top + 24); c.lineTo(lx - 10, top + 24); c.closePath(); c.fill();
    c.fillStyle = '#ffe7b0'; c.beginPath(); c.ellipse(lx, top + 41, 14, 4, 0, 0, TAU); c.fill();
    c.globalCompositeOperation = 'lighter';
    const cone = c.createLinearGradient(0, top + 40, 0, floorY); cone.addColorStop(0, 'rgba(255,214,150,0.16)'); cone.addColorStop(1, 'rgba(255,214,150,0.02)');
    c.fillStyle = cone; c.beginPath(); c.moveTo(lx - 18, top + 42); c.lineTo(lx + 18, top + 42); c.lineTo(lx + 150, floorY); c.lineTo(lx - 150, floorY); c.closePath(); c.fill();
    const pool = c.createRadialGradient(lx, floorY, 0, lx, floorY, 170); pool.addColorStop(0, 'rgba(255,200,130,0.22)'); pool.addColorStop(1, 'rgba(255,200,130,0)');
    c.fillStyle = pool; c.fillRect(lx - 170, floorY - 170, 340, 190);
    const halo = c.createRadialGradient(lx, top + 42, 0, lx, top + 42, 60); halo.addColorStop(0, 'rgba(255,230,180,0.35)'); halo.addColorStop(1, 'rgba(255,230,180,0)');
    c.fillStyle = halo; c.fillRect(lx - 60, top - 18, 120, 120);
    c.globalCompositeOperation = 'source-over';
  }
  // тени под партами и у плинтуса, затемнение углов
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    if (L.grid[y]![x] !== PLAT || L.grid[y]![x - 1] === PLAT) continue;
    let x1 = x; while (L.grid[y]![x1 + 1] === PLAT) x1++;
    const cx = (x + x1 + 1) * T / 2, rw = (x1 - x + 1) * T * 0.6;
    const sh = c.createRadialGradient(cx, floorY, 0, cx, floorY, rw); sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh; c.fillRect(cx - rw, floorY - 14, rw * 2, 20);
  }
  const base = c.createLinearGradient(0, floorY - 40, 0, floorY); base.addColorStop(0, 'rgba(0,0,0,0)'); base.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = base; c.fillRect(0, floorY - 40, w, 40);
  const ceil = c.createLinearGradient(0, top, 0, top + 90); ceil.addColorStop(0, 'rgba(0,0,0,0.45)'); ceil.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = ceil; c.fillRect(0, top, w, 90);
  for (const side of [0, 1]) { const sg = c.createLinearGradient(side ? w - 160 : 0, 0, side ? w : 160, 0); sg.addColorStop(side ? 0 : 1, 'rgba(0,0,0,0)'); sg.addColorStop(side ? 1 : 0, 'rgba(0,0,0,0.45)'); c.fillStyle = sg; c.fillRect(side ? w - 160 : 0, top, 160, floorY - top); }
  // блик на паркете
  const gloss = c.createLinearGradient(0, floorY, 0, floorY + 12); gloss.addColorStop(0, 'rgba(255,230,190,0.10)'); gloss.addColorStop(1, 'rgba(255,230,190,0)');
  c.fillStyle = gloss; c.fillRect(0, floorY, w, 12);
  put(scene, key, cv);
  return [{ key, x: 0 }];
}

/** Берлога Тимы */
export function drawDen(scene: Phaser.Scene, L: Level): Chunk[] {
  const key = 'den', w = L.W * T, h = L.H * T;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!, R = mulberry32(91), floorY = L.floorY! * T;
  // обои в полоску
  c.fillStyle = '#2b2533'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 28) { c.fillStyle = (x / 28) % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)'; c.fillRect(x, 4 * T, 14, floorY - 4 * T); }
  // окно
  const wx = 2 * T, wy = 6 * T, ww = 4 * T, wh = 4 * T;
  c.fillStyle = '#121a30'; c.fillRect(wx, wy, ww, wh);
  c.fillStyle = 'rgba(255,240,200,0.85)'; for (let i = 0; i < 8; i++) c.fillRect(wx + R() * ww, wy + R() * wh, 1.5, 1.5);
  c.fillStyle = '#e8e2cf'; c.beginPath(); c.arc(wx + ww * 0.7, wy + 28, 12, 0, 6.3); c.fill();
  c.strokeStyle = '#4a3a2a'; c.lineWidth = 6; c.strokeRect(wx, wy, ww, wh);
  // телевизор на тумбе
  const tx = 26 * T, ty = 11 * T;
  c.fillStyle = '#3b2f27'; c.fillRect(tx - 10, floorY - 50, 5 * T + 20, 50);
  c.fillStyle = '#111'; c.fillRect(tx, ty, 5 * T, 3 * T + 20);
  const scr = c.createLinearGradient(tx, ty, tx + 5 * T, ty + 3 * T); scr.addColorStop(0, '#2a6a8a'); scr.addColorStop(1, '#5b2a7a');
  c.fillStyle = scr; c.fillRect(tx + 8, ty + 8, 5 * T - 16, 3 * T + 4);
  c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '700 14px "Fira Sans", sans-serif'; c.textAlign = 'center';
  c.fillText('GAME OVER?', tx + 2.5 * T, ty + 1.7 * T);
  c.fillRect(tx + 2.5 * T - 2, floorY - 70, 4, 20);
  // плакаты
  const poster = (x: number, y: number, col: string, text: string): void => {
    c.fillStyle = col; c.fillRect(x, y, 70, 92); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 6, y + 6, 58, 58);
    c.fillStyle = '#f4efe0'; c.font = '700 12px "Fira Sans", sans-serif'; c.textAlign = 'center'; c.fillText(text, x + 35, y + 82);
  };
  poster(15 * T, 5 * T + 4, '#7a3a2a', 'ЧЕМПИОН'); poster(37 * T, 6 * T, '#2a4a6a', 'ЛВЛ 99');
  // плинтус и ковёр
  c.fillStyle = '#4a3726'; c.fillRect(0, floorY - 8, w, 8);
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    if (L.grid[y]![x] !== SOLID) continue;
    c.fillStyle = y >= L.floorY! ? '#3a2a22' : '#181420'; c.fillRect(x * T, y * T, T, T);
  }
  c.fillStyle = '#5a2a2a'; c.fillRect(6 * T, floorY, 30 * T, 10);
  c.fillStyle = '#7a3a34'; for (let x = 6 * T; x < 36 * T; x += 16) c.fillRect(x, floorY + 3, 8, 3);
  c.fillStyle = '#4a3726'; c.fillRect(0, 4 * T - 8, w, 8);
  // ---- свет и объём ----
  for (let i = 0; i < 2400; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.05)'; c.fillRect(T + R() * (w - 2 * T), 4 * T + R() * (floorY - 4 * T), 2 + R() * 3, 1 + R() * 2); }
  c.globalCompositeOperation = 'lighter';
  // синее свечение телевизора
  const tvx = 28.5 * T, tvy = 12.5 * T;
  const tv = c.createRadialGradient(tvx, tvy, 20, tvx, tvy, 420); tv.addColorStop(0, 'rgba(90,140,255,0.28)'); tv.addColorStop(0.5, 'rgba(120,80,220,0.08)'); tv.addColorStop(1, 'rgba(90,140,255,0)');
  c.fillStyle = tv; c.fillRect(tvx - 420, tvy - 420, 840, 840);
  const tvf = c.createRadialGradient(tvx, floorY, 0, tvx, floorY, 260); tvf.addColorStop(0, 'rgba(120,150,255,0.18)'); tvf.addColorStop(1, 'rgba(120,150,255,0)');
  c.fillStyle = tvf; c.fillRect(tvx - 260, floorY - 60, 520, 80);
  // торшер у дивана
  const lx = 15.5 * T;
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#2b2622'; c.fillRect(lx - 2, 9 * T, 4, floorY - 9 * T); c.fillRect(lx - 14, floorY - 6, 28, 6);
  c.fillStyle = '#c9a66b'; c.beginPath(); c.moveTo(lx - 24, 9 * T + 26); c.lineTo(lx + 24, 9 * T + 26); c.lineTo(lx + 14, 9 * T); c.lineTo(lx - 14, 9 * T); c.closePath(); c.fill();
  c.globalCompositeOperation = 'lighter';
  const lamp = c.createRadialGradient(lx, 9 * T + 20, 0, lx, 9 * T + 20, 300); lamp.addColorStop(0, 'rgba(255,200,120,0.30)'); lamp.addColorStop(0.4, 'rgba(255,180,100,0.10)'); lamp.addColorStop(1, 'rgba(255,180,100,0)');
  c.fillStyle = lamp; c.fillRect(lx - 300, 9 * T - 280, 600, 600);
  const lampF = c.createRadialGradient(lx, floorY, 0, lx, floorY, 220); lampF.addColorStop(0, 'rgba(255,190,120,0.20)'); lampF.addColorStop(1, 'rgba(255,190,120,0)');
  c.fillStyle = lampF; c.fillRect(lx - 220, floorY - 60, 440, 80);
  // свет из окна
  const mw = c.createLinearGradient(0, 6 * T, 0, floorY); mw.addColorStop(0, 'rgba(150,170,255,0.09)'); mw.addColorStop(1, 'rgba(150,170,255,0.02)');
  c.fillStyle = mw; c.beginPath(); c.moveTo(2 * T, 10 * T); c.lineTo(6 * T, 10 * T); c.lineTo(9 * T, floorY); c.lineTo(5 * T, floorY); c.closePath(); c.fill();
  c.globalCompositeOperation = 'source-over';
  // тени: под мебелью, у потолка и по углам
  for (const f of L.furniture!) {
    const cx = (f.x0 + f.x1 + 1) * T / 2, rw = (f.x1 - f.x0 + 1) * T * 0.65;
    const sh = c.createRadialGradient(cx, floorY, 0, cx, floorY, rw); sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh; c.fillRect(cx - rw, floorY - 16, rw * 2, 24);
  }
  const ceil = c.createLinearGradient(0, 4 * T, 0, 4 * T + 100); ceil.addColorStop(0, 'rgba(0,0,0,0.5)'); ceil.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = ceil; c.fillRect(0, 4 * T, w, 100);
  for (const side of [0, 1]) { const sg = c.createLinearGradient(side ? w - 180 : 0, 0, side ? w : 180, 0); sg.addColorStop(side ? 0 : 1, 'rgba(0,0,0,0)'); sg.addColorStop(side ? 1 : 0, 'rgba(0,0,0,0.5)'); c.fillStyle = sg; c.fillRect(side ? w - 180 : 0, 4 * T, 180, floorY - 4 * T); }
  put(scene, key, cv);
  return [{ key, x: 0 }];
}
