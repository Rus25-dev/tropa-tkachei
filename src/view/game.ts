import Phaser from 'phaser';
import type { Session } from '../core/session';
import type { InputHub } from '../input/hub';
import { BgScene } from './scenes/BgScene';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { WatchScene } from './scenes/WatchScene';
import { currentFit } from './fit';
import type { QualitySetting } from './quality';

/** Общие данные сцен (кладутся в реестр игры, чтобы сцены не зависели от глобальных переменных) */
export interface Shared {
  hub: InputHub; version: string; build: string;
  /** живая сессия (создаёт интерфейс при старте партии) */
  session: Session | null;
  /** подсказки под сенсорное управление (надписи на табличках) */
  touch: boolean;
  /** множитель скорости времени из настроек доступности (1 в забеге) */
  accessSpeed?: () => number;
  /** настройки отрисовки */
  gfx: () => { shake: boolean; noflash: boolean; outl: boolean; vibro: boolean; quality: QualitySetting; perf: boolean };
  /** призрак соперника в гонке 1×1: его последнее известное положение (или null) */
  ghost?: () => { c: number; s: string; x: number; y: number; f: number; g: number; vx: number; vy: number; at: number } | null;
}

/** Создаёт игру Phaser 4. Холст — в родном разрешении: размер окна × min(devicePixelRatio, 2); поле 960…1280 × 540 масштабируют камеры. */
export function createGame(parent: HTMLElement, shared: Shared): Phaser.Game {
  const f = currentFit();
  const game = new Phaser.Game({
    type: Phaser.AUTO, // Phaser 4: WebGL; Canvas остаётся запасным (устаревшим) вариантом
    parent,
    width: Math.round(f.cssW * f.dpr),
    height: Math.round(f.cssH * f.dpr),
    backgroundColor: '#070d0c',
    scale: { mode: Phaser.Scale.NONE },
    input: { gamepad: true },
    render: { antialias: true, roundPixels: false },
    scene: [BootScene, BgScene, GameScene, HudScene, WatchScene],
  });
  game.registry.set('shared', shared);
  const sizeCanvas = (): void => {
    const g = currentFit();
    game.scale.resize(Math.round(g.cssW * g.dpr), Math.round(g.cssH * g.dpr));
    const cv = game.canvas; if (cv) { cv.style.width = g.cssW + 'px'; cv.style.height = g.cssH + 'px'; }
    game.events.emit('tt:fit', g);
  };
  game.events.once('ready', sizeCanvas);
  // после поворота мобильные браузеры сообщают размер с опозданием: пересчитываем несколько раз (как refit в v1.8)
  const later = (): void => { sizeCanvas(); for (const ms of [120, 400, 900]) window.setTimeout(sizeCanvas, ms); };
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  window.visualViewport?.addEventListener('resize', sizeCanvas);
  document.addEventListener('fullscreenchange', later);
  return game;
}
