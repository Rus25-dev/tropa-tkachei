// Боссы: Корнематка, Миша, Владик, Тима — фигуры и шторы (legacy/src/game.js drawBoss, misha.js drawMisha, vladik.js drawVladik/drawCurtains, tima.js drawTima).
import { clamp } from '../../core/balance';
import type { Boss } from '../../core/types';
import type { World } from '../../core/world';
import type { G } from './common';
import { pts } from './common';

/** Куда показывать реплику над головой (Text в renderer) */
export interface Say { show(text: string, x: number, y: number): void; hide(): void }

export function drawKorne(b: Boss, g: G, now: number): void {
  g.clear();
  if (b.state === 'gone') return;
  const cx = b.x + b.w / 2, fy = b.y + b.h, f = b.face;
  let shake = 0, squash = 1;
  if (b.state === 'leapWind' || b.state === 'chargeWind' || b.state === 'sporeWind') shake = Math.sin(now * 70) * 2;
  if (b.state === 'leapWind') squash = 0.85;
  if (b.state === 'roar') shake = Math.sin(now * 50) * 3;
  const alpha = b.state === 'dead' ? Math.max(0, b.t / 1.4) : 1;
  g.setAlpha(alpha);
  const x = cx + shake, fl = b.flash > 0, sleep = b.state === 'sleep';
  const H = 56 * squash, phase2 = b.hp <= b.maxHp / 2;
  // корни-лапы
  g.lineStyle(4, 0x2a3a26, 1);
  for (let i = 0; i < 4; i++) {
    const lx = x - 26 + i * 17, sw = Math.sin(now * (b.state === 'charge' ? 24 : 4) + i) * 4;
    g.lineBetween(lx, fy - 10, lx + sw - 6, fy);
  }
  g.fillStyle(fl ? 0xffffff : 0x34482f, 1); g.fillEllipse(x, fy - H / 2 - 4, 80, H);
  g.fillStyle(fl ? 0xffffff : 0x4a6a3c, 1); g.fillEllipse(x - 6 * f, fy - H / 2 - 12, 58, H * 0.5);
  g.fillStyle(0x5d8a46, 1);
  for (let i = 0; i < 6; i++) g.fillCircle(x - 30 + i * 12, fy - H - 1 + Math.sin(i * 1.7) * 3, 6 + (i % 3));
  g.fillStyle(0xffd47a, 1); g.fillCircle(x - 18, fy - H - 8, 2.5); g.fillCircle(x + 14, fy - H - 6, 2);
  // морда
  const ex = x + 22 * f, ey = fy - H / 2 - 2;
  g.fillStyle(0x1a2016, 1); g.fillEllipse(ex, ey + 4, 24, 26);
  const eyeC = sleep ? 0x55604a : (phase2 ? 0xff5a3c : 0xff9a3c);
  g.fillStyle(eyeC, sleep ? 0.6 : 0.3); g.fillCircle(ex - 3 * f, ey - 2, 9); g.fillCircle(ex + 6 * f, ey + 1, 7);
  g.fillStyle(eyeC, 1);
  if (sleep) { g.fillRect(ex - 7 * f - 3, ey - 2, 7, 2); g.fillRect(ex + 6 * f - 3, ey + 1, 6, 2); }
  else { g.fillCircle(ex - 3 * f, ey - 2, 3.6); g.fillCircle(ex + 6 * f, ey + 1, 3); }
  if (b.state === 'sporeWind' || b.state === 'roar') { g.fillStyle(0x0c0f0a, 1); g.fillEllipse(ex + 2 * f, ey + 11, 12, 8); }
  if (b.state === 'stun') { g.fillStyle(0xffe3a3, 0.9); for (let i = 0; i < 4; i++) g.fillCircle(x + Math.cos(now * 5 + i * 1.6) * 30, fy - H - 14 + Math.sin(now * 5 + i * 1.6) * 6, 2.5); }
}

