// Набор приёмов игрока (v2.5, часть Б волны 0): теневой рывок, воздушная вспышка, кристальный рывок, нитяные заклинания.
// Каждый приём проверяется по кадрам: неуязвимость, длительность, откат, остановка о стены и край, отмена, несовместимости, детерминизм.
import { describe, expect, it } from 'vitest';
import { KIT, P, SOLID, T } from '../../src/core/balance';
import { hurtPlayer } from '../../src/core/damage';
import { hashFor } from '../../src/core/journal';
import { ABILS, kitHas } from '../../src/core/kit/abilities';
import { dashSpeed, fr, kitGhost } from '../../src/core/kit/moves';
import { spellCd, spellDamage } from '../../src/core/kit/spells';
import { TOOLS, applyLoadout, defaultLoadout, equipped, normalizeSave, owned } from '../../src/core/loadout';
import type { Boss, Inp, Player } from '../../src/core/types';
import { World } from '../../src/core/world';
import { applyPlayer, packPlayer } from '../../src/core/netplay';
import { Recorder } from '../../src/core/session';
import { runFight } from '../../tools/bot/fight';
import { emptyFrame } from '../../src/core/input';
import { outcome } from '../../src/core/journal';
import { replayJournal } from '../../src/core/replay';
import { SessionRecorder } from '../../src/core/recording';
import { Session } from '../../src/core/session';

interface MkOpts { kit?: boolean; abil?: Record<string, boolean>; boss?: string; seed?: number }
/** Арена Владика 44×22 (пол — ряд 18, внутри — клетки 1…42), босс спит; герой стоит на земле, неуязвимость снята */
function mk(o: MkOpts = {}): { w: World; p: Player } {
  const w = new World({ seed: o.seed ?? 5, mode: 'bosstest', boss: o.boss ?? 'vladik', kit: o.kit ?? true, loadoutSave: normalizeSave(null) });
  const p = w.players[0]!;
  w.vladik!.state = 'sleep'; w.vladik!.x = -400; w.curtains = []; // шторы со слизью жгутся — в проверках движения им не место
  if (o.abil) w.abil = { ...w.abil, ...o.abil };
  for (let i = 0; i < 20; i++) w.tick();
  p.inv = 0; p.hp = p.maxHp = 9; p.silk = 0;
  return { w, p };
}
/** один тик: raw — удержание, edge — нажатия этого тика */
function step(w: World, raw: Inp = {}, edge: Inp = {}): void { const p = w.players[0]!; p.raw = { ...raw }; p.pend = { ...edge }; w.tick(); }
const run = (w: World, n: number, raw: Inp = {}): void => { for (let i = 0; i < n; i++) step(w, raw); };
const air = (p: Player, x: number, y: number): void => { p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.onGround = false; p.canDash = true; p.dashCd = 0; };
const wall = (w: World, tx: number, y0 = 1, y1 = 17): void => { for (let y = y0; y <= y1; y++) w.grid[y]![tx] = SOLID; };
const FLOOR = 18 * T;

describe('реестр и открытие приёмов', () => {
  it('по умолчанию закрыты: мир без флага kit и без способности', () => {
    const { w, p } = mk({ kit: false });
    for (const id of Object.keys(ABILS)) expect(kitHas(w, p, id as never), id).toBe(false);
  });
  it('Босс-тест с флагом kit открывает все; дуэль, гонка и кампания — нет', () => {
    const { w, p } = mk({ kit: true });
    for (const id of Object.keys(ABILS)) expect(kitHas(w, p, id as never), id).toBe(true);
    w.camp = { ch: 2, st: 'arena', beads: 0, abil: {}, up: { hp: 0, dmg: 0, silk: 0 }, time: 0, deaths: 0 };
    expect(kitHas(w, p, 'shadow')).toBe(false);
  });
  it('способность выдаётся одной записью: флаг abil, строка в сохранении или unlock боссом', () => {
    const a = mk({ kit: false, abil: { flash: true } });
    expect(kitHas(a.w, a.p, 'flash')).toBe(true); expect(kitHas(a.w, a.p, 'shadow')).toBe(false);
    const d = normalizeSave(null); d.have.abils = ['crystal'];
    expect(owned('abils', 'crystal', d, false)).toBe(true); expect(owned('abils', 'shadow', d, false)).toBe(false);
    const eq = equipped(d, false, false); expect(eq.abils).toEqual(['crystal']);
    const b = mk({ kit: false }); applyLoadout(b.w, eq);
    expect(kitHas(b.w, b.p, 'crystal')).toBe(true); expect(kitHas(b.w, b.p, 'flash')).toBe(false);
    expect(equipped(d, false, true).abils).toEqual([]); // забег спидрана — честное снаряжение
    expect(defaultLoadout().abils).toEqual([]);
  });
});

