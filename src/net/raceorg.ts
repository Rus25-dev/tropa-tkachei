// «Гонки Ткачей»: организатор (legacy/src/race-org.js). Сам не играет: создаёт одну гонку в одной дисциплине, раздаёт ссылки, запускает общий
// отсчёт, ставит техническую паузу, переигрывает, присуждает победу, отменяет своё последнее действие. Всё состояние пишется в хранилище
// (tt_rc_org): после перезагрузки страницы комната поднимается с тем же кодом, места игроков и ход гонки восстанавливаются, а игроки и
// обсерверы переподключаются сами. Итоги гонок копятся в архиве (tt_races) в формате races.json.
// Класс не знает про DOM: транспорт, часы и хранилище подставляются (поэтому проверяется в Node на виртуальном времени).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { SR_CATS } from '../core/balance';
import { fmt } from '../core/timefmt';
import { Hub, type Seat } from './hub';
import { DISC, norm, type Fin, type OrgSeat, type OrgState, type Phase, type RaceEvent, type RaceResult, type RaceStore, type ResultRow, type RoomState } from './racecommon';
import { defaultEnv, makeCode, type Env, type Msg, type Transport } from './types';

export interface OrgOpts {
  transport: Transport; env?: Env; version: string; store: RaceStore;
  /** зерно мира для гонки */
  newSeed?: () => number;
}
const TAGS = SR_CATS.trail.tags;

export class RaceOrg {
  S: OrgState | null = null; hub: Hub | null = null; status = 'idle'; srvInfo: { tries?: number } | undefined;
  private env: Env; private saveT: unknown = null; private flushT: unknown = null; private cdT: unknown = null; private pend: Record<number, Msg> = {}; private rvT = 0;
  private subs = new Set<() => void>();
  constructor(private o: OrgOpts) { this.env = o.env ?? defaultEnv(); }

