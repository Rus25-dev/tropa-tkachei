// ===== «ГОНКИ ТКАЧЕЙ»: ИГРОК =====
// Игрок входит по коду комнаты (?race=play&room=КОД или меню «Гонки Ткачей → Войти игроком»), вводит имя и жмёт «Готов».
// По команде организатора запускается обычный забег «Тропа целиком» с общим зерном (Speedrun.begin с { rc }): мир считается у игрока
// локально и от сети не зависит. По сети уходят: телеметрия (~15 Гц, без нумерации), события (надёжно, с нумерацией: сплит, смерть, покупка,
// отбив, казнь, фаза, финиш) и ответы на команды (готов, загружен). Команды организатора: подготовка, отсчёт, «пошёл», тех. пауза, сброс.
// При обрыве забег идёт дальше, события копятся и уходят после возвращения связи. Если вкладка упала — забег восстанавливается по журналу ввода.
const RacePlay = {
  S: null, last: null,
  // ----- хранилище -----
  key() { try { let k = localStorage.getItem('tt_rc_key'); if (!k || k.length < 12) { k = RaceNet.makeKey(); localStorage.setItem('tt_rc_key', k); } return k; } catch (_) { return RaceNet.makeKey(); } },
  names() { try { const a = JSON.parse(localStorage.getItem('tt_rc_names') || '[]'); return Array.isArray(a) ? a.slice(0, 40) : []; } catch (_) { return []; } },
  addName(n) { try { const a = this.names().filter((x) => this.norm(x) !== this.norm(n)); a.unshift(n); localStorage.setItem('tt_rc_names', JSON.stringify(a.slice(0, 40))); localStorage.setItem('tt_sr_name', n.slice(0, 20)); } catch (_) { } },
  norm(n) { return String(n || '').toLowerCase().replace(/\s+/g, ''); },
  saveSess() { const S = this.S; if (!S) return; const c = S.client; try { localStorage.setItem('tt_rc_play', JSON.stringify({ code: S.code, name: S.name, gSeen: c ? c.gSeen : 0, id: S.state && S.state.id, sid: c ? c.sid : null, n: c ? c.n : 0, outbox: c ? c.outbox.slice(-200) : [] })); } catch (_) { } },
  loadSess() { try { const o = JSON.parse(localStorage.getItem('tt_rc_play') || 'null'); return o && o.code ? o : null; } catch (_) { return null; } },
  clearSess() { try { localStorage.removeItem('tt_rc_play'); } catch (_) { } },
  tr() { return RaceNet.use(); },

  // ----- вход -----
  // Показывает окно входа (code — подставить в поле). opt.auto — сразу подключиться, если известно имя
  open(code, opt) {
    Speedrun.css(); this.build();
    const el = document.getElementById('rc-join'); el.hidden = false; Ov.opened(el);
    const c = el.querySelector('#rcj-code'), n = el.querySelector('#rcj-name');
    if (code) c.value = String(code).toUpperCase();
    if (!n.value) n.value = Speedrun.myName();
    el.querySelector('#rcj-names').innerHTML = this.names().map((x) => `<option value="${x.replace(/"/g, '&quot;')}">`).join('');
    this.view();
    if (opt && opt.auto && c.value && n.value) this.join(c.value, n.value);
    else setTimeout(() => (c.value ? n : c).focus(), 0);
  },
  build() {
    if (document.getElementById('rc-join')) return;
    const el = document.createElement('div'); el.id = 'rc-join'; el.className = 'sr-ov'; el.hidden = true;
    el.innerHTML = `<div class="card" role="dialog" aria-labelledby="rcj-t"><h2 id="rcj-t">Гонка Ткачей</h2>
<p class="lead" id="rcj-lead">Вы играете у себя, организатор запускает общий отсчёт. По сети идут только положение, события и итог.</p>
<div id="rcj-form"><label class="nm">Код комнаты<input id="rcj-code" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="например, K7P4Q"></label>
<label class="nm">Ваше имя (так вас увидит организатор и зрители)<input id="rcj-name" maxlength="20" autocomplete="off" list="rcj-names" placeholder="например, Ярь"></label><datalist id="rcj-names"></datalist>
<div class="row"><button id="rcj-go" class="primary" type="button">Войти</button></div></div>
<div id="rcj-room" hidden><div id="rcj-st"></div><div id="rcj-pl"></div><div id="rcj-warn" class="bad"></div>
<div class="row"><button id="rcj-ready" class="primary" type="button">Готов</button><button id="rcj-fix" type="button" hidden>Отключить запрещённые настройки</button></div></div>
<div id="rcj-msg" role="status"></div>
<div class="row"><button id="rcj-back" class="ghost" type="button">← Выйти из комнаты</button></div></div>`;
    document.body.appendChild(el);
    Ov.chrome(el, { crumbs: ['Гонки Ткачей', 'Игрок'], back: () => this.leave(true), hint: { act: 'нажать' } });
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.leave(true); if (e.key === 'Enter' && (e.target.id === 'rcj-code' || e.target.id === 'rcj-name')) this.join(el.querySelector('#rcj-code').value, el.querySelector('#rcj-name').value); });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    el.querySelector('#rcj-go').onclick = () => this.join(el.querySelector('#rcj-code').value, el.querySelector('#rcj-name').value);
    el.querySelector('#rcj-back').onclick = () => this.leave(true);
    el.querySelector('#rcj-ready').onclick = () => { const S = this.S; if (!S || !S.client) return; S.me = !S.me; S.client.send({ k: 'ready', v: S.me, viol: Speedrun.violation() }); this.view(); };
    el.querySelector('#rcj-fix').onclick = () => { Speedrun.fixRules(); this.view(); };
    el.querySelector('#rcj-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  },
  join(code, name) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    const msg = (t) => { const m = document.getElementById('rcj-msg'); if (m) { m.textContent = t; m.className = 'bad'; } };
    if (code.length < 4) { msg('Введите код комнаты (5 символов).'); return; }
    if (!name) { msg('Введите имя: по нему организатор и зрители узнают вас.'); return; }
    if (this.S && this.S.client) this.S.client.stop(true);
    this.addName(name);
    const S = this.S = { code, name, me: false, state: null, seat: null, status: 'connecting', conn: '', client: null, run: null, started: false, rv: null, events: 0, evT: 0, telT: 0, tele: 0, fin: null, res: null, msgT: 0 };
    const sess = this.loadSess(), resume = !!(sess && sess.code === code);
    S.client = new RaceNet.RaceClient({
      code, key: this.key(), role: 'play', name, transport: this.tr(), resume, gSeen: resume ? sess.gSeen | 0 : 0,
      sid: resume ? sess.sid : null, n: resume ? sess.n | 0 : 0, outbox: resume ? sess.outbox : [], onQueue: () => this.saveSess(),
      hello: () => ({ ver: GAME_VERSION, viol: Speedrun.violation(), room: code }),
      onWelcome: (w) => this.onWelcome(w), onMsg: (m) => this.onMsg(m), onTel: (t) => this.onTel(t), onStatus: (s, i) => this.onStatus(s, i),
    });
    this.saveSess(); this.view(); S.client.start();
    // закрытие вкладки: организатор узнаёт сразу
    if (!this._pg) { this._pg = true; for (const ev of ['pagehide', 'beforeunload']) window.addEventListener(ev, () => { if (this.S && this.S.client) { this.saveSess(); this.S.client.bye(); } }); }
  },
  leave(toMenu) {
    const S = this.S; this.S = null; this.clearSess();
    if (S && S.client) S.client.stop(true);
    const el = document.getElementById('rc-join'); if (el) el.hidden = true;
    const menu = window.__game && window.__game.scene.getScene('menu'); if (menu) menu.leaving = false;
    void toMenu;
  },

  // ----- сеть -----
  onStatus(s, info) {
    const S = this.S; if (!S) return; S.status = s;
    if (s === 'denied') { S.denied = info && info.why; this.clearSess(); }
    this.view();
  },
  onWelcome(w) {
    const S = this.S; if (!S) return; S.seat = w.seat; S.state = w.snap || S.state; S.late = false;
    if (S.client) S.skew = S.client.skew || 0;
    this.saveSess(); this.view();
    const st = S.state, r = Speedrun.run;
    // вернулись в идущую гонку: если вкладку перезагружали — забег восстанавливается по журналу
    if (st && (st.phase === 'run' || st.phase === 'count' || st.phase === 'prep') && !(r && r.rc)) this.tryRestore(st);
    else if (st && r && r.rc) this.syncRun(st);
  },
  onMsg(m) {
    const S = this.S; if (!S || !m) return;
    switch (m.k) {
      case 'state': S.state = m.s; this.saveSess(); this.view(); this.syncRun(m.s); break;
      case 'prep': this.startRun(m); break;
      case 'cd': { const r = Speedrun.run; if (r && r.rc && r.hold) { r.cd = String(m.n); Snd.play('bead'); } break; }
      case 'go': this.go(m); break;
      case 'pause': this.tech(!!m.on); break;
      case 'reset': this.reset(m); break;
      case 'end': this.end(m); break;
      case 'res': {
        S.res = m.r; this.resultUpdate();
        const r = Speedrun.run, gs = window.__game.scene.getScene('game');
        if (m.r && m.r.awarded && r && r.rc && !r.done && gs && gs.ui && gs.ui().ready) gs.ui().toast(`Организатор присудил победу: ${((m.r.players || []).find((p) => p.seat === m.r.winner) || {}).name || ''}`, 5);
        break;
      }
    }
  },
  onTel(t) { const S = this.S; if (S && t && t.rv) S.rv = t.rv; },
  say(t, kind) { const m = document.getElementById('rcj-msg'); if (m) { m.textContent = t || ''; m.className = kind || ''; } },

  // ----- окно ожидания -----
  view() {
    const el = document.getElementById('rc-join'); if (!el || el.hidden) return; const S = this.S;
    const room = el.querySelector('#rcj-room'), form = el.querySelector('#rcj-form');
    form.hidden = !!S; room.hidden = !S;
    if (!S) return;
    const st = S.state, v = Speedrun.violation(), esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const conn = S.status === 'online' ? '<span class="good">связь есть</span>' : S.status === 'denied' ? `<span class="bad">отказ: ${esc(S.denied || '')}</span>` : '<span class="bad">нет связи, пробуем снова…</span>';
    const ph = { lobby: 'ожидание игроков', prep: 'загрузка', count: 'отсчёт', run: 'гонка идёт', done: 'гонка окончена', cancel: 'отменена' };
    el.querySelector('#rcj-st').innerHTML = `<div>Комната <b>${esc(S.code)}</b> · вы: <b>${esc(S.name)}</b> · ${conn}${S.client && S.client.rtt != null ? ` · пинг ~${Math.round(S.client.rtt)} мс` : ''}</div>` + (st ? `<div class="lead">${esc((st.discName || 'Тропа целиком'))} · ${ph[st.phase] || st.phase}</div>` : '');
    el.querySelector('#rcj-pl').innerHTML = st ? (st.players || []).map((p) => `<div class="${p.ready ? 'good' : ''}">${p.seat === S.seat ? '▸ ' : ''}${esc(p.name || '—')}: ${!p.online ? 'нет связи' : p.ready ? 'готов' : 'не готов'}</div>`).join('') : '';
    const warn = [];
    if (v.length) warn.push(`Запрещено в гонке: ${v.join(', ')}.`);
    if (st && st.phase !== 'lobby' && !(Speedrun.run && Speedrun.run.rc)) warn.push('Гонка уже идёт без вас: можно только смотреть.');
    el.querySelector('#rcj-warn').textContent = warn.join(' ');
    el.querySelector('#rcj-fix').hidden = !v.length;
    const b = el.querySelector('#rcj-ready'); b.textContent = S.me ? 'Не готов' : 'Готов';
    b.disabled = S.status !== 'online' || v.length > 0 || !st || st.phase !== 'lobby';
    el.querySelector('#rcj-lead').textContent = S.status === 'online' ? 'Когда оба готовы, организатор запустит общий отсчёт. Игра идёт у вас локально.' : 'Подключаемся к организатору…';
    if (S.denied) { const m = el.querySelector('#rcj-msg'); m.textContent = 'Не удалось войти: ' + S.denied; m.className = 'bad'; }
  },

  // ----- забег -----
  hidePanel() { const el = document.getElementById('rc-join'); if (el) el.hidden = true; },
  startRun(m) {
    const S = this.S; if (!S) return; if (S.runId === m.id && Speedrun.run && Speedrun.run.rc) return; // повторная доставка
    if (Speedrun.violation().length) { S.client.send({ k: 'bad', why: Speedrun.violation().join(', ') }); return; }
    Journal.clear();
    S.runId = m.id; S.started = true; S.fin = null; S.res = null; S.loadedSent = false;
    const data = Speedrun.begin(m.cat || 'trail', null, { seed: m.seed, rc: { code: S.code, seat: S.seat, id: m.id, name: S.name } });
    Speedrun.run.cd = 'Загрузка…';
    this.hidePanel();
    const g = window.__game, menu = g.scene.getScene('menu'), gs = g.scene.getScene('game'), ui = g.scene.getScene('ui');
    Snd.init(); Snd.play('bench');
    if (menu && menu.sys.isActive()) { menu.leaving = true; menu.cameras.main.fadeOut(450, 3, 8, 7); menu.time.delayedCall(460, () => menu.scene.start('game', data)); }
    else if (gs && gs.sys.isActive()) { if (ui) ui.ready = false; g.scene.stop('bg'); gs.scene.start('game', data); }
    else g.scene.start('game', data);
  },
  sceneReady(gs) {
    const S = this.S, r = Speedrun.run; if (!S || !r || !r.rc || S.loadedSent || gs.replaying) return;
    S.loadedSent = true; r.cd = 'Ждём соперника…'; S.client.send({ k: 'loaded', id: r.rc.id });
    this.syncRun(S.state);
  },
  // сверка с состоянием организатора: «пошёл» мог прийти, пока игрок был без связи или вкладка перезагружалась
  syncRun(st) {
    const S = this.S, r = Speedrun.run; if (!S || !st || !r || !r.rc) return;
    if (st.phase === 'run' && r.hold && S.loadedSent !== false) this.go({ at: st.goAt, late: true });
    if (st.pause && st.pause.on) this.tech(true); else if (r.tp != null && !(st.pause && st.pause.on)) this.tech(false);
    if (st.phase === 'lobby' && S.started && r.rc.id !== st.id) this.reset({});
  },
  go(m) {
    const S = this.S, r = Speedrun.run; if (!S || !r || !r.rc || !r.hold) return;
    // опоздавший «пошёл» (связь была потеряна): время считается от настоящего старта по часам организатора
    const late = m.late || (m.at != null && S.client && S.client.skew != null && (Date.now() + S.client.skew - m.at) > 800);
    Speedrun.release();
    if (late && m.at != null && S.client && S.client.skew != null) {
      const el = Math.max(0, Date.now() + S.client.skew - m.at); r.t0 = Speedrun.clock() - el; if (Journal.J) Journal.J.wallT0 = Date.now() - el;
      const gs = window.__game.scene.getScene('game'); if (gs && gs.ui && gs.ui().ready) gs.ui().toast(`Связь вернулась: гонка идёт уже ${Speedrun.fmt(el)}`, 4);
    }
    r.cd = late ? '' : r.cd;
  },
  tech(on) {
    const gs = window.__game.scene.getScene('game'), r = Speedrun.run; if (!gs || !r || !r.rc || gs.replaying) return;
    if (!!on === (r.tp != null)) return;
    Speedrun.techPause(gs, on);
    const u = gs.ui(); if (u && u.ready) u.toast(on ? 'Техническая пауза: организатор остановил гонку' : 'Гонка продолжается', 3);
    if (on) Snd.play('bench');
  },
  reset() { // «Переиграть»: организатор вернул всех в комнату ожидания
    const S = this.S; if (!S) return;
    this.toLobby('Организатор перезапускает гонку: вернитесь к кнопке «Готов».');
  },
  end(m) { // присуждена победа / отменена гонка: забег останавливается
    const S = this.S, r = Speedrun.run; if (!S) return;
    if (r && r.rc && !r.done) { S.endNote = m.awarded ? 'Организатор завершил гонку' : 'Гонка отменена'; this.toLobby(S.endNote); }
  },
  toLobby(note) {
    const S = this.S; if (!S) return;
    S.me = false; S.started = false; S.fin = null; S.loadedSent = false;
    Journal.clear(); Speedrun.run = null;
    const g = window.__game, gs = g.scene.getScene('game'), ui = g.scene.getScene('ui');
    if (gs && gs.sys.isActive()) { if (ui) { ui.srShown = null; ui.ready = false; } g.scene.stop('ui'); g.scene.stop('bg'); g.scene.stop('game'); g.scene.start('menu'); }
    const menu = g.scene.getScene('menu'); if (menu) menu.leaving = false;
    setTimeout(() => { const el = document.getElementById('rc-join'); if (el) { el.hidden = false; Ov.opened(el); } this.view(); this.say(note, 'good'); }, 600);
  },
  // восстановление забега после перезагрузки вкладки
  tryRestore(st) {
    const S = this.S, inf = Journal.info();
    if (!S || !inf || !inf.race || inf.race.code !== S.code || (st && inf.race.id !== st.id) || !inf.ok) { if (inf && inf.race && st && inf.race.id !== st.id) Journal.clear(); return false; }
    this.say('Найден незавершённый забег этой гонки: восстанавливаем…', 'good');
    this.hidePanel(); S.started = true; S.runId = inf.race.id; S.loadedSent = true;
    const menu = window.__game.scene.getScene('menu');
    return Journal.restore(menu && menu.sys.isActive() ? menu : null, { onDone: () => { S.client.send({ k: 'restored', id: inf.race.id }); this.syncRun(S.state); }, onFail: () => { this.say('Восстановить забег не удалось: сообщите организатору.', 'bad'); } });
  },

  // ----- события и телеметрия (зовёт игровой цикл) -----
  event(k, d) {
    const S = this.S, r = Speedrun.run; if (!S || !S.client || !r || !r.rc || r.hold || r.done) return;
    if (k === 'parry' || k === 'stun') { const n = performance.now(); if (n - S.evT < 900) return; S.evT = n; }
    S.client.send({ k: 'pev', e: { k, el: Math.round(Speedrun.rta()), ...(d || {}) } });
  },
  onSplit(i, sp, gs) { const S = this.S; if (!S) return; this.event('split', { i, rta: sp.rta, igt: sp.igt }); void gs; },
  onFinish(res, gs) {
    const S = this.S, r = Speedrun.run; if (!S || !S.client) return;
    const stats = RaceStats.pack(r && r.stats, res.igt / 1000 * 60);
    S.fin = { rta: res.rta, igt: res.igt, deaths: res.deaths };
    S.client.send({ k: 'fin', rta: res.rta, igt: res.igt, deaths: res.deaths, splits: res.splits.map((s) => ({ rta: s.rta, igt: s.igt })), stats, ver: GAME_VERSION, restored: r ? r.restored | 0 : 0 });
    void gs;
  },
  // каждый кадр: телеметрия ~15 Гц
  frame(gs) {
    const S = this.S, r = Speedrun.run; if (!S || !S.client || !r || !r.rc || gs.replaying) return;
    const now = performance.now(); if (now - S.telT < 66) return; S.telT = now;
    const p = gs.players[0], b = gs.testBoss() || gs.boss, camp = gs.camp;
    const kind = camp ? CHAPTERS[camp.ch].boss : 'korne', K = { korne: 'k', misha: 'm', vladik: 'v', tima: 't' };
    const o = { s: S.seat, el: Math.round(Speedrun.rta()), ig: Math.round(r.igt), ch: camp ? camp.ch : 1, st: camp ? camp.st : 'level', x: Math.round(p.x), y: Math.round(p.y), f: p.face, g: p.onGround ? 1 : 0, vx: Math.round(p.vx), vy: Math.round(p.vy),
      d: p.dashT > 0 ? 1 : 0, a: p.atkT > 0 ? (p.atkDir === 'u' ? 2 : p.atkDir === 'd' ? 3 : 1) : 0, hp: p.hp, mh: p.maxHp, sk: Math.round(p.silk * 10) / 10, ps: P.SILK, bd: gs.beads | 0, dn: p.downed ? 1 : 0, sit: p.sit ? 1 : 0,
      pa: gs.paused ? 1 : 0, sp: r.splits.length, dt: r.deaths, hold: r.hold ? 1 : 0, w: gs.wiping ? 1 : 0, dm: Math.round((r.stats ? r.stats.bossDmg : 0) * 10) / 10 };
    if (b && b.maxHp) o.bs = { k: K[kind] || 'k', x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), s: b.state, hp: Math.round(b.hp * 10) / 10, mh: b.maxHp, ph: b.phase || 1, f: b.face || 1, on: ['sleep', 'dead', 'gone'].includes(b.state) ? 0 : 1 };
    const pr = []; for (const q of gs.projs) { if (q.dead || pr.length >= 14) continue; if (Math.abs(q.x - p.x) < 520 && Math.abs(q.y - p.y) < 340) pr.push([q.kind, Math.round(q.x), Math.round(q.y), Math.round(q.w || 8), Math.round(q.h || 8)]); }
    if (pr.length) o.pr = pr;
    const en = []; for (const e of gs.enemies) { if (e.dead || en.length >= 10) continue; if (Math.abs(e.x - p.x) < 520 && Math.abs(e.y - p.y) < 340) en.push([e.type, Math.round(e.x), Math.round(e.y), Math.round(e.w), Math.round(e.h), e.face || 1]); }
    if (en.length) o.en = en;
    S.client.tel(o); S.tele++;
  },
  // табличка во время гонки (под таймером)
  rival() {
    const S = this.S, r = Speedrun.run; if (!S || !r) return null;
    if (S.status !== 'online') return { text: 'Связь с организатором потеряна: играем локально, итог уйдёт при возвращении', col: '#d28a6a' };
    if (r.tp != null) return { text: 'Техническая пауза организатора', col: '#ffd47a' };
    const pending = S.client ? S.client.pending() : 0;
    return { text: pending > 4 ? `Связь есть, досылаем события (${pending})` : 'Связь с организатором: есть', col: '#86a89a' };
  },
  banner() {
    const S = this.S, r = Speedrun.run; if (!r || !r.result) return null;
    const st = S && S.state, res = S && S.res;
    if (res && res.winner != null) {
      const me = (res.players || []).find((p) => p.seat === S.seat), you = res.winner === S.seat;
      if (res.winner === 'draw') return { text: 'НИЧЬЯ', sub: 'время совпало до сотых', col: '#ffd47a' };
      return you ? { text: 'ПОБЕДА', sub: res.awarded ? 'победа присуждена организатором' : `вы быстрее соперника${res.gap != null ? ' на ' + Speedrun.fmt(res.gap) : ''}`, col: '#9ff0c8' }
        : { text: 'ПОРАЖЕНИЕ', sub: me && res.gap != null ? `соперник быстрее на ${Speedrun.fmt(res.gap)}` : 'соперник финишировал раньше', col: '#ff9a8a' };
    }
    const other = st && (st.players || []).find((p) => p.seat !== S.seat);
    if (other && other.fin) { const d = other.fin.rta - r.result.rta; return d > 0 ? { text: 'ПОБЕДА?', sub: `соперник пришёл позже на ${Speedrun.fmt(d)}: ждём подтверждения организатора`, col: '#9ff0c8' } : { text: 'ПОРАЖЕНИЕ?', sub: `соперник финишировал на ${Speedrun.fmt(-d)} быстрее: ждём подтверждения`, col: '#ff9a8a' }; }
    return { text: 'Финиш!', sub: S && S.status === 'online' ? 'ждём, когда соперник закончит…' : 'нет связи: результат уйдёт организатору, как только она вернётся', col: '#ffe3a3' };
  },
  resultUpdate() { const u = window.__game && window.__game.scene.getScene('ui'); if (u && u.srShown) { u.srBanner = null; Speedrun.resUpdate(u); } },
  // ссылка из адресной строки: ?race=play&room=КОД
  fromUrl() {
    const q = new URLSearchParams(location.search), m = q.get('race');
    if (m !== 'play') return false;
    const room = q.get('room') || '', sess = this.loadSess();
    this.open(room || (sess && sess.code) || '', { auto: !!(Speedrun.myName() && (room || sess)) });
    return true;
  },
};

