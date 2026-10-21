/* global document, innerWidth, getComputedStyle */
// Снимки экранов интерфейса на разных размерах + проверка переполнения: node tools/uishots.mjs [ширина×высота,…] [папка]
// Нужна сборка (npm run build). Для каждого размера проходит по всем экранам меню, паузе и внутриигровым окнам и сохраняет png в папку.
// Проверяет: нет горизонтальной прокрутки страницы, нет кнопок меньше 44 px по высоте, нет шрифтов мельче 11 px.
import { chromeExe } from './chrome.mjs';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const sizes = (process.argv[2] || '667x375,844x390,932x430,1366x768,1920x1080').split(',').map((s) => s.split('x').map(Number));
const dir = process.argv[3] || 'shots/ui';
mkdirSync(dir, { recursive: true });
const port = 4191;
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
const browser = await chromium.launch({ executablePath: chromeExe(), args: ['--ignore-gpu-blocklist'] });
const problems = [];
try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${port}/`); if (r.ok) break; } catch { /* сервер поднимается */ } await new Promise((r) => setTimeout(r, 250)); }
  for (const [W, H] of sizes) {
    const touch = W < 1000;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => window.__tt && window.__tt.game.scene.isActive('game'));
    await page.waitForTimeout(600);
    const tag = `${W}x${H}`;
    const check = async (name) => {
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${dir}/${tag}-${name}.png` });
      const r = await page.evaluate(() => {
        const out = { hscroll: document.documentElement.scrollWidth > innerWidth + 1, small: [], font: [] };
        for (const el of document.querySelectorAll('.ov button, .ov input, .ov select, #touch button')) {
          const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
          if (b.height < 43.5 && !el.closest('.seg') && !el.hidden && !(el.tagName === 'INPUT' && el.closest('label.opt'))) out.small.push((el.textContent || el.id || el.className).trim().slice(0, 24) + ' ' + Math.round(b.height));
        }
        for (const el of document.querySelectorAll('.ov *')) {
          if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11) out.font.push(el.className + ' ' + fs);
        }
        const over = [...document.querySelectorAll('.ov .ovbody')].some((b) => b.scrollWidth > b.clientWidth + 1);
        out.over = over; return out;
      });
      if (r.hscroll || r.over || r.small.length || r.font.length) problems.push(`${tag} ${name}: ${JSON.stringify(r)}`);
    };
    const click = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(150); };
    await check('main');
    await click('[data-testid=m-campaign]'); await check('campaign');
    await page.keyboard.press('Escape');
    await click('[data-testid=m-bosstest]'); await check('bosstest');
    await page.keyboard.press('Escape');
    await click('[data-testid=m-speedrun]'); await check('speedrun');
    await click('[data-testid=sr-trail]'); await check('srcat');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await click('[data-testid=m-races]'); await check('races');
    await page.keyboard.press('Escape');
    await click('[data-testid=m-howto]'); await check('howto-controls');
    for (let t = 1; t < 4; t++) { await page.locator('.tab').nth(t).click(); await check(`howto-${t}`); }
    await page.keyboard.press('Escape');
    await click('[data-testid=m-settings]'); await check('settings');
    for (const s of ['sound', 'screen', 'controls', 'game', 'progress']) { await click(`[data-testid=st-go-${s}]`); await check(`settings-${s}`); await page.keyboard.press('Escape'); }
    await page.keyboard.press('Escape');
    await click('[data-testid=open-changelog]'); await check('changelog');
    await page.keyboard.press('Escape');
    // игра: пауза, скамья, лавка, карта, снаряжение
    await page.evaluate(() => window.__tt.start({ kind: 'story', fresh: true }));
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape'); await check('pause');
    await click('[data-testid=pause-gear]'); await check('gear');
    await page.keyboard.press('Escape'); await click('[data-testid=pause-howto]'); await check('pause-howto'); await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const s = window.__tt.shared.session; s.world.players[0].sit = true; s.world.beads = 40; });
    await page.evaluate(() => { const s = window.__tt.shared.session; s.openShop(0); }); await check('shop');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const s = window.__tt.shared.session; s.mapShow(); }); await check('map');
    await page.keyboard.press('Escape');
    if (errors.length) problems.push(`${tag}: ошибки страницы: ${errors.join(' | ')}`);
    await ctx.close();
  }
  console.log(problems.length ? 'ПРОБЛЕМЫ:\n' + problems.join('\n') : 'проблем нет');
} finally { await browser.close(); server.kill(); }
