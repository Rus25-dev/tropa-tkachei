import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTS, DEF, keys, loadKeys, resetKeys } from '../../src/app/keys';
import { Session } from '../../src/core/session';
import { SessionRecorder } from '../../src/core/recording';
import { normalizeSave } from '../../src/core/loadout';
import { emptyFrame } from '../../src/core/input';
import { replayJournal } from '../../src/core/replay';
import { hash2 } from '../../src/core/journal';

afterEach(() => { resetKeys(); vi.unstubAllGlobals(); });
describe('команды боя: адаптеры и повтор', () => {
  it('новые кнопки не сбрасывают старую переназначенную раскладку', () => {
    const saved = Object.fromEntries(ACTS.slice(0, 10).map(([a]) => [a, [...DEF[a]]]));
    saved.atk = [84, 'T', 'KeyT'];
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(saved), setItem: () => {} });
    loadKeys();
    expect(keys.map.atk[2]).toBe('KeyT');
    expect(new Set(ACTS.map(([a]) => keys.map[a][2])).size).toBe(ACTS.length);
  });
  it('короткое нажатие отбива между тиками проходит через Session и воспроизводится', () => {
    const s = new Session({ easy: false, loadoutSave: normalizeSave(null), progress: null, ver: 'combat', clock: () => 0, fx: false }, { seed: 77, mode: 'bosstest', boss: 'misha2', players: 1 });
    const rec = new SessionRecorder(s, { ver: 'combat', easy: false });
    const f = emptyFrame(); f.edges.parryP = true;
    s.frame(1, [f]); s.frame(1000 / 60, [emptyFrame()]);
    expect(s.world.players[0]!.parryT).toBeGreaterThan(0);
    for (let i = 0; i < 350; i++) s.frame(1000 / 60, [emptyFrame()]);
    const replay = replayJournal(rec.journal, { loadoutSave: s.cfg.loadoutSave });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(hash2(replay.world)).toBe(hash2(s.world));
    expect(rec.journal.segs[0]!.rle.some((v, i) => i % 2 === 0 && v >= 2 ** 34)).toBe(true);
  });
});
