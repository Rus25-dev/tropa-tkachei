import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import './tt';
import { duelArchive } from '../unit/helpers/duelarch';
import { fakeDuel, type DuelStage } from './fakeroom';

// «Дуэль ткачей»: настройки серии у организатора, бан/пик, раунд с общим боссом, график погони на табло, итог раунда и серии, архив, страница рейтинга.
// Лёгкие проверки идут в одном окне на подложных снимках комнаты (в том числе в CI); многооконная серия — локально (PeerJS между вкладками).
// Скриншоты панелей и обсервера на пяти размерах — в test-results/duel-shots.
const require = createRequire(import.meta.url);
const PORT = 9170;
let server: { close?: () => void } | null = null;
test.beforeAll(() => { const { PeerServer } = require('peer') as { PeerServer: (o: { port: number; path: string }) => { close?: () => void } }; server = PeerServer({ port: PORT, path: '/' }); mkdirSync('test-results/duel-shots', { recursive: true }); });
test.afterAll(() => { server?.close?.(); });
const q = `peer=localhost:${PORT}`;
const SIZES: [number, number][] = [[667, 375], [844, 390], [932, 430], [1366, 768], [1920, 1080]];

async function ctxAt(browser: import('@playwright/test').Browser, W: number, H: number, name = ''): Promise<BrowserContext> {
  const touch = W < 1000, ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  await ctx.addInitScript((n) => { try { if (!sessionStorage.getItem('tt_init')) { sessionStorage.setItem('tt_init', '1'); localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low' })); if (n) localStorage.setItem('tt_sr_name', n); } } catch { /* нет доступа */ } }, name);
  return ctx;
}
const boot = async (p: Page, url: string): Promise<void> => { await p.goto(url); await p.waitForFunction(() => !!window.__tt && (window.__tt.game.scene.isActive('game') || window.__tt.game.scene.isActive('watch'))); };

/** панель целиком на экране: нет горизонтальной прокрутки, кнопки не ниже 44 px, шрифт не мельче 11 px, ничего не выходит за экран и не накладывается */
async function check(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const out = { hscroll: document.documentElement.scrollWidth > innerWidth + 1, small: [] as string[], font: [] as string[], out: [] as string[], overlap: [] as string[], clipped: [] as string[] };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.ov button, .ov select, .ov input'))) {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height || el.closest('[hidden]')) continue;
      if (b.height < 43.5 && !el.closest('.seg')) out.small.push(((el.textContent || el.id || el.className) as string).trim().slice(0, 24) + ' ' + Math.round(b.height));
      if (b.left < -1 || b.right > innerWidth + 1) out.out.push((el.textContent ?? '').trim().slice(0, 24));
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.ov *'))) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) continue;
      if (el.closest('svg')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11) out.font.push(el.className + ' ' + fs);
    }
    const bs = Array.from(document.querySelectorAll<HTMLElement>('.ov:last-of-type button')).filter((e) => e.getClientRects().length).map((e) => ({ r: e.getBoundingClientRect(), t: (e.textContent ?? '').trim().slice(0, 16) }));
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i]!.r, b = bs[j]!.r; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.overlap.push(bs[i]!.t + '×' + bs[j]!.t); }
    // текст карточек не обрезается по ширине
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.dl-card, .dl-score, .dl-plan, .dl-order li'))) if (el.scrollWidth > el.clientWidth + 2) out.clipped.push(el.className + ' ' + el.scrollWidth + '>' + el.clientWidth);
    return out;
  });
  expect(r, name).toEqual({ hscroll: false, small: [], font: [], out: [], overlap: [], clipped: [] });
}

