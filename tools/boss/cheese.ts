// Инструмент эксплойтов:  npm run boss:cheese -- --boss dummy [--runs 12] [--max 150] [--seed 1] [--md] [--json]
// «Злые» боты ищут дешёвые способы победить босса: хаг вплотную с отбивами/рывками, угол + удары, цепочка оглушений, спам отбива, спам инструмента, рывки сквозь тело.
// Каждый бот играет один и тот же бой дважды: с выключенной защитой от читов («до») и с включённой («после»).
// Боты реагируют на замах по данным атак (как идеальный игрок) с заданной долей ошибок — чтобы цифры не были слишком радужными.
// Проходит, если ни один бот не убивает босса быстрее fastSec при малых потерях и не «выживает бесконечно» (stallSec живым, без потерь, босс жив).
import { PLAT, T } from '../../src/core/balance';
import { dstate, attackOf, defOfBoss } from '../../src/core/boss/exec';
import { attackEvents } from '../../src/core/boss/validate';
import { bossDef, bossRaw, registerBoss } from '../../src/core/boss/registry';
import { feedInput } from '../../src/core/fuzzinput';
import { mulberry32, type Rng } from '../../src/core/rng';
import type { Boss, Inp } from '../../src/core/types';
import { World } from '../../src/core/world';
import { mean, median, num, pct } from '../bot/stats';
import { loadBossFiles } from './files';

export interface CheeseBot {
  id: string; title: string;
  /** где стоит: вплотную к боссу, в левом углу арены, на расстоянии (кайтинг), у дальней от боссов стены или на самой высокой платформе (насест) */
  pos: 'hug' | 'corner' | 'kite' | 'far' | 'perch';
  /** казнь оглушённого босса */
  exec: boolean;
  /** реакция на замах по данным: парировать, рывком или никак */
  resp: 'parry' | 'dash' | 'none';
  /** доля верных реакций */
  skill: number;
  /** жать отбив при каждой возможности (без знания замахов) */
  parrySpam?: boolean;
  /** бросать метательную иглу при каждой возможности */
  tool?: boolean;
  /** непрерывно проходить рывком сквозь босса */
  dashThrough?: boolean;
}
export const BOTS: CheeseBot[] = [
  { id: 'hug-parry', title: 'Хаг вплотную + отбивы', pos: 'hug', exec: false, resp: 'parry', skill: 0.85 },
  { id: 'hug-dash', title: 'Хаг вплотную + рывки', pos: 'hug', exec: false, resp: 'dash', skill: 0.85 },
  { id: 'corner', title: 'Угол + удары + казнь', pos: 'corner', exec: true, resp: 'parry', skill: 0.85 },
  { id: 'stagger-chain', title: 'Цепочка оглушений и казней', pos: 'hug', exec: true, resp: 'parry', skill: 0.9 },
  { id: 'parry-spam', title: 'Спам отбива без чтения замахов', pos: 'hug', exec: false, resp: 'none', skill: 0, parrySpam: true },
  { id: 'tool-spam', title: 'Спам метательной иглы издали', pos: 'kite', exec: false, resp: 'dash', skill: 0.8, tool: true },
  { id: 'dash-through', title: 'Рывки сквозь тело босса', pos: 'hug', exec: false, resp: 'none', skill: 0, dashThrough: true },
  // волна 0: неподвижные боссы, арены с платформами, несколько боссов
  { id: 'far-camp', title: 'Отсидка у дальней стены (вне досягаемости неподвижного)', pos: 'far', exec: false, resp: 'dash', skill: 0.8, tool: true },
  { id: 'perch', title: 'Насест на самой высокой платформе + иглы', pos: 'perch', exec: false, resp: 'dash', skill: 0.8, tool: true },
];

export interface CheeseRun { won: boolean; died: boolean; stalled: boolean; sec: number; hurt: number; staggers: number }

