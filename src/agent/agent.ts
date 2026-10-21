// Нейросеть-игрок как источник ввода: каждый тик отдаёт кадр ввода героя. Решение — раз в SKIP тиков, мир (босс, снаряды) виден с задержкой
// модели (lag решений), как при обучении (tools/rl/env.ts). Детерминирован: тот же мир (зерно), та же модель и характер → тот же ввод.
import type { Inp } from '../core/types';
import type { World } from '../core/world';
import { actionToInp, N_HEADS, SKIP } from './actions';
import { HERO_DIM, OBS_DIM, WORLD_DIM, heroObs, worldObs } from './obs';
import { Policy, mulberry32, type AgentModel, type AgentPack, type PersonaPlay } from './policy';

const INTRO = new Set(['intro', 'sleep', 'roar']);
const RING = 8;

export const DEFAULT_PLAY: PersonaPlay = { temperature: 1.5, stick: 0.3, atkGap: 0 };

/** Выбор модели по миру: босс-тест и истории (Корнематка) */
export function modelFor(pack: AgentPack, w: World): AgentModel | null {
  const key = w.misha ? 'misha' : w.vladik ? 'vladik' : w.tima ? 'tima' : w.boss ? 'korne' : '';
  return pack.models[key] ?? null;
}

export class Agent {
  readonly policy: Policy;
  private obs: Float32Array; private ring: Float32Array[] = []; private ri = 0;
  private sub = 0; private started = false;
  private act = new Uint8Array(N_HEADS); private prev = new Uint8Array(N_HEADS); private hasPrev = false; private since = 99;
  private rng: () => number;
  private lag: number; private temp: number;
  /** сколько решений принято (для отладки и тестов) */
  decisions = 0;
  constructor(model: AgentModel, readonly play: PersonaPlay, seed: number, readonly idx = 0) {
    this.policy = new Policy(model);
    this.obs = new Float32Array(OBS_DIM);
    for (let i = 0; i < RING; i++) this.ring.push(new Float32Array(WORLD_DIM));
    this.rng = mulberry32((seed >>> 0) || 1);
    this.lag = Math.min(RING - 1, play.playLag ?? model.lag);
    this.temp = play.bossTemp?.[model.boss] ?? play.temperature;
  }

  /** Кадр ввода на текущий тик (вызывать перед w.tick()). */
  tick(w: World): Inp {
    const b = w.testBoss() ?? w.boss;
    const p = w.players[this.idx];
    if (!b || !p || p.downed || p.remote || INTRO.has(b.state) || ['dead', 'gone'].includes(b.state)) { this.started = false; this.sub = 0; return {}; }
    if (!this.started) { this.started = true; this.sub = 0; this.hasPrev = false; this.since = 99; }
    if (this.sub === 0) this.decide(w);
    const inp = actionToInp(this.act, this.sub);
    this.sub = (this.sub + 1) % SKIP;
    return inp;
  }
  private decide(w: World): void {
    const first = this.decisions === 0 || !this.hasPrev;
    if (first) { worldObs(w, this.idx, this.ring[0]!, 0); for (let i = 1; i < RING; i++) this.ring[i]!.set(this.ring[0]!); this.ri = 0; }
    else { this.ri = (this.ri + 1) % RING; worldObs(w, this.idx, this.ring[this.ri]!, 0); }
    heroObs(w, this.idx, this.obs, 0);
    this.obs.set(this.ring[(this.ri - this.lag + RING * 2) % RING]!, HERO_DIM);
    const logits = this.policy.forward(this.obs);
    this.policy.sample(logits, this.temp, this.rng, this.act);
    if (this.play.stick > 0 && this.hasPrev && this.rng() < this.play.stick) for (let h = 0; h < 3; h++) this.act[h] = this.prev[h]!; // «липкими» бывают движение, вертикаль и прыжок; рывок и действие — всегда свежие решения
    if (this.play.atkGap > 0 && this.act[4] === 1 && this.since < this.play.atkGap) this.act[4] = 0;
    this.since = this.act[4] === 1 ? 0 : this.since + 1;
    this.prev.set(this.act); this.hasPrev = true; this.decisions++;
  }
}
