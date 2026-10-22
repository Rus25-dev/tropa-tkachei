import type { Level } from '../src/core/types';

/** Источник новой арены для генератора LDtk; не меняет исторические карты v1.8. */
export function buildKeeperArena(): Level {
  const W = 38, H = 22, floorY = 18;
  const grid = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => x === 0 || x === W - 1 || y === 0 || y >= floorY ? 1 : 0));
  return {
    W, H, grid, spawn: { x: 7, y: 17 }, signs: [], benches: [], enemies: [], gates: [], exit: null,
    areas: [{ x: 1, name: 'Зал Неразрывной Клятвы' }], region: 'Зал Неразрывной Клятвы',
    floorY, boss: { x: 27, y: 17, arenaX0: 1, arenaX1: 36, trigger: 10, floorY },
  };
}
