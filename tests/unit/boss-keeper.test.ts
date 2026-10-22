// Хранительница Печатей (keeper): дуэль на отбиве. Проверки: язык телеграфов (цвет = тип удара), «двойники» одинакового замаха разного цвета,
// печатные талисманы (фиолетовые, сбиваются взмахом), равновесие по Парированию 2.0 (идеальный и обычный отбив), три фазы, детерминизм, отрисовка.
import { describe, expect, it } from 'vitest';
import { PARRY2, POISE_MAX, SLASH_KINDS } from '../../src/core/balance';
import { dstate, forceChain, enterPhase } from '../../src/core/boss/exec';
import { bossDef } from '../../src/core/boss/registry';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { parryPoise } from '../../src/core/combat';
import { tellLeft } from '../../src/core/kit/counter';
import { normalizeSave } from '../../src/core/loadout';
import type { Inp, Player } from '../../src/core/types';
import { World } from '../../src/core/world';
import { drawDataBoss, CUE_RGB } from '../../src/view/draw/bosses';

const def = bossDef('keeper')!;
const atk = (id: string) => def.attacks.find((a) => a.id === id)!;
const mk = (seed = 1): { w: World; p: Player } => {
  const w = new World({ seed, mode: 'bosstest', boss: 'keeper', players: 1, loadoutSave: normalizeSave(null) });
  const p = w.players[0]!;
  for (let i = 0; i < 170; i++) { p.hp = p.maxHp = 99; p.x = 60; p.inv = 5; w.tick(); }
  p.inv = 0;
  return { w, p };
};
function step(w: World, raw: Inp = {}, edge: Inp = {}): void { const p = w.players[0]!; p.raw = { ...raw }; p.pend = { ...edge }; w.tick(); }
function stand(w: World, p: Player, gap = 50): void {
  const b = w.bosses[0]!;
  p.x = b.x + b.w / 2 - gap - p.w / 2; p.y = b.y + b.h - p.h; p.vx = p.vy = 0; p.hp = p.maxHp = 99; p.face = 1; p.atkCd = 0; p.atkT = 0;
}
const KIND_OF: Record<string, string> = { yellow: 'parry', red: 'dodge', purple: 'unblockable' };

describe('Хранительница Печатей: данные и телеграфы', () => {
  it('загружена: три фазы, больше шести связок на фазу, особая логика подключена', () => {
    expect(def).toBeTruthy(); expect(def.phases).toHaveLength(3);
    expect(def.name).toBe('Хранительница Печатей');
    for (let ph = 1; ph <= 3; ph++) expect(def.phases[ph - 1]!.policy.chains.length, `фаза ${ph}`).toBeGreaterThanOrEqual(6);
    const { w } = mk(); expect(w.bosses).toHaveLength(1); expect(w.bosses[0]!.posture).toBe(true);
  });
  it('цвет замаха равен типу удара: жёлтый — отбить, красный — уворот, фиолетовый — не отбивается; белый — только отгон и перенос', () => {
    for (const a of def.attacks) {
      const col = a.tell.cue.color;
      const kinds = new Set([...a.active.map((h) => h.kind), ...a.spawn.map((s) => s.kind)]);
      if (col === 'white') { expect(['shove', 'leap']).toContain(a.id); continue; }
      for (const k of kinds) expect(k, `${a.id}: ${col}`).toBe(KIND_OF[col]);
      if (!kinds.size) expect(a.fire.length + a.summon.length, a.id).toBeGreaterThan(0);
    }
  });
  it('все три цвета есть, а «печатные» талисманы — фиолетовые снаряды, которые можно сбить взмахом', () => {
    const cols = new Set(def.attacks.map((a) => a.tell.cue.color));
    for (const c of ['yellow', 'red', 'purple', 'white'] as const) expect(cols.has(c), c).toBe(true);
    const seals = def.attacks.flatMap((a) => a.spawn.filter((s) => s.kind === 'unblockable'));
    expect(seals.length).toBeGreaterThan(0);
    for (const s of seals) expect(SLASH_KINDS.has(s.proj.kind), s.proj.kind).toBe(true);
  });
  it('двойники: одинаковые поза, звук, замах и коробка, разный цвет (читать надо по цвету)', () => {
    const same = (ids: string[]): void => {
      const as = ids.map(atk);
      expect(new Set(as.map((a) => a.tell.cue.pose)).size, ids.join()).toBe(1);
      expect(new Set(as.map((a) => a.tell.cue.sfx)).size).toBe(1);
      expect(new Set(as.map((a) => a.tell.frames)).size).toBe(1);
      expect(new Set(as.map((a) => a.tell.cue.color)).size).toBe(as.length);
      expect(new Set(as.map((a) => JSON.stringify(a.active.map((h) => h.hit)))).size).toBe(1);
      expect(new Set(as.map((a) => a.recovery.frames)).size).toBe(1);
    };
    same(['cutY', 'cutR', 'cutP']); same(['cardY', 'cardP']);
  });
  it('фаза 1 читается без обманок; смесь одинаковых замахов появляется во 2-й и разрастается в 3-й', () => {
    const colorsOf = (ph: number): Set<string> => {
      const out = new Set<string>();
      for (const cid of def.phases[ph - 1]!.policy.chains) for (const s of def.chains.find((c) => c.id === cid)!.steps) {
        const a = atk(s.attack); if (a.tell.cue.pose === 'brush_up' || a.tell.cue.pose === 'card_throw') out.add(a.tell.cue.pose + ':' + a.tell.cue.color);
      }
      return out;
    };
    expect(colorsOf(1).size).toBe(0);
    expect([...colorsOf(2)].filter((x) => x.startsWith('brush_up')).length).toBeGreaterThanOrEqual(2);
    expect([...colorsOf(3)].filter((x) => x.startsWith('brush_up')).length).toBe(3);
  });
  it('у каждой атаки есть замах не короче нормы и окно наказания после неё', () => {
    for (const a of def.attacks) {
      const k = [...a.active.map((h) => h.kind), ...a.spawn.map((s) => s.kind)];
      const min = k.includes('unblockable') ? 30 : k.includes('dodge') ? 24 : 20;
      expect(a.tell.frames, a.id).toBeGreaterThanOrEqual(min);
      expect(a.recovery.punishWindow.to - a.recovery.punishWindow.from + 1, a.id).toBeGreaterThanOrEqual(16);
    }
  });
});

