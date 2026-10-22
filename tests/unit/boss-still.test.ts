// Волна 0, неподвижные боссы и уязвимые точки, исчезающие существа-приспешники, защита от читов у неподвижного.
import { describe, expect, it } from 'vitest';
import { dstate, forceChain, weakOpen, weakRect, weakStates } from '../../src/core/boss/exec';
import { minionsAlive, spawnCreature, type MinionRt } from '../../src/core/boss/minions';
import { BOSS_RULES, registerBoss } from '../../src/core/boss/registry';
import { validateRaw } from '../../src/core/boss/validate';
import { poiseAdd } from '../../src/core/bosses2';
import { damageBoss, damageEnemy } from '../../src/core/damage';
import { resolveAttack } from '../../src/core/weapons';
import { World } from '../../src/core/world';
import { arenaInfo } from '../../tools/boss/files';
import { stillBoss, type Raw } from '../fixtures/bosses';

function make(raw: Raw = stillBoss(), seed = 1): World {
  registerBoss(raw);
  return new World({ seed, mode: 'bosstest', boss: raw['id'] as string, players: 1, fx: true });
}
const FLOOR = 18 * 32;
/** герой бессмертный; x — левый край, y — по умолчанию на полу */
function hero(w: World, x: number, y?: number): void {
  const p = w.players[0]!; p.x = x; p.y = y ?? FLOOR - p.h; p.vx = 0; p.vy = 0; p.hp = p.maxHp = 9999; p.safeX = p.x; p.safeY = p.y; w.hitstop = 0;
}
const tickN = (w: World, n: number, each?: (i: number) => void): void => { for (let i = 0; i < n; i++) { w.tick(); each?.(i); } };
/** удар героя вперёд из точки: подготовить замах и разобрать его */
function swing(w: World, x: number, y: number, face = 1): void {
  const p = w.players[0]!; hero(w, x, y); p.face = face; p.atkT = 0.2; p.atkDir = 'f'; p.atkHits = new Set(); p['heavy'] = false; p.atkCd = 0;
  resolveAttack(w, p);
}

