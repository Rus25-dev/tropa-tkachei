// Гонка 1×1 по сети из меню «Спидран»: комната, готовность, общее зерно, отсчёт, «пошёл», прогресс соперника, итог, потеря соперника.
import { describe, expect, it } from 'vitest';
import { Duel, type DuelHooks } from '../../src/net/duel';
import { FakeNet, Sim } from './helpers/fakenet';

interface Side { duel: Duel; log: string[]; started: { cat: string; seed: number } | null; goAt: number | null; counts: string[] }
function mk(sim: Sim, net: FakeNet, role: 'host' | 'guest', code?: string, ver = '2.0-test'): Side {
  const s: Side = { duel: null as unknown as Duel, log: [], started: null, goAt: null, counts: [] };
  const hooks: DuelHooks = {
    onStart: (p) => { s.started = p; s.log.push('start'); sim.env().setTimeout(() => s.duel.sceneReady(), 250); },
    onCount: (t) => s.counts.push(t), onGo: () => { s.goAt = sim.t; s.log.push('go'); }, onLostBeforeGo: () => s.log.push('lostBeforeGo'), changed: () => undefined,
  };
  s.duel = new Duel({ role, transport: net.transport(role), env: sim.env(), version: ver, code, cat: 'trail', hooks, key: 'K' + role, newSeed: () => 777 });
  return s;
}
function pair(): { sim: Sim; net: FakeNet; h: Side; g: Side } {
  const sim = new Sim(), net = new FakeNet(sim, 40), h = mk(sim, net, 'host');
  h.duel.open(); sim.run(200);
  const g = mk(sim, net, 'guest', h.duel.code); g.duel.open(); sim.run(1500);
  return { sim, net, h, g };
}

describe('гонка 1×1', () => {
  it('комната → готовность → общее зерно → отсчёт 3-2-1 → «пошёл» почти одновременно', () => {
    const { sim, h, g } = pair();
    expect(h.duel.code).toMatch(/^[A-Z0-9]{5}$/); expect(g.duel.status).toBe('online'); expect(g.duel.peerVer).toBe('2.0-test');
    h.duel.toggleReady(); sim.run(300); expect(h.duel.state).toBe('room'); expect(g.duel.opp).toBe(true);
    g.duel.toggleReady(); sim.run(5000);
    expect(h.started).toEqual({ cat: 'trail', seed: 777 }); expect(g.started).toEqual({ cat: 'trail', seed: 777 });
    expect(h.counts).toEqual(['Ждём соперника…', '3', '2', '1']); expect(g.counts).toEqual(['Ждём соперника…', '3', '2', '1']);
    expect(h.goAt).not.toBeNull(); expect(g.goAt).not.toBeNull(); expect(Math.abs(h.goAt! - g.goAt!)).toBeLessThan(150);
    expect(h.duel.state).toBe('run'); expect(g.duel.state).toBe('run');
  });

  it('категорию выбирает хост и сбрасывает готовность; гость не может', () => {
    const { sim, h, g } = pair();
    h.duel.toggleReady(); sim.run(300);
    h.duel.setCat('boss'); sim.run(300);
    expect(g.duel.cat).toBe('boss'); expect(h.duel.me || h.duel.opp || g.duel.me || g.duel.opp).toBe(false);
    g.duel.setCat('trail'); sim.run(300); expect(h.duel.cat).toBe('boss');
  });

  it('прогресс соперника, подпись «впереди/позади» и баннеры итога', () => {
    const { sim, h, g } = pair();
    h.duel.toggleReady(); g.duel.toggleReady(); sim.run(6000);
    for (let i = 0; i < 10; i++) { h.duel.progress({ c: 1, s: 'level', x: 100 + i, y: 0, f: 1, g: 1, vx: 0, vy: 0, d: 0, el: 5000 + i * 100, sp: [], dn: 0 }); g.duel.progress({ c: 2, s: 'road', x: 5, y: 5, f: 1, g: 1, vx: 0, vy: 0, d: 0, el: 9000, sp: [4000], dn: 0 }); sim.run(120); }
    expect(g.duel.oppProg!.x).toBeGreaterThan(100); expect(h.duel.oppProg!.c).toBe(2);
    const rv = h.duel.rival({ cat: 'trail', t0: 1, splits: [] }, 6000);
    expect(rv.text).toMatch(/Глава II/); expect(rv.text).toMatch(/впереди/);
    h.duel.finish({ rta: 120000, igt: 119000, deaths: 2 }); sim.run(300);
    expect(g.duel.oppFin!.rta).toBe(120000);
    expect(g.duel.banner(130000).text).toBe('ПОБЕДА'.replace('ПОБЕДА', 'ПОРАЖЕНИЕ')); // соперник пришёл раньше
    expect(g.duel.banner(110000).text).toBe('ПОБЕДА'); expect(g.duel.banner(120005).text).toBe('НИЧЬЯ');
  });

  it('чужая версия отклоняется; третий в комнату не входит', () => {
    const sim = new Sim(), net = new FakeNet(sim, 40), h = mk(sim, net, 'host'); h.duel.open(); sim.run(200);
    const old = mk(sim, net, 'guest', h.duel.code, '1.8'); old.duel.open(); sim.run(3000);
    expect(old.duel.denied).toMatch(/версия/);
    const g = mk(sim, net, 'guest', h.duel.code); g.duel.open(); sim.run(2000); expect(g.duel.status).toBe('online');
    const g2 = mk(sim, net, 'guest', h.duel.code); (g2.duel as unknown as { o: { key: string } }).o.key = 'K2'; g2.duel.open(); sim.run(3000);
    expect(g2.duel.denied).toMatch(/уже есть соперник/);
  });

  it('соперник ушёл: «связь потеряна», до «пошёл» игрок не стоит вечно', () => {
    const { sim, h, g } = pair();
    h.duel.toggleReady(); g.duel.toggleReady(); sim.run(600); // загрузка идёт
    g.duel.leave(); sim.run(1000);
    expect(h.duel.lost).toBe(true); expect(h.log).toContain('lostBeforeGo');
    expect(h.duel.rival({ cat: 'trail', t0: null, splits: [] }, 0).text).toMatch(/потеряна/);
    expect(h.duel.banner(1000).text).toBe('Связь потеряна');
  });

  it('обрыв сети соперника короче 9 с не считается потерей', () => {
    const { sim, net, h, g } = pair();
    net.cut('guest'); sim.run(5000); net.heal('guest'); sim.run(15000);
    expect(h.duel.lost).toBe(false); expect(g.duel.lost).toBe(false); expect(g.duel.status).toBe('online');
  });
});
