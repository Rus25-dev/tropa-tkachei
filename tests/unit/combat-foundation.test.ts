import { afterEach, describe, expect, it } from 'vitest';
import { base, type Raw } from '../fixtures/bosses';
import { registerBoss } from '../../src/core/boss/registry';
import { World } from '../../src/core/world';
import { dstate, forceChain, commandChain, onStagger, onStaggerWorld, rawData, stepDataBoss } from '../../src/core/boss/exec';
import { damageBoss, hurtPlayer } from '../../src/core/damage';
import { resolveAttack } from '../../src/core/weapons';
import { canClearProj } from '../../src/core/proj-kit';
import { projReg } from '../../src/core/plugin/regs';
import { stepProjs } from '../../src/core/projs';
import { stepPlayer } from '../../src/core/player';
import { respawnLocal } from '../../src/core/combat';
import { actionState } from '../../src/core/player-actions';
import { applyTickValue, tickValue } from '../../src/core/journal';
import { emptyFrame, packFrame, unpackFrame } from '../../src/core/input';
import { shapeHits, sweepTime } from '../../src/core/hit';
import { counterTarget } from '../../src/core/kit/counter';

let seq = 0;
function setup(over: Raw = {}) {
  const raw = base(`fx_combat_${seq++}`, over), def = registerBoss(raw);
  const w = new World({ seed: 7, mode: 'bosstest', boss: def.id, players: 1, fx: true });
  const b = w.bosses[0]!, p = w.players[0]!, d = dstate(b);
  b.state = 'idle'; d.mode = 'idle'; d.rest = 1e6; b.onGround = true;
  p.inv = 0; p.hurtT = 0; p.onGround = true; p.y = b.y + b.h - p.h; p.silk = 0;
  return { w, b, p, d, raw, def };
}
afterEach(() => { projReg.remove('fx_fast'); });

describe('попадание: атомарный урон', () => {
  it.each(['needle', 'twin', 'sickle', 'mace', 'lance'])('%s не меняет HP закрытой брони', (weapon) => {
    const { w, b, p } = setup({ weak: [{ id: 'core', box: { x: 0, y: 0, w: 10, h: 10 }, open: [{ on: 'recover' }] }] });
    p.x = b.x - 18; p.face = 1; p.weaponId = weapon; p.atkT = .1; p.atkDir = 'f'; p.atkHits = new Set();
    const hp = b.hp; resolveAttack(w, p);
    expect(b.hp).toBe(hp); expect(b.poise ?? 0).toBe(0); expect(p.silk).toBe(0);
  });
  it('полный бонус stagger+counter пересекает порог в том же попадании и отменяет stagger', () => {
    const pol = { chains: ['c_swing'], noRepeat: 0, restFrames: [30, 40] };
    const { w, b, p, d } = setup({ hp: [100, 100], phases: [{ fromHp: 1, policy: pol }, { fromHp: .6, rageFrames: 30, policy: pol }] });
    b.hp = 62; b.stagger = 1; p.counterHit = true; p.counterSeen = null;
    damageBoss(w, 'd0', p);
    expect(b.hp).toBe(59); expect(b.phase).toBe(2); expect(d.mode).toBe('rage'); expect(b.stagger).toBe(0);
    expect(w.fxq.filter((e) => e.k === 'phaseShift')).toHaveLength(1);
  });
  it('лимит stagger учитывает весь удар и дробный остаток, а не только исходную единицу', () => {
    const { w, b, p, d } = setup({ hp: [100, 100], antiCheese: { enabled: true } });
    b.stagger = 1; d.ac.stgHp0 = 100; b.hp = 82.25;
    damageBoss(w, 'd0', p, { amount: 20 });
    expect(b.hp).toBe(82); damageBoss(w, 'd0', p, { amount: 20 }); expect(b.hp).toBe(82);
  });
  it('летальный модифицированный удар запускает смерть один раз, HP не уходит ниже нуля', () => {
    const { w, b, p, d } = setup(); b.hp = .5;
    damageBoss(w, 'd0', p, { amount: 100 }); const events = w.fxq.length;
    expect(b.hp).toBe(0); expect(d.mode).toBe('dead'); expect(w.bossDead).toBe(true);
    damageBoss(w, 'd0', p, { amount: 100 }); expect(b.hp).toBe(0); expect(w.fxq.length).toBeGreaterThanOrEqual(events);
  });
  it('инструмент должен попасть в открытую точку, а не в произвольную часть тела', () => {
    const { w, b, p } = setup({ weak: [{ id: 'core', box: { x: 0, y: 0, w: 10, h: 10 } }] });
    const hp = b.hp;
    expect(rawData(w, 'd0', p, { weak: 'geometry', shape: { type: 'rect', rect: { x: b.x + 25, y: b.y + 30, w: 5, h: 5 } } }).outcome).toBe('armor');
    expect(b.hp).toBe(hp);
    expect(rawData(w, 'd0', p, { weak: 'geometry', shape: { type: 'circle', x: b.x + 5, y: b.y + 5, radius: 3 } }).damage).toBe(1);
  });
  it.each(['intro', 'rage', 'dead'])('урон не проходит в %s ни от бонуса оружия, ни напрямую', (state) => {
    const { w, b, p } = setup(); b.state = state; const hp = b.hp;
    rawData(w, 'd0', p, { amount: 20 }); expect(b.hp).toBe(hp);
  });
  it.each([NaN, Infinity, -1, 0])('невалидная величина %s не меняет HP', (amount) => {
    const { w, b, p } = setup(); const hp = b.hp;
    rawData(w, 'd0', p, { amount }); expect(b.hp).toBe(hp);
  });
});

