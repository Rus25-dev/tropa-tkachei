// Схема данных боссов (data/bosses/*.json): язык атак, связки, политика выбора, фазы. Проверяется при загрузке (zod) и семантически (checkBossDef).
// Время везде в кадрах (60 в секунду), расстояния — в пикселях. Подробности и пример — docs/BOSS_DATA.md.
import { z } from 'zod';
import { arenaReg, projReg } from '../plugin/regs';

export const HIT_KINDS = ['parry', 'dodge', 'unblockable'] as const;
export const CUE_COLORS = ['yellow', 'red', 'purple', 'white'] as const;

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
  /** player — к герою в начале сегмента; facing — направление, зафиксированное замахом; wall — к ближайшей стене; fixed — мировые оси */
  toward: z.enum(['player', 'wall', 'fixed', 'facing']).default('player'),
});
export const ProjSpec = z.strictObject({ kind: z.string().min(1) /* вид из src/content/projectiles с data: true (проверка — projKindErrs) */, w: z.number().positive(), h: z.number().positive(), life: pos });
const Spawn = z.strictObject({
  at: frames,
  proj: ProjSpec,
  kind: z.enum(HIT_KINDS),
  /** от центра босса (self) вперёд, y — от центра по высоте; target — от героя, зафиксированного к концу замаха */
  from: z.enum(['self', 'target']).default('self'),
  ox: z.number().default(0), oy: z.number().default(0),
  vx: z.number().default(0), vy: z.number().default(0),
  /** целиться в героя (длина скорости = hypot(vx, vy)) */
  aim: z.boolean().default(false),
  /** live — целиться в момент выстрела; locked — использовать точку, зафиксированную замахом. */
  aimTarget: z.enum(['live', 'locked']).optional(),
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
  /** За сколько кадров до удара зафиксировать цель и направление; 0 — слежение до конца. */
  commitFrames: frames.optional(),
});
const Recovery = z.strictObject({
  frames: pos,
  /** окно наказания — кадры восстановления, когда босс беззащитен для серии ударов (от начала восстановления) */
  punishWindow: z.strictObject({ from: frames, to: frames }),
});
/** призыв существа (раздел creatures босса) в кадр атаки: от центра босса вперёд (ox зеркалится по взгляду), oy — от центра по высоте */
const Summon = z.strictObject({ at: frames, creature: z.string().min(1), ox: z.number().default(0), oy: z.number().default(0), count: z.number().int().min(1).max(4).default(1) });
/** запуск расписания сущности арены (раздел arena) в кадр атаки */
const Fire = z.strictObject({ at: frames, ent: z.string().min(1) });
/** особый эффект, который знает файл kinds/<id>.ts босса: fx[name](k, args) в кадр атаки */
const Fx = z.strictObject({ at: frames, name: z.string().min(1), args: z.record(z.string(), z.unknown()).default({}) });
export const AttackSchema = z.strictObject({
  id: z.string().min(1), name: z.string().optional(),
  /** Окно срыва контрударом; false запрещает срыв независимо от цвета/позы. */
  counter: z.union([z.literal(false), z.strictObject({ windowFrames: pos, reach: z.number().positive().optional(), grounded: z.boolean().optional() })]).optional(),
  tell: Tell, active: z.array(Active).default([]), move: z.array(Move).default([]), spawn: z.array(Spawn).default([]),
  /** призывы существ, запуски расписаний арены и особые эффекты (волна 0); все — кадры от конца замаха */
  summon: z.array(Summon).default([]), fire: z.array(Fire).default([]), fx: z.array(Fx).default([]),
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
  priority: z.array(z.strictObject({ chain: z.string().min(1), closeDist: z.number().positive(), closeFrames: pos, cornerFrames: pos.optional() })).default([]),
});

// ---------- волна 0: сцены, тело (форма), уязвимые точки, существа ----------
/** событие сцены: кадр от начала сцены. Камера, надпись, звук, превращение тела (morph) */
const SceneEvent = z.strictObject({
  at: frames,
  say: z.string().optional(), sfx: z.string().optional(),
  shake: z.strictObject({ ms: pos, i: z.number().positive() }).optional(),
  flash: z.strictObject({ ms: pos, r: z.number().int().min(0).max(255).default(255), g: z.number().int().min(0).max(255).default(255), b: z.number().int().min(0).max(255).default(255) }).optional(),
  fade: z.strictObject({ out: z.boolean(), ms: pos }).optional(),
  /** подсказка камере: приблизить/отдалить на frames кадров (1 — обычный масштаб) */
  zoom: z.strictObject({ k: z.number().min(0.66).max(1.6), frames: pos }).optional(),
  /** применить тело (form) фазы прямо в этот кадр (иначе — в конце сцены) */
  morph: z.boolean().optional(),
});
/** сцена: фаза может запустить ролик. Длина ограничена rules.scene.maxFrames, пропускается прыжком или ударом (skippable) */
export const SceneSchema = z.strictObject({ frames: pos, skippable: z.boolean().default(true), say: z.string().optional(), events: z.array(SceneEvent).default([]) });

