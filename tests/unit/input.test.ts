import { describe, expect, it } from 'vitest';
import { edgesBetween, emptyButtons, emptyFrame, mergeButtons, packFrame, unpackFrame } from '../../src/core/input';

describe('ввод', () => {
  it('фронт — переход «не нажата → нажата»', () => {
    const a = emptyButtons(), b = { ...emptyButtons(), jump: true, left: true };
    expect(edgesBetween(a, b).jumpP).toBe(true);
    expect(edgesBetween(b, b).jumpP).toBe(false);
    expect(edgesBetween(b, a).jumpP).toBe(false);
  });
  it('слияние источников: нажата, если нажата в любом', () => {
    const m = mergeButtons({ left: true }, { jump: true }, {});
    expect(m.left && m.jump && !m.right).toBe(true);
  });
  it('упаковка в число совпадает с форматом журнала v1.8 (10 бит удержания + 7 бит фронтов)', () => {
    const f = emptyFrame();
    f.buttons.right = true; f.buttons.jump = true; f.edges.jumpP = true; f.edges.toolP = true;
    const n = packFrame(f);
    expect(n).toBe((1 << 1) | (1 << 4) | (1 << 10) | (1 << 16));
    expect(unpackFrame(n)).toEqual(f);
  });
});
