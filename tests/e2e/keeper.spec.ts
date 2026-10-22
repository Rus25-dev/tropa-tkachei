import { expect, test } from '@playwright/test';
import './tt';

test('Хранительница: зал, три фазы, перезапуск без ошибок отрисовки', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__tt && window.__tt.game.scene.isActive('game'));
  for (const phase of [1, 2, 3]) {
    await page.evaluate((trainPhase) => window.__tt!.start({ kind: 'bosstest', boss: 'keeper', train: true, trainPhase }), phase);
    await page.waitForFunction(() => (window.__tt!.shared.session?.world.tickN ?? 0) > 200);
    const state = await page.evaluate(() => {
      const w = window.__tt!.shared.session!.world;
      return { arena: w.L.arena, phase: w.bosses[0].phase, bodies: w.bosses.length, width: w.L.W };
    });
    expect(state).toEqual({ arena: 'keeper', phase, bodies: 1, width: 38 });
    await page.screenshot({ path: info.outputPath(`keeper-phase-${phase}.png`) });
    await page.keyboard.press('KeyY');
    await expect.poll(() => page.evaluate(() => window.__tt!.shared.session!.world.train.resets)).toBe(1);
  }
  expect(errors).toEqual([]);
});
