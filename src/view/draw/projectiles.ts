// Снаряды и вещи на карте: споры, волны, буквы Миши, ноты Владика, пиво Тимы, корни, инструменты, бусины, предметы, ворота, выход, шкала стойкости, статусы.
// (legacy/src/game.js render, misha.js drawLetters, vladik.js drawVladikProjs, tima.js drawTimaProjs, bosses2.js drawExtraProjs/drawPoiseBars, tools.js, status.js, combat2.js drawItems)
import type Phaser from 'phaser';
import { POISE_MAX, STAGGER_T, STATUS_KINDS, T } from '../../core/balance';
import type { World } from '../../core/world';
import { type G, PI, drawClef, pts } from './common';

type Q = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- сущности: мешок полей ядра
export interface TextPool { take(): Phaser.GameObjects.Text }
export interface ProjPools { letters: TextPool; big: TextPool; stamps: TextPool }

const STORY_KINDS = new Set(['spore', 'wave', 'rock']);

export function drawProjectiles(w: World, fx: G, fb: G, now: number, pools: ProjPools): void {
  // снаряды Корнематки
  for (const pr of w.projs) {
    if (!STORY_KINDS.has(pr.kind)) continue;
    if ((pr.delay ?? 0) > 0) {
      fx.fillStyle(0x8fae9c, 0.5); fx.fillTriangle(pr.x + 2, 19 * T, pr.x + 14, 19 * T, pr.x + 8, 19 * T + 8); continue;
    }
    if (pr.kind === 'spore') {
      fx.fillStyle(0xc7f08a, 0.25); fx.fillCircle(pr.x + 6, pr.y + 6, 10);
      fx.fillStyle(0xa8d86a, 1); fx.fillCircle(pr.x + 6, pr.y + 6, 6); fx.fillStyle(0xe8ffc0, 1); fx.fillCircle(pr.x + 4, pr.y + 4, 2);
    } else if (pr.kind === 'wave') {
      fx.fillStyle(0x9ff0c8, 0.3); fx.fillEllipse(pr.x + 12, pr.y + 14, 34, 18);
      fx.fillStyle(0x6b8f6a, 1);
      for (let i = 0; i < 3; i++) fx.fillTriangle(pr.x + i * 8, pr.y + 18, pr.x + 4 + i * 8, pr.y + 2 + Math.sin(now * 30 + i) * 3, pr.x + 8 + i * 8, pr.y + 18);
    } else if (pr.kind === 'rock') {
      fx.fillStyle(0x2b3d36, 1); fx.fillRoundedRect(pr.x, pr.y, 16, 16, 4); fx.fillStyle(0x3b7448, 1); fx.fillRect(pr.x + 2, pr.y, 12, 3);
    }
  }
  if (w.misha) drawLetters(w, fx, now, pools);
  if (w.vladik) drawVladikProjs(w, fx, now);
  if (w.tima) { drawTimaProjs(w, fx, fb, now); drawStampLabels(w, pools.stamps); }
  drawExtraProjs(w, fx, fb, now);
  drawToolEntities(w, fx, now);
}

