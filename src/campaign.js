// ===== КАМПАНИЯ: главы I–IV, коридоры перед аренами, лавка у скамьи, сохранение =====
// Глава I — «Мшистая Глубь» (Корнематка). Главы II–IV: коридор со скамьями и врагами → арена босса
// (Миша, Владик, Тима). Прогресс (глава, этап, бусины, способности, улучшения) лежит в Settings.progress().
const CHAPTERS = {
  1: { roman: 'I', name: 'Мшистая Глубь', boss: 'korne', bossLine: 'Корнематка повержена' },
  2: { roman: 'II', name: 'Старая типография', boss: 'misha', road: 'Коридор типографии', road2: 'Склад шрифтов' },
  3: { roman: 'III', name: 'Кабинет музыки', boss: 'vladik', road: 'Школьный коридор', road2: 'Лестница к кабинету' },
  4: { roman: 'IV', name: 'Берлога Тимы', boss: 'tima', road: 'Подъезд', road2: 'Лестница к берлоге' },
};
const LAST_CHAPTER = 4;
// лавка: цены по уровням улучшения
const SHOP = [
  { id: 'hp', name: 'Маска здоровья', max: 3, price: [10, 18, 28] },
  { id: 'dmg', name: 'Острая игла', max: 2, price: [12, 22] },
  { id: 'silk', name: 'Лёгкая катушка', max: 2, price: [12, 24] },
];

// коридоры перед аренами: ямы с колючками, уступы, платформы, враги
const ROADS = {
  2: { pits: [[24, 26], [40, 43]], blocks: [[31, 33, 16], [52, 54, 15]], plats: [[23, 27, 14], [39, 44, 13], [58, 61, 13]],
    enemies: [['crawler', 16, 17], ['crawler', 34, 17], ['crawler', 48, 17], ['crawler', 62, 17], ['gnat', 28, 12], ['gnat', 56, 10]] },
  3: { pits: [[20, 23], [36, 39], [50, 53]], blocks: [[28, 30, 16], [60, 62, 15]], plats: [[19, 24, 13], [35, 40, 13], [49, 54, 13]],
    enemies: [['crawler', 15, 17], ['crawler', 26, 17], ['crawler', 45, 17], ['beetle', 33, 17], ['crawler', 57, 17], ['beetle', 65, 17], ['gnat', 40, 11], ['gnat', 56, 10]] },
  4: { pits: [[31, 34], [46, 49], [56, 58]], blocks: [[20, 22, 17], [23, 25, 16], [26, 28, 15], [40, 42, 16]], plats: [[45, 50, 13], [55, 59, 13]],
    enemies: [['crawler', 14, 17], ['beetle', 37, 17], ['crawler', 44, 17], ['beetle', 52, 17], ['crawler', 62, 17], ['gnat', 38, 11], ['gnat', 54, 10], ['gnat', 63, 12]] },
};

function buildRoad(ch) {
  const W = 72, H = 22, cfg = ROADS[ch], c = CHAPTERS[ch], g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(SOLID));
  const set = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = v; };
  set(1, 4, 70, 17, EMPTY);
  for (const [a, b] of cfg.pits) { set(a, 18, b, 19, EMPTY); set(a, 19, b, 19, SPIKE); }
  for (const [a, b, top] of cfg.blocks) set(a, top, b, 17, SOLID);
  for (const [a, b, y] of cfg.plats) set(a, y, b, y, PLAT);
  const signs = [
    { x: 4, y: 17, text: 'Скамья: ↑ — отдохнуть.\nНа скамье ↓ — лавка: маски, игла, катушка', touch: 'Скамья: стик вверх — отдохнуть.\nНа скамье стик вниз — лавка улучшений' },
    { x: 12, y: 17, text: 'Враги дают бусины.\nБусины тратятся в лавке на скамье' },
    { x: 62, y: 17, text: 'Дальше — арена.\nЗагляни в лавку перед боем' },
  ];
  return {
    W, H, grid: g, spawn: { x: 3, y: 17 }, signs, benches: [{ x: 7, y: 17 }, { x: 65, y: 17 }],
    enemies: cfg.enemies.map(([type, x, y]) => ({ type, x, y })), exit: { x: 69, y: 17 },
    areas: [{ x: 0, name: c.road }, { x: 36, name: c.road2 }], region: `Глава ${c.roman} · ${c.name}`, road: ch,
  };
}

