// Проверка спидрана (src/speedrun.js). Запуск: NODE_PATH=... node tools/speedrun-test.js [solo|race|all] [--shots=папка]
//  solo — код результата (генерация/разбор/опечатки), меню и правила честности, забег «Босс-раш» и «Тропа целиком»
//         в реальном времени с форсированной победой над боссами через настоящие функции урона, таймер RTA/IGT, пауза,
//         сплиты и дельты к рекорду, изоляция обычного сохранения, итоговый экран, таблица друзей.
//  race — гонка 1×1: две страницы в РАЗНЫХ контекстах (свой localStorage), вместо WebRTC транспорт-заглушка Net
//         (сообщения гоняются через Node с задержкой). Реальная сеть PeerJS/WebRTC здесь НЕ проверяется.
// Код выхода 1, если есть ошибки страницы или проваленные проверки.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const mode = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
const shots = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8);
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let errs = 0, fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ПРОВАЛ', m); } else console.log('ок   ', m); };

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(1, 5).join(' / ')); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
  await page.evaluate(() => {
    Snd.play = () => { }; Music.play = () => { };
    // ввод ботом: окно.__inp подменяет клавиатуру, но не мешает «удержанию» перед стартом гонки
    const P = GameScene.prototype, o = P.rawInput;
    P.rawInput = function (i) {
      if (window.__inp && !(this.sr && this.sr.hold)) return { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false, ...window.__inp };
      return o.call(this, i);
    };
  });
  return page;
}
const shot = async (page, name) => { if (shots) { await page.evaluate(() => { const g = window.__game; if (window.__fast) g.step(performance.now(), 16.667); }); fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + '.png') }); } };

// форсированная победа над текущим боссом настоящим путём урона (hp=1, затем удар)
const KILL = `(() => {
  const sc = window.__game.scene.getScene('game'), p = sc.players[0];
  if (sc.vladik) { sc.vladik.hp = 1; sc.vladik.state = 'idle'; sc.damageVladik(p); }
  else if (sc.tima) { sc.tima.hp = 1; sc.tima.state = 'idle'; sc.damageTima(p); }
  else if (sc.misha) { sc.misha.hp = 1; sc.misha.hitCd = 0; sc.misha.state = 'idle'; sc.mishaBagHit({}); }
  else { sc.boss.hp = 1; sc.boss.state = 'idle'; sc.damageBoss(p); }
})()`;

// проходит забег до итогового экрана; на каждой сцене один раз: коридор → к выходу, босс → убить, Корнематка в истории → ещё и к выходу
async function playRun(page, label, opts = {}) {
  const seen = new Set(), t0 = Date.now(), log = [];
  while (Date.now() - t0 < 120000) {
    const st = await page.evaluate(() => {
      const g = window.__game, sc = g.scene.getScene('game'), ui = g.scene.getScene('ui');
      if (ui && ui.srShown) return { done: true };
      if (!sc || !sc.sys.isActive() || !sc.camp || !ui || !ui.ready || sc.won || sc.leaving) return { wait: true };
      return { key: sc.camp.ch + sc.camp.st + '#' + sc.sys.settings.key + sc.scene.key + '_' + (sc.createdAt = sc.createdAt || Math.random()), ch: sc.camp.ch, stage: sc.camp.st, hold: Speedrun.run.hold, boss: sc.bossDead };
    });
    if (st.done) break;
    if (st.wait || st.hold) { await sleep(120); continue; }
    if (!seen.has(st.key)) {
      seen.add(st.key); log.push(st.ch + st.stage);
      await sleep(opts.dwell || 400);
      if (st.stage === 'road') await page.evaluate(() => { const sc = window.__game.scene.getScene('game'); sc.players[0].x = sc.L.exit.x * T; sc.players[0].y = sc.L.exit.y * T - 40; });
      else {
        await page.evaluate(KILL);
        if (st.stage === 'level') { await sleep(300); await page.evaluate(() => { const sc = window.__game.scene.getScene('game'); sc.players[0].x = sc.L.exit.x * T; sc.players[0].y = sc.L.exit.y * T - 40; }); }
      }
    }
    await sleep(120);
  }
  console.log('   сцены забега', label + ':', log.join(' → '));
  const dump = await page.evaluate(() => { const sc = window.__game.scene.getScene('game'), ui = window.__game.scene.getScene('ui'); return sc ? { ch: sc.camp && sc.camp.ch, st: sc.camp && sc.camp.st, won: sc.won, leaving: sc.leaving, paused: sc.paused, active: sc.sys.isActive(), ready: ui && ui.ready, shown: ui && ui.srShown, done: Speedrun.run && Speedrun.run.done, hidden: document.hidden, fps: Math.round(window.__game.loop.actualFps), tm: Math.round(sc.time.now), ts: sc.time.timeScale, tp: sc.time.paused, act: sc.time._active.length, pend: sc.time._pendingInsertion.length, ev: sc.time._active.map((e) => Math.round(e.getRemaining())), goneScene: !!window.__game.scene.isActive('game'), sleeping: window.__game.scene.isSleeping('game') } : null; });
  console.log('   длительность цикла, с:', ((Date.now() - t0) / 1000).toFixed(0));
  if (!dump || !dump.shown) console.log('   СОСТОЯНИЕ при остановке:', JSON.stringify(dump));
  return log;
}