function drawLetters(w: World, fx: G, now: number, pools: ProjPools): void {
  let li = 0;
  for (const pr of w.projs) {
    if (pr.kind === 'letter' || pr.kind === 'rain') {
      const t = pools.letters.take();
      const hover = (pr.delay ?? 0) > 0, rain = pr.kind === 'rain';
      if (rain) { t.setText(pr['ch']).setPosition(pr.x + 11, pr.y + 13).setVisible(true).setRotation(0).setColor(hover ? '#ff9a7a' : '#f4efe0').setAlpha(hover ? 0.45 + Math.sin(now * 18) * 0.2 : 1); li++; continue; }
      t.setAlpha(1);
      t.setText(pr['ch']).setPosition(pr.x + 11, pr.y + 13 + (hover ? Math.sin(now * 8 + li) * 3 : 0)).setVisible(true)
        .setRotation(hover ? 0 : now * 9 + li).setColor(hover ? '#ffd47a' : '#f4efe0');
      li++;
    } else if (pr.kind === 'bigletter') {
      const t = pools.big.take();
      const warn = (pr.delay ?? 0) > 0;
      t.setText(pr['ch']).setPosition(pr.x + 28, pr.y + 30).setVisible(true).setAlpha(warn ? 0.35 + Math.sin(now * 20) * 0.15 : 1);
      if (warn) { fx.fillStyle(0xff6a4a, 0.45 + Math.sin(now * 20) * 0.15); fx.fillEllipse(pr.x + 28, 18 * T - 2, 64, 12); }
    } else if (pr.kind === 'bomb') {
      const x = pr.x + 6, y = pr.y + 6;
      fx.fillStyle(0x3a3f45, 1); fx.fillCircle(x, y, 6); fx.fillStyle(0x9aa39f, 1); fx.fillCircle(x - 2, y - 2, 1.6);
      fx.lineStyle(1.5, 0xffd47a, 1); fx.lineBetween(x + 2, y - 5, x + 4, y - 9);
      fx.fillStyle(0xffd47a, 0.6 + Math.random() * 0.4); fx.fillCircle(x + 4, y - 10, 2);
    }
  }
}

function drawVladikProjs(w: World, fx: G, now: number): void {
  for (const pr of w.projs) {
    if (pr.kind === 'clef') { if (pr['t0'] > 0) continue; drawClef(fx, pr.x + 14, pr.y + 20, 1.05, pr['rot'], 0xf4efe0); }
    else if (pr.kind === 'echo') {
      const warn = (pr.delay ?? 0) > 0, a = warn ? 0.22 + Math.sin(now * 24) * 0.1 : 0.7, f = pr.vx > 0 ? 1 : -1, cx = pr.x + 20, fy = pr.y + 84;
      if (!warn) for (let i = 1; i <= 4; i++) { fx.fillStyle(0xf4efe0, a * 0.2 / i); fx.fillEllipse(cx - f * i * 24, fy - 40, 30, 70); }
      fx.fillStyle(0xe8d9b0, a); fx.fillEllipse(cx, fy - 22, 36, 30); fx.fillEllipse(cx, fy - 46, 28, 26);
      fx.fillStyle(0xc0712f, a * 0.8); fx.fillEllipse(cx - 4, fy - 24, 12, 16);
      fx.fillStyle(0xd9b98f, a); fx.fillCircle(cx + 3 * f, fy - 72, 12);
      fx.lineStyle(2, 0xf4efe0, a); fx.lineBetween(cx + 10 * f, fy - 50, cx + 32 * f, fy - 34);
      if (warn) { fx.fillStyle(0xff9a7a, 0.55 + Math.sin(now * 20) * 0.2); for (let k = 0; k < 4; k++) { const ax = cx + f * (46 + k * 30); fx.fillTriangle(ax, fy - 6, ax - f * 12, fy - 14, ax - f * 12, fy + 2); } }
    } else if (pr.kind === 'note') {
      const x = pr.x + 7, y = pr.y + 14;
      fx.fillStyle(0x1a1410, 1); fx.fillEllipse(x, y, 13, 10); fx.fillStyle(0xffd47a, 1); fx.fillEllipse(x, y, 10, 7.5);
      fx.fillStyle(0xffd47a, 1); fx.fillRect(x + 3.5, y - 16, 2.2, 16); fx.fillTriangle(x + 5.5, y - 16, x + 12, y - 9, x + 5.5, y - 11);
    } else if (pr.kind === 'drip') {
      fx.fillStyle(0x9be84a, 0.95); fx.fillCircle(pr.x + 4, pr.y + 6, 4); fx.fillTriangle(pr.x + 1, pr.y + 5, pr.x + 7, pr.y + 5, pr.x + 4, pr.y - 2);
    }
  }
}

