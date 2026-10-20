// ===== СПИДРАН: забеги на время, сплиты, код результата, таблица друзей, гонка 1×1 по сети =====
// Забег живёт в Speedrun.run и переживает смену сцен (главы). Пока забег идёт, обычное сохранение не читается и не пишется,
// рекорды боссов не трогаются. RTA — настенные часы с первого движения до последнего удара финального босса,
// IGT — только время, когда игра не на паузе и не в лавке. Без бэкенда результаты честны лишь на слово:
// код защищает от опечаток, но не от подделки.
const SR_CATS = {
  trail: { id: 'trail', name: 'Тропа целиком', tags: ['Гл. I', 'Гл. II', 'Гл. III', 'Гл. IV'],
    about: 'Главы I–IV подряд, с нуля. Лавка и бусины разрешены. Сплит — на смерти босса каждой главы.' },
  boss: { id: 'boss', name: 'Босс-раш', tags: ['Корнематка', 'Миша', 'Владик', 'Тима'],
    about: 'Четыре босса подряд: Корнематка, Миша, Владик, Тима. Все способности открыты, лавки нет.' },
};
const SR_BOSS_NAMES = ['Корнематка', 'Миша', 'Владик', 'Тима'];

const Speedrun = {
  run: null, race: null,
  clock: () => performance.now(),
  active() { return !!this.run; },

  // ----- время -----
  p2(n) { return String(n).padStart(2, '0'); },
  fmt(ms) {
    const cs = Math.max(0, Math.floor(ms / 10)), h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, s = Math.floor(cs / 100) % 60, c = cs % 100;
    return h ? `${h}:${this.p2(m)}:${this.p2(s)}.${this.p2(c)}` : `${Math.floor(cs / 6000)}:${this.p2(s)}.${this.p2(c)}`;
  },
  fmtD(ms) { // дельта: +0:12.4 / -0:03.2
    const a = Math.abs(ms), t = Math.floor(a / 100), m = Math.floor(t / 600), s = Math.floor(t / 10) % 60;
    return `${ms < 0 ? '-' : '+'}${m}:${this.p2(s)}.${t % 10}`;
  },
  parseTime(str) { // «1:02:03.45» → сотые доли секунды
    const [a, c] = str.split('.'), parts = a.split(':').map(Number);
    let s = 0; for (const p of parts) s = s * 60 + p;
    return s * 100 + Number(c);
  },
  rta() { const r = this.run; if (!r || r.t0 == null) return 0; return (r.end != null ? r.end : this.clock()) - r.t0; },

  // ----- правила честности -----
  violation() {
    const v = [];
    if (Settings.s.easy) v.push('Лёгкий режим');
    if ((Settings.s.speed || 100) !== 100) v.push(`Замедление игры (${Settings.s.speed} %)`);
    return v;
  },
  fixRules() { Settings.s.easy = false; Settings.s.speed = 100; Settings.save(); },

  // ----- хранилище -----
  store() { try { return JSON.parse(localStorage.getItem('tt_sr') || '{}') || {}; } catch (_) { return {}; } },
  saveStore(o) { try { localStorage.setItem('tt_sr', JSON.stringify(o)); } catch (_) { } },
  rec(cat) { const s = this.store(); return s[cat] || { pb: null, seg: [] }; },
  putRec(cat, r) { const s = this.store(); s[cat] = r; this.saveStore(s); },
  friends() { try { const a = JSON.parse(localStorage.getItem('tt_sr_friends') || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } },
  saveFriends(a) { try { localStorage.setItem('tt_sr_friends', JSON.stringify(a)); } catch (_) { } },
  myName() { try { return (localStorage.getItem('tt_sr_name') || '').slice(0, 20); } catch (_) { return ''; } },
  setMyName(n) { try { localStorage.setItem('tt_sr_name', n.slice(0, 20)); } catch (_) { } },

  // ----- код результата и текст для друзей -----
  // e: { ver, cat, rta, igt (сотые доли секунды), deaths, splits: [сотые] }
  code(e) {
    const s = 'tropa-tkachei/' + e.ver + '/' + [e.ver, e.cat, e.rta, e.igt, e.deaths, e.splits.join(',')].join('|');
    let h = 0x811c9dc5;
    for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
    return ((h >>> 0) & 0xffffff).toString(16).toUpperCase().padStart(6, '0');
  },
  entryOf(res) {
    const cs = (ms) => Math.floor(ms / 10);
    return { ver: res.ver, cat: res.cat, rta: cs(res.rta), igt: cs(res.igt), deaths: res.deaths, splits: res.splits.map((s) => cs(s.rta)) };
  },
  text(e, name) {
    const f = (cs) => this.fmt(cs * 10);
    return `${name ? name + ': ' : ''}ТТ v${e.ver} ${SR_CATS[e.cat].name} ${f(e.rta)} (IGT ${f(e.igt)}) обрывов ${e.deaths} · сплиты ${e.splits.map(f).join(' / ')} · код ${this.code(e)}`;
  },
  // разбор строки друга: { ok:true, e } или { ok:false, err }
  parse(line) {
    const T = '\\d+(?::\\d\\d)*\\.\\d\\d';
    const m = new RegExp(`^(.*?)\\s*ТТ v(\\d+(?:\\.\\d+)*) (Тропа целиком|Босс-раш) (${T}) \\(IGT (${T})\\) обрывов (\\d+) · сплиты ([\\d:./ ]+?) · код ([0-9A-Fa-f]{6})\\s*$`).exec(line.trim());
    if (!m) return { ok: false, err: 'не похоже на результат (нужна строка из «Скопировать результат»)' };
    const cat = m[3] === 'Босс-раш' ? 'boss' : 'trail';
    const e = { ver: m[2], cat, rta: this.parseTime(m[4]), igt: this.parseTime(m[5]), deaths: +m[6], splits: m[7].trim().split(/\s*\/\s*/).map((x) => this.parseTime(x)) };
    if (e.splits.length !== 4 || e.splits.some((x) => !(x >= 0))) return { ok: false, err: 'неверный список сплитов' };
    if (this.code(e) !== m[8].toUpperCase()) return { ok: false, err: 'код не совпал: вероятна опечатка при копировании' };
    for (let i = 1; i < 4; i++) if (e.splits[i] < e.splits[i - 1]) return { ok: false, err: 'сплиты идут не по порядку' };
    if (e.splits[3] !== e.rta) return { ok: false, err: 'итог не равен последнему сплиту' };
    const name = m[1].replace(/[\s:·\-—]+$/g, '').trim().slice(0, 24);
    return { ok: true, e, name: name || 'Без имени', code: m[8].toUpperCase() };
  },

  // ----- запуск и ход забега -----
  dataFor(cat) {
    const camp = cat === 'boss' ? { ch: 1, st: 'level', beads: 0, abil: { double: true }, up: Campaign.freshUp(), time: 0, deaths: 0 } : Campaign.fresh();
    return { players: 1, mode: 'story', online: null, camp };
  },
  begin(cat, race) {
    this.run = { cat, t0: null, end: null, igt: 0, splits: [], deaths: 0, done: false, taint: null, hold: !!race, cd: '', race: race || null, result: null };
    return this.dataFor(cat);
  },
  start() { const r = this.run; if (r && r.t0 == null) { r.t0 = this.clock(); r.igt = 0; } },
  // сплит на смерти босса текущей главы; последняя глава завершает забег
  onSplit(gs) {
    const r = this.run; if (!r || !gs.sr || r.done || r.t0 == null) return;
    const i = Math.max(0, (gs.camp ? gs.camp.ch : 1) - 1);
    if (r.splits.length > i) return;
    r.splits[i] = { rta: this.rta(), igt: Math.round(r.igt) };
    if (!r.taint) {
      const rec = this.rec(r.cat), prev = i ? r.splits[i - 1].rta : 0, seg = r.splits[i].rta - prev;
      if (!rec.seg[i] || seg < rec.seg[i]) { rec.seg[i] = seg; this.putRec(r.cat, rec); }
    }
    if (i >= 3) this.finish(gs); else if (gs.ui().ready) gs.ui().toast(`Сплит: ${SR_CATS[r.cat].tags[i]} · ${this.fmt(r.splits[i].rta)}`, 2.4);
  },
  finish(gs) {
    const r = this.run; r.done = true; r.end = this.clock();
    const rta = r.end - r.t0; r.splits[r.splits.length - 1].rta = rta;
    const res = { cat: r.cat, ver: GAME_VERSION, rta, igt: Math.round(r.igt), deaths: r.deaths, splits: r.splits.map((s) => ({ ...s })), taint: r.taint, newPb: false, pbPrev: null };
    const rec = this.rec(r.cat); res.pbPrev = rec.pb ? JSON.parse(JSON.stringify(rec.pb)) : null;
    if (!r.taint && (!rec.pb || rta < rec.pb.rta)) {
      res.newPb = true;
      rec.pb = { rta, igt: res.igt, deaths: r.deaths, splits: res.splits, ver: GAME_VERSION, date: Date.now() };
      this.putRec(r.cat, rec);
    }
    r.result = res;
    if (r.race) Net.send({ t: 'race', k: 'fin', rta, igt: res.igt, deaths: r.deaths });
    Snd.play('win');
  },
  // каждый кадр игры (после основного update)
  tick(gs, delta) {
    const r = this.run; if (!r || !gs.sr) return;
    if (r.hold) return;
    if (r.t0 == null && !r.race) {
      const raw = gs.players[0] && gs.players[0].raw;
      if (raw && (raw.left || raw.right || raw.up || raw.down || raw.jump || raw.atk || raw.dash || raw.heal || raw.bomb)) this.start();
    }
    if (r.t0 != null && !r.done && !gs.paused && !gs.shopOpen) r.igt += Math.min(delta, 500);
    if (!r.taint && !r.done) { const v = this.violation(); if (v.length) r.taint = v.join(', '); }
    if (r.race) this.raceSend(gs);
  },
  leave() { // выход в меню: забег прерван
    if (this.race) { Net.send({ t: 'race', k: 'bye' }); this.race = null; }
    this.run = null;
  },
  restartRun(ui) {
    const r = this.run; if (!r) return;
    if (r.race) { ui.toast('В гонке нельзя начать заново'); return; }
    const data = this.begin(r.cat);
    ui.ready = false; ui.scene.stop('bg'); ui.scene.start('game', data);
  },
  // переход в следующую главу/к следующему боссу без экрана победы
  advance(gs) {
    const r = this.run, c = gs.camp, snap = Campaign.snap(gs);
    gs.won = true; Snd.play('win');
    const next = r.cat === 'boss' ? { ...snap, ch: c.ch + 1, st: 'arena', beads: 0, abil: { double: true }, up: Campaign.freshUp() } : { ...snap, ch: c.ch + 1, st: 'road' };
    Campaign.go(gs, next);
  },

  // ----- копирование в буфер обмена -----
  copy(str, done) {
    const fb = () => {
      try {
        const ta = document.createElement('textarea'); ta.value = str; ta.style.cssText = 'position:fixed;left:-999px;top:0';
        document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); done(ok);
      } catch (_) { done(false); }
    };
    try { navigator.clipboard.writeText(str).then(() => done(true), fb); } catch (_) { fb(); }
  },

  // ----- табличка «Соперник» -----
  rivalInfo() {
    const R = this.race, r = this.run; if (!R || !r) return null;
    if (R.fin) return { text: `Соперник финишировал: ${this.fmt(R.fin.rta)}`, col: '#ffd47a' };
    if (R.lost) return { text: 'Соперник: связь потеряна', col: '#d28a6a' };
    const o = R.oppProg; if (!o) return { text: 'Соперник: ждём данных…', col: '#86a89a' };
    const ch = r.cat === 'boss' ? SR_BOSS_NAMES[o.c - 1] : `Глава ${CHAPTERS[o.c] ? CHAPTERS[o.c].roman : o.c}`;
    const mine = r.splits.map((s) => s.rta), th = o.sp || [], m = mine.length, n = th.length;
    const myNow = this.rta(), thNow = o.el + (this.clock() - o.at);
    let lead = null; // плюс — соперник впереди
    if (m === n && n > 0) lead = mine[n - 1] - th[n - 1];
    else if (m < n) lead = myNow - th[m];
    else if (m > n) lead = mine[n] - thNow;
    if (lead == null || r.t0 == null) return { text: `Соперник: ${ch}`, col: '#b9d4c8' };
    return { text: `Соперник: ${ch} · ${this.fmtD(lead)} ${lead >= 0 ? 'впереди' : 'позади'}`, col: lead >= 0 ? '#ff9a8a' : '#9ff0c8' };
  },
  raceBanner() {
    const R = this.race, r = this.run; if (!R || !r || !r.result) return null;
    const mine = r.result.rta;
    if (R.fin) {
      const d = R.fin.rta - mine;
      if (Math.abs(d) < 10) return { text: 'НИЧЬЯ', sub: 'время совпало до сотых', col: '#ffd47a' };
      return d > 0 ? { text: 'ПОБЕДА', sub: `быстрее соперника на ${this.fmt(d)} (его время ${this.fmt(R.fin.rta)})`, col: '#9ff0c8' }
        : { text: 'ПОРАЖЕНИЕ', sub: `медленнее соперника на ${this.fmt(-d)} (его время ${this.fmt(R.fin.rta)})`, col: '#ff9a8a' };
    }
    if (R.lost) return { text: 'Связь потеряна', sub: 'результат соперника неизвестен', col: '#d28a6a' };
    return { text: 'Финиш!', sub: 'ждём, когда соперник закончит…', col: '#ffe3a3' };
  },
};

