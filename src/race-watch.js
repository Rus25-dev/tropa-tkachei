// ===== «ГОНКИ ТКАЧЕЙ»: ОБСЕРВЕР =====
// Окно для зрителя и для стрима (1920×1080): две равные половины с картинкой обоих игроков по телеметрии (уровень, герои, боссы, снаряды
// рисуются игровой отрисовкой; камера идёт за героем своей половины), по центру табло (таймер, имена, маски, босс, разница времени),
// внизу лента событий. До старта — карточки игроков, после гонки — разбор. Табло и лента — HTML поверх холста: чёткий текст при любом размере
// окна и при сжатии стрима. Обсервер НЕ ставится на паузу, когда окно скрыто: состояние обновляется сетевыми сообщениями, а не кадрами,
// и при возврате картинка догоняет по последней телеметрии. Подключение — тот же надёжный канал (race-net.js): обрыв и возврат без вмешательства.
const RaceWatch = {
  S: null, client: null, scene: null, started: false, lastEv: 0, feed: [], tel: {}, hist: { 1: [], 2: [] },
  tr() { return RaceNet.use(); },
  open(code, opt) {
    Speedrun.css(); this.build();
    const el = document.getElementById('rw-join'); el.hidden = false; Ov.opened(el);
    const c = el.querySelector('#rwj-code'); if (code) c.value = String(code).toUpperCase();
    if (opt && opt.auto && c.value) this.join(c.value); else setTimeout(() => c.focus(), 0);
  },
  build() {
    if (document.getElementById('rw-join')) return;
    const el = document.createElement('div'); el.id = 'rw-join'; el.className = 'sr-ov'; el.hidden = true;
    el.innerHTML = `<div class="card" role="dialog" aria-labelledby="rwj-t"><h2 id="rwj-t">Обсервер гонки</h2>
<p class="lead">Смотреть гонку Ткачей: две половины, табло и лента событий. Окно лучше держать на втором мониторе и не сворачивать: Chrome «усыпляет» скрытые окна. Для стрима откройте ссылку со <b>stream=1</b>.</p>
<label class="nm">Код комнаты<input id="rwj-code" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="например, K7P4Q"></label>
<div class="row"><button id="rwj-go" class="primary" type="button">Смотреть</button></div><div id="rwj-msg" role="status"></div>
<div class="row"><button id="rwj-back" class="ghost" type="button">← Назад</button></div></div>`;
    document.body.appendChild(el);
    Ov.chrome(el, { crumbs: ['Гонки Ткачей', 'Обсервер'], back: () => this.leave(), hint: { act: 'нажать' } });
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.leave(); if (e.key === 'Enter') this.join(el.querySelector('#rwj-code').value); });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    el.querySelector('#rwj-go').onclick = () => this.join(el.querySelector('#rwj-code').value);
    el.querySelector('#rwj-back').onclick = () => this.leave();
    el.querySelector('#rwj-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  },
  fromUrl() {
    const q = new URLSearchParams(location.search); this.stream = q.get('stream') === '1'; this.overlay = q.get('overlay') === '1';
    this.open(q.get('room') || '', { auto: !!q.get('room') });
  },
  leave() {
    if (this.client) this.client.stop(true); this.client = null; this.S = null; this.started = false;
    const el = document.getElementById('rw-join'); if (el) el.hidden = true;
    const hud = document.getElementById('rw-hud'); if (hud) hud.remove();
    if (this.silent) { try { this.silent.close(); } catch (_) { } this.silent = null; }
    clearInterval(this.hudT); this.hudT = null;
    const g = window.__game; if (g) { for (const k of ['watch']) if (g.scene.getScene(k) && g.scene.isActive(k)) g.scene.stop(k); if (!g.scene.isActive('menu')) { g.scale.setGameSize(VW, VH); g.scene.start('menu'); } const m = g.scene.getScene('menu'); if (m) m.leaving = false; }
  },
  join(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const msg = document.getElementById('rwj-msg');
    if (code.length < 4) { if (msg) { msg.textContent = 'Введите код комнаты.'; msg.className = 'bad'; } return; }
    if (this.client) this.client.stop(true);
    this.feed = []; this.tel = {}; this.hist = { 1: [], 2: [] };
    const key = (() => { try { let k = localStorage.getItem('tt_rc_wkey'); if (!k) { k = RaceNet.makeKey(); localStorage.setItem('tt_rc_wkey', k); } return k; } catch (_) { return RaceNet.makeKey(); } })();
    this.code = code;
    this.client = new RaceNet.RaceClient({
      code, key, role: 'watch', name: 'Обсервер', transport: this.tr(), hello: () => ({ ver: GAME_VERSION, room: code }),
      onWelcome: (w) => this.onWelcome(w), onMsg: (m) => this.onMsg(m), onTel: (t) => this.onTel(t), onStatus: (s, i) => this.onStatus(s, i),
    });
    this.connStatus = 'connecting'; this.client.start(); this.keepAlive();
    // табло живёт не от кадров холста: таймер и скрытое окно (Chrome не рисует кадры, но таймеры и сеть идут)
    if (!this.hudT) this.hudT = setInterval(() => { if (this.started) this.hud(); }, 100);
    if (msg) { msg.textContent = 'Подключаемся…'; msg.className = ''; }
    if (!this._pg) { this._pg = true; for (const ev of ['pagehide', 'beforeunload']) window.addEventListener(ev, () => { if (this.client) this.client.bye(); }); }
  },
  // окно не должно «засыпать»: тихий звук и блокировка Web Locks удерживают вкладку активной (WebRTC-связь уже освобождает её от глубокого троттлинга)
  keepAlive() {
    try { if (navigator.locks && !this._lock) { this._lock = true; navigator.locks.request('tropa-race-watch', () => new Promise(() => { })); } } catch (_) { }
    const arm = () => {
      if (this.silent) return;
      try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const ctx = new AC(), o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.00001; o.connect(g); g.connect(ctx.destination); o.start(); this.silent = ctx; } catch (_) { }
    };
    arm(); if (!this.silent) { const h = () => { arm(); if (this.silent) { window.removeEventListener('pointerdown', h, true); window.removeEventListener('keydown', h, true); } }; window.addEventListener('pointerdown', h, true); window.addEventListener('keydown', h, true); }
  },

  // ----- сеть -----
  onStatus(s, info) {
    this.connStatus = s; void info; this.hud();
    const msg = document.getElementById('rwj-msg'); if (msg && s === 'denied') { msg.textContent = 'Не удалось подключиться: ' + (info && info.why); msg.className = 'bad'; }
  },
  onWelcome(w) {
    const S = this.S = w.snap; S.recvAt = performance.now();
    this.tel = {}; for (const id in (S.tel || {})) this.tel[id] = { ...S.tel[id], at: performance.now() };
    if (w.resync || !this.feed.length) this.feed = (S.log || []).slice(-60);
    this.stats = S.stats || {}; this.result = S.result || null; this.begin(); this.hud();
  },
  onMsg(m) {
    if (!m || !this.S) return;
    switch (m.k) {
      case 'state': { const p = this.S; this.S = { ...p, ...m.s, tel: p.tel, log: p.log, result: p.result }; this.S.recvAt = performance.now(); if (m.s.phase === 'lobby') { this.result = null; this.stats = {}; this.tel = {}; this.hist = { 1: [], 2: [] }; } break; }
      case 'ev': this.addEv(m.e); break;
      case 'cd': this.cd = { n: m.n, at: performance.now() }; break;
      case 'go': this.cd = { n: 0, at: performance.now() }; break;
      case 'res': this.resultLite = m.r; break;
      case 'reset': this.result = null; this.stats = {}; this.resultLite = null; break;
    }
    this.hud();
  },
  onTel(t) {
    const now = performance.now();
    for (const o of (t && t.tl) || []) { const prev = this.tel[o.s]; this.tel[o.s] = { ...o, at: now }; const h = this.hist[o.s] || (this.hist[o.s] = []); h.push({ ...o, at: now }); while (h.length && now - h[0].at > 10000) h.shift(); void prev; }
  },
  addEv(e) { if (!e || (this.feed.length && this.feed[this.feed.length - 1].n >= e.n && e.n)) return; this.feed.push(e); if (this.feed.length > 200) this.feed.shift(); this.onFeed(e); },
  onFeed() { /* звук по событиям — версия 1.9 */ },

  // ----- запуск сцены -----
  begin() {
    if (this.started) return; this.started = true;
    document.body.classList.add('rw-on'); if (this.overlay) document.body.classList.add('rw-overlay');
    const el = document.getElementById('rw-join'); if (el) el.hidden = true;
    const g = window.__game, menu = g.scene.getScene('menu'); if (menu) { menu.leaving = true; if (menu.sys.isActive()) menu.scene.stop(); }
    g.scale.setGameSize(1920, 1080);
    if (!g.scene.getScene('watch')) g.scene.add('watch', WatchScene, false);
    g.scene.start('watch');
  },

  // ----- табло (HTML поверх холста) -----
  css() {
    if (document.getElementById('rw-css')) return;
    const st = document.createElement('style'); st.id = 'rw-css';
    st.textContent = `body.rw-on{background:#050a09;overflow:hidden}body.rw-overlay{background:transparent!important}body.rw-overlay canvas{opacity:0!important}
#rw-hud{position:fixed;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;z-index:5;pointer-events:none;color:#f1ecd8;font:600 24px/1.25 var(--body,"Fira Sans",system-ui,sans-serif);text-shadow:0 2px 3px #000,0 0 6px #000}
#rw-hud *{box-sizing:border-box}#rw-hud .mid{position:absolute;left:660px;width:600px;top:10px;display:grid;grid-template-columns:1fr;gap:2px;justify-items:center;background:rgba(5,12,11,.82);border:2px solid #2c5246;border-radius:14px;padding:8px 14px 10px}
#rw-hud .tm{font:800 64px/1 ui-monospace,Consolas,monospace;letter-spacing:.02em}#rw-hud .df{font:800 48px/1 ui-monospace,Consolas,monospace}#rw-hud .df.p{color:#9ff0c8}#rw-hud .df.n{color:#ff9a8a}
#rw-hud .names{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;width:100%;align-items:center;font-size:28px;font-weight:800}#rw-hud .names .a{text-align:left}#rw-hud .names .b{text-align:right}
#rw-hud .masks{font-size:26px;letter-spacing:2px}#rw-hud .st{font-size:22px;color:#cfe8dc}#rw-hud .badge{display:inline-block;background:#143029;border:2px solid #3a6b5a;border-radius:99px;padding:0 12px;font-size:22px}
#rw-hud .feed{position:absolute;left:30px;right:30px;bottom:18px;background:rgba(5,12,11,.78);border:2px solid #24433a;border-radius:12px;padding:8px 18px;min-height:56px}#rw-hud .feed div{font-size:24px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#rw-hud .feed .t{color:#8fb8a8;font-family:ui-monospace,Consolas,monospace;margin-right:10px}#rw-hud .feed .split{color:#9ff0c8}#rw-hud .feed .death{color:#ff9a8a}#rw-hud .feed .fin,#rw-hud .feed .done{color:#ffd47a}#rw-hud .feed .buy{color:#ffe3a3}#rw-hud .feed .off,#rw-hud .feed .bye{color:#d28a6a}
#rw-hud .bar{position:absolute;bottom:196px;width:420px}#rw-hud .bar .hp{height:18px;background:#2a1612;border:2px solid #000;border-radius:9px;overflow:hidden}#rw-hud .bar .hp i{display:block;height:100%;background:#ff9a3c}#rw-hud .bar span{font-size:22px}
#rw-hud .big{position:absolute;left:0;right:0;top:300px;text-align:center;font:800 220px/1 var(--display,"Cormorant SC",serif);color:#e8e2cf;text-shadow:0 0 30px #9ff0c8,0 4px 8px #000}
#rw-hud .cards{position:absolute;left:260px;right:260px;top:210px;display:grid;grid-template-columns:1fr 1fr;gap:60px}#rw-hud .card{background:rgba(5,12,11,.9);border:3px solid #3a6b5a;border-radius:18px;padding:28px 34px;text-align:center}#rw-hud .card .nm{font:800 54px var(--display,serif)}#rw-hud .card .rd{font-size:30px}
#rw-hud .conn{position:absolute;right:20px;top:112px;background:#4a2a1a;border:2px solid #d28a6a;border-radius:10px;padding:2px 14px;font-size:22px}
#rw-hud .over{position:absolute;left:150px;right:150px;top:120px;background:rgba(5,12,11,.94);border:3px solid #3a6b5a;border-radius:18px;padding:24px 34px}#rw-hud .over h2{margin:0 0 8px;font:800 52px var(--display,serif);text-align:center}
#rw-hud table{width:100%;border-collapse:collapse;font-size:26px}#rw-hud td,#rw-hud th{padding:4px 10px;border-bottom:1px solid #1d3630;text-align:right}#rw-hud th:first-child,#rw-hud td:first-child{text-align:left;color:#cfe8dc}#rw-hud th{color:#8fb8a8;font-weight:600}
#rw-hud .half{position:absolute;top:0;width:960px;height:1080px}#rw-hud .wait{position:absolute;top:480px;width:960px;text-align:center;font-size:40px;color:#8fb8a8}`;
    document.head.appendChild(st);
  },
  hud() {
    if (!this.started) return; this.css();
    let el = document.getElementById('rw-hud');
    if (!el) { el = document.createElement('div'); el.id = 'rw-hud'; document.body.appendChild(el); window.addEventListener('resize', () => this.fit()); }
    this.fit();
    const S = this.S, E = (s) => RaceOrg.esc(s), f = (ms) => Speedrun.fmt(ms), ps = (S && S.players) || [];
    const p1 = ps[0], p2 = ps[1], t1 = p1 && this.tel[p1.seat], t2 = p2 && this.tel[p2.seat];
    const masks = (t) => (t ? '●'.repeat(Math.max(0, t.hp)) + '○'.repeat(Math.max(0, t.mh - t.hp)) : '');
    const phase = S ? S.phase : 'lobby';
    const el0 = this.clockMs();
    let out = '';
    // центральное табло
    const lead = this.lead(p1, p2, t1, t2);
    const chap = (t, p) => (!t ? '' : p && p.fin ? 'финиш' : `${SR_CATS.trail.tags[Math.min(3, (t.ch || 1) - 1)]}${t.st === 'arena' ? ' · бой' : ''}`);
    out += `<div class="mid"><div class="names"><div class="a" style="color:#8fe8d2">${E(p1 ? p1.name : '—')}</div><div class="st">${phase === 'run' ? (S.pause.on ? 'ПАУЗА' : 'гонка') : phase === 'done' ? 'финиш' : ''}</div><div class="b" style="color:#ffc46e">${E(p2 ? p2.name : '—')}</div></div>
<div class="tm">${phase === 'run' || phase === 'done' ? f(el0) : phase === 'count' || phase === 'prep' ? 'старт' : '0:00.00'}</div>
<div class="df ${lead && lead.ms < 0 ? 'p' : 'n'}">${lead ? (lead.ms === 0 ? '±0.0' : Speedrun.fmtD(lead.ms)) : ' '}</div><div class="st">${lead ? E(lead.txt) : ' '}</div>
<div class="names"><div class="a masks">${masks(t1)}</div><div class="st">${E(chap(t1, p1))}${t1 && t2 ? ' · ' : ''}${E(chap(t2, p2))}</div><div class="b masks">${masks(t2)}</div></div></div>`;
    if (this.connStatus !== 'online') out += `<div class="conn">нет связи с организатором, пробуем снова…</div>`;
    // полосы боссов
    for (const [t, x] of [[t1, 20], [t2, 980]]) if (t && t.bs && t.bs.on) out += `<div class="bar" style="left:${x + 270}px"><span>${E(this.bossName(t.bs.k))} · фаза ${t.bs.ph}</span><div class="hp"><i style="width:${Math.max(0, Math.round(100 * t.bs.hp / t.bs.mh))}%"></i></div></div>`;
    // лента
    const lines = this.feed.slice(-4).map((e) => `<div class="${e.k}"><span class="t">${e.t != null ? f(e.t) : '—:--'}</span>${E(e.x)}</div>`).join('');
    out += `<div class="feed">${lines || '<div>Ждём событий…</div>'}</div>`;
    if (!S || phase === 'lobby' || phase === 'prep' || phase === 'count') {
      const card = (p, t) => `<div class="card"><div class="nm">${E(p ? p.name : 'Ждём игрока…')}</div><div class="rd">${p ? (!p.online ? 'нет связи' : phase === 'lobby' ? (p.ready ? '✔ готов' : 'не готов') : p.loaded ? '✔ загружен' : 'загружается…') : ''}</div>${p && p.rtt != null ? `<div class="st">пинг ${p.rtt} мс</div>` : ''}</div>`;
      out += `<div class="cards">${card(p1, t1)}${card(p2, t2)}</div>`;
      const cd = this.cd && this.cd.n > 0 && performance.now() - this.cd.at < 1500 ? String(this.cd.n) : this.cd && this.cd.n === 0 && performance.now() - this.cd.at < 900 ? 'ПОШЁЛ!' : '';
      if (cd) out += `<div class="big">${cd}</div>`;
      out += `<div class="mid" style="top:110px;width:auto;padding:4px 24px;left:auto;right:auto;margin:0 auto;position:absolute;inset-inline:0;max-width:760px"><div class="st">${S ? E(S.discName || 'Тропа целиком') : ''} · комната ${E(this.code)}</div></div>`;
    }
    if (phase === 'done' && (this.resultLite || this.S.result)) out += this.over();
    el.innerHTML = out;
  },
  over() {
    const E = RaceOrg.esc, f = (ms) => Speedrun.fmt(ms), r = this.S.result || this.resultLite, ps = ((this.S.players) || []);
    if (!r) return '';
    const rows = (r.players || []).slice().sort((a, b) => a.seat - b.seat);
    const A = rows[0], B = rows[1], S1 = this.stats && A && this.stats[A.seat], S2 = this.stats && B && this.stats[B.seat];
    const cell = (a, b, fmt, lowerBetter) => { const x = a == null ? '—' : fmt ? fmt(a) : a, y = b == null ? '—' : fmt ? fmt(b) : b; return `<td>${x}</td><td>${y}</td>`; };
    const mk = (label, k, fmt) => `<tr><td>${label}</td>${cell(S1 && S1[k], S2 && S2[k], fmt)}</tr>`;
    const win = r.winner === 'draw' ? 'Ничья' : r.winner != null ? 'Победил ' + E((rows.find((x) => x.seat === r.winner) || {}).name || '') : 'Гонка окончена';
    const sp = (p, i) => { const q = ps.find((x) => x.seat === p.seat); return q && q.splits && q.splits[i] != null ? f(q.splits[i]) : '—'; };
    return `<div class="over"><h2>${win}${r.awarded ? ' (присуждено)' : ''}${r.gap != null ? ' · +' + f(Math.abs(r.gap)) : ''}</h2><table><tr><th></th><th>${E(A ? A.name : '')}</th><th>${E(B ? B.name : '')}</th></tr>
<tr><td>Время</td><td>${A && !A.dnf ? f(A.time) : '—'}</td><td>${B && !B.dnf ? f(B.time) : '—'}</td></tr>
${[0, 1, 2, 3].map((i) => `<tr><td>${SR_CATS.trail.tags[i]}</td><td>${A ? sp(A, i) : ''}</td><td>${B ? sp(B, i) : ''}</td></tr>`).join('')}
${mk('Урон боссам', 'bossDmg')}${mk('DPS в боях', 'dps')}${mk('Получено урона', 'taken')}${mk('Лечений', 'heals')}${mk('Точность', 'acc', (v) => Math.round(v * 100) + ' %')}${mk('Отбивы', 'parries')}${mk('Идеальные увороты', 'dodges')}${mk('Оглушения', 'stuns')}${mk('Казни', 'execs')}${mk('Самое длинное комбо', 'combo')}${mk('Покупок в лавке', 'buys', (v) => v.length)}</table></div>`;
  },
  bossName(k) { return { k: 'Корнематка', m: 'Миша Додик', v: 'Владик Скрипка', t: 'Тима Пиво' }[k] || 'Босс'; },
  // время на табло: по часам организатора (не зависит от кадров и скрытого окна)
  clockMs() {
    const S = this.S; if (!S || !S.goAt) return 0;
    if (S.phase === 'done') { const rs = (S.result || this.resultLite || {}).players; const best = rs && rs.filter((p) => !p.dnf).map((p) => p.time); if (best && best.length) return Math.max(...best); }
    const orgNow = S.now + (performance.now() - (S.recvAt || performance.now())), pausedNow = S.pause.on && S.pause.since ? orgNow - S.pause.since : 0;
    return Math.max(0, orgNow - S.goAt - ((S.pause && S.pause.total) || 0) - pausedNow);
  },
  // разница: пока оба в одном отрезке — по сплитам; иначе лидер по отрезкам
  lead(p1, p2, t1, t2) {
    if (!p1 || !p2 || !p1.splits || !p2.splits || !this.S || this.S.phase === 'lobby') return null;
    const a = p1.splits.filter((x) => x != null), b = p2.splits.filter((x) => x != null), n = Math.min(a.length, b.length);
    if (a.length === b.length && n > 0) return { ms: a[n - 1] - b[n - 1], txt: `${SR_CATS.trail.tags[n - 1]}: ${a[n - 1] < b[n - 1] ? p1.name : p2.name} впереди` };
    if (a.length > b.length) { const el = t2 ? t2.el + (performance.now() - t2.at) : null; return el == null ? null : { ms: a[b.length] != null ? a[b.length] - el : 0, txt: `${p1.name} прошёл ${SR_CATS.trail.tags[b.length]}` }; }
    if (b.length > a.length) { const el = t1 ? t1.el + (performance.now() - t1.at) : null; return el == null ? null : { ms: el - b[a.length], txt: `${p2.name} прошёл ${SR_CATS.trail.tags[a.length]}` }; }
    return null;
  },
  fit() {
    const el = document.getElementById('rw-hud'), cv = window.__game && window.__game.canvas; if (!el || !cv) return;
    const r = cv.getBoundingClientRect(), s = r.width / 1920;
    el.style.transform = `translate(${r.left}px,${r.top}px) scale(${s})`;
  },
};

