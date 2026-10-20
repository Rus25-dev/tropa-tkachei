// Главное меню на эмуляции устройств (Chrome и WebKit): виден ли каркас меню, сколько пунктов, ошибки консоли, скриншот.
// Запуск: node tools/devices-shot.js [папка-скриншотов] [URL (по умолчанию локальный index.html)]
const path = require('path'), fs = require('fs');
const pw = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const dir = process.argv[2] || 'dev-shots', url = process.argv[3] || 'file://' + path.resolve(__dirname, '../index.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = pw.devices;
const CASES = [
  ['chromium', 'Pixel 7 (альбом)', { ...D['Pixel 7 landscape'] }],
  ['chromium', 'Pixel 7 (портрет)', { ...D['Pixel 7'] }],
  ['chromium', 'iPhone 13 в Chrome (альбом)', { ...D['iPhone 13 landscape'], defaultBrowserType: undefined }],
  ['webkit', 'iPhone 13 Safari (альбом)', { ...D['iPhone 13 landscape'] }],
  ['webkit', 'iPhone 13 Safari (портрет)', { ...D['iPhone 13'] }],
  ['webkit', 'iPhone SE Safari (альбом)', { ...D['iPhone SE landscape'] }],
  ['webkit', 'iPad Safari', { ...D['iPad (gen 7)'] }],
  ['firefox', 'Firefox 1366x768', { viewport: { width: 1366, height: 768 } }],
];
(async () => {
  fs.mkdirSync(dir, { recursive: true });
  const launchers = { chromium: () => pw.chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] }), webkit: () => pw.webkit.launch(), firefox: () => pw.firefox.launch() };
  const browsers = {};
  for (const [eng, name, dev] of CASES) {
    try {
      browsers[eng] = browsers[eng] || await launchers[eng]();
      delete dev.defaultBrowserType;
      const ctx = await browsers[eng].newContext(dev), page = await ctx.newPage(), logs = [];
      page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') logs.push('console.error ' + m.text().slice(0, 140)); });
      await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://') || url.startsWith('http')) { if (u.includes('peerjs') ) return r.fulfill({ status: 200, body: '' }); return r.continue(); } return r.fulfill({ status: 200, body: '' }); });
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await sleep(3500);
      const info = await page.evaluate(() => {
        const g = window.__game, m = g && g.scene.getScene('menu'), cv = g && g.canvas, r = cv && cv.getBoundingClientRect();
        const boot = document.getElementById('boot');
        return { game: !!g, menuActive: !!(m && m.sys.isActive()), items: m && m.mItems ? m.mItems.length : null, stack: m && m.mStack ? m.mStack.map((x) => x.id).join('>') : null, canvas: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null,
          vw: typeof VW !== 'undefined' ? VW : null, inner: [innerWidth, innerHeight], boot: !!boot, rotate: (() => { const e = document.getElementById('rotate'); return e ? getComputedStyle(e).display : null; })(), touch: typeof Touch !== 'undefined' ? !!Touch.enabled : null };
      }).catch((e) => ({ err: String(e) }));
      await page.screenshot({ path: path.join(dir, name.replace(/[^\wА-я]+/g, '_') + '.png') });
      console.log(name.padEnd(30), JSON.stringify(info), logs.length ? '\n   ' + logs.slice(0, 4).join('\n   ') : '');
      await ctx.close();
    } catch (e) { console.log(name.padEnd(30), 'СБОЙ', String(e).slice(0, 200)); }
  }
  for (const b of Object.values(browsers)) await b.close();
})();
