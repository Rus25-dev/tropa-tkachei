import { describe, expect, it } from 'vitest';
import { TickClock } from '../../src/core/clock';

describe('TickClock', () => {
  it('на 60 кадрах в секунду даёт по тику на кадр', () => {
    const c = new TickClock();
    let sum = 0;
    for (let i = 0; i < 600; i++) sum += c.advance(1000 / 60);
    expect(Math.abs(sum - 600)).toBeLessThanOrEqual(1);
  });
  it('на 30 кадрах в секунду даёт по два тика', () => {
    const c = new TickClock();
    let sum = 0;
    for (let i = 0; i < 300; i++) sum += c.advance(1000 / 30);
    expect(Math.abs(sum - 600)).toBeLessThanOrEqual(2);
  });
  it('долгий кадр режется: не больше 7 тиков, остаток сбрасывается', () => {
    const c = new TickClock();
    expect(c.advance(5000)).toBe(6); // 100 мс предел: 6 тиков по 1/60
    expect(c.advance(0)).toBe(0);
  });
  it('суммарное число тиков не зависит от дробления кадров', () => {
    const a = new TickClock(), b = new TickClock();
    let na = 0, nb = 0;
    for (let i = 0; i < 100; i++) na += a.advance(10);
    for (let i = 0; i < 50; i++) nb += b.advance(20);
    expect(Math.abs(na - nb)).toBeLessThanOrEqual(1);
  });
});
