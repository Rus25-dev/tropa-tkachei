import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import './tt';

// Нейросеть-игрок в настоящей игре: ?agent=<пак>&persona=<характер>. Бой с боссом в браузере и гонка 1×1 «Босс-раш» двух агентов
// на локальном PeerJS — без участия человека. Запуск локально (нужен пак public/agents/tkachi.json и `npm run build`).
const require = createRequire(import.meta.url);
const PORT = 9158;
// веса нейросети лежат только локально (public/agents/ в .gitignore): без них (например, в CI) тесты агентов пропускаются
test.skip(!existsSync('public/agents/tkachi.json'), 'нет локальных весов public/agents/tkachi.json');
let server: { close?: () => void } | null = null;
test.beforeAll(() => { const { PeerServer } = require('peer') as { PeerServer: (o: { port: number; path: string }) => { close?: () => void } }; server = PeerServer({ port: PORT, path: '/' }); });
test.afterAll(() => { server?.close?.(); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const ag = (page: Page) => page.evaluate(() => { const t = (window as Any).__tt, w = t.shared.session?.world; const b = w && (w.testBoss?.() ?? w.boss); return { stats: t.agent?.stats ?? null, tick: w?.tickN ?? 0, seed: w?.seed ?? null, bossHp: b ? b.hp : null, bossMax: b ? b.maxHp : null, bossState: b ? b.state : null, ch: w?.camp?.ch ?? 0, hp: w?.players?.[0]?.hp ?? null, over: !!(w?.wiping || w?.won) }; });
async function ctxFor(browser: import('@playwright/test').Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low' })); } catch { /* нет доступа */ } });
  return ctx;
}

test('агент в браузере: бой с Мишей в босс-тесте без участия человека', async ({ browser }) => {
  test.setTimeout(150_000);
  const ctx = await ctxFor(browser), page = await ctx.newPage();
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/?agent=tkachi&persona=average');
  await page.waitForFunction(() => !!(window as Any).__tt?.agent);
  await page.evaluate(() => (window as Any).__tt.start({ kind: 'bosstest', boss: 'misha', seed: 77 }));
  await expect.poll(async () => (await ag(page)).stats?.decisions ?? 0, { timeout: 60_000 }).toBeGreaterThan(100);
  const a = await ag(page);
  expect(a.stats!.boss).toBe('misha');
  // босс получает урон от агента (в среднем за короткий срок): либо бой закончился, либо здоровье босса упало
  await expect.poll(async () => { const s = await ag(page); return s.over || s.bossHp! < s.bossMax!; }, { timeout: 90_000 }).toBe(true);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('два агента: гонка 1×1 «Босс-раш» на локальном PeerJS, общее зерно, оба играют', async ({ browser }) => {
  test.setTimeout(240_000);
  test.skip(!!process.env.CI, 'много окон на программном GL в CI не успевают; локально запускается');
  const [c1, c2] = [await ctxFor(browser), await ctxFor(browser)];
  const [p1, p2] = [await c1.newPage(), await c2.newPage()];
  const errs: string[] = [];
  for (const p of [p1, p2]) p.on('pageerror', (e) => errs.push(e.message));
  const q = `peer=localhost:${PORT}&race=duel&agent=tkachi`;
  await p1.goto(`/?${q}&persona=careful&aname=Ива&aseed=1&arole=host`);
  await expect.poll(() => p1.evaluate(() => (window as Any).__tt?.races?.duel?.code ?? ''), { timeout: 40_000 }).toMatch(/^[A-Z0-9]{5}$/);
  const code = await p1.evaluate(() => (window as Any).__tt.races.duel.code as string);
  await p2.goto(`/?${q}&persona=aggressive&aname=Ярь&aseed=2&room=${code}`);
  // оба сами выбирают «Босс-раш», жмут «Готов», получают отсчёт и бегут
  for (const p of [p1, p2]) await expect.poll(async () => (await ag(p)).stats?.decisions ?? 0, { timeout: 120_000 }).toBeGreaterThan(60);
  const [a, b] = [await ag(p1), await ag(p2)];
  expect(a.seed).toBe(b.seed);
  expect(a.stats!.boss).toBe(b.stats!.boss);
  expect(errs).toEqual([]);
  await c1.close(); await c2.close();
});

test('полная гонка Ткачей «Босс-раш»: организатор-автомат, два агента, обсервер — без участия человека', async ({ browser }) => {
  test.setTimeout(300_000);
  test.skip(!!process.env.CI, 'много окон на программном GL в CI не успевают; локально запускается');
  const [cO, c1, c2, cW] = [await ctxFor(browser), await ctxFor(browser), await ctxFor(browser), await ctxFor(browser)];
  const [org, p1, p2, wp] = [await cO.newPage(), await c1.newPage(), await c2.newPage(), await cW.newPage()];
  const errs: string[] = [];
  for (const p of [org, p1, p2, wp]) p.on('pageerror', (e) => errs.push(e.message));
  const q = `peer=localhost:${PORT}`;
  await org.goto(`/?${q}&race=org&orgauto=1&disc=boss`);
  await expect(org.getByTestId('org-code')).toHaveText(/^[A-Z0-9]{5}$/);
  const code = (await org.getByTestId('org-code').textContent())!.trim();
  await expect(org.getByTestId('org-server')).toContainText('на связи', { timeout: 30_000 });
  await p1.goto(`/?${q}&race=play&room=${code}&agent=tkachi&persona=careful&aname=Ива&aseed=1`);
  await p2.goto(`/?${q}&race=play&room=${code}&agent=tkachi&persona=aggressive&aname=Ярь&aseed=2`);
  await wp.goto(`/?${q}&race=watch&room=${code}&stream=1`);
  // организатор сам выбирает «Босс-раш» и стартует, как только оба агента нажали «Готов»
  await expect(org.getByTestId('org-phase')).toHaveText('гонка идёт', { timeout: 120_000 });
  for (const p of [p1, p2]) await expect.poll(async () => (await ag(p)).stats?.decisions ?? 0, { timeout: 120_000 }).toBeGreaterThan(60);
  const [a, b] = [await ag(p1), await ag(p2)];
  expect(a.seed).toBe(b.seed);
  // герои реально играют: у босса падает здоровье или идёт следующий босс; обсервер получает телеметрию обоих
  await expect.poll(async () => { const [x, y] = [await ag(p1), await ag(p2)]; return (x.bossHp! < x.bossMax! || x.ch > 1) && (y.bossHp! < y.bossMax! || y.ch > 1); }, { timeout: 120_000 }).toBe(true);
  await expect.poll(() => wp.evaluate(() => Object.keys((window as Any).__tt?.races?.watch?.tel ?? {}).length), { timeout: 30_000 }).toBe(2);
  expect(errs).toEqual([]);
  for (const c of [cO, c1, c2, cW]) await c.close();
});
