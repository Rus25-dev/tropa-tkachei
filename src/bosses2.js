// ===== БОССЫ 2.0: три фазы, переходы, новые атаки и снаряды =====
// БАЛАНС. Подбирался ИИ-тестером (tools/bot.js table): мастерство 0.6 — 30–50 % побед, 0.95 — 70–90 %, бой 60–120 с.
// hp: [один игрок, двое]; pace — во сколько раз быстрее проходят паузы «ожидание» и «восстановление» (окна уязвимости короче).
const BAL = {
  hp: { boss: [330, 460], vladik: [480, 672], tima: [520, 728], misha: [14, 20] },
  pace: { boss: 1.8, vladik: 1.1, tima: 3.2, misha: 3.2 },
  silkEvery: 2, // нить копится с каждого N-го удара по боссу
};
const PHASE_LINES = {
  'Корнематка': { 2: 'споры чаще, корни из-под земли', 3: 'двойные прыжки и волны корней' },
  'Владик Скрипка': { 2: 'нотный стан и выпады смычком', 3: 'крещендо: ноты падают с потолка' },
  'Тима Пиво': { 2: 'коллекторы выходят на охоту', 3: 'ачивки падают сверху, комбо приставкой' },
};

Object.assign(GameScene.prototype, {
  phaseOf(b) { const f = b.hp / b.maxHp; return f <= 0.3 ? 3 : f <= 0.6 ? 2 : 1; },
  // вызывается после урона: если перешли порог — рёв, неуязвимость, отталкивание
  checkPhase(b, name) {
    const ph = this.phaseOf(b);
    if (b.hp > 0 && ph > (b.phase || 1)) { b.phase = ph; this.phaseShift(b, name, ph); return true; }
    return false;
  },
  phaseShift(b, name, ph) {
    b.state = 'rage'; b.t = 1.3; b.vx = 0;
    this.sfx('roar'); this.shake(700, 0.012); this.flashAll();
    const cx = Math.round(b.x + b.w / 2);
    this.knockFrom(cx); this.sendEv({ k: 'kb', x: cx });
    for (const pr of this.projs) if (pr.kind !== 'bomb') pr.dead = true;
    const line = PHASE_LINES[name] && PHASE_LINES[name][ph];
    this.toastAll(`${name} — фаза ${ph}${line ? ': ' + line : ''}`);
  },
  knockFrom(cx) {
    for (const p of this.players) if (!p.remote && !p.downed) { const d = Math.sign(p.x + 7 - cx) || 1; p.kbx = d * 430; p.vy = -380; p.hurtT = 0.22; p.inv = Math.max(p.inv, 0.6); }
  },
  flashAll() { this.cameras.main.flash(260, 255, 240, 220); if (this.online === 'host') this.sendEv({ k: 'flash' }); },
  bossPhaseForMusic() {
    const b = this.testBoss() || (this.boss && !['sleep', 'gone', 'dead'].includes(this.boss.state) ? this.boss : null);
    return b && b.maxHp ? this.phaseOf(b) : 1;
  },

  // ----- новые снаряды -----
  stepExtraProj(pr, dt) {
    switch (pr.kind) {
      case 'rain':
        pr.y += pr.vy * dt;
        if (this.isSolid(Math.floor((pr.x + 11) / T), Math.floor((pr.y + 26) / T))) { pr.dead = true; if (this.paper) this.paperAt(5, pr.x + 11, pr.y + 20); }
        return true;
      case 'collector': {
        pr.hitCd = (pr.hitCd || 0) - dt;
        const [tp] = this.nearestPlayer(pr.x + 11, pr.y + 11);
        if (pr.kbT > 0) pr.kbT -= dt;
        else if (tp) { const d = Math.sign(tp.x + 7 - (pr.x + 11)) || 1; pr.face = d; pr.vx += (d * pr.spd - pr.vx) * Math.min(1, dt * 6); }
        pr.vy = Math.min(pr.vy + P.G * dt, P.MAXFALL);
        this.moveBody(pr, dt);
        if ((pr.hitL || pr.hitR) && pr.onGround) pr.vy = -420;
        return true;
      }
      case 'trophy':
        pr.vy = Math.min(pr.vy + 1100 * dt, 820); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        if (this.isSolid(Math.floor((pr.x + 15) / T), Math.floor((pr.y + 30) / T)) && pr.vy > 0) {
          pr.y = Math.floor((pr.y + 30) / T) * T - 30; this.dustAt(8, pr.x + 15, pr.y + 30); this.sfx('glass');
          if (pr.bounces-- > 0) { pr.vy = -320; pr.vx = (Math.random() - 0.5) * 300; } else pr.dead = true;
        }
        return true;
      case 'echo': // призрак Владика: бежит вдоль пола и исчезает за дальней стеной
        pr.x += pr.vx * dt;
        if ((pr.vx < 0 && pr.x < T - 60) || (pr.vx > 0 && pr.x + pr.w > (this.L.W - 1) * T + 60)) pr.dead = true;
        return true;
      case 'roller': // печатный валик Миши: до дальней стены и обратно, потом гаснет
        pr.x += pr.vx * dt;
        if ((pr.x < T && pr.vx < 0) || (pr.x + pr.w > (this.L.W - 1) * T && pr.vx > 0)) {
          pr.vx = -pr.vx; pr.x = clamp(pr.x, T, (this.L.W - 1) * T - pr.w); pr.rev = (pr.rev || 0) + 1; this.shake(160, 0.006); this.sfx('slam');
          if (pr.rev >= 2) pr.dead = true;
        }
        if (Math.random() < 0.4) this.dust.explode(1, pr.x + pr.w / 2, pr.y + pr.h);
        return true;
      case 'rootspike': case 'staff': case 'staffghost': case 'mark': return true; // неподвижны: живут свой срок после предупреждения
    }
    return false;
  },
  hitCollector(pr, dir) {
    if ((pr.hitCd || 0) > 0) return;
    pr.hitCd = 0.22; pr.hp--; pr.flash = 0.1; pr.kbT = 0.18; pr.vx = dir * 300; pr.vy = -240; this.sfx('hit');
    if (pr.hp <= 0) { pr.dead = true; this.sfx('coin'); this.burst(12, pr.x + 11, pr.y + 11, 0xffd47a); }
  },
  drawExtraProjs(now) {
    const fx = this.fx, fb = this.fxBack;
    for (const pr of this.projs) {
      if (pr.kind === 'rootspike') {
        const fy = pr.y + pr.h;
        if (pr.delay > 0) {
          fb.fillStyle(0x3b2a1c, 0.8); fb.fillEllipse(pr.x + 18, fy - 2, 46, 10);
          fb.lineStyle(2, 0x8a5a2c, 0.6 + Math.sin(now * 30) * 0.3);
          for (let i = 0; i < 4; i++) fb.lineBetween(pr.x + 18, fy - 2, pr.x + 18 + Math.cos(i * 1.6) * 20, fy - 2 + Math.sin(i * 1.6) * 4);
        } else {
          const k = Math.min(1, (0.55 - pr.life) / 0.08 + 0.2), hh = pr.h * k;
          fx.fillStyle(0x4a3220, 1); fx.fillTriangle(pr.x + 2, fy, pr.x + 34, fy, pr.x + 18, fy - hh);
          fx.fillStyle(0x7a5434, 1); fx.fillTriangle(pr.x + 6, fy, pr.x + 18, fy, pr.x + 18, fy - hh);
          fx.fillStyle(0x3b7448, 1); fx.fillTriangle(pr.x + 10, fy - hh * 0.4, pr.x + 4, fy - hh * 0.55, pr.x + 12, fy - hh * 0.48);
        }
      } else if (pr.kind === 'staff') {
        const y = pr.y + 5;
        if (pr.delay > 0) {
          fx.lineStyle(3, 0xff9a7a, 0.4 + Math.sin(now * 16) * 0.2); fx.lineBetween(pr.x, y, pr.x + pr.w, y);
          fx.fillStyle(0xf4efe0, 0.35); for (let x = pr.x + 40; x < pr.x + pr.w; x += 120) fx.fillEllipse(x, y, 7, 5);
        } else {
          fx.lineStyle(10, 0xffd47a, 0.25); fx.lineBetween(pr.x, y, pr.x + pr.w, y);
          fx.lineStyle(4, 0xfff6d8, 0.95); fx.lineBetween(pr.x, y, pr.x + pr.w, y);
          fx.fillStyle(0xffd47a, 1); for (let x = pr.x + 40 + ((now * 300) % 120); x < pr.x + pr.w; x += 120) { fx.fillEllipse(x, y, 9, 7); fx.fillRect(x + 3, y - 14, 2, 14); }
        }
      } else if (pr.kind === 'mark') { // метка падения: сужающееся кольцо на полу
        const fy = this.L.floorY * T, k = Math.max(0, pr.life / 1.3), r = 24 + 40 * k;
        fb.fillStyle(0xff5a4a, 0.28 + Math.sin(now * 22) * 0.12); fb.fillEllipse(pr.x, fy - 2, r * 2, 14);
        fb.lineStyle(3, 0xffd47a, 0.9); fb.strokeEllipse(pr.x, fy - 2, r * 2, 14);
        fb.lineStyle(1.5, 0xff9a7a, 0.4 + Math.sin(now * 22) * 0.2); fb.lineBetween(pr.x, fy - 2, pr.x, 4 * T);
      } else if (pr.kind === 'roller') {
        const warn = pr.delay > 0, a = warn ? 0.3 + Math.sin(now * 20) * 0.12 : 1, cx = pr.x + 23, cy = pr.y + 26, f = pr.vx > 0 ? 1 : -1;
        fx.fillStyle(0x23262e, a); fx.fillRoundedRect(pr.x, pr.y, 46, 52, 14);
        fx.fillStyle(0x3a4560, a); fx.fillRoundedRect(pr.x + 4, pr.y + 4, 38, 44, 11);
        fx.fillStyle(0xf4efe0, a * 0.8); for (let i = 0; i < 4; i++) fx.fillRect(pr.x + 10 + i * 8 - ((pr.x * 0.4) % 8), pr.y + 10, 3, 32);
        fx.lineStyle(3, 0xc9a227, a); fx.strokeCircle(cx, cy, 6);
        if (warn) { fx.fillStyle(0xff9a7a, 0.5 + Math.sin(now * 20) * 0.2); for (let k = 0; k < 4; k++) { const ax = cx + f * (46 + k * 30); fx.fillTriangle(ax, cy + 20, ax - f * 12, cy + 12, ax - f * 12, cy + 28); } }
      } else if (pr.kind === 'staffghost') {
        fx.lineStyle(1, 0xf4efe0, 0.12); fx.lineBetween(pr.x, pr.y + 5, pr.x + pr.w, pr.y + 5);
      } else if (pr.kind === 'collector') {
        const x = pr.x + 11, fy = pr.y + 22, f = pr.face || 1, fl = pr.flash > 0;
        if (pr.flash > 0) pr.flash -= 1 / 60;
        fx.lineStyle(2, 0x15161c, 1); const leg = Math.sin(now * 20 + x) * 2; fx.lineBetween(x - 4, fy - 6, x - 4 + leg, fy); fx.lineBetween(x + 4, fy - 6, x + 4 - leg, fy);
        fx.fillStyle(fl ? 0xffffff : 0x2c2f38, 1); fx.fillEllipse(x, fy - 11, 20, 16);
        fx.fillStyle(0xf4efe0, 1); fx.fillTriangle(x + 2 * f, fy - 18, x + 8 * f, fy - 18, x + 5 * f, fy - 10);
        fx.fillStyle(0xd23a2a, 1); fx.fillRect(x + 4 * f - 1, fy - 17, 2, 6);
        fx.fillStyle(fl ? 0xffffff : 0x3a3f48, 1); fx.fillCircle(x + 6 * f, fy - 22, 6);
        fx.fillStyle(0xffd47a, 1); fx.fillCircle(x + 8 * f, fy - 23, 1.6);
        fx.fillStyle(0x6b3d14, 1); fx.fillRect(x - 13 * f - 4, fy - 9, 8, 7);
      } else if (pr.kind === 'trophy') {
        const x = pr.x + 15, y = pr.y;
        if (pr.delay > 0) { fx.fillStyle(0xffd47a, 0.35 + Math.sin(now * 20) * 0.15); fx.fillEllipse(x, this.L.floorY * T - 2, 40, 10); continue; }
        fx.fillStyle(0xffd47a, 1); fx.fillRect(x - 10, y + 24, 20, 6); fx.fillRect(x - 3, y + 16, 6, 9);
        fx.fillStyle(0xf2c14e, 1); fx.beginPath(); fx.arc(x, y + 6, 12, 0, Math.PI, false); fx.closePath(); fx.fillPath(); fx.fillRect(x - 12, y, 24, 7);
        fx.lineStyle(2, 0xffd47a, 1); fx.strokeCircle(x - 13, y + 7, 4); fx.strokeCircle(x + 13, y + 7, 4);
        fx.fillStyle(0xfff6d8, 0.9); fx.fillCircle(x - 4, y + 4, 2);
      }
    }
  },
});

