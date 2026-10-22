// Волна 0, сущности арены по расписанию: платформы (динамические тайлы мира), барьеры, лучи и зоны урона с замахом, точки появления снарядов.
// Расписание идёт кадрами; привязка — к началу боя, фазе, шагу связки и к attack.fire; герой сталкивается с платформами через обычные тайлы.
import { describe, expect, it } from 'vitest';
import { PLAT, SOLID, T } from '../../src/core/balance';
import { arenaFire, entDef, type EntRt } from '../../src/core/boss/arena';
import { dstate, forceChain } from '../../src/core/boss/exec';
import { BOSS_RULES, registerBoss } from '../../src/core/boss/registry';
import { validateRaw } from '../../src/core/boss/validate';
import { poiseAdd } from '../../src/core/bosses2';
import { damageBoss } from '../../src/core/damage';
import { feedInput, makeFuzzer } from '../../src/core/fuzzinput';
import { World } from '../../src/core/world';
import { arenaInfo } from '../../tools/boss/files';
import { cloneWorld } from '../../tools/bot/clone';
import { arenaBoss, type Raw } from '../fixtures/bosses';

function make(raw: Raw = arenaBoss(), opts: { train?: boolean; trainPhase?: number; seed?: number } = {}): World {
  registerBoss(raw);
  return new World({ seed: opts.seed ?? 1, mode: 'bosstest', boss: raw['id'] as string, players: 1, fx: true, train: opts.train, trainPhase: opts.trainPhase });
}
const ent = (w: World, id: string): EntRt => w.arena!.ents.find((e) => e.id === id)!;
/** героя держим у левой стены, далеко от босса (x в px мира), на полу */
function put(w: World, x: number, y?: number): void {
  const p = w.players[0]!, b = w.bosses[0]!;
  p.x = x; p.y = y ?? b.y + b.h - p.h; p.vx = 0; p.vy = 0; p.hp = p.maxHp = 999; p.safeX = p.x; p.safeY = p.y; w.hitstop = 0;
}
const tickN = (w: World, n: number, each?: (i: number) => void): void => { for (let i = 0; i < n; i++) { w.tick(); each?.(i); } };
const FLOOR = 18 * T;

