// Золотые записи: ядро v2 обязано воспроизвести каждую партию в тот же исход (и контрольные хэши по пути).
//  · tests/golden/*.json — записи старой игры v1.8 (их воспроизводит и legacy/, CI «legacy-golden»): уровни, коридоры, лавка, карта; боссы в них не участвуют.
//  · tests/golden/v2/*.json — записи ядра v2 с боссами на данных (tools/golden/record.ts, `npm run golden:record`): бои, Босс-раш, глава I, вдвоём, фаззинг.
// Если расходится — tools/trace-diff.mjs покажет первый тик расхождения (трасса снимается со старой игры: legacy/tools/trace.js).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outcome, type Journal } from '../../src/core/journal';
import { normalizeSave } from '../../src/core/loadout';
import { replayJournal } from '../../src/core/replay';

const dirs: [prefix: string, dir: string][] = [['', join(__dirname, '../golden')], ['v2/', join(__dirname, '../golden/v2')]];
/** race-b1 проверяют race.test.ts и subsplits.test.ts (там два журнала игроков) */
const files = dirs.flatMap(([prefix, dir]) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'race-b1.json').map((f) => ({ n: prefix + f.slice(0, -5), file: join(dir, f) })) : []));
const only = process.env['GOLDEN']?.split(',');

describe('золотые записи', () => {
  for (const { n, file } of files) {
    if (only && !only.includes(n)) continue;
    it(n, () => {
      const rec = JSON.parse(readFileSync(file, 'utf8')) as { journal: Journal; expect: Record<string, unknown>; loadout?: unknown };
      const r = replayJournal(rec.journal, { loadoutSave: normalizeSave(rec.loadout) });
      if (!r.ok) throw new Error(r.why);
      expect(JSON.parse(JSON.stringify(outcome(r.world)))).toEqual(rec.expect); // через JSON: как хранится запись (-0 → 0)
    }, 120_000);
  }
});