function drawTimaProjs(w: World, fx: G, fb: G, now: number): void {
  for (const q of w.puddles || []) {
    const a = Math.min(1, q.t) * 0.85;
    fb.fillStyle(0xf2c14e, a); fb.fillEllipse(q.x + q.w / 2, q.y - 2, q.w, 9);
    fb.fillStyle(0xfff6d8, a); for (let i = 0; i < 5; i++) fb.fillCircle(q.x + 10 + i * 15, q.y - 4 - Math.abs(Math.sin(now * 3 + i)) * 2, 3);
  }
  for (const pr of w.projs) {
    if (pr.kind === 'bottle') {
      const cs = Math.cos(pr['rot']), sn = Math.sin(pr['rot']), x = pr.x + 5, y = pr.y + 11;
      const P2 = (px: number, py: number): { x: number; y: number } => ({ x: x + px * cs - py * sn, y: y + px * sn + py * cs });
      fx.fillStyle(0x6b3d14, 1); fx.fillPoints(pts([P2(-5, -4), P2(5, -4), P2(5, 11), P2(-5, 11)]), true);
      fx.fillPoints(pts([P2(-2, -11), P2(2, -11), P2(2, -4), P2(-2, -4)]), true);
      fx.fillStyle(0xf4efe0, 1); fx.fillPoints(pts([P2(-5, 1), P2(5, 1), P2(5, 6), P2(-5, 6)]), true);
    } else if (pr.kind === 'pad') {
      fx.lineStyle(2, 0x1a1a22, 1); fx.lineBetween(pr['cx'] || pr.x, pr['cy'] || pr.y, pr.x + 13, pr.y + 9);
      fx.fillStyle(0x2a2a30, 1); fx.fillRoundedRect(pr.x, pr.y + 2, 26, 14, 6); fx.fillCircle(pr.x + 4, pr.y + 14, 5); fx.fillCircle(pr.x + 22, pr.y + 14, 5);
      fx.fillStyle(0xd0d0d6, 1); fx.fillCircle(pr.x + 8, pr.y + 8, 2.2);
      fx.fillStyle(0xff5a4a, 1); fx.fillCircle(pr.x + 19, pr.y + 6, 1.6); fx.fillStyle(0x5ab0ff, 1); fx.fillCircle(pr.x + 17, pr.y + 9, 1.6);
      fx.fillStyle(0x6bd36b, 1); fx.fillCircle(pr.x + 21, pr.y + 9, 1.6); fx.fillStyle(0xffd47a, 1); fx.fillCircle(pr.x + 19, pr.y + 12, 1.6);
    } else if (pr.kind === 'rwave') {
      fx.fillStyle(0xff3a2a, 0.3); fx.fillEllipse(pr.x + 12, pr.y + 12, 36, 22);
      fx.fillStyle(0xff6a4a, 1); for (let i = 0; i < 3; i++) fx.fillTriangle(pr.x + i * 8, pr.y + 18, pr.x + 4 + i * 8, pr.y + 2 + Math.sin(now * 30 + i) * 3, pr.x + 8 + i * 8, pr.y + 18);
    } else if (pr.kind === 'ringfx') {
      const a = Math.max(0, pr.life / 0.9);
      fx.lineStyle(10, 0xff3a2a, 0.6 * a); fx.strokeCircle(pr.x, pr.y, pr['r']); fx.lineStyle(3, 0xffc0b0, 0.8 * a); fx.strokeCircle(pr.x, pr.y, pr['r']);
    } else if (pr.kind === 'box') {
      fx.fillStyle(0x1e1e22, 1); fx.fillRoundedRect(pr.x, pr.y, 36, 22, 5); fx.fillStyle(0x34343c, 1); fx.fillRect(pr.x + 4, pr.y + 4, 28, 3);
      fx.fillStyle(0x6bd36b, 1); fx.fillCircle(pr.x + 28, pr.y + 14, 2);
    } else if (pr.kind === 'stamp') {
      const warn = (pr.delay ?? 0) > 0;
      if (warn) { fx.fillStyle(0xff5a4a, 0.45 + Math.sin(now * 20) * 0.15); fx.fillEllipse(pr.x + 40, w.L.floorY! * T - 2, 84, 12); }
      const a = warn ? 0.4 : 1;
      fx.fillStyle(0x6b3d14, a); fx.fillRect(pr.x + 34, pr.y - 26, 12, 26); fx.fillCircle(pr.x + 40, pr.y - 28, 9);
      fx.fillStyle(0x3a2a22, a); fx.fillRect(pr.x, pr.y, 80, 34); fx.fillStyle(0xd23a2a, a); fx.fillRect(pr.x + 2, pr.y + 34, 76, 10);
    }
  }
}
function drawStampLabels(w: World, pool: TextPool): void {
  for (const pr of w.projs) if (pr.kind === 'stamp') {
    const t = pool.take();
    t.setPosition(pr.x + 40, pr.y + 17).setAlpha((pr.delay ?? 0) > 0 ? 0.4 : 1).setVisible(true);
  }
}

