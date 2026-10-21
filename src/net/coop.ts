// Кооператив по сети: хост (CoopHost) и гость (CoopGuest) поверх надёжного канала net/hub + net/client.
// Хост считает мир и шлёт снимки (20/с) и надёжные события; гость шлёт свою позу (30/с) и события. Обрыв терпим: хост ждёт напарника
// GRACE секунд, потом продолжает один (и примет его обратно в ту же комнату по личному ключу); гость переподключается сам.
import type { CampState } from '../core/campaign';
import { applyPlayer, applySnap, netSmooth, onEv, packPlayer, packSnap, partnerLost } from '../core/netplay';
import type { NetPort, Session } from '../core/session';
import { Client, type ClientQueue } from './client';
import { Hub, type Seat } from './hub';
import { defaultEnv, makeCode, makeKey, type Env, type Msg, type Transport } from './types';

export const GRACE = 20000;
/** что гость должен знать, чтобы запустить ту же партию: режим, босс, глава, зерно мира */
export interface CoopStart { mode: 'story' | 'bosstest'; boss?: string; camp: CampState | null; seed: number; rev?: number }

/** порт сессии: события и позы уходят через out, такт отправки считается по кадрам */
class Port implements NetPort {
  private a30 = 0; private a20 = 0;
  constructor(private ses: Session, private role: 'host' | 'guest', private out: { ev(o: Msg): void; light(m: Msg): void }) {}
  sendEv(o: Msg): void { this.out.ev({ t: 'ev', e: o }); }
  tick(dt: number): void {
    const w = this.ses.world; if (!w.online) return;
    netSmooth(w, dt); // кадр отрисовки: напарник, а у гостя и враги плавно подтягиваются к принятому состоянию
    this.a30 += dt; this.a20 += dt;
    if (this.a30 >= 1 / 30) { this.a30 = 0; const p = w.players[w.localIdx]; if (p) this.out.light(packPlayer(w, p)); }
    if (this.role === 'host' && this.a20 >= 1 / 20) { this.a20 = 0; this.out.light({ ...packSnap(w), n: this.ses.scenes }); }
  }
}

export interface HostOpts {
  transport: Transport; env?: Env; code?: string; ver: string;
  /** гость подключился впервые: создайте сессию хоста и вызовите attach */
  onGuest(): void;
  onStatus?(s: string, info?: unknown): void;
  /** напарник ушёл насовсем (прошло время ожидания) */
  onLost?(): void;
  /** напарник вернулся после ухода — сцену надо перезапустить парой */
  onRejoin?(): void;
}
export class CoopHost {
  readonly code: string; hub: Hub; ses: Session | null = null; start: CoopStart | null = null; solo = false;
  private env: Env; private graceT: unknown = null; private guestKey: string | null = null;
  constructor(private o: HostOpts) {
    this.env = o.env ?? defaultEnv(); this.code = o.code ?? makeCode(this.env.rand);
    this.hub = new Hub({
      code: this.code, ns: 'coop', transport: o.transport, env: this.env,
      accept: (hello, seat) => (hello['ver'] !== o.ver ? { ok: false, why: `версия игры ${String(hello['ver'])} не совпадает с ${o.ver}` } : seat ? { ok: true } : (this.hub.players().length >= 1 ? { ok: false, why: 'комната занята' } : { ok: true, role: 'play' })),
      snap: () => ({ start: this.start }),
      onMsg: (_s, m) => this.recv(m),
      onTel: (s, t) => { if (t && t.t === 'p') { const w = this.ses?.world; if (w) { applyPlayer(w, t); w.ping = s.rtt == null ? null : Math.round(s.rtt); } } },
      onSeat: (seat, kind) => this.seat(seat, kind),
      onStatus: (s, i) => o.onStatus?.(s, i),
    });
  }
  open(): void { this.hub.open(); }
  close(): void { if (this.graceT) this.env.clearTimeout(this.graceT); this.hub.close(); if (this.ses) this.ses.net = null; }
  /** подключить сессию хоста к каналу и сообщить гостю параметры партии */
  attach(ses: Session, start: CoopStart): void {
    this.ses = ses; this.start = start; this.solo = false;
    ses.net = new Port(ses, 'host', { ev: (o) => { this.hub.broadcast(o); }, light: (m) => this.hub.light(m, ['play']) });
    this.hub.broadcast({ t: 'start', start });
  }
  private recv(m: Msg): void { const w = this.ses?.world; if (w && m['t'] === 'ev') onEv(w, m['e']); }
  private seat(seat: Seat, kind: string): void {
    if (kind === 'on' || kind === 're') {
      if (this.graceT) { this.env.clearTimeout(this.graceT); this.graceT = null; }
      this.guestKey = seat.key;
      if (kind === 'on' && !this.ses) this.o.onGuest();
      else if (this.solo && this.ses) { this.solo = false; this.o.onRejoin?.(); }
    } else if (this.ses && !this.graceT && !this.solo) {
      // тихий обрыв или уход: даём время вернуться, потом играем один
      this.graceT = this.env.setTimeout(() => { this.graceT = null; this.drop(); }, kind === 'bye' ? 2500 : GRACE);
    }
  }
  /** напарник не вернулся: хост продолжает один */
  drop(): void {
    const ses = this.ses; if (!ses) return;
    partnerLost(ses.world); ses.net = null; this.solo = true; this.o.onLost?.();
  }
  get guestOnline(): boolean { const s = this.guestKey ? this.hub.seats.get(this.guestKey) : null; return !!s && s.online; }
}

