// Типы ядра. Сущности v1.8 — «мешки» полей: у каждого босса и врага свои поля состояния, поэтому у них индексная сигнатура.
// (Строгая типизация полей боссов — задача этапа 2.3, когда их автомат состояний уйдёт в данные.)
import type { Pal } from './balance';

export interface Rect { x: number; y: number; w: number; h: number }

export interface Body extends Rect {
  vx: number; vy: number;
  onGround?: boolean; hitL?: boolean; hitR?: boolean; hitU?: boolean; noPlat?: boolean;
}

/** Ввод одного тика: удержание (raw) и фронты нажатий (pend → carry → inp). */
export interface Inp {
  left?: boolean; right?: boolean; up?: boolean; down?: boolean; jump?: boolean; atk?: boolean; dash?: boolean; heal?: boolean; bomb?: boolean; tool?: boolean;
  jumpP?: boolean; atkP?: boolean; dashP?: boolean; healP?: boolean; upP?: boolean; bombP?: boolean; toolP?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- «мешки» полей из v1.8, см. заголовок файла */
export interface Player extends Body {
  i: number; pal: Pal; face: number; onGround: boolean;
  hp: number; maxHp: number; silk: number; inv: number; hurtT: number; kbx: number; downed: boolean; reviveT: number;
  coyote: number; jumpBuf: number; jumpCut: boolean; dashT: number; dashCd: number; canDash: boolean; atkT: number; atkCd: number; atkDir: string;
  atkHits: Set<unknown> | null; pogoed: boolean; safeX: number; safeY: number; groundT: number; wallDir: number; wjLock: number; healT: number; landT: number;
  sit: boolean; prev: Inp; inp: Inp; raw: Inp; pend: Inp; carry: Inp; tapHold?: any; trail: unknown[]; bombs: number; bombCd: number;
  remote?: boolean;
  [k: string]: any;
}
export interface Enemy extends Body { type: string; face: number; flash: number; kbT: number; kbx: number; kby: number; dead: boolean; t: number; hp: number; beads: number; [k: string]: any }
export interface Boss extends Body { posture?: boolean; hp: number; maxHp: number; state: string; t: number; face: number; flash: number; phase?: number; [k: string]: any }
/** Тип удара (язык атак боссов, 2.5): parry — можно отбить; dodge — только уворот; unblockable — не отбивается и не гасится рывком, только избежать. */
export type HitKind = 'parry' | 'dodge' | 'unblockable';
/** hk — тип удара снаряда; без поля считается 'parry' (прежнее поведение). dmg — урон, если не задан: по виду снаряда (HEAVY_KINDS). */
export interface Proj extends Rect { kind: string; vx: number; vy: number; life: number; dead?: boolean; delay?: number; hk?: HitKind; dmg?: number; [k: string]: any }
export interface Bead extends Body { t: number; dead?: boolean }
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface Gate { x: number; y0: number; y1: number; closed?: boolean; anim?: number; lockedUntilBoss?: boolean }

export interface Level {
  W: number; H: number; grid: number[][];
  spawn: { x: number; y: number };
  signs: { x: number; y: number; text: string; touch?: string }[];
  benches: { x: number; y: number }[];
  enemies: { type: string; x: number; y: number }[];
  items?: { ability: string; x: number; y: number; text: string }[];
  boss?: { x: number; y: number; arenaX0: number; arenaX1: number; trigger: number; floorY?: number };
  gateIn?: Gate; gateOut?: Gate;
  gates?: (Gate | undefined)[];
  exit: { x: number; y: number } | null;
  areas: { x: number; name: string }[];
  region?: string; road?: number; theme?: string;
  crates?: { x: number; y: number }[];
  misha?: { x: number; y: number }; ceilY?: number;
  vladik?: { x: number; y: number }; tima?: { x: number; y: number }; floorY?: number;
  windows?: number[][]; curtains?: number[][];
  furniture?: { kind: string; x0: number; x1: number; y: number }[];
}

/** Событие для отрисовки и звука: ядро ничего не рисует и не играет, а складывает сюда. */
export interface FxEvent { k: string; [key: string]: unknown }
