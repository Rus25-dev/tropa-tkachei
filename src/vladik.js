// ===== БОСС «ВЛАДИК СКРИПКА»: школьный класс, скрипичные ключи, слизь на шторах =====
const VLADIK_SAY_HIT = ['Я НЕ СКРИПКА!', 'Я ВЛАДИК!', 'НЕ НАЗЫВАЙТЕ МЕНЯ ТАК!', 'Я НЕ СКРИПКА!!!'];

function buildVladikArena() {
  const W = 44, H = 22, g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(SOLID));
  for (let y = 4; y <= 17; y++) for (let x = 1; x <= 42; x++) g[y][x] = EMPTY;
  const plat = (x0, x1, y) => { for (let x = x0; x <= x1; x++) g[y][x] = PLAT; };
  plat(12, 15, 15); plat(28, 31, 15); // парты
  return {
    W, H, grid: g, theme: 'class', spawn: { x: 6, y: 17 }, benches: [], enemies: [], gates: [], exit: null,
    signs: [{ x: 13, y: 17, text: 'Шторы в слизи жгутся — не прыгай в них.\nПод шторой можно пройти низом' },
      { x: 29, y: 17, text: '↓ + прыжок — спрыгнуть с парты', touch: 'Стик вниз + «Прыжок» — спрыгнуть с парты' }],
    windows: [[4, 8], [19, 24], [35, 39]],
    curtains: [[2, 3], [9, 10], [17, 18], [25, 26], [33, 34], [40, 41]],
    vladik: { x: 30, y: 17 }, floorY: 18,
    areas: [{ x: 0, name: 'Кабинет музыки' }], region: 'Босс-тест',
  };
}