/** обсерверу подкладывается снимок комнаты: связи нет, окно рисуется по этим данным */
async function fakeWatch(page: Page, stage: DuelStage): Promise<void> {
  await page.evaluate((f) => {
    const r = (window as any).__tt.races; // eslint-disable-line @typescript-eslint/no-explicit-any
    r.joinWatch('ZZZZZ'); const w = r.watch, now = performance.now();
    w.client?.stop(true); w.client = null; w.connStatus = 'online'; w.denied = undefined;
    w.S = f.S; w.recvAt = now; w.feed = f.log; w.chase = f.chase; w.result = null; w.resultLite = f.S.phase === 'done' ? { id: 'x', winner: 1, awarded: false, gap: 2400, players: [] } : null;
    w.tel = {}; for (const id of Object.keys(f.tel)) w.tel[Number(id)] = { ...f.tel[Number(id)], at: now };
    w.changed();
  }, fakeDuel(stage));
}
/** игроку подкладывается состояние комнаты дуэли */
async function fakeJoin(page: Page, stage: DuelStage): Promise<void> {
  await page.evaluate((f) => {
    const r = (window as any).__tt.races; // eslint-disable-line @typescript-eslint/no-explicit-any
    r.openJoin('', false); const p = r.play;
    p.code = 'ZZZZZ'; p.name = 'Ива'; p.seat = 1; p.status = 'online'; p.state = f.S; p.me = false; p.changed();
  }, fakeDuel(stage));
}
/** организатору подкладывается серия дуэли (вместе с ходом раунда) */
async function fakeOrg(page: Page, stage: DuelStage): Promise<void> {
  await page.evaluate((f) => {
    const r = (window as any).__tt.races; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!r.org) r.openOrg(); else r.setView('org');
    const o = r.org, S = o.S;
    S.disc = 'duel'; S.phase = f.phase; S.goAt = f.S.goAt; S.duel = { id: 's1', series: f.duel.series, seats: [1, 2], names: ['Ива', 'Ярь'], retry: 0, last: f.duel.last };
    f.S.players.forEach((p: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const id = i + 1, old = S.seats[id] || { id, key: 'k' + id, role: 'play', ready: true, loaded: true, online: true, fin: null, dnf: false, viol: [], restored: 0, rtt: 30 };
      S.seats[id] = { ...old, name: p.name, online: true, ready: true, splits: [], subs: p.subs, lost: 0, deathList: [], buys: [], pb: null, tel: f.tel[id], fin: null };
    });
    o.chase = f.chase; r.bump();
  }, fakeDuel(stage));
}

test('дуэль, организатор: дисциплина, формат серии и модификаторы (одно окно)', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await boot(page, `/?${q}&race=org`);
  await expect(page.getByTestId('org-code')).toHaveText(/^[A-Z0-9]{5}$/);
  await expect(page.getByTestId('org-disc').locator('option[value="duel"]')).not.toHaveAttribute('disabled', '');
  await expect(page.getByTestId('org-duel-setup')).toHaveCount(0);
  await page.getByTestId('org-disc').selectOption('duel');
  await expect(page.getByTestId('org-rules')).toContainText('Bo1 / Bo3 / Bo5');
  await expect(page.getByTestId('org-duel-setup')).toBeVisible();
  await expect(page.getByTestId('org-duel-fmt-3')).toHaveAttribute('aria-pressed', 'true'); // по умолчанию Bo3
  await expect(page.getByTestId('org-start')).toBeDisabled();
  await expect(page.getByTestId('org-start')).toContainText('Начать серию');
  await page.getByTestId('org-duel-fmt-5').click(); await page.getByTestId('org-duel-mod-mirror').click(); await page.getByTestId('org-duel-mod-blitz').click(); await page.getByTestId('org-duel-random').click();
  const cfg = () => page.evaluate(() => (window as any).__tt.races.org.S.duelCfg); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect.poll(cfg).toEqual({ fmt: 5, fixed: ['mirror', 'blitz'], random: true });
  await page.getByTestId('org-duel-mod-mirror').click(); await expect.poll(cfg).toEqual({ fmt: 5, fixed: ['blitz'], random: true });
  // настройки живут в сохранённой комнате: после перезагрузки страницы они на месте
  await page.waitForTimeout(500);
  await page.reload(); await page.waitForFunction(() => !!(window as any).__tt?.races); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).__tt.races.openOrg()); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect.poll(cfg).toEqual({ fmt: 5, fixed: ['blitz'], random: true });
  await expect(page.getByTestId('org-disc')).toHaveValue('duel');
  expect(errs).toEqual([]);
});

