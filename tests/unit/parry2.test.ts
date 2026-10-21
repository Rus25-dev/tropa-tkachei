// Отбив 2.0 (v2.5): окна по кадрам, идеальный отбив, виды ударов (hk), контратака, равновесие босса, детерминизм.
import { describe, expect, it } from 'vitest';
import { PARRY2, P } from '../../src/core/balance';
import { hurtPlayer } from '../../src/core/damage';
import { normalizeSave } from '../../src/core/loadout';
import type { HitKind } from '../../src/core/types';
import { World } from '../../src/core/world';
import { Brain } from '../../tools/bot/brain';

/** Мир с боссом Владиком, который спит и не мешает; герой стоит, неуязвимость снята */
function mk(seed = 5): World {
  const w = new World({ seed, mode: 'bosstest', boss: 'vladik', fx: true, loadoutSave: normalizeSave(null) });
  const p = w.players[0]!;
  w.vladik!.state = 'sleep'; p.inv = 0; p.silk = 0; p.hp = p.maxHp;
  for (let i = 0; i < 3; i++) w.tick();
  p.inv = 0;
  return w;
}
const press = (w: World, k: 'healP' | 'atkP' | 'dashP'): void => { w.players[0]!.pend = { [k]: true }; w.tick(); };

/** Нажали отбив (кадр 1), прошло frame−1 кадров, пришёл удар. Возвращает потерю здоровья. */
function hitAtFrame(w: World, frame: number, hk: HitKind | 'none' = 'parry'): number {
  const p = w.players[0]!;
  press(w, 'healP');
  for (let i = 1; i < frame; i++) w.tick();
  p.inv = 0; const hp = p.hp;
  hurtPlayer(w, p, 1, p.x + 40, false, hk === 'none' ? undefined : hk);
  return hp - p.hp;
}

describe('отбив 2.0: окна по кадрам', () => {
  it('окно 0,2 с (12–13 кадров: 1/60 в сумме даёт хвост 5e-17, как и в v2.0); кадры 1…PERFECT_F — идеальный, дальше — обычный', () => {
    expect(PARRY2.PERFECT_F).toBe(7);
    for (let f = 1; f <= 13; f++) {
      const w = mk(), p = w.players[0]!;
      const loss = hitAtFrame(w, f);
      expect(loss, `кадр ${f}: отбит`).toBe(0);
      const perfect = f <= PARRY2.PERFECT_F;
      expect(p.silk, `кадр ${f}: нить`).toBe(perfect ? PARRY2.PERFECT_SILK : 1);
      expect((p['counterT'] as number) > 0, `кадр ${f}: контратака`).toBe(perfect);
    }
  });

  it('после окна — промах: удар проходит', () => {
    for (const f of [14, 15, 20]) {
      const w = mk(); expect(hitAtFrame(w, f), `кадр ${f}`).toBe(1);
    }
  });

  it('повторное нажатие внутри окна не продлевает его и не делает идеальным', () => {
    const w = mk(), p = w.players[0]!;
    press(w, 'healP');
    for (let i = 0; i < 8; i++) { if (i === 5) press(w, 'healP'); else w.tick(); }
    p.inv = 0; const hp = p.hp; const silk = p.silk;
    hurtPlayer(w, p, 1, p.x + 40, false, 'parry');
    expect(hp - p.hp).toBe(0); expect(p.silk - silk).toBe(1); // кадр 9: обычный, не идеальный
  });

  it('обычный отбив работает как раньше: +1 нить, окно закрывается, нет контратаки', () => {
    const w = mk(), p = w.players[0]!;
    hitAtFrame(w, 10);
    expect(p.silk).toBe(1); expect(p.parryT).toBe(0); expect(p['counterT'] as number).toBeLessThanOrEqual(0);
    expect(p.inv).toBeCloseTo(0.5, 5);
  });

  it('окно, выставленное напрямую (без нажатия), — обычный отбив: старые тесты и записи не меняются', () => {
    const w = mk(), p = w.players[0]!;
    p.parryT = 0.2; p.inv = 0; hurtPlayer(w, p, 1, p.x + 40);
    expect(p.silk).toBe(1); expect(p.hp).toBe(p.maxHp);
  });
});

