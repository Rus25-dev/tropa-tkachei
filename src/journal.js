// ===== ЖУРНАЛ ВВОДА: восстановление забега после падения или перезагрузки вкладки =====
// Логика игры детерминирована по зерну и идёт тиками по 1/60 с (GameScene.tick). Поэтому забег целиком описывается зерном, настройками и
// вводом по тикам. Журнал пишет сжатый (RLE) ввод каждого тика, действия интерфейса (пауза, скамья, лавка, карта) и контрольные хэши
// состояния; раз в ~2 с он сохраняется в localStorage (tt_jr). «Восстановить забег» заново создаёт сцену и гонит тики без отрисовки
// и звука, проверяя хэши: при расхождении забег не продолжается (честнее, чем играть в другом состоянии).
// Время простоя идёт в зачёт: RTA считается от настенного времени старта (wallT0), а в итоге помечается «восстановлен».
// Журнал забега ведётся для одиночных забегов (спидран, гонки). Режим «в памяти» (Journal.startMem, для золотых записей и тестов) пишет любую
// офлайн-сцену: босс-тест, кампанию, спидран; один или два локальных игрока; в localStorage не пишется. Онлайн-сцены (кооп по сети) не пишутся.
const Journal = {
  KEY: 'tt_jr', J: null, seg: null, rp: null, depth: 0, lastSave: 0, dirty: false,
  BITS: ['left', 'right', 'up', 'down', 'jump', 'atk', 'dash', 'heal', 'bomb', 'tool'],
  EBITS: ['jumpP', 'atkP', 'dashP', 'healP', 'upP', 'bombP', 'toolP'],
  CHK: 300, // как часто (в тиках) писать контрольный хэш
  enc(o, names) { let m = 0; if (o) for (let i = 0; i < names.length; i++) if (o[names[i]]) m |= 1 << i; return m; },
  dec(m, names) { const o = {}; for (let i = 0; i < names.length; i++) o[names[i]] = !!(m & (1 << i)); return o; },

  // ----- хранилище -----
  load() { try { const j = JSON.parse(localStorage.getItem(this.KEY) || 'null'); return j && j.v === 1 && Array.isArray(j.segs) ? j : null; } catch (_) { return null; } },
  write(force) {
    const J = this.J; if (!J || J.mem) return;
    const now = performance.now(); if (!force && now - this.lastSave < 2000) return;
    this.lastSave = now; this.dirty = false; J.wallSave = Date.now();
    try { localStorage.setItem(this.KEY, JSON.stringify(J)); } catch (_) { /* переполнение или режим «инкогнито»: забег идёт без журнала */ }
  },
  // можно ли восстановить: есть журнал, версия та же, забег не закончен
  info() {
    const j = this.load(); if (!j) return null;
    const ticks = j.segs.reduce((s, g) => s + g.n, 0);
    return { j, ok: j.ver === GAME_VERSION && ticks > 0, why: j.ver !== GAME_VERSION ? `журнал от версии ${j.ver}, у вас ${GAME_VERSION}` : '', ticks, sec: Math.round(ticks / 60), cat: j.cat, race: j.race, down: Math.max(0, Date.now() - (j.wallSave || Date.now())) };
  },
  clear() { if (this.J && this.J.mem && !this.force) return; /* журнал в памяти (золотые записи) финиш и выход забега не стирают */ this.J = null; this.seg = null; this.rp = null; try { localStorage.removeItem(this.KEY); } catch (_) { } },

  // ----- запись -----
  startRun(info) {
    if (this.J && this.J.mem) { this.J.cat = info.cat; this.J.seed = info.seed >>> 0; return; } // запись в памяти: журнал уже заведён, забег только помечает категорию
    this.J = { v: 1, ver: GAME_VERSION, cat: info.cat, race: info.race || null, seed: info.seed >>> 0, wall0: Date.now(), wallT0: null, wallSave: Date.now(), restored: 0, splits: [], pauses: [], segs: [], st: { easy: !!Settings.s.easy, speed: Settings.s.speed || 100 } };
    this.seg = null; this.write(true);
  },
  // запись в памяти (золотые записи): любой режим, 1–2 локальных игрока, в localStorage не пишется. meta попадает в журнал как есть
  startMem(meta) {
    this.J = { v: 1, mem: true, ver: GAME_VERSION, cat: null, race: null, seed: 0, wall0: 0, wallT0: null, wallSave: 0, restored: 0, splits: [], pauses: [], segs: [], st: { easy: !!Settings.s.easy, speed: Settings.s.speed || 100 }, meta: meta || {} };
    this.seg = null; return this.J;
  },
  // итог партии для золотых записей: всё, что должно совпасть в другой реализации ядра
  outcome(gs) {
    const b = gs.testBoss() || gs.boss, r = Speedrun.run;
    return { tick: gs.tickN, won: !!gs.won, wiping: !!gs.wiping, deaths: gs.deaths | 0, beads: gs.beads | 0, bossDead: !!gs.bossDead, boss: b ? { hp: Math.round(b.hp * 1000) / 1000, phase: b.phase || 1, state: b.state } : null,
      players: gs.players.map((p) => ({ x: Math.round(p.x * 16), y: Math.round(p.y * 16), hp: p.hp, maxHp: p.maxHp, silk: Math.round(p.silk * 10), downed: !!p.downed })), camp: gs.camp ? { ch: gs.camp.ch, st: gs.camp.st } : null,
      sr: r ? { igt: Math.round(r.igt), splits: r.splits.map((s) => s && Math.round(s.igt)), deaths: r.deaths, done: !!r.done } : null, hash: this.hash2(gs) };
  },
  // начало сцены: новый отрезок журнала (или привязка к воспроизводимому)
  segBegin(gs) {
    gs.jr = null; gs.replaying = false;
    if (!this.J || gs.online) return;
    if (!this.J.mem && (!gs.sr || gs.nPlayers !== 1)) return;
    const rp = this.rp;
    if (rp) {
      const seg = this.J.segs[rp.si];
      if (!seg || seg.seed !== gs.seed) { this.fail(gs, `зерно сцены не совпало (${seg ? seg.seed : '—'} ≠ ${gs.seed})`); return; }
      this.seg = seg; gs.jr = this; gs.replaying = true; gs.quiet = true; rp.gs = gs; rp.ready = false;
      return;
    }
    const sd = gs.startData || {};
    this.seg = { seed: gs.seed, np: gs.nPlayers, hv: this.J.mem ? 2 : 1, data: { players: gs.nPlayers, mode: sd.mode || 'story', boss: sd.boss || null, camp: sd.camp ? JSON.parse(JSON.stringify(sd.camp)) : null }, n: 0, rle: [], acts: [], chk: [] };
    this.J.segs.push(this.seg); gs.jr = this; this.dirty = true;
  },
  // вызывается из GameScene.tick на каждом тике до обработки ввода
  rec(gs) {
    const seg = this.seg; if (!seg || gs.replaying) return;
    if (seg.n > 0 && seg.n % this.CHK === 0) seg.chk.push(seg.n, this.hash(gs));
    // значение тика: ввод первого игрока, у двух локальных игроков второй добавляется старшими разрядами (по 17 бит на игрока)
    const ps = gs.players, p = ps[0];
    let v = this.enc(p.raw, this.BITS) | (this.enc(p.pend, this.EBITS) << 10);
    if (ps.length > 1) v += (this.enc(ps[1].raw, this.BITS) | (this.enc(ps[1].pend, this.EBITS) << 10)) * 131072;
    const r = seg.rle, L = r.length;
    if (L && r[L - 2] === v) r[L - 1]++; else r.push(v, 1);
    seg.n++; this.dirty = true;
  },
  // действие интерфейса вне тика: пауза, скамья, лавка, карта
  act(gs, name, a, b, c) {
    if (!gs.jr || gs.replaying || gs.inTick || !this.seg) return;
    this.seg.acts.push([this.seg.n, name, a == null ? 0 : a, b == null ? 0 : b, c == null ? 0 : c]); this.dirty = true;
  },
  // богатый хэш для золотых записей (hv:2): все игроки, босс, враги, снаряды; на нём проверяется перенос ядра на v2
  hash2(gs) {
    const b = gs.testBoss() || gs.boss; let h = 2166136261;
    const mix = (n) => { h = Math.imul(h ^ (Math.round(n) | 0), 16777619) >>> 0; };
    const str = (s) => { for (let i = 0; i < String(s).length; i++) mix(String(s).charCodeAt(i)); };
    // (номер тика в хэш не входит: при записи он уже увеличен, при проверке — ещё нет)
    for (const p of gs.players) { mix(p.x * 16); mix(p.y * 16); mix(p.vx); mix(p.vy); mix(p.hp); mix(p.silk * 10); mix(p.inv * 100); mix(p.downed ? 1 : 0); mix(p.dashT * 100); mix(p.atkT * 100); }
    if (b) { mix(b.x * 16); mix(b.y * 16); mix(b.hp * 10); mix(b.phase || 1); str(b.state); mix((b.stagger || 0) * 100); }
    let ex = 0, ey = 0, n = 0; for (const e of gs.enemies) if (!e.dead) { n++; ex += e.x; ey += e.y; } mix(n); mix(ex * 16); mix(ey * 16);
    mix(gs.projs.length); let px = 0; for (const q of gs.projs) px += q.x + q.y; mix(px * 16);
    mix(gs.beads | 0); mix(gs.deaths | 0); mix(gs.bossDead ? 1 : 0); mix(gs.beadsArr.length); mix(gs.won ? 1 : 0); mix(gs.wiping ? 1 : 0);
    return h;
  },
  // мелкое состояние для контрольных хэшей
  hash(gs) {
    if (this.seg && this.seg.hv === 2) return this.hash2(gs);
    const p = gs.players[0], b = gs.testBoss() || gs.boss; let h = 2166136261;
    const mix = (n) => { h = Math.imul(h ^ (Math.round(n) | 0), 16777619) >>> 0; };
    mix(p.x * 16); mix(p.y * 16); mix(p.hp); mix(gs.beads | 0); mix(((b && b.hp) || 0) * 10); mix(gs.deaths | 0);
    mix(gs.enemies.filter((e) => !e.dead).length); mix(gs.beadsArr.length); mix(gs.projs.length); mix(gs.bossDead ? 1 : 0);
    return h;
  },
  // сохранять не чаще раза в 2 с (зовём каждый кадр) и при уходе со страницы
  pulse() { if (this.J && this.dirty && !this.rp) this.write(false); },

  // ----- воспроизведение -----
  // Запускает сцену по журналу. menu — активная MenuScene. Возвращает false, если восстановить нельзя.
  restore(menu, opt) {
    const inf = this.info(); if (!inf || !inf.ok) return false;
    const J = inf.j; this.J = J; this.seg = null;
    J.restored = (J.restored | 0) + 1; J.downMs = (J.downMs | 0) + inf.down;
    const first = J.segs[0], data = Speedrun.begin(J.cat, null, { seed: first.seed, restoring: J });
    const r = Speedrun.run; r.restored = J.restored; r.downMs = J.downMs; r.rc = J.race || null; r.hold = !!J.race; // гонка: до «go» герой стоит, дальше действие 'rel' из журнала
    if (first.data.camp) data.camp = first.data.camp;
    data.seed = first.seed;
    this.rp = { si: 0, gs: null, ready: false, t0: performance.now(), total: J.segs.reduce((s, g) => s + g.n, 0), done: 0, opt: opt || {}, muted: null };
    this.mute(true); this.overlay(true);
    if (menu) { menu.leaving = true; menu.scene.start('game', data); } else window.__game.scene.start('game', data);
    this.timer = setInterval(() => { const rp = this.rp; if (!rp) { clearInterval(this.timer); return; } if (rp.gs && rp.gs.sys && rp.gs.sys.isActive()) this.pump(rp.gs); else if (!rp.gs && rp.waitT && performance.now() - rp.waitT > 8000) this.fail(null, 'переход между отрезками не произошёл'); }, 16);
    return true;
  },
  // воспроизведение журнала из памяти (золотые записи, тесты): без экрана, звука и localStorage. opt: { onDone(gs), onFail(why), budget (мс на кадр) }
  restoreMem(J, opt) {
    this.J = J; this.seg = null; this.error = null;
    const first = J.segs[0];
    let data;
    if (J.cat) { data = Speedrun.begin(J.cat, null, { seed: first.seed, restoring: J }); if (first.data.camp) data.camp = first.data.camp; data.seed = first.seed; if (J.race) { Speedrun.run.rc = J.race; Speedrun.run.hold = true; } /* гонка: до действия 'rel' герой стоит */ }
    else data = { players: first.data.players || 1, mode: first.data.mode, boss: first.data.boss, camp: first.data.camp, seed: first.seed };
    this.rp = { si: 0, gs: null, ready: false, t0: performance.now(), total: J.segs.reduce((s, g) => s + g.n, 0), done: 0, opt: Object.assign({ silent: true, budget: 150 }, opt || {}), muted: null };
    this.mute(true);
    const g = window.__game; g.scene.stop('menu'); g.scene.start('game', data);
    this.timer = setInterval(() => { const rp = this.rp; if (!rp) { clearInterval(this.timer); return; } if (rp.gs && rp.gs.sys && rp.gs.sys.isActive()) this.pump(rp.gs); else if (!rp.gs && rp.waitT && performance.now() - rp.waitT > 8000) this.fail(null, 'переход между отрезками не произошёл'); }, 5);
    return true;
  },
  mute(on) {
    if (on) { if (!this._snd) { this._snd = Snd.play; Snd.play = () => { }; } }
    else if (this._snd) { Snd.play = this._snd; this._snd = null; }
  },
  overlay(on, text) {
    let el = document.getElementById('jr-ov');
    if (!on) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'jr-ov'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;inset:0;z-index:9;background:#070d0c;color:#e8e2cf;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;font:600 20px var(--body,system-ui,sans-serif);text-align:center;padding:16px';
      el.innerHTML = '<div>Восстанавливаем забег…</div><div id="jr-ov-p" style="font:400 15px var(--body,system-ui,sans-serif);color:#9fc4b4"></div>';
      document.body.appendChild(el);
    }
    el.hidden = false; const p = el.querySelector('#jr-ov-p'); if (p) p.textContent = text || '';
  },
  fail(gs, why) {
    const rp = this.rp; if (!rp) return;
    this.mute(false); this.overlay(false); clearInterval(this.timer);
    if (gs) { gs.replaying = false; gs.quiet = false; gs.jr = null; }
    const cb = rp.opt && rp.opt.onFail, mem = !!(this.J && this.J.mem); this.rp = null; this.J = null; this.seg = null;
    this.error = why; try { console.warn('Журнал: восстановление не удалось — ' + why); } catch (_) { }
    if (!mem) { try { localStorage.removeItem(this.KEY); } catch (_) { } }
    Speedrun.run = null; if (cb) cb(why);
    const u = window.__game && window.__game.scene.getScene('ui');
    if (u && u.ready && u.toast) u.toast('Не удалось восстановить забег: ' + why, 6);
  },
  runAct(gs, a) {
    const [, name, x, y, z] = a, p0 = gs.players[0];
    switch (name) {
      case 'T': gs.togglePause(); break;
      case 'bc': gs.benchClose(!!x); break;
      case 'br': gs.benchRest(gs.players[x] || p0, gs.benches[y], !!z); break;
      case 'so': Campaign.openShop(gs, gs.players[x] || p0); break;
      case 'sc': Campaign.closeShop(gs); break;
      case 'sb': Campaign.buy(gs, SHOP[x] ? SHOP[x].id : ''); break;
      case 'mo': MapTravel.show(gs); break;
      case 'mc': MapTravel.close(gs); break;
      case 'mm': MapTravel.move(gs, x); break;
      case 'mg': MapTravel.sel = x; MapTravel.go(gs); break;
      case 'rel': Speedrun.release(true); break;
      case 'tp': Speedrun.techPause(gs, !!x, true); break;
      case 'ex': if (this.ext && this.ext[x]) this.ext[x](gs, y, z); break; // подключаемые действия (тесты, будущие режимы)
    }
  },
  // порция тиков (до ~40 мс на кадр), чтобы страница не зависала
  pump(gs) {
    const rp = this.rp; if (!rp || rp.gs !== gs || this.pumping) return;
    const ui = gs.ui && gs.ui();
    if (!gs.sys.isActive()) return;
    if (!rp.ready) { if (!ui || !ui.ready) return; rp.ready = true; }
    this.pumping = true;
    try {
      const seg = this.J.segs[rp.si], t0 = performance.now(), acts = seg.acts, chk = {}, budget = (rp.opt && rp.opt.budget) || 40;
      for (let i = 0; i < seg.chk.length; i += 2) chk[seg.chk[i]] = seg.chk[i + 1];
      if (rp.rleSeg !== rp.si) { rp.rleSeg = rp.si; rp.rleI = 0; rp.rleLeft = seg.rle.length ? seg.rle[1] : 0; rp.ai = 0; }
      while (performance.now() - t0 < budget && gs.tickN < seg.n) {
        // действия интерфейса, случившиеся до этого тика
        while (rp.ai < acts.length && acts[rp.ai][0] <= gs.tickN) this.runAct(gs, acts[rp.ai++]);
        if (gs.tickN > 0 && gs.tickN % this.CHK === 0 && chk[gs.tickN] != null && chk[gs.tickN] !== this.hash(gs)) { this.fail(gs, `состояние разошлось на тике ${gs.tickN} (отрезок ${rp.si + 1})`); return; }
        const v = seg.rle[rp.rleI];
        const v0 = v % 131072, v1 = Math.floor(v / 131072), ps = gs.players;
        ps[0].raw = this.dec(v0 & 1023, this.BITS); ps[0].pend = this.dec(v0 >> 10, this.EBITS);
        if (ps.length > 1) { ps[1].raw = this.dec(v1 & 1023, this.BITS); ps[1].pend = this.dec(v1 >> 10, this.EBITS); }
        if (--rp.rleLeft <= 0) { rp.rleI += 2; rp.rleLeft = rp.rleI < seg.rle.length ? seg.rle[rp.rleI + 1] : 0; }
        gs.tick(); rp.done++;
      }
      if (!(rp.opt && rp.opt.silent)) this.overlay(true, `${Math.min(100, Math.round(100 * rp.done / Math.max(1, rp.total)))} %`);
      if (gs.tickN >= seg.n) {
        while (rp.ai < acts.length) this.runAct(gs, acts[rp.ai++]); // действия после последнего тика (например, пауза перед падением)
        if (rp.si >= this.J.segs.length - 1) this.finishRestore(gs);
        else { rp.si++; rp.gs = null; rp.ready = false; rp.waitT = performance.now(); } // дальше сцена сменится сама (таймеры тиков)
      }
    } finally { this.pumping = false; }
  },
  finishRestore(gs) {
    const rp = this.rp, J = this.J, r = Speedrun.run, p = gs.players[0];
    clearInterval(this.timer);
    if (J.mem) { // золотая запись: проиграли до конца, дальше ничего не пишем и не паузим
      gs.replaying = false; gs.quiet = false; gs.jr = null; this.mute(false); this.rp = null;
      if (rp.opt && rp.opt.onDone) rp.opt.onDone(gs);
      return;
    }
    gs.replaying = false; gs.quiet = false; gs.jr = this;
    p.prev = p.raw || p.prev; p.pend = {}; p.carry = {};
    this.mute(false); this.overlay(false);
    if (r) {
      // часы забега: простой идёт в зачёт, поэтому старт считаем от настенного времени
      if (J.wallT0 != null) r.t0 = performance.now() - (Date.now() - J.wallT0);
      r.restored = J.restored; r.downMs = J.downMs;
      // технические паузы организатора не идут в зачёт: считаем по настенному времени из журнала
      r.pausedMs = 0; r.tp = null;
      for (const [a, b] of J.pauses || []) { if (b != null) r.pausedMs += b - a; else r.tp = performance.now() - (Date.now() - a); }
    }
    this.rp = null; this.dirty = true; this.write(true);
    // игрок решает сам, когда продолжить: восстановленный забег ставим на паузу. В гонке паузы нет: время идёт, продолжаем сразу
    if (!(r && r.rc) && !gs.paused && !gs.won) gs.togglePause();
    const u = gs.ui(); if (u && u.toast) u.toast(r && r.rc ? 'Забег восстановлен: время простоя идёт в зачёт' : 'Забег восстановлен. Время простоя идёт в зачёт. Продолжить — в меню паузы.', 6);
    if (rp.opt && rp.opt.onDone) rp.opt.onDone(gs);
  },
};

