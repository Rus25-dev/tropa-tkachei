// «Дуэль ткачей» в комнате: организатор + два игрока + обсерверы на виртуальной сети. Серия Bo1/Bo3/Bo5, бан/пик, раунды, архив, Эло,
// сценарии: оба погибли, обрыв связи посреди раунда, перезагрузка организатора, отказ третьему игроку, ничья, сдача, присуждение.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { BOSS_INFO, planRound, vetoNow, type DuelBoss, type SeriesFmt } from '../../src/core/duel';
import { computeElo } from '../../src/core/elo';
import { chaseLead, fracAt, phaseRows } from '../../src/net/raceduel';
import { parseRaces } from '../../src/net/racesfile';
import { racesJson } from '../../src/net/racecommon';
import { peerId } from '../../src/net/types';
import { duelFinish, duelTel, mkRoom, type Room } from './helpers/racekit';

type P = ReturnType<Room['player']>;
interface L { room: Room; p: Record<number, P>; w1: ReturnType<Room['watcher']>; w2: ReturnType<Room['watcher']>; code: string }

/** комната дуэли: два игрока и два обсервера в ожидании */
function lobby(cfg: { fmt?: SeriesFmt; fixed?: any[]; random?: boolean } = {}): L {
  const room = mkRoom(), { sim, org } = room;
  org.create(); sim.run(200); org.setDisc('duel'); org.setDuelCfg({ fmt: cfg.fmt ?? 3, fixed: cfg.fixed ?? [], random: cfg.random ?? false });
  const code = org.S!.code, p1 = room.player('Ива', 'p1'), p2 = room.player('Ярь', 'p2'), w1 = room.watcher('w1'), w2 = room.watcher('w2');
  p1.play.join(code, 'Ива'); p2.play.join(code, 'Ярь'); w1.join(code); w2.join(code); sim.run(2000);
  return { room, p: { 1: p1, 2: p2 }, w1, w2, code };
}
const ready = (l: L): void => { l.p[1]!.play.toggleReady(); l.p[2]!.play.toggleReady(); l.room.sim.run(500); };
/** бан/пик: каждый ход делает тот, чья очередь; boss — по списку, иначе первый свободный */
function doVeto(l: L, bosses?: DuelBoss[]): void {
  const { org, sim } = l.room; let i = 0;
  while (org.S!.phase === 'veto') {
    const d = org.S!.duel!, now = vetoNow(d.series)!, seat = d.seats[now.side];
    l.p[seat]!.play.veto(bosses?.[i++] ?? now.left[0]!); sim.run(300);
    if (i > 12) throw new Error('бан/пик не заканчивается');
  }
}
/** серия до первого раунда: готовы → бан/пик → готовы → старт → загрузка → «пошёл» */
function toRound(l: L, bosses?: DuelBoss[]): void {
  const { org, sim } = l.room;
  if (!org.S!.duel) { ready(l); org.start(); sim.run(500); doVeto(l, bosses); }
  ready(l); expect(org.canStart()).toBe(true); org.start(); sim.run(5200);
}
/** игрок (по месту в комнате) убил босса за время ms от «пошёл» */
const kill = (l: L, seat: number, at?: number): void => duelFinish(l.p[seat]!.game, true, 0, at != null ? { rta: at } : undefined);
/** оба игрока шлют положение (как в настоящей игре ~15 Гц): организатор видит, что соперник на связи */
const live = (l: L, left = 80): void => { for (const s of [1, 2]) duelTel(l.p[s]!.game, s, left); l.room.sim.run(100); };
const die = (l: L, seat: number, left: number): void => duelFinish(l.p[seat]!.game, false, left);
const sideSeat = (l: L, side: 0 | 1): number => l.room.org.S!.duel!.seats[side];
const names = (l: L): string[] => l.room.org.S!.duel!.names;