describe('отбив 2.0: виды ударов', () => {
  it('hk не задан — исходное поведение v2.0: отбив есть, но «идеального» нет (золотые записи не меняются)', () => {
    const w = mk(), p = w.players[0]!;
    expect(hitAtFrame(w, 2, 'none')).toBe(0);
    expect(p.silk).toBe(1); expect((p['counterT'] as number) > 0).toBe(false);
  });

  it('PERFECT_LEGACY=1 включает идеальный отбив и для ударов без hk', () => {
    const old = PARRY2.PERFECT_LEGACY; PARRY2.PERFECT_LEGACY = 1;
    try { const w = mk(); expect(hitAtFrame(w, 2, 'none')).toBe(0); expect(w.players[0]!.silk).toBe(PARRY2.PERFECT_SILK); } finally { PARRY2.PERFECT_LEGACY = old; }
  });

  it.each<HitKind>(['dodge', 'unblockable'])('%s отбивом не гасится: урон проходит, окно сгорает', (hk) => {
    for (const f of [1, 5, 10]) {
      const w = mk(), p = w.players[0]!;
      expect(hitAtFrame(w, f, hk), `кадр ${f}`).toBe(1);
      expect(p.silk).toBe(0); expect(p.parryT).toBe(0);
      expect(w.fxq.some((e) => e.k === 'snd' && e['n'] === 'parryFail')).toBe(true);
    }
  });

  it('рывок сквозь удар: dodge — идеальный уворот, unblockable — урон', () => {
    for (const [hk, loss] of [['dodge', 0], ['unblockable', 1], ['parry', 0]] as const) {
      const w = mk(), p = w.players[0]!;
      press(w, 'dashP'); expect(p.dashT).toBeGreaterThan(0);
      p.inv = 0; const hp = p.hp;
      hurtPlayer(w, p, 1, p.x + 40, false, hk);
      expect(hp - p.hp, hk).toBe(loss);
      if (hk === 'dodge') expect(p['pdodge']).toBeGreaterThan(0);
    }
  });

  it('снаряд с hk попадает в героя с тем же видом удара (projs.ts)', () => {
    const w = mk(), p = w.players[0]!;
    press(w, 'healP');
    w.projs.push({ kind: 'spore', x: p.x, y: p.y, w: 14, h: 14, vx: 0, vy: 0, life: 2, hk: 'unblockable' });
    p.inv = 0; const hp = p.hp;
    w.tick();
    expect(hp - p.hp).toBe(1);
    const w2 = mk(), p2 = w2.players[0]!;
    press(w2, 'healP');
    w2.projs.push({ kind: 'spore', x: p2.x, y: p2.y, w: 14, h: 14, vx: 0, vy: 0, life: 2 });
    p2.inv = 0; w2.tick();
    expect(p2.hp).toBe(p2.maxHp); expect(p2.silk).toBeGreaterThan(0); // без hk — отбит, как раньше
  });
});

