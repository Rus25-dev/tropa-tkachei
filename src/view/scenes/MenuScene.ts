import Phaser from 'phaser';
import type { Shared } from '../game';

/** Каркас-заглушка: настоящее меню (HTML, Preact) появится на этапе 4. Здесь — название и вход в «пустую игру» для проверки каркаса. */
export class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }
  create(): void {
    const w = this.scale.gameSize.width, h = this.scale.gameSize.height, s = this.registry.get('shared') as Shared;
    this.add.text(w / 2, h * 0.32, 'ТРОПА ТКАЧЕЙ', { fontFamily: '"Cormorant SC", Georgia, serif', fontSize: '84px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5);
    this.add.text(w / 2, h * 0.46, `версия ${s.version} · сборка ${s.build}`, { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#7fa596' }).setOrigin(0.5);
    const go = this.add.text(w / 2, h * 0.66, 'Пустая игра  (Enter / Пробел / коснитесь)', { fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#ffd47a', backgroundColor: '#143029', padding: { x: 18, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    go.on('pointerdown', () => this.scene.start('playground'));
    this.input.keyboard?.on('keydown-ENTER', () => this.scene.start('playground'));
    this.input.keyboard?.on('keydown-SPACE', () => this.scene.start('playground'));
  }
}
