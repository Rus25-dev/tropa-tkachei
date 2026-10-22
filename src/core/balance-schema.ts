// Схема data/balance.json: проверяется при загрузке ядра и при переопределении баланса в Node-инструментах (бот, Optuna).
// Без внешних библиотек: схема — дерево, листья: 'n' — конечное число, ['n', k] — массив из k конечных чисел.
// Лишние и недостающие ключи — ошибка (опечатка в баланса не должна молча ничего менять).

type Leaf = 'n' | readonly ['n', number];
interface Tree { [k: string]: Leaf | Tree }

const SCHEMA: Tree = {
  P: Object.fromEntries(['G', 'RUN', 'JUMP', 'CUT', 'MAXFALL', 'COYOTE', 'BUF', 'DASH', 'DASHT', 'DASHCD', 'WSLIDE', 'WJX', 'WJY', 'WJLOCK', 'POGO', 'ATK_T', 'ATK_CD', 'INV', 'HURT', 'SILK',
    'BURST', 'HEAL', 'HEAL_T', 'PARRY_T', 'PARRY_CD', 'APEX_VY', 'APEX_G', 'ATKBUF', 'DASHBUF', 'CORNER'].map((k) => [k, 'n' as const])),
  BAL: { hp: { boss: ['n', 2], vladik: ['n', 2], tima: ['n', 2], misha: ['n', 2] }, pace: { boss: 'n', vladik: 'n', tima: 'n', misha: 'n' }, silkEvery: 'n' },
  POISE_MAX: { '1': 'n', '2': 'n', '3': 'n' },
  STAGGER_T: 'n',
  EXEC_FRAC: 'n',
  TOOL: Object.fromEntries(['NEEDLE_SPD', 'NEEDLE_DMG', 'NEEDLE_STICK', 'TRAP_LIFE', 'TRAP_FREEZE', 'TRAP_MAX', 'TRAP_POISE', 'BOMB_R', 'BOMB_DMG', 'BOMB_FUSE', 'HOOK_R', 'HOOK_SPD', 'HOOK_STUN'].map((k) => [k, 'n' as const])),
  PARRY2: Object.fromEntries(['PERFECT_F', 'PERFECT_LEGACY', 'PERFECT_SILK', 'PERFECT_POISE_MUL', 'POSTURE_NORMAL_POISE', 'PERFECT_HITSTOP', 'COUNTER_T', 'COUNTER_DMG', 'COUNTER_POISE_MUL'].map((k) => [k, 'n' as const])),
  CH_T: 'n', CH_SHOW: 'n', CH_SLOW: 'n',
  MV2: { GLIDE_V: 'n', GLIDE_DEC: 'n', GLIDE_HOLD: 'n', CLIMB_T: 'n' },
  STATUS: { poison: { iv: 'n', n: 'n' }, burn: { iv: 'n', n: 'n' }, slow: { t: 'n' } },
};

export interface BalanceData {
  P: Record<'G' | 'RUN' | 'JUMP' | 'CUT' | 'MAXFALL' | 'COYOTE' | 'BUF' | 'DASH' | 'DASHT' | 'DASHCD' | 'WSLIDE' | 'WJX' | 'WJY' | 'WJLOCK' | 'POGO' | 'ATK_T' | 'ATK_CD' | 'INV' | 'HURT' | 'SILK' |
    'BURST' | 'HEAL' | 'HEAL_T' | 'PARRY_T' | 'PARRY_CD' | 'APEX_VY' | 'APEX_G' | 'ATKBUF' | 'DASHBUF' | 'CORNER', number>;
  BAL: { hp: Record<'boss' | 'vladik' | 'tima' | 'misha', number[]>; pace: Record<'boss' | 'vladik' | 'tima' | 'misha', number>; silkEvery: number };
  POISE_MAX: Record<number, number>;
  STAGGER_T: number; EXEC_FRAC: number;
  TOOL: Record<'NEEDLE_SPD' | 'NEEDLE_DMG' | 'NEEDLE_STICK' | 'TRAP_LIFE' | 'TRAP_FREEZE' | 'TRAP_MAX' | 'TRAP_POISE' | 'BOMB_R' | 'BOMB_DMG' | 'BOMB_FUSE' | 'HOOK_R' | 'HOOK_SPD' | 'HOOK_STUN', number>;
  PARRY2: Record<'PERFECT_F' | 'PERFECT_LEGACY' | 'PERFECT_SILK' | 'PERFECT_POISE_MUL' | 'POSTURE_NORMAL_POISE' | 'PERFECT_HITSTOP' | 'COUNTER_T' | 'COUNTER_DMG' | 'COUNTER_POISE_MUL', number>;
  CH_T: number; CH_SHOW: number; CH_SLOW: number;
  MV2: Record<'GLIDE_V' | 'GLIDE_DEC' | 'GLIDE_HOLD' | 'CLIMB_T', number>;
  STATUS: { poison: { iv: number; n: number }; burn: { iv: number; n: number }; slow: { t: number } };
}
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends number ? number : T[K] extends number[] ? number[] : DeepPartial<T[K]> };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function check(schema: Tree, data: unknown, path: string, partial: boolean, errs: string[]): void {
  if (!isObj(data)) { errs.push(`${path || 'корень'}: ожидался объект`); return; }
  for (const k of Object.keys(data)) if (!(k in schema) && !(path === '' && k === '_')) errs.push(`${path}${k}: неизвестный ключ`);
  for (const k of Object.keys(schema)) {
    const sch = schema[k]!, v = data[k], here = `${path}${k}`;
    if (v === undefined) { if (!partial) errs.push(`${here}: нет значения`); continue; }
    if (sch === 'n') { if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${here}: нужно конечное число`); }
    else if (Array.isArray(sch)) {
      const n = (sch as readonly ['n', number])[1];
      if (!Array.isArray(v) || v.length !== n || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) errs.push(`${here}: нужен массив из ${n} чисел`);
    } else check(sch as Tree, v, here + '.', partial, errs);
  }
}

/** Проверяет баланс по схеме; partial — можно передавать только часть полей (переопределение). Бросает понятную ошибку. */
export function validateBalance(data: unknown, partial: false): BalanceData;
export function validateBalance(data: unknown, partial: true): DeepPartial<BalanceData>;
export function validateBalance(data: unknown): BalanceData;
export function validateBalance(data: unknown, partial = false): unknown {
  const errs: string[] = [];
  check(SCHEMA, data, '', partial, errs);
  if (errs.length) throw new Error('data/balance.json не по схеме:\n  ' + errs.join('\n  '));
  return data;
}