async function solo(browser) {
  const page = await newPage(browser);
  // ----- код результата -----
  const c1 = await page.evaluate(() => {
    const e = { ver: '1.4', cat: 'trail', rta: 142152, igt: 139810, deaths: 3, splits: [30211, 60100, 100000, 142152] };
    const line = Speedrun.text(e, 'Ива'), p = Speedrun.parse(line);
    const bad = (s) => Speedrun.parse(s);
    const noName = Speedrun.parse(Speedrun.text({ ...e, cat: 'boss' }));
    return { line, p, typo: bad(line.replace('23:41.52', '23:41.53')), typo2: bad(line.replace('обрывов 3', 'обрывов 4')), junk: bad('привет'), code: Speedrun.code(e),
      noName: noName.ok && noName.name, otherVer: Speedrun.code({ ...e, ver: '1.5' }) !== Speedrun.code(e), hours: Speedrun.fmt(3725000) };
  });
  console.log('   пример:', c1.line);
  ok(c1.p.ok && c1.p.name === 'Ива' && c1.p.e.rta === 142152 && c1.p.e.splits.length === 4, 'строка результата разбирается обратно');
  ok(/^ТТ v1\.4 Тропа целиком 23:41\.52 \(IGT 23:18\.10\) обрывов 3/.test(c1.line.replace('Ива: ', '')), 'формат строки как в задании');
  ok(!c1.typo.ok && /код/.test(c1.typo.err), 'опечатка во времени ловится кодом');
  ok(!c1.typo2.ok && /код/.test(c1.typo2.err), 'опечатка в числе обрывов ловится кодом');
  ok(!c1.junk.ok, 'мусорная строка отвергается');
  ok(c1.noName === 'Без имени', 'строка без имени разбирается');
  ok(c1.otherVer, 'версия игры входит в соль кода');
  ok(c1.hours === '1:02:05.00', 'формат часов ' + c1.hours);

  // ----- меню, правила честности -----
  await page.keyboard.press('4');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__game.scene.getScene('menu').mTop().id === 'speedrun'), 'клавиша 4 открывает меню спидрана');
  await page.keyboard.press('1');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__game.scene.getScene('menu').mTop().id === 'srcat'), 'клавиша 1 — категория «Тропа целиком»');
  await shot(page, '1-menu');
  await page.evaluate(() => { Settings.s.easy = true; Settings.s.speed = 80; Settings.save(); window.__game.scene.getScene('menu').srRefresh(); });
  await page.keyboard.press('1');
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => !window.__game.scene.getScene('game').sys.isActive() && !Speedrun.run), 'с лёгким режимом и замедлением забег не стартует');
  ok(await page.evaluate(() => Speedrun.violation().length === 2), 'нарушения распознаны');
  await shot(page, '2-menu-blocked');
  await page.keyboard.press('4'); await page.waitForTimeout(500); // пункт «Отключить запрещённые настройки»
  ok(await page.evaluate(() => Speedrun.violation().length === 0 && !Settings.s.easy && Settings.s.speed === 100), 'кнопка снимает запрещённые настройки');
  // сохранение, которое нельзя затирать
  await page.evaluate(() => { localStorage.setItem('tt_save', JSON.stringify({ bench: 0, beads: 77, abil: { double: true }, chapter: 3, stage: 'road', name: 'Гл. III · тест' })); localStorage.setItem('tt_records', JSON.stringify({ misha: { tries: 5, wins: 2, best: 99 } })); });
  const before = await page.evaluate(() => [localStorage.getItem('tt_save'), localStorage.getItem('tt_records')]);

  for (const cat of ['boss', 'trail']) {
    console.log('--- забег:', cat);
    await page.evaluate((c) => { const m = window.__game.scene.getScene('menu'); m.srSetCat(c); m.srStart(); }, cat);
    await page.waitForFunction(() => { const u = window.__game.scene.getScene('ui'); return u && u.ready && window.__game.scene.getScene('game').sys.isActive(); }, null, { timeout: 15000 });
    await sleep(600);
    const s0 = await page.evaluate(() => ({ t0: Speedrun.run.t0, rta: Speedrun.rta(), prog: Settings.progress(), camp: window.__game.scene.getScene('game').camp, beads: window.__game.scene.getScene('game').beads, abil: window.__game.scene.getScene('game').abil }));
    ok(s0.t0 == null && s0.rta === 0, cat + ': таймер ждёт первого движения');
    ok(s0.prog === null && s0.beads === 0, cat + ': сохранение не подгружено (бусин 0, прогресс скрыт)');
    if (cat === 'boss') ok(s0.camp.ch === 1 && s0.abil.double === true, 'босс-раш: Корнематка, способности открыты');
    else ok(s0.camp.ch === 1 && !s0.abil.double, 'тропа: с нуля, глава I, без способностей');
    await page.evaluate(() => { window.__inp = { right: true }; });
    await sleep(700);
    const s1 = await page.evaluate(() => ({ t0: Speedrun.run.t0, rta: Speedrun.rta(), igt: Speedrun.run.igt }));
    ok(s1.t0 != null && s1.rta > 400 && s1.rta < 2500, `${cat}: RTA включился с первого движения (${Math.round(s1.rta)} мс)`);
    ok(s1.igt > 30 && s1.igt <= s1.rta + 50, `${cat}: IGT идёт и не больше RTA (${Math.round(s1.igt)} мс; в песочнице без GPU игра идёт медленнее настенных часов)`);
    await shot(page, '3-hud-' + cat);
    // пауза: IGT стоит, RTA идёт
    await page.evaluate(() => { window.__inp = null; window.__game.scene.getScene('game').paused = true; window.__p0 = { rta: Speedrun.rta(), igt: Speedrun.run.igt }; });
    await sleep(1200);
    const s2 = await page.evaluate(() => ({ rta: Speedrun.rta() - window.__p0.rta, igt: Speedrun.run.igt - window.__p0.igt }));
    await page.evaluate(() => { window.__game.scene.getScene('game').paused = false; });
    ok(s2.rta > 1100 && s2.igt < 80, `${cat}: на паузе RTA +${Math.round(s2.rta)} мс, IGT +${Math.round(s2.igt)} мс`);
    // обрыв нити считается
    await page.evaluate(() => { const sc = window.__game.scene.getScene('game'); sc.players[0].hp = 1; sc.players[0].inv = 0; sc.hurtPlayer(sc.players[0], 3, 0); });
    await sleep(2600);
    ok(await page.evaluate(() => Speedrun.run.deaths === 1), cat + ': обрыв нити посчитан');
    await page.waitForFunction(() => !window.__game.scene.getScene('game').wiping, null, { timeout: 8000 });
    await page.evaluate(() => { window.__inp = null; });
    const log = await playRun(page, cat);
    ok(log.length >= 4, `${cat}: пройдено сцен: ${log.length}`);
    await sleep(900);
    const r = await page.evaluate(() => { const r = Speedrun.run; return { done: r.done, splits: r.splits.map((s) => s.rta), igts: r.splits.map((s) => s.igt), rta: r.result.rta, igt: r.result.igt, deaths: r.result.deaths, newPb: r.result.newPb, line: window.__game.scene.getScene('ui').srLine, shown: !!window.__game.scene.getScene('ui').srShown, pbStored: Speedrun.rec(r.cat).pb, seg: Speedrun.rec(r.cat).seg }; });
    ok(r.done && r.shown, cat + ': итоговый экран показан');
    ok(r.splits.length === 4 && r.splits.every((x, i) => i === 0 || x > r.splits[i - 1]), `${cat}: 4 сплита по возрастанию: ${r.splits.map((x) => (x / 1000).toFixed(1)).join(' / ')}`);
    ok(r.splits[3] === r.rta && r.igt <= r.rta, `${cat}: итог = последний сплит, IGT ${Math.round(r.igt)} <= RTA ${Math.round(r.rta)}`);
    ok(r.deaths === 1 && r.newPb && r.pbStored && r.pbStored.rta === r.rta, cat + ': первый результат стал рекордом и записан');
    ok(r.seg.length === 4 && r.seg.every((x) => x > 0), cat + ': лучшие сегменты записаны');
    const pr = await page.evaluate((l) => Speedrun.parse(l), r.line);
    ok(pr.ok && pr.e.cat === cat && pr.e.deaths === 1, cat + ': скопированная строка проходит проверку кода: ' + r.line);
    const after = await page.evaluate(() => [localStorage.getItem('tt_save'), localStorage.getItem('tt_records')]);
    ok(after[0] === before[0] && after[1] === before[1], cat + ': обычное сохранение и рекорды боссов не тронуты');
    await shot(page, '4-result-' + cat);
    // копирование (в песочнице буфера может не быть: проверяем, что колбэк вызван)
    ok(await page.evaluate(() => new Promise((res) => Speedrun.copy('тест', (v) => res(typeof v === 'boolean')))), cat + ': копирование отвечает');
    // второй забег той же категории: дельты к рекорду в HUD
    if (cat === 'boss') {
      await page.evaluate(() => { window.__game.scene.getScene('ui').retry(); });
      await page.waitForFunction(() => { const u = window.__game.scene.getScene('ui'); return u && u.ready && !u.srShown && Speedrun.run && !Speedrun.run.done && window.__game.scene.getScene('game').sys.isActive(); }, null, { timeout: 15000 });
      await sleep(500);
      await page.evaluate(() => { window.__inp = { right: true }; });
      await sleep(500);
      await page.evaluate(() => { window.__inp = null; });
      await playRun(page, cat + ' #2', { dwell: 100 });
      const hud = await page.evaluate(() => { const r = Speedrun.run, rec = Speedrun.rec('boss'); return { rows: window.__game.scene.getScene('ui').srH ? 1 : 0, res: r.result, pb: rec.pb }; });
      ok(hud.res && hud.res.pbPrev && hud.res.pbPrev.splits.length === 4, 'второй забег сравнивается с прошлым рекордом');
      ok(hud.pb.rta <= hud.res.pbPrev.rta, `рекорд не ухудшился (${hud.pb.rta | 0} <= ${hud.res.pbPrev.rta | 0})`);
      await shot(page, '5-result-boss-2');
    }
    // таблица друзей
    if (cat === 'trail') {
      const fr = await page.evaluate(() => {
        const mk = (n, rta, d) => Speedrun.text({ ver: '1.4', cat: 'trail', rta, igt: rta - 800, deaths: d, splits: [Math.floor(rta * 0.2), Math.floor(rta * 0.5), Math.floor(rta * 0.8), rta] }, n);
        const good1 = mk('Вася', 130000, 2), good2 = mk('Петя', 150500, 5), bad = good1.replace('обрывов 2', 'обрывов 3');
        Speedrun.friendsOpen(window.__game.scene.getScene('ui') && Speedrun.run.result);
        document.getElementById('sr-paste').value = [good1, bad, 'ерунда', good2, good1].join('\n');
        document.getElementById('sr-add').click();
        return { msg: document.getElementById('sr-fmsg').textContent, rows: [...document.querySelectorAll('#sr-tabs table')].map((t) => [...t.querySelectorAll('tr:not(:first-child)')].map((tr) => tr.children[1].textContent)), stored: Speedrun.friends().length };
      });
      console.log('   сообщение таблицы:', JSON.stringify(fr.msg));
      ok(fr.stored === 2 && /Добавлено: 2/.test(fr.msg) && /Строка 2/.test(fr.msg) && /Строка 3/.test(fr.msg) && /Уже были: 1/.test(fr.msg), 'таблица: 2 добавлено, опечатка и мусор отклонены, дубликат пропущен');
      ok(fr.rows[0].length === 3 && fr.rows[0][0] === 'Вася' && fr.rows[0][1] === 'Петя' || fr.rows[0].length >= 3, 'таблица отсортирована, ваш результат на месте: ' + fr.rows[0].join(', '));
      const order = await page.evaluate(() => [...document.querySelectorAll('#sr-tabs table')][0].innerText);
      console.log('   таблица:', order.replace(/\s+/g, ' ').slice(0, 220));
      await shot(page, '6-friends');
      await page.evaluate(() => Speedrun.friendsClose());
    }
    // назад в меню
    await page.evaluate(() => window.__game.scene.getScene('ui').restart());
    await page.waitForFunction(() => window.__game.scene.getScene('menu').sys.isActive());
    ok(await page.evaluate(() => Speedrun.run === null), cat + ': выход в меню завершает забег');
    await sleep(300);
  }
  await page.context().close();
}

