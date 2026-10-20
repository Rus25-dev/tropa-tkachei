// Проверка журнала ввода (src/journal.js): забег пишется, «падает» вкладка, в другой странице забег восстанавливается и приходит в то же состояние.
// Запуск: node tools/journal-test.js   (переменная CHROME — путь к Chrome)
// Сценарий страницы A: забег «Тропа целиком» с зерном; случайный (но детерминированный) ввод бота, пауза, смерть, убийство босса главы I,
// переход в главу II (вторая часть журнала). Страница B (чистый контекст) получает только tt_jr и восстанавливает забег.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let errs = 0, fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ПРОВАЛ', m); } else console.log('ок   ', m); };

async function newPage(browser, jr) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(1, 4).join(' / ')); });
  if (jr) await page.addInitScript((j) => { localStorage.setItem('tt_jr', j); }, jr);
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive() && window.__game.scene.getScene('menu').mStack);
  await page.evaluate(() => {
    Snd.play = () => { }; Music.play = () => { };
    const P = GameScene.prototype, o = P.rawInput;
    P.rawInput = function (i) {
      if (window.__inp && !(this.sr && this.sr.hold)) return { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false, ...window.__inp };
      return o.call(this, i);
    };
    // «читы» для теста: записываются в журнал как действия и воспроизводятся
    Journal.ext = {
      1: (gs) => { gs.boss.hp = 1; gs.boss.state = 'idle'; gs.damageBoss(gs.players[0]); },
      2: (gs) => { const p = gs.players[0]; p.x = gs.exitR.x + 4; p.y = gs.exitR.y + 20; p.vx = p.vy = 0; },
      3: (gs) => { gs.players[0].hp = 1; gs.hurtPlayer(gs.players[0], 5, gs.players[0].x + 40); },
    };
    window.__measure = () => {
      const sc = window.__game.scene.getScene('game'), p = sc.players[0], r = Speedrun.run;
      return { ch: sc.camp.ch, st: sc.camp.st, tickN: sc.tickN, segs: Journal.J ? Journal.J.segs.length : -1, x: Math.round(p.x * 16), y: Math.round(p.y * 16), hp: p.hp, beads: sc.beads, deaths: sc.deaths, igt: Math.round(r.igt), splits: r.splits.length, hash: Journal.hash(sc), seed: sc.seed };
    };
  });
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  // ===== A: играем и пишем журнал =====
  const A = await newPage(browser);
  await A.evaluate(() => {
    const g = window.__game; g.scene.stop('menu');
    const data = Speedrun.begin('trail', null, { seed: 777 });
    g.scene.start('game', data);
  });
  await A.waitForFunction(() => { const u = window.__game.scene.getScene('ui'), sc = window.__game.scene.getScene('game'); return u && u.ready && sc && sc.sys.isActive() && sc.tickN != null; });
  await A.evaluate(() => { window.__game.loop.stop(); });
  const play = (frames, seedName) => A.evaluate(([n, name]) => {
    const g = window.__game, rnd = mulberry32(rngSeedFor(99, name));
    let t = performance.now(), cur = null, hold = 0;
    for (let i = 0; i < n; i++) {
      if (hold-- <= 0) { // новый «жест» бота каждые 8–40 кадров
        const a = rnd(); hold = 8 + Math.floor(rnd() * 32);
        cur = { right: a < 0.62, left: a >= 0.62 && a < 0.74, jump: rnd() < 0.35, atk: rnd() < 0.4, dash: rnd() < 0.12, heal: rnd() < 0.05, up: rnd() < 0.08, down: rnd() < 0.05 };
      }
      window.__inp = cur; t += 16.667; g.step(t, 16.667);
    }
    window.__inp = null;
  }, [frames, seedName]);
  const sc0 = await A.evaluate(() => { const sc = window.__game.scene.getScene('game'); return { sr: !!sc.sr, seed: sc.seed, ch: sc.camp.ch }; });
  ok(sc0.sr && sc0.seed === 777 && sc0.ch === 1, 'забег запущен с общим зерном: ' + JSON.stringify(sc0));

  await play(500, 'a');
  await A.evaluate(() => { const sc = window.__game.scene.getScene('game'); sc.togglePause(); });
  await play(20, 'pz');
  await A.evaluate(() => { const sc = window.__game.scene.getScene('game'); sc.togglePause(); });
  await play(300, 'b');
  await A.evaluate(() => { const sc = window.__game.scene.getScene('game'); Journal.act(sc, 'ex', 3); Journal.ext[3](sc); }); // удар насмерть — обрыв нити, возрождение
  await play(200, 'c'); // 200 кадров ≈ 3,3 с: хватит на 1,35 с до возрождения
  const d1 = await A.evaluate(() => window.__measure());
  ok(d1.deaths >= 1, 'обрыв нити случился и забег продолжился: обрывов ' + d1.deaths);
  await A.evaluate(() => { const sc = window.__game.scene.getScene('game'); Journal.act(sc, 'ex', 1); Journal.ext[1](sc); });
  await play(20, 'd');
  await A.evaluate(() => { const sc = window.__game.scene.getScene('game'); Journal.act(sc, 'ex', 2); Journal.ext[2](sc); });
  await play(240, 'e'); // победа над боссом → переход в главу II (≈ 3,3 с + 0,5 с на таймеры тиков)
  const d2 = await A.evaluate(() => window.__measure());
  ok(d2.ch === 2 && d2.segs >= 2, 'после босса началась глава II, в журнале два отрезка: ' + JSON.stringify({ ch: d2.ch, segs: d2.segs }));
  await play(900, 'f');
  const fin = await A.evaluate(() => { Journal.write(true); const m = window.__measure(); m.json = localStorage.getItem('tt_jr'); return m; });
  const json = fin.json; delete fin.json;
  ok(json && json.length > 100, 'журнал сохранён в localStorage: ' + (json ? json.length : 0) + ' байт, тиков ' + fin.tickN + ' в последнем отрезке');
  const jr = JSON.parse(json);
  ok(jr.segs.length >= 2 && jr.segs[0].seed === 777 && jr.segs[1].seed === rngSeedFor777(), 'зерно второго отрезка выводится из первого (' + jr.segs.length + ' отрезка)');
  ok(jr.segs[0].acts.some((a) => a[1] === 'T') && jr.segs[0].acts.filter((a) => a[1] === 'T').length === 2, 'пауза записана действием (вкл/выкл)');
  console.log('   журнал:', jr.segs.map((s) => `отрезок ${s.n} тиков, RLE ${s.rle.length / 2}, действий ${s.acts.length}`).join('; '));
  await A.context().close();

  // ===== B: «перезагрузка вкладки» — только tt_jr =====
  const B = await newPage(browser, json);
  const info = await B.evaluate(() => { const i = Journal.info(); return i && { ok: i.ok, ticks: i.ticks, cat: i.cat }; });
  ok(info && info.ok && info.cat === 'trail', 'меню видит журнал для восстановления: ' + JSON.stringify(info));
  const t0 = Date.now();
  await B.evaluate(() => { Journal.restore(window.__game.scene.getScene('menu')); });
  await B.waitForFunction(() => !Journal.rp, null, { timeout: 120000 });
  const restoreMs = Date.now() - t0;
  const err = await B.evaluate(() => Journal.error || null);
  ok(!err, 'восстановление прошло без расхождений' + (err ? ': ' + err : ''));
  await sleep(300);
  const got = await B.evaluate(() => window.__measure());
  for (const k of Object.keys(fin)) if (k !== 'tickN') ok(got[k] === fin[k], `после восстановления совпало «${k}»: ${fin[k]} → ${got[k]}`);
  const flags = await B.evaluate(() => { const sc = window.__game.scene.getScene('game'); return { paused: sc.paused, replaying: sc.replaying, restored: Speedrun.run.restored, jr: !!sc.jr }; });
  ok(flags.paused && !flags.replaying && flags.restored === 1 && flags.jr, 'забег на паузе, помечен «восстановлен», запись продолжается: ' + JSON.stringify(flags));
  const total = jr.segs.reduce((a, g) => a + g.n, 0);
  console.log(`   воспроизведено ${total} тиков за ${restoreMs} мс (игра шла ≈ ${Math.round(total / 60)} с)`);
  // продолжаем играть и снова пишем журнал
  await B.evaluate(() => { const sc = window.__game.scene.getScene('game'); sc.togglePause(); });
  await sleep(500);
  const more = await B.evaluate(() => window.__measure());
  ok(more.tickN > got.tickN, 'после восстановления игра идёт дальше (тик ' + got.tickN + ' → ' + more.tickN + ')');
  await B.context().close();

  // ===== C: испорченный журнал — аккуратный отказ =====
  const bad = JSON.parse(json); bad.segs[0].chk[1] ^= 12345;
  const C = await newPage(browser, JSON.stringify(bad));
  await C.evaluate(() => { Journal.restore(window.__game.scene.getScene('menu')); });
  await C.waitForFunction(() => !Journal.rp, null, { timeout: 120000 });
  const cerr = await C.evaluate(() => ({ e: Journal.error, left: localStorage.getItem('tt_jr'), run: !!Speedrun.run }));
  ok(cerr.e && /разошлось/.test(cerr.e) && cerr.left == null && !cerr.run, 'расхождение хэша обнаружено, журнал удалён, забег не продолжается: ' + JSON.stringify(cerr));
  await C.context().close();

  // ===== D: чужая версия =====
  const old = JSON.parse(json); old.ver = '0.1';
  const D = await newPage(browser, JSON.stringify(old));
  const dinfo = await D.evaluate(() => { const i = Journal.info(); return { ok: i.ok, why: i.why, can: Journal.restore(null) }; });
  ok(!dinfo.ok && !dinfo.can && /0\.1/.test(dinfo.why), 'журнал другой версии не восстанавливается: ' + dinfo.why);
  await D.context().close();

  await browser.close();
  console.log('ошибок страницы:', errs, 'провалов:', fails);
  process.exit(errs || fails ? 1 : 0);
})();
function rngSeedFor777() {
  // зеркало rngSeedFor из src/rng.js + префикс 'next:' главы II (st 'road')
  const seed = 777, name = 'next:2road';
  let h = (seed >>> 0) ^ 0x9E3779B9;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
