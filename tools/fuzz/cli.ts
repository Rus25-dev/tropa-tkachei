// Фаззер ядра: случайный и полуслучайный ввод во всех режимах, инварианты, сверка «журнал → воспроизведение», минимизация находок.
//   npm run fuzz -- --hours 1                 час реального времени
//   npm run fuzz -- --seconds 60              быстрый прогон (годится для CI)
//   npm run fuzz -- --seconds 60 --seed 7 --mode ch1,chain,arena-tima --workers 4
// Находки сохраняются минимальными записями в tests/repro/*.json (--no-save отключает) и получают регрессионный тест (tests/unit/repro.test.ts).
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import pkg from '../../package.json' with { type: 'json' };
import { INVARIANTS } from './invariants';
import { findingKey } from './minimize';
import { loadRepros, makeRepro, reproName, saveRepro } from './repro';
import { MODES, makeSpec, type ModeId } from './spec';
import type { WorkResult } from './worker';

const argv = process.argv.slice(2);
const opt = (n: string, d?: string): string | undefined => { const i = argv.indexOf('--' + n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const flag = (n: string): boolean => argv.includes('--' + n);
const seconds = opt('hours') ? +opt('hours')! * 3600 : +(opt('seconds', '60')!);
const seed = +(opt('seed', String(Date.now() % 1_000_000))!);
const workersN = +(opt('workers') ?? Math.max(1, availableParallelism() - 2));
const only = opt('mode') ? (opt('mode')!.split(',') as ModeId[]) : undefined;
if (only) for (const m of only) if (!MODES.includes(m)) { console.error(`Неизвестный режим «${m}». Есть: ${MODES.join(', ')}`); process.exit(2); }
const save = !flag('no-save'), maxPerKey = +(opt('per-key', '2')!), budget = +(opt('minimize-ms', '45000')!);
const stopOnFinding = flag('stop-on-finding');

// особенности v1.8, уже разобранные и записанные в tests/repro со статусом known: их повтор не считается находкой
const knownKeys = new Set(loadRepros().filter((x) => x.rep.repro.status === 'known').map((x) => x.rep.repro.key));
let knownHits = 0;
console.log(`Фаззер: ${seconds} с, зерно ${seed}, воркеров ${workersN}${only ? ', режимы: ' + only.join(',') : ''}`);
const t0 = performance.now();
let next = 0, done = 0, ticks = 0, scenes = 0, ui = 0, victories = 0, stopping = false;
const perMode = new Map<string, { runs: number; ticks: number; findings: number }>();
const keys = new Map<string, number>();
const found: { name: string; path: string | null; r: WorkResult }[] = [];
const workers: Worker[] = [];
const elapsed = (): number => (performance.now() - t0) / 1000;
let lastReport = 0;

function onResult(w: Worker, r: WorkResult): void {
  done++; ticks += r.stats.ticks; scenes += r.stats.scenes; ui += r.stats.uiActs; victories += r.stats.victories;
  const m = perMode.get(r.spec.mode) ?? { runs: 0, ticks: 0, findings: 0 }; m.runs++; m.ticks += r.stats.ticks; perMode.set(r.spec.mode, m);
  if (r.finding && knownKeys.has(findingKey(r.finding))) { knownHits++; r.finding = null; }
  if (r.finding) {
    m.findings++;
    const key = r.spec.mode + '|' + r.finding.invariant + '|' + r.finding.message.replace(/[-\d.]+/g, '#').slice(0, 80);
    const n = (keys.get(key) ?? 0) + 1; keys.set(key, n);
    const min = r.minimized ? ` (журнал ${r.minimized.before} → ${r.minimized.after} тиков, проверок ${r.minimized.checks}${r.minimized.reproduced ? '' : ', не воспроизвелось при минимизации'})` : '';
    console.log(`НАХОДКА #${r.spec.run} ${r.spec.mode}${r.spec.players === 2 ? ' вдвоём' : ''} (${INVARIANTS[r.finding.invariant]}) на тике ${r.finding.tick}: ${r.finding.message}${min}`);
    if (n <= maxPerKey && r.journal) {
      const name = reproName(r);
      const path = save ? saveRepro(name, makeRepro(r, seed, pkg.version)) : null;
      found.push({ name, path, r }); if (path) console.log('  сохранено: ' + path);
    }
    if (stopOnFinding) stopping = true;
  }
  if (elapsed() - lastReport > 15) { lastReport = elapsed(); console.log(`  [${elapsed().toFixed(0)} с] прогонов ${done}, игрового времени ${(ticks / 3600).toFixed(1)} мин (×${(ticks / 60 / elapsed()).toFixed(0)}), находок ${found.length}`); }
  feed(w);
}
const busy = new Map<Worker, { since: number; run: number }>();
function feed(w: Worker): void {
  if (elapsed() >= seconds || stopping) { busy.delete(w); void w.terminate(); if (--alive === 0) summary(); return; }
  const spec = makeSpec(seed, next++, only);
  busy.set(w, { since: elapsed(), run: spec.run }); w.postMessage({ spec, budget });
}
let alive = workersN;
function spawn(): void {
  const w = new Worker(new URL('./worker.ts', import.meta.url));
  workers.push(w);
  w.on('message', (m: WorkResult | { ready: true }) => { if ('ready' in m) feed(w); else { busy.delete(w); onResult(w, m); } });
  w.on('error', (e) => { console.error('Ошибка потока фаззера:', e); process.exitCode = 1; busy.delete(w); if (--alive === 0) summary(); });
}
for (let k = 0; k < workersN; k++) spawn();
// сторожевой таймер: прогон, который не отвечает дольше HANG_S секунд, — зависание ядра (бесконечный цикл); поток заменяется
const HANG_S = +(opt('hang', '180')!);
const watchdog = setInterval(() => {
  for (const [w, b] of busy) if (elapsed() - b.since > HANG_S) {
    busy.delete(w); void w.terminate();
    const spec = makeSpec(seed, b.run, only);
    console.log(`НАХОДКА #${b.run} ${spec.mode} (зависание): прогон не ответил за ${HANG_S} с. Повторить: npm run fuzz -- --seed ${seed} --mode ${spec.mode} (прогон ${b.run})`);
    process.exitCode = 1; found.push({ name: 'hang-' + b.run, path: null, r: { spec, stats: { ticks: 0, scenes: 0, uiActs: 0, victories: 0, wipes: 0 }, ms: 0, finding: { invariant: 'exception', message: 'зависание', tick: 0 }, journal: null, progress: null, minimized: null } });
    alive--; if (elapsed() < seconds && !stopping) { alive++; spawn(); } else if (alive === 0) summary();
  }
}, 5000);
watchdog.unref();

function summary(): void {
  const s = elapsed();
  console.log(`\nИтого: ${s.toFixed(0)} с, прогонов ${done}, тиков ${ticks} (${(ticks / 3600 / 60).toFixed(1)} ч игрового времени, ×${(ticks / 60 / s).toFixed(0)}), сцен ${scenes}, действий интерфейса ${ui}, побед ${victories}`);
  console.log('Режим                 прогонов   игровых минут   находок');
  for (const m of MODES) { const x = perMode.get(m); if (x) console.log(`${m.padEnd(20)} ${String(x.runs).padStart(9)} ${(x.ticks / 3600).toFixed(1).padStart(15)} ${String(x.findings).padStart(9)}`); }
  if (knownHits) console.log(`Известных особенностей v1.8 (tests/repro, status known) встречено: ${knownHits}`);
  console.log(found.length ? `\nНаходок (уникальных): ${found.length}${save ? ' — записи в tests/repro/' : ''}` : '\nНаходок нет.');
  process.exitCode = found.length ? 1 : 0;
  clearInterval(watchdog);
}
