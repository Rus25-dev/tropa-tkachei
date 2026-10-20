// ===== БОСС «МИША ДОДИК»: арена «Старая типография», буквы, рюкзак и дымовухи =====
const MISHA_WORDS = ['РЮКЗАК', 'ПРИВЕТ', 'АЗБУКА', 'КАПСЛОК', 'ШРИФТ', 'МИША', 'БУКВЫ', 'ДОДИК'];
const MISHA_BIG = 'ШЖЩЫФДЯ';
const MISHA_SAY_HIT = ['КХЕ-КХЕ!', 'МОЙ РЮКЗАК!', 'ФУ, ДЫМ!', 'ТАК НЕЧЕСТНО!', 'ЭЙ, ХВАТИТ!'];

function buildMishaArena() {
  const W = 44, H = 22, g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(SOLID));
  for (let y = 4; y <= 17; y++) for (let x = 1; x <= 42; x++) g[y][x] = EMPTY;
  const plat = (x0, x1, y) => { for (let x = x0; x <= x1; x++) g[y][x] = PLAT; };
  plat(6, 11, 13); plat(32, 37, 13); plat(19, 24, 9);
  return {
    W, H, grid: g, spawn: { x: 6, y: 17 }, benches: [], enemies: [], gates: [], exit: null,
    signs: [
      { x: 9, y: 17, text: 'R — дымовая бомба (геймпад LB)\n↑ + R — навесом, ↓ + R — под ноги' },
      { x: 14, y: 17, text: 'Иглой Мишу не пробить.\nЗакинь дымовуху ему в рюкзак!' },
    ],
    crates: [{ x: 3, y: 17 }, { x: 40, y: 17 }],
    misha: { x: 28, y: 17 }, ceilY: 4,
    areas: [{ x: 0, name: 'Старая типография' }], region: 'Босс-тест',
  };
}