test('дуэль на подложных снимках: бан/пик, ход раунда с графиком погони, итог раунда и серии у обсервера, игрока и организатора', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await boot(page, `/?${q}`);
  // обсервер: экран бан/пик
  await fakeWatch(page, 'veto');
  await expect(page.getByTestId('duel-veto')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('duel-veto')).toContainText('Bo3'); await expect(page.getByTestId('duel-veto-turn')).toContainText('Ходит Ярь');
  await expect(page.getByTestId('duel-card-korne')).toHaveAttribute('data-state', 'ban'); await expect(page.getByTestId('duel-card-korne')).toContainText('БАН · Ива');
  await expect(page.getByTestId('duel-card-misha')).toHaveAttribute('data-state', 'free');
  // ход раунда: счёт, босс, модификатор, график, разница к фазам
  await fakeWatch(page, 'run');
  await expect(page.getByTestId('duel-chase')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('duel-score')).toContainText('Ива'); await expect(page.getByTestId('duel-plan')).toContainText('Миша Додик'); await expect(page.getByTestId('duel-plan')).toContainText('Зеркало');
  await expect(page.getByTestId('duel-chase-phase')).toContainText('Фаза 2: Ива быстрее'); await expect(page.getByTestId('duel-chase-lead')).toContainText('Ива впереди');
  await expect(page.getByTestId('duel-hplead')).toContainText('+');
  await page.keyboard.press('KeyT'); await expect(page.getByTestId('duel-phases')).toBeVisible(); await expect(page.getByTestId('duel-phases').locator('tr[data-key="ph2"]')).toContainText('−3.5');
  await page.keyboard.press('KeyT');
  // итог раунда и серии
  await fakeWatch(page, 'done');
  await expect(page.getByTestId('duel-over')).toBeVisible({ timeout: 20_000 }); await expect(page.getByTestId('duel-over')).toContainText('Раунд 1: Ива'); await expect(page.getByTestId('duel-over')).toContainText('быстрее убил босса');
  await expect(page.getByTestId('duel-over-phases')).toContainText('Босс повержен');
  await fakeWatch(page, 'over');
  await expect(page.getByTestId('duel-over')).toContainText('Серия: победил Ива 2:0');
  await fakeWatch(page, 'lobby');
  await expect(page.getByTestId('duel-lobbyinfo')).toContainText('Миша Додик'); await expect(page.getByTestId('duel-order')).toContainText('Владик');
  await page.keyboard.press('Escape');
  // игрок: ход в бан/пик с подтверждением
  await fakeJoin(page, 'veto');
  await expect(page.getByTestId('duel-turn')).toContainText('Ходит Ярь');
  await expect(page.getByTestId('duel-card-misha')).toBeDisabled(); await expect(page.getByTestId('duel-confirm')).toBeDisabled();
  await fakeJoin(page, 'lobby');
  await expect(page.getByTestId('duel-ready-hint')).toContainText('Миша Додик'); await expect(page.getByTestId('join-ready')).toBeEnabled();
  // организатор: серия, график и разница к фазам
  await page.keyboard.press('Escape'); await page.evaluate(() => (window as any).__tt.races.leavePlay()); // eslint-disable-line @typescript-eslint/no-explicit-any
  await fakeOrg(page, 'run');
  await expect(page.getByTestId('org-duel-box')).toContainText('Миша Додик'); await expect(page.getByTestId('org-duel-chase')).toBeVisible(); await expect(page.getByTestId('org-duel-phases')).toContainText('Фаза 2');
  await expect(page.getByTestId('org-start')).toBeDisabled();
  expect(errs).toEqual([]);
});

