// Кооператив по сети: хост и гость в одном процессе, связь — фальшивая сеть с задержкой и потерями, время виртуальное.
import { describe, expect, it } from 'vitest';
import { freshCamp, go as campaignGo } from '../../src/core/campaign';
import { emptyFrame, type InputFrame } from '../../src/core/input';
import { normalizeSave } from '../../src/core/loadout';
import { Session, type SessionCfg } from '../../src/core/session';
import { CoopGuest, CoopHost, type CoopStart } from '../../src/net/coop';
import { FakeNet, Sim } from './helpers/fakenet';

const VER = 'test';
const cfgOf = (sim: Sim, online: 'host' | 'guest'): SessionCfg => ({ easy: false, loadoutSave: normalizeSave(null), progress: null, ver: VER, clock: () => sim.t, fx: true, online });
const press = (...b: ('left' | 'right' | 'jump' | 'atk' | 'up')[]): InputFrame => { const f = emptyFrame(); for (const k of b) { f.buttons[k] = true; if (k === 'jump') f.edges.jumpP = true; if (k === 'atk') f.edges.atkP = true; if (k === 'up') f.edges.upP = true; } return f; };

interface Pair { sim: Sim; net: FakeNet; host: CoopHost; guest: CoopGuest; hs: () => Session; gs: () => Session; step(ms: number, hi?: InputFrame, gi?: InputFrame): void }
function mkPair(opts: { lat?: number; loss?: number; start?: Partial<CoopStart> } = {}): Pair {
  const sim = new Sim(), net = new FakeNet(sim, opts.lat ?? 40); net.lossRate = opts.loss ?? 0;
  const start: CoopStart = { mode: 'story', camp: freshCamp(), seed: 777, ...opts.start };
  const host: CoopHost = new CoopHost({ transport: net.transport('org'), env: sim.env(), ver: VER, code: 'ABCDE',
    onGuest: () => { const s = new Session(cfgOf(sim, 'host'), { seed: start.seed, mode: start.mode, boss: start.boss, players: 2, camp: start.camp }); host.attach(s, start); },
    onRejoin: () => { host.ses!.rejoinPair(); host.attach(host.ses!, { ...start, camp: host.ses!.world.camp, rev: 1 }); } });
  const guest: CoopGuest = new CoopGuest({ transport: net.transport('g'), env: sim.env(), code: 'ABCDE', ver: VER,
    onStart: (st) => { const s = new Session(cfgOf(sim, 'guest'), { seed: st.seed, mode: st.mode, boss: st.boss, players: 2, camp: st.camp }); guest.attach(s); } });
  host.open(); sim.run(100); guest.start(); sim.run(1000);
  const pair: Pair = { sim, net, host, guest, hs: () => host.ses!, gs: () => guest.ses!,
    step(ms, hi = emptyFrame(), gi = emptyFrame()) {
      for (let t = 0; t < ms; t += 1000 / 60) { sim.run(1000 / 60); host.ses?.frame(1000 / 60, [hi]); guest.ses?.frame(1000 / 60, [gi]); }
    } };
  return pair;
}