function drawExtraProjs(w: World, fx: G, fb: G, now: number): void {
  for (const pr of w.projs as Q[]) {
    if (pr['kind'] === 'rootspike') {
      const fy = pr['y'] + pr['h'];
      if (pr['delay'] > 0) {
        fb.fillStyle(0x3b2a1c, 0.8); fb.fillEllipse(pr['x'] + 18, fy - 2, 46, 10);
        fb.lineStyle(2, 0x8a5a2c, 0.6 + Math.sin(now * 30) * 0.3);
        for (let i = 0; i < 4; i++) fb.lineBetween(pr['x'] + 18, fy - 2, pr['x'] + 18 + Math.cos(i * 1.6) * 20, fy - 2 + Math.sin(i * 1.6) * 4);
      } else {
        const k = Math.min(1, (0.55 - pr['life']) / 0.08 + 0.2), hh = pr['h'] * k;
        fx.fillStyle(0x4a3220, 1); fx.fillTriangle(pr['x'] + 2, fy, pr['x'] + 34, fy, pr['x'] + 18, fy - hh);
        fx.fillStyle(0x7a5434, 1); fx.fillTriangle(pr['x'] + 6, fy, pr['x'] + 18, fy, pr['x'] + 18, fy - hh);
        fx.fillStyle(0x3b7448, 1); fx.fillTriangle(pr['x'] + 10, fy - hh * 0.4, pr['x'] + 4, fy - hh * 0.55, pr['x'] + 12, fy - hh * 0.48);
      }
    } else if (pr['kind'] === 'staff') {
      const y = pr['y'] + 5;
      if (pr['delay'] > 0) {
        fx.lineStyle(3, 0xff9a7a, 0.4 + Math.sin(now * 16) * 0.2); fx.lineBetween(pr['x'], y, pr['x'] + pr['w'], y);
        fx.fillStyle(0xf4efe0, 0.35); for (let x = pr['x'] + 40; x < pr['x'] + pr['w']; x += 120) fx.fillEllipse(x, y, 7, 5);
      } else {
        fx.lineStyle(10, 0xffd47a, 0.25); fx.lineBetween(pr['x'], y, pr['x'] + pr['w'], y);
        fx.lineStyle(4, 0xfff6d8, 0.95); fx.lineBetween(pr['x'], y, pr['x'] + pr['w'], y);
        fx.fillStyle(0xffd47a, 1); for (let x = pr['x'] + 40 + ((now * 300) % 120); x < pr['x'] + pr['w']; x += 120) { fx.fillEllipse(x, y, 9, 7); fx.fillRect(x + 3, y - 14, 2, 14); }
      }
    } else if (pr['kind'] === 'mark') { // метка падения: сужающееся кольцо на полу
      const fy = w.L.floorY! * T, k = Math.max(0, pr['life'] / 1.3), r = 24 + 40 * k;
      fb.fillStyle(0xff5a4a, 0.28 + Math.sin(now * 22) * 0.12); fb.fillEllipse(pr['x'], fy - 2, r * 2, 14);
      fb.lineStyle(3, 0xffd47a, 0.9); fb.strokeEllipse(pr['x'], fy - 2, r * 2, 14);
      fb.lineStyle(1.5, 0xff9a7a, 0.4 + Math.sin(now * 22) * 0.2); fb.lineBetween(pr['x'], fy - 2, pr['x'], 4 * T);
    } else if (pr['kind'] === 'roller') {
      const warn = pr['delay'] > 0, a = warn ? 0.3 + Math.sin(now * 20) * 0.12 : 1, cx = pr['x'] + 23, cy = pr['y'] + 26, f = pr['vx'] > 0 ? 1 : -1;
      fx.fillStyle(0x23262e, a); fx.fillRoundedRect(pr['x'], pr['y'], 46, 52, 14);
      fx.fillStyle(0x3a4560, a); fx.fillRoundedRect(pr['x'] + 4, pr['y'] + 4, 38, 44, 11);
      fx.fillStyle(0xf4efe0, a * 0.8); for (let i = 0; i < 4; i++) fx.fillRect(pr['x'] + 10 + i * 8 - ((pr['x'] * 0.4) % 8), pr['y'] + 10, 3, 32);
      fx.lineStyle(3, 0xc9a227, a); fx.strokeCircle(cx, cy, 6);
      if (warn) { fx.fillStyle(0xff9a7a, 0.5 + Math.sin(now * 20) * 0.2); for (let k = 0; k < 4; k++) { const ax = cx + f * (46 + k * 30); fx.fillTriangle(ax, cy + 20, ax - f * 12, cy + 12, ax - f * 12, cy + 28); } }
    } else if (pr['kind'] === 'staffghost') {
      fx.lineStyle(1, 0xf4efe0, 0.12); fx.lineBetween(pr['x'], pr['y'] + 5, pr['x'] + pr['w'], pr['y'] + 5);
    } else if (pr['kind'] === 'collector') {
      const x = pr['x'] + 11, fy = pr['y'] + 22, f = pr['face'] || 1, fl = pr['flash'] > 0;
      fx.lineStyle(2, 0x15161c, 1); const leg = Math.sin(now * 20 + x) * 2; fx.lineBetween(x - 4, fy - 6, x - 4 + leg, fy); fx.lineBetween(x + 4, fy - 6, x + 4 - leg, fy);
      fx.fillStyle(fl ? 0xffffff : 0x2c2f38, 1); fx.fillEllipse(x, fy - 11, 20, 16);
      fx.fillStyle(0xf4efe0, 1); fx.fillTriangle(x + 2 * f, fy - 18, x + 8 * f, fy - 18, x + 5 * f, fy - 10);
      fx.fillStyle(0xd23a2a, 1); fx.fillRect(x + 4 * f - 1, fy - 17, 2, 6);
      fx.fillStyle(fl ? 0xffffff : 0x3a3f48, 1); fx.fillCircle(x + 6 * f, fy - 22, 6);
      fx.fillStyle(0xffd47a, 1); fx.fillCircle(x + 8 * f, fy - 23, 1.6);
      fx.fillStyle(0x6b3d14, 1); fx.fillRect(x - 13 * f - 4, fy - 9, 8, 7);
    } else if (pr['kind'] === 'trophy') {
      const x = pr['x'] + 15, y = pr['y'];
      if (pr['delay'] > 0) { fx.fillStyle(0xffd47a, 0.35 + Math.sin(now * 20) * 0.15); fx.fillEllipse(x, w.L.floorY! * T - 2, 40, 10); continue; }
      fx.fillStyle(0xffd47a, 1); fx.fillRect(x - 10, y + 24, 20, 6); fx.fillRect(x - 3, y + 16, 6, 9);
      fx.fillStyle(0xf2c14e, 1); fx.beginPath(); fx.arc(x, y + 6, 12, 0, Math.PI, false); fx.closePath(); fx.fillPath(); fx.fillRect(x - 12, y, 24, 7);
      fx.lineStyle(2, 0xffd47a, 1); fx.strokeCircle(x - 13, y + 7, 4); fx.strokeCircle(x + 13, y + 7, 4);
      fx.fillStyle(0xfff6d8, 0.9); fx.fillCircle(x - 4, y + 4, 2);
    } else if (pr['kind'] === 'glob') {
      const x = pr['x'] + 6, y = pr['y'] + 6;
      fx.fillStyle(0xc7f08a, 0.2); fx.fillCircle(x, y, 11);
      fx.fillStyle(0x86a342, 1); fx.fillCircle(x, y, 6.5); fx.fillStyle(0xd5f26a, 1); fx.fillCircle(x - 1.5, y - 1.5, 3);
      fx.fillStyle(0x86a342, 0.6); fx.fillCircle(x - pr['vx'] * 0.02, y - pr['vy'] * 0.02, 3.5); // хвостик капли
    }
  }
}

