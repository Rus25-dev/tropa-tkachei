// Тело босса по фазам (волна 0): размер, полёт/земля, неподвижность, рисовальщик-вариант, набор приёмов, уязвимые точки.
// Формы фаз накапливаются: тело фазы n = базовое тело босса + формы фаз 1…n по порядку (policy формы не накапливается — она только у своей фазы).
// Чистые функции от определения: состояния нет, поэтому тренировка («старт с фазы 2») получает то же тело, что и бой.
import type { BossDef, Form, Weak } from './schema';

export interface FlyEff { hover: number; speed: number; bob: number }
export interface FormEff {
  size: { w: number; h: number };
  fly: FlyEff | null;
  still: boolean;
  /** имя варианта рисовальщика (src/view/draw/boss/<id>.ts) или null */
  draw: string | null;
  color: number;
  /** разрешённые приёмы или null — все */
  attacks: Set<string> | null;
  idle: { walkSpeed: number; keepDist: number };
  contact: { dmg: number; kind: 'parry' | 'dodge' | 'unblockable' } | null;
  weak: Weak[];
}

const CACHE = new WeakMap<BossDef, FormEff[]>();

/** Эффективное тело босса в фазе phase (1…) */
export function effForm(def: BossDef, phase: number): FormEff {
  let list = CACHE.get(def);
  if (!list) {
    list = [];
    let cur: FormEff = {
      size: { ...def.size }, fly: def.fly ? { ...def.fly } : null, still: def.still, draw: null, color: def.color, attacks: null,
      idle: { ...def.idle }, contact: def.contact ? { ...def.contact } : null, weak: def.weak,
    };
    def.phases.forEach((ph) => {
      cur = applyForm(cur, ph.form);
      list!.push(cur);
    });
    CACHE.set(def, list);
  }
  return list[Math.max(0, Math.min(list.length - 1, phase - 1))]!;
}

function applyForm(base: FormEff, f: Form | undefined): FormEff {
  if (!f) return base;
  return {
    size: f.size ? { ...f.size } : base.size,
    fly: f.fly === undefined ? base.fly : f.fly === false ? null : { ...f.fly },
    still: f.still ?? base.still,
    draw: f.draw ?? base.draw,
    color: f.color ?? base.color,
    attacks: f.attacks ? new Set(f.attacks) : base.attacks,
    idle: f.idle ? { ...f.idle } : base.idle,
    contact: f.contact === undefined ? base.contact : f.contact === false ? null : { ...f.contact },
    weak: f.weak ?? base.weak,
  };
}

/** Тело фазы отличается от тела предыдущей (есть что показывать превращением) */
export function formChanges(def: BossDef, phase: number): boolean {
  if (phase <= 1) return false;
  const a = effForm(def, phase - 1), b = effForm(def, phase);
  return a !== b;
}
