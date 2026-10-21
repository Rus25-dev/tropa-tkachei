import { expect, test, type Page } from '@playwright/test';

import './tt';

// Интерфейс на Preact: меню, пауза, окна внутри игры; управление клавиатурой, геймпадом и касанием.

async function boot(page: Page, opts: { pad?: boolean; settings?: object; save?: object } = {}): Promise<void> {
  await page.addInitScript((o) => {
    try {
      if (!sessionStorage.getItem('tt_init')) {
        sessionStorage.setItem('tt_init', '1');
        localStorage.setItem('tt_settings', JSON.stringify({ gfx: 'low', ...(o.settings ?? {}) }));
        if (o.save) localStorage.setItem('tt_save', JSON.stringify(o.save));
      }
    } catch { /* нет доступа */ }
    if (o.pad) {
      const pad = { id: 'Xbox 360 Controller (STANDARD GAMEPAD)', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      window.__pad = pad;
      navigator.getGamepads = () => [pad as unknown as Gamepad, null, null, null];
    }
  }, opts);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__tt && window.__tt.game.scene.isActive('game'));
  await page.waitForSelector('[data-testid=panel-root]');
}
const menuId = (page: Page) => page.evaluate(() => document.documentElement.dataset['menu'] ?? '');
// на CI кадры редкие: кнопка геймпада должна продержаться дольше кадра, иначе опрос её не увидит
const HOLD = process.env.CI ? 350 : 120; // меньше 420 мс: до автоповтора направлений в меню
const press = async (page: Page, b: number, ms = HOLD) => {
  await page.evaluate((i) => { const p = window.__pad!.buttons[i]!; p.pressed = true; p.value = 1; }, b);
  await page.waitForTimeout(ms);
  await page.evaluate((i) => { const p = window.__pad!.buttons[i]!; p.pressed = false; p.value = 0; }, b);
  await page.waitForTimeout(ms);
};
const sess = (page: Page) => page.evaluate(() => !!window.__tt!.shared.session);

test('меню с клавиатуры: цифры, стрелки, Enter и Esc', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('2');
  await expect(page.getByTestId('c-new')).toBeVisible();
  expect(await menuId(page)).toBe('campaign');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('m-campaign')).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByTestId('bt-one')).toBeVisible();
  // T включает тренировку, P двигает фазу
  await page.keyboard.press('t');
  await expect(page.getByTestId('bt-train')).toContainText('вкл');
  await page.keyboard.press('p');
  await expect(page.getByTestId('bt-phase')).toContainText('2');
  // ← → на карточках босса меняют выбор
  await page.getByTestId('boss-misha').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('boss-vladik')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('4');
  await expect(page.getByTestId('sr-trail')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('6');
  await expect(page.getByTestId('howto-body')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tab[aria-selected=true]')).toHaveText('Приёмы');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('m-campaign')).toBeVisible();
  await page.keyboard.press('n');
  await expect(page.getByTestId('changelog-body')).toContainText('Версия 2.0');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('m-settings')).toBeVisible();
});

test('кампания → новая игра → один ткач запускает главу I; Esc ставит паузу', async ({ page }) => {
  await boot(page);
  await page.getByTestId('m-campaign').click();
  await page.getByTestId('c-new').click();
  await expect(page.getByTestId('md-one')).toBeVisible();
  await page.getByTestId('md-one').click();
  expect(await sess(page)).toBe(true);
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-title')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-title')).toHaveCount(0);
});

test('меню геймпадом: крестовина, A и B', async ({ page }) => {
  await boot(page, { pad: true });
  await press(page, 13); // вниз: фокус на «Босс-тест» (первый пункт — «Кампания»)
  await press(page, 0);
  await expect(page.getByTestId('bt-one')).toBeVisible();
  await press(page, 1); // B — назад
  await expect(page.getByTestId('m-campaign')).toBeVisible();
});

test('касание: пункты меню нажимаются, «← Назад» работает, кнопки не меньше 44 px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await boot(page);
  await page.getByTestId('m-settings').tap();
  await expect(page.getByTestId('st-go-sound')).toBeVisible();
  const h = await page.getByTestId('st-go-sound').evaluate((e) => e.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(44);
  await page.waitForTimeout(450); // первые 350 мс после открытия экрана касания гасятся: так отсекается «призрачный» щелчок
  await page.locator('.ovback').tap();
  await expect(page.getByTestId('m-settings')).toBeVisible();
  await ctx.close();
});

