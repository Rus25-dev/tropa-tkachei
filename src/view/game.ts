import Phaser from 'phaser';
import { VH } from '../core/constants';
import type { InputHub } from '../input/hub';
import { computeVW } from './layout';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { PlaygroundScene } from './scenes/PlaygroundScene';

export interface Shared { hub: InputHub; version: string; build: string }

/** Создаёт игру Phaser 4. Общие данные сцен (ввод, версия) кладём в реестр игры, чтобы сцены не зависели от глобальных переменных. */
export function createGame(parent: HTMLElement, shared: Shared): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO, // Phaser 4: WebGL; Canvas остаётся запасным (устаревшим) вариантом
    parent,
    width: computeVW(window.innerWidth, window.innerHeight),
    height: VH,
    backgroundColor: '#070d0c',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { gamepad: true },
    render: { antialias: true, roundPixels: false },
    scene: [BootScene, MenuScene, PlaygroundScene],
  });
  game.registry.set('shared', shared);
  // после поворота мобильные браузеры сообщают размер с опозданием: пересчитываем несколько раз (как refit в v1.8)
  const refit = (): void => {
    const vw = computeVW(window.innerWidth, window.innerHeight);
    if (Math.abs(vw - game.scale.gameSize.width) >= 6) {
      game.scale.setGameSize(vw, VH);
      if (game.scene.isActive('menu')) game.scene.getScene('menu').scene.restart();
    }
    game.scale.refresh();
  };
  const later = (): void => { refit(); for (const ms of [120, 400, 900]) window.setTimeout(refit, ms); };
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  window.visualViewport?.addEventListener('resize', refit);
  return game;
}
