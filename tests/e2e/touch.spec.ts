import { expect, test, type Page, type BrowserContext, type Browser } from '@playwright/test';
import './tt';

const want = expect.configure({ timeout: 20_000 }); // без видеокарты (CI, облако) кадры идут редко

// Сенсорное управление: удержание за пальцами, сброс при потере фокуса, отдельные отбив / лечение / всполох,
// инструмент по слоту стика с запасом, гистерезис стика, область касания при маленьких кнопках, расстановка кнопок.
const LO = { weapon: 'needle', tool: 'throwneedle', toolSlots: { up: 'trap', down: 'threadbomb' }, charms: [], have: { weapons: ['needle'], tools: ['throwneedle', 'trap', 'threadbomb'], charms: [] } };

async function open(browser: Browser, W: number, H: number, extra: object = {}): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(([lo, ex]) => { try { localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low', ...ex })); localStorage.setItem('tt_loadout', JSON.stringify(lo)); } catch { /* нет доступа */ } }, [LO, extra] as const);
  const page = await ctx.newPage(), errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?touch=1');
  await page.waitForFunction(() => !!window.__tt && window.__tt.game.scene.isActive('game'));
  return { ctx, page, errors };
}
async function fight(page: Page): Promise<void> {
  await page.evaluate(() => window.__tt!.start({ kind: 'bosstest', boss: 'keeper' }));
  await page.waitForFunction(() => (window.__tt!.shared.session?.world['tickN'] ?? 0) > 30);
  await expect(page.getByTestId('touchpad')).toBeVisible();
}
const ptr = (page: Page, sel: string, type: string, id: number, x?: number, y?: number) => page.locator(sel).dispatchEvent(type, { pointerId: id, isPrimary: id === 1, ...(x !== undefined ? { clientX: x, clientY: y } : {}) });
const p0 = (page: Page) => page.evaluate(() => { const p = window.__tt!.shared.session!.world['players'][0]; return { parryCd: p.parryCd as number, healCh: (p.healCh as number) || 0, silk: p.silk as number, inpUp: !!p.inp?.up }; });
const held = (page: Page, b: string) => page.locator(`[data-btn=${b}]`).evaluate((el) => el.classList.contains('on'));

test('удержание закреплено за пальцами; потеря фокуса и сворачивание отпускают всё', async ({ browser }) => {
  const { ctx, page, errors } = await open(browser, 844, 390);
  await fight(page);
  await ptr(page, '[data-btn=jump]', 'pointerdown', 11); await ptr(page, '[data-btn=jump]', 'pointerdown', 12);
  await ptr(page, '[data-btn=jump]', 'pointerup', 12);
  expect(await held(page, 'jump')).toBe(true); // второй палец ушёл, первый ещё держит
  await ptr(page, '[data-btn=jump]', 'pointerup', 11);
  expect(await held(page, 'jump')).toBe(false);
  await ptr(page, '[data-btn=atk]', 'pointerdown', 13);
  expect(await held(page, 'atk')).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(50);
  expect(await held(page, 'atk')).toBe(false);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('отдельные отбив, лечение и всполох; инструмент по слоту стика с запасом и гистерезисом', async ({ browser }) => {
  const { ctx, page, errors } = await open(browser, 844, 390);
  await fight(page);
  await ptr(page, '[data-btn=parry]', 'pointerdown', 21); await page.waitForTimeout(60); await ptr(page, '[data-btn=parry]', 'pointerup', 21);
  await page.waitForTimeout(40);
  expect((await p0(page)).parryCd).toBeGreaterThan(0);
  // полная нить и ранение: «Лечение» лечит, а не отбивает
  await page.evaluate(() => { const p = window.__tt!.shared.session!.world['players'][0]; p.silk = 9; p.hp = p.maxHp - 1; p.parryCd = 0; });
  await page.waitForTimeout(50);
  await want(page.locator('[data-btn=heal]')).toHaveClass(/ready/);
  await ptr(page, '[data-btn=heal]', 'pointerdown', 22); await page.waitForTimeout(60); await ptr(page, '[data-btn=heal]', 'pointerup', 22);
  await page.waitForTimeout(40);
  const h = await p0(page); expect(h.healCh).toBeGreaterThan(0); expect(h.parryCd).toBeLessThanOrEqual(0); // отбива не было
  // всполох
  // лечение уже проверено: обрываем его, чтобы не ждать 1,1 с игрового времени (без видеокарты кадры редкие)
  await page.evaluate(() => { const p = window.__tt!.shared.session!.world['players'][0]; p.healCh = 0; p.healT = 0; p.silk = 6; });
  await ptr(page, '[data-btn=burst]', 'pointerdown', 23); await page.waitForTimeout(60); await ptr(page, '[data-btn=burst]', 'pointerup', 23);
  await page.waitForTimeout(40);
  expect((await p0(page)).silk).toBeLessThan(6);
  // инструмент: прямо — игла (6), стик вверх — капкан, дрожание у границы слот не меняет
  await want(page.locator('[data-btn=tool]')).toHaveAttribute('data-tool', 'throwneedle');
  await want(page.locator('[data-btn=tool] .t-ammo')).toHaveText('6');
  const z = page.getByTestId('stick'), zb = (await z.boundingBox())!, sx = zb.x + 120, sy = zb.y + zb.height - 90;
  await ptr(page, '[data-testid=stick]', 'pointerdown', 24, sx, sy);
  await ptr(page, '[data-testid=stick]', 'pointermove', 24, sx, sy - 35);
  await want(page.locator('[data-btn=tool]')).toHaveAttribute('data-tool', 'trap');
  await ptr(page, '[data-testid=stick]', 'pointermove', 24, sx, sy - 22); // между порогами: слот держится
  await page.waitForTimeout(150);
  await want(page.locator('[data-btn=tool]')).toHaveAttribute('data-tool', 'trap');
  await ptr(page, '[data-btn=tool]', 'pointerdown', 25); await page.waitForTimeout(60); await ptr(page, '[data-btn=tool]', 'pointerup', 25);
  await want(page.locator('[data-btn=tool] .t-ammo')).toHaveText('2');
  await ptr(page, '[data-testid=stick]', 'pointermove', 24, sx, sy - 10);
  await want(page.locator('[data-btn=tool]')).toHaveAttribute('data-tool', 'throwneedle');
  await ptr(page, '[data-testid=stick]', 'pointerup', 24, sx, sy - 10);
  expect(errors).toEqual([]);
  await ctx.close();
});

for (const [W, H, size] of [[667, 320, 'S'], [667, 375, 'M'], [932, 430, 'L']] as const) {
  test(`кнопки ${W}×${H}, размер ${size}: в экране, не перекрываются, область касания не меньше 44 px`, async ({ browser }) => {
    const { ctx, page } = await open(browser, W, H, { bsize: size });
    await fight(page);
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const ts = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts')) || 1;
      return Array.from(document.querySelectorAll<HTMLElement>('#touch .t-btn')).filter((b) => !b.hidden).map((b) => {
        const rc = b.getBoundingClientRect(), hit = parseFloat(getComputedStyle(b, '::before').width) * ts;
        return { k: b.dataset['btn']!, x: rc.x, y: rc.y, w: rc.width, h: rc.height, hit };
      });
    });
    for (const a of r) { expect(a.hit, a.k).toBeGreaterThanOrEqual(44); expect(a.x, a.k).toBeGreaterThanOrEqual(-1); expect(a.x + a.w, a.k).toBeLessThanOrEqual(W + 1); expect(a.y + a.h, a.k).toBeLessThanOrEqual(H + 1); }
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const a = r[i]!, b = r[j]!;
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.k}×${b.k}`).toBe(false);
    }
    await ctx.close();
  });
}

test('расстановка кнопок: перетаскивание сохраняется, «Сбросить» возвращает', async ({ browser }) => {
  const { ctx, page } = await open(browser, 844, 390);
  await page.getByTestId('m-settings').click(); await page.getByTestId('st-go-controls').click();
  await page.locator('#st-tedit').click();
  await expect(page.getByTestId('touch-editor')).toBeVisible();
  const b = page.locator('[data-testid=touch-editor] [data-btn=parry]'), bb = (await b.boundingBox())!;
  const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
  await b.dispatchEvent('pointerdown', { pointerId: 31, isPrimary: true, clientX: cx, clientY: cy });
  await page.getByTestId('touch-editor').dispatchEvent('pointermove', { pointerId: 31, isPrimary: true, clientX: cx - 40, clientY: cy - 20 });
  await page.getByTestId('touch-editor').dispatchEvent('pointerup', { pointerId: 31, isPrimary: true, clientX: cx - 40, clientY: cy - 20 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tt_settings') ?? '{}').tpos?.parry as [number, number] | undefined);
  expect(saved && saved[0]).toBeLessThan(0);
  const moved = (await b.boundingBox())!; expect(moved.x).toBeLessThan(bb.x - 20);
  await page.getByTestId('touch-edit-reset').click();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tt_settings') ?? '{}').tpos ?? {}).length)).toBe(0);
  await page.getByTestId('touch-edit-done').click();
  await expect(page.getByTestId('touch-editor')).toHaveCount(0);
  await ctx.close();
});