describe('защита и жизненный цикл', () => {
  it('снаряды с другими правилами не стираются случайным отбивом', () => {
    const pr = { kind: 'wave', x: 0, y: 0, w: 8, h: 8, vx: 0, vy: 0, life: 1 };
    expect(canClearProj({ ...pr, hk: 'parry' }, 'parry')).toBe(true);
    expect(canClearProj({ ...pr, hk: 'unblockable' }, 'parry')).toBe(false);
    expect(canClearProj({ ...pr, hk: 'dodge' }, 'parry')).toBe(false);
    expect(canClearProj({ ...pr, delay: 1 }, 'parry')).toBe(false);
    expect(canClearProj({ ...pr, kind: 'bomb' }, 'burst')).toBe(false);
  });
  it('отбив копит стойкость только атакующего босса', () => {
    const { w, b, p } = setup();
    const second = { ...b, x: b.x + 20, poise: 0, d: structuredClone(dstate(b)) }; w.bosses.push(second);
    p.parryT = .2; p.parryF = 0;
    hurtPlayer(w, p, 1, b.x, false, 'parry', { boss: b });
    expect(b.poise).toBe(6); expect(second.poise).toBe(0);
  });
  it('урон сразу отменяет состояния подключаемых приёмов, крюк и заряд', () => {
    const { w, p } = setup();
    p.cr = { f: 10 }; p.hk = { t: 1 }; p.chg = .5; p.chgSnd = true; p.atkT = .2; p.healCh = .2;
    hurtPlayer(w, p, 1, null, false, 'unblockable');
    expect(actionState(p)).toBe('hurt'); expect(p.cr).toBeNull(); expect(p.hk).toBeNull(); expect(p.chg).toBe(0); expect(p.healCh).toBe(0);
  });
  it('возрождение не переносит буфер атак, отбив, лечение и контратаку в новый бой', () => {
    const { w, p } = setup(); p.parryT = .2; p.parryCd = .6; p.atkBuf = .14; p.counterT = .5; p.carry = { atkP: true };
    respawnLocal(w);
    expect(p.parryT).toBe(0); expect(p.parryCd).toBe(0); expect(p.atkBuf).toBe(0); expect(p.counterT).toBe(0); expect(p.carry).toEqual({});
  });
  it('отмена удаляет только явно связанные с текущим экземпляром атаки снаряды', () => {
    projReg.define({ id: 'fx_fast', netId: 40, size: [8, 8], cancelOnInterrupt: true });
    const { w, b, d } = setup(); d.serial = 2;
    w.projs = [1, 2].map((attackId) => ({ kind: 'fx_fast', x: 0, y: 0, w: 8, h: 8, vx: 0, vy: 0, life: 1, o: 0, attackId }));
    onStagger(b); onStaggerWorld(w, b);
    expect(w.projs[0]!.dead).not.toBe(true); expect(w.projs[1]!.dead).toBe(true);
  });
});

