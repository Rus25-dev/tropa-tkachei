// «Гонки Ткачей» и гонка 1×1 для приложения: организатор, игрок, обсервер и дуэль в одном месте. Здесь сетевые классы (src/net) соединяются с игрой
// (сессия ядра, журнал ввода, хранилище) и с интерфейсом (панели меняют `view`, App перерисовывается по подписке).
// Источник поведения — legacy/src/race-org.js, race-play.js, race-watch.js и часть speedrun.js про гонку 1×1.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type Phaser from 'phaser';
import { P, SHOP } from '../core/balance';
import { CHAPTERS } from '../core/balance';
import { bossPhase, packStats } from '../core/racestats';
import { bossLive } from '../core/status';
import type { NetPort, Session } from '../core/session';
import { rta as runRta, type SrResult, type SrRun } from '../core/speedrun';
import type { World } from '../core/world';
import { Duel, type DuelCat, type Prog } from '../net/duel';
import { peerTransport } from '../net/peer';
import { openRating } from './ratinglink';
import { RaceOrg } from '../net/raceorg';
import { RacePlay, type RunBridge } from '../net/raceplay';
import { RaceWatch } from '../net/racewatch';
import { cleanCode, type Transport } from '../net/types';
import type { Shared } from '../view/game';
import type { LaunchParams, RcInfo } from './launch';
import { violation } from './speedrun';
import { WatchSound } from './watchsound';
import * as jr from './journal';
import { journalStore, playStore, raceStore, rcIds, sr as srStore } from './store';

export type RacesView = null | 'org' | 'archive' | 'join' | 'watchjoin' | 'duel';
export interface RacesOpts { version: string; start(p: LaunchParams): Session; stop(): void; shared: Shared; game: Phaser.Game; snd(n: string): void; transport?: Transport }

const KIND_LETTER: Record<string, string> = { korne: 'k', misha: 'm', vladik: 'v', tima: 't' };
const r1 = (x: number): number => Math.round(x * 10) / 10;

/** Порт сессии для забегов гонки: телеметрия соперникам и организатору (~15 Гц), события забега, сохранение журнала для восстановления */
class RunPort implements NetPort {
  private telAt = 0; private deaths = 0; private parries = 0; private execs = 0; private buys = 0; private ph: { k: number; v: number } | null = null; private inited = false;
  /** сколько подсплитов уже ушло организатору; последняя смерть, у которой считается потерянное время */
  private subs = 0; private dead: { x: number; ch: number; at: number; fight: boolean } | null = null;
  constructor(private R: Races, private ses: Session, private kind: 'rc' | 'duel') {}
  sendEv(): void { /* событий мира по сети в гонке нет */ }
  sceneChanged(): void { this.ph = null; }
  tick(): void {
    const r = this.ses.sr, w = this.ses.world; if (!r) return;
    if (r.hold || r.done) return;
    const now = performance.now();
    if (this.kind === 'rc') this.events(r, w);
    if (now - this.telAt < 66) return; this.telAt = now;
    if (this.kind === 'rc') this.R.play?.tel(this.R.telemetry(w, r, this.R.play.seat ?? 0));
    else this.R.duelProgress(w, r);
  }
  /** события для ленты организатора: по изменению счётчиков забега (смерть, отбив, казнь, покупка, смена фазы босса) */
  private events(r: SrRun, w: World): void {
    const S = r.stats, play = this.R.play; if (!play) return;
    if (!this.inited) { this.inited = true; this.deaths = r.deaths; this.parries = S?.parries ?? 0; this.execs = S?.execs ?? 0; this.buys = S?.buys.length ?? 0; this.subs = S?.subs.length ?? 0; }
    const ch0 = w.camp ? w.camp.ch : 1, p0 = w.players[0];
    if (r.deaths > this.deaths) { play.event('death', { ch: ch0 }); if (p0) this.dead = { x: p0.x, ch: ch0, at: runRta(r), fight: bossLive(w.testBoss() ?? w.boss) }; }
    this.deaths = r.deaths;
    // потерянное время: от обрыва нити до возвращения «в дело» (к месту смерти или к бою с боссом), не больше 90 с
    if (this.dead && p0 && !w.wiping) {
      const d = this.dead, el = runRta(r) - d.at, back = (w.camp ? w.camp.ch : 1) !== d.ch || Math.abs(p0.x - d.x) < 48 || (d.fight && bossLive(w.testBoss() ?? w.boss));
      if (el > 1200 && (back || el > 90000)) { play.event('lost', { ms: Math.round(Math.min(el, 90000)) }); this.dead = null; }
    }
    if (S) {
      while (this.subs < S.subs.length) { const s = S.subs[this.subs++]!; play.event('sub', { ch: s.ch, sk: s.k, igt: s.igt }); }
      if (S.parries > this.parries) play.event('parry'); this.parries = S.parries;
      if (S.execs > this.execs) play.event('exec'); this.execs = S.execs;
      if (S.buys.length > this.buys) { const b = S.buys[S.buys.length - 1]!, it = SHOP.find((s) => s.id === b.id); play.event('buy', { id: b.id, name: it ? it.name : b.id, ch: b.ch, price: b.price }); } this.buys = S.buys.length;
    }
    const b = w.testBoss() ?? w.boss, ph = b && b.maxHp ? bossPhase(b) : 0, ch = w.camp ? w.camp.ch : 1;
    if (ph && this.ph && this.ph.k === ch && ph > this.ph.v) play.event('phase', { ph, ch });
    if (ph) this.ph = { k: ch, v: ph };
  }
}

