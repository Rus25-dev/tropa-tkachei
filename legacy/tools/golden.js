// «Золотые записи» партий: эталон поведения игры для проверки переноса ядра на v2.0.
//   node tools/golden.js record [имена…] [--out=tests/golden]    записать партии (бот tools/botbrain.js ведёт героев, журнал Journal.startMem пишет ввод по тикам)
//   node tools/golden.js verify [имена…] [--dir=tests/golden] [--html=index.html]   воспроизвести записи на указанной сборке и сравнить исход
// Формат tests/golden/<имя>.json: { name, kind, version, expect: { … итог партии … }, journal: { …журнал ввода RLE, зерно, отрезки… } }.
// Исход (expect) = Journal.outcome(): тик, победа/поражение, смерти, бусины, босс (HP, фаза, состояние), герои (позиция×16, HP, нить), глава/этап,
// спидран (IGT, сплиты) и богатый хэш состояния. Дополнительно каждые 300 тиков в журнале лежит контрольный хэш (hv:2): расхождение укажет, на каком тике.
// Действия-«подготовки» (Journal.ext) в записях нужны для сцены, до которой герой иначе не дошёл бы вводом; их перечень — tests/golden/README.md.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2), cmd = argv[0] || 'verify', names = argv.slice(1).filter((a) => !a.startsWith('--'));
const flag = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const outDir = path.resolve(flag('out', flag('dir', path.join(__dirname, '../../tests/golden'))));
const html = path.resolve(flag('html', path.join(__dirname, '../index.html')));
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const brainSrc = fs.readFileSync(path.join(__dirname, 'botbrain.js'), 'utf8'), runnerSrc = fs.readFileSync(path.join(__dirname, 'golden-runner.js'), 'utf8');

// ----- сценарии -----
// kind 'boss': одна арена (bosstest) или Корнематка из истории; skill — мастерство бота; seeds — зёрна на подбор, пока исход не совпадёт с ожидаемым
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const BOSS = (boss, expect, skill, seeds, extra) => ({ name: `boss-${boss}-${expect}`, kind: 'boss', boss, expect, skill, seeds, max: 12000, ...(extra || {}) });
const SCENARIOS = [
  BOSS('korne', 'win', 0.95, range(100, 160)), BOSS('korne', 'lose', 0.2, [21, 22, 23]),
  BOSS('misha', 'win', 0.95, [31, 32, 33, 34, 35, 36]), BOSS('misha', 'lose', 0.2, [41, 42, 43]),
  BOSS('vladik', 'win', 0.95, [51, 52, 53, 54, 55, 56]), BOSS('vladik', 'lose', 0.2, [61, 62, 63]),
  BOSS('tima', 'win', 0.95, range(200, 280)), BOSS('tima', 'lose', 0.2, [81, 82, 83]),
  { name: 'coop-two-bots', kind: 'boss', boss: 'vladik', players: 2, expect: 'win', skill: 0.9, seeds: range(500, 540), max: 14000 },
  { name: 'speedrun-boss-rush', kind: 'rush', expect: 'win', skill: 0.95, seeds: range(600, 700), max: 60000 },
  { name: 'road-ch2', kind: 'road', ch: 2, expect: 'win', seeds: range(300, 330), max: 14000 },
  { name: 'road-ch3', kind: 'road', ch: 3, expect: 'win', seeds: range(330, 360), max: 14000 },
  { name: 'road-ch4', kind: 'road', ch: 4, expect: 'win', seeds: range(360, 390), max: 14000 },
  { name: 'chapter1-full', kind: 'chapter1', expect: 'win', skill: 0.95, seeds: range(400, 440), max: 60000 },
];
SCENARIOS.push({ name: 'ui-level1', kind: 'ui', item: true, expect: 'ui', seeds: [7500], max: 330 }, { name: 'ui-road2', kind: 'ui', ch: 2, expect: 'ui', seeds: [7501], max: 330 }, { name: 'ui-road4', kind: 'ui', ch: 4, expect: 'ui', seeds: [7502], max: 330 });
// Фаззинг ввода: случайный (но с зерном) ввод всех кнопок при разном снаряжении. Нужен, чтобы проверять перенос оружия, инструментов, оберегов,
// статусов и врагов, до которых бот сам не дотягивается. Исход не важен (expect: 'fuzz'): запись фиксирует, что сделала старая игра.
const WEAPONS_ALL = ['needle', 'twin', 'sickle', 'mace', 'lance'], TOOLS_ALL = ['throwneedle', 'trap', 'threadbomb', 'hook'];
const CHARMS_ALL = ['sting', 'ember', 'heart', 'swift', 'stride', 'window', 'thorns', 'call', 'hunter'];
const loadoutFor = (k) => ({ weapon: WEAPONS_ALL[k % 5], tool: TOOLS_ALL[k % 4], charms: [CHARMS_ALL[k % 9], CHARMS_ALL[(k * 2 + 3) % 9]].filter((c, i, a) => a.indexOf(c) === i && c !== 'heart'), have: { weapons: WEAPONS_ALL, tools: TOOLS_ALL, charms: CHARMS_ALL } });
let fi = 0;
for (const boss of ['misha', 'vladik', 'tima', 'korne']) for (let w = 0; w < 5; w++) { fi++; SCENARIOS.push({ name: 'fuzz-' + boss + '-' + w, kind: 'fuzz', boss, expect: 'fuzz', seeds: [7000 + fi], max: 3200, loadout: loadoutFor(w + fi) }); }
for (const where of ['level', 'road2', 'road3', 'road4']) for (let w = 0; w < 2; w++) { fi++; SCENARIOS.push({ name: 'fuzz-' + where + '-' + w, kind: 'fuzz', boss: where, expect: 'fuzz', seeds: [7100 + fi], max: 3600, loadout: loadoutFor(w * 2 + fi) }); }
for (const boss of ['vladik', 'tima']) { fi++; SCENARIOS.push({ name: 'fuzz-coop-' + boss, kind: 'fuzz', boss, players: 2, expect: 'fuzz', seeds: [7200 + fi], max: 3200, loadout: loadoutFor(fi) }); }
// отдельные записи с Паучьим сердцем (занимает два слота, поэтому в общий набор не попадает)
for (const boss of ['tima', 'korne']) { fi++; SCENARIOS.push({ name: 'fuzz-heart-' + boss, kind: 'fuzz', boss, expect: 'fuzz', seeds: [7300 + fi], max: 3200, loadout: { weapon: 'mace', tool: 'hook', charms: ['heart', 'swift'], have: { weapons: WEAPONS_ALL, tools: TOOLS_ALL, charms: CHARMS_ALL } } }); }

