// Процедурная графика (legacy/src/art.js, vladik.js drawClassroom, tima.js drawDen): тайлы уровня, фоны, виньетка.
// Статичное рисуется один раз в текстуры при входе в комнату; динамика — каждый кадр (см. render/).
import type Phaser from 'phaser';
import { PLAT, SOLID, SPIKE, T } from '../core/balance';
import { mulberry32 } from '../core/rng';
import type { Level } from '../core/types';

type Ctx = CanvasRenderingContext2D;
const rng = mulberry32;
const TAU = Math.PI * 2;

export const COL = {
  rock: '#1d2f29', rock2: '#263d35', rockHi: '#3a5c50', rockDeep: '#131f1b',
  moss: '#3b7448', mossHi: '#67ad62', root: '#2a4636', flower: '#ffd47a', glow: '#9ff0c8',
  plank: '#4a3726', plankHi: '#6b5236', thorn: '#d6ccb0', thornDark: '#5a2e2a',
};

export interface Chunk { key: string; x: number }

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  return [cv, cv.getContext('2d')!];
}
function setTexture(scene: Phaser.Scene, key: string, cv: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
}

/** Тайлы уровня главы / коридора: порода с краями, мох, корни, платформы, шипы — кусками по 1920 px. */
export function drawLevelChunks(scene: Phaser.Scene, L: Level, prefix = 'lvl'): Chunk[] {
  const CW = 1920, worldW = L.W * T, worldH = L.H * T;
  const n = Math.ceil(worldW / CW);
  const solid = (x: number, y: number): boolean => (x < 0 || y < 0 || x >= L.W || y >= L.H) ? true : L.grid[y]![x] === SOLID;
  const keys: Chunk[] = [];
  for (let c = 0; c < n; c++) {
    const key = prefix + c;
    const [cv, ctx] = canvas(CW, worldH);
    const ox = c * CW;
    const tx0 = Math.max(0, Math.floor(ox / T) - 1), tx1 = Math.min(L.W - 1, Math.ceil((ox + CW) / T) + 1);
    const R = rng(1337 + c);
    // 1) сплошная порода
    for (let y = 0; y < L.H; y++) for (let x = tx0; x <= tx1; x++) {
      if (L.grid[y]![x] !== SOLID) continue;
      const px = x * T - ox, py = y * T;
      // чем глубже от края — тем темнее
      let edge = 9;
      for (let d = 1; d <= 3; d++) {
        if (!solid(x + d, y) || !solid(x - d, y) || !solid(x, y + d) || !solid(x, y - d)) { edge = d; break; }
      }
      ctx.fillStyle = edge === 1 ? COL.rock2 : edge === 2 ? COL.rock : COL.rockDeep;
      ctx.fillRect(px, py, T, T);
    }
    // 2) камешки и трещины в породе возле краёв
    for (let y = 0; y < L.H; y++) for (let x = tx0; x <= tx1; x++) {
      if (L.grid[y]![x] !== SOLID) continue;
      const nearEdge = !solid(x + 1, y) || !solid(x - 1, y) || !solid(x, y + 1) || !solid(x, y - 1) ||
        !solid(x + 2, y) || !solid(x - 2, y) || !solid(x, y + 2) || !solid(x, y - 2);
      if (!nearEdge) continue;
      const px = x * T - ox, py = y * T;
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = R() < 0.5 ? COL.rockHi : COL.rockDeep;
        ctx.globalAlpha = 0.35 + R() * 0.3;
        ctx.beginPath();
        ctx.ellipse(px + R() * T, py + R() * T, 2 + R() * 6, 1.5 + R() * 4, R() * 3, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // 2б) фактура всей породы и мягкая подсветка под верхними кромками
    for (let y = 0; y < L.H; y++) for (let x = tx0; x <= tx1; x++) {
      if (L.grid[y]![x] !== SOLID) continue;
      const px = x * T - ox, py = y * T;
      for (let i = 0; i < 3; i++) { ctx.fillStyle = R() < 0.5 ? 'rgba(150,210,190,0.05)' : 'rgba(0,0,0,0.16)'; ctx.fillRect(px + R() * T, py + R() * T, 2 + R() * 5, 1 + R() * 2); }
      if (!solid(x, y - 1)) { const lg = ctx.createLinearGradient(0, py, 0, py + 22); lg.addColorStop(0, 'rgba(120,200,170,0.20)'); lg.addColorStop(1, 'rgba(120,200,170,0)'); ctx.fillStyle = lg; ctx.fillRect(px, py, T, 22); }
      if (!solid(x, y + 1)) { const lg = ctx.createLinearGradient(0, py + T - 14, 0, py + T); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.28)'); ctx.fillStyle = lg; ctx.fillRect(px, py + T - 14, T, 14); }
    }
    // 3) скругляем внешние углы
    ctx.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < L.H; y++) for (let x = tx0; x <= tx1; x++) {
      if (L.grid[y]![x] !== SOLID) continue;
      const px = x * T - ox, py = y * T, r = 10;
      const cut = (cx: number, cy: number, sx: number, sy: number): void => {
        const a0 = sy > 0 ? -Math.PI / 2 : Math.PI / 2, a1 = sx > 0 ? Math.PI : 0;
        let d = a1 - a0; while (d > Math.PI) d -= TAU; while (d <= -Math.PI) d += TAU;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sx * r, cy);
        ctx.arc(cx + sx * r, cy + sy * r, r, a0, a1, d < 0);
        ctx.closePath(); ctx.fill();
      };
      const up = !solid(x, y - 1), dn = !solid(x, y + 1), lf = !solid(x - 1, y), rt = !solid(x + 1, y);
      if (up && lf) cut(px, py, 1, 1);
      if (up && rt) cut(px + T, py, -1, 1);
      if (dn && lf) cut(px, py + T, 1, -1);
      if (dn && rt) cut(px + T, py + T, -1, -1);
    }
    ctx.globalCompositeOperation = 'source-over';
    // 4) края: мох сверху, корни снизу, блик сбоку
    for (let y = 0; y < L.H; y++) for (let x = tx0; x <= tx1; x++) {
      const t = L.grid[y]![x];
      const px = x * T - ox, py = y * T;
      if (t === SOLID) {
        if (!solid(x - 1, y)) { ctx.fillStyle = COL.rockHi; ctx.globalAlpha = 0.5; ctx.fillRect(px, py + 4, 2, T - 8); ctx.globalAlpha = 1; }
        if (!solid(x + 1, y)) { ctx.fillStyle = COL.rockHi; ctx.globalAlpha = 0.35; ctx.fillRect(px + T - 2, py + 4, 2, T - 8); ctx.globalAlpha = 1; }
        if (!solid(x, y - 1)) {
          const lf = !solid(x - 1, y), rt = !solid(x + 1, y);
          const a = lf ? 6 : 0, b = rt ? T - 6 : T;
          ctx.fillStyle = COL.moss; ctx.fillRect(px + a, py, b - a, 6);
          ctx.fillStyle = COL.mossHi; ctx.fillRect(px + a, py, b - a, 2);
          ctx.strokeStyle = COL.mossHi; ctx.lineWidth = 1.4;
          for (let i = 0; i < 6; i++) {
            const bx = px + a + R() * (b - a), h = 3 + R() * 8;
            ctx.beginPath(); ctx.moveTo(bx, py + 1); ctx.quadraticCurveTo(bx + (R() - 0.5) * 4, py - h * 0.6, bx + (R() - 0.5) * 6, py - h); ctx.stroke();
          }
          if (R() < 0.12) {
            const fx = px + 6 + R() * (T - 12);
            ctx.strokeStyle = COL.moss; ctx.beginPath(); ctx.moveTo(fx, py); ctx.lineTo(fx, py - 9); ctx.stroke();
            ctx.fillStyle = COL.flower; ctx.beginPath(); ctx.arc(fx, py - 10, 2.2, 0, TAU); ctx.fill();
          }
          // мох, свисающий по краю
          ctx.fillStyle = COL.moss;
          for (let i = 0; i < 3; i++) { const mx = px + a + R() * (b - a); ctx.beginPath(); ctx.ellipse(mx, py + 6, 3 + R() * 4, 2 + R() * 4, 0, 0, TAU); ctx.fill(); }
        }
        if (!solid(x, y + 1)) {
          ctx.strokeStyle = COL.root; ctx.lineWidth = 1.6;
          for (let i = 0; i < 2; i++) {
            if (R() < 0.55) {
              const rx = px + 4 + R() * (T - 8), h = 6 + R() * 22;
              ctx.beginPath(); ctx.moveTo(rx, py + T - 2);
              ctx.bezierCurveTo(rx + (R() - 0.5) * 10, py + T + h * 0.4, rx + (R() - 0.5) * 10, py + T + h * 0.7, rx + (R() - 0.5) * 6, py + T + h); ctx.stroke();
              if (R() < 0.25) { ctx.fillStyle = COL.glow; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(rx, py + T + h + 2, 1.8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
            }
          }
        }
      } else if (t === PLAT) {
        const lf = L.grid[y]![x - 1] !== PLAT, rt = L.grid[y]![x + 1] !== PLAT;
        ctx.fillStyle = COL.plank;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(px + (lf ? 2 : 0), py, T - (lf ? 2 : 0) - (rt ? 2 : 0), 10, lf || rt ? 5 : 0); else ctx.rect(px, py, T, 10); ctx.fill();
        ctx.fillStyle = COL.plankHi; ctx.fillRect(px + (lf ? 4 : 0), py + 2, T - (lf ? 4 : 0) - (rt ? 4 : 0), 2);
        ctx.fillStyle = COL.moss; ctx.fillRect(px + (lf ? 3 : 0), py - 1, T - (lf ? 3 : 0) - (rt ? 3 : 0), 3);
        ctx.strokeStyle = COL.root; ctx.lineWidth = 1.2;
        if (R() < 0.7) { const rx = px + R() * T; ctx.beginPath(); ctx.moveTo(rx, py + 10); ctx.lineTo(rx + (R() - 0.5) * 4, py + 14 + R() * 12); ctx.stroke(); }
      } else if (t === SPIKE) {
        ctx.fillStyle = COL.thornDark; ctx.fillRect(px, py + T - 6, T, 6);
        for (let i = 0; i < 4; i++) {
          const sx = px + 2 + i * 8 + (R() - 0.5) * 2, h = 14 + R() * 10, lean = (R() - 0.5) * 6;
          ctx.fillStyle = COL.thorn;
          ctx.beginPath(); ctx.moveTo(sx, py + T - 3); ctx.lineTo(sx + 3 + lean, py + T - h); ctx.lineTo(sx + 7, py + T - 3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = COL.thornDark; ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.moveTo(sx + 4, py + T - 3); ctx.lineTo(sx + 3 + lean, py + T - h); ctx.lineTo(sx + 7, py + T - 3); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
    setTexture(scene, key, cv);
    keys.push({ key, x: ox });
  }
  return keys;
}

/** Фоны глав и частицы: дальний слой, лучи, средний план, туман, свечение, виньетка, искра, точка. */
export function genBackgrounds(scene: Phaser.Scene): void {
  if (scene.textures.exists('bgFar')) return;
  const mk = (key: string, w: number, h: number, fn: (c: Ctx, w: number, h: number) => void): void => { const [cv, c] = canvas(w, h); fn(c, w, h); setTexture(scene, key, cv); };
  // бесшовный «шум» по ширине: сумма синусов с целыми частотами
  const wave = (R: () => number, w: number, parts: number[][]): ((x: number) => number) => {
    const p = parts.map(([k, amp]) => [k!, amp!, R() * TAU] as const);
    return (x) => p.reduce((s, [k, amp, ph]) => s + amp * Math.sin((x / w) * TAU * k + ph), 0);
  };
  const silhouette = (c: Ctx, w: number, h: number, R: () => number, col: string, baseTop: number, baseBot: number, rough: number): void => {
    const top = wave(R, w, [[2, 30], [5, 16], [11, 8], [23, 4]]), bot = wave(R, w, [[3, 26], [7, 14], [13, 7], [29, 3]]);
    c.fillStyle = col;
    c.beginPath(); c.moveTo(0, 0);
    for (let x = 0; x <= w; x += 4) c.lineTo(x, baseTop + top(x) + (rough ? (R() - 0.5) * rough : 0));
    c.lineTo(w, 0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) c.lineTo(x, baseBot + bot(x) + (rough ? (R() - 0.5) * rough : 0));
    c.lineTo(w, h); c.closePath(); c.fill();
  };
  // дальний слой: глубина, дымка, несколько планов свода
  mk('bgFar', 1024, 540, (c, w, h) => {
    const R = rng(7);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#040908'); g.addColorStop(0.45, '#0e2420'); g.addColorStop(0.7, '#10261f'); g.addColorStop(1, '#060d0b');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // далёкие источники света за колоннами
    for (const [x, y, r, col] of [[220, 300, 260, '70,190,160'], [700, 260, 220, '255,190,110'], [930, 330, 200, '90,200,170']] as [number, number, number, string][]) {
      for (const off of [0, -w, w]) { const rg = c.createRadialGradient(x + off, y, 0, x + off, y, r); rg.addColorStop(0, `rgba(${col},0.16)`); rg.addColorStop(1, `rgba(${col},0)`); c.fillStyle = rg; c.fillRect(x + off - r, y - r, r * 2, r * 2); }
    }
    // три плана свода: чем ближе, тем темнее и чётче
    silhouette(c, w, h, R, 'rgba(24,52,46,0.55)', 70, 470, 0);
    for (let i = 0; i < 7; i++) {
      const x = R() * w, wd = 26 + R() * 50, col = 'rgba(20,44,39,0.7)';
      for (const off of [0, -w, w]) { c.fillStyle = col; c.beginPath(); c.moveTo(x + off - wd, h); c.bezierCurveTo(x + off - wd * 0.4, h * 0.55, x + off - wd * 0.2, h * 0.3, x + off - wd * 0.15, 0); c.lineTo(x + off + wd * 0.15, 0); c.bezierCurveTo(x + off + wd * 0.2, h * 0.3, x + off + wd * 0.4, h * 0.55, x + off + wd, h); c.fill(); }
    }
    silhouette(c, w, h, R, 'rgba(13,30,26,0.85)', 40, 505, 0);
    // туманная дымка по центру добавляет воздуха
    const hz = c.createLinearGradient(0, h * 0.35, 0, h * 0.8); hz.addColorStop(0, 'rgba(120,200,175,0)'); hz.addColorStop(0.5, 'rgba(120,200,175,0.07)'); hz.addColorStop(1, 'rgba(120,200,175,0)');
    c.fillStyle = hz; c.fillRect(0, 0, w, h);
    // мелкие звёздочки-светляки вдали
    for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(170,240,210,${0.15 + R() * 0.35})`; c.fillRect(R() * w, 60 + R() * 380, 1.2, 1.2); }
  });
  // лучи света сверху (накладываются сложением)
  mk('bgRays', 1024, 540, (c, w, h) => {
    const R = rng(55);
    for (let i = 0; i < 6; i++) {
      const x = R() * w, wd = 30 + R() * 70, skew = 90 + R() * 120, a = 0.05 + R() * 0.06;
      for (const off of [0, -w, w]) {
        const lg = c.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, `rgba(170,240,210,${a})`); lg.addColorStop(0.7, `rgba(170,240,210,${a * 0.35})`); lg.addColorStop(1, 'rgba(170,240,210,0)');
        c.fillStyle = lg; c.beginPath(); c.moveTo(x + off, 0); c.lineTo(x + off + wd, 0); c.lineTo(x + off + wd + skew, h); c.lineTo(x + off + skew - wd * 0.6, h); c.closePath(); c.fill();
      }
    }
  });
  // средний план: объёмные колонны со светом сбоку, корни со светящимися каплями
  mk('bgMid', 1024, 540, (c, w, h) => {
    const R = rng(21);
    for (let i = 0; i < 6; i++) {
      const x = R() * w, wd = 34 + R() * 46, lean = (R() - 0.5) * 40;
      for (const off of [0, -w, w]) {
        const X = x + off, lg = c.createLinearGradient(X - wd, 0, X + wd, 0);
        lg.addColorStop(0, '#2b5248'); lg.addColorStop(0.18, '#1a3832'); lg.addColorStop(0.6, '#10241f'); lg.addColorStop(1, '#0a1714');
        c.fillStyle = lg; c.beginPath();
        c.moveTo(X - wd * 1.4, h); c.bezierCurveTo(X - wd * 0.7, h * 0.7, X - wd * 0.8 + lean, h * 0.35, X - wd * 0.5 + lean, 0);
        c.lineTo(X + wd * 0.5 + lean, 0); c.bezierCurveTo(X + wd * 0.8 + lean, h * 0.35, X + wd * 0.7, h * 0.7, X + wd * 1.4, h); c.closePath(); c.fill();
        // светлая кромка со стороны света
        c.strokeStyle = 'rgba(140,220,190,0.22)'; c.lineWidth = 2; c.beginPath();
        c.moveTo(X - wd * 1.35, h); c.bezierCurveTo(X - wd * 0.68, h * 0.7, X - wd * 0.78 + lean, h * 0.35, X - wd * 0.48 + lean, 0); c.stroke();
        // фактура камня
        for (let k = 0; k < 40; k++) { c.fillStyle = R() < 0.5 ? 'rgba(160,220,200,0.05)' : 'rgba(0,0,0,0.18)'; const yy = R() * h; c.fillRect(X - wd * 0.6 + R() * wd * 1.2 + lean * (1 - yy / h), yy, 2 + R() * 6, 1 + R() * 3); }
        // мох на выступах
        c.fillStyle = 'rgba(80,150,95,0.35)'; for (let k = 0; k < 4; k++) { const yy = 120 + R() * 320; c.beginPath(); c.ellipse(X - wd * 0.6 + lean * (1 - yy / h), yy, 10 + R() * 12, 3 + R() * 3, 0, 0, TAU); c.fill(); }
      }
    }
    // корни сверху
    c.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const x = R() * w, len = 60 + R() * 240; c.lineWidth = 1.5 + R() * 2.5;
      const pts = [R() - 0.5, R() - 0.5, R() - 0.5] as [number, number, number];
      for (const off of [0, -w, w]) {
        c.strokeStyle = '#163a31'; c.beginPath(); c.moveTo(x + off, 0);
        c.bezierCurveTo(x + off + pts[0] * 40, len * 0.4, x + off + pts[1] * 40, len * 0.8, x + off + pts[2] * 20, len); c.stroke();
        if (i % 3 === 0) { const rg = c.createRadialGradient(x + off + pts[2] * 20, len, 0, x + off + pts[2] * 20, len, 14); rg.addColorStop(0, 'rgba(160,250,210,0.75)'); rg.addColorStop(0.25, 'rgba(160,250,210,0.25)'); rg.addColorStop(1, 'rgba(160,250,210,0)'); c.fillStyle = rg; c.fillRect(x + off + pts[2] * 20 - 14, len - 14, 28, 28); }
      }
    }
    // нижние валуны с тенью
    for (let i = 0; i < 6; i++) {
      const x = R() * w, wd = 90 + R() * 130, hh = 40 + R() * 70;
      for (const off of [0, -w, w]) { const rg = c.createLinearGradient(0, h - hh, 0, h); rg.addColorStop(0, '#1b3a32'); rg.addColorStop(1, '#0a1513'); c.fillStyle = rg; c.beginPath(); c.ellipse(x + off, h + 10, wd, hh, 0, Math.PI, 0); c.fill(); }
    }
  });
  // туман: мягкие полосы, плывут сами
  mk('bgFog', 1024, 540, (c, w) => {
    const R = rng(311);
    for (let i = 0; i < 16; i++) {
      const x = R() * w, y = 250 + R() * 280, rx = 120 + R() * 220, ry = 18 + R() * 40, a = 0.05 + R() * 0.07;
      for (const off of [0, -w, w]) { const rg = c.createRadialGradient(x + off, y, 0, x + off, y, rx); rg.addColorStop(0, `rgba(150,215,195,${a})`); rg.addColorStop(1, 'rgba(150,215,195,0)'); c.save(); c.translate(x + off, y); c.scale(1, ry / rx); c.translate(-(x + off), -y); c.fillStyle = rg; c.fillRect(x + off - rx, y - rx, rx * 2, rx * 2); c.restore(); }
    }
  });
  mk('bgGlow', 1024, 540, (c, w, h) => {
    const R = rng(99);
    for (let i = 0; i < 26; i++) {
      const x = R() * w, y = R() * h, r = 24 + R() * 70, warm = R() < 0.3, col = warm ? '255,200,120' : '120,230,190';
      for (const off of [0, -w, w]) {
        const g = c.createRadialGradient(x + off, y, 0, x + off, y, r);
        g.addColorStop(0, `rgba(${col},0.15)`); g.addColorStop(0.6, `rgba(${col},0.05)`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(x + off - r, y - r, r * 2, r * 2);
        if (i % 4 === 0) { c.strokeStyle = `rgba(${col},0.08)`; c.lineWidth = 1.5; c.beginPath(); c.arc(x + off, y, r * 0.45, 0, TAU); c.stroke(); }
      }
    }
  });
  // виньетка растягивается по размеру поля, поэтому рисуем её на максимальной ширине
  mk('vignette', 1280, 540, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
    g.addColorStop(0, 'rgba(3,8,7,0)'); g.addColorStop(1, 'rgba(3,8,7,0.55)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  mk('spark', 8, 8, (c) => { const g = c.createRadialGradient(4, 4, 0, 4, 4, 4); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 8, 8); });
  mk('dot', 4, 4, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); });
}
