// Воспроизведение записи на ядре в Node:  npm run replay -- файл.ttrec [--json] [--hashes]
// Печатает исход и хэши; код выхода 1, если запись не проигралась или исход не совпал с ожидаемым в файле.
// Понимает и золотые записи tests/golden/*.json (журнал v1.8 с полем expect).
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { applyBalanceOverride } from '../src/core/balance';
import { hashFor } from '../src/core/journal';
import { makeTtrec, parseTtrec, playTtrec, ttrecTicks, type Ttrec } from '../src/core/ttrec';

const args = process.argv.slice(2), file = args.find((a) => !a.startsWith('--'));
const json = args.includes('--json'), hashes = args.includes('--hashes');
if (!file) { console.error('Использование: npm run replay -- файл.ttrec [--json] [--hashes]'); process.exit(2); }

export function loadRecording(path: string): Ttrec {
  const text = readFileSync(resolve(path), 'utf8');
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (raw['format'] === 'ttrec') return parseTtrec(text);
  if (raw['journal'] && raw['expect']) { // золотая запись v1.8
    return makeTtrec(raw['journal'] as never, { ver: String((raw['journal'] as { ver?: string }).ver ?? pkg.version), meta: { kind: 'repro', label: basename(path) }, setup: { loadout: raw['loadout'] as never }, expect: raw['expect'] as never });
  }
  throw new Error('не запись .ttrec и не золотая запись');
}

try {
  const rec = loadRecording(file);
  if (rec.setup.balance) applyBalanceOverride(rec.setup.balance);
  const t0 = performance.now();
  const play = playTtrec(rec);
  const ms = performance.now() - t0;
  const ticks = ttrecTicks(rec);
  const marks: [number, number][] = [];
  for (const s of rec.journal.segs) for (let i = 0; i < s.chk.length; i += 2) marks.push([s.chk[i]!, s.chk[i + 1]!]);
  if (json) {
    console.log(JSON.stringify({ file, ok: play.result.ok, why: play.result.ok ? null : play.result.why, ticks, seconds: ticks / 60, outcome: play.outcome, match: play.match, checkpoints: marks.length, ms: Math.round(ms) }));
  } else {
    console.log(`Запись: ${basename(file)} · ${rec.meta.kind}${rec.meta.label ? ' · ' + rec.meta.label : ''} · игра v${rec.ver}`);
    console.log(`Отрезков: ${rec.journal.segs.length}, тиков: ${ticks} (${(ticks / 60).toFixed(1)} с игры), воспроизведено за ${ms.toFixed(0)} мс`);
    if (!play.result.ok) console.log(`ОШИБКА воспроизведения: ${play.result.why} (тик ${play.result.tick})`);
    else {
      const o = play.outcome!;
      const bd = o['boss'] as { state: string } | null;
      console.log(`Исход: ${o['won'] || (bd && ['dead', 'gone'].includes(bd.state)) ? 'победа' : o['wiping'] ? 'нить оборвалась' : 'без исхода'}, смертей ${String(o['deaths'])}, бусин ${String(o['beads'])}, тик ${String(o['tick'])}`);
      const b = o['boss'] as { hp: number; phase: number; state: string } | null;
      if (b) console.log(`Босс: HP ${b.hp}, фаза ${b.phase}, состояние ${b.state}`);
      console.log(`Хэш итогового состояния: ${(o['hash'] as number).toString(16).padStart(8, '0')}; контрольных хэшей в записи: ${marks.length} (все сверены при воспроизведении)`);
      if (hashes) for (const [t, h] of marks) console.log(`  тик ${t}: ${h.toString(16).padStart(8, '0')}`);
      if (play.match === null) console.log('Ожидаемого исхода в файле нет');
      else console.log(play.match ? 'Ожидаемый исход совпал' : 'ОЖИДАЕМЫЙ ИСХОД НЕ СОВПАЛ');
    }
  }
  if (!play.result.ok || play.match === false) process.exitCode = 1;
  void hashFor;
} catch (e) { console.error('Ошибка: ' + ((e as Error).message ?? e)); process.exitCode = 1; }