describe('дуэль: комната, бан/пик', () => {
  it('выбор дисциплины «Дуэль ткачей»; настройки серии; начало серии ведёт в бан/пик и сбрасывает готовность', () => {
    const l = lobby({ fmt: 3, fixed: ['noheal'], random: true }), { org, sim } = l.room;
    expect(org.S!.disc).toBe('duel'); expect(org.duelCfg()).toEqual({ fmt: 3, fixed: ['noheal'], random: true });
    expect(org.canStartSeries()).toBe(false); ready(l); expect(org.canStartSeries()).toBe(true);
    org.start(); sim.run(500);
    expect(org.S!.phase).toBe('veto'); expect(org.S!.duel!.series.stage).toBe('veto'); expect(org.seatList().every((p) => !p.ready)).toBe(true);
    expect(l.w1.S!.phase).toBe('veto'); expect(l.w1.S!.duel!.series.fmt).toBe(3); expect(l.p[1]!.play.state!.duel!.names).toEqual(['Ива', 'Ярь']);
    org.setDuelCfg({ fmt: 5 }); expect(org.duelCfg().fmt).toBe(3); // во время серии формат не меняется
    org.setDisc('trail'); expect(org.S!.disc).toBe('duel');
  });

  it('ход не в свою очередь и неизвестный босс отклоняются; бан/пик Bo3 завершается порядком боссов и возвращает в ожидание', () => {
    const l = lobby({ fmt: 3 }), { org, sim } = l.room; ready(l); org.start(); sim.run(500);
    const d = org.S!.duel!, now = vetoNow(d.series)!, wrong = d.seats[now.side === 0 ? 1 : 0];
    l.p[wrong]!.play.veto('misha2'); sim.run(300); expect(org.S!.duel!.series.step).toBe(0);
    l.p[d.seats[now.side]]!.play.veto('ghost'); sim.run(300); expect(org.S!.duel!.series.step).toBe(0);
    expect(org.S!.events.filter((e) => e.k === 'vetobad').length).toBe(2); // отказы пишутся в журнал комнаты
    doVeto(l, ['penitent', 'misha2', 'vladik2']);
    expect(org.S!.phase).toBe('lobby'); const s = org.S!.duel!.series;
    expect(s.stage).toBe('play'); expect(s.order).toEqual(['misha2', 'vladik2', 'tima2']);
    expect(l.w2.S!.duel!.series.order).toEqual(['misha2', 'vladik2', 'tima2']); expect(l.w2.S!.duel!.plan!.boss).toBe('misha2');
    expect(org.S!.seed).toBe(planRound(s)!.seed);
    expect(org.S!.events.filter((e) => e.k === 'veto').length).toBeGreaterThanOrEqual(4);
  });

  it('«Выбрать за игрока»: организатор делает ход за не отвечающего детерминированно', () => {
    const l = lobby({ fmt: 1 }), { org, sim } = l.room; ready(l); org.start(); sim.run(500);
    org.autoVeto(); sim.run(300); expect(org.S!.duel!.series.step).toBe(1);
    org.autoVeto(); org.autoVeto(); sim.run(300); expect(org.S!.phase).toBe('lobby'); expect(org.S!.duel!.series.order.length).toBe(1);
  });

  it('отказ третьему игроку: в бан/пик, в серии и в раунде', () => {
    const l = lobby(), { room, code } = l, { org, sim } = room; ready(l); org.start(); sim.run(500);
    const p3 = room.player('Третий', 'p3'); p3.play.join(code, 'Третий'); sim.run(3000);
    expect(p3.play.status).toBe('denied'); expect(p3.play.denied).toMatch(/гонка уже идёт|два игрока|серия/);
    doVeto(l); ready(l); org.start(); sim.run(5200);
    const p4 = room.player('Четвёртый', 'p4'); p4.play.join(code, 'Четвёртый'); sim.run(3000);
    expect(p4.play.status).toBe('denied'); expect(org.seatList().length).toBe(2);
    // обсервер входит всегда
    const w3 = room.watcher('w3'); w3.join(code); sim.run(2000); expect(w3.connStatus).toBe('online'); expect(w3.S!.duel!.series.stage).toBe('play');
  });
});

