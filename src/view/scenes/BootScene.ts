import Phaser from 'phaser';
import { genBackgrounds } from '../art';

/** Загрузочная сцена: рисует общие текстуры (фоны, виньетку, искры) и запускает постоянные сцены — фон, игру и HUD. Меню — HTML поверх холста. */
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  create(): void {
    genBackgrounds(this);
    this.scene.launch('bg');
    this.scene.launch('game');
    this.scene.launch('hud');
    this.game.events.emit('tt:booted');
  }
}
