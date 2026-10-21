// Каркас боссов 2.5: исполнитель (кадр за кадром), выбор связок, фазы, стойкость/оглушение/казнь, замедление.
import { describe, expect, it } from 'vitest';
import dummyJson from '../../data/bosses/dummy.json' with { type: 'json' };
import { POISE_MAX, STAGGER_T } from '../../src/core/balance';
import type { BossRef } from '../../src/core/balance';
import { dstate, type DState } from '../../src/core/boss/exec';
import { eligible, newMem, pickChain, type PickCtx } from '../../src/core/boss/policy';
import { bossDef, registerBoss } from '../../src/core/boss/registry';
import { poiseAdd, execBoss } from '../../src/core/bosses2';
import { damageBoss } from '../../src/core/damage';
import { applyStatus } from '../../src/core/status';
import type { Boss } from '../../src/core/types';
import { World } from '../../src/core/world';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- черновые определения в тестах

const dummyRaw = (): Raw => JSON.parse(JSON.stringify(dummyJson)) as Raw;

/** Босс с одной атакой: замах 20, удары 0..3, восстановление 18 (окно 2..17) */
function oneAttack(id: string, over: Raw = {}): Raw {
  return {
    id, name: 'Тестовый', arena: 'vladik', size: { w: 40, h: 78 }, hp: [40, 60], intro: { frames: 1 },
    attacks: [{
      id: 'a', tell: { frames: 20, cue: { color: 'yellow', sfx: 'swing', pose: 'raise' } },
      active: [{ from: 0, to: 3, hit: { x: 0, y: 0, w: 200, h: 78 }, dmg: 1, kind: 'parry' }],
      recovery: { frames: 18, punishWindow: { from: 2, to: 17 } },
    }],
    chains: [{ id: 'c', steps: [{ attack: 'a' }], weight: 1 }],
    phases: [{ fromHp: 1, policy: { chains: ['c'], noRepeat: 0, restFrames: [0, 0] } }],
    ...over,
  };
}
function make(def: Raw, opts: { seed?: number; players?: number; train?: boolean } = {}): { w: World; b: Boss; d: DState } {
  registerBoss(def);
  const w = new World({ seed: opts.seed ?? 1, mode: 'bosstest', boss: def['id'] as string, players: opts.players ?? 1, train: opts.train });
  const b = w.bosses[0]!;
  return { w, b, d: dstate(b) };
}
/** герой рядом с боссом, здоровья много; ввода нет */
function stage(w: World, dx = 40): void {
  const b = w.bosses[0]!, p = w.players[0]!;
  p.x = b.x + b.w + dx; p.y = b.y + b.h - p.h; p.hp = p.maxHp = 999; p.safeX = p.x; p.safeY = p.y;
  w.hitstop = 0; // зависание кадра после удара не должно растягивать счёт тиков
}
const tickN = (w: World, n: number, each?: (i: number) => void): void => { for (let i = 0; i < n; i++) { w.tick(); each?.(i); } };

