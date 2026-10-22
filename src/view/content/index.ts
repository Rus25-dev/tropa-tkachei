// Автозагрузка отрисовки и звуков содержимого: src/view/content/<вид>/<id>.ts (default-экспорт описания или массива описаний).
// Вид работает в Vite/Vitest, поэтому здесь import.meta.glob (eager); проверка tools/content-check.ts читает папки сама.
import { registerViews } from './load';

const all = import.meta.glob(['./*/*.ts', '!./**/*.test.ts', '!./**/_*.ts'], { eager: true });
const by: Record<string, Record<string, unknown>> = {};
for (const [p, m] of Object.entries(all)) (by[p.split('/')[1]!] ??= {})[p] = m;
registerViews(by);
