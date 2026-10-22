// Экран «Снаряжение»: что лежит в разделах, что можно сделать с предметом, покупка и надевание (legacy/src/loadoutui.js).
// Хранилище снаряжения — tt_loadout; мир получает уже готовое надетое (core/loadout.applyLoadout).
import { campaignSave } from '../core/campaign';
import { ABILS, KIT_IDS, kitHas, type KitId } from '../core/kit/abilities';
import { CHARMS, CHARM_SLOTS, TOOLS, applyLoadout, canFit, equipped, openAll, owned, slotsOf, type LoadoutState } from '../core/loadout';
import type { Session } from '../core/session';
import { WEAPONS } from '../core/weapons';
import type { World } from '../core/world';
import { loadout } from './store';

export type GKind = 'weapons' | 'tools' | 'charms' | 'abils';
export const KINDS: GKind[] = ['weapons', 'tools', 'charms', 'abils'];
export const KIND_NAMES: Record<GKind, string> = { weapons: 'Оружие', tools: 'Инструмент', charms: 'Обереги', abils: 'Приёмы' };
const SINGLE = { weapons: 'weapon', tools: 'tool', charms: 'charm', abils: 'weapon' } as const;
const BOSS_NAMES: Record<string, string> = { korn: 'Корнематка', misha: 'Миша Додик', vladik: 'Владик Скрипка', tima: 'Тима Пиво', misha2: 'Миша Додик', vladik2: 'Владик Скрипка', tima2: 'Тима Пиво', keeper: 'Хранительница Печатей', vessel: 'Пустой сосуд', nightking: 'Король кошмаров', raven: 'Ворон-тиран', radiant: 'Сияющая', penitent: 'Первый Кающийся', brainmother: 'Мозг-мать', mantises: 'Три Богомола' };

export interface GEntry { id: string; name: string; desc: string; unlock: string; col?: number; [k: string]: unknown }
export interface GItem { id: string; e: GEntry; none?: boolean; owned: boolean }
const reg = (kind: GKind): Record<string, GEntry> => ({ weapons: WEAPONS, tools: TOOLS, charms: CHARMS, abils: ABILS })[kind] as unknown as Record<string, GEntry>;
/** приём открыт у местного героя: награда, флаг способности или Босс-тест/Босс-раш с включённой настройкой */
const abilOpen = (w: World, id: string): boolean => { const p = w.players.find((q) => !q.remote); return !!p && kitHas(w, p, id as KitId); };
const all = (w: World): boolean => openAll(w.mode, !!w.camp, !!w.sr);

