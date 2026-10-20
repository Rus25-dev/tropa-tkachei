// ИИ-тестер боссов: запускает игру без экрана, играет ботом и печатает статистику.
//   node tools/bot.js <misha|vladik|tima|korne> [боёв=5] [мастерство=0.6] [--players=2] [--v]
//   node tools/bot.js table [боёв=5] [--players=2] [--par=4] [--levels=0.3,0.6,0.95] [--korne]   — таблица: 3 босса × 3 уровня мастерства (+ Корнематка из истории)
// Бой идёт с одной жизнью: оборвалась нить — поражение. Время считается от конца вступления босса.
// Нужны: phaser@3.90.0 и playwright-core (путь в NODE_PATH) и Chromium (PLAYWRIGHT_BROWSERS_PATH или CHROME).
// Мозг бота — tools/botbrain.js (предсказание снарядов, поиск безопасного пути, отбив, всполох, казнь, бомбы Миши, вид сверху).
// Параметры: --html=путь (другая сборка), --max=секунд (лимит боя, по умолчанию 240), --seed=число (зерно и мозга бота, и ГСЧ игры: прогон воспроизводим).
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2), pos = argv.filter((a) => !a.startsWith('--')), flag = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
const verbose = argv.includes('--v');
const mode = pos[0] || 'vladik', runs = +(pos[1] || 5), skillArg = +(pos[2] || 0.6);
const players = +flag('players', 1), par = +flag('par', Math.max(1, Math.min(os.cpus().length, 6))), maxSec = +flag('max', 240), seed0 = +flag('seed', Date.now() % 100000);
const levels = flag('levels', '0.3,0.6,0.95').split(',').map(Number);
const html = path.resolve(flag('html', path.join(__dirname, '../index.html')));
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const brainSrc = fs.readFileSync(path.join(__dirname, 'botbrain.js'), 'utf8');

