// Числа и справочники игры. Перенесены из v1.8 без изменений (legacy/src/game.js, bosses2.js, campaign.js, weapons.js, tools.js, charms.js, status.js).
// Позже (этап 2.3) боевые числа уходят в data/balance.json; пока они здесь, чтобы золотые записи совпали побитно.
export const T = 32;
export const EMPTY = 0, SOLID = 1, PLAT = 2, SPIKE = 3;

export const P = {
  G: 1500, RUN: 230, JUMP: 700, CUT: 0.45, MAXFALL: 720, COYOTE: 0.1, BUF: 0.13,
  DASH: 540, DASHT: 0.17, DASHCD: 0.45, WSLIDE: 110, WJX: 290, WJY: 600, WJLOCK: 0.16,
  POGO: 540, ATK_T: 0.12, ATK_CD: 0.26, INV: 1.0, HURT: 0.22, SILK: 9,
  BURST: 4, HEAL: 2, HEAL_T: 1.1, PARRY_T: 0.2, PARRY_CD: 0.65, APEX_VY: 90, APEX_G: 0.55, ATKBUF: 0.14, DASHBUF: 0.12, CORNER: 7,
} as const;

export interface Pal { name: string; tag: string; cloak: number; dark: number; accent: number; hex: string }
export const PAL: readonly Pal[] = [
  { name: 'Ива', tag: 'Di', cloak: 0x2f9a8a, dark: 0x1b5c53, accent: 0x9ff0dc, hex: '#8fe8d2' },
  { name: 'Ярь', tag: 'Ta', cloak: 0xd8862a, dark: 0x8a4f16, accent: 0xffd9a0, hex: '#ffc46e' },
];

export const PERSIST_KINDS = new Set(['wave', 'rwave', 'pad', 'stamp', 'box', 'clef', 'rootspike', 'staff', 'collector', 'trophy', 'echo', 'roller']);
// тяжёлые удары боссов отнимают 2 бутона: у них длинный телеграф, и их можно красиво избежать
export const HEAVY_KINDS = new Set(['rwave', 'wave', 'rootspike', 'stamp', 'trophy', 'bigletter', 'roller', 'echo', 'box']);
export const HEAVY_STATES = new Set(['charge', 'lunge', 'leap', 'lagFall']);
export const SLASH_KINDS = new Set(['spore', 'letter', 'note', 'bottle', 'rain', 'collector', 'glob']);

export const BAL = {
  hp: { boss: [330, 460], vladik: [480, 672], tima: [520, 728], misha: [14, 20] },
  pace: { boss: 1.8, vladik: 1.1, tima: 3.2, misha: 3.2 },
  silkEvery: 2, // нить копится с каждого N-го удара по боссу
} as const;

export const PHASE_LINES: Record<string, Record<number, string>> = {
  'Корнематка': { 2: 'споры чаще, корни из-под земли', 3: 'двойные прыжки и волны корней' },
  'Владик Скрипка': { 2: 'нотный стан и выпады смычком', 3: 'крещендо: ноты падают с потолка' },
  'Тима Пиво': { 2: 'коллекторы выходят на охоту', 3: 'ачивки падают сверху, комбо приставкой' },
};

// ----- стойкость и казнь (bosses2.js) -----
export const POISE_MAX: Record<number, number> = { 1: 7, 2: 8, 3: 9 };
export const STAGGER_T = 1.5; // сколько босс стоит оглушённым
export const EXEC_FRAC = 0.06; // казнь снимает столько от полного здоровья босса
export const KITS = [{ key: 'boss', name: 'Корнематка' }, { key: 'vladik', name: 'Владик Скрипка' }, { key: 'tima', name: 'Тима Пиво' }] as const;
export type BossKey = 'boss' | 'vladik' | 'tima';

// ----- состояния новых врагов (enemies2.js) -----
export const E2_VULN = ['erupt', 'tell', 'pounce', 'tired']; // засадника можно бить только вне земли
export const E2_UNDER = ['hidden', 'track', 'warn', 'dig']; // в этих состояниях тело спрятано на 50 px под полом