const mishaBag = (m: Boss): { x: number; y: number; w: number; h: number } => { const cx = m.x + m.w / 2; return { x: cx - 26 * m.face - 15, y: m.y + 12, w: 30, h: 40 }; };

export function drawMisha(w: World, m: Boss, g: G, now: number, say: Say, smoke: (n: number, x: number, y: number) => void): void {
  g.clear();
  const f = m.face, fl = m.flash > 0, dead = m.state === 'dead';
  g.setAlpha(dead ? clamp(m.t / 1.2, 0, 1) : 1);
  let shake = 0; if (['chargeWind', 'bigWind', 'rollWind'].includes(m.state)) shake = Math.sin(now * 70) * 2;
  const cx = m.x + m.w / 2 + shake, fy = m.y + m.h;
  const walk = Math.abs(m.vx) > 5, legA = walk ? Math.sin(now * (m.state === 'charge' ? 26 : 10)) * 5 : 0;
  const cough = m.state === 'cough', hunch = cough ? 5 : m.state === 'charge' ? 3 : 0;
  const phase2 = m.hp <= m.maxHp / 2;
  // ноги
  g.lineStyle(5, 0x23262e, 1); g.lineBetween(cx - 10, fy - 14, cx - 10 + legA, fy); g.lineBetween(cx + 10, fy - 14, cx + 10 - legA, fy);
  g.fillStyle(0x23262e, 1); g.fillEllipse(cx - 10 + legA + 3 * f, fy - 1, 14, 6); g.fillEllipse(cx + 10 - legA + 3 * f, fy - 1, 14, 6);
  // рюкзак (сзади)
  const bag = mishaBag(m), bx = bag.x + (shake || 0), by = bag.y + hunch;
  g.fillStyle(fl ? 0xffffff : 0xe08a2c, 1); g.fillRoundedRect(bx, by, 30, 40, 7);
  g.fillStyle(fl ? 0xffffff : 0xa85f17, 1); g.fillRoundedRect(bx + 2, by + 22, 26, 14, 4);
  g.lineStyle(1.5, 0x6a3a0c, 1); g.strokeRoundedRect(bx + 2, by + 22, 26, 14, 4); g.lineBetween(bx + 8, by + 29, bx + 22, by + 29);
  if (m['zipT'] > 0) { // застёгнут: молния и замок
    g.lineStyle(2, 0x6a3a0c, 1); g.lineBetween(bx + 3, by + 3, bx + 27, by + 3);
    for (let k = 0; k < 8; k++) g.lineBetween(bx + 4 + k * 3, by + 1, bx + 4 + k * 3, by + 5);
    g.fillStyle(0xc9a227, 1); g.fillRoundedRect(bx + 11, by + 3, 8, 8, 2); g.lineStyle(1.5, 0xc9a227, 1); g.strokeCircle(bx + 15, by + 2, 3);
  } else { g.fillStyle(0x1a1410, 1); g.fillEllipse(bx + 15, by + 2, 24, 8); } // открытая молния — цель
  const anyBombs = w.players.some((p) => p.bombs > 0);
  if (anyBombs && !dead && !(m['zipT'] > 0)) { g.lineStyle(2, 0xffd47a, 0.35 + Math.sin(now * 5) * 0.25); g.strokeEllipse(bx + 15, by + 2, 30, 12); }
  // тело-толстовка с сегментами
  g.fillStyle(fl ? 0xffffff : 0x4f5b78, 1); g.fillEllipse(cx + 2 * f, fy - 32 + hunch * 0.5, 52, 46);
  g.lineStyle(2, 0x3a4560, 1);
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx + 2 * f, fy - 50 + i * 12 + hunch * 0.5, 24, 0.35 * Math.PI, 0.65 * Math.PI, false); g.strokePath(); }
  // лямки
  g.lineStyle(4, 0xa85f17, 1); g.lineBetween(bx + 15 + 10 * f, by + 6, cx + 12 * f, fy - 22); g.lineBetween(bx + 15 + 8 * f, by + 30, cx + 6 * f, fy - 14);
  // руки
  const arms = ['word', 'bigWind'].includes(m.state);
  g.lineStyle(5, fl ? 0xffffff : 0x4f5b78, 1);
  if (arms) { g.lineBetween(cx + 14 * f, fy - 44, cx + 22 * f, fy - 72); g.lineBetween(cx + 4 * f, fy - 46, cx - 4 * f, fy - 74); }
  else { g.lineBetween(cx + 18 * f, fy - 40, cx + 26 * f, fy - 24 + (cough ? -10 : 0)); }
  // голова
  const hx = cx + 8 * f, hy = fy - 66 + hunch;
  g.fillStyle(fl ? 0xffffff : 0x7c86a0, 1); g.fillCircle(hx, hy, 16);
  // кепка козырьком назад
  g.fillStyle(0xc8463c, 1); g.beginPath(); g.arc(hx, hy - 3, 16, Math.PI, 0, false); g.closePath(); g.fillPath();
  g.fillRect(Math.min(hx - 16 * f, hx - 28 * f), hy - 5, 12, 4);
  g.fillStyle(0xf4efe0, 1); g.fillCircle(hx, hy - 17, 2.5);
  // глаза
  if (cough || dead) {
    g.lineStyle(2, 0x1a1410, 1);
    for (const ex of [hx + 4 * f, hx + 11 * f]) { g.lineBetween(ex - 3, hy - 1, ex + 3, hy + 5); g.lineBetween(ex + 3, hy - 1, ex - 3, hy + 5); }
  } else {
    g.fillStyle(0xf4efe0, 1); g.fillEllipse(hx + 4 * f, hy + 2, 8, 10); g.fillEllipse(hx + 11 * f, hy + 2, 7, 9);
    g.fillStyle(0x1a1410, 1); g.fillCircle(hx + 5 * f, hy + 3, 2.2); g.fillCircle(hx + 12 * f, hy + 3, 2);
    if (phase2 || m.state === 'chargeWind' || m.state === 'charge') { g.lineStyle(2, 0x1a1410, 1); g.lineBetween(hx + 1 * f, hy - 5, hx + 8 * f, hy - 2); g.lineBetween(hx + 14 * f, hy - 4, hx + 9 * f, hy - 2); }
  }
  // рот
  const open = ['word', 'bigWind', 'chargeWind', 'intro'].includes(m.state) || m['sayT'] > 0;
  g.fillStyle(0x1a1410, 1);
  if (open) g.fillEllipse(hx + 9 * f, hy + 11, 7, 5 + Math.abs(Math.sin(now * 14)) * 3); else g.fillRect(Math.min(hx + 6 * f, hx + 12 * f), hy + 11, 6, 1.6);
  // оглушение
  if (m.state === 'stun') { g.fillStyle(0xffe3a3, 0.9); for (let i = 0; i < 4; i++) g.fillCircle(hx + Math.cos(now * 6 + i * 1.6) * 22, hy - 24 + Math.sin(now * 6 + i * 1.6) * 5, 2.5); }
  // дым из рюкзака тем гуще, чем меньше здоровья
  const lvl = (m.maxHp - Math.max(0, m.hp)) / m.maxHp;
  if (lvl > 0 && Math.random() < lvl * 0.35) smoke(1, bx + 15, by);
  // реплика
  if (m['sayT'] > 0 && m['say']) say.show(m['say'], hx, hy - 26); else say.hide();
}

