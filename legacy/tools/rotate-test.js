// Поворот телефона: портрет («Поверните телефон») → альбом с другой пропорцией поля (в альбоме на iPhone/Android часть высоты занимают панели),
// затем обратно. Регресс из v1.7/1.8: после поворота главное меню оставалось пустым (0 объектов), пока не изменится размер ещё раз.
// Запуск: node tools/rotate-test.js
const path = require('path'), fs = require('fs');
const pw = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
let fails = 0, errs = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ПРОВАЛ', m); } else console.log('ок   ', m); };
(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  for (const [name, dev, bars] of [['Pixel 7', pw.devices['Pixel 7'], 60], ['iPhone 13 (панели Safari)', { ...pw.devices['iPhone 13'] }, 60], ['iPhone SE', pw.devices['iPhone SE'], 50]]) {
    const ctx = await browser.newContext(dev), page = await ctx.newPage();
    page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'));
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').mStack);
    const st = () => page.evaluate(() => { const m = window.__game.scene.getScene('menu'); return { vw: VW, objs: m.mObj ? m.mObj.filter((o) => o && o.scene).length : -1, rot: getComputedStyle(document.getElementById('rotate')).display }; });
    const vp = page.viewportSize(), a = await st();
    ok(a.rot !== 'none' && a.objs > 10, `${name}: в портрете «Поверните телефон», меню собрано (${a.objs} объектов)`);
    await page.setViewportSize({ width: vp.height, height: vp.width - bars });
    await page.waitForTimeout(1500);
    const b = await st();
    ok(b.rot === 'none' && b.objs > 10, `${name}: после поворота в альбом меню на месте (${b.objs} объектов, поле ${a.vw}→${b.vw})`);
    await page.setViewportSize({ width: vp.width, height: vp.height }); await page.waitForTimeout(800);
    await page.setViewportSize({ width: vp.height, height: vp.width - bars }); await page.waitForTimeout(1500);
    const c = await st(); ok(c.objs > 10, `${name}: и после второго поворота меню на месте (${c.objs})`);
    await ctx.close();
  }
  await browser.close();
  console.log('ошибок страницы:', errs, 'провалов:', fails); process.exit(errs || fails ? 1 : 0);
})();