// Один бой внутри страницы: прокручивает игру вручную кадр за кадром (без отрисовки), пока не победа/поражение/лимит.
async function fightInPage({ boss, skill, players, seed, maxSec, trace }) {
  const g = window.__game;
  g.scene.stop('menu');
  g.scene.start('game', boss === 'korne' ? { players, mode: 'story', seed } : { players, mode: 'bosstest', boss, seed }); // seed — зерно ГСЧ игры: тот же --seed даёт тот же бой
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let sc;
  for (let i = 0; i < 200; i++) { await sleep(50); sc = g.scene.getScene('game'); if (sc && sc.players && sc.boss && sc.ui() && sc.ui().ready) break; }
  await sleep(300);
  g.loop.stop();
  Snd.play = () => { }; Music.play = () => { };
  sc.render = () => { }; sc.updateCamera = () => { };
  sc.cameras.main.fadeIn = () => { }; sc.cameras.main.fadeOut = () => { }; sc.togglePause = () => { };
  const brains = sc.players.map((p, i) => new window.BotBrain(sc, i, skill, seed * 31 + i * 7 + 1)); brains.forEach((b) => { b.trace = !!trace; });
  sc._bots = []; sc.rawInput = (i) => sc._bots[i] || {};
  const cnt = { dmg: 0, parry: 0, pdodge: 0, hurt: {}, stag: 0, exec: 0 };
  const oh = sc.hurtPlayer.bind(sc);
  sc.hurtPlayer = (p, dmg, srcX, spike) => {
    const ok = p.inv <= 0 && !p.downed;
    if (ok && spike !== true && p.parryT <= 0 && p.dashT > 0) cnt.pdodge++;
    if (ok && !spike && p.parryT <= 0 && p.dashT <= 0) {
      let cause = 'other'; const pr = { x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 4 };
      const hit = (r) => pr.x < r.x + r.w && pr.x + pr.w > r.x && pr.y < r.y + r.h && pr.y + pr.h > r.y;
      for (const q of sc.projs) if (!q.dead && !(q.delay > 0) && hit(q)) { cause = q.kind; break; }
      const bb = sc.testBoss() || sc.boss;
      if (cause === 'other' && bb && hit({ x: bb.x + 8, y: bb.y + 8, w: bb.w - 16, h: bb.h - 16 })) cause = 'тело:' + bb.state;
      if (cause === 'other' && sc.curtains && sc.curtains.some((c) => c.slime > 0 && hit(sc.curtainHazard(c)))) cause = 'штора';
      cnt.hurt[cause] = (cnt.hurt[cause] || 0) + 1;
      if (trace) { const bb2 = sc.testBoss() || sc.boss; L('УРОН ' + cause + ' p=(' + Math.round(p.x) + ',' + Math.round(p.y) + ') v=(' + Math.round(p.vx) + ',' + Math.round(p.vy) + ') dashCd=' + p.dashCd.toFixed(2) + ' canDash=' + p.canDash + ' boss=(' + Math.round(bb2.x) + ',' + Math.round(bb2.y) + ') bv=' + Math.round(bb2.vx) + ' t=' + (bb2.t || 0).toFixed(2)); }
    }
    const h0 = p.hp; oh(p, dmg, srcX, spike); if (p.hp < h0) cnt.dmg += h0 - p.hp;
  };
  const op = sc.parrySuccess.bind(sc); sc.parrySuccess = (p, x) => { cnt.parry++; op(p, x); };
  if (sc.execBoss) { const oe = sc.execBoss.bind(sc); sc.execBoss = (...a) => { cnt.exec++; return oe(...a); }; }
  const log = [];
  const L = (m) => log.push((frame / 60).toFixed(1) + 'с ' + m);
  if (sc.tdBegin) { const ob = sc.tdBegin.bind(sc), oe = sc.tdEnd.bind(sc); sc.tdBegin = (f) => { L('вид сверху: начало'); ob(f); }; sc.tdEnd = (ok, f) => { L('вид сверху: конец, успех=' + ok + ', блоков ' + (sc.td && sc.td.blocks)); oe(ok, f); }; }
  if (sc.mishaBagHit) { const om = sc.mishaBagHit.bind(sc); sc.mishaBagHit = (pr) => { L('попадание в рюкзак, hp=' + (sc.misha.hp - 1)); om(pr); }; }
  const getBoss = () => (boss === 'korne' ? sc.boss : sc.testBoss());
  if (boss === 'korne') {
    // история: переносим героев к арене Корнематки и даём способности
    const tr = sc.L.boss.trigger;
    sc.abil = { double: true, ledge: false, glide: false, ...sc.abil }; // бот не знает про хват и планер: его модель физики без них
    sc.players.forEach((p, i) => { p.x = (tr + 1) * 32 + i * 20; p.y = (sc.L.boss.y + 1) * 32 - 26; p.vx = p.vy = 0; p.safeX = p.x; p.safeY = p.y; });
    sc.respawn = { x: (tr - 1) * 32, y: (sc.L.boss.y + 1) * 32 };
  }
  var frame = 0; let started = -1, lastStag = 0, fightFrames = 0;
  const res = (won, extra) => {
    const b = getBoss();
    return Object.assign({ won, sec: fightFrames / 60, dmg: cnt.dmg, parry: cnt.parry, pdodge: cnt.pdodge, hurt: cnt.hurt, stag: cnt.stag, exec: cnt.exec,
      bossFrac: b ? Math.max(0, b.hp) / b.maxHp : 1, phase: b ? b.phase || 1 : 1, bombs: brains.reduce((a, x) => a + x.stats.bombs, 0), log }, extra || {});
  };
  while (true) {
    const b = getBoss();
    if (started < 0 && b && !['intro', 'sleep', 'roar'].includes(b.state)) started = frame;
    for (let i = 0; i < brains.length; i++) sc._bots[i] = brains[i].act(frame);
    if (trace && frame % trace === 0) L(brains[0].dbg || '');
    if (trace && trace < 100 && brains[0].dbg2) { L(brains[0].dbg2); L('   ' + brains[0].dbg3); brains[0].dbg2 = null; }
    sc.update(frame * 16.667, 16.667); frame++;
    if (started >= 0) fightFrames = frame - started;
    if (b && (b.stagger || 0) > 0 && !lastStag) cnt.stag++; lastStag = (b && b.stagger > 0) ? 1 : 0;
    if (sc.wiping) { const q = sc.players[0]; L('конец: p=(' + Math.round(q.x) + ',' + Math.round(q.y) + ') hp=' + q.hp + ' босс=' + (b && b.state)); return res(false, { died: true }); }
    if (b && ['dead', 'gone'].includes(b.state) && started >= 0) return res(true);
    if (fightFrames > maxSec * 60) return res(false, { timeout: true });
    if (frame > (maxSec + 30) * 60) return res(false, { timeout: true });
  }
}

async function runJob(browser, job) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes('phaser')) return route.fulfill({ contentType: 'application/javascript', body: phaserSrc });
    if (u.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
  await page.goto('file://' + html);
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive(), null, { timeout: 30000 });
  await page.addScriptTag({ content: brainSrc });
  let out;
  try { out = await page.evaluate(`(${fightInPage.toString()})(${JSON.stringify(job)})`); }
  catch (e) { out = { won: false, error: String(e.message).slice(0, 300) }; console.log('ERR', job.boss, job.skill, e.message.slice(0, 300)); }
  out.errs = errs.length;
  await page.close();
  return out;
}

