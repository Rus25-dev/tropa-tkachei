// Сессия-просмотр: проигрывает запись .ttrec тем же движком игры (мир, отрисовка, звук, интерфейс), не принимая ввода.
// Ввод по тикам и действия интерфейса берутся из журнала в том же порядке, что и у replayJournal (core/replay.ts),
// поэтому на экране идёт ровно та партия, которая была записана. Смена сцен — как в живой игре (Session.afterTicks).
// Действия игрока (пауза, лавка, карта) отключены: состояние мира определяет только запись.
import type { CampState } from './campaign';
import type { Journal } from './journal';
import { normalizeSave } from './loadout';
import { applyTickValue } from './journal';
import { runAct } from './replay';
import { Session, type SceneData, type SessionCfg } from './session';
import { runStartData } from './speedrun';
import type { Ttrec } from './ttrec';
import type { World } from './world';

export class ReplaySession extends Session {
  readonly replay = true;
  readonly journal: Journal;
  /** запись доиграна */
  ended = false;
  /** просмотр на паузе (это не пауза игры: журнал свои паузы проигрывает сам) */
  hold = false;
  /** множитель скорости просмотра */
  playSpeed = 1;
  /** вызывается при «Заново» из меню: приложение перезапускает просмотр */
  onRestart: (() => void) | null = null;
  private si = 0; private ri = 0; private left = 0; private ai = 0;
  private cur: World;

  constructor(cfg: SessionCfg, readonly ttrec: Ttrec) {
    const J = ttrec.journal, first = J.segs[0]!;
    let data: SceneData, run: { cat: 'trail' | 'boss' } | undefined;
    if (J.cat) { const d0 = runStartData(J.cat, first.seed); data = { ...d0, camp: (first.data.camp as CampState | null) || d0.camp }; run = { cat: J.cat }; }
    else data = { players: first.data.players || 1, mode: first.data.mode, boss: first.data.boss ?? undefined, camp: first.data.camp as CampState | null, seed: first.seed };
    super({ ...cfg, loadoutSave: first.data.loadout ? normalizeSave(first.data.loadout) : cfg.loadoutSave, kit: !!first.data.kit }, { ...data, gameplay: first.data.gameplay ?? 1 }, run); // правила и приёмы — как при записи
    this.rec = null;
    this.journal = J;
    if (this.sr) this.sr.replay = { splits: J.splits, mem: !!J.mem };
    this.cur = this.world;
    this.beginSeg();
  }

  private beginSeg(): void { const seg = this.journal.segs[this.si]; this.ri = 0; this.ai = 0; this.left = seg && seg.rle.length ? seg.rle[1]! : 0; }

  private tickOnce(): void {
    const J = this.journal, w = this.world;
    if (w !== this.cur) { this.cur = w; this.si++; this.beginSeg(); }
    const seg = J.segs[this.si];
    if (!seg) { this.ended = true; return; }
    const last = this.si === J.segs.length - 1;
    if (w.tickN >= seg.n) {
      while (this.ai < seg.acts.length) runAct(w, seg.acts[this.ai++]!, this.sr, seg.loadouts); // действия после последнего тика
      if (last || !w.next) this.finish();
      return; // не последний отрезок: ждём смены сцены (w.next → afterTicks)
    }
    while (this.ai < seg.acts.length && seg.acts[this.ai]![0] <= w.tickN) runAct(w, seg.acts[this.ai++]!, this.sr, seg.loadouts);
    applyTickValue(w.players, seg.rle[this.ri]!);
    if (--this.left <= 0) { this.ri += 2; this.left = this.ri < seg.rle.length ? seg.rle[this.ri + 1]! : 0; }
    w.tick();
  }
  private finish(): void { if (!this.ended) { this.ended = true; this.world.toast('Запись закончилась', 4); } }

  override frame(deltaMs: number, _inputs: unknown[]): number {
    void _inputs;
    if (this.hold || this.ended) { this.afterTicks(); return 0; }
    const n = this.clock.advance(deltaMs * this.playSpeed);
    for (let i = 0; i < n && !this.ended; i++) this.tickOnce();
    if (this.world.next) { const next = this.journal.segs[this.si + 1]; if (next) { this.cfg.loadoutSave = next.data.loadout ? normalizeSave(next.data.loadout) : this.cfg.loadoutSave; this.world.next.gameplay = next.data.gameplay ?? 1; } }
    this.afterTicks();
    return n;
  }

  // ----- действия игрока недоступны: мир определяет только запись -----
  override togglePause(): void { /* пауза просмотра — кнопка панели */ }
  override benchPick(): void { /* запись */ }
  override benchClose(): void { /* запись */ }
  override benchRest(): void { /* запись */ }
  override openShop(): void { /* запись */ }
  override closeShop(): void { /* запись */ }
  override buy(): void { /* запись */ }
  override mapShow(): void { /* запись */ }
  override mapClose(): void { /* запись */ }
  override mapMove(): void { /* запись */ }
  override mapGo(): void { /* запись */ }
  override campGo(): void { /* дальше — по записи */ }
  override trainReset(): void { /* запись */ }
  override techPause(): void { /* запись */ }
  override release(): void { /* запись */ }
  override retry(): void { this.onRestart?.(); }
  override setLoadout(): void { /* снаряжение определяется записью */ }
  override step(): void { /* ввод не принимается */ }
}
