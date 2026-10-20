// Проверка снаряжения: экран на скамье, покупка, оберег «Паучье сердце», яд на враге, сохранение. NODE_PATH=... node tools/gear-test.js
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const phaserSrc = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  let errs = 0; page.on('pageerror', (e) => { errs++; console.log('PAGEERROR', e.message); });
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.includes('phaser')) return r.fulfill({ contentType: 'application/javascript', body: phaserSrc }); if (u.startsWith('file://')) return r.continue(); return r.fulfill({ status: 200, body: '' }); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && window.__game.scene.getScene('menu') && window.__game.scene.getScene('menu').sys.isActive());
  const res = await page.evaluate(() => new Promise((resolve) => {
    const g = window.__game; g.scene.stop('menu');
    try { localStorage.removeItem('tt_loadout'); localStorage.setItem('tt_save', JSON.stringify({ bench: 1, beads: 200, abil: { double: true }, chapter: 1, stage: 'level', up: { hp: 1, dmg: 0, silk: 0 }, name: 'тест' })); } catch (_) { }
    g.scene.start('game', { players: 1, mode: 'story' });
    setTimeout(() => {
      const sc = g.scene.getScene('game'), ui = g.scene.getScene('ui'); Snd.play = () => {}; g.loop.stop();
      const fails = [], log = {}; let f = 0; const ok = (c, m) => { if (!c) fails.push(m); };
      const frames = (n) => { for (let i = 0; i < n; i++, f++) { sc.update(f * 16.667, 16.667); } };
      // временные тестовые записи (чужие реестры пока пусты)
      WEAPONS.spear = { ...WEAPONS.needle, id: 'spear', name: 'Копьё', desc: 'Тест', reach: 1.4, unlock: 'boss:misha' };
      TOOLS.knife = { id: 'knife', name: 'Нож', desc: 'Тест', cost: 2, cd: 1, use() { return true; }, unlock: 'shop:20' };
      frames(5);
      const p = sc.players[0]; sc.beads = 200;
      const base = p.maxHp; log.base = base;
      // садимся на скамью
      p.sit = true;
      Campaign.openShop(sc, p); ok(sc.shopOpen && ui.shopC.visible, 'лавка не открылась');
      // пункт «Снаряжение» (индекс 3)
      ui.shopSel = 3; ui.shopAct(); frames(2);
      ok(sc.gearOpen && ui.gearC.visible && !ui.shopC.visible, 'экран снаряжения не открылся из лавки');
      // вкладки
      ui.gearTab(1); log.toolsRows = ui.gearItemsN; ok(ui.gearItemsN === Object.keys(TOOLS).length + 1, 'инструменты: ' + ui.gearItemsN); // +1 — «Без инструмента»
      ui.gearSel = Object.keys(TOOLS).indexOf('knife') + 1; ui.gearAct(); ok(Loadout.owned('tools', 'knife', sc), 'нож не куплен'); ok(sc.beads === 180, 'бусины не списались: ' + sc.beads);
      ui.gearAct(); ok(Loadout.data().tool === 'knife' && p.toolId === 'knife', 'нож не надет');
      const sv = Settings.progress(); ok(sv.beads === 180 && sv.abil.double && sv.chapter === 1 && sv.up.hp === 1, 'прогресс потерял поля: ' + JSON.stringify(sv));
      // оружие закрыто боссом
      ui.gearTab(-1); ui.gearSel = 1; ui.gearAct(); ok(!Loadout.owned('weapons', 'spear', sc), 'копьё не должно быть доступно'); log.lockMsg = ui.gearSayT.text;
      // обереги
      ui.gearTab(2); ok(ui.gearItemsN === 9, 'оберегов ' + ui.gearItemsN);
      const idx = (id) => Object.keys(CHARMS).indexOf(id);
      ui.gearSel = idx('heart'); ui.gearAct(); ok(sc.beads === 120, 'сердце не куплено ' + sc.beads); ui.gearAct();
      ok(p.charms.includes('heart') && p.maxHp === base + 1, `сердце: maxHp ${p.maxHp} (было ${base})`); log.maxHp = p.maxHp;
      ui.gearSel = idx('call'); ui.gearAct(); ui.gearAct(); ok(p.charms.includes('call'), 'зов не надет');
      ui.gearSel = idx('stride'); ui.gearAct(); ui.gearAct(); ok(!p.charms.includes('stride') && p.charms.length === 2, 'слоты: 3-й оберег не должен влезть, ' + JSON.stringify(p.charms)); log.slotMsg = ui.gearSayT.text;
      ui.gearSel = idx('heart'); ui.gearAct(); ok(!p.charms.includes('heart') && p.maxHp === base, 'сердце не снялось ' + p.maxHp);
      // закрытие возвращает лавку
      Gear.close(sc); frames(2); ok(ui.shopC.visible && !ui.gearC.visible, 'лавка не вернулась');
      Campaign.closeShop(sc); frames(2);
      // яд
      Loadout.grant('charms', 'sting'); Loadout.equip('charm', 'sting'); sc.applyLoadout();
      const e = sc.enemies.find((o) => o.type === 'crawler' && !o.dead); e.hp = 10;
      for (const o of sc.enemies) if (o !== e) { o.dead = true; o.g.clear(); }
      p.x = e.x - 30; p.y = e.y - 10; p.face = 1; p.atkT = 0.1; p.atkHits = new Set(); p.atkDir = 'f';
      sc.damageEnemy(e, p); ok(Status.has(e, 'poison'), 'яд не наложен'); const h0 = e.hp;
      p.atkT = 0; p.inv = 999; p.hp = 9;
      for (let i = 0; i < 60 * 5.5; i++, f++) { sc.update(f * 16.667, 16.667); p.inv = 999; }
      log.poison = `${h0} -> ${e.hp}`; ok(h0 - e.hp === 4, 'яд должен снять 4 за 4 тика: ' + (h0 - e.hp)); ok(!e.status, 'статус не снялся');
      // ожог + поджог соседа
      const e2 = sc.enemies.find((o) => o !== e); Object.assign(e2, { dead: false, x: e.x + 20, y: e.y, hp: 10 }); e.hp = 10;
      Status.apply(sc, e, 'burn'); for (let i = 0; i < 60 * 1; i++, f++) { sc.update(f * 16.667, 16.667); p.inv = 999; }
      ok(Status.has(e2, 'burn'), 'ожог не перекинулся'); log.burn = e.hp + '/' + e2.hp;
      // замедление
      Status.apply(sc, e, 'slow'); ok(e.status.slow.t > 2.9, 'slow');
      // босс: статусы вдвое слабее и не складываются
      const bk = sc.boss; bk.state = 'idle'; bk.hp = 100; ok(Status.apply(sc, bk, 'poison'), 'яд на босса'); ok(!Status.apply(sc, bk, 'burn'), 'ожог не должен складываться с ядом');
      for (let i = 0; i < 60 * 5.5; i++, f++) { bk.state = 'idle'; sc.update(f * 16.667, 16.667); p.inv = 999; }
      log.bossPoison = 100 - bk.hp; ok(100 - bk.hp === 2, 'яд на босса: ожидалось 2, ' + (100 - bk.hp));
      // снимок хост -> гость
      sc.online = 'host'; Status.apply(sc, e, 'poison'); const snap = sc.packSnap(); sc.online = null; ok(snap.e[sc.enemies.indexOf(e)][7] === 1, 'маска в снимке'); log.snapE = snap.e[sc.enemies.indexOf(e)][7];
      frames(10);
      // из паузы (босс-тест-подобно): кнопка и клавиши
      setTimeout(() => {
        ok(!sc.gearOpen, 'gearOpen завис');
        sc.togglePause(); ok(ui.pause.visible && ui.gearBtn, 'кнопка в паузе'); ui.gearBtn.emit('pointerdown');
        ok(sc.gearOpen && ui.gearC.visible, 'из паузы не открылось');
        ui._gearKey({ code: 'ArrowRight' }); ui._gearKey({ code: 'ArrowRight' }); ui._gearKey({ code: 'ArrowDown' }); ok(ui.gearKind === 2 && ui.gearSel === 1, 'клавиши');
        sc.togglePause(); ok(sc.paused, 'Esc/пауза не должны сниматься при открытом экране');
        g.step(performance.now(), 16); g.step(performance.now() + 20, 16);
        resolve({ fails, log });
      }, 30);
    }, 600);
  }));
  console.log(JSON.stringify(res, null, 1));
  await page.screenshot({ path: process.env.SHOT || '/tmp/gear.png' });
  console.log('ошибок страницы:', errs);
  await browser.close();
  process.exit(errs || res.fails.length ? 1 : 0);
})();
