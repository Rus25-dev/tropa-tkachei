import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import './tt';

// «Гонки Ткачей» в нескольких окнах Chromium: организатор, два игрока, обсервер и локальный PeerJS-сервер (WebRTC между вкладками).
// Прохождение забега заменено финишем через window.__tt.debug.srFinish (как в ui.spec.ts): здесь проверяется сеть, журнал и панели.
const require = createRequire(import.meta.url);
const PORT = 9156;
let server: { close?: () => void } | null = null;
test.beforeAll(() => { const { PeerServer } = require('peer') as { PeerServer: (o: { port: number; path: string }) => { close?: () => void } }; server = PeerServer({ port: PORT, path: '/' }); });
test.afterAll(() => { server?.close?.(); });

const q = `peer=localhost:${PORT}`;
async function ctxWith(browser: import('@playwright/test').Browser, name?: string): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await ctx.addInitScript((n) => { try { if (!sessionStorage.getItem('tt_init')) { sessionStorage.setItem('tt_init', '1'); localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low' })); if (n) localStorage.setItem('tt_sr_name', n); } } catch { /* нет доступа */ } }, name ?? '');
  return ctx;
}
async function boot(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__tt && (window.__tt.game.scene.isActive('game') || window.__tt.game.scene.isActive('watch')));
}
const run = (page: Page) => page.evaluate(() => { const s = window.__tt!.shared.session, r = s?.world['sr']; return r ? { hold: !!r.hold, rc: !!r.rc, t0: r.t0 != null, tp: r.tp != null, done: !!r.done, restored: r.restored | 0, tick: s!.world['tickN'] as number, splits: r.splits.length, seed: s!.world['seed'] as number } : null; });
const finish = (page: Page, ms: number) => page.evaluate((t) => {
  const w = window.__tt!.shared.session!.world, r = w['sr'];
  r.t0 = r.clock() - t; r.igt = t - 1000; r.splits = [1, 2, 3, 4].map((k) => ({ rta: Math.round(t * k / 4), igt: Math.round((t - 1000) * k / 4) }));
  window.__tt!.debug.srFinish(w);
}, ms);

test('гонка: организатор, два игрока и обсервер — отсчёт, забеги, итог в архиве', async ({ browser }) => {
  test.setTimeout(240_000);
  test.skip(!!process.env.CI, 'много окон на программном GL в CI не успевают; логика гонки покрыта tests/unit/races.test.ts, локально запускается');
  const [cO, c1, c2, cW] = [await ctxWith(browser), await ctxWith(browser, 'Ива'), await ctxWith(browser, 'Ярь'), await ctxWith(browser)];
  const [org, p1, p2, wp] = [await cO.newPage(), await c1.newPage(), await c2.newPage(), await cW.newPage()];
  const errs: string[] = [];
  for (const p of [org, p1, p2, wp]) p.on('pageerror', (e) => errs.push(e.message));
  await boot(org, `/?${q}&race=org`);
  await expect(org.getByTestId('org-code')).toHaveText(/^[A-Z0-9]{5}$/);
  const code = (await org.getByTestId('org-code').textContent())!.trim();
  await expect(org.getByTestId('org-server')).toContainText('на связи', { timeout: 30_000 });
  await expect(org.getByTestId('org-link-play')).toContainText(`race=play&room=${code}`);
  await boot(p1, `/?${q}&race=play&room=${code}`);
  await boot(p2, `/?${q}&race=play&room=${code}`);
  await boot(wp, `/?${q}&race=watch&room=${code}`);
  await expect(org.getByTestId('org-p1')).toContainText('Ива', { timeout: 40_000 });
  await expect(org.getByTestId('org-p2')).toContainText('Ярь', { timeout: 40_000 });
  await expect(org.getByTestId('org-watchers')).toHaveText('1', { timeout: 40_000 });
  await expect(wp.getByTestId('watch-view')).toBeVisible({ timeout: 40_000 });
  // готовность и старт
  await p1.getByTestId('join-ready').click(); await p2.getByTestId('join-ready').click();
  await expect(org.getByTestId('org-start')).toBeEnabled({ timeout: 30_000 });
  await org.getByTestId('org-start').click();
  await expect.poll(() => run(p1), { timeout: 60_000 }).toMatchObject({ rc: true });
  await expect.poll(() => run(p2), { timeout: 60_000 }).toMatchObject({ rc: true });
  const seeds = [(await run(p1))!.seed, (await run(p2))!.seed];
  expect(seeds[0]).toBe(seeds[1]);
  await expect(org.getByTestId('org-phase')).toHaveText('гонка идёт', { timeout: 60_000 });
  await expect.poll(async () => (await run(p1))!.hold || (await run(p2))!.hold, { timeout: 30_000 }).toBe(false);
  // оба бегут: телеметрия доходит до организатора и до обсервера
  await p1.keyboard.down('KeyD'); await p2.keyboard.down('KeyD');
  await expect(org.getByTestId('org-p1-state')).toContainText('Гл.', { timeout: 30_000 });
  await expect(org.getByTestId('org-p2-state')).toContainText('Гл.', { timeout: 30_000 });
  await expect.poll(() => wp.evaluate(() => Object.keys(window.__tt!.races?.watch?.tel ?? {}).length), { timeout: 30_000 }).toBe(2);
  await expect.poll(() => wp.evaluate(() => { const sc = window.__tt!.game.scene as unknown as { getScene(k: string): { views?: Map<number, unknown> } }; return sc.getScene('watch').views?.size ?? 0; }), { timeout: 30_000 }).toBe(2);
  // горячие клавиши обсервера: H — табло, 1 — половина игрока на весь экран, 0 — обе, R затем 1 — повтор
  await expect.poll(() => wp.evaluate(() => (window.__tt!.races?.watch?.hist[Object.keys(window.__tt!.races.watch.hist)[0] as unknown as number]?.length ?? 0)), { timeout: 30_000 }).toBeGreaterThan(3);
  await wp.keyboard.press('KeyH'); await expect(wp.getByTestId('watch-board')).toBeHidden();
  await wp.keyboard.press('KeyH'); await expect(wp.getByTestId('watch-board')).toBeVisible();
  await wp.keyboard.press('Digit1'); await expect.poll(() => wp.evaluate(() => !!window.__tt!.races?.watch?.solo)).toBe(true);
  await wp.keyboard.press('Digit0'); await expect.poll(() => wp.evaluate(() => !!window.__tt!.races?.watch?.solo)).toBe(false);
  await wp.keyboard.press('KeyR'); await wp.keyboard.press('Digit1');
  await expect(wp.getByTestId('watch-replay')).toBeVisible({ timeout: 10_000 });
  await wp.keyboard.press('Digit0'); await expect(wp.getByTestId('watch-replay')).toBeHidden();
  // 2.2: подсплиты, покупка и смерть с потерянным временем из игры игрока доходят до ленты, ленты кампании, таблицы сплитов и полоски соперника
  const emit = (p: Page, f: string) => p.evaluate((src) => { const pl = (window as any).__tt.races.play; (new Function('pl', src))(pl); }, f); // eslint-disable-line @typescript-eslint/no-explicit-any
  await emit(p1, "pl.event('sub', { ch: 1, sk: 'exit' }); pl.event('buy', { id: 'dmg', name: 'Острая игла', ch: 1, price: 12 }); pl.event('death', { ch: 1 }); pl.event('lost', { ms: 4200 });");
  await emit(p2, "pl.event('sub', { ch: 1, sk: 'exit' });");
  await expect(wp.getByTestId('watch-feed')).toContainText('потеряно 4.2 с', { timeout: 30_000 });
  await expect(wp.getByTestId('watch-ribbon')).toBeVisible();
  await expect(org.getByTestId('org-splits-table')).toContainText('выход из коридора', { timeout: 30_000 });
  await expect(org.getByTestId('org-log')).toContainText('Ива купил(а): Острая игла');
  await wp.keyboard.press('KeyT'); await expect(wp.getByTestId('watch-splits-table').locator('tr[data-key="1:exit"]')).toContainText('выход из коридора');
  await wp.keyboard.press('KeyT'); // таблица сама выключена, чтобы не мешать итогам
  await expect(p2.getByTestId('sr-rival')).toContainText('Ива · Гл. I', { timeout: 30_000 });
  await p1.keyboard.up('KeyD'); await p2.keyboard.up('KeyD');
  // финиш: Ива быстрее
  await finish(p1, 120_000); await finish(p2, 125_000);
  await expect(org.getByTestId('org-result')).toContainText('Победитель: Ива', { timeout: 30_000 });
  await expect(wp.getByTestId('watch-over')).toContainText('Победил Ива', { timeout: 30_000 });
  await expect(p1.getByTestId('sr-banner')).toContainText('ПОБЕДА', { timeout: 30_000 });
  await expect(p2.getByTestId('sr-banner')).toContainText('ПОРАЖЕНИЕ', { timeout: 30_000 });
  const arch = await org.evaluate(() => JSON.parse(localStorage.getItem('tt_races') || '[]') as { id: string; discipline: string; players: { name: string; time: number; splits: number[] }[]; winner: string; version: string }[]);
  expect(arch.length).toBe(1);
  expect(arch[0]!.winner).toBe('Ива'); expect(arch[0]!.discipline).toBe('trail'); expect(arch[0]!.players.map((p) => p.name).sort()).toEqual(['Ива', 'Ярь']);
  expect(arch[0]!.players.every((p) => p.time > 100_000 && p.splits.length === 4)).toBe(true);
  // архив в панели
  await org.getByTestId('org-archive').click();
  await expect(org.getByTestId('arch-table')).toContainText('Ива');
  expect(errs).toEqual([]);
  for (const c of [cO, c1, c2, cW]) await c.close();
});

test('перезагрузка игрока: забег восстанавливается по журналу; перезагрузка организатора: тот же код и ход гонки', async ({ browser }) => {
  test.setTimeout(240_000);
  test.skip(!!process.env.CI, 'много окон на программном GL в CI не успевают; логика гонки покрыта tests/unit/races.test.ts, локально запускается');
  const [cO, c1, c2] = [await ctxWith(browser), await ctxWith(browser, 'Ива'), await ctxWith(browser, 'Ярь')];
  const [org, p1, p2] = [await cO.newPage(), await c1.newPage(), await c2.newPage()];
  const errs: string[] = [];
  for (const p of [org, p1, p2]) p.on('pageerror', (e) => errs.push(e.message));
  await boot(org, `/?${q}&race=org`);
  const code = (await org.getByTestId('org-code').textContent())!.trim();
  await expect(org.getByTestId('org-server')).toContainText('на связи', { timeout: 30_000 });
  await boot(p1, `/?${q}&race=play&room=${code}`); await boot(p2, `/?${q}&race=play&room=${code}`);
  await expect(org.getByTestId('org-p2')).toContainText('Ярь', { timeout: 40_000 });
  await p1.getByTestId('join-ready').click(); await p2.getByTestId('join-ready').click();
  await expect(org.getByTestId('org-start')).toBeEnabled({ timeout: 30_000 });
  await org.getByTestId('org-start').click();
  await expect(org.getByTestId('org-phase')).toHaveText('гонка идёт', { timeout: 60_000 });
  await expect.poll(async () => (await run(p1))?.hold, { timeout: 30_000 }).toBe(false);
  await p1.keyboard.down('KeyD'); await p1.waitForTimeout(2600); await p1.keyboard.up('KeyD'); // журнал пишется раз в ~2 с
  const before = (await run(p1))!, x0 = await p1.evaluate(() => Math.round(window.__tt!.shared.session!.world['players'][0].x));
  const jr = await p1.evaluate(() => (localStorage.getItem('tt_jr') || '').length);
  expect(jr).toBeGreaterThan(200);
  // «вкладка упала»: перезагрузка страницы игрока
  await p1.reload();
  await p1.waitForFunction(() => !!window.__tt);
  await expect.poll(async () => (await run(p1))?.restored, { timeout: 90_000 }).toBe(1);
  const after = (await run(p1))!;
  expect(after.rc).toBe(true); expect(after.hold).toBe(false); expect(after.tick).toBeGreaterThanOrEqual(before.tick - 5);
  const x1 = await p1.evaluate(() => Math.round(window.__tt!.shared.session!.world['players'][0].x));
  expect(Math.abs(x1 - x0)).toBeLessThan(40);
  await expect(org.getByTestId('org-log')).toContainText('забег восстановлен по журналу', { timeout: 40_000 });
  await expect(org.getByTestId('org-p1')).toContainText('восстановлен ×1');
  // перезагрузка организатора посреди гонки
  await org.reload();
  await expect(org.getByTestId('org-code')).toHaveText(code, { timeout: 30_000 });
  await expect(org.getByTestId('org-phase')).toHaveText('гонка идёт', { timeout: 30_000 });
  await expect(org.getByTestId('org-server')).toContainText('на связи', { timeout: 60_000 });
  await expect(org.getByTestId('org-p1')).toContainText('пинг', { timeout: 60_000 });
  await expect(org.getByTestId('org-p2')).toContainText('пинг', { timeout: 60_000 });
  // гонка доходит до конца
  await finish(p1, 118_000); await finish(p2, 130_000);
  await expect(org.getByTestId('org-result')).toContainText('Победитель: Ива', { timeout: 40_000 });
  expect(errs).toEqual([]);
  for (const c of [cO, c1, c2]) await c.close();
});

test('техпауза организатора останавливает игроков; «Отменить действие» снимает', async ({ browser }) => {
  test.setTimeout(180_000);
  test.skip(!!process.env.CI, 'много окон на программном GL в CI не успевают; логика гонки покрыта tests/unit/races.test.ts, локально запускается');
  const [cO, c1, c2] = [await ctxWith(browser), await ctxWith(browser, 'Ива'), await ctxWith(browser, 'Ярь')];
  const [org, p1, p2] = [await cO.newPage(), await c1.newPage(), await c2.newPage()];
  await boot(org, `/?${q}&race=org`);
  const code = (await org.getByTestId('org-code').textContent())!.trim();
  await expect(org.getByTestId('org-server')).toContainText('на связи', { timeout: 30_000 });
  await boot(p1, `/?${q}&race=play&room=${code}`); await boot(p2, `/?${q}&race=play&room=${code}`);
  await expect(org.getByTestId('org-p2')).toContainText('Ярь', { timeout: 40_000 });
  await p1.getByTestId('join-ready').click(); await p2.getByTestId('join-ready').click();
  await expect(org.getByTestId('org-start')).toBeEnabled({ timeout: 30_000 });
  await org.getByTestId('org-start').click();
  await expect.poll(async () => (await run(p1))?.hold === false && (await run(p2))?.hold === false, { timeout: 60_000 }).toBe(true);
  await org.getByTestId('org-pause').click();
  await expect.poll(async () => (await run(p1))?.tp && (await run(p2))?.tp, { timeout: 30_000 }).toBe(true);
  await expect(org.getByTestId('org-phase')).toHaveText('ТЕХНИЧЕСКАЯ ПАУЗА');
  await org.getByTestId('org-undo').click();
  await expect.poll(async () => (await run(p1))?.tp || (await run(p2))?.tp, { timeout: 30_000 }).toBe(false);
  // присуждение победы с подтверждением и отмена
  await org.getByTestId('org-aw2').click(); await org.getByTestId('org-yes').click();
  await expect(org.getByTestId('org-result')).toContainText('Победитель: Ярь');
  await org.getByTestId('org-undo').click();
  await expect(org.getByTestId('org-phase')).toHaveText('гонка идёт');
  for (const c of [cO, c1, c2]) await c.close();
});

test('гонка 1×1 из меню «Спидран»: комната по коду, общее зерно, отсчёт, соперник на табличке, итог ПОБЕДА/ПОРАЖЕНИЕ', async ({ browser }) => {
  test.setTimeout(240_000);
  test.skip(!!process.env.CI, 'много окон на программном GL в CI не успевают; логика гонки покрыта tests/unit/races.test.ts, локально запускается');
  const [c1, c2] = [await ctxWith(browser, 'Хост'), await ctxWith(browser, 'Гость')];
  const [h, g] = [await c1.newPage(), await c2.newPage()];
  const errs: string[] = [];
  for (const p of [h, g]) p.on('pageerror', (e) => errs.push(e.message));
  await boot(h, `/?${q}`);
  await h.getByTestId('m-speedrun').click(); await h.getByTestId('sr-trail').click(); await h.getByTestId('sc-race').click();
  await h.getByTestId('duel-host').click();
  await expect(h.getByTestId('duel-room-code')).toHaveText(/^[A-Z0-9]{5}$/, { timeout: 30_000 });
  const code = (await h.getByTestId('duel-room-code').textContent())!.trim();
  await boot(g, `/?${q}`);
  await g.getByTestId('m-speedrun').click(); await g.getByTestId('sr-trail').click(); await g.getByTestId('sc-race').click();
  await g.getByTestId('duel-code').fill(code); await g.getByTestId('duel-join').click();
  await expect(g.getByTestId('duel-state')).toContainText('Соперник: не готов', { timeout: 40_000 });
  await h.getByTestId('duel-ready').click(); await g.getByTestId('duel-ready').click();
  await expect.poll(() => run(h), { timeout: 60_000 }).toMatchObject({ hold: true });
  await expect.poll(() => run(g), { timeout: 60_000 }).not.toBeNull();
  expect((await run(h))!.seed).toBe((await run(g))!.seed);
  await expect(h.getByTestId('sr-cd')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await run(h))?.hold === false && (await run(g))?.hold === false, { timeout: 60_000 }).toBe(true);
  await h.keyboard.down('KeyD'); await g.keyboard.down('KeyD');
  await expect(h.getByTestId('sr-rival')).toContainText('Соперник: Глава', { timeout: 30_000 });
  await expect(g.getByTestId('sr-rival')).toContainText('Соперник: Глава', { timeout: 30_000 });
  await h.keyboard.up('KeyD'); await g.keyboard.up('KeyD');
  await finish(h, 100_000);
  await expect(g.getByTestId('sr-rival')).toContainText('Соперник финишировал', { timeout: 30_000 });
  await finish(g, 110_000);
  await expect(h.getByTestId('sr-banner')).toContainText('ПОБЕДА', { timeout: 30_000 });
  await expect(g.getByTestId('sr-banner')).toContainText('ПОРАЖЕНИЕ', { timeout: 30_000 });
  expect(errs).toEqual([]);
  await c1.close(); await c2.close();
});

test('одиночный спидран: после перезагрузки «Спидран → Восстановить забег» продолжает партию, помечает «восстановлен»', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await ctxWith(browser), page = await ctx.newPage();
  await boot(page, '/');
  await page.evaluate(() => window.__tt!.start({ kind: 'trail' }));
  await page.waitForFunction(() => (window.__tt!.shared.session?.world['tickN'] ?? 0) > 5);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(3200); await page.keyboard.up('KeyD');
  const before = await page.evaluate(() => { const w = window.__tt!.shared.session!.world; return { tick: w['tickN'] as number, x: Math.round(w['players'][0].x), t0: w['sr'].t0 != null }; });
  expect(before.t0).toBe(true);
  expect(await page.evaluate(() => (localStorage.getItem('tt_jr') || '').length)).toBeGreaterThan(200);
  await page.reload(); await page.waitForSelector('[data-testid=panel-root]');
  await page.getByTestId('m-speedrun').click();
  await expect(page.getByTestId('sr-restore')).toBeVisible();
  await page.getByTestId('sr-restore').click();
  await page.waitForFunction(() => !!window.__tt!.shared.session, undefined, { timeout: 60_000 });
  const after = await page.evaluate(() => { const w = window.__tt!.shared.session!.world; return { tick: w['tickN'] as number, x: Math.round(w['players'][0].x), restored: w['sr'].restored | 0, paused: !!w['paused'], hold: !!w['sr'].hold }; });
  expect(after.restored).toBe(1); expect(after.paused).toBe(true); expect(after.hold).toBe(false);
  expect(after.tick).toBeGreaterThanOrEqual(before.tick - 125); expect(Math.abs(after.x - before.x)).toBeLessThan(80);
  await ctx.close();
});

