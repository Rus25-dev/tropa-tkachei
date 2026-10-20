// ===== ОРУЖИЕ: пять клинков, заряженный удар, воздушные цепочки, отрисовка =====
// Реестр WEAPONS живёт в loadout.js; здесь — записи оружия и вся механика, которой не было у иглы.
// Запись оружия, кроме полей loadout.js: pm (множитель вклада в стойкость босса), kb (отбрасывание цели), recoil (отдача героя),
// hs (хит-стоп), noPogo (не отскакивает при ударе вниз), cutAll (рубит и летящие снаряды), geo (размеры коробки удара),
// col (цвет), sw (особые удары: a1/a2 — воздух, f — финишер, c — заряженный).
// Урон W.dmg применяется к обычным врагам и боссам через обёртки damageEnemy/damageBoss/damageVladik/damageTima
// (только пока идёт resolveAttack героя): всполох, казнь (RAW), бомбы и отбив W.dmg не затрагивают.
// Баланс: общий урон/с по боссу у всех клинков подогнан к игле (≈4,3 урона/с при постоянных попаданиях), проверка — tools/weapons_dps.js.
(function () {
  const proto = GameScene.prototype;
  const CH_T = 0.45;      // сколько держать удар до заряженного
  const CH_SHOW = 0.16;   // с какого момента герой светится и замедляется
  const CH_SLOW = 0.45;   // множитель скорости бега при заряде
  const PI = Math.PI;

  // ---------- геометрия ----------
  const fr = (sw, cx, w, h, top, off) => { off = off == null ? 2 : off; return { x: sw.f0 > 0 ? cx + off : cx - off - w, y: top, w, h }; };
  const ctr = (cx, w, h, top) => ({ x: cx - w / 2, y: top, w, h });
  // длина волны до ближайшей стены
  const clipLen = (sc, x0, y, f, max) => {
    for (let d = 16; d <= max; d += 16) if (sc.isSolid(Math.floor((x0 + f * d) / T), Math.floor(y / T))) return Math.max(24, d - 16);
    return max;
  };
  const waveBox = (sc, p, sw, el) => { const L = Math.max(10, sw.len * Math.min(1, el / (sw.dur * 0.7))); return { x: sw.f0 > 0 ? sw.x0 + 6 : sw.x0 - 6 - L, y: sw.y0 - 30, w: L, h: 60 }; };
  const shockBox = (sc, p, sw, el) => { const half = 200 * Math.min(1, el / (sw.dur * 0.5)) + 10; return { x: sw.x0 - half, y: sw.fy - 40, w: half * 2, h: 46 }; };

  // ---------- реестр ----------
  Object.assign(WEAPONS.needle, {
    col: 0xf6f3e8, desc: 'Лёгкая и быстрая. Третий удар подряд — тяжёлый. В прыжке — взмах и разворот, с зарядом — волна.',
    sw: {
      a1: { t: 0.14, cd: 0.3, dm: 1.1, hits: 1, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(58 * rm), 46, cy - 36) },
      a2: { t: 0.14, cd: 0.3, dm: 1.1, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(60 * rm), 44, cy - 26) },
      c: { t: 0.5, cd: 0.5, tot: 4.6, hits: 2, noRecoil: true, snd: 'wave', start: (sc, p, sw) => { sw.len = clipLen(sc, sw.x0, sw.y0, sw.f0, 250); }, box: waveBox },
    },
  });
  WEAPONS.needle.onSwing = (sc, p) => begin(sc, p, WEAPONS.needle);

  WEAPONS.twin = {
    id: 'twin', name: 'Парные иглы', col: 0xb8ecff,
    desc: 'Очень быстрые, но короткие и слабо отбрасывают. Четвёртый удар — вихрь вокруг героя. С зарядом — шквал.',
    reach: 0.8, thick: 0.9, atkT: 0.08, cd: 0.11, combo: 4, comboWin: 0.4, finisher: true, finT: 0.22, finCd: 0.45, dmg: 0.69,
    pm: 0.65, kb: 0.4, recoil: 0.4, hs: 0.018, unlock: 'boss:misha',
    geo: { f: [40, 28, -14], fh: [96, 58, -29, 'c'], u: [34, 44, 40], d: [34, 40] },
    sw: {
      f: { hits: 2, snd: 'whirl' },
      a1: { t: 0.09, cd: 0.14, dm: 0.8, hits: 2, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(46 * rm), 38, cy - 20) },
      a2: { t: 0.12, cd: 0.2, dm: 1.15, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(80 * rm), 52, cy - 26) },
      c: { t: 0.56, cd: 0.45, tot: 4.8, hits: 1, pulses: 4, pulse: 0.13, noRecoil: true, snd: 'whirl', box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(116 * rm), 66, cy - 33) },
    },
    onSwing: (sc, p) => begin(sc, p, WEAPONS.twin),
  };
  WEAPONS.sickle = {
    id: 'sickle', name: 'Серп', col: 0xd9f2a8,
    desc: 'Длинная широкая дуга вверх-вперёд, рубит и летящие снаряды. Медленный замах. Заряд — «жатва» вокруг героя.',
    reach: 1.6, thick: 1.8, atkT: 0.2, cd: 0.52, combo: 2, comboWin: 0.9, finisher: true, finT: 0.24, finCd: 0.66, dmg: 1.62,
    pm: 1.6, kb: 1.15, recoil: 1, hs: 0.05, cutAll: true, unlock: 'boss:vladik',
    geo: { f: [80, 62, -46], fh: [102, 68, -50], u: [66, 70, 62], d: [40, 46] },
    sw: {
      f: { hits: 2, snd: 'reap' },
      a1: { t: 0.2, cd: 0.4, dm: 1.1, hits: 1, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(74 * rm), 66, cy - 12) },
      a2: { t: 0.2, cd: 0.45, dm: 1.1, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(128 * rm), 80, cy - 46) },
      c: { t: 0.34, cd: 0.5, tot: 4.8, hits: 2, noRecoil: true, cutAll: true, snd: 'reap', box: (sc, p, sw, el, rm, cx, cy) => ({ x: sw.f0 > 0 ? cx - 14 : cx + 14 - Math.round(168 * rm), y: cy - 104, w: Math.round(168 * rm), h: 132 }) },
    },
    onSwing: (sc, p) => begin(sc, p, WEAPONS.sickle),
  };
  WEAPONS.mace = {
    id: 'mace', name: 'Колотушка', col: 0xffc58a,
    desc: 'Очень медленная, зато каждый удар тяжёлый: огромный урон, втрое сильнее сбивает стойкость босса, ломает броню. Не отскакивает при ударе вниз. Заряд — удар оземь.',
    reach: 1, thick: 1.4, atkT: 0.22, cd: 0.7, combo: 1, comboWin: 0.6, finisher: false, finT: 0.22, finCd: 0.7, dmg: 3,
    pm: 3, kb: 1.8, recoil: 1.35, hs: 0.1, noPogo: true, unlock: 'shop:60',
    geo: { f: [58, 46, -26], u: [46, 52, 46], d: [48, 50] },
    sw: {
      g: { hits: 1, br: true, snd: 'hammer' },
      a1: { t: 0.24, cd: 0.6, dm: 1.0, hits: 1, br: true, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(58 * rm), 62, cy - 8) },
      a2: { t: 0.24, cd: 0.62, dm: 0.9, hits: 1, br: true, flip: true, box: (sc, p, sw, el, rm, cx, cy) => ctr(cx, Math.round(108 * rm), 58, cy - 30) },
      c: { t: 0.5, cd: 0.5, tot: 5.2, hits: 2, noRecoil: true, snd: 'quake', box: shockBox },
    },
    onSwing: (sc, p) => begin(sc, p, WEAPONS.mace),
  };
  WEAPONS.lance = {
    id: 'lance', name: 'Игла-копьё', col: 0xcfe6ff,
    desc: 'Колющий удар на огромную дистанцию вперёд, узкий и пробивает всех на линии. Третий выпад — ещё длиннее. Заряд — рывок-прокол.',
    reach: 2.8, thick: 0.4, atkT: 0.14, cd: 0.38, combo: 3, comboWin: 0.7, finisher: true, finT: 0.18, finCd: 0.62, dmg: 1.4,
    pm: 1.05, kb: 0.85, recoil: 0.5, hs: 0.04, unlock: 'shop:40',
    geo: { f: [138, 13, -8], fh: [188, 15, -9], u: [20, 76, 70], d: [22, 62] },
    sw: {
      f: { hits: 2, snd: 'lunge' },
      a1: { t: 0.14, cd: 0.34, dm: 1.1, hits: 1, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(104 * rm), 44, cy - 4) },
      a2: { t: 0.14, cd: 0.34, dm: 1.0, hits: 1, flip: true, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(126 * rm), 14, cy - 8) },
      c: { t: 0.26, cd: 0.5, tot: 4.8, hits: 2, noRecoil: true, snd: 'lunge', start: (sc, p, sw) => { p.kbx = sw.f0 * 1500; p.inv = Math.max(p.inv, 0.2); }, box: (sc, p, sw, el, rm, cx, cy) => fr(sw, cx, Math.round(216 * rm), 17, cy - 9, 0) },
    },
    onSwing: (sc, p) => begin(sc, p, WEAPONS.lance),
  };

  // ---------- начало удара ----------
  const mkSw = (W, k, p, dur) => {
    const e = W.sw && W.sw[k] || null;
    const hits = e && e.hits != null ? e.hits : (p.heavy ? 2 : 1);
    let dm = e && e.dm != null ? e.dm : 1;
    if (e && e.tot != null) dm = e.tot / (hits * (e.pulses || 1) * W.dmg);
    return { wid: W.id, k, e, hits, dm, f0: p.face, x0: p.x + p.w / 2, y0: p.y + p.h / 2, fy: p.y + p.h, dur, pulse: e && e.pulse || 0, pn: 0, cn: new Map(),
      pm: e && e.pm, cutAll: !!(e && e.cutAll), noRecoil: !!(e && e.noRecoil), len: 0 };
  };
  // вызывается из game.js сразу после того, как посчитаны atkT/atkCd/heavy; выбирает вид удара (земля / воздух / финишер)
  function begin(sc, p, W) {
    const d = p.atkDir;
    let k = 'g';
    if (!p.onGround && d === 'f') { p.airN = (p.airN || 0) + 1; k = p.airN === 1 ? 'a1' : p.airN === 2 ? 'a2' : 'g'; }
    if (k === 'g' && p.heavy) k = 'f';
    if ((k === 'a1' || k === 'a2') && !(W.sw && W.sw[k])) k = p.heavy ? 'f' : 'g';
    const e = W.sw && W.sw[k] || null;
    let back = 0;
    if (e) {
      if (e.flip) { back = -p.face; const inp = p.inp || {}; if (!inp.left && !inp.right) p.face = back; } // разворот: бьёт назад, без нажатия — герой разворачивается
      if (e.t != null) p.atkT = e.t;
      if (e.cd != null) p.atkCd = e.cd * (sc.cdMul ? sc.cdMul(p) : 1);
      if (e.hits != null) p.heavy = e.hits > 1 || !!e.br; else if (e.br) p.heavy = true;
      if (e.snd) Snd.play(e.snd);
    }
    if (W.noPogo && d === 'd') p.pogoed = true;
    p.sw = mkSw(W, k, p, p.atkT); p.swk = k;
    if (back) p.sw.f0 = back;
  }

  // ---------- заряженный удар ----------
  function fireCharge(sc, p, W) {
    const e = W.sw && W.sw.c; if (!e) return;
    p.atkDir = 'f'; p.combo = 0; p.comboT = 0; p.atkBuf = 0; p.swk = 'c';
    p.atkT = e.t; p.atkCd = e.cd * (sc.cdMul ? sc.cdMul(p) : 1); p.atkHits = new Set(); p.pogoed = true; p.seq = (p.seq || 0) + 1;
    p.sw = mkSw(W, 'c', p, e.t); p.heavy = true; p.chgWait = p.atkCd; // следующий заряд копится только после восстановления
    if (e.start) e.start(sc, p, p.sw);
    Snd.play(e.snd || 'slam'); sc.shake(220, 0.007 + (W.id === 'mace' ? 0.012 : 0));
    sc.parts.setParticleTint(W.col || 0xffffff); sc.parts.explode(16, p.x + 7 + p.face * 14, p.y + 16);
    if (W.id === 'mace') { sc.hitstop = Math.max(sc.hitstop || 0, 0.06); sc.dust.explode(12, p.x + 7, p.y + 26); }
  }
  function stopChargeSnd(p) { if (p.chgSnd) { try { p.chgSnd.stop(); } catch (_) { } p.chgSnd = null; } }
  function chargeTick(sc, p, dt) {
    if (p.remote) return;
    const inp = p.inp || {}, held = !!inp.atk, W = sc.wdef(p);
    p.chgWait = Math.max(0, (p.chgWait || 0) - dt);
    const ok = !p.downed && p.hurtT <= 0 && p.dashT <= 0 && !(p.healCh > 0) && !p.sit && !(p.execT > 0) && p.onGround && !sc.td;
    if (!held) {
      if ((p.chg || 0) >= CH_T && !p.chgLock && ok) fireCharge(sc, p, W);
      stopChargeSnd(p); p.chg = 0; p.chgLock = false; return;
    }
    if (p.chgLock || p.chgWait > 0) { p.chg = 0; return; }
    if (!ok || inp.dashP) { // рывок, урон, прыжок или лечение отменяют заряд до отпускания кнопки
      if ((p.chg || 0) > CH_SHOW) Snd.play('clink');
      stopChargeSnd(p); p.chg = 0; p.chgLock = true; return;
    }
    const was = p.chg || 0; p.chg = was + dt;
    if (was < CH_SHOW && p.chg >= CH_SHOW && Snd.chargeStart) p.chgSnd = Snd.chargeStart(CH_T - CH_SHOW, W.id);
    if (was < CH_T && p.chg >= CH_T) { Snd.play('chargeFull'); sc.parts.setParticleTint(0xffffff); sc.parts.explode(10, p.x + 7, p.y + 14); }
  }
  const stepPlayer = proto.stepPlayer;
  proto.stepPlayer = function (p, dt) {
    chargeTick(this, p, dt);
    if (p.onGround || p.wallDir) p.airN = 0;
    return stepPlayer.call(this, p, dt);
  };
  const speedMul = proto.speedMul;
  proto.speedMul = function (p) { const m = speedMul.call(this, p); return p && !p.remote && p.chg > CH_SHOW ? m * CH_SLOW : m; };

  // ---------- коробка удара ----------
  const atkBox0 = proto.atkBox;
  proto.atkBox = function (p) {
    const W = this.wdef(p), sw = p.sw, e = sw && sw.wid === W.id && sw.e;
    const rm = this.reachMul ? this.reachMul(p) : 1, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    if (e && e.box && p.atkDir === 'f') return e.box(this, p, sw, sw.dur - p.atkT, rm, cx, cy);
    const g = W.geo; if (!g) return atkBox0.call(this, p);
    if (p.atkDir === 'f') {
      const q = p.heavy && g.fh ? g.fh : g.f, w = Math.round(q[0] * rm);
      return q[3] === 'c' ? ctr(cx, w, q[1], cy + q[2]) : { x: p.face > 0 ? cx + 2 : cx - 2 - w, y: cy + q[2], w, h: q[1] };
    }
    if (p.atkDir === 'u') return { x: cx - g.u[0] / 2, y: p.y - Math.round(g.u[2] * rm), w: g.u[0], h: Math.round(g.u[1] * rm) };
    return { x: cx - g.d[0] / 2, y: p.y + p.h - 8, w: g.d[0], h: Math.round(g.d[1] * rm) };
  };

  // ---------- разрешение удара и урон ----------
  const EXTRA_CUT = new Set(['clef', 'drip', 'rock', 'trophy']);
  const resolveAttack = proto.resolveAttack;
  proto.resolveAttack = function (p) {
    if (p.downed || p.atkT <= 0 || !p.atkHits) return resolveAttack.call(this, p);
    const W = this.wdef(p);
    if (!p.sw || p.sw.wid !== W.id) p.sw = mkSw(W, 'g', p, p.atkT);
    const sw = p.sw;
    if (sw.pulse) { const n = Math.floor((sw.dur - p.atkT) / sw.pulse); if (n !== sw.pn) { sw.pn = n; p.atkHits = new Set(); sw.cn.clear(); } }
    const kb0 = p.kbx; this._inAtk = p;
    try { resolveAttack.call(this, p); } finally { this._inAtk = null; this._hd = 1; }
    if (p.kbx !== kb0) { const r = sw.noRecoil ? 0 : (W.recoil == null ? 1 : W.recoil); p.kbx = kb0 + (p.kbx - kb0) * r; }
    if (sw.cutAll || W.cutAll) {
      const box = this.atkBox(p), auth = this.auth();
      for (const pr of this.projs) if (!pr.dead && EXTRA_CUT.has(pr.kind) && !(pr.delay > 0) && overlap(box, pr)) {
        pr.dead = true; this.burst(6, pr.x + pr.w / 2, pr.y + pr.h / 2, 0xffd47a);
        if (auth) this.sfx('clink'); else if (!p.remote) this.sendEv({ k: 'cut', kind: pr.kind, x: Math.round(pr.x), y: Math.round(pr.y) });
      }
    }
  };
  // особый ли это удар (иначе — исходная игла без изменений) и сколько урона несёт один вызов damageX
  const special = (sc, p) => {
    if (sc._inAtk !== p || !p.sw) return null;
    const W = sc.wdef(p), sw = p.sw, d = W.dmg * sw.dm;
    if (d === 1 && W.hs == null && W.kb == null && sw.hits === (p.heavy ? 2 : 1)) return null;
    return { W, sw, d };
  };
  // второй вызов «тяжёлого» удара пропускаем, если у удара одно попадание
  const dup = (p, sw, tgt) => { if (sw.hits !== 1 || !p.heavy) return false; const c = sw.cn.get(tgt) || 0; sw.cn.set(tgt, c + 1); return c >= 1; };

  const damageEnemy = proto.damageEnemy;
  proto.damageEnemy = function (e, p) {
    const s = special(this, p); if (!s) return damageEnemy.call(this, e, p);
    const { W, sw, d } = s;
    if (dup(p, sw, e)) return;
    const h0 = e.hp, est = 1 + Campaign.needleBonus(this); let bump = 0;
    if (d < 1) { bump = est * (1 - d); e.hp += bump; }
    this._hd = d;
    try { damageEnemy.call(this, e, p); } finally { this._hd = 1; }
    if (e.hp === h0 + bump) { e.hp = h0; return; } // не прошёл (броня, под землёй)
    if (d > 1 && !e.dead) { e.hp -= (h0 - e.hp) * (d - 1); if (e.hp <= 0) this.killEnemy(e); }
    if (!e.dead && e.kbT > 0) { const k = W.kb == null ? 1 : W.kb; e.kbx *= k; e.kby *= k; }
    if (!p.remote && W.hs != null) this.hitstop = W.hs;
  };
  for (const [fn, key] of [['damageBoss', 'boss'], ['damageVladik', 'vladik'], ['damageTima', 'tima']]) {
    const orig = proto[fn];
    proto[fn] = function (p) {
      const s = special(this, p), b = key === 'boss' ? this.boss : this[key];
      if (!s || !b) return orig.call(this, p);
      const { W, sw, d } = s;
      if (dup(p, sw, b)) return;
      // урон оружия добавляем до исходного вызова: фазы, смерть и двойной урон по оглушённому считает он сам
      if (!['rage', 'dead', 'gone', 'sleep', 'intro'].includes(b.state)) b.hp -= (b.stagger > 0 ? 2 : 1) * (d - 1);
      this._hd = d;
      try { orig.call(this, p); } finally { this._hd = 1; }
      if (!p.remote && W.hs != null && this.hitstop > 0) this.hitstop = W.hs;
    };
  }
  // стойкость босса: свой множитель у каждого клинка (отбив и всполох идут вне удара и не затронуты)
  const poiseAdd = proto.poiseAdd;
  proto.poiseAdd = function (b, n) {
    const p = this._inAtk;
    if (p && p.sw) { const W = this.wdef(p); n *= (W.pm == null ? 1 : W.pm) * (p.sw.pm == null ? 1 : p.sw.pm); }
    return poiseAdd.call(this, b, n);
  };
  // нить копится за нанесённый урон, а не за число ударов (иначе быстрые клинки лечили бы слишком быстро)
  const gainSilk = proto.gainSilk;
  proto.gainSilk = function (p, boss) {
    if (this._inAtk === p && this._hd != null && this._hd !== 1) {
      p.silkAcc = (p.silkAcc || 0) + this._hd / (boss ? BAL.silkEvery : 1);
      while (p.silkAcc >= 1) { p.silkAcc -= 1; gainSilk.call(this, p, false); }
      return;
    }
    return gainSilk.call(this, p, boss);
  };

  // ---------- сеть ----------
  const packPlayer = proto.packPlayer;
  proto.packPlayer = function (p) {
    const r = packPlayer.call(this, p);
    r.wk = p.swk || 'g'; if (p.chg > CH_SHOW) r.cg = Math.round(p.chg * 100) / 100;
    return r;
  };
  const onNet = proto.onNet;
  proto.onNet = function (m) {
    const p = m && m.t === 'p' && this.players ? this.players[m.i] : null, l0 = p && p.lastSeq;
    onNet.call(this, m);
    if (!p || !p.remote) return;
    p.chg = m.cg || 0;
    if (p.lastSeq !== l0) { // новый удар удалённого героя: восстанавливаем его по оружию и коду удара
      const W = this.wdef(p), k = m.wk || 'g', e = W.sw && W.sw[k];
      p.swk = k; p.heavy = !!m.hv;
      const dur = e && e.t != null ? e.t : (p.heavy ? W.finT : W.atkT);
      p.atkT = dur; p.sw = mkSw(W, k, p, dur);
    }
  };

  // ---------- звук ----------
  const sndPlay = Snd.play;
  const SND = {
    chargeFull() { this.tone('sine', 880, 1760, 0.18, 0.12); this.tone('triangle', 1320, 1320, 0.3, 0.07); this.hiss(0.1, 0.1, 3600, 2); },
    wave() { this.hiss(0.32, 0.22, 1300, 0.8); this.tone('sawtooth', 520, 170, 0.3, 0.1); },
    whirl() { this.hiss(0.34, 0.2, 1900, 1.1); this.tone('triangle', 760, 300, 0.28, 0.1); },
    reap() { this.hiss(0.26, 0.26, 950, 0.8); this.tone('sine', 210, 60, 0.3, 0.2); },
    hammer() { this.hiss(0.14, 0.2, 600, 0.7); this.tone('triangle', 170, 70, 0.18, 0.14); },
    quake() { this.hiss(0.45, 0.32, 130, 0.6); this.tone('sine', 75, 28, 0.6, 0.4); this.tone('square', 220, 60, 0.15, 0.06); },
    lunge() { this.hiss(0.18, 0.24, 2600, 1.5); this.tone('square', 950, 220, 0.16, 0.06); },
  };
  Snd.play = function (n) { const f = SND[n]; if (f) { if (this.ctx) f.call(this); return; } return sndPlay.call(this, n); };
  // нарастающий гул заряда: частота и громкость растут за dur секунд; возвращает объект с stop()
  Snd.chargeStart = function (dur, id) {
    const c = this.ctx; if (!c || !this.master) return null;
    try {
      const t = c.currentTime, f0 = { needle: 200, twin: 320, sickle: 170, mace: 110, lance: 260 }[id] || 200;
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth'; o2.type = 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 3.4, t + dur);
      o2.frequency.setValueAtTime(f0 * 2, t); o2.frequency.exponentialRampToValueAtTime(f0 * 6.8, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.085, t + dur);
      o.connect(g); o2.connect(g); g.connect(this.master); o.start(t); o2.start(t);
      return {
        stop() {
          const n = c.currentTime;
          try { g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), n); g.gain.exponentialRampToValueAtTime(0.0001, n + 0.07); o.stop(n + 0.1); o2.stop(n + 0.1); } catch (_) { }
        },
      };
    } catch (_) { return null; }
  };

  // ---------- отрисовка удара ----------
  // полоса дуги: углы r0..r1 отсчитываются от направления удара th (с отражением по лицу f)
  const band = (fx, ox, oy, th, f, r0, r1, R, w, col, al) => {
    let a0 = th + f * r0, a1 = th + f * r1; if (a0 > a1) { const t = a0; a0 = a1; a1 = t; }
    fx.fillStyle(col, al); fx.beginPath(); fx.arc(ox, oy, R, a0, a1, false); fx.arc(ox, oy, R - w, a1, a0, true); fx.closePath(); fx.fillPath();
  };
  const edge = (fx, ox, oy, th, f, r0, r1, R, lw, col, al) => {
    let a0 = th + f * r0, a1 = th + f * r1; if (a0 > a1) { const t = a0; a0 = a1; a1 = t; }
    fx.lineStyle(lw, col, al); fx.beginPath(); fx.arc(ox, oy, R, a0, a1, false); fx.strokePath();
  };
  const ease = (x) => 1 - (1 - x) * (1 - x);
  proto.drawSwing = function (p, fx) {
    const W = this.wdef(p), sw = p.sw; if (!sw || !sw.dur || sw.wid !== W.id) return false;
    if (W.id === 'needle' && (sw.k === 'g' || sw.k === 'f')) return false; // обычные удары иглы рисует исходный код
    const k = Math.max(0, Math.min(1, p.atkT / sw.dur)), el = 1 - k;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 - 2, dir = p.atkDir, f = dir === 'f' ? (sw.k === 'g' || sw.k === 'f' ? p.face : sw.f0) : 1;
    const th = dir === 'f' ? (f > 0 ? 0 : PI) : dir === 'u' ? -PI / 2 : PI / 2, col = W.col, acc = p.pal.accent;
    const box = this.atkBox(p), id = W.id, th0 = sw.f0 > 0 ? 0 : PI;
    if (sw.k === 'c') {
      if (id === 'needle') { // волна: полумесяц летит вперёд и тает
        const L = Math.max(10, sw.len * Math.min(1, el / 0.7)), fxX = sw.x0 + sw.f0 * L;
        for (let i = 0; i < 4; i++) band(fx, fxX - sw.f0 * (16 + i * 18), sw.y0, th0, sw.f0, -1.05, 1.05, 34 - i * 2, 9 + (3 - i) * 2, i ? acc : 0xffffff, (0.85 - i * 0.2) * k);
        edge(fx, fxX - sw.f0 * 16, sw.y0, th0, sw.f0, -1.05, 1.05, 36, 2, 0xffffff, k);
      } else if (id === 'twin') { // шквал: три вращающихся кольца
        const t0 = el * 26;
        for (let i = 0; i < 3; i++) band(fx, cx, cy, 0, 1, t0 + i * 2.09, t0 + i * 2.09 + 1.5, 50 + i * 2, 7, i === 1 ? acc : col, 0.8 * (0.4 + 0.6 * k));
        fx.lineStyle(2, 0xffffff, 0.6 * k); fx.strokeCircle(cx, cy, 36 + 22 * Math.sin(el * PI));
      } else if (id === 'sickle') { // жатва: гигантский взмах от затылка через верх вперёд
        const cur = -2.5 + 3.4 * ease(Math.min(1, el * 1.5)), r0 = Math.max(-2.5, cur - 1.9), cxx = cx - sw.f0 * 8, cyy = cy + 10;
        band(fx, cxx, cyy, th0, sw.f0, r0, cur, 88, 34, col, 0.9 * k + 0.1); band(fx, cxx, cyy, th0, sw.f0, r0 + 0.5, cur, 70, 10, 0xffffff, 0.7 * k);
        edge(fx, cxx, cyy, th0, sw.f0, r0, cur, 90, 3, acc, k);
      } else if (id === 'mace') { // удар оземь: ударная волна по земле в обе стороны
        const half = 200 * Math.min(1, el / 0.5) + 10, fy = sw.fy;
        for (const s of [-1, 1]) {
          const x = sw.x0 + s * half;
          fx.fillStyle(col, 0.85 * k); fx.fillTriangle(x, fy, x - s * 30, fy - 8, x - s * 18, fy - 34 * (0.4 + 0.6 * k));
          fx.fillStyle(0xffffff, 0.6 * k); fx.fillTriangle(x - s * 34, fy, x - s * 56, fy - 6, x - s * 46, fy - 22 * k);
        }
        fx.lineStyle(3, 0xffffff, 0.8 * k); fx.lineBetween(sw.x0 - half, fy - 1, sw.x0 + half, fy - 1);
        fx.fillStyle(col, 0.3 * k); fx.fillEllipse(sw.x0, fy - 4, half * 2, 26);
      } else { // копьё: рывок-прокол — длинный росчерк
        const xa = sw.f0 > 0 ? box.x : box.x + box.w, xb = sw.f0 > 0 ? box.x + box.w : box.x, yy = box.y + box.h / 2;
        fx.fillStyle(col, 0.5 * k); fx.fillTriangle(xa, yy - 9, xa, yy + 9, xb, yy);
        fx.fillStyle(0xffffff, 0.9 * k); fx.fillTriangle(xa, yy - 3, xa, yy + 3, xb, yy);
        fx.lineStyle(2, acc, 0.8 * k); for (let i = -1; i <= 1; i += 2) fx.lineBetween(xa + sw.f0 * 10, yy + i * 14, xa + sw.f0 * 90, yy + i * 4);
      }
      return true;
    }
    const ox = cx + (dir === 'f' ? 0 : Math.cos(th) * 4), oy = cy + (dir === 'f' ? 0 : Math.sin(th) * 4);
    if (id === 'twin') {
      if (sw.k === 'f') { // вихрь
        const t0 = el * 18;
        for (let i = 0; i < 3; i++) band(fx, cx, cy, 0, 1, t0 + i * 2.09, t0 + i * 2.09 + 1.45, 46, 8, i === 1 ? acc : col, 0.85 * k);
        fx.lineStyle(2, 0xffffff, 0.7 * k); fx.strokeCircle(cx, cy, 30 + 20 * el);
      } else if (sw.k === 'a2') {
        band(fx, cx, cy, 0, 1, el * 12, el * 12 + 3.6, 40, 9, col, 0.85 * k); fx.lineStyle(2, acc, 0.8 * k); fx.strokeCircle(cx, cy, 30 + 10 * el);
      } else {
        const j = (sw.k === 'a1' ? 0.7 : 0.25) * ((p.combo || 0) % 2 ? 1 : -1);
        band(fx, ox, oy, th, f, -0.85 + j * 0.3, 0.85 + j * 0.3, 32, 9, col, 0.9 * k); band(fx, ox, oy + (dir === 'f' ? 7 : 0), th, f, -0.7, 0.7 - j * 0.3, 25, 6, acc, 0.75 * k);
        if (sw.k === 'a1') { fx.lineStyle(2, 0xffffff, 0.8 * k); fx.lineBetween(ox + f * 6, oy - 10, ox + f * 40, oy + 10); fx.lineBetween(ox + f * 6, oy + 10, ox + f * 40, oy - 10); }
      }
    } else if (id === 'sickle') {
      if (sw.k === 'a2') { const cur = -PI / 2 + el * PI * 2; band(fx, cx, cy - 6, 0, 1, cur - 2.6, cur, 62, 20, col, 0.9 * k); edge(fx, cx, cy - 6, 0, 1, cur - 2.6, cur, 63, 2.5, 0xffffff, k); }
      else if (dir === 'f') {
        const a = sw.k === 'a1' ? [-1.2, 1.3] : [-2.2, 0.55], cur = a[0] + (a[1] - a[0]) * ease(Math.min(1, el * 1.4)), r0 = Math.max(a[0], cur - 1.5);
        const cxx = cx - f * 6, cyy = cy + (sw.k === 'a1' ? -4 : 10), R = sw.k === 'f' ? 76 : 68;
        band(fx, cxx, cyy, th, f, r0, cur, R, 24, col, 0.92 * k + 0.08); band(fx, cxx, cyy, th, f, r0 + 0.3, cur, R - 6, 6, 0xffffff, 0.75 * k);
        edge(fx, cxx, cyy, th, f, r0, cur, R + 1, 2.4, acc, k);
      } else {
        const cur = -1.4 + 2.8 * ease(Math.min(1, el * 1.4)); band(fx, ox, oy, th, 1, -1.4, cur, 60, 20, col, 0.9 * k + 0.1); edge(fx, ox, oy, th, 1, -1.4, cur, 61, 2.4, acc, k);
      }
    } else if (id === 'mace') {
      if (sw.k === 'a2') { band(fx, cx, cy, 0, 1, el * 9, el * 9 + 3.9, 46, 24, col, 0.88 * k); fx.lineStyle(3, 0xffffff, 0.7 * k); fx.strokeCircle(cx, cy, 46 + 8 * el); }
      else {
        const cur = -1.1 + 2.2 * ease(Math.min(1, el * 2)), R = 44 + (dir === 'f' ? 0 : 6);
        band(fx, ox, oy, th, f, -1.1, cur, R, 28, col, 0.92 * k + 0.08); edge(fx, ox, oy, th, f, -1.1, cur, R + 1, 3, 0xffffff, 0.9 * k);
        if (el > 0.25) { // вспышка в точке удара
          const hx = box.x + (dir === 'f' ? (f > 0 ? box.w : 0) : box.w / 2), hy = box.y + (dir === 'u' ? 6 : dir === 'd' ? box.h - 6 : box.h / 2);
          fx.lineStyle(3, 0xffffff, 0.8 * k); for (let i = 0; i < 6; i++) { const an = i * 1.05 + el * 2; fx.lineBetween(hx + Math.cos(an) * 6, hy + Math.sin(an) * 6, hx + Math.cos(an) * 18, hy + Math.sin(an) * 18); }
        }
      }
    } else if (id === 'lance') {
      if (dir === 'f') {
        const xa = cx + f * 8, xb = box.x + (f > 0 ? box.w : 0), yy = box.y + box.h / 2, tx = xa + (xb - xa) * Math.min(1, el * 3.4 + 0.25), hh = (sw.k === 'f' ? 8 : 6) * (0.5 + 0.5 * k);
        fx.fillStyle(col, 0.7 * k + 0.1); fx.fillTriangle(xa, yy - hh, xa, yy + hh, tx, yy);
        fx.fillStyle(0xffffff, 0.95 * k); fx.fillTriangle(xa, yy - hh * 0.35, xa, yy + hh * 0.35, tx, yy);
        fx.fillStyle(acc, 0.8 * k); fx.fillCircle(tx, yy, 4 + 3 * k);
        if (sw.k === 'a1' || sw.k === 'a2') { fx.lineStyle(2, acc, 0.7 * k); fx.lineBetween(xa + f * 20, yy - 14, xa + f * 70, yy - 6); fx.lineBetween(xa + f * 20, yy + 14, xa + f * 70, yy + 6); }
      } else {
        const xm = box.x + box.w / 2, y0 = dir === 'u' ? box.y + box.h : box.y, y1 = dir === 'u' ? box.y : box.y + box.h, ty = y0 + (y1 - y0) * Math.min(1, el * 3.4 + 0.25);
        fx.fillStyle(col, 0.7 * k + 0.1); fx.fillTriangle(xm - 6, y0, xm + 6, y0, xm, ty); fx.fillStyle(0xffffff, 0.95 * k); fx.fillTriangle(xm - 2, y0, xm + 2, y0, xm, ty);
      }
    } else if (id === 'needle') { // воздушные взмахи иглы
      if (sw.k === 'a2') { band(fx, cx, cy, 0, 1, el * 9, el * 9 + 3.2, 40, 12, 0xf6f3e8, 0.85 * k); edge(fx, cx, cy, 0, 1, el * 9, el * 9 + 3.2, 41, 2, acc, 0.8 * k); }
      else { const cur = -1.9 + 2.4 * ease(Math.min(1, el * 1.6)), r0 = Math.max(-1.9, cur - 1.5); band(fx, cx - f * 4, cy + 2, th, f, r0, cur, 50, 15, 0xf6f3e8, 0.9 * k); edge(fx, cx - f * 4, cy + 2, th, f, r0, cur, 51, 2, acc, 0.8 * k); }
    }
    return true;
  };

  // ---------- клинок за спиной, поза заряда и свечение ----------
  proto.drawWeaponBody = function (p, g, a, now) {
    const W = this.wdef(p), f = p.face, ch = p.chg || 0, col = W.col || 0xcfd6dc, bob = a ? a.bob : 0;
    if (ch > CH_SHOW * 0.8) { // свечение и сходящееся кольцо
      const k = Math.min(1, ch / CH_T), full = ch >= CH_T, pulse = 0.6 + Math.sin(now * (full ? 40 : 18)) * 0.4;
      g.fillStyle(col, (0.1 + 0.22 * k) * (full ? pulse + 0.4 : 1)); g.fillCircle(0, -14, 14 + 16 * k);
      g.fillStyle(0xffffff, 0.12 * k); g.fillCircle(0, -14, 8 + 8 * k);
      g.lineStyle(2, full ? 0xffffff : col, 0.35 + 0.5 * k); g.strokeCircle(0, -14, full ? 34 + Math.sin(now * 40) * 3 : 44 - 26 * k);
      if (full) { g.lineStyle(1.5, p.pal.accent, 0.8); for (let i = 0; i < 6; i++) { const an = now * 6 + i * PI / 3; g.lineBetween(Math.cos(an) * 26, -14 + Math.sin(an) * 26, Math.cos(an) * 38, -14 + Math.sin(an) * 38); } }
    }
    const pull = ch > CH_SHOW;
    if (W.id === 'needle' && !pull) return false;
    if (!pull && (p.atkT > 0 || p.sit)) return true;
    const y0 = -10 - bob;
    if (pull) { // оружие занесено назад горизонтально
      const jx = (Math.random() - 0.5) * Math.min(1, ch / CH_T) * 1.6;
      g.lineStyle(2.2, 0xcfd6dc, 1); g.lineBetween(-4 * f, -15, -24 * f + jx, -15 + jx);
      g.lineStyle(1.4, col, 1);
      if (W.id === 'twin') g.lineBetween(-4 * f, -11, -20 * f + jx, -11);
      else if (W.id === 'sickle') { g.lineBetween(-24 * f, -15, -30 * f, -23); g.lineBetween(-30 * f, -23, -24 * f, -29); }
      else if (W.id === 'mace') { g.fillStyle(0xd0b080, 1); g.fillCircle(-26 * f + jx, -15, 6); g.lineStyle(1.2, 0x6b4f2a, 1); g.strokeCircle(-26 * f + jx, -15, 6); }
      else if (W.id === 'lance') { g.lineBetween(-4 * f, -15, 8 * f, -15); g.fillStyle(0xffffff, 1); g.fillTriangle(-26 * f, -17, -26 * f, -13, -34 * f, -15); }
      else g.strokeCircle(-26 * f, -15, 2);
      return true;
    }
    if (W.id === 'twin') {
      g.lineStyle(1.7, 0xcfd6dc, 1); g.lineBetween(-6 * f, y0, -14 * f, -25 - bob); g.lineBetween(-6 * f, y0 - 3, -16 * f, -19 - bob);
      g.lineStyle(1, col, 0.95); g.strokeCircle(-14 * f, -26 - bob, 1.8); g.strokeCircle(-17 * f, -19 - bob, 1.8);
    } else if (W.id === 'sickle') {
      g.lineStyle(2, 0xcfd6dc, 1); g.lineBetween(-6 * f, y0 + 2, -13 * f, -27 - bob);
      g.lineStyle(2.6, col, 1); g.beginPath(); g.moveTo(-13 * f, -27 - bob); g.lineTo(-10 * f, -33 - bob); g.lineTo(-3 * f, -35 - bob); g.lineTo(0, -31 - bob); g.strokePath();
    } else if (W.id === 'mace') {
      g.lineStyle(2.6, 0x8a6a46, 1); g.lineBetween(-6 * f, y0 + 1, -14 * f, -24 - bob);
      g.fillStyle(0xd0b080, 1); g.fillCircle(-15 * f, -27 - bob, 4.6); g.lineStyle(1.2, 0x6b4f2a, 1); g.strokeCircle(-15 * f, -27 - bob, 4.6);
      g.fillStyle(0x6b4f2a, 1); g.fillCircle(-17 * f, -28 - bob, 1); g.fillCircle(-13 * f, -26 - bob, 1);
    } else if (W.id === 'lance') {
      g.lineStyle(1.8, 0xcfd6dc, 1); g.lineBetween(-7 * f, -4 - bob, -20 * f, -37 - bob);
      g.fillStyle(0xffffff, 1); g.fillTriangle(-20 * f, -37 - bob, -17 * f, -45 - bob, -23 * f, -42 - bob);
      g.lineStyle(1, col, 0.9); g.strokeCircle(-9 * f, -8 - bob, 2);
    } else return false;
    return true;
  };
})();