export function drawCurtains(w: World, g: G, s: G, now: number): void {
  g.clear(); s.clear();
  for (const c of w.curtains || []) {
    // ткань со складками
    const folds = 5, fw = c.w / folds;
    for (let i = 0; i < folds; i++) {
      const sway = Math.sin(now * 1.2 + c.x * 0.01 + i) * 1.5;
      g.fillStyle(i % 2 ? 0x6e2433 : 0x7f2c3c, 1);
      g.fillPoints(pts([{ x: c.x + i * fw, y: c.y }, { x: c.x + (i + 1) * fw, y: c.y }, { x: c.x + (i + 1) * fw + sway, y: c.y + c.h }, { x: c.x + i * fw + sway, y: c.y + c.h }]), true);
    }
    g.fillStyle(0x4a1822, 1); g.fillRect(c.x, c.y + c.h - 6, c.w, 6);
    g.fillStyle(0xc9a227, 1); for (let i = 0; i < 4; i++) g.fillCircle(c.x + 6 + i * ((c.w - 12) / 3), c.y + 2, 3);
    // слизь
    const amt = c.slime > 0 ? 1 : c.wet;
    if (amt > 0) {
      const fade = c.slime > 0 && c.slime < 1.2 ? (Math.floor(now * 10) % 2 ? 0.45 : 0.9) : 0.9;
      const hh = c.h * amt;
      s.fillStyle(0x6fbf2a, 0.55 * fade); s.fillRect(c.x + 2, c.y + 4, c.w - 4, hh - 4);
      s.fillStyle(0x9be84a, 0.75 * fade);
      for (let i = 0; i < 7; i++) {
        const bx = c.x + 8 + ((i * 37) % (c.w - 16)), by = c.y + 20 + ((i * 53) % Math.max(20, hh - 40));
        if (by < c.y + hh) s.fillEllipse(bx, by + Math.sin(now * 2 + i) * 2, 14, 20);
      }
      if (c.slime > 0) for (let i = 0; i < 3; i++) { const dx = c.x + 10 + i * ((c.w - 20) / 2), len = 4 + Math.abs(Math.sin(now * 1.5 + i)) * 5; s.fillRect(dx - 2, c.y + c.h - 4, 4, len); s.fillCircle(dx, c.y + c.h - 4 + len, 3); }
      s.fillStyle(0xe8ffc0, 0.6 * fade); for (let i = 0; i < 4; i++) s.fillCircle(c.x + 10 + i * 12, c.y + 30 + i * 40, 2);
    }
  }
}