/** ближайший к герою живой босс (при нескольких боссах бот играет против ближайшего) */
function nearestLive(w: World): Boss {
  const p = w.players[0]!, live = w.bosses.filter((b) => b.state !== 'dead');
  return (live.length ? live : w.bosses).reduce((best, b) => (Math.abs(b.x + b.w / 2 - p.x - 7) < Math.abs(best.x + best.w / 2 - p.x - 7) ? b : best));
}
/** самая высокая платформа арены сейчас (статичные PLAT-тайлы уровня и показанные динамические): центр x и верх y, px */
function highestPerch(w: World): { x: number; top: number } | null {
  let best: { x: number; top: number } | null = null;
  const floor = dstate(w.bosses[0]!).floor;
  for (let ty = 0; ty < w.L.H; ty++) {
    let x0 = -1;
    for (let tx = 0; tx <= w.L.W; tx++) {
      const t = tx < w.L.W ? w.tileAt(tx, ty) : 0, plat = t === PLAT && ty * T < floor - 32;
      if (plat && x0 < 0) x0 = tx;
      if (!plat && x0 >= 0) { const top = ty * T; if (!best || top < best.top) best = { x: ((x0 + tx) / 2) * T, top }; x0 = -1; }
    }
  }
  return best;
}

export class Driver {
  rng: Rng; tick = 0; reacted = new Set<string>();
  constructor(readonly w: World, readonly bot: CheeseBot, seed: number) { this.rng = mulberry32(seed * 7919 + 13); }
  /** кадры до ближайшего удара текущей атаки (по данным) у любого из боссов, null если никто не атакует */
  nextHitIn(): number | null {
    let best: number | null = null;
    for (const b of this.w.bosses) {
      const d = dstate(b);
      if (d.mode !== 'attack' || !d.atk) continue;
      const a = attackOf(defOfBoss(b), d.atk);
      for (const e of attackEvents(a)) if (e.t >= d.af) { if (best === null || e.t - d.af < best) best = e.t - d.af; break; }
    }
    return best;
  }
  act(): Inp {
    this.tick++;
    const w = this.w, b = nearestLive(w), p = w.players[0]!, d = dstate(b), bot = this.bot;
    const bx = b.x + b.w / 2, hx = p.x + 7, dx = bx - hx, adx = Math.abs(dx), toward = Math.sign(dx) || 1;
    const inp: Inp = {};
    const wallL = 32 + 40;
    // --- положение ---
    let want: number;
    if (bot.pos === 'hug') want = adx > 34 ? toward : adx < 24 ? -toward : 0;
    else if (bot.pos === 'corner') want = hx > wallL + 6 ? -1 : hx < wallL - 6 ? 1 : 0;
    else if (bot.pos === 'far') want = bx > (w.L.W * T) / 2 ? (hx > wallL + 6 ? -1 : 0) : (hx < (w.L.W - 1) * T - 60 ? 1 : 0); // к стене, дальней от босса, и стоять
    else if (bot.pos === 'perch') {
      const pc = highestPerch(w);
      if (!pc) want = bx > (w.L.W * T) / 2 ? -1 : 1;
      else { want = Math.abs(hx - pc.x) > 24 ? Math.sign(pc.x - hx) : 0; if (Math.abs(hx - pc.x) < 120 && p.y + p.h > pc.top + 2 && this.tick % 40 === 0) inp.jump = true; if (p.y + p.h > pc.top + 2 && Math.abs(hx - pc.x) < 60) inp.jump = this.tick % 50 < 25; }
    } else want = adx < 230 ? -toward : adx > 300 ? toward : 0; // кайтинг на 230–300 px
    if (bot.pos === 'kite' && hx < 32 + 60 && adx < 230) want = 0; // прижат к стене — стоит
    if ((bot.pos === 'far' || bot.pos === 'perch') && bot.tool) { /* иглу бросает в сторону босса: ниже */ }
    if (bot.dashThrough) want = 0;
    inp.left = want < 0; inp.right = want > 0;
    // --- удар / казнь ---
    const stag = b.stagger > 0.2 && adx < 60 && bot.pos !== 'far' && bot.pos !== 'perch';
    if (bot.exec && stag) { inp.up = true; inp.atk = this.tick % 2 === 0; }
    else if (adx < 66 && bot.pos !== 'kite' && bot.pos !== 'far' && bot.pos !== 'perch') { inp.atk = this.tick % 2 === 0; if (want === 0 && p.face !== toward) { inp.left = toward < 0; inp.right = toward > 0; } }
    else if (bot.pos === 'corner' && adx >= 66) { /* ждёт в углу */ }
    if (bot.pos === 'corner' && want === 0 && p.face !== toward) { inp.left = toward < 0; inp.right = toward > 0; }
    if (bot.tool) { inp.tool = this.tick % 30 === 0; if (want === 0 && p.face !== toward) { inp.left = toward < 0; inp.right = toward > 0; } }
    // --- защита ---
    if (bot.parrySpam) inp.heal = this.tick % 3 === 0;
    if (bot.dashThrough && p.dashCd <= 0) { inp.dash = this.tick % 2 === 0; inp.left = toward < 0; inp.right = toward > 0; if (adx < 30) { inp.left = toward > 0; inp.right = toward < 0; } }
    const fa = this.nextHitIn();
    if (fa !== null && bot.resp !== 'none' && fa === (bot.resp === 'parry' ? 4 : 6)) {
      const key = `${d.ac.clk}`;
      if (!this.reacted.has(key)) {
        this.reacted.add(key);
        if (this.rng() < bot.skill) { if (bot.resp === 'parry') inp.heal = true; else { inp.dash = true; inp.left = toward > 0; inp.right = toward < 0; } }
      }
    }
    // снаряды рядом: тот же ответ
    return inp;
  }
}

