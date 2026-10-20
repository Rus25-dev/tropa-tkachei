// Тест фаз Миши: иглой бьётся в 1–2 фазах, в 3-й — только бомбы.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  let errs = 0, fails = 0; const ok = (c, m) => { console.log(c ? 'ок   ' : 'ПРОВАЛ', m); if (!c) fails++; };
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
  const r = await page.evaluate(() => new Promise((resolve) => {
    const g = window.__game; g.scene.stop('menu'); g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'misha' });
    setTimeout(() => {
      const sc = g.scene.getScene('game'); Snd.play = () => {}; g.loop.stop(); const out = {};
      for (let i = 0; i < 400; i++) sc.update(i * 16.7, 16.7);
      const m = sc.misha, p = sc.players[0]; out.max = m.maxHp; out.mark = m.tdMarks;
      const hit = () => { p.atkHits = new Set(); p.atkDir = 'f'; p.heavy = false; const box = { x: m.x, y: m.y, w: m.w, h: m.h }; return sc.mishaNeedle(p, box); };
      m.state = 'idle'; m.zipT = 0;
      const h0 = m.hp; hit(); out.dmg1 = h0 - m.hp;
      let n = 0; while (!sc.mishaArmored(m) && n < 400) { m.state = 'idle'; m.hitCd = 0; m.tdQueue = false; hit(); n++; } out.needleHitsToArmor = n; out.hpArmor = m.hp; out.armored = sc.mishaArmored(m);
      const h1 = m.hp; m.state = 'idle'; hit(); out.afterArmored = m.hp - h1;
      // бомбы
      let b = 0; while (m.hp > 0 && b < 30) { m.hitCd = 0; m.state = 'idle'; sc.mishaBagHit({}); b++; if (m.state === 'dead') break; } out.bombs = b; out.dead = m.state === 'dead';
      resolve(out);
    }, 800);
  }));
  console.log(JSON.stringify(r));
  ok(Math.abs(r.dmg1 - 0.25) < 1e-6, 'удар иглой снимает 1/4 бутона в первой фазе');
  ok(r.armored && r.needleHitsToArmor > 20, 'в третью фазу ведут десятки ударов иглой: ' + r.needleHitsToArmor);
  ok(r.afterArmored === 0, 'в третьей фазе игла не наносит урона');
  ok(r.dead && r.bombs === Math.ceil(r.hpArmor), 'третья фаза добивается бомбами: ' + r.bombs);
  console.log('ошибок страницы:', errs, 'провалов:', fails);
  await browser.close(); process.exit(errs || fails ? 1 : 0);
})();
