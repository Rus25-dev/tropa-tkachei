import { describe, expect, it } from 'vitest';
import { dataKey, T } from '../../src/core/balance';
import { dstate, enterPhase, forceChain, onStagger, onStaggerWorld, rawData, resetFight } from '../../src/core/boss/exec';
import { bossDef } from '../../src/core/boss/registry';
import { World } from '../../src/core/world';
import { keeperPose } from '../../src/view/draw/keeper-motion';
import { telegraphKinds } from '../../src/view/draw/bosses';

function fight(phase = 1, players: 1 | 2 = 1) {
  const w = new World({ seed: 41, mode: 'bosstest', boss: 'keeper', players });
  const safe = (n: number) => { for (let i = 0; i < n; i++) { for (const p of w.players) { p.x = 64; p.inv = 10; } w.tick(); } };
  safe(160);
  if (phase > 1) { enterPhase(w, 0, phase); safe(340); }
  w.hitstop = 0;
  const b = w.bosses[0]!, p = w.players[0]!, d = dstate(b);
  b.stagger = 0; b.x = 600; b.y = 18 * T - b.h; b.vx = b.vy = 0;
  return { w, b, p, d, safe };
}

describe('дуэль трёх клятв', () => {
  it('у предупреждения печатей есть форма креста, даже когда урон наносит арена', () => {
    const def = bossDef('keeper')!;
    expect(telegraphKinds(def, def.attacks.find((a) => a.id === 'oath'))).toEqual(['unblockable']);
  });
  it('имеет собственный свободный зал и независимую сетку при повторе', () => {
    const { w } = fight(); const other = fight().w;
    expect(w.L.arena).toBe('keeper'); expect(w.L.W).toBe(38);
    for (let y = 1; y < 18; y++) expect(w.L.grid[y]!.slice(1, -1).every((t) => t === 0)).toBe(true);
    w.L.grid[5]![5] = 1; expect(other.L.grid[5]![5]).toBe(0);
  });

  it('после фиксации цели выпад продолжает прежнее направление при перебежке за спину', () => {
    const { w, b, p, d } = fight();
    p.x = b.x - 120; forceChain(w, 0, 'c_lunge');
    while (d.af < 16) w.tick();
    const dir = b.face;
    p.x = b.x + b.w + 100;
    while (b.state !== 'active') { p.inv = 10; w.tick(); }
    expect(b.face).toBe(dir); expect(Math.sign(b.vx)).toBe(dir);
  });

  it('ранний удар в стойку сохраняет урон и запускает один полный замах ответа', () => {
    const { w, b, p, d } = fight(2, 2);
    forceChain(w, 0, 'c_reversal'); w.tick();
    const hp = b.hp;
    expect(rawData(w, dataKey(0), p).damage).toBe(1);
    expect(b.hp).toBe(hp - 1); expect(d.chain).toBe('c_riposte');
    expect(d.af).toBe(0); expect(d.cue?.left).toBe(26);
    rawData(w, dataKey(0), w.players[1]!);
    expect(d.af).toBe(0); expect(b.hp).toBe(hp - 2);
    w.hitstop = 0;
    for (let i = 0; i < 26; i++) { p.inv = 10; w.tick(); }
    expect(b.state).toBe('tell');
    w.tick(); expect(b.state).toBe('active');
  });

  it('поздний удар не меняет стойку; удар со сменой фазы не прерывает переход ответом', () => {
    const { w, b, p, d } = fight(2);
    forceChain(w, 0, 'c_reversal');
    while ((d.cue?.left ?? 99) > 12) w.tick();
    rawData(w, dataKey(0), p); expect(d.chain).toBe('c_reversal');
    forceChain(w, 0, 'c_reversal'); w.tick(); b.hp = Math.ceil(b.maxHp * 0.33);
    rawData(w, dataKey(0), p); expect(b.phase).toBe(3); expect(d.mode).toBe('rage'); expect(d.chain).toBeNull();
  });

  it('воздушная серия поднимается над полом, завершает оба взмаха и даёт наказать подсечку', () => {
    const { w, b, p, d } = fight(3);
    forceChain(w, 0, 'c_sky'); const floor = b.y + b.h; let min = b.y, sweep = false, punish = false;
    for (let i = 0; i < 230; i++) {
      p.inv = 10; w.tick(); min = Math.min(min, b.y);
      sweep ||= d.atk === 'sweep'; punish ||= d.atk === 'sweep' && d.punish;
      if (punish) break;
    }
    expect(floor - b.h - min).toBeGreaterThan(70); expect(sweep).toBe(true); expect(punish).toBe(true);
  });

  it('печати предупреждают до урона, безопасный промежуток сохраняется, оглушение и повтор гасят угрозы', () => {
    const { w, b, p, d } = fight(3);
    forceChain(w, 0, 'c_enter3'); p.x = 550; p.y = 18 * T - p.h; p.inv = 0; const hp = p.hp;
    let warning = false, live = false;
    for (let i = 0; i < 108; i++) {
      w.tick();
      warning ||= !!w.arena?.ents.some((e) => e.strikes.some((s) => s.f <= s.tell));
      live ||= !!w.arena?.ents.some((e) => e.strikes.some((s) => s.f > s.tell));
      if (d.punish) expect(w.arena?.ents.every((e) => e.strikes.length === 0)).toBe(true);
    }
    expect(warning).toBe(true); expect(live).toBe(true); expect(p.hp).toBe(hp);
    forceChain(w, 0, 'c_enter3'); for (let i = 0; i < 50; i++) w.tick();
    b.stagger = 1; onStagger(b); onStaggerWorld(w, b);
    expect(w.arena?.ents.every((e) => !e.on && !e.strikes.length)).toBe(true);
    resetFight(w); expect(w.bosses[0]!.phase).toBe(1); expect(w.arena?.ents.every((e) => !e.on)).toBe(true);
  });

  it('полоса наносит урон только после своего предупреждения, даже во время рывка', () => {
    const { w, p } = fight(3);
    forceChain(w, 0, 'c_enter3'); p.x = 240; p.y = 18 * T - p.h; p.inv = 0;
    const hp = p.hp; let hurt = false;
    for (let i = 0; i < 120; i++) {
      w.tick();
      const strike = w.arena?.ents[0]?.strikes[0];
      if (strike && strike.f <= strike.tell) expect(p.hp).toBe(hp);
      if (strike && strike.f === strike.tell) p.dashT = 0.2;
      if (p.hp < hp) { hurt = true; break; }
    }
    expect(hurt).toBe(true);
  });

  it('обычный прыжок избегает подсечки без специального Контрудара', () => {
    const { w, b, p, d } = fight();
    forceChain(w, 0, 'c_sweep'); p.x = b.x - 45; p.y = 18 * T - p.h; p.inv = 0;
    const hp = p.hp;
    while ((d.cue?.left ?? 99) > 14) w.tick();
    p.raw = { jump: true }; p.pend = { jumpP: true };
    let airborne = false;
    for (let i = 0; i < 30; i++) { w.tick(); if (b.state === 'active') airborne ||= p.y + p.h < b.y + 54; }
    expect(airborne).toBe(true); expect(p.hp).toBe(hp);
  });
});

it('ключи анимации непрерывны между замахом, ударом и восстановлением', () => {
  for (const a of bossDef('keeper')!.attacks) {
    const pose = a.tell.cue.pose;
    expect(keeperPose(pose, 'tell', 1).a).toBeCloseTo(keeperPose(pose, 'active', 0).a);
    expect(keeperPose(pose, 'active', 1).a).toBeCloseTo(keeperPose(pose, 'recover', 0).a);
    expect(keeperPose(pose, 'recover', 1).a).toBeCloseTo(keeperPose(pose, 'idle', 0).a);
  }
});
