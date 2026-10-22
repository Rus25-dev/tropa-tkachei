// Волна 0, сцены и трансформация: фаза запускает пропускаемую сцену с событиями (камера, надпись, звук), меняет тело (размер, полёт, набор приёмов, политику),
// переходная атака с телеграфом вместо рёва. Исполнитель проверяется кадр за кадром.
import { describe, expect, it } from 'vitest';
import { dstate } from '../../src/core/boss/exec';
import { effForm } from '../../src/core/boss/form';
import { BOSS_RULES, bossDef, registerBoss } from '../../src/core/boss/registry';
import { validateRaw } from '../../src/core/boss/validate';
import { damageBoss } from '../../src/core/damage';
import type { Boss } from '../../src/core/types';
import { World } from '../../src/core/world';
import { arenaInfo } from '../../tools/boss/files';
import { morphBoss, silentBoss, type Raw } from '../fixtures/bosses';

function make(raw: Raw, opts: { seed?: number; train?: boolean; trainPhase?: number } = {}): { w: World; b: Boss; d: ReturnType<typeof dstate> } {
  registerBoss(raw);
  const w = new World({ seed: opts.seed ?? 1, mode: 'bosstest', boss: raw['id'] as string, players: 1, fx: true, train: opts.train, trainPhase: opts.trainPhase });
  const b = w.bosses[0]!;
  return { w, b, d: dstate(b) };
}
/** герой далеко от босса, здоровья много (dx — расстояние слева от босса) */
function away(w: World, dx = 500): void {
  const b = w.bosses[0]!, p = w.players[0]!;
  p.x = b.x - dx; p.y = b.y + b.h - p.h; p.hp = p.maxHp = 999; p.safeX = p.x; p.safeY = p.y; p.vx = 0; w.hitstop = 0;
}
const run = (w: World, n: number, each?: (i: number) => void, dx = 500): void => { for (let i = 0; i < n; i++) { away(w, dx); w.tick(); each?.(i); } };
const evs = (w: World, k: string): Record<string, unknown>[] => w.fxq.filter((e) => e.k === k);