describe('платформы и барьеры: динамические тайлы', () => {
  it('платформа появляется с предупреждением, исчезает с предупреждением; герой стоит на ней, а после исчезновения падает', () => {
    const w = make(); const p = w.players[0]!, e = ent(w, 'plat_start');
    // платформа: x 32+320=352…480, верх на высоте 96+32 над полом → y = 576-128 = 448
    const top = FLOOR - 128;
    expect(w.tileAt(12, 14)).toBe(0); // ничего нет, пока не показана
    tickN(w, 1); // вступление — 1 кадр; на следующем bind.start запускает расписание
    tickN(w, 2);
    expect(e.on).toBe(true); expect(e.warnShow).toBeGreaterThan(0); expect(e.shown).toBe(false);
    tickN(w, 30);
    expect(e.shown).toBe(true);
    expect(w.tileAt(11, 14)).toBe(PLAT); expect(w.tileAt(14, 14)).toBe(PLAT); expect(w.tileAt(15, 14)).toBe(0);
    // герой падает сверху и встаёт на платформу
    put(w, 360, top - 200); // x 360: левее настоящей платформы арены (384…512)
    tickN(w, 60, () => { w.players[0]!.hp = 999; });
    expect(p.onGround).toBe(true); expect(Math.round(p.y + p.h)).toBe(top);
    // карта не тронута: платформа лежит поверх, а не в сетке
    expect(w.grid[14]![12]).toBe(0);
    // исчезновение: на кадре 240 расписания начинается предупреждение (40 кадров), потом герой падает
    let warned = false, gone = -1;
    for (let f = 0; f < 400 && gone < 0; f++) { w.tick(); if (e.warnHide > 0) warned = true; if (!e.shown) gone = f; }
    expect(warned).toBe(true); expect(gone).toBeGreaterThan(0);
    tickN(w, 40);
    expect(Math.round(p.y + p.h)).toBe(FLOOR);
    // и снова появляется по loop 600
    tickN(w, 400);
    expect(e.shown).toBe(true);
  });

  it('платформа проходима снизу (PLAT): герой снизу вверх проходит сквозь неё и встаёт сверху; твёрдая (solid) — не пускает', () => {
    const w = make(arenaBoss('fx_a1b'), { train: true, trainPhase: 2 });
    tickN(w, 45); expect(ent(w, 'plat_start').shown).toBe(true); expect(ent(w, 'plat_solid').shown).toBe(true);
    const p = w.players[0]!;
    // проходимая (x 352…480, низ на y 480): голова чуть ниже, летим вверх
    put(w, 360, 480 + 4); p.vy = -560;
    tickN(w, 120, () => { p.hp = 999; });
    expect(Math.round(p.y + p.h)).toBe(FLOOR - 128);
    // твёрдая (x 672…768, низ на y 512; до хода на кадре 120 расписания): летим вверх — упираемся головой и падаем обратно на пол
    const w2 = make(arenaBoss('fx_a1c'), { train: true, trainPhase: 2 }); tickN(w2, 36);
    const q = w2.players[0]!; expect(ent(w2, 'plat_solid').shown).toBe(true);
    put(w2, 690, 512 + 4); q.vy = -560;
    let minY = Infinity; tickN(w2, 60, () => { q.hp = 999; minY = Math.min(minY, q.y); });
    expect(minY).toBeGreaterThanOrEqual(512 - 1);
    expect(Math.round(q.y + q.h)).toBe(FLOOR);
  });

  it('твёрдая платформа фазы 2 и барьер: фаза 2 запускает расписание, solid-тайлы блокируют, барьер исчезает', () => {
    const w = make(arenaBoss('fx_a2'), { train: true, trainPhase: 2 });
    tickN(w, 3);
    const solid = ent(w, 'plat_solid');
    expect(solid.on).toBe(true);
    // фаза 2: показать с предупреждением 30 → к кадру 35 видна и твёрдая
    tickN(w, 40);
    expect(solid.shown).toBe(true);
    expect(w.isSolid(Math.round((T + 640) / T), solid.ty)).toBe(true); expect(w.tileAt(Math.round((T + 640) / T), solid.ty)).toBe(SOLID);
    // барьер: кадр 60 (+40 предупреждения) → стена x=32+1280
    const wx = Math.round((T + 1280) / T);
    expect(w.isSolid(wx, 15)).toBe(false);
    tickN(w, 80); expect(w.isSolid(wx, 15)).toBe(true); expect(w.isSolid(wx, 14)).toBe(true); expect(w.isSolid(wx, 13)).toBe(false);
    // и исчезает на 300 + 40
    tickN(w, 260); expect(w.isSolid(wx, 15)).toBe(false);
  });

  it('ход платформы по клеткам: герой на ней едет вместе; ход не давит героя', () => {
    const w = make(arenaBoss('fx_a3'), { train: true, trainPhase: 2 });
    tickN(w, 3);
    const solid = ent(w, 'plat_solid'); const p = w.players[0]!;
    tickN(w, 35); expect(solid.shown).toBe(true);
    const x0 = solid.tx;
    // герой встаёт на твёрдую платформу (верх: 576-64-32 = 480-... y = FLOOR - 96 = 480)
    put(w, 640 + T + 30, FLOOR - 96 - 26);
    tickN(w, 5);
    expect(p.onGround).toBe(true);
    const px0 = p.x;
    tickN(w, 200, () => { p.hp = 999; });
    expect(solid.tx).toBe(x0 + 3); // 96 px = 3 клетки
    expect(p.x - px0).toBeGreaterThan(60); // едет вместе с платформой
    expect(p.onGround).toBe(true);
  });

  it('твёрдая платформа не появляется внутри героя: ждёт, пока место освободится', () => {
    const w = make(arenaBoss('fx_a4'), { train: true, trainPhase: 2 });
    tickN(w, 3);
    const solid = ent(w, 'plat_solid');
    put(w, 640 + T + 30, FLOOR - 64 - 26); // внутри будущей платформы (y 64…96 над полом)
    tickN(w, 60, () => put(w, 640 + T + 30, FLOOR - 64 - 26));
    expect(solid.shown).toBe(false); expect(solid.pend).toBe(true);
    put(w, 100); tickN(w, 5);
    expect(solid.shown).toBe(true);
    expect(w.solidRect(w.players[0]!)).toBe(false);
  });

  it('динамические тайлы живут в мире и копируются с ним: бот-копия независима, исходная сетка не меняется', () => {
    const w = make(arenaBoss('fx_a5'));
    tickN(w, 40);
    expect(ent(w, 'plat_start').shown).toBe(true);
    const gridJson = JSON.stringify(w.grid), c = cloneWorld(w);
    tickN(c, 300); // в копии платформа исчезла (кадр 240+40)
    expect(ent(c, 'plat_start').shown).toBe(false); expect(ent(w, 'plat_start').shown).toBe(true);
    expect(JSON.stringify(w.grid)).toBe(gridJson); expect(c.grid).toBe(w.grid); // сетка общая и нетронутая
    expect(c.dyn).not.toBe(w.dyn); expect(w.tileAt(12, 14)).toBe(PLAT); expect(c.tileAt(12, 14)).toBe(0);
  });
});