async function pool(browser, jobs, n, onDone) {
  let next = 0; const results = new Array(jobs.length);
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; results[i] = await runJob(browser, jobs[i]); onDone && onDone(jobs[i], results[i]); }
  }));
  return results;
}
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sumHurt = (rs) => { const o = {}; for (const r of rs) for (const k in r.hurt || {}) o[k] = (o[k] || 0) + r.hurt[k]; return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '); };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const bosses = ['misha', 'vladik', 'tima'].concat(argv.includes('--korne') ? ['korne'] : []);
  const names = { misha: 'Миша', vladik: 'Владик', tima: 'Тима', korne: 'Корнематка' };
  if (mode === 'table') {
    const jobs = [];
    for (const b of bosses) for (const s of levels) for (let r = 0; r < runs; r++) jobs.push({ boss: b, skill: s, players, seed: seed0 + r * 13 + Math.round(s * 100), maxSec });
    const t0 = Date.now(); let done = 0;
    const rs = await pool(browser, jobs, par, (j, r) => { done++; if (verbose) console.log(`[${done}/${jobs.length}] ${j.boss} ${j.skill}: ${r.won ? 'победа' : 'поражение'} ${(r.sec || 0).toFixed(0)} c, урон ${r.dmg}`); });
    console.log(`\nТаблица ботов: боёв на ячейку ${runs}, игроков ${players}, время ${((Date.now() - t0) / 1000).toFixed(0)} c\n`);
    console.log('| Босс | Мастерство | Победы | Побед % | Время боя, с (все/победы) | Урон | Оглушений | Казней | Отбивов | Идеальных уворотов | Остаток HP босса при поражении |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const b of bosses) for (const s of levels) {
      const r = rs.filter((x, i) => jobs[i].boss === b && jobs[i].skill === s), w = r.filter((x) => x.won);
      const lost = r.filter((x) => !x.won);
      console.log(`| ${names[b]} | ${s} | ${w.length}/${r.length} | ${Math.round(100 * w.length / r.length)}% | ${avg(r.map((x) => x.sec)).toFixed(0)} / ${w.length ? avg(w.map((x) => x.sec)).toFixed(0) : '-'} | ${avg(r.map((x) => x.dmg)).toFixed(1)} | ${avg(r.map((x) => x.stag)).toFixed(1)} | ${avg(r.map((x) => x.exec)).toFixed(1)} | ${avg(r.map((x) => x.parry)).toFixed(1)} | ${avg(r.map((x) => x.pdodge)).toFixed(1)} | ${lost.length ? Math.round(100 * avg(lost.map((x) => x.bossFrac))) + '%' : '-'} |`);
    }
    if (verbose) for (const b of bosses) for (const s of levels) console.log(`  причины урона ${names[b]} ${s}: ${sumHurt(rs.filter((x, i) => jobs[i].boss === b && jobs[i].skill === s))}`);
  } else {
    const jobs = Array.from({ length: runs }, (_, r) => ({ boss: mode, skill: skillArg, players, seed: seed0 + r * 13, maxSec, trace: +flag('trace', 0) }));
    const rs = await pool(browser, jobs, par, (j, r) => console.log(`${r.error ? 'ОШИБКА ' + r.error : (r.won ? 'победа' : 'поражение') + ' ' + (r.sec || 0).toFixed(1) + ' c, урон ' + r.dmg + ', оглушений ' + r.stag + ', казней ' + r.exec + ', отбивов ' + r.parry + ', уворотов ' + r.pdodge + ', HP босса ' + Math.round(100 * r.bossFrac) + '%, фаза ' + r.phase}${verbose ? ' | ' + Object.entries(r.hurt || {}).map(([k, v]) => k + ':' + v).join(' ') + (r.log && flag('log') ? '\n   ' + r.log.join('\n   ') : '') : ''}`));
    const w = rs.filter((x) => x.won);
    console.log(`\n${names[mode] || mode} (мастерство ${skillArg}, игроков ${players}): побед ${w.length}/${runs}, среднее время ${avg(rs.map((x) => x.sec)).toFixed(1)} c, урон ${avg(rs.map((x) => x.dmg)).toFixed(1)}; причины урона: ${sumHurt(rs)}`);
  }
  await browser.close();
})();
