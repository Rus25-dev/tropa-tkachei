// Гонка 1×1 по сети из меню «Спидран» (legacy/src/speedrun.js: raceOpen, onNet, maybeStart, tryCount, raceSend, rivalInfo, raceBanner).
// Два игрока в комнате с кодом, у каждого свой забег на общем зерне (в v1.8 зерно у каждого было своё — теперь общее, как просит задача),
// по сети идут готовность, отсчёт, прогресс (~10 Гц, без нумерации) и финиш. Хост — Hub, гость — Client (пространство «race»).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CHAPTERS } from '../core/balance';
import { fmt, fmtD } from '../core/timefmt';
import { Client } from './client';
import { Hub, type Seat } from './hub';
import { cleanCode, defaultEnv, makeCode, makeKey, type Env, type Msg, type Transport } from './types';

export const BOSS_NAMES = ['Кающийся', 'Миша', 'Владик', 'Тима'];
export type DuelCat = 'trail' | 'boss';
export interface DuelHooks {
  /** оба готовы: запустить забег с этим зерном (в нём герой стоит до «пошёл») */
  onStart(p: { cat: DuelCat; seed: number }): void;
  /** подпись отсчёта на экране */
  onCount(text: string): void;
  /** «пошёл»: отпустить героя */
  onGo(): void;
  /** соперник пропал до старта: герой не должен стоять вечно */
  onLostBeforeGo(): void;
  onFinish?(res: { rta: number }): void;
  changed(): void;
}
export interface DuelOpts { role: 'host' | 'guest'; transport: Transport; env?: Env; version: string; code?: string; cat: DuelCat; hooks: DuelHooks; key?: string; newSeed?: () => number; violation?: () => string[] }
export interface Prog { c: number; s: string; x: number; y: number; f: number; g: number; vx: number; vy: number; d: number; el: number; sp: number[]; dn: number; at: number }
export interface DuelFin { rta: number; igt: number; deaths: number }

export class Duel {
  readonly role: 'host' | 'guest'; code = ''; cat: DuelCat; me = false; opp = false; peerVer: string | null = null; lost = false; left = false; rtt: number | null = null;
  state: 'room' | 'loading' | 'run' = 'room'; oppProg: Prog | null = null; oppFin: DuelFin | null = null; status = 'idle'; denied: string | undefined; peerOnline = false;
  hub: Hub | null = null; client: Client | null = null;
  private env: Env; private hostLoaded = false; private oppLoaded = false; private loadedSent = false; private counting = false; private sentAt = -1e9; private lostT: unknown = null; private cdT: unknown = null; private hooks: DuelHooks;
  constructor(private o: DuelOpts) { this.role = o.role; this.cat = o.cat; this.env = o.env ?? defaultEnv(); this.hooks = o.hooks; if (o.code) this.code = cleanCode(o.code); }

  private ch(): void { this.hooks.changed(); }
  private get seed(): number { return this.o.newSeed ? this.o.newSeed() : (this.env.rand() * 4294967296) >>> 0; }

