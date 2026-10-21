import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import './tt';

// Кооператив по сети в двух окнах Chromium: локальный PeerJS-сервер, WebRTC между вкладками.
const require = createRequire(import.meta.url);
const PORT = 9155;
let server: { close?: () => void } | null = null;
test.beforeAll(() => { const { PeerServer } = require('peer') as { PeerServer: (o: { port: number; path: string }) => { close?: () => void } }; server = PeerServer({ port: PORT, path: '/' }); });
test.afterAll(() => { server?.close?.(); });

const q = `peer=localhost:${PORT}`;
async function boot(page: Page, url: string): Promise<void> {
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('tt_init')) { sessionStorage.setItem('tt_init', '1'); localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low' })); } } catch { /* нет доступа */ } });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__tt && window.__tt.game.scene.isActive('game'));
}
const world = (page: Page) => page.evaluate(() => { const w = window.__tt!.shared.session?.world; return w ? { online: w['online'], n: w['players'].length, remote: w['players'].map((p: { remote?: boolean }) => !!p.remote), x: w['players'].map((p: { x: number }) => Math.round(p.x)), tick: w['tickN'] } : null; });

test('два окна: комната по коду, оба в игре, напарник виден и двигается', async ({ browser }) => {
  test.setTimeout(120_000);
  const hostCtx = await browser.newContext(), guestCtx = await browser.newContext();
  const host = await hostCtx.newPage(), guest = await guestCtx.newPage();
  const errs: string[] = [];
  for (const p of [host, guest]) p.on('pageerror', (e) => errs.push(e.message));
  await boot(host, `/?${q}`);
  await host.getByTestId('m-campaign').click();
  await host.getByTestId('c-new').click();
  await host.getByTestId('md-net').click();
  await host.getByTestId('net-host').click();
  await expect(host.getByTestId('lb-code')).not.toHaveText('·····', { timeout: 20_000 });
  const code = (await host.getByTestId('lb-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  await boot(guest, `/?${q}&room=${code}`);
  await expect.poll(() => world(host), { timeout: 40_000 }).toMatchObject({ online: 'host', n: 2 });
  await expect.poll(() => world(guest), { timeout: 40_000 }).toMatchObject({ online: 'guest', n: 2 });
  await host.waitForTimeout(800);
  const gx0 = (await world(host))!.x[1]!;
  await guest.keyboard.down('KeyD'); await guest.waitForTimeout(1500); await guest.keyboard.up('KeyD');
  await host.waitForTimeout(800);
  expect((await world(host))!.x[1]!).toBeGreaterThan(gx0 + 60);
  // выход гостя через паузу: хост играет дальше один
  await guest.keyboard.press('Escape');
  await guest.getByTestId('pause-exit').click();
  await expect(guest.getByTestId('panel-root')).toBeVisible();
  await expect.poll(async () => (await world(host))!.n, { timeout: 40_000 }).toBe(1);
  expect(errs).toEqual([]);
  await hostCtx.close(); await guestCtx.close();
});