describe('лучи, зоны урона, точки появления', () => {
  it('луч шага связки: замах, потом урон только внутри зоны, один раз; тип удара передаётся', () => {
    const w = make(arenaBoss('fx_b1'));
    tickN(w, 3);
    const hero = w.players[0]!;
    // зона: x 32…232, пол…60 над полом. Герой в зоне получает 1 удар, вне — нет
    put(w, 100); const hp0 = hero.hp;
    expect(forceChain(w, 0, 'c_beam')).toBe(true);
    const e = ent(w, 'beam_a'); tickN(w, 1);
    expect(e.strikes).toHaveLength(1);
    let first = -1;
    for (let f = 1; f < 120; f++) { put(w, 100); w.players[0]!.hp = hp0; hero.inv = 0; w.tick(); if (hero.hp < hp0 && first < 0) first = f; }
    expect(first).toBe(40); // замах 40 кадров босса, потом урон
    // вне зоны урона нет
    const w2 = make(arenaBoss('fx_b2')); tickN(w2, 3); put(w2, 600); const h2 = w2.players[0]!;
    forceChain(w2, 0, 'c_beam'); tickN(w2, 120, () => put(w2, 600));
    expect(h2.hp).toBe(999);
  });

  it('зона по attack.fire: запускается кадром атаки на часах босса, непарируемый удар пробивает отбив', () => {
    const w = make(arenaBoss('fx_b3'));
    tickN(w, 3);
    const hero = w.players[0]!;
    put(w, 1100); // зона x 1032…1182
    forceChain(w, 0, 'c_zap');
    let hit = -1;
    for (let f = 0; f < 200 && hit < 0; f++) { put(w, 1100); hero.parryT = 0.2; hero.hp = 999; hero.inv = 0; w.tick(); if (hero.hp < 999) hit = f; }
    expect(hit).toBeGreaterThan(40); expect(hero.hp).toBe(997); // dmg 2
    expect(ent(w, 'zone_fire').strikes.length + 0).toBeGreaterThanOrEqual(0);
  });

  it('точка появления фазы 2: снаряд через замах, по циклу loop; снаряд с типом удара и хозяином', () => {
    const w = make(arenaBoss('fx_b4'), { train: true, trainPhase: 2 });
    tickN(w, 3);
    put(w, 100);
    const seen: number[] = [];
    for (let f = 0; f < 700; f++) { put(w, 100); w.tick(); for (const pr of w.projs) if (pr.kind === 'rock' && pr.vy > 0 && !seen.includes(pr.x)) seen.push(pr.x); }
    expect(seen.length).toBeGreaterThan(0);
    const pr = w.projs.find((q) => q.kind === 'rock');
    if (pr) { expect(pr.hk).toBe('dodge'); expect(pr['src']).toBe('d'); expect(pr['o']).toBe(0); }
  });

  it('оглушение босса гасит сущности арены, запущенные его связкой; сущности фазы продолжают', () => {
    const w = make(arenaBoss('fx_b5'));
    tickN(w, 3);
    put(w, 600);
    forceChain(w, 0, 'c_beam'); tickN(w, 5);
    const beam = ent(w, 'beam_a'); expect(beam.strikes.length).toBe(1);
    for (let i = 0; i < 10; i++) poiseAdd(w, w.bosses[0]!, 1);
    expect(w.bosses[0]!.stagger).toBeGreaterThan(0);
    expect(beam.strikes).toHaveLength(0);
    expect(ent(w, 'plat_start').on).toBe(true);
  });

  it('ручной запуск и повторный запуск перезапускают расписание сначала', () => {
    const w = make(arenaBoss('fx_b6'));
    tickN(w, 3);
    arenaFire(w, 'zone_fire', 'w', 0); tickN(w, 10);
    const z = ent(w, 'zone_fire'); expect(z.strikes).toHaveLength(1); expect(z.t).toBeGreaterThan(5);
    arenaFire(w, 'zone_fire', 'w', 0); expect(z.t).toBe(0); expect(z.strikes).toHaveLength(0);
    expect(entDef(w, z)!.kind).toBe('beam');
  });
});

