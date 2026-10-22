// Сервер среды RL: держит N параллельных боёв в worker_threads и говорит с Python бинарным протоколом по stdio.
//   запуск: npm run rl:env -- --boss misha2 --envs 64 --workers 12 [--max-sec 150] [--lag 3] [--reward '{"hurt":1}'] [--record 1] [--autoreset 1] [--seed 1]
// Кадр запроса:  u32 команда, u32 длина, данные.  Команды: 1 RESET(N×u32 зёрна), 2 STEP(N×N_HEADS u8), 3 REC(u32 номер среды) → u32 длина + JSON .ttrec, 4 QUIT, 5 CFG(JSON).
// Ответ на RESET/STEP: obs f32[N×OBS], reward f32[N], done u8[N] (с добивкой до 4), info f32[N×INFO]. При старте сервер шлёт u32[4]: OBS, N_HEADS, INFO, N.
// done: 0 идёт, 1 победа, 2 обрыв нити, 3 таймаут. При autoreset после конца боя в obs лежит уже первое наблюдение нового боя.
import { Worker } from 'node:worker_threads';
import pkg from '../../package.json' with { type: 'json' };
import { N_HEADS } from '../../src/agent/actions';
import { OBS_DIM } from '../../src/agent/obs';
import { INFO_DIM, type EnvCfg } from './env';

const argv = process.argv.slice(2);
const opt = (n: string, d?: string): string | undefined => { const i = argv.indexOf('--' + n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const N = +(opt('envs', '16')!), K = Math.max(1, Math.min(+(opt('workers', '4')!), N));
const cfg: Partial<EnvCfg> = { boss: opt('boss', 'misha2') as EnvCfg['boss'], maxSec: +(opt('max-sec', '150')!), lag: +(opt('lag', '3')!), record: opt('record', '0') === '1', ver: pkg.version, label: opt('label', 'Нейросеть')!, reward: JSON.parse(opt('reward', '{}')!) };
const autoreset = opt('autoreset', '1') === '1', seedBase = +(opt('seed', '1')!) >>> 0;

const sab = (bytes: number): SharedArrayBuffer => new SharedArrayBuffer(bytes);
const doneBytes = Math.ceil(N / 4) * 4;
const bufs = { obs: sab(N * OBS_DIM * 4), rew: sab(N * 4), done: sab(doneBytes), info: sab(N * INFO_DIM * 4), act: sab(N * N_HEADS), seeds: sab(N * 4) };
const obsB = Buffer.from(bufs.obs), rewB = Buffer.from(bufs.rew), doneB = Buffer.from(bufs.done), infoB = Buffer.from(bufs.info), actB = Buffer.from(bufs.act), seedsB = Buffer.from(bufs.seeds);

const workers: Worker[] = [], owner: number[] = [];
const per = Math.ceil(N / K);
const ready: Promise<void>[] = [];
for (let k = 0; k < K; k++) {
  const lo = k * per, hi = Math.min(N, lo + per);
  if (lo >= hi) break;
  for (let i = lo; i < hi; i++) owner[i] = workers.length;
  const w = new Worker(new URL('./worker.ts', import.meta.url), { workerData: { lo, hi, n: N, cfg, autoreset, seedBase, bufs } });
  ready.push(new Promise((res) => w.once('message', () => res())));
  w.on('error', (e) => { console.error('worker error', e); process.exit(2); });
  workers.push(w);
}

async function call(msgs: { w: number; m: object }[]): Promise<{ ok: boolean; err?: string; rec?: string }[]> {
  const out = await Promise.all(msgs.map(({ w, m }) => new Promise<{ ok: boolean; err?: string; rec?: string }>((res) => {
    const h = (r: { ok?: boolean; err?: string; rec?: string }): void => { if ('ok' in r) { workers[w]!.off('message', h); res(r as { ok: boolean }); } };
    workers[w]!.on('message', h); workers[w]!.postMessage(m);
  })));
  for (const r of out) if (!r.ok) { console.error(r.err); process.exit(3); }
  return out;
}
const reply = (extra?: Buffer): void => { process.stdout.write(Buffer.concat([obsB, rewB, doneB, infoB, ...(extra ? [extra] : [])])); };

await Promise.all(ready);
const hello = Buffer.alloc(16); hello.writeUInt32LE(OBS_DIM, 0); hello.writeUInt32LE(N_HEADS, 4); hello.writeUInt32LE(INFO_DIM, 8); hello.writeUInt32LE(N, 12);
process.stdout.write(hello);

let buf = Buffer.alloc(0), busy = false;
async function handle(cmd: number, data: Buffer): Promise<void> {
  const all = workers.map((_, w) => ({ w, m: {} as object }));
  if (cmd === 1) { seedsB.fill(0); if (data.length >= N * 4) data.copy(seedsB, 0, 0, N * 4); await call(all.map((a) => ({ ...a, m: { cmd: 'reset' } }))); reply(); }
  else if (cmd === 2) { data.copy(actB, 0, 0, N * N_HEADS); await call(all.map((a) => ({ ...a, m: { cmd: 'step' } }))); reply(); }
  else if (cmd === 3) {
    const i = data.readUInt32LE(0), r = await call([{ w: owner[i]!, m: { cmd: 'rec', i } }]);
    const s = Buffer.from(r[0]!.rec ?? '', 'utf8'), h = Buffer.alloc(4); h.writeUInt32LE(s.length, 0); process.stdout.write(Buffer.concat([h, s]));
  } else if (cmd === 5) { await call(all.map((a) => ({ ...a, m: { cmd: 'cfg', cfg: JSON.parse(data.toString('utf8')) } }))); process.stdout.write(Buffer.alloc(4)); }
  else if (cmd === 4) process.exit(0);
}
async function pump(): Promise<void> {
  if (busy) return;
  busy = true;
  while (buf.length >= 8) {
    const cmd = buf.readUInt32LE(0), len = buf.readUInt32LE(4);
    if (buf.length < 8 + len) break;
    const data = Buffer.from(buf.subarray(8, 8 + len)); buf = buf.subarray(8 + len);
    await handle(cmd, data);
  }
  busy = false;
}
process.stdin.on('data', (d: Buffer) => { buf = Buffer.concat([buf, d]); void pump(); });
process.stdin.on('end', () => process.exit(0));
