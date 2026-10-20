import Phaser from 'phaser';

/** Загрузочная сцена: на этапе 3 здесь будут текстуры и звуки (сейчас всё рисуется кодом), затем меню. */
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  create(): void { this.scene.start('menu'); }
}
