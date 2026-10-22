// ИИ-тестер боссов на ядре v2.
//   npm run bot -- table --fights 200 [--boss misha|vladik|tima|korne] [--skill 0.6] [--players 1] [--max 240] [--seed 1]
//                          [--workers N] [--balance файл.json] [--json] [--verbose] [--kit]
//   --kit: открыть приёмы набора игрока (теневой рывок…) в Босс-тесте; бот пользуется ими при мастерстве ≥ 0,9. По умолчанию выключено, таблицы баланса не меняются
//   npm run bot -- record --boss misha [--skill 0.9] [--seed 5] [--out бой.ttrec]    один бой с записью
//   npm run bot -- watch бой.ttrec          смотреть запись в браузере (движок игры воспроизводит её по ?watch=)
//   npm run bot -- watch --boss tima --skill 0.6 --seed 3    записать бой и сразу открыть (--speed 2 — скорость, --no-open — не открывать браузер сам)
// Баланс можно переопределить файлом (--balance) или переменной окружения TT_BALANCE (путь к файлу или JSON): только для этих инструментов.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { applyBalanceOverride } from '../../src/core/balance';
import type { BalanceData, DeepPartial } from '../../src/core/balance-schema';
import { stringifyTtrec } from '../../src/core/ttrec';
import { BOSSES, BOSS_NAMES, runFight, type BossId } from './fight';
import { defaultWorkers, runInline, runPool } from './pool';
import { DEFAULT_SKILLS, hurtLine, renderTable, summarize, tableJobs } from './table';