  subscribe(f: () => void): () => void { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private changed(): void { for (const f of [...this.subs]) f(); }
  wall(): number { return this.env.wall ? this.env.wall() : Date.now(); }
  private seedNew(): number { return this.o.newSeed ? this.o.newSeed() >>> 0 : (this.env.rand() * 4294967296) >>> 0; }
  private newId(): string { return this.wall().toString(36) + makeCode(this.env.rand).toLowerCase(); }
  private fresh(code: string): OrgState {
    return { v: 1, code, id: this.newId(), created: this.wall(), phase: 'lobby', disc: 'trail', seed: this.seedNew(), seats: {}, goAt: null, pause: { on: false, since: null, total: 0 }, winner: null, awarded: false, events: [], acts: [], result: null, ver: this.o.version, prepAt: null };
  }

  // ----- хранилище -----
  stored(): OrgState | null { const o = this.o.store.loadOrg(); return o && o.S && o.S.code && o.S.v === 1 ? o.S : null; }
  save(now?: boolean): void {
    if (!this.S) return;
    const go = (): void => {
      this.saveT = null; if (!this.S) return;
      const S = JSON.parse(JSON.stringify(this.S, (k, v) => (k === 'tel' ? undefined : v))) as OrgState;
      this.o.store.saveOrg({ S, hub: this.hub ? this.hub.dump() : null, at: this.wall() });
    };
    if (now) { if (this.saveT) this.env.clearTimeout(this.saveT); go(); } else if (!this.saveT) this.saveT = this.env.setTimeout(go, 250);
  }
  archive(): RaceResult[] { return this.o.store.archive(); }
  saveArchive(a: RaceResult[]): void { this.o.store.saveArchive(a); }

  // ----- запуск -----
  create(): void {
    if (this.hub) return;
    this.S = this.fresh(makeCode(this.env.rand)); this.openHub(null); this.save(true); this.changed();
  }
  resume(): boolean {
    const st = this.o.store.loadOrg(); if (!st || !st.S || !st.S.code || st.S.v !== 1) return false;
    if (this.hub) { this.changed(); return true; }
    this.S = st.S; this.openHub(st.hub);
    // перезагрузка посреди отсчёта: отсчёт начнётся заново (игроки отпускаются только по «go»)
    if (this.S.phase === 'count') this.countdown();
    this.note(`Организатор вернулся после перезагрузки: комната ${this.S.code} восстановлена, ждём игроков`);
    return true;
  }
  private openHub(state: any): void {
    const S = this.S!;
    this.hub = new Hub({
      code: S.code, ns: 'race', transport: this.o.transport, env: this.env, state,
      accept: (h, seat) => this.accept(h, seat), snap: (seat) => this.snap(seat),
      onMsg: (seat, m) => this.onMsg(seat, m), onSeat: (seat, kind) => this.onSeat(seat, kind), onTel: (seat, t) => this.onTel(seat, t),
      onStatus: (s, i) => { this.status = s; this.srvInfo = i as { tries?: number } | undefined; this.changed(); },
    });
    this.hub.open();
    // телеметрия: игроки → организатор → обсерверы (пачкой ~15 Гц) и сопернику (редко)
    this.pend = {}; this.rvT = 0;
    this.flushT = this.env.setInterval(() => this.flush(), 66);
  }
  close(clear?: boolean): void {
    if (this.flushT) this.env.clearInterval(this.flushT); if (this.cdT) this.env.clearTimeout(this.cdT); if (this.saveT) { this.env.clearTimeout(this.saveT); this.saveT = null; }
    this.flushT = null; this.cdT = null;
    if (this.hub) { this.hub.close(); this.hub = null; }
    if (clear) this.o.store.clearOrg();
    this.S = null; this.status = 'idle'; this.changed();
  }

  // ----- представление состояния -----
  seatList(): OrgSeat[] { return this.S ? Object.values(this.S.seats).filter((x) => x.role === 'play').sort((a, b) => a.id - b.id) : []; }
  watchers(): number { return this.hub ? [...this.hub.seats.values()].filter((s) => s.role === 'watch' && s.online).length : 0; }
  pub(): RoomState {
    const S = this.S!, now = this.wall();
    return {
      v: 1, id: S.id, code: S.code, phase: S.phase, disc: S.disc, discName: DISC[S.disc]!.name, goAt: S.goAt, ver: S.ver, now,
      pause: { on: S.pause.on, total: S.pause.total, since: S.pause.since }, winner: S.winner, awarded: S.awarded, watchers: this.watchers(),
      players: this.seatList().map((p) => {
        const hs = this.hub && this.hub.seatById(p.id); if (hs && hs.rtt != null) p.rtt = hs.rtt;
        return { seat: p.id, name: p.name, ready: !!p.ready, loaded: !!p.loaded, online: !!p.online, rtt: p.rtt != null ? Math.round(p.rtt) : null, fin: p.fin ? { rta: p.fin.rta, igt: p.fin.igt, deaths: p.fin.deaths } : null, dnf: !!p.dnf,
          sp: p.splits.length, splits: p.splits.slice(), restored: p.restored | 0 };
      }),
    };
  }
  snap(seat: Seat): RoomState {
    const S = this.S!, tel: Record<number, any> = {}; for (const p of this.seatList()) if (p.tel) tel[p.id] = p.tel;
    return { ...this.pub(), seat: seat.id, tel, log: S.events.slice(-60), result: S.result, stats: this.statsOf() };
  }
  private statsOf(): Record<number, any> { const o: Record<number, any> = {}; for (const p of this.seatList()) if (p.fin && p.fin.stats) o[p.id] = p.fin.stats; return o; }
  private pushState(): void { if (this.hub && this.S) this.hub.broadcast({ k: 'state', s: this.pub() }); this.save(); this.changed(); }
  /** событие для ленты: уходит всем надёжно и пишется в журнал гонки */
  logEv(kind: string, text: string, seat?: number | null, extra?: Record<string, unknown>): RaceEvent {
    const S = this.S!, el = S.goAt ? this.elapsed() : null;
    const e: RaceEvent = { n: (S.events.length ? S.events[S.events.length - 1]!.n : 0) + 1, t: el, k: kind, s: seat != null ? seat : null, x: text, ...(extra || {}) };
    S.events.push(e); if (S.events.length > 600) S.events.splice(0, S.events.length - 600);
    if (this.hub) this.hub.broadcast({ k: 'ev', e });
    this.save(); this.changed(); return e;
  }
  note(text: string): void { if (this.S) { this.S.note = text; this.logEv('org', text); } }
  elapsed(): number { const S = this.S; if (!S || !S.goAt) return 0; const now = this.wall(); return Math.max(0, now - S.goAt - S.pause.total - (S.pause.on ? now - S.pause.since! : 0)); }
  nameOf(id: number): string { const p = this.S?.seats[id]; return p ? p.name : '—'; }

  // ----- сеть: вход, потери, сообщения -----
  private accept(h: Msg, seat: Seat | null): { ok: boolean; role?: 'play' | 'watch'; why?: string } {
    const S = this.S; if (!S) return { ok: false, why: 'комната закрыта' };
    if (h['room'] && String(h['room']).toUpperCase() !== S.code) return { ok: false, why: 'другая комната' };
    if (h['ver'] !== this.o.version) return { ok: false, why: `версия игры ${h['ver'] || '?'} не совпадает с версией организатора ${this.o.version}: обновите страницу` };
    if (h['role'] === 'watch') return { ok: true, role: 'watch' };
    if (seat) return { ok: true, role: 'play' };
    const name = String(h['name'] || '').trim(); if (!name) return { ok: false, why: 'введите имя' };
    if (S.phase !== 'lobby') return { ok: false, why: 'гонка уже идёт' };
    const ps = this.seatList(); if (ps.length >= 2) return { ok: false, why: 'в комнате уже два игрока' };
    const n = norm(name); if (ps.some((p) => norm(p.name) === n)) return { ok: false, why: `имя «${name}» уже занято в этой комнате` };
    return { ok: true, role: 'play' };
  }
  private seatRec(seat: Seat): OrgSeat {
    const S = this.S!; let p = S.seats[seat.id];
    if (!p) p = S.seats[seat.id] = { id: seat.id, key: seat.key, role: seat.role, name: seat.name, ready: false, loaded: false, online: false, fin: null, dnf: false, splits: [], viol: [], restored: 0, rtt: null, tel: null };
    return p;
  }
  private onSeat(seat: Seat, kind: string): void {
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
  }
  private onTel(seat: Seat, t: any): void { const p = this.S && this.S.seats[seat.id]; if (!p || seat.role !== 'play' || !t) return; p.tel = t; this.pend[seat.id] = t; }
  private flush(): void {
    const S = this.S, hub = this.hub; if (!S || !hub) return;
    const ids = Object.keys(this.pend); if (!ids.length) return;
    const tl = ids.map((i) => this.pend[Number(i)]); this.pend = {};
    hub.light({ tl }, ['watch']);
    // сопернику — реже и в коротком виде
    const now = this.env.now();
    if (now - this.rvT > 250) {
      this.rvT = now;
      const ps = this.seatList();
      for (const p of ps) {
        const o = ps.find((q) => q.id !== p.id), hs = hub.seatById(p.id);
        if (o && o.tel && hs) { const t = o.tel; hub.lightTo(hs, { rv: { s: o.id, el: t['el'], ch: t['ch'], st: t['st'], x: t['x'], y: t['y'], f: t['f'], sp: t['sp'], dn: t['dn'] } }); }
      }
    }
  }
  private onMsg(seat: Seat, m: any): void {
    const S = this.S; if (!S || !m) return; const p = this.seatRec(seat);
    if (seat.role !== 'play') return;
    switch (m.k) {
      case 'ready': p.viol = Array.isArray(m.viol) ? m.viol : []; p.ready = !!m.v && !p.viol.length && S.phase === 'lobby'; this.pushState(); break;
      case 'loaded': if (S.phase === 'prep' && m.id === S.id) { p.loaded = true; this.pushState(); this.maybeCount(); } break;
      case 'restored': this.logEv('restored', `${p.name}: забег восстановлен по журналу`, p.id); p.restored = (p.restored | 0) + 1; this.pushState(); break;
      case 'bad': this.logEv('bad', `${p.name} не может стартовать: ${m.why}`, p.id); break;
      case 'pev': this.playerEvent(p, m.e || {}); break;
      case 'fin': this.playerFin(p, m); break;
      case 'dnf': if (!p.dnf && !p.fin && (S.phase === 'run' || S.phase === 'count')) { p.dnf = true; p.dnfAt = m.el | 0; this.logEv('dnf', `${p.name} сошёл с дистанции (${m.why || 'без причины'})`, p.id); this.pushState(); this.checkFinish(); } break;
    }
  }
  private playerEvent(p: OrgSeat, e: any): void {
    const S = this.S!; if (S.phase !== 'run' && S.phase !== 'done') return;
    const tag = (i: number): string => TAGS[i] || ('#' + (i + 1));
    switch (e.k) {
      case 'split': if (!p.splits[e.i] && e.i >= 0 && e.i < 4) { p.splits[e.i] = e.rta; this.logEv('split', `${p.name}: ${tag(e.i)} · ${fmt(e.rta)}`, p.id, { i: e.i, rta: e.rta }); } break;
      case 'death': this.logEv('death', `${p.name}: нить оборвалась`, p.id); break;
      case 'buy': this.logEv('buy', `${p.name} купил: ${e.name || e.id}`, p.id); break;
      case 'parry': this.logEv('parry', `${p.name}: отбив`, p.id); break;
      case 'exec': this.logEv('exec', `${p.name}: казнь босса`, p.id); break;
      case 'phase': this.logEv('phase', `${p.name}: босс перешёл в фазу ${e.ph}`, p.id, { ph: e.ph }); break;
      case 'stun': this.logEv('stun', `${p.name}: босс оглушён`, p.id); break;
    }
    this.pushState();
  }
  private playerFin(p: OrgSeat, m: any): void {
    const S = this.S!; if (p.fin || S.phase === 'lobby') return;
    const fin: Fin = { rta: m.rta | 0, igt: m.igt | 0, deaths: m.deaths | 0, splits: Array.isArray(m.splits) ? m.splits : [], stats: m.stats || null, restored: m.restored | 0 };
    p.fin = fin;
    if (fin.splits.length === 4) p.splits = fin.splits.map((s) => s.rta);
    this.logEv('fin', `${p.name} финишировал: ${fmt(fin.rta)}`, p.id, { rta: fin.rta });
    this.pushState(); this.checkFinish();
  }

  // ----- ход гонки -----
  canStart(): boolean { const ps = this.seatList(); return !!this.S && this.S.phase === 'lobby' && ps.length === 2 && ps.every((p) => p.online && p.ready); }
  start(): void {
    const S = this.S; if (!S || !this.canStart()) return;
    S.phase = 'prep'; S.prepAt = this.wall(); S.acts = []; S.winner = null; S.awarded = false; S.result = null; S.goAt = null; S.pause = { on: false, since: null, total: 0 };
    for (const p of this.seatList()) { p.loaded = false; p.fin = null; p.dnf = false; p.splits = []; }
    this.logEv('prep', 'Гонка: загрузка у игроков…');
    this.hub!.broadcast({ k: 'prep', id: S.id, seed: S.seed, cat: S.disc, ver: this.o.version }, null, ['play']);
    this.pushState();
  }
  /** «Начать без ожидания» (force) или все загрузились */
  maybeCount(force?: boolean): void {
    const S = this.S; if (!S || S.phase !== 'prep') return;
    const ps = this.seatList(); if (!force && !ps.every((p) => p.loaded)) return;
    this.countdown();
  }
  private countdown(): void {
    const S = this.S!; if (this.cdT) this.env.clearTimeout(this.cdT); S.phase = 'count'; this.pushState(); let n = 3;
    const step = (): void => {
      if (!this.S || this.S.phase !== 'count' || !this.hub) return;
      if (n > 0) { this.hub.broadcast({ k: 'cd', n }); this.logEv('cd', String(n)); n--; this.cdT = this.env.setTimeout(step, 1000); }
      else { S.phase = 'run'; S.goAt = this.wall(); this.hub.broadcast({ k: 'go', at: S.goAt }); this.logEv('go', 'ПОШЁЛ!'); this.pushState(); }
    };
    step();
  }
  private checkFinish(): void { const ps = this.seatList(); if (this.S && this.S.phase === 'run' && ps.length === 2 && ps.every((p) => p.fin || p.dnf)) this.finish(null); }
  /** результат: время игрока — его собственные часы забега (без технических пауз) */
  private buildResult(awardedSeat: number | null): RaceResult {
    const S = this.S!, ps = this.seatList();
    const rows: ResultRow[] = ps.map((p) => ({ seat: p.id, name: p.name, dnf: !p.fin, time: p.fin ? p.fin.rta : null, finalTime: p.fin ? p.fin.rta : null, igt: p.fin ? p.fin.igt : null, deaths: p.fin ? p.fin.deaths : null, stats: p.fin ? p.fin.stats : null,
      splits: p.fin && p.fin.splits.length ? p.fin.splits.map((s) => s.rta) : p.splits.filter((x) => x != null), eloBefore: null, eloAfter: null, place: 0 }));
    rows.sort((a, b) => (Number(a.dnf) - Number(b.dnf)) || ((a.time || 0) - (b.time || 0)));
    let winner: number | 'draw' | null = null, gap: number | null = null;
    if (awardedSeat != null) winner = awardedSeat;
    else if (rows[0] && !rows[0].dnf) {
      if (rows[1] && !rows[1].dnf) { gap = rows[1].time! - rows[0].time!; winner = Math.abs(gap) < 10 ? 'draw' : rows[0].seat; } else winner = rows[0].seat;
    }
    rows.forEach((r, i) => { r.place = winner === 'draw' ? 1 : i + 1; });
    if (awardedSeat != null) { rows.sort((a, b) => Number(b.seat === awardedSeat) - Number(a.seat === awardedSeat)); rows.forEach((r, i) => { r.place = i + 1; }); }
    return { id: S.id, date: new Date(this.wall()).toISOString(), version: this.o.version, discipline: S.disc, settings: { cat: S.disc, easy: false, speed: 100 }, seed: S.seed, players: rows, winner: winner === 'draw' ? 'draw' : winner == null ? null : this.nameOf(winner),
      winnerSeat: winner, awarded: awardedSeat != null, gap, goAt: S.goAt, pauseMs: S.pause.total, events: S.events.slice(-400) };
  }
  finish(awardedSeat: number | null): void {
    const S = this.S; if (!S || S.phase === 'done') return;
    if (S.pause.on) { S.pause.total += this.wall() - S.pause.since!; S.pause.on = false; S.pause.since = null; }
    const r = this.buildResult(awardedSeat);
    S.phase = 'done'; S.winner = r.winnerSeat; S.awarded = !!r.awarded; S.result = r;
    const a = this.archive().filter((x) => x.id !== r.id); a.push(r); this.saveArchive(a);
    this.logEv('done', r.winner === 'draw' ? 'Ничья' : r.winner ? `Победил ${r.winner}${r.gap != null ? ' (+' + fmt(r.gap) + ')' : ''}${r.awarded ? ' — присуждено организатором' : ''}` : 'Гонка окончена без победителя');
    this.hub!.broadcast({ k: 'res', r: { id: r.id, winner: r.winnerSeat, awarded: r.awarded, gap: r.gap, players: r.players.map((p) => ({ seat: p.seat, name: p.name, place: p.place, time: p.time, dnf: p.dnf })) } });
    this.pushState();
  }
  techPause(noAct?: boolean): void {
    const S = this.S; if (!S || S.phase !== 'run') return;
    if (!S.pause.on) { S.pause.on = true; S.pause.since = this.wall(); if (!noAct) S.acts.push({ k: 'pause', on: true }); this.logEv('pause', 'Техническая пауза: гонка остановлена'); }
    else { S.pause.total += this.wall() - S.pause.since!; S.pause.on = false; S.pause.since = null; if (!noAct) S.acts.push({ k: 'pause', on: false }); this.logEv('pause', 'Гонка продолжается'); }
    this.hub!.broadcast({ k: 'pause', on: S.pause.on }, null, ['play']);
    this.pushState();
  }
  award(seatId: number): void {
    const S = this.S; if (!S || (S.phase !== 'run' && S.phase !== 'count')) return;
    S.acts.push({ k: 'award', seat: seatId, from: S.phase });
    this.finish(seatId);
  }
  /** отменить последнее действие: пауза/продолжение или присуждение победы */
  undo(): void {
    const S = this.S; if (!S) return; const a = S.acts.pop(); if (!a) return;
    if (a.k === 'pause') { this.techPause(true); this.logEv('undo', 'Отменено: ' + (a.on ? 'техническая пауза' : 'возобновление')); }
    else if (a.k === 'award' && S.phase === 'done') {
      S.phase = 'run'; S.winner = null; S.awarded = false; const rid = S.result && S.result.id; S.result = null;
      this.saveArchive(this.archive().filter((x) => x.id !== rid));
      for (const p of this.seatList()) if (!p.fin) p.dnf = false;
      this.logEv('undo', 'Отменено: присуждение победы. Гонка продолжается');
      this.hub!.broadcast({ k: 'state', s: this.pub() }); this.hub!.broadcast({ k: 'resume' }, null, ['play']);
    }
    this.pushState();
  }
  /** «Переиграть»: новое зерно, все возвращаются в комнату ожидания */
  restart(): void {
    const S = this.S; if (!S) return; if (this.cdT) this.env.clearTimeout(this.cdT);
    if (S.phase !== 'lobby') this.logEv('reset', 'Гонка перезапущена: новое зерно, игроки возвращаются в комнату');
    S.phase = 'lobby'; S.id = this.newId(); S.seed = this.seedNew(); S.goAt = null; S.pause = { on: false, since: null, total: 0 }; S.winner = null; S.awarded = false; S.result = null; S.acts = []; S.prepAt = null;
    for (const p of this.seatList()) { p.ready = false; p.loaded = false; p.fin = null; p.dnf = false; p.splits = []; p.tel = null; }
    this.hub!.broadcast({ k: 'reset' }, null, ['play']); this.pushState();
  }
  /** отменить гонку: не попадает в архив */
  cancel(): void {
    const S = this.S; if (!S || S.phase === 'lobby' || S.phase === 'done') return; if (this.cdT) this.env.clearTimeout(this.cdT);
    this.hub!.broadcast({ k: 'end', awarded: false }, null, ['play']); this.logEv('cancel', 'Гонка отменена организатором'); this.restart();
  }
  setDisc(id: string): void { const S = this.S; if (S && S.phase === 'lobby' && DISC[id]?.ready) { S.disc = id; this.pushState(); } }
  newSeedNow(): void { const S = this.S; if (S && S.phase === 'lobby') { S.seed = this.seedNew(); this.save(); this.changed(); } }

  // ----- ссылки -----
  links(base: string): { play: string; watch: string; stream: string; overlay: string } {
    const c = this.S!.code;
    return { play: `${base}?race=play&room=${c}`, watch: `${base}?race=watch&room=${c}`, stream: `${base}?race=watch&room=${c}&stream=1`, overlay: `${base}?race=watch&room=${c}&stream=1&overlay=1` };
  }
  phaseOf(): Phase { return this.S?.phase ?? 'lobby'; }
}
