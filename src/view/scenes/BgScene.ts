import Phaser from 'phaser';
import { PAL } from '../../core/balance';
import { drawWeaver } from '../draw/common';
import { currentFit, fitCamera, type Fit } from '../fit';
import { VH } from '../../core/constants';

/** Положение камеры игры для параллакса (пишет GameScene) */
export interface CamInfo { x: number; y: number; room: boolean; active: boolean }

/** Фон: параллакс из пяти слоёв (дальний свод, лучи, колонны, туман, свечение) и споры. В меню — два ткача на сцене. */
export class BgScene extends Phaser.Scene {
  private far!: Phaser.GameObjects.TileSprite; private rays!: Phaser.GameObjects.TileSprite; private mid!: Phaser.GameObjects.TileSprite;
  private fog!: Phaser.GameObjects.TileSprite; private glow!: Phaser.GameObjects.TileSprite;
  private spores!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hero!: Phaser.GameObjects.Graphics;
  private tags: Phaser.GameObjects.Text[] = [];
  private t = 0;
  private fit: Fit = currentFit();
  constructor() { super('bg'); }
  create(): void {
    const W = 2200, H = VH; // с запасом по ширине: на любом экране слой закрывает холст
    const mk = (key: string, add?: boolean): Phaser.GameObjects.TileSprite => {
      const s = this.add.tileSprite(0, 0, W, H, key).setOrigin(0);
      if (add) s.setBlendMode(Phaser.BlendModes.ADD);
      return s;
    };
    this.far = mk('bgFar'); this.rays = mk('bgRays', true); this.mid = mk('bgMid'); this.fog = mk('bgFog'); this.glow = mk('bgGlow', true);
    this.spores = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: 1400 }, y: { min: 0, max: VH }, lifespan: { min: 4000, max: 8000 },
      speedY: { min: -12, max: -3 }, speedX: { min: -8, max: 8 }, scale: { min: 0.25, max: 0.8 },
      alpha: { start: 0.8, end: 0 }, tint: [0x9ff0c8, 0xbff5dd, 0xffd47a], frequency: 160, blendMode: 'ADD',
    });
    this.hero = this.add.graphics();
    this.tags = PAL.map((pal) => this.add.text(0, 0, pal.tag, { fontFamily: '"Fira Sans", sans-serif', fontSize: '9px', fontStyle: '700', color: '#f4efe0', stroke: '#10141a', strokeThickness: 2 }).setOrigin(0.5).setScale(1.6).setVisible(false));
    this.refit(currentFit());
    this.game.events.on('tt:fit', (f: Fit) => this.refit(f));
    this.events.once('shutdown', () => this.game.events.off('tt:fit'));
  }
  private refit(f: Fit): void {
    this.fit = f;
    fitCamera(this, f);
    // слои покрывают всё видимое: сдвигаем левый край под камеру (логическое поле по центру холста)
    const left = f.vw / 2 - this.scale.width / 2 / f.scale;
    for (const o of [this.far, this.rays, this.mid, this.fog, this.glow]) { o.setPosition(left, 0); o.setSize(this.scale.width / f.scale + 4, VH); }
  }
  override update(_time: number, delta: number): void {
    this.t += delta / 1000;
    const ci = this.registry.get('cam') as CamInfo | undefined;
    const inGame = !!ci && ci.active;
    const room = inGame && ci.room;
    for (const o of [this.far, this.rays, this.mid, this.fog, this.glow, this.spores]) o.setVisible(!room);
    const x = inGame ? ci.x : this.t * 60, y = inGame ? ci.y : 600;
    this.far.tilePositionX = x * 0.08; this.far.tilePositionY = (y - 600) * 0.03;
    this.rays.tilePositionX = x * 0.14; this.rays.setAlpha(0.75 + Math.sin(this.t * 0.5) * 0.25);
    this.mid.tilePositionX = x * 0.3 + (inGame ? 0 : 0); this.mid.tilePositionY = (y - 600) * 0.1;
    this.fog.tilePositionX = x * 0.45 + this.t * 6; this.fog.tilePositionY = (y - 600) * 0.15;
    this.glow.tilePositionX = x * 0.5; this.glow.tilePositionY = (y - 600) * 0.2;
    // два ткача на заставке меню
    const g = this.hero; g.clear();
    const show = !inGame;
    this.tags.forEach((t) => t.setVisible(show));
    if (!show) return;
    const hx = this.fit.vw * 0.25, hy = 300;
    for (let i = 0; i < 2; i++) {
      const px = hx + (i ? 26 : -26), py = hy + Math.sin(this.t * 2 + i) * 3;
      drawWeaver(g, px, py, i ? -1 : 1, PAL[i]!, { bob: 0, leg: 0, sway: Math.sin(this.t * 1.6 + i) * 1.5, lift: 0 }, 1.6);
      this.tags[i]!.setPosition(px + (i ? 1 : -1) * 0.5, py - 13 * 1.6);
    }
  }
}