/** игрок в бан/пике: ход делает тот, чьё имя в подсказке; карточка выбирается, потом подтверждается */
test('дуэль, игрок: свой ход — выбор карточки и подтверждение отправляют ход организатору (подложное состояние)', async ({ page }) => {
  await boot(page, `/?${q}`);
  await fakeJoin(page, 'veto');
  await page.evaluate(() => { const p = (window as any).__tt.races.play; p.state.duel.series.step = 1; p.seat = 2; p.name = 'Ярь'; p.changed(); }); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('duel-turn')).toContainText('Ваш ход');
  const sent: unknown[] = [];
  await page.exposeFunction('__veto', (b: string) => sent.push(b));
  await page.evaluate(() => { const p = (window as any).__tt.races.play; p.veto = (b: string) => (window as any).__veto(b); }); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('duel-confirm')).toBeDisabled();
  await page.getByTestId('duel-card-misha').click(); await expect(page.getByTestId('duel-card-misha')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('duel-confirm')).toContainText('Миша'); await expect(page.getByTestId('duel-confirm')).toBeEnabled();
  await page.getByTestId('duel-card-korne').click({ force: true }); await expect(page.getByTestId('duel-card-misha')).toHaveAttribute('aria-pressed', 'true'); // забаненный босс не выбирается
  await page.getByTestId('duel-confirm').click();
  await expect.poll(() => sent).toEqual(['misha']);
});

