// Кампания: главы I–IV, коридоры перед аренами, лавка, сохранение (legacy/src/campaign.js + обёртки maptravel.js и charms.js).
// Сохранение хранит сессия (tt_save): мир получает прогресс при создании и сообщает о записи событием 'save'.
import { CHAPTERS, LAST_CHAPTER, SHOP, P } from './balance';
import { ARENAS, buildRoad } from './levels';
import { rngSeedFor } from './rng';
import { hasCharm } from './loadout';
import { mapExport } from './maptravel';
import { statBegin } from './racestats';
import type { Level, Player } from './types';
import type { World, WorldOpts } from './world';

export interface UpState { hp: number; dmg: number; silk: number }
export interface CampState { ch: number; st: 'level' | 'road' | 'arena'; beads: number; abil: Record<string, boolean>; up: UpState; time: number; deaths: number }
/** запись tt_save */
export interface Progress {
  bench: number; beads?: number; abil?: Record<string, boolean>; chapter?: number; stage?: string; up?: Partial<UpState>; time?: number; deaths?: number;
  name?: string; done?: boolean; best?: number; map?: Record<string, { v: number[]; b: number[] }>;
  [k: string]: unknown;
}

export const freshUp = (): UpState => ({ hp: 0, dmg: 0, silk: 0 });
export const freshCamp = (): CampState => ({ ch: 1, st: 'level', beads: 0, abil: {}, up: freshUp(), time: 0, deaths: 0 });
/** стартовые данные из сохранения («Продолжить»); без сохранения — с начала главы I */
export function resumeCamp(p: Progress | null): CampState {
  if (!p) return freshCamp();
  const ch = CHAPTERS[p.chapter as number] ? (p.chapter as number) : 1;
  return { ch, st: ch === 1 ? 'level' : 'road', beads: (p.beads as number) | 0, abil: { ...(p.abil || {}) }, up: { ...freshUp(), ...(p.up || {}) }, time: +(p.time as number) || 0, deaths: +(p.deaths as number) || 0 };
}
export const campaignSaveName = (sc: World, area: string): string => { const c = CHAPTERS[sc.camp ? sc.camp.ch : 1]!; return `Гл. ${c.roman} · ${area}`; };
/** арена главы идёт в режиме 'bosstest', но это часть кампании: победа должна сохраняться (кроме спидрана) */
export const canSave = (sc: World): boolean => sc.online !== 'guest' && !sc.sr && (sc.mode === 'story' || (sc.mode === 'bosstest' && !!sc.camp && sc.camp.st === 'arena'));

// ----- хуки мира -----
export function campaignInit(sc: World, data: WorldOpts): void {
  const c = data.camp || (data.mode === 'story' ? resumeCamp(sc.progress) : null);
  sc.camp = c ? { ...c, abil: { ...c.abil }, up: { ...freshUp(), ...c.up } } : null;
  if (sc.camp && sc.camp.st === 'arena') { sc.mode = 'bosstest'; sc.bossKind = CHAPTERS[sc.camp.ch]!.boss; }
  sc.leaving = false; sc.shopOpen = false;
}
export function campaignLevel(sc: World): Level | null {
  const c = sc.camp; if (!c || c.st === 'level') return null;
  if (c.st === 'road') return buildRoad(c.ch);
  const L = ARENAS[CHAPTERS[c.ch]!.boss]!();
  L.region = `Глава ${CHAPTERS[c.ch]!.roman}`;
  return L;
}
export function campaignSetup(sc: World): void {
  const c = sc.camp;
  sc.up = c ? { ...c.up } : freshUp();
  if (c && c.st !== 'level') {
    sc.abil = { ...c.abil }; if (c.st === 'arena') sc.abil['double'] = true;
    sc.beads = c.beads | 0;
    if (c.st === 'road') sc.bossDead = true; // в коридоре боссов нет: выход открыт
  } else if (c) { sc.abil = { ...c.abil, ...sc.abil }; if (sc.online === 'guest') sc.beads = c.beads | 0; }
  sc.deaths = 0; sc.timeSec = 0;
  applyUp(sc);
  if (c) sc.startData = { ...sc.startData, camp: snap(sc) };
}
export function snap(sc: World): CampState {
  const c = sc.camp!;
  return { ch: c.ch, st: c.st, beads: sc.beads, abil: { ...sc.abil }, up: { ...sc.up }, time: Math.round(c.time + sc.timeSec), deaths: c.deaths + sc.deaths };
}
export const needleBonus = (sc: World): number => (sc.up ? sc.up.dmg | 0 : 0);
/** улучшения лавки на героев; поверх — оберег «Паучье сердце» (+1 бутон), см. charms.js */
export function applyUp(sc: World): void {
  const up = sc.up, base = sc.easy ? 8 : 5;
  sc.silkMax = P.SILK - (up.silk | 0);
  const prev = sc.players.map((p) => [p.maxHp, p.hp] as const);
  for (const p of sc.players) {
    if (p.remote) continue;
    const want = base + (up.hp | 0);
    if (want > p.maxHp) p.hp += want - p.maxHp;
    p.maxHp = want; p.hp = Math.min(p.hp, p.maxHp); p.silk = Math.min(p.silk, sc.silkMax);
  }
  sc.players.forEach((p: Player, i) => {
    if (p.remote || !prev[i]) return;
    const [pm, ph] = prev[i]!, target = p.maxHp + (hasCharm(p, 'heart') ? 1 : 0);
    p.maxHp = target; p.hp = Math.min(target, ph + Math.max(0, target - pm));
    p.silk = Math.min(p.silk, sc.silkMax);
  });
}