describe('исполнитель: кадр за кадром', () => {
  it('замах → активные кадры → восстановление, урон только в активных кадрах', () => {
    const { w, b } = make(oneAttack('x_frames'));
    stage(w);
    const log: { st: string; hp: number }[] = [];
    for (let i = 0; i < 60; i++) { stage(w); const hp = w.players[0]!.hp; w.tick(); log.push({ st: b.state, hp: w.players[0]!.hp - hp }); if (log.some((l) => l.hp < 0)) { /* герой получил урон */ } }
    // последовательность состояний: idle, tell×20, active×4, recover×18, idle…
    const runs: [string, number][] = [];
    for (const l of log) { const last = runs[runs.length - 1]; if (last && last[0] === l.st) last[1]++; else runs.push([l.st, 1]); }
    const names = runs.map((r) => r[0]);
    const iTell = names.indexOf('tell');
    expect(iTell).toBeGreaterThanOrEqual(0);
    expect(runs[iTell]).toEqual(['tell', 20]);
    expect(runs[iTell + 1]).toEqual(['active', 4]);
    expect(runs[iTell + 2]).toEqual(['recover', 18]);
    expect(runs[iTell + 3]![0]).toBe('idle');
    // урон был, и только в тиках активного состояния
    const dmgTicks = log.map((l, i) => (l.hp < 0 ? i : -1)).filter((i) => i >= 0);
    expect(dmgTicks.length).toBe(1);
    expect(log[dmgTicks[0]!]!.st).toBe('active');
    for (const l of log) if (l.st !== 'active') expect(l.hp).toBe(0);
  });

  it('окно наказания включается только в заданных кадрах восстановления', () => {
    const { w, b, d } = make(oneAttack('x_punish'));
    stage(w, 400); // далеко: удар не попадёт, но атака пройдёт
    const pun: boolean[] = [];
    for (let i = 0; i < 60; i++) { w.tick(); if (b.state === 'recover') pun.push(d.punish); }
    expect(pun).toHaveLength(18);
    expect(pun.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)).toEqual(Array.from({ length: 16 }, (_, i) => i + 2));
  });

  it('удар не бьёт мимо коробки; коробка зеркалится по взгляду', () => {
    const def = oneAttack('x_box');
    (def['attacks'] as Raw[])[0]!['active'][0].hit = { x: 10, y: 0, w: 60, h: 78 };
    const { w, b } = make(def);
    // герой слева от босса — босс повернётся к нему и ударит влево
    const p = w.players[0]!; p.x = b.x - 40; p.y = b.y + b.h - p.h; p.hp = p.maxHp = 50;
    tickN(w, 80, () => { p.x = b.x - 40; p.y = b.y + b.h - p.h; });
    expect(p.hp).toBeLessThan(50);
    // герой далеко — не попадает
    const m = make(def); const q = m.w.players[0]!; q.hp = q.maxHp = 50;
    tickN(m.w, 80, () => { q.x = m.b.x + 300; q.y = m.b.y + m.b.h - q.h; });
    expect(q.hp).toBe(50);
  });

  it('движение: toward player / wall / fixed', () => {
    const def = oneAttack('x_move');
    const a = (def['attacks'] as Raw[])[0]!;
    a['active'] = []; a['move'] = [{ from: 0, to: 9, vx: 300, toward: 'player' }, { from: 10, to: 14, vx: -100, toward: 'fixed' }];
    const { w, b } = make(def);
    stage(w, 200);
    const x0 = b.x;
    let sawPlayerDir = false, sawFixed = false;
    for (let i = 0; i < 70; i++) {
      stage(w, 200); const px = w.players[0]!.x;
      w.tick();
      if (b.state === 'active' && b.vx > 250) sawPlayerDir = px > b.x;
      if (b.state === 'active' && b.vx === -100) sawFixed = true;
    }
    expect(sawPlayerDir).toBe(true); expect(sawFixed).toBe(true);
    expect(b.x).not.toBe(x0);
  });

  it('снаряды: появляются в нужный кадр, с типом удара hk и своим уроном', () => {
    const def = oneAttack('x_spawn');
    const a = (def['attacks'] as Raw[])[0]!;
    a['tell'].frames = 30; a['active'] = []; a['spawn'] = [{ at: 2, proj: { kind: 'wave', w: 24, h: 18, life: 100 }, kind: 'dodge', ox: 30, oy: 30, vx: 200, dmg: 2 }, { at: 2, proj: { kind: 'spore', w: 12, h: 12, life: 100 }, kind: 'unblockable', vx: 100, vy: -100, count: 3, spread: 10 }];
    const { w } = make(def);
    stage(w, 500);
    let at = -1, n = 0;
    for (let i = 0; i < 80; i++) { w.tick(); if (w.projs.length && at < 0) { at = i; n = w.projs.length; } }
    expect(n).toBe(4);
    // часть снарядов к концу уже могла умереть; проверяем в момент появления:
    const m = make(def); stage(m.w, 500);
    let seen: { hk?: string; dmg?: number; kind: string }[] = [];
    for (let i = 0; i < 80 && !seen.length; i++) { m.w.tick(); seen = m.w.projs.map((p) => ({ hk: p.hk, dmg: p.dmg, kind: p.kind })); }
    expect(seen.filter((s) => s.hk === 'dodge' && s.dmg === 2 && s.kind === 'wave')).toHaveLength(1);
    expect(seen.filter((s) => s.hk === 'unblockable' && s.kind === 'spore')).toHaveLength(3);
  });

  it('двухфазные длинные связки: пауза gapFrames вместо всего восстановления', () => {
    const def = oneAttack('x_gap');
    def['chains'] = [{ id: 'c', steps: [{ attack: 'a', gapFrames: 5 }, { attack: 'a' }], weight: 1 }];
    const { w, b, d } = make(def);
    stage(w, 600);
    const seq: string[] = [];
    for (let i = 0; i < 120; i++) { w.tick(); if (b.state !== seq[seq.length - 1]) seq.push(b.state); }
    // idle, tell, active, recover(5 кадров), tell, active, recover, idle
    expect(seq.slice(1, 9)).toEqual(['idle', 'tell', 'active', 'recover', 'tell', 'active', 'recover', 'idle']);
    expect(d.mem.hist[0]).toBe('c');
  });

  it('контактный урон тела (contact) и тип удара', () => {
    const def = oneAttack('x_contact'); def['contact'] = { dmg: 1, kind: 'dodge' };
    (def['phases'] as Raw[])[0]!['policy'].restFrames = [600, 600];
    const { w, b } = make(def);
    const p = w.players[0]!; p.hp = p.maxHp = 9;
    p.x = b.x + 5; p.y = b.y + b.h - p.h;
    tickN(w, 5);
    expect(p.hp).toBe(8);
  });
});

