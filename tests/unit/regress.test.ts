// Ошибки аудита v1.5, исправленные в v1.6: чтобы не вернулись (кооперативные — в coop.test.ts, интерфейсные — в tests/e2e).
import { describe, expect, it } from 'vitest';
import { World } from '../../src/core/world';
import { winGame } from '../../src/core/win';
import { normalizeSave } from '../../src/core/loadout';
import type { CampState } from '../../src/core/campaign';
import { freshUp } from '../../src/core/campaign';

const camp = (ch: number, st: CampState['st']): CampState => ({ ch, st, beads: 0, abil: { double: true }, up: freshUp(), time: 0, deaths: 0 });

describe('ошибки аудита v1.5', () => {
  it('оглушённый босс не бьёт касанием', () => {
    const w = new World({ seed: 5, mode: 'bosstest', boss: 'vladik2', fx: true, loadoutSave: normalizeSave(null) });
    const b = w.bosses[0]!, p = w.players[0]!;
    b.stagger = 1.2; b.x = p.x; b.y = p.y; p.inv = 0;
    const hp = p.hp;
    for (let i = 0; i < 5; i++) w.tick();
    expect(p.hp).toBe(hp);
  });

  it('победа над боссом в арене сохраняет переход на следующую главу', () => {
    const w = new World({ seed: 9, mode: 'story', camp: camp(2, 'arena'), fx: true, loadoutSave: normalizeSave(null) });
    w.bossDead = true;
    winGame(w);
    const save = w.fxq.find((e) => e.k === 'save');
    expect(save).toBeTruthy();
    expect((save!['progress'] as { chapter: number }).chapter).toBe(3);
    expect(w.fxq.some((e) => e.k === 'victory')).toBe(true);
  });

  it('выход из коридора ведёт в арену сам, без экрана победы (пробел и Enter ничего не решают)', () => {
    const w = new World({ seed: 3, mode: 'story', camp: camp(3, 'road'), fx: true, loadoutSave: normalizeSave(null) });
    winGame(w);
    expect(w.fxq.some((e) => e.k === 'victory')).toBe(false);
    for (let i = 0; i < 80; i++) w.tick();
    expect(w.next).not.toBeNull(); expect(w.next!.camp!.st).toBe('arena');
  });

  it('способность не появляется заново, если уже получена (предмет невидим со второго запуска)', () => {
    const a = new World({ seed: 1, mode: 'story', camp: camp(1, 'level'), fx: false });
    const had = a.items.length;
    const b = new World({ seed: 1, mode: 'story', camp: { ...camp(1, 'level'), abil: { double: true } }, fx: false });
    expect(had).toBeGreaterThanOrEqual(0);
    expect(b.items.filter((x) => x['ability'] === 'double').length).toBe(0);
  });
});
