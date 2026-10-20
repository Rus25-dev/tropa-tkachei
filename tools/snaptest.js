// Проверка онлайн-снимков: хост играет ботами вдвоём, каждые 20 кадров снимок packSnap -> JSON -> applySnap (как у гостя).
// Ловит исключения в упаковке/распаковке полей боссов. node tools/snaptest.js
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  let bad = 0;
  for (const boss of ['misha', 'vladik', 'tima']) {
    const page = await browser.newPage();
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('file://' + path.resolve(root, 'index.html'));
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
    await page.addScriptTag({ content: fs.readFileSync(path.resolve(root, 'tools/botbrain.js'), 'utf8') });
    const out = await page.evaluate(async (boss) => {
      const g = window.__game; g.scene.stop('menu'); g.scene.start('game', { players: 2, mode: 'bosstest', boss });
      await new Promise((r) => setTimeout(r, 1200)); const sc = g.scene.getScene('game'); g.loop.stop(); Snd.play = () => { };
      const brains = sc.players.map((p, i) => new BotBrain(sc, i, 0.95, i + 3)); sc._bots = []; sc.rawInput = (i) => sc._bots[i] || {};
      const seen = new Set(); let snaps = 0, f = 0, stag = 0;
      for (; f < 60 * 120; f++) {
        for (let i = 0; i < brains.length; i++) sc._bots[i] = brains[i].act(f);
        sc.update(f * 16.667, 16.667);
        const b = sc.testBoss(); if (b) { seen.add(b.state); if (b.stagger > 0) stag++; }
        if (f % 20 === 0) {
          const snap = JSON.parse(JSON.stringify(sc.packSnap())); snaps++;
          const on = sc.online, sx = sc.sendEv, st = b.stagger, ph = b.phase, ex = b.executed, pz = b.poise;
          sc.online = 'guest'; sc.sendEv = () => { };
          sc.applySnap(snap); sc.netSmooth(0.016);
          sc.online = on; sc.sendEv = sx; b.stagger = st; b.phase = ph; b.executed = ex; b.poise = pz;
        }
        if (sc.wiping || (b && b.state === 'dead')) break;
      }
      return { f, snaps, stag, states: Array.from(seen).join(',') };
    }, boss);
    console.log(boss, JSON.stringify(out), 'ошибок:', errs.length, errs.slice(0, 3).join(' | '));
    bad += errs.length;
    await page.close();
  }
  await browser.close(); process.exit(bad ? 1 : 0);
})();