describe('неподвижный босс', () => {
  it('стоит на месте весь бой: не ходит, не падает, приёмы move игнорируются, оглушённый тоже не падает', () => {
    const raw = stillBoss('fx_s1'); (raw['attacks'] as Raw[])[2]!['move'] = [{ from: 0, to: 5, vx: 300, toward: 'player' }];
    const w = make(raw), b = w.bosses[0]!;
    const x0 = b.x, y0 = b.y;
    expect(Math.round(b.x + b.w / 2)).toBe(Math.round(32 + 0.55 * 42 * 32)); expect(b.y + b.h).toBe(FLOOR);
    hero(w, 40);
    tickN(w, 600, () => hero(w, 40));
    expect(b.x).toBe(x0); expect(b.y).toBe(y0); expect(b.vx).toBe(0);
    forceChain(w, 0, 'c_shove'); tickN(w, 120, () => hero(w, 40));
    expect(b.x).toBe(x0);
    b.stagger = 2; tickN(w, 60, () => hero(w, 40)); expect(b.y).toBe(y0);
  });

  it('место place.y поднимает неподвижного над полом (висит на стене)', () => {
    const raw = stillBoss('fx_s2'); raw['place'] = { x: 0.3, y: 160 };
    const w = make(raw), b = w.bosses[0]!;
    expect(b.y + b.h).toBe(FLOOR - 160); hero(w, 40); tickN(w, 300, () => hero(w, 40)); expect(b.y + b.h).toBe(FLOOR - 160);
  });

  it('защита от читов: герой вдали, куда босс не достаёт, 12 секунд невредим — у неподвижного срабатывает перемещающая связка', () => {
    const raw = stillBoss('fx_s3'); (raw['phases'] as Raw[])[0]!['policy'].chains = ['c_call'];
    const w = make(raw), d = dstate(w.bosses[0]!);
    hero(w, 60);
    let sweepAt = -1;
    for (let f = 0; f < 1100 && sweepAt < 0; f++) { hero(w, 60); w.tick(); if (d.chain === 'c_sweep') sweepAt = f; }
    expect(sweepAt).toBeGreaterThan(700); expect(sweepAt).toBeLessThan(800);
    // контроль: у обычного (наземного) босса дальше relocate.dist счётчик не идёт
    const raw2 = stillBoss('fx_s3b'); raw2['still'] = false; (raw2['phases'] as Raw[])[0]!['policy'].chains = ['c_call'];
    const w2 = make(raw2), d2 = dstate(w2.bosses[0]!);
    let used = false; hero(w2, 60);
    for (let f = 0; f < 1100; f++) { hero(w2, 60); w2.tick(); if (d2.chain === 'c_sweep') used = true; }
    expect(used).toBe(false);
  });

  it('защита от читов: герой вплотную к неподвижному — «отгон» через 2,5 с', () => {
    const raw = stillBoss('fx_s4'); (raw['phases'] as Raw[])[0]!['policy'].chains = ['c_call'];
    const w = make(raw), d = dstate(w.bosses[0]!), b = w.bosses[0]!;
    let shoved = -1;
    for (let f = 0; f < 400 && shoved < 0; f++) { hero(w, b.x + b.w / 2 - 7 + 40); w.tick(); if (d.chain === 'c_shove') shoved = f; }
    expect(shoved).toBeGreaterThan(140); expect(shoved).toBeLessThan(170);
  });

  it('валидатор: неподвижный без перемещающей связки — ошибка; ближний «перемещающий» — предупреждение', () => {
    const info = arenaInfo('vladik');
    expect(validateRaw(stillBoss('fx_v1'), BOSS_RULES, info).filter((i) => i.level === 'error')).toEqual([]);
    const a = stillBoss('fx_v2'); delete (a['antiCheese'] as Raw)['relocateChain'];
    expect(validateRaw(a, BOSS_RULES, info).map((i) => i.code)).toContain('still-relocate');
    const b = stillBoss('fx_v3'); (b['antiCheese'] as Raw)['relocateChain'] = 'c_shove'; // ближний удар не достаёт героя вдали
    expect(validateRaw(b, BOSS_RULES, info).map((i) => i.code)).toContain('still-relocate-reach');
    const c = stillBoss('fx_v4'); c['still'] = true; (c['attacks'] as Raw[])[2]!['move'] = [{ from: 0, to: 3, vx: 100 }]; (c['phases'] as Raw[])[0]!['policy'].chains.push('c_shove');
    expect(validateRaw(c, BOSS_RULES, info).map((i) => i.code)).toContain('still-move');
  });
});

