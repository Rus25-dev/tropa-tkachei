// Числа и справочники игры. Перенесены из v1.8 без изменений (legacy/src/game.js, bosses2.js, campaign.js, weapons.js, tools.js, charms.js, status.js).
// Настраиваемые числа (P, BAL, TOOL, MV2, стойкость, статусы, заряд) лежат в data/balance.json; схема проверяется при загрузке.
// Остальное (справочники, названия, цвета) остаётся в коде. Значения в JSON равны значениям v1.8: золотые записи проходят побитно.
import raw from '../../data/balance.json' with { type: 'json' };
import { validateBalance, type BalanceData } from './balance-schema';

const J: BalanceData = validateBalance(raw);
export const T = 32;
export const EMPTY = 0, SOLID = 1, PLAT = 2, SPIKE = 3;

export const P = J.P;

export interface Pal { name: string; tag: string; cloak: number; dark: number; accent: number; hex: string }
export const PAL: readonly Pal[] = [
  { name: 'Ива', tag: 'Di', cloak: 0x2f9a8a, dark: 0x1b5c53, accent: 0x9ff0dc, hex: '#8fe8d2' },
  { name: 'Ярь', tag: 'Ta', cloak: 0xd8862a, dark: 0x8a4f16, accent: 0xffd9a0, hex: '#ffc46e' },
];

// снаряды, которые не гаснут при попадании в героя (волны, бумеранги, призрак)
export const PERSIST_KINDS = new Set(['wave', 'clef', 'echo']);
// тяжёлые удары боссов отнимают 2 бутона: у них длинный телеграф, и их можно красиво избежать
export const HEAVY_KINDS = new Set(['wave', 'echo']);
// снаряды, которые срезает обычный взмах
export const SLASH_KINDS = new Set(['spore', 'note', 'glob']);

export const BAL = J.BAL;

// ----- стойкость и казнь (bosses2.js) -----
export const POISE_MAX: Record<number, number> = J.POISE_MAX;
/** сколько босс стоит оглушённым */
export let STAGGER_T = J.STAGGER_T;
/** казнь снимает столько от полного здоровья босса */
export let EXEC_FRAC = J.EXEC_FRAC;
/** боссы на данных (sc.bosses[i]) называются 'd0', 'd1', … */
export type DataBossKey = `d${number}`;
export type BossRef = DataBossKey;
export const dataKey = (i: number): DataBossKey => `d${i}`;
/** индекс босса на данных по ключу или -1 */
export const dataIdx = (k: string): number => (/^d\d+$/.test(k) ? +k.slice(1) : -1);

// ----- состояния новых врагов (enemies2.js) -----
export const E2_VULN = ['erupt', 'tell', 'pounce', 'tired']; // засадника можно бить только вне земли
export const E2_UNDER = ['hidden', 'track', 'warn', 'dig']; // в этих состояниях тело спрятано на 50 px под полом

// ----- инструменты (tools.js) -----
export const TOOL = J.TOOL;
export const FLY_TYPES = new Set(['gnat', 'bat', 'lurker']);

// ----- оружие (weapons.js) -----
/** сколько держать удар до заряженного */
export let CH_T = J.CH_T;
/** с какого момента герой светится и замедляется */
export let CH_SHOW = J.CH_SHOW;
/** множитель скорости бега при заряде */
export let CH_SLOW = J.CH_SLOW;

// ----- отбив 2.0 (v2.5): идеальный отбив и контратака -----
/** PERFECT_F — сколько первых кадров окна отбива «идеальные» (только для ударов с явным hk; PERFECT_LEGACY=1 — и для ударов без hk, это ломает золотые записи); PERFECT_SILK — нить за идеальный (обычный даёт 1); PERFECT_POISE_MUL — множитель стойкости босса;
 *  POSTURE_NORMAL_POISE — стойкость за обычный отбив у боссов с posture:true (у остальных 3, как в v2.0); COUNTER_* — окно контратаки после идеального отбива. */
export const PARRY2 = J.PARRY2;

// ----- движение 2 (movement2.js) -----
export const MV2 = J.MV2;

// ----- набор приёмов игрока (v2.5, src/core/kit): теневой рывок, воздушная вспышка, кристальный рывок, нитяные заклинания -----
export const KIT = J.KIT;