// пол, стены, окна, доска и парты — одной картинкой
function drawClassroom(scene, L) {
  const key = 'classroom', w = L.W * T, h = L.H * T;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'), R = rng(77);
  const floorY = L.floorY * T, top = 4 * T;
  // стена
  const wall = c.createLinearGradient(0, top, 0, floorY);
  wall.addColorStop(0, '#24302e'); wall.addColorStop(1, '#2d3b37');
  c.fillStyle = wall; c.fillRect(0, 0, w, h);
  // окна с вечерним небом
  for (const [a, b] of L.windows) {
    const x = a * T, ww = (b - a + 1) * T, y = 5 * T + 8, wh = 7 * T;
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
    if (L.grid[y][x] !== SOLID) continue;
    c.fillStyle = y >= L.floorY ? '#2a1f18' : '#1a2220'; c.fillRect(x * T, y * T, T, T);
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
    if (L.grid[y][x] !== PLAT || L.grid[y][x - 1] === PLAT) continue;
    let x1 = x; while (L.grid[y][x1 + 1] === PLAT) x1++;
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
  for (const [a, b] of L.windows) {
    const x0 = a * T, x1 = (b + 1) * T, y0 = 5 * T + 8, y1 = 12 * T + 8;
    const lg = c.createLinearGradient(0, y0, 0, floorY); lg.addColorStop(0, 'rgba(150,170,255,0.10)'); lg.addColorStop(1, 'rgba(150,170,255,0.02)');
    c.fillStyle = lg; c.beginPath(); c.moveTo(x0, y1); c.lineTo(x1, y1); c.lineTo(x1 + 110, floorY); c.lineTo(x0 + 110, floorY); c.closePath(); c.fill();
    c.fillStyle = 'rgba(160,180,255,0.07)'; c.fillRect(x0 + 110, floorY, x1 - x0, 12);
  }
  // потолочные лампы с тёплыми конусами света
  for (const lx of [8 * T, 22 * T, 35 * T]) {
    c.strokeStyle = '#1a1410'; c.lineWidth = 2; c.beginPath(); c.moveTo(lx, top); c.lineTo(lx, top + 26); c.stroke();
    c.fillStyle = '#2b2622'; c.beginPath(); c.moveTo(lx - 22, top + 40); c.lineTo(lx + 22, top + 40); c.lineTo(lx + 10, top + 24); c.lineTo(lx - 10, top + 24); c.closePath(); c.fill();
    c.fillStyle = '#ffe7b0'; c.beginPath(); c.ellipse(lx, top + 41, 14, 4, 0, 0, Math.PI * 2); c.fill();
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
    if (L.grid[y][x] !== PLAT || L.grid[y][x - 1] === PLAT) continue;
    let x1 = x; while (L.grid[y][x1 + 1] === PLAT) x1++;
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
  scene.textures.addCanvas(key, cv);
  return [{ key, x: 0 }];
}

// скрипичный ключ: ломаная из точек, поворачиваем вручную
const CLEF_PTS = (() => {
  const p = [[-1, 20], [1, -24], [4, -29], [6, -23], [3, -16], [-4, -9], [-8, -1]];
  for (let k = 0; k <= 22; k++) { const a = Math.PI + (k / 22) * Math.PI * 1.75, r = 9 - k * 0.22; p.push([Math.cos(a) * r, 4 - Math.sin(a) * r]); }
  return p;
})();
function drawClef(g, x, y, s, rot, col) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const pts = CLEF_PTS.map(([px, py]) => ({ x: x + (px * cs - py * sn) * s, y: y + (px * sn + py * cs) * s }));
  g.lineStyle(6 * s, 0x1a1410, 1); g.strokePoints(pts, false);
  g.lineStyle(3.2 * s, col, 1); g.strokePoints(pts, false);
  const dx = (-4 * cs - 21 * sn) * s, dy = (-4 * sn + 21 * cs) * s;
  g.fillStyle(0x1a1410, 1); g.fillCircle(x + dx, y + dy, 4.2 * s); g.fillStyle(col, 1); g.fillCircle(x + dx, y + dy, 3 * s);
}

Object.assign(GameScene.prototype, {
  setupVladikArena() {
    const L = this.L;
    this.add.text(14 * T, 5 * T + 22, 'Тема: скрипичный ключ', { fontFamily: '"Fira Sans", sans-serif', fontSize: '13px', fontStyle: 'italic', color: '#e8eadf' })
      .setOrigin(0.5, 0).setAlpha(0.75).setDepth(0.25);
    this.curtains = L.curtains.map(([a, b]) => ({ x: a * T, w: (b - a + 1) * T, y: 4 * T + 8, h: L.floorY * T - 44 - (4 * T + 8), slime: 0, wet: 0, drip: 0 }));
    this.curtainG = this.add.graphics().setDepth(3);
    this.slimeG = this.add.graphics().setDepth(3.1);
    this.vSay = this.add.text(0, 0, '', { fontFamily: '"Fira Sans", sans-serif', fontSize: '15px', fontStyle: '600', color: '#1a1410',
      backgroundColor: '#f4efe0', padding: { x: 8, y: 4 } }).setOrigin(0.5, 1).setDepth(8.5).setVisible(false);
    this.needleHits = 0;
    this.makeVladik();
  },
  makeVladik() {
    if (this.vladik && this.vladik.g) this.vladik.g.destroy();
    const d = this.L.vladik, hp = BAL.hp.vladik[this.nPlayers === 2 ? 1 : 0];
    this.vladik = { x: d.x * T - 22, y: (d.y + 1) * T - 84, w: 44, h: 84, vx: 0, vy: 0, face: -1, hp, maxHp: hp, phase: 1, state: 'intro', t: 3.2,
      flash: 0, last: '', say: 'Я НЕ СКРИПКА!', sayT: 2.2, sayCd: 0, barShown: false, air: 0, target: null, g: this.add.graphics().setDepth(4) };
    if (this.curtains) for (const c of this.curtains) { c.slime = 0; c.wet = 0; }
  },
  vladikSpeak(text, dur) { const v = this.vladik; v.say = text; v.sayT = Math.max(dur || 1.6, 1.4 + text.length * 0.07); },
  curtainHazard(c) { return { x: c.x + 4, y: c.y, w: c.w - 8, h: c.h }; },

  stepVladik(dt) {
    const v = this.vladik; if (!v) return;
    v.flash -= dt; v.sayT -= dt; v.sayCd -= dt;
    if (!v.barShown && this.ui().ready) { v.barShown = true; this.ui().bossBar(true, 'Владик Скрипка', v.hp / v.maxHp); }
    // шторы: высыхание и капли
    for (const c of this.curtains) {
      if (c.slime > 0) {
        c.slime -= dt; c.drip -= dt;
        if (c.drip <= 0) { c.drip = 0.8 + Math.random() * 0.6; this.projs.push({ kind: 'drip', x: c.x + 8 + Math.random() * (c.w - 22), y: c.y + c.h - 8, w: 8, h: 10, vx: 0, vy: 40, life: 2 }); }
      }
    }
    if (v.state === 'dead') { v.t -= dt; v.vy = Math.min(v.vy + P.G * dt, P.MAXFALL); this.moveBody(v, dt); return; }
    const phase2 = (v.phase || 1) >= 2, phase3 = (v.phase || 1) >= 3;
    const [tp] = this.nearestPlayer(v.x + v.w / 2, v.y + v.h / 2);
    const tx = tp ? tp.x + 7 : v.x + v.w / 2, vcx = v.x + v.w / 2;
    v.t -= dt;
    switch (v.state) {
      case 'intro': v.vx = 0; if (v.t <= 0) { v.state = 'idle'; v.t = 0.7; } break;
      case 'rage': v.vx = 0; if (v.t <= 0) { v.state = 'idle'; v.t = 0.3; } break;
      // эхо (третья фаза): призрак Владика мчится от стены за спиной героя, а сам Владик делает выпад
      case 'echoWind':
        v.vx = 0; v.face = tx > vcx ? 1 : -1;
        if (v.t <= 0) {
          const side = tx > vcx ? 1 : -1, wallX = side > 0 ? (this.L.W - 1) * T - 40 : T;
          this.projs.push({ kind: 'echo', x: wallX, y: this.L.floorY * T - 84, w: 40, h: 84, vx: -side * 600, vy: 0, life: 4, delay: 0.6 });
          this.sfx('violin'); v.state = 'lungeWind'; v.t = 0.4; v.face = side;
        }
        break;
      case 'staffWind':
        v.vx = 0;
        if (v.t <= 0) { this.vladikStaff(phase3); v.state = 'recover'; v.t = 1.5; }
        break;
      case 'lungeWind': v.vx = 0; v.face = tx > vcx ? 1 : -1; if (v.t <= 0) { v.state = 'lunge'; v.t = 0.34; this.sfx('dash'); } break;
      case 'lunge':
        v.vx = v.face * 760; if (Math.random() < 0.6) this.burst(1, v.x + v.w / 2 - v.face * 20, v.y + 40, 0xf4efe0);
        if (v.t <= 0 || v.hitL || v.hitR) { v.state = 'recover'; v.t = 0.75; v.vx = 0; }
        break;
      case 'idle':
        v.t -= dt * BAL.pace.vladik;
        v.face = tx > vcx ? 1 : -1;
        v.vx = Math.abs(tx - vcx) > 160 ? v.face * 90 : 0;
        // крещендо: в третьей фазе ноты падают с потолка
        if (phase3 && Math.random() < dt * 1.4) this.projs.push({ kind: 'note', x: (2 + Math.random() * (this.L.W - 4)) * T, y: 4 * T + 10, w: 14, h: 18, vx: 0, vy: 60, life: 3 });
        if (v.t <= 0) {
          const slimed = this.curtains.filter((c) => c.slime > 0).length;
          let opts = ['clef', 'leap', 'smear', 'lunge'];
          if (phase2) opts.push('staff', 'staff');
          if (phase3) opts.push('echo', 'echo');
          opts = opts.filter((o) => o !== v.last);
          if (slimed >= 3) opts = opts.filter((o) => o !== 'smear');
          const pick = opts[Math.floor(Math.random() * opts.length)]; v.last = pick; v.vx = 0;
          if (pick === 'clef') { v.state = 'clefWind'; v.t = phase2 ? 0.35 : 0.5; }
          if (pick === 'leap') { v.state = 'leapWind'; v.t = 0.4; }
          if (pick === 'smear') this.vladikPickCurtain(phase2);
          if (pick === 'staff') { v.state = 'staffWind'; v.t = 0.55; this.vladikSpeak('НОТНЫЙ СТАН! ПО ЛИНЕЕЧКАМ!', 1.6); this.sfx('violin'); }
          if (pick === 'echo') { v.state = 'echoWind'; v.t = 0.7; this.vladikSpeak('ЭХО! ДУЭТОМ!', 1.5); this.sfx('violin'); }
          if (pick === 'lunge') { v.state = 'lungeWind'; v.t = phase3 ? 0.38 : 0.5; this.vladikSpeak('ВЫПАД!', 1.0); }
        }
        break;
      case 'clefWind':
        v.vx = 0; v.face = tx > vcx ? 1 : -1;
        if (v.t <= 0) {
          const n = phase3 ? 4 : phase2 ? 3 : 1; this.sfx('violin');
          for (let i = 0; i < n; i++) {
            const hy = v.y + 20 + i * 26 - (n > 1 ? 10 : 0);
            this.projs.push({ kind: 'clef', x: vcx + v.face * 24 - 14, y: hy, w: 28, h: 40, vx: v.face * (500 + i * 40), ax: -v.face * (680 + i * 40), vy: 0, life: 3.2, t0: i * 0.12, home: vcx, rot: 0 });
          }
          if (v.sayCd <= 0 && Math.random() < 0.5) { this.vladikSpeak('Я НЕ СКРИПКА!', 1.2); v.sayCd = 2.5; }
          v.state = 'recover'; v.t = phase2 ? 0.7 : 1.0;
        }
        break;
      case 'leapWind':
        v.vx = 0; v.face = tx > vcx ? 1 : -1;
        if (v.t <= 0) { v.state = 'leap'; v.vy = -720; v.vx = clamp((tx - vcx) / 1.0, -380, 380); v.air = 0; this.sfx('jump'); }
        break;
      case 'leap':
        v.air += dt;
        if (v.onGround && v.air > 0.15) {
          v.vx = 0; this.shake(200, 0.01); this.sfx('slam'); this.dustAt(12, vcx, v.y + v.h);
          const n = phase2 ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32;
            this.projs.push({ kind: 'note', x: vcx - 7, y: v.y + 10, w: 14, h: 18, vx: Math.cos(a) * 330, vy: Math.sin(a) * 520, life: 3 });
          }
          this.sfx('violin');
          v.state = 'recover'; v.t = phase2 ? 0.5 : 0.75;
        }
        break;
      case 'smearGo': {
        const c = v.target, cx = c.x + c.w / 2;
        v.face = cx > vcx ? 1 : -1; v.vx = v.face * 300;
        if (Math.abs(cx - vcx) < 26 || v.t <= 0) { v.vx = 0; v.state = 'smear'; v.t = 0.7; this.sfx('squish'); }
        break;
      }
      case 'smear': {
        v.vx = 0; const c = v.target; c.wet = 1 - v.t / 0.7;
        if (v.t <= 0) {
          c.slime = phase2 ? 10 : 8; c.wet = 0; c.drip = 0.4;
          if (v.target2) { v.target2.slime = c.slime; v.target2.drip = 0.6; this.smokeAtSlime(v.target2); }
          this.smokeAtSlime(c);
          if (v.sayCd <= 0) { this.vladikSpeak('ХЕ-ХЕ, ЛИПКО!', 1.2); v.sayCd = 2.5; }
          v.state = 'recover'; v.t = 0.5;
        }
        break;
      }
      case 'recover': v.vx = 0; v.t -= dt * BAL.pace.vladik; if (v.t <= 0) { v.state = 'idle'; v.t = phase3 ? 0.25 : phase2 ? 0.35 : 0.6; } break;
    }
    v.vy = Math.min(v.vy + P.G * dt, P.MAXFALL);
    this.moveBody(v, dt);
  },
  // нотный стан: пять линий во всю ширину, часть загорается — стой на безопасной
  vladikStaff(phase3) {
    const fl = this.L.floorY * T, ys = [fl - 16, fl - 104, fl - 168, fl - 236, fl - 300];
    const patterns = phase3 ? [[0, 2, 4], [1, 3], [0, 3, 4], [1, 2, 4]] : [[0, 2], [1, 3], [0, 4], [1, 4]];
    const act = patterns[Math.floor(Math.random() * patterns.length)];
    act.forEach((i) => this.projs.push({ kind: 'staff', x: T, y: ys[i] - 5, w: (this.L.W - 2) * T, h: 10, vx: 0, vy: 0, life: 0.55, delay: 1.0 }));
    // бледные линии-подсказки на безопасных местах тоже рисуем — чтобы было видно весь стан
    ys.forEach((y, i) => { if (!act.includes(i)) this.projs.push({ kind: 'staffghost', x: T, y: y - 5, w: (this.L.W - 2) * T, h: 0, vx: 0, vy: 0, life: 1.4 }); });
  },
  vladikPickCurtain(phase2) {
    const v = this.vladik, free = this.curtains.filter((c) => c.slime <= 0);
    if (!free.length) { v.state = 'idle'; v.t = 0.3; return; }
    const [tp] = this.nearestPlayer(v.x, v.y); const px = tp ? tp.x : v.x;
    free.sort((a, b) => Math.abs(a.x + a.w / 2 - px) - Math.abs(b.x + b.w / 2 - px));
    v.target = free[0]; v.target2 = phase2 && free[1] ? free[1] : null;
    v.state = 'smearGo'; v.t = 1.8;
    if (v.sayCd <= 0) { this.vladikSpeak('А ВОТ ТАК!', 1.0); v.sayCd = 2; }
  },
  smokeAtSlime(c) { this.burst(10, c.x + c.w / 2, c.y + c.h * 0.6, 0x8fdc3a); },
  damageVladik(p) {
    const v = this.vladik;
    if (v.state === 'rage') { Snd.play('clink'); return; }
    v.hp -= 1; v.flash = 0.09; this.gainSilk(p, true); if (!p.remote) this.hitstop = 0.04; this.sfx(this.bossHitSnd('vladik', p)); this.needleHits++;
    this.burst(9, clamp(p.x + 7 + p.face * 26, v.x, v.x + v.w), v.y + v.h / 2, 0xf4f1e6);
    this.ui().bossBar(true, 'Владик Скрипка', Math.max(0, v.hp) / v.maxHp);
    if (v.sayCd <= 0 && Math.random() < 0.35) { this.vladikSpeak(VLADIK_SAY_HIT[Math.floor(Math.random() * VLADIK_SAY_HIT.length)], 1.2); v.sayCd = 2.5; }
    if (this.checkPhase(v, 'Владик Скрипка')) { this.vladikSpeak(v.phase === 3 ? 'КРЕЩЕНДО!!! Я НЕ СКРИПКА!' : 'Я! НЕ! СКРИПКА!!!', 2); v.sayCd = 3; this.sfx('violin'); }
    if (v.hp <= 0) this.vladikDie();
  },
  vladikDie() {
    const v = this.vladik; v.state = 'dead'; v.t = 2.6; v.vx = 0; this.bossDead = true; this.bossDeathFx();
    for (const pr of this.projs) pr.dead = true;
    for (const c of this.curtains) c.slime = Math.min(c.slime, 1);
    this.vladikSpeak('ЛАДНО… Я СКРИПКА…', 2.4); this.sfx('violin'); this.shake(700, 0.008);
    for (let i = 0; i < 6; i++) this.time.delayedCall(i * 170, () => this.burst(18, v.x + Math.random() * v.w, v.y + Math.random() * v.h, i % 2 ? 0xffd47a : 0xf4efe0));
    this.time.delayedCall(3300, () => { this.ui().bossBar(false); this.win(); });
  },
  stepClef(pr, dt) {
    if (pr.t0 > 0) { pr.t0 -= dt; return; }
    pr.vx += pr.ax * dt; pr.x += pr.vx * dt; pr.rot += dt * 10;
    pr.y += Math.sin(pr.life * 6) * 30 * dt;
    // вернулся к Владику — исчез
    if (Math.sign(pr.vx) === Math.sign(pr.ax) && Math.abs(pr.x + 14 - pr.home) < 30) pr.dead = true;
    if (pr.x < T || pr.x + pr.w > (this.L.W - 1) * T) { pr.vx = -pr.vx * 0.6; pr.x = clamp(pr.x, T, (this.L.W - 1) * T - pr.w); }
  },
  stepNote(pr, dt) {
    pr.vy = Math.min(pr.vy + 900 * dt, 700); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (this.isSolid(Math.floor((pr.x + 7) / T), Math.floor((pr.y + 16) / T))) { pr.dead = true; this.burst(5, pr.x + 7, pr.y + 14, 0xffd47a); }
  },
  stepDrip(pr, dt) {
    pr.vy = Math.min(pr.vy + 900 * dt, 600); pr.y += pr.vy * dt;
    const t = this.tileAt(Math.floor((pr.x + 4) / T), Math.floor((pr.y + 10) / T));
    if (t === SOLID || t === PLAT) { pr.dead = true; this.burst(4, pr.x + 4, pr.y + 8, 0x8fdc3a); }
  },

  // ----- отрисовка -----
  drawCurtains(now) {
    const g = this.curtainG, s = this.slimeG; g.clear(); s.clear();
    for (const c of this.curtains) {
      // ткань со складками
      const folds = 5, fw = c.w / folds;
      for (let i = 0; i < folds; i++) {
        const sway = Math.sin(now * 1.2 + c.x * 0.01 + i) * 1.5;
        g.fillStyle(i % 2 ? 0x6e2433 : 0x7f2c3c, 1);
        g.fillPoints([{ x: c.x + i * fw, y: c.y }, { x: c.x + (i + 1) * fw, y: c.y }, { x: c.x + (i + 1) * fw + sway, y: c.y + c.h }, { x: c.x + i * fw + sway, y: c.y + c.h }], true);
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
  },
  drawVladik(now) {
    const v = this.vladik, g = v.g; g.clear();
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
    const open = v.sayT > 0 || ['clefWind', 'leapWind', 'intro'].includes(v.state);
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
    const say = this.vSay;
    if (v.sayT > 0 && v.say) say.setText(v.say).setPosition(hx, hy - 30).setVisible(true); else say.setVisible(false);
  },
  drawVladikProjs(now) {
    const fx = this.fx;
    for (const pr of this.projs) {
      if (pr.kind === 'clef') { if (pr.t0 > 0) continue; drawClef(fx, pr.x + 14, pr.y + 20, 1.05, pr.rot, 0xf4efe0); }
      else if (pr.kind === 'echo') {
        const warn = pr.delay > 0, a = warn ? 0.22 + Math.sin(now * 24) * 0.1 : 0.7, f = pr.vx > 0 ? 1 : -1, cx = pr.x + 20, fy = pr.y + 84;
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
  },
});
