// Один бой бота против босса на ядре v2 — без браузера и отрисовки. Бой идёт с одной жизнью: оборвалась нить — поражение.
// Время боя считается от конца вступления босса. Тот же алгоритм, что в legacy/tools/bot.js (fightInPage), но кадр = один тик ядра.
import { GOLDEN_EXT, outcome, type Journal } from '../../src/core/journal';
import { feedInput } from '../../src/core/fuzzinput';
import { Recorder } from '../../src/core/session';
import { makeTtrec, type Ttrec } from '../../src/core/ttrec';
import type { Inp } from '../../src/core/types';
import { World, inset, overlap, curtainHazard } from '../../src/core/world';
import { Brain, type BrainStats } from './brain';
import { raceBossIds } from '../../src/core/boss/catalog';
import { bossDef } from '../../src/core/boss/registry';

/** Боссы таблицы баланса: четыре старых + все показываемые боссы на данных (список строится из реестра, при добавлении босса этот файл не меняется) */
const LEGACY = ['misha', 'vladik', 'tima', 'korne'];
export const BOSSES: readonly string[] = [...LEGACY, ...raceBossIds().filter((id) => !LEGACY.includes(id))];
export type BossId = string;
export const BOSS_NAMES: Record<BossId, string> = { misha: 'Миша', vladik: 'Владик', tima: 'Тима', korne: 'Корнематка', ...Object.fromEntries(BOSSES.filter((id) => !LEGACY.includes(id)).map((id) => [id, bossDef(id)?.name ?? id])) };

export interface FightJob {
  boss: BossId; skill: number; players: number; seed: number;
  /** лимит боя в секундах игрового времени */
  maxSec: number;
  /** сохранить журнал ввода (для watch и replay) */
  record?: boolean;
  /** версия игры в журнале */
  ver?: string;
  /** тиков тишины перед боем (в золотых записях v1.8 их 30) */
  preTicks?: number;
}
export interface FightResult {
  won: boolean; sec: number; ticks: number; dmg: number; parry: number; pdodge: number; hurt: Record<string, number>; stag: number; exec: number;
  bossFrac: number; phase: number; bombs: number;
  /** нить оборвалась (поражение) */
  died?: boolean; timeout?: boolean;
  error?: string;
  /** запись боя (если job.record) */
  ttrec?: Ttrec;
}

/** Мир боя: арена босса (босс-тест) или Корнематка из истории с героями у входа в арену и двойным прыжком (как в golden: ex 10). */
export function newFightWorld(boss: BossId, players: number, seed: number): World {
  return new World(boss === 'korne' ? { seed, mode: 'story', players } : { seed, mode: 'bosstest', boss, players });
}

const hurtCause = (w: World, p: World['players'][number]): string => {
  const pr = inset(p, 2);
  for (const q of w.projs as { x: number; y: number; w: number; h: number; kind: string; delay?: number }[]) if (!(q.delay! > 0) && overlap(pr, q)) return q.kind;
  const bb = w.testBoss() ?? w.boss;
  if (bb && overlap(pr, inset(bb, 8))) return 'тело:' + bb.state;
  if (w.curtains && w.curtains.some((c) => c.slime > 0 && overlap(pr, curtainHazard(c)))) return 'штора';
  return 'other';
};

export const failed = (e: unknown): FightResult => ({ won: false, sec: 0, ticks: 0, dmg: 0, parry: 0, pdodge: 0, hurt: {}, stag: 0, exec: 0, bossFrac: 1, phase: 1, bombs: 0, error: String((e as Error)?.stack ?? e).slice(0, 600) });

export function runFight(job: FightJob): FightResult {
  const { boss, skill, players, seed, maxSec } = job;
  const w = newFightWorld(boss, players, seed);
  const rec = job.record ? Recorder.start({ cat: null, seed, ver: job.ver ?? '0', mem: true }) : null;
  rec?.begin(w);
  for (let i = 0; i < (job.preTicks ?? 0); i++) { feedInput(w, w.players.map(() => ({}))); rec?.tick(w); w.tick(); }
  if (boss === 'korne') { GOLDEN_EXT[10]!(w, 0, 0); rec?.act('ex', 10, 0, 0); }
  const brains = w.players.map((_, i) => new Brain(w, i, skill, seed * 31 + i * 7 + 1));
  const getBoss = () => (boss === 'korne' ? w.boss : w.testBoss());

  const cnt = { dmg: 0, parry: 0, pdodge: 0, hurt: {} as Record<string, number>, stag: 0, exec: 0 };
  // события ядра: отбив, казнь, удар по герою (метка для разбора причин); обёртка живёт на экземпляре мира
  let hurtFlag = false;
  (w as unknown as { emit: World['emit'] }).emit = (k, props) => {
    if (k === 'buzz') hurtFlag = true;
    else if (k === 'flash' && props && props['ms'] === 90) cnt.parry++;
    else if (k === 'execFx') cnt.exec++;
    else if (k === 'burst' && props && props['n'] === 14 && w.players.some((p) => p.pal.accent === props['c'])) cnt.pdodge++; // идеальный уворот: рывок сквозь удар
  };
  const brainsStats = (): BrainStats[] => brains.map((b) => b.stats);

  let frame = 0, started = -1, lastStag = 0, fightFrames = 0;
  const raws: Inp[] = [];
  const hp0 = w.players.map((p) => p.hp);
  const res = (won: boolean, extra: Partial<FightResult> = {}): FightResult => {
    const b = getBoss();
    const r: FightResult = { won, sec: fightFrames / 60, ticks: frame, dmg: cnt.dmg, parry: cnt.parry, pdodge: cnt.pdodge, hurt: cnt.hurt, stag: cnt.stag, exec: cnt.exec,
      bossFrac: b ? Math.max(0, b.hp) / b.maxHp : 1, phase: b ? b.phase || 1 : 1, bombs: brainsStats().reduce((a, x) => a + x.bombs, 0), ...extra };
    if (rec) r.ttrec = makeTtrec(rec.J as Journal, { ver: job.ver ?? '0', meta: { kind: 'bot', boss, skill, label: `${BOSS_NAMES[boss]} · бот ${skill}` }, expect: JSON.parse(JSON.stringify(outcome(w))) as Record<string, unknown> });
    return r;
  };
  for (;;) {
    const b = getBoss();
    if (started < 0 && b && !['intro', 'sleep', 'roar'].includes(b.state)) started = frame;
    for (let i = 0; i < brains.length; i++) raws[i] = brains[i]!.act(frame);
    feedInput(w, raws);
    rec?.tick(w);
    w.tick(); frame++;
    if (started >= 0) fightFrames = frame - started;
    // счётчики урона и идеальных уворотов
    for (let i = 0; i < w.players.length; i++) {
      const p = w.players[i]!, d = hp0[i]! - p.hp;
      if (d > 0) { cnt.dmg += d; if (hurtFlag) { const c = hurtCause(w, p); cnt.hurt[c] = (cnt.hurt[c] || 0) + 1; } }
      hp0[i] = p.hp;
    }
    hurtFlag = false;
    if (b && (b.stagger || 0) > 0 && !lastStag) cnt.stag++;
    lastStag = (b && b.stagger > 0) ? 1 : 0;
    if (w.wiping) return res(false, { died: true });
    if (b && ['dead', 'gone'].includes(b.state) && started >= 0) return res(true);
    if (fightFrames > maxSec * 60 || frame > (maxSec + 30) * 60) return res(false, { timeout: true });
  }
}
