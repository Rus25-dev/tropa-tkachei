// Оценка экспортированной модели движком игры в Node (тот же код, что в браузере) на зёрнах таблицы бота.
//   npm run rl:eval -- --pack public/agents/tkachi.json --boss misha [--persona average] [--fights 200] [--skill 0.6] [--seed 1] [--workers 4] [--temp 1.5 --stick 0.3 --atk-gap 0]
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import type { AgentPack } from '../../src/agent/policy';
import { bootstrapCI, mean, median, pct, wilson } from '../bot/stats';
import type { AgentJob, AgentResult } from './agent-fight';

const argv = process.argv.slice(2);
const opt = (n: string, d?: string): string | undefined => { const i = argv.indexOf('--' + n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const pack = JSON.parse(readFileSync(opt('pack', 'public/agents/tkachi.json')!, 'utf8')) as AgentPack;
const boss = opt('boss', 'misha') as AgentJob['boss'];
const model = pack.models[boss]; if (!model) throw new Error('В паке нет модели ' + boss + ': ' + Object.keys(pack.models).join(', '));
const persona = pack.personas[opt('persona', 'average')!]!;
const play = { ...persona, ...(opt('temp') ? { bossTemp: {} } : {}), ...(opt('temp') ? { temperature: +opt('temp')! } : {}), ...(opt('stick') ? { stick: +opt('stick')! } : {}), ...(opt('atk-gap') ? { atkGap: +opt('atk-gap')! } : {}), ...(opt('lag') ? { playLag: +opt('lag')! } : {}) };
const fights = +(opt('fights', '100')!), skill = +(opt('skill', '0.6')!), seed0 = +(opt('seed', '1')!), K = +(opt('workers', '4')!);
const jobs: AgentJob[] = [];
for (let r = 0; r < fights; r++) jobs.push({ boss, seed: seed0 + r * 13 + Math.round(skill * 100), model, play, maxSec: +(opt('max', '240')!) });
const results: AgentResult[] = new Array(jobs.length);
await new Promise<void>((resolve, reject) => {
  let next = 0, done = 0;
  for (let k = 0; k < Math.min(K, jobs.length); k++) {
    const w = new Worker(new URL('./agent-worker.ts', import.meta.url));
    const feed = (): void => { if (next < jobs.length) { const i = next++; w.postMessage({ i, job: jobs[i] }); } else void w.terminate(); };
    w.on('message', (m: { i?: number; r?: AgentResult & { error?: string }; ready?: boolean }) => {
      if (m.ready) return feed();
      if (m.r?.error) return reject(new Error(m.r.error));
      results[m.i!] = m.r!; if (++done === jobs.length) resolve(); else feed();
    });
    w.on('error', reject);
  }
});
const wins = results.filter((r) => r.won), wt = wins.map((r) => r.sec);
const [lo, hi] = wilson(wins.length, results.length), [tlo, thi] = bootstrapCI(wt, { seed: 5 });
const out = { boss, persona: opt('persona', 'average'), play, fights, skillSeeds: skill, wins: wins.length, winRate: wins.length / fights, winCI: [lo, hi], winTime: mean(wt), winTimeCI: [tlo, thi], median: median(wt),
  died: results.filter((r) => r.died).length, timeouts: results.filter((r) => r.timeout).length, hpLost: mean(results.map((r) => r.hpLost)) };
if (argv.includes('--json')) console.log(JSON.stringify(out));
else console.log(`${boss} ${out.persona} T=${play.temperature} stick=${play.stick} gap=${play.atkGap}: побед ${wins.length}/${fights} = ${pct(out.winRate)} [${pct(lo)}–${pct(hi)}], время победы ${out.winTime.toFixed(0)} с [${tlo.toFixed(0)}–${thi.toFixed(0)}], медиана ${out.median.toFixed(0)}, обрывов нити ${out.died}, потеряно HP ${out.hpLost.toFixed(1)}`);
process.exit(0);