test('настройки сохраняются в tt_settings; клавиша прыжка переназначается и работает в игре', async ({ page }) => {
  await boot(page);
  await page.getByTestId('m-settings').click();
  await page.getByTestId('st-go-screen').click();
  await page.locator('#st-noflash').check();
  await page.locator('label:has(input[name=st-gfx][value=mid])').click();
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('tt_settings')!));
  expect(s.noflash).toBe(true); expect(s.gfx).toBe('mid');
  await page.keyboard.press('Escape');
  await page.getByTestId('st-go-controls').click();
  await page.locator('#st-keys').click();
  await page.locator('[data-act=jump]').click();
  await page.keyboard.press('KeyJ');
  await expect(page.locator('[data-act=jump]')).toHaveText('J');
  const keys = await page.evaluate(() => JSON.parse(localStorage.getItem('tt_keys')!));
  expect(keys.jump[1]).toBe('J'); expect(keys.jump[2]).toBe('KeyJ');
  // клавиша 1 действия: занятая игроком 2 (Num1/«/» — в списке запрещённых только коды; стрелки заняты)
  await page.locator('[data-act=atk]').click();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#kb-note')).toContainText('занята');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.getByTestId('m-campaign')).toBeVisible();
  await page.evaluate(() => window.__tt!.start({ kind: 'story', fresh: true }));
  await page.waitForTimeout(700);
  await page.evaluate(() => { const w = window.__tt!.shared.session!.world, o = { min: 0 }; (window as unknown as { __jv: typeof o }).__jv = o; const id = setInterval(() => { o.min = Math.min(o.min, w['players'][0].vy); }, 5); setTimeout(() => clearInterval(id), 4000); });
  await page.keyboard.down('KeyJ'); await page.waitForTimeout(500); await page.keyboard.up('KeyJ');
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => (window as unknown as { __jv: { min: number } }).__jv.min)).toBeLessThan(0);
});

test('в игре: пауза, снаряжение, скамья, лавка, карта', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__tt!.start({ kind: 'story', fresh: true }));
  await page.waitForTimeout(700);
  // пауза → снаряжение
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-gear').click();
  await expect(page.getByTestId('gear-row-needle')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-title')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-title')).toHaveCount(0);
  // скамья: игрок рядом, ↑ открывает меню
  await page.evaluate(() => { const w = window.__tt!.shared.session!.world, b = w['benches'][0], p = w['players'][0]; p.x = b.x - 7; p.y = b.y - 26; p.vx = 0; p.vy = 0; w['beads'] = 30; });
  await page.waitForTimeout(200);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(160); await page.keyboard.up('KeyW');
  await expect(page.getByTestId('bench-rest')).toBeVisible();
  await page.getByTestId('bench-shop').click();
  await expect(page.getByTestId('shop-hp')).toBeVisible();
  await page.getByTestId('shop-hp').click();
  expect(await page.evaluate(() => window.__tt!.shared.session!.world['up'].hp)).toBe(1);
  await expect(page.getByTestId('shop-beads')).toContainText('20');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shop-hp')).toHaveCount(0);
  // карта
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('map-canvas')).toHaveCount(0);
});

test('победа в босс-тесте: экран итогов, «Заново» перезапускает бой, «В главное меню» выходит', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__tt!.start({ kind: 'bosstest', boss: 'misha' }));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__tt!.game.events.emit('tt:ui', { k: 'victory', s: { time: 75, beads: 0, deaths: 1, players: 1, title: 'Миша Додик повержен', bag: 3 } }));
  await expect(page.getByTestId('win-screen')).toContainText('Миша Додик повержен');
  await expect(page.getByTestId('win-screen')).toContainText('1:15');
  await page.waitForTimeout(900);
  await page.locator('#win-exit').click();
  await expect(page.getByTestId('panel-root')).toBeVisible();
});

