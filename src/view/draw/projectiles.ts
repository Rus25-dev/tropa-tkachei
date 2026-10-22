// Снаряды и вещи на карте: споры, волны, камни, плевки, дымовые бомбы, инструменты, бусины, предметы, шкала стойкости, статусы.
// Снаряды Владика (ключи, ноты, эхо) рисует его тело (draw/boss/vladik2.ts). Свои снаряды любого босса можно нарисовать в его файле draw/boss/<id>.ts.
import { KIT, POISE_MAX, STAGGER_T, STATUS_KINDS, T } from '../../core/balance';
import type { World } from '../../core/world';
import { type G, PI } from './common';

type Q = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- сущности: мешок полей ядра

const STORY_KINDS = new Set(['spore', 'wave', 'rock']);

export function drawProjectiles(w: World, fx: G, now: number): void {
  // общие снаряды боссов: споры, волны, камни
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
  drawExtraProjs(w, fx, now);
  drawToolEntities(w, fx, now);
}

function drawExtraProjs(w: World, fx: G, now: number): void {
  for (const pr of w.projs) {
    if (pr.kind === 'glob') {
      const x = pr.x + 6, y = pr.y + 6;
      fx.fillStyle(0xc7f08a, 0.2); fx.fillCircle(x, y, 11);
      fx.fillStyle(0x86a342, 1); fx.fillCircle(x, y, 6.5); fx.fillStyle(0xd5f26a, 1); fx.fillCircle(x - 1.5, y - 1.5, 3);
      fx.fillStyle(0x86a342, 0.6); fx.fillCircle(x - pr.vx * 0.02, y - pr.vy * 0.02, 3.5); // хвостик капли
    } else if (pr.kind === 'bomb') { // дымовая бомба героя
      const x = pr.x + 6, y = pr.y + 6;
      fx.fillStyle(0x3a3f45, 1); fx.fillCircle(x, y, 6); fx.fillStyle(0x9aa39f, 1); fx.fillCircle(x - 2, y - 2, 1.6);
      fx.lineStyle(1.5, 0xffd47a, 1); fx.lineBetween(x + 2, y - 5, x + 4, y - 9);
      fx.fillStyle(0xffd47a, 0.6 + Math.abs(Math.sin(now * 40)) * 0.4); fx.fillCircle(x + 4, y - 10, 2);
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
    } else if (q['kind'] === 'tspirit') { // нитяной снаряд: светящийся клубок с хвостом
      const f = q['f'] as number, pul = 1 + Math.sin(now * 30) * 0.1;
      for (let i = 1; i <= 4; i++) { fx.fillStyle(0xcfe8ff, 0.32 - i * 0.06); fx.fillEllipse(x - f * i * 11, y, 22 - i * 3, 12 - i * 1.6); }
      fx.fillStyle(0x9fd0ff, 0.28); fx.fillCircle(x, y, 17 * pul);
      fx.fillStyle(0xffffff, 1); fx.fillCircle(x, y, 7 * pul);
      fx.lineStyle(1.6, 0xcfe8ff, 0.9); fx.beginPath(); fx.arc(x, y, 11, now * 9, now * 9 + 4, false); fx.strokePath();
    } else if (q['kind'] === 'twraith') { // вопль: столб нити вверх, вспыхивает на каждом ударе
      const k = Math.max(0, q['life'] / (q['T'] || 1)), hit = (q['gap'] as number) > 0.06 ? 1 : 0.5;
      const cx = q['x'] + q['w'] / 2, top = q['y'], bot = q['y'] + q['h'];
      fx.fillStyle(0x9fd0ff, 0.14 * k * hit); fx.fillRect(q['x'], top, q['w'], q['h']);
      for (let i = -2; i <= 2; i++) { fx.lineStyle(i ? 1.5 : 3, i ? 0xcfe8ff : 0xffffff, 0.75 * k * hit); fx.lineBetween(cx + i * 9, bot, cx + i * 9 + Math.sin(now * 12 + i) * 5, top + (i % 2 ? 30 : 0)); }
      fx.lineStyle(2, 0xffffff, 0.8 * k); fx.strokeEllipse(cx, bot - 4, q['w'] * (1.3 - k * 0.3), 12);
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
    } else if (f['f'] === 'shock') { // волна нырка: две стороны по земле
      const R = KIT.DIVE.R * (1 - k * k * 0.6), fy = f['y'];
      for (const s of [-1, 1]) {
        const x = f['x'] + s * R;
        fx.fillStyle(0xcfe8ff, 0.8 * k); fx.fillTriangle(x, fy, x - s * 30, fy - 6, x - s * 18, fy - 36 * (0.4 + 0.6 * k));
        fx.fillStyle(0xffffff, 0.6 * k); fx.fillTriangle(x - s * 34, fy, x - s * 56, fy - 5, x - s * 46, fy - 20 * k);
      }
      fx.lineStyle(3, 0xffffff, 0.8 * k); fx.lineBetween(f['x'] - R, fy - 1, f['x'] + R, fy - 1);
      fx.fillStyle(0xcfe8ff, 0.25 * k); fx.fillEllipse(f['x'], fy - 4, R * 2, 24);
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
