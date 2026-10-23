// Рисовальщики боссов на данных, найденные сами: src/view/draw/boss/<id>.ts с default-экспортом { имя: функция }.
//   base                — тело босса вместо универсального «манекена»;
//   <form.draw>         — вариант тела для формы фазы (имя из form.draw в JSON);
//   creature:<id>       — вид существа-приспешника (id из раздела creatures).
// Телеграф (контур замаха, коробки ударов, окно наказания) и уязвимые точки рисует общий код поверх любого тела, поэтому честность сигнала от арта не зависит.
import type { Boss } from '../../core/types';
import type { World } from '../../core/world';
import type { DState } from '../../core/boss/exec';
import type { FormEff } from '../../core/boss/form';
import type { BossDef } from '../../core/boss/schema';
import type { G } from './common';

/** Контекст отрисовки тела: определение, состояние исполнителя, тело фазы, прогресс замаха 0…1 и цвет сигнала */
export interface DrawCtx { spriteBody?: boolean; def: BossDef; d: DState; e: FormEff; /** замах идёт */ tell: boolean; k: number; /** цвет сигнала замаха */ rgb: number; /** наклон вперёд при ударе, px */ lean: number }
export type BossDrawFn = (w: World, b: Boss, g: G, now: number, c: DrawCtx) => void;
/** существо: прямоугольник тела, данные e.m (MinionRt), цвет, прозрачность (бледнеет перед исчезновением), идёт ли замах и его цвет */
export type CreatureDrawFn = (e: { x: number; y: number; w: number; h: number; face: number; flash: number; hp: number; m: Record<string, unknown> }, g: G, now: number, c: { color: number; alpha: number; tell: boolean; rgb: number }) => void;
export type BossDrawSet = Record<string, BossDrawFn | CreatureDrawFn>;

/** Разложить найденные модули по id босса (имя файла без расширения). Чистая функция: годится и для теста. */
export function indexDrawers(mods: Record<string, BossDrawSet | undefined>): Map<string, BossDrawSet> {
  const out = new Map<string, BossDrawSet>();
  for (const [p, m] of Object.entries(mods)) if (m && typeof m === 'object') out.set((p.split('/').pop() ?? p).replace(/\.ts$/, ''), m);
  return out;
}
const BY_ID = indexDrawers(import.meta.glob<BossDrawSet>('./boss/*.ts', { eager: true, import: 'default' }));

/** рисовальщик тела босса: вариант формы, иначе base, иначе undefined (рисует универсальный) */
export function bodyDrawer(bossId: string, variant: string | null): BossDrawFn | undefined {
  const set = BY_ID.get(bossId); if (!set) return undefined;
  return (set[variant ?? 'base'] ?? set['base']) as BossDrawFn | undefined;
}
export function creatureDrawer(bossId: string, creatureId: string): CreatureDrawFn | undefined {
  return BY_ID.get(bossId)?.['creature:' + creatureId] as CreatureDrawFn | undefined;
}
