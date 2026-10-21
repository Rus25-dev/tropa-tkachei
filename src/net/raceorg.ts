// «Гонки Ткачей»: организатор (legacy/src/race-org.js). Сам не играет: создаёт одну гонку в одной дисциплине, раздаёт ссылки, запускает общий
// отсчёт, ставит техническую паузу, переигрывает, присуждает победу, отменяет своё последнее действие. Всё состояние пишется в хранилище
// (tt_rc_org): после перезагрузки страницы комната поднимается с тем же кодом, места игроков и ход гонки восстанавливаются, а игроки и
// обсерверы переподключаются сами. Итоги гонок копятся в архиве (tt_races) в формате races.json.
// Класс не знает про DOM: транспорт, часы и хранилище подставляются (поэтому проверяется в Node на виртуальном времени).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { applyVeto, autoVeto, BOSS_INFO, fracOf, newSeries, planRound, recordRound, roundWinner, vetoNow, type RoundPlan, type RoundSide, type RoundVerdict, type Side } from '../core/duel';
import { cleanMods } from '../core/duelmods';
import { computeElo, nkey } from '../core/elo';
import { fmt } from '../core/timefmt';
import { Hub, type Seat } from './hub';
import { personalBest, subLabel, tagsOf } from './raceprog';
import { DISC, modCfgOf, norm, type DuelCfg, type DuelPub, type Fin, type OrgSeat, type OrgState, type Phase, type RaceEvent, type RaceResult, type RaceStore, type ResultRow, type RoomState } from './racecommon';
import { defaultEnv, makeCode, type Env, type Msg, type Transport } from './types';

export interface OrgOpts {
  transport: Transport; env?: Env; version: string; store: RaceStore;
  /** зерно мира для гонки */
  newSeed?: () => number;
}
/** сколько ждать возможный более ранний «убил босса» соперника, прежде чем засчитать раунд (мс): на связи / без связи */
export const DUEL_GRACE = 1500, DUEL_GRACE_OFFLINE = 15000;
export const DEFAULT_DUEL_CFG: DuelCfg = { fmt: 3, fixed: [], random: false };

export class RaceOrg {
  S: OrgState | null = null; hub: Hub | null = null; status = 'idle'; srvInfo: { tries?: number } | undefined;
  private env: Env; private saveT: unknown = null; private flushT: unknown = null; private cdT: unknown = null; private pend: Record<number, Msg> = {}; private rvT = 0;
  /** дуэль: график погони (seat → [мс забега, доля снятого здоровья босса ×1000]) и ожидание более раннего убийства соперника */
  private chase: Record<number, [number, number][]> = {}; private chaseAt: Record<number, number> = {}; private graceT: unknown = null; private telAt: Record<number, number> = {};
  private subs = new Set<() => void>();
  constructor(private o: OrgOpts) { this.env = o.env ?? defaultEnv(); }