export function runCheese(bot: CheeseBot, bossId: string, seed: number, maxSec: number): CheeseRun {
  const w = new World({ seed, mode: 'bosstest', boss: bossId, players: 1, loadoutSave: { weapon: 'needle', tool: bot.tool ? 'throwneedle' : '', charms: [], have: { weapons: ['needle'], tools: bot.tool ? ['throwneedle'] : [], charms: [] } } });
  const p = w.players[0]!, drv = new Driver(w, bot, seed);
  const intro = (): boolean => w.bosses.some((q) => dstate(q).mode === 'intro'), allDead = (): boolean => w.bosses.every((q) => q.state === 'dead');
  if (bot.tool) p.silk = w.silkMax;
  let started = -1, hurt = 0, hp = p.hp, staggers = 0, wasStag = false;
  const hpAt = p.hp;
  for (let t = 0; t < (maxSec + 20) * 60; t++) {
    feedInput(w, [intro() ? {} : drv.act()]);
    if (bot.tool && p.silk < 3) p.silk = w.silkMax; // игла возвращает нить при подборе; не даём боту упереться в нехватку
    w.tick();
    if (started < 0 && !intro()) started = t;
    if (p.hp < hp) hurt += hp - p.hp;
    hp = p.hp;
    const st = w.bosses.some((q) => q.stagger > 0); if (st && !wasStag) staggers++; wasStag = st;
    const sec = started < 0 ? 0 : (t - started) / 60;
    if (allDead()) return { won: true, died: false, stalled: false, sec, hurt, staggers };
    if (w.wiping || p.downed) return { won: false, died: true, stalled: false, sec, hurt, staggers };
    if (started >= 0 && sec >= maxSec) return { won: false, died: false, stalled: hurt <= Math.floor(hpAt / 3), sec, hurt, staggers };
  }
  return { won: false, died: false, stalled: false, sec: maxSec, hurt, staggers };
}

export interface CheeseCell { bot: string; title: string; variant: 'до' | 'после'; n: number; wins: number; died: number; stalled: number; killSecMedian: number; killSecMin: number; hurtMean: number; fastCheap: number; staggers: number }
export interface CheeseSpec { boss: string; runs: number; maxSec: number; seed: number; fastSec: number; cheapHurt: number }
export const OFF_ID = (boss: string): string => boss + '_nocheese';

/** Зарегистрировать копию босса без защиты от читов (для колонки «до»); у боя нескольких боссов копии получают и участники. */
export function registerOff(boss: string): string {
  const id = OFF_ID(boss);
  if (!bossDef(id)) {
    const raw = (bossRaw(boss) ?? loadBossFiles(boss)[0]?.raw) as Record<string, any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any -- черновая копия определения
    if (!raw) throw new Error('нет босса ' + boss);
    const cd = raw['conductor'] as { members: { boss: string }[] } | undefined;
    if (cd) for (const m of cd.members) m.boss = registerOff(m.boss);
    registerBoss({ ...raw, id, antiCheese: { enabled: false } });
  }
  return id;
}

