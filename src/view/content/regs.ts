// Реестры отрисовки и звука содержимого (вид): по файлу на вещь в src/view/content/<вид>/<id>.ts, файлы находит index.ts.
// Лист без зависимостей, кроме типов: отрисовка импортирует реестры отсюда без циклов.
import type Phaser from 'phaser';
import { Registry } from '../../core/plugin/registry';
import type { Enemy, Player, Proj, Rect } from '../../core/types';
import type { Swing } from '../../core/weapon-kit';
import type { World } from '../../core/world';
import type { G } from '../draw/common';

/** всё, что видит отрисовка удара оружия */
export interface SwingCtx {
  w: World; p: Player; sw: Swing;
  /** 1 → 0 за время удара; el = 1 − k */
  k: number; el: number;
  /** центр героя, направление удара ('f' | 'u' | 'd'), сторона f (±1), угол th, угол взгляда начала удара th0 */
  cx: number; cy: number; dir: string; f: number; th: number; th0: number;
  /** точка дуги для ударов вверх/вниз (смещена на 4 px) */
  ox: number; oy: number;
  /** цвет оружия и акцент героя; коробка удара ядра */
  col: number; acc: number; box: Rect;
}
export interface WeaponView {
  id: string;
  /** высота тона гула заряда, Гц (по умолчанию 200) */
  chargePitch?: number;
  /** клинок за спиной (без заряда); нет — рисуется стандартная игла героя */
  back?: (g: G, f: number, y0: number, bob: number, col: number) => void;
  /** поза заряда: оружие занесено назад (поверх общей рукояти); jx — дрожание */
  pull?: (g: G, f: number, jx: number, col: number) => void;
  /** этот вид удара рисует исходная дуга v1.8 (например, обычные удары иглы) */
  defaultArc?: (k: string) => boolean;
  /** заряженный удар (вид 'c') */
  charge?: (fx: G, c: SwingCtx) => void;
  /** остальные удары (g, f, a1, a2) */
  swing?: (fx: G, c: SwingCtx) => void;
}
export const defineWeaponView = (v: WeaponView): WeaponView => v;
export const weaponViewReg = new Registry<WeaponView>('отрисовка оружия');

/* eslint-disable @typescript-eslint/no-explicit-any -- сущности инструментов: мешок полей ядра */
type Q = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */
/** отрисовка инструмента: значок под катушкой нити, сущности (по виду q.kind), эффекты (по имени f в w.tfx), общий слой мира */
export interface ToolView {
  id: string;
  /** значок 26×26 вокруг (cx, cy) цветом col (линия и заливка уже выставлены этим цветом) */
  icon?: (g: G, cx: number, cy: number, col: number) => void;
  /** сущность в w.tl: x, y — центр */
  ents?: Record<string, (fx: G, q: Q, now: number, x: number, y: number) => void>;
  /** кратковременный эффект из w.tfx: k — 1 → 0 */
  fx?: Record<string, (fx: G, f: Q, k: number, w: World) => void>;
  /** слой поверх мира (например, нить крюка от героя к точке зацепа) */
  world?: (fx: G, w: World, now: number) => void;
}
export const defineToolView = (v: ToolView): ToolView => v;
export const toolViewReg = new Registry<ToolView>('отрисовка инструментов');
export const toolEntView = new Map<string, NonNullable<ToolView['ents']>[string]>();
export const tfxView = new Map<string, NonNullable<ToolView['fx']>[string]>();
toolViewReg.onDefine((v) => { for (const [k, f] of Object.entries(v.ents ?? {})) toolEntView.set(k, f); for (const [k, f] of Object.entries(v.fx ?? {})) tfxView.set(k, f); });