describe('кооператив: хост и гость', () => {
  it('гость подключается по коду, получает ту же партию, видит напарника и врагов', () => {
    const p = mkPair();
    expect(p.host.ses).not.toBeNull(); expect(p.guest.ses).not.toBeNull();
    p.step(600);
    const hw = p.hs().world, gw = p.gs().world;
    expect(hw.online).toBe('host'); expect(gw.online).toBe('guest');
    expect(hw.players.map((x) => !!x.remote)).toEqual([false, true]); expect(gw.players.map((x) => !!x.remote)).toEqual([true, false]);
    expect(gw.enemies.length).toBe(hw.enemies.length);
    expect(gw.L.W).toBe(hw.L.W);
  });

  it('движение: каждый ведёт своего героя, напарник видит его на том же месте', () => {
    const p = mkPair();
    p.step(800);
    const hx0 = p.hs().world.players[0]!.x, gx0 = p.gs().world.players[1]!.x;
    p.step(1500, press('right'), press('left'));
    const hw = p.hs().world, gw = p.gs().world;
    expect(hw.players[0]!.x).toBeGreaterThan(hx0 + 80);
    expect(gw.players[1]!.x).toBeLessThan(gx0 - 80);
    // напарник на экране совпадает с оригиналом (допуск на задержку и сглаживание)
    expect(Math.abs(gw.players[0]!.x - hw.players[0]!.x)).toBeLessThan(90);
    expect(Math.abs(hw.players[1]!.x - gw.players[1]!.x)).toBeLessThan(90);
  });

  it('снимок: враги и бусины у гостя совпадают с хостом, бусины общие', () => {
    const p = mkPair();
    p.step(500);
    const hw = p.hs().world, gw = p.gs().world;
    hw.beads = 7; hw.enemies[0]!.x += 5;
    p.step(500);
    expect(gw.beads).toBe(7);
    expect(Math.abs(gw.enemies[0]!.x - hw.enemies[0]!.x)).toBeLessThan(25);
  });

  it('при потерях 5 % и задержке 120 мс партия идёт без исключений', () => {
    const p = mkPair({ lat: 120, loss: 0.05 });
    p.step(8000, press('right'), press('right', 'jump'));
    expect(p.gs().world.players.length).toBe(2);
    expect(p.hs().world.tickN).toBeGreaterThan(300);
  });

  it('урон: гостя ранит враг на его экране, хост видит его здоровье; бусины общие', () => {
    const p = mkPair();
    p.step(600);
    const gw = p.gs().world, hw = p.hs().world, g = gw.players[1]!, e = gw.enemies.find((x) => !x.dead)!;
    g.x = e.x; g.y = e.y - 4; g.inv = 0;
    const hp0 = g.hp;
    p.step(300);
    expect(g.hp).toBeLessThan(hp0);
    p.step(300);
    expect(hw.players[1]!.hp).toBe(g.hp);
  });

  it('кокон: упавший гость поднимается напарником, нить рвётся у обоих, когда упали оба', () => {
    const p = mkPair();
    p.step(600);
    const hw = p.hs().world, gw = p.gs().world;
    // гость падает, хост рядом держит «вверх» — гость встаёт
    gw.players[1]!.hp = 1; gw.players[1]!.inv = 0;
    // удар по гостю на его стороне
    const e = gw.enemies.find((x) => !x.dead)!; gw.players[1]!.x = e.x; gw.players[1]!.y = e.y - 4;
    p.step(400);
    expect(gw.players[1]!.downed).toBe(true);
    // хост у кокона
    hw.players[0]!.x = hw.players[1]!.x; hw.players[0]!.y = hw.players[1]!.y;
    p.step(2500, press('up'));
    expect(gw.players[1]!.downed).toBe(false);
    // оба падают: обрыв нити у обоих и возрождение
    for (const q of [hw.players[0]!, gw.players[1]!]) { q.hp = 1; q.inv = 0; }
    const he = hw.enemies.find((x) => !x.dead)!; hw.players[0]!.x = he.x; hw.players[0]!.y = he.y - 4;
    gw.players[1]!.x = e.x; gw.players[1]!.y = e.y - 4;
    p.step(4000);
    expect(hw.deaths).toBeGreaterThanOrEqual(1);
    expect(gw.players[1]!.downed).toBe(false); expect(hw.players[0]!.downed).toBe(false);
    expect(hw.players[0]!.hp).toBeGreaterThan(1);
  });

  it('переход главы: обе стороны попадают в следующую сцену', () => {
    const p = mkPair();
    p.step(300);
    const hw = p.hs().world;
    const next = { ...hw.camp!, ch: 2, st: 'road' as const };
    campaignGo(hw, next);
    p.step(3000);
    expect(p.hs().scenes).toBe(2); expect(p.gs().scenes).toBe(2);
    expect(p.gs().world.camp!.ch).toBe(2); expect(p.hs().world.camp!.ch).toBe(2);
    expect(p.gs().world.online).toBe('guest'); expect(p.hs().world.players.map((x) => !!x.remote)).toEqual([false, true]);
  });

  it('обрыв связи: гость возвращается в ту же партию без перезапуска', () => {
    const p = mkPair();
    p.step(500);
    const w0 = p.gs().world; p.net.cut('g');
    p.step(5000); p.net.heal('g'); p.step(10000);
    expect(p.guest.client.status).toBe('online');
    expect(p.gs().world).toBe(w0); expect(p.hs().world.online).toBe('host');
  });

  it('гость ушёл насовсем: хост играет один, а в коконе никто не остаётся', () => {
    const p = mkPair();
    p.step(500);
    const hw = p.hs().world;
    hw.players[0]!.downed = true; hw.players[0]!.hp = 0;
    p.guest.stop(true);
    p.step(30000);
    expect(hw.online).toBeNull(); expect(hw.players.length).toBe(1);
    expect(hw.wiping || hw.deaths >= 1 || !hw.players[0]!.downed).toBe(true);
  });

  it('гость вернулся, пока хост играл один: сцена перезапускается парой', () => {
    const p = mkPair();
    p.step(500);
    p.guest.stop(true); p.step(30000);
    expect(p.hs().world.online).toBeNull();
    const g2 = new CoopGuest({ transport: p.net.transport('g'), env: p.sim.env(), code: 'ABCDE', ver: VER, key: p.guest.client.key,
      onStart: (st) => { const s = new Session(cfgOf(p.sim, 'guest'), { seed: st.seed, mode: st.mode, boss: st.boss, players: 2, camp: st.camp }); g2.attach(s); } });
    g2.start(); p.sim.run(3000);
    p.hs().frame(16, [emptyFrame()]);
    expect(p.hs().world.online).toBe('host'); expect(p.hs().world.nPlayers).toBe(2);
    expect(g2.ses).not.toBeNull();
  });

  it('хост исчез: гость узнаёт об этом и выходит', () => {
    const p = mkPair();
    p.step(500);
    let lost = 0; (p.guest as unknown as { o: { onHostLost?: () => void } }).o.onHostLost = () => { lost++; };
    p.host.close(); p.step(30000);
    expect(lost).toBe(1);
  });

  // ----- ошибки аудита v1.5, не должны вернуться -----
  it('аудит v1.5: способность с предмета получают оба героя (хост подобрал — гость тоже)', () => {
    const p = mkPair();
    p.step(400);
    const hw = p.hs().world, gw = p.gs().world, it = hw.items.find((x) => x['ability'] === 'double')!;
    expect(it).toBeTruthy(); expect(gw.items.length).toBe(hw.items.length);
    const hero = hw.players[0]!; hero.x = (it['px'] as number) - 7; hero.y = (it['py'] as number) - 13;
    p.step(1200);
    expect(hw.abil['double']).toBe(true); expect(gw.abil['double']).toBe(true);
    expect(gw.items.some((x) => x['ability'] === 'double')).toBe(false);
  });

  it('аудит v1.5: отбив гостя копит стойкость босса у хоста', () => {
    const p = mkPair({ start: { mode: 'bosstest', boss: 'vladik', camp: null } });
    p.step(600);
    const hw = p.hs().world, gw = p.gs().world, b = hw.vladik!;
    // гость рядом с боссом отбивает: событие parrypoise доходит до хоста
    gw.players[1]!.x = b.x - 10; gw.players[1]!.y = b.y; gw.players[1]!.parryT = 0.2; gw.players[1]!.inv = 0;
    b.state = 'idle'; b['poiseImmune'] = 0; const before = b['poise'] || 0;
    gw.sendEv({ k: 'parrypoise', x: b.x + b.w / 2, y: b.y + b.h / 2 });
    p.step(500);
    expect(b['poise'] || 0).toBeGreaterThan(before);
  });

  it('аудит v1.5: хост не получает «зависание кадра» от ударов гостя', () => {
    const p = mkPair();
    p.step(500);
    const hw = p.hs().world, g = hw.players[1]!, e = hw.enemies.find((x) => !x.dead)!;
    g.x = e.x - 20; g.y = e.y; g.atkDir = 'f'; g.face = 1; g.atkT = 0.2; g.atkHits = new Set();
    hw.hitstop = 0;
    for (let i = 0; i < 6; i++) hw.tick();
    expect(hw.hitstop).toBe(0); // удар удалённого героя не вызывает hitstop у хоста
  });
});