// ===== изоляция от обычного прогресса, честные настройки =====
(function () {
  const S = Settings;
  const progO = S.progress, saveO = S.saveProgress, resetO = S.resetProgress;
  S.progress = function () { return Speedrun.run ? null : progO.call(this); };
  S.saveProgress = function (p) { if (!Speedrun.run) saveO.call(this, p); };
  S.resetProgress = function () { if (!Speedrun.run) resetO.call(this); };
  const putO = Records.put;
  Records.put = function (id, r) { if (!Speedrun.run) putO.call(this, id, r); };
  const spO = Access.speed;
  Access.speed = function () { return Speedrun.run ? 1 : spO.call(this); };
  // во время забега лёгкий режим и замедление в настройках заблокированы
  const showO = S.show;
  S.show = function (cb) {
    showO.call(this, cb);
    const lock = !!Speedrun.run, el = document.getElementById('settings');
    document.getElementById('st-easy').disabled = lock;
    el.querySelectorAll('[name=st-speed]').forEach((r) => { r.disabled = lock; });
    let note = document.getElementById('st-srnote');
    if (lock && !note) {
      note = document.createElement('p'); note.id = 'st-srnote'; note.style.cssText = 'margin:0;color:#ffb48a;font-size:13px';
      note.textContent = 'Идёт забег: лёгкий режим и замедление игры заблокированы.';
      el.querySelector('h2').after(note);
    }
    if (note) note.hidden = !lock;
  };
  // сплиты на смерти боссов
  const P = GameScene.prototype;
  for (const fn of ['killBoss', 'mishaDie', 'vladikDie', 'timaDie']) {
    const f = P[fn]; if (!f) continue;
    P[fn] = function (...a) {
      const was = this.boss && this.boss.state;
      const out = f.apply(this, a);
      if (this.sr) {
        Speedrun.onSplit(this);
        // в босс-раше у Корнематки нет пути к выходу: переходим к Мише сами, как у остальных боссов
        if (this.sr.cat === 'boss' && fn === 'killBoss' && was !== 'dead' && !this.sr.done) this.time.delayedCall(3300, () => { if (!this.won) this.win(); });
      }
      return out;
    };
  }
  const wipeO = P.teamWipe;
  P.teamWipe = function () { const w = this.wiping; wipeO.call(this); if (!w && this.wiping && this.sr && !this.sr.done) this.sr.deaths++; };
  const initO = P.init;
  P.init = function (data) { this.sr = Speedrun.run || null; return initO.call(this, data); };
  const createO = P.create;
  P.create = function (...a) {
    this.srGhost = null; this.srGhostTag = null; this.srGhostPos = null;
    createO.apply(this, a);
    const r = this.sr; if (!r) return;
    if (r.cat === 'boss' && this.camp && this.camp.st === 'level' && this.L.boss && this.L.boss.trigger != null) {
      // босс-раш: сразу к арене Корнематки
      const tr = this.L.boss.trigger, by = (this.L.boss.y + 1) * T;
      this.respawn = { x: (tr - 1) * T, y: by };
      for (const p of this.players) { p.x = (tr + 1) * T + p.i * 20; p.y = by - 26; p.vx = p.vy = 0; p.safeX = p.x; p.safeY = p.y; }
      this.camX = this.players[0].x; this.camY = this.players[0].y - 80; this.cameras.main.centerOn(this.camX, this.camY);
    }
    if (r.race) Speedrun.sceneReady(this);
  };
  // до сигнала «пошёл» герой стоит, нажатия не копятся
  const rawO = P.rawInput, tapO = P.onKeyTap, touchO = P.onTouchTap;
  P.rawInput = function (i) {
    if (this.sr && this.sr.hold) return { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false };
    return rawO.call(this, i);
  };
  P.onKeyTap = function (e) { if (!(this.sr && this.sr.hold)) tapO.call(this, e); };
  P.onTouchTap = function (act) { if (!(this.sr && this.sr.hold)) touchO.call(this, act); };
  const updO = P.update;
  P.update = function (time, delta) { const out = updO.call(this, time, delta); if (this.sr) Speedrun.tick(this, delta); return out; };
  // выход из главы: в забеге экрана победы нет
  const winO = P.win;
  P.win = function () {
    const r = this.sr;
    if (r && !this.won && !(this.camp && this.camp.st === 'road')) {
      if (!r.done && this.camp && this.camp.ch >= 4) Speedrun.onSplit(this);
      if (r.done) { this.won = true; this.ui().srResult(); return; }
      Speedrun.advance(this); return;
    }
    return winO.call(this);
  };
  // в босс-раше лавки нет
  const shopO = Campaign.openShop;
  Campaign.openShop = function (gs, p) {
    if (gs.sr && gs.sr.cat === 'boss') { gs.ui().toast('В босс-раше лавка закрыта'); return; }
    return shopO.call(this, gs, p);
  };
  // призрак соперника
  const renderO = P.render;
  P.render = function (dt) { renderO.call(this, dt); if (this.sr && this.sr.race) Speedrun.drawGhost(this, dt); };
})();