describe('сцена фазы и превращение тела', () => {
  it('рёв → сцена с событиями по кадрам → превращение в заданный кадр → переходный приём', () => {
    const { w, b, d } = make(morphBoss('fx_m1'));
    run(w, 5);
    expect(d.mode).toBe('idle'); expect(b.w).toBe(40); expect(b.h).toBe(78); expect(d.formPh).toBe(1);
    const p = w.players[0]!; b.hp = Math.floor(b.maxHp * 0.5) + 1; w.fxq.length = 0; damageBoss(w, 'd0', p);
    expect(b.phase).toBe(2); expect(d.mode).toBe('rage'); expect(b.state).toBe('rage');
    expect(b.w).toBe(40); // тело ещё прежнее
    run(w, 20); expect(d.mode).toBe('scene');
    // события сцены: кадр 5 — тряска и рёв, кадр 40 — превращение и вспышка, кадр 60 — зум и надпись
    const at: Record<number, string[]> = {};
    w.fxq.length = 0;
    for (let f = 0; f < 70; f++) {
      away(w); w.tick();
      const names = w.fxq.map((e) => e.k + (e.k === 'snd' ? ':' + String(e['n']) : '')); w.fxq.length = 0;
      if (names.length) at[f] = names;
    }
    expect(at[5] ?? at[6] ?? []).toEqual(expect.arrayContaining(['shake']));
    const morphF = d.formPh === 2;
    expect(morphF).toBe(true);
    expect(b.w).toBe(60); expect(b.h).toBe(44);
    expect(Object.values(at).flat()).toEqual(expect.arrayContaining(['flash', 'camZoom', 'toast', 'snd:roar']));
    // конец сцены (90 кадров) → переходный приём c_orb с телеграфом
    run(w, 40);
    expect(d.mode).toBe('attack'); expect(d.enter).toBe(true); expect(d.atk).toBe('orb');
  });

  it('тело меняется ровно в кадр morph и не раньше; низ тела остаётся на месте, центр тоже', () => {
    const { w, b, d } = make(morphBoss('fx_m2'));
    run(w, 5);
    const cx = b.x + b.w / 2, bottom = b.y + b.h;
    b.hp = Math.floor(b.maxHp * 0.5) + 1; damageBoss(w, 'd0', w.players[0]!);
    let morphed = -1;
    for (let f = 0; f < 200 && morphed < 0; f++) { away(w); w.tick(); if (b.w === 60) morphed = f; }
    expect(morphed).toBe(20 + 40); // рёв 20 кадров + кадр 40 сцены
    // хит тела: после превращения центр прежний, низ не ушёл ниже пола
    expect(Math.abs(b.x + b.w / 2 - cx)).toBeLessThan(2); expect(b.y + b.h).toBeLessThanOrEqual(bottom + 1);
    expect(d.formPh).toBe(2);
  });

  it('пропуск сцены клавишей: недоигранное превращение применяется, босс сразу идёт в переходный приём', () => {
    const { w, b, d } = make(morphBoss('fx_m3'));
    run(w, 5);
    b.hp = Math.floor(b.maxHp * 0.5) + 1; damageBoss(w, 'd0', w.players[0]!);
    run(w, 25); expect(d.mode).toBe('scene'); expect(b.w).toBe(40); // кадр 5 сцены — превращение ещё впереди
    w.fxq.length = 0;
    w.players[0]!.pend.atkP = true; run(w, 3);
    expect(d.mode).toBe('attack'); expect(b.w).toBe(60); expect(d.formPh).toBe(2);
    expect(evs(w, 'sceneSkip')).toHaveLength(1);
  });

  it('сцена не пропускается чужим ввода и не дольше положенного: без нажатия идёт все 90 кадров и ни кадром дольше', () => {
    const { w, b, d } = make(morphBoss('fx_m4'));
    run(w, 5);
    b.hp = Math.floor(b.maxHp * 0.5) + 1; damageBoss(w, 'd0', w.players[0]!);
    let n = 0; while ((d.mode === 'rage' || d.mode === 'scene') && n < 400) { run(w, 1); n++; }
    expect(n).toBe(20 + 90);
  });

  it('правила: сцена длиннее нормы и непропускаемая длинная отвергаются при загрузке и в отчёте', () => {
    const raw = morphBoss('fx_m5'); (raw['phases'] as Raw[])[1]!['scene'].frames = BOSS_RULES.scene!.maxFrames + 1;
    expect(() => registerBoss(raw)).toThrow(/сцена .* длиннее нормы/);
    const r2 = morphBoss('fx_m6'); const sc = (r2['phases'] as Raw[])[1]!['scene']; sc.skippable = false; sc.frames = BOSS_RULES.scene!.maxUnskippableFrames + 1;
    expect(() => registerBoss(r2)).toThrow(/непропускаемая сцена/);
    const r3 = morphBoss('fx_m7'); (r3['phases'] as Raw[])[1]!['scene'].events.push({ at: 500, sfx: 'x' });
    expect(() => registerBoss(r3)).toThrow(/вне сцены/);
  });

  it('летающее тело: без гравитации висит на hover над полом, переходит из земли и обратно не падает при оглушении', () => {
    const { w, b, d } = make(morphBoss('fx_m8'));
    run(w, 5);
    b.hp = Math.floor(b.maxHp * 0.5) + 1; damageBoss(w, 'd0', w.players[0]!);
    run(w, 20 + 95);
    run(w, 120);
    expect(Math.abs(d.floor - 90 - (b.y + b.h))).toBeLessThan(3);
    expect(b.onGround).toBe(false);
    // оглушённый летающий босс висит, а не падает
    b.stagger = 1; const y0 = b.y; run(w, 30); expect(Math.abs(b.y - y0)).toBeLessThan(3);
  });

  it('набор приёмов формы: после превращения босс использует только dive и orb, никогда swing', () => {
    const { w, b, d } = make(morphBoss('fx_m9'), { seed: 4 });
    run(w, 5);
    const before = new Set<string>();
    for (let i = 0; i < 1500; i++) { run(w, 1, undefined, 90); b.hp = b.maxHp; }
    for (const c of d.mem.hist) before.add(c);
    expect(before.has('c_swing')).toBe(true);
    b.hp = Math.floor(b.maxHp * 0.5) + 1; damageBoss(w, 'd0', w.players[0]!);
    run(w, 130);
    d.mem.hist.length = 0;
    for (let i = 0; i < 6000; i++) { run(w, 1, undefined, 90); b.hp = Math.floor(b.maxHp * 0.45); }
    const used = new Set(d.mem.hist);
    expect(used.size).toBeGreaterThan(0);
    expect(used.has('c_swing')).toBe(false);
    expect([...used].every((c) => c === 'c_dive' || c === 'c_orb')).toBe(true);
  });

  it('пике летающего: вертикальная скорость приёма — непрерывная, после неё босс возвращается на высоту', () => {
    const { w, b, d } = make(morphBoss('fx_m10'));
    run(w, 5);
    b.hp = Math.floor(b.maxHp * 0.5) + 1; damageBoss(w, 'd0', w.players[0]!);
    run(w, 20 + 95 + 60);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 1400; i++) { run(w, 1); b.hp = Math.floor(b.maxHp * 0.45); if (d.atk === 'dive') { minY = Math.min(minY, b.y + b.h); maxY = Math.max(maxY, b.y + b.h); } }
    expect(maxY).toBeGreaterThan(d.floor - 90 + 10); // пике опустило тело заметно ниже висения
    run(w, 200); // успокоилось
    expect(Math.abs(d.floor - 90 - (b.y + b.h))).toBeLessThan(40);
  });

  it('тело: effForm накапливается по фазам и не портит определение; рисовальщик-вариант указан формой', () => {
    registerBoss(morphBoss('fx_m11'));
    const def = bossDef('fx_m11')!;
    expect(effForm(def, 1).fly).toBeNull(); expect(effForm(def, 1).draw).toBeNull();
    const e2 = effForm(def, 2);
    expect(e2.fly).toEqual({ hover: 90, speed: 160, bob: 0 }); expect(e2.draw).toBe('bat'); expect(e2.size).toEqual({ w: 60, h: 44 }); expect([...e2.attacks!]).toEqual(['dive', 'orb']);
    expect(def.size).toEqual({ w: 40, h: 78 }); // базовое тело не тронуто
  });

  it('фаза без рёва (silent): сразу переходный приём с телеграфом, босс уязвим, форма со своей политикой', () => {
    const { w, b, d } = make(silentBoss('fx_s1'));
    run(w, 5);
    const hp0 = b.hp; w.fxq.length = 0;
    b.hp = Math.floor(b.maxHp * 0.5) + 1; damageBoss(w, 'd0', w.players[0]!);
    expect(b.phase).toBe(2); expect(b.state).not.toBe('rage'); expect(d.mode).toBe('attack'); expect(d.enter).toBe(true); expect(d.atk).toBe('orb');
    expect(evs(w, 'flash')).toHaveLength(0); expect(evs(w, 'phaseShift')).toHaveLength(1);
    expect(b.w).toBe(50); expect(b.h).toBe(60); expect(d.formPh).toBe(2);
    run(w, 3); expect(b.state).toBe('tell'); expect(d.cue).not.toBeNull();
    // не неуязвим: удар засчитывается
    const h = b.hp; damageBoss(w, 'd0', w.players[0]!); expect(b.hp).toBe(h - 1);
    // дальше политика формы: только c_dive
    d.mem.hist.length = 0;
    for (let i = 0; i < 6000; i++) { run(w, 1); b.hp = Math.floor(b.maxHp * 0.45); }
    expect(d.mem.hist.length).toBeGreaterThan(2); expect(d.mem.hist.every((c) => c === 'c_dive')).toBe(true);
    void hp0;
  });

  it('тренировка с фазы 2: тело фазы применяется без рёва', () => {
    const { w, b, d } = make(morphBoss('fx_t1'), { train: true, trainPhase: 2 });
    expect(b.phase).toBe(2);
    run(w, 10);
    expect(d.formPh).toBe(2); expect(b.w).toBe(60);
  });

  it('валидатор: корректные трансформации без ошибок, набор приёмов без связок — ошибка', () => {
    const ok = validateRaw(morphBoss('fx_v1'), BOSS_RULES, arenaInfo('vladik'));
    expect(ok.filter((i) => i.level === 'error')).toEqual([]);
    const bad = morphBoss('fx_v2'); (bad['phases'] as Raw[])[1]!['form'].attacks = ['swing'];
    expect(validateRaw(bad, BOSS_RULES, arenaInfo('vladik')).map((i) => i.code)).toContain('form-empty');
    const high = morphBoss('fx_v3'); (high['phases'] as Raw[])[1]!['form'].fly.hover = 440;
    expect(validateRaw(high, BOSS_RULES, arenaInfo('vladik')).map((i) => i.code)).toContain('fly-ceiling');
    const ref = morphBoss('fx_v4'); (ref['phases'] as Raw[])[1]!['form'].attacks = ['нет'];
    expect(() => registerBoss(ref)).toThrow(/неизвестную атаку/);
  });
});
