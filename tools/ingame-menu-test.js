// Внутриигровые меню (v1.7): пауза, меню скамьи, экран победы, «Как играть», «Что нового».
// Проверяет клавиатуру, геймпад (эмулятор DualSense) и касание (?touch=1), а на пяти размерах экрана — геометрию текстов:
// не выходят за экран, не налезают друг на друга, шрифт на экране не меньше 11 px.
//   NODE_PATH=/tmp/claude-0/harness/node_modules node tools/ingame-menu-test.js [папка_скриншотов]
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const shotDir = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const ONLY = (process.argv[3] || '').split(',').filter(Boolean); // части: kb, bench, win, pad, touch, geo (по умолчанию все)
const want = (n) => !ONLY.length || ONLY.includes(n);
const SIZES = [['667x375', 667, 375, true], ['844x390', 844, 390, true], ['932x430', 932, 430, true], ['1366x768', 1366, 768, false], ['1920x1080', 1920, 1080, false]];
const fails = []; let errs = 0;
const ok = (c, m) => { console.log(c ? 'ок   ' : 'ПРОВАЛ', m); if (!c) fails.push(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// нажатие «как у человека»: клавиша удерживается 40 мс, затем пауза. Две клавиши с разницей в 1–2 мс Phaser обрабатывает с дублями — живой ввод так не бывает
const kpress = async (page, k) => { await page.keyboard.press(k, { delay: 40 }); await sleep(90); };

const PAGE_LIB = `
  window.__texts = (root) => {
    const out = [];
    const walk = (o) => {
      if (!o.visible || o.alpha === 0) return;
      if (o.type === 'Container') { o.list.forEach(walk); return; }
      if (o.type === 'Text' && o.text.trim()) { const b = o.getBounds(); out.push({ t: o.text.slice(0, 30).replace(/\\n/g, ' '), x: b.x, y: b.y, w: b.width, h: b.height, fs: parseFloat(o.style.fontSize) }); }
    };
    if (Array.isArray(root)) root.forEach(walk); else walk(root);
    return out;
  };
  window.__cs = () => window.__game.scale.displaySize.height / VH;
  window.__ui = () => window.__game.scene.getScene('ui');
  window.__gs = () => window.__game.scene.getScene('game');
  // центр объекта интерфейса в координатах окна (для касаний)
  window.__client = (o) => {
    const b = o.getBounds(), r = window.__game.canvas.getBoundingClientRect(), s = r.width / VW;
    return { x: r.left + (b.x + b.width / 2) * s, y: r.top + (b.y + b.height / 2) * s };
  };
`;
const PAD_INIT = () => {
  const pad = { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })), vibrationActuator: null };
  window.__pad = pad; navigator.getGamepads = () => [pad];
  window.__padHold = async (n, ms) => { pad.buttons[n].pressed = true; pad.buttons[n].value = 1; await new Promise((r) => setTimeout(r, ms || 120)); pad.buttons[n].pressed = false; pad.buttons[n].value = 0; await new Promise((r) => setTimeout(r, 120)); };
};

