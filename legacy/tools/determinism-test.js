// Тест детерминизма (v1.7, Б1): одно зерно игры + один записанный ввод = один и тот же исход.
//   NODE_PATH=... node tools/determinism-test.js [кадров=4000] [--only=story,misha,vladik,tima,korne]
// Для каждого сценария (история — первые N кадров; loot — история с охотой на врагов, Корнематка, Миша, Владик, Тима) делаем три прогона, каждый в новой странице:
//   A1 и A2 — зерно A, одинаковый ввод → журнал должен совпасть побитово;
//   B       — зерно B, тот же ввод      → журнал должен отличаться.
// Ввод — псевдослучайный скрипт по своему зерну (не зависит от состояния игры), подаётся через sc.rawInput, как в smoke.js.
// Журнал: хэш всех кадров (герои, босс, враги, снаряды, бусины) + исход: кадр конца (смерть/победа), HP босса, число бусин, последовательность состояний босса.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2), pos = argv.filter((a) => !a.startsWith('--'));
const N = +(pos[0] || 4000);
const onlyArg = argv.find((a) => a.startsWith('--only='));
const scenarios = (onlyArg ? onlyArg.slice(7).split(',') : ['story', 'loot', 'korne', 'misha', 'vladik', 'tima']);
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const SEED_A = 123456789, SEED_B = 987654321, INPUT_SEED = 4242;