const HitKindEnum = z.enum(HIT_KINDS);
/** окно открытия уязвимой точки: on — что делает босс (always — всегда); attack — только во время этой атаки; from/to — кадры от начала этого состояния */
const WeakWindow = z.strictObject({ on: z.enum(['always', 'idle', 'tell', 'active', 'recover', 'punish', 'stagger']), attack: z.string().min(1).optional(), from: frames.optional(), to: frames.optional() });
/** уязвимая точка: удар засчитывается, только если коробка удара героя задевает открытую точку; остальное тело — броня (звон), оглушённый босс бронь теряет */
export const WeakSchema = z.strictObject({
  id: z.string().min(1),
  /** коробка точки: x, y — от левого верхнего угла тела босса (при mirror: x — от переднего края вперёд) */
  box: z.strictObject({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }),
  mirror: z.boolean().default(false),
  /** окна открытия; пусто — открыта всегда */
  open: z.array(WeakWindow).default([]),
  /** сколько единиц урона наносит удар по точке (≥ 1) */
  hits: pos.default(1),
});
const FlyCfg = z.strictObject({
  /** на сколько px над полом держится низ тела */
  hover: z.number().min(0),
  /** скорость вертикального выравнивания, px/с */
  speed: z.number().positive().default(120),
  /** амплитуда покачивания, px */
  bob: z.number().min(0).default(0),
});
const PlaceSchema = z.strictObject({
  /** доля ширины арены (0–1) для центра тела; по умолчанию — точка появления арены */
  x: z.number().min(0).max(1).optional(),
  /** на сколько px над полом низ тела */
  y: z.number().min(0).optional(),
});
const ContactSchema = z.strictObject({ dmg: pos, kind: HitKindEnum });
/** тело босса: размер, режим полёта/наземный, неподвижность, рисовальщик-вариант, набор допустимых приёмов, политика связок, уязвимые точки. Фазы накапливают формы по порядку (форма фазы 2 действует и в фазе 3, если та её не меняет) */
export const FormSchema = z.strictObject({
  size: z.strictObject({ w: pos, h: pos }).optional(),
  /** полёт: без гравитации, низ тела держится на hover; false — вернуться на землю */
  fly: FlyCfg.or(z.literal(false)).optional(),
  still: z.boolean().optional(),
  /** имя варианта в src/view/draw/boss/<id>.ts (default-экспорт: { имя: функция }) */
  draw: z.string().min(1).optional(),
  color: z.number().int().min(0).max(0xffffff).optional(),
  /** набор приёмов: только эти атаки (id); связка, чьи шаги вне набора, не выбирается */
  attacks: z.array(z.string().min(1)).min(1).optional(),
  /** политика связок вместо политики фазы */
  policy: PolicySchema.optional(),
  idle: z.strictObject({ walkSpeed: z.number().min(0), keepDist: z.number().min(0) }).optional(),
  contact: ContactSchema.or(z.literal(false)).optional(),
  weak: z.array(WeakSchema).optional(),
});

export const PhaseSchema = z.strictObject({
  /** фаза включается, когда hp/maxHp ≤ fromHp (у первой — 1) */
  fromHp: z.number().gt(0).lte(1),
  /** сколько кадров босс неуязвим при входе в фазу (рёв) */
  rageFrames: frames.default(0),
  /** вставка-сцена после рёва; skippable — пропускается нажатием прыжка или удара */
  scene: SceneSchema.optional(),
  /** без рёва, вспышки и отброса героя: фаза включается сразу, переход — переходной приём с телеграфом (enterChain) */
  silent: z.boolean().default(false),
  /** переходный приём с телеграфом — id связки */
  enterChain: z.string().min(1).optional(),
  /** трансформация: тело фазы (применяется после рёва и сцены или по событию morph) */
  form: FormSchema.optional(),
  policy: PolicySchema,
});

