// Волна 0, отрисовка без браузера: универсальные рисовальщики арены, тела босса (включая летающее и неподвижное с уязвимыми точками) и существ
// вызываются на живом мире с «пустым» Graphics — любое обращение к несуществующему полю или неверный тип выдаст ошибку, цвета и контуры проверяются по вызовам.
import { describe, expect, it } from 'vitest';
import { dstate, forceChain } from '../../src/core/boss/exec';
import { spawnCreature } from '../../src/core/boss/minions';
import { registerBoss } from '../../src/core/boss/registry';
import { enterPhase } from '../../src/core/boss/exec';
import { World } from '../../src/core/world';
import { drawArena } from '../../src/view/draw/arena';
import { drawDataBoss } from '../../src/view/draw/bosses';
import { drawEnemy } from '../../src/view/draw/enemies';
import { arenaBoss, morphBoss, stillBoss, type Raw } from '../fixtures/bosses';

/** Graphics, записывающий вызовы: g.log — [метод, аргументы] */
function fakeG(): { g: never; log: [string, unknown[]][] } {
  const log: [string, unknown[]][] = [];
  const g = new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => { log.push([name, a]); return g; } });
  return { g: g as never, log };
}
const world = (raw: Raw): World => { registerBoss(raw); return new World({ seed: 1, mode: 'bosstest', boss: raw['id'] as string, players: 1, fx: true }); };
const far = (w: World): void => { const p = w.players[0]!; p.x = 40; p.y = 18 * 32 - p.h; p.hp = p.maxHp = 999; w.hitstop = 0; };
const tickN = (w: World, n: number): void => { for (let i = 0; i < n; i++) { far(w); w.tick(); } };
const colors = (log: [string, unknown[]][]): number[] => log.filter(([m]) => m === 'lineStyle' || m === 'fillStyle').map(([m, a]) => (m === 'lineStyle' ? a[1] : a[0]) as number);

describe('универсальная отрисовка волны 0', () => {
  it('арена: платформы, предупреждение, луч в замахе и в ударе, точка появления — рисуются; цвет луча по типу удара', () => {
    const w = world(arenaBoss('fx_dw1')); tickN(w, 5);
    const a = fakeG(); drawArena(w, a.g, 1); // предупреждение показа платформы (пунктир)
    expect(a.log.length).toBeGreaterThan(0);
    tickN(w, 40); const b = fakeG(); drawArena(w, b.g, 1);
    expect(b.log.some(([m]) => m === 'fillRect')).toBe(true); // платформа видна
    forceChain(w, 0, 'c_beam'); tickN(w, 10);
    const tell = fakeG(); drawArena(w, tell.g, 1);
    expect(colors(tell.log)).toContain(0xff4a3a); // красный: dodge
    tickN(w, 40); const act = fakeG(); drawArena(w, act.g, 1);
    expect(colors(act.log)).toContain(0xff4a3a);
    forceChain(w, 0, 'c_zap'); tickN(w, 45); const zap = fakeG(); drawArena(w, zap.g, 1);
    expect(colors(zap.log)).toContain(0xb877ff); // фиолетовый: unblockable
    expect(() => { for (let i = 0; i < 300; i++) { tickN(w, 1); drawArena(w, fakeG().g, i / 10); } }).not.toThrow();
  });

  it('босс: тело-манекен рисуется в покое, замахе и ударе; летающее тело отбрасывает тень; превращённое тело другого размера', () => {
    const w = world(morphBoss('fx_dw2')); tickN(w, 5);
    const b = w.bosses[0]!;
    expect(() => { for (let i = 0; i < 400; i++) { tickN(w, 1); drawDataBoss(w, b, fakeG().g, i / 10); } }).not.toThrow();
    enterPhase(w, 0, 2); for (let i = 0; i < 220; i++) tickN(w, 1);
    expect(dstate(b).formPh).toBe(2);
    const f = fakeG(); drawDataBoss(w, b, f.log.length ? f.g : f.g, 1);
    expect(f.log.some(([m, a]) => m === 'fillEllipse' && (a[3] as number) === 8)).toBe(true); // тень на полу
    expect(() => { for (let i = 0; i < 800; i++) { tickN(w, 1); drawDataBoss(w, b, fakeG().g, i / 10); } }).not.toThrow();
  });

  it('неподвижный босс с точками: открытая точка светится, закрытая перечёркнута; существа рисуются общим видом', () => {
    const w = world(stillBoss('fx_dw3')); tickN(w, 5);
    const b = w.bosses[0]!;
    const closed = fakeG(); drawDataBoss(w, b, closed.g, 1);
    expect(colors(closed.log)).toContain(0x6c7480);
    forceChain(w, 0, 'c_sweep'); let guard = 0; while (b.state !== 'recover' && guard++ < 300) tickN(w, 1);
    const open = fakeG(); drawDataBoss(w, b, open.g, 1);
    expect(colors(open.log)).toContain(0xe8ff9a);
    spawnCreature(w, 0, 'wisp', 500, 18 * 32 - 60); tickN(w, 3);
    const e = w.enemies.find((x) => x['m'])!, m = fakeG();
    drawEnemy(e, m.g, 1); expect(m.log.some(([n]) => n === 'fillEllipse')).toBe(true);
    (e['m'] as { fading: boolean }).fading = true; expect(() => drawEnemy(e, fakeG().g, 2)).not.toThrow();
  });
});