// ===== подключение к сцене =====
(function () {
  const G = GameScene.prototype, createO = G.create, tickO = G.tick, updO = G.update;
  G.create = function (...a) { this.inTick = false; createO.apply(this, a); Journal.segBegin(this); };
  G.tick = function () { this.inTick = true; try { return tickO.call(this); } finally { this.inTick = false; } };
  // во время воспроизведения кадровая логика не нужна: тики гонит Journal.pump
  G.update = function (t, d) {
    if (this.replaying) { Journal.pump(this); return undefined; }
    const out = updO.call(this, t, d); Journal.pulse(); return out;
  };
  // действия интерфейса пишем после вызова, если они что-то изменили
  const sig = (gs) => { const p = gs.players && gs.players[0], u = gs.ui && gs.ui(); return [gs.paused, !!gs.benchMenuOpen, gs.shopOpen, MapTravel.open, MapTravel.busy, u && u.pause && u.pause.visible, p && p.sit, p && p.hp, gs.beads, gs.respawn && gs.respawn.x, gs.up && gs.up.hp + ',' + gs.up.dmg + ',' + gs.up.silk].join('|'); };
  const wrap = (obj, fn, name, args, gsOf) => {
    const o = obj[fn];
    obj[fn] = function (...a) {
      const gs = gsOf(this, a);
      if (!gs || !gs.jr || gs.replaying || gs.inTick || Journal.depth > 0) return o.apply(this, a);
      const before = sig(gs); Journal.depth++;
      try { return o.apply(this, a); } finally { Journal.depth--; if (sig(gs) !== before) Journal.act(gs, name, ...args(a, gs)); }
    };
  };
  const self = (t) => t;
  wrap(G, 'togglePause', 'T', () => [], self);
  wrap(G, 'benchClose', 'bc', (a) => [a[0] ? 1 : 0], self);
  wrap(G, 'benchRest', 'br', (a, gs) => [a[0] ? a[0].i : 0, gs.benches.indexOf(a[1]), a[2] ? 1 : 0], self);
  wrap(Campaign, 'openShop', 'so', (a) => [a[1] ? a[1].i : 0], (t, a) => a[0]);
  wrap(Campaign, 'closeShop', 'sc', () => [], (t, a) => a[0]);
  wrap(Campaign, 'buy', 'sb', (a) => [SHOP.findIndex((s) => s.id === a[1])], (t, a) => a[0]);
  wrap(MapTravel, 'show', 'mo', () => [], (t, a) => a[0]);
  wrap(MapTravel, 'close', 'mc', () => [], (t, a) => a[0]);
  wrap(MapTravel, 'move', 'mm', (a) => [a[1]], (t, a) => a[0]);
  wrap(MapTravel, 'go', 'mg', () => [MapTravel.sel], (t, a) => a[0]);
  // уходим со страницы — сохраняем журнал сразу
  for (const ev of ['pagehide', 'beforeunload']) window.addEventListener(ev, () => { if (Journal.J && !Journal.rp) Journal.write(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && Journal.J && !Journal.rp) Journal.write(true); });
  // сообщения «Куплено…» и прочие всплывашки не нужны, пока идёт воспроизведение
  const toastO = UIScene.prototype.toast;
  UIScene.prototype.toast = function (...a) { if (Journal.rp && !Journal.rp.opt.toasts) return undefined; return toastO.apply(this, a); };
})();