function geometry(name, list, W, H, minPx, cs) {
  for (const a of list) {
    if (a.x < -1 || a.y < -1 || a.x + a.w > W + 1 || a.y + a.h > H + 1) ok(false, `${name}: «${a.t}» выходит за экран (${Math.round(a.x)}…${Math.round(a.x + a.w)} из ${W}, ${Math.round(a.y)}…${Math.round(a.y + a.h)} из ${H})`);
    if (minPx && a.fs * cs < minPx) ok(false, `${name}: «${a.t}» шрифт на экране ${(a.fs * cs).toFixed(1)} px < ${minPx}`);
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w > 2 && h > 2) ok(false, `${name}: «${a.t}» накладывается на «${b.t}» (${Math.round(w)}x${Math.round(h)})`);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const open = async (w, h, q, o) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!(o && o.touch), isMobile: false });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')); });
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    if (o && o.pad) await page.addInitScript(PAD_INIT);
    await page.goto('file://' + (process.env.INDEX || path.resolve(__dirname, '../index.html')) + (q || ''));
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
    await page.addScriptTag({ content: PAGE_LIB });
    await page.evaluate(() => { Snd.play = () => { }; });
    await sleep(300);
    return page;
  };
  const start = async (page, data) => { await page.evaluate((d) => { const g = window.__game; g.scene.stop('menu'); g.scene.start('game', d); }, data); await sleep(1700); };
  const shot = async (page, n) => { if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, n + '.png') }); } };
  const st = (page) => page.evaluate(() => { const g = __gs(), u = __ui(); return { paused: g.paused, pv: u.pause.visible, sel: u.pmMenu ? u.pmMenu.sel : -1, items: u.pmMenu ? u.pmMenu.texts.map((t) => t.text) : [],
    how: HowTo.open, chg: Changelog.open, set: Settings.open, bench: !!g.benchMenuOpen, benchV: !!(u.benchC && u.benchC.visible), shop: !!g.shopOpen, gear: !!g.gearOpen, map: MapTravel.open }; });
  const seat = (page, bi) => page.evaluate((i) => { const g = __gs(), p = g.players[0], b = g.benches[i || 0]; for (const e of g.enemies) { e.dead = true; if (e.g) e.g.clear(); } /* враги у скамьи в реальном времени отбрасывают героя и срывают тест */ p.sit = false; p.x = b.x - 7; p.y = b.y - 26; p.vy = 0; p.vx = 0; g.camX = p.x; g.camY = p.y; }, bi);
  const storyData = { players: 1, mode: 'story' };
  // на загруженной машине таймеры страницы идут редко: ждём условие, а не фиксированное время
  const until = async (page, fn, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await page.evaluate(fn)) return true; await sleep(100); } return false; };

  // ================= 1. КЛАВИАТУРА (960x540) =================
  if (want('kb')) {
    const page = await open(960, 540, '');
    await start(page, storyData);
    const kb = { press: (k) => kpress(page, k), down: (k) => page.keyboard.down(k), up: (k) => page.keyboard.up(k) };
    await kb.press('Escape'); await sleep(250);
    let s = await st(page);
    ok(s.pv && s.paused, 'Esc: пауза открылась');
    ok(s.items.length === 7 && /Продолжить/.test(s.items[0]) && /Заново/.test(s.items[1]) && /Карта/.test(s.items[2]) && /Как играть/.test(s.items[4]) && /Настройки/.test(s.items[5]) && /В главное меню/.test(s.items[6]), 'пункты паузы: ' + s.items.join(' | '));
    // справка-простыня убрана: в паузе нет длинных абзацев
    const long = await page.evaluate(() => __texts(__ui().pause).filter((t) => t.w > 700 || t.h > 60).map((t) => t.t));
    ok(long.length === 0, 'в паузе нет простыни справки: ' + long.join(' | '));
    await kb.press('ArrowDown'); await kb.press('ArrowDown'); s = await st(page); ok(s.sel === 2, '↓↓ — третий пункт');
    await kb.press('ArrowUp'); await kb.press('s'); s = await st(page); ok(s.sel === 2, '↑ и S двигают выбор');
    await kb.press('ArrowUp'); await kb.press('ArrowUp'); await kb.press('ArrowUp'); s = await st(page); ok(s.sel === 6, '↑ с первого пункта — на последний (по кругу)');
    await kb.press('1'); await sleep(250); s = await st(page); ok(!s.pv && !s.paused, 'цифра 1 — «Продолжить»');
    await kb.press('Escape'); await sleep(200);
    // «Как играть» цифрой 5
    await kb.press('5'); await sleep(250); s = await st(page);
    ok(s.how && s.pv, '«Как играть» открывается из паузы');
    const hw = await page.evaluate(() => { const e = document.getElementById('howto'); const tabs = [...e.querySelectorAll('.hw-tabs button')].map((b) => b.textContent); return { tabs, sel: e.querySelector('[aria-selected=true]').textContent, bg: getComputedStyle(e).backgroundColor }; });
    ok(hw.tabs.join() === 'Управление,Приёмы,Кооп,Боссы' && hw.sel === 'Управление', 'вкладки: ' + hw.tabs.join());
    ok(/rgb\(7, 13, 12\)/.test(hw.bg), 'фон «Как играть» непрозрачный: ' + hw.bg);
    await kb.press('ArrowRight'); s = await page.evaluate(() => document.querySelector('#howto [aria-selected=true]').textContent); ok(s === 'Приёмы', '→ — вкладка «Приёмы»');
    await kb.press('3'); s = await page.evaluate(() => document.querySelector('#howto [aria-selected=true]').textContent); ok(s === 'Кооп', 'цифра 3 — «Кооп»');
    await kb.press('ArrowLeft'); await kb.press('ArrowLeft');
    s = await page.evaluate(() => document.querySelector('#howto [aria-selected=true]').textContent); ok(s === 'Управление', '← ← — «Управление»');
    const first = await page.evaluate(() => document.querySelector('#howto .hw-body h4').textContent);
    ok(/Клавиатура/.test(first), 'раскладка текущего устройства первой: ' + first);
    // удерживаем Esc внутри окна — пауза не снимается
    await kb.press('Escape'); await sleep(250); s = await st(page);
    ok(!s.how && s.pv && s.paused, 'Esc закрывает «Как играть» и возвращает в паузу (игра не продолжилась)');
    // настройки
    await kb.press('6'); await sleep(250); s = await st(page); ok(s.set, '«Настройки» открываются из паузы');
    await page.evaluate(() => Settings.hide()); await sleep(200); s = await st(page); ok(s.pv && s.paused && s.items.length === 7, 'после настроек пауза на месте');
    // Enter по выбранному пункту: «Заново» — перезапуск игры
    await page.evaluate(() => { window.__retry = 0; __ui().retry = () => { window.__retry++; }; });
    await kb.press('2'); await sleep(100); ok((await page.evaluate(() => window.__retry)) === 1, 'цифра 2 — «Заново»');
    // «Карта» из паузы
    await kb.press('3'); await sleep(250); s = await st(page); ok(s.map && !s.pv, '«Карта» из паузы открывает карту');
    await page.evaluate(() => MapTravel.close(__gs())); await sleep(200);
    // «Снаряжение»
    await kb.press('Escape'); await sleep(200); await kb.press('4'); await sleep(250); s = await st(page); ok(s.gear, '«Снаряжение» из паузы');
    await page.evaluate(() => Gear.close(__gs())); await until(page, () => !__gs().gearOpen);
    await kb.press('Escape'); await sleep(200); s = await st(page); ok(!s.pv, 'Esc снимает паузу');
    // В главное меню — последний пункт
    await kb.press('Escape'); await sleep(200); await kb.press('7'); await sleep(500);
    ok(await page.evaluate(() => window.__game.scene.getScene('menu').sys.isActive()), '«В главное меню» из паузы');
    await page.close();
  }
  // «Что нового»: прокрутка колёсиком, стрелками, закрытие
  if (want('kb')) {
    const page = await open(960, 540, '');
    await page.evaluate(() => Changelog.show(() => { window.__closed = 1; }));
    await sleep(200);
    const m = await page.evaluate(() => { const b = document.querySelector('#changelog .hw-body'); return { sh: b.scrollHeight, ch: b.clientHeight, n: b.querySelectorAll('li').length, ver: document.querySelector('#changelog .hw-ver').textContent }; });
    ok(m.n === (await page.evaluate(() => CHANGELOG.length)) && m.sh > m.ch, `«Что нового»: все ${m.n} записей, прокручиваемое окно (${m.sh} > ${m.ch}); ${m.ver}`);
    await page.mouse.move(480, 300); await page.mouse.wheel(0, 300); await until(page, () => document.querySelector('#changelog .hw-body').scrollTop > 50);
    let top = await page.evaluate(() => document.querySelector('#changelog .hw-body').scrollTop); ok(top > 50, 'колёсико листает: ' + top);
    await kpress(page, 'ArrowDown'); await sleep(50);
    const t2 = await page.evaluate(() => document.querySelector('#changelog .hw-body').scrollTop); ok(t2 > top, '↓ листает');
    await kpress(page, 'End'); await sleep(50);
    ok(await page.evaluate(() => { const b = document.querySelector('#changelog .hw-body'); return b.scrollTop + b.clientHeight >= b.scrollHeight - 2; }), 'End — до конца');
    await kpress(page, 'Escape'); await sleep(150);
    ok(!(await page.evaluate(() => Changelog.open)) && (await page.evaluate(() => window.__closed === 1)), 'Esc закрывает и вызывает onClose');
    // «Как играть» с разделом: боссы закрыты до первой встречи
    await page.evaluate(() => { localStorage.removeItem('tt_records'); HowTo.show(null, 'bosses'); }); await sleep(150);
    let b = await page.evaluate(() => [...document.querySelectorAll('#howto .hw-it')].map((e) => e.textContent.slice(0, 40)));
    ok(b.length === 4 && b.every((t) => t.startsWith('???')), 'карточки боссов закрыты без встречи: ' + b.join(' | '));
    await kpress(page, 'Escape');
    await page.evaluate(() => { Records.put('misha', { tries: 3, wins: 1, best: 95 }); HowTo.show(null, 'bosses'); }); await sleep(150);
    b = await page.evaluate(() => [...document.querySelectorAll('#howto .hw-it')].map((e) => ({ t: e.textContent.slice(0, 30), li: e.querySelectorAll('li').length })));
    ok(b[1].t.startsWith('Миша Додик') && b[1].li === 3 && b[0].t.startsWith('???') && b[2].t.startsWith('???'), 'карточка Миши открылась после встречи: ' + JSON.stringify(b));
    await page.evaluate(() => localStorage.removeItem('tt_records'));
    await kpress(page, 'Escape'); await page.close();
  }

  // ================= 2. СКАМЬЯ (клавиатура) =================
  if (want('bench')) {
    const page = await open(960, 540, '');
    await start(page, storyData);
    await page.evaluate(() => { window.__ev = []; const g = __gs(), se = g.sendEv.bind(g); g.sendEv = (m) => { window.__ev.push(m.k); return se(m); }; Settings.resetProgress(); });
    await seat(page, 0); await sleep(500);
    await page.keyboard.down('w'); await sleep(90); await page.keyboard.up('w'); await sleep(250);
    let s = await st(page);
    ok(s.bench && s.benchV && s.paused, '↑ на скамье открывает меню (мир на паузе)');
    ok((await page.evaluate(() => !__gs().players[0].sit)) && (await page.evaluate(() => window.__ev.indexOf('bench') < 0)), 'отдых не случился мгновенно');
    const items = await page.evaluate(() => __ui().benchMenu.texts.map((t) => t.text));
    ok(items.length === 4 && /Отдохнуть/.test(items[0]) && /Лавка/.test(items[1]) && /Карта и переходы/.test(items[2]) && /Снаряжение/.test(items[3]), 'пункты скамьи: ' + items.join(' | '));
    await kpress(page, 'Escape'); await sleep(250); s = await st(page);
    ok(!s.bench && !s.benchV && !s.paused && !s.pv, 'Esc закрывает меню скамьи, пауза не включилась');
    // повторно: Отдохнуть (Enter)
    await sleep(800);
    await page.keyboard.down('w'); await sleep(90); await page.keyboard.up('w'); await sleep(250);
    await kpress(page, 'Enter'); await sleep(300);
    const r = await page.evaluate(() => { const g = __gs(), p = g.players[0]; return { sit: p.sit, paused: g.paused, ev: window.__ev.filter((k) => k === 'bench').length, sv: Settings.progress(), hp: p.hp === p.maxHp, resp: Math.round(g.respawn.x) === Math.round(g.benches[0].x) }; });
    ok(r.sit && !r.paused && r.ev === 1 && r.sv && /Гл\./.test(r.sv.name || '') && r.hp && r.resp, 'Отдохнуть: сел, событие bench, автосохранение, место возрождения: ' + JSON.stringify(r));
    await sleep(600);
    ok(await page.evaluate(() => __gs().players[0].sit), 'после меню герой остался сидеть');
    // Лавка
    await page.evaluate(() => { __gs().players[0].sit = false; }); await sleep(300);
    await page.keyboard.down('w'); await sleep(90); await page.keyboard.up('w'); await sleep(250);
    await kpress(page, '2'); await sleep(300); s = await st(page);
    ok(s.shop && !s.bench && !s.paused, 'Лавка открывается из меню скамьи');
    await kpress(page, 'Escape'); await sleep(300); s = await st(page); ok(!s.shop && !s.pv, 'Esc закрывает лавку, пауза не включилась');
    // Снаряжение возвращает в меню скамьи
    await page.evaluate(() => { __gs().players[0].sit = false; }); await sleep(300);
    await page.keyboard.down('w'); await sleep(90); await page.keyboard.up('w'); await sleep(250);
    await kpress(page, '4'); await sleep(300); s = await st(page); ok(s.gear && s.bench, 'Снаряжение открывается из меню скамьи');
    await page.evaluate(() => Gear.close(__gs())); await sleep(300); s = await st(page); ok(!s.gear && s.bench && s.benchV, 'закрыв снаряжение, возвращаемся в меню скамьи');
    await kpress(page, '3'); await sleep(300); s = await st(page); ok(s.map && !s.bench, '«Карта и переходы» открывает карту');
    ok(await page.evaluate(() => __gs().players[0].sit), 'карта: герой сидит на скамье (переход возможен)');
    await page.evaluate(() => MapTravel.close(__gs())); await sleep(200);
    await page.close();
  }
  // по сети меню скамьи и пауза мир не замораживают
  if (want('bench')) {
    const page = await open(960, 540, '');
    await start(page, storyData);
    const r = await page.evaluate(async () => {
      const g = __gs(), u = __ui(), o = {};
      g.online = 'host'; g.sendEv = () => { }; Net.send = () => { };
      const b = g.benches[0], p = g.players[0]; p.x = b.x - 7; p.y = b.y - 26; await new Promise((r) => setTimeout(r, 400));
      g.benchOpen(p, b); o.menu = !!g.benchMenuOpen; o.paused = g.paused; const t0 = g.animT; await new Promise((r) => setTimeout(r, 300)); o.runs = g.animT > t0; o.held = g.menuHeld();
      g.benchClose(); g.togglePause(); o.pause = u.pause.visible; o.pausedFlag = g.paused; o.items = u.pmMenu.texts.map((t) => t.text);
      const t1 = g.animT; await new Promise((r) => setTimeout(r, 300)); o.runs2 = g.animT > t1; o.held2 = g.menuHeld(); g.togglePause();
      return o;
    });
    ok(r.menu && !r.paused && r.runs && r.held, 'по сети меню скамьи: мир идёт, ввод героя замер: ' + JSON.stringify(r));
    ok(r.pause && !r.pausedFlag && r.runs2 && r.held2 && !r.items.some((t) => /Заново/.test(t)), 'по сети пауза: мир идёт, нет «Заново»: ' + r.items.join(' | '));
    await page.close();
  }

  // ================= 3. ЭКРАН ПОБЕДЫ (клавиатура) =================
  if (want('win')) {
    const page = await open(960, 540, '');
    await start(page, { players: 1, mode: 'bosstest', boss: 'vladik' });
    await page.evaluate(() => { window.__retry = 0; __ui().retry = () => { window.__retry++; }; __gs().win(); });
    await sleep(150);
    const kb = { press: (k) => kpress(page, k), down: (k) => page.keyboard.down(k), up: (k) => page.keyboard.up(k) };
    let w = await page.evaluate(() => ({ items: __ui().winMenu.texts.map((t) => t.text), sel: __ui().winMenu.sel }));
    ok(w.items.join() === 'Заново,В главное меню', 'победа в босс-тесте: ' + w.items.join());
    const early = await page.evaluate(() => { const u = __ui(), k = u.input.keyboard; u.winAt = performance.now(); k.emit('keydown-ENTER', { repeat: false }); k.emit('keydown-SPACE', { repeat: false }); k.emit('keydown-RIGHT', { repeat: false }); return { menu: window.__game.scene.getScene('menu').sys.isActive(), sel: u.winMenu.sel, retry: window.__retry }; });
    ok(!early.menu && early.sel === 0 && early.retry === 0, 'Enter, Пробел и стрелки в первые 0,8 с игнорируются');
    await page.evaluate(() => { __ui().winAt = performance.now() - 1000; });
    await kb.press('r'); await kb.press('n'); ok((await page.evaluate(() => window.__retry)) === 0, 'R и N ничего не перезапускают');
    await page.evaluate(() => { __ui().winAt = performance.now() - 1000; });
    await page.evaluate(() => { __ui().input.keyboard.emit('keydown-ENTER', { repeat: true }); });
    await kb.press('ArrowRight'); ok((await page.evaluate(() => __ui().winMenu.sel)) === 1, '→ выбирает «В главное меню»');
    await kb.press('ArrowLeft'); await kb.press('Enter'); await sleep(100);
    ok((await page.evaluate(() => window.__retry)) === 1, 'Enter на «Заново»');
    await kb.press('ArrowRight'); await kb.press('Enter'); await sleep(500);
    ok(await page.evaluate(() => window.__game.scene.getScene('menu').sys.isActive()), 'Enter на «В главное меню»');
    await page.close();
    // глава пройдена: Дальше / Заново / В главное меню
    const p2 = await open(960, 540, '');
    await start(p2, storyData);
    await p2.evaluate(() => { window.__go = null; Campaign.go = (gs, c) => { window.__go = c; }; __gs().win(); });
    await sleep(1000);
    const it = await p2.evaluate(() => __ui().winMenu.texts.map((t) => t.text));
    ok(it.length === 3 && /Дальше/.test(it[0]) && it[1] === 'Заново' && it[2] === 'В главное меню', 'глава пройдена: ' + it.join(' | '));
    await kpress(p2, 'Space'); await sleep(100);
    ok(await p2.evaluate(() => window.__go && window.__go.ch === 2 && window.__go.st === 'road'), 'Пробел на «Дальше» ведёт в главу II');
    await p2.close();
    // финал кампании: «Дальше» нет
    const p3 = await open(960, 540, '');
    await start(p3, { players: 1, mode: 'story', camp: { ch: 4, st: 'arena', beads: 0, abil: {}, up: { hp: 0, dmg: 0, silk: 0 }, time: 0, deaths: 0 } });
    await p3.evaluate(() => { __gs().win(); }); await sleep(1000);
    const it3 = await p3.evaluate(() => __ui().winMenu.texts.map((t) => t.text));
    ok(it3.join() === 'Заново,В главное меню', 'финал кампании: ' + it3.join());
    await p3.close();
  }

  // ================= 4. ГЕЙМПАД =================
  if (want('pad')) {
    const page = await open(960, 540, '', { pad: true });
    await start(page, storyData);
    const hold = (n, ms) => page.evaluate(([a, b]) => window.__padHold(a, b), [n, ms]);
    await page.evaluate(() => { window.__pad.buttons[0].pressed = false; }); await hold(13, 100); // активируем геймпад
    await hold(9, 150); await sleep(200);
    let s = await st(page); ok(s.pv && s.paused, 'Options — пауза');
    await hold(13, 150); await hold(13, 150); s = await st(page); ok(s.sel === 2, 'крестовина ↓↓ — третий пункт');
    await hold(12, 150); s = await st(page); ok(s.sel === 1, 'крестовина ↑');
    await page.evaluate(() => { window.__pad.axes[1] = 0.9; }); await sleep(150); await page.evaluate(() => { window.__pad.axes[1] = 0; }); await sleep(150); s = await st(page); ok(s.sel === 2, 'стик вниз тоже выбирает');
    await hold(13, 150); await hold(13, 150); s = await st(page); ok(s.sel === 4, 'до «Как играть»');
    await hold(0, 150); await sleep(200); s = await st(page); ok(s.how, 'A на «Как играть»');
    const first = await page.evaluate(() => document.querySelector('#howto .hw-body h4').textContent);
    ok(/DualSense/.test(first), 'геймпад: раскладка DualSense первой: ' + first);
    await hold(15, 150); s = await page.evaluate(() => document.querySelector('#howto [aria-selected=true]').textContent); ok(s === 'Приёмы', 'крестовина → — вкладка');
    await hold(5, 150); s = await page.evaluate(() => document.querySelector('#howto [aria-selected=true]').textContent); ok(s === 'Кооп', 'R1 — следующая вкладка');
    await hold(1, 150); await sleep(150); s = await st(page); ok(!s.how && s.pv && s.paused, '○ закрывает «Как играть», пауза на месте');
    await hold(1, 150); await sleep(200); s = await st(page); ok(!s.pv && !s.paused, '○ в паузе — «Продолжить»');
    // скамья геймпадом; A удержана — герой не вскакивает
    await seat(page, 0); await sleep(500);
    await hold(12, 150); await sleep(250); s = await st(page); ok(s.bench && s.benchV, 'крестовина ↑ у скамьи открывает меню ' + JSON.stringify({ s, p: await page.evaluate(() => { const g = __gs(), p = g.players[0], b = g.benches[0]; return { sit: p.sit, og: p.onGround, d: [p.x + 7 - b.x, p.y + 26 - b.y], lock: g._mlock, hurt: p.hurtT, dash: p.dashT, down: p.downed, wip: g.wiping, up: p.inp.up }; }) }));
    await page.evaluate(() => { const p = window.__pad.buttons[0]; p.pressed = true; p.value = 1; });
    for (let i = 0; i < 30 && (await page.evaluate(() => !!__gs().benchMenuOpen)); i++) await sleep(200);
    await sleep(900); // A всё ещё зажата: герой должен остаться сидеть
    const r = await page.evaluate(() => ({ sit: __gs().players[0].sit, open: !!__gs().benchMenuOpen }));
    await page.evaluate(() => { const p = window.__pad.buttons[0]; p.pressed = false; p.value = 0; }); await sleep(600);
    ok(!r.open && r.sit && (await page.evaluate(() => __gs().players[0].sit)), 'A: «Отдохнуть» — герой сел и не вскочил от удержанной A ' + JSON.stringify(r));
    // победа геймпадом
    await page.evaluate(() => { __gs().win(); }); await sleep(1100);
    await hold(15, 150); s = await page.evaluate(() => __ui().winMenu.sel); ok(s === 1, 'победа: крестовина → выбирает пункт');
    await hold(15, 150); await hold(14, 150); await hold(15, 150); s = await page.evaluate(() => __ui().winMenu.sel); ok(s === 2, 'победа: ← → двигают выбор, дошли до «В главное меню»');
    await hold(0, 150);
    // выход ждёт, пока кнопки отпустят (иначе главное меню само запустило бы игру); на медленной машине таймеры идут редко
    for (let i = 0; i < 30 && !(await page.evaluate(() => window.__game.scene.getScene('menu').sys.isActive())); i++) await sleep(300);
    ok(await page.evaluate(() => window.__game.scene.getScene('menu').sys.isActive()), 'победа: A на «В главное меню»');
    await sleep(900);
    ok(await page.evaluate(() => window.__game.scene.getScene('menu').sys.isActive()), 'победа: меню не запустило игру само от удержанной A');
    await page.close();
  }

  // ================= 5. КАСАНИЕ =================
  if (want('touch')) {
    const page = await open(844, 390, '?touch=1', { touch: true });
    await start(page, storyData);
    const tap = async (expr) => { const c = await page.evaluate(expr); await page.touchscreen.tap(c.x, c.y); await sleep(250); };
    const itemXY = (label) => `(() => { const t = __ui().pmMenu.texts.find((q) => q.text.indexOf(${JSON.stringify(label)}) >= 0); return __client(t); })()`;
    await page.evaluate(() => Touch.show(true, {}));
    const pc = await page.evaluate(() => { const r = document.getElementById('t-pause').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(pc.x, pc.y); await sleep(300);
    let s = await st(page); ok(s.pv && s.paused, 'касание ❚❚ — пауза');
    ok(!s.items.some((t) => /^\d ·/.test(t)), 'на телефоне в пунктах нет номеров');
    await tap(itemXY('Как играть')); s = await st(page); ok(s.how, 'касание «Как играть»');
    const sizes = await page.evaluate(() => { const bad = []; document.querySelectorAll('#howto *').forEach((e) => { if (e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 11.9) bad.push(e.textContent.slice(0, 20)); }); return bad; });
    ok(sizes.length === 0, 'шрифты «Как играть» на телефоне не меньше 12 px: ' + sizes.slice(0, 3).join(' | '));
    const first = await page.evaluate(() => document.querySelector('#howto .hw-body h4').textContent); ok(/Касание/.test(first), 'на телефоне раскладка касания первой: ' + first);
    await page.tap('#howto .hw-tabs button:nth-child(2)'); await sleep(150);
    ok(await page.evaluate(() => document.querySelector('#howto [aria-selected=true]').textContent) === 'Приёмы', 'касание вкладки');
    // перетаскивание пальцем листает
    const cdp = await page.context().newCDPSession(page);
    const bb = await page.evaluate(() => { const r = document.querySelector('#howto .hw-body').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x, y: bb.y }] });
    for (let k = 1; k <= 12; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bb.x, y: bb.y - k * 14 }] }); await sleep(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
    const sc = await page.evaluate(() => document.querySelector('#howto .hw-body').scrollTop); ok(sc > 40, 'перетаскивание пальцем листает: ' + sc);
    await page.tap('#howto .hw-back'); await sleep(250); s = await st(page); ok(!s.how && s.pv, '«← Назад» закрывает, пауза на месте');
    await tap(itemXY('Продолжить')); s = await st(page); ok(!s.pv && !s.paused, 'касание «Продолжить»');
    // скамья
    await seat(page, 0); await sleep(500);
    await page.evaluate(() => { Touch.state.up = true; }); await sleep(120); await page.evaluate(() => { Touch.state.up = false; }); await sleep(250);
    s = await st(page); ok(s.bench && s.benchV, 'стик вверх у скамьи открывает меню');
    ok(await page.evaluate(() => Touch.root.hidden), 'сенсорные кнопки скрыты, пока открыто меню');
    await tap('(() => __client(__ui().benchMenu.texts[0]))()'); s = await st(page);
    ok(!s.bench && (await page.evaluate(() => __gs().players[0].sit)) && !(await page.evaluate(() => Touch.root.hidden)), 'касание «Отдохнуть»: герой сел, кнопки вернулись');
    // победа
    await page.evaluate(() => { __gs().win(); }); await sleep(1100);
    await tap('(() => __client(__ui().winMenu.texts[__ui().winMenu.texts.length - 1]))()'); await sleep(400);
    ok(await page.evaluate(() => window.__game.scene.getScene('menu').sys.isActive()), 'касание «В главное меню» на экране победы');
    await page.close();
  }

  // ================= 6. ГЕОМЕТРИЯ И СКРИНШОТЫ =================
  for (const [name, w, h, touch] of (want('geo') ? SIZES : [])) {
    const q = touch ? '?touch=1' : '';
    const minPx = touch ? 11 : 11;
    const page = await open(w, h, q, { touch });
    const check = async (what, expr, shotName) => {
      const r = await page.evaluate(expr);
      geometry(`${what} (${name})`, r.list, r.VW, 540, minPx, r.cs);
      await shot(page, `${shotName}-${name}`);
    };
    const texts = (root) => `(() => { const u = __ui(); return { list: __texts(${root}), VW, cs: __cs() }; })()`;
    // пауза (история) — с «лишней» подсказкой геймпада тоже
    await start(page, storyData);
    await page.evaluate(() => { __gs().togglePause(); }); await sleep(300);
    await check('пауза', texts('u.pause'), 'pause');
    await page.evaluate(() => { __gs().togglePause(); });
    // пауза с геймпадом
    await page.evaluate(() => { Pads.list = () => [{ id: 'x', buttons: [], axes: [0, 0, 0, 0], connected: true }]; Pads.active = true; Pads.kindNow = 'ps'; __gs().togglePause(); }); await sleep(300);
    await check('пауза с геймпадом', texts('u.pause'), 'pause-pad');
    await page.evaluate(() => { __gs().togglePause(); Pads.list = () => []; Pads.active = false; });
    // скамья
    await seat(page, 0); await sleep(500);
    await page.evaluate(() => { const g = __gs(); g.benchOpen(g.players[0], g.benches[0]); }); await sleep(300);
    await check('меню скамьи', texts('u.benchC'), 'bench');
    await page.evaluate(() => { __gs().benchClose(); });
    // «Как играть» и «Что нового» (HTML)
    for (const [what, call, id] of [['Как играть', (t) => `HowTo.show(null, ${t})`, 'howto'], ['Что нового', () => 'Changelog.show()', 'changelog']]) {
      for (const tab of (id === 'howto' ? [0, 1, 2, 3] : [0])) {
        await page.evaluate(new Function(call(tab))); await sleep(200);
        const g = await page.evaluate(() => {
          const el = document.querySelector('.hw'), W = innerWidth, H = innerHeight, out = { bad: [], small: [], parts: [] };
          for (const sel of ['.hw-head', '.hw-tabs', '.hw-body', '.hw-foot']) { const e = el.querySelector(sel); if (!e) continue; const r = e.getBoundingClientRect(); out.parts.push({ sel, t: r.top, b: r.bottom, l: r.left, r: r.right }); if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) out.bad.push(sel + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round)); }
          const body = el.querySelector('.hw-body'), br = body.getBoundingClientRect();
          el.querySelectorAll('*').forEach((e) => {
            if (e.children.length || !e.textContent.trim()) return;
            const r = e.getBoundingClientRect(); if (r.width === 0) return;
            if (parseFloat(getComputedStyle(e).fontSize) < 11.9) out.small.push(e.textContent.slice(0, 20));
            if (r.right > W + 1) out.bad.push('текст за правым краем: ' + e.textContent.slice(0, 20));
          });
          out.scrollX = document.documentElement.scrollWidth > innerWidth + 1 || body.scrollWidth > body.clientWidth + 1;
          return out;
        });
        ok(g.bad.length === 0, `${what} вкладка ${tab} (${name}): блоки в пределах экрана ${g.bad.join('; ')}`);
        ok(g.small.length === 0, `${what} вкладка ${tab} (${name}): шрифт < 12 px: ${g.small.slice(0, 3).join(' | ')}`);
        ok(!g.scrollX, `${what} вкладка ${tab} (${name}): нет горизонтальной прокрутки`);
        const ps = g.parts; for (let i = 0; i + 1 < ps.length; i++) ok(ps[i].b <= ps[i + 1].t + 1, `${what} (${name}): ${ps[i].sel} налезает на ${ps[i + 1].sel}`);
        if (tab === 0 || tab === 3 || id === 'changelog') await shot(page, `${id}-${tab}-${name}`);
        await page.evaluate(() => { HowTo.hide(); Changelog.hide(); });
      }
    }
    // победа: босс-тест, глава, финал
    await page.evaluate(() => { __gs().win(); }); await sleep(1100);
    await check('победа (глава I)', texts('u.win'), 'win-ch1');
    await page.close();
    for (const [what, data, tag] of [['победа (босс-тест)', { players: 1, mode: 'bosstest', boss: 'misha' }, 'win-boss'], ['победа (финал)', { players: 2, mode: 'story', camp: { ch: 4, st: 'arena', beads: 120, abil: {}, up: { hp: 1, dmg: 0, silk: 0 }, time: 3600, deaths: 3 } }, 'win-final'],
      ['победа (глава II)', { players: 1, mode: 'story', camp: { ch: 2, st: 'arena', beads: 120, abil: {}, up: { hp: 1, dmg: 0, silk: 0 }, time: 600, deaths: 3 } }, 'win-ch2']]) {
      const p2 = await open(w, h, q, { touch });
      await start(p2, data); await p2.evaluate(() => { __gs().win(); }); await sleep(1100);
      const r = await p2.evaluate(texts('u.win')); geometry(`${what} (${name})`, r.list, r.VW, 540, minPx, r.cs); await shot(p2, `${tag}-${name}`);
      await p2.close();
    }
    // пауза в тренировке: «M — карта» не налезает на «Сброс босса»
    const p3 = await open(w, h, q, { touch });
    await p3.evaluate(() => { Training.on = true; Training.phase = 1; });
    await start(p3, { players: 1, mode: 'bosstest', boss: 'vladik' });
    await p3.evaluate(() => { __gs().togglePause(); }); await sleep(400);
    const rt = await p3.evaluate(texts('u.pause'));
    geometry(`пауза-тренировка (${name})`, rt.list, rt.VW, 540, minPx, rt.cs);
    ok(rt.list.some((t) => /Сброс босса/.test(t.t)), `пауза-тренировка (${name}): есть «Сброс босса»`);
    await shot(p3, `pause-train-${name}`);
    await p3.close();
  }

  console.log('ошибок страницы:', errs, 'провалов:', fails.length);
  await browser.close();
  process.exit(errs || fails.length ? 1 : 0);
})();
