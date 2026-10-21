/* global performance, requestAnimationFrame */
// Те же замеры для v1.8 (legacy/index.html, Phaser 3 + Canvas/WebGL): node tools/perf-legacy.mjs [ширина×высота] [замедление CPU] [dpr]
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [size = '1280x720', throttle = '1', dpr = '1'] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--ignore-gpu-blocklist'] });
const scenes = [
  ['заставка меню', null],
  ['глава I (один)', 'm.go(1)'],
  ['босс: Миша, фаза 1', "m.pickIdx = 0; m.go(1, 'bosstest')"],
  ['босс: Тима, фаза 1', "m.pickIdx = 2; m.go(1, 'bosstest')"],
  ['вдвоём, глава I', 'm.go(2)'],
];
const out = { version: '1.8.2', size, throttle: Number(throttle), dpr: Number(dpr), scenes: {} };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(dpr) });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(throttle) });
  await page.goto(pathToFileURL(resolve('legacy/index.html')).href);
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('menu'), null, { timeout: 30000 });
  for (const [name, code] of scenes) {
    if (code) {
      await page.evaluate((c) => {
        const g = window.__game;
        for (const k of ['game', 'ui', 'bg']) if (g.scene.isActive(k)) g.scene.stop(k);
        if (!g.scene.isActive('menu')) g.scene.start('menu');
        return c;
      }, code);
      await page.waitForTimeout(800);
      await page.evaluate((c) => { const m = window.__game.scene.getScene('menu'); new Function('m', c)(m); }, code);
    } else {
      await page.evaluate(() => { const g = window.__game; for (const k of ['game', 'ui', 'bg']) if (g.scene.isActive(k)) g.scene.stop(k); if (!g.scene.isActive('menu')) g.scene.start('menu'); });
    }
    await page.waitForTimeout(3000);
    const m = await page.evaluate(() => new Promise((res) => {
      const dts = []; let last = performance.now(); const t0 = last;
      const f = (now) => { dts.push(now - last); last = now; if (now - t0 < 5000) requestAnimationFrame(f); else res(dts); };
      requestAnimationFrame(f);
    }));
    const act = await page.evaluate(() => ['menu', 'game'].filter((k) => window.__game.scene.isActive(k)).join('+'));
    m.sort((a, b) => a - b);
    const avg = m.reduce((s, x) => s + x, 0) / m.length;
    out.scenes[name] = { scene: act, fps: +(1000 / avg).toFixed(1), frameMsAvg: +avg.toFixed(2), frameMsP95: +m[Math.floor(m.length * 0.95)].toFixed(2), frameMsMax: +m[m.length - 1].toFixed(1) };
  }
  console.log(JSON.stringify(out, null, 2));
} finally { await browser.close(); }
