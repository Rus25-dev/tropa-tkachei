// Симуляция ядра в чистом Node, без браузера:  npm run sim -- --boss misha --frames 36000 [--seed 1] [--players 1] [--weapon mace]
// Играет случайным вводом (src/core/fuzzinput.ts) и печатает итог и скорость (требование этапа 2: ≥ 100× реального времени).
import { feedInput, makeFuzzer } from '../src/core/fuzzinput';
import { outcome } from '../src/core/journal';
import { World } from '../src/core/world';

const arg = (n: string, d: string): string => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1]! : d; };
const boss = arg('boss', 'misha'), frames = +arg('frames', '36000'), seed = +arg('seed', '1'), players = +arg('players', '1'), weapon = arg('weapon', 'needle');

const arena = boss === 'korne' || boss === 'level';
const w = new World({
  seed, mode: arena ? 'story' : 'bosstest', boss: arena ? undefined : boss, players,
  loadoutSave: { weapon, tool: '', charms: [], have: { weapons: [weapon], tools: [], charms: [] } },
});
if (boss === 'korne') { const tr = w.L.boss!.trigger; w.abil['double'] = true; w.players.forEach((p, i) => { p.x = (tr + 1) * 32 + i * 20; p.y = (w.L.boss!.y + 1) * 32 - 26; p.safeX = p.x; p.safeY = p.y; }); w.respawn = { x: (tr - 1) * 32, y: (w.L.boss!.y + 1) * 32 }; }
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
