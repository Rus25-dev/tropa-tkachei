// ===== ДВИЖЕНИЕ 2: хват за уступ, планер «Паутинный парус», стенное скольжение =====
// Хват врождённый (abil.ledge !== false). Планер: abil.glide (награда за Владика; в босс-тесте и босс-раше доступен сразу).
// Явное abil.ledge = false / abil.glide = false выключает механику (так бот держит свою модель физики).
const MV2 = {
  GLIDE_V: 120,       // скорость падения на планере, px/с
  GLIDE_DEC: 3000,    // как быстро гасим разгон при раскрытии паруса
  GLIDE_HOLD: 0.1,    // сколько держать прыжок в падении, чтобы раскрыть парус
  CLIMB_T: 0.2,       // подтягивание на уступ
  hasLedge(sc) { return !!sc.abil && sc.abil.ledge !== false; },
  hasGlide(sc) {
    const a = sc.abil || {}; if (a.glide === false) return false;
    return !!a.glide || sc.mode === 'bosstest' || !!(sc.sr && sc.sr.cat === 'boss');
  },
  tileFree(sc, tx, ty) { return sc.tileAt(tx, ty) === EMPTY; },
  // уступ сбоку (side = ±1): верхняя кромка тайла между головой и грудью героя, над ней свободно
  findLedge(sc, p, side) {
    const edge = side > 0 ? p.x + p.w : p.x;
    const tx = side > 0 ? Math.floor((edge + 3) / T) : Math.floor((edge - 3) / T);
    const dist = side > 0 ? tx * T - edge : edge - (tx + 1) * T; // зазор до тайла
    if (dist > 3 || dist < -6) return null;
    const ty = Math.ceil((p.y - 4) / T), top = ty * T;
    if (top > p.y + 14) return null;
    const t = sc.tileAt(tx, ty);
    if (t !== SOLID && t !== PLAT) return null;
    if (!this.tileFree(sc, tx, ty - 1)) return null; // над кромкой шип, камень или платформа
    if (side > 0 ? sc.tileAt(tx - 1, ty) === SOLID : sc.tileAt(tx + 1, ty) === SOLID) { /* кромка внутри массива — не уступ */ return null; }
    const hx = side > 0 ? tx * T - p.w : (tx + 1) * T, hy = top + 6;
    const r = { x: hx, y: hy, w: p.w, h: p.h };
    if (sc.solidRect(r) || sc.rectHitsTile(r, SPIKE, 1)) return null;
    const sx = side > 0 ? tx * T + 2 : (tx + 1) * T - p.w - 2, sy = top - p.h;
    if (sc.solidRect({ x: sx, y: sy, w: p.w, h: p.h })) return null; // наверху нет места
    return { side, tx, ty, top, hx, hy, sx, sy, climb: 0, away: 0 };
  },
  grab(sc, p, L) {
    p.ledge = L; p.ledgeDir = L.side; p.x = L.hx; p.y = L.hy; p.vx = p.vy = 0; p.kbx = 0; p.face = L.side;
    p.dashT = 0; p.canDash = true; p.usedDouble = false; p.gliding = false; p.jumpBuf = 0; p.onGround = false;
    p.ledgeUp = !!(p.inp && p.inp.up);
    Snd.hiss(0.07, 0.07, 700, 1); sc.dust.explode(3, L.side > 0 ? L.tx * T : (L.tx + 1) * T, L.top);
  },
  release(p, cd) { p.ledge = null; p.ledgeDir = 0; p.ledgeCd = cd == null ? 0.25 : cd; },
  rawStep: null,
};