describe('дуэль: раунд и серия', () => {
  it('Bo3 до 2:0: общий босс и зерно, быстрее убил — победил, проигравший возвращается в комнату, записи раундов с общим seriesId, Эло один раз на серию', () => {
    const l = lobby({ fmt: 3, fixed: ['mirror'] }), { room, p, w1 } = l, { org, sim } = room;
    toRound(l, ['penitent', 'misha2', 'vladik2']); // раунды: Миша, Владик, Тима
    expect(p[1]!.game.duel).toEqual({ ch: 2, boss: 'misha2', mods: ['mirror'] }); expect(p[2]!.game.duel).toEqual(p[1]!.game.duel);
    expect(p[1]!.game.run!.seed).toBe(p[2]!.game.run!.seed); expect(p[1]!.game.run!.cat).toBe('duel');
    expect(org.S!.phase).toBe('run');
    const r1id = org.S!.id;
    sim.run(3000); const A = sideSeat(l, 0), B = sideSeat(l, 1);
    live(l); kill(l, A); sim.run(500); // A убил: B ещё играет и на связи — ждём недолго возможное более раннее убийство
    live(l); sim.run(2500);
    expect(org.S!.phase).toBe('done'); expect(p[B]!.game.hasRun()).toBe(false); // B возвращён в комнату
    let r = org.S!.result!;
    expect(r.discipline).toBe('duel'); expect(r.seriesId).toBe(org.S!.duel!.id); expect(r.round).toBe(1); expect(r.id).toBe(r1id);
    expect(r.duel).toMatchObject({ fmt: 3, boss: 'misha2', mods: ['mirror'], slot: 0, why: 'kill' }); expect(r.duel!.final).toBeUndefined();
    expect(r.winner).toBe(names(l)[0]); expect(r.players.map((x) => x.seat)).toEqual([A, B]); expect(r.players[1]!.dnf).toBe(true);
    expect(org.S!.duel!.series.score).toEqual([1, 0]); expect(w1.S!.duel!.series.score).toEqual([1, 0]); expect(w1.S!.duel!.last).toMatchObject({ n: 1, winner: 'a' });
    expect(org.archive().length).toBe(1);
    expect(computeElo(org.archive()).perRace[r.id]).toBeUndefined(); // раунд не последний: Эло не считается
    // второй раунд: Владик
    org.nextRound(); sim.run(600);
    expect(org.S!.phase).toBe('lobby'); expect(org.S!.id).not.toBe(r1id);
    ready(l); expect(org.canStart()).toBe(true); org.start(); sim.run(5200);
    expect(p[1]!.game.duel).toMatchObject({ ch: 3, boss: 'vladik2' });
    sim.run(2000); kill(l, B, 30000); kill(l, A, 31000); sim.run(500);
    expect(org.S!.phase).toBe('done'); r = org.S!.result!;
    expect(r.winner).toBe(names(l)[1]); expect(r.duel).toMatchObject({ why: 'faster', score: expect.any(Array) }); expect(org.S!.duel!.series.score).toEqual([1, 1]);
    // решающий: Тима
    org.nextRound(); sim.run(600); ready(l); org.start(); sim.run(5200);
    expect(p[1]!.game.duel).toMatchObject({ ch: 4, boss: 'tima2' });
    sim.run(1000); kill(l, A, 28000); kill(l, B, 29500); sim.run(500);
    expect(org.S!.phase).toBe('done'); r = org.S!.result!;
    expect(org.S!.duel!.series.stage).toBe('over'); expect(org.S!.duel!.series.score).toEqual([2, 1]); expect(r.duel).toMatchObject({ final: true, seriesWinner: names(l)[0], score: [2, 1] });
    expect(r.gap).toBe(1500); expect(r.players.every((x) => x.eloBefore != null && x.eloAfter != null)).toBe(true);
    // три записи раунда с общим seriesId; Эло — одна партия на серию
    const arch = org.archive(); expect(arch.map((x) => x.round)).toEqual([1, 2, 3]); expect(new Set(arch.map((x) => x.seriesId)).size).toBe(1);
    const t = computeElo(arch); expect(t.byDisc['duel']!.map((x) => x.games)).toEqual([1, 1]); expect(t.byDisc['duel']![0]!.name).toBe(names(l)[0]); expect(t.all.length).toBe(2);
    expect(t.perRace[arch[0]!.id]).toBeUndefined(); expect(t.perRace[arch[2]!.id]).toBeDefined();
    // новая серия после конца: «Переиграть»/«Следующий» сбрасывает серию, можно начинать заново
    expect(org.canStart()).toBe(false); org.nextRound(); sim.run(500);
    expect(org.S!.phase).toBe('lobby'); expect(org.S!.duel).toBeNull(); ready(l); expect(org.canStartSeries()).toBe(true);
    // архив читается как races.json
    const back = parseRaces(racesJson(arch, 'v', '2026-01-01T00:00:00.000Z')); expect(back.ok).toBe(true);
    if (back.ok) expect(back.races[2]!.duel).toMatchObject({ final: true });
  });

  it('оба погибли: побеждает тот, кто снял больше здоровья босса; раунд ждёт обоих', () => {
    const l = lobby({ fmt: 1 }), { room, p } = l, { org, sim } = room; toRound(l);
    const A = sideSeat(l, 0), B = sideSeat(l, 1);
    die(l, A, 60); sim.run(500); expect(org.S!.phase).toBe('run'); // A закончил, B ещё играет
    duelTel(p[B]!.game, B, 30); sim.run(300);
    die(l, B, 25); sim.run(800); // у B осталось меньше здоровья босса, значит снято больше
    expect(org.S!.phase).toBe('done'); const r = org.S!.result!;
    expect(r.winner).toBe(names(l)[1]); expect(r.duel!.why).toBe('damage'); expect(r.players.every((x) => x.dnf)).toBe(true);
    expect(r.players[0]!.duel).toMatchObject({ kill: false, frac: 0.4 }); expect(r.players[1]!.duel).toMatchObject({ kill: false, frac: 0.75 });
    expect(org.S!.duel!.series).toMatchObject({ stage: 'over', winner: 1 }); expect(r.duel!.final).toBe(true);
    expect(r.gap).toBeNull();
  });

  it('оба погибли с одинаковым результатом: ничья, раунд переигрывается тем же боссом и другим зерном, счёт не меняется', () => {
    const l = lobby({ fmt: 3 }), { room, p } = l, { org, sim } = room; toRound(l, ['penitent', 'misha2', 'vladik2']);
    const seed1 = p[1]!.game.run!.seed, id1 = org.S!.id;
    die(l, 1, 50); die(l, 2, 50); sim.run(800);
    expect(org.S!.phase).toBe('done'); expect(org.S!.duel!.series.score).toEqual([0, 0]); expect(org.S!.result!.winner).toBe('draw'); expect(org.S!.result!.winnerSeat).toBe('draw');
    expect(org.S!.result!.duel!.why).toBe('draw');
    org.nextRound(); sim.run(600); ready(l); org.start(); sim.run(5200);
    expect(p[1]!.game.duel).toMatchObject({ boss: 'misha2' }); expect(p[1]!.game.run!.seed).not.toBe(seed1); expect(org.S!.id).not.toBe(id1);
    expect(l.room.org.S!.duel!.series.rounds.length).toBe(1);
  });

  it('обрыв связи посреди раунда: игрок убил босса раньше, но связь вернулась позже — в зачёт идёт его время', () => {
    const l = lobby({ fmt: 1 }), { room } = l, { org, sim, net } = room; toRound(l);
    const A = sideSeat(l, 0), B = sideSeat(l, 1), nodeA = A === 1 ? 'p1' : 'p2';
    sim.run(4000); net.cut(nodeA); sim.run(500);
    kill(l, A, 20000); // игра A идёт локально, итог копится в очереди
    sim.run(3000); kill(l, B, 22000); sim.run(3000);
    expect(org.S!.phase).toBe('run'); // организатор ждёт A (возможный более ранний итог)
    net.heal(nodeA); sim.run(20000);
    expect(org.S!.phase).toBe('done'); const r = org.S!.result!;
    expect(r.winner).toBe(names(l)[0]); expect(r.duel!.why).toBe('faster'); expect(r.gap).toBe(2000);
    expect(org.archive().length).toBe(1);
  });

  it('обрыв связи без возвращения: через ожидание засчитывается убийство соперника', () => {
    const l = lobby({ fmt: 1 }), { room } = l, { org, sim, net } = room; toRound(l);
    const A = sideSeat(l, 0), B = sideSeat(l, 1), nodeA = A === 1 ? 'p1' : 'p2';
    sim.run(3000); net.cut(nodeA); sim.run(9000);
    kill(l, B, 40000); sim.run(20000);
    expect(org.S!.phase).toBe('done'); expect(org.S!.result!.winner).toBe(names(l)[1]); expect(org.S!.result!.duel!.why).toBe('kill');
  });

  it('сдача: игрок вышел из забега — раунд за соперником сразу', () => {
    const l = lobby({ fmt: 3 }), { room, p } = l, { org, sim } = room; toRound(l);
    sim.run(2000); p[2]!.play.dnf(); sim.run(500);
    expect(org.S!.phase).toBe('done'); expect(org.S!.result!.duel!.why).toBe('walkover'); expect(org.S!.result!.winner).toBe('Ива'); expect(org.S!.duel!.series.score[org.S!.duel!.names.indexOf('Ива')]).toBe(1);
  });

  it('присуждение раунда организатором; «Переиграть» — новый раунд с тем же боссом и без записи в счёт', () => {
    const l = lobby({ fmt: 3 }), { room, p } = l, { org, sim } = room; toRound(l);
    const id1 = org.S!.id, seed1 = p[1]!.game.run!.seed;
    org.restart(); sim.run(800);
    expect(org.S!.phase).toBe('lobby'); expect(org.archive().length).toBe(0); expect(org.S!.duel!.series.rounds.length).toBe(0); expect(p[1]!.game.hasRun()).toBe(false);
    ready(l); org.start(); sim.run(5200);
    expect(org.S!.id).not.toBe(id1); expect(p[1]!.game.run!.seed).not.toBe(seed1); expect(p[1]!.game.duel!.boss).toBe(org.S!.duel!.series.order[0]);
    org.award(2); sim.run(600);
    expect(org.S!.phase).toBe('done'); expect(org.S!.result!.awarded).toBe(true); expect(org.S!.result!.winnerSeat).toBe(2); expect(org.S!.duel!.series.rounds.length).toBe(1);
    expect(org.S!.acts.length).toBe(0); // присуждение раунда дуэли не отменяется
  });

  it('Bo5: пять раундов, решающий босс по жребию; Bo1: один раунд', () => {
    const l = lobby({ fmt: 5 }), { room } = l, { org, sim } = room; toRound(l);
    const s0 = org.S!.duel!.series; expect(s0.order.length).toBe(5); expect(s0.picks.length).toBe(4);
    const wins: (0 | 1)[] = [0, 1, 0, 1, 0];
    wins.forEach((w, i) => {
      if (i) { org.nextRound(); sim.run(600); ready(l); org.start(); sim.run(5200); }
      expect(l.p[1]!.game.duel!.boss).toBe(s0.order[i]!); sim.run(500);
      kill(l, sideSeat(l, w), 30000); kill(l, sideSeat(l, w === 0 ? 1 : 0), 31000); sim.run(500);
    });
    expect(org.S!.duel!.series).toMatchObject({ stage: 'over', winner: 0, score: [3, 2] }); expect(org.archive().length).toBe(5);
    expect(BOSS_INFO[s0.order[4]!].ch).toBeGreaterThan(0);
  });
});