describe('Хранительница Печатей: равновесие и отбив (Парирование 2.0)', () => {
  it('идеальный отбив даёт боссу вдвое больше равновесия, чем обычный; два идеальных — оглушение', () => {
    const { w, p } = mk(); const b = w.bosses[0]!;
    stand(w, p); step(w);
    const cx = p.x + 7, cy = p.y + 13;
    b['poise'] = 0; parryPoise(w, cx, cy, false);
    expect(b['poise']).toBe(PARRY2.POSTURE_NORMAL_POISE);
    b['poise'] = 0; parryPoise(w, cx, cy, true);
    expect(b['poise']).toBe(3 * PARRY2.PERFECT_POISE_MUL);
    expect(b['poise']).toBeGreaterThan(POISE_MAX[1]! / 2);
    parryPoise(w, cx, cy, true);
    expect(b.stagger).toBeGreaterThan(0);
  });
  it('жёлтый удар отбивается: идеальный отбив в окне даёт контратаку и равновесие, урона нет', () => {
    const { w, p } = mk(); const b = w.bosses[0]!;
    expect(forceChain(w, 0, 'c_stamp')).toBe(true);
    stand(w, p); p.silk = 0;
    for (let i = 0; i < 80 && tellLeft(b) !== 3; i++) { stand(w, p); step(w); }
    expect(tellLeft(b)).toBe(3);
    const hp = p.hp, poise0 = (b['poise'] as number) || 0;
    stand(w, p); step(w, {}, { healP: true });
    for (let i = 0; i < 12; i++) step(w);
    expect(p['counterT']).toBeGreaterThan(0); // идеальный отбив: контратака готова
    expect(p.hp).toBe(hp);
    expect(((b['poise'] as number) || 0) + (b.stagger > 0 ? 99 : 0)).toBeGreaterThan(poise0 + PARRY2.POSTURE_NORMAL_POISE);
  });
  it('красный удар отбивом не гасится: урон проходит', () => {
    const { w, p } = mk(); const b = w.bosses[0]!;
    expect(forceChain(w, 0, 'c_sweep')).toBe(true);
    stand(w, p, 40); p.silk = 0; let hurt = false;
    for (let i = 0; i < 120 && !hurt; i++) {
      stand(w, p, 40); const h = p.hp; p.hp = 5; p.maxHp = 5;
      step(w, {}, b.state === 'tell' && tellLeft(b) === 3 ? { healP: true } : {});
      if (p.hp < 5 || h < 0) hurt = true;
    }
    expect(hurt).toBe(true);
  });
});

describe('Хранительница Печатей: фазы и детерминизм', () => {
  it('переход в фазы 2 и 3: рёв, сцена, переходный приём, затем политика новой фазы', () => {
    const { w, p } = mk(); const b = w.bosses[0]!;
    expect(enterPhase(w, 0, 2)).toBe(true);
    for (let i = 0; i < 400; i++) { stand(w, p, 300); p.inv = 5; w.tick(); }
    expect(b.phase).toBe(2); expect(['idle', 'tell', 'active', 'recover']).toContain(b.state);
    expect(enterPhase(w, 0, 3)).toBe(true);
    for (let i = 0; i < 500; i++) { stand(w, p, 300); p.inv = 5; w.tick(); }
    expect(b.phase).toBe(3); expect(dstate(b).formPh).toBe(3);
  });
  it('детерминизм: то же зерно и ввод — то же состояние', () => {
    const run = (): string => {
      const w = new World({ seed: 5, mode: 'bosstest', boss: 'keeper', players: 1 });
      const fz = makeFuzzer(w, 5);
      for (let i = 0; i < 3000; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.players.map((p) => [p.x, p.hp]), w.bosses.map((b) => [b.x, b.hp, dstate(b).mem.hist])]);
    };
    expect(run()).toBe(run());
  });
});

describe('Хранительница Печатей: отрисовка', () => {
  const fakeG = (): never => { const g: unknown = new Proxy({}, { get: () => () => g }); return g as never; };
  it('тело рисуется во всех позах (с пустым Graphics), контур замаха берёт цвет типа удара', () => {
    const { w, p } = mk(); const b = w.bosses[0]!;
    expect(Object.keys(CUE_RGB)).toContain('purple');
    const chains = def.chains.map((c) => c.id);
    expect(() => {
      for (const c of chains) {
        forceChain(w, 0, c);
        for (let i = 0; i < 150; i++) { stand(w, p, 300); p.inv = 5; w.tick(); drawDataBoss(w, b, fakeG(), i / 10); }
      }
      enterPhase(w, 0, 3);
      for (let i = 0; i < 400; i++) { stand(w, p, 300); p.inv = 5; w.tick(); drawDataBoss(w, b, fakeG(), i / 10); }
    }).not.toThrow();
  });
});