// ===== гонка 1×1: каждый играет свою симуляцию, по сети идут только готовность, отсчёт, прогресс и финиш =====
Object.assign(Speedrun, {
  rmsg(o) { Net.send({ t: 'race', ...o }); },
  // комната гонки открывается у хоста при подключении гостя, у гостя — по приветствию хоста
  raceOpen(role, hello) {
    if (this.race) return;
    this.race = { role, cat: hello && SR_CATS[hello.cat] ? hello.cat : (this.lastCat || 'trail'), me: false, opp: false, peerVer: hello ? hello.ver : null, lost: false, rtt: null,
      hostLoaded: false, oppLoaded: false, state: 'room', oppProg: null, fin: null, sentAt: 0 };
    Net.onClose = () => this.peerLost();
    if (typeof Lobby !== 'undefined' && Lobby.el) Lobby.hide(false);
    this.roomBuild(); this.roomShow();
    if (role === 'host') this.rmsg({ k: 'hello', ver: GAME_VERSION, cat: this.race.cat });
    else this.rmsg({ k: 'hi', ver: GAME_VERSION });
    this.pingT = setInterval(() => { const R = this.race; if (!R || R.state !== 'room') { clearInterval(this.pingT); return; } if (R.role === 'host') this.rmsg({ k: 'ping', t: performance.now() }); }, 1000);
  },
  onNet(m) {
    if (m.k === 'hello' && !this.race && Net.role === 'guest') { this.raceOpen('guest', m); return; }
    const R = this.race; if (!R) return;
    switch (m.k) {
      case 'hi': R.peerVer = m.ver; this.roomRefresh(); break;
      case 'cat': if (SR_CATS[m.cat]) { R.cat = m.cat; R.me = false; R.opp = false; this.roomRefresh(); } break;
      case 'ready': R.opp = !!m.v; this.roomRefresh(); this.maybeStart(); break;
      case 'prep': if (R.role === 'guest' && R.state === 'room') { R.cat = m.cat; this.beginRace(); } break;
      case 'loaded': R.oppLoaded = true; this.tryCount(); break;
      case 'cd': if (this.run) this.run.cd = String(m.n); Snd.play('bead'); break;
      case 'go': if (R.role === 'guest') this.release(); break;
      case 'ping': this.rmsg({ k: 'pong', t: m.t }); break;
      case 'pong': { const d = performance.now() - m.t; R.rtt = R.rtt == null ? d : Math.min(R.rtt * 0.7 + d * 0.3, R.rtt + 30); break; }
      case 'prog': R.oppProg = { c: m.c, s: m.s, x: m.x, y: m.y, f: m.f, g: m.g, vx: m.vx, vy: m.vy, d: m.d, el: m.el, sp: m.sp || [], dn: m.dn, at: this.clock() }; break;
      case 'fin': R.fin = { rta: m.rta, igt: m.igt, deaths: m.deaths }; if (this.run && !this.run.done) { const u = window.__game.scene.getScene('ui'); if (u && u.ready) u.toast(`Соперник финишировал: ${this.fmt(m.rta)}`, 4); } break;
      case 'bye': R.lost = true; this.peerLost(); break;
    }
  },
  peerLost() {
    const R = this.race; if (!R) return;
    R.lost = true;
    if (R.state === 'room') this.roomRefresh();
    else if (this.run && this.run.hold) this.release(); // до старта связь пропала — не стоим вечно
  },
  maybeStart() {
    const R = this.race;
    if (!R || R.role !== 'host' || R.state !== 'room' || !R.me || !R.opp || R.lost || R.peerVer !== GAME_VERSION) return;
    this.rmsg({ k: 'prep', cat: R.cat }); this.beginRace();
  },
  beginRace() {
    const R = this.race; R.state = 'loading'; clearInterval(this.pingT);
    this.roomHide();
    const data = this.begin(R.cat, R);
    const menu = window.__game.scene.getScene('menu');
    if (!menu || !menu.sys.isActive()) return;
    menu.leaving = true; Snd.init(); Snd.play('bench');
    this.run.cd = 'Загрузка…';
    menu.cameras.main.fadeOut(450, 3, 8, 7);
    menu.time.delayedCall(460, () => menu.scene.start('game', data));
  },
  sceneReady() {
    const R = this.race, r = this.run; if (!R || !r || !r.hold || R.loadedSent) return;
    R.loadedSent = true; r.cd = 'Ждём соперника…';
    if (R.role === 'host') { R.hostLoaded = true; this.tryCount(); } else this.rmsg({ k: 'loaded' });
    if (R.lost) this.release();
  },
  // общий отсчёт ведёт хост: 3, 2, 1, пошёл; сам стартует с поправкой на половину пинга, чтобы старт был одновременным
  tryCount() {
    const R = this.race, r = this.run;
    if (!R || !r || R.role !== 'host' || R.counting || !R.hostLoaded || !R.oppLoaded) return;
    R.counting = true; let n = 3;
    const step = () => {
      if (!this.run || this.race !== R) return;
      if (n > 0) { r.cd = String(n); this.rmsg({ k: 'cd', n }); Snd.play('bead'); n--; setTimeout(step, 1000); }
      else { this.rmsg({ k: 'go' }); setTimeout(() => this.release(), Math.min(400, (R.rtt || 0) / 2)); }
    };
    step();
  },
  release() {
    const r = this.run; if (!r || !r.hold) return;
    r.hold = false; r.t0 = this.clock(); r.igt = 0; r.cd = 'ПОШЁЛ!'; Snd.play('revive');
    setTimeout(() => { if (r.cd === 'ПОШЁЛ!') r.cd = ''; }, 900);
  },
  raceSend(gs) {
    const R = this.race; if (!R || R.lost) return;
    const now = performance.now(); if (now - R.sentAt < 100) return; R.sentAt = now;
    const p = gs.players[0], r = this.run;
    this.rmsg({ k: 'prog', c: gs.camp ? gs.camp.ch : 1, s: gs.camp ? gs.camp.st : 'level', x: Math.round(p.x), y: Math.round(p.y), f: p.face, g: p.onGround ? 1 : 0,
      vx: Math.round(p.vx), vy: Math.round(p.vy), d: p.dashT > 0 ? 1 : 0, el: Math.round(this.rta()), sp: r.splits.map((s) => s.rta), dn: r.done ? 1 : 0 });
  },
  // полупрозрачный силуэт соперника, если он в той же главе и на том же этапе
  drawGhost(gs, dt) {
    const R = this.race, o = R && R.oppProg;
    if (!gs.srGhost || !gs.srGhost.scene) {
      gs.srGhost = gs.add.graphics().setDepth(4.8);
      gs.srGhostTag = gs.add.text(0, 0, 'Соперник', { fontFamily: '"Fira Sans", sans-serif', fontSize: '10px', fontStyle: '600', color: '#ffd9a0' }).setOrigin(0.5).setDepth(4.9);
      gs.srGhostPos = null;
    }
    const g = gs.srGhost, tag = gs.srGhostTag, same = o && !R.lost && !R.fin && this.clock() - o.at < 3000 && gs.camp && o.c === gs.camp.ch && o.s === gs.camp.st;
    g.clear();
    if (!same) { tag.setVisible(false); gs.srGhostPos = null; return; }
    let gp = gs.srGhostPos;
    if (!gp) gp = gs.srGhostPos = { x: o.x, y: o.y };
    const k = Math.min(1, dt * 12), ex = o.x + (o.vx || 0) * Math.min(0.2, (this.clock() - o.at) / 1000), ey = o.y + (o.vy || 0) * Math.min(0.2, (this.clock() - o.at) / 1000);
    gp.x += (ex - gp.x) * k; gp.y += (ey - gp.y) * k;
    const cx = gp.x + 7, fy = gp.y + 26, run = o.g && Math.abs(o.vx) > 10, ph = gs.animT * 14;
    g.setPosition(cx, fy); g.setAlpha(0.38);
    drawWeaver(g, 0, 0, o.f || 1, PAL[1], { leg: run ? Math.sin(ph) * 5 : (o.g ? 0 : 2), bob: run ? Math.abs(Math.sin(ph)) * 1.5 : 0, sway: run ? -4 : (!o.g ? (o.vy < 0 ? -2 : 3) : 0), lift: (!o.g && o.vy > 0) ? -4 : 0 }, 1);
    tag.setVisible(true).setAlpha(0.6).setPosition(cx, fy - 52);
  },

  // ----- комната ожидания гонки (HTML поверх игры) -----
  css() {
    if (document.getElementById('sr-css')) return;
    const st = document.createElement('style'); st.id = 'sr-css';
    st.textContent = `.sr-ov{position:fixed;inset:0;z-index:7;display:grid;place-items:center;overflow-y:auto;background:rgba(3,8,7,.86);padding:16px}
.sr-ov .card{width:min(620px,100%);background:#0c1815;border:1px solid #24433a;border-radius:10px;padding:18px 22px 16px;display:grid;gap:10px;margin-block:auto;color:#cfe2d8;font:14px/1.45 var(--body)}
.sr-ov h2{font:700 32px var(--display);margin:0;color:var(--bone)}.sr-ov h3{font:700 22px var(--display);margin:6px 0 2px;color:var(--ember)}
.sr-ov .lead{margin:0;color:var(--muted);font-size:13px}.sr-ov .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.sr-ov button{font:600 14px var(--body);border-radius:7px;padding:9px 14px;cursor:pointer;border:1px solid #3a6b5a;background:#143029;color:var(--bone)}
.sr-ov button:hover:not(:disabled){background:#1b3f35}.sr-ov button:disabled{opacity:.45;cursor:default}
.sr-ov button.primary{background:var(--moss);border-color:var(--moss);color:#08130f}.sr-ov button.on{background:var(--moss);color:#08130f;border-color:var(--moss)}
.sr-ov button.ghost{background:transparent;border-color:transparent;color:var(--muted)}
.sr-ov input,.sr-ov textarea{font:14px var(--body);background:#08130f;color:var(--bone);border:1px solid #2c5246;border-radius:6px;padding:7px 9px;width:100%;box-sizing:border-box}
.sr-ov textarea{resize:vertical;min-height:84px;font-size:12px}.sr-ov .bad{color:#ffb48a}.sr-ov .good{color:#9ff0c8}
.sr-ov table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.sr-ov th{color:var(--muted);font-weight:400;text-align:left;padding:3px 6px;border-bottom:1px solid #1d3630}
.sr-ov td{padding:4px 6px;border-bottom:1px solid #12251f}.sr-ov tr.me td{background:rgba(159,240,200,.1);color:#fff}.sr-ov td.x{text-align:right}
.sr-ov button.del{padding:0 6px;font-size:12px}.sr-ov label.nm{display:grid;gap:4px;font-size:12px;color:var(--muted)}`;
    document.head.appendChild(st);
  },
  roomBuild() {
    this.css();
    let el = document.getElementById('sr-room'); if (el) return;
    el = document.createElement('div'); el.id = 'sr-room'; el.className = 'sr-ov'; el.hidden = true;
    el.innerHTML = `<div class="card" role="dialog" aria-labelledby="sr-rt"><h2 id="sr-rt">Гонка 1×1</h2>
<p class="lead">Оба играют один и тот же забег одновременно, каждый в своей игре. По сети идут только готовность, отсчёт, ваше положение и итог.</p>
<div class="row" id="sr-rcat"></div><div id="sr-rst"></div><div id="sr-rwarn" class="bad"></div>
<div class="row"><button id="sr-ready" class="primary" type="button">Готов</button><button id="sr-rfix" type="button" hidden>Отключить запрещённые настройки</button></div>
<div class="row"><button id="sr-rleave" class="ghost" type="button">← Выйти из комнаты</button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.raceLeave(); });
    el.querySelector('#sr-ready').onclick = () => { const R = this.race; if (!R || R.state !== 'room') return; R.me = !R.me; this.rmsg({ k: 'ready', v: R.me }); this.roomRefresh(); this.maybeStart(); };
    el.querySelector('#sr-rleave').onclick = () => this.raceLeave();
    el.querySelector('#sr-rfix').onclick = () => { this.fixRules(); this.roomRefresh(); };
  },
  roomShow() { const el = document.getElementById('sr-room'); el.hidden = false; this.roomRefresh(); setTimeout(() => document.getElementById('sr-ready').focus(), 0); },
  roomHide() { const el = document.getElementById('sr-room'); if (el) el.hidden = true; },
  roomRefresh() {
    const R = this.race, el = document.getElementById('sr-room'); if (!R || !el || el.hidden) return;
    const catBox = el.querySelector('#sr-rcat'); catBox.innerHTML = '';
    for (const id of ['trail', 'boss']) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = SR_CATS[id].name; if (R.cat === id) b.className = 'on';
      b.disabled = R.role !== 'host' || R.state !== 'room';
      b.onclick = () => { R.cat = id; R.me = false; R.opp = false; this.rmsg({ k: 'cat', cat: id }); this.roomRefresh(); };
      catBox.appendChild(b);
    }
    const v = this.violation(), vm = R.peerVer && R.peerVer !== GAME_VERSION;
    const warn = [];
    if (R.lost) warn.push('Соперник отключился. Выйдите и создайте комнату заново.');
    if (vm) warn.push(`Версии игры различаются (у вас ${GAME_VERSION}, у соперника ${R.peerVer}): обновите страницу, иначе гонка не начнётся.`);
    if (v.length) warn.push(`Запрещено в спидране: ${v.join(', ')}.`);
    el.querySelector('#sr-rwarn').textContent = warn.join(' ');
    el.querySelector('#sr-rfix').hidden = !v.length;
    const rtt = R.rtt != null ? ` · пинг ~${Math.round(R.rtt)} мс` : '';
    el.querySelector('#sr-rst').innerHTML = `<div>${R.role === 'host' ? 'Вы — хост: категорию выбираете вы.' : 'Категорию выбирает хост: ' + SR_CATS[R.cat].name + '.'}${rtt}</div>
<div class="${R.me ? 'good' : ''}">Вы: ${R.me ? 'готов' : 'не готов'}</div><div class="${R.opp ? 'good' : ''}">Соперник: ${R.lost ? 'нет связи' : R.opp ? 'готов' : 'не готов'}</div>
<div class="lead">${SR_CATS[R.cat].about}</div>`;
    const btn = el.querySelector('#sr-ready');
    btn.textContent = R.me ? 'Не готов' : 'Готов'; btn.disabled = R.lost || v.length > 0 || vm || R.state !== 'room';
  },
  raceLeave() {
    const R = this.race; clearInterval(this.pingT);
    if (R) this.rmsg({ k: 'bye' });
    this.race = null; this.run = null; Net.onClose = null; Net.close();
    this.roomHide();
    const menu = window.__game.scene.getScene('menu'); if (menu) menu.leaving = false;
  },

  // ----- таблица друзей (HTML поверх игры) -----
  friendsOpen(last) {
    this.css();
    let el = document.getElementById('sr-fr');
    if (!el) {
      el = document.createElement('div'); el.id = 'sr-fr'; el.className = 'sr-ov'; el.hidden = true;
      el.innerHTML = `<div class="card" role="dialog" aria-labelledby="sr-ft"><h2 id="sr-ft">Таблица друзей</h2>
<p class="lead">Вставьте результаты друзей по одному в строку (у друга: «Скопировать результат» на итоговом экране). Код ловит опечатки при копировании, но не подделку: без сервера честность держится на слове.</p>
<label class="nm">Ваше имя (подставится в копируемый результат)<input id="sr-name" maxlength="20" autocomplete="off" placeholder="например, Ива"></label>
<textarea id="sr-paste" spellcheck="false" placeholder="Вася: ТТ v1.4 Тропа целиком 23:41.52 (IGT 22:58.10) обрывов 3 · сплиты … · код A1B2C3"></textarea>
<div class="row"><button id="sr-add" class="primary" type="button">Добавить в таблицу</button><button id="sr-clear" type="button">Очистить чужие результаты</button></div>
<div id="sr-fmsg" role="status"></div><div id="sr-tabs"></div>
<div class="row"><button id="sr-fclose" class="ghost" type="button">← Закрыть</button></div></div>`;
      document.body.appendChild(el);
      el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.friendsClose(); });
      el.querySelector('#sr-fclose').onclick = () => this.friendsClose();
      el.querySelector('#sr-name').addEventListener('input', (e) => { this.setMyName(e.target.value); });
      el.querySelector('#sr-clear').onclick = () => { this.saveFriends([]); this.friendsMsg('Чужие результаты очищены', 'good'); this.friendsRender(); };
      el.querySelector('#sr-add').onclick = () => this.friendsAdd(el.querySelector('#sr-paste').value);
    }
    this.frLast = last || null;
    el.querySelector('#sr-name').value = this.myName();
    el.hidden = false; this.friendsMsg(''); this.friendsRender();
    setTimeout(() => el.querySelector('#sr-paste').focus(), 0);
  },
  friendsClose() { const el = document.getElementById('sr-fr'); if (el) el.hidden = true; },
  friendsMsg(t, kind) { const m = document.getElementById('sr-fmsg'); if (m) { m.textContent = t; m.className = kind || ''; m.style.whiteSpace = 'pre-line'; } },
  friendsAdd(raw) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), list = this.friends(), errs = [];
    let ok = 0, dup = 0;
    lines.forEach((l, i) => {
      const p = this.parse(l);
      if (!p.ok) { errs.push(`Строка ${i + 1}: ${p.err}`); return; }
      if (list.some((x) => x.code === p.code && x.name === p.name && x.cat === p.e.cat)) { dup++; return; }
      list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: p.name, code: p.code, ...p.e }); ok++;
    });
    this.saveFriends(list);
    if (ok) document.getElementById('sr-paste').value = '';
    this.friendsMsg([ok ? `Добавлено: ${ok}` : '', dup ? `Уже были: ${dup}` : '', ...errs].filter(Boolean).join('\n') || 'Нечего добавлять', errs.length ? 'bad' : 'good');
    this.friendsRender();
  },
  // строки таблицы по категории: друзья + ваш рекорд (+ последний забег)
  boardRows(cat) {
    const rows = this.friends().filter((x) => x.cat === cat).map((x) => ({ name: x.name, e: x, friend: x }));
    const mine = this.myName() || 'Вы', pb = this.rec(cat).pb;
    const add = (label, res) => {
      const e = { ver: res.ver, cat, rta: Math.floor(res.rta / 10), igt: Math.floor(res.igt / 10), deaths: res.deaths, splits: res.splits.map((s) => Math.floor(s.rta / 10)) };
      rows.push({ name: label, e, me: true });
    };
    if (pb) add(mine + ' (рекорд)', pb);
    const l = this.frLast;
    if (l && l.cat === cat && !l.taint && (!pb || l.rta !== pb.rta)) add(mine + ' (этот забег)', l);
    return rows.sort((a, b) => a.e.rta - b.e.rta);
  },
  friendsRender() {
    const box = document.getElementById('sr-tabs'); if (!box) return; box.innerHTML = '';
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    for (const id of ['trail', 'boss']) {
      const rows = this.boardRows(id), h = document.createElement('div');
      h.innerHTML = `<h3>${SR_CATS[id].name}</h3>` + (rows.length ? `<table><tr><th>#</th><th>Игрок</th><th>RTA</th><th>IGT</th><th>Обрывов</th><th>Версия</th><th></th></tr>${rows.map((r, i) =>
        `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${this.fmt(r.e.rta * 10)}</td><td>${this.fmt(r.e.igt * 10)}</td><td>${r.e.deaths}</td><td>${esc(r.e.ver)}${r.e.ver !== GAME_VERSION ? ' ⚠' : ''}</td><td class="x">${r.friend ? `<button class="del" data-k="${esc(r.friend.id || '')}" type="button" aria-label="Убрать">✕</button>` : ''}</td></tr>`).join('')}</table>`
        : '<div class="lead">Пока пусто: добавьте результаты друзей или пройдите забег сами.</div>');
      box.appendChild(h);
    }
    box.querySelectorAll('button.del').forEach((b) => { b.onclick = () => { const k = b.dataset.k; this.saveFriends(this.friends().filter((x) => (x.id || '') !== k)); this.friendsRender(); }; });
  },
});

// ===== интерфейс: таймер, сплиты, соперник, отсчёт, итоговый экран =====
(function () {
  const U = UIScene.prototype, M = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  // сцена интерфейса переиспользуется при каждом старте игры: старые объекты уничтожены, сбрасываем ссылки
  const createO = U.create;
  U.create = function () { this.srH = null; this.srShown = null; this.srKey = false; this.srRace = null; this.srBanner = null; createO.call(this); };
  const updO = U.update, restartO = U.restart, retryO = U.retry, winEnterO = U.winEnter;
  U.restart = function () { Speedrun.leave(); restartO.call(this); };
  U.retry = function () {
    if (this.gs.sr && Speedrun.run) { if (this.gs.won && !this.srShown) return; Speedrun.restartRun(this); return; }
    retryO.call(this);
  };
  // в забеге Space (прыжок) и Enter не должны случайно вынести в меню: выход с итогового экрана — только Enter через 1.2 с или кнопка
  U.winEnter = function () { if (this.gs.sr) return; winEnterO.call(this); };
  const setT = (t, s, col) => { if (t._v !== s) { t._v = s; t.setText(s); } if (col && t._c !== col) { t._c = col; t.setColor(col); } };
  U.update = function (time, delta) {
    updO.call(this, time, delta);
    const r = Speedrun.run, gs = this.gs;
    if (!r || !gs || !gs.sr || !this.ready) { if (this.srH) this.srH.c.setVisible(false); return; }
    if (!this.srH) {
      const x = VW - 14, c = this.add.container(0, 0).setDepth(5), mk = (px, y, size, ox, bold) => { const t = this.add.text(px, y, '', { fontFamily: M, fontSize: size + 'px', fontStyle: bold ? '700' : '400', color: '#e8e2cf' }).setOrigin(ox, 0).setShadow(0, 1, '#000', 4, false, true); c.add(t); return t; };
      this.srH = { c, rta: mk(x, 8, 30, 1, true), igt: mk(x, 42, 13, 1), rows: [0, 1, 2, 3].map((i) => ({ n: mk(x - 232, 62 + i * 17, 13, 0), t: mk(x - 72, 62 + i * 17, 13, 1), d: mk(x, 62 + i * 17, 13, 1) })),
        rival: mk(x, 136, 13, 1), big: this.add.text(VW / 2, 190, '', { fontFamily: '"Cormorant SC", Georgia, serif', fontSize: '110px', fontStyle: '700', color: '#e8e2cf' }).setOrigin(0.5).setShadow(0, 0, '#9ff0c8', 18, false, true).setDepth(6) };
    }
    const h = this.srH, cat = SR_CATS[r.cat], rec = Speedrun.rec(r.cat), pb = rec.pb;
    h.c.setVisible(!this.srShown);
    h.big.setVisible(!!r.cd && !this.srShown); setT(h.big, r.cd || '');
    const fs = r.cd && r.cd.length > 2 ? (r.cd.length > 8 ? 46 : 64) : 110;
    if (h.fs !== fs) { h.fs = fs; h.big.setFontSize(fs); }
    if (this.srShown) { Speedrun.resUpdate(this); return; }
    const rta = Speedrun.rta();
    setT(h.rta, Speedrun.fmt(rta), r.taint ? '#ff9a8a' : r.done ? '#9ff0c8' : r.t0 == null ? '#6f9586' : '#e8e2cf');
    setT(h.igt, `IGT ${Speedrun.fmt(r.igt)}${gs.paused ? ' · пауза' : ''}${r.t0 == null && !r.race ? ' · ждём первого шага' : ''}${r.taint ? ' · ВНЕ ЗАЧЁТА' : ''}`, r.taint ? '#ff9a8a' : '#86a89a');
    const cur = r.splits.length;
    h.rows.forEach((row, i) => {
      const sp = r.splits[i];
      setT(row.n, `${i === cur && !r.done ? '▸ ' : '  '}${cat.tags[i]}`, sp ? '#cfe8dc' : i === cur ? '#ffe3a3' : '#5f7a6f');
      setT(row.t, sp ? Speedrun.fmt(sp.rta) : i === cur ? Speedrun.fmt(rta) : '—', sp ? '#cfe8dc' : i === cur ? '#ffe3a3' : '#5f7a6f');
      if (sp && pb && pb.splits[i]) { const d = sp.rta - pb.splits[i].rta; setT(row.d, Speedrun.fmtD(d), d <= 0 ? '#7ff0a8' : '#ff8a7a'); } else setT(row.d, sp ? ' ' : '');
    });
    const rv = Speedrun.race ? Speedrun.rivalInfo() : null;
    setT(h.rival, rv ? rv.text : '', rv ? rv.col : null);
    h.rival.setVisible(!!rv);
  };

  // ----- итоговый экран -----
  U.srResult = function () {
    const r = Speedrun.run, res = r && r.result; if (!res || this.srShown) return;
    const D = '"Cormorant SC", Georgia, serif', F = '"Fira Sans", sans-serif', cx = VW / 2, items = [], cat = SR_CATS[res.cat];
    this.srShown = performance.now();
    Touch.show(false);
    if (!this.srKey) { this.srKey = true; this.input.keyboard.on('keydown-ENTER', () => { if (this.srShown && performance.now() - this.srShown > 1200) this.restart(); }); }
    const bg = this.add.graphics(); bg.fillStyle(0x030807, 0.96); bg.fillRect(0, 0, VW, VH); items.push(bg);
    const tx = (x, y, s, st, ox) => { const t = this.add.text(x, y, s, st).setOrigin(ox == null ? 0.5 : ox, 0); items.push(t); return t; };
    tx(cx, 18, `${cat.name} · забег окончен`, { fontFamily: D, fontSize: '38px', color: '#e8e2cf', fontStyle: '700' }).setShadow(0, 0, '#9ff0c8', 14, false, true);
    tx(cx, 62, Speedrun.fmt(res.rta), { fontFamily: M, fontSize: '56px', color: res.taint ? '#ff9a8a' : '#9ff0c8', fontStyle: '700' });
    tx(cx, 126, `RTA (настенные часы)   ·   IGT ${Speedrun.fmt(res.igt)} (без пауз и лавки)   ·   обрывов нити: ${res.deaths}`, { fontFamily: F, fontSize: '16px', color: '#b9d4c8' });
    const pb = res.pbPrev;
    let pbl = res.newPb ? (pb ? `Новый личный рекорд! Прошлый: ${Speedrun.fmt(pb.rta)} (${Speedrun.fmtD(res.rta - pb.rta)})` : 'Первый результат в этой категории: личный рекорд установлен') : pb ? `Личный рекорд: ${Speedrun.fmt(pb.rta)} (${Speedrun.fmtD(res.rta - pb.rta)})` : '';
    if (res.taint) pbl = `Вне зачёта: ${res.taint}. Рекорд не записан`;
    tx(cx, 150, pbl, { fontFamily: F, fontSize: '16px', color: res.taint ? '#ff9a8a' : res.newPb ? '#ffd47a' : '#8fb8a8', fontStyle: '600' });
    // таблица сплитов
    const cols = [cx - 250, cx - 60, cx + 40, cx + 150, cx + 250], y0 = 184;
    ['Сплит', 'RTA', 'Сегмент', 'IGT', 'к рекорду'].forEach((s, i) => tx(cols[i], y0, s, { fontFamily: F, fontSize: '12px', color: '#6f9586' }, i === 0 ? 0 : i === 4 ? 1 : 1));
    const seg = Speedrun.rec(res.cat).seg;
    res.splits.forEach((sp, i) => {
      const y = y0 + 20 + i * 24, prev = i ? res.splits[i - 1].rta : 0, sg = sp.rta - prev, best = !res.taint && seg[i] === sg;
      tx(cols[0], y, cat.tags[i], { fontFamily: M, fontSize: '16px', color: '#cfe8dc' }, 0);
      tx(cols[1], y, Speedrun.fmt(sp.rta), { fontFamily: M, fontSize: '16px', color: '#e8e2cf' }, 1);
      tx(cols[2], y, Speedrun.fmt(sg) + (best ? ' ★' : ''), { fontFamily: M, fontSize: '16px', color: best ? '#ffd47a' : '#b9d4c8' }, 1);
      tx(cols[3], y, Speedrun.fmt(sp.igt), { fontFamily: M, fontSize: '16px', color: '#86a89a' }, 1);
      if (pb && pb.splits[i]) { const d = sp.rta - pb.splits[i].rta; tx(cols[4], y, Speedrun.fmtD(d), { fontFamily: M, fontSize: '16px', color: d <= 0 ? '#7ff0a8' : '#ff8a7a' }, 1); }
    });
    // гонка
    this.srRace = Speedrun.race ? tx(cx, 312, '', { fontFamily: D, fontSize: '40px', color: '#e8e2cf', fontStyle: '700' }) : null;
    this.srRaceSub = Speedrun.race ? tx(cx, 354, '', { fontFamily: F, fontSize: '15px', color: '#b9d4c8' }) : null;
    // текст для друзей
    const e = Speedrun.entryOf(res), line = res.taint ? '' : Speedrun.text(e, Speedrun.myName());
    this.srLine = line;
    if (line) tx(cx, Speedrun.race ? 380 : 330, line, { fontFamily: M, fontSize: '11px', color: '#7fa596', align: 'center', wordWrap: { width: Math.min(VW - 60, 880) } });
    const btn = (x, y, label, fn) => {
      const t = this.add.text(x, y, label, { fontFamily: D, fontSize: '24px', color: '#cfe8dc', fontStyle: '700', backgroundColor: 'rgba(20,48,41,0.9)', padding: { x: 14, y: 6 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffd47a')); t.on('pointerout', () => t.setColor('#cfe8dc')); t.on('pointerdown', fn); items.push(t); return t;
    };
    const by = 438;
    if (line) {
      const cp = btn(cx - 190, by, 'Скопировать результат', () => Speedrun.copy(line, (ok) => { cp.setText(ok ? 'Скопировано!' : 'Выделите и скопируйте строку выше'); setTimeout(() => cp.setText('Скопировать результат'), 2200); }));
    }
    btn(cx + (line ? 190 : -120), by, 'Таблица друзей', () => Speedrun.friendsOpen(res));
    if (!Speedrun.race) btn(cx - 130, by + 52, 'Ещё раз (N)', () => this.retry());
    btn(cx + (Speedrun.race ? 0 : 130), by + 52, 'В главное меню', () => this.restart());
    this.win.add(items); this.win.setVisible(true).setAlpha(0); this.winAt = performance.now();
    this.tweens.add({ targets: this.win, alpha: 1, duration: 700 });
    this.srBanner = null; Speedrun.resUpdate(this);
  };
  // баннер гонки обновляется, когда приходит результат соперника
  Speedrun.resUpdate = function (ui) {
    if (!ui.srRace) return;
    const b = this.raceBanner(), key = b ? b.text + b.sub : '';
    if (ui.srBanner === key) return; ui.srBanner = key;
    if (b) { ui.srRace.setText(b.text).setColor(b.col); ui.srRaceSub.setText(b.sub); }
  };
})();

// ===== меню: пункт «Спидран» (клавиша 6) =====
{
  const mc = MenuScene.prototype.create;
  MenuScene.prototype.create = function () { this.srP = null; this.srUi = null; mc.call(this); };
}
Object.assign(MenuScene.prototype, {
  srBuild() {
    const D = '"Cormorant SC", Georgia, serif', F = '"Fira Sans", sans-serif', M = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', cx = VW / 2;
    const c = this.add.container(0, 0).setVisible(false).setDepth(11), s = this.srUi = {};
    const g = this.add.graphics(); g.fillStyle(0x030807, 0.985); g.fillRect(0, 0, VW, VH);
    const t = (x, y, str, st, ox) => { const o = this.add.text(x, y, str, st).setOrigin(ox == null ? 0.5 : ox, 0); c.add(o); return o; };
    c.add(g);
    t(cx, 24, 'Спидран', { fontFamily: D, fontSize: '46px', color: '#e8e2cf', fontStyle: '700' }).setShadow(0, 0, '#9ff0c8', 14, false, true);
    s.cat = 'trail';
    s.tabs = ['trail', 'boss'].map((id, i) => {
      const o = t(cx + (i ? 150 : -150), 86, SR_CATS[id].name, { fontFamily: D, fontSize: '28px', color: '#8fb8a8', fontStyle: '700' }).setInteractive({ useHandCursor: true });
      o.on('pointerdown', () => this.srSetCat(id)); return o;
    });
    s.line = this.add.graphics(); c.add(s.line);
    t(cx, 132, '← → выбрать категорию', { fontFamily: F, fontSize: '12px', color: '#6f9586' });
    s.about = t(cx, 152, '', { fontFamily: F, fontSize: '14px', color: '#cfe8dc', align: 'center', lineSpacing: 5 });
    s.rec = t(cx, 196, '', { fontFamily: M, fontSize: '13px', color: '#ffe3a3', align: 'center', lineSpacing: 4 });
    t(cx, 248, 'RTA идёт с первого шага до последнего удара финального босса. Пауза останавливает только игровое время (IGT).\nОбычное сохранение и рекорды боссов не затрагиваются. Переназначение клавиш разрешено.', { fontFamily: F, fontSize: '12.5px', color: '#86a89a', align: 'center', lineSpacing: 4 });
    s.rules = t(cx, 296, '', { fontFamily: F, fontSize: '14px', color: '#9ff0c8', align: 'center', lineSpacing: 5 });
    s.fix = t(cx, 346, 'Отключить запрещённые настройки', { fontFamily: D, fontSize: '22px', color: '#ffb48a', fontStyle: '700', backgroundColor: 'rgba(60,24,16,0.85)', padding: { x: 12, y: 5 } }).setInteractive({ useHandCursor: true });
    s.fix.on('pointerdown', () => { Speedrun.fixRules(); this.srRefresh(); });
    const mk = (y, label, fn) => {
      const o = t(cx, y, label, { fontFamily: D, fontSize: '28px', color: '#cfe8dc', fontStyle: '600' }).setInteractive({ useHandCursor: true });
      o.on('pointerover', () => { if (!o._off) o.setColor('#ffd47a'); }); o.on('pointerout', () => o.setColor(o._off ? '#5f7a6f' : '#cfe8dc')); o.on('pointerdown', fn); return o;
    };
    s.b1 = mk(386, '1 · Забег в одиночку', () => this.srStart());
    s.b2 = mk(424, '2 · Гонка 1×1 по сети', () => this.srRace());
    mk(462, '3 · Таблица друзей', () => Speedrun.friendsOpen());
    mk(496, '← Назад (Esc)', () => this.srClose()).setFontSize(22);
    this.srP = c;
    this.input.keyboard.on('keydown', (e) => {
      if (!c.visible || Settings.open || !Lobby.el.hidden || this.leaving) return;
      const k = e.key;
      if (k === '1') this.srStart(); else if (k === '2') this.srRace(); else if (k === '3') Speedrun.friendsOpen();
      else if (k === 'Escape') this.srClose();
      else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd' || k === 'A' || k === 'D' || k === 'ф' || k === 'в') this.srSetCat(s.cat === 'trail' ? 'boss' : 'trail');
    });
  },
  openSpeedrun() {
    if (this.leaving) return; Snd.init();
    if (!this.srP) this.srBuild();
    this.srSetCat(this.srUi.cat); this.srP.setVisible(true);
  },
  srClose() { if (this.srP) this.srP.setVisible(false); },
  srSetCat(id) {
    if (!this.srP) this.srBuild();
    const s = this.srUi; s.cat = id;
    s.tabs.forEach((o, i) => o.setColor(['trail', 'boss'][i] === id ? '#ffd47a' : '#8fb8a8'));
    const o = s.tabs[id === 'trail' ? 0 : 1], g = s.line; g.clear(); g.fillStyle(0xffd47a, 1); g.fillRect(o.x - o.width / 2, 118, o.width, 2);
    this.srRefresh();
  },
  srRefresh() {
    const s = this.srUi, id = s.cat, rec = Speedrun.rec(id), pb = rec.pb, f = Speedrun.fmt.bind(Speedrun);
    s.about.setText(SR_CATS[id].about);
    const best = rec.seg.length === 4 && rec.seg.every(Boolean) ? rec.seg.reduce((a, b) => a + b, 0) : 0;
    s.rec.setText(pb ? `Личный рекорд: ${f(pb.rta)}  (IGT ${f(pb.igt)}, обрывов ${pb.deaths}, v${pb.ver})\nСплиты: ${pb.splits.map((x) => f(x.rta)).join('  ')}${best ? `\nСумма лучших сегментов: ${f(best)}` : ''}` : 'Личного рекорда пока нет');
    const v = Speedrun.violation();
    s.rules.setText(`Лёгкий режим: ${Settings.s.easy ? 'ВКЛЮЧЁН — запрещено' : 'выключен'}\nЗамедление игры: ${(Settings.s.speed || 100) !== 100 ? Settings.s.speed + ' % — запрещено' : '100 %'}`);
    s.rules.setColor(v.length ? '#ff9a8a' : '#9ff0c8');
    s.fix.setVisible(v.length > 0);
    for (const b of [s.b1, s.b2]) { b._off = v.length > 0; b.setColor(v.length ? '#5f7a6f' : '#cfe8dc'); }
  },
  srStart() {
    if (this.leaving || Speedrun.violation().length) { if (!this.leaving) Snd.play('hit'); return; }
    this.leaving = true; Snd.init(); Snd.play('bench');
    const data = Speedrun.begin(this.srUi.cat);
    this.cameras.main.fadeOut(450, 3, 8, 7);
    this.time.delayedCall(460, () => this.scene.start('game', data));
  },
  srRace() {
    if (this.leaving || Speedrun.violation().length) { if (!this.leaving) Snd.play('hit'); return; }
    Speedrun.lastCat = this.srUi.cat;
    this.srClose(); this.openLobby('race');
  },
});
