// Автозагрузка содержимого в Vite и Vitest: каждая папка src/content/<вид>/ — вещи одного вида, по файлу на вещь (default-экспорт
// описания или массив описаний). Новый файл подключается сам через import.meta.glob (eager, то есть обычные статические импорты).
// Порядок вещей задаёт поле order описания, а не имя файла. Модуль импортирует src/core/world.ts, поэтому к созданию мира реестры заполнены.
// В Node-инструментах (tsx: бот, фаззер, sim, boss:*) import.meta.glob нет: там содержимое загружает src/content/node.ts,
// который подключается раньше всего ключом --import ./tools/ldtk-register.mjs (так нет циклов с ожиданием верхнего уровня).
import { registerAll } from './load';

function viaVite(): Record<string, Record<string, unknown>> | null {
  try {
    const all = import.meta.glob(['./*/*.ts', '!./**/*.test.ts', '!./**/_*.ts'], { eager: true });
    const by: Record<string, Record<string, unknown>> = {};
    for (const [p, m] of Object.entries(all)) { const dir = p.split('/')[1]!; (by[dir] ??= {})[p] = m; }
    return by;
  } catch { return null; } // вне Vite import.meta.glob не существует
}
const by = viaVite();
if (by) registerAll(by);
