// Набор для описаний оберегов (src/content/charms/<id>.ts): точки расширения, на которые оберег подписывается.
// Ядро вызывает их в фиксированных местах в порядке order оберегов (не в порядке, в котором их надел игрок) — это детерминизм.
// Лист без зависимостей от мира и боя.
import type { BossRef } from './balance';
import type { Boss, Enemy, Player } from './types';
import type { World } from './world';

export interface CharmHooks {
  /** нить начислена (после оружия); boss — за удар по боссу. Не вызывается, если у героя noSilkGain */
  silkGain?(sc: World, p: Player, boss: boolean | undefined): void;
  /** удар героя ранил врага (только у считающего мир; враг жив). stunned — враг был оглушён до удара */
  hitEnemy?(sc: World, e: Enemy, p: Player, o: { stunned: boolean }): void;
  /** удар героя ранил босса (только у считающего мир; босс жив). stag — босс был в стаггере до удара */
  hitBoss?(sc: World, key: BossRef, b: Boss, p: Player, o: { stag: boolean }): void;
  /** героя ранили (srcX — откуда удар; spike — колючки) */
  hurt?(sc: World, p: Player, o: { srcX: number | null; spike: boolean | undefined; hp0: number }): void;
  /** герой казнил оглушённого босса */
  exec?(sc: World, p: Player, b: Boss): void;
  /** в начале шага героя (до движения) */
  stepPre?(sc: World, p: Player, dt: number): void;
  /** после шага героя; parryBefore — значение p.parryT до шага */
  stepPost?(sc: World, p: Player, dt: number, o: { parryBefore: number }): void;
}

export interface CharmDef extends CharmHooks {
  id: string; name: string; desc: string;
  /** как получить: 'boss:<id>' | 'shop:<цена>' */
  unlock: string;
  /** сколько слотов занимает */
  slots: number;
  /** цвет значка */
  col: number;
  /** место в списках и порядок срабатывания хуков; у существующих не менять */
  order?: number;
  /** прибавка к максимуму здоровья (пересчёт applyUp) */
  maxHp?: number;
  /** бусины тянутся к герою издалека */
  beadPull?: boolean;
}
export function defineCharm(d: CharmDef): CharmDef { return d; }
