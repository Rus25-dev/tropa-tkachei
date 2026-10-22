import { expect, test, type Page } from '@playwright/test';

import './tt';

// Игра v2 на Phaser 4 (WebGL): запуск, режимы, ввод, масштаб в родном разрешении, сенсорное управление.

// Качество «низкое»: на CI графика идёт программно (SwiftShader), свечение и цветокоррекция роняют кадры ниже 10 в секунду, и тики логики (кадр ≤ 100 мс) отстают
async function boot(page: Page, url = '/'): Promise<void> {
  await page.addInitScript(() => { try { localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low' })); } catch { /* нет доступа */ } });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__tt && window.__tt.game.scene.isActive('game'));
}
// Самая сильная отдача вверх за время наблюдения: на CI кадры редкие (5 в секунду), мгновенное vy можно «проскочить»
const watchJump = (page: Page) => page.evaluate(() => { const w = window.__tt!.shared.session!.world, o = { min: 0 }; (window as unknown as { __jv: typeof o }).__jv = o; const id = setInterval(() => { o.min = Math.min(o.min, w['players'][0].vy); }, 5); setTimeout(() => clearInterval(id), 4000); });
const jumpMin = (page: Page) => page.evaluate(() => (window as unknown as { __jv: { min: number } }).__jv.min);
const start = (page: Page, p: object) => page.evaluate((x) => window.__tt!.start(x), p);
const st = (page: Page) => page.evaluate(() => { const w = window.__tt!.shared.session!.world; return { tick: w.tickN, x: w.players[0]!.x, y: w.players[0]!.y, vy: w.players[0]!.vy, g: w.players[0]!.onGround, hp: w.players[0]!.hp }; });

test('игра стартует на WebGL, версия на экране, меню видно', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  expect(await page.evaluate(() => window.__tt!.game.renderer.type)).toBe(2); // Phaser.WEBGL
  await expect(page.getByTestId('menu-version')).toContainText('2.6.0');
  await expect(page.getByTestId('panel-root')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [name, p] of [
  ['глава I (новая)', { kind: 'story', fresh: true }],
  ['босс-тест: Первый Кающийся', { kind: 'bosstest', boss: 'penitent' }],
  ['босс-тест: Миша', { kind: 'bosstest', boss: 'misha2' }],
  ['босс-тест: Владик', { kind: 'bosstest', boss: 'vladik2' }],
  ['босс-тест: Тима', { kind: 'bosstest', boss: 'tima2' }],
  ['вдвоём', { kind: 'story', fresh: true, players: 2 }],
  ['босс-раш', { kind: 'boss' }],
] as const) {
  test(`режим «${name}»: идёт, тики ≈ 60 в секунду, без ошибок`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await boot(page); await start(page, p);
    await page.waitForTimeout(500);
    const a = await st(page); await page.waitForTimeout(1000); const b = await st(page);
    // на CI кадры идут программно (SwiftShader) и редко, а длина кадра для логики ограничена 100 мс: тут проверяем лишь, что мир живёт; точный темп 60 тиков — в юнит-тестах
    expect(b.tick - a.tick).toBeGreaterThan(15);
    expect(b.tick - a.tick).toBeLessThan(80);
    expect(errors).toEqual([]);
  });
}

test('клавиатура: бег и прыжок', async ({ page }) => {
  await boot(page); await start(page, { kind: 'story', fresh: true });
  await page.waitForTimeout(600);
  const x0 = (await st(page)).x;
  await page.keyboard.down('KeyD'); await page.waitForTimeout(600); await page.keyboard.up('KeyD');
  expect((await st(page)).x).toBeGreaterThan(x0 + 80);
  await watchJump(page);
  await page.keyboard.down('Space'); await page.waitForTimeout(500); await page.keyboard.up('Space');
  await page.waitForTimeout(1200);
  expect(await jumpMin(page)).toBeLessThan(0);
});

test('родное разрешение: холст = размер окна × devicePixelRatio, поле целиком на экране', async ({ browser }) => {
  for (const [w, h, dpr] of [[667, 375, 2], [844, 390, 3], [1366, 768, 1], [1920, 1080, 1]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await boot(page); await start(page, { kind: 'bosstest', boss: 'misha2' });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => { const c = window.__tt!.game.canvas, b = c.getBoundingClientRect(); return { pw: c.width, ph: c.height, l: b.left, t: b.top, w: b.width, h: b.height, iw: innerWidth, ih: innerHeight }; });
    expect(r.w).toBeCloseTo(r.iw, 0); expect(r.h).toBeCloseTo(r.ih, 0);
    expect(r.pw).toBe(Math.round(r.iw * Math.min(2, dpr))); // на ретине не больше ×2
    expect(r.ph).toBe(Math.round(r.ih * Math.min(2, dpr)));
    await ctx.close();
  }
});

test('касание: кнопка прыжка даёт прыжок, как клавиатура', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const page = await ctx.newPage();
  await boot(page, '/?touch=1'); await start(page, { kind: 'story', fresh: true });
  await expect(page.getByTestId('touchpad')).toBeVisible();
  await page.waitForTimeout(600);
  await watchJump(page);
  await page.locator('[data-btn=jump]').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
  await page.waitForTimeout(500);
  await page.locator('[data-btn=jump]').dispatchEvent('pointerup', { pointerId: 1, isPrimary: true });
  await page.waitForTimeout(1200);
  expect(await jumpMin(page)).toBeLessThan(0);
  await ctx.close();
});

test('пауза → «В главное меню» возвращает на заставку', async ({ page }) => {
  await boot(page); await start(page, { kind: 'bosstest', boss: 'tima2' });
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-title')).toBeVisible();
  await page.getByTestId('pause-exit').click();
  await expect(page.getByTestId('panel-root')).toBeVisible();
  expect(await page.evaluate(() => window.__tt!.shared.session)).toBeNull();
});

test('?dev=1: ползунки баланса появляются, в обычном режиме их нет', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.lil-gui')).toHaveCount(0);
  await boot(page, '/?dev=1');
  await expect(page.locator('.lil-gui').first()).toBeVisible();
});
