// Обсервер гонки: повтор момента и одна половина на весь экран работают от виртуального времени.
import { describe, expect, it } from 'vitest';
import { RaceWatch, REPLAY_MS } from '../../src/net/racewatch';
import type { Env, Transport } from '../../src/net/types';

describe('обсервер: повтор момента', () => {
  const clock = { t: 0 };
  const env = { now: () => clock.t } as unknown as Env;
  const mk = (): RaceWatch => new RaceWatch({ transport: {} as Transport, env, version: 't', key: 'k' });
  const push = (w: RaceWatch, at: number, x: number): void => {
    clock.t = at; (w as unknown as { onTel(t: unknown): void }).onTel({ tl: [{ s: 7, x }] });
  };
  it('хранит только последние 10 с и проигрывает их по ходу времени, затем возвращается в эфир', () => {
    const w = mk(); clock.t = 0;
    for (let i = 0; i <= 30; i++) push(w, i * 1000, i * 10); // 30 с, кадр в секунду
    expect(w.hist[7]!.length).toBe(REPLAY_MS / 1000 + 1);
    expect(w.startReplay(7)).toBe(true);
    clock.t = 30000; expect(w.telFor(7)!['x']).toBe(200); // начало повтора: кадр 20-й секунды
    clock.t = 30000 + 4500; expect(w.telFor(7)!['x']).toBe(240);
    clock.t = 30000 + 11000; expect(w.telFor(7)!['x']).toBe(300); // повтор закончился — снова эфир
    expect(w.replay).toBeNull();
  });
  it('повтор без накопленной телеметрии не запускается; другой игрок идёт в эфире', () => {
    const w = mk(); expect(w.startReplay(1)).toBe(false);
    push(w, 0, 5); push(w, 100, 6);
    expect(w.startReplay(7)).toBe(true);
    expect(w.telFor(9)).toBeUndefined();
  });
  it('заморозка ленты держит снимок, пока не снята', () => {
    const w = mk(); w.feed = [{ n: 1, t: 0, k: 'x', s: null, x: 'a' }];
    w.frozen = true; expect(w.feedView().length).toBe(1);
    w.feed.push({ n: 2, t: 1, k: 'x', s: null, x: 'b' }); expect(w.feedView().length).toBe(1);
    w.frozen = false; expect(w.feedView().length).toBe(2);
  });
});