describe('дуэль: перезагрузки и обсервер', () => {
  it('перезагрузка организатора посреди бан/пика: серия на месте, ходы продолжаются', () => {
    const l = lobby({ fmt: 3 }), { room, code } = l, { sim, net, org } = room; ready(l); org.start(); sim.run(500);
    const d = org.S!.duel!, now = vetoNow(d.series)!; l.p[d.seats[now.side]]!.play.veto('penitent'); sim.run(300);
    (org.hub as any).closed = true; net.killHub(peerId(code, 'race'), 6000); net.cut('org'); sim.run(1500); net.heal('org');
    const org2 = room.newOrg(); expect(org2.resume()).toBe(true); sim.run(30000);
    expect(org2.S!.phase).toBe('veto'); expect(org2.S!.duel!.series.bans.map((b) => b.boss)).toEqual(['penitent']); expect(org2.seatList().every((p) => p.online)).toBe(true);
    expect(l.w1.S!.duel!.series.step).toBe(1);
    const d2 = org2.S!.duel!, n2 = vetoNow(d2.series)!; l.p[d2.seats[n2.side]]!.play.veto('misha2'); sim.run(500);
    expect(org2.S!.duel!.series.step).toBe(2);
  });

  it('перезагрузка организатора посреди раунда второго раунда: счёт и босс сохранены, итог доходит до нового организатора', () => {
    const l = lobby({ fmt: 3 }), { room, code, p } = l, { sim, net, org } = room; toRound(l, ['penitent', 'misha2', 'vladik2']);
    sim.run(1000); kill(l, 1, 20000); kill(l, 2, 21000); sim.run(500);
    expect(org.S!.phase).toBe('done'); const sc = org.S!.duel!.series.score.slice();
    org.nextRound(); sim.run(600); ready(l); org.start(); sim.run(5200);
    const id = org.S!.id, goAt = org.S!.goAt;
    (org.hub as any).closed = true; net.killHub(peerId(code, 'race'), 6000); net.cut('org'); sim.run(1500); net.heal('org');
    const org2 = room.newOrg(); org2.resume(); sim.run(30000);
    expect(org2.S!.phase).toBe('run'); expect(org2.S!.id).toBe(id); expect(org2.S!.goAt).toBe(goAt); expect(org2.S!.duel!.series.score).toEqual(sc); expect(org2.S!.duel!.series.rounds.length).toBe(1);
    expect(org2.duelPlan()!.boss).toBe('vladik2'); expect(org2.archive().length).toBe(1);
    kill(l, 1, 25000); kill(l, 2, 24000); sim.run(500);
    expect(org2.S!.phase).toBe('done'); expect(org2.S!.duel!.series.score[0] + org2.S!.duel!.series.score[1]).toBe(2); expect(org2.archive().length).toBe(2);
    void p;
  });

  it('обсервер: график погони собирается из телеметрии, у вошедшего позже — из снимка; разница к фазам', () => {
    const l = lobby({ fmt: 1 }), { room, p, w1 } = l, { sim, org } = room; toRound(l); const A = sideSeat(l, 0), B = sideSeat(l, 1);
    for (let i = 0; i < 20; i++) { sim.run(500); duelTel(p[A]!.game, A, 100 - i * 4); duelTel(p[B]!.game, B, 100 - i * 2); }
    sim.run(600);
    const ca = w1.chase[A]!, cb = w1.chase[B]!;
    expect(ca.length).toBeGreaterThan(10); expect(cb.length).toBeGreaterThan(10); expect(ca[ca.length - 1]![1]).toBeGreaterThan(cb[cb.length - 1]![1]); // A снял больше
    expect(chaseLead(ca, cb, ca[ca.length - 1]![0])).toBeGreaterThan(10); expect(fracAt(ca, 0)).toBeLessThan(0.1);
    expect(org.S!.phase).toBe('run');
    const w3 = room.watcher('w3'); w3.join(l.code); sim.run(2500);
    expect(w3.chase[A]!.length).toBe(ca.length); expect(w3.chase[B]!.length).toBe(cb.length);
    // подсплиты → разница к фазам
    p[A]!.play.event('sub', { ch: 2, sk: 'fight', igt: 1 }); p[B]!.play.event('sub', { ch: 2, sk: 'fight', igt: 1 }); sim.run(500);
    p[A]!.play.event('sub', { ch: 2, sk: 'ph2', igt: 1 }); sim.run(700); p[B]!.play.event('sub', { ch: 2, sk: 'ph2', igt: 1 }); sim.run(500);
    const rows = phaseRows(w1.S!.players.find((x) => x.seat === A), w1.S!.players.find((x) => x.seat === B), 2);
    expect(rows.map((r) => r.k)).toEqual(['fight', 'ph2', 'ph3', 'kill']); expect(rows[1]!.d).toBeLessThan(0); expect(rows[2]!.a).toBeNull();
  });

  it('новый раунд очищает график, итог раунда остаётся на табло до следующего', () => {
    const l = lobby({ fmt: 3 }), { room, p, w1 } = l, { sim, org } = room; toRound(l, ['penitent', 'misha2', 'vladik2']); const A = sideSeat(l, 0);
    sim.run(1000); duelTel(p[A]!.game, A, 70); sim.run(600); expect(w1.chase[A]!.length).toBeGreaterThan(0);
    kill(l, A, 20000); kill(l, sideSeat(l, 1), 21000); sim.run(500);
    expect(org.S!.phase).toBe('done'); expect(w1.chase[A]!.length).toBeGreaterThan(0); expect(w1.S!.duel!.last!.n).toBe(1);
    org.nextRound(); sim.run(800); expect(w1.chase[A]).toBeUndefined();
  });

  it('модификаторы: случайный из зерна комнаты одинаков у организатора, игроков и обсервера', () => {
    const l = lobby({ fmt: 3, fixed: ['noheal'], random: true }), { room, p } = l, { org, sim } = room; toRound(l);
    const plan = org.duelPlan()!; expect(plan.mods).toContain('noheal'); expect(plan.mods.length).toBe(2);
    expect(p[1]!.game.duel!.mods).toEqual(plan.mods); expect(p[2]!.game.duel!.mods).toEqual(plan.mods); expect(l.w1.S!.duel!.plan!.mods).toEqual(plan.mods);
    void sim;
  });
});

describe('дуэль: повтор момента и звук обсервера работают как в обычной гонке', () => {
  it('повтор последних секунд игрока доступен в раунде; события бан/пика и раунда озвучиваются', async () => {
    const l = lobby({ fmt: 1 }), { room, p, w1 } = l, { sim } = room; toRound(l); const A = sideSeat(l, 0);
    for (let i = 0; i < 16; i++) { sim.run(250); duelTel(p[A]!.game, A, 100 - i); duelTel(p[sideSeat(l, 1)]!.game, sideSeat(l, 1), 100 - i); }
    expect(w1.startReplay(A)).toBe(true); expect(w1.replay!.seat).toBe(A); expect(w1.telFor(A)).toBeDefined(); w1.stopReplay();
    const { EVENT_SOUND } = await import('../../src/app/watchsound');
    for (const k of ['veto', 'cd', 'go', 'done', 'phase']) expect(EVENT_SOUND[k], k).toBeTruthy();
    const kinds = new Set(w1.feed.map((e) => e.k)); expect(kinds.has('veto')).toBe(true); expect(kinds.has('go')).toBe(true);
  });
});
