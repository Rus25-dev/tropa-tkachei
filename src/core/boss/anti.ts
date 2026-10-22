// Защита от читов для боссов на данных (2.5, часть В). Чистые функции над состоянием исполнителя; числа — data/bosses/rules.json,
// у босса их можно переопределить блоком `antiCheese` (см. schema.ts). Время — в кадрах исполнителя (счётчик clk), без Date и без ГСЧ.
//   а) «отогнать»: герой вплотную к телу босса дольше shove.sec (у стены — cornerSec) → приоритетная связка-отгон (shoveChain);
//   б) убывающая отдача оглушений: каждое следующее оглушение в пределах stagger.windowSec короче и требует больше стойки;
//   в) потолок урона по боссу за одно окно оглушения (долей здоровья);
//   г) запрет спама: одну и ту же атаку нельзя начинать чаще spam.maxUses раз за spam.windowSec;
//   д) самооглушение от стены (рывок в стену) — с откатом wallStun.cooldownSec;
//   е) герой долго стоит рядом и не получает урона (relocate.sec) → перемещающая связка (relocateChain).
import { BOSS_RULES } from './registry';
import type { AntiCheeseRules, BossDef, Rules } from './schema';

export interface AntiCfg {
  shoveChain?: string; relocateChain?: string;
  shove: AntiCheeseRules['shove']; stagger: AntiCheeseRules['stagger']; spam: AntiCheeseRules['spam'];
  wallStun: AntiCheeseRules['wallStun'] | null; relocate: AntiCheeseRules['relocate'];
}

const CACHE = new WeakMap<BossDef, AntiCfg | null>();
/** Итоговые настройки босса: правила rules.json + переопределения босса. null — защита выключена (нет правил или enabled=false). */
export function resolveAnti(def: BossDef, rules: Rules = BOSS_RULES): AntiCfg | null {
  if (rules === BOSS_RULES) { const c = CACHE.get(def); if (c !== undefined) return c; }
  const r = rules.antiCheese, o = def.antiCheese;
  let out: AntiCfg | null = null;
  if (r && r.enabled && o?.enabled !== false) {
    const wallOff = o?.wallStun === false;
    out = {
      shoveChain: o?.shoveChain, relocateChain: o?.relocateChain,
      shove: { ...r.shove, ...o?.shove }, stagger: { ...r.stagger, ...o?.stagger }, spam: { ...r.spam, ...o?.spam },
      wallStun: wallOff ? null : { ...r.wallStun, ...(o?.wallStun || {}) }, relocate: { ...r.relocate, ...o?.relocate },
    };
  }
  if (rules === BOSS_RULES) CACHE.set(def, out);
  return out;
}

/** Состояние защиты в DState.ac (обычные данные, без функций). */
export interface AcState {
  /** кадры исполнителя */
  clk: number;
  /** когда (clk) были последние оглушения */
  stg: number[];
  /** здоровье босса в начале текущего окна оглушения; −1 — вне окна */
  stgHp0: number;
  /** до какого clk самооглушение от стены на откате */
  wallCd: number;
  /** сколько кадров подряд герой рядом с боссом и не получал урона */
  calm: number;
  /** сумма здоровья героев на прошлом кадре (чтобы заметить урон) */
  php: number;
}
export const newAc = (): AcState => ({ clk: 0, stg: [], stgHp0: -1, wallCd: 0, calm: 0, php: -1 });

const SEC = 60;
export const framesOf = (sec: number): number => Math.round(sec * SEC);

/** Какой по счёту (с нуля) будет следующее оглушение в окне — и сколько предыдущих учитывать. */
function recent(ac: AcState, cfg: AntiCfg): number {
  const w = framesOf(cfg.stagger.windowSec);
  ac.stg = ac.stg.filter((t) => ac.clk - t <= w);
  return ac.stg.length;
}
const pick = (a: number[], n: number): number => a[Math.min(n, a.length - 1)]!;

/** Во сколько раз порог стойки выше обычного (б). */
export function poiseMulOf(ac: AcState, cfg: AntiCfg | null): number { return cfg ? pick(cfg.stagger.poiseMul, recent(ac, cfg)) : 1; }
/** Оглушение началось: множитель длительности (б) и начало окна потолка урона (в). */
export function staggerBegin(ac: AcState, cfg: AntiCfg | null, hp: number): number {
  if (!cfg) return 1;
  const mul = pick(cfg.stagger.durMul, recent(ac, cfg));
  ac.stg.push(ac.clk); ac.stgHp0 = hp;
  return mul;
}
/** Потолок урона за окно оглушения, единиц здоровья (в). */
export function staggerCap(cfg: AntiCfg, maxHp: number): number { return Math.max(cfg.stagger.dmgCapMin, Math.round(maxHp * cfg.stagger.dmgCapFrac)); }
/** Можно ли ещё наносить урон оглушённому боссу (в). */
export function staggerRoom(ac: AcState, cfg: AntiCfg | null, hp: number, maxHp: number): boolean {
  if (!cfg || ac.stgHp0 < 0) return true;
  return ac.stgHp0 - hp < staggerCap(cfg, maxHp);
}

/** Сколько раз атака начиналась за окно спама (г). */
export function atkUses(uses: Record<string, number[]> | undefined, id: string, now: number, cfg: AntiCfg): number {
  const l = uses?.[id]; if (!l) return 0;
  const w = framesOf(cfg.spam.windowSec); let n = 0;
  for (const t of l) if (now - t <= w) n++;
  return n;
}
/** Учесть начало атаки (г). */
export function noteAtk(uses: Record<string, number[]>, id: string, now: number, cfg: AntiCfg): void {
  const l = uses[id] ?? (uses[id] = []), w = framesOf(cfg.spam.windowSec);
  l.push(now);
  while (l.length && now - l[0]! > w) l.shift();
}

/** Приоритетные «отгон» и «перемещение» как записи политики (а, е): те же поля, что у policy.priority. */
export interface AntiPriority { chain: string; closeDist: number; closeFrames: number; cornerFrames: number }
export function shovePriority(cfg: AntiCfg | null): AntiPriority | null {
  if (!cfg || !cfg.shoveChain) return null;
  return { chain: cfg.shoveChain, closeDist: cfg.shove.dist, closeFrames: framesOf(cfg.shove.sec), cornerFrames: framesOf(cfg.shove.cornerSec) };
}
