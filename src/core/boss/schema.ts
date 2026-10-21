// Схема данных боссов (data/bosses/*.json): язык атак, связки, политика выбора, фазы. Проверяется при загрузке (zod) и семантически (checkBossDef).
// Время везде в кадрах (60 в секунду), расстояния — в пикселях. Подробности и пример — docs/BOSS_DATA.md.
import { z } from 'zod';

export const HIT_KINDS = ['parry', 'dodge', 'unblockable'] as const;
export const CUE_COLORS = ['yellow', 'red', 'purple', 'white'] as const;
/** виды снарядов, которые умеет двигать ядро (stepProjs / stepExtraProj) */
export const PROJ_KINDS = ['spore', 'wave', 'rock', 'note', 'glob'] as const;

const frames = z.number().int().min(0);
const pos = z.number().int().min(1);

/** коробка удара: 'self' — от центра босса вперёд (зеркалится по взгляду), y — от верха босса; 'target' — от центра героя, зафиксированного к концу замаха */
const Box = z.strictObject({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(), at: z.enum(['self', 'target']).default('self') });

const RequiresSchema = z.strictObject({
  /** горизонтальная дистанция до ближайшего героя [мин, макс] */
  dist: z.tuple([z.number().min(0), z.number().min(0)]).optional(),
  /** номера фаз (1–3), в которых допустимо */
  phase: z.array(z.number().int().min(1).max(3)).min(1).optional(),
  /** где стоит босс: левая/правая треть арены или середина */
  arenaSide: z.enum(['left', 'right', 'center']).optional(),
  /** доля здоровья босса, ниже которой допустимо (0–1) */
  hpBelow: z.number().gt(0).lte(1).optional(),
});

const Active = z.strictObject({
  from: frames, to: frames, hit: Box, dmg: pos, kind: z.enum(HIT_KINDS),
  knock: z.strictObject({ vx: z.number(), vy: z.number() }).optional(),
});
const Move = z.strictObject({
  from: frames, to: frames, vx: z.number(), vy: z.number().default(0),
  /** player — знак vx относительно направления на героя; wall — к ближайшей к боссу стене; fixed — vx как есть (в мировых осях) */
  toward: z.enum(['player', 'wall', 'fixed']).default('player'),
});
const Spawn = z.strictObject({
  at: frames,
  proj: z.strictObject({ kind: z.enum(PROJ_KINDS), w: z.number().positive(), h: z.number().positive(), life: pos }),
  kind: z.enum(HIT_KINDS),
  /** от центра босса (self) вперёд, y — от центра по высоте; target — от героя, зафиксированного к концу замаха */
  from: z.enum(['self', 'target']).default('self'),
  ox: z.number().default(0), oy: z.number().default(0),
  vx: z.number().default(0), vy: z.number().default(0),
  /** целиться в героя (длина скорости = hypot(vx, vy)) */
  aim: z.boolean().default(false),
  count: z.number().int().min(1).max(12).default(1),
  /** угол веера между соседними снарядами, градусы */
  spread: z.number().min(0).max(180).default(0),
  dmg: pos.optional(),
});
const Tell = z.strictObject({
  frames: pos,
  cue: z.strictObject({ color: z.enum(CUE_COLORS), sfx: z.string().min(1), pose: z.string().min(1) }),
  /** взгляд фиксируется в начале замаха (иначе босс следит за героем до конца замаха) */
  lockFace: z.boolean().default(false),
});
const Recovery = z.strictObject({
  frames: pos,
  /** окно наказания — кадры восстановления, когда босс беззащитен для серии ударов (от начала восстановления) */
  punishWindow: z.strictObject({ from: frames, to: frames }),
});
export const AttackSchema = z.strictObject({
  id: z.string().min(1), name: z.string().optional(),
  tell: Tell, active: z.array(Active).default([]), move: z.array(Move).default([]), spawn: z.array(Spawn).default([]),
  recovery: Recovery, requires: RequiresSchema.optional(),
});

export const ChainSchema = z.strictObject({
  id: z.string().min(1),
  /** gapFrames — пауза после шага перед следующим замахом (по умолчанию — всё восстановление шага); у последнего шага игнорируется */
  steps: z.array(z.strictObject({ attack: z.string().min(1), gapFrames: frames.optional() })).min(1),
  weight: z.number().positive(),
  requires: RequiresSchema.optional(),
  /** сколько кадров связку нельзя выбирать после использования */
  cooldown: frames.default(0),
});

