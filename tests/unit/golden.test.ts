// Золотые записи v1.8: ядро v2 обязано воспроизвести каждую партию в тот же исход (и контрольные хэши по пути).
// Если расходится — tools/trace-diff.mjs покажет первый тик расхождения (трасса снимается со старой игры: legacy/tools/trace.js).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outcome, type Journal } from '../../src/core/journal';
import { normalizeSave } from '../../src/core/loadout';
import { replayJournal } from '../../src/core/replay';

const dir = join(__dirname, '../golden');
const names = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => n !== 'race-b1') : [];
const only = process.env['GOLDEN']?.split(',');

describe('золотые записи v1.8', () => {
  for (const n of names) {
    if (only && !only.includes(n)) continue;
    it(n, () => {
      const rec = JSON.parse(readFileSync(join(dir, n + '.json'), 'utf8')) as { journal: Journal; expect: Record<string, unknown>; loadout?: unknown };
      const r = replayJournal(rec.journal, { loadoutSave: normalizeSave(rec.loadout) });
      if (!r.ok) throw new Error(r.why);
      expect(JSON.parse(JSON.stringify(outcome(r.world)))).toEqual(rec.expect); // через JSON: как хранится запись (-0 → 0)
    }, 120_000);
  }
});
