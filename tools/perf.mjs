/* global performance, requestAnimationFrame, localStorage, document */
// Замеры производительности v2: кадры в секунду, время кадра (среднее и 95-й процентиль), время логики и отрисовки из ?perf=1.
// node tools/perf.mjs [ширина×высота] [замедление CPU: 1,4,6] [качество: low|mid|high|auto] > docs/perf-<имя>.json
// Нужна сборка (npm run build). Chrome — из $env:CHROME. Сцены: заставка меню, глава I, босс-тест (фаза 3 тренировки), вдвоём, вдвоём + бой.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const [size = '1280x720', throttle = '1', quality = 'auto', dpr = '1'] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const port = 4193;
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--ignore-gpu-blocklist'] });
const scenes = [
  ['заставка меню', null],
  ['глава I (один)', { kind: 'story', fresh: true }],
  ['босс: Миша, фаза 3', { kind: 'bosstest', boss: 'misha', train: true, trainPhase: 3 }],
  ['босс: Тима, фаза 3', { kind: 'bosstest', boss: 'tima', train: true, trainPhase: 3 }],
  ['вдвоём, глава I', { kind: 'story', fresh: true, players: 2 }],
];
const out = { size, throttle: Number(throttle), quality, dpr: Number(dpr), scenes: {} };
try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${port}/`); if (r.ok) break; } catch { /* сервер поднимается */ } await new Promise((r) => setTimeout(r, 250)); }
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(dpr) });
  await ctx.addInitScript((q) => { try { localStorage.setItem('tt_settings', JSON.stringify({ gfx: q })); } catch { /* нет доступа */ } }, quality);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(throttle) });
  await page.goto(`http://localhost:${port}/?perf=1`);
  await page.waitForFunction(() => window.__tt && window.__tt.game.scene.isActive('game'));
  for (const [name, p] of scenes) {
    await page.evaluate((x) => { if (x) window.__tt.start(x); else window.__tt.stop(); }, p);
    await page.waitForTimeout(2500); // сцена строится, картинки уровня рисуются, качество «авто» успевает отреагировать
    const m = await page.evaluate(() => new Promise((res) => {
      const dts = []; let last = performance.now(); const t0 = last;
      const f = (now) => { dts.push(now - last); last = now; if (now - t0 < 5000) requestAnimationFrame(f); else res(dts); };
      requestAnimationFrame(f);
    }));
    const hud = await page.evaluate(() => document.querySelector('[data-testid=perf]')?.textContent ?? '');
    m.sort((a, b) => a - b);
    const avg = m.reduce((s, x) => s + x, 0) / m.length;
    out.scenes[name] = { fps: +(1000 / avg).toFixed(1), frameMsAvg: +avg.toFixed(2), frameMsP95: +m[Math.floor(m.length * 0.95)].toFixed(2), frameMsMax: +m[m.length - 1].toFixed(1), hud: hud.replace(/\n/g, ' | ') };
  }
  console.log(JSON.stringify(out, null, 2));
} finally { await browser.close(); server.kill(); }
