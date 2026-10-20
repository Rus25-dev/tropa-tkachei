// Золотая запись гонки «Гонки Ткачей» (race-b1): организатор + 2 игрока + обсервер на транспорте-заглушке (tools/lib-bridge.js).
//   node tools/golden-race.js record [--out=tests/golden]   полный прогон: комната, готовность, старт, отсчёт, забеги игроков (журналируемые «читы»: убийство босса и выход),
//                                                            обрыв связи игрока, перезагрузка вкладки игрока (восстановление по журналу), финиш, итог и архив
//   node tools/golden-race.js verify [--dir=tests/golden]   воспроизвести журналы обоих игроков на этой сборке и сравнить исход (IGT, сплиты, статистика, хэш)
// В файл попадают: журналы игроков (до финиша, перед Journal.clear), исход воспроизведения каждого, порядок видов событий у организатора и итог по IGT.
// Время RTA в мс зависит от настенных часов и в эталон не входит: сравниваются тики (IGT), сплиты в IGT, статистика и хэш состояния.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const { Bridge, phaserSrc } = require('./lib-bridge.js');
const argv = process.argv.slice(2), cmd = argv[0] || 'verify';
const flag = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const dir = path.resolve(flag('out', flag('dir', path.join(__dirname, '../tests/golden'))));
const INDEX = path.resolve(flag('html', path.join(__dirname, '../index.html')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (p, f, ms, arg) => { try { await p.waitForFunction(f, arg, { timeout: ms || 20000, polling: 100 }); return true; } catch (_) { return false; } };

// Действия «читы» (журналируются): 1 — довести босса до удара, 2 — перенести героя к выходу. Нужны, чтобы гонка проходилась за секунды.
const EXT_FN = `Journal.ext = {
  1: (sc) => { const p = sc.players[0]; if (sc.vladik) { sc.vladik.hp = 1; sc.vladik.state = 'idle'; sc.damageVladik(p); } else if (sc.tima) { sc.tima.hp = 1; sc.tima.state = 'idle'; sc.damageTima(p); }
    else if (sc.misha) { sc.misha.hp = 1; sc.misha.hitCd = 0; sc.misha.state = 'idle'; sc.mishaBagHit({}); } else { sc.boss.hp = 1; sc.boss.state = 'idle'; sc.damageBoss(p); } },
  2: (sc) => { const p = sc.players[0]; p.x = sc.exitR.x + 4; p.y = sc.exitR.y + 20; p.vx = p.vy = 0; },
};`;
const EXT = `(() => {
  ${EXT_FN}
  window.__advance = () => {
    const g = window.__game, sc = g.scene.getScene('game'), ui = g.scene.getScene('ui');
    if (!sc || !sc.sys.isActive() || !ui || !ui.ready || !sc.camp || sc.won || sc.leaving || sc.replaying || (Speedrun.run && (Speedrun.run.hold || Speedrun.run.tp != null))) return 'wait';
    const alive = sc.vladik ? sc.vladik.state !== 'dead' : sc.tima ? sc.tima.state !== 'dead' : sc.misha ? sc.misha.state !== 'dead' : !sc.bossDead;
    const act = (id) => { Journal.act(sc, 'ex', id); Journal.ext[id](sc); };
    if (alive && sc.camp.st !== 'road') { act(1); return 'kill'; }
    if (sc.exitR) { act(2); return 'exit'; }
    return 'wait';
  };
  // журнал до финиша: Speedrun.finish вызывает Journal.clear() и стёр бы его
  const oc = Journal.clear; Journal.clear = function () { if (Journal.J && Journal.J.cat) window.__finalJ = JSON.parse(JSON.stringify(Journal.J)); return oc.apply(this, arguments); };
})()`;
const REPLAY = (rec) => new Promise((resolve) => {
  Snd.play = () => { }; Music.play = () => { };
  EXT_PLACEHOLDER
  setTimeout(() => resolve({ ok: false, why: 'таймаут' }), 180000);
  Journal.restoreMem(rec.journal, { budget: 300, onDone: (gs) => { const r = Speedrun.run; resolve({ ok: true, outcome: Journal.outcome(gs), stats: RaceStats.pack(r && r.stats, r ? r.igt / 1000 * 60 : 0) }); }, onFail: (why) => resolve({ ok: false, why }) });
});
const replaySrc = REPLAY.toString().replace('EXT_PLACEHOLDER', EXT_FN);
async function mkPage(browser, bridge, name, ctx) {
  ctx = ctx || await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  page.on('pageerror', (e) => console.log('PAGEERROR', name, e.message));
  await bridge.attach(page, name); await page.goto('file://' + INDEX);
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive() && window.__game.scene.getScene('menu').mStack);
  await page.evaluate(() => { Snd.play = () => { }; Music.play = () => { }; });
  return page;
}

(async () => {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'race-b1.json'), browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  let fails = 0;
  if (cmd === 'record') {
    const bridge = new Bridge({ lat: 30 });
    const O = await mkPage(browser, bridge, 'ORG'), P1 = await mkPage(browser, bridge, 'P1'), P2 = await mkPage(browser, bridge, 'P2'), W = await mkPage(browser, bridge, 'W');
    for (const p of [O, P1, P2, W]) await p.evaluate(EXT);
    await O.evaluate(() => RaceOrg.create()); await until(O, () => RaceOrg.status === 'open');
    const code = await O.evaluate(() => RaceOrg.S.code);
    await P1.evaluate((c) => { RacePlay.open(c); RacePlay.join(c, 'Ива'); }, code); await P2.evaluate((c) => { RacePlay.open(c); RacePlay.join(c, 'Ярь'); }, code); await W.evaluate((c) => { RaceWatch.open(c); RaceWatch.join(c); }, code);
    await until(O, () => RaceOrg.seatList().length === 2 && RaceOrg.seatList().every((p) => p.online));
    for (const p of [P1, P2]) { await until(p, () => RacePlay.S && RacePlay.S.status === 'online' && RacePlay.S.state && !document.getElementById('rcj-ready').disabled); await p.evaluate(() => document.getElementById('rcj-ready').click()); }
    if (!await until(O, () => RaceOrg.canStart(), 15000)) throw new Error('игроки не готовы');
    await O.evaluate(() => RaceOrg.start());
    if (!await until(O, () => RaceOrg.S.phase === 'run', 40000)) throw new Error('гонка не стартовала');
    const play = async (p) => { for (let i = 0; i < 400; i++) { if (await p.evaluate(() => { const u = window.__game.scene.getScene('ui'); return !!(u && u.srShown); }).catch(() => false)) return true; await p.evaluate('window.__advance()').catch(() => { }); await sleep(300); } return false; };
    const t1 = play(P1);
    // игрок 2: играет до первого сплита, затем «падает вкладка» и восстанавливается по журналу
    for (let i = 0; i < 100 && !(await P2.evaluate(() => Speedrun.run && Speedrun.run.splits.length >= 1)); i++) { await P2.evaluate('window.__advance()'); await sleep(300); }
    // обрыв связи игрока 1 на несколько секунд
    bridge.cutPage(P1); await sleep(8000); bridge.healPage(P1);
    await sleep(2500); // журнал сохраняется раз в ~2 с
    const ctx2 = P2.context(); bridge.killPage(P2, 1200); await P2.close(); await sleep(400);
    const P2b = await mkPage(browser, bridge, 'P2b', ctx2); await P2b.evaluate(EXT);
    if (!await until(P2b, () => Speedrun.run && Speedrun.run.restored === 1 && !Journal.rp, 60000)) throw new Error('игрок 2 не восстановился');
    if (process.env.DBG) console.log('DBG после восстановления', JSON.stringify(await P2b.evaluate(() => { const J = Journal.J, r = Speedrun.run; const ticks = J.segs.reduce((a, g) => a + g.n, 0); const rel = J.segs[0].acts.find((a) => a[1] === 'rel'); return { igt: Math.round(r.igt), ticks, rel: rel && rel[0], expectIgt: Math.round((ticks - (rel ? rel[0] : 0)) * 1000 / 60), hold: r.hold, t0: r.t0, splits: r.splits.map((x) => x && x.igt) }; })));
    const [d1, d2] = await Promise.all([t1, play(P2b)]);
    if (!d1 || !d2) throw new Error('игроки не финишировали');
    await until(O, () => RaceOrg.S.phase === 'done' && RaceOrg.S.result, 30000);
    const J1 = await P1.evaluate(() => window.__finalJ), J2 = await P2b.evaluate(() => window.__finalJ);
    const res = await O.evaluate(() => ({ kinds: RaceOrg.S.events.map((e) => e.k), result: RaceOrg.S.result }));
    if (!J1 || !J2) throw new Error('нет журналов игроков');
    const players = [];
    for (const [name, J] of [['Ива', J1], ['Ярь', J2]]) {
      const pg = await mkPage(browser, new Bridge(), 'R-' + name);
      const r = await pg.evaluate(`(${replaySrc})(${JSON.stringify({ journal: J })})`); await pg.close();
      if (!r.ok) throw new Error('журнал ' + name + ' не воспроизвёлся: ' + r.why);
      players.push({ name, restored: J.restored | 0, journal: J, expect: r.outcome, stats: r.stats });
    }
    const kinds = []; for (const k of res.kinds) if (kinds[kinds.length - 1] !== k) kinds.push(k);
    const igtWinner = players[0].expect.sr.igt <= players[1].expect.sr.igt ? 'Ива' : 'Ярь';
    const out = { name: 'race-b1', kind: 'race', version: await O.evaluate(() => GAME_VERSION), seed: res.result.seed, expectOrg: { kindsCompact: kinds, hasKinds: [...new Set(res.kinds)].sort(), winnerByRta: res.result.winner, winnerByIgt: igtWinner, players: res.result.players.map((p) => ({ name: p.name, place: p.place, splits: p.splits.length, dnf: p.dnf })), restoredPlayers: players.filter((p) => p.restored).map((p) => p.name) }, players };
    fs.writeFileSync(file, JSON.stringify(out));
    console.log(`ок    race-b1: ${players.map((p) => `${p.name}: IGT ${p.expect.sr.igt} мс, тиков в последнем отрезке ${p.expect.tick}${p.restored ? ', восстановлен' : ''}`).join(' · ')}; ${(fs.statSync(file).size / 1024).toFixed(0)} КБ`);
  } else {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const pl of rec.players) {
      const pg = await mkPage(browser, new Bridge(), 'V-' + pl.name);
      const r = await pg.evaluate(`(${replaySrc})(${JSON.stringify({ journal: pl.journal })})`).catch((e) => ({ ok: false, why: String(e.message).slice(0, 160) })); await pg.close();
      if (!r.ok) { fails++; console.log(`ПРОВАЛ race-b1/${pl.name}: ${r.why}`); continue; }
      const same = JSON.stringify(r.outcome) === JSON.stringify(pl.expect) && JSON.stringify(r.stats) === JSON.stringify(pl.stats);
      if (same) console.log(`ок    race-b1/${pl.name}: исход и статистика совпали (IGT ${r.outcome.sr.igt} мс, сплиты ${r.outcome.sr.splits.join('/')})`);
      else { fails++; console.log(`ПРОВАЛ race-b1/${pl.name}: исход отличается`); console.log('   ожидали', JSON.stringify(pl.expect).slice(0, 300)); console.log('   получили', JSON.stringify(r.outcome).slice(0, 300)); }
    }
  }
  await browser.close();
  console.log('провалов:', fails); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('СБОЙ', e && e.stack || e); process.exit(2); });