/** Settings.saveProgress: слияние с прежней записью и счётчик best; в забеге спидрана обычное сохранение не пишется */
export function saveProgress(sc: World, p: Progress): void {
  if (sc.sr) return;
  const cur = sc.progress, best = Math.max((p.best as number) | 0, cur ? (cur.best as number) | 0 : 0, cur ? (cur.chapter as number) | 0 : 0, (p.chapter as number) | 0);
  sc.progress = { ...p, best };
  sc.emit('save', { progress: sc.progress });
}
/** Campaign.save + карта из maptravel.js */
export function campaignSave(sc: World, extra: Partial<Progress>): void {
  if (!canSave(sc)) return;
  const c = sc.camp; if (!c) return;
  const s = snap(sc);
  saveProgress(sc, { ...(sc.progress || { bench: 0 }), bench: 0, beads: sc.beads, abil: sc.abil, chapter: c.ch, stage: c.st === 'arena' ? 'road' : c.st, up: s.up, time: s.time, deaths: s.deaths, map: mapExport(sc), ...extra } as Progress);
  sc.startData = { ...sc.startData, camp: s };
}

// ----- переходы между этапами и главами -----
/** выход из коридора → арена (без экрана победы) */
export function preWin(sc: World): boolean {
  const c = sc.camp; if (!c || c.st !== 'road' || sc.leaving) return false;
  sc.won = true; sc.snd('revive');
  sc.toast('Дальше — арена…');
  go(sc, { ...snap(sc), st: 'arena' });
  return true;
}
/** подпись к экрану победы + сохранение перехода на следующую главу */
export function decorate(sc: World, s: Record<string, unknown>): void {
  const c = sc.camp; if (!c) return;
  const ch = CHAPTERS[c.ch]!, last = c.ch >= LAST_CHAPTER, sn = snap(sc);
  if (!s['title']) s['title'] = ch.bossLine;
  s['camp'] = { title: last ? 'Тропа пройдена' : `Глава ${ch.roman} пройдена`, final: last, ch: c.ch, time: sn.time, deaths: sn.deaths,
    next: last ? null : { ...sn, ch: c.ch + 1, st: 'road' } };
  s['deaths'] = sn.deaths;
  if (canSave(sc)) {
    const next = (s['camp'] as { next: CampState | null }).next;
    const n = last ? { ch: c.ch, st: 'road' } : next!, nc = CHAPTERS[n.ch]!;
    const old = sc.progress, map = old && old.map;
    saveProgress(sc, { bench: 0, beads: sc.beads, abil: sc.abil, chapter: n.ch, stage: 'road', up: sn.up, time: sn.time, deaths: sn.deaths,
      name: last ? 'Кампания пройдена' : `Гл. ${nc.roman} · ${nc.road}`, done: last, ...(map ? { map } : {}) });
  }
}
export function go(sc: World, camp: CampState): void {
  if (sc.leaving) return; sc.leaving = true;
  // зерно следующей сцены выводится из зерна этой: цепочка сцен забега воспроизводима по одному начальному зерну
  const data = { players: sc.nPlayers, mode: 'story' as const, camp, seed: rngSeedFor(sc.seed, 'next:' + camp.ch + camp.st) };
  if (sc.online === 'host') sc.sendEv({ k: 'next', camp });
  sc.snd('bench');
  sc.emit('fade', { out: true, ms: 450 });
  sc.after(sc.online === 'host' ? 0.9 : 0.48, () => { sc.next = data; sc.emit('nextScene', { data }); });
}

// ----- лавка -----
export const price = (id: string, lvl: number): number => SHOP.find((s) => s.id === id)!.price[lvl]!;
export function openShop(sc: World, p: Player): void {
  if (sc.sr && sc.sr.cat === 'boss') { sc.toast('В босс-раше лавка закрыта'); return; }
  if (!sc.camp || sc.shopOpen || p.remote || sc.won) return;
  sc.shopOpen = true; sc.shopP = p; sc.snd('bead'); sc.emit('shopShow');
}
export function buy(sc: World, id: string, fromGuest?: boolean): void {
  const it = SHOP.find((s) => s.id === id); if (!it) return;
  if (!sc.auth()) { sc.sendEv({ k: 'buy', id }); return; }
  const say = (m: string): void => { if (fromGuest) sc.sendEv({ k: 'toast', m }); else sc.toast(m); };
  const S = statBegin(sc), b0 = sc.beads, up0 = sc.up[id as keyof UpState];
  const lvl = sc.up[id as keyof UpState] | 0;
  if (lvl >= it.max) { say('Уже куплено на максимум'); return; }
  const pr = it.price[lvl]!;
  if (sc.beads < pr) { say(`Не хватает бусин: нужно ${pr}`); sc.snd('hit'); return; }
  sc.beads -= pr; sc.up[id as keyof UpState] = lvl + 1; applyUp(sc); sc.snd('revive');
  for (const p of sc.players) if (!p.remote) sc.parts(16, p.x + 7, p.y + 10, 0xffd47a);
  sc.sendEv({ k: 'up', up: sc.up, beads: sc.beads });
  campaignSave(sc, {});
  sc.toastAll(`Куплено: ${it.name}`);
  sc.emit('shopRefresh');
  if (S && sc.beads < b0 && sc.up[id as keyof UpState] > up0) S.buys.push({ id, ch: sc.camp ? sc.camp.ch : 1, igt: Math.round(sc.sr!.igt / 100) / 10, price: b0 - sc.beads });
}