export const PolicySchema = z.strictObject({
  chains: z.array(z.string().min(1)).min(1),
  /** сколько последних связок нельзя выбирать повторно */
  noRepeat: frames,
  /** усталость: вес связки умножается на factor за каждое недавнее использование; одно использование «забывается» за decay кадров */
  fatigue: z.strictObject({ factor: z.number().gt(0).lte(1), decay: pos }).optional(),
  /** пауза между связками: [мин, макс] кадров */
  restFrames: z.tuple([frames, frames]),
  /** приоритеты («отогнать»): если герой ближе closeDist подряд closeFrames кадров, выбирается chain, минуя веса */
  priority: z.array(z.strictObject({ chain: z.string().min(1), closeDist: z.number().positive(), closeFrames: pos })).default([]),
});

export const PhaseSchema = z.strictObject({
  /** фаза включается, когда hp/maxHp ≤ fromHp (у первой — 1) */
  fromHp: z.number().gt(0).lte(1),
  /** сколько кадров босс неуязвим при входе в фазу (рёв) */
  rageFrames: frames.default(0),
  /** вставка-сцена после рёва; skippable — пропускается нажатием прыжка или удара */
  scene: z.strictObject({ frames: pos, skippable: z.boolean(), say: z.string().optional() }).optional(),
  /** переходный приём с телеграфом — id связки */
  enterChain: z.string().min(1).optional(),
  policy: PolicySchema,
});

export const BossDefSchema = z.strictObject({
  id: z.string().min(1), name: z.string().min(1), about: z.string().default(''),
  /** арена из levels/tropa.ldtk: 'misha' | 'vladik' | 'tima' */
  arena: z.enum(['misha', 'vladik', 'tima']),
  size: z.strictObject({ w: pos, h: pos }),
  /** здоровье для одного и двух героев */
  hp: z.tuple([pos, pos]),
  color: z.number().int().min(0).max(0xffffff).default(0x8a7d6a),
  music: z.string().optional(),
  intro: z.strictObject({ frames: pos, say: z.string().optional() }),
  deathFrames: pos.default(150),
  idle: z.strictObject({ walkSpeed: z.number().min(0), keepDist: z.number().min(0) }).default({ walkSpeed: 0, keepDist: 0 }),
  /** урон от касания тела (по умолчанию нет) */
  contact: z.strictObject({ dmg: pos, kind: z.enum(HIT_KINDS) }).optional(),
  attacks: z.array(AttackSchema).min(1),
  chains: z.array(ChainSchema).min(1),
  phases: z.array(PhaseSchema).min(1).max(3),
});

/** правила честности (data/bosses/rules.json) */
export const RulesSchema = z.strictObject({
  /** минимальный замах для атаки с ударами такого типа (берётся максимум по типам атаки) */
  minTellFrames: z.strictObject({ parry: pos, dodge: pos, unblockable: pos }),
  minRecoveryFrames: pos,
  minPunishFrames: pos,
});

export type Attack = z.output<typeof AttackSchema>;
export type Chain = z.output<typeof ChainSchema>;
export type Policy = z.output<typeof PolicySchema>;
export type Phase = z.output<typeof PhaseSchema>;
export type BossDef = z.output<typeof BossDefSchema>;
export type Requires = z.output<typeof RequiresSchema>;
export type Rules = z.output<typeof RulesSchema>;
export type BoxDef = z.output<typeof Box>;

/** Конец «рабочей» части атаки (последний кадр удара/движения/выстрела, считая от конца замаха); −1, если нет ничего */
export function activeEnd(a: Attack): number {
  let e = -1;
  for (const x of a.active) e = Math.max(e, x.to);
  for (const x of a.move) e = Math.max(e, x.to);
  for (const x of a.spawn) e = Math.max(e, x.at);
  return e;
}
/** Все типы ударов атаки (удары и снаряды) */
export function hitKindsOf(a: Attack): Set<string> {
  const s = new Set<string>();
  for (const x of a.active) s.add(x.kind);
  for (const x of a.spawn) s.add(x.kind);
  return s;
}

