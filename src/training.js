// ===== ТРЕНИРОВКА (экран «Босс-тест»): бесконечное здоровье, старт с нужной фазы, урон/DPS, сброс босса =====
// Только локально: по сети режим недоступен (в меню он гасит пункт «Вдвоём по сети»). Рекорды в тренировке не пишутся (см. qol.js, this.train).
const Training = {
  on: false, phase: 1,
  load() { try { const o = JSON.parse(localStorage.getItem('tt_train') || '{}') || {}; this.on = !!o.on; this.phase = [1, 2, 3].includes(o.phase) ? o.phase : 1; } catch (_) { } },
  save() { try { localStorage.setItem('tt_train', JSON.stringify({ on: this.on, phase: this.phase })); } catch (_) { } },
  // как называется атака по состоянию босса (только «телеграфы» — замахи и сама атака)
  TELE: {
    misha: { word: 'Слово из букв', bigWind: 'Большая буква', chargeWind: 'Разбег', dictWind: 'Диктант', rollWind: 'Печатный валик' },
    vladik: { clefWind: 'Скрипичный ключ', leapWind: 'Прыжок', lungeWind: 'Выпад смычком', staffWind: 'Нотный стан', echoWind: 'Эхо-дуэт', smearGo: 'Слизь на шторы' },
    tima: { beerWind: 'Пиво', pad: 'Геймпад', ringWind: 'Красное кольцо', boxWind: 'Приставка', bankWind: 'Банкротство', collWind: 'Коллекторы', lagWind: 'Лаги', achWind: 'Ачивки', drink: 'Пьёт пиво', dustDraw: 'Волшебная пыль' },
  },
  // hp босса под порог фазы (см. phaseOf: фаза 2 — до 60 %, фаза 3 — до 30 %; у Миши вторая половина боя — с 50 %)
  hpFor(b, kind, ph) {
    if (ph <= 1) return b.maxHp;
    if (ph === 2) return Math.max(1, Math.floor(b.maxHp * (kind === 'misha' ? 0.5 : 0.58)));
    return Math.max(1, Math.floor(b.maxHp * 0.28));
  },
  // выставить фазу без рёва и отталкивания: hp и b.phase напрямую, без phaseShift
  applyPhase(sc) {
    const b = sc.testBoss(), tr = sc.train; if (!b || !tr) return;
    b.hp = this.hpFor(b, sc.bossKind, this.phase); b.phase = sc.phaseOf(b);
    if (b.tdMarks) b.tdUsed = b.tdMarks.filter((m) => b.hp <= m); // «вид сверху» у Миши считаем уже пройденным
    tr.boss = b; tr.lastHp = b.hp; tr.prev = b.state;
  },
  reset(sc) {
    const tr = sc.train; if (!tr || sc.online || sc.won) return;
    for (const pr of sc.projs) pr.dead = true;
    if (sc.td) { sc.td = null; sc.tdFlip = false; sc.cameras.main.setRotation(0); sc.ui().tdShow(false); }
    if (sc.misha) sc.makeMisha();
    if (sc.vladik) sc.makeVladik();
    if (sc.tima) { sc.repoT = 0; if (sc.setRepo) sc.setRepo(false); sc.makeTima(); }
    sc.ui().bossBar(false); sc.respawnLocal();
    this.applyPhase(sc); tr.log = []; tr.total = 0; tr.first = null; tr.tele = null; tr.resets++;
    if (sc.paused) sc.togglePause();
    sc.ui().toast(`Босс сброшен — фаза ${this.phase}`, 1.8);
  },
  tick(sc, dt) {
    const tr = sc.train, b = sc.testBoss(); if (!tr || !b) return;
    tr.t += dt;
    if (tr.boss !== b) { tr.boss = b; tr.lastHp = b.hp; tr.prev = b.state; }
    if (b.hp < tr.lastHp) { const n = tr.lastHp - b.hp; tr.log.push([tr.t, n]); tr.total += n; if (tr.first == null) tr.first = tr.t; }
    tr.lastHp = b.hp;
    while (tr.log.length && tr.log[0][0] < tr.t - 10) tr.log.shift();
    if (b.state !== tr.prev) {
      const nm = (this.TELE[sc.bossKind] || {})[b.state];
      if (nm) tr.tele = { name: nm, win: b.t, at: tr.t };
      tr.prev = b.state;
    }
  },
  dps(tr) {
    if (tr.first == null) return 0;
    const sum = tr.log.reduce((s, e) => s + e[1], 0), win = Math.min(10, Math.max(1, tr.t - tr.first));
    return sum / win;
  },
  teleText(tr) {
    if (!tr.tele) return 'Последний телеграф: пока не было';
    return `Последний телеграф: ${tr.tele.name} (окно ${tr.tele.win.toFixed(1)} с, ${Math.max(0, tr.t - tr.tele.at).toFixed(0)} с назад)`;
  },
};
Training.load();

