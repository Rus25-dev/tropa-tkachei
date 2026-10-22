// Регистрация найденных файлов содержимого по папкам (общая для загрузки в Vite и в Node).
import { collectDefaults, type Def, type Registry } from '../core/plugin/registry';
import { charmReg, moveReg, toolReg, weaponReg } from '../core/plugin/regs';

/** вид содержимого: папка src/content/<dir> и реестр */
export const KINDS: { dir: string; reg: Registry<Def> }[] = [
  { dir: 'weapons', reg: weaponReg as unknown as Registry<Def> },
  { dir: 'tools', reg: toolReg as unknown as Registry<Def> },
  { dir: 'charms', reg: charmReg as unknown as Registry<Def> },
  { dir: 'abilities', reg: moveReg as unknown as Registry<Def> },
];
let loaded = false;
/** уже загружено (вторая загрузка — ничего не делает) */
export const contentLoaded = (): boolean => loaded;
/** зарегистрировать модули, разложенные по папкам: { weapons: { путь: модуль }, … } */
export function registerAll(by: Record<string, Record<string, unknown>>): void {
  if (loaded) return;
  for (const k of KINDS) for (const d of collectDefaults<Def>(by[k.dir] ?? {})) if (!k.reg.has(d.id)) k.reg.define(d);
  loaded = true;
}
