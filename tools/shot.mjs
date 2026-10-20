// Скриншоты собранной игры на 5 размерах экрана: node tools/shot.mjs [папка=shots] [путь=/] [клавиши через запятую, например Enter,KeyD]
// Нужна сборка (npm run build); сервер preview поднимается сам. Chrome берётся из $env:CHROME, иначе из Playwright.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const dir = process.argv[2] ?? 'shots', path = process.argv[3] && !process.argv[3].includes(':') ? process.argv[3] : '/', keys = (process.argv[4] ?? '').split(',').filter(Boolean);
const SIZES = [[667, 375], [844, 390], [932, 430], [1366, 768], [1920, 1080]];
mkdirSync(dir, { recursive: true });
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--ignore-gpu-blocklist'] });
try {
  for (let i = 0; i < 40; i++) { try { const r = await fetch('http://localhost:4180/'); if (r.ok) break; } catch { /* сервер ещё поднимается */ } await new Promise((r) => setTimeout(r, 250)); }
  for (const [w, h] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: w < 1000 });
    await page.goto(`http://localhost:4180${path}${w < 1000 ? (path.includes('?') ? '&' : '?') + 'touch=1' : ''}`);
    await page.waitForSelector('canvas');
    for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(150); }
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${dir}/${w}x${h}.png` });
    await page.close();
  }
  console.log('скриншоты в', dir);
} finally { await browser.close(); server.kill(); }