// ===== ОГЛУШЕНИЕ (стойкость): серия ударов выбивает босса из равновесия =====
// Копится по 1 за удар и спадает, если не бить. Заполнилась — босс замирает на 1.6 с и получает двойной урон.
const POISE_MAX = { 1: 7, 2: 8, 3: 9 };
const STAGGER_T = 1.5;        // сколько босс стоит оглушённым
const EXEC_FRAC = 0.06;       // казнь снимает столько от полного здоровья босса
const KITS = [{ key: 'boss', name: 'Корнематка' }, { key: 'vladik', name: 'Владик Скрипка' }, { key: 'tima', name: 'Тима Пиво' }];
const RAW = {};              // исходные функции урона (без двойного урона и стойкости) — для казни
(function () {
  const proto = GameScene.prototype;
  proto.poiseAdd = function (b, n) {
    if (this.online === 'guest') return; // стойку считает только хост, гость получает её в снимке
    if (!b || b.poiseImmune > 0 || b.stagger > 0 || ['sleep', 'dead', 'gone', 'intro', 'rage'].includes(b.state)) return;
    b.poise = (b.poise || 0) + n; b.poiseT = 0;
    if (b.poise >= POISE_MAX[b.phase || 1]) {
      b.poise = 0; b.stagger = STAGGER_T; b.executed = false; b.flash = 0.1;
      this.sfx('stagger'); this.shake(200, 0.01); this.hitstop = 0.1;
      this.burst(24, b.x + b.w / 2, b.y + 10, 0xffd47a);
      this.toastAll(this._execHint ? 'Оглушён! Бей!' : 'Оглушён! Подойди и ударь вверх или вниз — казнь'); this._execHint = true;
      for (const pr of this.projs) if (pr.kind === 'spore' || pr.kind === 'letter') pr.dead = true;
    }
  };
  const bossOf = (sc, key) => (key === 'boss' ? sc.boss : sc[key]);
  for (const [stepFn, dmgFn, key, name] of [['stepBoss', 'damageBoss', 'boss', 'Корнематка'], ['stepVladik', 'damageVladik', 'vladik', 'Владик Скрипка'], ['stepTima', 'damageTima', 'tima', 'Тима Пиво']]) {
    const step = proto[stepFn], dmg = proto[dmgFn]; RAW[key] = dmg;
    proto[stepFn] = function (dt) {
      const b = bossOf(this, key);
      if (b && b.stagger > 0) {
        b.stagger -= dt; b.vx = 0; b.flash = Math.floor(b.stagger * 16) % 2 ? 0.05 : 0;
        b.vy = Math.min(b.vy + P.G * dt, P.MAXFALL); this.moveBody(b, dt);
        if (b.stagger <= 0) { b.state = 'idle'; b.t = 0.45; b.poiseImmune = 5; }
        return;
      }
      step.call(this, dt);
      if (b) { b.poiseImmune = Math.max(0, (b.poiseImmune || 0) - dt); b.poiseT = (b.poiseT || 0) + dt; if (b.poiseT > 1.4 && b.poise > 0) { b.poise--; b.poiseT = 0; } }
    };
    proto[dmgFn] = function (p) {
      const b = bossOf(this, key);
      const live = b && !['sleep', 'dead', 'gone', 'intro', 'rage'].includes(b.state);
      const was = b && b.hp;
      dmg.call(this, p);
      if (!live || b.hp <= 0 || b.hp === was) return;
      if (b.stagger > 0) {
        // двойной урон по оглушённому
        b.hp -= 1; this.ui().bossBar(true, name, Math.max(0, b.hp) / b.maxHp);
        this.burst(8, b.x + b.w / 2, b.y + b.h / 2, 0xffd47a);
        if (b.hp <= 0) { dmg.call(this, p); }
        return;
      }
      this.poiseAdd(b, 1);
    };
  }

  // ----- звуки удара, шкала стойкости, казнь, смерть босса -----
  const bossOfKey = (sc, key) => (key === 'boss' ? sc.boss : sc[key]);
  proto.bossHitSnd = function (key, p) {
    const b = bossOfKey(this, key);
    if (b && b.stagger > 0) return 'hitCrit';
    if (p && p.heavy) return 'hitHeavy';
    return { boss: 'hitWood', vladik: 'hitString', tima: 'hitDull' }[key] || 'hit';
  };
  proto.packPoise = function (b) { return [Math.round((b.stagger || 0) * 100) / 100, b.poise || 0, b.phase || 1, b.executed ? 1 : 0]; };
  proto.unpackPoise = function (b, a) { if (!a) return; b.stagger = a[0]; b.poise = a[1]; b.phase = a[2]; b.executed = !!a[3]; };
  proto.execKit = function (key) { return KITS.find((k) => k.key === key); };
  proto.execTarget = function (p) {
    for (const kit of KITS) {
      const b = bossOfKey(this, kit.key);
      if (!b || !(b.stagger > 0.2) || b.executed || ['dead', 'gone', 'sleep', 'intro'].includes(b.state)) continue;
      if (Math.abs(b.x + b.w / 2 - (p.x + 7)) < b.w / 2 + 74 && p.y + 26 > b.y - 24 && p.y < b.y + b.h) return kit;
    }
    return null;
  };
  // казнь: удар вверх или вниз рядом с оглушённым боссом (вызывает игрок, который бьёт)
  proto.tryExecute = function (p, dir) {
    const kit = this.execTarget(p); if (!kit) return false;
    const b = bossOfKey(this, kit.key);
    p.face = Math.sign(b.x + b.w / 2 - (p.x + 7)) || p.face;
    p.execT = 0.42; p.execDir = dir; p.atkCd = 0.6; p.atkT = 0; p.dashT = 0; p.comboT = 0; p.inv = Math.max(p.inv, 0.55); p.kbx = 0;
    p.vx = 0; p.vy = dir === 'u' ? -320 : -140; p.canDash = true;
    if (this.auth()) this.execBoss(p, kit, dir); else this.sendEv({ k: 'exec', i: p.i, key: kit.key, d: dir });
    return true;
  };
  proto.execBoss = function (p, kit, dir) {
    const b = bossOfKey(this, kit.key);
    if (!b || !(b.stagger > 0.15) || b.executed || ['dead', 'gone'].includes(b.state)) return;
    b.executed = true;
    const n = Math.max(4, Math.round(b.maxHp * EXEC_FRAC)), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (p.remote) { p.execT = 0.42; p.execDir = dir; }
    this.sendEv({ k: 'execfx', i: p.i, d: dir, x: Math.round(cx), y: Math.round(cy) });
    this.execFxLocal(cx, cy, dir);
    this.sfx('exec'); this.shake(420, 0.018); this.hitstop = 0.22;
    // урон без шума: n ударов исходной функцией, нить за них не копится — вместо этого фиксированный бонус
    this.quiet = true; p.noSilkGain = true;
    for (let i = 0; i < n && b.hp > 0 && !['dead', 'gone', 'rage'].includes(b.state); i++) RAW[kit.key].call(this, p);
    this.quiet = false; p.noSilkGain = false;
    if (p.remote) { for (let i = 0; i < 3; i++) this.sendEv({ k: 'silk', i: p.i }); } else p.silk = Math.min(P.SILK, p.silk + 3);
    if (b.hp > 0) { b.stagger = Math.min(b.stagger, 0.4); b.poise = 0; b.poiseImmune = 6; }
  };
  proto.execFxLocal = function (x, y, dir) {
    this.parts.setParticleTint(0xffd47a); this.parts.explode(34, x, y);
    this.parts.setParticleTint(0xffffff); this.parts.explode(18, x, y);
    this.cameras.main.flash(140, 255, 245, 215);
    const t = this.add.text(x, y - 52, 'КАЗНЬ!', { fontFamily: '"Cormorant SC", Georgia, serif', fontSize: '34px', fontStyle: '700', color: '#ffe3a3', stroke: '#1a1410', strokeThickness: 6 }).setOrigin(0.5).setDepth(8.8);
    this.tweens.add({ targets: t, y: y - 104, alpha: 0, scale: 1.4, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  };
  // смерть босса: замедление времени и белая вспышка
  proto.bossDeathFx = function () { this.deathFxLocal(); this.sendEv({ k: 'deathfx' }); };
  proto.deathFxLocal = function () {
    this.slowDur = 1.7; this.slowT = 1.7;
    this.cameras.main.flash(700, 255, 250, 235);
    Snd.play('bossdie');
  };
  // тонкая шкала стойкости над боссом: видна, только пока стойкость копится или босс оглушён
  proto.drawPoiseBars = function (now) {
    const fx = this.fx;
    for (const [b, dy, w] of [[this.boss, -24, 76], [this.vladik, -28, 70], [this.tima, -13, 70]]) {
      if (!b || ['dead', 'gone', 'sleep', 'intro'].includes(b.state) || b.y < -50) continue;
      const pz = b.poise || 0, sg = b.stagger || 0;
      if (pz <= 0 && sg <= 0) continue;
      const mx = POISE_MAX[b.phase || 1], x = b.x + b.w / 2 - w / 2, y = b.y + dy, h = 6;
      fx.fillStyle(0x0b0f0e, 0.7); fx.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 3);
      if (sg > 0) {
        const pulse = 0.65 + Math.sin(now * 22) * 0.35;
        fx.fillStyle(0xff6a4a, pulse); fx.fillRect(x, y, w * Math.min(1, sg / STAGGER_T), h);
        fx.lineStyle(1.5, 0xffd47a, pulse); fx.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 3);
      } else {
        const f = Math.min(1, pz / mx);
        fx.fillStyle(f > 0.7 ? 0xffa23c : 0xffd47a, 1); fx.fillRect(x, y, w * f, h);
        fx.lineStyle(1, 0x0b0f0e, 0.8); for (let i = 1; i < mx; i++) fx.lineBetween(x + (w * i) / mx, y, x + (w * i) / mx, y + h);
      }
    }
  };
})();