// ===== подключение к игре =====
(function () {
  const P = GameScene.prototype;
  // смерть героя уходит событием
  const wipeO = P.teamWipe;
  P.teamWipe = function () { const w = this.wiping; wipeO.call(this); if (!w && this.wiping && this.sr && this.sr.rc && !this.replaying) RacePlay.event('death', {}); };
  const buyO = Campaign.buy;
  Campaign.buy = function (gs, id, fromGuest) { const b0 = gs.beads, out = buyO.call(this, gs, id, fromGuest); if (gs.sr && gs.sr.rc && gs.beads < b0 && !gs.replaying) { const it = SHOP.find((s) => s.id === id); RacePlay.event('buy', { id, name: it ? it.name : id }); } return out; };
  const parryO = P.parrySuccess;
  if (parryO) P.parrySuccess = function (p, ...a) { if (this.sr && this.sr.rc && !p.remote && !this.replaying) RacePlay.event('parry', {}); return parryO.call(this, p, ...a); };
  const execO = P.execBoss;
  if (execO) P.execBoss = function (p, kit, dir) { const b = this.testBoss() || this.boss, was = !!(b && b.executed), out = execO.call(this, p, kit, dir); if (this.sr && this.sr.rc && !this.replaying && b && b.executed && !was) RacePlay.event('exec', {}); return out; };
  // смена фазы босса
  const tickO = Speedrun.onTick;
  Speedrun.onTick = function (gs) {
    const out = tickO.call(this, gs), r = this.run;
    if (r && r.rc && !gs.replaying && gs.sr) {
      const b = gs.testBoss() || gs.boss, ph = b && b.maxHp ? (b.phase || 1) : 0, q = r._ph || (r._ph = {});
      if (ph && q.k === (gs.camp ? gs.camp.ch : 1) && ph > q.v) RacePlay.event('phase', { ph, ch: gs.camp ? gs.camp.ch : 1 });
      if (ph) { q.k = gs.camp ? gs.camp.ch : 1; q.v = ph; }
    }
    return out;
  };
  // выход из забега в меню = сдача (DNF), забег гонки прерван
  const leaveO = Speedrun.leave;
  Speedrun.leave = function () { const r = this.run, S = RacePlay.S; if (r && r.rc && !r.done && S && S.client) S.client.send({ k: 'dnf', el: Math.round(Speedrun.rta()), why: 'вышел из забега' }); return leaveO.call(this); };
  // меню: URL и кнопки раздела «Гонки Ткачей» подключает race-org.js
})();
