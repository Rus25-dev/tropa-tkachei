// Снаряжение (legacy/src/loadout.js, charms.js, tools.js): реестры инструментов и оберегов, надетое снаряжение героя.
// Хранение (localStorage tt_loadout) — задача сессии/интерфейса; ядро получает уже готовый набор LoadoutState.
import type { Player } from './types';
import type { World } from './world';
import { toolCast } from './tools';
import { applyUp } from './campaign';
import { WEAPONS } from './weapons';
import { ABILS } from './kit/abilities';
import { spellCast } from './kit/spells';
import { KIT } from './balance';

export const CHARM_SLOTS = 3;

export interface LoadoutState { weapon: string; tool: string; charms: string[]; /** полученные приёмы набора игрока (kit/abilities.ts) */ abils: string[] }
export const defaultLoadout = (): LoadoutState => ({ weapon: 'needle', tool: '', charms: [], abils: [] });

export interface ToolDef { id: string; name: string; desc: string; cost: number; cd: number; unlock: string; use: (sc: World, p: Player) => boolean }
export const TOOLS: Record<string, ToolDef> = {
  throwneedle: { id: 'throwneedle', name: 'Метательная игла', desc: 'Летит по прямой (↑ или ↑+→ — вверх и по диагонали), пробивает слабых врагов, втыкается в стену и в босса на 3 с. Урон 2. Подбери — вернёт нить.', cost: 1, cd: 0.5, unlock: 'boss:penitent', use: (sc, p) => toolCast(sc, 'throwneedle', p) },
  trap: { id: 'trap', name: 'Капкан', desc: 'Ставится у ног на 8 с. Враг, наступивший на него, замирает на 2 с; босс копит стойку (+3), но не замирает. Не больше двух.', cost: 2, cd: 1.5, unlock: 'shop:50', use: (sc, p) => toolCast(sc, 'trap', p) },
  threadbomb: { id: 'threadbomb', name: 'Нитяная бомба', desc: 'Бросок дугой. Взрыв радиусом 90: урон 3 врагам и боссу, отброс, сбивает снаряды.', cost: 3, cd: 2, unlock: 'shop:70', use: (sc, p) => toolCast(sc, 'threadbomb', p) },
  spirit: { id: 'spirit', name: 'Нитяной снаряд', desc: 'Летящая волна нити вперёд на ~550 px: пробивает слабых врагов, крепких и босса бьёт на 3 и тает. Стоит 2 нити.', cost: KIT.SPIRIT.COST, cd: KIT.SPIRIT.CD, unlock: 'shop:80', use: (sc, p) => spellCast(sc, 'spirit', p) },
  dive: { id: 'dive', name: 'Нырок', desc: 'В воздухе: падаете камнем и неуязвимы, пока не приземлитесь. Удар оземь даёт волну на 110 px в стороны (урон 3 и боссу, и врагам, ломает броню, сбивает снаряды). С земли бьёт сразу. Стоит 3 нити.', cost: KIT.DIVE.COST, cd: KIT.DIVE.CD, unlock: 'shop:100', use: (sc, p) => spellCast(sc, 'dive', p) },
  wraith: { id: 'wraith', name: 'Вопль', desc: 'Столб нити вверх на 200 px над вами: четыре удара подряд по всем внутри, подбрасывает врагов и сбивает снаряды (кроме фиолетовых). Стоит 3 нити.', cost: KIT.WRAITH.COST, cd: KIT.WRAITH.CD, unlock: 'shop:120', use: (sc, p) => spellCast(sc, 'wraith', p) },
  hook: { id: 'hook', name: 'Нитяной крюк', desc: 'Нить на 260 px в сторону ввода (↑, вперёд, диагональ). В стену или платформу — притянет героя, во врага — подтянет и оглушит мелкого, в оглушённого босса — удар.', cost: 1, cd: 0.9, unlock: 'boss:tima2', use: (sc, p) => toolCast(sc, 'hook', p) },
};

export interface CharmDef { id: string; name: string; desc: string; unlock: string; slots: number; col: number }
export const CHARMS: Record<string, CharmDef> = {
  sting: { id: 'sting', name: 'Жало', desc: 'Удары иглы отравляют: 1 урона раз в 1.2 с, 4 раза. Боссов яд берёт вдвое слабее.', unlock: 'boss:misha2', slots: 1, col: 0x86e05a },
  ember: { id: 'ember', name: 'Угольная нить', desc: 'Тяжёлый удар (третий в комбо) поджигает врага: 3 тика ожога, огонь перекидывается на соседей.', unlock: 'shop:45', slots: 1, col: 0xff8a3c },
  heart: { id: 'heart', name: 'Паучье сердце', desc: '+1 бутон здоровья. Тяжёлый оберег: занимает два слота.', unlock: 'shop:60', slots: 2, col: 0xff6a7a },
  swift: { id: 'swift', name: 'Быстрая нить', desc: 'Нить копится на 50 % быстрее: каждый второй набор даёт лишнюю единицу.', unlock: 'boss:penitent', slots: 1, col: 0x9ff0c8 },
  stride: { id: 'stride', name: 'Тихий шаг', desc: 'Рывок перезаряжается на 25 % быстрее.', unlock: 'shop:40', slots: 1, col: 0xb9d4c8 },
  window: { id: 'window', name: 'Широкое окно', desc: 'Окно отбива шире на 50 % (0.2 → 0.3 с).', unlock: 'boss:vladik2', slots: 1, col: 0xffffff },
  thorns: { id: 'thorns', name: 'Колючий плащ', desc: 'Когда враг ранит вас касанием, он получает 1 урона в ответ.', unlock: 'shop:55', slots: 1, col: 0xd9a35a },
  call: { id: 'call', name: 'Зов нити', desc: 'Бусины тянутся к вам издалека (в ~2.5 раза дальше).', unlock: 'shop:30', slots: 1, col: 0xffd47a },
  hunter: { id: 'hunter', name: 'Охотник', desc: '+15 % урона по оглушённым врагам и боссам; казнь даёт вдвое больше нити.', unlock: 'boss:tima2', slots: 1, col: 0xe8e2cf },
};

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
  if (!T_.use(sc, p)) return false;
  p.silk -= T_.cost || 0; p['toolCd'] = T_.cd || 0.5; return true;
}
