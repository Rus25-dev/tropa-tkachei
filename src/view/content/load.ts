// Регистрация найденных файлов отрисовки и звуков по папкам (общая для Vite и для проверки tools/content-check.ts в Node).
import { collectDefaults, type Def, type Registry } from '../../core/plugin/registry';
import { abilityViewReg, arenaViewReg, enemyViewReg, projViewReg, soundReg, toolViewReg, weaponViewReg } from './regs';

/** вид: папка src/view/content/<dir> и реестр */
export const VIEW_KINDS: { dir: string; reg: Registry<Def> }[] = [
  { dir: 'weapons', reg: weaponViewReg as unknown as Registry<Def> },
  { dir: 'tools', reg: toolViewReg as unknown as Registry<Def> },
  { dir: 'abilities', reg: abilityViewReg as unknown as Registry<Def> },
  { dir: 'enemies', reg: enemyViewReg as unknown as Registry<Def> },
  { dir: 'projectiles', reg: projViewReg as unknown as Registry<Def> },
  { dir: 'sounds', reg: soundReg as unknown as Registry<Def> },
  { dir: 'arenas', reg: arenaViewReg as unknown as Registry<Def> },
];
let loaded = false;
/** зарегистрировать модули, разложенные по папкам: { weapons: { путь: модуль }, … }; вторая загрузка ничего не делает */
export function registerViews(by: Record<string, Record<string, unknown>>): void {
  if (loaded) return;
  for (const k of VIEW_KINDS) for (const d of collectDefaults<Def>(by[k.dir] ?? {})) if (!k.reg.has(d.id)) k.reg.define(d);
  loaded = true;
}
