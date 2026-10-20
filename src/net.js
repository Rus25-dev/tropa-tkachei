// ===== СЕТЬ: WebRTC через PeerJS (публичный сервер-«знакомитель» + TURN-ретрансляторы) =====
const Net = {
  peer: null, conn: null, role: null, code: null, onMsg: null, onClose: null, cb: null,
  opts() {
    const q = new URLSearchParams(location.search), h = q.get('peer');
    if (h) { const [host, port] = h.split(':'); return { host, port: +port || 9000, path: '/', secure: false, debug: 1, config: { iceServers: [] } }; }
    return { debug: 1 };
  },
  makeCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; },
  host(cb) {
    this.close(); this.role = 'host'; this.cb = cb; this.code = this.makeCode();
    if (typeof Peer === 'undefined') { cb('error', { type: 'no-lib' }); return; }
    this.peer = new Peer('tropa-tkachei-' + this.code, this.opts());
    this.peer.on('open', () => cb('open', this.code));
    this.peer.on('connection', (c) => { if (this.conn) { c.on('open', () => c.close()); return; } this.bind(c); });
    this.peer.on('error', (e) => { if (e.type === 'unavailable-id') this.host(cb); else cb('error', e); });
    this.peer.on('disconnected', () => { if (!this.conn && this.peer && !this.peer.destroyed) try { this.peer.reconnect(); } catch (_) { } });
  },
  join(code, cb) {
    this.close(); this.role = 'guest'; this.cb = cb; this.code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (typeof Peer === 'undefined') { cb('error', { type: 'no-lib' }); return; }
    this.peer = new Peer(this.opts());
    this.peer.on('open', () => this.bind(this.peer.connect('tropa-tkachei-' + this.code, { reliable: true, serialization: 'json' })));
    this.peer.on('error', (e) => cb('error', e));
  },
  bind(c) {
    this.conn = c;
    c.on('open', () => this.cb && this.cb('connected'));
    this.lastRecv = performance.now();
    const gone = () => { if (this.conn === c) { this.conn = null; if (this.onClose) this.onClose(); } };
    c.on('data', (d) => {
      this.lastRecv = performance.now();
      if (d && d.t === 'bye') { gone(); try { c.close(); } catch (_) { } return; } // напарник попрощался: не ждём таймаут в 10 с
      if (this.onMsg) this.onMsg(d);
    });
    c.on('close', gone);
    c.on('error', () => { });
  },
  send(m) { if (this.conn && this.conn.open) { try { this.conn.send(m); } catch (_) { } } },
  // прощание: напарник узнаёт об уходе сразу, а не по тишине через 10 с
  bye() { if (this.conn && this.conn.open) { try { this.conn.send({ t: 'bye' }); } catch (_) { } } },
  close() {
    this.bye();
    const c = this.conn, p = this.peer; this.conn = null; this.peer = null; this.role = null; this.onClose = null; this.cb = null; this.code = null;
    try { c && c.close(); } catch (_) { } try { p && p.destroy(); } catch (_) { }
  },
  errText(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return 'Комната не найдена. Проверьте код: хост должен держать окно открытым.';
    if (t === 'no-lib' || t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
      return 'Нет связи с сервером комнат. Проверьте интернет. Внутри предпросмотра Claude онлайн не работает — откройте версию на GitHub Pages.';
    if (t === 'browser-incompatible') return 'Этот браузер не поддерживает WebRTC. Подойдут Chrome, Edge, Firefox, Яндекс Браузер.';
    return 'Ошибка соединения: ' + (t || 'неизвестная') + '. Попробуйте ещё раз.';
  },
};

// закрытие вкладки: close() не успеет, поэтому прощаемся заранее
for (const ev of ['pagehide', 'beforeunload']) window.addEventListener(ev, () => Net.bye());