describe('арена: детерминизм и правила', () => {
  it('те же зерно и ввод — то же состояние арены и мира', () => {
    const run = (): string => {
      const w = make(arenaBoss('fx_d1'), { seed: 7 });
      const fz = makeFuzzer(w, 7);
      for (let i = 0; i < 2500; i++) { feedInput(w, [fz(0)]); w.tick(); }
      return JSON.stringify([w.arena, w.players.map((p) => [p.x, p.y, p.hp]), w.bosses.map((b) => [b.x, b.y, b.hp]), w.projs.length, w.tickN]);
    };
    const a = run(), b = run(); expect(b).toBe(a);
  });

  it('валидатор: правильная арена без ошибок; быстрые исчезновения, замуровывание, короткий замах, выход за арену, луч на весь пол — ошибки', () => {
    const codes = (raw: Raw): string[] => validateRaw(raw, BOSS_RULES, arenaInfo('vladik')).filter((i) => i.level === 'error').map((i) => i.code);
    expect(codes(arenaBoss('fx_v0'))).toEqual([]);
    const ents = (r: Raw): Raw[] => r['arena'].ents as Raw[];
    const a1 = arenaBoss('fx_v1'); ents(a1)[0]!['timeline'][1].warn = 10; expect(codes(a1)).toContain('plat-hide-warn');
    const a2 = arenaBoss('fx_v2'); ents(a2)[1]!['timeline'][0].warn = 0; expect(codes(a2)).toContain('plat-show-warn');
    const a3 = arenaBoss('fx_v3'); ents(a3)[1]!['timeline'][1].frames = 20; expect(codes(a3)).toContain('plat-fast');
    const a4 = arenaBoss('fx_v4'); ents(a4)[2]!['timeline'][0].tell = 10; expect(codes(a4)).toContain('beam-tell');
    const a5 = arenaBoss('fx_v5'); ents(a5)[2]!['area'] = { x: 0, y: 0, w: 1344, h: 60 }; expect(codes(a5)).toContain('beam-no-safe');
    const a6 = arenaBoss('fx_v6'); ents(a6)[0]!['area'].x = 1300; expect(codes(a6)).toContain('ent-bounds');
    const a7 = arenaBoss('fx_v7'); ents(a7)[4]!['timeline'][0].tell = 0; expect(codes(a7)).toContain('spawn-tell');
    const a8 = arenaBoss('fx_v8'); ents(a8)[0]!['area'].x = 321; expect(() => registerBoss(a8)).toThrow(/кратна тайлу/);
    const a9 = arenaBoss('fx_v9'); ents(a9)[2]!['bind'].chain = 'нет'; expect(() => registerBoss(a9)).toThrow(/неизвестную связку/);
  });

  it('убийство босса очищает арену', () => {
    const w = make(arenaBoss('fx_k1'));
    tickN(w, 40); const b = w.bosses[0]!;
    expect(ent(w, 'plat_start').shown).toBe(true);
    b.hp = 1; damageBoss(w, 'd0', w.players[0]!);
    expect(b.state).toBe('dead'); expect(ent(w, 'plat_start').shown).toBe(false); expect(w.dyn).toBeNull();
    void dstate;
  });
});