describe('теневой рывок', () => {
  it('закрыт: рывок прежний (длительность, откат, скорость, неуязвимости нет)', () => {
    const { w, p } = mk({ kit: false });
    step(w, { dash: true }, { dashP: true });
    expect(p.dashT).toBeCloseTo(P.DASHT, 9); expect(p.dashCd).toBeCloseTo(P.DASHCD, 9); expect(dashSpeed(p)).toBe(P.DASH);
    expect(kitGhost(p)).toBe(false);
  });
  it('неуязвимость 11 кадров, рывок 12 кадров, откат 1,1 с', () => {
    const { w, p } = mk();
    const ghost: boolean[] = [], dashing: boolean[] = [];
    step(w, { dash: true }, { dashP: true });
    ghost.push(kitGhost(p)); dashing.push(p.dashT > 0);
    expect(p.dashCd).toBeCloseTo(KIT.SHADOW.CD, 9);
    for (let i = 0; i < 20; i++) { step(w); ghost.push(kitGhost(p)); dashing.push(p.dashT > 0); }
    expect(ghost.filter(Boolean).length).toBe(KIT.SHADOW.GHOST_F);
    expect(ghost.slice(0, KIT.SHADOW.GHOST_F).every(Boolean)).toBe(true);
    const n = dashing.filter(Boolean).length;
    expect(n).toBeGreaterThanOrEqual(10); expect(n).toBeLessThanOrEqual(13);
    expect(KIT.SHADOW.GHOST_F).toBeGreaterThanOrEqual(10); expect(KIT.SHADOW.GHOST_F).toBeLessThanOrEqual(12);
  });
  it('откат: повторный рывок раньше 1,1 с невозможен, позже — можно', () => {
    const { w, p } = mk();
    step(w, { dash: true }, { dashP: true }); step(w);
    run(w, 40);
    const x0 = p.x; step(w, { right: true }, { dashP: true }); expect(p.dashT).toBeLessThanOrEqual(0); expect(p['kgF'] ?? 0).toBe(0); void x0;
    run(w, 40);
    step(w, {}, { dashP: true }); expect(p['kgF']).toBe(KIT.SHADOW.GHOST_F);
  });
  it('проход через касание и снаряды parry/dodge без урона; unblockable и шипы бьют', () => {
    const { w, p } = mk();
    step(w, { dash: true }, { dashP: true });
    for (const hk of [undefined, 'parry', 'dodge'] as const) { p.inv = 0; const hp = p.hp; hurtPlayer(w, p, 1, p.x + 20, false, hk); expect(p.hp, String(hk)).toBe(hp); }
    p.inv = 0; hurtPlayer(w, p, 1, p.x + 20, false, 'unblockable'); expect(p.hp).toBe(8);
    const g = mk(); step(g.w, { dash: true }, { dashP: true }); hurtPlayer(g.w, g.p, 1, null, true); expect(g.p.hp).toBe(8); // шипы
  });
  it('без награды за идеальный уворот: нить не растёт, окно неуязвимости заканчивается по кадрам', () => {
    const { w, p } = mk();
    step(w, { dash: true }, { dashP: true });
    hurtPlayer(w, p, 1, p.x + 30); expect(p.silk).toBe(0);
    run(w, 15); p.inv = 0; const hp = p.hp; hurtPlayer(w, p, 1, p.x + 30); expect(p.hp).toBe(hp - 1);
  });
  it('тайлы не пускают: рывок упирается в стену', () => {
    const { w, p } = mk(); wall(w, 9);
    p.x = 6 * T; p.vx = 0; run(w, 3);
    step(w, { dash: true, right: true }, { dashP: true }); run(w, 14, { right: true });
    expect(p.x + p.w).toBeLessThanOrEqual(9 * T + 0.001);
  });
  it('скорость и длина больше обычного рывка', () => {
    const a = mk({ kit: false }), b = mk();
    for (const q of [a, b]) { step(q.w, { right: true, dash: true }, { dashP: true }); run(q.w, 14, { right: true }); }
    expect(b.p.x - 200).toBeGreaterThan(a.p.x - 200);
  });
  it('след-тень: записи следа помечены s=1', () => {
    const { w, p } = mk(); step(w, { dash: true }, { dashP: true }); run(w, 4);
    expect((p.trail as { s?: number }[]).some((t) => t.s === 1)).toBe(true);
  });
});

