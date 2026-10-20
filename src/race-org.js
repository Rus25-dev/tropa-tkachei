// ===== «ГОНКИ ТКАЧЕЙ»: ОРГАНИЗАТОР =====
// Организатор сам не играет: создаёт одну гонку в одной дисциплине, раздаёт ссылки, запускает общий отсчёт, при необходимости ставит
// техническую паузу, переигрывает, присуждает победу, отменяет своё последнее действие. Всё состояние гонки пишется в localStorage
// (tt_rc_org): после перезагрузки страницы комната поднимается с тем же кодом, места игроков и ход гонки восстанавливаются, а игроки и
// обсерверы переподключаются сами (см. race-net.js). Итоги гонок копятся в архиве (tt_races) в формате races.json.
const RaceOrg = {
  S: null, hub: null, KEY: 'tt_rc_org', ARCH: 'tt_races', saveT: null, flushT: null, cdT: null, status: 'idle',
  DISC: { trail: { name: 'Тропа целиком', ready: true }, boss: { name: 'Босс-раш', ready: false, note: 'в версии 1.11' }, duel: { name: 'Дуэль ткачей', ready: false, note: 'в версии 1.12' } },
  tr() { return RaceNet.use(); },
  id() { return Date.now().toString(36) + RaceNet.makeCode().toLowerCase(); },
  fresh(code) {
    return { v: 1, code, id: this.id(), created: Date.now(), phase: 'lobby', disc: 'trail', seed: newSeed(), seats: {}, goAt: null, pause: { on: false, since: null, total: 0 }, winner: null, awarded: false, events: [], acts: [], result: null, ver: GAME_VERSION, prepAt: null };
  },

  // ----- хранилище -----
  stored() { try { const o = JSON.parse(localStorage.getItem(this.KEY) || 'null'); return o && o.S && o.S.code && o.S.v === 1 ? o : null; } catch (_) { return null; } },
  save(now) {
    if (!this.S) return;
    const go = () => { this.saveT = null; try { const S = JSON.parse(JSON.stringify(this.S, (k, v) => (k === 'tel' ? undefined : v))); localStorage.setItem(this.KEY, JSON.stringify({ S, hub: this.hub ? this.hub.dump() : null, at: Date.now() })); } catch (_) { } };
    if (now) { clearTimeout(this.saveT); go(); } else if (!this.saveT) this.saveT = setTimeout(go, 250);
  },
  archive() { try { const a = JSON.parse(localStorage.getItem(this.ARCH) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } },
  saveArchive(a) { try { localStorage.setItem(this.ARCH, JSON.stringify(a)); } catch (_) { } },

  // ----- запуск -----
  create() {
    if (this.hub) return;
    this.S = this.fresh(RaceNet.makeCode()); this.openHub(null); this.save(true);
    this.panel(); this.render();
  },
  resume() {
    const st = this.stored(); if (!st) return false;
    if (this.hub) { this.panel(); this.render(); return true; }
    this.S = st.S; this.openHub(st.hub);
    // перезагрузка посреди отсчёта: отсчёт начнётся заново (игроки отпускаются только по «go»)
    if (this.S.phase === 'count') this.countdown();
    this.panel(); this.render(); this.note(`Организатор вернулся после перезагрузки: комната ${this.S.code} восстановлена, ждём игроков`);
    return true;
  },
  openHub(state) {
    const S = this.S;
    this.hub = new RaceNet.RaceHub({
      code: S.code, transport: this.tr(), state,
      accept: (h, seat) => this.accept(h, seat), snap: (seat) => this.snap(seat),
      onMsg: (seat, m) => this.onMsg(seat, m), onSeat: (seat, kind) => this.onSeat(seat, kind), onTel: (seat, t) => this.onTel(seat, t),
      onStatus: (s, i) => { this.status = s; this.srvInfo = i; this.render(); },
    });
    this.hub.open();
    // телеметрия: игроки → организатор → обсерверы (пачкой ~15 Гц) и сопернику (редко)
    this.pend = {}; this.rvT = 0;
    this.flushT = setInterval(() => this.flush(), 66);
    if (!this._pg) { this._pg = true; for (const ev of ['pagehide', 'beforeunload']) window.addEventListener(ev, () => { if (this.S) this.save(true); }); }
  },
  close(clear) {
    clearInterval(this.flushT); clearTimeout(this.cdT); this.flushT = null;
    if (this.hub) { this.hub.close(); this.hub = null; }
    if (clear) { try { localStorage.removeItem(this.KEY); } catch (_) { } }
    this.S = null; this.status = 'idle';
    const el = document.getElementById('rc-org'); if (el) el.hidden = true;
  },

  // ----- представление состояния -----
  seatList() { return Object.values(this.S.seats).filter((x) => x.role === 'play').sort((a, b) => a.id - b.id); },
  watchers() { return this.hub ? [...this.hub.seats.values()].filter((s) => s.role === 'watch' && s.online).length : 0; },
  pub() {
    const S = this.S, now = Date.now();
    return {
      v: 1, id: S.id, code: S.code, phase: S.phase, disc: S.disc, discName: this.DISC[S.disc].name, goAt: S.goAt, ver: S.ver, now,
      pause: { on: S.pause.on, total: S.pause.total, since: S.pause.since }, winner: S.winner, awarded: S.awarded, watchers: this.watchers(),
      players: this.seatList().map((p) => { const hs = this.hub && this.hub.seatById(p.id); if (hs && hs.rtt != null) p.rtt = hs.rtt; return ({ seat: p.id, name: p.name, ready: !!p.ready, loaded: !!p.loaded, online: !!p.online, rtt: p.rtt != null ? Math.round(p.rtt) : null, fin: p.fin ? { rta: p.fin.rta, igt: p.fin.igt, deaths: p.fin.deaths } : null, dnf: !!p.dnf,
        sp: p.splits.length, splits: p.splits.slice(), restored: p.restored | 0 }); }),
    };
  },
  snap(seat) {
    const S = this.S, tel = {}; for (const p of this.seatList()) if (p.tel) tel[p.id] = p.tel;
    return { ...this.pub(), seat: seat.id, tel, log: S.events.slice(-60), result: S.result, stats: this.statsOf() };
  },
  statsOf() { const o = {}; for (const p of this.seatList()) if (p.fin && p.fin.stats) o[p.id] = p.fin.stats; return o; },
  pushState() { if (this.hub && this.S) this.hub.broadcast({ k: 'state', s: this.pub() }); this.save(); this.render(); },
  // событие для ленты: уходит всем надёжно и пишется в журнал гонки
  logEv(kind, text, seat, extra) {
    const S = this.S, el = S.goAt ? this.elapsed() : null, e = { n: (S.events.length ? S.events[S.events.length - 1].n : 0) + 1, t: el, k: kind, s: seat != null ? seat : null, x: text, ...(extra || {}) };
    S.events.push(e); if (S.events.length > 600) S.events.splice(0, S.events.length - 600);
    if (this.hub) this.hub.broadcast({ k: 'ev', e });
    this.save(); this.render(); return e;
  },
  note(text) { if (this.S) { this.S.note = text; this.logEv('org', text); } },
  elapsed() { const S = this.S; if (!S.goAt) return 0; const now = Date.now(); return Math.max(0, now - S.goAt - S.pause.total - (S.pause.on ? now - S.pause.since : 0)); },
  nameOf(id) { const p = this.S.seats[id]; return p ? p.name : '—'; },

  // ----- сеть: вход, потери, сообщения -----
  accept(h, seat) {
    const S = this.S; if (!S) return { ok: false, why: 'комната закрыта' };
    if (h.room && String(h.room).toUpperCase() !== S.code) return { ok: false, why: 'другая комната' };
    if (h.ver !== GAME_VERSION) return { ok: false, why: `версия игры ${h.ver || '?'} не совпадает с версией организатора ${GAME_VERSION}: обновите страницу` };
    if (h.role === 'watch') return { ok: true, role: 'watch' };
    if (seat) return { ok: true, role: 'play' };
    const name = String(h.name || '').trim(); if (!name) return { ok: false, why: 'введите имя' };
    if (S.phase !== 'lobby') return { ok: false, why: 'гонка уже идёт' };
    const ps = this.seatList(); if (ps.length >= 2) return { ok: false, why: 'в комнате уже два игрока' };
    const n = RacePlay.norm(name); if (ps.some((p) => RacePlay.norm(p.name) === n)) return { ok: false, why: `имя «${name}» уже занято в этой комнате` };
    return { ok: true, role: 'play' };
  },
  seatRec(seat) {
    const S = this.S; let p = S.seats[seat.id];
    if (!p) p = S.seats[seat.id] = { id: seat.id, key: seat.key, role: seat.role, name: seat.name, ready: false, loaded: false, online: false, fin: null, dnf: false, splits: [], viol: [], restored: 0, rtt: null, tel: null };
    return p;
  },
  onSeat(seat, kind) {
    const S = this.S; if (!S) return; const p = this.seatRec(seat);
    p.online = seat.online; p.name = seat.name || p.name; p.rtt = seat.rtt;
    if (seat.role === 'play') {
      if (kind === 'on') this.logEv('join', `${p.name} вошёл в комнату`, p.id);
      else if (kind === 're') this.logEv('re', `${p.name}: связь восстановлена`, p.id);
      else if (kind === 'off') this.logEv('off', `${p.name}: связь потеряна`, p.id);
      else if (kind === 'bye') this.logEv('bye', `${p.name} закрыл вкладку или вышел`, p.id);
      if (kind === 'off' || kind === 'bye') { if (S.phase === 'lobby') p.ready = false; }
    }
    this.pushState();
  },
  onTel(seat, t) { const p = this.S && this.S.seats[seat.id]; if (!p || seat.role !== 'play' || !t) return; p.tel = t; this.pend[seat.id] = t; },
  flush() {
    const S = this.S, hub = this.hub; if (!S || !hub) return;
    const ids = Object.keys(this.pend); if (!ids.length) return;
    const tl = ids.map((i) => this.pend[i]); this.pend = {};
    hub.light({ tl }, ['watch']);
    // сопернику — реже и в коротком виде
    const now = performance.now();
    if (now - this.rvT > 250) {
      this.rvT = now;
      for (const p of this.seatList()) { const o = this.seatList().find((q) => q.id !== p.id); if (o && o.tel) { const t = o.tel; hub.lightTo(hub.seatById(p.id), { rv: { s: o.id, el: t.el, ch: t.ch, st: t.st, x: t.x, y: t.y, f: t.f, sp: t.sp, dn: t.dn } }); } }
    }
  },
  onMsg(seat, m) {
    const S = this.S; if (!S || !m) return; const p = this.seatRec(seat);
    if (seat.role !== 'play') return;
    switch (m.k) {
      case 'ready': {
        p.viol = Array.isArray(m.viol) ? m.viol : []; p.ready = !!m.v && !p.viol.length && S.phase === 'lobby'; this.pushState(); break;
      }
      case 'loaded': { if (S.phase === 'prep' && m.id === S.id) { p.loaded = true; this.pushState(); this.maybeCount(); } break; }
      case 'restored': this.logEv('restored', `${p.name}: забег восстановлен по журналу`, p.id); p.restored = (p.restored | 0) + 1; this.pushState(); break;
      case 'bad': this.logEv('bad', `${p.name} не может стартовать: ${m.why}`, p.id); break;
      case 'pev': this.playerEvent(p, m.e || {}); break;
      case 'fin': this.playerFin(p, m); break;
      case 'dnf': if (!p.dnf && !p.fin && (S.phase === 'run' || S.phase === 'count')) { p.dnf = true; p.dnfAt = m.el | 0; this.logEv('dnf', `${p.name} сошёл с дистанции (${m.why || 'без причины'})`, p.id); this.pushState(); this.checkFinish(); } break;
    }
  },
  playerEvent(p, e) {
    const S = this.S; if (S.phase !== 'run' && S.phase !== 'done') return;
    const f = (ms) => Speedrun.fmt(ms), tag = (i) => SR_CATS.trail.tags[i] || ('#' + (i + 1));
    switch (e.k) {
      case 'split': if (!p.splits[e.i] && e.i >= 0 && e.i < 4) { p.splits[e.i] = e.rta; this.logEv('split', `${p.name}: ${tag(e.i)} · ${f(e.rta)}`, p.id, { i: e.i, rta: e.rta }); } break;
      case 'death': this.logEv('death', `${p.name}: нить оборвалась`, p.id); break;
      case 'buy': this.logEv('buy', `${p.name} купил: ${e.name || e.id}`, p.id); break;
      case 'parry': this.logEv('parry', `${p.name}: отбив`, p.id); break;
      case 'exec': this.logEv('exec', `${p.name}: казнь босса`, p.id); break;
      case 'phase': this.logEv('phase', `${p.name}: босс перешёл в фазу ${e.ph}`, p.id, { ph: e.ph }); break;
      case 'stun': this.logEv('stun', `${p.name}: босс оглушён`, p.id); break;
    }
    this.pushState();
  },
  playerFin(p, m) {
    const S = this.S; if (p.fin || S.phase === 'lobby') return;
    p.fin = { rta: m.rta | 0, igt: m.igt | 0, deaths: m.deaths | 0, splits: Array.isArray(m.splits) ? m.splits : [], stats: m.stats || null, restored: m.restored | 0 };
    if (p.fin.splits.length === 4) p.splits = p.fin.splits.map((s) => s.rta);
    this.logEv('fin', `${p.name} финишировал: ${Speedrun.fmt(p.fin.rta)}`, p.id, { rta: p.fin.rta });
    this.pushState(); this.checkFinish();
  },

  // ----- ход гонки -----
  canStart() { const ps = this.seatList(); return this.S.phase === 'lobby' && ps.length === 2 && ps.every((p) => p.online && p.ready); },
  start() {
    const S = this.S; if (!this.canStart()) return;
    S.phase = 'prep'; S.prepAt = Date.now(); S.acts = []; S.winner = null; S.awarded = false; S.result = null; S.goAt = null; S.pause = { on: false, since: null, total: 0 };
    for (const p of this.seatList()) { p.loaded = false; p.fin = null; p.dnf = false; p.splits = []; }
    this.logEv('prep', 'Гонка: загрузка у игроков…');
    this.hub.broadcast({ k: 'prep', id: S.id, seed: S.seed, cat: S.disc, ver: GAME_VERSION }, null, ['play']);
    this.pushState();
  },
  maybeCount(force) {
    const S = this.S; if (S.phase !== 'prep') return;
    const ps = this.seatList(); if (!force && !ps.every((p) => p.loaded)) return;
    this.countdown();
  },
  countdown() {
    const S = this.S; clearTimeout(this.cdT); S.phase = 'count'; this.pushState(); let n = 3;
    const step = () => {
      if (!this.S || this.S.phase !== 'count') return;
      if (n > 0) { this.hub.broadcast({ k: 'cd', n }); this.logEv('cd', String(n)); n--; this.cdT = setTimeout(step, 1000); }
      else {
        S.phase = 'run'; S.goAt = Date.now(); this.hub.broadcast({ k: 'go', at: S.goAt }); this.logEv('go', 'ПОШЁЛ!'); this.pushState();
      }
    };
    step();
  },
  checkFinish() { const ps = this.seatList(); if (this.S.phase === 'run' && ps.length === 2 && ps.every((p) => p.fin || p.dnf)) this.finish(null); },
  // результат: время игрока — его собственные часы забега (без технических пауз)
  buildResult(awardedSeat) {
    const S = this.S, ps = this.seatList(), rows = ps.map((p) => ({ seat: p.id, name: p.name, dnf: !p.fin, time: p.fin ? p.fin.rta : null, finalTime: p.fin ? p.fin.rta : null, igt: p.fin ? p.fin.igt : null, deaths: p.fin ? p.fin.deaths : null, stats: p.fin ? p.fin.stats : null, splits: p.fin && p.fin.splits.length ? p.fin.splits.map((s) => s.rta) : p.splits.filter((x) => x != null), eloBefore: null, eloAfter: null }));
    rows.sort((a, b) => (a.dnf - b.dnf) || ((a.time || 0) - (b.time || 0)));
    let winner = null, gap = null;
    if (awardedSeat != null) winner = awardedSeat;
    else if (rows[0] && !rows[0].dnf) {
      if (rows[1] && !rows[1].dnf) { gap = rows[1].time - rows[0].time; winner = Math.abs(gap) < 10 ? 'draw' : rows[0].seat; } else winner = rows[0].seat;
    }
    rows.forEach((r, i) => { r.place = winner === 'draw' ? 1 : i + 1; });
    if (awardedSeat != null) { rows.sort((a, b) => (b.seat === awardedSeat) - (a.seat === awardedSeat)); rows.forEach((r, i) => { r.place = i + 1; }); }
    return { id: S.id, date: new Date().toISOString(), version: GAME_VERSION, discipline: S.disc, settings: { cat: S.disc, easy: false, speed: 100 }, seed: S.seed, players: rows, winner: winner === 'draw' ? 'draw' : winner == null ? null : this.nameOf(winner), winnerSeat: winner, awarded: awardedSeat != null, gap, goAt: S.goAt, pauseMs: S.pause.total, events: S.events.slice(-400) };
  },
  finish(awardedSeat) {
    const S = this.S; if (S.phase === 'done') return;
    if (S.pause.on) { S.pause.total += Date.now() - S.pause.since; S.pause.on = false; S.pause.since = null; }
    const r = this.buildResult(awardedSeat);
    S.phase = 'done'; S.winner = r.winnerSeat; S.awarded = !!r.awarded; S.result = r;
    const a = this.archive().filter((x) => x.id !== r.id); a.push(r); this.saveArchive(a);
    this.logEv('done', r.winner === 'draw' ? 'Ничья' : r.winner ? `Победил ${r.winner}${r.gap != null ? ' (+' + Speedrun.fmt(r.gap) + ')' : ''}${r.awarded ? ' — присуждено организатором' : ''}` : 'Гонка окончена без победителя');
    this.hub.broadcast({ k: 'res', r: { id: r.id, winner: r.winnerSeat, awarded: r.awarded, gap: r.gap, players: r.players.map((p) => ({ seat: p.seat, name: p.name, place: p.place, time: p.time, dnf: p.dnf })) } });
    this.pushState();
  },
  techPause(noAct) {
    const S = this.S; if (S.phase !== 'run') return;
    if (!S.pause.on) { S.pause.on = true; S.pause.since = Date.now(); if (!noAct) S.acts.push({ k: 'pause', on: true }); this.logEv('pause', 'Техническая пауза: гонка остановлена'); }
    else { S.pause.total += Date.now() - S.pause.since; S.pause.on = false; S.pause.since = null; if (!noAct) S.acts.push({ k: 'pause', on: false }); this.logEv('pause', 'Гонка продолжается'); }
    this.hub.broadcast({ k: 'pause', on: S.pause.on }, null, ['play']);
    this.pushState();
  },
  award(seatId) {
    const S = this.S; if (S.phase !== 'run' && S.phase !== 'count') return;
    S.acts.push({ k: 'award', seat: seatId, from: S.phase });
    this.finish(seatId);
  },
  // отменить последнее действие: пауза/продолжение или присуждение победы
  undo() {
    const S = this.S, a = S.acts.pop(); if (!a) return;
    if (a.k === 'pause') { this.techPause(true); this.logEv('undo', 'Отменено: ' + (a.on ? 'техническая пауза' : 'возобновление')); }
    else if (a.k === 'award' && S.phase === 'done') {
      S.phase = 'run'; S.winner = null; S.awarded = false; const rid = S.result && S.result.id; S.result = null;
      this.saveArchive(this.archive().filter((x) => x.id !== rid));
      for (const p of this.seatList()) if (!p.fin) p.dnf = false;
      this.logEv('undo', 'Отменено: присуждение победы. Гонка продолжается');
      this.hub.broadcast({ k: 'state', s: this.pub() }); this.hub.broadcast({ k: 'resume' }, null, ['play']);
    }
    this.pushState();
  },
  restart() { // «Переиграть»: новое зерно, все возвращаются в комнату ожидания
    const S = this.S; clearTimeout(this.cdT);
    if (S.phase !== 'lobby') this.logEv('reset', 'Гонка перезапущена: новое зерно, игроки возвращаются в комнату');
    S.phase = 'lobby'; S.id = this.id(); S.seed = newSeed(); S.goAt = null; S.pause = { on: false, since: null, total: 0 }; S.winner = null; S.awarded = false; S.result = null; S.acts = []; S.prepAt = null;
    for (const p of this.seatList()) { p.ready = false; p.loaded = false; p.fin = null; p.dnf = false; p.splits = []; p.tel = null; }
    this.hub.broadcast({ k: 'reset' }, null, ['play']); this.pushState();
  },
  cancel() { // отменить гонку: не попадает в архив
    const S = this.S; if (S.phase === 'lobby' || S.phase === 'done') return; clearTimeout(this.cdT);
    this.hub.broadcast({ k: 'end', awarded: false }, null, ['play']); this.logEv('cancel', 'Гонка отменена организатором'); this.restart();
  },

  // ----- ссылки -----
  base() { return location.origin + location.pathname; },
  links() { const c = this.S.code; return { play: `${this.base()}?race=play&room=${c}`, watch: `${this.base()}?race=watch&room=${c}`, stream: `${this.base()}?race=watch&room=${c}&stream=1`, overlay: `${this.base()}?race=watch&room=${c}&stream=1&overlay=1` }; },

  // ----- панель -----
  panel() {
    Speedrun.css(); this.css();
    let el = document.getElementById('rc-org'); if (el) { el.hidden = false; Ov.opened(el); return el; }
    el = document.createElement('div'); el.id = 'rc-org'; el.className = 'sr-ov rc-ov'; el.hidden = true;
    el.innerHTML = `<div class="card wide" role="dialog" aria-labelledby="rco-t"><h2 id="rco-t">Организатор гонки</h2><div id="rco-body"></div></div>`;
    document.body.appendChild(el);
    Ov.chrome(el, { crumbs: ['Гонки Ткачей', 'Организатор'], back: () => this.hidePanel(), hint: { act: 'нажать' } });
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.hidePanel(); });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    el.hidden = false; Ov.opened(el);
    return el;
  },
  hidePanel() { const el = document.getElementById('rc-org'); if (el) el.hidden = true; const m = window.__game && window.__game.scene.getScene('menu'); if (m) m.leaving = false; },
  css() {
    if (document.getElementById('rc-css')) return;
    const st = document.createElement('style'); st.id = 'rc-css';
    st.textContent = `.rc-ov .card.wide{width:min(1040px,100%)}.rc-ov .grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.rc-ov .grid2>*{min-width:0}@media(max-width:760px){.rc-ov .grid2{grid-template-columns:minmax(0,1fr)}}
.rc-ov .box{align-content:start;background:#0a1512;border:1px solid #1d3630;border-radius:8px;padding:10px 12px;display:grid;gap:6px;min-width:0}.rc-ov .box h3{margin:0}
.rc-ov .link{display:flex;gap:6px;align-items:center;min-width:0}.rc-ov .link span{flex:none;width:96px;font-size:12px;color:var(--muted)}@media(max-width:760px){.rc-ov .link{flex-wrap:wrap}.rc-ov .link span{width:100%}}.rc-ov .link button{flex:none}.rc-ov .link code{flex:1;min-width:0;overflow-wrap:anywhere;word-break:break-all;white-space:normal;background:#08130f;border:1px solid #24433a;border-radius:6px;padding:6px 8px;font:12px ui-monospace,Consolas,monospace;color:#cfe8dc;user-select:all}
.rc-ov .dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#d28a6a;margin-right:6px}.rc-ov .dot.on{background:#7ff0a8}
.rc-ov .log{max-height:220px;overflow:auto;font:12px/1.5 ui-monospace,Consolas,monospace;background:#08130f;border:1px solid #24433a;border-radius:6px;padding:6px 8px}.rc-ov .log div{white-space:pre-wrap}.rc-ov .log .t{color:#6f9586}
.rc-ov .big{font:700 30px var(--display);color:var(--bone)}.rc-ov .chip{display:inline-block;padding:2px 9px;border-radius:99px;background:#143029;border:1px solid #3a6b5a;font-size:12px}.rc-ov .chip.warn{border-color:#d28a6a;color:#ffb48a}
.rc-ov label.nm{align-content:start}.rc-ov select{font:14px var(--body);background:#08130f;color:var(--bone);border:1px solid #2c5246;border-radius:6px;padding:7px 9px}.rc-ov .row.end{justify-content:flex-end}`;
    document.head.appendChild(st);
  },
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
  render() {
    const el = document.getElementById('rc-org'), S = this.S; if (!el || !S || el.hidden) return;
    const body = el.querySelector('#rco-body'), E = this.esc, L = this.links(), ps = this.seatList(), f = (ms) => Speedrun.fmt(ms);
    const focus = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : '';
    const phase = { lobby: 'ожидание игроков', prep: 'загрузка у игроков', count: 'отсчёт', run: S.pause.on ? 'ТЕХНИЧЕСКАЯ ПАУЗА' : 'гонка идёт', done: 'гонка окончена' }[S.phase];
    const srv = { open: 'сервер: на связи', opening: 'сервер: подключаемся…', busy: `сервер: прежний код ещё занят, ждём (${(this.srvInfo && this.srvInfo.tries) || 0})`, error: 'сервер: ошибка связи', closed: 'закрыто', idle: '' }[this.status] || this.status;
    const card = (i) => {
      const p = ps[i]; if (!p) return `<div class="box"><h3>Игрок ${i + 1}</h3><div class="lead">Ждём: отправьте ссылку игроку</div></div>`;
      const t = p.tel, hp = t ? `${t.hp}/${t.mh}` : '—', ph = p.fin ? 'финиш ' + f(p.fin.rta) : p.dnf ? 'сошёл' : S.phase === 'run' && t ? `${t.pa ? 'пауза · ' : ''}Гл. ${SR_CATS.trail.tags[Math.min(3, p.splits.length)] || ''} · ${f(t.el)}` : S.phase === 'lobby' ? (p.ready ? 'готов' : 'не готов') : p.loaded ? 'загружен' : 'загружается…';
      return `<div class="box"><h3><span class="dot ${p.online ? 'on' : ''}"></span>${E(p.name)}</h3><div>${ph}</div><div class="lead">${p.online ? `пинг ${p.rtt != null ? Math.round(p.rtt) + ' мс' : '…'}` : 'нет связи'}${t && S.phase === 'run' ? ` · маски ${hp} · смертей ${t.dt}` : ''}${p.restored ? ` · восстановлен ×${p.restored}` : ''}</div>${p.splits.length ? `<div class="lead">${p.splits.map((s, k) => `${SR_CATS.trail.tags[k]} ${f(s)}`).join(' · ')}</div>` : ''}</div>`;
    };
    const disc = `<select id="rco-disc" ${S.phase !== 'lobby' ? 'disabled' : ''}>${Object.entries(this.DISC).map(([id, d]) => `<option value="${id}" ${S.disc === id ? 'selected' : ''} ${d.ready ? '' : 'disabled'}>${d.name}${d.ready ? '' : ' — ' + d.note}</option>`).join('')}</select>`;
    const btn = (id, label, cls, dis) => `<button id="${id}" class="${cls || ''}" type="button" ${dis ? 'disabled' : ''}>${label}</button>`;
    body.innerHTML = `<div class="row"><span class="big">${E(S.code)}</span><span class="chip">${phase}</span><span class="chip ${this.status === 'open' ? '' : 'warn'}">${srv}</span><span class="chip">обсерверов: ${this.watchers()}</span>${S.phase === 'run' || S.phase === 'done' ? `<span class="chip" id="rco-clock">${f(S.phase === 'done' && S.result ? ((S.result.players[0] || {}).time || 0) : this.elapsed())}</span>` : ''}</div>
<div class="grid2"><div class="box"><h3>Ссылки</h3>
<div class="link"><span>Игрокам</span><code>${E(L.play)}</code><button data-copy="play" type="button">Копировать</button></div>
<div class="link"><span>Обсервер</span><code>${E(L.watch)}</code><button data-copy="watch" type="button">Копировать</button></div>
<div class="link"><span>Для стрима</span><code>${E(L.stream)}</code><button data-copy="stream" type="button">Копировать</button></div>
<div class="link"><span>OBS (фон прозрачный)</span><code>${E(L.overlay)}</code><button data-copy="overlay" type="button">Копировать</button></div></div>
<div class="box"><h3>Гонка</h3><label class="nm">Дисциплина${disc}</label><div class="lead">Одна гонка — одна дисциплина. Зерно общее: одинаковые враги и бусины у обоих. Зерно: <code>${S.seed}</code> ${S.phase === 'lobby' ? '<button id="rco-seed" type="button" class="ghost">другое</button>' : ''}</div>
<div class="lead">Лёгкий режим и замедление игры игроку запрещены. Версия игры у всех должна быть ${GAME_VERSION}.</div></div></div>
<div class="grid2">${card(0)}${card(1)}</div>
<div class="row">${btn('rco-start', S.phase === 'prep' ? 'Начать без ожидания' : 'Старт гонки', 'primary', !(this.canStart() || (S.phase === 'prep' && ps.some((p) => p.online))))}${btn('rco-pause', S.pause.on ? 'Продолжить гонку' : 'Тех. пауза', '', S.phase !== 'run')}${btn('rco-restart', 'Переиграть', '', S.phase === 'lobby')}
${btn('rco-aw1', 'Присудить: ' + E(ps[0] ? ps[0].name : '—'), '', !(S.phase === 'run' || S.phase === 'count') || !ps[0])}${btn('rco-aw2', 'Присудить: ' + E(ps[1] ? ps[1].name : '—'), '', !(S.phase === 'run' || S.phase === 'count') || !ps[1])}
${btn('rco-undo', 'Отменить действие', '', !S.acts.length)}${btn('rco-cancel', 'Отменить гонку', 'ghost', S.phase === 'lobby' || S.phase === 'done')}</div>
${S.phase === 'done' && S.result ? `<div class="box"><h3>Итог</h3>${S.result.players.map((p) => `<div>${p.place}. ${E(p.name)} — ${p.dnf ? 'не финишировал' : f(p.time)}${p.deaths != null ? ` · смертей ${p.deaths}` : ''}</div>`).join('')}<div class="lead">${S.result.winner === 'draw' ? 'Ничья' : S.result.winner ? 'Победитель: ' + E(S.result.winner) : ''}${S.result.awarded ? ' (присуждено)' : ''}. Результат записан в архив.</div></div>` : ''}
<div class="box"><h3>Лог</h3><div class="log" id="rco-log">${S.events.slice(-80).map((e) => `<div><span class="t">${e.t != null ? f(e.t) : '—:--'}</span> ${E(e.x)}</div>`).join('')}</div></div>
<div class="row"><button id="rco-arch" type="button">Архив гонок</button><button id="rco-dl" type="button">Скачать races.json</button><button id="rco-hide" class="ghost" type="button">Свернуть панель (комната работает)</button><button id="rco-end" class="ghost" type="button">Закрыть комнату</button></div>
<div id="rco-msg" role="status" class="lead"></div>`;
    const $ = (id) => body.querySelector('#' + id), on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    body.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => Speedrun.copy(L[b.dataset.copy], (ok) => { b.textContent = ok ? 'Скопировано' : 'Выделите вручную'; setTimeout(() => { b.textContent = 'Копировать'; }, 1500); }); });
    on('rco-start', () => (S.phase === 'prep' ? this.maybeCount(true) : this.start()));
    on('rco-pause', () => this.techPause()); on('rco-restart', () => this.confirm('Переиграть: все вернутся в комнату, зерно сменится.', () => this.restart()));
    on('rco-aw1', () => this.confirm(`Присудить победу: ${ps[0].name}?`, () => this.award(ps[0].id))); on('rco-aw2', () => this.confirm(`Присудить победу: ${ps[1].name}?`, () => this.award(ps[1].id)));
    on('rco-undo', () => this.undo()); on('rco-cancel', () => this.confirm('Отменить гонку без результата?', () => this.cancel()));
    on('rco-arch', () => this.archiveOpen()); on('rco-dl', () => this.download()); on('rco-hide', () => this.hidePanel());
    on('rco-end', () => this.confirm('Закрыть комнату? Игроки и обсерверы потеряют связь, незаписанная гонка пропадёт.', () => this.close(true)));
    on('rco-seed', () => { S.seed = newSeed(); this.save(); this.render(); });
    const sel = $('rco-disc'); if (sel) sel.onchange = () => { S.disc = sel.value; this.pushState(); };
    const lg = $('rco-log'); if (lg) lg.scrollTop = lg.scrollHeight;
    if (focus && body.querySelector('#' + focus)) body.querySelector('#' + focus).focus();
    // таймер в шапке тикает без полной перерисовки
    clearInterval(this.clockT);
    if (S.phase === 'run') this.clockT = setInterval(() => { const c = document.getElementById('rco-clock'); if (c && this.S) c.textContent = f(this.elapsed()); else clearInterval(this.clockT); }, 200);
  },
  // подтверждение (чтобы случайный клик не сломал гонку)
  confirm(text, fn) {
    const m = document.getElementById('rco-msg'); if (!m) { fn(); return; }
    m.innerHTML = `${this.esc(text)} <button id="rco-yes" class="primary" type="button">Да</button> <button id="rco-no" type="button">Нет</button>`;
    m.querySelector('#rco-yes').onclick = () => { m.textContent = ''; fn(); }; m.querySelector('#rco-no').onclick = () => { m.textContent = ''; };
    m.querySelector('#rco-no').focus();
  },
  // ----- архив -----
  download() {
    const data = JSON.stringify({ format: 'tropa-tkachei/races', version: 1, game: GAME_VERSION, exported: new Date().toISOString(), races: this.archive() }, null, 1);
    try {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'races.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (_) { const m = document.getElementById('rco-msg'); if (m) m.textContent = 'Не удалось скачать файл в этом браузере.'; }
  },
  archiveOpen() {
    Speedrun.css(); this.css();
    let el = document.getElementById('rc-arch');
    if (!el) {
      el = document.createElement('div'); el.id = 'rc-arch'; el.className = 'sr-ov rc-ov'; el.hidden = true;
      el.innerHTML = `<div class="card wide" role="dialog" aria-labelledby="rca-t"><h2 id="rca-t">Архив гонок</h2><div id="rca-body"></div></div>`;
      document.body.appendChild(el);
      Ov.chrome(el, { crumbs: ['Гонки Ткачей', 'Архив'], back: () => { el.hidden = true; }, hint: { act: 'нажать' } });
      el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') el.hidden = true; });
      el.addEventListener('keyup', (e) => e.stopPropagation());
    }
    el.hidden = false; Ov.opened(el); this.archiveRender();
  },
  archiveRender() {
    const el = document.getElementById('rc-arch'); if (!el) return; const body = el.querySelector('#rca-body'), E = this.esc, f = (ms) => Speedrun.fmt(ms), a = this.archive();
    const names = [...new Set(a.flatMap((r) => r.players.map((p) => p.name)))];
    body.innerHTML = `<p class="lead">Рейтинг Эло и общая страница появятся в версии 1.9; пока здесь хранится история, которую можно скачать как <b>races.json</b>.</p>
<div class="row"><button id="rca-dl" class="primary" type="button">Скачать races.json</button><button id="rca-clear" class="ghost" type="button">Очистить архив</button></div>
<div class="box"><h3>Объединить игроков</h3><div class="lead">Один человек мог войти под разными именами («Ярь» и «ярь »): выберите, кого в кого слить. Сравнение по умолчанию без учёта регистра и пробелов.</div>
<div class="row"><select id="rca-a">${names.map((n) => `<option>${E(n)}</option>`).join('')}</select><span>→</span><select id="rca-b">${names.map((n) => `<option>${E(n)}</option>`).join('')}</select><button id="rca-merge" type="button">Объединить</button></div><div id="rca-msg" role="status" class="lead"></div></div>
${a.length ? `<table><tr><th>Дата</th><th>Дисциплина</th><th>Игроки и время</th><th>Победитель</th></tr>${a.slice().reverse().map((r) => `<tr><td>${E(new Date(r.date).toLocaleString('ru-RU'))}</td><td>${E((this.DISC[r.discipline] || {}).name || r.discipline)}</td><td>${r.players.map((p) => `${E(p.name)} ${p.dnf ? '—' : f(p.time)}`).join(' · ')}</td><td>${r.winner === 'draw' ? 'ничья' : E(r.winner || '—')}${r.awarded ? ' (присуждено)' : ''}</td></tr>`).join('')}</table>` : '<div class="lead">Пока нет ни одной гонки.</div>'}`;
    const $ = (id) => body.querySelector('#' + id);
    $('rca-dl').onclick = () => this.download();
    $('rca-clear').onclick = () => { if (confirm('Стереть весь архив гонок?')) { this.saveArchive([]); this.archiveRender(); } };
    $('rca-merge').onclick = () => {
      const from = $('rca-a').value, to = $('rca-b').value, m = $('rca-msg');
      if (!from || !to || from === to) { m.textContent = 'Выберите двух разных игроков.'; return; }
      let n = 0; const arr = this.archive(); for (const r of arr) for (const p of r.players) if (p.name === from) { p.name = to; n++; }
      for (const r of arr) if (r.winner === from) r.winner = to;
      this.saveArchive(arr); this.archiveRender(); const m2 = document.getElementById('rca-msg'); if (m2) m2.textContent = `Объединено записей: ${n}.`;
    };
  },
};

