// Проверка уровней:  npm run levels:check
// 1) перегенерирует levels/*.ldtk во временную папку и сравнивает с файлами в levels/ (ловит «ручную» порчу и забытую перегенерацию);
// 2) запускает тесты уровней (загрузчик против оракула и против кода v1.8).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'tt-levels-'));
let ok = true;
try {
  const gen = spawnSync(process.execPath, [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(root, 'tools', 'ldtk-export.ts'), '--out', tmp], { stdio: 'inherit' });
  if (gen.status !== 0) throw new Error('Генератор уровней завершился с ошибкой');
  for (const f of ['tropa.ldtk']) {
    const a = readFileSync(join(root, 'levels', f), 'utf8').replaceAll('\r\n', '\n'), b =readFileSync(join(tmp, f), 'utf8');
    if (a === b) console.log(`levels/${f}: совпадает с перегенерацией`);
    else { ok = false; console.error(`levels/${f}: ОТЛИЧАЕТСЯ от перегенерации (файл правили вручную или забыли \`npx tsx tools/ldtk-export.ts\`)`); }
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
const t = spawnSync(process.execPath, [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'tests/unit/levels.test.ts'], { stdio: 'inherit', cwd: root });
process.exit(ok && t.status === 0 ? 0 : 1);