const argv = process.argv.slice(2);
const cmd = argv[0] ?? 'help';
const flag = (n: string): boolean => argv.includes('--' + n);
const opt = (n: string, d?: string): string | undefined => { const i = argv.indexOf('--' + n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const log = (s: string): void => { console.error(s); };

/** Баланс из --balance или TT_BALANCE; null, если не задан */
export function loadBalanceOverride(): DeepPartial<BalanceData> | null {
  const spec = opt('balance') ?? process.env['TT_BALANCE'];
  if (!spec) return null;
  const text = spec.trim().startsWith('{') ? spec : readFileSync(resolve(spec), 'utf8');
  return JSON.parse(text) as DeepPartial<BalanceData>;
}

function parseBosses(): BossId[] {
  const b = opt('boss');
  if (!b) return [...BOSSES];
  const list = b.split(',') as BossId[];
  for (const x of list) if (!BOSSES.includes(x)) throw new Error(`Неизвестный босс «${x}». Есть: ${BOSSES.join(', ')}`);
  return list;
}

async function table(): Promise<void> {
  const bal = loadBalanceOverride();
  if (bal) applyBalanceOverride(bal);
  const skills = (opt('skill') ?? opt('levels') ?? DEFAULT_SKILLS.join(',')).split(',').map(Number);
  if (skills.some((s) => !(s >= 0 && s <= 1))) throw new Error('--skill: число от 0 до 1 (или список через запятую)');
  const spec = { bosses: parseBosses(), skills, fights: +(opt('fights', '20')!), players: +(opt('players', '1')!), maxSec: +(opt('max', '240')!), seed: +(opt('seed', '1')!), ver: pkg.version, kit: flag('kit') };
  const jobs = tableJobs(spec), workers = +(opt('workers') ?? defaultWorkers());
  const json = flag('json'), verbose = flag('verbose') || flag('v');
  log(`Бой: ${jobs.length}, воркеров: ${workers}${bal ? ', баланс переопределён' : ''}`);
  const t0 = performance.now();
  let done = 0, ticks = 0;
  const onDone = (_i: number, j: { boss: string; skill: number }, r: { won: boolean; sec: number; dmg: number; ticks: number; error?: string }): void => {
    done++; ticks += r.ticks;
    if (r.error) log(`ОШИБКА ${j.boss} ${j.skill}: ${r.error}`);
    else if (verbose) log(`[${done}/${jobs.length}] ${j.boss} ${j.skill}: ${r.won ? 'победа' : 'поражение'} ${r.sec.toFixed(0)} c, урон ${r.dmg}`);
    else if (!json && done % Math.max(1, Math.floor(jobs.length / 20)) === 0) log(`  ${done}/${jobs.length}`);
  };
  const results = workers <= 0 ? runInline(jobs, onDone) : await runPool(jobs, { workers, balance: bal, onDone });
  const secs = (performance.now() - t0) / 1000;
  const cells = summarize(jobs, results);
  const speed = { fights: jobs.length, seconds: +secs.toFixed(1), fightsPerSec: +(jobs.length / secs).toFixed(2), ticksPerSec: Math.round(ticks / secs), realtimeX: Math.round(ticks / 60 / secs) };
  if (json) { console.log(JSON.stringify({ spec, workers, balance: bal, speed, cells })); return; }
  console.log(renderTable(cells, `Таблица ботов: боёв на ячейку ${spec.fights}, игроков ${spec.players}, воркеров ${workers}, ${secs.toFixed(0)} с (${speed.fightsPerSec} боёв/с, ×${speed.realtimeX} реального времени)`));
  if (verbose) for (const c of cells) console.log(`  причины урона ${BOSS_NAMES[c.boss]} ${c.skill}: ${hurtLine(c)}`);
}

function recordOne(defaultDir = ''): ReturnType<typeof runFight> & { path: string } {
  const bal = loadBalanceOverride();
  if (bal) applyBalanceOverride(bal);
  const boss = (opt('boss', 'misha')) as BossId;
  if (!BOSSES.includes(boss)) throw new Error(`Неизвестный босс «${boss}»`);
  const r = runFight({ boss, skill: +(opt('skill', '0.9')!), players: +(opt('players', '1')!), seed: +(opt('seed', '1')!), maxSec: +(opt('max', '240')!), record: true, ver: pkg.version, kit: flag('kit') });
  if (r.error) throw new Error(r.error);
  if (bal) r.ttrec!.setup.balance = bal;
  const path = resolve(opt('out') ?? join(defaultDir, `${boss}-${opt('seed', '1')}.ttrec`));
  writeFileSync(path, stringifyTtrec(r.ttrec!));
  return { ...r, path };
}
const describe = (r: ReturnType<typeof runFight>): string => `${r.won ? 'победа' : r.died ? 'поражение (обрыв нити)' : 'таймаут'}, бой ${r.sec.toFixed(1)} с, урон ${r.dmg}, оглушений ${r.stag}, казней ${r.exec}, отбивов ${r.parry}, HP босса ${Math.round(100 * r.bossFrac)}%`;

async function watch(): Promise<void> {
  let file = argv[1] && !argv[1].startsWith('--') ? resolve(argv[1]) : '';
  if (!file) { const r = recordOne(tmpdir()); file = r.path; log(`Записан бой: ${describe(r)} → ${file}`); }
  if (!existsSync(file)) throw new Error('Нет файла записи: ' + file);
  const data = readFileSync(file);
  const { createServer } = await import('vite');
  const port = +(opt('port', '5174')!);
  const server = await createServer({
    server: { port, strictPort: false, open: flag('no-open') ? false : `/?watch=${encodeURIComponent('/__watch.ttrec')}${opt('speed') ? '&wspeed=' + opt('speed') : ''}` },
    plugins: [{ name: 'tt-watch', configureServer(s) { s.middlewares.use('/__watch.ttrec', (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(data); }); } }],
  });
  await server.listen();
  server.printUrls();
  log('Просмотр записи открыт в браузере. Остановить: Ctrl+C.');
}

try {
  if (cmd === 'table') await table();
  else if (cmd === 'record' || cmd === 'fight') { const r = recordOne(); console.log(`${describe(r)}\n→ ${r.path}`); }
  else if (cmd === 'watch') await watch();
  else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
} catch (e) { console.error('Ошибка: ' + ((e as Error).message ?? e)); process.exitCode = 1; }
