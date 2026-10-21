// Гонка v1.8 (запись race-b1): журналы обоих игроков воспроизводятся ядром v2 в тот же исход и ту же статистику забега.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outcome, type Journal } from '../../src/core/journal';
import { packStats } from '../../src/core/racestats';
import { replayJournal } from '../../src/core/replay';

interface RacePlayer { name: string; journal: Journal; expect: Record<string, unknown>; stats: Record<string, unknown> }
const rec = JSON.parse(readFileSync(join(__dirname, '../golden/race-b1.json'), 'utf8')) as { players: RacePlayer[] };

describe('гонка race-b1 (журналы игроков)', () => {
  for (const p of rec.players) {
    it(`игрок ${p.name}`, () => {
      const r = replayJournal(p.journal);
      if (!r.ok) throw new Error(r.why);
      expect(JSON.parse(JSON.stringify(outcome(r.world)))).toEqual(p.expect);
      expect(JSON.parse(JSON.stringify(packStats(r.sr?.stats, r.sr ? (r.sr.igt / 1000) * 60 : 0)))).toEqual(p.stats);
    });
  }
});
