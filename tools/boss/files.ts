// Файлы боссов на данных: чтение data/bosses/*.json для инструментов и тестов (правила rules.json читаются отдельно).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildArena } from '../../src/core/levels';
import '../../src/content';
import { arenaReg } from '../../src/core/plugin/regs';
import { T } from '../../src/core/balance';
import type { ArenaInfo } from '../../src/core/boss/validate';

export const BOSS_DIR = fileURLToPath(new URL('../../data/bosses/', import.meta.url));
export interface BossFile { file: string; id: string; raw: unknown }
/** Все боссы из data/bosses (кроме rules.json), по имени файла. */
export function loadBossFiles(only?: string): BossFile[] {
  return readdirSync(BOSS_DIR).filter((f) => f.endsWith('.json') && f !== 'rules.json').sort().map((file) => {
    const raw = JSON.parse(readFileSync(BOSS_DIR + file, 'utf8')) as { id?: string };
    return { file, id: raw.id ?? file.replace(/\.json$/, ''), raw };
  }).filter((b) => !only || b.id === only);
}
/** Правила честности (data/bosses/rules.json), прочитанные с диска. */
export const readRulesRaw = (): unknown => JSON.parse(readFileSync(BOSS_DIR + 'rules.json', 'utf8'));
/** Внутренний размер арены босса, px (без боковых стен, потолка и пола): раздел arena — строка или { level, ents }. */
export function arenaInfo(arena: string | { level: string } | undefined): ArenaInfo | undefined {
  const level = typeof arena === 'string' ? arena : arena?.level;
  if (!level || !arenaReg.has(level)) return undefined;
  const L = buildArena(level), mid = Math.floor(L.W / 2);
  let rows = 0; for (let y = 0; y < L.H; y++) if (L.grid[y]![mid] !== 1) rows++; // свободные клетки средней колонки: от потолка до пола
  return { w: (L.W - 2) * T, h: rows * T };
}
