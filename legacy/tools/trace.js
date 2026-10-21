// Трасса состояния v1.8 по тикам: инструмент отладки переноса ядра на v2 (docs/V2_PLAN.md).
//   node tools/trace.js <имя записи…> [--dir=../tests/golden] [--out=../tests/trace]
// Воспроизводит золотую запись на старой сборке и после каждого тика пишет короткую строку состояния (игроки, босс, враги, снаряды, бусины).
// Файл <out>/<имя>.ndjson: по строке на тик, числа без округления — ядро v2 должно совпасть побитно (tests/unit/golden.test.ts, tools/trace-diff.mjs).
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2), names = argv.filter((a) => !a.startsWith('--'));
const flag = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const dir = path.resolve(flag('dir', path.join(__dirname, '../../tests/golden'))), out = path.resolve(flag('out', path.join(__dirname, '../../tests/trace')));
const html = path.resolve(flag('html', path.join(__dirname, '../index.html')));
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');

// в странице: снимок состояния после тика
function inPage(rec) {
  return new Promise((resolve) => {
    Snd.play = () => { }; Music.play = () => { };
    const rows = [];
    const tickO = GameScene.prototype.tick;
    const r = (v) => (typeof v === 'number' ? v : v ? 1 : 0);
    GameScene.prototype.tick = function () {
      const res = tickO.call(this);
      const b = this.testBoss() || this.boss;
      rows.push([this.tickN,
        this.players.map((p) => [p.x, p.y, p.vx, p.vy, p.hp, p.silk, p.inv, r(p.downed), p.dashT, p.atkT, p.face]),
        b ? [b.x, b.y, b.hp, b.state, b.phase || 1, b.t, b.stagger || 0] : null,
        this.enemies.filter((e) => !e.dead).length, this.projs.length, this.beadsArr.length, this.beads | 0, this.deaths | 0, this.seed, r(this.bossDead), r(this.won)]);
      return res;
    };
    const t0 = performance.now();
    setTimeout(() => resolve({ ok: false, why: 'таймаут' }), 280000);
    if (rec.loadout) localStorage.setItem('tt_loadout', JSON.stringify(rec.loadout)); else localStorage.removeItem('tt_loadout');
    Journal.restoreMem(JSON.parse(JSON.stringify(rec.journal)), { budget: 300, onDone: () => { GameScene.prototype.tick = tickO; resolve({ ok: true, rows, ms: Math.round(performance.now() - t0) }); }, onFail: (why) => resolve({ ok: false, why }) });
  });
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, channel: process.env.CHROME ? undefined : 'chromium', args: ['--no-sandbox'] });
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => (!names.length || names.includes(n)) && n !== 'race-b1');
  for (const n of files) {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8'));
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    await page.goto('file://' + html);
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive(), null, { timeout: 30000 });
    await page.evaluate(`(() => { Journal.ext = {
      10: (sc) => { const tr = sc.L.boss.trigger; sc.abil = { double: true, ledge: false, glide: false, ...sc.abil };
        sc.players.forEach((p, i) => { p.x = (tr + 1) * 32 + i * 20; p.y = (sc.L.boss.y + 1) * 32 - 26; p.vx = p.vy = 0; p.safeX = p.x; p.safeY = p.y; });
        sc.respawn = { x: (tr - 1) * 32, y: (sc.L.boss.y + 1) * 32 }; },
      11: (sc) => { sc.abil = { ...sc.abil, double: true }; },
      20: (sc, x, y) => { const p = sc.players[0]; p.x = x; p.y = y; p.vx = p.vy = 0; p.safeX = x; p.safeY = y; },
    }; })()`);
    const res = await page.evaluate(`(${inPage.toString()})(${JSON.stringify(rec)})`).catch((e) => ({ ok: false, why: String(e.message).slice(0, 200) }));
    await page.close();
    if (!res.ok) { console.log(`ПРОВАЛ ${n}: ${res.why}`); continue; }
    fs.writeFileSync(path.join(out, n + '.ndjson'), res.rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`ок    ${n}: ${res.rows.length} тиков (${res.ms} мс)`);
  }
  await browser.close();
})();
