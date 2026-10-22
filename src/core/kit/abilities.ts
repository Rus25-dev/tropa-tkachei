// Набор приёмов игрока (v2.5, часть Б волны 0): реестр способностей и проверка «открыт ли приём».
// Приёмы не требуют новых кнопок: теневой рывок заменяет обычный, вспышка и кристальный рывок живут на кнопке рывка.
// Как выдать приём: поменять строку unlock в реестре на 'boss:<id>' (или 'shop:N') — выдачу за босса и покупку подхватят хранилище и «Снаряжение».
// Откуда берётся «открыто»: 1) sc.abil[id] (флаг способности в прогрессе, как двойной прыжок), 2) p.kit (получено, см. loadout.ts),
// 3) Босс-тест и Босс-раш, когда у мира включён флаг kit (настройка «Приёмы в Босс-тесте»; в записях без флага приёмы закрыты, золотые записи не меняются).
import type { Player } from '../types';
import type { World } from '../world';

export type KitId = 'shadow' | 'flash' | 'crystal' | 'counter';
export interface AbilDef { id: KitId; name: string; desc: string; unlock: string; col: number }

export const ABILS: Record<KitId, AbilDef> = {
  shadow: { id: 'shadow', name: 'Теневой рывок', col: 0x8a7ad8, unlock: 'boss:vessel',
    desc: 'Рывок становится теневым: на время рывка вы неуязвимы к касаниям и ударам, которые можно отбить или от которых можно увернуться (фиолетовые не пройти). Перезарядка дольше обычной, 1,1 с. Заменяет обычный рывок.' },
  flash: { id: 'flash', name: 'Воздушная вспышка', col: 0x7fd8ff, unlock: 'boss:raven',
    desc: 'В воздухе нажмите рывок со стрелкой (в том числе вверх или вниз): короткий рывок на 100 px в одну из 8 сторон, в начале миг неуязвимости. Один раз до приземления, хвата за уступ или стены. Если воздушный рывок уже потрачен, вспышка срабатывает и без стрелок.' },
  crystal: { id: 'crystal', name: 'Кристальный рывок', col: 0xff8ae0, unlock: 'boss:radiant',
    desc: 'На земле удерживайте рывок около полсекунды: герой замедляется, вокруг искры. Отпустите: суперрывок вперёд до стены или края (около 1100 px/с), в начале неуязвимость. Прыжок, удар или урон отменяют заряд.' },
  counter: { id: 'counter', name: 'Контрудар', col: 0xbfe9ff, unlock: 'boss:keeper',
    desc: 'Ударьте вплотную к боссу в последние 0,15 с его жёлтого или красного замаха: удар сорвёт атаку, босс оглушён, а ваш удар станет усиленной контратакой. Фиолетовые и белые замахи не берутся. Откат 1,5 с.' },
};
export const KIT_IDS = Object.keys(ABILS) as KitId[];

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
