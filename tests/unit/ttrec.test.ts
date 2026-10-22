// Формат .ttrec, воспроизведение в Node и сессия-просмотр (тот же движок игры, ввод из журнала).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outcome, type Journal } from '../../src/core/journal';
import { normalizeSave } from '../../src/core/loadout';
import { replayJournal } from '../../src/core/replay';
import { ReplaySession } from '../../src/core/replaysession';
import { makeTtrec, parseTtrec, playTtrec, stringifyTtrec, ttrecError, ttrecTicks, type Ttrec } from '../../src/core/ttrec';
import { runFight } from '../../tools/bot/fight';
import { runFuzz } from '../../tools/fuzz/run';
import { makeSpec } from '../../tools/fuzz/spec';

const golden = (n: string): { journal: Journal; expect: Record<string, unknown>; loadout?: unknown } => JSON.parse(readFileSync(join(__dirname, '../golden/v2', n + '.json'), 'utf8')) as never;
const fromGolden = (n: string): Ttrec => { const g = golden(n); return makeTtrec(g.journal, { ver: '1.8', meta: { kind: 'repro', label: n }, setup: { loadout: g.loadout as never }, expect: g.expect }); };
const fight = (): Ttrec => runFight({ boss: 'vladik2', skill: 0.9, players: 1, seed: 5, maxSec: 25, record: true, ver: 't' }).ttrec!;

describe('.ttrec: формат', () => {
  it('запись бота сериализуется и читается обратно без потерь', () => {
    const t = fight();
    const back = parseTtrec(stringifyTtrec(t));
    expect(back).toEqual(JSON.parse(JSON.stringify(t)));
    expect(back.format).toBe('ttrec');
    expect(back.meta.kind).toBe('bot');
    expect(ttrecTicks(back)).toBeGreaterThan(600);
  }, 60_000);

  it('воспроизведение в Node даёт записанный исход', () => {
    const p = playTtrec(fight());
    expect(p.result.ok).toBe(true);
    expect(p.match).toBe(true);
  }, 60_000);

  it('испорченный ожидаемый исход обнаруживается', () => {
    const t = fight(); t.expect = { ...t.expect!, tick: 1 };
    expect(playTtrec(t).match).toBe(false);
  }, 60_000);

  it('золотая запись v2 в обёртке .ttrec проигрывается в тот же исход', () => {
    for (const n of ['boss-misha2-win', 'coop-two-bots', 'speedrun-boss-rush']) expect(playTtrec(fromGolden(n)).match, n).toBe(true);
  }, 60_000);

  let baseText = '';
  const base = (): Record<string, unknown> => { baseText ||= stringifyTtrec(fight()); return JSON.parse(baseText) as Record<string, unknown>; };
  const mutate = (f: (r: Record<string, any>) => void): string | null => { const r = base(); f(r); return ttrecError(r); }; // eslint-disable-line @typescript-eslint/no-explicit-any
  it('проверка структуры отвергает испорченные файлы', () => {
    expect(ttrecError(base())).toBeNull();
    expect(ttrecError(null)).toMatch(/объект/);
    expect(mutate((r) => { r['format'] = 'zip'; })).toMatch(/не запись/);
    expect(mutate((r) => { r['v'] = 2; })).toMatch(/версия формата/);
    expect(mutate((r) => { delete r['journal']; })).toMatch(/journal/);
    expect(mutate((r) => { r['journal'].segs = []; })).toMatch(/отрезков/);
    expect(mutate((r) => { r['journal'].segs[0].rle.pop(); })).toMatch(/rle/);
    expect(mutate((r) => { r['journal'].segs[0].n += 5; })).toMatch(/сумма повторов/);
    expect(mutate((r) => { r['journal'].segs[0].np = 3; })).toMatch(/seed\/np/);
    expect(mutate((r) => { r['journal'].segs[0].data.mode = 'x'; })).toMatch(/mode/);
    expect(mutate((r) => { r['journal'].segs[0].acts = [[1, 2]]; })).toMatch(/acts/);
    expect(mutate((r) => { r['journal'].segs[0].n = 1e12; })).toMatch(/длина/);
    expect(() => parseTtrec('{')).toThrow(/не JSON/);
  }, 60_000);
});

describe('.ttrec: просмотр движком игры', () => {
  const play = (t: Ttrec, speed = 1): { ses: ReplaySession; frames: number } => {
    const ses = new ReplaySession({ easy: !!t.setup.easy, loadoutSave: normalizeSave(t.setup.loadout), progress: t.setup.progress ?? null, ver: t.ver, clock: () => 0, fx: true }, t);
    ses.playSpeed = speed;
    let frames = 0;
    while (!ses.ended && frames < 200_000) { ses.frame(1000 / 60, []); ses.fxq.length = 0; frames++; }
    return { ses, frames };
  };

  it('сессия-просмотр приходит в тот же исход, что и воспроизведение ядром', () => {
    const t = fight(), { ses } = play(t);
    expect(ses.ended).toBe(true);
    expect(JSON.parse(JSON.stringify(outcome(ses.world)))).toEqual(t.expect);
  }, 60_000);

  it('быстрый просмотр (×4) даёт тот же исход, пауза просмотра ничего не меняет', () => {
    const t = fight();
    const ses = new ReplaySession({ easy: false, loadoutSave: normalizeSave(null), progress: null, ver: 't', clock: () => 0, fx: false }, t);
    ses.playSpeed = 4;
    for (let i = 0; i < 100; i++) ses.frame(1000 / 60, []);
    const at = ses.world.tickN;
    ses.hold = true; for (let i = 0; i < 50; i++) ses.frame(1000 / 60, []);
    expect(ses.world.tickN).toBe(at);
    ses.hold = false; ses.togglePause(); ses.buy(); ses.retry(); // действия игрока не меняют мир
    while (!ses.ended) ses.frame(1000 / 60, []);
    expect(JSON.parse(JSON.stringify(outcome(ses.world)))).toEqual(t.expect);
  }, 60_000);

  it('забег спидрана из нескольких отрезков (смена сцен) проигрывается до конца', () => {
    const spec = { ...makeSpec(3, 0, ['sr-boss']), ticks: 4200 };
    const col: Journal[] = [];
    const r = runFuzz(spec, { collect: col });
    expect(r.finding).toBeNull();
    const J = col[col.length - 1]!;
    expect(J.cat).toBe('boss');
    expect(J.segs.length).toBeGreaterThan(1);
    const t = makeTtrec(J, { ver: 't', meta: { kind: 'fuzz' }, setup: { easy: spec.easy, loadout: spec.loadout } });
    const rj = replayJournal(J, { loadoutSave: spec.loadout, easy: spec.easy, ver: 't' });
    if (!rj.ok) throw new Error(rj.why);
    const expectOut = JSON.parse(JSON.stringify(outcome(rj.world)));
    const { ses } = play(t);
    expect(JSON.parse(JSON.stringify(outcome(ses.world)))).toEqual(expectOut);
  }, 120_000);

  it('коридор → арена: запись сцены и сохранение главы воспроизводятся по отдельности', () => {
    // 'chain' ходит по главам с «Дальше»: каждая сцена — отдельная запись со снимком сохранения
    const spec = { ...makeSpec(5, 0, ['chain']), players: 1 as const, ticks: 9000 };
    const col: Journal[] = [];
    expect(runFuzz(spec, { collect: col }).finding).toBeNull();
    expect(col.length).toBeGreaterThan(1);
    for (const J of col) expect(J.segs).toHaveLength(1);
  }, 120_000);
});
