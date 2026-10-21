// Поток-исполнитель среды RL: владеет диапазоном боёв [lo, hi) и пишет результаты в общую память (SharedArrayBuffer).
import { parentPort, workerData } from 'node:worker_threads';
import { N_HEADS } from '../../src/agent/actions';
import { OBS_DIM } from '../../src/agent/obs';
import { Done, INFO_DIM, RlEnv, type EnvCfg } from './env';

if (!parentPort) throw new Error('worker.ts запускается только как поток');
const port = parentPort;
const { lo, hi, n, cfg, autoreset, seedBase, bufs } = workerData as { lo: number; hi: number; n: number; cfg: Partial<EnvCfg>; autoreset: boolean; seedBase: number; bufs: Record<string, SharedArrayBuffer> };
const obs = new Float32Array(bufs['obs']!), rew = new Float32Array(bufs['rew']!), done = new Uint8Array(bufs['done']!), info = new Float32Array(bufs['info']!);
const act = new Uint8Array(bufs['act']!), seeds = new Uint32Array(bufs['seeds']!);
void n;
const envs: RlEnv[] = [];
const fin: boolean[] = [], ep: number[] = [];
for (let i = lo; i < hi; i++) { envs.push(new RlEnv(cfg)); fin.push(true); ep.push(0); }
// зерно k-го боя i-й среды при автосбросе: разные зёрна, чтобы агент не заучивал один бой
const autoSeed = (i: number, k: number): number => { let x = (seedBase + Math.imul(i + 1, 0x9e3779b1) + Math.imul(k + 1, 0x85ebca6b)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12; return x >>> 0; };

function resetAll(): void {
  for (let i = lo; i < hi; i++) {
    const e = envs[i - lo]!; ep[i - lo] = 0; fin[i - lo] = false;
    e.reset(seeds[i] || autoSeed(i, 0), obs, i * OBS_DIM);
    rew[i] = 0; done[i] = 0; info.fill(0, i * INFO_DIM, (i + 1) * INFO_DIM);
  }
}
function stepAll(): void {
  for (let i = lo; i < hi; i++) {
    const e = envs[i - lo]!;
    if (fin[i - lo]) { rew[i] = 0; done[i] = 0; continue; }
    const res = e.step(act.subarray(i * N_HEADS, (i + 1) * N_HEADS), obs, i * OBS_DIM);
    rew[i] = res.r; done[i] = res.done;
    if (res.done !== Done.No) {
      e.info(res.done, info, i * INFO_DIM);
      if (autoreset) { ep[i - lo]!++; e.reset(autoSeed(i, ep[i - lo]!), obs, i * OBS_DIM); } else fin[i - lo] = true;
    }
  }
}
port.on('message', (m: { cmd: string; i?: number; cfg?: Partial<EnvCfg> }) => {
  try {
    if (m.cmd === 'reset') { resetAll(); port.postMessage({ ok: true }); }
    else if (m.cmd === 'step') { stepAll(); port.postMessage({ ok: true }); }
    else if (m.cmd === 'rec') { const t = envs[m.i! - lo]?.ttrec; port.postMessage({ ok: true, rec: t ? JSON.stringify(t) : '' }); }
    else if (m.cmd === 'cfg') { for (const e of envs) { Object.assign(e.cfg, m.cfg, { reward: { ...e.cfg.reward, ...(m.cfg?.reward ?? {}) } }); } port.postMessage({ ok: true }); }
  } catch (e) { port.postMessage({ ok: false, err: String((e as Error)?.stack ?? e) }); }
});
port.postMessage({ ready: true });
