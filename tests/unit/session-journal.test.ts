// Регрессионные тесты ошибок журнала сессии, найденных фаззером (сверка «журнал → воспроизведение»):
//  1. benchPick писал одно действие bc и терял отдых/лавку/карту при воспроизведении;
//  2. подпись состояния Session.sig() смотрела только на героя 1: действия второго игрока (скамья, лавка) не попадали в журнал;
//  3. closeShop закрывает лавку на следующем тике, подпись не менялась и действие 'sc' не записывалось.
import { describe, expect, it } from 'vitest';
import { freshCamp } from '../../src/core/campaign';
import { GOLDEN_EXT, outcome } from '../../src/core/journal';
import { emptyFrame } from '../../src/core/input';
import { replayJournal } from '../../src/core/replay';
import { SessionRecorder } from '../../src/core/recording';
import { Session } from '../../src/core/session';
import { normalizeSave } from '../../src/core/loadout';

function start(players: number) {
  const ses = new Session({ easy: false, loadoutSave: normalizeSave(null), progress: null, ver: 't', clock: () => 0, fx: false }, { seed: 77, mode: 'story', players, camp: freshCamp() });
  const rec = new SessionRecorder(ses, { ver: 't', easy: false });
  const step = (n: number, up = false): void => { for (let i = 0; i < n; i++) { const f = emptyFrame(); if (up && i === 0) { f.buttons.up = true; f.edges.upP = true; } ses.frame(1000 / 60, ses.world.players.map(() => f)); } };
  /** перенос героя 1 на скамью (отладочное действие записи, как в золотых записях) */
  const toBench = (i = 0): void => { const b = ses.world.benches[i]!; rec.rec.act('ex', 20, b.x - 7, b.y - 26); GOLDEN_EXT[20]!(ses.world, b.x - 7, b.y - 26); };
  const replay = () => { const r = replayJournal(rec.journal, { loadoutSave: ses.cfg.loadoutSave, progress: rec.progress }); if (!r.ok) throw new Error(r.why); return r.world; };
  return { ses, rec, step, toBench, replay };
}
const same = (a: object, b: object): void => { expect(JSON.parse(JSON.stringify(outcome(a as never)))).toEqual(JSON.parse(JSON.stringify(outcome(b as never)))); };

describe('журнал сессии: меню скамьи, второй игрок, лавка', () => {
  it('выбор «Отдохнуть» в меню скамьи воспроизводится (раньше терялся отдых)', () => {
    const t = start(1);
    t.step(5); t.toBench(); t.step(30);
    t.step(2, true); // ↑ у скамьи открывает меню
    expect(t.ses.world.benchMenuOpen).toBeTruthy();
    t.ses.world.players[0]!.hp = 1;
    t.ses.benchPick('rest');
    t.step(20);
    const live = t.ses.world, acts = t.rec.journal.segs[0]!.acts.map((a) => a[1]);
    expect(live.players[0]!.sit).toBe(true);
    expect(acts).toContain('br');
    const rw = t.replay();
    expect(rw.players[0]!.sit).toBe(true);
    same(live, rw);
  });

  it('выбор «Лавка» открывает лавку и в записи', () => {
    const t = start(1);
    t.step(5); t.toBench(); t.step(30); t.step(2, true);
    t.ses.benchPick('shop');
    t.step(10);
    expect(t.ses.world.shopOpen).toBe(true);
    const rw = t.replay();
    expect(rw.shopOpen).toBe(true);
    same(t.ses.world, rw);
  });

  it('отдых второго игрока записывается, даже если первый герой не изменился', () => {
    const t = start(2);
    t.step(5); t.toBench(); t.step(30);
    t.ses.benchRest(0, 0, true); // первый герой сел: respawn теперь у скамьи
    t.step(5);
    t.ses.world.players[1]!.hp = 2;
    t.ses.benchRest(1, 0, true); // здесь у героя 1 ничего не меняется (respawn тот же), а у героя 2 — сидит и здоров
    t.step(20);
    const acts = t.rec.journal.segs[0]!.acts.filter((a) => a[1] === 'br');
    expect(acts.map((a) => a[2])).toEqual([0, 1]);
    const rw = t.replay();
    expect(rw.players[1]!.sit).toBe(true);
    same(t.ses.world, rw);
  });

  it('закрытие лавки записывается (закрывается на следующем тике, подпись не меняется)', () => {
    const t = start(1);
    t.step(5); t.toBench(); t.step(30);
    t.ses.benchRest(0, 0, true); t.ses.openShop(0); t.step(10);
    expect(t.ses.world.shopOpen).toBe(true);
    t.ses.closeShop(); t.step(10);
    expect(t.ses.world.shopOpen).toBe(false);
    expect(t.rec.journal.segs[0]!.acts.map((a) => a[1])).toContain('sc');
    const rw = t.replay();
    expect(rw.shopOpen).toBe(false);
    same(t.ses.world, rw);
  });
});

describe('запись сессии: сцены и «Заново»', () => {
  it('«Заново» начинает новую запись, обе проигрываются', () => {
    const t = start(1);
    t.step(60);
    const first = t.rec.rec.J;
    t.ses.retry();
    t.step(90);
    expect(t.rec.done).toHaveLength(1);
    expect(t.rec.done[0]!.journal).toBe(first);
    expect(t.rec.journal).not.toBe(first);
    expect(t.rec.journal.segs).toHaveLength(1);
    for (const run of [...t.rec.done, { journal: t.rec.journal, progress: t.rec.progress }]) {
      const r = replayJournal(run.journal, { loadoutSave: t.ses.cfg.loadoutSave, progress: run.progress });
      expect(r.ok).toBe(true);
    }
  });

  it('два игрока: запись ведётся (Session сам журнал для двоих не начинает)', () => {
    const t = start(2);
    t.step(120);
    expect(t.rec.journal.segs[0]!.np).toBe(2);
    expect(t.rec.ticks()).toBe(120);
    same(t.ses.world, t.replay());
  });
});