describe('явные команды игрока и запись', () => {
  it('отбив при полной нити и нехватке HP не начинает лечение', () => {
    const { w, p } = setup(); p.hp--; p.silk = w.silkMax; p.inp = { parryP: true };
    stepPlayer(w, p, 1 / 60);
    expect(p.parryT).toBeGreaterThan(0); expect(p.healCh ?? 0).toBe(0); expect(p.silk).toBe(w.silkMax);
  });
  it('явные лечение/всполох при нехватке нити не превращаются в отбив', () => {
    for (const inp of [{ bindP: true }, { burstP: true }]) {
      const { w, p } = setup(); p.hp--; p.silk = 0; p.inp = inp;
      stepPlayer(w, p, 1 / 60); expect(p.parryT).toBeLessThanOrEqual(0); expect(p.silk).toBe(0);
    }
  });
  it('расширенная упаковка оставляет старые 17 бит на месте', () => {
    const f = emptyFrame(); f.buttons.atk = true; f.buttons.parry = true; f.edges.parryP = true;
    expect(packFrame(f) & 131071).toBe(1 << 5); expect(unpackFrame(packFrame(f))).toEqual(f);
  });
  it('команды двух игроков не пересекаются в журнале и не теряются при повторе', () => {
    const { w } = setup(); const ps = [w.players[0]!, { ...w.players[0]!, raw: {}, pend: {} }];
    ps[0]!.raw = { atk: true, parry: true }; ps[0]!.pend = { parryP: true };
    ps[1]!.raw = { bind: true, burst: true }; ps[1]!.pend = { bindP: true, burstP: true };
    const value = tickValue(ps); expect(Number.isSafeInteger(value)).toBe(true);
    applyTickValue(ps, value);
    expect(ps[0]!.raw.atk).toBe(true); expect(ps[0]!.pend.parryP).toBe(true); expect(ps[1]!.pend.bindP).toBe(true); expect(ps[1]!.pend.burstP).toBe(true);
    expect(ps[1]!.raw.atk).toBe(false);
  });
});

describe('траектории и данные атаки', () => {
  it('быстрый снаряд попадает при пересечении героя между тиками', () => {
    projReg.define({ id: 'fx_fast', netId: 40, size: [4, 4], step: (_w, pr, dt) => { pr.x += pr.vx * dt; } });
    const { w, p } = setup(); const hp = p.hp;
    w.projs.push({ kind: 'fx_fast', x: p.x - 100, y: p.y + 8, w: 4, h: 4, vx: 12000, vy: 0, life: 2, hk: 'unblockable' });
    stepProjs(w, 1 / 60); expect(p.hp).toBe(hp - 1); expect(w.projs).toHaveLength(0);
  });
  it('диагональная траектория не заменяется большой охватывающей коробкой', () => {
    expect(sweepTime({ x: 0, y: 0, w: 2, h: 2 }, { x: 100, y: 100, w: 2, h: 2 }, { x: 0, y: 80, w: 5, h: 5 })).toBeNull();
    expect(shapeHits({ type: 'circle', x: 0, y: 0, radius: 2 }, { x: 10, y: 10, w: 2, h: 2 })).toBe(false);
  });
  it('контрудар может быть явно разрешён фиолетовой атаке и запрещён жёлтой', () => {
    for (const [counter, color, allowed] of [[{ windowFrames: 5 }, 'purple', true], [false, 'yellow', false]] as const) {
      const raw = base(`fx_counter_${seq++}`); raw.attacks[0].counter = counter; raw.attacks[0].tell.cue.color = color;
      const { w, b, p, d } = setup(raw); d.atk = raw.attacks[0].id; d.mode = 'attack'; b.state = 'tell'; d.cue = { color, left: 4, total: 30 };
      p.x = b.x - 20;
      expect(!!counterTarget(w, p)).toBe(allowed);
    }
  });
  it('постановочный приказ не запускает атаки, запрещённые текущей формой', () => {
    const raw = base(`fx_form_${seq++}`); raw.attacks.push({ ...structuredClone(raw.attacks[0]), id: 'other' }); raw.phases[0].form = { attacks: ['other'] };
    const { w, b } = setup(raw);
    expect(commandChain(w, 0, 'c_swing')).toBe(false); expect(b.state).toBe('idle');
  });
  it('цель фиксируется до удара согласно commitFrames', () => {
    const raw = base(`fx_lock_${seq++}`); raw.attacks[0].tell.commitFrames = raw.attacks[0].tell.frames;
    const { w, b, p, d } = setup(raw); p.x = b.x - 100;
    forceChain(w, 0, 'c_swing'); const lock = { ...d.lock };
    p.x = b.x + 200; stepDataBoss(w, 0, 1 / 60);
    expect(d.lock).toEqual(lock);
  });
});