  subscribe(f: () => void): () => void { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private changed(): void { for (const f of [...this.subs]) f(); }
  wall(): number { return this.env.wall ? this.env.wall() : Date.now(); }
  private seedNew(): number { return this.o.newSeed ? this.o.newSeed() >>> 0 : (this.env.rand() * 4294967296) >>> 0; }
  private newId(): string { return this.wall().toString(36) + makeCode(this.env.rand).toLowerCase(); }
  private fresh(code: string): OrgState {
    return { v: 1, code, id: this.newId(), created: this.wall(), phase: 'lobby', disc: 'trail', seed: this.seedNew(), seats: {}, goAt: null, pause: { on: false, since: null, total: 0 }, winner: null, awarded: false, events: [], acts: [], result: null, ver: this.o.version, prepAt: null, duel: null, duelCfg: { ...DEFAULT_DUEL_CFG, fixed: [] } };
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
    if (this.S.phase === 'run') this.duelCheck();
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
    if (this.graceT) this.env.clearTimeout(this.graceT);
    this.flushT = null; this.cdT = null; this.graceT = null;
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
      v: 1, id: S.id, code: S.code, phase: S.phase, disc: S.disc, discName: DISC[S.disc]!.name, goAt: S.goAt, ver: S.ver, now, duel: this.duelPub(),
      pause: { on: S.pause.on, total: S.pause.total, since: S.pause.since }, winner: S.winner, awarded: S.awarded, watchers: this.watchers(),
      players: this.seatList().map((p) => {
        const hs = this.hub && this.hub.seatById(p.id); if (hs && hs.rtt != null) p.rtt = hs.rtt;
        return { seat: p.id, name: p.name, ready: !!p.ready, loaded: !!p.loaded, online: !!p.online, rtt: p.rtt != null ? Math.round(p.rtt) : null, fin: p.fin ? { rta: p.fin.rta, igt: p.fin.igt, deaths: p.fin.deaths, ...(p.fin.duel ? { kill: p.fin.duel.kill, frac: p.fin.duel.kill ? 1 : fracOf(p.fin.duel.hp, p.fin.duel.mh) } : {}) } : null, dnf: !!p.dnf,
          sp: p.splits.length, splits: p.splits.slice(), restored: p.restored | 0,
          subs: (p.subs || []).slice(), lost: p.lost ?? 0, deaths: (p.deathList || []).length, buys: (p.buys || []).length, pb: p.pb ?? null, bosses: (p.bosses || []).slice() };
      }),
    };
  }
  snap(seat: Seat): RoomState {
    const S = this.S!, tel: Record<number, any> = {}; for (const p of this.seatList()) if (p.tel) tel[p.id] = p.tel;
    return { ...this.pub(), seat: seat.id, tel, log: S.events.slice(-60), result: S.result, stats: this.statsOf(), ...(S.disc === 'duel' ? { chase: this.chase } : {}) };
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
    if (S.duel && S.duel.series.stage !== 'over') return { ok: false, why: 'серия дуэли уже идёт' };
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
  private onTel(seat: Seat, t: any): void {
    const p = this.S && this.S.seats[seat.id]; if (!p || seat.role !== 'play' || !t) return; p.tel = t; this.pend[seat.id] = t; this.telAt[seat.id] = this.env.now();
    if (this.S!.disc === 'duel' && this.S!.phase === 'run' && t.bs && typeof t.el === 'number') { // график погони: раз в ~250 мс забега
      const last = this.chaseAt[seat.id] ?? -1e9;
      if (t.el - last >= 250) { this.chaseAt[seat.id] = t.el; const a = (this.chase[seat.id] ??= []); a.push([t.el | 0, Math.round(1000 * fracOf(t.bs.hp, t.bs.mh))]); if (a.length > 4800) a.splice(0, a.length - 4800); }
    }
  }
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
        if (o && o.tel && hs) { const t = o.tel; hub.lightTo(hs, { rv: { s: o.id, el: t['el'], ch: t['ch'], st: t['st'], x: t['x'], y: t['y'], f: t['f'], sp: t['sp'], dn: t['dn'], vx: t['vx'], vy: t['vy'], g: t['g'], sit: t['sit'], sh: t['sh'] } }); }
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
      case 'veto': this.onVeto(p, m.boss); break;
      case 'pev': this.playerEvent(p, m.e || {}); break;
      case 'fin': this.playerFin(p, m); break;
      case 'dnf': if (!p.dnf && !p.fin && (S.phase === 'run' || S.phase === 'count')) { p.dnf = true; p.dnfAt = m.el | 0; this.logEv('dnf', `${p.name} сошёл с дистанции (${m.why || 'без причины'})`, p.id); this.pushState(); this.checkFinish(); } break;
    }
  }
  private playerEvent(p: OrgSeat, e: any): void {
    const S = this.S!; if (S.phase !== 'run' && S.phase !== 'done') return;
    const tag = (i: number): string => tagsOf(S.disc)[i] || ('#' + (i + 1));
    switch (e.k) {
      case 'split': if (!p.splits[e.i] && e.i >= 0 && e.i < 4) { p.splits[e.i] = e.rta; this.logEv('split', `${p.name}: ${S.disc === 'duel' ? this.duelBossName() + ' повержен' : tag(e.i)} · ${fmt(e.rta)}`, p.id, { i: e.i, rta: e.rta }); } break;
      case 'sub': {
        const ch = e.ch | 0, k = String(e.sk || ''); if (ch < 1 || ch > 4 || !k) break;
        const subs = (p.subs ??= []); if (subs.some((s) => s.ch === ch && s.k === k)) break;
        const rta = e.el | 0; subs.push({ ch, k, rta });
        if (k !== 'kill') this.logEv('sub', `${p.name}: ${subLabel(S.disc, ch, k)}`, p.id, { ch, sk: k, rta });
        break;
      }
      case 'boss': { // итог боя с боссом (на смерти босса)
        const ch = e.ch | 0; if (ch < 1 || ch > 4) break;
        const row = { ch, dmg: +e.dmg || 0, parries: e.par | 0, taken: e.tk | 0, stuns: e.stn | 0, execs: e.exe | 0, deaths: e.dth | 0, fight: e.fgt | 0 };
        const list = (p.bosses ??= []), i = list.findIndex((x) => x.ch === ch); if (i >= 0) list[i] = row; else list.push(row);
        break;
      }
      case 'death': { (p.deathList ??= []).push({ ch: e.ch | 0 || 1, rta: e.el | 0, lost: null }); this.logEv('death', `${p.name}: нить оборвалась`, p.id, { ch: e.ch | 0 || 1 }); break; }
      case 'lost': {
        const ms = Math.max(0, e.ms | 0), d = (p.deathList || []).slice().reverse().find((x) => x.lost == null);
        if (d) d.lost = ms;
        p.lost = (p.lost ?? 0) + ms;
        this.logEv('lost', `${p.name}: потеряно ${(ms / 1000).toFixed(1)} с после обрыва нити`, p.id, { ms });
        break;
      }
      case 'buy': {
        (p.buys ??= []).push({ id: String(e.id || ''), name: String(e.name || e.id || ''), ch: e.ch | 0 || 1, rta: e.el | 0, price: e.price | 0 });
        this.logEv('buy', `${p.name} купил(а): ${e.name || e.id}${e.price ? ` за ${e.price | 0}` : ''}`, p.id, { id: e.id, price: e.price | 0 });
        break;
      }
      case 'parry': this.logEv('parry', `${p.name}: отбив`, p.id); break;
      case 'exec': this.logEv('exec', `${p.name}: казнь босса`, p.id); break;
      case 'phase': this.logEv('phase', `${p.name}: босс перешёл в фазу ${e.ph}`, p.id, { ph: e.ph }); break;
      case 'stun': this.logEv('stun', `${p.name}: босс оглушён`, p.id); break;
    }
    this.pushState();
  }
  private playerFin(p: OrgSeat, m: any): void {
    const S = this.S!; if (p.fin || S.phase === 'lobby' || S.phase === 'veto' || (S.disc === 'duel' && S.phase === 'done')) return;
    const fin: Fin = { rta: m.rta | 0, igt: m.igt | 0, deaths: m.deaths | 0, splits: Array.isArray(m.splits) ? m.splits : [], stats: m.stats || null, restored: m.restored | 0 };
    if (S.disc === 'duel' && m.duel) fin.duel = { kill: !!m.duel.kill, ch: m.duel.ch | 0, hp: +m.duel.hp || 0, mh: +m.duel.mh || 1, dmg: +m.duel.dmg || 0 };
    p.fin = fin;
    if (fin.splits.length === 4) p.splits = fin.splits.map((s) => s.rta);
    // итоги боёв с боссами из самого финиша: последний бой событием уже не уйдёт (забег завершён)
    for (const b of Array.isArray(m.bosses) ? m.bosses : []) {
      const ch = b && b.ch | 0; if (ch < 1 || ch > 4) continue;
      const row = { ch, dmg: +b.dmg || 0, parries: b.parries | 0, taken: b.taken | 0, stuns: b.stuns | 0, execs: b.execs | 0, deaths: b.deaths | 0, fight: b.fight | 0 };
      const list = (p.bosses ??= []), i = list.findIndex((x) => x.ch === ch); if (i >= 0) list[i] = row; else list.push(row);
    }
    if (fin.splits.length === 4) { const subs = (p.subs ??= []); if (!subs.some((s) => s.ch === 4 && s.k === 'kill')) subs.push({ ch: 4, k: 'kill', rta: fin.splits[3]!.rta }); }
    if (fin.duel) {
      if (fin.duel.kill && !(p.subs ??= []).some((s) => s.k === 'kill')) p.subs.push({ ch: fin.duel.ch, k: 'kill', rta: fin.rta });
      this.logEv('fin', fin.duel.kill ? `${p.name} убил босса: ${fmt(fin.rta)}` : `${p.name}: нить оборвалась, у босса осталось ${Math.round(100 * (1 - fracOf(fin.duel.hp, fin.duel.mh)))} %`, p.id, { rta: fin.rta });
    } else this.logEv('fin', `${p.name} финишировал: ${fmt(fin.rta)}`, p.id, { rta: fin.rta });
    this.pushState(); this.checkFinish();
  }

  // ----- ход гонки -----
  canStart(): boolean {
    const ps = this.seatList(), S = this.S;
    if (S && S.disc === 'duel' && S.duel && S.duel.series.stage !== 'play') return false;
    return !!S && S.phase === 'lobby' && ps.length === 2 && ps.every((p) => p.online && p.ready);
  }
  /** у дуэли `canStart` — только про раунд; начать серию можно, пока её нет или прежняя закончена и сброшена */
  canStartSeries(): boolean { const ps = this.seatList(), S = this.S; return !!S && S.disc === 'duel' && S.phase === 'lobby' && !S.duel && ps.length === 2 && ps.every((p) => p.online && p.ready); }
  start(): void {
    const S = this.S; if (!S) return;
    if (S.disc === 'duel' && !S.duel) { if (this.canStartSeries()) this.startSeries(); return; }
    if (!this.canStart()) return;
    this.chase = {}; this.chaseAt = {};
    S.phase = 'prep'; S.prepAt = this.wall(); S.acts = []; S.winner = null; S.awarded = false; S.result = null; S.goAt = null; S.pause = { on: false, since: null, total: 0 };
    for (const p of this.seatList()) { p.loaded = false; p.fin = null; p.dnf = false; p.splits = []; p.subs = []; p.lost = 0; p.deathList = []; p.buys = []; p.bosses = []; p.pb = S.disc === 'duel' ? null : personalBest(this.archive(), p.name, S.disc); }
    const plan = S.disc === 'duel' && S.duel ? planRound(S.duel.series, S.duel.retry) : null;
    if (plan) S.seed = plan.seed;
    this.logEv('prep', plan ? `Раунд ${plan.n}: ${BOSS_INFO[plan.boss].name}, загрузка у игроков…` : 'Гонка: загрузка у игроков…');
    this.hub!.broadcast({ k: 'prep', id: S.id, seed: S.seed, cat: S.disc, ver: this.o.version, ...(plan ? { duel: { ch: plan.ch, boss: plan.boss, mods: plan.mods } } : {}) }, null, ['play']);
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
  private checkFinish(): void {
    if (this.S && this.S.disc === 'duel') { this.duelCheck(); return; }
    const ps = this.seatList(); if (this.S && this.S.phase === 'run' && ps.length === 2 && ps.every((p) => p.fin || p.dnf)) this.finish(null);
  }
  /** результат: время игрока — его собственные часы забега (без технических пауз) */
  private buildResult(awardedSeat: number | null): RaceResult {
    const S = this.S!, ps = this.seatList();
    const rows: ResultRow[] = ps.map((p) => ({ seat: p.id, name: p.name, dnf: !p.fin, time: p.fin ? p.fin.rta : null, finalTime: p.fin ? p.fin.rta : null, igt: p.fin ? p.fin.igt : null, deaths: p.fin ? p.fin.deaths : null, stats: p.fin ? p.fin.stats : null,
      splits: p.fin && p.fin.splits.length ? p.fin.splits.map((s) => s.rta) : p.splits.filter((x) => x != null), eloBefore: null, eloAfter: null, place: 0,
      ...(p.subs && p.subs.length ? { subs: p.subs.slice() } : {}), ...(p.lost ? { lost: p.lost } : {}), ...(p.deathList && p.deathList.length ? { deathList: p.deathList.slice() } : {}), ...(p.buys && p.buys.length ? { buys: p.buys.slice() } : {}), ...(p.bosses && p.bosses.length ? { bosses: p.bosses.slice().sort((a, b) => a.ch - b.ch) } : {}) }));
    rows.sort((a, b) => (Number(a.dnf) - Number(b.dnf)) || ((a.time || 0) - (b.time || 0)));
    let winner: number | 'draw' | null = null, gap: number | null = null;
    if (awardedSeat != null) winner = awardedSeat;
    else if (rows[0] && !rows[0].dnf) {
      if (rows[1] && !rows[1].dnf) { gap = rows[1].time! - rows[0].time!; winner = Math.abs(gap) < 10 ? 'draw' : rows[0].seat; } else winner = rows[0].seat;
    }
    rows.forEach((r, i) => { r.place = winner === 'draw' ? 1 : i + 1; });
    if (awardedSeat != null) { rows.sort((a, b) => Number(b.seat === awardedSeat) - Number(a.seat === awardedSeat)); rows.forEach((r, i) => { r.place = i + 1; }); }
    const res: RaceResult = { id: S.id, date: new Date(this.wall()).toISOString(), version: this.o.version, discipline: S.disc, settings: { cat: S.disc, easy: false, speed: 100 }, seed: S.seed, players: rows, winner: winner === 'draw' ? 'draw' : winner == null ? null : this.nameOf(winner),
      winnerSeat: winner, awarded: awardedSeat != null, gap, goAt: S.goAt, pauseMs: S.pause.total, events: S.events.slice(-400) };
    // Эло по дисциплине: пересчёт всей истории вместе с этой гонкой (единственный источник правды)
    const ch = computeElo([...this.archive().filter((x) => x.id !== res.id), res]).perRace[res.id];
    if (ch) for (const p of rows) { const c = ch.disc[nkey(p.name)]; if (c) { p.eloBefore = c.before; p.eloAfter = c.after; } }
    return res;
  }
  finish(awardedSeat: number | null): void {
    const S = this.S; if (!S || S.phase === 'done') return;
    if (S.pause.on) { S.pause.total += this.wall() - S.pause.since!; S.pause.on = false; S.pause.since = null; }
    if (S.disc === 'duel' && S.duel && S.duel.series.stage === 'play') { this.finishDuel(awardedSeat); return; }
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
    if (S.disc !== 'duel') S.acts.push({ k: 'award', seat: seatId, from: S.phase }); // присуждение раунда дуэли не отменяется: игроки уже ушли из раунда
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
    if (this.graceT) { this.env.clearTimeout(this.graceT); this.graceT = null; }
    const was = S.phase; this.chase = {}; this.chaseAt = {};
    S.phase = 'lobby'; S.id = this.newId(); S.seed = this.seedNew(); S.goAt = null; S.pause = { on: false, since: null, total: 0 }; S.winner = null; S.awarded = false; S.result = null; S.acts = []; S.prepAt = null;
    if (S.disc === 'duel' && S.duel) {
      const d = S.duel;
      if (d.series.stage === 'over' || d.series.stage === 'veto') S.duel = null; // новая серия (или сброс бан/пика)
      else { if (was === 'prep' || was === 'count' || was === 'run') d.retry++; const plan = planRound(d.series, d.retry); if (plan) S.seed = plan.seed; }
    }
    for (const p of this.seatList()) { p.ready = false; p.loaded = false; p.fin = null; p.dnf = false; p.splits = []; p.tel = null; p.subs = []; p.lost = 0; p.deathList = []; p.buys = []; p.bosses = []; p.pb = null; }
    this.hub!.broadcast({ k: 'reset' }, null, ['play']); this.pushState();
  }
  /** отменить гонку: не попадает в архив */
  cancel(): void {
    const S = this.S; if (!S || S.phase === 'lobby' || S.phase === 'done') return; if (this.cdT) this.env.clearTimeout(this.cdT);
    this.hub!.broadcast({ k: 'end', awarded: false }, null, ['play']); this.logEv('cancel', 'Гонка отменена организатором'); this.restart();
  }
  setDisc(id: string): void { const S = this.S; if (S && S.phase === 'lobby' && DISC[id]?.ready && !S.duel) { S.disc = id; this.pushState(); } }
  newSeedNow(): void { const S = this.S; if (S && S.phase === 'lobby' && !(S.disc === 'duel' && S.duel)) { S.seed = this.seedNew(); this.save(); this.changed(); } }

  // ===================== дуэль ткачей (2.4) =====================
  duelCfg(): DuelCfg { const S = this.S; return S?.duelCfg ?? { ...DEFAULT_DUEL_CFG, fixed: [] }; }
  /** формат серии и модификаторы (до старта серии) */
  setDuelCfg(c: Partial<DuelCfg>): void {
    const S = this.S; if (!S || S.phase !== 'lobby' || S.duel) return;
    const cur = this.duelCfg();
    S.duelCfg = { fmt: c.fmt === 1 || c.fmt === 3 || c.fmt === 5 ? c.fmt : cur.fmt, fixed: cleanMods(c.fixed ?? cur.fixed), random: c.random ?? cur.random };
    this.pushState();
  }
  /** график погони текущего раунда дуэли: seat → точки [мс забега, доля снятого здоровья босса ×1000] */
  chaseData(): Record<number, [number, number][]> { return this.chase; }
  duelPlan(): RoundPlan | null { const d = this.S?.duel; return d ? planRound(d.series, d.retry) : null; }
  private duelPub(): DuelPub | null {
    const S = this.S; if (!S || S.disc !== 'duel') return null;
    const d = S.duel;
    return d ? { id: d.id, series: d.series, seats: d.seats, names: d.names, plan: planRound(d.series, d.retry), cfg: this.duelCfg(), last: d.last } : null;
  }
  private duelBossName(): string { const p = this.duelPlan(); return p ? BOSS_INFO[p.boss].short : 'Босс'; }
  private startSeries(): void {
    const S = this.S!, ps = this.seatList(); if (ps.length !== 2) return;
    const cfg = this.duelCfg(), series = newSeries(cfg.fmt, S.seed, modCfgOf(cfg));
    S.duel = { id: this.newId(), series, seats: [ps[0]!.id, ps[1]!.id], names: [ps[0]!.name, ps[1]!.name], retry: 0, last: null };
    S.phase = 'veto'; S.acts = [];
    for (const p of ps) { p.ready = false; p.loaded = false; p.fin = null; p.dnf = false; p.splits = []; p.subs = []; p.lost = 0; p.deathList = []; p.buys = []; p.bosses = []; p.pb = null; }
    this.logEv('veto', `Серия Bo${cfg.fmt}: бан/пик боссов начинает ${S.duel.names[series.first]}`);
    this.pushState();
  }
  /** ход игрока в бан/пик */
  private onVeto(p: OrgSeat, boss: unknown): void {
    const S = this.S!, d = S.duel; if (S.phase !== 'veto' || !d) return;
    const side = d.seats.indexOf(p.id); if (side < 0) return;
    this.applyVetoFor(side as Side, boss);
  }
  private applyVetoFor(side: Side, boss: unknown): boolean {
    const S = this.S!, d = S.duel!, now = vetoNow(d.series);
    const r = applyVeto(d.series, side, String(boss));
    if (!r.ok) { this.logEv('vetobad', `${d.names[side]}: ${r.why}`, d.seats[side]); return false; }
    d.series = r.s;
    const b = BOSS_INFO[String(boss) as keyof typeof BOSS_INFO];
    this.logEv('veto', `${d.names[side]} ${now?.kind === 'ban' ? 'банит' : 'выбирает'}: ${b.name}`, d.seats[side], { boss: String(boss), vk: now?.kind });
    if (r.s.stage === 'play') this.vetoDone();
    this.pushState();
    return true;
  }
  /** организатор выбирает за игрока, который не отвечает (детерминированно из зерна) */
  autoVeto(): void {
    const S = this.S, d = S?.duel; if (!S || !d || S.phase !== 'veto') return;
    const now = vetoNow(d.series), boss = autoVeto(d.series); if (!now || !boss) return;
    this.applyVetoFor(now.side, boss);
  }
  private vetoDone(): void {
    const S = this.S!, d = S.duel!;
    S.phase = 'lobby'; S.id = this.newId(); d.retry = 0;
    for (const p of this.seatList()) p.ready = false;
    const plan = planRound(d.series, 0); if (plan) S.seed = plan.seed;
    this.logEv('veto', 'Бан/пик закончен: ' + d.series.order.map((b, i) => `${i + 1}. ${BOSS_INFO[b].short}`).join(' · '));
  }
  /** следующий раунд серии (после итога раунда) или новая серия (когда прежняя закончена) */
  nextRound(): void { const S = this.S; if (S && S.disc === 'duel' && S.phase === 'done') this.restart(); }

  /** итог игрока в раунде: убил, оборвал нить (итог игрока), сдался или ещё идёт (по последней телеметрии) */
  private duelSide(p: OrgSeat): RoundSide {
    if (p.fin && p.fin.duel) return { kill: p.fin.duel.kill, time: p.fin.duel.kill ? p.fin.rta : null, frac: p.fin.duel.kill ? 1 : fracOf(p.fin.duel.hp, p.fin.duel.mh) };
    if (p.dnf) return { kill: false, time: null, frac: this.telFrac(p), quit: true };
    return { kill: false, time: null, frac: this.telFrac(p) };
  }
  private telFrac(p: OrgSeat): number { const b = p.tel && p.tel['bs']; return b && b.mh ? fracOf(b.hp, b.mh) : 0; }
  /** проверка конца раунда дуэли: победа сразу после убийства (с короткой паузой на более раннее убийство соперника), поражение — когда оба закончили */
  private duelCheck(): void {
    const S = this.S, d = S?.duel; if (!S || !d || S.phase !== 'run' || d.series.stage !== 'play') return;
    const a = S.seats[d.seats[0]], b = S.seats[d.seats[1]]; if (!a || !b) return;
    const kill = (p: OrgSeat): boolean => !!p.fin?.duel?.kill, done = (p: OrgSeat): boolean => !!p.fin || p.dnf;
    if (kill(a) || kill(b)) {
      const other = kill(a) ? b : a;
      if (done(other) || (kill(a) && kill(b))) { this.finish(null); return; }
      // соперник на связи и шлёт положение — ждём недолго; молчит (обрыв, связь «тихо» пропала) — дольше: его итог мог быть раньше и лежит в очереди
      const silent = !other.online || this.env.now() - (this.telAt[other.id] ?? -1e9) > 1500;
      if (!this.graceT) this.graceT = this.env.setTimeout(() => { this.graceT = null; this.forceDuel(); }, silent ? DUEL_GRACE_OFFLINE : DUEL_GRACE);
      return;
    }
    if (done(a) && done(b)) { this.finish(null); return; }
    if (a.dnf !== b.dnf) this.finish(null); // один сдался — раунд за соперником
  }
  /** время ожидания вышло: счёт по тому, что есть */
  private forceDuel(): void { const S = this.S; if (S && S.phase === 'run' && S.disc === 'duel' && S.duel && this.seatList().some((p) => p.fin?.duel?.kill)) this.finish(null); }
  private finishDuel(awardedSeat: number | null): void {
    const S = this.S!, d = S.duel!, plan = planRound(d.series, d.retry);
    if (!plan) return;
    if (this.graceT) { this.env.clearTimeout(this.graceT); this.graceT = null; }
    const ps = d.seats.map((id) => S.seats[id]!) as [OrgSeat, OrgSeat];
    const sides: [RoundSide, RoundSide] = [this.duelSide(ps[0]), this.duelSide(ps[1])];
    let verdict: RoundVerdict = roundWinner(sides[0], sides[1]);
    if (awardedSeat != null) verdict = { winner: d.seats[0] === awardedSeat ? 'a' : 'b', why: 'walkover', gap: null };
    const { s: ns, rec } = recordRound(d.series, plan, verdict);
    const winSide: Side | null = rec.winner === 'a' ? 0 : rec.winner === 'b' ? 1 : null;
    const rows: ResultRow[] = ps.map((p, i) => {
      const sd = sides[i]!, dmg = p.fin?.duel ? p.fin.duel.dmg : +(p.tel?.['dm'] ?? 0) || 0;
      return { seat: p.id, name: p.name, dnf: !sd.kill, time: sd.kill ? sd.time : null, finalTime: sd.kill ? sd.time : null, igt: p.fin ? p.fin.igt : null, deaths: p.fin ? p.fin.deaths : null, stats: p.fin ? p.fin.stats : null,
        splits: sd.kill && sd.time != null ? [sd.time] : [], eloBefore: null, eloAfter: null, place: winSide == null ? 1 : winSide === i ? 1 : 2, duel: { kill: sd.kill, frac: sd.frac, dmg },
        ...(p.subs && p.subs.length ? { subs: p.subs.slice() } : {}), ...(p.lost ? { lost: p.lost } : {}), ...(p.deathList && p.deathList.length ? { deathList: p.deathList.slice() } : {}) };
    });
    const names = d.names, wname = winSide == null ? null : names[winSide], over = ns.stage === 'over';
    const res: RaceResult = { id: S.id, date: new Date(this.wall()).toISOString(), version: this.o.version, discipline: 'duel', settings: { cat: 'duel', easy: false, speed: 100 }, seed: S.seed, players: rows,
      winner: winSide == null ? 'draw' : wname, winnerSeat: winSide == null ? 'draw' : d.seats[winSide], awarded: awardedSeat != null, gap: verdict.gap != null ? Math.abs(verdict.gap) : null, goAt: S.goAt, pauseMs: S.pause.total, events: S.events.slice(-400),
      seriesId: d.id, round: ns.rounds.length,
      duel: { fmt: ns.fmt, boss: plan.boss, mods: plan.mods.slice(), slot: plan.slot, why: rec.why, score: [ns.score[0], ns.score[1]], ...(over ? { final: true, seriesWinner: names[ns.winner!] } : {}) } };
    const ch = computeElo([...this.archive().filter((x) => x.id !== res.id), res]).perRace[res.id];
    if (ch) for (const p of rows) { const c = ch.disc[nkey(p.name)]; if (c) { p.eloBefore = c.before; p.eloAfter = c.after; } }
    d.series = ns;
    d.last = { n: ns.rounds.length, boss: plan.boss, winner: rec.winner, why: rec.why, gap: verdict.gap, frac: [sides[0].frac, sides[1].frac], times: [sides[0].time, sides[1].time] };
    S.phase = 'done'; S.winner = res.winnerSeat; S.awarded = awardedSeat != null; S.result = res;
    const a = this.archive().filter((x) => x.id !== res.id); a.push(res); this.saveArchive(a);
    const text = rec.winner === 'draw' ? `Раунд ${ns.rounds.length}: ничья, переигрываем` : `Раунд ${ns.rounds.length}: ${wname}${rec.why === 'faster' ? ' быстрее убил босса' : rec.why === 'kill' ? ' убил босса' : rec.why === 'damage' ? ' снял больше здоровья' : rec.why === 'coin' ? ' (жребий)' : ' (присуждено)'}. Счёт ${ns.score[0]}:${ns.score[1]}`;
    this.logEv('done', text + (over ? `. Серия: победил ${names[ns.winner!]}` : ''));
    this.hub!.broadcast({ k: 'end', awarded: false, why: 'Раунд закончен: ' + (wname ? wname + ' победил' : 'ничья') }, null, ['play']);
    this.hub!.broadcast({ k: 'res', r: { id: res.id, winner: res.winnerSeat, awarded: res.awarded, gap: res.gap, players: rows.map((p) => ({ seat: p.seat, name: p.name, place: p.place, time: p.time, dnf: p.dnf })), duel: { n: ns.rounds.length, why: rec.why, score: ns.score, over } } });
    this.pushState();
  }

  // ----- ссылки -----
  links(base: string): { play: string; watch: string; stream: string; overlay: string } {
    const c = this.S!.code;
    return { play: `${base}?race=play&room=${c}`, watch: `${base}?race=watch&room=${c}`, stream: `${base}?race=watch&room=${c}&stream=1`, overlay: `${base}?race=watch&room=${c}&stream=1&overlay=1` };
  }
  phaseOf(): Phase { return this.S?.phase ?? 'lobby'; }
}
