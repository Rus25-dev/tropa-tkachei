// «Гонки Ткачей»: игрок (legacy/src/race-play.js). Входит по коду комнаты, вводит имя и жмёт «Готов». По команде организатора запускается обычный
// забег «Тропа целиком» с общим зерном: мир считается у игрока локально и от сети не зависит. По сети уходят телеметрия (~15 Гц, без нумерации),
// события (надёжно, с номерами: сплит, смерть, покупка, отбив, казнь, фаза, финиш) и ответы на команды (готов, загружен). Команды организатора:
// подготовка, отсчёт, «пошёл», тех. пауза, сброс. При обрыве забег идёт дальше, события копятся и уходят после возвращения связи.
// Класс не знает про Phaser и DOM: игра подключается через RunBridge (app/races.ts), транспорт, часы и хранилище подставляются.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { fmt } from '../core/timefmt';
import { Client } from './client';
import { leadBySubs, leadText, stageText } from './raceprog';
import type { PlayStore, RoomState } from './racecommon';
import { cleanCode, defaultEnv, type Env, type Msg, type Transport } from './types';

/** что игрок-сеть просит у игры */
export interface RunBridge {
  /** запрещённые в гонке настройки (лёгкий режим, замедление) */
  violation(): string[];
  /** есть активный забег этой гонки */
  hasRun(): boolean;
  runHeld(): boolean;
  runDone(): boolean;
  /** идёт техническая пауза организатора */
  techOn(): boolean;
  /** номер гонки, под который запущен забег */
  runId(): string | null;
  rta(): number;
  /** запустить забег по команде «prep»: игра сама решает, как показать загрузку */
  startRun(p: { id: string; seed: number; cat: string; seat: number; code: string; name: string; /** дуэль: босс раунда (глава 1–4) и модификаторы */ duel?: { ch: number; boss: string; mods: string[] } }): void;
  countdown(text: string): void;
  /** «пошёл»: elapsedMs — сколько гонка уже идёт (если «пошёл» опоздал из-за обрыва связи) */
  release(elapsedMs: number | null): void;
  tech(on: boolean): void;
  /** вернуться из забега в комнату ожидания (переигровка, присуждение победы, отмена) */
  toLobby(note: string): void;
  /** журнал забега, сохранённый на этом устройстве: ok — его можно воспроизвести */
  journalInfo(): { ok: boolean; race: { code: string; id: string } | null } | null;
  clearJournal(): void;
  /** воспроизвести журнал и продолжить забег; onDone — после воспроизведения, onFail — не удалось */
  restore(cb: { onDone(): void; onFail(why: string): void }): boolean;
  toast(msg: string, secs?: number): void;
  /** итог пришёл или обновился (баннер ПОБЕДА/ПОРАЖЕНИЕ) */
  resultUpdate(): void;
}

export interface PlayOpts { transport: Transport; env?: Env; version: string; store: PlayStore; key: string; bridge: RunBridge }
export interface PlayerBanner { text: string; sub: string; col: string }

export class RacePlay {
  code = ''; name = ''; me = false; state: RoomState | null = null; seat: number | null = null; status = 'connecting'; denied: string | undefined;
  client: Client | null = null; started = false; rv: Msg | null = null; rvAt = 0; evT = -1e9; tele = 0; fin: { rta: number; igt: number; deaths: number } | null = null; res: any = null;
  runId: string | null = null; loadedSent = false; skew = 0; endNote = ''; msg = ''; msgKind: '' | 'good' | 'bad' = '';
  private env: Env; private subs = new Set<() => void>(); private o: PlayOpts;
  constructor(o: PlayOpts) { this.o = o; this.env = o.env ?? defaultEnv(); }
  private get br(): RunBridge { return this.o.bridge; }
  subscribe(f: () => void): () => void { this.subs.add(f); return () => { this.subs.delete(f); }; }
  changed(): void { for (const f of [...this.subs]) f(); }
  private wall(): number { return this.env.wall ? this.env.wall() : Date.now(); }
  say(t: string, kind: '' | 'good' | 'bad' = ''): void { this.msg = t; this.msgKind = kind; this.changed(); }

  // ----- хранилище сеанса -----
  saveSess(): void { const c = this.client; if (!this.code) return; this.o.store.saveSess({ code: this.code, name: this.name, gSeen: c ? c.gSeen : 0, id: this.state ? this.state.id : null, sid: c ? c.sid : '', n: c ? c.n : 0, outbox: c ? c.outbox.slice(-200) : [] }); }

