import { parentPort } from 'node:worker_threads';
import { fightAgent, type AgentJob } from './agent-fight';
if (!parentPort) throw new Error('только как поток');
const port = parentPort;
port.on('message', (m: { i: number; job: AgentJob }) => {
  let r; try { r = fightAgent(m.job); } catch (e) { r = { error: String((e as Error)?.stack ?? e) }; }
  port.postMessage({ i: m.i, r });
});
port.postMessage({ ready: true });