/** существо-приспешник: появляется по призыву (attack.summon, arena spawner), живёт life кадров или пока не убито */
export const CreatureSchema = z.strictObject({
  id: z.string().min(1), name: z.string().optional(),
  size: z.strictObject({ w: pos, h: pos }),
  hp: pos,
  speed: z.number().min(0).default(60),
  fly: FlyCfg.optional(),
  /** сколько кадров живёт; без поля — пока не убьют */
  life: pos.optional(),
  /** за сколько кадров до исчезновения оно бледнеет и становится безвредным */
  fade: frames.default(30),
  /** сколько таких одновременно (лишние призывы пропускаются) */
  max: pos.default(3),
  contact: ContactSchema.optional(),
  beads: z.number().int().min(0).default(0),
  color: z.number().int().min(0).max(0xffffff).default(0x8a7d6a),
  draw: z.string().min(1).optional(),
  /** когда исчезает досрочно */
  vanishOn: z.array(z.enum(['bossDeath', 'phase', 'stagger'])).default(['bossDeath']),
  /** свои приёмы и мини-связки (шаги — id приёмов существа); пауза между связками */
  attacks: z.array(AttackSchema).default([]),
  chains: z.array(z.strictObject({ id: z.string().min(1), steps: z.array(z.string().min(1)).min(1), weight: z.number().positive().default(1) })).default([]),
  rest: z.tuple([frames, frames]).default([60, 120]),
});

// ---------- волна 0: сущности арены ----------
/** прямоугольник арены, px: x — от левой внутренней стены, y — от пола вверх до НИЖНЕЙ грани, w, h — размеры (платформы кратны тайлу 32) */
export const AreaSchema = z.strictObject({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() });
/** когда запускается расписание: с начала боя, с фазы, с шага связки; либо вручную (attack.fire, дирижёр) — тогда bind не задаётся */
const BindSchema = z.strictObject({
  start: z.boolean().optional(),
  phase: z.array(z.number().int().min(1).max(3)).min(1).optional(),
  chain: z.string().min(1).optional(),
  /** шаг связки (с нуля); без поля — первый */
  step: z.number().int().min(0).optional(),
});
const entBase = { id: z.string().min(1), bind: BindSchema.optional(), loop: pos.optional() };
const PlatformOp = z.discriminatedUnion('op', [
  z.strictObject({ at: frames, op: z.literal('show'), warn: frames.default(0) }),
  z.strictObject({ at: frames, op: z.literal('hide'), warn: frames.default(0) }),
  /** ход по тайлам: за frames кадров платформа шагает по одной клетке к цели; герой на ней едет вместе */
  z.strictObject({ at: frames, op: z.literal('move'), to: z.strictObject({ x: z.number(), y: z.number() }), frames: pos }),
]);
const PlatformEnt = z.strictObject({ ...entBase, kind: z.literal('platform'), area: AreaSchema, solid: z.boolean().default(false), shown: z.boolean().default(false), timeline: z.array(PlatformOp).default([]) });
const BarrierEnt = z.strictObject({ ...entBase, kind: z.literal('barrier'), area: AreaSchema, shown: z.boolean().default(false), timeline: z.array(PlatformOp).default([]) });
const BeamEnt = z.strictObject({
  ...entBase, kind: z.literal('beam'), area: AreaSchema, hit: HitKindEnum, dmg: pos.default(1),
  /** каждый удар: tell кадров предупреждения (контур цвета типа удара), потом active кадров урона; aim — по x героя в конце замаха; area — другая зона на этот удар */
  timeline: z.array(z.strictObject({ at: frames, tell: pos, active: pos, aim: z.boolean().default(false), area: AreaSchema.optional() })).min(1),
});
const SpawnerEnt = z.strictObject({
  ...entBase, kind: z.literal('spawner'), pos: z.strictObject({ x: z.number(), y: z.number() }),
  timeline: z.array(z.strictObject({
    at: frames, tell: frames.default(0), proj: ProjSpec.optional(), creature: z.string().min(1).optional(),
    kind: HitKindEnum.default('dodge'), vx: z.number().default(0), vy: z.number().default(0), aim: z.boolean().default(false),
    count: z.number().int().min(1).max(12).default(1), spread: z.number().min(0).max(180).default(0), dmg: pos.optional(),
  })).min(1),
});
export const ArenaEntSchema = z.discriminatedUnion('kind', [PlatformEnt, BarrierEnt, BeamEnt, SpawnerEnt]);
const ArenaLevel = z.string().min(1); // id из src/content/arenas (проверка — arenaErrs)
/** раздел arena: либо имя арены ("vladik"), либо { level, ents } с сущностями по расписанию */
export const ArenaSchema = z.union([ArenaLevel, z.strictObject({ level: ArenaLevel, ents: z.array(ArenaEntSchema).default([]) })]);