  // ----- вход -----
  /** вернуть текст ошибки или null, если подключение началось */
  join(codeIn: string, nameIn: string): string | null {
    const code = cleanCode(codeIn), name = String(nameIn || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (code.length < 4) return 'Введите код комнаты (5 символов).';
    if (!name) return 'Введите имя: по нему организатор и зрители узнают вас.';
    if (this.client) this.client.stop(true);
    Object.assign(this, { code, name, me: false, state: null, seat: null, status: 'connecting', denied: undefined, started: false, rv: null, rvAt: 0, tele: 0, fin: null, res: null, loadedSent: false, runId: null, msg: '', msgKind: '' });
    const sess = this.o.store.loadSess(), resume = !!(sess && sess.code === code);
    this.client = new Client({
      code, ns: 'race', key: this.o.key, role: 'play', name, transport: this.o.transport, env: this.env, resume, gSeen: resume ? sess!.gSeen | 0 : 0,
      sid: resume ? sess!.sid : undefined, n: resume ? sess!.n | 0 : 0, outbox: resume ? sess!.outbox : [], onQueue: () => this.saveSess(),
      hello: () => ({ ver: this.o.version, viol: this.br.violation(), room: code }),
      onWelcome: (w) => this.onWelcome(w), onMsg: (m) => this.onMsg(m), onTel: (t) => this.onTel(t), onStatus: (s, i) => this.onStatus(s, i),
    });
    this.saveSess(); this.changed(); this.client.start();
    return null;
  }
  leave(): void {
    const c = this.client; this.client = null; this.o.store.clearSess();
    if (c) c.stop(true);
    this.code = ''; this.state = null; this.seat = null; this.me = false; this.started = false; this.changed();
  }
  /** вкладка закрывается: организатор узнаёт об уходе сразу */
  bye(): void { if (this.client) { this.saveSess(); this.client.bye(); } }

  // ----- сеть -----
  private onStatus(s: string, info: unknown): void {
    this.status = s;
    if (s === 'denied') { this.denied = (info as { why?: string } | undefined)?.why; this.o.store.clearSess(); }
    this.changed();
  }
  private onWelcome(w: Msg): void {
    this.seat = w['seat']; this.state = (w['snap'] as RoomState) || this.state;
    if (this.client) this.skew = this.client.skew || 0;
    this.saveSess(); this.changed();
    const st = this.state;
    // вернулись в идущую гонку: если вкладку перезагружали — забег восстанавливается по журналу
    if (st && (st.phase === 'run' || st.phase === 'count' || st.phase === 'prep') && !this.br.hasRun()) this.tryRestore(st);
    else if (st && this.br.hasRun()) this.syncRun(st);
  }
  private onMsg(m: any): void {
    if (!m) return;
    switch (m.k) {
      case 'state':
        // дуэль: бан/пик сбрасывает готовность на сервере, подтверждение раунда игрок даёт заново
        if (m.s.phase === 'veto' || (this.state?.phase === 'veto' && m.s.phase === 'lobby')) this.me = false;
        this.state = m.s; this.saveSess(); this.changed(); this.syncRun(m.s); break;
      case 'prep': this.startRun(m); break;
      case 'cd': if (this.br.hasRun() && this.br.runHeld()) this.br.countdown(String(m.n)); break;
      case 'go': this.go(m); break;
      case 'pause': this.tech(!!m.on); break;
      case 'reset': this.toLobby('Организатор перезапускает гонку: вернитесь к кнопке «Готов».'); break;
      case 'end': if (this.br.hasRun() && !this.br.runDone()) { this.endNote = m.why ? String(m.why) : m.awarded ? 'Организатор завершил гонку' : 'Гонка отменена'; this.toLobby(this.endNote); } break;
      case 'res': {
        this.res = m.r; this.br.resultUpdate();
        if (m.r && m.r.awarded && this.br.hasRun() && !this.br.runDone()) this.br.toast(`Организатор присудил победу: ${((m.r.players || []).find((p: any) => p.seat === m.r.winner) || {}).name || ''}`, 5);
        break;
      }
    }
  }
  private onTel(t: any): void { if (t && t.rv) { this.rv = t.rv; this.rvAt = this.env.now(); } }

  /** дуэль: ход в бан/пик (босс выбран и подтверждён игроком) */
  veto(boss: string): void { const c = this.client; if (c) c.send({ k: 'veto', boss }); }

  // ----- готовность -----
  toggleReady(): void { const c = this.client; if (!c) return; this.me = !this.me; c.send({ k: 'ready', v: this.me, viol: this.br.violation() }); this.changed(); }

  // ----- забег -----
  private startRun(m: any): void {
    if (!this.client) return;
    if (this.runId === m.id && this.br.hasRun()) return; // повторная доставка
    const v = this.br.violation(); if (v.length) { this.client.send({ k: 'bad', why: v.join(', ') }); return; }
    this.br.clearJournal();
    this.runId = m.id; this.started = true; this.fin = null; this.res = null; this.loadedSent = false;
    this.br.startRun({ id: m.id, seed: m.seed, cat: m.cat || 'trail', seat: this.seat ?? 0, code: this.code, name: this.name, ...(m.duel ? { duel: m.duel } : {}) });
    this.changed();
  }
  /** игра построила мир забега (вызывает приложение): сообщаем организатору «загружен» */
  sceneReady(): void {
    if (!this.client || !this.br.hasRun() || this.loadedSent) return;
    this.loadedSent = true; this.br.countdown('Ждём соперника…'); this.client.send({ k: 'loaded', id: this.runId });
    this.syncRun(this.state);
  }
  /** сверка с состоянием организатора: «пошёл» мог прийти, пока игрок был без связи или вкладка перезагружалась */
  private syncRun(st: RoomState | null): void {
    if (!st || !this.br.hasRun() || this.restoring) return; // пока журнал проигрывается, сеть в забег не вмешивается
    if (st.phase === 'run' && this.br.runHeld() && this.loadedSent !== false) this.go({ at: st.goAt, late: true });
    if (st.pause && st.pause.on) this.tech(true); else if (this.br.techOn()) this.tech(false);
    if (st.phase === 'lobby' && this.started && this.br.runId() !== st.id) this.toLobby('Организатор перезапускает гонку: вернитесь к кнопке «Готов».');
  }
  restoring = false;
  private go(m: { at?: number | null; late?: boolean }): void {
    if (!this.br.hasRun() || !this.br.runHeld() || this.restoring) return;
    // опоздавший «пошёл» (связь была потеряна): время считается от настоящего старта по часам организатора
    const el = m.at != null ? Math.max(0, this.wall() + this.skew - m.at) : null;
    const late = !!m.late || (el != null && el > 800);
    this.br.release(late && el != null ? el : null);
    if (late && el != null) this.br.toast(`Связь вернулась: гонка идёт уже ${fmt(el)}`, 4);
    this.br.countdown(late ? '' : 'ПОШЁЛ!');
  }
  private tech(on: boolean): void {
    if (!this.br.hasRun() || this.restoring) return;
    if (on === this.br.techOn()) return;
    this.br.tech(on);
    this.br.toast(on ? 'Техническая пауза: организатор остановил гонку' : 'Гонка продолжается', 3);
  }
  private toLobby(note: string): void {
    this.me = false; this.started = false; this.fin = null; this.loadedSent = false; this.runId = null;
    this.br.clearJournal(); this.br.toLobby(note); this.say(note, 'good'); this.changed();
  }
  /** восстановление забега после перезагрузки вкладки */
  private tryRestore(st: RoomState): boolean {
    const inf = this.br.journalInfo();
    if (!inf || !inf.race || inf.race.code !== this.code || inf.race.id !== st.id || !inf.ok) { if (inf && inf.race && inf.race.id !== st.id) this.br.clearJournal(); return false; }
    this.say('Найден незавершённый забег этой гонки: восстанавливаем…', 'good');
    this.started = true; this.runId = inf.race.id; this.loadedSent = true; this.restoring = true;
    return this.br.restore({
      onDone: () => { this.restoring = false; this.client?.send({ k: 'restored', id: inf.race!.id }); this.syncRun(this.state); this.changed(); },
      onFail: () => { this.restoring = false; this.started = false; this.say('Восстановить забег не удалось: сообщите организатору.', 'bad'); },
    });
  }

  // ----- события и телеметрия (зовёт игровой цикл) -----
  event(k: string, d?: Record<string, unknown>): void {
    const c = this.client; if (!c || !this.br.hasRun() || this.br.runHeld() || this.br.runDone()) return;
    if (k === 'parry' || k === 'stun') { const n = this.env.now(); if (n - this.evT < 900) return; this.evT = n; }
    c.send({ k: 'pev', e: { k, el: Math.round(this.br.rta()), ...(d || {}) } });
  }
  onSplit(i: number, sp: { rta: number; igt: number }): void { this.event('split', { i, rta: sp.rta, igt: sp.igt }); }
  onFinish(res: { rta: number; igt: number; deaths: number; splits: { rta: number; igt: number }[]; duel?: unknown }, stats: Record<string, unknown> | null, restored: number, bosses?: unknown[]): void {
    const c = this.client; if (!c) return;
    this.fin = { rta: res.rta, igt: res.igt, deaths: res.deaths };
    c.send({ k: 'fin', rta: res.rta, igt: res.igt, deaths: res.deaths, splits: res.splits.map((s) => ({ rta: s.rta, igt: s.igt })), stats, ver: this.o.version, restored, ...(bosses && bosses.length ? { bosses } : {}), ...(res.duel ? { duel: res.duel } : {}) });
    this.changed();
  }
  /** игрок вышел из забега в меню: сдача (DNF) */
  dnf(why = 'вышел из забега'): void { const c = this.client; if (c && this.br.hasRun() && !this.br.runDone()) c.send({ k: 'dnf', el: Math.round(this.br.rta()), why }); }
  /** телеметрия ~15 Гц */
  tel(o: unknown): void { if (this.client) { this.client.tel(o); this.tele++; } }

  // ----- табличка во время гонки и баннер итога -----
  rival(): { text: string; col: string } {
    if (this.status !== 'online') return { text: 'Связь с организатором потеряна: играем локально, итог уйдёт при возвращении', col: '#d28a6a' };
    if (this.br.techOn()) return { text: 'Техническая пауза организатора', col: '#ffd47a' };
    const pending = this.client ? this.client.pending() : 0;
    if (pending > 4) return { text: `Связь есть, досылаем события (${pending})`, col: '#86a89a' };
    return this.strip() ?? { text: 'Связь с организатором: есть', col: '#86a89a' };
  }
  /** полоска соперника во время гонки: «Ярь · Гл. III · бой с Владиком · +4.2 с» (плюс — соперник впереди, по подсплитам) */
  strip(): { text: string; col: string } | null {
    const st = this.state, rv = this.rv; if (!st || !rv || st.phase !== 'run' || !this.br.hasRun() || this.br.runHeld()) return null;
    const me = st.players.find((p) => p.seat === this.seat), o = st.players.find((p) => p.seat !== this.seat); if (!me || !o) return null;
    if (o.dnf) return { text: `${o.name} сошёл с дистанции`, col: '#ffd47a' };
    if (o.fin) return { text: `${o.name} финишировал: ${fmt(o.fin.rta)}`, col: '#ffd47a' };
    const theirNow = (rv['el'] as number) + Math.max(0, this.env.now() - this.rvAt), lead = leadBySubs(st.disc, me, o, this.br.rta(), theirNow);
    const stage = stageText(st.disc, rv, o.subs, false);
    return { text: `${o.name} · ${stage}${lead != null ? ' · ' + leadText(lead) : ''}`, col: lead == null ? '#b9d4c8' : lead > 0 ? '#ff9a8a' : lead < 0 ? '#9ff0c8' : '#ffd47a' };
  }
  /** баннер итога; myRta — время своего финиша (null, пока не финишировали) */
  banner(myRta: number | null): PlayerBanner | null {
    if (myRta == null) return null;
    const st = this.state, res = this.res;
    if (res && res.winner != null) {
      const me = (res.players || []).find((p: any) => p.seat === this.seat), you = res.winner === this.seat;
      if (res.winner === 'draw') return { text: 'НИЧЬЯ', sub: 'время совпало до сотых', col: '#ffd47a' };
      return you ? { text: 'ПОБЕДА', sub: res.awarded ? 'победа присуждена организатором' : `вы быстрее соперника${res.gap != null ? ' на ' + fmt(Math.abs(res.gap)) : ''}`, col: '#9ff0c8' }
        : { text: 'ПОРАЖЕНИЕ', sub: me && res.gap != null ? `соперник быстрее на ${fmt(Math.abs(res.gap))}` : 'соперник финишировал раньше', col: '#ff9a8a' };
    }
    const other = st && (st.players || []).find((p) => p.seat !== this.seat);
    if (other && other.fin) { const d = other.fin.rta - myRta; return d > 0 ? { text: 'ПОБЕДА?', sub: `соперник пришёл позже на ${fmt(d)}: ждём подтверждения организатора`, col: '#9ff0c8' } : { text: 'ПОРАЖЕНИЕ?', sub: `соперник финишировал на ${fmt(-d)} быстрее: ждём подтверждения`, col: '#ff9a8a' }; }
    return { text: 'Финиш!', sub: this.status === 'online' ? 'ждём, когда соперник закончит…' : 'нет связи: результат уйдёт организатору, как только она вернётся', col: '#ffe3a3' };
  }
}