// ----- лобби (HTML поверх игры) -----
const Lobby = {
  el: null,
  init() {
    this.el = document.getElementById('lobby');
    const $ = (id) => document.getElementById(id);
    $('lb-host').onclick = () => this.doHost();
    $('lb-join').onclick = () => this.doJoin($('lb-code').value);
    $('lb-code').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.doJoin($('lb-code').value); });
    $('lb-code').addEventListener('keyup', (e) => e.stopPropagation());
    Ov.chrome(this.el, { crumbs: ['Вдвоём по сети'], back: () => this.hide(true), hint: { act: 'нажать' } });
    // Esc закрывает лобби, как окно настроек (фокус может быть и вне окна — слушаем документ)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.el.hidden) { e.preventDefault(); e.stopPropagation(); this.hide(true); } }, true);
    $('lb-copy').onclick = () => {
      const t = $('lb-link').textContent;
      const ok = () => { $('lb-copy').textContent = 'Скопировано'; setTimeout(() => ($('lb-copy').textContent = 'Копировать ссылку'), 1600); };
      try { navigator.clipboard.writeText(t).then(ok, () => this.selectLink()); } catch (_) { this.selectLink(); }
    };
    Net.onMsg = (m) => this.route(m);
    const room = new URLSearchParams(location.search).get('room');
    if (room) { this.room = room; }
  },
  selectLink() { const r = document.createRange(); r.selectNodeContents(document.getElementById('lb-link')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); },
  // intent: 'host' — сразу создать комнату, 'join' — сразу к полю кода (меню «Создать комнату» / «Войти по коду»)
  show(intent) {
    const title = this.mode === 'race' ? 'Гонка 1×1 по сети' : this.mode === 'bosstest' ? 'Босс-тест по сети: ' + (this.bossName || '') : 'Вдвоём по сети';
    document.getElementById('lb-title').textContent = title;
    const base = (this.crumbs && this.crumbs.length) ? this.crumbs.slice() : [title];
    Ov.crumbs(this.el, [...base, intent === 'host' ? 'Создать комнату' : intent === 'join' ? 'Войти по коду' : 'Комната']);
    this.el.hidden = false; this.status(''); document.getElementById('lb-hostbox').hidden = true; Ov.opened(this.el);
    if (this.room) { document.getElementById('lb-code').value = this.room; const r = this.room; this.room = null; this.doJoin(r); }
    else if (intent === 'host') { this.doHost(); setTimeout(() => document.getElementById('lb-copy').focus(), 0); }
    else if (intent === 'join') setTimeout(() => document.getElementById('lb-code').focus(), 0);
    else setTimeout(() => document.getElementById('lb-host').focus(), 0);
  },
  hide(back) {
    this.el.hidden = true;
    if (back) { Net.close(); const m = window.__game && window.__game.scene.getScene('menu'); if (m) m.leaving = false; }
  },
  status(t, kind) { const s = document.getElementById('lb-status'); s.textContent = t; s.dataset.kind = kind || ''; },
  doHost() {
    this.status('Создаём комнату…');
    Net.host((ev, d) => {
      if (ev === 'open') {
        document.getElementById('lb-hostbox').hidden = false;
        document.getElementById('lb-roomcode').textContent = d;
        document.getElementById('lb-link').textContent = location.origin + location.pathname + '?room=' + d;
        this.status('Ждём напарника. Отправьте ему код или ссылку.', 'wait');
      } else if (ev === 'connected') {
        this.status('Напарник подключился!', 'ok');
        const gs = window.__game && window.__game.scene.getScene('game');
        if (this.mode !== 'race' && gs && gs.sys.isActive() && gs.players && !gs.online) { gs.rejoinGuest(); return; } // гость вернулся в идущую игру хоста
        if (this.mode === 'race') { Speedrun.raceOpen('host'); return; }
        const mode = this.mode || 'story', boss = this.boss || 'misha';
        const camp = mode === 'story' ? (this.camp || Campaign.resume()) : null;
        setTimeout(() => { Net.send({ t: 'start', mode, boss, camp }); this.start('host', mode, boss, camp); }, 400);
      } else if (ev === 'error') this.status(Net.errText(d), 'err');
    });
  },
  doJoin(code) {
    if (!code || code.trim().length < 4) { this.status('Введите код комнаты из пяти символов.', 'err'); return; }
    this.status('Подключаемся…');
    Net.join(code, (ev, d) => {
      if (ev === 'connected') this.status('Соединение есть, ждём старта от хоста…', 'ok');
      else if (ev === 'error') this.status(Net.errText(d), 'err');
    });
  },
  route(m) {
    if (m && m.t === 'race') { Speedrun.onNet(m); return; }
    if (m && m.t === 'start' && Net.role === 'guest') { this.start('guest', m.mode, m.boss, m.camp); return; }
    const gs = window.__game && window.__game.scene.getScene('game');
    if (gs && gs.sys.isActive() && gs.onNet) gs.onNet(m);
  },
  start(role, mode, boss, camp) {
    this.hide(false);
    const menu = window.__game.scene.getScene('menu');
    if (menu && menu.sys.isActive()) menu.goOnline(role, mode, boss, camp);
  },
};
