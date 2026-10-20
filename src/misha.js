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
      { x: 9, y: 17, text: 'R — дымовая бомба (геймпад LB)\n↑ + R — навесом, ↓ + R — под ноги', touch: 'Кнопка «Бомба» — дымовуха\nстик вверх — навесом, вниз — под ноги' },
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
    const d = this.L.misha, hp = BAL.hp.misha[this.nPlayers === 2 ? 1 : 0];
    this.misha = { x: d.x * T - 28, y: (d.y + 1) * T - 74, w: 56, h: 74, vx: 0, vy: 0, face: -1, hp, maxHp: hp, state: 'intro', t: 3.2,
      flash: 0, last: '', turnT: 0, hitCd: 0, tdMarks: [Math.ceil(hp * 2 / 3), Math.ceil(hp / 3)], tdUsed: [], tdQueue: false, say: 'ЭЙ! ЭТО МОЙ РЮКЗАК!', sayT: 3.0, zipT: 0, barShown: false, g: this.add.graphics().setDepth(4) };
  },
  mishaBag(m) { const cx = m.x + m.w / 2; return { x: cx - 26 * m.face - 15, y: m.y + 12, w: 30, h: 40 }; },
  smokeAt(n, x, y) { this.smoke.explode(n, x, y); if (this.online === 'host') this.sendEv({ k: 'smoke', n, x: Math.round(x), y: Math.round(y) }); },
  mishaSpeak(text, dur) { const m = this.misha; m.say = text; m.sayT = Math.max(dur || 1.6, 1.4 + text.length * 0.07); },

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
      if (behind && overlap(pr, mouth)) {
        pr.dead = true;
        if (m.zipT > 0) { this.smokeAt(5, bag.x + 15, bag.y); this.sfx('clink'); if (m.sayT <= 0) this.mishaSpeak('ЗАКРЫТО!', 1.0); return; }
        this.mishaBagHit(pr); return;
      }
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
    this.smokeAt(26, bag.x + 15, bag.y + 4); this.sfx('bag'); this.sfx('puff'); this.sfx('cough'); this.shake(180, 0.008); this.hitstop = 0.06;
    this.ui().bossBar(true, 'Миша Додик', Math.max(0, m.hp) / m.maxHp);
    if (m.hp <= 0) { this.mishaDie(); return; }
    m.state = 'cough'; m.t = 1.5; m.vx = 0;
    for (const mark of m.tdMarks) if (m.hp <= mark && !m.tdUsed.includes(mark)) { m.tdUsed.push(mark); m.tdQueue = true; }
    this.mishaSpeak(MISHA_SAY_HIT[Math.floor(Math.random() * MISHA_SAY_HIT.length)], 1.3);
    if (m.hp === Math.floor(m.maxHp / 2)) this.toastAll('Миша злится: буквы летят быстрее');
  },
  mishaDie() {
    const m = this.misha; m.state = 'dead'; m.t = 2.6; m.vx = 0; this.bossDead = true; this.bossDeathFx();
    for (const pr of this.projs) if (pr.kind !== 'bomb') pr.dead = true;
    this.mishaSpeak('ЭТО СДЕЛАЛ ТАМИК!', 2.6); this.sfx('roar'); this.shake(900, 0.008);
    for (let i = 0; i < 8; i++) this.time.delayedCall(i * 160, () => { const b = this.mishaBag(m); this.smokeAt(22, b.x + 15 + (Math.random() - 0.5) * 40, b.y + Math.random() * 30); });
    this.time.delayedCall(3300, () => { this.ui().bossBar(false); this.win(); });
  },
  mishaNeedle(p, box) {
    const m = this.misha;
    if (!m || p.atkHits.has(m) || ['dead', 'intro'].includes(m.state) || !overlap(box, m)) return false;
    p.atkHits.add(m); m.flash = 0.06;
    this.gainSilk(p); Snd.play('clink'); this.parts.setParticleTint(0xffffff); this.parts.explode(5, clamp(p.x + 7 + p.face * 26, m.x, m.x + m.w), m.y + m.h / 2);
    if (!this._needleTip) { this._needleTip = true; this.ui().toast('Иглой Мишу не пробить. Дымовуху ему в рюкзак!', 5.5); }
    return true;
  },

  // ----- поведение (считает хост) -----
  stepMisha(dt) {
    const m = this.misha; if (!m) return;
    m.flash -= dt; m.hitCd -= dt; m.sayT -= dt;
    if (m.zipT > 0) { m.zipT -= dt; if (m.zipT <= 0) { this.mishaSpeak('ФУХ, ЖАРКО… ОТКРОЮ', 1.6); this.sfx('puff'); } }
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
        m.t -= dt * BAL.pace.misha;
        if (want !== m.face) { m.turnT += dt; if (m.turnT > (phase2 ? 0.32 : 0.5)) { m.face = want; m.turnT = 0; } } else m.turnT = 0;
        m.vx = Math.abs(tx - mcx) > 220 ? m.face * 70 : 0;
        if (m.t <= 0) {
          const late = m.tdUsed.length;
          let opts = ['letters', 'big', 'charge'];
          if (late >= 1) opts.push('dict', 'dict');
          if (late >= 2 && m.zipT <= 0) opts.push('zip');
          if (late >= 1) opts.push('roller');
          if (late >= 2) opts.push('roller', 'roller');
          opts = opts.filter((o) => o !== m.last);
          const pick = opts[Math.floor(Math.random() * opts.length)]; m.last = pick; m.vx = 0;
          if (pick === 'letters') this.mishaWord(phase2);
          if (pick === 'big') { m.state = 'bigWind'; m.t = 0.6; this.mishaSpeak('ДЕТДОМ!', 1.2); }
          if (pick === 'charge') { m.state = 'chargeWind'; m.t = phase2 ? 0.35 : 0.5; m.face = want; this.mishaSpeak('С ДОРОГИ!', 1.0); }
          if (pick === 'dict') { m.state = 'dictWind'; m.t = 0.8; this.mishaSpeak('ДИКТАНТ! ПИШЕМ!', 1.4); this.sfx('roar'); }
          if (pick === 'roller') { m.state = 'rollWind'; m.t = 0.8; this.mishaSpeak('ПЕЧАТЬ! ВАЛИК!', 1.5); this.sfx('gate'); }
          if (pick === 'zip') { m.zipT = 4.5; m.state = 'recover'; m.t = 0.5; this.mishaSpeak('ЗАКРЫЛ! ХА-ХА!', 1.6); this.sfx('gate'); this.toastAll('Рюкзак застёгнут — подожди, пока Мише станет жарко'); }
        }
        break;
      }
      // печатный валик (последняя треть боя): катится от стены за спиной героя через всю арену и обратно
      case 'rollWind':
        m.vx = 0;
        if (m.t <= 0) {
          const side = tx > mcx ? 1 : -1, W = this.L.W;
          this.projs.push({ kind: 'roller', x: side > 0 ? (W - 1) * T - 46 : T, y: this.L.floorY * T - 52 || 18 * T - 52, w: 46, h: 52, vx: -side * 330, vy: 0, life: 9, delay: 1.0, rev: 0 });
          this.sfx('slam'); m.state = 'recover'; m.t = 1.2;
        }
        break;
      case 'dictWind':
        m.vx = 0;
        if (m.t <= 0) { this.mishaDictation(m.tdUsed.length >= 2 ? 3 : m.tdUsed.length >= 1 ? 2 : 1); m.state = 'recover'; m.t = 1.4; }
        break;
      case 'word': m.vx = 0; if (m.t <= 0) { if (phase2 && Math.random() < 0.45) this.mishaWord(phase2); else { m.state = 'recover'; m.t = phase2 ? 0.45 : 0.7; } } break; // во второй половине боя иногда сразу второе слово
      case 'bigWind':
        m.vx = 0;
        if (m.t <= 0) {
          const targets = this.alivePlayers().length ? this.alivePlayers() : this.players;
          const n = phase2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const p = targets[i % targets.length], off = n === 1 ? 0 : (i - 1) * 110;
            const x = clamp(p.x + 7 + off, 2 * T, (this.L.W - 2) * T) - 28;
            this.projs.push({ kind: 'bigletter', ch: MISHA_BIG[Math.floor(Math.random() * MISHA_BIG.length)], x, y: 7 * T, w: 56, h: 60, vx: 0, vy: 0, life: 3, delay: 0.75 + i * 0.15 });
          }
          m.state = 'recover'; m.t = phase2 ? 0.8 : 1.1;
        }
        break;
      case 'chargeWind': m.vx = 0; if (m.t <= 0) { m.state = 'charge'; this.sfx('roar'); } break;
      case 'charge': m.vx = m.face * (phase2 ? 520 : 450); break;
      case 'cough': m.vx = 0; if (Math.random() < 0.25) { const b = this.mishaBag(m); this.smokeAt(1, b.x + 15, b.y); }
        if (m.t <= 0) { m.state = 'idle'; m.t = phase2 ? 0.4 : 0.7; if (m.tdQueue) { m.tdQueue = false; this.tdBegin(); } }
        break;
      case 'stun': m.vx = 0; if (m.t <= 0) { m.state = 'idle'; m.t = 0.5; } break;
      case 'recover': m.vx = 0; m.t -= dt * BAL.pace.misha; if (m.t <= 0) { m.state = 'idle'; m.t = phase2 ? 0.35 : 0.65; } break;
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
        vx: 0, vy: 0, life: 4, delay: 0.42 + i * 0.1, launched: false, spd: phase2 ? 500 : 410, bounce: phase2 ? 1 : 0 });
    }
  },
  // диктант: буквы падают стеной по всей ширине, в стене есть проём — найди его
  mishaDictation(waves) {
    const x0 = 2 * T, x1 = (this.L.W - 2) * T, step = 36, cols = Math.floor((x1 - x0) / step);
    const word = 'ДИКТАНТПРОВЕРКАОШИБОКДВОЙКА';
    for (let w = 0; w < waves; w++) {
      const gap = 2 + Math.floor(Math.random() * (cols - 5));
      for (let i = 0; i < cols; i++) {
        if (i >= gap && i <= gap + 2) continue;
        this.projs.push({ kind: 'rain', ch: word[(i + w * 5) % word.length], x: x0 + i * step, y: 4 * T + 6, w: 22, h: 26, vx: 0, vy: 330 + w * 40, life: 4, delay: 0.9 + w * 1.5 + i * 0.012 });
      }
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
    let shake = 0; if (['chargeWind', 'bigWind', 'rollWind'].includes(m.state)) shake = Math.sin(now * 70) * 2;
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
    if (m.zipT > 0) { // застёгнут: молния и замок
      g.lineStyle(2, 0x6a3a0c, 1); g.lineBetween(bx + 3, by + 3, bx + 27, by + 3);
      for (let k = 0; k < 8; k++) g.lineBetween(bx + 4 + k * 3, by + 1, bx + 4 + k * 3, by + 5);
      g.fillStyle(0xc9a227, 1); g.fillRoundedRect(bx + 11, by + 3, 8, 8, 2); g.lineStyle(1.5, 0xc9a227, 1); g.strokeCircle(bx + 15, by + 2, 3);
    } else { g.fillStyle(0x1a1410, 1); g.fillEllipse(bx + 15, by + 2, 24, 8); } // открытая молния — цель
    const anyBombs = this.players.some((p) => p.bombs > 0);
    if (anyBombs && !dead && !(m.zipT > 0)) { g.lineStyle(2, 0xffd47a, 0.35 + Math.sin(now * 5) * 0.25); g.strokeEllipse(bx + 15, by + 2, 30, 12); }
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
      if (pr.kind === 'letter' || pr.kind === 'rain') {
        let t = this.letterPool[li];
        if (!t) { t = this.add.text(0, 0, '', { fontFamily: '"Fira Sans", sans-serif', fontSize: '28px', fontStyle: '700', color: '#f4efe0', stroke: '#1a1410', strokeThickness: 5 }).setOrigin(0.5).setDepth(6.2); this.letterPool.push(t); }
        const hover = pr.delay > 0, rain = pr.kind === 'rain';
        if (rain) { t.setText(pr.ch).setPosition(pr.x + 11, pr.y + 13).setVisible(true).setRotation(0).setColor(hover ? '#ff9a7a' : '#f4efe0').setAlpha(hover ? 0.45 + Math.sin(now * 18) * 0.2 : 1); li++; continue; }
        t.setAlpha(1);
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

// ===== ФАЗА «ПРОПУСТИТЕ!»: вид сверху, коридоры, Миша ведёт рукой по стене =====
Object.assign(GameScene.prototype, {
  tdGeo() {
    const x0 = 96, x1 = VW - 96, y0 = 122, lh = 104, wt = 14;
    const lanes = [0, 1, 2].map((i) => ({ y0: y0 + i * (lh + wt), y1: y0 + i * (lh + wt) + lh }));
    const L = x1 - x0, door = 84;
    const doors = [[x0 + L * 0.3, x0 + L * 0.72], [x0 + L * 0.5]];
    const walls = [{ x: x0 - wt, y: y0 - wt, w: L + wt * 2, h: wt }, { x: x0 - wt, y: lanes[2].y1, w: L + wt * 2, h: wt }];
    for (let i = 0; i < 2; i++) {
      const wy = lanes[i].y1; let sx = x0;
      for (const d of doors[i]) { walls.push({ x: sx, y: wy, w: d - door / 2 - sx, h: wt }); sx = d + door / 2; }
      walls.push({ x: sx, y: wy, w: x1 - sx, h: wt });
    }
    return { x0, x1, lanes, walls, doors, door, wt, start: x0 + 34, goal: x1 - 26 };
  },
  // запуск фазы (хост) — у гостя вызывается из снимка с fromNet
  tdBegin(fromNet) {
    if (this.td) return;
    const G = this.tdGeo(), m = this.misha;
    this.td = { state: 'intro', t: 1.0, lane: 1, mx: G.start, blocks: 0, need: this.nPlayers === 2 ? 4 : 3, round: 0, say: '', sayT: 0, feint: !!m && m.tdUsed.length >= 2, fe: false };
    const spots = [[G.x1 - 150, G.lanes[0].y0 + 52], [G.x1 - 150, G.lanes[2].y0 + 52]];
    this.players.forEach((p, i) => {
      if (p.remote) return;
      if (p.downed) { p.downed = false; p.hp = Math.max(p.hp, 2); }
      p.tdx = spots[i % 2][0]; p.tdy = spots[i % 2][1]; p.tdDash = 0; p.tdDashCd = 0; p.atkT = 0; p.dashT = 0;
    });
    for (const pr of this.projs) if (pr.kind !== 'bomb') pr.dead = true;
    // камера переворачивается и уходит в «вид сверху»
    const cam = this.cameras.main; this.tdFlip = true;
    this.tweens.add({ targets: cam, rotation: Math.PI / 2, zoom: 2.6, duration: 650, ease: 'Cubic.easeIn' });
    this.ui().tdShow(true);
    if (!fromNet) { this.sfx('roar'); this.shake(400, 0.006); }
    Touch.show(true, { bombs: false });
  },
  tdEnd(success, fromNet) {
    if (!this.td) return;
    this.td = null;
    const cam = this.cameras.main;
    this.tweens.add({ targets: cam, rotation: 0, duration: 550, ease: 'Cubic.easeOut', onComplete: () => { this.tdFlip = false; } });
    this.ui().tdShow(false);
    Touch.show(true, { bombs: !!this.L.crates });
    for (const p of this.players) if (!p.remote) { p.bombs = 3; p.inv = 1.2; }
    if (fromNet) return;
    const m = this.misha;
    if (success) {
      m.state = 'stun'; m.t = 3.2; m.hitCd = 0; m.vx = 0;
      this.mishaSpeak('НУ И ЛАДНО…', 1.6); this.toastAll('Миша выдохся — рюкзак открыт!'); this.sfx('gate');
    } else this.teamWipe();
  },
  tdPickLane() {
    const td = this.td, G = this.tdGeo();
    let lane = Math.floor(Math.random() * 3); if (lane === td.lane && Math.random() < 0.6) lane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
    td.lane = lane; td.mx = G.start; td.state = 'tele'; td.t = 1.1; td.round++; td.fe = false;
    td.say = ['ПОСТОРОНИСЬ!', 'Я ПРОЙДУ!', 'С ДОРОГИ!'][td.round % 3]; td.sayT = 1.6;
  },
  tdMove(p, dt) {
    const G = this.tdGeo(), inp = p.inp || {}, r = 12;
    let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    p.tdDashCd -= dt; p.tdDash -= dt;
    if (inp.dashP && p.tdDashCd <= 0 && (dx || dy)) { p.tdDash = 0.16; p.tdDashCd = 0.5; Snd.play('dash'); }
    const sp = p.tdDash > 0 ? 620 : 250;
    if (dx || dy) p.face = dx > 0 ? 1 : dx < 0 ? -1 : p.face;
    const hit = (x, y) => G.walls.some((w) => x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h);
    const nx = clamp(p.tdx + dx * sp * dt, G.x0 + r, G.x1 - r); if (!hit(nx, p.tdy)) p.tdx = nx;
    const ny = p.tdy + dy * sp * dt; if (!hit(p.tdx, ny)) p.tdy = ny;
  },
  tdStep(dt) {
    const td = this.td; if (!td) return;
    for (const p of this.players) if (!p.remote) this.tdMove(p, dt);
    td.sayT -= dt;
    if (!this.auth()) return;
    const G = this.tdGeo();
    td.t -= dt;
    switch (td.state) {
      case 'intro': if (td.t <= 0) this.tdPickLane(); break;
      case 'tele': if (td.t <= 0) { td.state = 'walk'; this.sfx('slam'); } break;
      case 'walk': {
        td.mx += (85 + td.round * 12) * dt;
        const ln = G.lanes[td.lane];
        const blocker = this.players.find((p) => !p.downed && p.tdy > ln.y0 + 4 && p.tdy < ln.y1 - 4 && p.tdx - td.mx > 14 && p.tdx - td.mx < 46);
        if (blocker) {
          td.blocks++; td.state = 'blocked'; td.t = 1.3; td.say = 'ПРОПУСТИТЕ!'; td.sayT = 1.6;
          this.sfx('roar'); this.shake(220, 0.006);
        } else if (td.mx >= G.goal) { td.state = 'through'; td.t = 1.3; td.say = 'ПРОШЁЛ! ХА!'; td.sayT = 1.6; this.sfx('win'); }
        else if (td.feint && !td.fe && td.mx > G.x0 + (G.x1 - G.x0) * 0.42) {
          // второй «Пропустите!»: на полпути Миша передумывает и перескакивает в другой коридор
          td.fe = true; td.lane = td.lane === 0 ? 1 : td.lane === 2 ? 1 : (Math.random() < 0.5 ? 0 : 2); td.state = 'feint'; td.t = 0.9; // всегда в соседний коридор: двери рядом
          td.say = 'А НЕТ, ТУДА!'; td.sayT = 1.2; this.sfx('roar');
        }
        break;
      }
      case 'feint': if (td.t <= 0) td.state = 'walk'; break;
      case 'blocked':
        if (td.t <= 0) { if (td.blocks >= td.need) { td.state = 'win'; td.t = 1.0; td.say = 'ВСЁ, ВСЁ, ПОНЯЛ…'; td.sayT = 1.6; } else this.tdPickLane(); }
        break;
      case 'through': if (td.t <= 0) this.tdEnd(false); break;
      case 'win': if (td.t <= 0) this.tdEnd(true); break;
    }
  },
});