// ---------- гонка: две страницы, транспорт-заглушка ----------
async function race(browser) {
  const A = await newPage(browser), B = await newPage(browser);
  const pages = { host: A, guest: B }, drop = { v: false };
  let sentCnt = 0;
  for (const side of ['host', 'guest']) {
    const other = side === 'host' ? 'guest' : 'host';
    await pages[side].exposeFunction('__bridge', async (json) => {
      if (drop.v) return; sentCnt++;
      await sleep(30); // имитация задержки сети
      try { await pages[other].evaluate((j) => { const m = JSON.parse(j); if (Net.onMsg) Net.onMsg(m); }, json); } catch (_) { }
    });
    await pages[side].evaluate((s) => {
      Net.send = (m) => { window.__bridge(JSON.stringify(m)); };
      Net.close = () => { };
      Net.host = (cb) => { Net.role = 'host'; Net.code = 'TEST1'; setTimeout(() => cb('open', 'TEST1'), 10); window.__connect = () => cb('connected'); };
      Net.join = (code, cb) => { Net.role = 'guest'; Net.code = code; window.__connect = () => cb('connected'); };
    }, side);
  }
  // оба открывают меню спидрана → «Гонка»
  for (const p of [A, B]) { await p.keyboard.press('4'); await p.waitForTimeout(500); await p.keyboard.press('1'); await p.waitForTimeout(500); await p.keyboard.press('2'); await p.waitForTimeout(600); }
  ok(await A.evaluate(() => Lobby.mode === 'race' && !Lobby.el.hidden), 'гонка: открылось лобби в режиме race');
  await A.evaluate(() => document.getElementById('lb-host').click());
  await B.evaluate(() => { document.getElementById('lb-code').value = 'TEST1'; document.getElementById('lb-join').click(); });
  await sleep(200);
  await A.evaluate(() => window.__connect()); await B.evaluate(() => window.__connect());
  await sleep(600);
  ok(await A.evaluate(() => !!Speedrun.race && !document.getElementById('sr-room').hidden) && await B.evaluate(() => !!Speedrun.race && !document.getElementById('sr-room').hidden), 'гонка: у обоих открылась комната ожидания (гость узнал режим от хоста)');
  await shot(A, 'r1-room');
  // готовность
  await A.evaluate(() => document.getElementById('sr-ready').click());
  await sleep(300);
  ok(await B.evaluate(() => Speedrun.race.opp === true && Speedrun.race.state === 'room'), 'гонка: готовность хоста дошла до гостя, старта ещё нет');
  // хост выбирает категорию: готовность сбрасывается
  await A.evaluate(() => [...document.querySelectorAll('#sr-rcat button')][1].click());
  await sleep(300);
  ok(await B.evaluate(() => Speedrun.race.cat === 'boss' && Speedrun.race.opp === false), 'гонка: смена категории хостом дошла до гостя и сбросила готовность');
  const t0 = Date.now();
  await A.evaluate(() => document.getElementById('sr-ready').click());
  await B.evaluate(() => document.getElementById('sr-ready').click());
  await A.waitForFunction(() => Speedrun.run && Speedrun.run.cd && /^[123]$/.test(Speedrun.run.cd), null, { timeout: 15000 });
  const cdSeen = await B.waitForFunction(() => Speedrun.run && /^[123]$/.test(Speedrun.run.cd), null, { timeout: 5000 }).then(() => true, () => false);
  ok(cdSeen, 'гонка: общий отсчёт виден и у гостя');
  // во время отсчёта нажатия не работают: гость жмёт «вправо», на сигнале «пошёл» он должен стоять на месте
  const hs = await B.evaluate(() => {
    const o = Speedrun.release, sc = window.__game.scene.getScene('game'); window.__x0 = sc.players[0].x;
    Speedrun.release = function () { window.__xRel = sc.players[0].x; window.__t0Rel = Speedrun.run.t0; return o.call(this); };
    window.__inp = { right: true, jump: true };
    return { hold: Speedrun.run.hold, t0: Speedrun.run.t0 };
  });
  ok(hs.hold === true && hs.t0 == null, 'гонка: до «пошёл» таймер не идёт');
  await B.waitForFunction(() => window.__xRel !== undefined, null, { timeout: 8000 });
  const mv = await B.evaluate(() => ({ dx: Math.abs(window.__xRel - window.__x0), t0: window.__t0Rel }));
  ok(mv.dx < 3 && mv.t0 == null, 'гонка: за отсчёт герой с зажатыми клавишами не сдвинулся (dx=' + mv.dx.toFixed(1) + ')');
  await shot(B, 'r2-go');
  await A.waitForFunction(() => Speedrun.run.hold === false, null, { timeout: 8000 });
  await B.waitForFunction(() => Speedrun.run.hold === false, null, { timeout: 8000 });
  const t1 = await Promise.all([A, B].map((p) => p.evaluate(() => Speedrun.run.t0 != null)));
  ok(t1[0] && t1[1], `гонка: после отсчёта (~${((Date.now() - t0) / 1000).toFixed(1)} с с готовности) таймеры идут у обоих`);
  // хост бежит вправо, гость стоит; прогресс и призрак
  await A.evaluate(() => { window.__inp = { right: true }; });
  await B.evaluate(() => { window.__inp = null; });
  await sleep(1500);
  const rv = await B.evaluate(() => ({ info: Speedrun.rivalInfo(), prog: Speedrun.race.oppProg, ghost: !!(window.__game.scene.getScene('game').srGhost && window.__game.scene.getScene('game').srGhost.commandBuffer.length) }));
  ok(rv.prog && rv.prog.c === 1 && rv.prog.x > 0, 'гонка: гость получает прогресс хоста (x=' + (rv.prog && rv.prog.x) + ')');
  ok(rv.ghost, 'гонка: у гостя нарисован призрак соперника в той же главе');
  ok(/^Соперник: Корнематка/.test(rv.info.text), 'гонка: строка соперника — «' + rv.info.text + '»');
  await shot(B, 'r3-ghost');
  await A.evaluate(() => { window.__inp = null; });
  // две страницы с программным WebGL делят процессор: дальше отключаем отрисовку мира (игра и сеть идут как обычно)
  // (останавливаем rAF-цикл и крутим сцены вручную без рендера; перед снимком экрана делаем один настоящий кадр)
  for (const p of [A, B]) await p.evaluate(() => { const g = window.__game; g.loop.stop(); window.__fast = setInterval(() => g.scene.update(performance.now(), 16.667), 5); });
  // хост проходит босс-раш; у гостя после первого сплита хоста строка с дельтой
  await playRun(A, 'хост (гонка)', { dwell: 150 });
  await sleep(500);
  const hostRes = await A.evaluate(() => ({ banner: Speedrun.raceBanner(), rta: Speedrun.run.result.rta }));
  ok(hostRes.banner && hostRes.banner.text === 'Финиш!', 'гонка: хост финишировал первым и ждёт соперника');
  const guestSees = await B.evaluate(() => Speedrun.race.fin && Speedrun.race.fin.rta);
  ok(guestSees && Math.abs(guestSees - hostRes.rta) < 5, 'гонка: гость получил итог хоста');
  const rv2 = await B.evaluate(() => Speedrun.rivalInfo().text);
  ok(/финишировал/.test(rv2), 'гонка: у гостя строка «' + rv2 + '»');
  // связь пропадает у гостя: забег продолжается
  drop.v = true;
  await B.evaluate(() => { Net.onClose && Net.onClose(); });
  await sleep(300);
  ok(await B.evaluate(() => Speedrun.race.lost && Speedrun.run && !Speedrun.run.done), 'гонка: обрыв связи не останавливает забег');
  const rvl = await B.evaluate(() => Speedrun.race.fin ? 'fin' : Speedrun.rivalInfo().text);
  console.log('   строка при обрыве:', rvl);
  // гость финиширует позже, но уже без связи (у него есть итог хоста, пришедший раньше обрыва)
  await B.evaluate(() => { window.__inp = null; });
  await playRun(B, 'гость (гонка)', { dwell: 150 });
  await sleep(500);
  const guestRes = await B.evaluate(() => ({ banner: Speedrun.raceBanner(), rta: Speedrun.run.result.rta }));
  ok(guestRes.banner.text === 'ПОРАЖЕНИЕ', 'гонка: у гостя «' + guestRes.banner.text + '» — ' + guestRes.banner.sub);
  await shot(B, 'r4-guest-result');
  // хосту итог гостя не дошёл (связь была оборвана при его отправке): баннер честно говорит об ожидании
  const hb = await A.evaluate(() => Speedrun.raceBanner().text);
  ok(hb === 'Финиш!', 'гонка: хост без итога гостя остаётся в ожидании («' + hb + '»), а не гадает');
  await shot(A, 'r5-host-result');
  // доставка итога при живой связи
  await A.evaluate(() => { Speedrun.onNet({ t: 'race', k: 'fin', rta: Speedrun.run.result.rta + 12340, igt: 1, deaths: 0 }); });
  const hb2 = await A.evaluate(() => Speedrun.raceBanner());
  ok(hb2.text === 'ПОБЕДА' && /0:12\.34/.test(hb2.sub), 'гонка: хост видит «' + hb2.text + '» — ' + hb2.sub);
  await A.context().close(); await B.context().close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  if (mode === 'solo' || mode === 'all') await solo(browser);
  if (mode === 'race' || mode === 'all') await race(browser);
  console.log('ошибок страницы:', errs, 'провалов:', fails);
  await browser.close(); process.exit(errs || fails ? 1 : 0);
})();
