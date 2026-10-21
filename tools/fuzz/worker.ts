// Поток-исполнитель фаззера: прогоняет задания и сразу минимизирует находки (так минимизация идёт параллельно на всех ядрах).
import { parentPort, workerData } from 'node:worker_threads';
import { applyBalanceOverride } from '../../src/core/balance';
import type { Journal } from '../../src/core/journal';
import type { Progress } from '../../src/core/campaign';
import { FUZZ_VER, runFuzz, type RunStats } from './run';
import type { Finding } from './invariants';
import { minimizeJournal } from './minimize';
import type { FuzzSpec } from './spec';

export interface WorkResult {
  spec: FuzzSpec; stats: RunStats; ms: number;
  finding: Finding | null;
  /** минимальная запись находки */
  journal: Journal | null; progress: Progress | null;
  minimized: { before: number; after: number; checks: number; reproduced: boolean } | null;
}

export function work(spec: FuzzSpec, minimizeBudgetMs: number): WorkResult {
  const t0 = performance.now();
  const r = runFuzz(spec);
  let journal = r.journal, minimized: WorkResult['minimized'] = null;
  if (r.finding && journal && r.finding.invariant !== 'replay') {
    const m = minimizeJournal(journal, r.finding, { replay: { loadoutSave: spec.loadout, easy: spec.easy, ver: FUZZ_VER, progress: r.progress }, budgetMs: minimizeBudgetMs });
    if (m.reproduced) { journal = m.journal; minimized = { before: m.before, after: m.after, checks: m.checks, reproduced: true }; }
    else minimized = { before: m.before, after: m.after, checks: m.checks, reproduced: false };
  }
  return { spec, stats: r.stats, ms: performance.now() - t0, finding: r.finding, journal, progress: r.progress, minimized };
}

if (parentPort) {
  const port = parentPort;
  if (workerData?.balance) applyBalanceOverride(workerData.balance);
  port.on('message', (m: { spec: FuzzSpec; budget: number }) => {
    let res: WorkResult;
    try { res = work(m.spec, m.budget); }
    catch (e) { res = { spec: m.spec, stats: { ticks: 0, scenes: 0, uiActs: 0, victories: 0, wipes: 0 }, ms: 0, finding: { invariant: 'exception', message: 'фаззер: ' + String((e as Error)?.stack ?? e).slice(0, 400), tick: 0 }, journal: null, progress: null, minimized: null }; }
    port.postMessage(res);
  });
  port.postMessage({ ready: true });
}
