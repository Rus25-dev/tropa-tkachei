// Автозагрузка отрисовки и звуков содержимого: src/view/content/<вид>/<id>.ts (default-экспорт описания).
// Вид работает только в Vite/Vitest, поэтому достаточно import.meta.glob (eager).
import { collectDefaults, type Def, type Registry } from '../../core/plugin/registry';
import { weaponViewReg } from './regs';

const KINDS: { dir: string; reg: Registry<Def> }[] = [
  { dir: 'weapons', reg: weaponViewReg as unknown as Registry<Def> },
];
const all = import.meta.glob(['./*/*.ts', '!./**/*.test.ts', '!./**/_*.ts'], { eager: true });
const by: Record<string, Record<string, unknown>> = {};
for (const [p, m] of Object.entries(all)) (by[p.split('/')[1]!] ??= {})[p] = m;
for (const k of KINDS) for (const d of collectDefaults<Def>(by[k.dir] ?? {})) if (!k.reg.has(d.id)) k.reg.define(d);
