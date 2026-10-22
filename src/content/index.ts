// Автозагрузка содержимого: каждая папка src/content/<вид>/ — вещи одного вида, по файлу на вещь (default-экспорт описания
// или массив описаний). Новый файл подключается сам: в Vite и Vitest — через import.meta.glob (eager), в Node-инструментах
// (tsx: бот, фаззер, sim, boss:*) — чтением папки. Порядок вещей задаёт поле order описания, а не имя файла.
// Подключается последним импортом src/core/world.ts (и в настройке Vitest), поэтому к созданию мира реестры уже заполнены.
import { collectDefaults, type Def, type Registry } from '../core/plugin/registry';
import { weaponReg } from '../core/plugin/regs';

/** вид содержимого: папка и реестр */
const KINDS: { dir: string; reg: Registry<Def> }[] = [
  { dir: 'weapons', reg: weaponReg as unknown as Registry<Def> },
];

let loaded = false;
/** уже загружено (защита от повторной регистрации при повторном импорте) */
export const contentLoaded = (): boolean => loaded;

function viaVite(): Record<string, Record<string, unknown>> | null {
  try {
    const all = import.meta.glob(['./*/*.ts', '!./**/*.test.ts', '!./**/_*.ts'], { eager: true });
    const by: Record<string, Record<string, unknown>> = {};
    for (const [p, m] of Object.entries(all)) { const dir = p.split('/')[1]!; (by[dir] ??= {})[p] = m; }
    return by;
  } catch { return null; } // вне Vite import.meta.glob не существует
}

async function viaNode(): Promise<Record<string, Record<string, unknown>>> {
  const fs = process.getBuiltinModule('node:fs'), url = process.getBuiltinModule('node:url'), path = process.getBuiltinModule('node:path');
  const root = url.fileURLToPath(import.meta.url.replace(/[^/]*$/, ''));
  const by: Record<string, Record<string, unknown>> = {};
  for (const k of KINDS) {
    const dir = path.join(root, k.dir); if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /\.(ts|mjs|js)$/.test(x) && !/\.test\./.test(x) && !x.startsWith('_') && !x.endsWith('.d.ts')).sort()) {
      (by[k.dir] ??= {})[f] = await import(/* @vite-ignore */ url.pathToFileURL(path.join(dir, f)).href);
    }
  }
  return by;
}

if (!loaded) {
  const by = viaVite() ?? (await viaNode());
  for (const k of KINDS) for (const d of collectDefaults<Def>(by[k.dir] ?? {})) if (!k.reg.has(d.id)) k.reg.define(d);
  loaded = true;
}
