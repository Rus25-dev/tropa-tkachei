// Симуляция ядра в чистом Node, без браузера:  npm run sim -- --boss misha2 --frames 36000 [--seed 1] [--players 1] [--weapon mace]
// Играет случайным вводом (src/core/fuzzinput.ts) и печатает итог и скорость (требование этапа 2: ≥ 100× реального времени).
import { feedInput, makeFuzzer } from '../src/core/fuzzinput';
import { outcome } from '../src/core/journal';
import { World } from '../src/core/world';

const arg = (n: string, d: string): string => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1]! : d; };
const boss = arg('boss', 'misha2'), frames = +arg('frames', '36000'), seed = +arg('seed', '1'), players = +arg('players', '1'), weapon = arg('weapon', 'needle');

const level = boss === 'level'; // 'level' — глава I (уровень без босса)
const w = new World({
  seed, mode: level ? 'story' : 'bosstest', boss: level ? undefined : boss, players,
  loadoutSave: { weapon, tool: '', charms: [], have: { weapons: [weapon], tools: [], charms: [] } },
});
const fz = makeFuzzer(w, seed);
const t0 = performance.now();
let done = 0;
for (; done < frames; done++) {
  feedInput(w, w.players.map((p) => fz(p.i)));
  w.tick();
  if (w.won) break;
}
const ms = performance.now() - t0, realSec = done / 60;
console.log(JSON.stringify(outcome(w)));
console.log(`тиков: ${done} (${realSec.toFixed(0)} с игры) за ${ms.toFixed(0)} мс → ${(realSec / (ms / 1000)).toFixed(0)}× реального времени`);
