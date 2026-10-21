// Нейросеть-игрок в игре: ?agent=<имя пака из agents/ | адрес JSON>&persona=<характер>[&aseed=N].
// Вместо клавиатуры ввод героя на каждый тик даёт src/agent/agent.ts (обученная политика, см. ml/README.md → «Нейросеть-игрок (RL)»).
// Годится для боёв с боссами (босс-тест, арены Корнематки/Миши/Владика/Тимы, забег «Боссы» и гонка в этой категории);
// на «Тропе целиком» вне арен агент стоит: дистанции модель не обучена.
import { feedInput } from '../core/fuzzinput';
import type { Session } from '../core/session';
import type { World } from '../core/world';
import { Agent, DEFAULT_PLAY, modelFor } from '../agent/agent';
import type { AgentPack, PersonaPlay } from '../agent/policy';

export interface AgentCtl {
  pack: AgentPack; persona: string; play: PersonaPlay;
  attach(s: Session): void;
  /** счётчик принятых решений (проверки и e2e) */
  stats: { worlds: number; decisions: number; boss: string };
}

const hashStr = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export async function initAgent(q: URLSearchParams = new URLSearchParams(location.search)): Promise<AgentCtl | null> {
  const name = q.get('agent');
  if (!name) return null;
  const url = /[/:]/.test(name) ? name : `./agents/${name}.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`не загрузился агент ${url}: ${r.status}`);
  const pack = (await r.json()) as AgentPack;
  if (pack.format !== 'tt-agent') throw new Error('это не файл агента');
  const persona = q.get('persona') ?? 'average';
  const base = pack.personas[persona] ?? pack.personas['average'] ?? DEFAULT_PLAY;
  const play: PersonaPlay = { ...base, ...(q.get('atemp') ? { temperature: Number(q.get('atemp')) } : {}) };
  const extra = Number(q.get('aseed') ?? 0) >>> 0;
  const stats = { worlds: 0, decisions: 0, boss: '' };
  const ctl: AgentCtl = {
    pack, persona, play, stats,
    attach(s: Session): void {
      let cur: World | null = null, agent: Agent | null = null;
      s.tickHook = (w: World): void => {
        if (w !== cur) {
          cur = w; agent = null;
          const m = modelFor(pack, w);
          if (m) { agent = new Agent(m, play, (w.seed ^ hashStr(persona) ^ Math.imul(extra, 2654435761)) >>> 0); stats.worlds++; stats.boss = m.boss; }
        }
        if (!agent) return;
        feedInput(w, [agent.tick(w)]);
        stats.decisions = agent.decisions;
      };
    },
  };
  return ctl;
}