// ---------- волна 0: дирижёр нескольких боссов ----------
export const ConductorSchema = z.strictObject({
  /** остальные участники (ведущий — босс с этим разделом, индекс 0); id боссов из data/bosses (обычно с hidden: true) */
  members: z.array(z.strictObject({ boss: z.string().min(1), place: PlaceSchema.optional(), policy: z.enum(['conductor', 'own']).default('conductor') })).min(1).max(2),
  /** политика ведущего: conductor — атакует по расписанию, own — по своей политике */
  lead: z.enum(['conductor', 'own']).default('conductor'),
  /** общий пул здоровья: у всех один hp (берётся у ведущего); иначе у каждого свой */
  pool: z.boolean().default(false),
  /** условие победы при раздельном здоровье: all — убиты все, any — убит любой (остальные падают вместе с ним) */
  win: z.enum(['all', 'any']).default('all'),
  /** такт: кадров в одном ударе общего метронома */
  beat: pos,
  /** длина цикла расписания в тактах */
  cycle: pos,
  /** scripted — постановка без дистанционных условий; policy — все условия, cooldown и антиспам. */
  commands: z.enum(['scripted', 'policy']).optional(),
  /** расписание: в такт beat цикла босс boss (индекс или 'all') начинает связку chain; arena — заодно запустить сущность арены */
  schedule: z.array(z.strictObject({ beat: z.number().int().min(0), boss: z.union([z.number().int().min(0).max(2), z.literal('all')]), chain: z.string().min(1), arena: z.string().min(1).optional() })).default([]),
  /** эстафета: когда босс from заканчивает связку chain, босс to через after кадров начинает связку next */
  relay: z.array(z.strictObject({ from: z.number().int().min(0).max(2), chain: z.string().min(1), to: z.number().int().min(0).max(2), next: z.string().min(1), after: frames.default(0) })).default([]),
});


// ---------- защита от читов (2.5, часть В): общие правила исполнителя; числа — в rules.json, у босса можно переопределить ----------
const AntiShove = z.strictObject({
  /** сколько секунд герой может стоять вплотную к телу босса, прежде чем тот «отгонит» его связкой-отгоном */
  sec: z.number().positive(),
  /** то же, если герой прижат к стене/углу арены */
  cornerSec: z.number().positive(),
  /** «вплотную»: горизонтальная дистанция от центра босса до героя, px */
  dist: z.number().positive(),
  /** «у стены»: расстояние от героя до боковой стены арены, px */
  cornerMargin: z.number().min(0),
});
const AntiStagger = z.strictObject({
  /** окно, в котором считаются предыдущие оглушения босса, с */
  windowSec: z.number().positive(),
  /** множитель длительности оглушения по номеру оглушения в окне (первое, второе, …; последний повторяется) */
  durMul: z.array(z.number().gt(0).lte(1)).min(1),
  /** множитель порога стойки по номеру оглушения в окне */
  poiseMul: z.array(z.number().gte(1)).min(1),
  /** потолок урона за одно окно оглушения — доля здоровья босса */
  dmgCapFrac: z.number().gt(0).lte(1),
  /** … но не меньше стольких единиц (чтобы одна казнь всегда проходила) */
  dmgCapMin: pos,
});
const AntiSpam = z.strictObject({
  /** одну и ту же атаку нельзя начинать чаще maxUses раз за windowSec секунд */
  maxUses: pos, windowSec: z.number().positive(),
});
const AntiWallStun = z.strictObject({
  /** самооглушение от удара о стену на рывке: на сколько секунд босс оглушается */
  sec: z.number().positive(),
  /** откат: следующее такое оглушение не раньше, чем через cooldownSec секунд */
  cooldownSec: z.number().positive(),
  /** минимальная скорость босса при ударе о стену, px/с */
  minSpeed: z.number().positive(),
});
const AntiRelocate = z.strictObject({
  /** если герой не получал урона и не отходил дальше dist от босса sec секунд подряд — босс берёт перемещающую связку */
  sec: z.number().positive(), dist: z.number().positive(),
});
/** полный набор правил (rules.json) */
export const AntiCheeseRulesSchema = z.strictObject({
  enabled: z.boolean(), shove: AntiShove, stagger: AntiStagger, spam: AntiSpam, wallStun: AntiWallStun, relocate: AntiRelocate,
});
/** у босса: флаги и частичные переопределения; связки-«отгон» и «перемещение» назначает босс */
export const AntiCheeseBossSchema = z.strictObject({
  enabled: z.boolean().optional(),
  shoveChain: z.string().min(1).optional(),
  relocateChain: z.string().min(1).optional(),
  shove: AntiShove.partial().optional(), stagger: AntiStagger.partial().optional(), spam: AntiSpam.partial().optional(),
  wallStun: AntiWallStun.partial().optional().or(z.literal(false)), relocate: AntiRelocate.partial().optional(),
});