export function drawVladik(v: Boss, g: G, now: number, say: Say): void {
  g.clear();
  const f = v.face, fl = v.flash > 0, dead = v.state === 'dead';
  g.setAlpha(dead ? clamp(v.t / 1.2, 0, 1) : 1);
  const shake = ['clefWind', 'leapWind', 'echoWind'].includes(v.state) ? Math.sin(now * 70) * 1.5 : 0;
  const cx = v.x + v.w / 2 + shake, fy = v.y + v.h;
  const walk = Math.abs(v.vx) > 5, legA = walk ? Math.sin(now * 14) * 5 : 0;
  const squat = v.state === 'leapWind' ? 6 : 0;
  // ноги
  g.lineStyle(3, 0x1a1410, 1); g.lineBetween(cx - 6, fy - 20, cx - 6 + legA, fy); g.lineBetween(cx + 6, fy - 20, cx + 6 - legA, fy);
  g.fillStyle(0x1a1410, 1); g.fillEllipse(cx - 6 + legA + 3 * f, fy - 1, 11, 5); g.fillEllipse(cx + 6 - legA + 3 * f, fy - 1, 11, 5);
  // тело-скрипка
  const by = fy - 20 + squat;
  const wood = fl ? 0xffffff : 0x9a4f1f, woodHi = fl ? 0xffffff : 0xc0712f;
  g.fillStyle(wood, 1); g.fillEllipse(cx, by - 14, 38, 30); g.fillEllipse(cx, by - 40, 30, 26); g.fillRect(cx - 10, by - 36, 20, 16);
  g.fillStyle(woodHi, 0.6); g.fillEllipse(cx - 6, by - 18, 14, 18); g.fillEllipse(cx - 5, by - 44, 10, 12);
  g.fillStyle(0x24302e, 1); g.fillEllipse(cx - 17, by - 27, 7, 10); g.fillEllipse(cx + 17, by - 27, 7, 10); // талия
  g.lineStyle(1.6, 0x2a140a, 1);
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 9, by - 30); g.lineTo(cx + s * 7, by - 22); g.lineTo(cx + s * 9, by - 14); g.strokePath(); g.fillStyle(0x2a140a, 1); g.fillCircle(cx + s * 9, by - 31, 1.4); g.fillCircle(cx + s * 9, by - 13, 1.4); }
  g.fillStyle(0x1a1410, 1); g.fillRect(cx - 4, by - 8, 8, 8); // подгрифник
  g.fillStyle(0xe8d9b0, 1); g.fillRect(cx - 7, by - 22, 14, 3); // подставка
  g.lineStyle(0.8, 0xf4efe0, 0.9); for (let i = 0; i < 4; i++) g.lineBetween(cx - 3 + i * 2, by - 52, cx - 3 + i * 2, by - 6);
  g.fillStyle(0x1a1410, 1); g.fillRect(cx - 3, by - 58, 6, 12); // гриф
  // голова с завитком-чубом и очками
  const hx = cx + 3 * f, hy = by - 68;
  g.fillStyle(fl ? 0xffffff : 0xd9b98f, 1); g.fillCircle(hx, hy, 13);
  g.lineStyle(4, 0x3b2215, 1); g.beginPath(); g.arc(hx - 2 * f, hy - 16, 6, 0, Math.PI * 1.6, false); g.strokePath();
  g.fillStyle(0x3b2215, 1); g.fillEllipse(hx - 3 * f, hy - 10, 26, 8);
  g.lineStyle(1.8, 0x1a1410, 1); g.strokeCircle(hx + 4 * f, hy + 1, 4.5); g.strokeCircle(hx + 12 * f, hy + 1, 4); g.lineBetween(hx + 8 * f, hy + 1, hx + 8.5 * f, hy + 1);
  g.fillStyle(0x1a1410, 1); g.fillCircle(hx + 5 * f, hy + 1.5, 1.6); g.fillCircle(hx + 12.5 * f, hy + 1.5, 1.5);
  const open = v['sayT'] > 0 || ['clefWind', 'leapWind', 'intro'].includes(v.state);
  if (open) g.fillEllipse(hx + 8 * f, hy + 9, 6, 4 + Math.abs(Math.sin(now * 14)) * 3); else g.fillRect(Math.min(hx + 5 * f, hx + 11 * f), hy + 9, 6, 1.5);
  // руки и смычок
  const arm = v.state === 'clefWind' || v.state === 'smear';
  g.lineStyle(3, 0x1a1410, 1);
  const hx2 = cx + f * (arm ? 30 : 20), hy2 = by - (arm ? 50 : 30);
  g.lineBetween(cx + 12 * f, by - 44, hx2, hy2);
  g.lineStyle(2, 0xe8d9b0, 1); g.lineBetween(hx2, hy2, hx2 - f * 34, hy2 + (arm ? 28 : 18));
  g.lineStyle(1, 0xf4efe0, 0.8); g.lineBetween(hx2 - f * 2, hy2 + 3, hx2 - f * 32, hy2 + (arm ? 30 : 20));
  if (v.state === 'smear') { g.fillStyle(0x8fdc3a, 1); g.fillCircle(hx2, hy2, 5); }
  // реплика
  if (v['sayT'] > 0 && v['say']) say.show(v['say'], hx, hy - 30); else say.hide();
}

