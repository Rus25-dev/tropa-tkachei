// Воспроизведение журнала без отрисовки и звука (legacy/src/journal.js: restoreMem + pump). Годится для золотых записей, фаззера и бота.
import type { Act, Journal } from './journal';
import { CHK, GOLDEN_EXT, applyTickValue, hashFor } from './journal';
import { duelOf, newRun, runStartData, srRelease, srTechPause, type SrRun } from './speedrun';
import { World, type WorldOpts } from './world';
import { benchRest, } from './combat';
import { benchClose } from './coop';
import { buy, openShop } from './campaign';
import { SHOP } from './balance';
import { damageBoss } from './damage';
import { mishaBagHit } from './misha';
import { mapClose, mapGo, mapMove, mapShow } from './maptravel';

export interface ReplayOpts {
  /** вызывается после каждого тика (трасса состояния, фаззер) */
  onTick?: (w: World, seg: number) => void;
  /** сохранённое снаряжение для сцен (в золотых записях — по умолчанию) */
  loadoutSave?: WorldOpts['loadoutSave'];
  easy?: boolean;
  /** сохранение главы, из которого создана сцена записи (tt_save на тот момент); для записей спидрана не нужно */
  progress?: WorldOpts['progress'];
  ver?: string;
  clock?: () => number;
}
export type ReplayResult = { ok: true; world: World; sr: SrRun | null; ticks: number } | { ok: false; why: string; tick: number; seg: number };

/** действие интерфейса из журнала (Journal.runAct) */
export function runAct(w: World, a: Act, sr: SrRun | null): void {
  const [, name, x, y, z] = a, p0 = w.players[0]!;
  switch (name) {
    case 'T': w.togglePause(); break;
    case 'bc': benchClose(w, !!x); break;
    case 'br': benchRest(w, w.players[x] ?? p0, w.benches[y]!, !!z); break;
    case 'so': openShop(w, w.players[x] ?? p0); break;
    case 'sc': w.closeShop(); break;
    case 'sb': buy(w, SHOP[x] ? SHOP[x]!.id : ''); break;
    case 'mo': mapShow(w); break;
    case 'mc': mapClose(w); break;
    case 'mm': mapMove(w, x); break;
    case 'mg': w.mt.sel = x; mapGo(w); break;
    case 'ex': { const f = GOLDEN_EXT[x]; if (f) f(w, y, z); else RACE_EXT[x]?.(w); break; }
    case 'rel': srRelease(w, true); break;
    case 'tp': srTechPause(w, !!x, true); break;
    default: void sr;
  }
}

/** Воспроизведение по шагам: отдаёт управление каждые `every` тиков (число тиков — в yield), чтобы страница не зависала при восстановлении длинного забега */
export function* replaySteps(J: Journal, opt: ReplayOpts = {}, every = Infinity): Generator<number, ReplayResult, void> {
  const first = J.segs[0]; if (!first) return { ok: false, why: 'пустой журнал', tick: 0, seg: 0 };
  let sr: SrRun | null = null;
  let data: WorldOpts;
  if (J.cat) {
    sr = newRun(J.cat, { ver: opt.ver ?? J.ver, clock: opt.clock });
    sr.replay = { splits: J.splits, mem: !!J.mem };
    if (J.race) { sr.rc = J.race; sr.hold = true; sr.duel = J.cat === 'boss' ? duelOf(J.race) : null; } // гонка: до «пошёл» герой стоит, дальше действие 'rel' из журнала; дуэль — из сведений о комнате
    const d0 = runStartData(J.cat, first.seed, sr.duel);
    data = { ...d0, camp: (first.data.camp as WorldOpts['camp']) || d0.camp };
  } else {
    data = { players: first.data.players || 1, mode: first.data.mode, boss: first.data.boss ?? undefined, camp: first.data.camp as WorldOpts['camp'], seed: first.seed };
  }
  let w!: World, total = 0;
  for (let si = 0; si < J.segs.length; si++) {
    const seg = J.segs[si]!;
    if (si > 0) {
      const nx = w.next;
      if (!nx) return { ok: false, why: `сцена не сменилась перед отрезком ${si + 1}`, tick: w.tickN, seg: si };
      if (nx.seed !== seg.seed) return { ok: false, why: `зерно сцены не совпало (${seg.seed} ≠ ${nx.seed})`, tick: 0, seg: si };
      data = nx;
    }
    w = new World({ ...data, sr, easy: opt.easy, loadoutSave: opt.loadoutSave, progress: opt.progress, fx: false });
    const chk: Record<number, number> = {};
    for (let i = 0; i < seg.chk.length; i += 2) chk[seg.chk[i]!] = seg.chk[i + 1]!;
    let ai = 0, ri = 0, left = seg.rle.length ? seg.rle[1]! : 0;
    while (w.tickN < seg.n) {
      // действия интерфейса, случившиеся до этого тика
      while (ai < seg.acts.length && seg.acts[ai]![0] <= w.tickN) runAct(w, seg.acts[ai++]!, sr);
      if (w.tickN > 0 && w.tickN % CHK === 0 && chk[w.tickN] != null && chk[w.tickN] !== hashFor(w, seg.hv)) {
        return { ok: false, why: `состояние разошлось на тике ${w.tickN} (отрезок ${si + 1})`, tick: w.tickN, seg: si };
      }
      applyTickValue(w.players, seg.rle[ri]!);
      if (--left <= 0) { ri += 2; left = ri < seg.rle.length ? seg.rle[ri + 1]! : 0; }
      w.tick(); total++;
      if (opt.onTick) opt.onTick(w, si);
      if (total % every === 0) yield total;
    }
    while (ai < seg.acts.length) runAct(w, seg.acts[ai++]!, sr); // действия после последнего тика (например, пауза перед падением)
  }
  return { ok: true, world: w, sr, ticks: total };
}

export function replayJournal(J: Journal, opt: ReplayOpts = {}): ReplayResult {
  const g = replaySteps(J, opt);
  for (;;) { const n = g.next(); if (n.done) return n.value; }
}

// ----- «читы» гонки (журналируются как ex 1 и ex 2): довести босса до последнего удара и перенести героя на выход, чтобы гонка проходилась за секунды -----
export const RACE_EXT: Record<number, (sc: World) => void> = {
  1: (sc) => {
    const p = sc.players[0]!;
    if (sc.vladik) { sc.vladik.hp = 1; sc.vladik.state = 'idle'; damageBoss(sc, 'vladik', p); }
    else if (sc.tima) { sc.tima.hp = 1; sc.tima.state = 'idle'; damageBoss(sc, 'tima', p); }
    else if (sc.misha) { sc.misha.hp = 1; sc.misha['hitCd'] = 0; sc.misha.state = 'idle'; mishaBagHit(sc); }
    else { sc.boss.hp = 1; sc.boss.state = 'idle'; damageBoss(sc, 'boss', p); }
  },
  2: (sc) => { const p = sc.players[0]!, e = sc.exitR!; p.x = e.x + 4; p.y = e.y + 20; p.vx = p.vy = 0; },
};