describe('уязвимые точки', () => {
  it('точка открыта только в окнах: закрыта в покое и замахе, открыта в восстановлении', () => {
    const w = make(stillBoss('fx_w1')), b = w.bosses[0]!;
    hero(w, 40);
    forceChain(w, 0, 'c_sweep');
    const seen: Record<string, boolean[]> = {};
    for (let f = 0; f < 140; f++) { hero(w, 40); w.tick(); (seen[b.state] ??= []).push(weakStates(b)[0]!.open); }
    expect(seen['tell']!.every((o) => !o)).toBe(true);
    expect(seen['active']!.every((o) => !o)).toBe(true);
    expect(seen['recover']!.every((o) => o)).toBe(true); // окно recover 0…60 (у «Веера» восстановление 36)
    expect(seen['idle']!.every((o) => !o)).toBe(true);
  });

  it('удар в закрытую точку и мимо точки — броня (звон, урона нет); в открытую — урон', () => {
    const w = make(stillBoss('fx_w2')), b = w.bosses[0]!;
    hero(w, 40); tickN(w, 5, () => hero(w, 40));
    const r = weakRect(b, weakStates(b)[0]!.w);
    // босс в покое: точка закрыта; герой бьёт в неё
    expect(weakOpen(b, weakStates(b)[0]!.w)).toBe(false);
    const hp = b.hp; w.fxq.length = 0;
    swing(w, r.x - 40, r.y + 5); // слева, на уровне точки
    expect(b.hp).toBe(hp); expect(w.fxq.some((e) => e.k === 'snd' && e['n'] === 'clink')).toBe(true);
    expect(w.fxq.some((e) => e.k === 'toast')).toBe(true); // подсказка про броню
    // открываем окно восстановления
    forceChain(w, 0, 'c_sweep'); let n = 0; while (b.state !== 'recover' && n++ < 200) { hero(w, 40); w.tick(); }
    expect(weakOpen(b, weakStates(b)[0]!.w)).toBe(true);
    // удар по ногам босса мимо точки (точка выше): урона нет
    const hp2 = b.hp; swing(w, r.x - 40, FLOOR - 26 - 90); // герой в прыжке над точкой: коробка удара выше неё, но задевает тело
    expect(b.hp).toBe(hp2);
    // удар в точку — урон
    swing(w, r.x - 40, r.y + 5);
    expect(b.hp).toBe(hp2 - 1);
  });

  it('оглушённый босс теряет броню: удар по любому месту тела засчитывается', () => {
    const w = make(stillBoss('fx_w3')), b = w.bosses[0]!;
    hero(w, 40); tickN(w, 5, () => hero(w, 40));
    for (let i = 0; i < 10; i++) poiseAdd(w, b, 1);
    expect(b.stagger).toBeGreaterThan(0);
    const hp = b.hp; swing(w, b.x - 40, FLOOR - 26);
    expect(b.hp).toBeLessThan(hp);
  });

  it('hits точки множит урон; инструменты и яд без удара бьют, пока открыта любая точка', () => {
    const raw = stillBoss('fx_w4'); (raw['weak'] as Raw[])[0]!['hits'] = 3; (raw['weak'] as Raw[])[0]!['open'] = [];
    const w = make(raw), b = w.bosses[0]!; hero(w, 40); tickN(w, 5, () => hero(w, 40));
    const r = weakRect(b, weakStates(b)[0]!.w), hp = b.hp;
    swing(w, r.x - 40, r.y + 5);
    expect(b.hp).toBe(hp - 3);
    const hp2 = b.hp; damageBoss(w, 'd0', w.players[0]!); // без замаха: точка открыта всегда → засчитывается
    expect(b.hp).toBeLessThan(hp2);
  });

  it('окна можно привязать к конкретной атаке и к отрезку её кадров', () => {
    const raw = stillBoss('fx_w5'); (raw['weak'] as Raw[])[0]!['open'] = [{ on: 'recover', attack: 'sweep', from: 10, to: 30 }];
    const w = make(raw), b = w.bosses[0]!, d = dstate(b);
    hero(w, 40);
    forceChain(w, 0, 'c_call');
    const open: number[] = []; let rf = 0;
    for (let f = 0; f < 200; f++) { hero(w, 40); w.tick(); if (b.state === 'recover') { rf++; if (weakStates(b)[0]!.open) open.push(rf); } }
    expect(open).toHaveLength(0); // во время «Зова» окно не открывается
    forceChain(w, 0, 'c_sweep'); rf = 0; open.length = 0;
    for (let f = 0; f < 200; f++) { hero(w, 40); w.tick(); if (d.atk === 'sweep' && b.state === 'recover') { rf++; if (weakStates(b)[0]!.open) open.push(rf); } }
    expect(open.length).toBeGreaterThan(10); expect(open.length).toBeLessThanOrEqual(21);
  });

  it('валидатор: окно короче нормы, окно недостижимой атаки, точка вне тела', () => {
    const info = arenaInfo('vladik'), codes = (r: Raw): string[] => validateRaw(r, BOSS_RULES, info).map((i) => i.code);
    const a = stillBoss('fx_v10'); (a['weak'] as Raw[])[0]!['open'] = [{ on: 'recover', from: 0, to: 10 }]; expect(codes(a)).toContain('weak-short');
    const b = stillBoss('fx_v11'); (b['attacks'] as Raw[]).push({ ...(b['attacks'] as Raw[])[2]!, id: 'zzz' }); (b['weak'] as Raw[])[0]!['open'] = [{ on: 'active', attack: 'zzz' }]; expect(codes(b)).toContain('weak-unreachable');
    const c = stillBoss('fx_v12'); (c['weak'] as Raw[])[0]!['box'] = { x: 500, y: 500, w: 10, h: 10 }; expect(codes(c)).toContain('weak-box');
    const d = stillBoss('fx_v13'); (d['weak'] as Raw[])[0]!['open'] = [{ on: 'recover', attack: 'нет' }]; expect(() => registerBoss(d)).toThrow(/неизвестную атаку/);
  });
});