const Campaign = {
  freshUp() { return { hp: 0, dmg: 0, silk: 0 }; },
  fresh() { return { ch: 1, st: 'level', beads: 0, abil: {}, up: this.freshUp(), time: 0, deaths: 0 }; },
  // стартовые данные из сохранения («Продолжить»); без сохранения — с начала главы I
  resume() {
    const p = Settings.progress(); if (!p) return this.fresh();
    const ch = CHAPTERS[p.chapter] ? p.chapter : 1;
    return { ch, st: ch === 1 ? 'level' : 'road', beads: p.beads | 0, abil: { ...(p.abil || {}) }, up: { ...this.freshUp(), ...(p.up || {}) }, time: +p.time || 0, deaths: +p.deaths || 0 };
  },
  subtitle() {
    const p = Settings.progress(), c = p && CHAPTERS[p.chapter];
    return c ? `Глава ${c.roman} · ${c.name}` : 'Глава I · Мшистая Глубь';
  },
  saveName(gs, area) { const c = CHAPTERS[gs.camp ? gs.camp.ch : 1]; return `Гл. ${c.roman} · ${area}`; },
  canSave(gs) { return gs.mode === 'story' && gs.online !== 'guest'; },

  // ----- хуки GameScene -----
  init(gs, data) {
    const c = data.camp || (data.mode === 'story' && data.online !== 'guest' ? this.resume() : data.mode === 'story' ? this.fresh() : null);
    gs.camp = c ? { ...c, abil: { ...c.abil }, up: { ...this.freshUp(), ...c.up } } : null;
    if (gs.camp && gs.camp.st === 'arena') { gs.mode = 'bosstest'; gs.bossKind = CHAPTERS[gs.camp.ch].boss; }
    gs.leaving = false; gs.shopOpen = false;
  },
  level(gs) {
    const c = gs.camp; if (!c || c.st === 'level') return null;
    if (c.st === 'road') return buildRoad(c.ch);
    const L = { misha: buildMishaArena, vladik: buildVladikArena, tima: buildTimaArena }[CHAPTERS[c.ch].boss]();
    L.region = `Глава ${CHAPTERS[c.ch].roman}`;
    return L;
  },
  setup(gs) {
    const c = gs.camp;
    gs.up = c ? { ...c.up } : this.freshUp();
    if (c && c.st !== 'level') {
      gs.abil = { ...c.abil }; if (c.st === 'arena') gs.abil.double = true;
      gs.beads = c.beads | 0;
      if (c.st === 'road') gs.bossDead = true; // в коридоре боссов нет: выход открыт
    } else if (c) { gs.abil = { ...c.abil, ...gs.abil }; if (gs.online === 'guest') gs.beads = c.beads | 0; }
    gs.deaths = 0; gs.timeSec = 0;
    this.applyUp(gs);
    if (c) gs.startData = { ...gs.startData, camp: this.snap(gs) };
  },
  snap(gs) {
    const c = gs.camp;
    return { ch: c.ch, st: c.st, beads: gs.beads, abil: { ...gs.abil }, up: { ...gs.up }, time: Math.round(c.time + gs.timeSec), deaths: c.deaths + gs.deaths };
  },
  needleBonus(gs) { return gs.up ? gs.up.dmg | 0 : 0; },
  applyUp(gs) {
    const up = gs.up, base = Settings.s.easy ? 8 : 5;
    P.SILK = 9 - (up.silk | 0);
    for (const p of gs.players || []) {
      if (p.remote) continue;
      const want = base + (up.hp | 0);
      if (want > p.maxHp) p.hp += want - p.maxHp;
      p.maxHp = want; p.hp = Math.min(p.hp, p.maxHp); p.silk = Math.min(p.silk, P.SILK);
    }
  },
  // сохранение прогресса главы (хост/один игрок)
  save(gs, extra) {
    if (!this.canSave(gs)) return;
    const c = gs.camp; if (!c) return;
    const s = this.snap(gs);
    Settings.saveProgress({ ...(Settings.progress() || { bench: 0 }), bench: 0, beads: gs.beads, abil: gs.abil, chapter: c.ch, stage: c.st === 'arena' ? 'road' : c.st, up: s.up, time: s.time, deaths: s.deaths, ...extra });
    gs.startData = { ...gs.startData, camp: s };
  },

  // ----- переходы между этапами и главами -----
  // выход из коридора → арена (без экрана победы)
  preWin(gs) {
    const c = gs.camp; if (!c || c.st !== 'road' || gs.leaving) return false;
    gs.won = true; Snd.play('revive');
    gs.ui().toast('Дальше — арена…');
    this.go(gs, { ...this.snap(gs), st: 'arena' });
    return true;
  },
  // подпись к экрану победы + сохранение перехода на следующую главу
  decorate(gs, s) {
    const c = gs.camp; if (!c) return;
    const ch = CHAPTERS[c.ch], last = c.ch >= LAST_CHAPTER, snap = this.snap(gs);
    if (!s.title) s.title = ch.bossLine;
    s.camp = { title: last ? 'Тропа пройдена' : `Глава ${ch.roman} пройдена`, final: last, ch: c.ch, time: snap.time, deaths: snap.deaths,
      next: last ? null : { ...snap, ch: c.ch + 1, st: 'road' } };
    s.deaths = snap.deaths;
    if (this.canSave(gs)) {
      const n = last ? { ch: c.ch, st: 'road' } : s.camp.next, nc = CHAPTERS[n.ch];
      Settings.saveProgress({ bench: 0, beads: gs.beads, abil: gs.abil, chapter: n.ch, stage: 'road', up: snap.up, time: snap.time, deaths: snap.deaths,
        name: last ? 'Кампания пройдена' : `Гл. ${nc.roman} · ${nc.road}`, done: last });
    }
  },
  go(gs, camp) {
    if (gs.leaving) return; gs.leaving = true;
    const data = { players: gs.nPlayers, mode: 'story', online: gs.online, camp };
    if (gs.online === 'host') gs.sendEv({ k: 'next', camp });
    Snd.play('bench');
    gs.cameras.main.fadeOut(450, 3, 8, 7); gs.ui().cameras.main.fadeOut(450, 3, 8, 7);
    gs.time.delayedCall(gs.online === 'host' ? 900 : 480, () => gs.ui().campGo(data));
  },
  onEv(gs, m) {
    if (m.k === 'next') {
      if (gs.online === 'guest' && !gs.leaving) this.go(gs, m.camp);
    } else if (m.k === 'buy') {
      if (gs.auth()) this.buy(gs, m.id, true);
    } else if (m.k === 'up') {
      gs.up = { ...this.freshUp(), ...m.up }; gs.beads = m.beads; this.applyUp(gs);
      if (gs.ui().shopC && gs.ui().shopC.visible) gs.ui().shopRefresh();
    }
  },

  // ----- лавка -----
  price(id, lvl) { return SHOP.find((s) => s.id === id).price[lvl]; },
  openShop(gs, p) {
    if (!gs.camp || gs.shopOpen || p.remote || gs.won) return;
    gs.shopOpen = true; gs.shopP = p; Touch.show(false); Snd.play('bead'); gs.ui().shopShow();
  },
  closeShop(gs) {
    if (!gs.shopOpen) return;
    setTimeout(() => { gs.shopOpen = false; }, 0); // Esc не должен тут же включить паузу
    Touch.show(true); gs.ui().shopHide();
  },
  buy(gs, id, fromGuest) {
    const it = SHOP.find((s) => s.id === id); if (!it) return;
    if (!gs.auth()) { gs.sendEv({ k: 'buy', id }); return; }
    const lvl = gs.up[id] | 0, say = (m) => { if (fromGuest) gs.sendEv({ k: 'toast', m }); else gs.ui().toast(m); };
    if (lvl >= it.max) { say('Уже куплено на максимум'); return; }
    const price = it.price[lvl];
    if (gs.beads < price) { say(`Не хватает бусин: нужно ${price}`); Snd.play('hit'); return; }
    gs.beads -= price; gs.up[id] = lvl + 1; this.applyUp(gs); Snd.play('revive');
    gs.parts.setParticleTint(0xffd47a); for (const p of gs.players) if (!p.remote) gs.parts.explode(16, p.x + 7, p.y + 10);
    gs.sendEv({ k: 'up', up: gs.up, beads: gs.beads });
    this.save(gs, {});
    gs.toastAll(`Куплено: ${it.name}`);
    if (gs.ui().shopC && gs.ui().shopC.visible) gs.ui().shopRefresh();
  },
  // каждый кадр: геймпад в лавке и защита от «зависшей» лавки
  tick(gs) {
    if (!gs.shopOpen) return;
    const me = gs.shopP;
    if (!me || !me.sit || me.downed || gs.wiping || gs.won) { this.closeShop(gs); return; }
    const pads = gs.input.gamepad ? gs.input.gamepad.gamepads.filter(Boolean) : [], u = gs.ui();
    let up = false, down = false, ok = false, back = false;
    for (const pad of pads) {
      const b = (n) => !!(pad.buttons[n] && pad.buttons[n].pressed);
      up = up || pad.up; down = down || pad.down; ok = ok || b(0); back = back || b(1);
    }
    const hold = { up, down, ok, back }, prev = gs._shopPad || {};
    gs._shopPad = hold;
    if (up && !prev.up) u.shopMove(-1);
    if (down && !prev.down) u.shopMove(1);
    if (ok && !prev.ok) u.shopAct();
    if (back && !prev.back) this.closeShop(gs);
  },
};