export function gearItems(w: World, kind: GKind): GItem[] {
  const out: GItem[] = [], d = loadout.get();
  if (kind === 'tools') out.push({ id: '', none: true, owned: true, e: { id: '', name: 'Без инструмента', desc: 'Кнопка инструмента (E / RB) ничего не делает.', unlock: 'start' } });
  const r = reg(kind);
  for (const id of Object.keys(r)) out.push({ id, e: r[id]!, owned: kind === 'abils' ? abilOpen(w, id) : owned(kind, id, d, all(w)) });
  return out;
}
export function equippedNow(w: World): LoadoutState { return equipped(loadout.get(), all(w), !!w.sr); }
export function equippedIds(w: World, kind: GKind): string[] {
  if (kind === 'abils') return KIT_IDS.filter((id) => abilOpen(w, id));
  const d = equippedNow(w);
  return kind === 'weapons' ? [d.weapon] : kind === 'tools' ? [d.tool] : d.charms;
}
export const priceOf = (e: GEntry): number => { const m = /^shop:(\d+)$/.exec(e.unlock || ''); return m ? Number(m[1]) : 0; };
export function lockText(e: GEntry): string {
  const u = e.unlock || '';
  if (u.startsWith('boss:')) return `Получите: босс ${BOSS_NAMES[u.slice(5)] ?? u.slice(5)}`;
  if (u.startsWith('shop:')) return `Цена: ${u.slice(5)} бусин`;
  if (u === 'locked') return 'Пока не получен: награда за босса';
  return 'Пока недоступно';
}
export function statsOf(kind: GKind, e: GEntry): string[] {
  const L: string[] = [];
  if (kind === 'weapons') {
    if (e['dmg'] != null) L.push(`Урон: ${e['dmg']}`);
    if (e['reach'] != null) L.push(`Дальность: ×${e['reach']}`);
    if (e['cd']) L.push(`Пауза между ударами: ${e['cd']} с`);
    if (e['combo']) L.push(`Комбо: ${e['combo']} уд.${e['finisher'] ? ', последний — тяжёлый' : ''}`);
  } else if (kind === 'tools') {
    if (e['cost'] != null) L.push(`Стоит нити: ${e['cost']}`);
    if (e['cd']) L.push(`Перезарядка: ${e['cd']} с`);
  } else if (kind === 'charms') L.push(`Занимает слотов: ${slotsOf(e.id)} из ${CHARM_SLOTS}`);
  return L;
}
export interface GState { act: 'buy' | 'equip' | 'none'; ok: boolean; eq?: boolean; label: string; price?: number }
export function gearState(w: World, kind: GKind, it: GItem): GState {
  const e = it.e;
  if (kind === 'abils' && it.owned) return { act: 'none', ok: false, eq: true, label: 'Открыт' };
  if (!it.owned) {
    const pr = priceOf(e);
    if (pr) return { act: 'buy', price: pr, ok: w.beads >= pr && w.auth(), label: w.auth() ? `Купить за ${pr} бусин` : 'Покупает хост' };
    return { act: 'none', ok: false, label: lockText(e) };
  }
  const eq = equippedIds(w, kind).includes(it.id);
  if (kind === 'charms') {
    if (eq) return { act: 'equip', ok: true, eq, label: 'Снять' };
    const fit = canFit(loadout.get().charms, it.id);
    return { act: 'equip', ok: fit, eq, label: fit ? 'Надеть' : 'Нет места: снимите другой оберег' };
  }
  if (eq) return { act: 'none', ok: false, eq, label: 'Надето' };
  return { act: 'equip', ok: true, eq, label: 'Надеть' };
}
/** действие над предметом; возвращает сообщение для строки состояния */
export function gearAct(ses: Session, kind: GKind, it: GItem): { msg: string; snd?: string } {
  const w = ses.world, st = gearState(w, kind, it), e = it.e;
  if (st.act === 'none') return { msg: st.eq ? 'Уже надето' : st.label };
  if (st.act === 'buy') {
    if (!w.auth()) return { msg: 'Покупать в лавке может только хост' };
    if (w.beads < (st.price ?? 0)) return { msg: `Не хватает бусин: нужно ${st.price}`, snd: 'hit' };
    const d = loadout.get();
    const have = (d.have[kind] ??= []);
    if (have.includes(it.id)) return { msg: 'Уже куплено' };
    have.push(it.id); loadout.set(d);
    w.beads -= st.price ?? 0; w.snd('revive');
    for (const p of w.players) if (!p.remote) w.parts(14, p.x + 7, p.y + 10, 0xffd47a);
    const pg = w.progress;
    if (w.camp) campaignSave(w, { bench: pg ? (pg.bench | 0) : 0 }); // бусины сохраняются, остальные поля прогресса остаются
    ses.cfg.loadoutSave = loadout.get();
    if (kind === 'abils') applyLoadout(w, equipped(ses.cfg.loadoutSave, all(w), !!w.sr));
    return { msg: `Куплено: ${e.name}. Нажмите ещё раз, чтобы надеть` };
  }
  if (!st.ok) return { msg: st.label, snd: 'hit' };
  if (!loadout.equip(SINGLE[kind], it.id)) return { msg: 'Не хватает слотов' };
  const save = loadout.get(); ses.cfg.loadoutSave = save;
  applyLoadout(w, equipped(save, all(w), !!w.sr)); w.snd('bench');
  return { msg: kind === 'charms' ? (st.eq ? `Снято: ${e.name}` : `Надето: ${e.name}`) : `Надето: ${e.name}`, snd: 'bench' };
}
export { CHARMS, CHARM_SLOTS, slotsOf };
