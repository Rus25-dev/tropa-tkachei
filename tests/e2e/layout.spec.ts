import { expect, test, type Page } from '@playwright/test';
import './tt';

// Вёрстка интерфейса на разных экранах: нет горизонтальной прокрутки, кнопки не меньше 44 px по высоте, шрифт не мельче 11 px,
// пункты и панели не вылезают за экран. Размеры: телефоны в альбомной ориентации, ноутбук, монитор.
const SIZES: [number, number][] = [[667, 375], [844, 390], [932, 430], [1366, 768], [1920, 1080]];

async function check(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const out = { hscroll: document.documentElement.scrollWidth > innerWidth + 1, small: [] as string[], font: [] as string[], out: [] as string[] };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.ov button, .ov select, #touch button'))) {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height || el.closest('[hidden]')) continue;
      if (b.height < 43.5 && !el.closest('.seg')) out.small.push(((el.textContent || el.id || el.className) as string).trim().slice(0, 24) + ' ' + Math.round(b.height));
      if (b.left < -1 || b.right > innerWidth + 1) out.out.push((el.textContent ?? '').trim().slice(0, 24));
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.ov *'))) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11) out.font.push(el.className + ' ' + fs);
    }
    // строка версии главного меню не должна заезжать на пункты
    const tl = document.querySelector('.topline')?.getBoundingClientRect();
    if (tl) for (const m of Array.from(document.querySelectorAll('.mi'))) { const b = m.getBoundingClientRect(); if (tl.right > b.left && tl.left < b.right && tl.bottom > b.top && tl.top < b.bottom) out.out.push('topline×' + (m.textContent ?? '').trim().slice(0, 16)); }
    return out;
  });
  expect(r, name).toEqual({ hscroll: false, small: [], font: [], out: [] });
}

for (const [W, H] of SIZES) {
  test(`вёрстка ${W}×${H}: меню, как играть, настройки, пауза`, async ({ browser }) => {
    test.setTimeout(240_000);
    const touch = W < 1000;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low' })); } catch { /* нет доступа */ } });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForSelector('[data-testid=panel-root]');
    const go = async (id: string): Promise<void> => { await page.getByTestId(id).click(); await page.waitForTimeout(120); };
    const back = async (): Promise<void> => { await page.keyboard.press('Escape'); await page.waitForTimeout(120); };
    await check(page, 'main');
    await go('m-campaign'); await check(page, 'campaign'); await back();
    await go('m-bosstest'); await check(page, 'bosstest'); await back();
    await go('m-speedrun'); await check(page, 'speedrun'); await go('sr-trail'); await check(page, 'srcat'); await back(); await back();
    await go('m-races'); await check(page, 'races'); await back();
    await go('m-howto'); await check(page, 'howto-0');
    for (let t = 1; t < 4; t++) { await page.locator('.tab').nth(t).click(); await check(page, `howto-${t}`); }
    await back();
    await go('m-settings'); await check(page, 'settings');
    for (const s of ['sound', 'screen', 'controls', 'game', 'progress']) { await go(`st-go-${s}`); await check(page, `settings-${s}`); await back(); }
    await back();
    await go('open-changelog'); await check(page, 'changelog'); await back();
    await page.evaluate(() => window.__tt!.start({ kind: 'story', fresh: true }));
    await page.waitForFunction(() => (window.__tt!.shared.session?.world['tickN'] ?? 0) > 5);
    await page.keyboard.press('Escape'); await expect(page.getByTestId('pause-title')).toBeVisible(); await check(page, 'pause');
    await page.getByTestId('pause-gear').click(); await check(page, 'gear');
    await ctx.close();
  });
}
