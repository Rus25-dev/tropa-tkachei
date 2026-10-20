// Регрессия интерфейса (список багов 1.5, часть 3): геометрия текстов на разных экранах, автопауза в портрете,
// реплики боссов и сенсорные кнопки на телефоне, Esc в лобби, поля ввода на iOS.
//   NODE_PATH=/tmp/claude-0/harness/node_modules node tools/bugs3-test.js [папка_скриншотов]
// Экраны: 1366x768 (ноутбук), 800x375 (iPhone SE), 844x390 (iPhone 13), 1280x800 (Steam Deck); ?touch=1 — сенсорный режим.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const shotDir = process.argv[2];
const SCREENS = [['ноутбук 1366x768', 1366, 768, ''], ['iPhone SE 800x375', 800, 375, '?touch=1'], ['iPhone 13 844x390', 844, 390, '?touch=1'], ['Steam Deck 1280x800', 1280, 800, '']];
const fails = []; let errs = 0;
const ok = (c, m) => { if (!c) { fails.push(m); console.log('ПРОВАЛ', m); } };

// в странице: видимые тексты контейнера/сцены с границами в игровых координатах
const PAGE_LIB = `
  window.__texts = (root, skip) => {
    const out = [];
    const walk = (o) => {
      if (!o.visible || o.alpha === 0 || (skip && skip(o))) return;
      if (o.type === 'Container') { o.list.forEach(walk); return; }
      if (o.type === 'Text' && o.text.trim()) { const b = o.getBounds(); out.push({ t: o.text.slice(0, 28).replace(/\\n/g, ' '), x: b.x, y: b.y, w: b.width, h: b.height, fs: parseFloat(o.style.fontSize) }); }
    };
    if (Array.isArray(root)) root.forEach(walk); else if (root.list) walk(root); else root.children.list.forEach(walk);
    return out;
  };
  window.__cs = (sc) => sc.scale.displaySize.height / VH;
`;
// проверка: все тексты внутри экрана и не пересекаются
function geometry(name, list, W, H, noPairs) {
  for (const a of list) {
    if (a.x < -1 || a.y < -1 || a.x + a.w > W + 1 || a.y + a.h > H + 1) ok(false, `${name}: «${a.t}» выходит за экран (${Math.round(a.x)}…${Math.round(a.x + a.w)} из ${W}, ${Math.round(a.y)}…${Math.round(a.y + a.h)} из ${H})`);
  }
  for (let i = 0; i < list.length && !noPairs; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w > 2 && h > 2) ok(false, `${name}: «${a.t}» накладывается на «${b.t}» (${Math.round(w)}x${Math.round(h)})`);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const open = async (w, h, q) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')); });
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    await page.goto('file://' + (process.env.INDEX || path.resolve(__dirname, '../index.html')) + (q || ''));
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
    await page.addScriptTag({ content: PAGE_LIB });
    await page.evaluate(() => { Snd.play = () => { }; });
    await sleep(400);
    return page;
  };
  const shot = async (page, n) => { if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, n + '.png') }); } };
  const startGame = async (page, data) => { await page.evaluate((d) => { const g = window.__game; g.scene.stop('menu'); g.scene.start('game', d); }, data); await sleep(1800); };

  for (const [name, w, h, q] of SCREENS) {
    const tag = name.split(' ')[0] + (q ? ' touch' : '');
    // ---------- 2. меню: «Что нового» ----------
    {
      const page = await open(w, h, q);
      const r = await page.evaluate(() => {
        const m = window.__game.scene.getScene('menu'), cs = window.__cs(m), ch = m.chTxt;
        const all = window.__texts(m), mine = ch && ch.visible ? ch.getBounds() : null;
        const others = all.filter((o) => !(mine && o.x === mine.x && o.y === mine.y));
        return { all, cs, vis: !!(ch && ch.visible), fs: ch ? parseFloat(ch.style.fontSize) : 0, lines: ch ? ch.text.split('\n').length : 0 };
      });
      const VWv = await page.evaluate(() => VW);
      // «Что нового» целиком на экране и не задевает остальные тексты меню (у самих кнопок и подписей рамки глифов чуть касаются — их не сравниваем между собой)
      const chb = await page.evaluate(() => { const c = window.__game.scene.getScene('menu').chTxt; if (!c.visible) return null; const b = c.getBounds(); return { t: 'Что нового', x: b.x, y: b.y, w: b.width, h: b.height }; });
      if (chb) for (const o of r.all.filter((o) => !/^Версия|^Что нового/.test(o.t) || o.y > 30)) geometry(`меню (${name})`, [chb, o].filter((q, i, arr) => arr.length === 2), VWv, 540);
      geometry(`меню (${name}) границы`, r.all, VWv, 540, true);
      ok(r.vis || /iPhone/.test(name), `меню (${name}): список новинок скрыт без причины`);
      if (r.vis) ok(r.fs * r.cs >= 9.5, `меню (${name}): шрифт новинок на экране ${(r.fs * r.cs).toFixed(1)} px < 9.5`);
      if (/iPhone/.test(name)) ok(r.vis && r.lines <= 1 + 3 * 8, `меню (${name}): лишние строки`);
      await shot(page, 'menu-' + tag.replace(' ', '_'));
      // ---------- 6. «Босс-тест» и «Спидран»: главное меню не просвечивает ----------
      for (const [what, open2, close2] of [['Босс-тест', 'openPick', 'closePick'], ['Спидран', 'openSpeedrun', 'srClose']]) {
        const o = await page.evaluate(([a]) => { const m = window.__game.scene.getScene('menu'); m[a](); const panel = a === 'openPick' ? m.pick : m.srP;
          return { under: window.__texts(m, (x) => x === panel).map((t) => t.t), panel: window.__texts(panel) }; }, [open2]);
        ok(o.under.length === 0, `${what} (${name}): сквозь панель видно меню: ${o.under.slice(0, 3).join(' | ')}`);
        geometry(`${what} (${name})`, o.panel, VWv, 540);
        await shot(page, `${what === 'Босс-тест' ? 'pick' : 'sr'}-${tag.replace(' ', '_')}`);
        const back = await page.evaluate(([c]) => { const m = window.__game.scene.getScene('menu'); m[c](); return window.__texts(m).length; }, [close2]);
        ok(back > 5, `${what} (${name}): после закрытия главное меню не вернулось (${back})`);
      }
      await page.close();
    }
    // ---------- 1 и 8. пауза: справка, кнопки, тренировка, геймпад ----------
    for (const variant of ['история', 'тренировка+геймпад']) {
      const page = await open(w, h, q);
      const train = variant !== 'история';
      if (train) await page.evaluate(() => { Training.on = true; Training.phase = 1; Pads.list = () => [{ id: 'x', buttons: [], axes: [0, 0, 0, 0], connected: true }]; Pads.hint = () => 'DualSense: ✕ прыжок · □ удар · ○ рывок · △ лечение · L1 дымовуха · Options — пауза · Create — карта'; });
      await startGame(page, train ? { players: 1, mode: 'bosstest', boss: 'vladik' } : { players: 2, mode: 'story' });
      await page.evaluate(() => window.__game.scene.getScene('game').togglePause());
      await sleep(250);
      const r = await page.evaluate(() => {
        const u = window.__game.scene.getScene('ui'), cs = window.__cs(u);
        return { list: window.__texts(u.pause).concat(u.trHud ? window.__texts([u.trHud]) : []), cs, vis: u.pause.visible, fs: parseFloat(u.pauseColA.style.fontSize), VW, mapH: u.mapHint.getBounds(), trB: u.trBtn ? u.trBtn.getBounds() : null };
      });
      ok(r.vis, `пауза (${name}, ${variant}): не открылась`);
      geometry(`пауза (${name}, ${variant})`, r.list, r.VW, 540);
      ok(r.fs * r.cs >= (q ? 9.5 : 11), `пауза (${name}, ${variant}): шрифт справки на экране ${(r.fs * r.cs).toFixed(1)} px`);
      if (train) { ok(r.trB && r.list.some((t) => /Сброс босса/.test(t.t)), `пауза (${name}): нет кнопки «Сброс босса»`); ok(r.list.some((t) => /M \(|Кнопка ▤/.test(t.t)), `пауза (${name}): нет подсказки про карту`); }
      if (!train) { // «Настройки» из паузы и возврат: справка остаётся на месте
        await page.evaluate(() => { const u = window.__game.scene.getScene('ui'); u.openSettings(); Settings.hide(); });
        await sleep(150);
        const r2 = await page.evaluate(() => { const u = window.__game.scene.getScene('ui'); return { vis: u.pause.visible, list: window.__texts(u.pause), VW }; });
        ok(r2.vis, `пауза (${name}): не вернулась после настроек`);
        geometry(`пауза после настроек (${name})`, r2.list, r2.VW, 540);
      }
      await shot(page, `pause-${variant === 'история' ? 'story' : 'train'}-${tag.replace(' ', '_')}`);
      await page.close();
    }
  }

  console.log('-- портрет');
  // ---------- 3. портрет: автопауза и снятие ----------
  {
    const page = await open(390, 844, '?touch=1');
    await startGame(page, { players: 1, mode: 'bosstest', boss: 'misha' });
    const st = () => page.evaluate(() => { const g = window.__game.scene.getScene('game'); return { paused: g.paused, ui: g.ui().pause.visible, rot: getComputedStyle(document.getElementById('rotate')).display }; });
    await sleep(300);
    let s = await st(); ok(s.rot !== 'none', 'портрет: заглушка «Поверните телефон» не показана'); ok(s.paused && s.ui, 'портрет: игра не встала на паузу');
    await page.setViewportSize({ width: 844, height: 390 }); await sleep(500);
    s = await st(); ok(!s.paused && !s.ui, 'после поворота пауза не снялась');
    // ручная пауза не снимается поворотом
    await page.evaluate(() => window.__game.scene.getScene('game').togglePause()); await sleep(100);
    await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
    await page.setViewportSize({ width: 844, height: 390 }); await sleep(500);
    s = await st(); ok(s.paused, 'ручная пауза снялась поворотом');
    await page.close();
  }
  // не сенсорный экран в узком окне автопаузы не вызывает
  {
    const page = await open(500, 900, '');
    await startGame(page, { players: 1, mode: 'story' }); await sleep(300);
    ok(!(await page.evaluate(() => window.__game.scene.getScene('game').paused)), 'узкое окно на ПК: пауза включилась');
    await page.close();
  }

  console.log('-- бои на телефоне');
  // ---------- 4 и 5. сенсорный бой: реплики боссов, кнопки и рюкзак Миши ----------
  for (const [name, w, h, q] of SCREENS.filter((s) => s[3])) {
    for (const boss of ['misha', 'vladik', 'tima']) {
      const page = await open(w, h, q);
      await startGame(page, { players: 1, mode: 'bosstest', boss });
      const r = await page.evaluate(async (boss) => {
        const sc = window.__game.scene.getScene('game'), b = sc.testBoss(), p = sc.players[0];
        const text = 'Диктант! Пишем быстро и без единой ошибки, дети!';
        p.x = b.x - 220; p.y = b.y;
        if (boss === 'misha') sc.mishaSpeak(text, 60); else if (boss === 'vladik') sc.vladikSpeak(text, 60); else sc.timaSpeak(text, 60);
        // реплика не гаснет, пока проверяем
        await new Promise((r) => setTimeout(r, 1500));
        const o = boss === 'misha' ? sc.mishaSay : boss === 'vladik' ? sc.vSay : sc.tSay, cam = sc.cameras.main, wv = cam.worldView, bb = o.getBounds();
        return { vis: o.visible, px: parseFloat(o.style.fontSize) * window.__cs(sc) * cam.zoom, inside: bb.x >= wv.x - 1 && bb.right <= wv.right + 1 && bb.y >= wv.y - 1, zoom: cam.zoom };
      }, boss);
      ok(r.vis, `реплика ${boss} (${name}): не показана`);
      ok(r.px >= 13, `реплика ${boss} (${name}): шрифт на экране ${r.px.toFixed(1)} px < 13`);
      ok(r.inside, `реплика ${boss} (${name}): пузырь выходит за видимую область`);
      if (boss === 'misha' && /13/.test(name)) await shot(page, 'misha-bubble-p13');
      await page.close();
    }
    // кнопки и рюкзак: Миша у правой стены (или у левой при режиме левши)
    for (const lefty of [false, true]) {
      const page = await open(w, h, q);
      await page.evaluate((l) => { Settings.s.lefty = l; Settings.apply(); }, lefty);
      await startGame(page, { players: 1, mode: 'bosstest', boss: 'misha' });
      const place = async (side) => page.evaluate(async (side) => {
        const sc = window.__game.scene.getScene('game'), m = sc.misha, p = sc.players[0];
        const W = sc.L.W * 32; m.x = side === 'r' ? W - 140 : 90; p.x = side === 'r' ? m.x - 200 : m.x + 200; p.y = m.y; m.hp = m.maxHp;
        await new Promise((r) => setTimeout(r, 1300));
        const bag = sc.mishaBag(m), cam = sc.cameras.main, wv = cam.worldView, rc = sc.game.canvas.getBoundingClientRect(), s = rc.width / VW;
        const bx = rc.left + (bag.x - wv.x) * cam.zoom * s, by = rc.top + (bag.y - wv.y) * cam.zoom * s, bw = bag.w * cam.zoom * s, bh = bag.h * cam.zoom * s;
        const btns = [...document.querySelectorAll('#touch .t-btn')].filter((e) => !e.hidden).map((e) => { const q = e.getBoundingClientRect(); return { act: e.dataset.act, over: bx < q.right && bx + bw > q.left && by < q.bottom && by + bh > q.top, dim: e.classList.contains('dim'), op: +getComputedStyle(e).opacity }; });
        await new Promise((r) => setTimeout(r, 350)); // дать закончиться плавному затемнению
        for (const b of btns) b.op = +getComputedStyle(document.querySelector('#touch .t-btn[data-act=' + b.act + ']')).opacity;
        return btns;
      }, side);
      const side = lefty ? 'l' : 'r', other = lefty ? 'r' : 'l';
      let btns = await place(side);
      const over = btns.filter((b) => b.over);
      // перекрытие кнопкой возможно только если она прозрачна; сам факт перекрытия на этом экране тоже фиксируем
      ok(over.every((b) => b.dim && b.op <= 0.25), `кнопки (${name}${lefty ? ', левша' : ''}): перекрывают рюкзак и непрозрачны: ${JSON.stringify(over)}`);
      if (side === 'r' && !lefty) ok(btns.some((b) => b.dim) || btns.every((b) => !b.over), `кнопки (${name}): не отработало затемнение`);
      await shot(page, `bag-${lefty ? 'lefty' : 'right'}-${name.split(' ')[1]}`);
      btns = await place(other);
      ok(btns.every((b) => !b.dim || b.over), `кнопки (${name}${lefty ? ', левша' : ''}): остались прозрачными, когда рюкзак далеко`);
      await page.close();
    }
  }

  console.log('-- лобби и поля ввода');
  // ---------- 7. Esc закрывает лобби ----------
  {
    const page = await open(1366, 768, '');
    for (const focus of ['', '#lb-code']) {
      await page.evaluate(() => window.__game.scene.getScene('menu').openLobby());
      await sleep(150);
      ok(await page.evaluate(() => !Lobby.el.hidden), 'лобби не открылось');
      if (focus) await page.focus(focus);
      await page.keyboard.press('Escape'); await sleep(100);
      const s = await page.evaluate(() => ({ hidden: Lobby.el.hidden, leaving: window.__game.scene.getScene('menu').leaving }));
      ok(s.hidden && !s.leaving, `Esc не закрыл лобби (фокус: ${focus || 'нет'}): ${JSON.stringify(s)}`);
    }
    // Esc в закрытом лобби ничего не ломает
    await page.keyboard.press('Escape'); await page.close();
  }

  // ---------- 9. поля ввода на iPhone: выделение разрешено ----------
  {
    const page = await open(844, 390, '?touch=1');
    await page.evaluate(() => { Speedrun.friendsOpen(); });
    await sleep(200);
    const css = await page.evaluate(() => {
      const us = (e) => { const c = getComputedStyle(e); return (c.webkitUserSelect || c.userSelect); };
      return { body: us(document.body), code: us(document.getElementById('lb-code')), name: us(document.getElementById('sr-name')), paste: us(document.getElementById('sr-paste')),
        fsz: parseFloat(getComputedStyle(document.getElementById('sr-name')).fontSize) };
    });
    ok(css.body === 'none', 'тело страницы в сенсорном режиме должно оставаться без выделения: ' + css.body);
    for (const k of ['code', 'name', 'paste']) ok(css[k] === 'text', `поле «${k}»: user-select = ${css[k]}, нужно text`);
    ok(css.fsz >= 16, `поле имени: шрифт ${css.fsz} px — iOS приблизит страницу при фокусе`);
    // печать действительно работает
    await page.focus('#sr-name'); await page.keyboard.type('Ива');
    ok((await page.evaluate(() => document.getElementById('sr-name').value)) === 'Ива', 'в поле имени не печатается');
    await page.close();
  }

  await browser.close();
  console.log('ошибок страницы:', errs, 'провалов:', fails.length);
  process.exit(errs || fails.length ? 1 : 0);
})();
