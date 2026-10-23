import type { Player } from './types';
import { toolReg } from './plugin/regs';

/** Боеприпасы принадлежат предмету, а не направленному слоту. undefined = навык на шёлке. */
export function toolAmmo(p: Player, id: string): number | null {
  if (p['gameplay'] === 1) return null;
  const capacity = toolReg.get(id)?.charges;
  return capacity === undefined ? null : Math.max(0, Math.min(capacity, (p['toolAmmo'] as Record<string, number> | undefined)?.[id] ?? capacity));
}
export function spendToolAmmo(p: Player, id: string): void {
  const n = toolAmmo(p, id); if (n === null) return;
  ((p['toolAmmo'] ??= {}) as Record<string, number>)[id] = Math.max(0, n - 1);
}
export function gainToolAmmo(p: Player, id: string): void {
  const n = toolAmmo(p, id), capacity = toolReg.get(id)?.charges;
  if (n === null || capacity === undefined) return;
  ((p['toolAmmo'] ??= {}) as Record<string, number>)[id] = Math.min(capacity, n + 1);
}
export function refillToolAmmo(p: Player): void {
  if (p['gameplay'] === 1) return;
  p['toolAmmo'] = Object.fromEntries(toolReg.list().filter((t) => t.charges !== undefined).map((t) => [t.id, t.charges!]));
  p['toolCd'] = 0;
}
