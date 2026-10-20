// ===== БОССЫ 2.0: три фазы, переходы, новые атаки и снаряды =====
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
      case 'rootspike': case 'staff': case 'staffghost': return true; // неподвижны: живут свой срок после предупреждения
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
const POISE_MAX = { 1: 6, 2: 7, 3: 8 };
(function () {
  const proto = GameScene.prototype;
  proto.poiseAdd = function (b, n) {
    if (!b || b.poiseImmune > 0 || b.stagger > 0 || ['sleep', 'dead', 'gone', 'intro', 'rage'].includes(b.state)) return;
    b.poise = (b.poise || 0) + n; b.poiseT = 0;
    if (b.poise >= POISE_MAX[b.phase || 1]) {
      b.poise = 0; b.stagger = 1.6; b.flash = 0.1;
      this.sfx('slam'); this.shake(200, 0.01); this.hitstop = 0.1;
      this.burst(24, b.x + b.w / 2, b.y + 10, 0xffd47a);
      this.toastAll('Оглушён! Бей!');
      for (const pr of this.projs) if (pr.kind === 'spore' || pr.kind === 'letter') pr.dead = true;
    }
  };
  const bossOf = (sc, key) => (key === 'boss' ? sc.boss : sc[key]);
  for (const [stepFn, dmgFn, key, name] of [['stepBoss', 'damageBoss', 'boss', 'Корнематка'], ['stepVladik', 'damageVladik', 'vladik', 'Владик Скрипка'], ['stepTima', 'damageTima', 'tima', 'Тима Пиво']]) {
    const step = proto[stepFn], dmg = proto[dmgFn];
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
})();
