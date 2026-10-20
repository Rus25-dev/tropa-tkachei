import { describe, expect, it } from 'vitest';
import { computeVW } from '../../src/view/layout';

describe('computeVW (как в v1.8)', () => {
  it('значения для типичных экранов', () => {
    expect(computeVW(1920, 1080)).toBe(960);
    expect(computeVW(1366, 768)).toBe(960);
    expect(computeVW(844, 390)).toBe(1168);
    expect(computeVW(932, 430)).toBe(1170);
    expect(computeVW(667, 375)).toBe(960);
  });
  it('не зависит от поворота и ограничен 960…1280', () => {
    expect(computeVW(390, 844)).toBe(computeVW(844, 390));
    expect(computeVW(3000, 600)).toBe(1280);
    expect(computeVW(500, 500)).toBe(960);
  });
});
