// Бой нейросети-игрока на ядре в чистом Node тем же кодом, что и в игре (src/agent/agent.ts): проверка экспорта весов и итоговая оценка.
import { feedInput } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { Agent } from '../../src/agent/agent';
import type { AgentModel, PersonaPlay } from '../../src/agent/policy';

export interface AgentJob { boss: string; seed: number; model: AgentModel; play: PersonaPlay; agentSeed?: number; maxSec: number }
export interface AgentResult { won: boolean; died: boolean; timeout: boolean; sec: number; hpLost: number; bossFrac: number }

export function fightAgent(j: AgentJob): AgentResult {
  const w = new World({ seed: j.seed, mode: 'bosstest', boss: j.boss, players: 1 });
  const ag = new Agent(j.model, j.play, j.agentSeed ?? j.seed * 31 + 7);
  const getBoss = () => w.testBoss();
  let frame = 0, started = -1;
  const hp0 = w.players[0]!.hp;
  for (;;) {
    const b = getBoss();
    if (started < 0 && b && !['intro', 'sleep', 'roar'].includes(b.state)) started = frame;
    feedInput(w, [ag.tick(w)]);
    w.tick(); frame++;
    const fight = started >= 0 ? (frame - started) / 60 : 0;
    const bb = getBoss();
    const frac = bb ? Math.max(0, bb.hp) / bb.maxHp : 1;
    const res = (won: boolean, died: boolean, timeout: boolean): AgentResult => ({ won, died, timeout, sec: fight, hpLost: hp0 - w.players[0]!.hp, bossFrac: frac });
    if (w.wiping) return res(false, true, false);
    if (bb && ['dead', 'gone'].includes(bb.state) && started >= 0) return res(true, false, false);
    if (fight > j.maxSec || frame > (j.maxSec + 30) * 60) return res(false, false, true);
  }
}