describe('воздушная вспышка', () => {
  const DIRS: [number, number, string][] = [[1, 0, '→'], [-1, 0, '←'], [0, -1, '↑'], [0, 1, '↓'], [1, -1, '↗'], [-1, -1, '↖'], [1, 1, '↘'], [-1, 1, '↙']];
  const raw = (dx: number, dy: number): Inp => ({ right: dx > 0, left: dx < 0, up: dy < 0, down: dy > 0 });
  for (const [dx, dy, n] of DIRS) {
    it(`направление ${n}: 90–110 px за 8–10 кадров`, () => {
      const { w, p } = mk(); air(p, 20 * T, 8 * T);
      p.canDash = dy !== 0; // по горизонтали вспышка работает, когда воздушный рывок уже потрачен
      const x0 = p.x, y0 = p.y, ghost: boolean[] = [];
      step(w, { ...raw(dx, dy), dash: true }, { dashP: true }); ghost.push(kitGhost(p));
      let frames = p['fl'] ? 1 : 0;
      for (let i = 0; i < 14; i++) { step(w, raw(dx, dy)); ghost.push(kitGhost(p)); if (p['fl']) frames++; if (!p['fl'] && i > 11) break; }
      expect(p.dashT, 'не обычный рывок').toBeLessThanOrEqual(0);
      const moved = Math.hypot(p.x - x0, p.y - y0 - (frames ? 0 : 0));
      expect(moved).toBeGreaterThan(88); expect(moved).toBeLessThan(135); // после вспышки тянется ещё немного инерции падения
      expect(frames).toBeGreaterThanOrEqual(8); expect(frames).toBeLessThanOrEqual(10);
      expect(Math.sign(Math.round(p.x - x0))).toBe(dx); if (dy < 0) expect(p.y).toBeLessThan(y0);
      expect(ghost.filter(Boolean).length).toBe(KIT.FLASH.GHOST_F); expect(ghost.slice(0, KIT.FLASH.GHOST_F).every(Boolean)).toBe(true);
    });
  }
  it('точная длина по кадрам: 100 px, 9 кадров', () => {
    const { w, p } = mk(); air(p, 20 * T, 8 * T); p.canDash = false;
    const x0 = p.x; step(w, { right: true, dash: true }, { dashP: true });
    let n = 1; while (p['fl'] && n < 20) { step(w, { right: true }); n++; }
    expect(n).toBe(KIT.FLASH.FRAMES); expect(p.x - x0).toBeCloseTo(KIT.FLASH.DIST, 0);
  });
  it('один раз до приземления; после земли — снова', () => {
    const { w, p } = mk(); air(p, 20 * T, 6 * T); p.canDash = false;
    step(w, { right: true, dash: true }, { dashP: true }); run(w, 12);
    expect(p['flUsed']).toBe(true);
    step(w, { left: true, dash: true }, { dashP: true }); expect(p['fl']).toBeFalsy();
    for (let i = 0; i < 90 && !p.onGround; i++) step(w);
    expect(p.onGround).toBe(true); run(w, 2);
    expect(p['flUsed']).toBe(false);
  });
  it('без стрелок и с неистраченным воздушным рывком вспышки нет — работает обычный рывок', () => {
    const { w, p } = mk(); air(p, 20 * T, 6 * T);
    step(w, { dash: true }, { dashP: true });
    expect(p['fl']).toBeFalsy(); expect(p.dashT).toBeGreaterThan(0);
  });
  it('на земле не срабатывает', () => {
    const { w, p } = mk(); step(w, { up: true, dash: true }, { dashP: true });
    expect(p['fl']).toBeFalsy();
  });
  it('тайлы не пускают: вспышка в стену останавливается у стены, потолок — у потолка', () => {
    const { w, p } = mk(); wall(w, 24); air(p, 22 * T, 8 * T); p.canDash = false;
    step(w, { right: true, dash: true }, { dashP: true }); run(w, 10, { right: true });
    expect(p.x + p.w).toBeLessThanOrEqual(24 * T + 0.001);
    const c = mk(); air(c.p, 20 * T, 2 * T); c.p.canDash = true;
    step(c.w, { up: true, dash: true }, { dashP: true }); run(c.w, 10, { up: true });
    expect(c.p.y).toBeGreaterThanOrEqual(T - 0.001); // потолок — ряд 0
  });
  it('вниз: останавливается о землю', () => {
    const { w, p } = mk(); air(p, 20 * T, FLOOR - 26 - 40);
    step(w, { down: true, dash: true }, { dashP: true }); run(w, 10, { down: true });
    expect(p.y + p.h).toBeLessThanOrEqual(FLOOR + 0.001);
  });
  it('отмена уроном', () => {
    const { w, p } = mk(); air(p, 20 * T, 8 * T); p.canDash = false;
    step(w, { right: true, dash: true }, { dashP: true }); step(w, { right: true }); step(w, { right: true });
    p['kgF'] = 0; p.inv = 0; hurtPlayer(w, p, 1, p.x - 30); run(w, 10, { right: true }); // удар даёт зависание кадра (hitstop)
    expect(p['fl']).toBeFalsy(); expect(p.hp).toBe(8);
  });
  it('двойной прыжок не ломается: флаг не тратится, после вспышки прыжок работает', () => {
    const { w, p } = mk(); air(p, 20 * T, 8 * T); p.canDash = false; p['usedDouble'] = false;
    step(w, { right: true, dash: true }, { dashP: true }); run(w, 12, { right: true });
    expect(p['usedDouble']).toBe(false);
    step(w, { right: true, jump: true }, { jumpP: true });
    expect(p['usedDouble']).toBe(true); expect(p.vy).toBeLessThan(0);
  });
  it('планер: во время вспышки не планирует, после неё требуется заново нажать прыжок', () => {
    const { w, p } = mk(); air(p, 20 * T, 4 * T); p.canDash = false; p['usedDouble'] = true; // парус раскрывается после двойного прыжка
    run(w, 6, { jump: true }); // падаем
    step(w, { right: true, dash: true, jump: true }, { dashP: true });
    expect(p['gliding']).toBeFalsy();
    run(w, 14, { right: true, jump: true });
    expect(p['glideOff']).toBe(true); expect(p['gliding']).toBeFalsy(); // прыжок держат с вспышки — паруса нет
    run(w, 2, {}); run(w, 12, { jump: true });
    expect(p['gliding']).toBe(true); // отпустили и нажали снова — парус раскрыт
  });
  it('хват за уступ: во время вспышки хвата нет, а хват сбрасывает «использована»', () => {
    const { w, p } = mk(); for (let x = 20; x <= 23; x++) for (let y = 16; y <= 17; y++) w.grid[y]![x] = SOLID; // блок-уступ, верхняя кромка — y=512
    air(p, 20 * T - p.w - 1, 512 - 8); p.vy = 60; p['flUsed'] = true;
    step(w, { right: true }); step(w, { right: true });
    expect(p['ledge']).toBeTruthy(); step(w, { right: true });
    expect(p['flUsed']).toBe(false);
    // вспышка рядом с уступом хватом не прерывается
    const g = mk(); for (let x = 20; x <= 23; x++) for (let y = 16; y <= 17; y++) g.w.grid[y]![x] = SOLID;
    air(g.p, 20 * T - g.p.w - 1, 512 - 60); g.p.canDash = true;
    step(g.w, { right: true, down: true, dash: true }, { dashP: true });
    for (let i = 0; i < 4; i++) { expect(g.p['ledge'], `кадр ${i}`).toBeFalsy(); step(g.w, { right: true, down: true }); }
  });
  it('стена обновляет вспышку', () => {
    const { w, p } = mk(); wall(w, 24); air(p, 24 * T - p.w - 1, 8 * T); p.canDash = false;
    step(w, { left: true, dash: true }, { dashP: true }); run(w, 12);
    expect(p['flUsed']).toBe(true);
    air(p, 24 * T - p.w - 1, 8 * T); p.vy = 100; p.canDash = false;
    run(w, 3, { right: true });
    expect(p['flUsed']).toBe(false);
  });
});

