// Тест меню v1.7: обход всех пунктов клавиатурой, геймпадом (эмулятор как в padtest.js) и касанием (?touch=1),
// «Назад» всегда на уровень выше, скриншоты каждого экрана на 5 размерах и автопроверка вёрстки:
// тексты не выходят за экран и не накладываются, на телефоне шрифт >= 11 px, зоны нажатия >= 44 px, фон экранов непрозрачный.
//   NODE_PATH=/tmp/claude-0/harness/node_modules node tools/menu-test.js [папка_скриншотов]
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const shotDir = process.argv[2];
const SIZES = [['667x375', 667, 375, true], ['844x390', 844, 390, true], ['932x430', 932, 430, true], ['1366x768', 1366, 768, false], ['1920x1080', 1920, 1080, false]];
const fails = []; let errs = 0;
const ok = (c, m) => { if (!c) { fails.push(m); console.log('ПРОВАЛ', m); } };
const want = (n) => !process.env.ONLY || process.env.ONLY.split(',').includes(n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SAVE = { bench: 0, beads: 31, abil: { double: true }, chapter: 3, best: 3, stage: 'road', name: 'Гл. III · Школьный коридор' };
const PB = { trail: { pb: { rta: 1421520, igt: 1398100, deaths: 3, ver: '1.6', splits: [{ rta: 300000 }, { rta: 700000 }, { rta: 1100000 }, { rta: 1421520 }] }, seg: [300000, 400000, 400000, 321520] } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const open = async (w, h, touch, save) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')); });
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    await page.addInitScript((save) => {
      const pad = { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) };
      window.__pad = pad; navigator.getGamepads = () => (window.__padOn ? [pad] : []);
      if (save) localStorage.setItem('tt_save', JSON.stringify(save));
    }, save || null);
    await page.goto('file://' + (process.env.INDEX || path.resolve(__dirname, '../index.html')) + (touch ? '?touch=1' : ''));
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive() && window.__game.scene.getScene('menu').mStack);
    await page.evaluate(() => {
      Snd.play = () => { };
      Net.host = (cb) => { setTimeout(() => cb('open', 'ABCDE'), 10); }; Net.join = () => { }; Net.close = () => { }; Net.send = () => { };
    });
    await sleep(300);
    return page;
  };
  const S = (p) => p.evaluate(() => { const m = window.__game.scene.getScene('menu'); return { id: m.mTop().id, depth: m.mStack.length, foc: m.mFoc, n: m.mItems.length, busy: m.busy, leaving: m.leaving, hint: m.mHint && m.mHint.text, settings: Settings.open, cur: Settings.cur, lobby: !Lobby.el.hidden, keys: !Access.el.hidden, crumbs: m.menuCrumbs(), keysList: m.mItems.map((r) => r.key) }; });
  // ввод Phaser обрабатывается в шаге игры, а в песочнице кадры медленные: после каждого ввода ждём пару кадров
  const frames = (p, n) => p.evaluate((n) => new Promise((r) => { const g = window.__game, f = g.loop.frame, t0 = performance.now(); const c = () => (g.loop.frame >= f + n || performance.now() - t0 > 3000 ? r() : setTimeout(c, 4)); c(); }), n || 3);
  const started = (p) => p.waitForFunction(() => { const g = window.__game.scene.getScene('game'); return g && g.sys.isActive() && g.camp !== undefined; }, null, { timeout: 30000 }).catch(() => { }).then(() => sleep(500));
  const key = async (p, k) => { await p.keyboard.press(k); await frames(p, 3); };
  const shot = async (page, n) => { if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, n + '.png') }); } };
  // держим кнопку, пока опрос геймпада её не заметит (иначе на медленных кадрах сработает повтор), и отпускаем
  const PADCMD = { 0: 'ok', 1: 'back', 2: 'x', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  const padHold = async (p, btn) => {
    await p.evaluate(([b]) => { window.__padOn = true; window.__pad.buttons[b].pressed = true; window.__pad.buttons[b].value = 1; }, [btn]);
    await p.waitForFunction((c) => PadNav.st[c] === true, PADCMD[btn], { timeout: 8000, polling: 5 }).catch(() => { });
    await p.evaluate(([b]) => { window.__pad.buttons[b].pressed = false; window.__pad.buttons[b].value = 0; }, [btn]);
    await p.waitForFunction((c) => !PadNav.st[c], PADCMD[btn], { timeout: 8000, polling: 5 }).catch(() => { });
    await frames(p, 2);
  };
  const PAD = { A: 0, B: 1, X: 2, up: 12, down: 13, left: 14, right: 15 };
  const dom = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden; }, sel);
  const tapG = async (p, gx, gy) => {
    const pt = await p.evaluate(([x, y]) => { const r = window.__game.canvas.getBoundingClientRect(); return { x: r.left + x * r.width / VW, y: r.top + y * r.height / 540 }; }, [gx, gy]);
    await p.touchscreen.tap(pt.x, pt.y); await frames(p, 3);
  };
  const rowCenter = (p, i) => p.evaluate((i) => { const m = window.__game.scene.getScene('menu'), r = m.mItems[i], z = r.zn || r.cards[0].bg; return { x: z.x + z.width / 2, y: z.y + z.height / 2, hcss: (z.input && z.input.hitArea ? z.input.hitArea.height : z.height) * m.mCs(), cs: m.mCs() }; }, i);

  // =============== 1. КЛАВИАТУРА ===============
  console.log('-- клавиатура (без сохранения)');
  if (want('kb')) {
    const p = await open(1366, 768, false);
    let s = await S(p);
    ok(s.id === 'main' && s.depth === 1, 'старт: главный экран');
    ok(JSON.stringify(s.keysList) === JSON.stringify(['2', '3', '4', '5', '6', '7']), 'без сохранения нет пункта «Продолжить»: ' + s.keysList);
    ok(/Enter/.test(s.hint) && /2–7/.test(s.hint), 'подсказка для клавиатуры: ' + s.hint);
    await key(p, 'Escape'); s = await S(p); ok(s.id === 'main', 'Esc на главном экране ничего не делает');
    // кампания → режим → по сети → лобби
    await key(p, '2'); s = await S(p); ok(s.id === 'campaign' && s.depth === 2 && s.crumbs.join('>') === 'Кампания', 'Кампания: ' + s.crumbs);
    await key(p, '1'); s = await S(p); ok(s.id === 'mode', 'Новая игра без сохранения сразу ведёт к выбору режима');
    ok(s.crumbs.join(' > ') === 'Кампания > Новая игра', 'крошки режима: ' + s.crumbs.join(' > '));
    await key(p, '3'); s = await S(p); ok(s.id === 'net', 'Вдвоём по сети');
    await key(p, '1'); await frames(p, 4); s = await S(p); ok(s.lobby && s.leaving, 'Создать комнату открывает лобби');
    ok(await p.evaluate(() => document.getElementById('lb-roomcode').textContent === 'ABCDE'), 'комната создана сразу (intent host)');
    ok(await p.evaluate(() => /Создать комнату/.test(document.querySelector('#lobby .crumbs').textContent) && /Кампания/.test(document.querySelector('#lobby .crumbs').textContent)), 'крошки лобби');
    await key(p, 'Escape'); s = await S(p); ok(!s.lobby && !s.leaving && s.id === 'net', 'Esc закрывает лобби, мы на экране «По сети»');
    await key(p, '2'); await frames(p, 4); s = await S(p); ok(s.lobby, 'Войти по коду открывает лобби');
    ok(await p.evaluate(() => document.activeElement.id === 'lb-code'), 'фокус в поле кода');
    await p.keyboard.press('Escape'); await frames(p, 3);
    if (process.env.DBG) console.log('dbg', JSON.stringify(await S(p)), await p.evaluate(() => [Nav.any(), Settings.open, document.activeElement.tagName]));
    for (const [exp] of [['mode'], ['campaign'], ['main']]) { await key(p, 'Escape'); s = await S(p); ok(s.id === exp, 'Esc ведёт на уровень выше: ' + exp + ' (' + s.id + ')'); }
    // босс-тест
    await key(p, '3'); s = await S(p); ok(s.id === 'bosstest' && s.keysList.join('') === '12345', 'Босс-тест: пункты ' + s.keysList);
    const pick0 = await p.evaluate(() => window.__game.scene.getScene('menu').pickIdx);
    await key(p, 'ArrowRight'); const pick1 = await p.evaluate(() => window.__game.scene.getScene('menu').pickIdx);
    ok(pick1 === (pick0 + 1) % 3, '→ меняет босса'); await key(p, 'ArrowLeft'); ok(await p.evaluate(() => window.__game.scene.getScene('menu').pickIdx) === pick0, '← меняет босса назад');
    await key(p, 'KeyT'); ok(await p.evaluate(() => Training.on), 'T включает тренировку');
    await key(p, 'KeyP'); ok(await p.evaluate(() => Training.on && Training.phase === 2), 'P — фаза 2');
    await key(p, '3'); s = await S(p); ok(s.id === 'bosstest', 'в тренировке «по сети» недоступно');
    await key(p, '4'); ok(await p.evaluate(() => !Training.on), '4 выключает тренировку');
    await key(p, '3'); s = await S(p); ok(s.id === 'net', 'без тренировки «по сети» открывается'); await key(p, 'Escape');
    await key(p, 'Escape'); s = await S(p); ok(s.id === 'main', 'назад из босс-теста');
    // спидран
    await key(p, '4'); s = await S(p); ok(s.id === 'speedrun', 'Спидран');
    await key(p, '2'); s = await S(p); ok(s.id === 'srcat' && s.crumbs.join(' > ') === 'Спидран > Босс-раш', 'Босс-раш: ' + s.crumbs.join(' > '));
    await p.evaluate(() => { Settings.s.easy = true; Settings.save(); window.__game.scene.getScene('menu').menuRender(); });
    s = await S(p); ok(s.keysList.join('') === '1234', 'при запрещённых настройках появился пункт 4');
    await key(p, '1'); s = await S(p); ok(!s.leaving && s.id === 'srcat', 'забег не стартует с лёгким режимом');
    await key(p, '4'); ok(await p.evaluate(() => !Settings.s.easy), '«Отключить запрещённые настройки» работает');
    await key(p, '2'); await frames(p, 4); s = await S(p); ok(s.lobby && await p.evaluate(() => Lobby.mode === 'race'), 'Гонка 1×1 открывает лобби race');
    await key(p, 'Escape'); s = await S(p); ok(!s.lobby && s.id === 'srcat', 'Esc из лобби гонки — на экран категории');
    await key(p, '3'); await frames(p, 4); ok(await dom(p, '#sr-fr'), 'Таблица друзей открылась');
    ok(await p.evaluate(() => /Таблица друзей/.test(document.querySelector('#sr-fr .crumbs').textContent)), 'крошки таблицы друзей');
    await p.evaluate(() => document.activeElement && document.activeElement.blur()); await key(p, 'Escape'); ok(!(await dom(p, '#sr-fr')), 'Esc закрывает таблицу друзей'); s = await S(p); ok(s.id === 'srcat', 'после таблицы друзей мы на экране категории');
    await key(p, 'Escape'); await key(p, 'Escape'); s = await S(p); ok(s.id === 'main', 'из Спидрана назад в главное меню');
    // гонки Ткачей (заглушка)
    await key(p, '5'); s = await S(p); ok(s.id === 'races', 'Гонки Ткачей — экран-заглушка');
    for (const k of ['1', '2', '3', '4']) await key(p, k);
    s = await S(p); ok(s.id === 'races' && !s.leaving, 'серые пункты не открываются');
    await key(p, 'Escape');
    // как играть / что нового
    await key(p, '6'); await frames(p, 4); ok(await dom(p, '#howto') && (await S(p)).busy, 'Как играть открылось, меню занято');
    await key(p, '2'); ok((await S(p)).id === 'main', 'пока открыт экран «Как играть», меню не реагирует на цифры');
    await key(p, 'Escape'); await frames(p, 4); ok(!(await dom(p, '#howto')) && !(await S(p)).busy, 'Esc закрывает «Как играть»');
    await key(p, 'KeyN'); await frames(p, 4); ok(await dom(p, '#changelog'), 'N открывает «Что нового»'); await key(p, 'Escape'); ok(!(await dom(p, '#changelog')), '«Что нового» закрылось');
    // настройки
    await key(p, '7'); s = await S(p); ok(s.id === 'settings' && s.keysList.join('') === '12345', 'Настройки: 5 разделов');
    for (const [k, sec, name] of [['1', 'sound', 'Звук'], ['2', 'screen', 'Экран'], ['3', 'controls', 'Управление'], ['4', 'game', 'Игра'], ['5', 'progress', 'Прогресс']]) {
      await key(p, k); await frames(p, 4); s = await S(p);
      ok(s.settings && s.cur === sec, `раздел ${name} открылся`);
      ok(await p.evaluate((n) => document.querySelector('#settings .crumbs').textContent === 'Настройки › ' + n, name), `крошки раздела ${name}: ` + await p.evaluate(() => document.querySelector('#settings .crumbs').textContent));
      if (sec === 'controls') {
        await p.click('#st-keys'); await frames(p, 4); ok(await dom(p, '#keys'), 'Клавиши открылись');
        ok(await p.evaluate(() => /Клавиши/.test(document.querySelector('#keys .crumbs').textContent)), 'крошки клавиш');
        await key(p, 'Escape'); ok(!(await dom(p, '#keys')) && (await S(p)).settings, 'Esc закрывает клавиши, настройки остались');
      }
      await key(p, 'Escape'); s = await S(p); ok(!s.settings && s.id === 'settings', `Esc из раздела ${name} — на экран «Настройки»`);
    }
    // значения сохраняются и применяются как раньше
    await key(p, '2'); await frames(p, 4);
    for (const id of ['shake', 'noflash', 'outl']) { const before = await p.evaluate((i) => Settings.s[i], id); await p.click('#st-' + id); ok(await p.evaluate(([i]) => Settings.s[i], [id]) === !before, 'переключатель ' + id); }
    ok(await p.evaluate(() => JSON.parse(localStorage.getItem('tt_settings')).outl === true), 'настройки пишутся в localStorage');
    await key(p, 'Escape');
    await key(p, '1'); await frames(p, 4);
    await p.fill('#st-vol', '30'); ok(await p.evaluate(() => Settings.s.vol === 30), 'громкость звуков');
    await p.fill('#st-mvol', '20'); ok(await p.evaluate(() => Settings.s.mvol === 20), 'громкость музыки');
    await key(p, 'Escape');
    await key(p, '4'); await frames(p, 4);
    await p.click('#st-easy'); ok(await p.evaluate(() => Settings.s.easy === true), 'лёгкий режим'); await p.click('#st-easy');
    await p.evaluate(() => document.querySelector('[name=st-speed][value="80"]').click()); ok(await p.evaluate(() => Settings.s.speed === 80), 'скорость игры'); await p.evaluate(() => document.querySelector('[name=st-speed][value="100"]').click());
    await key(p, 'Escape');
    await key(p, '3'); await frames(p, 4); await p.click('#st-vibro'); ok(await p.evaluate(() => Settings.s.vibro === false), 'вибрация'); await key(p, 'Escape');
    // цифры внутри раздела выбирают пункт
    await key(p, '1'); await frames(p, 4); await key(p, '2'); ok(await p.evaluate(() => document.activeElement.id === 'st-mvol'), 'цифра 2 в разделе «Звук» ведёт к музыке'); await key(p, 'Escape');
    await key(p, 'Escape');
    // быстрый старт игры: босс-тест, 1
    await key(p, '3'); await key(p, '1'); await started(p);
    ok(await p.evaluate(() => window.__game.scene.getScene('game').sys.isActive()), 'Босс-тест → 1 запускает бой');
    await p.close();
  }

  console.log('-- клавиатура (с сохранением)');
  if (want('save')) {
    const p = await open(1366, 768, false, SAVE);
    let s = await S(p);
    ok(s.keysList.join('') === '1234567' && s.n === 7, 'с сохранением 7 пунктов');
    { const sub = await p.evaluate(() => window.__game.scene.getScene('menu').mItems[0].sub.text); ok(sub === 'Гл. III · Школьный коридор', '«Продолжить» подписан главой и скамьёй: ' + sub); }
    await key(p, '2'); await key(p, '1'); s = await S(p); ok(s.id === 'newgame' && s.foc === 1, 'Новая игра при сохранении спрашивает подтверждение, фокус на «Нет»');
    await key(p, 'Enter'); s = await S(p); ok(s.id === 'campaign', '«Нет» возвращает на уровень выше');
    await key(p, '1'); await key(p, '1'); s = await S(p); ok(s.id === 'mode' && s.crumbs.join(' > ') === 'Кампания > Новая игра', 'Да → выбор режима: ' + s.crumbs.join(' > '));
    ok(await p.evaluate(() => window.__game.scene.getScene('menu').mTop().ctx.camp.ch === 1), 'новая игра — глава I');
    await key(p, 'Escape'); s = await S(p); ok(s.id === 'newgame', 'назад из режима — на подтверждение'); await key(p, 'Escape'); s = await S(p); ok(s.id === 'campaign', 'и ещё выше — в Кампанию: ' + s.id);
    await key(p, '2'); s = await S(p); ok(s.id === 'chapters' && s.n === 3, 'Выбор главы: пройденные главы I–III');
    await key(p, '3'); s = await S(p); ok(s.id === 'mode' && /Глава III/.test(s.crumbs.join(' ')), 'Глава III → режим: ' + s.crumbs.join(' > '));
    ok(await p.evaluate(() => { const c = window.__game.scene.getScene('menu').mTop().ctx.camp; return c.ch === 3 && c.st === 'road' && c.beads === 31; }), 'камп-данные главы III из сохранения');
    await key(p, '2'); await started(p);
    ok(await p.evaluate(() => { const g = window.__game.scene.getScene('game'); return g.sys.isActive() && g.nPlayers === 2 && g.camp.ch === 3; }), 'Двое за одним компьютером запускает главу III');
    await p.close();
    const p2 = await open(1366, 768, false, SAVE);
    await key(p2, '1'); await started(p2);
    ok(await p2.evaluate(() => { const g = window.__game.scene.getScene('game'); return g.sys.isActive() && g.camp.ch === 3; }), '«Продолжить» запускает сохранённую главу');
    await p2.close();
  }

  // =============== 2. ГЕЙМПАД ===============
  console.log('-- геймпад');
  if (want('pad')) {
    const p = await open(1366, 768, false);
    await padHold(p, PAD.down); await padHold(p, PAD.down);
    let s = await S(p); ok(s.foc === 2, 'крестовина ↓ ×2: фокус на третьем пункте (' + s.foc + ')');
    ok(/A — открыть/.test(s.hint) && /B — назад/.test(s.hint) || /✕/.test(s.hint), 'подсказка для геймпада: ' + s.hint);
    await padHold(p, PAD.A); s = await S(p); ok(s.id === 'speedrun', 'A открывает пункт (Спидран)');
    await padHold(p, PAD.B); s = await S(p); ok(s.id === 'main', 'B — на уровень выше');
    await padHold(p, PAD.B); s = await S(p); ok(s.id === 'main', 'B на главном экране ничего не делает');
    // стик
    await p.evaluate(() => { window.__padOn = true; window.__pad.axes[1] = -0.9; }); await frames(p, 2); await p.evaluate(() => { window.__pad.axes[1] = 0; }); await frames(p, 3);
    s = await S(p); ok(s.foc === 1, 'стик вверх сдвигает фокус (' + s.foc + ')');
    await padHold(p, PAD.up); s = await S(p); ok(s.foc === 0, '↑ до первого');
    await padHold(p, PAD.A); s = await S(p); ok(s.id === 'campaign', 'A: Кампания');
    await padHold(p, PAD.A); s = await S(p); ok(s.id === 'mode', 'A: Новая игра → режим');
    await padHold(p, PAD.down); await padHold(p, PAD.down); await padHold(p, PAD.A); s = await S(p); ok(s.id === 'net', 'Вдвоём по сети');
    await padHold(p, PAD.A); await frames(p, 4); s = await S(p); ok(s.lobby, 'A: Создать комнату — лобби открыто');
    await padHold(p, PAD.B); await frames(p, 4); s = await S(p); ok(!s.lobby && s.id === 'net', 'B закрывает лобби');
    await padHold(p, PAD.B); await padHold(p, PAD.B); await padHold(p, PAD.B); s = await S(p); ok(s.id === 'main', 'B ×3: обратно в главное меню');
    // босс-тест: ← → меняют босса
    await padHold(p, PAD.down); await padHold(p, PAD.A); s = await S(p); ok(s.id === 'bosstest', 'Босс-тест по геймпаду');
    const b0 = await p.evaluate(() => window.__game.scene.getScene('menu').pickIdx);
    await padHold(p, PAD.right); ok(await p.evaluate(() => window.__game.scene.getScene('menu').pickIdx) === (b0 + 1) % 3, '→ на крестовине меняет босса');
    await padHold(p, PAD.B);
    // настройки + слайдер оверлея
    for (let i = 0; i < 6 && (await S(p)).foc !== 5; i++) await padHold(p, PAD.down);
    await padHold(p, PAD.A); s = await S(p); ok(s.id === 'settings', 'Настройки по геймпаду');
    await padHold(p, PAD.A); await frames(p, 4); s = await S(p); ok(s.settings && s.cur === 'sound', 'A: раздел Звук');
    const v0 = await p.evaluate(() => Settings.s.vol);
    await padHold(p, PAD.right); ok(await p.evaluate(() => Settings.s.vol) === v0 + 10, '→ двигает ползунок (' + v0 + ' → ' + await p.evaluate(() => Settings.s.vol) + ')');
    await padHold(p, PAD.down); ok(await p.evaluate(() => document.activeElement.id === 'st-mvol'), '↓ переводит на следующий ползунок');
    await padHold(p, PAD.B); await frames(p, 4); s = await S(p); ok(!s.settings && s.id === 'settings', 'B закрывает раздел настроек');
    // раздел «Экран»: A переключает флажок
    await padHold(p, PAD.down); await padHold(p, PAD.A); await frames(p, 4);
    const sh0 = await p.evaluate(() => Settings.s.shake); await padHold(p, PAD.A); ok(await p.evaluate(() => Settings.s.shake) === !sh0, 'A переключает флажок «Тряска экрана»');
    await padHold(p, PAD.B); await padHold(p, PAD.B); s = await S(p); ok(s.id === 'main', 'B, B — главное меню');
    // подсказка меняется на клавиатуру
    await key(p, 'ArrowDown'); s = await S(p); ok(/Enter/.test(s.hint) && !/B — назад/.test(s.hint), 'после клавиши подсказка снова для клавиатуры: ' + s.hint);
    await p.close();
  }

  // =============== 3. КАСАНИЕ ===============
  console.log('-- касание');
  if (want('touch')) {
    const p = await open(667, 375, true, SAVE);
    let s = await S(p);
    ok(/Коснитесь/.test(s.hint), 'подсказка для касания: ' + s.hint);
    for (let i = 0; i < s.n; i++) { const c = await rowCenter(p, i); ok(c.hcss >= 43.5, `зона пункта ${i} на экране ${c.hcss.toFixed(1)} px < 44`); }
    const c1 = await rowCenter(p, 1); await tapG(p, c1.x, c1.y); s = await S(p); ok(s.id === 'campaign', 'касание: Кампания');
    ok(/«← Назад»/.test(s.hint), 'подсказка с кнопкой «← Назад»');
    await tapG(p, 50, 24); s = await S(p); ok(s.id === 'main', 'касание «← Назад» — главное меню');
    const c2 = await rowCenter(p, 2); await tapG(p, c2.x, c2.y); s = await S(p); ok(s.id === 'bosstest', 'касание: Босс-тест');
    for (let i = 1; i < s.n; i++) { const c = await rowCenter(p, i); ok(c.hcss >= 43.5, `босс-тест: зона пункта ${i} ${c.hcss.toFixed(1)} px < 44`); }
    const cards = await p.evaluate(() => window.__game.scene.getScene('menu').mItems[0].cards.map((c) => ({ x: c.bg.x + c.bg.width / 2, y: c.bg.y + c.bg.height / 2, h: c.bg.height * window.__game.scene.getScene('menu').mCs() })));
    ok(cards.every((c) => c.h >= 43.5), 'карточки боссов выше 44 px');
    await tapG(p, cards[2].x, cards[2].y); ok(await p.evaluate(() => window.__game.scene.getScene('menu').pickIdx) === 2, 'касание карточки выбирает босса');
    await tapG(p, 50, 24); await frames(p, 4);
    const c6 = await rowCenter(p, 6); await tapG(p, c6.x, c6.y); s = await S(p); ok(s.id === 'settings', 'касание: Настройки');
    const r1 = await rowCenter(p, 0); await tapG(p, r1.x, r1.y); await frames(p, 4); s = await S(p); ok(s.settings, 'касание раздела открывает оверлей');
    const bb = await p.evaluate(() => { const r = document.querySelector('#settings .ovback').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
    ok(bb.w >= 43.5 && bb.h >= 43.5, 'кнопка «← Назад» в оверлее не меньше 44 px');
    await p.touchscreen.tap(bb.x, bb.y); await frames(p, 4); s = await S(p); ok(!s.settings && s.id === 'settings', 'касание «← Назад» в оверлее');
    await tapG(p, 50, 24); await frames(p, 4); s = await S(p);
    // «Что нового ›» касанием
    const lz = await p.evaluate(() => { const m = window.__game.scene.getScene('menu'); const z = m.mObj.find((o) => o.type === 'Zone'); return { x: z.x + z.width / 2, y: z.y + z.height / 2, h: z.height * m.mCs() }; });
    ok(lz.h >= 43.5, 'зона «Что нового ›» не меньше 44 px');
    await tapG(p, lz.x, lz.y); await frames(p, 4); ok(await dom(p, '#changelog'), 'касание «Что нового ›» открывает экран');
    await p.close();
  }

  // =============== 4. ВЁРСТКА И СКРИНШОТЫ ===============
  console.log('-- вёрстка и скриншоты');
  const PAGE_LIB = `
    window.__geo = (m) => {
      const cs = m.mCs(), out = [], heroTags = m.heroTags || [];
      const walk = (o) => {
        if (!o.visible || o.alpha === 0) return;
        if (o.type === 'Container') { o.list.forEach(walk); return; }
        if (o.type === 'Text' && o.text.trim() && !heroTags.includes(o)) { const b = o.getBounds(); out.push({ t: o.text.slice(0, 30).replace(/\\n/g, ' '), x: b.x, y: b.y, w: b.width, h: b.height, fs: parseFloat(o.style.fontSize) * Math.abs(o.scaleX) * cs }); }
      };
      m.children.list.forEach(walk);
      return { texts: out, cs, VW, baseVisible: (m.mBase || []).some((o) => o.visible), opaque: m.mObj.some((o) => o.type === 'Rectangle' && o.width >= VW && o.height >= 540 && o.fillAlpha === 1) };
    };
    window.__domGeo = (sel) => {
      const root = document.querySelector(sel), res = { leaves: [], ctl: [], vw: innerWidth, vh: innerHeight, opaque: false, scroll: false };
      const cs0 = getComputedStyle(root); const m = cs0.backgroundColor.match(/[\\d.]+/g) || []; res.opaque = m.length === 3 || (m.length === 4 && +m[3] === 1);
      const body = root.querySelector('.ovbody'); res.scroll = !!body && body.scrollHeight > body.clientHeight + 2;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        const t = n.nodeValue.trim(); if (!t) continue; const el = n.parentElement;
        if (el.closest('[hidden]') || !el.getClientRects().length) continue;
        const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
        const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); if (!b.width) continue;
        const bd = el.closest('.ovbody'), br = bd && bd.getBoundingClientRect(); if (bd && res.scroll && (b.top < br.top - 1 || b.bottom > br.bottom + 1)) continue; // за краем прокрутки
        res.leaves.push({ t: t.slice(0, 30), x: b.left, y: b.top, w: b.width, h: b.height, fs: parseFloat(st.fontSize), inScroll: !!bd });
      }
      root.querySelectorAll('button, label.opt, .seg label, .ovback').forEach((e) => { if (e.closest('[hidden]') || !e.getClientRects().length) return; const r = e.getBoundingClientRect(); res.ctl.push({ t: (e.textContent || '').trim().slice(0, 24), w: r.width, h: r.height }); });
      return res;
    };
  `;
  const geomPh = (name, g, phone) => {
    const W = g.VW, H = 540;
    for (const a of g.texts) {
      if (a.x < -1 || a.y < -1 || a.x + a.w > W + 1 || a.y + a.h > H + 1) ok(false, `${name}: «${a.t}» выходит за экран (${Math.round(a.x)}…${Math.round(a.x + a.w)} из ${W}, ${Math.round(a.y)}…${Math.round(a.y + a.h)} из ${H})`);
      if (a.fs < 10.9) ok(false, `${name}: «${a.t}» шрифт на экране ${a.fs.toFixed(1)} px < 11`);
    }
    for (let i = 0; i < g.texts.length; i++) for (let j = i + 1; j < g.texts.length; j++) {
      const a = g.texts[i], b = g.texts[j];
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (w > 2 && h > 2) ok(false, `${name}: «${a.t}» накладывается на «${b.t}» (${Math.round(w)}x${Math.round(h)})`);
    }
  };
  const geomDom = (name, g, touch, allowScroll) => {
    ok(g.opaque, `${name}: фон оверлея не непрозрачный`);
    if (g.scroll && !allowScroll) ok(false, `${name}: содержимое не помещается и прокручивается`);
    for (const a of g.leaves) {
      if (a.x < -1 || a.x + a.w > g.vw + 1) ok(false, `${name}: «${a.t}» выходит за экран по ширине`);
      if (!(allowScroll && a.inScroll) && (a.y < -1 || a.y + a.h > g.vh + 1)) ok(false, `${name}: «${a.t}» выходит за экран по высоте (${Math.round(a.y)}…${Math.round(a.y + a.h)} из ${g.vh})`);
      if (a.fs < 10.9) ok(false, `${name}: «${a.t}» шрифт ${a.fs}px < 11`);
    }
    for (let i = 0; i < g.leaves.length; i++) for (let j = i + 1; j < g.leaves.length; j++) {
      const a = g.leaves[i], b = g.leaves[j];
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (w > 2 && h > 2) ok(false, `${name}: «${a.t}» накладывается на «${b.t}»`);
    }
    if (touch) for (const c of g.ctl) if (c.h < 43.5 || c.w < 43.5) ok(false, `${name}: элемент «${c.t}» ${Math.round(c.w)}×${Math.round(c.h)} < 44 px`);
  };

  const MENU_SCREENS = [
    ['main', (m) => m.menuOpen('main')], ['campaign', (m) => m.menuOpen('campaign')], ['newgame', (m) => m.menuOpen('newgame')], ['chapters', (m) => m.menuOpen('chapters')],
    ['mode', (m) => m.menuOpen('mode', { camp: Campaign.fresh(), crumb: 'Новая игра' })], ['net', (m) => m.menuOpen('net', { mode: 'story' })],
    ['bosstest', (m) => { Training.on = true; Training.phase = 2; m.pickIdx = 1; m.menuOpen('bosstest'); }], ['speedrun', (m) => m.menuOpen('speedrun')],
    ['srcat-trail', (m) => { m.srCat = 'trail'; m.menuOpen('srcat', { cat: 'trail' }); }], ['srcat-boss-bad', (m) => { Settings.s.easy = true; Settings.s.speed = 80; m.srCat = 'boss'; m.menuOpen('srcat', { cat: 'boss' }); }],
    ['races', (m) => m.menuOpen('races')], ['settings', (m) => m.menuOpen('settings')],
  ];
  const OVERLAYS = [
    ['settings-list', '#settings', () => Settings.show(null), false], ['settings-sound', '#settings', () => Settings.show(null, 'sound'), false], ['settings-screen', '#settings', () => Settings.show(null, 'screen'), false],
    ['settings-controls', '#settings', () => Settings.show(null, 'controls'), false], ['settings-game', '#settings', () => Settings.show(null, 'game'), false], ['settings-progress', '#settings', () => Settings.show(null, 'progress'), false],
    ['keys', '#keys', () => { Settings.show(null, 'controls'); Access.show(); }, true],
    ['lobby-host', '#lobby', () => { const m = window.__game.scene.getScene('menu'); m.menuOpen('net', { mode: 'story' }); m.openLobby('story', 'host'); }, true],
    ['howto', '#howto', () => HowTo.show(null), true], ['changelog', '#changelog', () => Changelog.show(null), true],
    ['friends', '#sr-fr', () => Speedrun.friendsOpen(), true], ['race-room', '#sr-room', () => { window.__game.scene.getScene('menu').menuOpen('srcat', { cat: 'trail' }); Speedrun.raceOpen('host'); }, true],
  ];
  for (const [sz, w, h, touch] of SIZES) {
    if (!want('layout')) break;
    const p = await open(w, h, touch, SAVE);
    await p.addScriptTag({ content: PAGE_LIB });
    await p.evaluate((pb) => { localStorage.setItem('tt_sr', JSON.stringify(pb)); }, PB);
    for (const [id, fn] of MENU_SCREENS) {
      await p.evaluate((src) => { eval('(' + src + ')')(window.__game.scene.getScene('menu')); }, fn.toString());
      await frames(p, 4);
      const g = await p.evaluate(() => window.__geo(window.__game.scene.getScene('menu')));
      const name = `${id} @${sz}`;
      geomPh(name, g, touch);
      if (id !== 'main') { ok(g.opaque, `${name}: нет сплошного фона экрана`); ok(!g.baseVisible, `${name}: фон главного меню (заставка) виден`); }
      const st = await S(p);
      // зоны нажатия на касании
      if (touch) for (let i = 0; i < st.n; i++) { const c = await rowCenter(p, i); if (c.hcss < 43.5) ok(false, `${name}: зона пункта ${i} ${c.hcss.toFixed(1)} px < 44`); }
      await shot(p, `${sz}-${id}`);
      await p.evaluate(() => { Training.on = false; Training.phase = 1; Settings.s.easy = false; Settings.s.speed = 100; });
    }
    // главное меню без сохранения (6 пунктов) на этом размере
    for (const [id, sel, fn, scroll] of OVERLAYS) {
      await p.evaluate(() => { window.__game.scene.getScene('menu').menuOpen('main'); });
      await p.evaluate((src) => { eval('(' + src + ')')(); }, fn.toString());
      await frames(p, 4);
      const g = await p.evaluate((s) => window.__domGeo(s), sel);
      geomDom(`${id} @${sz}`, g, touch, scroll);
      if (id === 'friends' || id === 'race-room' || id === 'lobby-host') { /* допускаем прокрутку содержимого, но верхняя панель и подсказка должны быть на месте */ }
      await shot(p, `${sz}-ov-${id}`);
      // закрываем всё
      await p.evaluate(() => {
        if (!Access.el.hidden) Access.hide(); if (Settings.open) Settings.hide(); if (!Lobby.el.hidden) Lobby.hide(true);
        for (const i of ['howto', 'changelog']) { const e = document.getElementById(i); if (e) e.hidden = true; }
        if (Speedrun.race) Speedrun.raceLeave(); const f = document.getElementById('sr-fr'); if (f) f.hidden = true;
        const m = window.__game.scene.getScene('menu'); m.busy = false; m.leaving = false;
      });
    }
    await p.close();
  }

  console.log('ошибок страницы:', errs, 'провалов:', fails.length);
  await browser.close();
  process.exit(errs || fails.length ? 1 : 0);
})();