function drawToolEntities(w: World, fx: G, now: number): void {
  for (const q of w.tl as Q[]) {
    const x = q['x'] + q['w'] / 2, y = q['y'] + q['h'] / 2;
    if (q['kind'] === 'tneedle') {
      const st = q['st'], ang = q['ang'];
      const ux = Math.cos(ang), uy = Math.sin(ang), L = 13, vib = st === 2 ? Math.sin(now * 60) * 1.2 : 0;
      if (st === 1 || st === 4) { fx.fillStyle(0xffe3a3, 0.12 + Math.sin(now * 5) * 0.06); fx.fillCircle(x, y, 15); }
      if (st === 0) { fx.lineStyle(1.5, 0xffe3a3, 0.45); fx.lineBetween(x - ux * L, y - uy * L, x - ux * (L + 14), y - uy * (L + 14)); }
      fx.lineStyle(2.5, 0xf6f3e8, 1); fx.lineBetween(x - ux * L + vib, y - uy * L, x + ux * L + vib, y + uy * L);
      fx.fillStyle(0xffffff, 1); fx.fillCircle(x + ux * L + vib, y + uy * L, 2);
      fx.fillStyle(0xffd47a, 1); fx.fillCircle(x - ux * L, y - uy * L, 2);
    } else if (q['kind'] === 'ttrap') {
      const life = q['life'], arming = q['arm'] > 0;
      if (life < 2 && Math.floor(now * 10) % 2) continue;
      const bx = q['x'], by = q['y'] + q['h'];
      fx.fillStyle(0x000000, 0.3); fx.fillEllipse(x, by, q['w'] + 6, 6);
      fx.fillStyle(0x59483a, 1); fx.fillRect(bx, by - 4, q['w'], 4);
      fx.fillStyle(0xd9d4c3, 1);
      for (let i = 0; i < 5; i++) { const tx = bx + 2 + i * 5; fx.fillTriangle(tx, by - 4, tx + 5, by - 4, tx + 2.5, by - 12); }
      const blink = arming ? 0.3 : 0.5 + Math.sin(now * 8) * 0.5;
      fx.fillStyle(0xff6a4a, 0.25 + blink * 0.6); fx.fillCircle(x, by - 2, 2.2);
      fx.lineStyle(1, 0xffe3a3, 0.35); fx.strokeCircle(x, by - 4, 18 + Math.sin(now * 4) * 2);
    } else if (q['kind'] === 'tbomb') {
      const fuse = q['fuse'], pul = 1 + Math.sin(now * (14 + (0.9 - fuse) * 30)) * 0.12;
      fx.fillStyle(0xffd47a, 0.2); fx.fillCircle(x, y, 11 * pul);
      fx.fillStyle(0xe9e2cf, 1); fx.fillCircle(x, y, 6.5 * pul);
      fx.lineStyle(1.5, 0x8a7a55, 1); fx.beginPath(); fx.arc(x, y, 5, 0.3, 2.6, false); fx.strokePath(); fx.beginPath(); fx.arc(x, y, 5, 3.4, 5.7, false); fx.strokePath();
      fx.fillStyle(0xff9a3c, 1); fx.fillCircle(x + 3, y - 8, 2 + Math.sin(now * 30) * 0.6);
    }
  }
  // замёрзшие враги: нитяная сеть
  for (const e of w.enemies) if (!e.dead && e['frozenT'] > 0) {
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2, rx = e.w / 2 + 4, ry = e.h / 2 + 4;
    fx.lineStyle(1.5, 0xe8f6ff, 0.8); fx.strokeEllipse(ex, ey, rx * 2, ry * 2);
    fx.lineBetween(ex - rx, ey - ry * 0.5, ex + rx, ey + ry * 0.5); fx.lineBetween(ex - rx, ey + ry * 0.5, ex + rx, ey - ry * 0.5); fx.lineBetween(ex, ey - ry, ex, ey + ry);
  }
  // тяга крюка: нить от героя до точки зацепа
  for (const p of w.players) if (p['hk']) {
    fx.lineStyle(2, p.pal.accent, 0.9); fx.lineBetween(p.x + 7, p.y + 13, p['hk'].ax, p['hk'].ay);
    fx.fillStyle(0xffffff, 1); fx.fillCircle(p['hk'].ax, p['hk'].ay, 3);
  }
  for (const f of w.tfx as Q[]) {
    const k = Math.max(0, f['t'] / (f['T'] || 0.3));
    if (f['f'] === 'hook') {
      const pl = w.players[f['i']], col = pl && pl.pal ? pl.pal.accent : 0xffe3a3;
      fx.lineStyle(2.5, col, k); fx.lineBetween(f['x'], f['y'], f['x1'], f['y1']);
      fx.lineStyle(1.2, 0xffffff, k); fx.lineBetween(f['x'], f['y'], f['x1'], f['y1']);
      const ang = Math.atan2(f['y1'] - f['y'], f['x1'] - f['x']);
      fx.lineStyle(2.5, 0xffffff, k);
      for (const s of [-0.7, 0.7]) fx.lineBetween(f['x1'], f['y1'], f['x1'] - Math.cos(ang + s) * 9, f['y1'] - Math.sin(ang + s) * 9);
    } else if (f['f'] === 'boom') {
      const r = 90 * (1 - k * k);
      fx.fillStyle(0xffe3a3, 0.22 * k); fx.fillCircle(f['x'], f['y'], r);
      fx.lineStyle(4, 0xffffff, k); fx.strokeCircle(f['x'], f['y'], r);
      fx.lineStyle(2, 0xffd47a, k); fx.strokeCircle(f['x'], f['y'], r * 0.7);
    } else if (f['f'] === 'snap') {
      fx.lineStyle(3, 0xffffff, k);
      for (let s = -2; s <= 2; s++) fx.lineBetween(f['x'] + s * 6, f['y'], f['x'] + s * 9, f['y'] - 26 * (1 - k * 0.3));
    }
  }
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
  for (const [b, dy, wd] of [[w.boss, -24, 76], [w.vladik, -28, 70], [w.tima, -13, 70]] as const) {
    if (!b || ['dead', 'gone', 'sleep', 'intro'].includes(b.state) || b.y < -50) continue;
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
  for (const t of [...w.enemies, w.boss, w.vladik, w.tima] as (Q | null)[]) {
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
