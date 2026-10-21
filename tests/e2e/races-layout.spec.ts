import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import './tt';

// Вёрстка панелей «Гонок Ткачей» на телефонах, ноутбуке и мониторе: нет горизонтальной прокрутки, кнопки не ниже 44 px, шрифт не мельче 11 px,
// ничего не выходит за экран и не накладывается; окно обсервера целиком внутри экрана. Скриншоты — в test-results/races-shots.
const require = createRequire(import.meta.url);
const PORT = 9157;
let server: { close?: () => void } | null = null;
test.beforeAll(() => { const { PeerServer } = require('peer') as { PeerServer: (o: { port: number; path: string }) => { close?: () => void } }; server = PeerServer({ port: PORT, path: '/' }); mkdirSync('test-results/races-shots', { recursive: true }); });
test.afterAll(() => { server?.close?.(); });
const q = `peer=localhost:${PORT}`;
const SIZES: [number, number][] = [[667, 375], [844, 390], [1366, 768], [1920, 1080]];

async function check(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const out = { hscroll: document.documentElement.scrollWidth > innerWidth + 1, small: [] as string[], font: [] as string[], out: [] as string[], overlap: [] as string[] };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.ov button, .ov select, .ov input'))) {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height || el.closest('[hidden]')) continue;
      if (b.height < 43.5 && !el.closest('.seg')) out.small.push(((el.textContent || el.id || el.className) as string).trim().slice(0, 24) + ' ' + Math.round(b.height));
      if (b.left < -1 || b.right > innerWidth + 1) out.out.push((el.textContent ?? '').trim().slice(0, 24));
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.ov *'))) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11) out.font.push(el.className + ' ' + fs);
    }
    // кнопки одной панели не налезают друг на друга
    const bs = Array.from(document.querySelectorAll<HTMLElement>('.ov:last-of-type button')).filter((e) => e.getClientRects().length).map((e) => ({ r: e.getBoundingClientRect(), t: (e.textContent ?? '').trim().slice(0, 16) }));
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i]!.r, b = bs[j]!.r; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.overlap.push(bs[i]!.t + '×' + bs[j]!.t); }
    return out;
  });
  expect(r, name).toEqual({ hscroll: false, small: [], font: [], out: [], overlap: [] });
}
async function ctxAt(browser: import('@playwright/test').Browser, W: number, H: number, name = ''): Promise<BrowserContext> {
  const touch = W < 1000, ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  await ctx.addInitScript((n) => { try { if (!sessionStorage.getItem('tt_init')) { sessionStorage.setItem('tt_init', '1'); localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low' })); if (n) localStorage.setItem('tt_sr_name', n); } } catch { /* нет доступа */ } }, name);
  return ctx;
}
const boot = async (p: Page, url: string): Promise<void> => { await p.goto(url); await p.waitForFunction(() => !!window.__tt && (window.__tt.game.scene.isActive('game') || window.__tt.game.scene.isActive('watch'))); };

for (const [W, H] of SIZES) {
  test(`вёрстка гонок ${W}×${H}: меню, организатор, архив, игрок, обсервер, гонка 1×1`, async ({ browser }) => {
    test.setTimeout(240_000);
    const shot = (p: Page, n: string) => p.screenshot({ path: `test-results/races-shots/${W}x${H}-${n}.png` });
    const cO = await ctxAt(browser, W, H), cP = await ctxAt(browser, W, H, 'Ива'), cW = await ctxAt(browser, W, H), cD = await ctxAt(browser, W, H);
    const org = await cO.newPage(), pl = await cP.newPage(), wp = await cW.newPage(), du = await cD.newPage();
    // меню «Гонки Ткачей»
    await boot(org, `/?${q}`);
    await org.getByTestId('m-races').click(); await check(org, 'меню гонок'); await shot(org, 'menu');
    await org.getByTestId('rc-1').click(); // Создать гонку
    await expect(org.getByTestId('org-code')).toHaveText(/^[A-Z0-9]{5}$/);
    await expect(org.getByTestId('org-server')).toContainText('на связи', { timeout: 30_000 });
    const code = (await org.getByTestId('org-code').textContent())!.trim();
    await boot(pl, `/?${q}&race=play&room=${code}`);
    await expect(org.getByTestId('org-p1')).toContainText('Ива', { timeout: 40_000 });
    await check(pl, 'игрок в комнате'); await shot(pl, 'player-room');
    await boot(wp, `/?${q}&race=watch&room=${code}`);
    await expect(wp.getByTestId('watch-view')).toBeVisible({ timeout: 40_000 });
    await check(org, 'организатор'); await shot(org, 'org');
    // окно обсервера целиком внутри экрана
    const hud = await wp.evaluate(() => { const r = document.querySelector('.rw-hud')!.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, hs: document.documentElement.scrollWidth > innerWidth + 1 }; });
    expect(hud.l).toBeGreaterThanOrEqual(-1); expect(hud.t).toBeGreaterThanOrEqual(-1); expect(hud.r).toBeLessThanOrEqual(hud.w + 1); expect(hud.b).toBeLessThanOrEqual(hud.h + 1); expect(hud.hs).toBe(false);
    await shot(wp, 'watch');
    // архив
    await org.getByTestId('org-archive').click(); await check(org, 'архив'); await shot(org, 'archive'); await org.keyboard.press('Escape');
    // вход игрока: форма и вход обсервера
    const cP2 = await ctxAt(browser, W, H), p2 = await cP2.newPage();
    await boot(p2, `/?${q}`); await p2.getByTestId('m-races').click(); await p2.getByTestId('rc-3').click(); await check(p2, 'вход игрока'); await shot(p2, 'join');
    await p2.keyboard.press('Escape'); await p2.getByTestId('rc-4').click(); await check(p2, 'вход обсервера'); await shot(p2, 'watchjoin');
    // гонка 1×1
    await boot(du, `/?${q}`); await du.getByTestId('m-speedrun').click(); await du.getByTestId('sr-trail').click(); await du.getByTestId('sc-race').click();
    await check(du, 'гонка 1×1: выбор'); await shot(du, 'duel-choose');
    await du.getByTestId('duel-host').click(); await expect(du.getByTestId('duel-room-code')).toHaveText(/^[A-Z0-9]{5}$/, { timeout: 30_000 });
    await check(du, 'гонка 1×1: комната'); await shot(du, 'duel-room');
    for (const c of [cO, cP, cW, cD, cP2]) await c.close();
  });
}
