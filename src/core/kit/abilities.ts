// Набор приёмов игрока: реестр открываемых приёмов (описания — src/content/abilities/<id>.ts) и проверка «открыт ли приём».
// Приёмы не требуют новых кнопок: теневой рывок заменяет обычный, вспышка и кристальный рывок живут на кнопке рывка, контрудар — на кнопке удара.
// Как выдать приём: unlock в описании 'boss:<id>' (или 'shop:N') — выдачу за босса и покупку подхватят хранилище и «Снаряжение».
// Откуда берётся «открыто»: 1) sc.abil[id] (флаг способности в прогрессе, как двойной прыжок), 2) p.kit (получено, см. loadout.ts),
// 3) Босс-тест и Босс-раш, когда у мира включён флаг kit (настройка «Приёмы в Босс-тесте»; в записях без флага приёмы закрыты, золотые записи не меняются).
import type { Player } from '../types';
import type { World } from '../world';
import { abilReg } from '../plugin/regs';
import type { AbilityDef } from '../ability-kit';

export type KitId = string;
export type AbilDef = AbilityDef & { name: string; desc: string; unlock: string; col: number };
/** открываемые приёмы в порядке order (живой объект) */
export const ABILS = abilReg.record as Record<string, AbilDef>;
/** их id в порядке order (живой массив) */
export const KIT_IDS: string[] = [];
abilReg.onDefine(() => { KIT_IDS.splice(0, KIT_IDS.length, ...abilReg.ids()); });

/** приёмы открыты «всем» (Босс-тест без кампании, Босс-раш), если мир создан с флагом kit; в гонках и дуэлях флаг не действует */
export function kitAll(sc: World): boolean {
  if (!sc.kit) return false;
  const r = sc.sr;
  if (r) return r.cat === 'boss' && !r.duel && !r.race && !r.rc;
  return sc.mode === 'bosstest' && !sc.camp;
}
/** открыт ли приём у героя */
export function kitHas(sc: World, p: Player, id: KitId): boolean {
  if (p.remote) return false; // приёмы напарника считает его экземпляр мира
  if (sc.abil[id] === true) return true;
  const k = p['kit'] as string[] | undefined;
  return (k !== undefined && k.includes(id)) || kitAll(sc);
}
