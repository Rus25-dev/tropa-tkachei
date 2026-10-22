// Снаряжение (legacy/src/loadout.js, charms.js, tools.js): реестры инструментов и оберегов, надетое снаряжение героя.
// Хранение (localStorage tt_loadout) — задача сессии/интерфейса; ядро получает уже готовый набор LoadoutState.
import type { Player } from './types';
import type { World } from './world';
import { TOOLS, useToolDef } from './tools';
import { charmReg } from './plugin/regs';
import type { CharmDef } from './charm-kit';
import { applyUp } from './campaign';
import { WEAPONS } from './weapons';
import { ABILS } from './kit/abilities';

export { TOOLS };
export type { ToolDef } from './tool-kit';
export type { CharmDef } from './charm-kit';
export const CHARM_SLOTS = 3;

export interface LoadoutState { weapon: string; tool: string; charms: string[]; /** полученные приёмы набора игрока (kit/abilities.ts) */ abils: string[] }
export const defaultLoadout = (): LoadoutState => ({ weapon: 'needle', tool: '', charms: [], abils: [] });

/** все обереги в порядке order (живой объект; описания — src/content/charms/<id>.ts) */
export const CHARMS: Record<string, CharmDef> = charmReg.record;

export const slotsOf = (id: string): number => { const c = CHARMS[id]; return c ? (c.slots | 0) || 1 : 1; };
export const slotsUsed = (list: string[]): number => list.reduce((s, id) => s + slotsOf(id), 0);
export const canFit = (list: string[], id: string): boolean => slotsUsed(list) + slotsOf(id) <= CHARM_SLOTS;

// ----- хранилище снаряжения (данные tt_loadout), чистые функции: запись в localStorage делает слой выше -----
export interface LoadoutSave { weapon: string; tool: string; charms: string[]; have: { weapons: string[]; tools: string[]; charms: string[]; /** приёмы набора игрока (kit); у старых сохранений поля нет */ abils?: string[] } }
export const normalizeSave = (raw: unknown): LoadoutSave => {
  const d = (raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {}) as Partial<LoadoutSave>;
  const have = (d.have && typeof d.have === 'object' ? d.have : { weapons: ['needle'], tools: [], charms: [], abils: [] }) as LoadoutSave['have'];
  for (const k of ['weapons', 'tools', 'charms', 'abils'] as const) if (!Array.isArray(have[k])) have[k] = [];
  return { weapon: d.weapon || 'needle', tool: d.tool || '', charms: Array.isArray(d.charms) ? d.charms : [], have };
};
type Kind = 'weapons' | 'tools' | 'charms' | 'abils';
const reg = (kind: Kind): Record<string, { unlock: string }> => ({ weapons: WEAPONS, tools: TOOLS, charms: CHARMS, abils: ABILS })[kind];
/** всё доступно в босс-тесте (кроме забегов спидрана — там честное стартовое снаряжение) */
export const openAll = (mode: string, hasCamp: boolean, inRun: boolean): boolean => mode === 'bosstest' && !hasCamp && !inRun;
export function owned(kind: Kind, id: string, d: LoadoutSave, all: boolean): boolean {
  const e = reg(kind)[id]; if (!e) return false;
  return e.unlock === 'start' || all || (d.have[kind] ?? []).includes(id);
}
/** что надето у игрока (Loadout.equipped с поправкой на слоты) */
export function equipped(d: LoadoutSave, all: boolean, inRun: boolean): LoadoutState {
  if (inRun) return defaultLoadout();
  const weapon = owned('weapons', d.weapon, d, all) ? d.weapon : 'needle';
  const tool = d.tool && owned('tools', d.tool, d, all) ? d.tool : '';
  const list = d.charms.filter((c) => owned('charms', c, d, all)).slice(0, CHARM_SLOTS);
  const keep: string[] = [];
  for (const c of list) if (canFit(keep, c)) keep.push(c);
  return { weapon, tool, charms: keep, abils: Object.keys(ABILS).filter((id) => owned('abils', id, d, false)) };
}

export const hasCharm = (p: Player | null | undefined, id: string): boolean => !!(p && p['charms'] && (p['charms'] as string[]).includes(id));
/** надетые обереги героя в порядке order (в нём срабатывают их хуки) */
export function charmsOn(p: Player | null | undefined): CharmDef[] {
  const list = p && (p['charms'] as string[] | undefined); if (!list || !list.length) return [];
  return charmReg.list().filter((c) => list.includes(c.id));
}

/** надеть сохранённое снаряжение на локальных героев */
export function applyLoadout(sc: World, eq: LoadoutState): void {
  for (const p of sc.players) {
    if (p.remote) continue;
    p['weaponId'] = eq.weapon; p['toolId'] = eq.tool; p['charms'] = eq.charms.slice(); p['kit'] = eq.abils.slice(); p['toolCd'] = 0;
  }
  // charms.js: пересчитать здоровье под обереги (при создании мира sc.up ещё нет: пересчёт делает campaignSetup)
  if (sc.up) applyUp(sc);
}

export function useTool(sc: World, p: Player): boolean {
  const T_ = TOOLS[p['toolId'] as string]; if (!T_ || p.downed || (p['toolCd'] as number) > 0 || p.hurtT > 0 || p.sit) return false;
  if (p.silk < (T_.cost || 0)) { if (!p.remote) sc.snd('clink'); return false; }
  if (!useToolDef(sc, T_, p)) return false;
  p.silk -= T_.cost || 0; p['toolCd'] = T_.cd || 0.5; return true;
}
