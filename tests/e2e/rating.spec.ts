import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Публичная страница рейтинга (rating.html): таблица, профиль, гонка, заглушки и вёрстка на разных экранах. Одно окно, WebGL не нужен.
const SIZES: [number, number][] = [[667, 375], [844, 390], [932, 430], [1366, 768], [1920, 1080]];
const FILE = '**/data/races.json';

async function layout(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const out = { hscroll: document.documentElement.scrollWidth > innerWidth + 1, small: [] as string[], font: [] as string[], over: [] as string[] };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.rt-back, .rt-tab, .rt-segb, .rt-btn, .rt-crumb a, .rt-cell'))) {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (b.height < 43.5) out.small.push(`${(el.textContent ?? '').trim().slice(0, 24)} ${Math.round(b.height)}`);
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.rt *'))) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 11.5) out.font.push(`${el.className} ${getComputedStyle(el).fontSize}`);
    }
    // шапка: «В игру», название и счётчик не наезжают друг на друга
    const hs = Array.from(document.querySelectorAll<HTMLElement>('.rt-head > *')).map((e) => e.getBoundingClientRect());
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      const a = hs[i]!, b = hs[j]!;
      if (a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1) out.over.push(`head ${i}/${j}`);
    }
    return out;
  });
  expect(r, name).toEqual({ hscroll: false, small: [], font: [], over: [] });
}

test('рейтинг: таблица, профиль игрока с графиком, страница гонки со сплитами', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/rating.html');
  const table = page.getByTestId('rt-table');
  await expect(table).toBeVisible();
  const rows = table.locator('tbody tr');
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  // рейтинг отсортирован по убыванию Эло
  const elo = await rows.locator('.rt-elo').allInnerTexts();
  expect(elo.map(Number)).toEqual([...elo.map(Number)].sort((a, b) => b - a));
  // вкладка дисциплины
  await page.getByTestId('tab-boss').click();
  await expect(page).toHaveURL(/#\/disc\/boss$/);
  await expect(page.locator('h1')).toHaveText('Босс-раш');
  await page.getByTestId('tab-all').click();
  // профиль
  const name = (await rows.first().locator('a').innerText()).trim();
  await rows.first().locator('a').click();
  await expect(page).toHaveURL(/#\/player\//);
  await expect(page.getByTestId('player-name')).toHaveText(name);
  await expect(page.getByTestId('elo-chart').locator('canvas')).toBeVisible();
  expect(Number(await page.getByTestId('elo-chart').getAttribute('data-points'))).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('records')).toContainText('Лучшее время');
  await expect(page.getByTestId('h2h').locator('tbody tr').first()).toBeVisible();
  await page.getByRole('button', { name: 'Тропа целиком' }).click();
  await expect(page.getByRole('button', { name: 'Тропа целиком' })).toHaveAttribute('aria-pressed', 'true');
  // гонка
  await page.getByTestId('race-link').first().click();
  await expect(page).toHaveURL(/#\/race\//);
  await expect(page.getByTestId('race-meta')).toContainText('зерно');
  await expect(page.getByTestId('splits').locator('tbody tr')).toHaveCount(4);
  await expect(page.getByTestId('splits')).toContainText('Гл. I');
  // кнопка «назад» браузера возвращает в профиль, ссылка на игрока из карточки гонки ведёт в его профиль
  await page.goBack();
  await expect(page).toHaveURL(/#\/player\//);
  // прямые ссылки: неизвестный игрок и гонка
  await page.goto('/rating.html#/player/Никто');
  await expect(page.getByTestId('rt-notfound')).toContainText('Никто');
  await page.goto('/rating.html#/race/нет-такой');
  await expect(page.getByTestId('rt-notfound')).toBeVisible();
  expect(errs).toEqual([]);
});

test('рейтинг: нет файла, пустой файл и чужой файл — понятная заглушка', async ({ page }) => {
  await page.route(FILE, (r) => r.fulfill({ status: 404, body: 'not found' }));
  await page.goto('/rating.html');
  await expect(page.getByTestId('rt-stub')).toContainText('Рейтинга пока нет');
  await expect(page.getByTestId('rt-stub')).toContainText('data/races.json');
  await page.unroute(FILE);
  await page.route(FILE, (r) => r.fulfill({ status: 200, body: JSON.stringify({ format: 'tropa-tkachei/races', version: 1, races: [] }) }));
  await page.goto('/rating.html');
  await expect(page.getByTestId('rt-stub')).toContainText('Рейтинг пока пуст');
  await page.unroute(FILE);
  await page.route(FILE, (r) => r.fulfill({ status: 200, body: '{"format":"чужой"}' }));
  await page.goto('/rating.html');
  await expect(page.getByTestId('rt-stub')).toContainText('не архив гонок');
  await page.unroute(FILE);
  await page.route(FILE, (r) => r.fulfill({ status: 200, body: '' }));
  await page.goto('/rating.html');
  await expect(page.getByTestId('rt-stub')).toContainText('Рейтинг пока пуст');
});

test('рейтинг: ссылка из меню «Гонки Ткачей» и из архива открывает страницу', async ({ page, context }) => {
  await page.addInitScript(() => { try { localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low' })); } catch { /* нет доступа */ } });
  await page.goto('/');
  await page.waitForSelector('[data-testid=panel-root]');
  await page.getByTestId('m-races').click();
  const item = page.getByTestId('rc-5');
  await expect(item).toContainText('Рейтинг');
  const [pop] = await Promise.all([context.waitForEvent('page'), item.click()]);
  await expect(pop).toHaveURL(/rating\.html$/);
  await expect(pop.getByTestId('rt-table')).toBeVisible();
  await pop.close();
  await page.getByTestId('rc-4').click();
  await expect(page.getByTestId('arch-rating-link')).toBeVisible();
});

for (const [W, H] of SIZES) {
  test(`рейтинг: вёрстка ${W}×${H}`, async ({ browser }, info) => {
    const touch = W < 1000;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
    const page = await ctx.newPage();
    const dir = process.env.RATING_SHOTS || info.outputPath('shots'); mkdirSync(dir, { recursive: true });
    const shot = (n: string): Promise<Buffer> => page.screenshot({ path: `${dir}/${W}x${H}-${n}.png`, fullPage: true });
    await page.goto('/rating.html'); await expect(page.getByTestId('rt-table')).toBeVisible();
    await layout(page, 'таблица'); await shot('home');
    await page.getByTestId('rt-table').locator('tbody a').first().click();
    await expect(page.getByTestId('elo-chart').locator('canvas')).toBeVisible();
    await layout(page, 'профиль'); await shot('player');
    await page.goto('/rating.html#/race/r-240901-a1'); await expect(page.getByTestId('splits')).toBeVisible();
    await layout(page, 'гонка'); await shot('race');
    await page.route(FILE, (r) => r.fulfill({ status: 404, body: '' }));
    await page.goto('/rating.html'); await expect(page.getByTestId('rt-stub')).toBeVisible();
    await layout(page, 'заглушка'); await shot('stub');
    await ctx.close();
  });
}
