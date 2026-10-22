// Кампания на боссах на данных: главы I–IV ведут к penitent / misha2 / vladik2 / tima2 в их арене из LDtk,
// смерть босса даёт событие bossReward и способность, по сети вход в арену закрыт с понятным сообщением.
import { describe, expect, it } from 'vitest';
import { freshCamp, levelBossStep, netBossBlock, type CampState } from '../../src/core/campaign';
import { CHAPTER_BOSSES, CHAPTERS } from '../../src/core/balance';
import { bossDef } from '../../src/core/boss/registry';
import { damageBoss } from '../../src/core/damage';
import { World } from '../../src/core/world';

const arena = (ch: number, o: Partial<ConstructorParameters<typeof World>[0]> = {}): World =>
  new World({ seed: 3, mode: 'story', players: 1, fx: true, camp: { ...freshCamp(), ch, st: 'arena' } as CampState, ...o });
const events = (w: World, k: string): Record<string, unknown>[] => w.fxq.filter((e) => e['k'] === k);

describe('кампания: боссы глав на данных', () => {
  it('главы I–IV: penitent, misha2, vladik2, tima2; все есть в реестре', () => {
    expect(CHAPTER_BOSSES).toEqual(['penitent', 'misha2', 'vladik2', 'tima2']);
    for (const id of CHAPTER_BOSSES) expect(bossDef(id), id).toBeTruthy();
    expect([1, 2, 3, 4].map((ch) => CHAPTERS[ch]!.boss)).toEqual([...CHAPTER_BOSSES]);
  });

  for (const ch of [1, 2, 3, 4]) {
    it(`глава ${ch}: арена — бой с «${CHAPTERS[ch]!.boss}» на данных`, () => {
      const w = arena(ch);
      expect(w.mode).toBe('bosstest');
      expect(w.bossKind).toBe(CHAPTERS[ch]!.boss);
      expect(w.bosses.length).toBeGreaterThan(0);
      expect(w.bosses[0]!.hp).toBeGreaterThan(0);
      for (let i = 0; i < 120; i++) w.tick();
      expect(w.bosses[0]!.state).not.toBe('dead');
    });
  }

  it('смерть босса главы: bossReward с id босса; способность — только у vladik2 (glide)', () => {
    for (const ch of [1, 2, 3, 4]) {
      const w = arena(ch), id = CHAPTERS[ch]!.boss;
      const b = w.bosses[0]!; b.hp = 1;
      for (let i = 0; i < 400 && b.state !== 'dead'; i++) { w.players[0]!.hp = w.players[0]!.maxHp = 99; if (b.hp > 0) damageBoss(w, 'd0', w.players[0]!); w.tick(); }
      expect(b.state, id).toBe('dead');
      expect(events(w, 'bossReward').map((e) => e['id']), id).toEqual([id]);
      expect(!!w.abil['glide'], id).toBe(id === 'vladik2');
    }
  });

  it('глава I: порог арены в конце уровня ведёт в арену первого босса', () => {
    const w = new World({ seed: 7, mode: 'story', players: 1, fx: true, camp: freshCamp() });
    const bz = w.L.boss;
    expect(bz).toBeTruthy();
    const p = w.players[0]!; p.x = (bz!.trigger + 2) * 32;
    levelBossStep(w);
    expect(w.leaving).toBe(true);
    for (let i = 0; i < 120 && !w.next; i++) w.tick();
    expect(w.next?.camp).toMatchObject({ ch: 1, st: 'arena' });
  });

  it('по сети вход в арену закрыт: сообщение игрокам, не чаще раза в 4 секунды', () => {
    const w = new World({ seed: 7, mode: 'story', players: 1, fx: true, camp: freshCamp(), online: 'host' });
    expect(netBossBlock(w)).toBe(true);
    const n = w.fxq.filter((e) => e['k'] === 'toast').length;
    expect(n).toBeGreaterThan(0);
    expect(netBossBlock(w)).toBe(true);
    expect(w.fxq.filter((e) => e['k'] === 'toast').length).toBe(n);
    const offline = new World({ seed: 7, mode: 'story', players: 1, camp: freshCamp() });
    expect(netBossBlock(offline)).toBe(false);
  });
});