// выполняется внутри страницы
async function runInPage({ scen, seed, inputSeed, N }) {
  const g = window.__game;
  // реальный цикл Phaser останавливаем ДО старта сцены и крутим кадры вручную: иначе число кадров, прошедших до остановки, зависит от скорости страницы
  g.loop.stop();
  g.scene.stop('menu');
  g.scene.start('game', scen === 'story' || scen === 'korne' || scen === 'loot' ? { players: 1, mode: 'story', seed } : { players: 1, mode: 'bosstest', boss: scen, seed });
  let sc, boot = 0;
  for (; boot < 400; boot++) { g.step(boot * 16.667, 16.667); sc = g.scene.getScene('game'); if (sc && sc.players && sc.ui() && sc.ui().ready) break; }
  if (!sc || !sc.players) return { error: 'сцена не запустилась' };
  Snd.play = () => { }; Music.play = () => { };
  sc.togglePause = () => { };
  if (sc.seed !== seed) return { error: 'seed не принят: ' + sc.seed };
  // записанный ввод: функция только от кадра и зерна ввода
  let s = inputSeed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const script = []; let cur = {};
  for (let f = 0; f < N; f++) {
    if (f % 9 === 0) cur = { left: rnd() < 0.4, right: rnd() < 0.55, jump: rnd() < 0.3, atk: rnd() < 0.45, dash: rnd() < 0.12, heal: rnd() < 0.03, up: rnd() < 0.15, down: rnd() < 0.05, bomb: rnd() < 0.08 };
    script.push(cur);
  }
  sc._i = {}; sc.rawInput = () => sc._i;
  const p0 = sc.players[0];
  p0.maxHp = p0.hp = 60; // чтобы бой шёл дольше
  if (scen === 'korne') {
    const tr = sc.L.boss.trigger;
    sc.abil = { double: true, ledge: false, glide: false, ...sc.abil };
    p0.x = (tr + 1) * 32; p0.y = (sc.L.boss.y + 1) * 32 - 26; p0.vx = p0.vy = 0; p0.safeX = p0.x; p0.safeY = p0.y;
    sc.respawn = { x: (tr - 1) * 32, y: (sc.L.boss.y + 1) * 32 };
  }
  const getBoss = () => (scen === 'story' || scen === 'korne' || scen === 'loot' ? sc.boss : sc.testBoss());
  let h = 2166136261 >>> 0;
  const mix = (str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  const num = (x) => (typeof x === 'number' ? String(x) : String(x));
  const bossSeq = []; let lastSt = null, end = null, frame = 0;
  for (; frame < N; frame++) {
    sc._i = script[frame];
    if (scen === 'loot' && frame % 150 === 0) { // охота на врагов: подводим героя к ближайшему живому, чтобы проверить выпадение бусин и поведение врагов
      let best = null, bd = 1e9; for (const e of sc.enemies) if (!e.dead) { const d = Math.abs(e.x - p0.x) + Math.abs(e.y - p0.y); if (d < bd) { bd = d; best = e; } }
      if (best) { p0.x = best.x - 24; p0.y = best.y; p0.vx = p0.vy = 0; }
    }
    if (scen === 'loot' && frame % 3 === 0) sc._i = { ...sc._i, atk: true };
    if (scen === 'loot') p0.hp = 60;
    if (frame === 3000 && scen !== 'story' && scen !== 'loot') { const wb = getBoss(); if (wb && wb.hp > 3) wb.hp = 3; } // добиваем босса к концу прогона: проверяем победу и бусины
    sc.update(frame * 16.667, 16.667);
    const b = getBoss();
    let line = frame + '|';
    for (const p of sc.players) line += num(p.x) + ',' + num(p.y) + ',' + num(p.vx) + ',' + num(p.vy) + ',' + p.hp + ',' + p.inv.toFixed(3) + ';';
    if (b) {
      line += 'B' + b.state + ',' + num(b.x) + ',' + num(b.y) + ',' + b.hp + ',' + (b.phase || 1) + ',' + num(b.t) + ';';
      if (b.state !== lastSt) { bossSeq.push(frame + ':' + b.state); lastSt = b.state; }
    }
    let ne = 0; for (const e of sc.enemies) { if (e.dead) continue; ne++; line += e.type[0] + num(e.x) + ',' + num(e.y) + ',' + e.hp + (e.state ? e.state[0] : '') + ';'; }
    line += 'n' + ne + 'p' + sc.projs.length + 'b' + sc.beadsArr.length + 'c' + sc.beads;
    for (const q of sc.projs) line += q.kind[0] + Math.round(q.x) + ',' + Math.round(q.y) + ';';
    mix(line);
    if (sc.wiping || sc.won || (b && ['dead', 'gone'].includes(b.state))) { end = { frame, why: sc.wiping ? 'смерть' : (sc.won || (b && ['dead', 'gone'].includes(b.state))) ? 'победа' : '?' }; mix('END'); break; }
  }
  const b = getBoss();
  return { hash: (h >>> 0).toString(16), end, frames: frame, bossHp: b ? b.hp : null, beads: sc.beads, drops: sc.beadsArr.length, seq: bossSeq.join(' '), px: sc.players[0].x, py: sc.players[0].y };
}

async function oneRun(browser, job) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERROR', e.message); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
  const out = await page.evaluate(`(${runInPage.toString()})(${JSON.stringify(job)})`);
  out.errs = errs.length;
  await page.close();
  return out;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  let bad = 0;
  const fail = (m) => { bad++; console.log('ПРОВАЛ', m); };
  for (const scen of scenarios) {
    const job = (seed) => ({ scen, seed, inputSeed: INPUT_SEED, N });
    const [a1, a2, b] = [await oneRun(browser, job(SEED_A)), await oneRun(browser, job(SEED_A)), await oneRun(browser, job(SEED_B))];
    for (const r of [a1, a2, b]) if (r.error) fail(`${scen}: ${r.error}`);
    if (a1.error || a2.error || b.error) continue;
    const j = (r) => JSON.stringify(r);
    const same = j(a1) === j(a2), differ = a1.hash !== b.hash;
    console.log(`${scen}: зерно A: хэш ${a1.hash}, кадров ${a1.frames}, конец ${a1.end ? a1.end.why + '@' + a1.end.frame : 'нет'}, HP босса ${a1.bossHp}, бусин ${a1.beads}+${a1.drops}, состояний босса ${a1.seq ? a1.seq.split(' ').length : 0}; повтор ${same ? 'совпал' : 'РАЗОШЁЛСЯ'}; зерно B: хэш ${b.hash} ${differ ? '(отличается)' : '(СОВПАЛ!)'}`);
    if (!same) fail(`${scen}: два прогона с одним зерном дали разный журнал\n  A1 ${j(a1).slice(0, 400)}\n  A2 ${j(a2).slice(0, 400)}`);
    if (!differ) fail(`${scen}: разные зёрна дали одинаковый журнал`);
    if (a1.errs || a2.errs || b.errs) fail(`${scen}: ошибки страницы`);
  }
  await browser.close();
  console.log(bad ? `провалов: ${bad}` : 'детерминизм: всё в порядке');
  process.exit(bad ? 1 : 0);
})();
