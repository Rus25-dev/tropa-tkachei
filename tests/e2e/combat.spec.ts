import { expect, test } from '@playwright/test';
import './tt';

test('отдельный отбив работает с полной нитью через настоящую клавиатуру', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low' })));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__tt && window.__tt.game.scene.isActive('game'));
  await page.evaluate(() => window.__tt!.start({ kind: 'bosstest', boss: 'misha2' }));
  await page.waitForFunction(() => !!window.__tt!.shared.session?.world.players[0]);
  await page.evaluate(() => {
    const w = window.__tt!.shared.session!.world, p = w.players[0];
    p.silk = w.silkMax; p.hp--; p.onGround = true;
  });
  await page.keyboard.down('KeyT');
  await page.waitForFunction(() => window.__tt!.shared.session!.world.players[0].parryT > 0);
  const state = await page.evaluate(() => {
    const w = window.__tt!.shared.session!.world, p = w.players[0];
    return { heal: p.healCh || 0, silk: p.silk, max: w.silkMax };
  });
  await page.keyboard.up('KeyT');
  expect(state.heal).toBe(0); expect(state.silk).toBe(state.max);
  expect(errors).toEqual([]);
});

test('явное лечение без нити не становится отбивом', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__tt && window.__tt.game.scene.isActive('game'));
  await page.evaluate(() => window.__tt!.start({ kind: 'bosstest', boss: 'misha2' }));
  await page.waitForFunction(() => !!window.__tt!.shared.session?.world.players[0]);
  await page.evaluate(() => { const p = window.__tt!.shared.session!.world.players[0]; p.silk = 0; p.hp--; });
  const before = await page.evaluate(() => window.__tt!.shared.session!.world.tickN);
  await page.keyboard.down('KeyY');
  await page.waitForFunction((tick) => window.__tt!.shared.session!.world.tickN > tick + 3, before);
  await page.keyboard.up('KeyY');
  expect(await page.evaluate(() => window.__tt!.shared.session!.world.players[0].parryT || 0)).toBeLessThanOrEqual(0);
});
