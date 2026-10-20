// Проверка режима тренировки (src/training.js): игрок не умирает за N кадров бездействия, старт с фазы 3 без рёва, сброс босса, рекорды не пишутся.
// NODE_PATH=... node tools/train_test.js [кадров]   (по умолчанию 3000)
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const N = +(process.argv[2] || 3000);
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  let errs = 0, bad = 0;
  for (const boss of ['misha', 'vladik', 'tima']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', boss, e.message); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'));
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
    const res = await page.evaluate(({ boss, N }) => new Promise((resolve) => {
      const g = window.__game; g.scene.stop('menu');
      Training.on = true; Training.phase = 3;
      g.scene.start('game', { players: 1, mode: 'bosstest', boss });
      setTimeout(() => {
        const sc = g.scene.getScene('game'); Snd.play = () => {}; sc.togglePause = () => {}; g.loop.stop();
        sc.rawInput = () => ({});
        const fails = [], p = sc.players[0], ok = (c, m) => { if (!c) fails.push(m); };
        let f = 0; const frames = (n) => { for (let i = 0; i < n; i++, f++) sc.update(f * 16.667, 16.667); };
        ok(!!sc.train, 'режим тренировки не включился');
        const b = sc.testBoss();
        ok(b.phase === 3 && sc.phaseOf(b) === 3, `старт с фазы 3: phase=${b.phase}, phaseOf=${sc.phaseOf(b)}, hp=${b.hp}/${b.maxHp}`);
        const hp0 = b.hp; frames(60);
        ok(b.state !== 'rage', 'на старте был рёв (rage)');
        ok(b.hp === hp0, 'hp босса изменился сам');
        // бездействие: игрок стоит на месте, босс его бьёт
        let rage = 0, minHp = 99, downed = false, maxPh = 0;
        for (let i = 0; i < N; i++, f++) {
          sc.update(f * 16.667, 16.667);
          if (b.state === 'rage') rage++;
          minHp = Math.min(minHp, p.hp); downed = downed || p.downed; maxPh = Math.max(maxPh, b.phase || 1);
          if (sc.won || sc.wiping) break;
        }
        ok(!downed && !sc.wiping, 'игрок упал/нить оборвалась');
        ok(minHp === p.maxHp, `здоровье убывало: min=${minHp} из ${p.maxHp}`);
        ok(sc.train.hits > 0, 'за ' + N + ' кадров босс ни разу не попал по игроку (проверка не показательна)');
        ok(rage === 0 && b.phase === 3, `фаза менялась (rage-кадров ${rage})`);
        ok(!!sc.train.tele, 'телеграф не записан'); if (sc.train.tele) console.log(boss, Training.teleText(sc.train));
        // урон боссу и DPS
        const before = b.hp; sc.damageBoss ? 0 : 0;
        const fn = { misha: null, vladik: 'damageVladik', tima: 'damageTima' }[boss];
        if (fn) { b.state = 'idle'; b.stagger = 0; sc[fn](p); frames(12); ok(sc.train.total >= 1, 'урон по боссу не засчитан в счётчике'); ok(Training.dps(sc.train) > 0, 'DPS нулевой'); }
        // сброс
        b.hp = Math.max(1, b.hp - 2); sc.projs.push({ kind: 'note', x: 0, y: 0, w: 1, h: 1, vx: 0, vy: 0, life: 9 });
        Training.reset(sc); frames(2);
        const nb = sc.testBoss();
        ok(nb !== b && nb.phase === 3 && sc.phaseOf(nb) === 3 && nb.state === 'intro', `сброс: phase=${nb.phase} state=${nb.state}`);
        ok(sc.train.resets === 1 && sc.train.total === 0, 'сброс не обнулил счётчик');
        ok(p.hp === p.maxHp && !p.downed, 'после сброса игрок не в норме');
        // фазы 1 и 2
        for (const ph of [1, 2]) { Training.phase = ph; Training.reset(sc); frames(1); const q = sc.testBoss(); ok(sc.phaseOf(q) === ph && (q.phase || 1) === ph, `сброс на фазу ${ph}: phaseOf=${sc.phaseOf(q)} phase=${q.phase}`); }
        resolve({ fails, rec: localStorage.getItem('tt_records'), f, hits: sc.train.hits, minHp, rage });
      }, 800);
    }), { boss, N });
    const recOk = !res.rec;
    if (!recOk) res.fails.push('рекорды записались: ' + res.rec);
    console.log(boss, JSON.stringify({ frames: res.f, hits: res.hits, rage: res.rage }), res.fails.length ? 'ПРОВАЛ: ' + res.fails.join(' | ') : 'ok');
    bad += res.fails.length;
    await page.close();
  }
  console.log('ошибок страницы:', errs, 'провалов:', bad);
  await browser.close(); process.exit(errs || bad ? 1 : 0);
})();