(function () {
  const proto = GameScene.prototype;
  const stepO = proto.stepPlayer, packO = proto.packPlayer, netO = proto.onNet, fxO = proto.drawPlayerFx, vdieO = proto.vladikDie;
  const NOIN = { up: false, down: false, left: false, right: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false, jumpP: false, atkP: false, dashP: false, healP: false, upP: false, bombP: false, toolP: false };

  proto.stepPlayer = function (p, dt) {
    if (p.remote) return stepO.call(this, p, dt);
    const inp = p.inp || {}, dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    p.ledgeCd = (p.ledgeCd || 0) - dt; p.wgr = (p.wgr || 0) - dt; p.wsT = (p.wsT || 0) - dt; p.wsSnd = (p.wsSnd || 0) - dt; p.glT = (p.glT || 0) - dt;
    let L = p.ledge;
    // сбросить хват, если герой ранен, упал, лечится или его унесло (возрождение, телепорт)
    if (L && (p.downed || p.hurtT > 0 || p.healCh > 0 || p.sit || (!L.climb && (Math.abs(p.x - L.hx) > 3 || Math.abs(p.y - L.hy) > 3)))) { MV2.release(p, 0.2); L = null; }
    if (L) {
      let leave = false;
      if (L.climb > 0) {
        // подтягивание: сначала вверх, потом на кромку
        L.climb += dt;
        const k = Math.min(1, L.climb / MV2.CLIMB_T), ky = 1 - (1 - Math.min(1, k / 0.65)) ** 2, kx = Math.max(0, Math.min(1, (k - 0.45) / 0.55));
        p.inv = Math.max(p.inv, 0.25);
        const sv = p.inp; p.inp = NOIN; stepO.call(this, p, dt); p.inp = sv;
        p.x = L.hx + (L.sx - L.hx) * kx; p.y = L.hy + (L.sy - L.hy) * ky; p.vx = p.vy = 0; p.onGround = false;
        if (k >= 1) { p.x = L.sx; p.y = L.sy; p.coyote = P.COYOTE; MV2.release(p, 0.2); p.landT = 0.05; this.dust.explode(4, p.x + 7, p.y + 26); Snd.play('land'); }
        p.ledgeUp = !!inp.up; return;
      }
      const upEdge = inp.up && !p.ledgeUp; p.ledgeUp = !!inp.up;
      if (inp.jumpP && dir === -L.side) { // спрыгнуть от стены
        MV2.release(p, 0.3); p.vy = -P.WJY * 0.95; p.vx = -L.side * P.WJX; p.face = -L.side; p.wjLock = P.WJLOCK; p.jumpCut = false; p.jumpBuf = 0;
        Snd.play('jump'); leave = true;
      } else if (inp.jumpP || upEdge) {
        L.climb = 0.0001; Snd.play('jump'); this.parts.setParticleTint(p.pal.accent); this.parts.explode(5, p.x + 7, p.y + 4);
      } else if (inp.down) { MV2.release(p, 0.3); p.vy = 40; leave = true; }
      else if (inp.dashP || p.dashBuf > 0) { MV2.release(p, 0.3); p.face = -L.side; if (inp.dashP) p.dashBuf = P.DASHBUF; leave = true; }
      else {
        L.away = dir === -L.side ? L.away + dt : 0;
        if (L.away > 0.3) { MV2.release(p, 0.3); p.vy = 40; leave = true; }
      }
      if (!leave) {
        // висим: ввод заморожен (кроме удара вперёд), позиция фиксирована
        const sv = p.inp; p.inp = { ...NOIN, atk: !!inp.atk, atkP: !!inp.atkP };
        stepO.call(this, p, dt); p.inp = sv;
        p.x = L.hx; p.y = L.hy; p.vx = p.vy = 0; p.onGround = false; p.face = L.side;
        if (Math.random() < dt * 4) this.dust.explode(1, L.side > 0 ? p.x + 14 : p.x, p.y);
        return;
      }
      p.ledge = null;
    }
    // ----- до основного шага -----
    // рывок от стены, если стик не нажат
    if (!p.onGround && !dir && p.dashCd <= 0 && p.canDash && (inp.dashP || p.dashBuf > 0)) {
      const sd = this.touchWall(p, 1) ? 1 : this.touchWall(p, -1) ? -1 : 0;
      if (sd) p.face = -sd;
    }
    // планер: гасим разгон падения
    const glideOn = !!p.gliding;
    if (glideOn && p.vy > MV2.GLIDE_V) p.vy = Math.max(MV2.GLIDE_V, p.vy - MV2.GLIDE_DEC * dt);
    stepO.call(this, p, dt);
    // ----- после -----
    const hasG = MV2.hasGlide(this), air = !p.onGround;
    // стенное скольжение: задержка после отпускания стика, дрейф от стены, «ладони» и звук
    if (p.wallDir !== 0 && air) { p.wgr = 0.14; p.wgSide = p.wallDir; }
    let sliding = p.wallDir !== 0 && air && p.vy > 30;
    if (!sliding && p.wgr > 0 && air && p.vy > P.WSLIDE && p.hurtT <= 0 && p.dashT <= 0 && p.wjLock <= 0 && p.vy > 0 &&
      (dir === -p.wgSide || (!dir && this.touchWall(p, p.wgSide)))) { p.vy = P.WSLIDE; sliding = !dir; }
    if (sliding) {
      const hx = (p.wallDir || p.wgSide) > 0 ? p.x + p.w : p.x;
      if (p.wsT <= 0) { p.wsT = 0.07; this.dust.explode(1, hx, p.y + 6 + Math.random() * 4); }
      if (p.wsSnd <= 0) { p.wsSnd = 0.2; Snd.hiss(0.1, 0.035, 1500 + Math.random() * 400, 1.2); }
    }
    // хват за уступ
    if (!p.ledge && MV2.hasLedge(this) && air && p.vy > 0 && p.ledgeCd <= 0 && (dir === 1 || dir === -1) &&
      p.hurtT <= 0 && p.dashT <= 0 && p.atkT <= 0 && !(p.healCh > 0) && !p.sit && !p.downed && p.wjLock <= 0 && !(p.execT > 0)) {
      const L2 = MV2.findLedge(this, p, dir);
      if (L2) { MV2.grab(this, p, L2); p.gliding = false; return; }
    }
    // планер
    if (!hasG || p.onGround || !inp.jump) { p.glideOff = false; p.glideHold = 0; p.gliding = false; }
    else {
      const ok = p.vy >= 0 && !p.glideOff && p.hurtT <= 0 && p.dashT <= 0 && !p.wallDir && !(p.healCh > 0) && !p.downed &&
        (p.usedDouble || !this.abil.double);
      if (p.atkT > 0 || p.hurtT > 0 || p.dashT > 0) p.glideOff = true; // удар, урон, рывок обрывают планирование до следующего нажатия
      if (!ok || p.glideOff) { p.gliding = false; p.glideHold = 0; }
      else if (p.gliding) { if (p.vy > MV2.GLIDE_V) p.vy = MV2.GLIDE_V; }
      else {
        p.glideHold = (p.glideHold || 0) + dt;
        if (p.glideHold >= MV2.GLIDE_HOLD && p.vy >= 20) {
          p.gliding = true; p.glT = 0; Snd.hiss(0.18, 0.06, 900, 0.7);
          this.parts.setParticleTint(p.pal.accent); this.parts.explode(8, p.x + 7, p.y - 6);
        }
      }
    }
    if (p.gliding && p.glT <= 0) { p.glT = 0.12; this.dust.explode(1, p.x + 7 + (Math.random() - 0.5) * 20, p.y - 10); }
    if (p.hurtT > 0 || p.downed) p.gliding = false;
  };

  // ----- сеть: поза удалённого героя -----
  proto.packPlayer = function (p) {
    const o = packO.call(this, p);
    o.lg = p.ledge ? p.ledge.side : 0; o.gl = p.gliding ? 1 : 0;
    return o;
  };
  proto.onNet = function (m) {
    netO.call(this, m);
    if (m && m.t === 'p' && this.players) { const p = this.players[m.i]; if (p && p.remote) { p.ledgeDir = m.lg | 0; p.gliding = !!m.gl; } }
  };

  // ----- отрисовка поз: висение на уступе (руки вверх) и парус планера -----
  proto.drawPlayerFx = function (p, g) {
    fxO.call(this, p, g);
    if (p.downed) return;
    const ld = p.remote ? (p.ledgeDir | 0) : (p.ledge ? p.ledge.side : 0);
    if (ld) {
      const climb = p.ledge && p.ledge.climb > 0;
      g.lineStyle(2.4, 0x1a1414, 1); g.lineBetween(0, -17, ld * 8, climb ? -24 : -22);
      g.lineBetween(ld * 2, -17, ld * 9, climb ? -26 : -23);
      g.fillStyle(MASK, 1); g.fillCircle(ld * 8.5, climb ? -24 : -22, 2.2);
      g.fillStyle(p.pal.accent, 0.55); g.fillCircle(ld * 9, -21, 4);
    }
    if (p.gliding) {
      const fl = Math.sin((this.animT || 0) * 9) * 1.5;
      g.fillStyle(p.pal.accent, 0.28);
      g.fillPoints([{ x: -19, y: -44 }, { x: -11, y: -57 + fl }, { x: 0, y: -61 }, { x: 11, y: -57 - fl }, { x: 19, y: -44 }, { x: 9, y: -47 }, { x: 0, y: -45 }, { x: -9, y: -47 }], true);
      g.lineStyle(1.4, 0xf4f1e6, 0.85);
      g.lineBetween(-19, -44, -2, -22); g.lineBetween(19, -44, 2, -22); g.lineBetween(0, -45, 0, -26);
      g.beginPath(); g.moveTo(-19, -44); g.lineTo(-11, -57 + fl); g.lineTo(0, -61); g.lineTo(11, -57 - fl); g.lineTo(19, -44); g.strokePath();
    }
  };

  // ----- награда: «Паутинный парус» за Владика -----
  proto.vladikDie = function (...a) {
    const first = !this.abil.glide && this.abil.glide !== false;
    if (first) {
      this.abil.glide = true;
      if (!this.sr && this.online !== 'guest' && this.mode !== 'bosstest') {
        try { Settings.saveProgress({ ...(Settings.progress() || { bench: 0, beads: this.beads }), abil: this.abil }); } catch (_) { }
      }
      if (this.mode !== 'bosstest' || this.camp) this.ui().toast('Паутинный парус: держи прыжок в падении — планируй', 5);
    }
    return vdieO.apply(this, a);
  };
})();
