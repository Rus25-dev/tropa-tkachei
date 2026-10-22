// Валидатор честности данных боссов (src/core/boss/validate.ts): все data/bosses/*.json проходят без ошибок; нечестные данные ловятся с местом (связка/атака/кадр).
import { describe, expect, it } from 'vitest';
import { BossDefSchema, parseRules } from '../../src/core/boss/schema';
import { bestInWindow, formatReport, validateBoss, validateRaw, type Issue } from '../../src/core/boss/validate';
import { arenaInfo, loadBossFiles, readRulesRaw } from '../../tools/boss/files';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- правка JSON в тестах
const rules = parseRules(readRulesRaw());
const dummy = (): Raw => JSON.parse(JSON.stringify(loadBossFiles('dummy')[0]!.raw)) as Raw;
const check = (raw: Raw): Issue[] => validateRaw(raw, rules, arenaInfo(raw['arena'] as string));
const codes = (is: Issue[], level: Issue['level'] = 'error'): string[] => is.filter((i) => i.level === level).map((i) => i.code);

describe('валидатор: все боссы из data/bosses', () => {
  for (const f of loadBossFiles()) {
    it(`«${f.id}» (${f.file}): ни одной ошибки честности`, () => {
      const errs = check(f.raw as Raw).filter((i) => i.level === 'error');
      expect(errs.map((e) => `${e.code}: ${e.msg}`)).toEqual([]);
    });
  }
  it('манекен: результат стабилен (только известные предупреждения)', () => {
    const w = codes(check(dummy()), 'warn');
    expect(w.every((c) => ['dash-cd', 'parry-cd', 'cue-dup', 'chain-unused', 'attack-unused'].includes(c))).toBe(true);
  });
});

describe('валидатор: ловит нечестные данные', () => {
  const cases: [string, (d: Raw) => void, string, RegExp][] = [
    ['окно наказания после связки короче нормы', (d) => { d['attacks'].find((a: Raw) => a.id === 'shove').recovery.punishWindow = { from: 6, to: 22 }; }, 'chain-punish', /c_shove/],
    ['пауза gapFrames слишком короткая', (d) => { d['chains'][0].steps[0].gapFrames = 3; }, 'gap-short', /c_combo/],
    ['мало времени на реакцию между шагами', (d) => { d['chains'][2].steps[0].gapFrames = 8; d['attacks'].find((a: Raw) => a.id === 'orb').tell.frames = 20; }, 'react', /c_slam_orb/],
    ['пауза между связками меньше нормы', (d) => { d['phases'][1].policy.restFrames = [4, 8]; }, 'rest', /фаза 2/],
    ['два неотбиваемых подряд без окна', (d) => { d['chains'].push({ id: 'c_two', steps: [{ attack: 'crush', gapFrames: 12 }, { attack: 'crush' }], weight: 1 }); d['phases'][1].policy.chains.push('c_two'); }, 'unblockable-chain', /c_two/],
    ['коробка удара больше арены', (d) => { d['attacks'].find((a: Raw) => a.id === 'crush').active[0].hit.w = 3000; }, 'box-size', /crush/],
    ['снаряд появляется за пределами арены', (d) => { d['attacks'].find((a: Raw) => a.id === 'rain').spawn[0].oy = -4000; }, 'spawn-out', /rain/],
    ['некуда уйти от широкого удара', (d) => { const a = d['attacks'].find((x: Raw) => x.id === 'crush'); a.active[0].hit = { x: -600, y: -300, w: 1200, h: 380 }; a.tell.frames = 30; }, 'no-escape', /не уйти/],
    ['слишком большой поток урона', (d) => { d['attacks'].find((a: Raw) => a.id === 'swing').active.push({ from: 0, to: 5, hit: { x: 6, y: 14, w: 72, h: 56 }, dmg: 3, kind: 'parry' }); }, 'flux', /за 3 секунды/],
    ['ссылка защиты от читов на несуществующую связку', (d) => { d['antiCheese'].shoveChain = 'c_net'; }, 'anti-ref', /c_net/],
    ['замах короче нормы (правило схемы попадает в отчёт)', (d) => { d['attacks'][0].tell.frames = 8; }, 'rule', /замах 8/],
  ];
  for (const [name, mut, code, re] of cases) {
    it(name, () => {
      const d = dummy(); mut(d);
      const is = check(d), hit = is.filter((i) => i.level === 'error' && i.code === code);
      expect(hit.length, `ожидался код ${code}, есть: ${codes(is).join(',')}`).toBeGreaterThan(0);
      expect(hit.some((i) => re.test(i.msg))).toBe(true);
    });
  }
  it('ошибка схемы не бросает исключение, а становится находкой', () => {
    const d = dummy(); delete d['name'];
    const is = check(d);
    expect(is[0]!.code).toBe('schema'); expect(is[0]!.msg).toMatch(/name/);
  });
  it('находка называет место: связку, атаку и кадр', () => {
    const d = dummy(); d['attacks'].find((a: Raw) => a.id === 'crush').active[0].hit.w = 3000;
    const i = check(d).find((x) => x.code === 'box-size')!;
    expect(i.attack).toBe('crush'); expect(i.frame).toBe(44); expect(i.boss).toBe('dummy');
  });
  it('поток урона: неуязвимость после удара не даёт набрать больше одного удара в секунду', () => {
    const ev = [0, 10, 20, 30].map((t) => ({ t, dmg: 1, kind: 'dodge', what: '' }));
    expect(bestInWindow(ev, 180, 60).dmg).toBe(1);
    const ev2 = [0, 70, 140, 150].map((t) => ({ t, dmg: 2, kind: 'dodge', what: '' }));
    expect(bestInWindow(ev2, 180, 60).dmg).toBe(6);
  });
  it('без блока fairness в правилах проверки связок пропускаются', () => {
    const r2 = parseRules({ ...(readRulesRaw() as object), fairness: undefined });
    const d = BossDefSchema.parse(dummy());
    d.chains[0]!.steps[0]!.gapFrames = 3;
    expect(validateBoss(d, r2).some((i) => i.code === 'gap-short')).toBe(false);
  });
});

describe('валидатор: отчёт', () => {
  it('ошибки красные, предупреждения жёлтые; без цвета — чистый текст', () => {
    const d = dummy(); d['attacks'].find((a: Raw) => a.id === 'crush').active[0].hit.w = 3000;
    const rep = formatReport([{ id: 'dummy', issues: check(d) }], true);
    expect(rep).toContain('\x1b[31m'); expect(rep).toContain('\x1b[33m');
    expect(formatReport([{ id: 'dummy', issues: check(d) }], false)).not.toContain('\x1b');
    expect(formatReport([{ id: 'dummy', issues: check(dummy()) }], false)).toContain('ошибок нет');
  });
});
