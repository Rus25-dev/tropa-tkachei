// ИИ-тестер боссов: запускает игру без экрана, играет ботом и печатает статистику.
// Запуск: node tools/bot.js [vladik|tima|misha] [число боёв] [уровень бота 0..1]
// Нужны: npm i phaser@3.90.0 playwright-core (в любой папке, путь в NODE_PATH) и Chromium из PLAYWRIGHT_BROWSERS_PATH.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const boss = process.argv[2] || 'vladik', runs = +(process.argv[3] || 5), skill = +(process.argv[4] || 0.7);
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const res = [];
  for (let r = 0; r < runs; r++) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes('phaser')) return route.fulfill({ contentType: 'application/javascript', body: phaserSrc });
      if (u.startsWith('file://')) return route.continue();
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    await page.goto('file://' + path.resolve(__dirname, '../index.html'));
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive(), null, { timeout: 15000 });
    const out = await page.evaluate(({ boss, skill }) => new Promise((resolve) => {
      const g = window.__game;
      g.scene.stop('menu'); g.scene.start('game', { players: 1, mode: 'bosstest', boss });
      let sc, frames = 0, rng = Math.random, dmgTaken = 0, lastHp = null, deaths = 0, jt = 0, dt_ = 0, healed = 0;
      const tick = () => {
        sc = g.scene.getScene('game');
        if (!sc || !sc.players || !sc.boss) return setTimeout(tick, 50);
        if (!sc._botInit) {
          sc._botInit = true; sc.sound && (sc.sound.mute = true);
          sc.rawInput = () => sc._bot || {};
          Snd.play = () => {};
          sc.cameras.main.fadeIn = () => {}; sc.togglePause = () => {};
        }
        const run = () => {
          for (let n = 0; n < 40; n++) {
            const p = sc.players[0], b = sc.testBoss();
            if (!b) { return; }
            const cx = b.x + b.w / 2, px = p.x + 7, dx = cx - px, ad = Math.abs(dx);
            const inp = { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false };
            // уворот: ближайший опасный снаряд
            let threat = null;
            for (const pr of sc.projs) if (!pr.dead && Math.abs(pr.x - p.x) < 150 && Math.abs(pr.y - p.y) < 90 && pr.kind !== 'pad') { threat = pr; break; }
            const reaction = frames % Math.round(4 + (1 - skill) * 20) === 0;
            if (threat && reaction && rng() < skill) { if (rng() < 0.5 && p.dashCd <= 0) { inp.dash = true; inp[threat.x > p.x ? 'right' : 'left'] = true; } else if (p.onGround) { inp.jump = true; sc._holdJ = 14; } }
            if (sc._holdJ > 0) { inp.jump = true; sc._holdJ--; }
            const want = 52;
            if (ad > want) { inp[dx > 0 ? 'right' : 'left'] = true; } else if (ad < 30) { inp[dx > 0 ? 'left' : 'right'] = true; }
            if (ad < 70 && Math.abs((b.y + b.h / 2) - (p.y + 13)) < 80) { if (frames % 14 === 0) inp.atk = true; }
            if (p.silk >= 9 && p.hp <= 2) inp.heal = true;
            if (b.y + b.h < p.y - 20 && p.onGround && frames % 40 === 0) inp.jump = true;
            if (boss === 'misha' && p.bombs > 0 && ad < 260 && frames % 50 === 0) inp.bomb = true;
            // босс-бар: если босс мёртв — результат
            sc._bot = inp;
            sc.update(frames * 16.667, 16.667); frames++;
            if (lastHp !== null && p.hp < lastHp) dmgTaken += lastHp - p.hp; lastHp = p.hp;
            if (sc.wiping && !sc._wipeSeen) { sc._wipeSeen = true; deaths++; return resolve({ won: false, frames, dmgTaken, deaths, bossHp: b.hp / b.maxHp }); }
            if (['dead', 'gone'].includes(b.state)) return resolve({ won: true, frames, dmgTaken, deaths, bossHp: 0 });
            if (frames > 60 * 240) return resolve({ won: false, timeout: true, frames, dmgTaken, deaths, bossHp: b.hp / b.maxHp });
          }
          setTimeout(run, 0);
        };
        // дать сцене один настоящий цикл, затем ручное прокручивание
        g.loop.sleep && 0; g.loop.stop && g.loop.stop();
        run();
      };
      setTimeout(tick, 800);
    }), { boss, skill });
    console.log(`бой ${r + 1}:`, JSON.stringify({ ...out, sec: +(out.frames / 60).toFixed(1) }));
    res.push(out); await page.close();
  }
  const w = res.filter((x) => x.won).length;
  console.log(`\n${boss}: побед ${w}/${runs}, среднее время ${(res.reduce((a, x) => a + x.frames, 0) / res.length / 60).toFixed(1)} c, урона в среднем ${(res.reduce((a, x) => a + x.dmgTaken, 0) / res.length).toFixed(1)}`);
  await browser.close();
})();
