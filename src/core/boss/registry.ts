// Реестр боссов на данных. Босс добавляется ОДНИМ файлом data/bosses/<id>.json — общих списков нет, правок чужих файлов тоже:
//   · в Vite и Vitest файлы находит import.meta.glob (eager), в Node-инструментах (tsx: sim, bot, boss:check, boss:nohit) — чтение папки data/bosses;
//   · каждый файл проверяется по схеме и правилам честности при загрузке ядра (ошибка в файле = ошибка запуска, с понятным текстом);
//   · карточки Босс-теста, список для гонок и дуэли строятся из реестра (catalog.ts) — отдельно ничего не регистрируется.
import rulesRaw from '../../../data/bosses/rules.json' with { type: 'json' };
import { parseBossDef, parseRules, type BossDef, type Rules } from './schema';

export const BOSS_RULES: Rules = parseRules(rulesRaw);
const DEFS: Record<string, BossDef> = {};
const RAWS: Record<string, unknown> = {};
/** Добавить босса (тесты, фикстуры, инструменты): проверяет по схеме и правилам честности. Файлы data/bosses подключаются сами. */
export function registerBoss(raw: unknown): BossDef {
  const d = parseBossDef(raw, BOSS_RULES); DEFS[d.id] = d; RAWS[d.id] = raw; return d;
}
/** Убрать босса из реестра (тесты) */
export function unregisterBoss(id: string): void { delete DEFS[id]; delete RAWS[id]; }
/** «Сырое» определение босса, как оно было подано (копию с изменениями делают инструменты: boss:cheese и другие) */
export const bossRaw = (id: string): unknown => (RAWS[id] === undefined ? undefined : structuredClone(RAWS[id]));

// ---------- автообнаружение data/bosses/*.json ----------
function viaVite(): unknown[] | null {
  try {
    const m = import.meta.glob<unknown>(['../../../data/bosses/*.json', '!../../../data/bosses/rules.json'], { eager: true, import: 'default' });
    return Object.keys(m).sort().map((k) => m[k]);
  } catch { return null; } // вне Vite import.meta.glob не существует
}
/** Файлы боссов из папки (Node): по имени файла, без rules.json */
export function readBossFiles(dir: string): unknown[] {
  const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'rules.json').sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as unknown);
}
function viaNode(): unknown[] {
  const url = process.getBuiltinModule('node:url');
  return readBossFiles(url.fileURLToPath(import.meta.url.replace(/src\/core\/boss\/[^/]*$/, 'data/bosses/')));
}
for (const raw of viaVite() ?? viaNode()) registerBoss(raw);

export const bossDef = (id: string): BossDef | undefined => DEFS[id];
/** все боссы на данных, включая dev и служебных */
export const dataBossIds = (): string[] => Object.keys(DEFS);
/** id босса-манекена для карточки разработчика (?dev=1) */
export const DEV_BOSS_ID = 'dummy';