for (const [W, H] of SIZES) {
  test(`вёрстка дуэли ${W}×${H}: организатор, игрок, бан/пик, график и итог на табло — без наложений`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await ctxAt(browser, W, H, 'Ива'), page = await ctx.newPage();
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    const shot = (n: string) => page.screenshot({ path: `test-results/duel-shots/${W}x${H}-${n}.png` });
    await boot(page, `/?${q}`);
    // организатор: настройки, бан/пик, ход раунда
    await page.evaluate(() => (window as any).__tt.races.openOrg()); // eslint-disable-line @typescript-eslint/no-explicit-any
    await expect(page.getByTestId('org-code')).toHaveText(/^[A-Z0-9]{5}$/);
    await page.getByTestId('org-disc').selectOption('duel');
    await check(page, 'организатор: настройки серии'); await shot('org-setup');
    await fakeOrg(page, 'veto'); await expect(page.getByTestId('org-veto-turn')).toContainText('Ходит Ярь'); await check(page, 'организатор: бан/пик'); await shot('org-veto');
    await fakeOrg(page, 'run'); await expect(page.getByTestId('org-duel-chase')).toBeVisible(); await check(page, 'организатор: раунд идёт'); await shot('org-run');
    await fakeOrg(page, 'done'); await check(page, 'организатор: итог раунда'); await shot('org-done');
    await page.evaluate(() => (window as any).__tt.races.setView(null)); // eslint-disable-line @typescript-eslint/no-explicit-any
    // игрок
    await fakeJoin(page, 'veto'); await check(page, 'игрок: бан/пик'); await shot('play-veto');
    await page.evaluate(() => { const p = (window as any).__tt.races.play; p.state.duel.series.step = 1; p.seat = 2; p.name = 'Ярь'; p.changed(); }); // eslint-disable-line @typescript-eslint/no-explicit-any
    await page.getByTestId('duel-card-misha').click(); await check(page, 'игрок: свой ход, карточка выбрана'); await shot('play-veto-mine');
    await fakeJoin(page, 'lobby'); await check(page, 'игрок: ожидание раунда'); await shot('play-lobby');
    await fakeJoin(page, 'done'); await check(page, 'игрок: итог раунда'); await shot('play-done');
    await page.keyboard.press('Escape');
    // обсервер
    for (const st of ['veto', 'lobby', 'run', 'done', 'over'] as DuelStage[]) {
      await fakeWatch(page, st);
      await expect(page.getByTestId(st === 'veto' ? 'duel-veto' : st === 'lobby' ? 'duel-lobbyinfo' : st === 'run' ? 'duel-chase' : 'duel-over')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(400);
      // табло целиком внутри экрана и ничто не вылезает за свою рамку
      const bad = await page.evaluate(() => {
        const hud = document.querySelector('.rw-hud')!.getBoundingClientRect(), out: string[] = [];
        if (hud.left < -1 || hud.top < -1 || hud.right > innerWidth + 1 || hud.bottom > innerHeight + 1) out.push('hud');
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push('hscroll');
        const boxes = ['.dl-vetoscr', '.dl-watch', '.dl-lobbyinfo', '.over', '.mid'].map((s) => ({ s, el: document.querySelector<HTMLElement>('.rw-hud ' + s) })).filter((x) => x.el).map((x) => ({ s: x.s, r: x.el!.getBoundingClientRect(), sw: x.el!.scrollWidth > x.el!.clientWidth + 2 }));
        for (const b of boxes) { if (b.sw) out.push(b.s + ' scroll'); if (b.r.left < hud.left - 1 || b.r.right > hud.right + 1 || b.r.bottom > hud.bottom + 1) out.push(b.s + ' вне окна'); }
        // панели посередине не налезают на табло сверху и на ленту событий снизу
        const mid = document.querySelector<HTMLElement>('.rw-hud .mid:not(.sub)')?.getBoundingClientRect(), feed = document.querySelector<HTMLElement>('.rw-hud .feed')?.getBoundingClientRect();
        for (const s of ['.dl-watch', '.dl-lobbyinfo']) { const el = document.querySelector<HTMLElement>('.rw-hud ' + s)?.getBoundingClientRect(); if (!el) continue; if (mid && el.top < mid.bottom - 1 && el.bottom > mid.top + 1 && el.left < mid.right && el.right > mid.left) out.push(s + ' × табло'); if (feed && el.bottom > feed.top + 1) out.push(s + ' × лента'); }
        return out;
      });
      await shot('watch-' + st);
      expect(bad, `обсервер ${st}`).toEqual([]);
    }
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('рейтинг: серия дуэли — отдельная вкладка, раунды с боссом и модификаторами, страница раунда со списком раундов серии', async ({ page }) => {
  const { racesJson } = await import('../../src/net/racecommon');
  await page.route('**/data/races.json', (r) => r.fulfill({ contentType: 'application/json', body: racesJson(duelArchive(), '2.4.0', '2026-04-02T00:00:00.000Z') }));
  await page.goto('/rating.html');
  await expect(page.getByTestId('tab-duel')).toBeVisible();
  await page.getByTestId('tab-duel').click();
  await expect(page.locator('h1')).toHaveText('Дуэль ткачей');
  await expect(page.getByTestId('rt-table').locator('tbody tr').first()).toContainText('Ива');
  await expect(page.getByTestId('rt-races').getByTestId('duel-label').first()).toContainText('Bo3 · раунд 3 · Тима Пиво');
  await page.getByTestId('rt-races').getByTestId('race-link').nth(2).click(); // раунд 2: список «последние гонки» идёт от новых к старым
  await expect(page.getByTestId('series-rounds')).toContainText('Владик Скрипка'); await expect(page.getByTestId('series-rounds').locator('tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('splits')).toContainText('Владик Скрипка');
});

// ---------- многооконная серия (локально) ----------
const BOSSES = ['korne', 'misha', 'vladik', 'tima'] as const;
const duelRun = (p: Page) => p.evaluate(() => { const w = window.__tt!.shared.session?.world as Record<string, any> | undefined; return w ? { duel: w['sr']?.duel as { ch: number; mods: string[] } | null, ch: w['camp']?.ch as number, seed: w['seed'] as number, hold: !!w['sr']?.hold, mirror: document.documentElement.classList.contains('tt-mirror') } : null; }); // eslint-disable-line @typescript-eslint/no-explicit-any
/** герой неуязвим, время забега задаётся, босс считается убитым */
const killBoss = (p: Page, ms: number) => p.evaluate((t) => {
  const w = window.__tt!.shared.session!.world as Record<string, any>, r = w['sr']; // eslint-disable-line @typescript-eslint/no-explicit-any
  r.t0 = r.clock() - t; r.igt = t - 1000; r.splits = [{ rta: t, igt: t - 1000 }]; window.__tt!.debug.srFinish(w);
}, ms);
const defeat = (p: Page) => p.evaluate(() => { const w = window.__tt!.shared.session!.world; window.__tt!.debug.srDuelDefeat(w); });
const immortal = (p: Page) => p.evaluate(() => { const pl = (window.__tt!.shared.session!.world as Record<string, any>)['players'][0]; pl.maxHp = pl.hp = 99; }); // eslint-disable-line @typescript-eslint/no-explicit-any

test('дуэль Bo1: бан/пик у игроков и обсервера, раунд с общим боссом и зеркалом, итог, серия в архиве', async ({ browser }) => {
  test.setTimeout(300_000);
  test.skip(!!process.env.CI, 'много окон на программном GL в CI не успевают; логика серии покрыта tests/unit/duelrace.test.ts, локально запускается');
  const [cO, c1, c2, cW] = [await ctxAt(browser, 1280, 720), await ctxAt(browser, 1280, 720, 'Ива'), await ctxAt(browser, 1280, 720, 'Ярь'), await ctxAt(browser, 1280, 720)];
  const [org, p1, p2, wp] = [await cO.newPage(), await c1.newPage(), await c2.newPage(), await cW.newPage()];
  const errs: string[] = [];
  for (const p of [org, p1, p2, wp]) p.on('pageerror', (e) => errs.push(e.message));
  await boot(org, `/?${q}&race=org`);
  const code = (await org.getByTestId('org-code').textContent())!.trim();
  await expect(org.getByTestId('org-server')).toContainText('на связи', { timeout: 30_000 });
  await org.getByTestId('org-disc').selectOption('duel');
  await org.getByTestId('org-duel-fmt-1').click(); await org.getByTestId('org-duel-mod-mirror').click();
  await boot(p1, `/?${q}&race=play&room=${code}`); await boot(p2, `/?${q}&race=play&room=${code}`); await boot(wp, `/?${q}&race=watch&room=${code}`);
  await expect(org.getByTestId('org-p2')).toContainText('Ярь', { timeout: 40_000 });
  await expect(p1.getByTestId('join-phase')).toContainText('Дуэль ткачей', { timeout: 30_000 });
  await expect(wp.getByTestId('watch-view')).toBeVisible({ timeout: 40_000 });
  await p1.getByTestId('join-ready').click(); await p2.getByTestId('join-ready').click();
  await expect(org.getByTestId('org-start')).toBeEnabled({ timeout: 30_000 });
  await expect(org.getByTestId('org-start')).toContainText('Начать серию');
  await org.getByTestId('org-start').click();
  // бан/пик: три бана; ход делает тот, чьё имя в подсказке организатора; карточку нужно выбрать и подтвердить
  await expect(org.getByTestId('org-phase')).toHaveText('бан/пик боссов', { timeout: 30_000 });
  await expect(wp.getByTestId('duel-veto')).toBeVisible({ timeout: 30_000 });
  for (let i = 1; i <= 3; i++) {
    await expect(org.getByTestId('org-veto-turn')).toContainText(`ход ${i} из 3`, { timeout: 30_000 });
    const who = /Ходит (\S+):/.exec((await org.getByTestId('org-veto-turn').textContent())!)![1]!, page = who === 'Ива' ? p1 : p2, other = who === 'Ива' ? p2 : p1;
    await expect(page.getByTestId('duel-turn')).toContainText('Ваш ход', { timeout: 30_000 });
    await expect(other.getByTestId('duel-turn')).toContainText(`Ходит ${who}`);
    let boss = ''; for (const b of BOSSES) if (await page.getByTestId(`duel-card-${b}`).isEnabled()) { boss = b; break; }
    expect(boss).not.toBe('');
    await expect(other.getByTestId(`duel-card-${boss}`)).toBeDisabled(); // у соперника карточки недоступны
    await page.getByTestId(`duel-card-${boss}`).click(); await page.getByTestId('duel-confirm').click();
    if (i < 3) await expect(wp.getByTestId(`duel-card-${boss}`)).toHaveAttribute('data-state', 'ban', { timeout: 20_000 }); // после последнего хода экран бан/пика закрывается
  }
  await expect(org.getByTestId('org-phase')).toHaveText('ожидание игроков', { timeout: 30_000 });
  await expect(org.getByTestId('org-duel-box')).toContainText('Раунд 1');
  const plan = (await org.getByTestId('duel-plan').first().textContent())!;
  await expect(wp.getByTestId('duel-lobbyinfo')).toContainText('Зеркало', { timeout: 30_000 });
  await expect(p1.getByTestId('duel-ready-hint')).toContainText('Зеркало');
  await p1.getByTestId('join-ready').click(); await p2.getByTestId('join-ready').click();
  await expect(org.getByTestId('org-start')).toBeEnabled({ timeout: 30_000 });
  await expect(org.getByTestId('org-start')).toContainText('Старт раунда 1');
  await org.getByTestId('org-start').click();
  // оба в одной арене одного босса, зерно общее, экран зеркален
  await expect.poll(() => duelRun(p1), { timeout: 60_000 }).toMatchObject({ duel: { mods: ['mirror'] }, mirror: true });
  await expect.poll(() => duelRun(p2), { timeout: 60_000 }).toMatchObject({ duel: { mods: ['mirror'] }, mirror: true });
  const [d1, d2] = [(await duelRun(p1))!, (await duelRun(p2))!];
  expect(d1.duel!.ch).toBe(d2.duel!.ch); expect(d1.seed).toBe(d2.seed); expect(d1.ch).toBe(d1.duel!.ch);
  expect(plan).toContain(['Корнематка', 'Миша Додик', 'Владик Скрипка', 'Тима Пиво'][d1.duel!.ch - 1]!);
  await expect(org.getByTestId('org-phase')).toHaveText('гонка идёт', { timeout: 60_000 });
  await expect.poll(async () => (await duelRun(p1))!.hold || (await duelRun(p2))!.hold, { timeout: 30_000 }).toBe(false);
  await expect(p1.getByTestId('duel-hud-boss')).toContainText(['Корнематка', 'Миша Додик', 'Владик Скрипка', 'Тима Пиво'][d1.duel!.ch - 1]!);
  await expect(wp.getByTestId('duel-watch')).toBeVisible({ timeout: 30_000 }); // график погони на табло
  await expect(wp.getByTestId('duel-score')).toContainText('Bo1');
  // Ярь обрывает нить, Ива убивает босса: раунд и серия за Ивой
  await immortal(p1); await p2.waitForTimeout(500);
  await defeat(p2); await expect(p2.getByTestId('duel-result')).toBeVisible({ timeout: 30_000 }); await expect(p2.getByTestId('duel-result-main')).toContainText('у босса осталось');
  await killBoss(p1, 47_000);
  await expect(org.getByTestId('org-result')).toContainText('Победитель: Ива', { timeout: 30_000 });
  await expect(org.getByTestId('org-result')).toContainText('убил босса');
  await expect(wp.getByTestId('duel-over')).toContainText('Серия: победил Ива 1:0', { timeout: 30_000 });
  await expect(p1.getByTestId('duel-banner')).toContainText('РАУНД ВАШ', { timeout: 30_000 });
  await expect(p2.getByTestId('duel-banner')).toContainText('РАУНД СОПЕРНИКА', { timeout: 30_000 });
  type Rec = { discipline: string; seriesId: string; round: number; duel: { fmt: number; final?: boolean; seriesWinner?: string; mods: string[] }; players: { name: string; eloAfter: number | null; duel?: { kill: boolean } }[] };
  const arch = await org.evaluate(() => JSON.parse(localStorage.getItem("tt_races") || "[]") as Rec[]);
  expect(arch.length).toBe(1); expect(arch[0]).toMatchObject({ discipline: 'duel', round: 1, duel: { fmt: 1, final: true, seriesWinner: 'Ива', mods: ['mirror'] } });
  expect(arch[0]!.seriesId).toBeTruthy(); expect(arch[0]!.players.every((p) => p.eloAfter != null)).toBe(true); expect(arch[0]!.players.find((p) => p.name === 'Ива')!.duel!.kill).toBe(true);
  await org.getByTestId('org-archive').click();
  await expect(org.getByTestId('arch-table')).toContainText('Дуэль ткачей'); await expect(org.getByTestId('arch-duel')).toContainText('Серия №1');
  await org.keyboard.press('Escape');
  await expect(org.getByTestId('org-next')).toContainText('Новая серия'); await org.getByTestId('org-next').click();
  await expect(org.getByTestId('org-phase')).toHaveText('ожидание игроков', { timeout: 30_000 });
  await expect(org.getByTestId('org-start')).toContainText('Начать серию');
  expect(errs).toEqual([]);
  for (const c of [cO, c1, c2, cW]) await c.close();
});
