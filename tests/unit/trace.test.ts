// Отладка переноса: сравнение трассы состояния по тикам со старой игрой (legacy/tools/trace.js пишет tests/trace/<имя>.ndjson).
//   TRACE=boss-misha-win npx vitest run tests/unit/trace.test.ts
// Печатает первый тик, на котором ядро v2 разошлось с v1.8, и поля, которые отличаются.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Journal } from '../../src/core/journal';
import { normalizeSave } from '../../src/core/loadout';
import { replayJournal } from '../../src/core/replay';
import type { World } from '../../src/core/world';

const name = process.env['TRACE'];
const row = (w: World): unknown[] => {
  const b = w.testBoss() ?? w.boss;
  const r = (v: unknown): number => (typeof v === 'number' ? v : v ? 1 : 0);
  return [w.tickN,
    w.players.map((p) => [p.x, p.y, p.vx, p.vy, p.hp, p.silk, p.inv, r(p.downed), p.dashT, p.atkT, p.face]),
    b ? [b.x, b.y, b.hp, b.state, b.phase || 1, b.t, b.stagger || 0] : null,
    w.enemies.filter((e) => !e.dead).length, w.projs.length, w.beadsArr.length, w.beads | 0, w.deaths | 0, w.seed, r(w.bossDead), r(w.won)];
};
const FIELDS = ['tick', 'players', 'boss', 'enemies', 'projs', 'beadsArr', 'beads', 'deaths', 'seed', 'bossDead', 'won'];

describe.skipIf(!name)('трасса', () => {
  it(`${name}`, () => {
    const dir = join(__dirname, '../golden'), tdir = join(__dirname, '../trace');
    const rec = JSON.parse(readFileSync(join(dir, name + '.json'), 'utf8')) as { journal: Journal; loadout?: unknown };
    const ref = readFileSync(join(tdir, name + '.ndjson'), 'utf8').trim().split('\n');
    expect(existsSync(join(tdir, name + '.ndjson'))).toBe(true);
    let i = 0, bad = '';
    const res = replayJournal(rec.journal, {
      loadoutSave: normalizeSave(rec.loadout),
      onTick: (w) => {
        if (bad) return;
        const mine = row(w), theirs = JSON.parse(ref[i]!) as unknown[];
        i++;
        for (let k = 0; k < FIELDS.length; k++) {
          if (JSON.stringify(mine[k]) !== JSON.stringify(theirs[k])) {
            bad = `строка ${i}, тик ${String(theirs[0])}, поле «${FIELDS[k]}»:\n  v1.8: ${JSON.stringify(theirs[k])}\n  v2:   ${JSON.stringify(mine[k])}`;
            break;
          }
        }
      },
    });
    if (bad) throw new Error('расхождение: ' + bad);
    if (!res.ok) throw new Error(res.why);
  });
});