export class Races {
  org: RaceOrg | null = null; play: RacePlay | null = null; watch: RaceWatch | null = null; duel: Duel | null = null;
  view: RacesView = null; watching = false; stream = false; overlay = false;
  /** подпись отсчёта на экране забега ('3', 'ПОШЁЛ!', 'Ждём соперника…') */
  cd = '';
  /** идёт воспроизведение журнала: процент или null */
  restoring: { pct: number } | null = null;
  /** сообщение на панелях игрока и обсервера */
  note = '';
  private subs = new Set<() => void>(); private cdT: unknown = null; private duelCat: DuelCat = 'trail'; private guard = false;
  private transport: Transport;
  constructor(private o: RacesOpts) {
    this.transport = o.transport ?? peerTransport;
    o.game.events.on('tt:ui', (e: { k: string }) => { if (e.k === 'worldReady') this.worldReady(); });
    for (const ev of ['pagehide', 'beforeunload']) window.addEventListener(ev, () => this.bye());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
  }
  get version(): string { return this.o.version; }
  subscribe(f: () => void): () => void { this.subs.add(f); return () => { this.subs.delete(f); }; }
  bump(): void { for (const f of [...this.subs]) f(); }
  setView(v: RacesView): void { this.view = v; this.bump(); }
  private snd(n: string): void { try { this.o.snd(n); } catch { /* звук не готов */ } }
  base(): string { return location.origin + location.pathname; }
  /** вкладка закрывается: попрощаться сразу, сохранить комнату и журнал */
  private bye(): void { this.org?.save(true); this.play?.bye(); this.watch?.bye(); this.duel?.bye(); jr.pulse(this.o.shared.session, true); }
  private flush(): void { this.org?.save(true); jr.pulse(this.o.shared.session, true); }

  // ======================= меню =======================
  racesItems(): { label: string; sub?: string; act: () => void; disabled?: boolean }[] {
    const st = this.org ? null : raceStore.loadOrg()?.S ?? null, items: { label: string; sub?: string; act: () => void }[] = [];
    if (st && !this.org) items.push({ label: 'Продолжить комнату организатора', sub: `код ${st.code} · ${st.phase === 'run' ? 'гонка шла' : 'ожидание'}`, act: () => this.openOrg() });
    else if (this.org?.S) items.push({ label: 'Панель организатора', sub: `комната ${this.org.S.code} работает`, act: () => this.setView('org') });
    else items.push({ label: 'Создать гонку', sub: 'вы организатор и сами не играете', act: () => this.openOrg() });
    if (this.play && this.play.code) items.push({ label: 'Вернуться в комнату игрока', sub: `комната ${this.play.code} · ${this.play.name}`, act: () => this.setView('join') });
    else items.push({ label: 'Войти игроком по коду', sub: 'код или ссылка от организатора', act: () => this.openJoin('') });
    items.push({ label: 'Обсервер', sub: 'смотреть гонку: 1920×1080, две половины и табло', act: () => this.setView('watchjoin') });
    items.push({ label: 'Архив гонок', sub: 'рейтинг Эло, история, races.json', act: () => this.setView('archive') });
    items.push({ label: 'Рейтинг', sub: 'таблицы Эло, профили и разбор гонок на странице', act: () => openRating() });
    return items;
  }
  racesInfo(): string[] {
    const out = ['Соревнование для двоих: организатор создаёт гонку, два игрока играют у себя, обсервер показывает обоих сразу.'];
    const st = raceStore.loadOrg()?.S; if (st) out.push(`Есть незавершённая комната организатора: ${st.code}`);
    const sess = playStore.loadSess(); if (sess) out.push(`Вы были в комнате ${sess.code} как игрок`);
    return out;
  }

