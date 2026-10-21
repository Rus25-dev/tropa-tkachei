// Скриншоты экранов на нескольких размерах. Запуск: node tools/shot.js <папка> "<js, открывающий экран в игре>" [имя]
// Пример: node tools/shot.js shots "HowTo.show(null)" howto. Размеры: 667×375, 844×390, 932×430, 1366×768, 1920×1080.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const SIZES = [[667, 375, 1], [844, 390, 1], [932, 430, 1], [1366, 768, 0], [1920, 1080, 0]];
(async () => {
  const [dir, code, name] = [process.argv[2] || 'shots', process.argv[3] || '', process.argv[4] || 'screen'];
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  for (const [w, h, touch] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html') + (touch ? '?touch=1' : ''));
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive() && window.__game.scene.getScene('menu').mStack);
    await page.evaluate(() => { Snd.play = () => { }; });
    if (code) await page.evaluate(code);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(dir, `${name}-${w}x${h}.png`) });
    await ctx.close();
  }
  await browser.close();
})();