export const BossDefSchema = z.strictObject({
  id: z.string().min(1), name: z.string().min(1), about: z.string().default(''),
  /** карточка Босс-теста: короткий ориентир (на что смотреть), строка под названием */
  landmark: z.string().default(''),
  /** советы на экране «Как играть → Боссы» (открываются после первой встречи с боссом) */
  tips: z.array(z.string().min(1)).default([]),
  /** карточка видна только по ?dev=1 */
  dev: z.boolean().default(false),
  /** служебный участник боя (карточки, гонок и дуэли нет): например, второй босс дирижёра */
  hidden: z.boolean().default(false),
  /** порядок карточек среди боссов на данных (меньше — раньше); при равенстве — по id */
  order: z.number().default(1000),
  /** вносить ли босса в список дуэли (запуск раунда дуэли для боссов на данных подключается в волне 1) */
  duel: z.boolean().default(false),
  /** арена — id из src/content/arenas (сейчас 'misha' | 'vladik' | 'tima'), либо { level, ents } с сущностями по расписанию (платформы, лучи, точки появления, барьеры) */
  arena: ArenaSchema,
  size: z.strictObject({ w: pos, h: pos }),
  /** начальное положение (по умолчанию — точка появления арены) */
  place: PlaceSchema.optional(),
  /** неподвижный босс: не ходит и не падает, move приёмов игнорируется; положение — place */
  still: z.boolean().default(false),
  /** полёт с самого начала (иначе — наземный); меняется формами фаз */
  fly: FlyCfg.optional(),
  /** уязвимые точки с самого начала (меняются формами фаз) */
  weak: z.array(WeakSchema).default([]),
  /** здоровье для одного и двух героев */
  hp: z.tuple([pos, pos]),
  color: z.number().int().min(0).max(0xffffff).default(0x8a7d6a),
  music: z.string().optional(),
  intro: z.strictObject({ frames: pos, say: z.string().optional(), skippable: z.boolean().default(false), events: z.array(SceneEvent).default([]) }),
  deathFrames: pos.default(150),
  idle: z.strictObject({ walkSpeed: z.number().min(0), keepDist: z.number().min(0) }).default({ walkSpeed: 0, keepDist: 0 }),
  /** урон от касания тела (по умолчанию нет) */
  contact: ContactSchema.optional(),
  attacks: z.array(AttackSchema).min(1),
  chains: z.array(ChainSchema).min(1),
  phases: z.array(PhaseSchema).min(1).max(3),
  /** существа-приспешники и дирижёр нескольких боссов (волна 0) */
  creatures: z.array(CreatureSchema).default([]),
  conductor: ConductorSchema.optional(),
  /** защита от читов; по умолчанию для боссов на данных включена по правилам rules.json */
  antiCheese: AntiCheeseBossSchema.optional(),
});


/** пороги честности связок и потока урона (validate.ts); время — в кадрах */
export const FairnessSchema = z.strictObject({
  /** окно наказания после последнего приёма связки — не короче */
  minChainPunishFrames: pos,
  /** пауза между шагами связки (gapFrames) — не короче */
  minChainGapFrames: frames,
  /** от конца ударов шага до первого удара следующего (пауза + замах) — не короче: время на реакцию */
  minReactionFrames: pos,
  /** пауза между связками (restFrames[0]) — не короче */
  minRestFrames: frames,
  /** от конца ударов последней атаки до замаха следующей связки (восстановление + пауза) — не короче */
  minChainPauseFrames: pos,
  /** два неотбиваемых удара подряд: между ними должно быть окно не короче */
  minGapAfterUnblockable: pos,
  /** максимум урона по герою в любые 3 с по фазам (с учётом неуязвимости после удара) */
  maxDamage3s: z.array(pos).min(1).max(3),
});

