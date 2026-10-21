// Снимок игры в нужной сцене: node tools/snap.mjs <имя.png> '<json параметров start>' [кадры=120] [ширина=1280] [высота=720] [клавиши: Space:30,KeyD:60 …]
// Нужна сборка (npm run build). Сервер preview поднимается сам; Chrome — из $env:CHROME или из Playwright.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [out = 'shots/snap.png', params = '{"kind":"bosstest","boss":"misha"}', frames = '120', W = '1280', H = '720', keyspec = ''] = process.argv.slice(2);
mkdirSync(dirname(out), { recursive: true });
const port = 4190;
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--ignore-gpu-blocklist'] });
try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${port}/`); if (r.ok) break; } catch { /* сервер поднимается */ } await new Promise((r) => setTimeout(r, 250)); }
  const page = await browser.newPage({ viewport: { width: +W, height: +H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__tt && window.__tt.game.scene.isActive('game'));
  await page.evaluate((p) => window.__tt.start(JSON.parse(p)), params);
  for (const k of keyspec.split(',').filter(Boolean)) {
    const [code, ms = '300'] = k.split(':');
    await page.keyboard.down(code); await page.waitForTimeout(+ms); await page.keyboard.up(code);
  }
  await page.waitForTimeout(Math.round((+frames / 60) * 1000));
  await page.screenshot({ path: out });
  const info = await page.evaluate(() => { const s = window.__tt.shared.session; const w = s && s.world; return w ? { tick: w.tickN, hp: w.players.map((p) => p.hp), boss: (w.testBoss() || w.boss).state, fps: window.__tt.game.loop.actualFps } : null; });
  console.log(JSON.stringify(info), errors.length ? 'ОШИБКИ: ' + errors.join(' | ') : 'ошибок нет');
} finally { await browser.close(); server.kill(); }
