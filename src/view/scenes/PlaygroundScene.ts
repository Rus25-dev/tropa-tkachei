import Phaser from 'phaser';
import { TickClock } from '../../core/clock';
import { STEP } from '../../core/constants';
import { type InputFrame, emptyFrame } from '../../core/input';
import type { Shared } from '../game';

/** Состояние «пустой игры»: квадрат, который двигается тиками логики по вводу. Живёт вне Phaser, чтобы его читал e2e-тест. */
export interface PlaygroundState { x: number; y: number; vy: number; ticks: number; jumps: number; lastEdges: string; padSeen: boolean; touchSeen: boolean }

const RUN = 230, JUMP = 700, GRAVITY = 1500, FLOOR = 440;
const fresh = (x: number): PlaygroundState => ({ x, y: FLOOR, vy: 0, ticks: 0, jumps: 0, lastEdges: '', padSeen: false, touchSeen: false });

/** Проверка каркаса: фиксированный шаг 1/60, ввод с клавиатуры/геймпада/касания в формате ядра, масштаб по экрану. Настоящая игра — этапы 2–3. */
export class PlaygroundScene extends Phaser.Scene {
  private clock = new TickClock();
  private st: PlaygroundState = fresh(0);
  private box!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Text;
  constructor() { super('playground'); }
  create(): void {
    const w = this.scale.gameSize.width;
    this.clock.reset();
    this.st = fresh(w / 2);
    this.add.rectangle(w / 2, FLOOR + 30, w, 4, 0x3a6b5a);
    this.box = this.add.rectangle(this.st.x, this.st.y, 28, 52, 0xe8e2cf);
    this.hud = this.add.text(16, 12, '', { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '16px', color: '#9ff0c8' });
    this.add.text(w / 2, 64, 'Каркас v2: ← → / A D — бег, Пробел / Z — прыжок. Esc — меню', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#7fa596' }).setOrigin(0.5, 0);
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('menu'));
    // отладочный доступ для e2e-тестов
    (window as unknown as { __tt?: unknown }).__tt = { game: this.game, state: () => this.st };
  }
  /** Тик логики: фронты нажатий видны только на первом тике кадра, как в v1.8. */
  private tick(f: InputFrame, first: boolean): void {
    const s = this.st, b = f.buttons, w = this.scale.gameSize.width;
    s.x = Phaser.Math.Clamp(s.x + ((b.right ? 1 : 0) - (b.left ? 1 : 0)) * RUN * STEP, 20, w - 20);
    const onGround = s.y >= FLOOR;
    if (first && f.edges.jumpP && onGround) { s.vy = -JUMP; s.jumps++; }
    s.vy += GRAVITY * STEP;
    s.y = Math.min(FLOOR, s.y + s.vy * STEP);
    if (s.y >= FLOOR) s.vy = 0;
    s.ticks++;
    if (first) { const e = Object.entries(f.edges).filter(([, v]) => v).map(([k]) => k).join(','); if (e) s.lastEdges = e; }
  }
  override update(_time: number, delta: number): void {
    const sh = this.registry.get('shared') as Shared | undefined;
    const f = sh ? sh.hub.frame() : emptyFrame();
    if (sh) { this.st.padSeen = sh.hub.padSeen; this.st.touchSeen = sh.hub.touchSeen; }
    const n = this.clock.advance(delta);
    for (let i = 0; i < n; i++) this.tick(f, i === 0);
    this.box.setPosition(this.st.x, this.st.y);
    this.hud.setText(`тиков ${this.st.ticks} · fps ${this.game.loop.actualFps.toFixed(0)} · прыжков ${this.st.jumps}\nфронты: ${this.st.lastEdges || '—'} · геймпад: ${this.st.padSeen ? 'да' : 'нет'} · касание: ${this.st.touchSeen ? 'да' : 'нет'}`);
  }
}
