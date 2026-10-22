// Автозагрузка отрисовки и звуков содержимого: src/view/content/<вид>/<id>.ts (default-экспорт описания или массива описаний).
// Вид работает только в Vite/Vitest, поэтому достаточно import.meta.glob (eager).
import { collectDefaults, type Def, type Registry } from '../../core/plugin/registry';
import { abilityViewReg, arenaViewReg, enemyViewReg, projViewReg, soundReg, toolViewReg, weaponViewReg } from './regs';

const KINDS: { dir: string; reg: Registry<Def> }[] = [
  { dir: 'weapons', reg: weaponViewReg as unknown as Registry<Def> },
  { dir: 'tools', reg: toolViewReg as unknown as Registry<Def> },
  { dir: 'abilities', reg: abilityViewReg as unknown as Registry<Def> },
  { dir: 'enemies', reg: enemyViewReg as unknown as Registry<Def> },
  { dir: 'projectiles', reg: projViewReg as unknown as Registry<Def> },
  { dir: 'sounds', reg: soundReg as unknown as Registry<Def> },
  { dir: 'arenas', reg: arenaViewReg as unknown as Registry<Def> },
];
const all = import.meta.glob(['./*/*.ts', '!./**/*.test.ts', '!./**/_*.ts'], { eager: true });
const by: Record<string, Record<string, unknown>> = {};
for (const [p, m] of Object.entries(all)) (by[p.split('/')[1]!] ??= {})[p] = m;
for (const k of KINDS) for (const d of collectDefaults<Def>(by[k.dir] ?? {})) if (!k.reg.has(d.id)) k.reg.define(d);