/** Семантические проверки поверх схемы; возвращает список ошибок на русском (пусто — всё в порядке). */
export function checkBossDef(def: BossDef, rules: Rules): string[] {
  const errs: string[] = [];
  const dup = (what: string, ids: string[]): void => { const seen = new Set<string>(); for (const i of ids) { if (seen.has(i)) errs.push(`${what} «${i}» повторяется`); seen.add(i); } };
  dup('атака', def.attacks.map((a) => a.id)); dup('связка', def.chains.map((c) => c.id));
  const atk = new Map(def.attacks.map((a) => [a.id, a])), chn = new Map(def.chains.map((c) => [c.id, c]));
  for (const a of def.attacks) {
    const at = `атака «${a.id}»`;
    for (const x of a.active) if (x.to < x.from) errs.push(`${at}: active.to < active.from`);
    for (const x of a.move) if (x.to < x.from) errs.push(`${at}: move.to < move.from`);
    const kinds = hitKindsOf(a);
    let need = 0;
    for (const k of kinds) need = Math.max(need, rules.minTellFrames[k as 'parry' | 'dodge' | 'unblockable']);
    if (kinds.size && a.tell.frames < need) errs.push(`${at}: замах ${a.tell.frames} кадров короче нормы ${need}`);
    if (a.recovery.frames < rules.minRecoveryFrames) errs.push(`${at}: восстановление ${a.recovery.frames} кадров короче нормы ${rules.minRecoveryFrames}`);
    const pw = a.recovery.punishWindow;
    if (pw.to < pw.from) errs.push(`${at}: punishWindow.to < from`);
    else if (pw.to >= a.recovery.frames) errs.push(`${at}: окно наказания выходит за восстановление`);
    else if (pw.to - pw.from + 1 < rules.minPunishFrames) errs.push(`${at}: окно наказания ${pw.to - pw.from + 1} кадров короче нормы ${rules.minPunishFrames}`);
    if (a.requires?.dist && a.requires.dist[0] > a.requires.dist[1]) errs.push(`${at}: requires.dist [мин, макс] перепутаны`);
    if (!a.active.length && !a.move.length && !a.spawn.length) errs.push(`${at}: пустая атака (нет ни ударов, ни движения, ни снарядов)`);
  }
  for (const c of def.chains) {
    for (const s of c.steps) if (!atk.has(s.attack)) errs.push(`связка «${c.id}»: нет атаки «${s.attack}»`);
    if (c.requires?.dist && c.requires.dist[0] > c.requires.dist[1]) errs.push(`связка «${c.id}»: requires.dist [мин, макс] перепутаны`);
  }
  def.phases.forEach((ph, i) => {
    const at = `фаза ${i + 1}`;
    if (i === 0 && ph.fromHp !== 1) errs.push(`${at}: у первой фазы fromHp должен быть 1`);
    if (i > 0 && ph.fromHp >= def.phases[i - 1]!.fromHp) errs.push(`${at}: fromHp должен убывать`);
    if (ph.enterChain && !chn.has(ph.enterChain)) errs.push(`${at}: нет связки «${ph.enterChain}» для enterChain`);
    for (const id of ph.policy.chains) if (!chn.has(id)) errs.push(`${at}: политика ссылается на неизвестную связку «${id}»`);
    for (const p of ph.policy.priority) if (!chn.has(p.chain)) errs.push(`${at}: приоритет ссылается на неизвестную связку «${p.chain}»`);
    if (ph.policy.restFrames[0] > ph.policy.restFrames[1]) errs.push(`${at}: restFrames [мин, макс] перепутаны`);
    if (ph.policy.noRepeat >= ph.policy.chains.length && ph.policy.chains.length > 1) errs.push(`${at}: noRepeat ${ph.policy.noRepeat} не меньше числа связок`);
  });
  return errs;
}

/** Разбор и проверка определения босса: бросает понятную ошибку по-русски. */
export function parseBossDef(raw: unknown, rules: Rules): BossDef {
  const r = BossDefSchema.safeParse(raw);
  if (!r.success) throw new Error('босс не по схеме:\n  ' + r.error.issues.map((i) => `${i.path.join('.') || 'корень'}: ${i.message}`).join('\n  '));
  const errs = checkBossDef(r.data, rules);
  if (errs.length) throw new Error(`босс «${r.data.id}» нечестный:\n  ` + errs.join('\n  '));
  return r.data;
}
export function parseRules(raw: unknown): Rules {
  const r = RulesSchema.safeParse(raw);
  if (!r.success) throw new Error('data/bosses/rules.json не по схеме:\n  ' + r.error.issues.map((i) => `${i.path.join('.') || 'корень'}: ${i.message}`).join('\n  '));
  return r.data;
}