// ===== меню: «Восстановить забег» (раздел «Спидран») =====
Object.assign(MenuScene.prototype, {
  jrRestore() {
    if (this.leaving) return;
    const inf = Journal.info(); if (!inf || !inf.ok) { Snd.play('hit'); return; }
    Snd.init(); Snd.play('bench');
    Journal.restore(this, { onFail: () => { const m = window.__game.scene.getScene('menu'); if (m && !m.sys.isActive()) { window.__game.scene.stop('game'); window.__game.scene.stop('ui'); window.__game.scene.stop('bg'); window.__game.scene.start('menu'); } } });
  },
});
{
  const d = MENU.speedrun, itemsO = d.items;
  d.items = (m, ctx) => {
    const list = itemsO(m, ctx), inf = Journal.info();
    if (inf) {
      const t = `${Speedrun.fmt(inf.ticks / 60 * 1000)} игрового времени`;
      list.push({ key: String(list.length + 1), label: 'Восстановить забег', sub: inf.ok ? `${SR_CATS[inf.cat] ? SR_CATS[inf.cat].name : inf.cat} · ${t}` : 'недоступно: ' + inf.why, enabled: inf.ok, act: (mm) => mm.jrRestore() });
      list.push({ key: String(list.length + 1), label: 'Удалить сохранённый забег', sub: 'журнал ввода будет стёрт', danger: true, act: (mm) => { Journal.clear(); mm.menuRender(); } });
    }
    return list;
  };
}
