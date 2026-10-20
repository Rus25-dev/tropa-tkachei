// ===== БОСС «ТИМА ПИВО»: берлога, пиво, банкротство, волшебная пыль и приставка =====
const TIMA_SAY_HIT = ['ЭЙ, НЕ РАЗЛЕЙ!', 'АЙ!', 'Я НА ПАУЗЕ!', 'ЛАГАЕТ!'];

function buildTimaArena() {
  const W = 44, H = 22, g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(SOLID));
  for (let y = 4; y <= 17; y++) for (let x = 1; x <= 42; x++) g[y][x] = EMPTY;
  const furniture = [
    { kind: 'couch', x0: 7, x1: 13, y: 15 },
    { kind: 'shelf', x0: 19, x1: 24, y: 10 },
    { kind: 'crates', x0: 31, x1: 34, y: 14 },
  ];
  for (const f of furniture) for (let x = f.x0; x <= f.x1; x++) g[f.y][x] = PLAT;
  return {
    W, H, grid: g, theme: 'den', spawn: { x: 4, y: 17 }, benches: [], enemies: [], gates: [], exit: null,
    signs: [{ x: 5, y: 17, text: 'Тима бьётся обычной иглой.\nКогда он чертит круг для пыли — беги и бей:\nтри удара, и он чихнёт' }],
    furniture, tima: { x: 30, y: 17 }, floorY: 18,
    areas: [{ x: 0, name: 'Берлога Тимы' }], region: 'Босс-тест',
  };
}

function drawDen(scene, L) {
  const key = 'den', w = L.W * T, h = L.H * T;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'), R = rng(91), floorY = L.floorY * T;
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
  const poster = (x, y, col, text) => { c.fillStyle = col; c.fillRect(x, y, 70, 92); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 6, y + 6, 58, 58);
    c.fillStyle = '#f4efe0'; c.font = '700 12px "Fira Sans", sans-serif'; c.textAlign = 'center'; c.fillText(text, x + 35, y + 82); };
  poster(15 * T, 5 * T + 4, '#7a3a2a', 'ЧЕМПИОН'); poster(37 * T, 6 * T, '#2a4a6a', 'ЛВЛ 99');
  // плинтус и ковёр
  c.fillStyle = '#4a3726'; c.fillRect(0, floorY - 8, w, 8);
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    if (L.grid[y][x] !== SOLID) continue;
    c.fillStyle = y >= L.floorY ? '#3a2a22' : '#181420'; c.fillRect(x * T, y * T, T, T);
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
  for (const f of L.furniture) {
    const cx = (f.x0 + f.x1 + 1) * T / 2, rw = (f.x1 - f.x0 + 1) * T * 0.65;
    const sh = c.createRadialGradient(cx, floorY, 0, cx, floorY, rw); sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh; c.fillRect(cx - rw, floorY - 16, rw * 2, 24);
  }
  const ceil = c.createLinearGradient(0, 4 * T, 0, 4 * T + 100); ceil.addColorStop(0, 'rgba(0,0,0,0.5)'); ceil.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = ceil; c.fillRect(0, 4 * T, w, 100);
  for (const side of [0, 1]) { const sg = c.createLinearGradient(side ? w - 180 : 0, 0, side ? w : 180, 0); sg.addColorStop(side ? 0 : 1, 'rgba(0,0,0,0)'); sg.addColorStop(side ? 1 : 0, 'rgba(0,0,0,0.5)'); c.fillStyle = sg; c.fillRect(side ? w - 180 : 0, 4 * T, 180, floorY - 4 * T); }
  scene.textures.addCanvas(key, cv);
  return [{ key, x: 0 }];
}