export function drawTima(v: Boss, g: G, now: number, say: Say, dustFx: (n: number, x: number, y: number) => void): void {
  g.clear();
  if (v.y < -50) { say.hide(); return; } // в «лаге»: Тима пропал
  const f = v.face, fl = v.flash > 0, dead = v.state === 'dead', hyper = v['hyper'] > 0;
  g.setAlpha(dead ? clamp(v.t / 1.2, 0, 1) : v.state === 'lagWind' ? 0.35 + Math.abs(Math.sin(now * 30)) * 0.6 : 1);
  const shake = ['beerWind', 'ringWind', 'boxWind', 'bankWind'].includes(v.state) ? Math.sin(now * 70) * 1.5 : v.state === 'lagWind' ? Math.sin(now * 90) * 4 : 0;
  const cx = v.x + v.w / 2 + shake, fy = v.y + v.h;
  if (hyper) { g.fillStyle(0xffe38a, 0.12 + Math.sin(now * 12) * 0.05); g.fillEllipse(cx, fy - 40, 100, 110); }
  const walk = Math.abs(v.vx) > 5, legA = walk ? Math.sin(now * (hyper ? 24 : 12)) * 5 : 0;
  // ноги в трениках
  g.lineStyle(7, 0x2a2f3a, 1); g.lineBetween(cx - 11, fy - 18, cx - 11 + legA, fy - 2); g.lineBetween(cx + 11, fy - 18, cx + 11 - legA, fy - 2);
  g.fillStyle(0xf4efe0, 1); g.fillEllipse(cx - 11 + legA + 3 * f, fy - 2, 15, 6); g.fillEllipse(cx + 11 - legA + 3 * f, fy - 2, 15, 6);
  // панцирь-спина и пузо в майке
  g.fillStyle(fl ? 0xffffff : 0x4b5a3c, 1); g.fillEllipse(cx - 6 * f, fy - 40, 58, 52);
  g.fillStyle(fl ? 0xffffff : 0xe9e4d4, 1); g.fillEllipse(cx + 6 * f, fy - 36, 46, 44);
  g.lineStyle(3, 0xcfc8b4, 1); g.lineBetween(cx - 4 + 6 * f, fy - 62, cx - 6 + 6 * f, fy - 50); g.lineBetween(cx + 14 + 6 * f, fy - 62, cx + 16 + 6 * f, fy - 50);
  g.fillStyle(0x3b2a1c, 0.35); g.fillCircle(cx + 10 * f, fy - 30, 2.5);
  // голова с щетиной и наушниками
  const hx = cx + 10 * f, hy = fy - 72;
  g.fillStyle(fl ? 0xffffff : 0x6f7f56, 1); g.fillEllipse(hx, hy, 34, 28);
  g.fillStyle(0x3b4a2c, 0.5); for (let i = 0; i < 8; i++) g.fillCircle(hx + f * (2 + (i % 4) * 4), hy + 6 + Math.floor(i / 4) * 3, 1);
  g.lineStyle(3, 0x1a1a22, 1); g.beginPath(); g.arc(hx - 2 * f, hy - 4, 17, Math.PI * 1.1, Math.PI * 1.9, false); g.strokePath();
  g.fillStyle(0x1a1a22, 1); g.fillRoundedRect(hx - 2 * f - 6 - 12 * f, hy - 6, 10, 14, 3);
  g.fillStyle(0x6bd36b, 0.9); g.fillCircle(hx - 2 * f - 1 - 12 * f, hy + 1, 1.6);
  // глаза
  if (v.state === 'sneeze' || dead) { g.lineStyle(2, 0x1a1410, 1); g.lineBetween(hx + 3 * f, hy - 2, hx + 9 * f, hy); g.lineBetween(hx + 10 * f, hy - 2, hx + 15 * f, hy); }
  else {
    g.fillStyle(0xf4efe0, 1); g.fillEllipse(hx + 6 * f, hy - 1, 8, 7); g.fillEllipse(hx + 13 * f, hy - 1, 7, 6);
    g.fillStyle(hyper ? 0xffb6f0 : 0x1a1410, 1); g.fillCircle(hx + 7 * f, hy, 2); g.fillCircle(hx + 14 * f, hy, 1.8);
    g.fillStyle(0xd9686a, 0.35); g.fillCircle(hx + 12 * f, hy + 6, 4); // румянец
  }
  const open = v['sayT'] > 0;
  g.fillStyle(0x1a1410, 1); if (open) g.fillEllipse(hx + 10 * f, hy + 9, 7, 4 + Math.abs(Math.sin(now * 14)) * 3); else g.fillRect(Math.min(hx + 7 * f, hx + 13 * f), hy + 9, 6, 1.6);
  // светящийся круг на полу: сначала чертит, потом встаёт в него
  if (v.state === 'dustDraw' || v.state === 'dust') {
    const rx = v.state === 'dust' ? cx : cx + f * 52, prog = v.state === 'dust' ? 1 : clamp(1 - v.t / 2.2, 0, 1);
    const pulse = 0.6 + Math.sin(now * 10) * 0.25;
    g.lineStyle(3, 0xffe38a, v.state === 'dust' ? pulse : 0.85);
    g.beginPath(); g.arc(rx, fy - 3, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog, false); g.strokePath();
    g.lineStyle(1.5, 0xffb6f0, 0.7); g.strokeEllipse(rx, fy - 3, 52 * prog, 10 * prog);
    if (v.state === 'dust') { g.fillStyle(0xffe38a, 0.12 + Math.sin(now * 8) * 0.05); g.fillRect(rx - 26, fy - 90, 52, 88); }
    if (Math.random() < 0.3) dustFx(1, cx + f * (26 + Math.random() * 44), v.y + v.h - 4);
  }
  // рука с бутылкой / приставкой / мешочком
  g.lineStyle(5, fl ? 0xffffff : 0x6f7f56, 1);
  const up = ['beerWind', 'ringWind', 'boxWind', 'bankWind', 'drink'].includes(v.state);
  const draw = v.state === 'dustDraw';
  const ax = cx + f * (draw ? 50 + Math.sin(now * 9) * 10 : up ? 26 : 30), ay = draw ? fy - 8 : fy - (up ? 78 : 42);
  g.lineBetween(cx + 18 * f, fy - 54, ax, ay);
  if (v.state === 'ringWind') {
    g.fillStyle(0x1e1e22, 1); g.fillRoundedRect(ax - 22, ay - 30, 44, 28, 5);
    g.lineStyle(3, 0xff3a2a, 0.5 + Math.abs(Math.sin(now * 16)) * 0.5); g.strokeCircle(ax, ay - 16, 8);
  } else if (v.state === 'boxWind') {
    g.fillStyle(0x1e1e22, 1); g.fillRoundedRect(ax - 18, ay - 24, 36, 22, 5); g.fillStyle(0x6bd36b, 1); g.fillCircle(ax + 10, ay - 13, 2);
  } else if (v.state === 'dust' || draw) {
    g.fillStyle(0xb98a52, 1); g.fillCircle(ax, ay, 7); g.fillStyle(0xffe38a, 0.9); g.fillCircle(ax, ay - 6, 3);
  } else if (v.state === 'bankWind') {
    g.fillStyle(0x6b3d14, 1); g.fillRoundedRect(ax - 14, ay - 10, 28, 18, 3); g.fillStyle(0x1a1410, 1); g.fillRect(ax - 10, ay - 4, 20, 3);
  } else {
    const bx = ax, by = up ? ay - 18 : ay - 14;
    g.fillStyle(0x6b3d14, 1); g.fillRoundedRect(bx - 5, by, 10, 22, 3); g.fillRect(bx - 2, by - 7, 4, 8);
    g.fillStyle(0xf4efe0, 1); g.fillRect(bx - 5, by + 8, 10, 7);
  }
  // реплика
  if (v['sayT'] > 0 && v['say']) say.show(v['say'], hx, hy - 24); else say.hide();
}
