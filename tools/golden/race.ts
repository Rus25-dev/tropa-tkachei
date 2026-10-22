// Золотая запись гонки «Тропа целиком» на ядре v2 (tests/golden/v2/race-b1.json): два игрока одной комнаты проходят четыре главы «читами продвижения»
// (ex 20 — перенос героя к порогу арены главы I, ex 2 — на выход коридора, ex 1 — довести босса до последнего удара). Организатора и сеть запись не трогает:
// проверяется ядро — журналы обоих игроков воспроизводятся в тот же исход, подсплиты и статистику забега (tests/unit/race.test.ts, subsplits.test.ts).
//   npm run golden:race
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyButtons, type InputFrame } from '../../src/core/input';
import { GOLDEN_EXT, outcome, type Journal } from '../../src/core/journal';
import { normalizeSave } from '../../src/core/loadout';
import { packStats } from '../../src/core/racestats';
import { RACE_EXT, replayJournal } from '../../src/core/replay';
import { Session } from '../../src/core/session';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../tests/golden/v2');
const VER = 'golden-v2', SEED = 41141160;
const plain = (o: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;

/** игрок гонки: seat, имя, пауза до «пошёл» и задержка «читов» в каждой сцене (тиков) */
function play(seat: number, name: string, hold: number, lag: number): { name: string; journal: Journal; expect: Record<string, unknown>; stats: Record<string, unknown> } {
  const clock = { ms: 0 };
  const rc = { code: 'M29K2', seat, id: 'mvh9705h83yn5', name };
  const ses = new Session({ easy: false, loadoutSave: normalizeSave(null), progress: null, ver: VER, clock: () => clock.ms, fx: false, wall: () => 1792535231299 + clock.ms },
    { seed: SEED, mode: 'story', players: 1, camp: null }, { cat: 'trail', opt: { rc } });
  const idle: InputFrame = { buttons: emptyButtons(), edges: { jumpP: false, atkP: false, dashP: false, healP: false, upP: false, bombP: false, toolP: false } };
  const ex = (id: number, x = 0, y = 0): void => { ses.rec?.act('ex', id, x, y); (GOLDEN_EXT[id] ?? RACE_EXT[id])?.(ses.world, x, y); };
  let sceneAt = 0, world = ses.world, killed = false;
  for (let t = 0; t < 6000; t++) {
    if (ses.world !== world) { world = ses.world; sceneAt = t; killed = false; }
    clock.ms += 1000 / 60;
    const k = t - sceneAt, w = ses.world, r = ses.sr!;
    if (t === hold) { ses.release(); sceneAt = t; }
    else if (t > hold && !w.leaving && !w.won) {
      if (w.camp!.st === 'level') { if (k === 18 + lag) ex(20, (w.L.boss!.trigger + 1) * 32, (w.L.boss!.y + 1) * 32 - 26); }
      else if (w.camp!.st === 'road') { if (k >= 8 + lag && (k - lag) % 10 === 8) ex(2); }
      else if (!killed && k >= 6 + lag && w.testBoss()) { killed = true; ex(1); }
    }
    ses.frame(1000 / 60, [idle]);
    if (r.done) { for (let i = 0; i < 10; i++) { clock.ms += 1000 / 60; ses.frame(1000 / 60, [idle]); } break; }
  }
  if (!ses.sr!.done) throw new Error(`${name}: гонка не закончилась (сцена ${ses.world.camp?.ch}/${ses.world.camp?.st}, тик сцены ${ses.world.tickN}, сплитов ${ses.sr!.splits.length}, босс ${ses.world.testBoss()?.state}/${ses.world.testBoss()?.hp})`);
  const journal = ses.rec!.J;
  // исход и статистика берутся из воспроизведения журнала — ровно так их потом проверит тест
  const rp = replayJournal(journal);
  if (!rp.ok) throw new Error(`${name}: журнал не воспроизводится: ${rp.why}`);
  const live = plain(outcome(ses.world)), back = plain(outcome(rp.world));
  if (JSON.stringify(live) !== JSON.stringify(back)) throw new Error(`${name}: воспроизведение разошлось с живым ходом`);
  return { name, journal, expect: back, stats: plain(packStats(rp.sr?.stats, rp.sr ? (rp.sr.igt / 1000) * 60 : 0)) };
}

mkdirSync(OUT, { recursive: true });
const players = [play(1, 'Ива', 183, 0), play(2, 'Ярь', 181, 37)];
writeFileSync(join(OUT, 'race-b1.json'), JSON.stringify({ name: 'race-b1', kind: 'race', version: VER, seed: SEED, players }));
console.log('записано race-b1: ' + players.map((p) => `${p.name}: IGT ${(p.expect['sr'] as { igt: number }).igt} мс, сплитов ${(p.expect['sr'] as { splits: unknown[] }).splits.length}`).join(' · '));
