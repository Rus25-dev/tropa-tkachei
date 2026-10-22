// Шаблон босса из docs/BOSS_HOWTO.md должен быть рабочим: проходит валидатор, виден в карточках dev, проходим ботом. Документ не расходится с кодом.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { testCards } from '../../src/core/boss/catalog';
import { BOSS_RULES, registerBoss, unregisterBoss } from '../../src/core/boss/registry';
import { validateRaw } from '../../src/core/boss/validate';
import { arenaInfo } from '../../tools/boss/files';
import { runFlawless, scanChains } from '../../tools/bot/nohit';

const md = readFileSync(new URL('../../docs/BOSS_HOWTO.md', import.meta.url), 'utf8');
const template = JSON.parse(/```json\r?\n([\s\S]*?)\r?\n```/.exec(md)![1]!) as Record<string, unknown>;

describe('шаблон из BOSS_HOWTO.md', () => {
  it('валидатор: ни одной ошибки', () => {
    const issues = validateRaw(template, BOSS_RULES, arenaInfo(template['arena'] as string));
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });
  it('регистрируется как dev-карточка, обычным игрокам не виден', () => {
    registerBoss(template);
    expect(testCards(true).map((c) => c.id)).toContain('my_boss'); expect(testCards(false).map((c) => c.id)).not.toContain('my_boss');
    unregisterBoss('my_boss');
  });
  it('no-hit бот: связки проходимы; бой выигрывается без единого удара', () => {
    registerBoss(template);
    const rs = scanChains({ boss: 'my_boss', bossAt: [0.1, 0.5, 0.9], offsets: [-250, -60, 60, 250], seed: 3 });
    for (const r of rs) expect(r.passable, `${r.chain}: ${JSON.stringify(r.fails[0]?.forced)}`).toBe(true);
    const f = runFlawless('my_boss', 1, {}, 300);
    expect(f.won).toBe(true); expect(f.hits).toBe(0);
    unregisterBoss('my_boss');
  }, 240_000);
});
