// Сравнение оружия на боссе: герой неуязвим и бьёт босса N секунд, считаем урон по здоровью босса в секунду.
//   NODE_PATH=<phaser+playwright-core> node tools/weapons_dps.js [босс: vladik|tima|both] [секунд=40] [режимы: dummy,live,charge,mech]
// dummy  — босс стоит смирно (чистая скорость урона вместе со стойкостью и оглушением);
// live   — босс дерётся как обычно, герой догоняет его (промахи, прыжки босса), среднее по трём зёрнам;
// charge — только заряженные удары (держим 0.5 с, отпускаем);
// mech   — проверки механик: воздушные цепочки, заряд, отмена рывком, отсутствие отскока у колотушки, сеть (packPlayer/onNet).
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const bossArg = process.argv[2] || 'both', SECS = +(process.argv[3] || 40), MODES = (process.argv[4] || 'dummy,live,charge,mech').split(',');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
const WEAPONS = (process.env.ONLY || 'needle,twin,sickle,mace,lance').split(',');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  let errs = 0;
  const open = async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
    page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'));
    await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
    return page;
  };
  // один бой: оружие, босс, режим, зерно → { loss, secs, stag, hits }
  const fight = async (page, weapon, boss, mode, secs, seed) => page.evaluate(({ weapon, boss, mode, secs, seed }) => new Promise((resolve) => {
    let s = seed >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    localStorage.setItem('tt_loadout', JSON.stringify({ weapon, tool: '', charms: [], have: { weapons: ['needle'], tools: [], charms: [] } }));
    const g = window.__game; g.scene.stop('menu'); g.scene.stop('game'); g.scene.start('game', { players: 1, mode: 'bosstest', boss });
    setTimeout(() => {
      const sc = g.scene.getScene('game'); Snd.play = () => {}; sc.togglePause = () => {}; g.loop.stop();
      sc.rawInput = () => sc._i || {};
      sc.render = () => { }; sc.updateCamera = () => { }; // без отрисовки — быстро
      sc.applyLoadout();
      const p = sc.players[0], b = sc[boss];
      sc.abil = { double: true, ...sc.abil };
      p.x = b.x + b.w / 2 + 70; p.y = b.y + b.h - 26; p.vx = p.vy = 0; sc.camX = p.x; sc.camY = p.y;
      const W = sc.wdef(p), boxW = W.geo ? W.geo.f[0] : 48;
      let f = 0, stag = 0, last = 0, hits = 0, lastHp = b.hp, started = -1;
      const N = secs * 60, hold = mode === 'charge';
      const tick = () => {
        for (let n = 0; n < 120 && f < N; n++, f++) {
          p.inv = 999; p.hp = 9; sc.projs = mode === 'dummy' || mode === 'charge' ? [] : sc.projs;
          if (mode === 'dummy' || mode === 'charge') { if (!(b.stagger > 0) && b.state !== 'rage') { b.state = 'idle'; b.t = 5; b.vx = 0; } }
          const dx = b.x + b.w / 2 - (p.x + 7), want = dx > 0 ? 1 : -1, stop = b.w / 2 + boxW * 0.55;
          const i = {};
          if (Math.abs(dx) > stop) i[want > 0 ? 'right' : 'left'] = true;
          else if (p.face !== want) i[want > 0 ? 'right' : 'left'] = true;
          if (hold) i.atk = !(p.chg >= 0.46); else i.atk = f % 2 === 0;
          if (mode === 'live' && !p.onGround && false) i.jump = false;
          sc._i = i;
          sc.update(f * 16.667, 16.667);
          if (started < 0 && !['intro', 'sleep'].includes(b.state)) started = f;
          if (b.stagger > 0 && !last) stag++; last = b.stagger > 0 ? 1 : 0;
          if (b.hp < lastHp) hits++; lastHp = b.hp;
          if (b.hp <= 0 || ['dead'].includes(b.state)) { resolve({ loss: b.maxHp - Math.max(0, b.hp), secs: f / 60, stag, hits, dead: true, maxHp: b.maxHp }); return; }
        }
        if (f >= N) return resolve({ loss: b.maxHp - b.hp, secs: f / 60, stag, hits, maxHp: b.maxHp });
        setTimeout(tick, 0);
      };
      tick();
    }, 900);
  }), { weapon, boss, mode, secs, seed });

  const bosses = bossArg === 'both' ? ['vladik', 'tima'] : [bossArg];
  const page = await open();
  const table = {};
  for (const mode of MODES.filter((m) => m !== 'mech')) {
    for (const boss of bosses) {
      for (const w of WEAPONS) {
        const seeds = mode === 'live' ? [11, 22, 33] : [1];
        let loss = 0, secs = 0, stag = 0, hits = 0;
        for (const sd of seeds) { const pg = await open(); const r = await fight(pg, w, boss, mode, SECS, sd); await pg.close(); loss += r.loss; secs += r.secs; stag += r.stag; hits += r.hits; }
        table[`${mode}/${boss}/${w}`] = { dps: loss / secs, stag: stag / seeds.length, hits: hits / seeds.length };
      }
      const base = (table[`${mode}/${boss}/needle`] || table[`${mode}/${boss}/${WEAPONS[0]}`]).dps;
      console.log(`\n[${mode}] ${boss}, ${SECS} с${mode === 'live' ? ' x3 зерна' : ''}`);
      for (const w of WEAPONS) { const t = table[`${mode}/${boss}/${w}`]; console.log(`  ${w.padEnd(7)} ${t.dps.toFixed(2).padStart(6)} ед/с  ${(100 * t.dps / base).toFixed(0).padStart(4)}%  оглушений ${t.stag.toFixed(1)}  попаданий ${t.hits.toFixed(0)}`); }
    }
  }
  let fails = 0;
  if (MODES.includes('mech')) {
    const res = await page.evaluate(() => new Promise((resolve) => {
      localStorage.setItem('tt_loadout', JSON.stringify({ weapon: 'needle', tool: '', charms: [], have: { weapons: ['needle'], tools: [], charms: [] } }));
      const g = window.__game; g.scene.stop('menu'); g.scene.stop('game'); g.scene.start('game', { players: 1, mode: 'bosstest', boss: 'vladik' });
      setTimeout(() => {
        const sc = g.scene.getScene('game'); Snd.play = () => {}; sc.togglePause = () => {}; g.loop.stop();
        sc.rawInput = () => sc._i || {};
        const fails = [], log = {}, p = sc.players[0], b = sc.vladik; let f = 0;
        const ok = (c, m) => { if (!c) fails.push(m); };
        const frames = (n, i, cb) => { for (let k = 0; k < n; k++, f++) { sc._i = typeof i === 'function' ? i(k) : (i || {}); p.inv = 999; p.hp = 9; sc.update(f * 16.667, 16.667); cb && cb(k); } };
        const calm = () => { sc.projs = []; b.state = 'idle'; b.t = 9; b.vx = 0; };
        const wear = (w) => { localStorage.setItem('tt_loadout', JSON.stringify({ weapon: w, tool: '', charms: [], have: { weapons: ['needle'], tools: [], charms: [] } })); sc.applyLoadout(); };
        const stand = (dx) => { calm(); p.x = b.x + b.w / 2 + dx - 7; p.y = b.y + b.h - 26; p.vx = p.vy = 0; p.kbx = 0; p.atkCd = 0; p.chg = 0; p.chgWait = 0; p.chgLock = false; p.airN = 0; p.comboT = 0; b.stagger = 0; b.poise = 0; b.poiseImmune = 0; frames(3, {}); };
        for (const w of ['needle', 'twin', 'sickle', 'mace', 'lance']) {
          wear(w); const W = sc.wdef(p); ok(W.id === w, 'надето не то оружие ' + w); const out = {};
          // заряд: держим 0.7 с и отпускаем
          stand(-70); b.hp = b.maxHp; let slow = 1e9; frames(60, { atk: true }, () => { slow = Math.min(slow, Math.abs(p.vx)); });
          ok(p.chg >= 0.45, w + ': заряд не набрался'); ok(true); const vxCharge = p.vx;
          stand(-70); p.face = 1; frames(48, { atk: true, right: true }); out.slowVx = Math.round(Math.abs(p.vx));
          ok(Math.abs(p.vx) < 120, w + ': при заряде герой не замедлился (vx=' + p.vx + ')');
          const sq0 = p.seq; frames(1, { atk: false }); ok(p.swk === 'c' && p.seq > sq0, w + ': заряженный удар не вышел'); out.cDur = Math.round(p.atkT * 100) / 100;
          const hp0 = b.hp; stand(-50); b.hp = b.maxHp; p.face = 1; frames(48, { atk: true }); frames(1, {}); const ms = []; frames(40, {}, () => { if (p.atkT > 0 && p.atkHits) ms.push(1); }); out.cHit = Math.round((b.maxHp - b.hp) * 10) / 10;
          ok(b.maxHp - b.hp > 2, w + ': заряженный удар не попал по боссу (урон ' + (b.maxHp - b.hp) + ')');
          // отмена рывком
          stand(-200); frames(36, { atk: true }); const had = p.chg; frames(1, { atk: true, dashP: true, dash: true }); frames(1, { atk: true }); ok(had > 0.3 && p.chg === 0 && p.chgLock, w + ': рывок не отменил заряд'); frames(40, { atk: true }); const sq1 = p.seq; frames(1, {}); ok(p.seq === sq1 || p.swk !== 'c', w + ': после отмены вышел заряженный удар');
          // воздух: прыжок + два удара + третий
          stand(-200); p.onGround = false; p.y -= 80; p.vy = 0; p.canDash = true;
          const kinds = []; for (let k = 0; k < 4; k++) { p.atkCd = 0; const s0 = p.seq; frames(2, { atk: true }); frames(1, {}); if (p.seq !== s0) kinds.push(p.swk); p.atkT = 0; p.onGround = false; p.vy = 0; p.y = Math.min(p.y, b.y - 20); frames(2, {}); }
          out.air = kinds.join(','); ok(kinds[0] === 'a1' && kinds[1] === 'a2', w + ': воздушная цепочка ' + kinds.join(','));
          // пого вниз: у колотушки без отскока, у остальных — отскок
          stand(0); p.x = b.x + b.w / 2 - 7; p.y = b.y - 40; p.vy = 100; p.onGround = false; p.atkCd = 0; p.airN = 5;
          frames(1, { atk: true, down: true }); let up = false; frames(14, { down: true }, () => { if (p.vy < -300) up = true; });
          out.pogo = up; if (w === 'mace') ok(!up, 'колотушка отскочила при ударе вниз'); else ok(up, w + ': пого вниз не работает');
          // сеть: упаковка и восстановление удалённым игроком
          stand(-50); p.atkCd = 0; frames(2, { atk: true }); frames(1, {}); const pk = JSON.parse(JSON.stringify(sc.packPlayer(p))); ok(pk.wp === w && typeof pk.wk === 'string', w + ': packPlayer без оружия/вида удара');
          log[w] = out;
        }
        // сетевая проверка: удалённый игрок с колотушкой наносит урон по правилам оружия (через хост)
        { wear('needle'); const fake = { ...sc.packPlayer(p), i: 0, sq: 99, wp: 'mace', wk: 'g', ad: 'f', hv: 1, x: b.x + b.w / 2 - 50, y: b.y + b.h - 26 };
          const rp = sc.players[0]; const saved = rp.remote; sc.online = 'host'; sc.sendEv = () => { }; rp.remote = true; calm(); b.hp = b.maxHp; b.stagger = 0;
          sc.onNet(fake); ok(rp.weaponId === 'mace' && rp.sw && rp.sw.wid === 'mace', 'удалённый игрок: оружие не применилось'); rp.x = b.x + b.w / 2 - 70; rp.y = b.y + b.h - 26; rp.face = 1;
          sc.resolveAttack(rp); ok(b.maxHp - b.hp > 2.5 && b.maxHp - b.hp <= 3.01, 'удалённая колотушка: урон ' + (b.maxHp - b.hp)); log.net = b.maxHp - b.hp; rp.remote = saved; sc.online = null; }
        // казнь и всполох не задеты W.dmg: оглушённый босс, казнь колотушкой снимает столько же, сколько иглой
        { const ex = {}; for (const w of ['needle', 'mace', 'twin']) { wear(w); stand(-30); b.hp = b.maxHp; b.stagger = 1.2; b.executed = false; p.face = 1; const h0 = b.hp; sc.execBoss(p, sc.execKit('vladik'), 'u'); ex[w] = h0 - b.hp; }
          ok(ex.needle === ex.mace && ex.mace === ex.twin, 'казнь зависит от оружия: ' + JSON.stringify(ex)); log.exec = ex;
          wear('needle'); }
        resolve({ fails, log });
      }, 900);
    }));
    console.log('\n[mech]', JSON.stringify(res.log));
    for (const m of res.fails) console.log('ПРОВАЛ', m);
    fails = res.fails.length;
  }
  console.log('\nошибок страницы:', errs, 'провалов механик:', fails);
  await browser.close(); process.exit(errs || fails ? 1 : 0);
})();
