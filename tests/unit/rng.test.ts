import { describe, expect, it } from 'vitest';
import { mulberry32, rngSeedFor } from '../../src/core/rng';

// Эталон — значения, снятые с legacy/src/rng.js (v1.8).
describe('rng совпадает с v1.8', () => {
  it('mulberry32(12345)', () => {
    const r = mulberry32(12345);
    expect([r(), r(), r(), r(), r()]).toEqual([0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203, 0.5094283693470061]);
  });
  it('rngSeedFor', () => {
    expect(rngSeedFor(12345, 'boss')).toBe(2226605487);
    expect(rngSeedFor(12345, 'loot')).toBe(3757514534);
    expect(rngSeedFor(987654321, 'enemy')).toBe(3519455661);
    expect(rngSeedFor(4294967295, 'next:2road')).toBe(3296875161);
  });
});