describe('отбив 2.0: равновесие босса и контратака', () => {
  const near = (w: World): void => { const b = w.vladik!, p = w.players[0]!; b.x = p.x + 30; b.y = p.y + p.h - b.h; b.state = 'idle'; b['poiseImmune'] = 0; b['poise'] = 0; b.stagger = 0; };

  it('стойкость: обычный +3 (как в v2.0), идеальный ×2; у posture:true обычный меньше', () => {
    const res: Record<string, number> = {};
    for (const [name, posture, frame] of [['обычный', false, 10], ['идеальный', false, 2], ['posture-обычный', true, 10], ['posture-идеальный', true, 2]] as const) {
      const w = mk(); w.vladik!.posture = posture;
      const p = w.players[0]!;
      press(w, 'healP'); for (let i = 1; i < frame; i++) w.tick();
      near(w); p.inv = 0; hurtPlayer(w, p, 1, p.x + 40, false, 'parry');
      res[name] = w.vladik!['poise'] as number;
    }
    expect(res['обычный']).toBe(3);
    expect(res['идеальный']).toBe(3 * PARRY2.PERFECT_POISE_MUL);
    expect(res['posture-обычный']).toBe(PARRY2.POSTURE_NORMAL_POISE);
    expect(res['posture-идеальный']).toBe(3 * PARRY2.PERFECT_POISE_MUL);
    expect(res['posture-обычный']).toBeLessThan(res['обычный']!);
  });

  it('полная шкала равновесия оглушает босса через ту же систему стойкости (poise → stagger)', () => {
    const w = mk(), p = w.players[0]!; w.vladik!.posture = true;
    press(w, 'healP'); near(w); w.vladik!['poise'] = 4;
    p.inv = 0; hurtPlayer(w, p, 1, p.x + 40, false, 'parry'); // идеальный: +6 → 10 ≥ 8
    expect(w.vladik!.stagger).toBeGreaterThan(0);
  });

  /** идеальный отбив (или нет) → удар вперёд по боссу; возвращает потерю хп и стойкость */
  function strike(perfect: boolean): { loss: number; poise: number; w: World } {
    const w = mk(), p = w.players[0]!, b = w.vladik!;
    p.face = 1;
    if (perfect) { press(w, 'healP'); p.inv = 0; hurtPlayer(w, p, 1, p.x + 40, false, 'parry'); } else { for (let i = 0; i < 10; i++) w.tick(); }
    near(w); b.hp = b.maxHp = 400; p.inv = 99;
    const hp0 = b.hp;
    press(w, 'atkP');
    for (let i = 0; i < 24; i++) { b.x = p.x + 30; b.state = 'idle'; b.vx = 0; w.tick(); }
    return { loss: hp0 - b.hp, poise: b['poise'] as number, w };
  }

  it('контратака: следующий удар вперёд после идеального отбива ×1.5 урона и ×2 стойкости', () => {
    const n = strike(false), c = strike(true);
    expect(n.loss).toBe(1); expect(n.poise).toBe(1);
    expect(c.loss).toBeCloseTo(PARRY2.COUNTER_DMG, 5);
    expect(c.poise).toBe(PARRY2.COUNTER_POISE_MUL);
    expect(c.w.players[0]!['counterHit']).toBe(true);
  });

  it('контратака бьёт сильнее один раз: второй удар обычный', () => {
    const { w } = strike(true), p = w.players[0]!, b = w.vladik!;
    for (let i = 0; i < 20; i++) w.tick();
    b.hp = b.maxHp = 400; b['poise'] = 0; b['poiseImmune'] = 0; b.stagger = 0; p.inv = 0;
    press(w, 'atkP');
    for (let i = 0; i < 24; i++) { b.x = p.x + 30; b.state = 'idle'; b.vx = 0; w.tick(); }
    expect(p['counterHit']).toBe(false);
    expect(400 - b.hp).toBe(1);
  });

  it('окно контратаки истекает за COUNTER_T: поздний удар обычный', () => {
    const w = mk(), p = w.players[0]!;
    press(w, 'healP'); p.inv = 0; hurtPlayer(w, p, 1, p.x + 40, false, 'parry');
    expect(p['counterT'] as number).toBeGreaterThan(0);
    for (let i = 0, n = 0; i < 200 && n < Math.ceil(PARRY2.COUNTER_T * 60) + 3; i++) { if (w.hitstop <= 0) n++; w.tick(); } // считаем только шаги, не зависание кадра
    press(w, 'atkP');
    expect(p['counterHit']).toBe(false);
  });

  it('герой неуязвим на время окна контратаки', () => {
    const w = mk(), p = w.players[0]!;
    press(w, 'healP'); p.inv = 0; hurtPlayer(w, p, 1, p.x + 40, false, 'parry');
    expect(p.inv).toBeGreaterThanOrEqual(PARRY2.COUNTER_T - 1e-9);
    w.tick(); const hp = p.hp; hurtPlayer(w, p, 1, p.x + 40, false, 'unblockable');
    expect(p.hp).toBe(hp);
  });
});

describe('отбив 2.0: детерминизм', () => {
  it('одно зерно и тот же ввод — то же состояние', () => {
    const run = (): string => {
      const w = mk(11), p = w.players[0]!;
      press(w, 'healP'); for (let i = 0; i < 3; i++) w.tick();
      p.inv = 0; hurtPlayer(w, p, 1, p.x + 40, false, 'parry');
      press(w, 'atkP'); for (let i = 0; i < 30; i++) w.tick();
      return JSON.stringify([p.x, p.y, p.hp, p.silk, p['counterHit'], w.vladik!.hp, w.vladik!['poise'], w.hitstop, P.PARRY_T]);
    };
    expect(run()).toBe(run());
  });
});

describe('отбив 2.0: бот различает виды ударов', () => {
  const ACT_STAND = { dir: 0, jump: 0, dash: 0, parry: 0, cost: 0 };
  /** угроза стоит на герое; у героя открыто окно отбива; возвращает попадания и стоимость плана за шаг */
  const plan = (hk: HitKind | undefined, skill = 0.95): { hits: number; cost: number } => {
    const w = mk(), p = w.players[0]!, br = new Brain(w, 0, skill, 3);
    const n = br.rootNode(p); n.pt = 5; n.pe = 0;
    const L = 8, X = new Float32Array(L).fill(p.x), Y = new Float32Array(L).fill(p.y), ON = new Uint8Array(L).fill(1);
    br.stepNode(n, ACT_STAND, false, 1, [{ X, Y, ON, w: 14, h: 26, kind: 'spore', pad: 2, hk }]);
    return { hits: n.hits, cost: n.cost };
  };

  it('parry и без hk — отбивается; dodge и unblockable — урон в плане', () => {
    expect(plan(undefined).hits).toBe(0); expect(plan('parry').hits).toBe(0);
    expect(plan('dodge').hits).toBe(1); expect(plan('unblockable').hits).toBe(1);
  });

  it('идеальный отбив по явному hk выгоднее обычного — только у опытных; без hk оценка прежняя', () => {
    expect(plan('parry', 0.95).cost).toBeLessThan(plan(undefined, 0.95).cost);
    expect(plan('parry', 0.75).cost).toBe(plan(undefined, 0.75).cost);
  });
});
