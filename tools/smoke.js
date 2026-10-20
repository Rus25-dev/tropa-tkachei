// Дымовой тест: история или босс-тест, случайные нажатия, проверка на исключения. node tools/smoke.js [story|vladik|tima|misha] [кадров]
// Режим enemies2: сценарии по каждому новому врагу (плевальщик, панцирь, мыши, засадник), броня, снимок хост→гость; ошибки или невыполненные проверки дают код 1.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const mode = process.argv[2] || 'story', N = +(process.argv[3] || 3000);
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  let errs = 0;
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
  if (mode === 'enemies2') {
    const res = await page.evaluate(() => new Promise((resolve) => {
      const g = window.__game; g.scene.stop('menu'); g.scene.start('game', { players: 1, mode: 'story' });
      setTimeout(() => {
        const sc = g.scene.getScene('game'); Snd.play = () => {}; sc.togglePause = () => {}; g.loop.stop();
        sc.rawInput = () => sc._i || {};
        const fails = [], log = {}; let f = 0;
        const p = sc.players[0], ok = (c, m) => { if (!c) fails.push(m); };
        const frames = (n, cb) => { for (let i = 0; i < n; i++, f++) { sc._i = {}; p.inv = 999; p.hp = 9; sc.update(f * 16.667, 16.667); cb && cb(); } };
        const floorOf = (e) => (e.type === 'lurker' ? e.fy : e.y + e.h);
        // убирает остальных врагов на время сценария (и возвращает тех, кого убрали раньше)
        const away = new Set();
        const isolate = (keep) => { for (const o of sc.enemies) { if (keep.includes(o)) { if (away.has(o)) { o.dead = false; away.delete(o); } } else if (!o.dead) { o.dead = true; o.g.clear(); away.add(o); } } };
        // поставить героя на землю рядом с врагом; остальных врагов убрать
        const setup = (e, dx, dy) => {
          isolate([e]); sc.projs = [];
          const cx = e.x + e.w / 2, fl = floorOf(e);
          p.x = cx + dx - 7; p.y = fl - 26 + (dy || 0); p.vx = p.vy = 0; p.kbx = 0;
          sc.camX = p.x; sc.camY = p.y;
        };
        const pick = (t, i = 0) => sc.enemies.filter((e) => e.type === t)[i];
        const seen = (e, secs, cb) => { const st = new Set(); frames(secs * 60, () => { st.add(e.state); cb && cb(); }); return st; };
        const need = (name, st, list) => { log[name] = [...st].join(','); for (const s of list) ok(st.has(s), `${name}: нет состояния ${s} (было: ${[...st]})`); };
        // 1. плевальщик: целится плевком и убегает от сближения
        { const e = pick('spitter'); let globs = 0;
          setup(e, -260); let st = seen(e, 4, () => { if (sc.projs.some((q) => q.kind === 'glob')) globs++; });
          ok(globs > 0, 'плевальщик: не плюнул'); need('spitter-far', st, ['wind', 'recover']);
          setup(e, 50); e.state = 'idle'; e.cd = 5; st = seen(e, 1.5); need('spitter-near', st, ['flee']); }
        // 2. панцирь: разбег и вращение; броня
        { const e = pick('shell'); setup(e, -220); e.face = -1; const st = seen(e, 6); need('shell', st, ['wind', 'rush', 'spin']);
          e.state = 'walk'; e.armorT = 0; e.hp = 8; e.flash = 0; e.kbT = 0;
          const dmg = (heavy, dir) => { p.heavy = heavy; p.atkDir = dir; const h = e.hp; sc.damageEnemy(e, p); const d = h - e.hp; e.kbT = 0; return d; };
          ok(dmg(false, 'f') === 0, 'панцирь: обычный удар прошёл'); ok(dmg(false, 'u') === 0, 'панцирь: удар вверх прошёл');
          ok(dmg(true, 'f') === 1, 'панцирь: тяжёлый не прошёл'); ok(dmg(false, 'd') === 1, 'панцирь: удар вниз не прошёл');
          e.armorT = 1; ok(dmg(false, 'f') === 1, 'панцирь: треснувшая броня не пробивается');
          e.armorT = 0; sc._e2burst = true; ok(dmg(false, 'f') === 1, 'панцирь: всполох не пробил'); sc._e2burst = false;
          // отбив: рядом с панцирем ломает броню на 3 с и оглушает
          e.armorT = 0; e.state = 'rush'; setup(e, -30); sc.parrySuccess(p, e.x); ok(e.armorT > 2.5 && e.state === 'stun', 'панцирь: отбив не сломал броню'); }
        // 3. мыши: пикируют по очереди
        { const e = pick('bat'); const bats = sc.enemies.filter((b) => b.sq === e.sq); isolate(bats);
          p.x = e.hx - 7; p.y = e.hy + 8 * 32 - 26; sc.projs = []; const st = new Set(), dives = new Set();
          frames(60 * 8, () => { for (const b of bats) { st.add(b.state); if (b.state === 'dive') dives.add(b.k); } });
          need('bats', st, ['hover', 'wind', 'dive']); ok(dives.size >= 2, `мыши: пикировали не по очереди (${[...dives]})`); }
        // 4. засадник: подкрадывается, трещины, прыжок
        { const e = pick('lurker'); setup(e, 80); const st = new Set(); let hitU = false;
          for (let i = 0; i < 60 * 9; i++, f++) { sc._i = {}; p.inv = 999; p.hp = 9; if (!['erupt', 'tell', 'pounce'].includes(e.state)) { p.x = e.x + e.w / 2 + 60 - 7; p.y = e.fy - 26; p.vx = p.vy = 0; } sc.update(f * 16.667, 16.667); st.add(e.state); }
          need('lurker', st, ['track', 'warn', 'erupt', 'pounce', 'tired', 'dig']);
          e.state = 'hidden'; e.y = e.fy + 50; e.hp = 3; ok(sc.e2Blocked(e, p) === true, 'засадник: неуязвим под землёй не работает'); e.state = 'tired'; ok(sc.e2Blocked(e, p) === false, 'засадник: вне земли неуязвим'); }
        // 5. снимок хост → гость: состояния восстанавливаются
        { const snap = JSON.parse(JSON.stringify(sc.packSnap())); const before = sc.enemies.map((e) => e.state + '|' + (e.armorT > 0 ? 1 : 0));
          for (const e of sc.enemies) if (e.e2) e.state = '?';
          try { sc.applySnap(snap); } catch (err) { fails.push('applySnap: ' + err.message); }
          const after = sc.enemies.map((e) => e.state + '|' + (e.armorT > 0 ? 1 : 0));
          sc.enemies.forEach((e, i) => { if (e.e2 && !e.dead && before[i] !== after[i]) fails.push(`снимок: ${e.type} ${before[i]} → ${after[i]}`); });
          // и отрисовка гостем
          try { sc.enemies.forEach((e) => { if (!e.dead) sc.drawEnemy(e, 1); }); } catch (err) { fails.push('drawEnemy: ' + err.message); } }
        resolve({ fails, log });
      }, 800);
    }));
    console.log(JSON.stringify(res.log)); for (const m of res.fails) console.log('ПРОВАЛ', m);
    console.log('ошибок:', errs, 'провалов:', res.fails.length);
    await browser.close(); process.exit(errs || res.fails.length ? 1 : 0);
  }
  const out = await page.evaluate(({ mode, N }) => new Promise((resolve) => {
    const g = window.__game; g.scene.stop('menu');
    g.scene.start('game', mode === 'story' ? { players: 1, mode: 'story' } : { players: 1, mode: 'bosstest', boss: mode });
    setTimeout(() => {
      const sc = g.scene.getScene('game'); Snd.play = () => {}; sc.togglePause = () => {}; g.loop.stop();
      sc.rawInput = () => sc._i || {};
      let f = 0, maxX = 0;
      const run = () => {
        for (let n = 0; n < 60 && f < N; n++, f++) {
          const k = Math.floor(f / 25) % 8;
          sc._i = { right: f % 400 < 300, left: f % 400 >= 300, jump: f % 37 < 12, atk: f % 11 === 0, dash: f % 90 === 0, heal: f % 53 === 0, up: f % 130 < 20, down: false, bomb: f % 70 === 0 };
          sc.update(f * 16.667, 16.667); maxX = Math.max(maxX, sc.players[0].x);
        }
        if (f >= N) return resolve({ f, maxX: Math.round(maxX), hp: sc.players[0].hp, abil: sc.abil });
        setTimeout(run, 0);
      };
      run();
    }, 800);
  }), { mode, N });
  console.log(JSON.stringify(out), 'ошибок:', errs);
  await browser.close(); process.exit(errs ? 1 : 0);
})();
