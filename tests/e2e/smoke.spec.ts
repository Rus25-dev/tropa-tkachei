import { expect, test, type Page } from '@playwright/test';

// Игра v2 на Phaser 4 (WebGL): запуск, режимы, ввод, масштаб в родном разрешении, сенсорное управление.
interface TT {
  game: { renderer: { type: number }; canvas: HTMLCanvasElement; scene: { isActive(k: string): boolean }; loop: { actualFps: number } };
  shared: { session: { world: { tickN: number; players: { x: number; y: number; hp: number; vy: number; onGround: boolean }[]; won: boolean } } | null };
  start(p: unknown): void; stop(): void;
}
declare global { interface Window { __tt?: TT } }

// Качество «низкое»: на CI графика идёт программно (SwiftShader), свечение и цветокоррекция роняют кадры ниже 10 в секунду, и тики логики (кадр ≤ 100 мс) отстают
async function boot(page: Page, url = '/'): Promise<void> {
  await page.addInitScript(() => { try { localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low' })); } catch { /* нет доступа */ } });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__tt && window.__tt.game.scene.isActive('game'));
}
const start = (page: Page, p: object) => page.evaluate((x) => window.__tt!.start(x), p);
const st = (page: Page) => page.evaluate(() => { const w = window.__tt!.shared.session!.world; return { tick: w.tickN, x: w.players[0]!.x, y: w.players[0]!.y, vy: w.players[0]!.vy, g: w.players[0]!.onGround, hp: w.players[0]!.hp }; });

test('игра стартует на WebGL, версия на экране, меню видно', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  expect(await page.evaluate(() => window.__tt!.game.renderer.type)).toBe(2); // Phaser.WEBGL
  await expect(page.getByTestId('version')).toContainText('2.0.0-dev');
  await expect(page.getByTestId('devmenu')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [name, p] of [
  ['глава I (новая)', { kind: 'story', fresh: true }],
  ['босс-тест: Миша', { kind: 'bosstest', boss: 'misha' }],
  ['босс-тест: Владик', { kind: 'bosstest', boss: 'vladik' }],
  ['босс-тест: Тима', { kind: 'bosstest', boss: 'tima' }],
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
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  expect((await st(page)).vy).toBeLessThan(0);
});

test('родное разрешение: холст = размер окна × devicePixelRatio, поле целиком на экране', async ({ browser }) => {
  for (const [w, h, dpr] of [[667, 375, 2], [844, 390, 3], [1366, 768, 1], [1920, 1080, 1]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await boot(page); await start(page, { kind: 'bosstest', boss: 'misha' });
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
  await page.locator('[data-btn=jump]').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
  await page.waitForTimeout(100);
  await page.locator('[data-btn=jump]').dispatchEvent('pointerup', { pointerId: 1, isPrimary: true });
  expect((await st(page)).vy).toBeLessThan(0);
  await ctx.close();
});

test('«В меню» возвращает на заставку', async ({ page }) => {
  await boot(page); await start(page, { kind: 'bosstest', boss: 'tima' });
  await page.waitForTimeout(300);
  await page.getByTestId('menu-back').click();
  await expect(page.getByTestId('devmenu')).toBeVisible();
  expect(await page.evaluate(() => window.__tt!.shared.session)).toBeNull();
});