  // ======================= организатор =======================
  openOrg(): void {
    if (!this.org) {
      this.org = new RaceOrg({ transport: this.transport, version: this.o.version, store: raceStore });
      this.org.subscribe(() => this.bump());
    }
    if (!this.org.S && !this.org.resume()) this.org.create();
    this.setView('org');
  }
  closeOrg(): void { this.org?.close(true); this.org = null; this.setView(null); }
  archive(): ReturnType<RaceOrg['archive']> { return raceStore.archive(); }
  saveArchive(a: ReturnType<RaceOrg['archive']>): void { raceStore.saveArchive(a); this.bump(); }
  /** код, подставленный в окно входа (из ссылки или прежнего сеанса) */
  prefill = '';
  /** есть активный забег этой гонки */
  hasRc(): boolean { return !!this.o.shared.session?.sr?.rc; }

  // ======================= игрок =======================
  private ensurePlay(): RacePlay {
    if (!this.play) { this.play = new RacePlay({ transport: this.transport, version: this.o.version, store: playStore, key: rcIds.playerKey(), bridge: this.bridge }); this.play.subscribe(() => this.bump()); }
    return this.play;
  }
  /** окно входа игрока; auto — сразу подключиться, если известны код и имя */
  openJoin(code: string, auto = false): void {
    const p = this.ensurePlay(); this.note = ''; this.prefill = code;
    this.setView('join');
    const name = srStore.name();
    if (auto && code && name && !p.code) this.joinPlayer(code, name);
  }
  joinPlayer(code: string, name: string): string | null {
    const p = this.ensurePlay(), err = p.join(code, name);
    if (err) { this.note = err; this.bump(); return err; }
    rcIds.addName(name.trim().replace(/\s+/g, ' ').slice(0, 20)); this.note = ''; this.bump();
    return null;
  }
  leavePlay(): void { this.play?.leave(); this.play = null; this.note = ''; this.setView(null); }

  // ---- мост игрока к игре ----
  private run(): SrRun | null { const s = this.o.shared.session; return s?.sr?.rc ? s.sr : null; }
  private bridge: RunBridge = {
    violation: () => violation(),
    hasRun: () => !!this.run(),
    runHeld: () => !!this.run()?.hold,
    runDone: () => !!this.run()?.done,
    techOn: () => this.run()?.tp != null,
    runId: () => (this.run()?.rc as RcInfo | undefined)?.id ?? null,
    rta: () => { const r = this.run(); return r ? runRta(r) : 0; },
    startRun: (p) => {
      this.view = null; this.setCd('Загрузка…', true);
      const ses = this.o.start({ kind: p.cat === 'boss' ? 'boss' : 'trail', seed: p.seed, rc: { code: p.code, seat: p.seat, id: p.id, name: p.name } });
      this.hookRun(ses, 'rc'); this.bump();
    },
    countdown: (t) => { if (/^\d$/.test(t)) this.snd('bead'); this.setCd(t); },
    release: (el) => {
      const s = this.o.shared.session; if (!s || !s.sr) return;
      s.release();
      // опоздавший «пошёл» (связь была потеряна): время считается от настоящего старта по часам организатора
      if (el != null && s.sr.t0 != null) { s.sr.t0 = performance.now() - el; if (s.rec) { s.rec.J.wallT0 = Date.now() - el; s.rec.dirty = true; } }
    },
    tech: (on) => { const s = this.o.shared.session; if (s?.sr?.rc) { s.techPause(on); if (on) this.snd('bench'); } },
    toLobby: (note) => { this.stopRun(); this.note = note; this.view = 'join'; this.bump(); },
    journalInfo: () => this.journalInfo(),
    clearJournal: () => journalStore.clear(),
    restore: (cb) => this.restore(cb),
    toast: (m, secs) => this.o.shared.session?.world.toast(m, secs),
    resultUpdate: () => this.bump(),
  };
  /** подписки забега: сплиты и финиш уходят организатору */
  private hookRun(ses: Session, kind: 'rc' | 'duel'): void {
    const add = (k: string, f: (e: any) => void): void => { (ses.on[k] ??= []).push((e) => f(e)); };
    ses.net = new RunPort(this, ses, kind);
    if (kind === 'rc') {
      add('srSplit', (e) => this.play?.onSplit(e.i, e.split));
      add('srFinish', (e) => { const res = e.result as SrResult, r = ses.sr!; this.play?.onFinish(res, packStats(r.stats, res.igt / 1000 * 60), r.restored | 0); });
    } else add('srFinish', (e) => { const res = e.result as SrResult; this.duel?.finish({ rta: res.rta, igt: res.igt, deaths: res.deaths }); });
  }
  private stopRun(): void { journalStore.clear(); this.setCd('', true); this.o.stop(); }
  /** вышли из забега в меню (кнопка «В главное меню» или пауза → выход): для гонки это сдача */
  onExit(): void {
    const s = this.o.shared.session, r = s?.sr;
    if (r?.rc) { this.play?.dnf(); journalStore.clear(); }
    if (r?.race) { this.duel?.leave(); this.duel = null; }
    this.setCd('', true);
  }
  setCd(t: string, silent = false): void {
    this.cd = t; if (this.cdT) { clearTimeout(this.cdT as number); this.cdT = null; }
    if (t === 'ПОШЁЛ!') this.cdT = setTimeout(() => { this.cd = ''; this.bump(); }, 900);
    if (!silent) this.bump();
  }
  private worldReady(): void {
    const s = this.o.shared.session, r = s?.sr; if (!r) return;
    if (r.rc && !r.done) this.play?.sceneReady();
    else if (r.race && this.duel) this.duel.sceneReady();
  }