// Архив: загрузка races.json, таблица Эло и картинка итогов (одно окно, годится и для CI)
test('архив: загрузка races.json даёт рейтинг Эло, неверный файл — понятную ошибку, PNG скачивается', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await ctxWith(browser), page = await ctx.newPage();
  await boot(page, `/?${q}&race=org`);
  await page.getByTestId('org-archive').click();
  const row = (i: number, win: string) => ({
    id: 'e' + i, date: `2026-02-0${i + 1}T10:00:00Z`, version: '2.0.0', discipline: 'trail', settings: { cat: 'trail', easy: false, speed: 100 }, seed: i,
    players: ['Ива', 'Ярь'].map((name, k) => ({ seat: k + 1, name, dnf: false, time: 90000 + k * 2000, finalTime: 90000 + k * 2000, igt: 89000, deaths: 0, stats: null, splits: [20000, 40000, 60000, 90000], eloBefore: null, eloAfter: null, place: k + 1 })),
    winner: win, winnerSeat: 1, awarded: false, gap: 2000, goAt: 0, pauseMs: 0, events: [],
  });
  const file = { format: 'tropa-tkachei/races', version: 1, game: '2.0.0', exported: '2026-02-05T00:00:00Z', races: [row(0, 'Ива'), row(1, 'Ива')] };
  await page.getByTestId('arch-load').setInputFiles({ name: 'races.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('#rca-msg')).toContainText('новых: 2');
  await expect(page.getByTestId('arch-rating')).toContainText('Ива');
  expect(await page.getByTestId('arch-rating').locator('tbody tr').first().innerText()).toContain('Ива');
  await page.getByTestId('arch-load').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"чужой"}') });
  await expect(page.locator('#rca-msg')).toContainText('не архив гонок');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG' }).first().click();
  const d = await dl; expect(d.suggestedFilename()).toMatch(/\.png$/); await d.saveAs('test-results/race-card.png');
  await ctx.close();
});