// ----- статусы (status.js) -----
export const STATUS_KINDS = {
  poison: { name: 'Яд', iv: J.STATUS.poison.iv, n: J.STATUS.poison.n, col: 0x86e05a, bit: 1 },
  burn: { name: 'Ожог', iv: J.STATUS.burn.iv, n: J.STATUS.burn.n, col: 0xff8a3c, bit: 2 },
  slow: { name: 'Оцепенение', t: J.STATUS.slow.t, col: 0x6ab8ff, bit: 4 },
};
export type StatusKind = keyof typeof STATUS_KINDS;

// ----- кампания (campaign.js) -----
/** boss — id босса главы в data/bosses (в кампании, Босс-раше и дуэли главу занимает именно он) */
export interface Chapter { roman: string; name: string; boss: string; road?: string; road2?: string }
export const CHAPTERS: Record<number, Chapter> = {
  1: { roman: 'I', name: 'Мшистая Глубь', boss: 'penitent' },
  2: { roman: 'II', name: 'Старая типография', boss: 'misha2', road: 'Коридор типографии', road2: 'Склад шрифтов' },
  3: { roman: 'III', name: 'Кабинет музыки', boss: 'vladik2', road: 'Школьный коридор', road2: 'Лестница к кабинету' },
  4: { roman: 'IV', name: 'Берлога Тимы', boss: 'tima2', road: 'Подъезд', road2: 'Лестница к берлоге' },
};
/** боссы глав по порядку глав (ходят в Босс-раше, дуэли и таблицах) */
export const CHAPTER_BOSSES: readonly string[] = [1, 2, 3, 4].map((ch) => CHAPTERS[ch]!.boss);
export const LAST_CHAPTER = 4;
export interface ShopItem { id: 'hp' | 'dmg' | 'silk'; name: string; max: number; price: number[] }
export const SHOP: readonly ShopItem[] = [
  { id: 'hp', name: 'Маска здоровья', max: 3, price: [10, 18, 28] },
  { id: 'dmg', name: 'Острая игла', max: 2, price: [12, 22] },
  { id: 'silk', name: 'Лёгкая катушка', max: 2, price: [12, 24] },
];
export const SR_CATS = {
  trail: { id: 'trail', name: 'Тропа целиком', tags: ['Гл. I', 'Гл. II', 'Гл. III', 'Гл. IV'] },
  boss: { id: 'boss', name: 'Босс-раш', tags: ['Кающийся', 'Миша', 'Владик', 'Тима'] },
} as const;

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

// ----- переопределение баланса: ТОЛЬКО для Node-инструментов (бот, Optuna), игра его не вызывает -----
/** Накладывает частичный баланс (та же форма, что data/balance.json) на живые объекты. Вызывать до создания первого мира. */
export function applyBalanceOverride(over: unknown): void {
  const o = validateBalance(over, true);
  const merge = (dst: Record<string, unknown>, src: Record<string, unknown>): void => {
    for (const k in src) {
      const v = src[k], d = dst[k];
      if (Array.isArray(v)) (d as number[]).splice(0, v.length, ...(v as number[]));
      else if (v && typeof v === 'object') merge(d as Record<string, unknown>, v as Record<string, unknown>);
      else dst[k] = v;
    }
  };
  if (o.P) merge(P, o.P);
  if (o.BAL) merge(BAL, o.BAL);
  if (o.TOOL) merge(TOOL, o.TOOL);
  if (o.MV2) merge(MV2, o.MV2);
  if (o.PARRY2) merge(PARRY2, o.PARRY2);
  if (o.POISE_MAX) merge(POISE_MAX, o.POISE_MAX);
  if (o.STATUS) merge(STATUS_KINDS, o.STATUS);
  if (o.STAGGER_T !== undefined) STAGGER_T = o.STAGGER_T;
  if (o.EXEC_FRAC !== undefined) EXEC_FRAC = o.EXEC_FRAC;
  if (o.CH_T !== undefined) CH_T = o.CH_T;
  if (o.CH_SHOW !== undefined) CH_SHOW = o.CH_SHOW;
  if (o.CH_SLOW !== undefined) CH_SLOW = o.CH_SLOW;
}