  // ---- табличка «Соперник», отсчёт, баннер итога ----
  rival(w: World): { text: string; col: string } | null {
    const r = w.sr; if (!r) return null;
    if (r.rc && this.play) return this.play.rival();
    if (r.race && this.duel) return this.duel.rival({ cat: r.cat, t0: r.t0, splits: r.splits }, runRta(r));
    return null;
  }
  banner(res: SrResult, r: SrRun): { text: string; sub: string; col: string } | null {
    if (r.rc && this.play) return this.play.banner(res.rta);
    if (r.race && this.duel) return this.duel.banner(res.rta);
    return null;
  }
  /** призрак соперника (гонка 1×1): положение в той же главе и на том же этапе */
  ghost(): Prog | null {
    const d = this.duel;
    if (d) return d.lost || d.oppFin ? null : d.oppProg;
    // гонка организатора: положение соперника приходит от организатора ~4 раза в секунду
    const p = this.play, rv = p?.rv, st = p?.state;
    if (!p || !rv || !st || st.phase !== 'run' || !this.run() || this.run()!.hold) return null;
    const o = st.players.find((q) => q.seat !== p.seat); if (!o || o.fin || o.dnf) return null;
    return { c: rv['ch'] as number, s: rv['st'] as string, x: rv['x'] as number, y: rv['y'] as number, f: rv['f'] as number, g: (rv['g'] as number) ?? 0, vx: (rv['vx'] as number) ?? 0, vy: (rv['vy'] as number) ?? 0, d: 0, el: rv['el'] as number, sp: [], dn: 0, at: p.rvAt };
  }