// Действия-«подготовки» записей (Journal.ext), одинаковые при записи и проверке:
//   10 — Корнематка: герои у арены с двойным прыжком; 11 — выдать двойной прыжок (как подобранный предмет); 20 (x, y) — перенос героя в точку (бегун застрял), обнуляет скорость
const EXT_SRC = `(() => {
  Journal.ext = {
    10: (sc) => { const tr = sc.L.boss.trigger; sc.abil = { double: true, ledge: false, glide: false, ...sc.abil };
      sc.players.forEach((p, i) => { p.x = (tr + 1) * 32 + i * 20; p.y = (sc.L.boss.y + 1) * 32 - 26; p.vx = p.vy = 0; p.safeX = p.x; p.safeY = p.y; });
      sc.respawn = { x: (tr - 1) * 32, y: (sc.L.boss.y + 1) * 32 }; },
    11: (sc) => { sc.abil = { ...sc.abil, double: true }; },
    12: (sc) => { sc.beads += 70; },
    20: (sc, x, y) => { const p = sc.players[0]; p.x = x; p.y = y; p.vx = p.vy = 0; p.safeX = x; p.safeY = y; },
  };
})()`;

// ----- запись: внутри страницы -----
// kind: 'boss' — арена (или Корнематка из истории) ботом; 'road' — коридор главы бегуном до выхода; 'chapter1' — глава I: бегун до арены, бой ботом, выход
async function recordInPage(scn) {
  const g = window.__game;
  g.loop.stop(); g.scene.stop('menu');
  Snd.play = () => { }; Music.play = () => { };
  const camp = (ch) => ({ ch, st: 'road', beads: 0, abil: { double: true }, up: { hp: 0, dmg: 0, silk: 0 }, time: 0, deaths: 0 });
  Journal.startMem({ name: scn.name, expect: scn.expect, skill: scn.skill });
  if (scn.loadout) localStorage.setItem('tt_loadout', JSON.stringify(scn.loadout)); else localStorage.removeItem('tt_loadout');
  let data;
  if (scn.kind === 'ui') data = scn.ch ? { players: 1, mode: 'story', camp: camp(scn.ch), seed: scn.seed } : { players: 1, mode: 'story', seed: scn.seed };
  else if (scn.kind === 'fuzz') {
    const m = /^road(\d)$/.exec(scn.boss);
    if (m) data = { players: 1, mode: 'story', camp: camp(+m[1]), seed: scn.seed };
    else if (scn.boss === 'korne' || scn.boss === 'level') data = { players: scn.players || 1, mode: 'story', seed: scn.seed };
    else data = { players: scn.players || 1, mode: 'bosstest', boss: scn.boss, seed: scn.seed };
  } else if (scn.kind === 'road') data = { players: 1, mode: 'story', camp: camp(scn.ch), seed: scn.seed };
  else if (scn.kind === 'rush') data = Speedrun.begin('boss', null, { seed: scn.seed });
  else if (scn.kind === 'chapter1' || scn.boss === 'korne') data = { players: scn.players || 1, mode: 'story', seed: scn.seed };
  else data = { players: scn.players || 1, mode: 'bosstest', boss: scn.boss, seed: scn.seed };
  g.scene.start('game', data);
  let sc;
  for (let boot = 0; boot < 400; boot++) { g.step(boot * 16.667, 16.667); sc = g.scene.getScene('game'); if (sc && sc.players && sc.ui() && sc.ui().ready && sc.jr) break; }
  if (!sc || !sc.players) return { error: 'сцена не запустилась' };
  if (sc.seed !== scn.seed) return { error: 'зерно не принято' };
  sc.render = () => { }; sc.updateCamera = () => { }; sc.togglePause = () => { };
  sc.cameras.main.fadeIn = () => { }; sc.cameras.main.fadeOut = () => { };
  for (let i = 0; i < 30; i++) g.step((400 + i) * 16.667, 16.667); // пара десятков тиков после появления сцены, как в живой игре
  const ext = (id, x, y) => { Journal.act(sc, 'ex', id, x, y); Journal.ext[id](sc, x, y); };
  const mkBrains = () => sc.players.map((p, i) => new window.BotBrain(sc, i, scn.skill, scn.seed * 31 + i * 7 + 1));
  let brains = null, runner = null, fight = scn.kind === 'boss';
  if (scn.boss === 'korne' && (scn.kind === 'boss' || scn.kind === 'fuzz')) ext(10);
  if (scn.kind === 'fuzz' && (scn.boss === 'level' || /^road/.test(scn.boss))) ext(11);
  if (fight) brains = mkBrains();
  // фаззер ввода: у каждой кнопки своя «плотность» и средняя длина нажатия (двухсостояний марковская цепь), направление чаще к боссу
  // сценарий «интерфейс»: скамья (меню), лавка, покупки, карта и телепорт, подбор предмета; действия идут через журналируемые вызовы (acts)
  let uiStep = null;
  if (scn.kind === 'ui') {
    const b0 = sc.benches[0], b1 = sc.benches[1] || sc.benches[0], at = (b) => [b.x - 7, b.y - 26], P0 = sc.players[0];
    let up = -1, right = -1;
    const S = {
      6: () => { if (scn.item) ext(20, 1929, 383); },
      30: () => ext(12),
      32: () => ext(20, ...at(b0)),
      36: () => { up = 39; },
      50: () => { sc.benchClose(true); sc.benchRest(P0, b0, true); Campaign.openShop(sc, P0); },
      54: () => Campaign.buy(sc, 'hp'), 56: () => Campaign.buy(sc, 'dmg'), 58: () => Campaign.buy(sc, 'silk'), 60: () => Campaign.buy(sc, 'hp'), 62: () => Campaign.buy(sc, 'hp'), 64: () => Campaign.buy(sc, 'hp'),
      70: () => Campaign.closeShop(sc),
      80: () => { right = 100; },
      110: () => ext(20, ...at(b1)),
      114: () => { up = 117; },
      130: () => { sc.benchClose(true); sc.benchRest(P0, b1, true); },
      140: () => MapTravel.show(sc),
      145: () => MapTravel.move(sc, -1),
      150: () => MapTravel.go(sc),
      240: () => ext(20, ...at(b1)),
      244: () => { up = 247; },
      260: () => { sc.benchClose(); },
    };
    uiStep = (f) => { if (S[f]) S[f](); return { up: f <= up && f >= up - 3, right: f <= right }; };
  }
  let fz = null;
  if (scn.kind === 'fuzz') {
    const R = mulberry32((scn.seed * 2654435761) >>> 0), st = sc.players.map(() => ({ dir: 0, dirT: 0, on: {} }));
    const BTN = { jump: [0.3, 28], atk: [0.4, 14], dash: [0.06, 6], heal: [0.12, 24], bomb: [0.05, 6], tool: [0.1, 8], up: [0.16, 18], down: [0.1, 18] };
    fz = (i) => {
      const s = st[i], p = sc.players[i], b = sc.testBoss() || sc.boss;
      if (--s.dirT <= 0) { s.dirT = 6 + Math.floor(R() * 40); const toward = b && b.state !== 'gone' && R() < 0.65 ? Math.sign(b.x + b.w / 2 - (p.x + 7)) : (R() < 0.5 ? -1 : 1); s.dir = R() < 0.12 ? 0 : toward; }
      const out = { left: s.dir < 0, right: s.dir > 0, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false };
      for (const k in BTN) { const [duty, hold] = BTN[k], was = !!s.on[k], pOff = 1 / hold, pOn = (duty * pOff) / (1 - duty); const on = was ? !(R() < pOff) : R() < pOn; s.on[k] = on; out[k] = on; }
      return out;
    };
  }
  const tileOf = (x, y) => ({ x: Math.floor(x / 32), y: Math.floor(y / 32) });
  const exitTile = () => ({ x: sc.L.exit.x, y: sc.L.exit.y });
  if (scn.kind === 'road') runner = new window.TTRunner(sc, exitTile());
  if (scn.kind === 'chapter1') ext(11);
  if (scn.kind === 'chapter1') runner = new window.TTRunner(sc, { x: sc.L.boss.trigger + 2, y: sc.L.boss.y }, { stuck: scn.stuck || 300 });
  sc._bots = []; sc.rawInput = (i) => sc._bots[i] || {};
  const boss = () => (scn.boss === 'korne' || scn.kind === 'chapter1' ? sc.boss : sc.testBoss());
  let frame = 0, tail = -1, result = null, deadAt = -1, phase = 'run', phaseAt = 0, curSeed = sc.seed, lastTick = 0;
  if (scn.kind === 'rush') { brains = mkBrains(); }
  for (; frame < scn.max; frame++) {
    const p0 = sc.players[0];
    if (fz) for (let i = 0; i < sc.players.length; i++) sc._bots[i] = fz(i);
    if (uiStep) sc._bots[0] = uiStep(frame);
    if (runner && phase === 'run') {
      if (scn.kind === 'chapter1' && sc.boss && !['sleep', 'dead', 'gone'].includes(sc.boss.state)) { phase = 'fight'; phaseAt = frame; brains = mkBrains(); }
      else sc._bots[0] = runner.act(frame, ext);
    }
    if ((phase === 'fight' || fight) && scn.kind !== 'rush') { for (let i = 0; i < brains.length; i++) sc._bots[i] = brains[i].act(frame); }
    if (scn.kind === 'chapter1' && phase === 'fight' && sc.boss.state === 'dead' && deadAt < 0) { deadAt = frame; phase = 'exit'; runner = new window.TTRunner(sc, exitTile(), { stuck: 300 }); }
    if (phase === 'exit' && runner) sc._bots[0] = runner.act(frame, ext);
    if (scn.kind === 'rush') { // смена сцен между боссами: ведём через g.step, перебираем героев заново на каждой арене
      if (sc.seed !== curSeed || sc.tickN < lastTick) { curSeed = sc.seed; brains = mkBrains(); }
      lastTick = sc.tickN; if (sc.sys.isActive() && sc.players) for (let i = 0; i < brains.length; i++) sc._bots[i] = brains[i].act(frame);
      g.step(frame * 16.667, 16.667);
    } else sc.update(frame * 16.667, 16.667);
    if (tail < 0) {
      if (scn.kind === 'fuzz' || scn.kind === 'ui') { if (frame >= scn.max - 1) { tail = 1; result = scn.expect; } }
      else if (scn.kind === 'rush') { const r = Speedrun.run; if (r && r.done) { tail = 60; result = 'win'; } else if (!r) { return { error: 'забег прерван' }; } }
      else if (scn.kind === 'road') { if (sc.leaving) { tail = 25; result = 'win'; } }
      else if (scn.kind === 'chapter1') { if (sc.won) { tail = 60; result = 'win'; } else if (frame - phaseAt > 9000 && phase === 'fight') { return { error: 'бой слишком долгий' }; } }
      else {
        const b = boss();
        if (deadAt < 0 && b && b.state === 'dead') deadAt = frame;
        if (sc.won || (deadAt >= 0 && frame - deadAt > 400)) { tail = 40; result = 'win'; }
        else if (sc.wiping && deadAt < 0) { tail = 140; result = 'lose'; }
      }
    } else if (--tail <= 0) break;
  }
  if (!result) return { error: 'не закончилось за ' + scn.max + ' кадров', frame, x: sc.players[0].x, k: runner && runner.k, n: runner && runner.path.length, tele: runner && runner.tele };
  const out = Journal.outcome(sc);
  const J = JSON.parse(JSON.stringify(Journal.J));
  return { result, outcome: out, journal: J, frames: frame, tele: runner ? runner.tele : 0 };
}