Object.assign(GameScene.prototype, {
  // ----- создание -----
  setupMishaArena() {
    const L = this.L;
    // буквы на задней стене — следы старых наборных касс
    const R = rng(404), chars = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЫЭЮЯ';
    for (let i = 0; i < 22; i++) {
      this.add.text(T * (2 + R() * 40), T * (4 + R() * 12), chars[Math.floor(R() * chars.length)],
        { fontFamily: '"Fira Sans", sans-serif', fontSize: Math.round(50 + R() * 110) + 'px', fontStyle: '600', color: '#e8e2cf' })
        .setOrigin(0.5).setAlpha(0.05 + R() * 0.05).setAngle((R() - 0.5) * 30).setDepth(0.3);
    }
    this.add.text(22 * T, 5 * T + 6, 'ТИПОГРАФИЯ', { fontFamily: '"Cormorant SC", Georgia, serif', fontSize: '30px', fontStyle: '700', color: '#8fb8a8' })
      .setOrigin(0.5, 0).setAlpha(0.35).setDepth(0.4);
    // ящики с дымовухами
    this.crates = (L.crates || []).map((c) => {
      const cx = c.x * T + 16, by = (c.y + 1) * T, g = this.add.graphics().setDepth(2);
      g.fillStyle(0x4a3726, 1); g.fillRoundedRect(cx - 20, by - 28, 40, 28, 3);
      g.lineStyle(2, 0x2c2015, 1); g.strokeRoundedRect(cx - 20, by - 28, 40, 28, 3); g.lineBetween(cx - 20, by - 14, cx + 20, by - 14);
      g.fillStyle(0x6b5236, 1); g.fillRect(cx - 17, by - 25, 34, 3);
      for (let i = 0; i < 3; i++) { g.fillStyle(0x3a3f45, 1); g.fillCircle(cx - 10 + i * 10, by - 33, 6); g.fillStyle(0x9aa39f, 1); g.fillCircle(cx - 12 + i * 10, by - 35, 1.6); }
      g.lineStyle(1.5, 0xffd47a, 1); for (let i = 0; i < 3; i++) g.lineBetween(cx - 10 + i * 10, by - 39, cx - 8 + i * 10, by - 44);
      this.add.text(cx, by - 8, 'ДЫМ', { fontFamily: '"Fira Sans", sans-serif', fontSize: '11px', fontStyle: '600', color: '#e8e2cf' }).setOrigin(0.5).setDepth(2.1);
      return { x: cx - 22, y: by - 46, w: 44, h: 46 };
    });
    this.smoke = this.add.particles(0, 0, 'spark', { emitting: false, lifespan: { min: 900, max: 1600 }, speed: { min: 10, max: 60 },
      scale: { start: 2.2, end: 6 }, alpha: { start: 0.55, end: 0 }, tint: [0x8e9894, 0xb3bab6, 0x6f7774], gravityY: -40 }).setDepth(6.5);
    this.paper = this.add.particles(0, 0, 'dot', { emitting: false, lifespan: 600, speed: { min: 40, max: 160 }, scale: { start: 1.4, end: 0 },
      rotate: { min: 0, max: 360 }, tint: 0xf4efe0, gravityY: 300 }).setDepth(7);
    this.letterPool = []; this.bigPool = [];
    this.mishaSay = this.add.text(0, 0, '', { fontFamily: '"Fira Sans", sans-serif', fontSize: '15px', fontStyle: '600', color: '#1a1410',
      backgroundColor: '#f4efe0', padding: { x: 8, y: 4 } }).setOrigin(0.5, 1).setDepth(8.5).setVisible(false);
    this.bagHits = 0; this._needleTip = false;
    this.makeMisha();
  },
  makeMisha() {
    if (this.misha && this.misha.g) this.misha.g.destroy();
    const d = this.L.misha, hp = this.nPlayers === 2 ? 8 : 6;
    this.misha = { x: d.x * T - 28, y: (d.y + 1) * T - 74, w: 56, h: 74, vx: 0, vy: 0, face: -1, hp, maxHp: hp, state: 'intro', t: 1.8,
      flash: 0, last: '', turnT: 0, hitCd: 0, say: 'ЭЙ! ЭТО МОЙ РЮКЗАК!', sayT: 2.2, barShown: false, g: this.add.graphics().setDepth(4) };
  },
  mishaBag(m) { const cx = m.x + m.w / 2; return { x: cx - 26 * m.face - 15, y: m.y + 12, w: 30, h: 40 }; },
  smokeAt(n, x, y) { this.smoke.explode(n, x, y); if (this.online === 'host') this.sendEv({ k: 'smoke', n, x: Math.round(x), y: Math.round(y) }); },
  mishaSpeak(text, dur) { const m = this.misha; m.say = text; m.sayT = dur || 1.6; },

  // ----- бомбы игроков -----
  throwBomb(p) {
    if (!this.L.crates || p.bombs <= 0 || p.bombCd > 0 || p.downed || p.sit) return;
    p.bombs--; p.bombCd = 0.35;
    const inp = p.inp, f = p.face;
    let vx = f * 360, vy = -430;
    if (inp.up) { vx = f * 230; vy = -650; } else if (inp.down) { vx = f * 170; vy = -180; }
    vx += p.vx * 0.25;
    const b = { kind: 'bomb', x: p.x + 7 + f * 8 - 6, y: p.y + 2, w: 12, h: 12, vx, vy, life: 3, owner: p.i };
    Snd.play('throw');
    if (this.auth()) this.projs.push(b);
    else this.sendEv({ k: 'bomb', b: { x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(vx), vy: Math.round(vy) }, i: p.i });
  },
  refillBombs(p) {
    if (!this.crates || p.remote || p.downed) return;
    for (const c of this.crates) if (p.bombs < 3 && overlap(p, c)) { p.bombs = 3; Snd.play('pickup'); this.ui().toast('Дымовухи: 3 из 3'); }
  },
  stepBomb(pr, dt) {
    pr.vy = Math.min(pr.vy + 1100 * dt, 800); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    const m = this.misha, cx = pr.x + 6, cy = pr.y + 6;
    if (m && !['dead', 'intro'].includes(m.state)) {
      const bag = this.mishaBag(m), behind = (cx - (m.x + m.w / 2)) * m.face < 0;
      // падающая сверху бомба «залетает» в открытую молнию — зона над рюкзаком шире
      const mouth = pr.vy > 0 ? { x: bag.x - 8, y: bag.y - 26, w: bag.w + 16, h: bag.h + 26 } : bag;
      if (behind && overlap(pr, mouth)) { pr.dead = true; this.mishaBagHit(pr); return; }
      if (overlap(pr, inset(m, 4))) {
        pr.dead = true; this.smokeAt(6, cx, cy); this.sfx('puff');
        if (Math.random() < 0.5) this.mishaSpeak(m.state === 'cough' ? 'МИМО!' : 'ХА, МИМО!', 1.1);
        return;
      }
    }
    if (this.isSolid(Math.floor(cx / T), Math.floor(cy / T))) { pr.dead = true; this.smokeAt(8, cx, cy - 4); this.sfx('puff'); }
  },
  mishaBagHit(pr) {
    const m = this.misha, bag = this.mishaBag(m);
    if (m.hitCd > 0) { this.smokeAt(6, bag.x + 15, bag.y); this.sfx('puff'); return; }
    m.hp -= 1; m.flash = 0.12; m.hitCd = 0.9; this.bagHits++;
    this.smokeAt(26, bag.x + 15, bag.y + 4); this.sfx('puff'); this.sfx('cough'); this.shake(180, 0.008); this.hitstop = 0.06;
    this.ui().bossBar(true, 'Миша Додик', Math.max(0, m.hp) / m.maxHp);
    if (m.hp <= 0) { this.mishaDie(); return; }
    m.state = 'cough'; m.t = 1.5; m.vx = 0;
    this.mishaSpeak(MISHA_SAY_HIT[Math.floor(Math.random() * MISHA_SAY_HIT.length)], 1.3);
    if (m.hp === Math.floor(m.maxHp / 2)) this.toastAll('Миша злится: буквы летят быстрее');
  },
  mishaDie() {
    const m = this.misha; m.state = 'dead'; m.t = 2.6; m.vx = 0; this.bossDead = true;
    for (const pr of this.projs) if (pr.kind !== 'bomb') pr.dead = true;
    this.mishaSpeak('ЛАДНО, ЛАДНО! СДАЮСЬ!', 2.4); this.sfx('roar'); this.shake(900, 0.008);
    for (let i = 0; i < 8; i++) this.time.delayedCall(i * 160, () => { const b = this.mishaBag(m); this.smokeAt(22, b.x + 15 + (Math.random() - 0.5) * 40, b.y + Math.random() * 30); });
    this.time.delayedCall(2700, () => { this.ui().bossBar(false); this.win(); });
  },
  mishaNeedle(p, box) {
    const m = this.misha;
    if (!m || p.atkHits.has(m) || ['dead', 'intro'].includes(m.state) || !overlap(box, m)) return false;
    p.atkHits.add(m); m.flash = 0.06;
    this.gainSilk(p); Snd.play('clink'); this.parts.setParticleTint(0xffffff); this.parts.explode(5, clamp(p.x + 7 + p.face * 26, m.x, m.x + m.w), m.y + m.h / 2);
    if (!this._needleTip) { this._needleTip = true; this.ui().toast('Иглой Мишу не пробить. Дымовуху ему в рюкзак!'); }
    return true;
  },

  // ----- поведение (считает хост) -----
  stepMisha(dt) {
    const m = this.misha; if (!m) return;
    m.flash -= dt; m.hitCd -= dt; m.sayT -= dt;
    if (!m.barShown && this.ui().ready) { m.barShown = true; this.ui().bossBar(true, 'Миша Додик', m.hp / m.maxHp); }
    if (m.state === 'dead') { m.t -= dt; m.vy = Math.min(m.vy + P.G * dt, P.MAXFALL); this.moveBody(m, dt); return; }
    const phase2 = m.hp <= m.maxHp / 2;
    const [tp] = this.nearestPlayer(m.x + m.w / 2, m.y + m.h / 2);
    const tx = tp ? tp.x + 7 : m.x + m.w / 2, mcx = m.x + m.w / 2;
    const want = tx > mcx ? 1 : -1;
    m.t -= dt;
    switch (m.state) {
      case 'intro': m.vx = 0; if (m.t <= 0) { m.state = 'idle'; m.t = 0.8; } break;
      case 'idle': {
        if (want !== m.face) { m.turnT += dt; if (m.turnT > (phase2 ? 0.32 : 0.5)) { m.face = want; m.turnT = 0; } } else m.turnT = 0;
        m.vx = Math.abs(tx - mcx) > 220 ? m.face * 70 : 0;
        if (m.t <= 0) {
          const opts = ['letters', 'big', 'charge'].filter((o) => o !== m.last);
          const pick = opts[Math.floor(Math.random() * opts.length)]; m.last = pick; m.vx = 0;
          if (pick === 'letters') this.mishaWord(phase2);
          if (pick === 'big') { m.state = 'bigWind'; m.t = 0.6; this.mishaSpeak('ДЕТДОМ!', 1.2); }
          if (pick === 'charge') { m.state = 'chargeWind'; m.t = phase2 ? 0.45 : 0.6; m.face = want; this.mishaSpeak('С ДОРОГИ!', 1.0); }
        }
        break;
      }
      case 'word': m.vx = 0; if (m.t <= 0) { m.state = 'recover'; m.t = phase2 ? 0.45 : 0.7; } break;
      case 'bigWind':
        m.vx = 0;
        if (m.t <= 0) {
          const targets = this.alivePlayers().length ? this.alivePlayers() : this.players;
          const n = phase2 ? 3 : 1;
          for (let i = 0; i < n; i++) {
            const p = targets[i % targets.length], off = n === 1 ? 0 : (i - 1) * 110;
            const x = clamp(p.x + 7 + off, 2 * T, (this.L.W - 2) * T) - 28;
            this.projs.push({ kind: 'bigletter', ch: MISHA_BIG[Math.floor(Math.random() * MISHA_BIG.length)], x, y: 7 * T, w: 56, h: 60, vx: 0, vy: 0, life: 3, delay: 0.75 + i * 0.15 });
          }
          m.state = 'recover'; m.t = phase2 ? 0.8 : 1.1;
        }
        break;
      case 'chargeWind': m.vx = 0; if (m.t <= 0) { m.state = 'charge'; this.sfx('roar'); } break;
      case 'charge': m.vx = m.face * (phase2 ? 500 : 420); break;
      case 'cough': m.vx = 0; if (Math.random() < 0.25) { const b = this.mishaBag(m); this.smokeAt(1, b.x + 15, b.y); } if (m.t <= 0) { m.state = 'idle'; m.t = phase2 ? 0.4 : 0.7; } break;
      case 'stun': m.vx = 0; if (m.t <= 0) { m.state = 'idle'; m.t = 0.5; } break;
      case 'recover': m.vx = 0; if (m.t <= 0) { m.state = 'idle'; m.t = phase2 ? 0.35 : 0.65; } break;
    }
    m.vy = Math.min(m.vy + P.G * dt, P.MAXFALL);
    const was = m.state;
    this.moveBody(m, dt);
    if (was === 'charge' && (m.hitL || m.hitR)) {
      m.state = 'stun'; m.t = 1.4; this.shake(260, 0.012); this.sfx('slam'); this.mishaSpeak('АЙ!', 1.0);
      this.dustAt(12, m.face > 0 ? m.x + m.w : m.x, m.y + m.h / 2);
    }
  },
  mishaWord(phase2) {
    const m = this.misha, word = MISHA_WORDS[Math.floor(Math.random() * MISHA_WORDS.length)];
    m.state = 'word'; m.t = 0.5 + word.length * 0.13 + 0.25;
    this.mishaSpeak(word + '!', m.t);
    const step = 26, half = ((word.length - 1) * step) / 2 + 14;
    const cx = clamp(m.x + m.w / 2, T + half + 6, (this.L.W - 1) * T - half - 6);
    for (let i = 0; i < word.length; i++) {
      this.projs.push({ kind: 'letter', ch: word[i], x: cx - ((word.length - 1) * step) / 2 + i * step - 11, y: m.y - 100, w: 22, h: 26,
        vx: 0, vy: 0, life: 4, delay: 0.5 + i * 0.13, launched: false, spd: phase2 ? 440 : 360, bounce: phase2 ? 1 : 0 });
    }
  },
  stepLetter(pr, dt) {
    if (!pr.launched) {
      pr.launched = true;
      const [tp] = this.nearestPlayer(pr.x + 11, pr.y + 13);
      const tx = tp ? tp.x + 7 : pr.x, ty = tp ? tp.y + 13 : pr.y + 200;
      const dx = tx - (pr.x + 11), dy = ty - (pr.y + 13), l = Math.hypot(dx, dy) || 1;
      pr.vx = (dx / l) * pr.spd; pr.vy = (dy / l) * pr.spd; Snd.play('letter'); if (this.online === 'host') this.sendEv({ k: 'snd', n: 'letter' });
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    const cx = pr.x + 11, cy = pr.y + 13;
    if (this.isSolid(Math.floor(cx / T), Math.floor(cy / T))) {
      if (pr.bounce > 0) {
        pr.bounce--; pr.x -= pr.vx * dt * 2; pr.y -= pr.vy * dt * 2;
        const sx = this.isSolid(Math.floor((cx + Math.sign(pr.vx) * 12) / T), Math.floor(cy / T));
        if (sx) pr.vx = -pr.vx; else pr.vy = -pr.vy;
      } else { pr.dead = true; this.paperAt(6, cx, cy); }
    }
  },
  stepBigLetter(pr, dt) {
    pr.vy = Math.min(pr.vy + 1100 * dt, 820); pr.y += pr.vy * dt;
    if (this.isSolid(Math.floor((pr.x + 28) / T), Math.floor((pr.y + 60) / T))) {
      pr.dead = true; this.dustAt(14, pr.x + 28, pr.y + 60); this.paperAt(10, pr.x + 28, pr.y + 50); this.shake(150, 0.008); this.sfx('slam');
    }
  },
  paperAt(n, x, y) { this.paper.explode(n, x, y); if (this.online === 'host') this.sendEv({ k: 'paper', n, x: Math.round(x), y: Math.round(y) }); },

  // ----- отрисовка -----
  drawMisha(now) {
    const m = this.misha, g = m.g; g.clear();
    const f = m.face, fl = m.flash > 0, dead = m.state === 'dead';
    g.setAlpha(dead ? clamp(m.t / 1.2, 0, 1) : 1);
    let shake = 0; if (['chargeWind', 'bigWind'].includes(m.state)) shake = Math.sin(now * 70) * 2;
    const cx = m.x + m.w / 2 + shake, fy = m.y + m.h;
    const walk = Math.abs(m.vx) > 5, legA = walk ? Math.sin(now * (m.state === 'charge' ? 26 : 10)) * 5 : 0;
    const cough = m.state === 'cough', hunch = cough ? 5 : m.state === 'charge' ? 3 : 0;
    const phase2 = m.hp <= m.maxHp / 2;
    // ноги
    g.lineStyle(5, 0x23262e, 1); g.lineBetween(cx - 10, fy - 14, cx - 10 + legA, fy); g.lineBetween(cx + 10, fy - 14, cx + 10 - legA, fy);
    g.fillStyle(0x23262e, 1); g.fillEllipse(cx - 10 + legA + 3 * f, fy - 1, 14, 6); g.fillEllipse(cx + 10 - legA + 3 * f, fy - 1, 14, 6);
    // рюкзак (сзади)
    const bag = this.mishaBag(m), bx = bag.x + (shake || 0), by = bag.y + hunch;
    g.fillStyle(fl ? 0xffffff : 0xe08a2c, 1); g.fillRoundedRect(bx, by, 30, 40, 7);
    g.fillStyle(fl ? 0xffffff : 0xa85f17, 1); g.fillRoundedRect(bx + 2, by + 22, 26, 14, 4);
    g.lineStyle(1.5, 0x6a3a0c, 1); g.strokeRoundedRect(bx + 2, by + 22, 26, 14, 4); g.lineBetween(bx + 8, by + 29, bx + 22, by + 29);
    g.fillStyle(0x1a1410, 1); g.fillEllipse(bx + 15, by + 2, 24, 8); // открытая молния — цель
    const anyBombs = this.players.some((p) => p.bombs > 0);
    if (anyBombs && !dead) { g.lineStyle(2, 0xffd47a, 0.35 + Math.sin(now * 5) * 0.25); g.strokeEllipse(bx + 15, by + 2, 30, 12); }
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
    const open = ['word', 'bigWind', 'chargeWind', 'intro'].includes(m.state) || m.sayT > 0;
    g.fillStyle(0x1a1410, 1);
    if (open) g.fillEllipse(hx + 9 * f, hy + 11, 7, 5 + Math.abs(Math.sin(now * 14)) * 3); else g.fillRect(Math.min(hx + 6 * f, hx + 12 * f), hy + 11, 6, 1.6);
    // оглушение
    if (m.state === 'stun') { g.fillStyle(0xffe3a3, 0.9); for (let i = 0; i < 4; i++) g.fillCircle(hx + Math.cos(now * 6 + i * 1.6) * 22, hy - 24 + Math.sin(now * 6 + i * 1.6) * 5, 2.5); }
    // дым из рюкзака тем гуще, чем меньше здоровья
    const lvl = (m.maxHp - Math.max(0, m.hp)) / m.maxHp;
    if (lvl > 0 && Math.random() < lvl * 0.35) this.smoke.explode(1, bx + 15, by);
    // реплика
    const say = this.mishaSay;
    if (m.sayT > 0 && m.say) { say.setText(m.say).setPosition(hx, hy - 26).setVisible(true); } else say.setVisible(false);
  },
  drawLetters(now) {
    let li = 0, bi = 0;
    for (const pr of this.projs) {
      if (pr.kind === 'letter') {
        let t = this.letterPool[li];
        if (!t) { t = this.add.text(0, 0, '', { fontFamily: '"Fira Sans", sans-serif', fontSize: '28px', fontStyle: '700', color: '#f4efe0', stroke: '#1a1410', strokeThickness: 5 }).setOrigin(0.5).setDepth(6.2); this.letterPool.push(t); }
        const hover = pr.delay > 0;
        t.setText(pr.ch).setPosition(pr.x + 11, pr.y + 13 + (hover ? Math.sin(now * 8 + li) * 3 : 0)).setVisible(true)
          .setRotation(hover ? 0 : now * 9 + li).setColor(hover ? '#ffd47a' : '#f4efe0');
        li++;
      } else if (pr.kind === 'bigletter') {
        let t = this.bigPool[bi];
        if (!t) { t = this.add.text(0, 0, '', { fontFamily: '"Fira Sans", sans-serif', fontSize: '74px', fontStyle: '700', color: '#e8e2cf', stroke: '#1a1410', strokeThickness: 7 }).setOrigin(0.5).setDepth(6.2); this.bigPool.push(t); }
        const warn = pr.delay > 0;
        t.setText(pr.ch).setPosition(pr.x + 28, pr.y + 30).setVisible(true).setAlpha(warn ? 0.35 + Math.sin(now * 20) * 0.15 : 1);
        if (warn) { this.fx.fillStyle(0xff6a4a, 0.45 + Math.sin(now * 20) * 0.15); this.fx.fillEllipse(pr.x + 28, 18 * T - 2, 64, 12); }
        bi++;
      } else if (pr.kind === 'bomb') {
        const fx = this.fx, x = pr.x + 6, y = pr.y + 6;
        fx.fillStyle(0x3a3f45, 1); fx.fillCircle(x, y, 6); fx.fillStyle(0x9aa39f, 1); fx.fillCircle(x - 2, y - 2, 1.6);
        fx.lineStyle(1.5, 0xffd47a, 1); fx.lineBetween(x + 2, y - 5, x + 4, y - 9);
        fx.fillStyle(0xffd47a, 0.6 + Math.random() * 0.4); fx.fillCircle(x + 4, y - 10, 2);
      }
    }
    for (let i = li; i < this.letterPool.length; i++) this.letterPool[i].setVisible(false);
    for (let i = bi; i < this.bigPool.length; i++) this.bigPool[i].setVisible(false);
  },
});
