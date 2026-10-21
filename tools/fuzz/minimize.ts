// Минимизация находки: укорачивает журнал ввода, пока та же ошибка воспроизводится.
//   1. обрезка хвоста после первого нарушения;
//   2. удаление кусков ввода по убыванию размера (половины, четверти, … — бинарный поиск по длине, как ddmin);
//   3. замена оставшегося ввода «ничего не нажато» там, где это не мешает;
//   4. удаление ненужных действий интерфейса.
// Проверка каждого кандидата — воспроизведение журнала под инвариантами (scan.ts). Контрольные хэши последнего отрезка сбрасываются.
import type { Act, Journal, JournalSeg } from '../../src/core/journal';
import type { ReplayOpts } from '../../src/core/replay';
import type { Finding } from './invariants';
import { scanJournal } from './scan';

/** «класс» находки: по нему определяется, что воспроизвелась та же ошибка */
export const findingKey = (f: Finding): string => f.invariant + (f.cls ? ':' + f.cls : '') + (f.invariant === 'exception' ? ':' + f.message : '');

const expand = (seg: JournalSeg): number[] => { const out: number[] = []; for (let i = 0; i < seg.rle.length; i += 2) for (let k = 0; k < seg.rle[i + 1]!; k++) out.push(seg.rle[i]!); return out; };
const compress = (vals: number[]): number[] => { const r: number[] = []; for (const v of vals) { const L = r.length; if (L && r[L - 2] === v) r[L - 1]!++; else r.push(v, 1); } return r; };

export interface MinimizeOpts {
  replay: ReplayOpts; budgetMs?: number; minChunk?: number;
  /** чем проверять кандидата (по умолчанию scanJournal: инварианты фаззера); подмена нужна тестам */
  scan?: (J: Journal, replay: ReplayOpts) => Finding | null;
}
export interface MinimizeResult { journal: Journal; before: number; after: number; checks: number; reproduced: boolean }

export function minimizeJournal(J0: Journal, target: Finding, o: MinimizeOpts): MinimizeResult {
  const scan = o.scan ?? scanJournal, key = findingKey(target), t0 = Date.now(), budget = o.budgetMs ?? 60_000, minChunk = o.minChunk ?? 4;
  const last = J0.segs.length - 1, seg0 = J0.segs[last]!;
  const prefixTicks = J0.segs.slice(0, last).reduce((s, g) => s + g.n, 0);
  let vals = expand(seg0), acts: Act[] = seg0.acts.map((a) => [...a] as Act);
  let checks = 0;
  const build = (v: number[], a: Act[]): Journal => {
    const seg: JournalSeg = { ...seg0, n: v.length, rle: compress(v), acts: a.map((x) => [...x] as Act), chk: [] };
    return { ...J0, segs: [...J0.segs.slice(0, last), seg] };
  };
  const repro = (v: number[], a: Act[]): boolean => {
    checks++;
    const f = scan(build(v, a), o.replay);
    return !!f && findingKey(f) === key;
  };
  const out = (): boolean => Date.now() - t0 > budget;

  const first = scan(build(vals, acts), o.replay);
  if (!first || findingKey(first) !== key) return { journal: J0, before: prefixTicks + vals.length, after: prefixTicks + vals.length, checks: 1, reproduced: false };
  const before = prefixTicks + vals.length;

  // 1. хвост: оставляем ровно до тика нарушения
  const upto = Math.max(0, Math.min(vals.length, first.tick - prefixTicks));
  vals = vals.slice(0, upto); acts = acts.filter((a) => a[0] <= upto);

  // удаление куска [i, i+len): действия внутри куска сдвигаются к его началу, после — на len влево
  const cut = (v: number[], a: Act[], i: number, len: number): [number[], Act[]] =>
    [v.slice(0, i).concat(v.slice(i + len)), a.map((x) => (x[0] >= i + len ? [x[0] - len, x[1], x[2], x[3], x[4]] : x[0] > i ? [i, x[1], x[2], x[3], x[4]] : x) as Act)];

  // 2. ddmin по убыванию размера куска (повторяем проход, пока что-то удаётся)
  const sizes: number[] = [];
  for (let sz = Math.ceil(vals.length / 2); sz >= minChunk; sz = Math.floor(sz / 2)) sizes.push(sz);
  if (!sizes.length || sizes[sizes.length - 1] !== minChunk) sizes.push(minChunk);
  for (const size of sizes) {
    for (let i = 0; i + size <= vals.length && !out();) {
      const [v, a] = cut(vals, acts, i, size);
      if (repro(v, a)) { vals = v; acts = a; } else i += size;
    }
  }

  // 3. упрощение ввода: куски без нажатий
  for (let size = Math.max(8, Math.ceil(vals.length / 4)); size >= 4 && !out(); size = Math.floor(size / 2)) {
    for (let i = 0; i + size <= vals.length && !out(); i += size) {
      if (vals.slice(i, i + size).every((x) => x === 0)) continue;
      const v = vals.slice(); for (let k = i; k < i + size; k++) v[k] = 0;
      if (repro(v, acts)) vals = v;
    }
  }

  // 4. лишние действия интерфейса
  for (let k = acts.length - 1; k >= 0 && !out(); k--) {
    const a = acts.filter((_, j) => j !== k);
    if (repro(vals, a)) acts = a;
  }

  // хвост снова: после упрощений нарушение могло случиться раньше
  const fin = scan(build(vals, acts), o.replay);
  if (fin && findingKey(fin) === key) { const up = Math.min(vals.length, Math.max(1, fin.tick - prefixTicks)); vals = vals.slice(0, up); acts = acts.filter((a) => a[0] <= up); }
  return { journal: build(vals, acts), before, after: prefixTicks + vals.length, checks, reproduced: true };
}
