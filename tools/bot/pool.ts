// Пул worker_threads для боёв бота. Результаты возвращаются в порядке заданий, поэтому не зависят от числа воркеров:
// каждый бой считается целиком в одном потоке и определяется только своим заданием (зерно, босс, мастерство).
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { DeepPartial, BalanceData } from '../../src/core/balance-schema';
import { failed, runFight, type FightJob, type FightResult } from './fight';

/** Число воркеров по умолчанию: ядра − 2, минимум 1 */
export const defaultWorkers = (): number => Math.max(1, availableParallelism() - 2);

export interface PoolOpts {
  workers?: number;
  /** переопределение баланса: применяется в каждом воркере до первого боя */
  balance?: DeepPartial<BalanceData> | null;
  /** ключи Node для воркеров; по умолчанию как у родителя (tsx + регистрация LDtk) */
  execArgv?: string[];
  onDone?: (i: number, job: FightJob, r: FightResult) => void;
}

/** Бои в одном потоке (без воркеров): эталон для сверки и режим `--workers 0` */
export function runInline(jobs: FightJob[], onDone?: PoolOpts['onDone']): FightResult[] {
  return jobs.map((j, i) => { let r: FightResult; try { r = runFight(j); } catch (e) { r = failed(e); } onDone?.(i, j, r); return r; });
}

export function runPool(jobs: FightJob[], opt: PoolOpts = {}): Promise<FightResult[]> {
  const n = Math.max(1, Math.min(opt.workers ?? defaultWorkers(), jobs.length || 1));
  const results = new Array<FightResult>(jobs.length);
  if (!jobs.length) return Promise.resolve(results);
  return new Promise((resolve, reject) => {
    let next = 0, done = 0, failedFatal = false;
    const workers: Worker[] = [];
    const finish = (): void => { for (const w of workers) void w.terminate(); };
    const feed = (w: Worker): void => { if (next < jobs.length) { const i = next++; w.postMessage({ i, job: jobs[i] }); } else void w.terminate(); };
    for (let k = 0; k < n; k++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { workerData: { balance: opt.balance ?? null }, ...(opt.execArgv ? { execArgv: opt.execArgv } : {}) });
      workers.push(w);
      w.on('message', (m: { i: number; r: FightResult } | { ready: true }) => {
        if ('ready' in m) { feed(w); return; }
        results[m.i] = m.r; opt.onDone?.(m.i, jobs[m.i]!, m.r);
        if (++done === jobs.length) { finish(); resolve(results); } else feed(w);
      });
      w.on('error', (e) => { if (!failedFatal) { failedFatal = true; finish(); reject(e); } });
    }
  });
}
