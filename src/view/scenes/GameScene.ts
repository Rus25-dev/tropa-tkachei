// Сцена игры: рисует состояние ядра (World) и гонит тики по кадрам ввода. Вся логика — в src/core; здесь только отображение, камера и эффекты.
import Phaser from 'phaser';
import { PAL, SPIKE, T, clamp } from '../../core/balance';
import { VH } from '../../core/constants';
import { mulberry32 } from '../../core/rng';
import type { Session } from '../../core/session';
import type { World } from '../../core/world';
import { drawClassroom, drawDen } from '../artRooms';
import { drawLevelChunks } from '../art';
import { drawCurtains, drawDataBoss, drawDataProjs, drawKorne, drawMisha, drawTima, drawVladik, type Say } from '../draw/bosses';
import { bossDef } from '../../core/boss/registry';
import { drawEnemy } from '../draw/enemies';
import { drawPlayer, drawSwingArc } from '../draw/hero';
import { drawBeads, drawItems, drawPoiseBars, drawProjectiles, drawStatus, type TextPool } from '../draw/projectiles';
import { drawWeaver, type G } from '../draw/common';
import { currentFit, fitCamera, type Fit } from '../fit';
import { Snd } from '../audio/snd';
import { Music } from '../audio/music';
import type { Shared } from '../game';
import type { CamInfo } from './BgScene';
import { PerfOverlay } from '../perf';
import { rumble } from '../../input/gamepad';
import { QualityGovernor, applyCameraFx, gradeMatrix } from '../quality';

const FONT = '"Fira Sans", sans-serif', DISPLAY = '"Cormorant SC", Georgia, serif';

/** Пул текстовых объектов: берём по порядку, лишние прячем после кадра */
class Pool implements TextPool {
  private items: Phaser.GameObjects.Text[] = []; private n = 0;
  constructor(private make: () => Phaser.GameObjects.Text) {}
  begin(): void { this.n = 0; }
  take(): Phaser.GameObjects.Text { let t = this.items[this.n]; if (!t) { t = this.make(); this.items.push(t); } this.n++; return t; }
  end(): void { for (let i = this.n; i < this.items.length; i++) this.items[i]!.setVisible(false); }
  destroy(): void { for (const t of this.items) t.destroy(); this.items = []; }
}

interface SignObj { txt: Phaser.GameObjects.Text; px: number; py: number }

const NOT_HARM = new Set(['bomb', 'ringfx', 'staffghost', 'mark']);
export class GameScene extends Phaser.Scene {
  private sh!: Shared;
  private sess: Session | null = null;
  private w: World | null = null;
  private fit: Fit = currentFit();
  // слои
  private fx!: G; private fb!: G; private itemG!: G; private curtainG!: G; private slimeG!: G; private exitG!: G; private stG!: G;
  private chunkImgs: Phaser.GameObjects.Image[] = [];
  private roomObjs: Phaser.GameObjects.GameObject[] = [];
  private signs: SignObj[] = [];
  private benchObjs: { g: G; prompt: Phaser.GameObjects.Text }[] = [];
  private gateG: G[] = []; private gateAnim: number[] = [];
  private entG = new Map<object, G>();
  private playerG: { g: G; tag: Phaser.GameObjects.Text }[] = [];
  private dataG: G[] = [];
  private bossG: G | null = null; private mishaG: G | null = null; private vladikG: G | null = null; private timaG: G | null = null;
  private say = { misha: null as Phaser.GameObjects.Text | null, vladik: null as Phaser.GameObjects.Text | null, tima: null as Phaser.GameObjects.Text | null };
  private letters!: Pool; private big!: Pool; private stamps!: Pool;
  private stampTexts: Phaser.GameObjects.Text[] = []; private furnG: G | null = null;
  // призрак соперника (гонка 1×1)
  private ghostG: G | null = null; private ghostTag: Phaser.GameObjects.Text | null = null; private ghostPos: { x: number; y: number } | null = null;
  // частицы
  private parts!: Phaser.GameObjects.Particles.ParticleEmitter; private dustE!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter | null = null; private paper: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private foam: Phaser.GameObjects.Particles.ParticleEmitter | null = null; private dustFx: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  // камера
  private camX = 0; private camY = 0; private zoom = 1.18;
  private gov!: QualityGovernor; private perf!: PerfOverlay; private appliedQ = ''; private appliedKey = '';
  constructor() { super('game'); }