describe('кристальный рывок', () => {
  it('удержание заряжает 0,5 с (30 кадров), герой замедляется; готовность — событие и звук', () => {
    const { w, p } = mk(); wall(w, 40);
    step(w, { dash: true }, { dashP: true }); // обычный старт рывка (теневой), затем удержание
    let t0 = -1;
    for (let i = 0; i < 80; i++) { step(w, { dash: true }); if (t0 < 0 && (p['kcF'] as number) > 0) t0 = i; if ((p['kcF'] as number) >= fr(KIT.CRYSTAL.CHARGE_T)) break; }
    expect(t0).toBeGreaterThan(0); expect(p['kcF']).toBe(fr(KIT.CRYSTAL.CHARGE_T)); expect(fr(KIT.CRYSTAL.CHARGE_T)).toBe(30);
    const x0 = p.x; run(w, 10, { dash: true, right: true });
    expect(p.x - x0).toBeLessThan(10 * P.RUN / 60 * 0.5);
  });
  it('короткое нажатие не заряжает', () => {
    const { w, p } = mk(); step(w, { dash: true }, { dashP: true }); run(w, 4); run(w, 60);
    expect(p['kcF'] ?? 0).toBe(0); expect(p['cr']).toBeFalsy();
  });
  it('отпустить рано — заряд сгорает без рывка', () => {
    const { w, p } = mk(); p.dashCd = 0;
    run(w, 14, { dash: true }); expect(p['kcF']).toBeGreaterThan(0);
    run(w, 1, {}); expect(p['kcF']).toBe(0); expect(p['cr']).toBeFalsy();
  });
  function charge(w: World, p: Player): void {
    for (let i = 0; i < 120 && !((p['kcF'] as number) >= 30); i++) step(w, { dash: true }, i === 0 ? { dashP: true } : {});
  }
  it('отпускание: суперрывок ≈ 1100 px/с до стены, неуязвим в начале', () => {
    const { w, p } = mk(); wall(w, 38); charge(w, p);
    const ghost: boolean[] = [], xs: number[] = [];
    step(w); ghost.push(kitGhost(p)); xs.push(p.x);
    expect(p['cr']).toBeTruthy();
    for (let i = 0; i < 80 && p['cr']; i++) { step(w); ghost.push(kitGhost(p)); xs.push(p.x); }
    expect(p['cr']).toBeFalsy();
    expect(xs[2]! - xs[1]!).toBeCloseTo(KIT.CRYSTAL.SPD / 60, 0);
    expect(p.x + p.w).toBeGreaterThan(38 * T - 5); expect(p.x + p.w).toBeLessThanOrEqual(38 * T + 0.001);
    expect(ghost.slice(0, KIT.CRYSTAL.GHOST_F).every(Boolean)).toBe(true);
    expect(ghost.filter(Boolean).length).toBe(KIT.CRYSTAL.GHOST_F);
    hurtPlayer(w, p, 1, p.x - 10, false, 'unblockable'); expect(p.hp).toBe(8);
  });
  it('на краю пола останавливается, а не падает', () => {
    const { w, p } = mk(); for (let x = 30; x <= 32; x++) { w.grid[18]![x] = 0; w.grid[19]![x] = 0; }
    charge(w, p); step(w); run(w, 70);
    expect(p['cr']).toBeFalsy(); expect(p.onGround).toBe(true);
    expect(p.x).toBeGreaterThan(30 * T - 20); expect(p.x).toBeLessThan(30 * T);
  });
  it('откат 1 с после рывка: заряд не стартует, потом стартует', () => {
    const { w, p } = mk(); wall(w, 38); charge(w, p); step(w); run(w, 80);
    expect(p['kcCd']).toBeGreaterThan(0);
    run(w, 3); run(w, 20, { dash: true }); expect(p['kcF'] ?? 0).toBe(0);
    run(w, 3); const x0 = p.x; void x0;
    for (let i = 0; i < 90 && !((p['kcF'] as number) > 0); i++) step(w, { dash: true });
    expect(p['kcF']).toBeGreaterThan(0);
  });
  it('отмена заряда прыжком, ударом и уроном', () => {
    for (const how of ['jump', 'atk', 'hurt'] as const) {
      const { w, p } = mk(); charge(w, p); expect(p['kcF'], how).toBeGreaterThan(0);
      if (how === 'jump') step(w, { dash: true, jump: true }, { jumpP: true });
      else if (how === 'atk') step(w, { dash: true, atk: true }, { atkP: true });
      else { p.inv = 0; hurtPlayer(w, p, 1, p.x - 30); run(w, 10, { dash: true }); }
      expect(p['kcF'], how).toBe(0); expect(p['cr'], how).toBeFalsy();
      run(w, 3, { dash: true }); expect(p['kcF'] ?? 0, 'заблокировано до отпускания: ' + how).toBe(0);
    }
  });
  it('отмена суперрывка прыжком даёт инерцию, уроном — обрывает', () => {
    const { w, p } = mk(); charge(w, p); step(w); run(w, 3);
    expect(p['cr']).toBeTruthy(); step(w, { jump: true }, { jumpP: true });
    expect(p['cr']).toBeFalsy(); expect(p.vy).toBeLessThan(0); expect(Math.abs(p.kbx)).toBeGreaterThan(50);
    const q = mk(); charge(q.w, q.p); step(q.w); run(q.w, 20); q.p['kgF'] = 0; q.p.inv = 0; hurtPlayer(q.w, q.p, 1, q.p.x - 30); run(q.w, 10);
    expect(q.p['cr']).toBeFalsy(); expect(q.p.hp).toBe(8);
  });
  it('направление при отпускании задаёт сторону', () => {
    const { w, p } = mk(); p.face = 1; charge(w, p);
    const x0 = p.x; step(w, { left: true }); expect(p.face).toBe(-1); run(w, 4, {}); expect(p.x).toBeLessThan(x0 - 40);
  });
});