test('«Босс-раш»: организатор выбирает дисциплину, оба играют босс-раш на общем зерне, обсервер видит таблицу «босс × игрок», итог — в архиве', async ({ browser }) => {
  test.setTimeout(240_000);
  test.skip(!!process.env.CI, 'много окон на программном GL в CI не успевают; логика гонки покрыта tests/unit/races.test.ts, локально запускается');
  const [cO, c1, c2, cW] = [await ctxWith(browser), await ctxWith(browser, 'Ива'), await ctxWith(browser, 'Ярь'), await ctxWith(browser)];
  const [org, p1, p2, wp] = [await cO.newPage(), await c1.newPage(), await c2.newPage(), await cW.newPage()];
  const errs: string[] = [];
  for (const p of [org, p1, p2, wp]) p.on('pageerror', (e) => errs.push(e.message));
  await boot(org, `/?${q}&race=org`);
  const code = (await org.getByTestId('org-code').textContent())!.trim();
  await expect(org.getByTestId('org-server')).toContainText('на связи', { timeout: 30_000 });
  await org.getByTestId('org-disc').selectOption('boss');
  await expect(org.getByTestId('org-rules')).toContainText('Четыре босса подряд');
  await expect(org.getByTestId('org-disc').locator('option[value="duel"]')).not.toHaveAttribute('disabled', ''); // дуэль ткачей готова в 2.4
  await boot(p1, `/?${q}&race=play&room=${code}`); await boot(p2, `/?${q}&race=play&room=${code}`); await boot(wp, `/?${q}&race=watch&room=${code}`);
  await expect(org.getByTestId('org-p2')).toContainText('Ярь', { timeout: 40_000 });
  await expect(p1.getByTestId('join-phase')).toContainText('Босс-раш', { timeout: 30_000 });
  await expect(wp.getByTestId('watch-view')).toBeVisible({ timeout: 40_000 });
  await p1.getByTestId('join-ready').click(); await p2.getByTestId('join-ready').click();
  await expect(org.getByTestId('org-start')).toBeEnabled({ timeout: 30_000 });
  await org.getByTestId('org-start').click();
  const cat = (p: Page) => p.evaluate(() => { const w = window.__tt!.shared.session?.world; return w ? { cat: w['sr']?.cat as string, ch: w['camp']?.ch as number, seed: w['seed'] as number } : null; });
  await expect.poll(() => cat(p1), { timeout: 60_000 }).toMatchObject({ cat: 'boss', ch: 1 });
  await expect.poll(() => cat(p2), { timeout: 60_000 }).toMatchObject({ cat: 'boss', ch: 1 });
  expect((await cat(p1))!.seed).toBe((await cat(p2))!.seed);
  await expect(org.getByTestId('org-phase')).toHaveText('гонка идёт', { timeout: 60_000 });
  await expect.poll(async () => (await run(p1))!.hold || (await run(p2))!.hold, { timeout: 30_000 }).toBe(false);
  // лента кампании подписана боссами, этап — «Кающийся · …»
  await expect(wp.getByTestId('watch-ribbon')).toContainText('Кающийся', { timeout: 30_000 });
  await expect(org.getByTestId('org-p1-state')).toContainText('Кающийся', { timeout: 30_000 });
  // бой: фаза, итог боя с первым боссом (урон, отбивы) — как их шлёт игра игрока
  const emit = (p: Page, f: string) => p.evaluate((src) => { const pl = (window as any).__tt.races.play; (new Function('pl', src))(pl); }, f); // eslint-disable-line @typescript-eslint/no-explicit-any
  await emit(p1, "pl.event('sub', { ch: 1, sk: 'ph2' }); pl.event('boss', { ch: 1, dmg: 41, par: 3, tk: 1, stn: 2, exe: 0, dth: 0, fgt: 21000 });");
  await emit(p2, "pl.event('boss', { ch: 1, dmg: 38, par: 5, tk: 0, stn: 1, exe: 0, dth: 0, fgt: 22000 });");
  await expect(org.getByTestId('org-boss-table')).toContainText('Кающийся', { timeout: 30_000 });
  await wp.keyboard.press('KeyT');
  await expect(wp.getByTestId('watch-boss-table')).toBeVisible({ timeout: 20_000 });
  await expect(wp.getByTestId('watch-boss-table').locator('tr[data-key="boss1"]')).toContainText('41');
  await wp.keyboard.press('KeyT');
  // финиш: Ива быстрее
  await finish(p1, 120_000); await finish(p2, 125_000);
  await expect(org.getByTestId('org-result')).toContainText('Победитель: Ива', { timeout: 30_000 });
  await expect(wp.getByTestId('watch-over')).toContainText('Победил Ива', { timeout: 30_000 });
  await expect(wp.getByTestId('watch-boss-over')).toContainText('Кающийся');
  await expect(p1.getByTestId('sr-banner')).toContainText('ПОБЕДА', { timeout: 30_000 });
  const arch = await org.evaluate(() => JSON.parse(localStorage.getItem('tt_races') || '[]') as { discipline: string; settings: { cat: string }; players: { name: string; eloAfter: number | null; bosses?: { ch: number; dmg: number }[] }[] }[]);
  expect(arch.length).toBe(1); expect(arch[0]!.discipline).toBe('boss'); expect(arch[0]!.settings.cat).toBe('boss');
  expect(arch[0]!.players.every((p) => p.eloAfter != null)).toBe(true); expect(arch[0]!.players.find((p) => p.name === 'Ива')!.bosses![0]).toMatchObject({ ch: 1, dmg: 41 });
  await org.getByTestId('org-archive').click();
  await expect(org.getByTestId('arch-table')).toContainText('Босс-раш');
  await expect(org.getByTestId('arch-rating')).toContainText('Ива');
  expect(errs).toEqual([]);
  for (const c of [cO, c1, c2, cW]) await c.close();
});