  // ----- открыть комнату / войти -----
  open(): void {
    if (this.role === 'host') {
      this.code = this.code || makeCode(this.env.rand);
      this.hub = new Hub({
        code: this.code, ns: 'race', transport: this.o.transport, env: this.env,
        accept: (h, seat) => {
          if (h['ver'] !== this.o.version) return { ok: false, why: `версия игры ${h['ver'] || '?'} не совпадает с вашей ${this.o.version}: обновите страницу` };
          this.peerVer = String(h['ver']);
          if (seat) return { ok: true, role: 'play' };
          if (h['role'] !== 'play') return { ok: false, why: 'это комната гонки 1×1' };
          if (this.hub!.players().length >= 1) return { ok: false, why: 'в комнате уже есть соперник' };
          return { ok: true, role: 'play' };
        },
        snap: () => ({ cat: this.cat, ver: this.o.version, hostReady: this.me }),
        onMsg: (_s, m) => this.onMsg(m), onTel: (_s, t) => this.onTel(t),
        onSeat: (seat, kind) => this.onSeat(seat, kind),
        onStatus: (s) => { this.status = s; this.ch(); },
      });
      this.hub.open();
    } else {
      this.client = new Client({
        code: this.code, ns: 'race', key: this.o.key ?? makeKey(this.env.rand), role: 'play', name: 'Соперник', transport: this.o.transport, env: this.env,
        hello: () => ({ ver: this.o.version, room: this.code }),
        onWelcome: (w) => { const s = w['snap'] as { cat: DuelCat; ver: string; hostReady: boolean } | undefined; if (s) { this.cat = s.cat; this.peerVer = s.ver; this.opp = !!s.hostReady; } this.peerOnline = true; this.clearLost(); this.ch(); },
        onMsg: (m) => this.onMsg(m), onTel: (t) => this.onTel(t),
        onStatus: (s, i) => {
          this.status = s; if (s === 'denied') this.denied = (i as { why?: string } | undefined)?.why;
          if (s === 'online') { this.peerOnline = true; this.clearLost(); }
          else if (s === 'offline' || s === 'reconnecting') { this.peerOnline = false; this.armLost(); }
          this.ch();
        },
      });
      this.client.start();
    }
    this.ch();
  }
  private armLost(): void { if (this.lostT || this.lost) return; this.lostT = this.env.setTimeout(() => { this.lostT = null; this.markLost(); }, 9000); }
  private clearLost(): void { if (this.lostT) { this.env.clearTimeout(this.lostT); this.lostT = null; } if (!this.left) this.lost = false; }
  private markLost(): void {
    if (this.lost) return; this.lost = true;
    if (this.state === 'room') { /* в комнате покажем предупреждение */ } else if (this.state === 'loading') this.hooks.onLostBeforeGo();
    this.ch();
  }
  private onSeat(seat: Seat, kind: string): void {
    this.rtt = seat.rtt;
    if (kind === 'on' || kind === 're') { this.peerOnline = true; this.clearLost(); if (this.state === 'room') { this.hub!.sendTo(seat, { k: 'ready', v: this.me }); } }
    else { this.peerOnline = false; if (kind === 'bye') { this.left = true; this.markLost(); } else this.armLost(); }
    this.ch();
  }

  // ----- сообщения -----
  private send(m: Msg): void { if (this.role === 'host') this.hub?.broadcast(m); else this.client?.send(m); }
  private onMsg(m: any): void {
    if (!m) return;
    switch (m.k) {
      case 'cat': if (m.cat === 'trail' || m.cat === 'boss') { this.cat = m.cat; this.me = false; this.opp = false; this.ch(); } break;
      case 'ready': this.opp = !!m.v; this.ch(); this.maybeStart(); break;
      case 'prep': if (this.role === 'guest' && this.state === 'room') { this.cat = m.cat; this.begin(m.seed); } break;
      case 'loaded': this.oppLoaded = true; this.tryCount(); break;
      case 'cd': this.hooks.onCount(String(m.n)); break;
      case 'go': if (this.role === 'guest') { this.state = 'run'; this.hooks.onGo(); this.ch(); } break;
      case 'fin': this.oppFin = { rta: m.rta, igt: m.igt, deaths: m.deaths }; this.hooks.onFinish?.({ rta: m.rta }); this.ch(); break;
      case 'left': this.left = true; this.markLost(); break;
    }
  }
  private onTel(t: any): void {
    const m = t && t.prog; if (!m) return;
    this.oppProg = { c: m.c, s: m.s, x: m.x, y: m.y, f: m.f, g: m.g, vx: m.vx, vy: m.vy, d: m.d, el: m.el, sp: m.sp || [], dn: m.dn, at: this.env.now() };
  }

  // ----- комната -----
  setCat(cat: DuelCat): void {
    if (this.role !== 'host' || this.state !== 'room') return;
    this.cat = cat; this.me = false; this.opp = false; this.send({ k: 'cat', cat }); this.ch();
  }
  toggleReady(): void {
    if (this.state !== 'room') return;
    this.me = !this.me; this.send({ k: 'ready', v: this.me }); this.ch(); this.maybeStart();
  }
  /** запрещённые настройки и несовпадение версий мешают готовности */
  blocked(): string[] {
    const w: string[] = [];
    if (this.lost) w.push('Соперник отключился. Выйдите и создайте комнату заново.');
    if (this.peerVer && this.peerVer !== this.o.version) w.push(`Версии игры различаются (у вас ${this.o.version}, у соперника ${this.peerVer}): обновите страницу, иначе гонка не начнётся.`);
    const v = this.o.violation?.() ?? []; if (v.length) w.push(`Запрещено в спидране: ${v.join(', ')}.`);
    return w;
  }
  private maybeStart(): void {
    if (this.role !== 'host' || this.state !== 'room' || !this.me || !this.opp || this.lost || this.peerVer !== this.o.version) return;
    const seed = this.seed; this.send({ k: 'prep', cat: this.cat, seed }); this.begin(seed);
  }
  private begin(seed: number): void { this.state = 'loading'; this.ch(); this.hooks.onStart({ cat: this.cat, seed }); }