/** правила честности (data/bosses/rules.json) */
export const RulesSchema = z.strictObject({
  /** минимальный замах для атаки с ударами такого типа (берётся максимум по типам атаки) */
  minTellFrames: z.strictObject({ parry: pos, dodge: pos, unblockable: pos }),
  minRecoveryFrames: pos,
  minPunishFrames: pos,
  /** честность связок и боя (validate.ts): нет — проверки пропускаются */
  fairness: FairnessSchema.optional(),
  /** защита от читов: общие значения для боссов на данных */
  antiCheese: AntiCheeseRulesSchema.optional(),
  /** сцены (волна 0): сцена не блокирует игру дольше maxFrames; непропускаемая — не дольше maxUnskippableFrames */
  scene: z.strictObject({ maxFrames: pos, maxUnskippableFrames: pos }).optional(),
  /** сущности арены (волна 0): норма предупреждения до исчезновения/появления платформы, ход платформы, число сущностей, безопасный пол под лучами */
  arena: z.strictObject({
    /** показ и скрытие платформы с предупреждением не короче */
    minWarnFrames: frames,
    /** ход платформы на одну клетку занимает не меньше кадров (иначе героя не успеть «подхватить») */
    minStepFrames: pos,
    maxEnts: pos,
    /** под лучами и зонами в любой момент остаётся незанятый пол/платформа не уже, px */
    minSafeWidth: pos,
  }).optional(),
  /** уязвимые точки (волна 0): точка должна быть открыта не короче minOpenFrames подряд */
  weak: z.strictObject({ minOpenFrames: pos }).optional(),
  /** существа (волна 0): общий потолок одновременно живых существ */
  minions: z.strictObject({ maxTotal: pos }).optional(),
  /** дирижёр (волна 0): число боссов в бою и безопасное окно между сходящимися ударами разных боссов */
  conductor: z.strictObject({ maxBosses: pos, minSafeGapFrames: pos }).optional(),
});

export type Attack = z.output<typeof AttackSchema>;
export type Chain = z.output<typeof ChainSchema>;
export type Policy = z.output<typeof PolicySchema>;
export type Phase = z.output<typeof PhaseSchema>;
export type BossDef = z.output<typeof BossDefSchema>;
export type Requires = z.output<typeof RequiresSchema>;
export type Rules = z.output<typeof RulesSchema>;
export type Fairness = z.output<typeof FairnessSchema>;
export type AntiCheeseRules = z.output<typeof AntiCheeseRulesSchema>;
export type AntiCheeseBoss = z.output<typeof AntiCheeseBossSchema>;
export type BoxDef = z.output<typeof Box>;
export type Form = z.output<typeof FormSchema>;
export type Weak = z.output<typeof WeakSchema>;
export type Creature = z.output<typeof CreatureSchema>;
export type ArenaEnt = z.output<typeof ArenaEntSchema>;
export type Conductor = z.output<typeof ConductorSchema>;
export type Scene = z.output<typeof SceneSchema>;
export type Area = z.output<typeof AreaSchema>;

/** имя уровня арены босса (раздел arena — строка или { level, ents }) */
export const arenaLevel = (def: { arena: BossDef['arena'] }): string => (typeof def.arena === 'string' ? def.arena : def.arena.level);
/** сущности арены босса по расписанию (пусто, если раздел arena — строка) */
export const arenaEnts = (def: { arena: BossDef['arena'] }): ArenaEnt[] => (typeof def.arena === 'string' ? [] : def.arena.ents);

