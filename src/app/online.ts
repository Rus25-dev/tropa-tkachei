// Сетевая игра вдвоём для приложения: комната (хост) и вход по коду (гость). Состояние для окна «Вдвоём по сети» и связка с сессиями игры.
import { resumeCamp, type CampState } from '../core/campaign';
import type { Session } from '../core/session';
import { CoopGuest, CoopHost, type CoopStart } from '../net/coop';
import { errText, peerTransport } from '../net/peer';
import { cleanCode, makeKey, type Transport } from '../net/types';
import { newSeed, type LaunchParams } from './launch';
import { progress } from './store';

export type LobbyKind = '' | 'ok' | 'err' | 'wait';
export interface LobbyState { role: 'host' | 'guest' | null; code: string | null; link: string | null; status: string; kind: LobbyKind; connected: boolean }

export class Online {
  host: CoopHost | null = null; guest: CoopGuest | null = null;
  state: LobbyState = { role: null, code: null, link: null, status: '', kind: '', connected: false };
  private subs = new Set<() => void>(); private rev = 0;
  /** хост потерял гостя (вызывает интерфейс: показать подсказку) / гость потерял хоста */
  onHostLost: (() => void) | null = null;
  constructor(private o: { version: string; start(p: LaunchParams): Session; transport?: Transport }) {}
  subscribe(f: () => void): () => void { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private set(p: Partial<LobbyState>): void { this.state = { ...this.state, ...p }; for (const f of [...this.subs]) f(); }
  get active(): boolean { return !!(this.host || this.guest); }

  /** создать комнату; параметры партии берутся в момент подключения гостя */
  hostRoom(mode: 'story' | 'bosstest', camp: CampState | null | undefined, boss: string | undefined, fresh: boolean): void {
    this.leave();
    const transport = this.o.transport ?? peerTransport;
    let ses: Session | null = null, st: CoopStart | null = null;
    const launch = (s: CoopStart): Session => this.o.start({ kind: s.mode, boss: s.boss, camp: s.camp, seed: s.seed, online: 'host', players: 2, fresh });
    const h = new CoopHost({
      transport, ver: this.o.version,
      onGuest: () => {
        const c = mode === 'story' ? (camp ?? resumeCamp(fresh ? null : progress.get())) : null;
        st = { mode, boss, camp: c, seed: newSeed() }; ses = launch(st); h.attach(ses, st);
        this.set({ status: 'Напарник подключился!', kind: 'ok', connected: true });
      },
      onRejoin: () => { if (!ses || !st) return; ses.rejoinPair(); st = { ...st, camp: ses.world.camp, rev: ++this.rev }; h.attach(ses, st); ses.world.toast('Напарник вернулся!'); },
      onStatus: (s, info) => {
        if (s === 'open') this.set({ status: 'Ждём напарника. Отправьте ему код или ссылку.', kind: 'wait' });
        else if (s === 'busy') this.set({ status: 'Код ещё занят прошлой сессией, ждём…', kind: 'wait' });
        else if (s === 'error') this.set({ status: errText(info as { type?: string }), kind: 'err' });
      },
    });
    this.host = h;
    this.set({ role: 'host', code: h.code, link: location.origin + location.pathname + '?room=' + h.code, status: 'Создаём комнату…', kind: '', connected: false });
    h.open();
  }
  /** войти по коду */
  joinRoom(codeIn: string): void {
    const code = cleanCode(codeIn);
    if (code.length < 4) { this.set({ status: 'Введите код комнаты из пяти символов.', kind: 'err' }); return; }
    this.leave();
    const key = this.key(code);
    const g: CoopGuest = new CoopGuest({
      transport: this.o.transport ?? peerTransport, code, ver: this.o.version, key,
      onStart: (st) => { const s = this.o.start({ kind: st.mode, boss: st.boss, camp: st.camp, seed: st.seed, online: 'guest', players: 2 }); g.attach(s); this.set({ status: '', kind: 'ok', connected: true }); },
      onStatus: (s, info) => {
        if (s === 'online') this.set({ status: 'Соединение есть, ждём старта от хоста…', kind: 'ok' });
        else if (s === 'connecting') this.set({ status: 'Подключаемся…', kind: '' });
        else if (s === 'denied') this.set({ status: (info as { why?: string })?.why ?? 'Хост отказал во входе.', kind: 'err' });
        else if (s === 'reconnecting' && this.state.connected) this.set({ status: 'Связь потеряна, переподключаемся…', kind: 'wait' });
        else if (s === 'reconnecting' && ((info as { attempt?: number } | undefined)?.attempt ?? 0) >= 3) this.set({ status: 'Комната не найдена. Проверьте код: хост должен держать окно открытым.', kind: 'err' });
      },
      onHostLost: () => this.onHostLost?.(),
    });
    this.guest = g;
    this.set({ role: 'guest', code, link: null, status: 'Подключаемся…', kind: '', connected: false });
    g.start();
  }
  /** личный ключ места: после перезагрузки вкладки гость возвращается на то же место */
  private key(code: string): string {
    try { const k = sessionStorage.getItem('tt_coop_' + code); if (k) return k; const n = makeKey(); sessionStorage.setItem('tt_coop_' + code, n); return n; } catch { return makeKey(); }
  }
  /** выйти из комнаты (закрыть канал, сказать «пока») */
  leave(): void {
    if (this.host) { this.host.close(); this.host = null; }
    if (this.guest) { this.guest.stop(true); this.guest = null; }
    this.set({ role: null, code: null, link: null, status: '', kind: '', connected: false });
  }
  /** вкладка закрывается: попрощаться сразу, а не ждать тишины */
  bye(): void { this.guest?.client.bye(); this.host?.hub.close(); }
}
