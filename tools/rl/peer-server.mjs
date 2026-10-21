// Локальный сервер сигналов PeerJS для гонок агентов без интернета: node tools/rl/peer-server.mjs [порт]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PeerServer } = require('peer');
const port = +(process.argv[2] ?? 9166);
PeerServer({ port, path: '/', corsOptions: { origin: true } });
console.log('PeerJS на порту ' + port);