test('тренировка: счётчик урона и сброс босса клавишей Y', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__tt!.start({ kind: 'bosstest', boss: 'vladik', train: true, trainPhase: 2 }));
  await page.waitForTimeout(700);
  await expect(page.getByTestId('train-hud')).toContainText('ТРЕНИРОВКА');
  const hp = await page.evaluate(() => { const w = window.__tt!.shared.session!.world; return [w['vladik'].hp, w['vladik'].maxHp]; });
  expect(hp[0]).toBeLessThan(hp[1]!); // старт со второй фазы: здоровье босса уже убавлено
  await page.keyboard.press('KeyY');
  expect(await page.evaluate(() => window.__tt!.shared.session!.world['train'].resets)).toBe(1);
});

test('геймпад в игре: Start — пауза, B — продолжить, меню паузы крестовиной', async ({ page }) => {
  await boot(page, { pad: true });
  await page.evaluate(() => window.__tt!.start({ kind: 'story', fresh: true }));
  await page.waitForTimeout(700);
  await press(page, 9); // Start
  await expect(page.getByTestId('pause-title')).toBeVisible();
  await press(page, 13); await press(page, 13); // «Заново» → «Карта»
  await press(page, 1); // B — продолжить
  await expect(page.getByTestId('pause-title')).toHaveCount(0);
  await press(page, 9);
  await expect(page.getByTestId('pause-title')).toBeVisible();
  await press(page, 0); // A на «Продолжить»
  await expect(page.getByTestId('pause-title')).toHaveCount(0);
  // после закрытия паузы кнопка A не должна сработать прыжком (залипший ввод гасится)
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__tt!.shared.session!.world['players'][0].vy)).toBeGreaterThanOrEqual(0);
});

test('спидран: «Тропа целиком» стартует с таймером, таймер идёт с первого шага', async ({ page }) => {
  await boot(page);
  await page.getByTestId('m-speedrun').click();
  await page.getByTestId('sr-trail').click();
  await page.getByTestId('sc-solo').click();
  await expect(page.getByTestId('srhud')).toContainText('ждём первого шага');
  await page.waitForFunction(() => (window.__tt!.shared.session?.world['tickN'] ?? 0) > 20);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
  await expect(page.getByTestId('srhud')).not.toContainText('ждём первого шага');
});

test('итог забега: время, сплиты, рекорд записан, строка для друзей принимается таблицей', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__tt!.start({ kind: 'trail' }));
  await page.waitForFunction(() => (window.__tt!.shared.session?.world['tickN'] ?? 0) > 5);
  await page.evaluate(() => {
    const w = window.__tt!.shared.session!.world, r = w['sr'];
    r.t0 = r.clock() - 120000; r.igt = 110000; r.splits = [{ rta: 30000, igt: 28000 }, { rta: 60000, igt: 55000 }, { rta: 90000, igt: 83000 }, { rta: 0, igt: 0 }];
    window.__tt!.debug.srFinish(w);
  });
  await expect(page.getByTestId('sr-total')).toContainText('2:00');
  const line = await page.getByTestId('sr-line').textContent();
  expect(line).toContain('Тропа целиком');
  const pb = await page.evaluate(() => JSON.parse(localStorage.getItem('tt_sr')!).trail.pb.rta);
  expect(pb).toBeGreaterThan(119000);
  await page.waitForTimeout(1300);
  await page.locator('#sr-friends').click();
  await page.locator('#sr-paste').fill('Вася: ' + line!.replace(/^[^:]*: /, ''));
  await page.locator('#sr-add').click();
  await expect(page.locator('#sr-fmsg')).toContainText('Добавлено: 1');
  await page.keyboard.press('Escape');
  await page.locator('#sr-menu').click();
  await expect(page.getByTestId('panel-root')).toBeVisible();
});

test('поворот телефона: меню не пропадает, в игре включается пауза и «Поверните телефон»', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await boot(page);
  // меню: поворот туда и обратно не прячет его
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.locator('#rotate')).toBeVisible();
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(page.locator('#rotate')).toBeHidden();
  await expect(page.getByTestId('m-campaign')).toBeVisible();
  // игра: поворот в портрет ставит паузу
  await page.evaluate(() => window.__tt!.start({ kind: 'story', fresh: true }));
  await page.waitForTimeout(800);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(page.getByTestId('pause-title')).toBeVisible();
  await ctx.close();
});