  // ---- телеметрия (legacy/race-play.js frame) ----
  telemetry(w: World, r: SrRun, seat: number): Record<string, unknown> {
    const p = w.players[0]!, b = w.testBoss() ?? w.boss, camp = w.camp, kind = camp ? CHAPTERS[camp.ch]!.boss : 'korne';
    const o: Record<string, any> = {
      s: seat, el: Math.round(runRta(r)), ig: Math.round(r.igt), ch: camp ? camp.ch : 1, st: camp ? camp.st : 'level', x: Math.round(p.x), y: Math.round(p.y), f: p.face, g: p.onGround ? 1 : 0, vx: Math.round(p.vx), vy: Math.round(p.vy),
      d: p.dashT > 0 ? 1 : 0, a: p.atkT > 0 ? (p.atkDir === 'u' ? 2 : p.atkDir === 'd' ? 3 : 1) : 0, hp: p.hp, mh: p.maxHp, sk: Math.round(p.silk * 10) / 10, ps: P.SILK, bd: w.beads | 0, dn: p.downed ? 1 : 0, sit: p.sit ? 1 : 0,
      pa: w.paused ? 1 : 0, sh: w.shopOpen ? 1 : 0, sp: r.splits.length, dt: r.deaths, hold: r.hold ? 1 : 0, w: w.wiping ? 1 : 0, dm: Math.round((r.stats ? r.stats.bossDmg : 0) * 10) / 10,
    };
    if (b && b.maxHp) o['bs'] = { k: KIND_LETTER[kind] || 'k', x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), s: b.state, hp: r1(b.hp), mh: b.maxHp, ph: bossPhase(b), f: b.face || 1, on: ['sleep', 'dead', 'gone'].includes(b.state) ? 0 : 1 };
    const pr: unknown[] = []; for (const q of w.projs) { if (q.dead || pr.length >= 14) continue; if (Math.abs(q.x - p.x) < 520 && Math.abs(q.y - p.y) < 340) pr.push([q.kind, Math.round(q.x), Math.round(q.y), Math.round(q.w || 8), Math.round(q.h || 8)]); }
    if (pr.length) o['pr'] = pr;
    const en: unknown[] = []; for (const e of w.enemies) { if (e.dead || en.length >= 10) continue; if (Math.abs(e.x - p.x) < 520 && Math.abs(e.y - p.y) < 340) en.push([e.type, Math.round(e.x), Math.round(e.y), Math.round(e.w), Math.round(e.h), e.face || 1]); }
    if (en.length) o['en'] = en;
    return o;
  }

  // ---- журнал: общий модуль app/journal.ts ----
  private journalInfo(): { ok: boolean; race: { code: string; id: string } | null } | null { const i = jr.info(this.o.version); return i ? { ok: i.ok, race: i.race } : null; }
  /** восстановление забега гонки (по команде игрока-сети) */
  private restore(cb: { onDone(): void; onFail(why: string): void }): boolean {
    this.view = null;
    const ok = jr.restore({
      version: this.o.version, start: (p) => this.o.start(p),
      progress: (pct) => { this.restoring = pct == null ? null : { pct }; this.bump(); },
      onDone: (ses) => { this.hookRun(ses, 'rc'); cb.onDone(); },
      onFail: (why) => { this.note = 'Не удалось восстановить забег: ' + why; this.view = 'join'; this.bump(); cb.onFail(why); },
    });
    if (!ok) cb.onFail('журнал недоступен');
    return ok;
  }
  /** «Спидран → Восстановить забег»: одиночный забег после падения вкладки */
  restoreSolo(): boolean {
    return jr.restore({
      version: this.o.version, start: (p) => this.o.start(p),
      progress: (pct) => { this.restoring = pct == null ? null : { pct }; this.bump(); },
      onDone: () => this.bump(), onFail: (why) => { this.o.stop(); console.warn('Журнал: восстановление не удалось — ' + why); this.bump(); },
    });
  }

  // ======================= обсервер =======================
  joinWatch(code: string, opt?: { stream?: boolean; overlay?: boolean }): string | null {
    if (!this.watch) { this.watch = new RaceWatch({ transport: this.transport, version: this.o.version, key: rcIds.watchKey() }); this.watch.subscribe(() => { if (this.watch?.S && !this.watching) this.beginWatch(); this.bump(); }); }
    this.stream = !!opt?.stream; this.overlay = !!opt?.overlay;
    const err = this.watch.join(code); this.note = err ?? ''; this.keepAlive(); this.bump();
    return err;
  }
  /** звук обсервера (эффекты по событиям, музыка босса лидера) */
  sound: WatchSound | null = null;
  private beginWatch(): void {
    this.watching = true; this.view = null;
    this.sound?.stop(); this.sound = new WatchSound(this.watch!); this.sound.start();
    const g = this.o.game; g.registry.set('raceWatch', this.watch);
    document.documentElement.classList.add('rw-on'); document.documentElement.classList.toggle('rw-overlay', this.overlay); document.documentElement.classList.toggle('rw-stream', this.stream);
    for (const k of ['game', 'hud', 'bg']) if (g.scene.isActive(k)) g.scene.sleep(k);
    g.scene.start('watch');
  }
  leaveWatch(): void {
    this.sound?.stop(); this.sound = null;
    this.watch?.leave(); this.watching = false; this.note = '';
    const g = this.o.game, cl = document.documentElement.classList; cl.remove('rw-on', 'rw-overlay', 'rw-stream');
    if (g.scene.isActive('watch')) g.scene.stop('watch');
    for (const k of ['bg', 'game', 'hud']) { if (g.scene.isSleeping(k)) g.scene.wake(k); }
    this.bump();
  }
  /** окно обсервера не должно «засыпать»: тихий звук и блокировка Web Locks удерживают вкладку активной (WebRTC-связь уже освобождает её от глубокого троттлинга) */
  private silent: AudioContext | null = null; private lock = false;
  private keepAlive(): void {
    try { if (navigator.locks && !this.lock) { this.lock = true; void navigator.locks.request('tropa-race-watch', () => new Promise<void>(() => undefined)); } } catch { /* нет Web Locks */ }
    const arm = (): void => {
      if (this.silent) return;
      try { const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return; const ctx = new AC(), o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.00001; o.connect(g); g.connect(ctx.destination); o.start(); this.silent = ctx; } catch { /* звук недоступен */ }
    };
    arm();
    if (!this.silent) { const h = (): void => { arm(); if (this.silent) { window.removeEventListener('pointerdown', h, true); window.removeEventListener('keydown', h, true); } }; window.addEventListener('pointerdown', h, true); window.addEventListener('keydown', h, true); }
  }

  // ======================= гонка 1×1 из меню «Спидран» =======================
  openDuel(cat: DuelCat = 'trail'): void { this.duelCat = cat; this.note = ''; this.setView('duel'); }
  /** создать комнату (host) или войти по коду (guest) */
  startDuel(role: 'host' | 'guest', code?: string): string | null {
    if (role === 'guest' && cleanCode(code ?? '').length < 4) return 'Введите код комнаты из пяти символов.';
    this.duel?.leave();
    const d = new Duel({
      role, transport: this.transport, version: this.o.version, code, cat: this.duelCat, key: rcIds.playerKey(), violation: () => violation(),
      hooks: {
        onStart: ({ cat, seed }) => { this.view = null; this.setCd('Загрузка…', true); const ses = this.o.start({ kind: cat, seed, race: true }); this.hookRun(ses, 'duel'); this.bump(); },
        onCount: (t) => { if (/^\d$/.test(t)) this.snd('bead'); this.setCd(t); },
        onGo: () => { const s = this.o.shared.session; if (s?.sr?.race && s.sr.hold) { s.release(); this.setCd('ПОШЁЛ!'); } },
        onLostBeforeGo: () => { const s = this.o.shared.session; if (s?.sr?.race && s.sr.hold) { s.release(); this.setCd(''); } },
        onFinish: () => this.bump(),
        changed: () => this.bump(),
      },
    });
    this.duel = d; d.open();
    return null;
  }
  leaveDuel(): void { this.duel?.leave(); this.duel = null; this.setView(null); }
  get duelCategory(): DuelCat { return this.duelCat; }
  duelProgress(w: World, r: SrRun): void {
    const p = w.players[0]!; if (!this.duel) return;
    this.duel.progress({ c: w.camp ? w.camp.ch : 1, s: w.camp ? w.camp.st : 'level', x: Math.round(p.x), y: Math.round(p.y), f: p.face, g: p.onGround ? 1 : 0, vx: Math.round(p.vx), vy: Math.round(p.vy), d: p.dashT > 0 ? 1 : 0, el: Math.round(runRta(r)), sp: r.splits.map((s) => s.rta), dn: r.done ? 1 : 0 });
  }

  // ======================= ссылки ?race=… =======================
  /** открыть окно по адресной строке (?race=org|play|watch) или вернуть игрока в прерванную гонку */
  init(search = location.search): void {
    if (this.guard) return; this.guard = true;
    const q = new URLSearchParams(search), m = q.get('race'), room = q.get('room') || q.get('code') || '';
    try {
      if (m === 'org') this.openOrg();
      else if (m === 'duel' && room) { this.prefill = room; this.openDuel('trail'); this.startDuel('guest', room); }
      else if (m === 'play') { const sess = playStore.loadSess(); this.openJoin(room || sess?.code || '', !!(srStore.name() && (room || sess))); }
      else if (m === 'watch') { if (room) { this.prefill = room; this.setView('watchjoin'); this.joinWatch(room, { stream: q.get('stream') === '1', overlay: q.get('overlay') === '1' }); } else this.setView('watchjoin'); }
      else {
        // обычный запуск: если игрок перезагрузил вкладку посреди гонки — вернуться в неё и восстановить забег по журналу
        const sess = playStore.loadSess(), inf = this.journalInfo();
        if (sess && inf?.race && inf.race.code === sess.code) this.openJoin(sess.code, true);
      }
    } catch (e) { console.error(e); }
  }
}
