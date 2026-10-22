// Автозагрузка содержимого в Node (tsx): чтение папок src/content/<вид>/ и динамический импорт файлов.
// Подключается ключом --import ./tools/ldtk-register.mjs до любого модуля ядра (в потоках — из их файла входа).
import { KINDS, registerAll } from './load';

const fs = process.getBuiltinModule('node:fs'), url = process.getBuiltinModule('node:url'), path = process.getBuiltinModule('node:path');
const root = url.fileURLToPath(new URL('.', import.meta.url));
const by: Record<string, Record<string, unknown>> = {};
for (const k of KINDS) {
  const dir = path.join(root, k.dir); if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => /\.(ts|mjs|js)$/.test(x) && !/\.test\./.test(x) && !x.startsWith('_') && !x.endsWith('.d.ts')).sort()) {
    (by[k.dir] ??= {})[f] = await import(url.pathToFileURL(path.join(dir, f)).href);
  }
}
registerAll(by);