/** Конец «рабочей» части атаки (последний кадр удара/движения/выстрела, считая от конца замаха); −1, если нет ничего */
export function activeEnd(a: Attack): number {
  let e = -1;
  for (const x of a.active) e = Math.max(e, x.to);
  for (const x of a.move) e = Math.max(e, x.to);
  for (const x of a.spawn) e = Math.max(e, x.at);
  for (const x of a.summon) e = Math.max(e, x.at);
  for (const x of a.fire) e = Math.max(e, x.at);
  for (const x of a.fx) e = Math.max(e, x.at);
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
    if ((a.tell.commitFrames ?? 0) > a.tell.frames) errs.push(`${at}: commitFrames больше замаха`);
    if (a.counter && a.counter.windowFrames > a.tell.frames) errs.push(`${at}: окно контрудара больше замаха`);
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
    if (!a.active.length && !a.move.length && !a.spawn.length && !a.summon.length && !a.fire.length && !a.fx.length) errs.push(`${at}: пустая атака (нет ни ударов, ни движения, ни снарядов, ни призывов)`);
  }
  for (const c of def.chains) {
    for (const s of c.steps) if (!atk.has(s.attack)) errs.push(`связка «${c.id}»: нет атаки «${s.attack}»`);
    if (c.requires?.dist && c.requires.dist[0] > c.requires.dist[1]) errs.push(`связка «${c.id}»: requires.dist [мин, макс] перепутаны`);
  }
  const weakRefs = (list: Weak[], at: string): void => {
    dup(`${at}: уязвимая точка`, list.map((w) => w.id));
    for (const w of list) for (const o of w.open) {
      if (o.attack && !atk.has(o.attack)) errs.push(`${at}: точка «${w.id}» ссылается на неизвестную атаку «${o.attack}»`);
      if (o.from !== undefined && o.to !== undefined && o.to < o.from) errs.push(`${at}: окно точки «${w.id}»: to < from`);
    }
  };
  function formRefs(f: Form, at: string): void {
    for (const id of f.attacks ?? []) if (!atk.has(id)) errs.push(`${at}: набор приёмов ссылается на неизвестную атаку «${id}»`);
    for (const id of f.policy?.chains ?? []) if (!chn.has(id)) errs.push(`${at}: политика ссылается на неизвестную связку «${id}»`);
    for (const p of f.policy?.priority ?? []) if (!chn.has(p.chain)) errs.push(`${at}: приоритет ссылается на неизвестную связку «${p.chain}»`);
    if (f.policy && f.policy.restFrames[0] > f.policy.restFrames[1]) errs.push(`${at}: restFrames [мин, макс] перепутаны`);
    weakRefs(f.weak ?? [], at);
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
    if (rules.scene && ph.rageFrames > rules.scene.maxFrames) errs.push(`${at}: рёв ${ph.rageFrames} кадров длиннее нормы ${rules.scene.maxFrames}`);
    if (ph.scene && rules.scene && ph.scene.frames > rules.scene.maxFrames) errs.push(`${at}: сцена ${ph.scene.frames} кадров длиннее нормы ${rules.scene.maxFrames} (сцена не должна держать игру дольше ${Math.round(rules.scene.maxFrames / 60)} с)`);
    if (ph.scene && rules.scene && !ph.scene.skippable && ph.scene.frames > rules.scene.maxUnskippableFrames) errs.push(`${at}: непропускаемая сцена ${ph.scene.frames} кадров длиннее нормы ${rules.scene.maxUnskippableFrames}`);
    for (const e of ph.scene?.events ?? []) if (ph.scene && e.at >= ph.scene.frames) errs.push(`${at}: событие сцены на кадре ${e.at} вне сцены (${ph.scene.frames} кадров)`);
    if (ph.silent && !ph.enterChain) errs.push(`${at}: silent без enterChain — переход без рёва и без переходного приёма`);
    if (ph.form) formRefs(ph.form, `${at}, form`);
  });
  // тело, существа, арена, дирижёр (волна 0)
  weakRefs(def.weak, 'тело');
  if (!def.intro.skippable && rules.scene && def.intro.frames > rules.scene.maxUnskippableFrames * 2) errs.push(`вступление ${def.intro.frames} кадров не пропускается и длиннее нормы ${rules.scene.maxUnskippableFrames * 2}`);
  for (const e of def.intro.events) if (e.at >= def.intro.frames) errs.push(`событие вступления на кадре ${e.at} вне вступления (${def.intro.frames} кадров)`);
  dup('существо', def.creatures.map((c) => c.id));
  const crt = new Map(def.creatures.map((c) => [c.id, c]));
  for (const a of def.attacks) for (const s of a.summon) if (!crt.has(s.creature)) errs.push(`атака «${a.id}»: призыв неизвестного существа «${s.creature}»`);
  for (const c of def.creatures) {
    const at = `существо «${c.id}»`, own = new Set(c.attacks.map((a) => a.id));
    dup(`${at}: приём`, c.attacks.map((a) => a.id)); dup(`${at}: связка`, c.chains.map((x) => x.id));
    for (const ch of c.chains) for (const st of ch.steps) if (!own.has(st)) errs.push(`${at}: связка «${ch.id}» ссылается на неизвестный приём «${st}»`);
    for (const a of c.attacks) {
      if (a.summon.length) errs.push(`${at}, приём «${a.id}»: существа не призывают других существ`);
      if (a.fire.length) errs.push(`${at}, приём «${a.id}»: существа не запускают сущности арены`);
    }
    if (c.rest[0] > c.rest[1]) errs.push(`${at}: rest [мин, макс] перепутаны`);
  }
  const ents = arenaEnts(def);
  dup('сущность арены', ents.map((e) => e.id));
  const entIds = new Set(ents.map((e) => e.id));
  for (const a of def.attacks) for (const f of a.fire) if (!entIds.has(f.ent)) errs.push(`атака «${a.id}»: запуск неизвестной сущности арены «${f.ent}»`);
  for (const e of ents) {
    const at = `сущность арены «${e.id}»`;
    if (e.bind?.chain) {
      const c = chn.get(e.bind.chain);
      if (!c) errs.push(`${at}: bind.chain ссылается на неизвестную связку «${e.bind.chain}»`);
      else if ((e.bind.step ?? 0) >= c.steps.length) errs.push(`${at}: bind.step ${e.bind.step} вне связки «${c.id}» (${c.steps.length} шагов)`);
    }
    if (e.bind && [e.bind.start, e.bind.phase, e.bind.chain].filter((x) => x !== undefined).length > 1) errs.push(`${at}: bind задаёт сразу несколько способов запуска (start, phase, chain)`);
    if (e.bind?.phase) for (const n of e.bind.phase) if (n > def.phases.length) errs.push(`${at}: bind.phase ${n} — у босса ${def.phases.length} фаз`);
    if (e.kind === 'platform' || e.kind === 'barrier') {
      const a = e.area;
      if (a.x % 32 || a.y % 32 || a.w % 32 || a.h % 32) errs.push(`${at}: площадка кратна тайлу 32 px (x ${a.x}, y ${a.y}, w ${a.w}, h ${a.h})`);
      for (const op of e.timeline) if (op.op === 'move' && (op.to.x % 32 || op.to.y % 32)) errs.push(`${at}: цель хода кратна тайлу 32 px (x ${op.to.x}, y ${op.to.y})`);
    }
    if (e.kind === 'spawner') for (const t of e.timeline) {
      if (!t.proj && !t.creature) errs.push(`${at}: запись расписания без proj и без creature`);
      if (t.creature && !crt.has(t.creature)) errs.push(`${at}: призыв неизвестного существа «${t.creature}»`);
    }
    const ts = e.timeline.map((x) => x.at);
    if (ts.some((t, i) => i > 0 && t < ts[i - 1]!)) errs.push(`${at}: расписание (timeline) должно идти по возрастанию at`);
    if (e.loop !== undefined && ts.length && e.loop <= Math.max(...ts)) errs.push(`${at}: loop ${e.loop} не длиннее последней записи расписания (${Math.max(...ts)})`);
  }
  if (def.conductor) {
    const cd = def.conductor, n = 1 + cd.members.length;
    if (rules.conductor && n > rules.conductor.maxBosses) errs.push(`дирижёр: боссов ${n}, норма не больше ${rules.conductor.maxBosses}`);
    for (const m of cd.members) if (m.boss === def.id) errs.push(`дирижёр: босс «${m.boss}» не может быть собственным участником`);
    for (const s of cd.schedule) {
      if (s.beat >= cd.cycle) errs.push(`дирижёр: такт ${s.beat} вне цикла из ${cd.cycle} тактов`);
      if (typeof s.boss === 'number' && s.boss >= n) errs.push(`дирижёр: расписание ссылается на босса №${s.boss}, а их ${n}`);
      if ((s.boss === 0 || s.boss === 'all') && !chn.has(s.chain)) errs.push(`дирижёр: у ведущего нет связки «${s.chain}»`);
      if (s.arena && !entIds.has(s.arena)) errs.push(`дирижёр: расписание запускает неизвестную сущность арены «${s.arena}»`);
    }
    for (const r of cd.relay) {
      if (r.from >= n || r.to >= n) errs.push(`дирижёр: эстафета ссылается на несуществующего босса (${r.from} → ${r.to}, всего ${n})`);
      if (r.from === r.to) errs.push(`дирижёр: эстафета ${r.from} → ${r.to} возвращается к тому же боссу`);
    }
  }
  errs.push(...projKindErrs(def), ...arenaErrs(def));
  return errs;
}