export function runCheeseTable(spec: CheeseSpec, bots = BOTS): CheeseCell[] {
  const off = registerOff(spec.boss), cells: CheeseCell[] = [];
  for (const bot of bots) for (const [variant, id] of [['до', off], ['после', spec.boss]] as const) {
    const rs: CheeseRun[] = [];
    for (let i = 0; i < spec.runs; i++) rs.push(runCheese(bot, id, spec.seed + i * 17, spec.maxSec));
    const wins = rs.filter((r) => r.won);
    cells.push({
      bot: bot.id, title: bot.title, variant, n: rs.length, wins: wins.length, died: rs.filter((r) => r.died).length, stalled: rs.filter((r) => r.stalled).length,
      killSecMedian: wins.length ? median(wins.map((r) => r.sec)) : NaN, killSecMin: wins.length ? Math.min(...wins.map((r) => r.sec)) : NaN,
      hurtMean: mean(rs.map((r) => r.hurt)), staggers: mean(rs.map((r) => r.staggers)),
      fastCheap: rs.filter((r) => r.won && r.sec < spec.fastSec && r.hurt <= spec.cheapHurt).length,
    });
  }
  return cells;
}

export function renderCheese(cells: CheeseCell[], spec: CheeseSpec): string {
  const out = [`Боёв на ячейку: ${spec.runs}; лимит ${spec.maxSec} с; «быстро и дёшево» — убит быстрее ${spec.fastSec} с при потерях не больше ${spec.cheapHurt}.`, '',
    '| Бот | Правила | Побед | Быстро и дёшево | Погиб | «Бесконечно» | Время убийства, с: медиана / мин | Потери здоровья (ср.) | Оглушений (ср.) |', '|---|---|---|---|---|---|---|---|---|'];
  for (const c of cells) out.push(`| ${c.title} | ${c.variant === 'до' ? 'выкл.' : 'вкл.'} | ${c.wins}/${c.n} | ${c.fastCheap}/${c.n} | ${c.died} | ${c.stalled} | ${num(c.killSecMedian, 1)} / ${num(c.killSecMin, 1)} | ${num(c.hurtMean, 1)} | ${num(c.staggers, 1)} |`);
  return out.join('\n');
}
/** Нарушения порогов для колонки «после»: список бот → что не так (пусто — проходит). */
export function cheeseViolations(cells: CheeseCell[], maxFastShare = 0.2, maxStallShare = 0.2): string[] {
  const bad: string[] = [];
  for (const c of cells) {
    if (c.variant !== 'после') continue;
    if (c.fastCheap / c.n > maxFastShare) bad.push(`${c.bot}: ${c.fastCheap}/${c.n} боёв убили босса быстро и дёшево (минимум ${num(c.killSecMin, 1)} с)`);
    if (c.stalled / c.n > maxStallShare) bad.push(`${c.bot}: ${c.stalled}/${c.n} боёв «бесконечно» живы без потерь`);
  }
  return bad;
}

if (process.argv[1]?.endsWith('cheese.ts')) {
  const argv = process.argv.slice(2);
  const opt = (n: string, d: string): string => { const i = argv.indexOf('--' + n); return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : d; };
  const spec: CheeseSpec = { boss: opt('boss', 'dummy'), runs: +opt('runs', '12'), maxSec: +opt('max', '150'), seed: +opt('seed', '1'), fastSec: +opt('fast', '35'), cheapHurt: +opt('cheap', '1') };
  if (!bossDef(spec.boss)) { console.error('Нет босса на данных «' + spec.boss + '»'); process.exit(2); }
  const cells = runCheeseTable(spec);
  if (argv.includes('--json')) console.log(JSON.stringify({ spec, cells }, null, 2));
  else {
    console.log(renderCheese(cells, spec));
    const bad = cheeseViolations(cells);
    console.log('\n' + (bad.length ? 'НЕ ПРОХОДИТ:\n  ' + bad.join('\n  ') : 'Проходит: ни один бот не убивает босса быстро и дёшево и не живёт «бесконечно».'));
    process.exitCode = bad.length ? 1 : 0;
  }
  void pct;
}