describe('нитяные заклинания', () => {
  function cast(w: World, p: Player, id: string): void { applyLoadout(w, { ...defaultLoadout(), tool: id }); p.silk = 9; p['toolCd'] = 0; step(w, {}, { toolP: true }); }
  const boss = (w: World): Boss => { const v = w.vladik!; v.state = 'recover'; v.t = 99; return v; };
  it('записи реестра: нить, перезарядка, unlock как у остальных, DPS в пределах ±25 % от иглы', () => {
    for (const id of ['spirit', 'dive', 'wraith']) {
      const t = TOOLS[id]!;
      expect(t.cost).toBeGreaterThan(0); expect(t.cd).toBe(spellCd(id)); expect(/^(shop:\d+|boss:\w+)$/.test(t.unlock)).toBe(true);
      const dps = spellDamage(id) / Math.max(t.cd, 0.1);
      expect(dps, id).toBeGreaterThanOrEqual(KIT.NEEDLE_DPS * 0.75); expect(dps, id).toBeLessThanOrEqual(KIT.NEEDLE_DPS * 1.25);
    }
  });
  it('«Нитяной снаряд»: тратит нить, летит, бьёт босса на 3, не бьёт сквозь стену', () => {
    const { w, p } = mk(); p.face = 1; const v = boss(w); v.x = p.x + 200; v.y = FLOOR - v.h; v.hp = v.maxHp;
    const h0 = v.hp; cast(w, p, 'spirit');
    expect(p.silk).toBe(9 - KIT.SPIRIT.COST); expect((w.tl as { kind: string }[]).some((q) => q.kind === 'tspirit')).toBe(true);
    run(w, 40); expect(h0 - v.hp).toBeGreaterThanOrEqual(KIT.SPIRIT.DMG);
    expect((w.tl as { kind: string }[]).some((q) => q.kind === 'tspirit')).toBe(false);
    const g = mk(); wall(g.w, 10); g.p.face = 1; cast(g.w, g.p, 'spirit'); run(g.w, 30);
    expect((g.w.tl as { kind: string }[]).length).toBe(0);
  });
  it('«Нитяной снаряд»: слабого врага пробивает насквозь, крепкого останавливает', () => {
    const { w, p } = mk(); p.face = 1;
    const mkE = (hp: number, x: number): void => { w.enemies.push({ type: 'gnat', x, y: p.y, w: 20, h: 20, vx: 0, vy: 0, face: -1, flash: 0, kbT: 0, kbx: 0, kby: 0, dead: false, t: 0, hp, beads: 0 } as never); };
    w.enemies = []; mkE(1, p.x + 120); mkE(20, p.x + 220);
    cast(w, p, 'spirit'); run(w, 30);
    expect(w.enemies[0]!.dead).toBe(true); expect(w.enemies[1]!.hp).toBe(20 - KIT.SPIRIT.DMG);
  });
  it('«Вопль»: столб вверх, несколько ударов по боссу и сбитые снаряды (кроме unblockable)', () => {
    const { w, p } = mk(); const v = boss(w); v.x = p.x - 10; v.y = p.y - 100; v.hp = v.maxHp; const h0 = v.hp;
    w.projs.push({ kind: 'note', x: p.x, y: p.y - 60, w: 14, h: 18, vx: 0, vy: 0, life: 9 } as never, { kind: 'wave', x: p.x, y: p.y - 150, w: 14, h: 18, vx: 0, vy: 0, life: 9, hk: 'unblockable' } as never);
    cast(w, p, 'wraith'); run(w, 40);
    expect(h0 - v.hp).toBeGreaterThanOrEqual(2); expect(h0 - v.hp).toBeLessThanOrEqual(KIT.WRAITH.PULSES * KIT.WRAITH.DMG);
    expect(w.projs.find((q) => q.kind === 'note')).toBeUndefined();
    expect(w.projs.find((q) => q.kind === 'wave')).toBeTruthy();
  });
  it('«Нырок»: в воздухе падение с неуязвимостью, волна при приземлении бьёт босса и врагов рядом', () => {
    const { w, p } = mk(); const v = boss(w); v.x = p.x + 40; v.y = FLOOR - v.h; v.hp = v.maxHp; const h0 = v.hp;
    air(p, 200, 8 * T);
    cast(w, p, 'dive'); expect(p['dv']).toBeTruthy(); expect(p.silk).toBe(9 - KIT.DIVE.COST);
    let n = 0; while (p['dv'] && n < 120) { step(w); n++; expect(kitGhost(p) || !p['dv']).toBe(true); }
    expect(p.onGround).toBe(true); expect(h0 - v.hp).toBeGreaterThanOrEqual(KIT.DIVE.LAND_DMG);
    expect(w.tfx.some((f) => f['f'] === 'shock')).toBe(true);
  });
  it('«Нырок»: падение неуязвимо к касанию, но не к шипам; с земли бьёт сразу', () => {
    const { w, p } = mk(); air(p, 200, 8 * T); cast(w, p, 'dive'); step(w); const hp0 = p.hp;
    p.inv = 0; hurtPlayer(w, p, 1, p.x + 5); expect(p.hp).toBe(hp0);
    const g = mk(); const v = boss(g.w); v.x = g.p.x + 30; v.y = FLOOR - v.h; v.hp = v.maxHp; cast(g.w, g.p, 'dive');
    expect(g.p['dv']).toBeFalsy(); expect(v.hp).toBeLessThan(v.maxHp);
  });
  it('кнопка инструмента: без нити заклинание не срабатывает', () => {
    const { w, p } = mk(); applyLoadout(w, { ...defaultLoadout(), tool: 'spirit' }); p.silk = 1; step(w, {}, { toolP: true });
    expect(w.tl.length).toBe(0); expect(p.silk).toBe(1);
  });
});