// ----- инструменты (tools.js) -----
export const TOOL = {
  NEEDLE_SPD: 760, NEEDLE_DMG: 2, NEEDLE_STICK: 3, TRAP_LIFE: 8, TRAP_FREEZE: 2, TRAP_MAX: 2, TRAP_POISE: 3,
  BOMB_R: 90, BOMB_DMG: 3, BOMB_FUSE: 0.9, HOOK_R: 260, HOOK_SPD: 900, HOOK_STUN: 0.6,
} as const;
export const FLY_TYPES = new Set(['gnat', 'bat', 'lurker']);
export const isToolKind = (k: string): boolean => k === 'tneedle' || k === 'ttrap' || k === 'tbomb';

// ----- оружие (weapons.js) -----
export const CH_T = 0.45; // сколько держать удар до заряженного
export const CH_SHOW = 0.16; // с какого момента герой светится и замедляется
export const CH_SLOW = 0.45; // множитель скорости бега при заряде

// ----- движение 2 (movement2.js) -----
export const MV2 = { GLIDE_V: 120, GLIDE_DEC: 3000, GLIDE_HOLD: 0.1, CLIMB_T: 0.2 } as const;

// ----- статусы (status.js) -----
export const STATUS_KINDS = {
  poison: { name: 'Яд', iv: 1.2, n: 4, col: 0x86e05a, bit: 1 },
  burn: { name: 'Ожог', iv: 0.8, n: 3, col: 0xff8a3c, bit: 2 },
  slow: { name: 'Оцепенение', t: 3, col: 0x6ab8ff, bit: 4 },
} as const;
export type StatusKind = keyof typeof STATUS_KINDS;

// ----- кампания (campaign.js) -----
export interface Chapter { roman: string; name: string; boss: string; bossLine?: string; road?: string; road2?: string }
export const CHAPTERS: Record<number, Chapter> = {
  1: { roman: 'I', name: 'Мшистая Глубь', boss: 'korne', bossLine: 'Корнематка повержена' },
  2: { roman: 'II', name: 'Старая типография', boss: 'misha', road: 'Коридор типографии', road2: 'Склад шрифтов' },
  3: { roman: 'III', name: 'Кабинет музыки', boss: 'vladik', road: 'Школьный коридор', road2: 'Лестница к кабинету' },
  4: { roman: 'IV', name: 'Берлога Тимы', boss: 'tima', road: 'Подъезд', road2: 'Лестница к берлоге' },
};
export const LAST_CHAPTER = 4;
export interface ShopItem { id: 'hp' | 'dmg' | 'silk'; name: string; max: number; price: number[] }
export const SHOP: readonly ShopItem[] = [
  { id: 'hp', name: 'Маска здоровья', max: 3, price: [10, 18, 28] },
  { id: 'dmg', name: 'Острая игла', max: 2, price: [12, 22] },
  { id: 'silk', name: 'Лёгкая катушка', max: 2, price: [12, 24] },
];
export const SR_CATS = {
  trail: { id: 'trail', name: 'Тропа целиком', tags: ['Гл. I', 'Гл. II', 'Гл. III', 'Гл. IV'] },
  boss: { id: 'boss', name: 'Босс-раш', tags: ['Корнематка', 'Миша', 'Владик', 'Тима'] },
} as const;

// ----- слова боссов -----
export const MISHA_WORDS = ['РЮКЗАК', 'ПРИВЕТ', 'АЗБУКА', 'КАПСЛОК', 'ШРИФТ', 'МИША', 'БУКВЫ', 'ДОДИК'];
export const MISHA_BIG = 'ШЖЩЫФДЯ';
export const MISHA_SAY_HIT = ['КХЕ-КХЕ!', 'МОЙ РЮКЗАК!', 'ФУ, ДЫМ!', 'ТАК НЕЧЕСТНО!', 'ЭЙ, ХВАТИТ!'];
export const VLADIK_SAY_HIT = ['Я НЕ СКРИПКА!', 'Я ВЛАДИК!', 'НЕ НАЗЫВАЙТЕ МЕНЯ ТАК!', 'Я НЕ СКРИПКА!!!'];
export const TIMA_SAY_HIT = ['ЭЙ, НЕ РАЗЛЕЙ!', 'АЙ!', 'Я НА ПАУЗЕ!', 'ЛАГАЕТ!'];

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