describe('выбор связок', () => {
  const dummy = bossDef('dummy')!;
  const ctx = (o: Partial<PickCtx> = {}): PickCtx => ({ dist: 200, side: 'center', hpFrac: 1, phase: 1, closeF: {}, ...o });

  it('детерминизм: одно зерно — одна последовательность связок, другое зерно — другая', () => {
    const run = (seed: number): string[] => {
      const { w, d, b } = make(structuredClone(dummyRaw()), { seed });
      for (let i = 0; i < 9000; i++) { stage(w, 150); b.hp = b.maxHp; w.tick(); }
      return d.mem.hist.slice();
    };
    const a = run(11), a2 = run(11), c = run(12);
    expect(a.length).toBeGreaterThan(5);
    expect(a2).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('noRepeat: связка не повторяется подряд, пока есть другие допустимые', () => {
    const { w, d, b } = make(structuredClone(dummyRaw()), { seed: 3 });
    const seen: string[] = [];
    let last = 0;
    for (let i = 0; i < 20000; i++) {
      stage(w, 150); b.hp = b.maxHp; w.tick();
      if (d.mem.hist.length !== last) { last = d.mem.hist.length; seen.push(d.mem.hist[d.mem.hist.length - 1]!); }
    }
    expect(seen.length).toBeGreaterThan(8);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('«сухое правило»: связка с невыполненными условиями не выбирается ни при каком r', () => {
    const mem = newMem();
    // вплотную (dist 20): c_lunge (thrust: 90–360), c_dash (150–800), c_rain (60–700) недопустимы; c_crush — не в фазе 1
    for (let k = 0; k < 200; k++) {
      const id = pickChain(dummy, ctx({ dist: 20 }), mem, k / 200)!;
      expect(['c_combo', 'c_slam_orb']).toContain(id);
    }
    // далеко (dist 500): c_combo (0–140) недопустима
    for (let k = 0; k < 200; k++) expect(pickChain(dummy, ctx({ dist: 500 }), mem, k / 200)).not.toBe('c_combo');
    // фаза 1: c_crush недоступна, фаза 2 и вплотную — доступна, далеко (>220) — нет
    expect(eligible(dummy, ctx({ dist: 100, phase: 1 }), mem).map((c) => c.id)).not.toContain('c_crush');
    expect(eligible(dummy, ctx({ dist: 100, phase: 2 }), mem).map((c) => c.id)).toContain('c_crush');
    expect(eligible(dummy, ctx({ dist: 400, phase: 2 }), mem).map((c) => c.id)).not.toContain('c_crush');
  });

  it('перезарядка (cooldown) закрывает связку, пока не пройдёт; условие hpBelow/arenaSide работают', () => {
    const mem = newMem(); mem.cd['c_crush'] = 50;
    expect(eligible(dummy, ctx({ dist: 100, phase: 2 }), mem).map((c) => c.id)).not.toContain('c_crush');
    mem.cd['c_crush'] = 0;
    expect(eligible(dummy, ctx({ dist: 100, phase: 2 }), mem).map((c) => c.id)).toContain('c_crush');
    const def = structuredClone(dummyRaw()); def['id'] = 'x_req';
    (def['chains'] as Raw[])[1]!['requires'] = { hpBelow: 0.5, arenaSide: 'left' };
    const d2 = registerBoss(def);
    expect(eligible(d2, ctx({ dist: 200, hpFrac: 0.9, side: 'left' }), newMem()).map((c) => c.id)).not.toContain('c_lunge');
    expect(eligible(d2, ctx({ dist: 200, hpFrac: 0.4, side: 'right' }), newMem()).map((c) => c.id)).not.toContain('c_lunge');
    expect(eligible(d2, ctx({ dist: 200, hpFrac: 0.4, side: 'left' }), newMem()).map((c) => c.id)).toContain('c_lunge');
  });

  it('если все допустимые запрещены noRepeat — повтор разрешён (кроме самой последней), если вообще никого нет — null', () => {
    const mem = newMem();
    mem.hist = ['c_combo', 'c_slam_orb'];
    // вплотную допустимы только c_combo и c_slam_orb; noRepeat 1 запрещает последнюю (c_slam_orb) → c_combo
    for (let k = 0; k < 50; k++) expect(pickChain(dummy, ctx({ dist: 20 }), mem, k / 50)).toBe('c_combo');
    // герой исчез (dist = Infinity): подходят только связки без условия дистанции
    expect(pickChain(dummy, ctx({ dist: Infinity }), newMem(), 0.5)).not.toBeNull();
    const none = structuredClone(dummyRaw()); none['id'] = 'x_none';
    for (const c of none['chains'] as Raw[]) c['requires'] = { hpBelow: 0.01 };
    expect(pickChain(registerBoss(none), ctx(), newMem(), 0.3)).toBeNull();
  });

  it('усталость уменьшает вес часто используемой связки', () => {
    const mem = newMem();
    const count = (m: typeof mem): number => { let n = 0; for (let k = 0; k < 400; k++) if (pickChain(dummy, ctx({ dist: 200 }), { ...m, hist: [] }, (k + 0.5) / 400) === 'c_lunge') n++; return n; };
    const fresh = count(mem);
    mem.uses['c_lunge'] = 3;
    expect(count(mem)).toBeLessThan(fresh);
  });

  it('приоритет «отогнать»: вплотную дольше порога — выбирается c_shove, минуя веса', () => {
    const mem = newMem();
    expect(pickChain(dummy, ctx({ dist: 20, closeF: { c_shove: 149 } }), mem, 0.9)).not.toBe('c_shove');
    expect(pickChain(dummy, ctx({ dist: 20, closeF: { c_shove: 150 } }), mem, 0.9)).toBe('c_shove');
    mem.cd['c_shove'] = 10; // на перезарядке — нельзя и приоритетной
    expect(pickChain(dummy, ctx({ dist: 20, closeF: { c_shove: 400 } }), mem, 0.9)).not.toBe('c_shove');
  });

  it('в живом бою: герой вплотную долго получает «отталкивание»', () => {
    const { w, b, d } = make(structuredClone(dummyRaw()), { seed: 5 });
    let shoved = false;
    for (let i = 0; i < 3000 && !shoved; i++) { const p = w.players[0]!; p.x = b.x + b.w / 2 - 7 + 30; p.y = b.y + b.h - p.h; p.hp = p.maxHp = 999; b.hp = b.maxHp; w.tick(); if (d.atk === 'shove') shoved = true; }
    expect(shoved).toBe(true);
  });
});

describe('фазы', () => {
  const hit = (w: World, k = 1): void => { const p = w.players[0]!; for (let i = 0; i < k; i++) damageBoss(w, 'd0', p); };

  it('порог фазы: рёв, неуязвимость, сцена (пропускаемая), переходный приём с телеграфом, потом политика фазы 2', () => {
    const { w, b, d } = make(structuredClone(dummyRaw()), { seed: 2 });
    stage(w, 300);
    tickN(w, 130, () => stage(w, 300)); // интро позади
    b.hp = Math.floor(b.maxHp * 0.55) + 1; hit(w);
    expect(b.phase).toBe(2); expect(b.state).toBe('rage'); expect(d.mode).toBe('rage');
    const hp = b.hp; hit(w); expect(b.hp).toBe(hp); // в рёве неуязвим
    tickN(w, 70, () => stage(w, 300)); expect(d.mode).toBe('rage');
    tickN(w, 15, () => stage(w, 300)); expect(d.mode).toBe('scene');
    // пропуск сцены прыжком
    w.players[0]!.pend.jumpP = true;
    tickN(w, 3, () => stage(w, 300));
    expect(d.mode).toBe('attack'); expect(d.enter).toBe(true); expect(d.atk).toBe('slam');
    tickN(w, 2, () => stage(w, 300)); expect(b.state).toBe('tell'); expect(d.cue!.color).toBe('red');
    // после переходного приёма — обычный выбор
    tickN(w, 200, () => stage(w, 300));
    expect(d.enter).toBe(false);
  });

  it('сцена без пропуска доигрывается целиком', () => {
    const { w, b, d } = make(structuredClone(dummyRaw()));
    stage(w, 300); tickN(w, 130, () => stage(w, 300));
    b.hp = Math.floor(b.maxHp * 0.55) + 1; hit(w);
    let n = 0; while ((d.mode === 'rage' || d.mode === 'scene') && n < 400) { tickN(w, 1, () => stage(w, 300)); n++; }
    expect(n).toBeGreaterThanOrEqual(168); expect(n).toBeLessThanOrEqual(173); // рёв 80 + сцена 90 кадров
  });

  it('связка фазы 2 (c_crush) бывает только во второй фазе', () => {
    const used = (phase: 1 | 2): Set<string> => {
      const { w, b, d } = make(structuredClone(dummyRaw()), { seed: 9 });
      if (phase === 2) { stage(w, 300); tickN(w, 130, () => stage(w, 300)); b.hp = Math.floor(b.maxHp * 0.5); hit(w); }
      const keep = b.hp;
      for (let i = 0; i < 20000; i++) { stage(w, 100); b.hp = keep; w.tick(); }
      return new Set(d.mem.hist);
    };
    expect(used(1).has('c_crush')).toBe(false);
    expect(used(2).has('c_crush')).toBe(true);
  });

  it('смерть: состояние dead, снаряды убраны, победа сцены', () => {
    const { w, b, d } = make(structuredClone(dummyRaw()));
    stage(w, 300); tickN(w, 130, () => stage(w, 300));
    b.hp = 1; hit(w);
    expect(b.state).toBe('dead'); expect(d.mode).toBe('dead'); expect(w.bossDead).toBe(true);
    tickN(w, 400, () => stage(w, 300));
    expect(w.won).toBe(true);
  });
});

describe('интеграция со стойкостью, оглушением, казнью и замедлением', () => {
  it('стойкость копится от ударов; полная шкала — оглушение: атака обрывается, босс не бьёт, потом снова в бою', () => {
    const { w, b, d } = make(oneAttack('x_poise'));
    stage(w);
    tickN(w, 10, () => stage(w)); // в замахе
    expect(b.state).toBe('tell');
    const p = w.players[0]!;
    for (let i = 0; i < POISE_MAX[1]!; i++) poiseAdd(w, b, 1);
    expect(b.stagger).toBeGreaterThan(0);
    expect(d.mode).toBe('idle'); expect(d.atk).toBeNull();
    const hp = p.hp; const af = d.af;
    tickN(w, Math.floor(STAGGER_T * 60) - 20, () => stage(w));
    expect(p.hp).toBe(hp); expect(d.af).toBe(af); expect(b.stagger).toBeGreaterThan(0);
    for (let i = 0; i < 60 && b.stagger > 0; i++) tickN(w, 1, () => stage(w));
    expect(b.stagger).toBeLessThanOrEqual(0); expect(b.poiseImmune).toBeGreaterThan(0);
    tickN(w, 120, () => stage(w));
    expect(d.mem.hist.length).toBeGreaterThanOrEqual(1); // продолжил выбирать связки
  });

  it('по оглушённому двойной урон; казнь снимает долю здоровья', () => {
    const { w, b } = make(oneAttack('x_exec', { hp: [100, 100] }));
    stage(w); tickN(w, 5, () => stage(w));
    const p = w.players[0]!;
    damageBoss(w, 'd0', p); const one = 100 - b.hp;
    for (let i = 0; i < POISE_MAX[1]!; i++) poiseAdd(w, b, 1);
    const before = b.hp; damageBoss(w, 'd0', p);
    expect(before - b.hp).toBe(2 * one);
    const h2 = b.hp; execBoss(w, p, { key: 'd0' as BossRef }, 'u');
    expect(b['executed']).toBe(true); expect(h2 - b.hp).toBeGreaterThanOrEqual(4);
  });

  it('замедление (оцепенение) растягивает время босса: кадров исполнителя меньше', () => {
    const frames = (slow: boolean): number => {
      const def = oneAttack('x_slow'); (def['attacks'] as Raw[])[0]!['recovery'] = { frames: 300, punishWindow: { from: 2, to: 100 } };
      const { w, b, d } = make(def);
      stage(w, 600); tickN(w, 5, () => stage(w, 600));
      expect(d.mode).toBe('attack');
      if (slow) applyStatus(w, b, 'slow', 10, w.players[0]!);
      const af0 = d.af; tickN(w, 50, () => stage(w, 600));
      return d.af - af0;
    };
    const fast = frames(false), slow = frames(true);
    expect(fast).toBe(50);
    expect(slow).toBeGreaterThanOrEqual(38); expect(slow).toBeLessThanOrEqual(41);
  });

  it('босс в тренировке: фаза старта, телеграф с названием атаки', () => {
    const { w, b } = make(structuredClone(dummyRaw()), { train: true });
    expect(w.train).toBeTruthy();
    expect(w.testBoss()).toBe(b);
    stage(w, 150);
    let name = '';
    for (let i = 0; i < 600 && !name; i++) { stage(w, 150); w.tick(); name = w.train!.tele?.name ?? ''; }
    expect(name).not.toBe('');
  });

  it('тренировка с фазой 2: босс стартует во второй фазе', () => {
    registerBoss(structuredClone(dummyRaw()));
    const w = new World({ seed: 1, mode: 'bosstest', boss: 'dummy', players: 1, train: true, trainPhase: 2 });
    expect(w.bosses[0]!.phase).toBe(2);
    expect(w.bosses[0]!.hp / w.bosses[0]!.maxHp).toBeLessThanOrEqual(0.55);
  });
});