/** отрисовка приёма героя: значок HUD, эффекты по коду состояния (kitCode), следы по коду s, поза поверх героя */
export interface AbilityView {
  id: string;
  /** значок HUD радиусом ~10 вокруг (cx, cy) цветом c (линия и заливка уже этим цветом) */
  icon?: (g: G, cx: number, cy: number, c: number, ic: { frac: number; ready: boolean; active: boolean }) => void;
  /** HUD: вместо тёмного сектора отката — растущая дуга заряда (пока приём активен и не готов) */
  chargeArc?: boolean;
  /** эффект вокруг героя по коду состояния (система координат героя: 0,0 — ноги по центру) */
  fx?: Record<number, (g: G, p: Player, now: number, code: number) => void>;
  /** вид следа по коду s: цвет, прозрачность (множитель), размер */
  trails?: Record<number, { col: number; a: number; w?: number; h?: number }>;
  /** поза поверх героя каждый кадр (например, кольцо контрудара) */
  pose?: (g: G, p: Player, w: World) => void;
}
export const defineAbilityView = (v: AbilityView): AbilityView => v;
export const abilityViewReg = new Registry<AbilityView>('отрисовка приёмов');
export const kitFxView = new Map<number, NonNullable<AbilityView['fx']>[number]>();
export const trailView = new Map<number, NonNullable<AbilityView['trails']>[number]>();
abilityViewReg.onDefine((v) => { for (const [k, f] of Object.entries(v.fx ?? {})) kitFxView.set(+k, f); for (const [k, t] of Object.entries(v.trails ?? {})) trailView.set(+k, t); });

/** отрисовка врага по виду (e.type); g уже очищен */
export interface EnemyView { id: string; draw: (g: G, e: Enemy, now: number) => void }
export const defineEnemyView = (v: EnemyView): EnemyView => v;
export const enemyViewReg = new Registry<EnemyView>('отрисовка врагов');

/** снаряд: отрисовка по виду (src/view/content/projectiles/<kind>.ts). draw вызывается и во время задержки (pr.delay > 0) — предупреждение рисует сам вид. */
export interface ProjView {
  id: string; order?: number;
  draw: (g: G, pr: Proj, now: number) => void;
  /** у снарядов боссов на данных поверх контура цвета удара — заливка кругом (ноты, плевки) */
  round?: boolean;
}
export const defineProjView = (v: ProjView): ProjView => v;
export const projViewReg = new Registry<ProjView>('отрисовка снарядов');

/** синтезатор, который получает функция звука (src/view/audio/snd.ts) */
export interface Synth {
  ctx: AudioContext; master: GainNode;
  /** тон: форма волны, частота от f0 к f1 за dur секунд, громкость */
  tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number): void;
  /** шум через полосовой фильтр */
  hiss(dur: number, vol: number, freq: number, q?: number): void;
  /** вызвать fn(i) через ms[i] миллисекунд */
  later(ms: number[], fn: (i: number) => void): void;
}
/** звук по имени (ядро называет его событием 'snd', данные боссов — полем sfx) */
export interface SoundDef { id: string; order?: number; play: (s: Synth, R: () => number) => void }
/** несколько звуков одним файлом src/view/content/sounds/<группа>.ts: { имя: (s, R) => … } */
export const defineSounds = (m: Record<string, SoundDef['play']>): SoundDef[] => Object.entries(m).map(([id, play]) => ({ id, play }));
export const soundReg = new Registry<SoundDef>('звуки');

/** что получает убранство арены при постройке сцены мира */
export interface ArenaDecorCtx {
  scene: Phaser.Scene; w: World;
  /** запомнить объект убранства: он уничтожается при смене мира */
  keep<O extends Phaser.GameObjects.GameObject>(o: O): O;
  /** шрифты сцены: обычный и заголовочный */
  font: string; display: string;
}
type EmitterCfg = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
/** убранство арены (src/view/content/arenas/<id>.ts): надписи, ящики, мебель, частицы по событиям ядра */
export interface ArenaView {
  id: string; order?: number;
  decor?: (c: ArenaDecorCtx) => void;
  /** частицы по событию ядра с этим именем ({ n, x, y }): текстура, настройка излучателя, глубина */
  bursts?: Record<string, { key: string; cfg: EmitterCfg; depth: number }>;
}
export const defineArenaView = (v: ArenaView): ArenaView => v;
export const arenaViewReg = new Registry<ArenaView>('убранство арен');