  create(): void {
    this.sh = this.registry.get('shared') as Shared;
    this.fx = this.add.graphics().setDepth(6); this.fb = this.add.graphics().setDepth(4.5);
    this.itemG = this.add.graphics().setDepth(2.5); this.curtainG = this.add.graphics().setDepth(3); this.slimeG = this.add.graphics().setDepth(3.1);
    this.exitG = this.add.graphics().setDepth(1.5); this.stG = this.add.graphics().setDepth(5.6);
    this.letters = new Pool(() => this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '28px', fontStyle: '700', color: '#f4efe0', stroke: '#1a1410', strokeThickness: 5 }).setOrigin(0.5).setDepth(6.2));
    this.big = new Pool(() => this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '74px', fontStyle: '700', color: '#e8e2cf', stroke: '#1a1410', strokeThickness: 7 }).setOrigin(0.5).setDepth(6.2));
    this.stamps = new Pool(() => this.add.text(0, 0, 'БАНКРОТ', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#f4efe0' }).setOrigin(0.5).setDepth(6.4));
    this.parts = this.add.particles(0, 0, 'spark', { emitting: false, lifespan: 500, speed: { min: 60, max: 220 }, scale: { start: 0.9, end: 0 }, blendMode: 'ADD' }).setDepth(7);
    this.dustE = this.add.particles(0, 0, 'dot', { emitting: false, lifespan: 380, speed: { min: 20, max: 70 }, angle: { min: 200, max: 340 }, scale: { start: 1, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: 0x8fae9c, gravityY: 80 }).setDepth(7);
    this.gov = new QualityGovernor(this.sh.gfx().quality, this.sh.touch);
    this.perf = new PerfOverlay(this.sh.gfx().perf);
    this.fitNow(currentFit());
    this.game.events.on('tt:fit', this.fitNow, this);
    this.events.once('shutdown', () => this.game.events.off('tt:fit', this.fitNow, this));
    this.registry.set('cam', { x: 0, y: 0, room: false, active: false } satisfies CamInfo);
  }
  private fitNow(f: Fit): void { this.fit = f; fitCamera(this, f, this.zoom, this.camX, this.camY); }

  // ----- привязка к сессии и построение сцены -----
  /** дуэль, «Зеркало»: картинка игры отражена по горизонтали (ввод зеркалит ядро до записи в журнал) */
  private mirrored = false;
  private syncMirror(on: boolean): void { if (on !== this.mirrored) { this.mirrored = on; document.documentElement.classList.toggle('tt-mirror', on); } }
  private bind(): void {
    const s = this.sh.session;
    if (s !== this.sess) { this.sess = s; this.w = null; if (!s) this.teardown(); }
    if (this.sess && this.sess.world !== this.w) this.build(this.sess.world);
  }
  private teardown(): void {
    for (const c of this.chunkImgs) c.destroy(); this.chunkImgs = [];
    for (const o of this.roomObjs) o.destroy(); this.roomObjs = [];
    for (const s of this.signs) s.txt.destroy(); this.signs = [];
    for (const b of this.benchObjs) { b.g.destroy(); b.prompt.destroy(); } this.benchObjs = [];
    for (const g of this.gateG) g.destroy(); this.gateG = [];
    for (const g of this.entG.values()) g.destroy(); this.entG.clear();
    for (const p of this.playerG) { p.g.destroy(); p.tag.destroy(); } this.playerG = [];
    for (const g of [this.bossG, this.mishaG, this.vladikG, this.timaG]) g?.destroy();
    this.bossG = this.mishaG = this.vladikG = this.timaG = null;
    for (const g of this.dataG) g.destroy(); this.dataG = [];
    for (const t of Object.values(this.say)) t?.destroy(); this.say = { misha: null, vladik: null, tima: null };
    for (const e of [this.smoke, this.paper, this.foam, this.dustFx]) e?.destroy(); this.smoke = this.paper = this.foam = this.dustFx = null;
    for (const t of this.stampTexts) t.destroy(); this.stampTexts = []; this.furnG?.destroy(); this.furnG = null;
    this.ghostG?.destroy(); this.ghostG = null; this.ghostTag?.destroy(); this.ghostTag = null; this.ghostPos = null;
    this.fx.clear(); this.fb.clear(); this.itemG.clear(); this.curtainG.clear(); this.slimeG.clear(); this.exitG.clear(); this.stG.clear();
    this.letters.destroy(); this.big.destroy(); this.stamps.destroy();
    this.accG?.destroy(); this.accG = null; this.spkFor = null;
    this.registry.remove('hud'); this.appliedQ = ''; this.appliedKey = '';
    this.registry.set('cam', { x: 0, y: 0, room: false, active: false } satisfies CamInfo);
  }

  private build(w: World): void {
    this.teardown();
    this.w = w;
    // пулы текстов пересозданы в teardown — создаём заново
    this.letters = new Pool(() => this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '28px', fontStyle: '700', color: '#f4efe0', stroke: '#1a1410', strokeThickness: 5 }).setOrigin(0.5).setDepth(6.2));
    this.big = new Pool(() => this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '74px', fontStyle: '700', color: '#e8e2cf', stroke: '#1a1410', strokeThickness: 7 }).setOrigin(0.5).setDepth(6.2));
    this.stamps = new Pool(() => this.add.text(0, 0, 'БАНКРОТ', { fontFamily: FONT, fontSize: '14px', fontStyle: '700', color: '#f4efe0' }).setOrigin(0.5).setDepth(6.4));
    const L = w.L;
    // карта
    const chunks = L.theme === 'class' ? drawClassroom(this, L) : L.theme === 'den' ? drawDen(this, L) : drawLevelChunks(this, L);
    for (const c of chunks) this.chunkImgs.push(this.add.image(c.x, 0, c.key).setOrigin(0).setDepth(L.theme ? 0.2 : 1));
    // таблички
    for (const s of L.signs) {
      const sx = s.x * T + 16, sy = (s.y + 1) * T;
      const g = this.add.graphics().setDepth(0.5);
      g.fillStyle(0x3a2c20, 1); g.fillRect(sx - 2, sy - 34, 4, 34);
      g.fillStyle(0x2a3b33, 0.92); g.fillRoundedRect(sx - 14, sy - 50, 28, 20, 4);
      g.lineStyle(1, 0x67ad62, 0.8); g.strokeRoundedRect(sx - 14, sy - 50, 28, 20, 4);
      g.fillStyle(0x9ff0c8, 0.9); g.fillCircle(sx, sy - 40, 3);
      this.roomObjs.push(g);
      const txt = this.add.text(sx, sy - 62, this.sh.touch && s.touch ? s.touch : s.text, { fontFamily: FONT, fontSize: '13px', color: '#d9ecdf', align: 'center', lineSpacing: 3, backgroundColor: 'rgba(8,18,15,0.72)', padding: { x: 8, y: 5 } }).setOrigin(0.5, 1).setDepth(8).setAlpha(0);
      this.signs.push({ txt, px: sx, py: sy });
    }
    // скамьи
    for (const b of w.benches) {
      const bx = b.x, by = b.y;
      const g = this.add.graphics().setDepth(2);
      g.fillStyle(0x4a3726, 1); g.fillRoundedRect(bx - 26, by - 16, 52, 6, 3);
      g.fillStyle(0x6b5236, 1); g.fillRect(bx - 24, by - 15, 48, 2);
      g.fillStyle(0x3a2a1c, 1); g.fillRect(bx - 22, by - 10, 4, 10); g.fillRect(bx + 18, by - 10, 4, 10);
      g.fillRoundedRect(bx - 26, by - 30, 52, 5, 2);
      g.lineStyle(2, 0x2a4636, 1); g.lineBetween(bx - 24, by - 28, bx - 28, by - 4); g.lineBetween(bx + 24, by - 28, bx + 30, by - 2);
      g.fillStyle(0x3a2a1c, 1); g.fillRect(bx + 32, by - 44, 3, 44);
      g.fillStyle(0xffd47a, 0.12); g.fillCircle(bx + 34, by - 48, 22); g.fillStyle(0xffd47a, 0.25); g.fillCircle(bx + 34, by - 48, 10);
      g.fillStyle(0xffe3a3, 1); g.fillCircle(bx + 34, by - 48, 4);
      const prompt = this.add.text(bx, by - 46, this.sh.touch ? 'стик вверх — скамья' : '↑ скамья', { fontFamily: FONT, fontSize: '13px', color: '#ffe3a3' }).setOrigin(0.5).setDepth(8).setAlpha(0);
      this.benchObjs.push({ g, prompt });
    }
    // ворота
    this.gateG = w.gates.map(() => this.add.graphics().setDepth(3)); this.gateAnim = w.gates.map((gt) => (gt.closed ? 1 : 0));
    // герои
    this.playerG = w.players.map((p) => ({ g: this.add.graphics().setDepth(5), tag: this.add.text(0, 0, p.pal.tag, { fontFamily: FONT, fontSize: '9px', fontStyle: '700', color: '#f4efe0', stroke: '#10141a', strokeThickness: 2 }).setOrigin(0.5).setDepth(5.1) }));
    // боссы
    this.bossG = this.add.graphics().setDepth(4);
    const bubble = (): Phaser.GameObjects.Text => this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '600', color: '#1a1410', backgroundColor: '#f4efe0', padding: { x: 8, y: 4 } }).setOrigin(0.5, 1).setDepth(8.5).setVisible(false);
    const dust = (key: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth: number): Phaser.GameObjects.Particles.ParticleEmitter => this.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(depth);
    if (w.misha) {
      this.mishaG = this.add.graphics().setDepth(4); this.say.misha = bubble();
      // буквы на задней стене — следы старых наборных касс
      const R = mulberry32(404), chars = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЫЭЮЯ';
      for (let i = 0; i < 22; i++) {
        this.roomObjs.push(this.add.text(T * (2 + R() * 40), T * (4 + R() * 12), chars[Math.floor(R() * chars.length)]!, { fontFamily: FONT, fontSize: Math.round(50 + R() * 110) + 'px', fontStyle: '600', color: '#e8e2cf' }).setOrigin(0.5).setAlpha(0.05 + R() * 0.05).setAngle((R() - 0.5) * 30).setDepth(0.3));
      }
      this.roomObjs.push(this.add.text(22 * T, 5 * T + 6, 'ТИПОГРАФИЯ', { fontFamily: DISPLAY, fontSize: '30px', fontStyle: '700', color: '#8fb8a8' }).setOrigin(0.5, 0).setAlpha(0.35).setDepth(0.4));
      // ящики с дымовухами
      for (const c of w.crates ?? []) {
        const cx = c.x + 22, by = c.y + 46, g = this.add.graphics().setDepth(2);
        g.fillStyle(0x4a3726, 1); g.fillRoundedRect(cx - 20, by - 28, 40, 28, 3);
        g.lineStyle(2, 0x2c2015, 1); g.strokeRoundedRect(cx - 20, by - 28, 40, 28, 3); g.lineBetween(cx - 20, by - 14, cx + 20, by - 14);
        g.fillStyle(0x6b5236, 1); g.fillRect(cx - 17, by - 25, 34, 3);
        for (let i = 0; i < 3; i++) { g.fillStyle(0x3a3f45, 1); g.fillCircle(cx - 10 + i * 10, by - 33, 6); g.fillStyle(0x9aa39f, 1); g.fillCircle(cx - 12 + i * 10, by - 35, 1.6); }
        g.lineStyle(1.5, 0xffd47a, 1); for (let i = 0; i < 3; i++) g.lineBetween(cx - 10 + i * 10, by - 39, cx - 8 + i * 10, by - 44);
        this.roomObjs.push(g, this.add.text(cx, by - 8, 'ДЫМ', { fontFamily: FONT, fontSize: '11px', fontStyle: '600', color: '#e8e2cf' }).setOrigin(0.5).setDepth(2.1));
      }
      this.smoke = dust('spark', { lifespan: { min: 900, max: 1600 }, speed: { min: 10, max: 60 }, scale: { start: 2.2, end: 6 }, alpha: { start: 0.55, end: 0 }, tint: [0x8e9894, 0xb3bab6, 0x6f7774], gravityY: -40 }, 6.5);
      this.paper = dust('dot', { lifespan: 600, speed: { min: 40, max: 160 }, scale: { start: 1.4, end: 0 }, rotate: { min: 0, max: 360 }, tint: 0xf4efe0, gravityY: 300 }, 7);
    }
    if (w.vladik) {
      this.vladikG = this.add.graphics().setDepth(4); this.say.vladik = bubble();
      this.roomObjs.push(this.add.text(14 * T, 5 * T + 22, 'Тема: скрипичный ключ', { fontFamily: FONT, fontSize: '13px', fontStyle: 'italic', color: '#e8eadf' }).setOrigin(0.5, 0).setAlpha(0.75).setDepth(0.25));
    }
    if (w.tima) {
      this.timaG = this.add.graphics().setDepth(4); this.say.tima = bubble();
      this.furnG = this.add.graphics().setDepth(0.6);
      this.drawFurniture(w);
      this.stampTexts = w.L.furniture!.map((f) => this.add.text((f.x0 + f.x1 + 1) * T / 2, f.y * T - 6, 'ИЗЪЯТО', { fontFamily: FONT, fontSize: '22px', fontStyle: '700', color: '#ff5a4a', stroke: '#1a1410', strokeThickness: 4 }).setOrigin(0.5).setAngle(-8).setDepth(6.3).setVisible(false));
      this.dustFx = dust('spark', { lifespan: 700, speed: { min: 20, max: 90 }, scale: { start: 0.9, end: 0 }, tint: [0xffe38a, 0xffffff, 0xffb6f0, 0x9ff0ff], blendMode: 'ADD' }, 7);
      this.foam = dust('dot', { lifespan: 500, speed: { min: 40, max: 180 }, scale: { start: 1.6, end: 0 }, tint: [0xfff6d8, 0xf2c14e], gravityY: 400 }, 7);
    }
    this.dataG = w.bosses.map(() => this.add.graphics().setDepth(4)); // боссы на данных (2.5)
    // камера: сразу на героев
    const pts = w.alivePlayers().length ? w.alivePlayers() : w.players;
    this.camX = pts[0]!.x; this.camY = pts[0]!.y - 80; this.zoom = 1.18;
    this.cameras.main.setBounds(0, 0, L.W * T, L.H * T);
    this.cameras.main.fadeIn(600, 3, 8, 7);
    this.registry.set('cam', { x: this.camX, y: this.camY, room: !!L.theme, active: true } satisfies CamInfo);
    this.game.events.emit('tt:ui', { k: 'worldReady' });
  }

  private drawFurniture(w: World): void {
    const g = this.furnG!; g.clear();
    for (const f of w.L.furniture!) {
      const x = f.x0 * T, wd = (f.x1 - f.x0 + 1) * T, y = f.y * T, fl = w.L.floorY! * T;
      if (f.kind === 'couch') {
        g.fillStyle(0x3a4a6a, 1); g.fillRoundedRect(x - 6, y - 34, wd + 12, 34, 10); // спинка
        g.fillStyle(0x4a5c80, 1); g.fillRoundedRect(x, y, wd, 22, 6); g.fillRect(x + 6, y + 18, wd - 12, fl - y - 18);
        g.fillStyle(0x3a4a6a, 1); g.fillRoundedRect(x - 14, y - 10, 20, fl - y + 10, 6); g.fillRoundedRect(x + wd - 6, y - 10, 20, fl - y + 10, 6);
        g.lineStyle(2, 0x2c3850, 1); for (let i = 1; i < 3; i++) g.lineBetween(x + (wd * i) / 3, y + 2, x + (wd * i) / 3, y + 20);
      } else if (f.kind === 'shelf') {
        g.fillStyle(0x5a4634, 1); g.fillRect(x, y, wd, 10); g.fillStyle(0x3b2f27, 1); g.fillRect(x + 10, y + 10, 6, 14); g.fillRect(x + wd - 16, y + 10, 6, 14);
        for (let i = 0; i < 5; i++) { g.fillStyle(0x6b3d14, 1); g.fillRoundedRect(x + 18 + i * 30, y - 26, 10, 26, 3); g.fillStyle(0xf4efe0, 1); g.fillRect(x + 18 + i * 30, y - 16, 10, 7); }
      } else {
        for (let yy = y; yy < fl; yy += 34) for (let xx = x; xx < x + wd; xx += 64) {
          g.fillStyle(0xc9a227, 1); g.fillRect(xx + 1, yy, 62, 33); g.lineStyle(2, 0x8a6a10, 1); g.strokeRect(xx + 1, yy, 62, 33);
          g.fillStyle(0x6b3d14, 1); for (let i = 0; i < 5; i++) g.fillCircle(xx + 10 + i * 11, yy + 6, 4);
        }
      }
    }
  }

  // ----- кадр -----
  override update(_time: number, delta: number): void {
    this.bind();
    const s = this.sess, w = this.w;
    if (!s || !w) { this.syncMirror(false); Music.play('menu'); Music.intensity = 1; return; }
    this.syncMirror(!!s.sr?.duel?.mods.includes('mirror') && !s.sr.done);
    const t0 = performance.now();
    // геймпад: пауза и карта
    const hub = this.sh.hub;
    const frames = hub.frames(w.nPlayers);
    if (hub.padEdge.pause) this.game.events.emit('tt:ui', { k: 'pauseKey' });
    if (hub.padEdge.map) this.game.events.emit('tt:ui', { k: 'mapKey' });
    s.speedFactor = s.sr ? 1 : this.sh.accessSpeed?.() ?? 1;
    const ticks = s.frame(delta, frames);
    // сессия могла сменить мир (глава → арена)
    if (s.world !== w) { this.bind(); }
    const cw = this.w!;
    const t1 = performance.now();
    this.consume(s);
    const dt = (Math.min(delta, 100) / 1000) * cw.slowK();
    this.render(cw, dt);
    this.outlines(cw);
    this.updateCamera(cw, dt);
    this.quality(cw, delta / 1000);
    Music.play(this.musicTrack(cw));
    Music.intensity = 1 + 0.07 * (cw.bossPhaseForMusic() - 1);
    this.perf.frame(t1 - t0, performance.now() - t1, ticks, this.game, this.gov.level, cw.enemies.length + cw.projs.length + cw.players.length);
  }
  /** качество графики: авто-снижение по FPS, фильтры камеры под главу и уровень */
  private quality(w: World, dtSec: number): void {
    const want = this.sh.gfx().quality;
    if (want !== this.gov.setting) this.gov.set(want, this.sh.touch);
    this.gov.frame(dtSec, this.game.loop.actualFps);
    const ch = w.camp ? w.camp.ch : 1, key = (w.L.theme ?? '') + ch;
    if (this.appliedQ !== this.gov.level || this.appliedKey !== key) {
      this.appliedQ = this.gov.level; this.appliedKey = key;
      applyCameraFx(this.cameras.main, this.gov.level, gradeMatrix(w.L.theme, ch));
    }
  }
  private musicTrack(w: World): string {
    if (w.won) return 'menu';
    if (w.mode === 'bosstest') return bossDef(w.bossKind)?.music ?? w.bossKind;
    const b = w.boss; return b && !['sleep', 'gone', 'dead'].includes(b.state) ? 'boss' : 'cave';
  }

  /** события ядра → звук, частицы, камера, интерфейс */
  private consume(s: Session): void {
    const gfx = this.sh.gfx();
    const cam = this.cameras.main;
    for (const e of s.fxq) {
      switch (e.k) {
        case 'snd': Snd.play(e['n'] as string); break;
        case 'trainHit': { // тренировка: здоровье не убывает, но удар виден «-1»
          const t = this.add.text(e['x'] as number, e['y'] as number, '-' + (e['n'] as number), { fontFamily: DISPLAY, fontSize: '26px', fontStyle: '700', color: '#ff8a7a', stroke: '#1a1410', strokeThickness: 5 }).setOrigin(0.5).setDepth(8.8);
          this.tweens.add({ targets: t, y: t.y - 46, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
          break;
        }
        case 'burst': case 'parts': this.parts.setParticleTint(e['c'] as number); this.parts.explode(Math.max(1, Math.round((e['n'] as number) * this.gov.particleMul)), e['x'] as number, e['y'] as number); break;
        case 'dust': this.dustE.explode(e['n'] as number, e['x'] as number, e['y'] as number); break;
        case 'smoke': this.smoke?.explode(e['n'] as number, e['x'] as number, e['y'] as number); break;
        case 'paper': this.paper?.explode(e['n'] as number, e['x'] as number, e['y'] as number); break;
        case 'foam': this.foam?.explode(e['n'] as number, e['x'] as number, e['y'] as number); break;
        case 'dustFx': this.dustFx?.explode(e['n'] as number, e['x'] as number, e['y'] as number); break;
        case 'shake': if (gfx.shake) cam.shake(e['d'] as number, e['i'] as number); break;
        case 'flash': if (!gfx.noflash) cam.flash(e['ms'] as number, e['r'] as number, e['g'] as number, e['b'] as number); else this.game.events.emit('tt:ui', { k: 'dim', d: e['ms'] }); break; // «без вспышек»: мягкое затемнение вместо белой вспышки
        case 'fade': if (e['out']) cam.fadeOut(e['ms'] as number, 3, 8, 7); else cam.fadeIn(e['ms'] as number, 3, 8, 7); break;
        case 'camSnap': { const w = s.world; const p = w.alivePlayers()[0] ?? w.players[0]!; this.camX = w.respawn.x; this.camY = w.respawn.y - 80; void p; break; }
        case 'repo': { const on = e['on'] as boolean; this.furnG?.setAlpha(on ? 0.18 : 1); this.stampTexts.forEach((t) => t.setVisible(on)); break; }
        case 'chargeSnd': if (e['on']) Snd.chargeStart(e['i'] as number, e['dur'] as number, e['id'] as string); else Snd.chargeStop(e['i'] as number); break;
        case 'enemyKill': break;
        case 'buzz': // отдача: вибрация телефона и геймпада (настройка «Вибрация»)
          if (gfx.vibro) {
            if (navigator.vibrate && e['ms']) { try { navigator.vibrate(e['ms'] as number); } catch { /* не поддерживается */ } }
            if (e['parry']) rumble(110, 0.25, 0.9); else rumble(e['dead'] ? 420 : 180, 0.9, 0.5);
          }
          break;
        default: this.game.events.emit('tt:ui', e);
      }
    }
    s.fxq.length = 0;
  }

  /** «Контуры опасного»: яркая обводка снарядов и шипов (доступность) */
  private outlines(w: World): void {
    const on = this.sh.gfx().outl && !w.td;
    if (!on) { this.accG?.clear(); return; }
    const g = this.accG ?? (this.accG = this.add.graphics().setDepth(8.5)); g.clear();
    const line = (x: number, y: number, ww: number, hh: number): void => { g.lineStyle(5, 0x000000, 0.65); g.strokeRect(x, y, ww, hh); g.lineStyle(2.5, 0xffe600, 1); g.strokeRect(x, y, ww, hh); };
    const wv = this.cameras.main.worldView;
    if (this.spkFor !== w.grid) {
      this.spkFor = w.grid; this.spk = [];
      for (let y = 0; y < w.L.H; y++) for (let x = 0; x < w.L.W; x++) if (w.grid[y]![x] === SPIKE) this.spk.push([x * T, y * T]);
    }
    for (const [x, y] of this.spk) if (x > wv.x - T && x < wv.right && y > wv.y - T && y < wv.bottom) line(x + 1, y + T * 0.38, T - 2, T * 0.62);
    for (const pr of w.projs) {
      if (pr.dead || (pr.delay ?? 0) > 0 || NOT_HARM.has(pr.kind) || !(pr.w > 0)) continue;
      line(pr.x - 1, pr.y - 1, pr.w + 2, pr.h + 2);
    }
  }
  private accG: Phaser.GameObjects.Graphics | null = null; private spkFor: unknown = null; private spk: [number, number][] = [];

  private render(w: World, dt: number): void {
    const fx = this.fx, fb = this.fb; fx.clear(); fb.clear();
    const now = w.animT;
    // таблички проявляются рядом с игроком
    for (const sg of this.signs) {
      const near = w.players.some((p) => Math.abs(p.x + 7 - sg.px) < 150 && Math.abs(p.y + 26 - sg.py) < 120);
      sg.txt.setAlpha(sg.txt.alpha + ((near ? 1 : 0) - sg.txt.alpha) * Math.min(1, dt * 8));
    }
    w.benches.forEach((b, i) => this.benchObjs[i]?.prompt.setAlpha((b as { near?: boolean }).near ? 1 : 0));
    // хвосты рывка
    for (const p of w.players) for (const tr of p.trail as { x: number; y: number; a: number }[]) { fb.fillStyle(p.pal.cloak, tr.a * 0.35); fb.fillEllipse(tr.x, tr.y - 13, 18, 22); }
    w.players.forEach((p, i) => {
      const pv = this.playerG[i]; if (!pv) return;
      const r = drawPlayer(w, p, pv.g, now);
      pv.tag.setVisible(!p.downed);
      if (!p.downed) pv.tag.setPosition(r.cx + p.face * 0.5, r.fy + (-12.5 - r.a.bob * 0.5) * r.sy).setScale(r.sx, r.sy).setAlpha(r.blink ? 0.35 : 1);
    });
    // враги: графика на каждого, убитых убираем
    const alive = new Set<object>();
    for (const e of w.enemies) {
      if (e.dead) continue;
      alive.add(e);
      let g = this.entG.get(e); if (!g) { g = this.add.graphics().setDepth(4); this.entG.set(e, g); }
      drawEnemy(e, g, now);
    }
    for (const [k, g] of this.entG) if (!alive.has(k)) { g.destroy(); this.entG.delete(k); }
    if (this.bossG) drawKorne(w.boss, this.bossG, now);
    drawItems(w, this.itemG, now);
    if (w.misha && this.mishaG && this.say.misha) drawMisha(w, w.misha, this.mishaG, now, this.sayOf(this.say.misha), (n, x, y) => this.smoke?.explode(n, x, y));
    this.letters.begin(); this.big.begin(); this.stamps.begin();
    if (w.vladik && this.vladikG && this.say.vladik) { drawCurtains(w, this.curtainG, this.slimeG, now); drawVladik(w.vladik, this.vladikG, now, this.sayOf(this.say.vladik)); }
    if (w.tima && this.timaG && this.say.tima) drawTima(w.tima, this.timaG, now, this.sayOf(this.say.tima), (n, x, y) => this.dustFx?.explode(n, x, y));
    w.bosses.forEach((db, i) => { const dg = this.dataG[i]; if (dg) drawDataBoss(w, db, dg, now); });
    // удары
    for (const p of w.players) drawSwingArc(w, p, fx);
    drawProjectiles(w, fx, fb, now, { letters: this.letters, big: this.big, stamps: this.stamps });
    drawPoiseBars(w, fx, now);
    if (w.bosses.length) drawDataProjs(w, fx, now);
    drawBeads(w, fx);
    this.letters.end(); this.big.end(); this.stamps.end();
    if (w.sr?.race) this.drawGhost(w, dt);
    this.stG.clear(); drawStatus(w, this.stG, now, (c, x, y) => { this.dustE.setParticleTint(c); this.dustE.explode(1, x, y); this.dustE.setParticleTint(0x8fae9c); });
    // ворота
    w.gates.forEach((gt, i) => {
      const g = this.gateG[i]; if (!g) return;
      this.gateAnim[i] = (this.gateAnim[i] ?? 0) + ((gt.closed ? 1 : 0) - (this.gateAnim[i] ?? 0)) * Math.min(1, dt * 6);
      const anim = this.gateAnim[i]!; g.clear(); if (anim < 0.02) return;
      const x = gt.x * T, top = gt.y0 * T, h = (gt.y1 - gt.y0 + 1) * T * anim;
      g.fillStyle(0x1f2a24, 1); g.fillRect(x + 2, top, T - 4, h);
      g.lineStyle(3, 0x4a3726, 1); for (let k = 0; k < 3; k++) g.lineBetween(x + 6 + k * 10, top, x + 6 + k * 10 + Math.sin(k * 2) * 3, top + h);
      g.lineStyle(2, 0x3b7448, 1); for (let yy = top + 10; yy < top + h; yy += 28) g.lineBetween(x + 2, yy, x + T - 2, yy + 6);
      if (gt.lockedUntilBoss) { g.fillStyle(0x9ff0c8, 0.6 + Math.sin(now * 3) * 0.2); g.fillCircle(x + T / 2, top + h / 2, 4); }
    });
    // выход
    const eg = this.exitG; eg.clear();
    if (w.exitR) {
      const ex = w.exitR.x + 20, ey = w.exitR.y + w.exitR.h;
      eg.lineStyle(4, 0x2a4636, 1); eg.beginPath(); eg.arc(ex, ey - 40, 30, Math.PI, 0, false); eg.strokePath();
      eg.lineBetween(ex - 30, ey - 40, ex - 30, ey); eg.lineBetween(ex + 30, ey - 40, ex + 30, ey);
      if (w.bossDead) {
        eg.fillStyle(0xffe3a3, 0.1 + Math.sin(now * 2) * 0.04); eg.fillRect(ex - 28, ey - 66, 56, 66);
        eg.lineStyle(2, 0xffe3a3, 0.8); eg.lineBetween(ex, ey - 70, ex, ey);
      }
    }
    // состояние для HUD
    this.registry.set('hud', { world: w, t: now });
  }
  /** полупрозрачный силуэт соперника, если он в той же главе и на том же этапе (legacy/speedrun.js drawGhost) */
  private drawGhost(w: World, dt: number): void {
    if (!this.ghostG) {
      this.ghostG = this.add.graphics().setDepth(4.8);
      this.ghostTag = this.add.text(0, 0, 'Соперник', { fontFamily: FONT, fontSize: '10px', fontStyle: '600', color: '#ffd9a0' }).setOrigin(0.5).setDepth(4.9);
    }
    const g = this.ghostG, tag = this.ghostTag!, o = this.sh.ghost?.() ?? null;
    g.clear();
    const same = o && performance.now() - o.at < 3000 && w.camp && o.c === w.camp.ch && o.s === w.camp.st;
    if (!o || !same) { tag.setVisible(false); this.ghostPos = null; return; }
    const gp = this.ghostPos ?? (this.ghostPos = { x: o.x, y: o.y }), age = Math.min(0.2, (performance.now() - o.at) / 1000), k = Math.min(1, dt * 12);
    gp.x += (o.x + (o.vx || 0) * age - gp.x) * k; gp.y += (o.y + (o.vy || 0) * age - gp.y) * k;
    const cx = gp.x + 7, fy = gp.y + 26, run = o.g && Math.abs(o.vx) > 10, ph = w.animT * 14;
    g.setPosition(cx, fy); g.setAlpha(0.38);
    drawWeaver(g, 0, 0, o.f || 1, PAL[1]!, { leg: run ? Math.sin(ph) * 5 : (o.g ? 0 : 2), bob: run ? Math.abs(Math.sin(ph)) * 1.5 : 0, sway: run ? -4 : (!o.g ? (o.vy < 0 ? -2 : 3) : 0), lift: (!o.g && o.vy > 0) ? -4 : 0 }, 1);
    tag.setVisible(true).setAlpha(0.6).setPosition(cx, fy - 52);
  }
  private sayOf(t: Phaser.GameObjects.Text): Say {
    return { show: (text, x, y) => { t.setText(text).setPosition(x, y).setVisible(true); }, hide: () => { t.setVisible(false); } };
  }

  private updateCamera(w: World, dt: number): void {
    const cam = this.cameras.main;
    if (w.tdFlip) { this.registry.set('cam', { x: this.camX, y: this.camY, room: !!w.L.theme, active: true } satisfies CamInfo); return; }
    const pts = w.alivePlayers().length ? w.alivePlayers() : w.players;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + p.w); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y + p.h); }
    const mi = w.testBoss(), withBoss = mi && (mi.state !== 'dead' || mi.t > 0.3);
    if (withBoss) { x0 = Math.min(x0, mi.x - 20); x1 = Math.max(x1, mi.x + mi.w + 20); y0 = Math.min(y0, mi.y - 40); }
    let tx = (x0 + x1) / 2; const ty = (y0 + y1) / 2 - 30;
    if (pts.length === 1 && !withBoss) tx += pts[0]!.face * 50;
    const VW = this.fit.vw;
    const zmin = Math.max(0.66, VW / (w.L.W * T), VH / (w.L.H * T));
    const zt = clamp(Math.min(VW / (x1 - x0 + 520), VH / (y1 - y0 + 300)), zmin, 1.18);
    const k = 1 - Math.exp(-dt * 5);
    this.camX += (tx - this.camX) * k; this.camY += (ty - this.camY) * k;
    this.zoom += (zt - this.zoom) * (1 - Math.exp(-dt * 3));
    cam.setZoom(this.fit.scale * this.zoom); cam.centerOn(this.camX, this.camY);
    this.registry.set('cam', { x: this.camX, y: this.camY, room: !!w.L.theme, active: true } satisfies CamInfo);
  }
}