// ===== сцена обсервера: две половины =====
class WatchScene extends Phaser.Scene {
  constructor() { super('watch'); }
  create() {
    const W = 1920, H = 1080, HW = 960;
    this.views = {};
    this.cams = [this.cameras.main, this.cameras.add(HW, 0, HW, H)];
    this.cams[0].setViewport(0, 0, HW, H).setBackgroundColor('#070d0c'); this.cams[1].setBackgroundColor('#070d0c');
    this.conts = [this.add.container(0, 0), this.add.container(0, 0)];
    this.cams[0].ignore(this.conts[1]); this.cams[1].ignore(this.conts[0]);
    this.zoom = 1.55;
    // разделитель и подписи «ждём игрока» — вне камер игроков (камера по умолчанию не нужна: рисуем HTML)
    this.levels = {}; this.hint = [this.add.text(0, 0, '', {}), this.add.text(0, 0, '', {})];
    for (const h of this.hint) h.setVisible(false);
    RaceWatch.scene = this; RaceWatch.hud();
    // обсервер не засыпает при скрытом окне и потере фокуса: снимаем только стандартные паузы Phaser, на время работы сцены
    const g = this.game, E = Phaser.Core.Events;
    g.events.off(E.HIDDEN, g.onHidden, g); g.events.off(E.BLUR, g.onBlur, g);
    this.events.once('shutdown', () => { RaceWatch.scene = null; g.events.on(E.HIDDEN, g.onHidden, g); g.events.on(E.BLUR, g.onBlur, g); });
  }
  levelOf(ch, st) {
    const key = `${ch}:${st}`; if (this.levels[key]) return this.levels[key];
    let L = null;
    try {
      if (st === 'level') L = buildLevel(); else if (st === 'road') L = buildRoad(ch);
      else L = { misha: buildMishaArena, vladik: buildVladikArena, tima: buildTimaArena }[CHAPTERS[ch].boss]();
    } catch (_) { return null; }
    const chunks = L.theme === 'class' ? drawClassroom(this, L) : L.theme === 'den' ? drawDen(this, L) : drawLevelChunks(this, L), keys = [];
    for (const c of chunks) { const nk = `wv:${key}:${c.key}`; if (this.textures.exists(nk)) this.textures.remove(nk); this.textures.renameTexture(c.key, nk); keys.push({ x: c.x, key: nk }); }
    return (this.levels[key] = { L, key, chunks: keys, W: L.W * T, H: L.H * T });
  }
  viewFor(i, seat) {
    let v = this.views[seat]; if (v) return v;
    const cont = this.conts[i];
    v = this.views[seat] = { i, seat, cont, level: null, imgs: [], g: this.add.graphics(), tag: this.add.text(0, 0, '', { fontFamily: '"Fira Sans", sans-serif', fontSize: '15px', fontStyle: '700', color: PAL[i].hex }).setOrigin(0.5), wait: this.add.text(480, 500, 'Ждём данные игрока…', { fontFamily: '"Fira Sans", sans-serif', fontSize: '30px', color: '#8fb8a8' }).setOrigin(0.5), cx: 0, cy: 0, hx: null, hy: null, an: 0 };
    cont.add([v.g, v.tag]); v.g.setDepth(5); v.tag.setDepth(6);
    return v;
  }
  setLevel(v, lv) {
    for (const im of v.imgs) im.destroy(); v.imgs = [];
    v.level = lv; if (!lv) return;
    for (const c of lv.chunks) { const im = this.add.image(c.x, 0, c.key).setOrigin(0).setDepth(1); v.cont.add(im); v.imgs.push(im); }
    const cam = this.cams[v.i]; cam.setBounds(0, 0, lv.W, lv.H);
    v.hx = null;
  }
  update(time, delta) {
    const dt = Math.min(delta, 100) / 1000, S = RaceWatch.S; if (!S) return;
    const now = performance.now();
    (S.players || []).slice(0, 2).forEach((p, i) => {
      const t = RaceWatch.tel[p.seat], v = this.viewFor(i, p.seat);
      v.wait.setVisible(!t);
      if (!t) { v.g.clear(); return; }
      const key = `${t.ch}:${t.st}`;
      if (!v.level || v.level.key !== key) this.setLevel(v, this.levelOf(t.ch, t.st));
      if (!v.level) return;
      // положение героя: сглаживание и небольшой вынос по скорости (телеметрия ~15 Гц)
      const age = Math.min(0.25, (now - t.at) / 1000), ex = t.x + (t.vx || 0) * age, ey = t.y + (t.vy || 0) * age;
      if (v.hx == null) { v.hx = ex; v.hy = ey; v.cx = ex; v.cy = ey - 60; }
      const k = Math.min(1, dt * 14); v.hx += (ex - v.hx) * k; v.hy += (ey - v.hy) * k;
      const cam = this.cams[v.i]; cam.setZoom(this.zoom);
      v.cx += (v.hx + (t.f || 1) * 50 - v.cx) * Math.min(1, dt * 5); v.cy += (v.hy - 40 - v.cy) * Math.min(1, dt * 5);
      cam.centerOn(v.cx, v.cy);
      this.drawView(v, t, p, now / 1000);
    });
  }
  drawView(v, t, p, tm) {
    const g = v.g; g.clear(); g.setAlpha(1);
    const pal = PAL[v.i], f = t.f || 1;
    // враги
    for (const e of t.en || []) {
      const [type, x, y, w, h, face] = e, cx = x + w / 2, fy = y + h;
      g.fillStyle(type === 'gnat' ? 0x6a5a8a : type === 'beetle' ? 0x5a6a3a : 0x3f4a3a, 1);
      if (type === 'gnat') { g.fillEllipse(cx, y + h / 2, w, h * 0.8); g.fillStyle(0xffffff, 0.4); g.fillEllipse(cx - 6, y + h / 2 - 6, 10, 5); g.fillEllipse(cx + 6, y + h / 2 - 6, 10, 5); }
      else { g.fillRoundedRect(x, y, w, h, 6); g.fillStyle(0xff9a3c, 1); g.fillCircle(cx + (face || 1) * w * 0.25, y + h * 0.35, 2.5); }
      void fy;
    }
    // босс
    const b = t.bs;
    if (b && b.on) {
      const pal2 = { k: [0x34482f, 0x5d8a46], m: [0x4f5b78, 0xc8463c], v: [0x5a3f78, 0xe0b84a], t: [0x7a5a2a, 0xf0d070] }[b.k] || [0x444444, 0xaaaaaa];
      const cx = b.x + b.w / 2, fl = b.s === 'stun';
      g.fillStyle(0x000000, 0.25); g.fillEllipse(cx, b.y + b.h, b.w * 0.9, 12);
      g.fillStyle(fl ? 0xffffff : pal2[0], 1); g.fillRoundedRect(b.x, b.y, b.w, b.h, 16);
      g.fillStyle(pal2[1], 1); g.fillRoundedRect(b.x + b.w * 0.12, b.y + b.h * 0.12, b.w * 0.76, b.h * 0.34, 12);
      const ex = cx + (b.f || 1) * b.w * 0.22; g.fillStyle(b.ph >= 2 ? 0xff5a3c : 0xffd47a, 1); g.fillCircle(ex, b.y + b.h * 0.34, 4.5); g.fillCircle(ex - (b.f || 1) * 14, b.y + b.h * 0.34, 4);
      if (/Wind|wind|warn|tell/.test(b.s || '')) { g.lineStyle(3, 0xffe3a3, 0.85); g.strokeRoundedRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6, 18); }
      g.fillStyle(0x000000, 0.7); g.fillRect(b.x, b.y - 14, b.w, 7); g.fillStyle(0xff9a3c, 1); g.fillRect(b.x + 1, b.y - 13, (b.w - 2) * Math.max(0, b.hp / b.mh), 5);
    }
    // снаряды
    for (const q of t.pr || []) { const [kind, x, y, w, h] = q; const col = { spore: 0xc7f08a, wave: 0xd8c08a, rock: 0x9a8a7a, letter: 0xf4efe0, note: 0xffe3a3, clef: 0xe0b84a, bomb: 0x3a3f45, drip: 0x9fe0d8 }[kind] || 0xff9a8a; g.fillStyle(col, 0.95); g.fillRoundedRect(x, y, Math.max(6, w), Math.max(6, h), 3); }
    // герой
    const x = v.hx, y = v.hy, cx = x + 7, fy = y + 26, run = t.g && Math.abs(t.vx) > 10, ph = tm * 14;
    if (t.dn) { g.fillStyle(pal.cloak, 0.5); g.fillEllipse(cx, fy - 10, 30, 22); }
    else {
      const blink = t.w ? 0.4 : 1; g.setAlpha(blink);
      if (t.d) { g.fillStyle(pal.accent, 0.3); g.fillEllipse(cx - f * 18, fy - 13, 26, 18); }
      drawWeaver(g, cx, fy, f, pal, { leg: run ? Math.sin(ph) * 5 : (t.g ? 0 : 2), bob: run ? Math.abs(Math.sin(ph)) * 1.5 : 0, sway: run ? -4 : (!t.g ? (t.vy < 0 ? -2 : 3) : 0), lift: (!t.g && t.vy > 0) ? -4 : 0 }, 1);
      if (t.a) { g.lineStyle(4, 0xe8e2cf, 0.9); const r = 34; g.beginPath(); if (t.a === 2) g.arc(cx, fy - 20, r, -Math.PI * 0.95, -Math.PI * 0.05); else g.arc(cx, fy - 14, r, f > 0 ? -0.9 : Math.PI - 0.9 + 0.0, f > 0 ? 0.9 : Math.PI + 0.9); g.strokePath(); }
      g.setAlpha(1);
    }
    v.tag.setText(p.name).setPosition(cx, fy - 44).setAlpha(0.9);
  }
}
