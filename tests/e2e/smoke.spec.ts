import { expect, test, type Page } from '@playwright/test';

// Каркас v2 (этап 1): игра на Phaser 4 запускается, рисует через WebGL, ввод идёт в формате ядра, поле подстраивается под экран.
interface TT { game: { renderer: { type: number }; scale: { gameSize: { width: number; height: number } }; loop: { actualFps: number } }; state: () => { x: number; y: number; ticks: number; jumps: number; lastEdges: string } }
declare global { interface Window { __tt?: TT } }

async function enter(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!window.__tt);
}
const st = (page: Page) => page.evaluate(() => window.__tt!.state());

test('игра стартует на WebGL, версия на экране', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page);
  expect(await page.evaluate(() => window.__tt!.game.renderer.type)).toBe(2); // Phaser.WEBGL
  await expect(page.getByTestId('version')).toContainText('2.0.0-dev');
  expect(errors).toEqual([]);
});

test('фиксированный шаг: ≈ 60 тиков в секунду', async ({ page }) => {
  await enter(page);
  const a = await st(page); await page.waitForTimeout(1000); const b = await st(page);
  expect(b.ticks - a.ticks).toBeGreaterThan(45);
  expect(b.ticks - a.ticks).toBeLessThan(75);
});

test('клавиатура: бег и прыжок с фронтом нажатия', async ({ page }) => {
  await enter(page);
  const x0 = (await st(page)).x;
  await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
  expect((await st(page)).x).toBeGreaterThan(x0 + 60);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const s = await st(page);
  expect(s.jumps).toBe(1);
  expect(s.lastEdges).toContain('jumpP');
});

test('масштаб: холст помещается в окно на 5 размерах экрана', async ({ page }) => {
  await enter(page);
  for (const [w, h] of [[667, 375], [844, 390], [932, 430], [1366, 768], [1920, 1080]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => { const c = document.querySelector('canvas')!.getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height, iw: innerWidth, ih: innerHeight }; });
    expect(r.l).toBeGreaterThanOrEqual(-1); expect(r.t).toBeGreaterThanOrEqual(-1);
    expect(r.l + r.w).toBeLessThanOrEqual(r.iw + 1); expect(r.t + r.h).toBeLessThanOrEqual(r.ih + 1);
    expect(r.w * r.h).toBeGreaterThan(w * h * 0.5); // поле занимает основную часть экрана
  }
});

test('касание: кнопка прыжка даёт фронт, как клавиатура', async ({ page }) => {
  await enter(page, '/?touch=1');
  await expect(page.getByTestId('touchpad')).toBeVisible();
  const j0 = (await st(page)).jumps;
  await page.locator('[data-btn=jump]').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
  await page.waitForTimeout(100);
  await page.locator('[data-btn=jump]').dispatchEvent('pointerup', { pointerId: 1, isPrimary: true });
  await page.waitForTimeout(300);
  const s = await st(page);
  expect(s.jumps).toBe(j0 + 1);
});
