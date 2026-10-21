// Поток-исполнитель боёв бота (см. pool.ts). Запускается с теми же ключами Node, что и родитель (tsx, регистрация LDtk).
import { parentPort, workerData } from 'node:worker_threads';
import { applyBalanceOverride } from '../../src/core/balance';
import { failed, runFight, type FightJob } from './fight';

if (!parentPort) throw new Error('worker.ts запускается только как поток');
const port = parentPort;
if (workerData?.balance) applyBalanceOverride(workerData.balance);
port.on('message', (m: { i: number; job: FightJob }) => {
  let r;
  try { r = runFight(m.job); } catch (e) { r = failed(e); }
  port.postMessage({ i: m.i, r });
});
port.postMessage({ ready: true });