/** Виды снарядов в данных (любое поле proj.kind) должны быть заведены в src/content/projectiles с data: true.
 *  Пока содержимое не загружено (разбор данных при импорте модуля раньше загрузки), проверка пропускается: её повторяют boss:check и тест content. */
export function projKindErrs(def: unknown): string[] {
  if (!projReg.size) return [];
  const errs: string[] = [], seen = new Set<string>();
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    const r = o as Record<string, unknown>, pj = r['proj'] as { kind?: unknown } | undefined;
    if (pj && typeof pj.kind === 'string' && !seen.has(pj.kind)) {
      seen.add(pj.kind);
      if (!projReg.get(pj.kind)?.data) errs.push(`снаряд «${pj.kind}» не заведён для данных (нужен src/content/projectiles/${pj.kind}.ts с data: true; есть: ${projReg.list().filter((d) => d.data).map((d) => d.id).join(', ')})`);
    }
    for (const v of Object.values(r)) walk(v);
  };
  walk(def);
  return errs;
}

/** Арена из данных должна быть заведена в src/content/arenas (до загрузки содержимого проверка пропускается, как у снарядов). */
export function arenaErrs(def: { arena?: unknown }): string[] {
  if (!arenaReg.size || def.arena === undefined) return [];
  const id = typeof def.arena === 'string' ? def.arena : (def.arena as { level?: string }).level ?? '';
  return arenaReg.has(id) ? [] : [`арена «${id}» не заведена (нужен src/content/arenas/${id}.ts; есть: ${arenaReg.ids().join(', ')})`];
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
