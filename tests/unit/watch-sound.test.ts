// Звук обсервера: выбор музыки по боссу лидера и соответствие событий звукам.
import { describe, expect, it } from 'vitest';
import { BOSS_TRACK, EVENT_SOUND, WatchSound } from '../../src/app/watchsound';
import type { RoomState } from '../../src/net/racecommon';
import { RaceWatch } from '../../src/net/racewatch';
import type { Env, Transport } from '../../src/net/types';

const mk = (): RaceWatch => new RaceWatch({ transport: {} as Transport, env: { now: () => 0 } as unknown as Env, version: 't', key: 'k' });
const room = (a: number, b: number): RoomState => ({ players: [{ seat: 1, name: 'А', splits: new Array(a).fill(1) }, { seat: 2, name: 'Б', splits: new Array(b).fill(1) }] } as unknown as RoomState);

describe('звук обсервера', () => {
  it('музыка — босс того, кто дальше по дистанции; нет боя — тишина', () => {
    const w = mk(), s = new WatchSound(w); w.S = room(1, 2);
    expect(s.pickTrack()).toBeNull();
    w.tel[1] = { at: 0, bs: { on: true, k: 'm' } }; expect(s.pickTrack()).toBe('misha');
    w.tel[2] = { at: 0, bs: { on: true, k: 'v' } }; expect(s.pickTrack()).toBe('vladik'); // второй дальше (2 отрезка)
    w.S = room(3, 2); expect(s.pickTrack()).toBe('misha');
    w.tel[1] = { at: 0, bs: { on: false, k: 'm' } }; w.tel[2] = { at: 0, bs: { on: false, k: 'v' } }; expect(s.pickTrack()).toBeNull();
  });
  it('все события ленты, имеющие звук, ссылаются на существующие названия, четыре босса имеют треки', () => {
    for (const k of ['cd', 'go', 'split', 'death', 'buy', 'parry', 'exec', 'phase', 'stun', 'done']) expect(EVENT_SOUND[k], k).toBeTruthy();
    expect(Object.values(BOSS_TRACK).sort()).toEqual(['boss', 'misha', 'tima', 'vladik']);
  });
});