  // ----- забег -----
  /** игра построила мир забега */
  sceneReady(): void {
    if (this.loadedSent || this.state !== 'loading') return;
    this.loadedSent = true; this.hooks.onCount('Ждём соперника…');
    if (this.role === 'host') { this.hostLoaded = true; this.tryCount(); } else this.send({ k: 'loaded' });
    if (this.lost) this.hooks.onGo();
  }
  /** общий отсчёт ведёт хост: 3, 2, 1, пошёл; сам стартует с поправкой на половину пинга, чтобы старт был одновременным */
  private tryCount(): void {
    if (this.role !== 'host' || this.counting || !this.hostLoaded || !this.oppLoaded) return;
    this.counting = true; let n = 3;
    const step = (): void => {
      if (!this.hub) return;
      if (n > 0) { this.hooks.onCount(String(n)); this.send({ k: 'cd', n }); n--; this.cdT = this.env.setTimeout(step, 1000); }
      else { this.send({ k: 'go' }); this.state = 'run'; this.env.setTimeout(() => this.hooks.onGo(), Math.min(400, (this.rtt || 0) / 2)); this.ch(); }
    };
    step();
  }
  /** прогресс для соперника (не чаще 10 раз в секунду) */
  progress(p: Omit<Prog, 'at'>): void {
    if (this.lost || this.state === 'room') return; const now = this.env.now(); if (now - this.sentAt < 100) return; this.sentAt = now;
    if (this.role === 'host') this.hub?.light({ prog: p }); else this.client?.tel({ prog: p });
  }
  finish(res: DuelFin): void { this.send({ k: 'fin', rta: res.rta, igt: res.igt, deaths: res.deaths }); }

  /** выйти: соперник узнаёт сразу */
  leave(): void {
    if (this.lostT) this.env.clearTimeout(this.lostT); if (this.cdT) this.env.clearTimeout(this.cdT);
    try { this.send({ k: 'left' }); } catch { /* канал закрыт */ }
    const hub = this.hub, cl = this.client; this.hub = null; this.client = null;
    // «left» должен успеть уйти: закрываем чуть позже
    this.env.setTimeout(() => { hub?.close(); cl?.stop(true); }, 150);
    this.state = 'room'; this.ch();
  }
  bye(): void { this.client?.bye(); }

  // ----- табличка «Соперник» и баннер итога -----
  rival(run: { cat: string; t0: number | null; splits: { rta: number }[] }, myNow: number): { text: string; col: string } {
    if (this.oppFin) return { text: `Соперник финишировал: ${fmt(this.oppFin.rta)}`, col: '#ffd47a' };
    if (this.lost) return { text: 'Соперник: связь потеряна', col: '#d28a6a' };
    const o = this.oppProg; if (!o) return { text: 'Соперник: ждём данных…', col: '#86a89a' };
    const ch = run.cat === 'boss' ? (BOSS_NAMES[o.c - 1] ?? '') : `Глава ${CHAPTERS[o.c] ? CHAPTERS[o.c]!.roman : o.c}`;
    const mine = run.splits.map((s) => s.rta), th = o.sp || [], m = mine.length, n = th.length;
    const thNow = o.el + (this.env.now() - o.at);
    let lead: number | null = null; // плюс — соперник впереди
    if (m === n && n > 0) lead = mine[n - 1]! - th[n - 1]!;
    else if (m < n) lead = myNow - th[m]!;
    else if (m > n) lead = mine[n]! - thNow;
    if (lead == null || run.t0 == null) return { text: `Соперник: ${ch}`, col: '#b9d4c8' };
    return { text: `Соперник: ${ch} · ${fmtD(lead)} ${lead >= 0 ? 'впереди' : 'позади'}`, col: lead >= 0 ? '#ff9a8a' : '#9ff0c8' };
  }
  banner(mine: number): { text: string; sub: string; col: string } {
    const R = this.oppFin;
    if (R) {
      const d = R.rta - mine;
      if (Math.abs(d) < 10) return { text: 'НИЧЬЯ', sub: 'время совпало до сотых', col: '#ffd47a' };
      return d > 0 ? { text: 'ПОБЕДА', sub: `быстрее соперника на ${fmt(d)} (его время ${fmt(R.rta)})`, col: '#9ff0c8' }
        : { text: 'ПОРАЖЕНИЕ', sub: `медленнее соперника на ${fmt(-d)} (его время ${fmt(R.rta)})`, col: '#ff9a8a' };
    }
    if (this.lost) return { text: 'Связь потеряна', sub: 'результат соперника неизвестен', col: '#d28a6a' };
    return { text: 'Финиш!', sub: 'ждём, когда соперник закончит…', col: '#ffe3a3' };
  }
}