Object.assign(GameScene.prototype, {
  setupTimaArena() {
    // мебель рисуем отдельно: при банкротстве её изымают
    this.furnG = this.add.graphics().setDepth(0.6);
    this.stampTexts = this.L.furniture.map((f) => this.add.text((f.x0 + f.x1 + 1) * T / 2, f.y * T - 6, 'ИЗЪЯТО',
      { fontFamily: '"Fira Sans", sans-serif', fontSize: '22px', fontStyle: '700', color: '#ff5a4a', stroke: '#1a1410', strokeThickness: 4 })
      .setOrigin(0.5).setAngle(-8).setDepth(6.3).setVisible(false));
    this.repo = false; this.drawFurniture();
    this.puddles = [];
    this.tSay = this.add.text(0, 0, '', { fontFamily: '"Fira Sans", sans-serif', fontSize: '15px', fontStyle: '600', color: '#1a1410',
      backgroundColor: '#f4efe0', padding: { x: 8, y: 4 } }).setOrigin(0.5, 1).setDepth(8.5).setVisible(false);
    this.dustFx = this.add.particles(0, 0, 'spark', { emitting: false, lifespan: 700, speed: { min: 20, max: 90 }, scale: { start: 0.9, end: 0 },
      tint: [0xffe38a, 0xffffff, 0xffb6f0, 0x9ff0ff], blendMode: 'ADD' }).setDepth(7);
    this.foam = this.add.particles(0, 0, 'dot', { emitting: false, lifespan: 500, speed: { min: 40, max: 180 }, scale: { start: 1.6, end: 0 },
      tint: [0xfff6d8, 0xf2c14e], gravityY: 400 }).setDepth(7);
    this.timaHits = 0;
    this.makeTima();
  },
  drawFurniture() {
    const g = this.furnG; g.clear();
    for (const f of this.L.furniture) {
      const x = f.x0 * T, w = (f.x1 - f.x0 + 1) * T, y = f.y * T, fl = this.L.floorY * T;
      if (f.kind === 'couch') {
        g.fillStyle(0x3a4a6a, 1); g.fillRoundedRect(x - 6, y - 34, w + 12, 34, 10); // спинка
        g.fillStyle(0x4a5c80, 1); g.fillRoundedRect(x, y, w, 22, 6); g.fillRect(x + 6, y + 18, w - 12, fl - y - 18);
        g.fillStyle(0x3a4a6a, 1); g.fillRoundedRect(x - 14, y - 10, 20, fl - y + 10, 6); g.fillRoundedRect(x + w - 6, y - 10, 20, fl - y + 10, 6);
        g.lineStyle(2, 0x2c3850, 1); for (let i = 1; i < 3; i++) g.lineBetween(x + (w * i) / 3, y + 2, x + (w * i) / 3, y + 20);
      } else if (f.kind === 'shelf') {
        g.fillStyle(0x5a4634, 1); g.fillRect(x, y, w, 10); g.fillStyle(0x3b2f27, 1); g.fillRect(x + 10, y + 10, 6, 14); g.fillRect(x + w - 16, y + 10, 6, 14);
        for (let i = 0; i < 5; i++) { g.fillStyle(0x6b3d14, 1); g.fillRoundedRect(x + 18 + i * 30, y - 26, 10, 26, 3); g.fillStyle(0xf4efe0, 1); g.fillRect(x + 18 + i * 30, y - 16, 10, 7); }
      } else {
        for (let yy = y; yy < fl; yy += 34) for (let xx = x; xx < x + w; xx += 64) {
          g.fillStyle(0xc9a227, 1); g.fillRect(xx + 1, yy, 62, 33); g.lineStyle(2, 0x8a6a10, 1); g.strokeRect(xx + 1, yy, 62, 33);
          g.fillStyle(0x6b3d14, 1); for (let i = 0; i < 5; i++) g.fillCircle(xx + 10 + i * 11, yy + 6, 4);
        }
      }
    }
  },
  setRepo(on) {
    if (this.repo === on) return;
    this.repo = on;
    for (const f of this.L.furniture) for (let x = f.x0; x <= f.x1; x++) this.grid[f.y][x] = on ? EMPTY : PLAT;
    this.furnG.setAlpha(on ? 0.18 : 1);
    this.stampTexts.forEach((t) => t.setVisible(on));
  },
  makeTima() {
    if (this.tima && this.tima.g) this.tima.g.destroy();
    const d = this.L.tima, hp = BAL.hp.tima[this.nPlayers === 2 ? 1 : 0];
    this.tima = { x: d.x * T - 30, y: (d.y + 1) * T - 80, w: 60, h: 80, vx: 0, vy: 0, face: -1, hp, maxHp: hp, phase: 1, state: 'intro', t: 3.2,
      flash: 0, last: '', say: 'ПИВКА ДЛЯ РЫВКА!', sayT: 2.2, sayCd: 0, barShown: false, air: 0, hyper: 0, dustCd: 6, dustHits: 0, drinkCd: 8,
      g: this.add.graphics().setDepth(4) };
    if (this.puddles) this.puddles = [];
    if (this.furnG) this.setRepo(false);
  },
  timaSpeak(text, dur) { const v = this.tima; v.say = text; v.sayT = Math.max(dur || 1.6, 1.4 + text.length * 0.07); },
  speedMul(p) {
    if (!this.puddles || !p.onGround) return 1;
    for (const q of this.puddles) if (p.x + p.w > q.x && p.x < q.x + q.w && Math.abs(p.y + p.h - q.y) < 6) return 0.5;
    return 1;
  },

  stepTima(dt) {
    const v = this.tima; if (!v) return;
    v.flash -= dt; v.sayT -= dt; v.sayCd -= dt; v.dustCd -= dt; v.drinkCd -= dt;
    if (!v.barShown && this.ui().ready) { v.barShown = true; this.ui().bossBar(true, 'Тима Пиво', v.hp / v.maxHp); }
    for (const q of this.puddles) q.t -= dt;
    this.puddles = this.puddles.filter((q) => q.t > 0);
    if (this.repoT > 0) { this.repoT -= dt; if (this.repoT <= 0) { this.setRepo(false); this.sendEv({ k: 'repo', on: 0 }); } }
    if (v.state === 'dead') { v.t -= dt; v.vy = Math.min(v.vy + P.G * dt, P.MAXFALL); this.moveBody(v, dt); return; }
    if (v.hyper > 0) { v.hyper -= dt; if (Math.random() < 0.5) this.dustFx.explode(1, v.x + Math.random() * v.w, v.y + Math.random() * v.h); }
    const sp = v.hyper > 0 ? 1.55 : 1, phase2 = (v.phase || 1) >= 2, phase3 = (v.phase || 1) >= 3;
    const [tp] = this.nearestPlayer(v.x + v.w / 2, v.y + v.h / 2);
    const tx = tp ? tp.x + 7 : v.x + v.w / 2, vcx = v.x + v.w / 2;
    v.t -= dt * sp;
    switch (v.state) {
      case 'intro': v.vx = 0; if (v.t <= 0) { v.state = 'idle'; v.t = 0.8; } break;
      case 'rage': v.vx = 0; if (v.t <= 0) { v.state = 'idle'; v.t = 0.3; } break;
      case 'collWind':
        v.vx = 0;
        if (v.t <= 0) {
          const n = phase3 ? 3 : 2, fl = this.L.floorY * T;
          for (let i = 0; i < n; i++) { const left = i % 2 === 0; this.projs.push({ kind: 'collector', x: (left ? 2 + i : this.L.W - 3 - i) * T, y: fl - 22, w: 22, h: 22, vx: 0, vy: 0, life: 11, hp: 2, spd: phase3 ? 165 : 130, face: left ? 1 : -1 }); }
          this.sfx('coin'); v.state = 'recover'; v.t = 0.8;
        }
        break;
      // «лаги» (третья фаза): Тима пропадает, на полу вспыхивает метка, и он падает с потолка ровно на неё
      case 'lagWind':
        v.vx = 0;
        if (v.t <= 0) {
          const targets = this.alivePlayers().length ? this.alivePlayers() : this.players, p = targets[Math.floor(Math.random() * targets.length)];
          v.lagX = clamp(p.x + 7, 2 * T + 30, (this.L.W - 2) * T - 30);
          this.projs.push({ kind: 'mark', x: v.lagX, y: this.L.floorY * T, w: 0, h: 0, vx: 0, vy: 0, life: 1.3 });
          this.sfx('sparkle'); v.state = 'lagGone'; v.t = 1.1; v.y = -500; v.vy = 0;
        }
        break;
      case 'lagGone':
        v.vx = 0; v.vy = 0;
        if (v.t <= 0) { v.x = v.lagX - v.w / 2; v.y = 4 * T + 6; v.vy = 260; v.state = 'lagFall'; this.sfx('throw'); }
        break;
      case 'lagFall': v.vx = 0; break;
      case 'achWind':
        v.vx = 0;
        if (v.t <= 0) {
          const targets = this.alivePlayers().length ? this.alivePlayers() : this.players;
          for (let i = 0; i < 4; i++) { const p = targets[i % targets.length]; this.projs.push({ kind: 'trophy', x: clamp(p.x + 7 + (i - 1.5) * 90, 2 * T, (this.L.W - 3) * T) - 15, y: 4 * T + 8, w: 30, h: 30, vx: 0, vy: 0, life: 5, bounces: 1, delay: 0.7 + i * 0.25 }); }
          this.sfx('sparkle'); v.state = 'recover'; v.t = 1.0;
        }
        break;
      case 'idle':
        v.t -= dt * sp * BAL.pace.tima;
        v.face = tx > vcx ? 1 : -1;
        v.vx = Math.abs(tx - vcx) > 180 ? v.face * 80 * sp : 0;
        if (v.t <= 0) {
          v.vx = 0;
          if (v.dustCd <= 0 && v.hp < v.maxHp * 0.75 && v.hyper <= 0) { v.state = 'dustDraw'; v.t = 2.2; v.dustHits = 0; this.timaSpeak('ЩАС-ЩАС, НАЧЕРЧУ…', 1.6); this.toastAll('Тима чертит круг для пыли — беги к нему и бей!'); break; }
          if (v.drinkCd <= 0 && v.hp < v.maxHp * 0.85 && Math.random() < 0.5) { v.state = 'drink'; v.t = 1.2; v.drinkCd = 14; this.timaSpeak('БУЛЬ-БУЛЬ…', 1.2); this.sfx('glug'); break; }
          const pool = ['beer', 'pad', 'ring', 'ring', 'box', 'bankrupt'];
          if (phase2 && !this.projs.some((q) => q.kind === 'collector')) pool.push('coll');
          if (phase3) pool.push('ach', 'ach', 'lag', 'lag');
          const opts = pool.filter((o) => o !== v.last && !(o === 'bankrupt' && (this.repoT > 0 || !phase2 && Math.random() < 0.5)));
          const pick = opts[Math.floor(Math.random() * opts.length)]; v.last = pick;
          if (pick === 'beer') { v.state = 'beerWind'; v.t = 0.5; this.timaSpeak('ЛОВИ ПИВКО!', 1.0); }
          if (pick === 'pad') { v.state = 'pad'; v.t = 2.0; this.timaSpeak('ИКС-БОКС!', 1.2); this.projs.push({ kind: 'pad', x: vcx, y: v.y + 30, w: 26, h: 18, vx: 0, vy: 0, life: 2.2, ang: v.face > 0 ? 0 : Math.PI, rad: 20, spin: v.face }); this.sfx('buzz'); }
          if (pick === 'ring') { v.state = 'ringWind'; v.t = 0.9; this.timaSpeak('КРАСНОЕ КОЛЬЦО!', 1.3); this.sfx('buzz'); }
          if (pick === 'box') { v.state = 'boxWind'; v.t = 0.5; this.timaSpeak('ДЕРЖИ ПРИСТАВКУ!', 1.1); }
          if (pick === 'bankrupt') { v.state = 'bankWind'; v.t = 0.8; this.timaSpeak('БАНКРОТСТВО!', 1.6); this.sfx('roar'); }
          if (pick === 'coll') { v.state = 'collWind'; v.t = 0.8; this.timaSpeak('КОЛЛЕКТОРЫ, ФАС!', 1.5); }
          if (pick === 'lag') { v.state = 'lagWind'; v.t = 0.6; this.timaSpeak('ЛАГАЕТ!!', 1.3); this.sfx('buzz'); }
          if (pick === 'ach') { v.state = 'achWind'; v.t = 0.7; this.timaSpeak('АЧИВКА РАЗБЛОКИРОВАНА!', 1.6); }
        }
        break;
      case 'beerWind':
        v.vx = 0; v.face = tx > vcx ? 1 : -1;
        if (v.t <= 0) {
          const n = phase2 ? 4 : 3;
          for (let i = 0; i < n; i++) {
            const dist = tx - vcx + (i - (n - 1) / 2) * 70;
            this.projs.push({ kind: 'bottle', x: vcx - 5, y: v.y + 6, w: 10, h: 22, vx: clamp(dist / 0.95, -520, 520), vy: -520 - i * 20, life: 3, rot: 0 });
          }
          this.sfx('throw'); v.state = 'recover'; v.t = 0.6;
        }
        break;
      case 'pad': v.vx = 0; if (v.t <= 0) { if (phase3 && v.last !== 'ringCombo') { v.last = 'ringCombo'; v.state = 'ringWind'; v.t = 0.55; this.timaSpeak('КОМБО! КОЛЬЦО!', 1.0); this.sfx('buzz'); } else { v.state = 'recover'; v.t = 0.4; } } break;
      case 'ringWind':
        v.vx = 0;
        if (v.t <= 0) {
          const cy = v.y + v.h - 18;
          this.projs.push({ kind: 'ringfx', x: vcx, y: v.y + 24, w: 0, h: 0, vx: 0, vy: 0, life: 0.9, r: 10 });
          for (const d of [-1, 1]) this.projs.push({ kind: 'rwave', x: vcx - 12 + d * 26, y: cy, w: 24, h: 18, vx: d * (phase2 ? 520 : 450) * Math.min(sp, 1.25), vy: 0, life: 2.6 });
          this.shake(260, 0.012); this.sfx('slam');
          if (phase2 && !v.ring2) { v.ring2 = true; v.state = 'ringWind'; v.t = 0.5; } else { v.ring2 = false; v.state = 'recover'; v.t = 0.7; } // во второй фазе кольцо бьёт дважды подряд
        }
        break;
      case 'boxWind':
        v.vx = 0; v.face = tx > vcx ? 1 : -1;
        if (v.t <= 0) {
          this.projs.push({ kind: 'box', x: vcx - 18, y: v.y + 4, w: 36, h: 22, vx: clamp((tx - vcx) / 1.1, -460, 460), vy: -600, life: 4, bounces: 2 });
          this.sfx('throw'); v.state = 'recover'; v.t = 0.6;
        }
        break;
      case 'bankWind':
        v.vx = 0;
        if (v.t <= 0) {
          const targets = this.alivePlayers().length ? this.alivePlayers() : this.players;
          targets.forEach((p, i) => this.projs.push({ kind: 'stamp', x: clamp(p.x + 7, 2 * T, (this.L.W - 2) * T) - 40, y: 7 * T, w: 80, h: 44, vx: 0, vy: 0, life: 3, delay: 0.7 + i * 0.2 }));
          this.repoT = 6; this.setRepo(true); this.sendEv({ k: 'repo', on: 1 });
          this.bankruptSilk(); this.sendEv({ k: 'bankrupt' });
          this.toastAll('Банкротство! Мебель изъята, нить ушла кредиторам');
          this.sfx('coin'); v.state = 'recover'; v.t = 0.9;
        }
        break;
      case 'drink':
        v.vx = 0;
        if (v.t <= 0) { v.hp = Math.min(v.maxHp, v.hp + 2); this.ui().bossBar(true, 'Тима Пиво', v.hp / v.maxHp); this.timaSpeak('БУЭЭЭ!', 1.0); this.sfx('burp'); v.state = 'recover'; v.t = 0.5; }
        break;
      case 'dustDraw':
        v.vx = 0;
        if (Math.random() < 0.3) this.dustFx.explode(1, vcx + v.face * (26 + Math.random() * 44), v.y + v.h - 4);
        if (v.t <= 0) { v.state = 'dust'; v.t = 1.3; this.timaSpeak('ВОЛШЕБНАЯ ПЫЛЬ!', 1.3); this.sfx('sparkle'); }
        break;
      case 'dust':
        v.vx = 0;
        if (Math.random() < 0.6) this.dustFx.explode(1, vcx + v.face * 30 + (Math.random() - 0.5) * 30, v.y + 10 + Math.random() * 20);
        if (v.t <= 0) { v.hyper = phase3 ? 9 : 8; v.dustCd = phase3 ? 13 : 20; this.timaSpeak('Я БЫСТРЫЙ!', 1.2); this.sfx('sparkle'); this.toastAll('Тима разогнался: бегай от него 8 секунд'); v.state = 'idle'; v.t = 0.3; }
        break;
      case 'sneeze': v.vx = 0; if (v.t <= 0) { v.state = 'idle'; v.t = 0.5; } break;
      case 'recover': v.vx = 0; v.t -= dt * sp * BAL.pace.tima; if (v.t <= 0) { v.state = 'idle'; v.t = (phase2 ? 0.45 : 0.7); } break;
    }
    if (v.state !== 'lagGone') {
      v.vy = Math.min(v.vy + P.G * dt, P.MAXFALL);
      this.moveBody(v, dt);
    }
    if (v.state === 'lagFall' && v.onGround) {
      const vcx2 = v.x + v.w / 2, cy = v.y + v.h - 18;
      this.shake(340, 0.016); this.sfx('slam'); this.dustAt(18, vcx2, v.y + v.h);
      this.projs.push({ kind: 'ringfx', x: vcx2, y: v.y + 24, w: 0, h: 0, vx: 0, vy: 0, life: 0.9, r: 10 });
      for (const d of [-1, 1]) this.projs.push({ kind: 'rwave', x: vcx2 - 12 + d * 34, y: cy, w: 24, h: 18, vx: d * 400, vy: 0, life: 2.6 });
      v.state = 'recover'; v.t = 1.2; this.timaSpeak('ЛАГ… ПРОШЁЛ', 1.1);
    }
  },
  bankruptSilk() { for (const p of this.players) if (!p.remote) p.silk = Math.floor(p.silk / 2); },
  damageTima(p) {
    const v = this.tima;
    if (v.state === 'rage') { Snd.play('clink'); return; }
    v.hp -= 1; v.flash = 0.09; this.gainSilk(p, true); if (!p.remote) this.hitstop = 0.04; this.sfx(this.bossHitSnd('tima', p)); this.timaHits++;
    this.burst(9, clamp(p.x + 7 + p.face * 28, v.x, v.x + v.w), v.y + v.h / 2, 0xf4f1e6);
    if (v.state === 'drink') { v.state = 'recover'; v.t = 0.4; this.timaSpeak('ЭЙ, РАЗЛИЛ!', 1.0); this.foamAt(12, v.x + v.w / 2, v.y + 30); }
    if (v.state === 'dust' || v.state === 'dustDraw') {
      v.dustHits++;
      if (v.dustHits >= 3) { v.state = 'sneeze'; v.t = 1.6; v.dustCd = 14; this.timaSpeak('АПЧХИ!', 1.2); this.sfx('cough'); this.dustFx.explode(30, v.x + v.w / 2 + v.face * 30, v.y + 20); }
    }
    this.ui().bossBar(true, 'Тима Пиво', Math.max(0, v.hp) / v.maxHp);
    if (this.checkPhase(v, 'Тима Пиво')) { this.timaSpeak(v.phase === 3 ? 'ВСЁ, Я ЗЛОЙ! ДОНАТ НА ВСЁ!' : 'ТЫ ЧЁ, РЕАЛЬНО?!', 2); v.hyper = 0; }
    if (v.sayCd <= 0 && Math.random() < 0.3 && v.state !== 'sneeze') { this.timaSpeak(TIMA_SAY_HIT[Math.floor(Math.random() * TIMA_SAY_HIT.length)], 1.0); v.sayCd = 2.5; }
    if (v.hp <= 0) this.timaDie();
  },
  timaDie() {
    const v = this.tima; v.state = 'dead'; v.t = 2.6; v.vx = 0; v.hyper = 0; this.bossDead = true; this.bossDeathFx();
    for (const pr of this.projs) pr.dead = true;
    this.setRepo(false); this.repoT = 0; this.sendEv({ k: 'repo', on: 0 });
    this.timaSpeak('ВСЁ… Я СПАТЬ…', 2.4); this.sfx('burp'); this.shake(600, 0.008);
    for (let i = 0; i < 6; i++) this.time.delayedCall(i * 170, () => this.foamAt(18, v.x + Math.random() * v.w, v.y + Math.random() * v.h));
    this.time.delayedCall(3300, () => { this.ui().bossBar(false); this.win(); });
  },
  foamAt(n, x, y) { this.foam.explode(n, x, y); if (this.online === 'host') this.sendEv({ k: 'foam', n, x: Math.round(x), y: Math.round(y) }); },
  stepTimaProj(pr, dt) {
    const v = this.tima;
    if (pr.kind === 'bottle') {
      pr.vy = Math.min(pr.vy + 1100 * dt, 800); pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.rot += dt * 12;
      const t = this.tileAt(Math.floor((pr.x + 5) / T), Math.floor((pr.y + 20) / T));
      if (t === SOLID || (t === PLAT && pr.vy > 0)) {
        pr.dead = true; this.foamAt(10, pr.x + 5, pr.y + 16); this.sfx('glass');
        const gy = Math.floor((pr.y + 20) / T) * T;
        this.puddles.push({ x: pr.x + 5 - 40, w: 80, y: gy, t: 5 });
      }
    } else if (pr.kind === 'pad') {
      const vcx = v.x + v.w / 2, vcy = v.y + 34;
      const k = 1 - pr.life / 2.2;
      pr.rad = 20 + Math.min(1, k * 2.2) * 125 * (k > 0.8 ? (1 - k) * 5 : 1);
      pr.ang += pr.spin * dt * (v.hyper > 0 ? 7.5 : 5.5);
      pr.x = vcx + Math.cos(pr.ang) * pr.rad - 13; pr.y = vcy + Math.sin(pr.ang) * pr.rad * 0.75 - 9;
      pr.cx = vcx; pr.cy = vcy;
    } else if (pr.kind === 'rwave') {
      pr.x += pr.vx * dt;
      const fx = pr.vx > 0 ? pr.x + pr.w : pr.x;
      if (this.isSolid(Math.floor(fx / T), Math.floor((pr.y + 9) / T))) pr.dead = true;
    } else if (pr.kind === 'ringfx') {
      pr.r += 900 * dt;
    } else if (pr.kind === 'box') {
      pr.vy = Math.min(pr.vy + 1100 * dt, 800); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (this.isSolid(Math.floor((pr.x + 18) / T), Math.floor((pr.y + 22) / T)) && pr.vy > 0) {
        pr.y = Math.floor((pr.y + 22) / T) * T - 22; this.dustAt(8, pr.x + 18, pr.y + 22); this.sfx('slam');
        if (pr.bounces-- > 0) { pr.vy = -380; pr.vx *= 0.8; } else pr.dead = true;
      }
      if (this.isSolid(Math.floor((pr.x + (pr.vx > 0 ? 36 : 0)) / T), Math.floor((pr.y + 10) / T))) pr.vx = -pr.vx;
    } else if (pr.kind === 'stamp') {
      pr.vy = Math.min(pr.vy + 1300 * dt, 900); pr.y += pr.vy * dt;
      if (this.isSolid(Math.floor((pr.x + 40) / T), Math.floor((pr.y + 44) / T))) { pr.dead = true; this.dustAt(16, pr.x + 40, pr.y + 44); this.shake(180, 0.01); this.sfx('slam'); }
    }
  },

  drawTima(now) {
    const v = this.tima, g = v.g; g.clear();
    if (v.y < -50) { this.tSay.setVisible(false); return; } // в «лаге»: Тима пропал
    const f = v.face, fl = v.flash > 0, dead = v.state === 'dead', hyper = v.hyper > 0;
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
    const open = v.sayT > 0;
    g.fillStyle(0x1a1410, 1); if (open) g.fillEllipse(hx + 10 * f, hy + 9, 7, 4 + Math.abs(Math.sin(now * 14)) * 3); else g.fillRect(Math.min(hx + 7 * f, hx + 13 * f), hy + 9, 6, 1.6);
    // светящийся круг на полу: сначала чертит, потом встаёт в него
    if (v.state === 'dustDraw' || v.state === 'dust') {
      const rx = v.state === 'dust' ? cx : cx + f * 52, prog = v.state === 'dust' ? 1 : clamp(1 - v.t / 2.2, 0, 1);
      const pulse = 0.6 + Math.sin(now * 10) * 0.25;
      g.lineStyle(3, 0xffe38a, v.state === 'dust' ? pulse : 0.85);
      g.beginPath(); g.arc(rx, fy - 3, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog, false); g.strokePath();
      g.lineStyle(1.5, 0xffb6f0, 0.7); g.strokeEllipse(rx, fy - 3, 52 * prog, 10 * prog);
      if (v.state === 'dust') { g.fillStyle(0xffe38a, 0.12 + Math.sin(now * 8) * 0.05); g.fillRect(rx - 26, fy - 90, 52, 88); }
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
      const bx = up ? ax : ax, by = up ? ay - 18 : ay - 14;
      g.fillStyle(0x6b3d14, 1); g.fillRoundedRect(bx - 5, by, 10, 22, 3); g.fillRect(bx - 2, by - 7, 4, 8);
      g.fillStyle(0xf4efe0, 1); g.fillRect(bx - 5, by + 8, 10, 7);
    }
    // реплика
    const say = this.tSay;
    if (v.sayT > 0 && v.say) say.setText(v.say).setPosition(hx, hy - 24).setVisible(true); else say.setVisible(false);
  },
  drawTimaProjs(now) {
    const fx = this.fx, fb = this.fxBack;
    for (const q of this.puddles || []) {
      const a = Math.min(1, q.t) * 0.85;
      fb.fillStyle(0xf2c14e, a); fb.fillEllipse(q.x + q.w / 2, q.y - 2, q.w, 9);
      fb.fillStyle(0xfff6d8, a); for (let i = 0; i < 5; i++) fb.fillCircle(q.x + 10 + i * 15, q.y - 4 - Math.abs(Math.sin(now * 3 + i)) * 2, 3);
    }
    for (const pr of this.projs) {
      if (pr.kind === 'bottle') {
        const cs = Math.cos(pr.rot), sn = Math.sin(pr.rot), x = pr.x + 5, y = pr.y + 11;
        const P2 = (px, py) => ({ x: x + px * cs - py * sn, y: y + px * sn + py * cs });
        fx.fillStyle(0x6b3d14, 1); fx.fillPoints([P2(-5, -4), P2(5, -4), P2(5, 11), P2(-5, 11)], true);
        fx.fillPoints([P2(-2, -11), P2(2, -11), P2(2, -4), P2(-2, -4)], true);
        fx.fillStyle(0xf4efe0, 1); fx.fillPoints([P2(-5, 1), P2(5, 1), P2(5, 6), P2(-5, 6)], true);
      } else if (pr.kind === 'pad') {
        fx.lineStyle(2, 0x1a1a22, 1); fx.lineBetween(pr.cx || pr.x, pr.cy || pr.y, pr.x + 13, pr.y + 9);
        fx.fillStyle(0x2a2a30, 1); fx.fillRoundedRect(pr.x, pr.y + 2, 26, 14, 6); fx.fillCircle(pr.x + 4, pr.y + 14, 5); fx.fillCircle(pr.x + 22, pr.y + 14, 5);
        fx.fillStyle(0xd0d0d6, 1); fx.fillCircle(pr.x + 8, pr.y + 8, 2.2);
        fx.fillStyle(0xff5a4a, 1); fx.fillCircle(pr.x + 19, pr.y + 6, 1.6); fx.fillStyle(0x5ab0ff, 1); fx.fillCircle(pr.x + 17, pr.y + 9, 1.6);
        fx.fillStyle(0x6bd36b, 1); fx.fillCircle(pr.x + 21, pr.y + 9, 1.6); fx.fillStyle(0xffd47a, 1); fx.fillCircle(pr.x + 19, pr.y + 12, 1.6);
      } else if (pr.kind === 'rwave') {
        fx.fillStyle(0xff3a2a, 0.3); fx.fillEllipse(pr.x + 12, pr.y + 12, 36, 22);
        fx.fillStyle(0xff6a4a, 1); for (let i = 0; i < 3; i++) fx.fillTriangle(pr.x + i * 8, pr.y + 18, pr.x + 4 + i * 8, pr.y + 2 + Math.sin(now * 30 + i) * 3, pr.x + 8 + i * 8, pr.y + 18);
      } else if (pr.kind === 'ringfx') {
        const a = Math.max(0, pr.life / 0.9);
        fx.lineStyle(10, 0xff3a2a, 0.6 * a); fx.strokeCircle(pr.x, pr.y, pr.r); fx.lineStyle(3, 0xffc0b0, 0.8 * a); fx.strokeCircle(pr.x, pr.y, pr.r);
      } else if (pr.kind === 'box') {
        fx.fillStyle(0x1e1e22, 1); fx.fillRoundedRect(pr.x, pr.y, 36, 22, 5); fx.fillStyle(0x34343c, 1); fx.fillRect(pr.x + 4, pr.y + 4, 28, 3);
        fx.fillStyle(0x6bd36b, 1); fx.fillCircle(pr.x + 28, pr.y + 14, 2);
      } else if (pr.kind === 'stamp') {
        const warn = pr.delay > 0;
        if (warn) { fx.fillStyle(0xff5a4a, 0.45 + Math.sin(now * 20) * 0.15); fx.fillEllipse(pr.x + 40, this.L.floorY * T - 2, 84, 12); }
        const a = warn ? 0.4 : 1;
        fx.fillStyle(0x6b3d14, a); fx.fillRect(pr.x + 34, pr.y - 26, 12, 26); fx.fillCircle(pr.x + 40, pr.y - 28, 9);
        fx.fillStyle(0x3a2a22, a); fx.fillRect(pr.x, pr.y, 80, 34); fx.fillStyle(0xd23a2a, a); fx.fillRect(pr.x + 2, pr.y + 34, 76, 10);
      }
    }
  },
  drawStampLabels() {
    if (!this.stampPool) this.stampPool = [];
    let i = 0;
    for (const pr of this.projs) if (pr.kind === 'stamp') {
      let t = this.stampPool[i];
      if (!t) { t = this.add.text(0, 0, 'БАНКРОТ', { fontFamily: '"Fira Sans", sans-serif', fontSize: '14px', fontStyle: '700', color: '#f4efe0' }).setOrigin(0.5).setDepth(6.4); this.stampPool.push(t); }
      t.setPosition(pr.x + 40, pr.y + 17).setAlpha(pr.delay > 0 ? 0.4 : 1).setVisible(true); i++;
    }
    for (let k = i; k < this.stampPool.length; k++) this.stampPool[k].setVisible(false);
  },
});
