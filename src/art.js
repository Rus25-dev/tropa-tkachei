// ===== ПРОЦЕДУРНАЯ ГРАФИКА: тайлы, фон, виньетка =====
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const COL = {
  rock: '#1d2f29', rock2: '#263d35', rockHi: '#3a5c50', rockDeep: '#131f1b',
  moss: '#3b7448', mossHi: '#67ad62', root: '#2a4636', flower: '#ffd47a', glow: '#9ff0c8',
  plank: '#4a3726', plankHi: '#6b5236', thorn: '#d6ccb0', thornDark: '#5a2e2a',
};

function drawLevelChunks(scene, L) {
  const CW = 1920, worldW = L.W * T, worldH = L.H * T;
  const n = Math.ceil(worldW / CW);
  const solid = (x, y) => (x < 0 || y < 0 || x >= L.W || y >= L.H) ? true : L.grid[y][x] === SOLID;
  const keys = [];
  for (let c = 0; c < n; c++) {
    const key = 'lvl' + c;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const cv = document.createElement('canvas');
    cv.width = CW; cv.height = worldH;
    const ctx = cv.getContext('2d');
    const ox = c * CW;
    const tx0 = Math.max(0, Math.floor(ox / T) - 1), tx1 = Math.min(L.W - 1, Math.ceil((ox + CW) / T) + 1);
    const R = rng(1337 + c);
    // 1) сплошная порода
    for (let y = 0; y < L.H; y++) for (let x = tx0; x <= tx1; x++) {
      if (L.grid[y][x] !== SOLID) continue;
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
      if (L.grid[y][x] !== SOLID) continue;
      const nearEdge = !solid(x + 1, y) || !solid(x - 1, y) || !solid(x, y + 1) || !solid(x, y - 1) ||
        !solid(x + 2, y) || !solid(x - 2, y) || !solid(x, y + 2) || !solid(x, y - 2);
      if (!nearEdge) continue;
      const px = x * T - ox, py = y * T;
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = R() < 0.5 ? COL.rockHi : COL.rockDeep;
        ctx.globalAlpha = 0.35 + R() * 0.3;
        ctx.beginPath();
        ctx.ellipse(px + R() * T, py + R() * T, 2 + R() * 6, 1.5 + R() * 4, R() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // 3) скругляем внешние углы
    ctx.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < L.H; y++) for (let x = tx0; x <= tx1; x++) {
      if (L.grid[y][x] !== SOLID) continue;
      const px = x * T - ox, py = y * T, r = 10;
      const cut = (cx, cy, sx, sy) => {
        const a0 = sy > 0 ? -Math.PI / 2 : Math.PI / 2, a1 = sx > 0 ? Math.PI : 0;
        let d = a1 - a0; while (d > Math.PI) d -= Math.PI * 2; while (d <= -Math.PI) d += Math.PI * 2;
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
      const t = L.grid[y][x];
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
            ctx.fillStyle = COL.flower; ctx.beginPath(); ctx.arc(fx, py - 10, 2.2, 0, Math.PI * 2); ctx.fill();
          }
          // мох, свисающий по краю
          ctx.fillStyle = COL.moss;
          for (let i = 0; i < 3; i++) { const mx = px + a + R() * (b - a); ctx.beginPath(); ctx.ellipse(mx, py + 6, 3 + R() * 4, 2 + R() * 4, 0, 0, Math.PI * 2); ctx.fill(); }
        }
        if (!solid(x, y + 1)) {
          ctx.strokeStyle = COL.root; ctx.lineWidth = 1.6;
          for (let i = 0; i < 2; i++) {
            if (R() < 0.55) {
              const rx = px + 4 + R() * (T - 8), h = 6 + R() * 22;
              ctx.beginPath(); ctx.moveTo(rx, py + T - 2);
              ctx.bezierCurveTo(rx + (R() - 0.5) * 10, py + T + h * 0.4, rx + (R() - 0.5) * 10, py + T + h * 0.7, rx + (R() - 0.5) * 6, py + T + h); ctx.stroke();
              if (R() < 0.25) { ctx.fillStyle = COL.glow; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(rx, py + T + h + 2, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
            }
          }
        }
      } else if (t === PLAT) {
        const lf = L.grid[y][x - 1] !== PLAT, rt = L.grid[y][x + 1] !== PLAT;
        ctx.fillStyle = COL.plank;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px + (lf ? 2 : 0), py, T - (lf ? 2 : 0) - (rt ? 2 : 0), 10, lf || rt ? 5 : 0) : ctx.rect(px, py, T, 10); ctx.fill();
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
    scene.textures.addCanvas(key, cv);
    keys.push({ key, x: ox });
  }
  return keys;
}

function genBackgrounds(scene) {
  if (scene.textures.exists('bgFar')) return;
  // дальний слой: колонны и сталактиты
  const mk = (key, w, h, fn) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; fn(cv.getContext('2d'), w, h); scene.textures.addCanvas(key, cv); };
  mk('bgFar', 1024, 540, (c, w, h) => {
    const R = rng(7);
    const grd = c.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#08110f'); grd.addColorStop(0.55, '#0c1d1a'); grd.addColorStop(1, '#0a1513');
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
    c.fillStyle = '#10221e';
    for (let i = 0; i < 9; i++) {
      const x = R() * w, wd = 30 + R() * 70;
      for (const off of [0, -w, w]) {
        c.beginPath(); c.moveTo(x + off - wd, h); c.quadraticCurveTo(x + off - wd * 0.3, h * 0.4, x + off - wd * 0.2, 0);
        c.lineTo(x + off + wd * 0.2, 0); c.quadraticCurveTo(x + off + wd * 0.3, h * 0.5, x + off + wd, h); c.fill();
      }
    }
    c.fillStyle = '#0d1b18';
    for (let i = 0; i < 22; i++) {
      const x = R() * w, wd = 8 + R() * 22, len = 40 + R() * 140;
      for (const off of [0, -w, w]) { c.beginPath(); c.moveTo(x + off - wd, 0); c.lineTo(x + off, len); c.lineTo(x + off + wd, 0); c.fill(); }
    }
  });
  mk('bgMid', 1024, 540, (c, w, h) => {
    const R = rng(21);
    c.strokeStyle = '#173a31'; c.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = R() * w, len = 60 + R() * 260; c.lineWidth = 1.5 + R() * 3;
      for (const off of [0, -w, w]) {
        c.beginPath(); c.moveTo(x + off, 0);
        c.bezierCurveTo(x + off + (R() - 0.5) * 40, len * 0.4, x + off + (R() - 0.5) * 40, len * 0.8, x + off + (R() - 0.5) * 20, len); c.stroke();
      }
      if (R() < 0.4) { c.fillStyle = '#7fe0b8'; c.globalAlpha = 0.5; c.beginPath(); c.arc(x, len, 2.5, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    }
    c.fillStyle = '#122a24';
    for (let i = 0; i < 7; i++) {
      const x = R() * w, wd = 80 + R() * 120, hh = 30 + R() * 80;
      for (const off of [0, -w, w]) { c.beginPath(); c.ellipse(x + off, h + 10, wd, hh, 0, Math.PI, 0); c.fill(); }
    }
  });
  mk('bgGlow', 1024, 540, (c, w, h) => {
    const R = rng(99);
    for (let i = 0; i < 26; i++) {
      const x = R() * w, y = R() * h, r = 30 + R() * 80;
      const col = R() < 0.7 ? '120,230,190' : '255,200,120';
      for (const off of [0, -w, w]) {
        const g = c.createRadialGradient(x + off, y, 0, x + off, y, r);
        g.addColorStop(0, `rgba(${col},0.16)`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(x + off - r, y - r, r * 2, r * 2);
      }
    }
  });
  mk('vignette', 960, 540, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
    g.addColorStop(0, 'rgba(3,8,7,0)'); g.addColorStop(1, 'rgba(3,8,7,0.55)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  mk('spark', 8, 8, (c) => { const g = c.createRadialGradient(4, 4, 0, 4, 4, 4); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 8, 8); });
  mk('dot', 4, 4, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); });
}