// ввод игры замирает, пока открыта лавка
{
  const G = GameScene.prototype, rawO = G.rawInput, tapO = G.onKeyTap, touchO = G.onTouchTap, updO = G.update;
  G.rawInput = function (i) {
    if (this.shopOpen) return { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false };
    return rawO.call(this, i);
  };
  G.onKeyTap = function (e) { if (!this.shopOpen) tapO.call(this, e); };
  G.onTouchTap = function (act) { if (!this.shopOpen) touchO.call(this, act); };
  G.update = function (t, d) { Campaign.tick(this); return updO.call(this, t, d); };
}

const victoryBase = UIScene.prototype.victory;
Object.assign(UIScene.prototype, {
  campGo(d) { this.ready = false; this.scene.stop('bg'); this.scene.start('game', d); },
  winEnter() {
    const s = this.campWinS;
    if (!s) { this.restart(); return; }
    if (this.gs.online === 'guest') return;
    if (s.next) Campaign.go(this.gs, s.next); else this.restart();
  },
  // ----- экран победы главы -----
  victory(s) {
    if (!s || !s.camp) { this.campWinS = null; return victoryBase.call(this, s); }
    const D = '"Cormorant SC", Georgia, serif', F = '"Fira Sans", sans-serif', k = s.camp, gs = this.gs;
    const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60).toString().padStart(2, '0');
    const bg = this.add.graphics(); bg.fillStyle(0x030807, 0.88); bg.fillRect(0, 0, VW, VH);
    const t1 = this.add.text(VW / 2, 120, k.title, { fontFamily: D, fontSize: '56px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5).setShadow(0, 0, '#9ff0c8', 16, false, true);
    const t0 = this.add.text(VW / 2, 176, s.title || '', { fontFamily: F, fontSize: '19px', color: '#9ff0c8' }).setOrigin(0.5);
    let lines;
    if (k.final) {
      const tm = Math.floor(k.time / 60), ts = Math.floor(k.time % 60).toString().padStart(2, '0');
      lines = `Корнематка, Миша, Владик и Тима побеждены.\nНить сплетена: ${gs.nPlayers === 2 ? 'вдвоём' : 'в одиночку'} вы дошли до конца.\n\nВсё время кампании: ${tm}:${ts}\nОбрывов нити за всё время: ${k.deaths}\nБусин при себе: ${gs.beads}`;
    } else {
      const nx = CHAPTERS[k.ch + 1];
      lines = `Время главы: ${m}:${sec}\nБусин при себе: ${gs.beads}\nОбрывов нити: ${s.deaths != null ? s.deaths : gs.deaths}\nТкачей: ${s.players}\n\nДальше: Глава ${nx.roman} · ${nx.name}`;
    }
    const t2 = this.add.text(VW / 2, 215, lines, { fontFamily: F, fontSize: '17px', color: '#b9d4c8', align: 'center', lineSpacing: 7 }).setOrigin(0.5, 0);
    const btn = (x, y, label, fn) => {
      const t = this.add.text(x, y, label, { fontFamily: D, fontSize: '26px', color: '#cfe8dc', fontStyle: '700', backgroundColor: 'rgba(20,48,41,0.9)', padding: { x: 16, y: 7 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffd47a')); t.on('pointerout', () => t.setColor('#cfe8dc')); t.on('pointerdown', fn);
      return t;
    };
    const guest = gs.online === 'guest', items = [bg, t1, t0, t2];
    if (k.next && !guest) items.push(btn(VW / 2 - 130, 420, `Глава ${CHAPTERS[k.ch + 1].roman} →`, () => this.winEnter()), btn(VW / 2 + 130, 420, 'В главное меню', () => this.restart()));
    else items.push(btn(VW / 2, 420, 'В главное меню', () => this.restart()));
    const hint = guest ? 'Ждём, когда хост поведёт дальше…' : k.next ? 'Enter — дальше' : 'Enter — в главное меню';
    if (!Touch.enabled) items.push(this.add.text(VW / 2, 478, hint, { fontFamily: F, fontSize: '15px', color: '#ffe3a3' }).setOrigin(0.5));
    else if (guest) items.push(this.add.text(VW / 2, 478, hint, { fontFamily: F, fontSize: '15px', color: '#ffe3a3' }).setOrigin(0.5));
    Touch.show(false);
    this.campWinS = k;
    this.win.add(items); this.win.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.win, alpha: 1, duration: 900 });
  },

  // ----- лавка у скамьи -----
  shopBuild() {
    const D = '"Cormorant SC", Georgia, serif', F = '"Fira Sans", sans-serif', gs = this.gs, x0 = VW / 2 - 280;
    const c = this.add.container(0, 0).setVisible(false).setDepth(50);
    const bg = this.add.graphics(); bg.fillStyle(0x030807, 0.86); bg.fillRect(0, 0, VW, VH);
    bg.fillStyle(0x0b1714, 0.97); bg.fillRoundedRect(x0 - 20, 70, 600, 424, 10); bg.lineStyle(2, 0x3c5a50, 1); bg.strokeRoundedRect(x0 - 20, 70, 600, 424, 10);
    const title = this.add.text(VW / 2, 104, 'Лавка у скамьи', { fontFamily: D, fontSize: '40px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5);
    this.shopBeads = this.add.text(x0 + 560, 88, '', { fontFamily: F, fontSize: '18px', color: '#ffe3a3' }).setOrigin(1, 0);
    this.shopSelG = this.add.graphics();
    this.shopRows = [];
    const rows = [...SHOP, { id: 'gear' }, { id: 'close' }];
    rows.forEach((it, i) => {
      const y = 146 + i * 62;
      const name = this.add.text(x0, y, '', { fontFamily: D, fontSize: '26px', color: '#cfe8dc', fontStyle: '700' });
      const desc = this.add.text(x0, y + 31, '', { fontFamily: F, fontSize: '13px', color: '#86a89a' });
      const price = this.add.text(x0 + 560, y + 2, '', { fontFamily: F, fontSize: '18px', fontStyle: '600', color: '#ffe3a3' }).setOrigin(1, 0);
      const hit = this.add.rectangle(VW / 2, y + 27, 580, 60, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { this.shopSel = i; this.shopRefresh(); });
      hit.on('pointerdown', () => { this.shopSel = i; this.shopAct(); });
      this.shopRows.push({ it, name, desc, price, y });
      c.add([name, desc, price, hit]);
    });
    this.shopHint = this.add.text(VW / 2, 468, '', { fontFamily: F, fontSize: '12px', color: '#6f9586' }).setOrigin(0.5);
    c.add([bg, title, this.shopBeads, this.shopSelG, this.shopHint]);
    c.sendToBack(this.shopSelG); c.sendToBack(bg);
    this.shopC = c; this.shopSel = 0;
    this.input.keyboard.on('keydown', (e) => {
      if (!this.shopC.visible) return;
      const k = e.code;
      if (k === 'ArrowUp' || k === 'KeyW') this.shopMove(-1);
      else if (k === 'ArrowDown' || k === 'KeyS') this.shopMove(1);
      else if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space' || k === 'KeyF' || k === 'KeyZ' || k === 'KeyX') this.shopAct();
      else if (k === 'Escape' || k === 'KeyQ' || k === 'KeyE') Campaign.closeShop(this.gs);
    });
  },
  shopShow() { if (!this.ready) return; if (!this.shopC || !this.shopC.scene) this.shopBuild(); this.shopSel = 0; this.shopC.setVisible(true); this.shopRefresh(); },
  shopHide() { if (this.shopC) this.shopC.setVisible(false); },
  shopMove(d) { const n = this.shopRows.length; this.shopSel = (this.shopSel + d + n) % n; this.shopRefresh(); },
  shopAct() {
    const r = this.shopRows[this.shopSel]; if (!r) return;
    if (r.it.id === 'close') Campaign.closeShop(this.gs); else if (r.it.id === 'gear') { if (typeof Gear !== 'undefined') Gear.open(this.gs, 'shop'); } else Campaign.buy(this.gs, r.it.id);
  },
  shopRefresh() {
    const gs = this.gs, up = gs.up || Campaign.freshUp(), g = this.shopSelG; g.clear();
    this.shopBeads.setText(`Бусин: ${gs.beads}`);
    const desc = {
      hp: `Бутонов здоровья: ${(Settings.s.easy ? 8 : 5) + up.hp}`,
      dmg: `Урон иглой по врагам: ${1 + up.dmg} (боссов это не касается)`,
      silk: `Катушка нити: ${P.SILK} удар. до лечения`,
    };
    this.shopRows.forEach((r, i) => {
      const it = r.it, sel = i === this.shopSel;
      if (sel) { g.fillStyle(0x1d3a31, 0.9); g.fillRoundedRect(VW / 2 - 295, r.y - 6, 590, 62, 6); g.lineStyle(1.5, 0xffd47a, 0.8); g.strokeRoundedRect(VW / 2 - 295, r.y - 6, 590, 62, 6); }
      if (it.id === 'gear') { r.name.setText('Снаряжение').setColor(sel ? '#ffd47a' : '#cfe8dc'); r.desc.setText('Оружие, инструмент и обереги'); r.price.setText('открыть').setColor('#9ff0c8'); return; }
      if (it.id === 'close') { r.name.setText('Закрыть').setColor(sel ? '#ffd47a' : '#cfe8dc'); r.desc.setText(Touch.enabled ? '' : 'Esc'); r.price.setText(''); return; }
      const lvl = up[it.id] | 0, maxed = lvl >= it.max, pr = maxed ? 0 : it.price[lvl], can = !maxed && gs.beads >= pr;
      r.name.setText(`${it.name}  ${'●'.repeat(lvl)}${'○'.repeat(it.max - lvl)}`).setColor(sel ? '#ffd47a' : '#cfe8dc');
      r.desc.setText(desc[it.id]);
      r.price.setText(maxed ? 'куплено' : `${pr} бусин`).setColor(maxed ? '#9ff0c8' : can ? '#ffe3a3' : '#7a6a58');
    });
    this.shopHint.setText(Touch.enabled ? 'Нажмите на улучшение, чтобы купить' : '↑ ↓ — выбрать   ·   Enter / Пробел / F — купить   ·   Esc — закрыть   ·   геймпад: A — купить, B — закрыть');
  },
});