(function () {
  const proto = GameScene.prototype;
  // режим включается только в локальном босс-тесте
  const init = proto.init;
  proto.init = function (data) {
    init.call(this, data);
    this.train = (this.mode === 'bosstest' && !this.online && Training.on) ? { t: 0, log: [], total: 0, first: null, tele: null, boss: null, lastHp: 0, prev: '', hits: 0, resets: 0 } : null;
  };
  const create = proto.create;
  proto.create = function () {
    create.call(this);
    if (!this.train) return;
    Training.applyPhase(this);
    this.input.keyboard.on('keydown', (e) => { if (e.code === 'KeyY' && !e.repeat) Training.reset(this); });
  };
  const step = proto.step;
  proto.step = function (dt) { step.call(this, dt); if (this.train) Training.tick(this, dt); };
  // здоровье не убывает, но удар виден: «-1», откидывание и неуязвимость работают как обычно
  const hurt = proto.hurtPlayer;
  proto.hurtPlayer = function (p, dmg, srcX, spike) {
    if (!this.train) return hurt.call(this, p, dmg, srcX, spike);
    const before = p.hp; p.hp = before + 99;
    hurt.call(this, p, dmg, srcX, spike);
    const taken = before + 99 - p.hp; p.hp = before;
    if (taken > 0) {
      this.train.hits++;
      const t = this.add.text(p.x + 7, p.y - 6, '-' + taken, { fontFamily: '"Cormorant SC", Georgia, serif', fontSize: '26px', fontStyle: '700', color: '#ff8a7a', stroke: '#1a1410', strokeThickness: 5 }).setOrigin(0.5).setDepth(8.8);
      this.tweens.add({ targets: t, y: t.y - 46, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    }
  };

  // ----- интерфейс -----
  const ucreate = UIScene.prototype.create;
  UIScene.prototype.create = function () {
    ucreate.call(this);
    const gs = this.gs; if (!gs.train) return;
    const F = '"Fira Sans", sans-serif', D = '"Cormorant SC", Georgia, serif';
    this.trHud = this.add.text(VW - 16, 96, '', { fontFamily: F, fontSize: '13px', color: '#ffd47a', align: 'right', lineSpacing: 3, backgroundColor: 'rgba(6,14,12,0.6)', padding: { x: 8, y: 5 } }).setOrigin(1, 0);
    this.trTele = this.add.text(VW / 2, 458, '', { fontFamily: F, fontSize: '15px', color: '#ffd47a' }).setOrigin(0.5);
    this.trKeys = this.add.text(VW / 2, 482, 'Тренировка: здоровье бесконечное, рекорды не пишутся.  Y — сбросить босса', { fontFamily: F, fontSize: '12px', color: '#8fb8a8' }).setOrigin(0.5);
    const btn = this.trBtn = this.add.text(VW / 2, 512, 'Сброс босса (Y)', { fontFamily: D, fontSize: '21px', color: '#cfe8dc', fontStyle: '700', backgroundColor: 'rgba(20,48,41,0.9)', padding: { x: 14, y: 5 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ffd47a')); btn.on('pointerout', () => btn.setColor('#cfe8dc')); btn.on('pointerdown', () => Training.reset(gs));
    this.pause.add([this.trTele, this.trKeys, btn]);
    const upd = () => {
      const tr = gs.train, b = gs.testBoss(); if (!tr) return;
      const ph = b && b.maxHp ? gs.phaseOf(b) : 1;
      this.trHud.setText(`ТРЕНИРОВКА · фаза ${ph}\nУрон за 10 с: ${tr.log.reduce((s, e) => s + e[1], 0)} · DPS ${Training.dps(tr).toFixed(1)}\nВсего: ${tr.total} · ударов по вам: ${tr.hits}`);
      if (this.pause.visible) this.trTele.setText(Training.teleText(tr));
    };
    this.events.on('update', upd);
    this.events.once('shutdown', () => this.events.off('update', upd));
    this.toast('Тренировка: здоровье бесконечное, Y — сбросить босса', 3);
  };

  // ----- выбор босса: переключатель и фаза -----
  const mcreate = MenuScene.prototype.create;
  MenuScene.prototype.create = function () {
    mcreate.call(this);
    const F = '"Fira Sans", sans-serif', D = '"Cormorant SC", Georgia, serif';
    const st = { fontFamily: D, fontSize: '22px', fontStyle: '600' };
    const tg = this.add.text(VW / 2 - 175, 432, '', st).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const ph = this.add.text(VW / 2 + 175, 432, '', st).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const hint = this.add.text(VW / 2, 454, 'Бесконечное здоровье, счётчик урона и DPS, сброс босса клавишей Y. Рекорды не пишутся. Только за одним компьютером.', { fontFamily: F, fontSize: '11px', color: '#6f9586' }).setOrigin(0.5);
    this.pick.add([tg, ph, hint]);
    const p3 = this.pick.list.find((o) => o.text && o.text.startsWith('3 ·'));
    const refresh = () => {
      tg.setText(`Тренировка: ${Training.on ? 'вкл' : 'выкл'} (T)`).setColor(Training.on ? '#ffd47a' : '#8fb8a8');
      ph.setText(`Старт с фазы ${Training.phase} (P)`).setColor(Training.on ? '#ffd47a' : '#5d7a6e');
      if (p3) p3.setAlpha(Training.on ? 0.3 : 1);
    };
    const toggle = () => { Training.on = !Training.on; Training.save(); refresh(); };
    const cycle = () => { if (!Training.on) { toggle(); return; } Training.phase = Training.phase % 3 + 1; Training.save(); refresh(); };
    tg.on('pointerdown', toggle); ph.on('pointerdown', cycle);
    this.input.keyboard.on('keydown', (e) => {
      if (!this.pick.visible || Settings.open || !Lobby.el.hidden || e.repeat) return;
      if (e.code === 'KeyT') toggle(); else if (e.code === 'KeyP') cycle();
    });
    refresh();
  };
  const openLobby = MenuScene.prototype.openLobby;
  MenuScene.prototype.openLobby = function (mode) {
    if (mode === 'bosstest' && Training.on) return; // тренировка — только локально
    return openLobby.call(this, mode);
  };
})();