describe('детерминизм и старые записи', () => {
  const script = (w: World): void => {
    const seq: [Inp, Inp][] = [];
    for (let i = 0; i < 400; i++) {
      const r: Inp = { right: i % 150 < 90, left: i % 150 >= 100, jump: i % 37 < 14, dash: i % 53 < 40, up: i % 91 > 70, down: i % 111 > 95, atk: i % 29 === 0 };
      const e: Inp = { dashP: i % 53 === 0 || i % 71 === 0, jumpP: i % 37 === 0, atkP: i % 29 === 0, toolP: i % 120 === 60 };
      seq.push([r, e]);
    }
    const p = w.players[0]!; applyLoadout(w, { ...defaultLoadout(), tool: 'spirit' });
    for (const [r, e] of seq) { p.silk = Math.max(p.silk, 3); step(w, r, e); }
  };
  it('два мира с одним зерном и вводом дают один хэш (приёмы открыты)', () => {
    const a = mk({ seed: 11 }), b = mk({ seed: 11 });
    script(a.w); script(b.w);
    expect(hashFor(a.w, 2)).toBe(hashFor(b.w, 2));
  });
  it('закрытые приёмы не меняют мир: хэш без флага kit равен хэшу мира, где kit не задан вовсе', () => {
    const a = mk({ seed: 11, kit: false }), b = (() => { const w = new World({ seed: 11, mode: 'bosstest', boss: 'vladik', loadoutSave: normalizeSave(null) }); w.vladik!.state = 'sleep'; w.vladik!.x = -400; w.curtains = []; for (let i = 0; i < 20; i++) w.tick(); const p = w.players[0]!; p.inv = 0; p.hp = p.maxHp = 9; p.silk = 0; return { w, p }; })();
    script(a.w); script(b.w);
    expect(hashFor(a.w, 2)).toBe(hashFor(b.w, 2));
    expect(a.p['kgF'] ?? 0).toBe(0);
  });
  it('открытые приёмы меняют ход (флаг действительно включает)', () => {
    const a = mk({ seed: 11, kit: false }), b = mk({ seed: 11, kit: true });
    script(a.w); script(b.w);
    expect(hashFor(a.w, 2)).not.toBe(hashFor(b.w, 2));
  });
});