// ----- проверка: внутри страницы -----
function verifyInPage(rec) {
  return new Promise((resolve) => {
    Snd.play = () => { }; Music.play = () => { };
    const t0 = performance.now();
    setTimeout(() => resolve({ ok: false, why: 'таймаут' }), 180000);
    if (rec.loadout) localStorage.setItem('tt_loadout', JSON.stringify(rec.loadout)); else localStorage.removeItem('tt_loadout');
    Journal.restoreMem(JSON.parse(JSON.stringify(rec.journal)), { budget: 300, onDone: (gs) => resolve({ ok: true, outcome: Journal.outcome(gs), ms: Math.round(performance.now() - t0) }), onFail: (why) => resolve({ ok: false, why }) });
  });
}

async function openPage(browser, needBrain) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('file://' + html);
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive(), null, { timeout: 30000 });
  await page.evaluate(EXT_SRC);
  if (needBrain) { await page.addScriptTag({ content: brainSrc }); await page.addScriptTag({ content: runnerSrc }); }
  return page;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const diff = (a, b, p) => { p = p || ''; const out = []; if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) { if (a !== b) out.push(`${p}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); return out; } for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...diff(a[k], b[k], p + '/' + k)); return out; };

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  let fails = 0;
  const pick = (all) => (names.length ? all.filter((s) => names.includes(s.name)) : all);
  if (cmd === 'record') {
    const ver = fs.readFileSync(html, 'utf8').match(/GAME_VERSION = '([^']+)'/)[1];
    for (const scn of pick(SCENARIOS)) {
      let rec = null;
      for (const seed of process.env.GOLDEN_SEEDS ? process.env.GOLDEN_SEEDS.split(',').map(Number) : (scn.seeds || [scn.seed])) {
        const page = await openPage(browser, true);
        const t0 = Date.now();
        const r = await page.evaluate(`(${recordInPage.toString()})(${JSON.stringify({ ...scn, seed })})`).catch((e) => ({ error: String(e.message).slice(0, 200) }));
        await page.close();
        if (r.error) { console.log(`  ${scn.name} зерно ${seed}: ${r.error}`, JSON.stringify({ ...r, error: undefined })); continue; }
        console.log(`  ${scn.name} зерно ${seed}: ${r.result} за ${r.frames} кадров, переносов бегуна ${r.tele || 0} (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
        if (r.result === scn.expect) { rec = { name: scn.name, kind: scn.kind, version: ver, seed, expect: r.outcome, journal: r.journal, ...(scn.loadout ? { loadout: scn.loadout } : {}) }; break; }
      }
      if (!rec) { fails++; console.log(`ПРОВАЛ ${scn.name}: не удалось получить исход «${scn.expect}»`); continue; }
      const file = path.join(outDir, scn.name + '.json'); fs.writeFileSync(file, JSON.stringify(rec));
      console.log(`ок    ${scn.name}: ${rec.expect.tick} тиков, ${(fs.statSync(file).size / 1024).toFixed(0)} КБ`);
    }
  } else {
    const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => !names.length || names.includes(n));
    if (!files.length) { console.log('нет записей в', outDir); process.exit(1); }
    for (const n of files) {
      const rec = JSON.parse(fs.readFileSync(path.join(outDir, n + '.json'), 'utf8'));
      if (rec.kind === 'race') continue; // гонку проверяет tools/golden-race.js
      const page = await openPage(browser, false);
      const r = await page.evaluate(`(${verifyInPage.toString()})(${JSON.stringify(rec)})`).catch((e) => ({ ok: false, why: String(e.message).slice(0, 200) }));
      await page.close();
      if (!r.ok) { fails++; console.log(`ПРОВАЛ ${n}: ${r.why}`); continue; }
      if (same(r.outcome, rec.expect)) console.log(`ок    ${n}: исход совпал (${rec.expect.tick} тиков, ${r.ms} мс)`);
      else { fails++; console.log(`ПРОВАЛ ${n}: исход отличается`); for (const d of diff(rec.expect, r.outcome).slice(0, 8)) console.log('   ', d); }
    }
  }
  await browser.close();
  console.log('провалов:', fails); process.exit(fails ? 1 : 0);
})();