describe('существа-приспешники', () => {
  const crt = (w: World): ReturnType<typeof minionsAlive> => minionsAlive(w, 'wisp');
  it('призыв атакой: два существа, лишние сверх max пропадают; летают на заданной высоте; сами исчезают через life кадров', () => {
    const w = make(stillBoss('fx_c1')); hero(w, 40); tickN(w, 3, () => hero(w, 40));
    forceChain(w, 0, 'c_call');
    tickN(w, 40, () => hero(w, 40));
    expect(crt(w)).toHaveLength(2);
    const e = crt(w)[0]!, m = e['m'] as MinionRt;
    expect(Math.abs(FLOOR - 50 - (e.y + e.h))).toBeLessThan(30);
    expect(spawnCreature(w, 0, 'wisp', 700, 300)).toBe(false); // max 2
    tickN(w, 300, () => hero(w, 40));
    expect(m.fading).toBe(false);
    tickN(w, 30, () => hero(w, 40)); // возраст > life − fade (360 − 40)
    expect(m.fading).toBe(true);
    tickN(w, 50, () => hero(w, 40));
    expect(crt(w)).toHaveLength(0);
    // погибшие убираются из мира при следующем призыве
    expect(spawnCreature(w, 0, 'wisp', 700, 300)).toBe(true); expect(w.enemies.filter((q) => q['m']).length).toBeLessThanOrEqual(2);
  });

  it('бледнеющее существо безвредно, обычное ранит касанием', () => {
    const w = make(stillBoss('fx_c2')); hero(w, 40);
    spawnCreature(w, 0, 'wisp', 300, FLOOR - 40);
    const e = crt(w)[0]!, m = e['m'] as MinionRt, p = w.players[0]!;
    p.inv = 0; p.hp = p.maxHp = 50;
    tickN(w, 2); p.x = e.x; p.y = e.y; p.inv = 0; const hp = p.hp;
    tickN(w, 2, () => { p.x = e.x; p.y = e.y; });
    expect(p.hp).toBeLessThan(hp);
    m.age = 330; // бледнеет
    tickN(w, 3); p.inv = 0; const hp2 = p.hp;
    tickN(w, 5, () => { p.x = e.x; p.y = e.y; p.inv = 0; });
    expect(m.fading).toBe(true); expect(p.hp).toBe(hp2);
  });

  it('герой убивает существо двумя ударами; оно роняет бусины (если заданы) и исчезает из мира', () => {
    const w = make(stillBoss('fx_c3')); hero(w, 40);
    spawnCreature(w, 0, 'wisp', 300, FLOOR - 40);
    const e = crt(w)[0]!, p = w.players[0]!;
    damageEnemy(w, e, p); expect(e.dead).toBe(false); damageEnemy(w, e, p); expect(e.dead).toBe(true);
    expect(crt(w)).toHaveLength(0);
  });

  it('мини-связка: существо само стреляет спорой (parry) по герою через паузу', () => {
    const w = make(stillBoss('fx_c4')); hero(w, 400);
    spawnCreature(w, 0, 'wisp', 500, FLOOR - 60);
    let shot: { hk?: string; src?: string; o?: number } | null = null;
    for (let f = 0; f < 400 && !shot; f++) { hero(w, 400); w.tick(); const pr = w.projs.find((q) => q.kind === 'spore' && q['src'] === 'd'); if (pr) shot = { hk: pr.hk, src: pr['src'] as string, o: pr['o'] as number }; }
    expect(shot).toEqual({ hk: 'parry', src: 'd', o: 0 });
  });

  it('досрочно исчезают при смерти босса и при оглушении (vanishOn)', () => {
    const raw = stillBoss('fx_c5'); (raw['weak'] as Raw[])[0]!['open'] = [];
    const w = make(raw); hero(w, 40);
    spawnCreature(w, 0, 'wisp', 500, FLOOR - 60); spawnCreature(w, 0, 'wisp', 600, FLOOR - 60);
    tickN(w, 10, () => hero(w, 40)); expect(crt(w)).toHaveLength(2);
    const b = w.bosses[0]!; for (let i = 0; i < 10; i++) poiseAdd(w, b, 1);
    tickN(w, 3, () => hero(w, 40)); expect(crt(w)).toHaveLength(0);
    spawnCreature(w, 0, 'wisp', 500, FLOOR - 60); b.stagger = 0; b.hp = 1; damageBoss(w, 'd0', w.players[0]!);
    tickN(w, 30, () => hero(w, 40)); expect(crt(w)).toHaveLength(0); // после смерти босса время замедлено — ждём дольше
  });

  it('общий потолок существ на бой: сверх rules.minions.maxTotal не призываются', () => {
    const raw = stillBoss('fx_c6'); (raw['creatures'] as Raw[])[0]!['max'] = 30;
    const w = make(raw); hero(w, 40);
    let ok = 0; for (let i = 0; i < 20; i++) if (spawnCreature(w, 0, 'wisp', 500 + i * 10, FLOOR - 60)) ok++;
    expect(ok).toBe(BOSS_RULES.minions!.maxTotal);
  });

  it('детерминизм: существа с мини-связками дают тот же ход боя', () => {
    const run = (): string => {
      const w = make(stillBoss('fx_c7'), 5); hero(w, 400);
      for (let i = 0; i < 2500; i++) { hero(w, 400); w.tick(); }
      return JSON.stringify([w.enemies.map((e) => [e.x, e.y, e.hp, e['m']]), w.projs.length, w.bosses[0]!.hp, dstate(w.bosses[0]!).mem.hist]);
    };
    expect(run()).toBe(run());
  });

  it('валидатор: существо без замаха нужной длины, с fade ≥ life, никогда не призываемое', () => {
    const info = arenaInfo('vladik'), codes = (r: Raw): string[] => validateRaw(r, BOSS_RULES, info).map((i) => i.code);
    const a = stillBoss('fx_v20'); ((a['creatures'] as Raw[])[0]!['attacks'] as Raw[])[0]!['tell'].frames = 8; expect(codes(a)).toContain('creature-tell');
    const b = stillBoss('fx_v21'); (b['creatures'] as Raw[])[0]!['fade'] = 400; expect(codes(b)).toContain('creature-fade');
    const c = stillBoss('fx_v22'); (c['attacks'] as Raw[])[0]!['summon'] = []; (c['attacks'] as Raw[])[0]!['move'] = [{ from: 0, to: 2, vx: 0 }]; expect(codes(c)).toContain('creature-unused');
    const d = stillBoss('fx_v23'); (d['attacks'] as Raw[])[0]!['summon'][0].creature = 'нет'; expect(() => registerBoss(d)).toThrow(/неизвестного существа/);
  });
});