describe('сеть, журнал и бот', () => {
  it('поза приёма уходит напарнику: вспышка, неуязвимость и заряд видны, хост учитывает неуязвимость гостя', () => {
    const a = mk(), b = mk({ kit: false });
    const q = b.w.players[0]!; q.remote = true;
    air(a.p, 20 * T, 8 * T); a.p.canDash = false;
    step(a.w, { right: true, dash: true }, { dashP: true });
    const m = packPlayer(a.w, a.p); expect(m['ks']).toBe(2); expect(m['kg']).toBeGreaterThan(0);
    applyPlayer(b.w, { ...m, i: 0 });
    expect(q['fl']).toBeTruthy(); expect(kitGhost(q)).toBe(true);
    q.inv = 0; const hp = q.hp; hurtPlayer(b.w, q, 1, q.x + 20); expect(q.hp).toBe(hp);
    const idle = mk({ kit: false }); expect(packPlayer(idle.w, idle.p)['ks']).toBeUndefined(); // без приёмов поле не отправляется
  });
  it('журнал помнит флаг kit; без флага записи не меняются', () => {
    const on = mk(), off = mk({ kit: false });
    const r1 = Recorder.start({ cat: null, seed: 1, ver: 't', mem: true }), r2 = Recorder.start({ cat: null, seed: 1, ver: 't', mem: true });
    r1.begin(on.w); r2.begin(off.w);
    expect(r1.seg!.data.kit).toBe(true); expect('kit' in r2.seg!.data).toBe(false);
  });
  it('партия с открытыми приёмами воспроизводится по журналу в тот же исход (флаг kit лежит в записи)', () => {
    const ses = new Session({ easy: false, loadoutSave: normalizeSave(null), progress: null, ver: 't', clock: () => 0, fx: false, kit: true }, { seed: 9, mode: 'bosstest', boss: 'vladik', players: 1, camp: null });
    const rec = new SessionRecorder(ses, { ver: 't', easy: false });
    for (let i = 0; i < 600; i++) {
      const f = emptyFrame();
      f.buttons.right = i % 200 < 120; f.buttons.dash = i % 90 < 50; f.buttons.jump = i % 61 < 20;
      if (i % 90 === 0) f.edges.dashP = true; if (i % 61 === 0) f.edges.jumpP = true;
      ses.frame(1000 / 60, [f]);
    }
    expect(rec.journal.segs[0]!.data.kit).toBe(true);
    const r = replayJournal(rec.journal, { loadoutSave: ses.cfg.loadoutSave, progress: null });
    if (!r.ok) throw new Error(r.why);
    expect(JSON.parse(JSON.stringify(outcome(r.world)))).toEqual(JSON.parse(JSON.stringify(outcome(ses.world))));
    expect(kitHas(r.world, r.world.players[0]!, 'shadow')).toBe(true);
  });
  it('бот играет без ошибок с приёмами и без; без kit результат прежний', () => {
    const base = { boss: 'vladik' as const, skill: 0.95, players: 1, seed: 3, maxSec: 6 };
    const a = runFight({ ...base }), c = runFight({ ...base, kit: true });
    expect(a.error).toBeUndefined(); expect(c.error).toBeUndefined();
    expect(a.ticks).toBeGreaterThan(0); expect(c.ticks).toBeGreaterThan(0);
  }, 60_000);
});