export interface GuestOpts {
  transport: Transport; env?: Env; code: string; ver: string; name?: string; key?: string;
  /** пришли параметры партии: создайте сессию гостя и вызовите attach */
  onStart(start: CoopStart): void;
  onStatus?(s: string, info?: unknown): void;
  /** хост не вернулся за отведённое время */
  onHostLost?(): void;
  saveQueue?(q: ClientQueue): void;
}
export class CoopGuest {
  client: Client; ses: Session | null = null; private env: Env; private lostT: unknown = null; private started: string | null = null;
  constructor(private o: GuestOpts) {
    this.env = o.env ?? defaultEnv();
    this.client = new Client({
      code: o.code, ns: 'coop', key: o.key ?? makeKey(this.env.rand), role: 'play', name: o.name ?? 'Гость', transport: o.transport, env: this.env,
      hello: () => ({ ver: o.ver }),
      onWelcome: (w) => { const st = (w['snap'] as { start: CoopStart | null } | undefined)?.start; if (st) this.begin(st); },
      onMsg: (m) => { if (m['t'] === 'start') this.begin(m['start']); else if (m['t'] === 'ev' && this.ses) onEv(this.ses.world, m['e']); },
      onTel: (t) => this.tel(t),
      onStatus: (s, i) => {
        o.onStatus?.(s, i);
        if (s === 'online') { if (this.lostT) { this.env.clearTimeout(this.lostT); this.lostT = null; } }
        else if ((s === 'offline' || s === 'reconnecting') && this.ses && !this.lostT) this.lostT = this.env.setTimeout(() => { this.lostT = null; this.o.onHostLost?.(); }, GRACE);
      },
      onQueue: (q) => o.saveQueue?.(q),
    });
  }
  start(): void { this.client.start(); }
  stop(bye = true): void { if (this.lostT) this.env.clearTimeout(this.lostT); this.client.stop(bye); if (this.ses) this.ses.net = null; }
  private begin(st: CoopStart): void { const id = `${st.seed}:${st.rev ?? 0}`; if (this.started === id && this.ses) return; this.started = id; this.o.onStart(st); }
  attach(ses: Session): void {
    this.ses = ses;
    ses.net = new Port(ses, 'guest', { ev: (o) => { this.client.send(o); }, light: (m) => this.client.tel(m) });
  }
  private tel(t: Msg): void {
    const w = this.ses?.world; if (!w || !t) return;
    if (t['t'] === 'p') applyPlayer(w, t);
    else if (t['t'] === 's') { if (t['n'] === this.ses!.scenes && !w.leaving) applySnap(w, t); w.ping = this.client.rtt == null ? null : Math.round(this.client.rtt); }
  }
}