// ===== меню «Гонки Ткачей»: рабочие пункты вместо заглушки =====
{
  const d = MENU.races;
  d.info = () => {
    const st = RaceOrg.stored(), out = ['Соревнование для двоих: организатор создаёт гонку, два игрока играют у себя, обсервер показывает обоих сразу.'];
    if (st) out.push({ t: `Есть незавершённая комната организатора: ${st.S.code}`, c: '#ffd47a' });
    const sess = RacePlay.loadSess(); if (sess) out.push({ t: `Вы были в комнате ${sess.code} как игрок`, c: '#ffd47a' });
    return out;
  };
  d.items = () => {
    const st = RaceOrg.stored(), items = [];
    if (st && !RaceOrg.S) items.push({ label: 'Продолжить комнату организатора', sub: `код ${st.S.code} · ${st.S.phase === 'run' ? 'гонка шла' : 'ожидание'}`, act: () => RaceOrg.resume() });
    if (RaceOrg.S) items.push({ label: 'Панель организатора', sub: `комната ${RaceOrg.S.code} работает`, act: () => RaceOrg.panel() && RaceOrg.render() });
    else items.push({ label: 'Создать гонку', sub: 'вы организатор и сами не играете', act: () => RaceOrg.create() });
    items.push({ label: 'Войти игроком по коду', sub: 'код или ссылка от организатора', act: () => RacePlay.open('', {}) });
    items.push({ label: 'Обсервер', sub: 'смотреть гонку: 1920×1080, две половины и табло', act: () => RaceWatch.open('', {}) });
    items.push({ label: 'Архив гонок', sub: 'история, races.json (рейтинг — в 1.9)', act: () => RaceOrg.archiveOpen() });
    return items.map((it, i) => ({ key: String(i + 1), ...it }));
  };
}
// ссылки ?race=org | play | watch: открываем нужное окно сразу после меню
{
  const createO = MenuScene.prototype.create;
  MenuScene.prototype.create = function (...a) {
    const r = createO.apply(this, a);
    if (!window.__rcUrlDone) {
      window.__rcUrlDone = true;
      const q = new URLSearchParams(location.search), m = q.get('race');
      if (m) setTimeout(() => {
        try {
          if (m === 'org') { if (!RaceOrg.resume()) RaceOrg.create(); }
          else if (m === 'play') RacePlay.fromUrl();
          else if (m === 'watch') RaceWatch.fromUrl();
        } catch (e) { console.error(e); }
      }, 500);
      else { // обычный запуск: если организатор перезагрузил вкладку посреди гонки — подсказка в меню, игроку — автовосстановление
        const sess = RacePlay.loadSess(), inf = Journal.info();
        if (sess && inf && inf.race && inf.race.code === sess.code) setTimeout(() => { try { RacePlay.open(sess.code, { auto: true }); } catch (e) { console.error(e); } }, 500);
      }
    }
    return r;
  };
}
