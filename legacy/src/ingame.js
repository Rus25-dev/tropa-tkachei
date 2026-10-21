// ===== ВНУТРИИГРОВЫЕ МЕНЮ: пауза, меню скамьи, экран победы =====
// Один и тот же список пунктов (InMenu) выбирается стрелками / W S / цифрами (Enter, Пробел), крестовиной (A, B — назад) и касанием.
// Справка по управлению из паузы переехала в «Как играть» (howto.js). Подключается после uifix.js: переопределяет pauseLayout.
const IM = {
  F: '"Fira Sans", sans-serif', D: '"Cormorant SC", Georgia, serif',
  // наименьший шрифт в игровых пикселях, который на экране даёт не меньше ~11 px (на телефоне холст уменьшен)
  minFs(sc) { return Math.ceil(11.4 / Math.max(0.3, UIFix.cs(sc))); },
  // строка подсказки под меню: клавиатура, геймпад или касание
  hint(kind, extra) {
    const d = HW_DEV.cur(), K = (a) => HW_DEV.key(d, a);
    let s;
    if (d === 'touch') s = kind === 'win' ? '' : 'Нажмите на пункт меню';
    else if (d === 'pad') s = `${HW_DEV.name('pad')}: крестовина — выбор · ${K('jump')} — выбрать` + (kind === 'win' ? '' : ` · ${HW_DEV.ps() ? '○' : 'B'} — ${kind === 'bench' ? 'закрыть' : 'продолжить'}`);
    else s = '↑ ↓ — выбор · Enter — выбрать' + (kind === 'win' ? '' : ` · Esc — ${kind === 'bench' ? 'закрыть' : 'продолжить'}`) + (kind === 'win' ? '' : ' · цифры — быстрый выбор');
    if (kind === 'win' && d === 'kb') s = '← → — выбор · Enter — выбрать';
    if (kind === 'win' && d === 'pad') s = `крестовина — выбор · ${K('jump')} — выбрать`;
    return s && extra ? s + ' · ' + extra : s || extra || '';
  },
};

// ----- список пунктов -----
class InMenu {
  // entries: [[подпись, действие], …]; opts: { canAct() } — защита от случайного нажатия
  constructor(sc, entries, opts) {
    this.sc = sc; this.o = opts || {}; this.sel = 0; this.entries = entries; this.openedAt = performance.now();
    this.g = sc.add.graphics();
    this.texts = entries.map(([label], i) => {
      const t = sc.add.text(0, 0, label, { fontFamily: IM.D, fontSize: '26px', fontStyle: '700', color: '#cfe8dc', backgroundColor: 'rgba(20,48,41,0.9)' })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => this.set(i, true));
      t.on('pointerdown', () => { this.set(i, true); this.act(); });
      return t;
    });
    this.paint();
  }
  get objs() { return [this.g, ...this.texts]; }
  set(i, quiet) {
    const n = this.texts.length; i = ((i % n) + n) % n;
    if (i === this.sel) return; this.sel = i; this.paint(); if (!quiet) { try { Snd.play('bead'); } catch (_) { } }
  }
  move(d) { this.set(this.sel + d); }
  act() {
    if (this.o.canAct && !this.o.canAct()) return false;
    const e = this.entries[this.sel]; if (!e) return false;
    try { Snd.play('bead'); } catch (_) { }
    e[1](); return true;
  }
  pick(i) { if (i >= 0 && i < this.texts.length) { this.sel = i; this.paint(); return this.act(); } return false; }
  paint() {
    const g = this.g; if (!g.scene) return; g.clear();
    this.texts.forEach((t, i) => {
      const s = i === this.sel;
      t.setColor(s ? '#ffd47a' : '#cfe8dc').setBackgroundColor(s ? 'rgba(52,104,88,0.98)' : 'rgba(20,48,41,0.9)');
    });
    this.frame();
  }
  frame() {
    const g = this.g; if (!g.scene) return; g.clear();
    const t = this.texts[this.sel]; if (!t || !t.visible) return;
    const b = t.getBounds(); g.lineStyle(2, 0xffd47a, 1); g.strokeRoundedRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6, 6);
  }
  size(fs, py) {
    const px = Math.round(fs * 0.7); py = py == null ? Math.round(fs * 0.26) : py; this._px = px; this._py = py;
    for (const t of this.texts) t.setFontSize(fs).setPadding(px, py, px, py);
  }
  // вертикальный столбец: возвращает занятую высоту; top — верх области, maxH — её высота, center — центрировать по высоте
  vertical(cx, top, maxH, maxW, base, center) {
    const min = IM.minFs(this.sc), n = this.texts.length;
    let fs = Math.max(base, min), py, gap, total, wid;
    for (; ; fs--) {
      py = null; this.size(fs);
      gap = Math.max(4, Math.round(fs * 0.28)); total = this.texts.reduce((s, t) => s + t.height, 0) + gap * (n - 1);
      wid = Math.max(...this.texts.map((t) => t.width));
      if ((total <= maxH && wid <= maxW) || fs <= min) break;
    }
    if (total > maxH) { // совсем тесно: тоньше поля и промежутки
      py = 3; this.size(fs, py); gap = 3; total = this.texts.reduce((s, t) => s + t.height, 0) + gap * (n - 1); wid = Math.max(...this.texts.map((t) => t.width));
    }
    for (const t of this.texts) { const ex = Math.round((wid - t.width) / 2); t.setPadding(this._px + ex, this._py, this._px + ex, this._py); }
    let y = top + (center ? Math.max(0, (maxH - total) / 2) : 0);
    for (const t of this.texts) { t.setPosition(cx, y + t.height / 2); y += t.height + gap; }
    this.frame(); return total;
  }
  // ряд кнопок, прижатый к низу bottom
  row(cx, bottom, maxW, base) {
    const min = IM.minFs(this.sc), n = this.texts.length;
    let fs = Math.max(base, min), gap, sum, h;
    for (; ; fs--) {
      this.size(fs); gap = Math.round(fs * 0.8);
      sum = this.texts.reduce((s, t) => s + t.width, 0) + gap * (n - 1); h = Math.max(...this.texts.map((t) => t.height));
      if (sum <= maxW || fs <= min) break;
    }
    let x = cx - sum / 2;
    for (const t of this.texts) { t.setPosition(x + t.width / 2, bottom - h / 2); x += t.width + gap; }
    this.frame(); return h;
  }
  destroy() { for (const o of this.objs) if (o && o.scene) o.destroy(); this.texts = []; }
}

// ===== интерфейс =====
Object.assign(UIScene.prototype, {
  // какое меню сейчас принимает клавиши, крестовину и касания
  imMenu() {
    const gs = this.gs; if (!this.ready || !gs || !this.pause) return null;
    if (HowTo.open || Changelog.open || Settings.open || gs.gearOpen || gs.shopOpen) return null;
    if (typeof MapTravel !== 'undefined' && (MapTravel.open || MapTravel.busy)) return null;
    if (gs.won && this.winShown() && this.winMenu && this.winMenu.texts.length) return this.winMenu;
    if (this.benchC && this.benchC.visible && this.benchMenu) return this.benchMenu;
    if (this.pause.visible && this.pmMenu) return this.pmMenu;
    return null;
  },
  imWinOk(e) { return this.gs.won && this.winShown() && !(e && e.repeat) && performance.now() - this.winAt > 800; },
  winCanAct() { return performance.now() - this.winAt > 800; },
  imKey(kind, e) {
    const m = this.imMenu(); if (!m || (e && e.repeat)) return;
    const win = m === this.winMenu;
    if (win && !this.imWinOk(e)) return;
    if (kind === 'up' || kind === 'left') { if (kind === 'up' || win) m.move(-1); }
    else if (kind === 'down' || kind === 'right') { if (kind === 'down' || win) m.move(1); }
    else if (kind === 'act') { if (performance.now() - m.openedAt > 140) m.act(); }
    else if (typeof kind === 'number') { if (performance.now() - m.openedAt > 140) m.pick(kind); }
  },
  // крестовина и стик: выбор, A — выбрать, B — назад (пауза: продолжить; скамья: закрыть)
  imPad() {
    const cur = { up: false, down: false, left: false, right: false, ok: false, back: false };
    if (typeof Pads !== 'undefined') for (const p of Pads.list()) {
      const r = Pads.read(p), b = (n) => !!(p.buttons[n] && p.buttons[n].pressed);
      cur.up = cur.up || r.up; cur.down = cur.down || r.down; cur.left = cur.left || r.left; cur.right = cur.right || r.right;
      cur.ok = cur.ok || b(0); cur.back = cur.back || b(1);
    }
    const pv = this._imPadPrev; this._imPadPrev = cur;
    const m = this.imMenu();
    // меню снова стало активным (закрыли «Как играть», настройки, лавку): нажатая для этого кнопка не должна сработать и здесь
    if (m !== this._imPrevMenu) { this._imPrevMenu = m; if (m) m.openedAt = performance.now(); }
    if (!m || !pv || performance.now() - m.openedAt < 260) return;
    const win = m === this.winMenu;
    if (win && !this.imWinOk()) return;
    if ((cur.up && !pv.up) || (win && cur.left && !pv.left)) m.move(-1);
    if ((cur.down && !pv.down) || (win && cur.right && !pv.right)) m.move(1);
    if (cur.ok && !pv.ok) m.act();
    if (cur.back && !pv.back) {
      if (m === this.pmMenu) this.gs.togglePause(); else if (m === this.benchMenu) this.gs.benchClose();
    }
  },

  // ----- пауза -----
  pmEntries() {
    const gs = this.gs, online = !!gs.online, E = [], kb = HW_DEV.cur() === 'kb';
    E.push(['Продолжить', () => gs.togglePause()]);
    if (!online) E.push(['Заново', () => this.retry()]);
    if (gs.train) E.push([kb ? 'Сброс босса (Y)' : 'Сброс босса', () => Training.reset(gs)]);
    if (gs.mapV && typeof MapTravel !== 'undefined') E.push(['Карта', () => { gs.togglePause(); if (MapTravel.canOpen(gs)) MapTravel.show(gs); }]);
    if (!gs.sr && typeof Gear !== 'undefined') E.push([kb ? 'Снаряжение (I)' : 'Снаряжение', () => Gear.open(gs, 'pause')]);
    E.push(['Как играть', () => HowTo.show()]);
    E.push(['Настройки', () => this.openSettings()]);
    E.push(['В главное меню', () => this.restart()]);
    return E.map(([l, f], i) => [kb ? `${i + 1} · ${l}` : l, f]);
  },
  pmRebuild() {
    if (this.pmMenu) this.pmMenu.destroy();
    this.pmMenu = new InMenu(this, this.pmEntries());
    this.pause.add(this.pmMenu.objs);
  },
  pauseLayout() {
    if (!this.ready || !this.pause || !this.pauseTitle || !this.pauseTitle.scene) return;
    const W = VW, H = VH, ok = (o) => o && o.scene, fmin = IM.minFs(this);
    // старая справка и кнопки больше не нужны
    for (const o of [this.pauseL1, this.pauseColA, this.pauseColB, this.gearBtn, this.trBtn, this.padHint, this.mapHint, ...(this.pauseBtns || [])]) if (ok(o)) o.setVisible(false);
    this._pauseDirty = false;
    // нижняя стопка (снизу вверх): подсказка, тренировка
    let y = H - 8;
    const put = (o, fs) => { if (!ok(o) || !o.visible) return; o.setFontSize(Math.max(fs, fmin)).setOrigin(0.5, 1).setWordWrapWidth(W - 60).setAlign('center').setPosition(W / 2, y); y -= o.height + 4; };
    if (ok(this.pmHint)) { this.pmHint.setText(IM.hint('pause', this.gs.online ? 'по сети мир не останавливается' : '')); put(this.pmHint, 13); }
    put(this.trKeys, 12); put(this.trTele, 14);
    const t = this.pauseTitle; t.setFontSize(40).setOrigin(0.5, 0).setPosition(W / 2, 10);
    const top = t.y + t.height + 4;
    if (this.pmMenu) this.pmMenu.vertical(W / 2, top, y - top - 4, W - 80, 28, true);
  },

  // ----- меню скамьи -----
  benchShow(entries) {
    this.benchHide(true);
    for (const o of [this.area, this.areaSub, this.toastTxt]) if (o && o.scene) o.setVisible(false);
    const gs = this.gs, W = VW, H = VH, fmin = IM.minFs(this);
    const c = this.benchC = this.add.container(0, 0).setDepth(47);
    const dim = this.add.graphics(); dim.fillStyle(0x030807, 0.55); dim.fillRect(0, 0, W, H);
    // клик мимо панели закрывает меню
    const catcher = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.001).setInteractive();
    catcher.on('pointerdown', () => gs.benchClose());
    const panel = this.add.graphics();
    const title = this.add.text(W / 2, 0, 'Скамья', { fontFamily: IM.D, fontSize: '40px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5, 0);
    const hint = this.add.text(W / 2, 0, '', { fontFamily: IM.F, fontSize: '13px', color: '#8fb8a8', align: 'center' }).setOrigin(0.5, 0);
    const m = this.benchMenu = new InMenu(this, entries);
    const blocker = this.add.rectangle(W / 2, H / 2, 10, 10, 0xffffff, 0.001).setInteractive(); // клики по панели не закрывают меню
    c.add([dim, catcher, panel, blocker, title, hint, ...m.objs]);
    hint.setText(IM.hint('bench')).setFontSize(Math.max(13, fmin)).setWordWrapWidth(W - 120);
    title.setFontSize(Math.max(36, Math.min(48, fmin + 12)));
    const pad = 16, gap = 8, maxMenu = H - 2 * 12 - 2 * pad - title.height - hint.height - 2 * gap;
    const mh = m.vertical(W / 2, 0, maxMenu, 420, 28, false), mw = Math.max(...m.texts.map((t) => t.width));
    const pw = Math.max(mw + 2 * pad + 24, title.width + 2 * pad, hint.width + 2 * pad), ph = pad + title.height + gap + mh + gap + hint.height + pad;
    const px = W / 2 - pw / 2, py = Math.round((H - ph) / 2);
    panel.fillStyle(0x0b1714, 0.98); panel.fillRoundedRect(px, py, pw, ph, 10); panel.lineStyle(2, 0x3c5a50, 1); panel.strokeRoundedRect(px, py, pw, ph, 10);
    blocker.setPosition(W / 2, py + ph / 2).setSize(pw, ph);
    title.setY(py + pad); m.vertical(W / 2, py + pad + title.height + gap, mh, 420, 28, false); hint.setY(py + ph - pad - hint.height);
    m.frame();
  },
  benchHide(keepMenu) {
    if (!keepMenu) for (const o of [this.area, this.areaSub, this.toastTxt]) if (o && o.scene) o.setVisible(true);
    if (this.benchMenu) { this.benchMenu.destroy(); this.benchMenu = null; }
    if (this.benchC) { if (this.benchC.scene) this.benchC.destroy(); this.benchC = null; }
  },

  // ----- победа: заголовок, итоги и пункты меню -----
  winMenuBuild(entries, parts, note) {
    if (this.winMenu) this.winMenu.destroy();
    const m = this.winMenu = new InMenu(this, entries, { canAct: () => this.winCanAct() });
    this.winParts = parts;
    const objs = [...m.objs];
    this.winHint = this.add.text(VW / 2, VH - 8, '', { fontFamily: IM.F, fontSize: '14px', color: '#ffe3a3', align: 'center' }).setOrigin(0.5, 1);
    objs.push(this.winHint);
    this.winNote = null;
    if (note) { this.winNote = this.add.text(VW / 2, VH - 40, note, { fontFamily: IM.F, fontSize: '16px', color: '#ffe3a3', align: 'center' }).setOrigin(0.5, 1); objs.push(this.winNote); }
    // сообщения и названия зон не лежат под экраном победы
    this.toast('');
    for (const o of [this.area, this.areaSub, this.toastTxt, this.bossName]) if (o && o.scene) o.setVisible(false);
    this.winLayout();
    return objs;
  },
  winLayout() {
    const m = this.winMenu, P = this.winParts; if (!m || !P) return;
    const W = VW, H = VH, fmin = IM.minFs(this);
    let y = H - 8;
    if (this.winHint) { this.winHint.setText(IM.hint('win')).setFontSize(Math.max(14, fmin)).setWordWrapWidth(W - 60).setPosition(W / 2, y); if (this.winHint.text) y -= this.winHint.height + 6; }
    if (this.winNote) { this.winNote.setFontSize(Math.max(16, fmin)).setWordWrapWidth(W - 60).setPosition(W / 2, y); y -= this.winNote.height + 6; }
    const rh = m.row(W / 2, y, W - 40, 28); y -= rh + 12;
    const t1 = P.title; let fs = 56; t1.setOrigin(0.5, 0).setFontSize(fs);
    while (t1.width > W - 40 && fs > 28) t1.setFontSize(--fs);
    t1.setPosition(W / 2, 10); let top = 10 + t1.height + 2;
    if (P.sub) { P.sub.setOrigin(0.5, 0).setFontSize(Math.max(19, fmin)).setWordWrapWidth(W - 60).setPosition(W / 2, top); top += P.sub.height + 8; }
    const b = P.body; b.setOrigin(0.5, 0).setWordWrapWidth(W - 60).setAlign('center');
    for (let f = Math.max(18, fmin); ; f--) {
      b.setFontSize(f).setLineSpacing(Math.round(f * 0.4));
      if (top + b.height <= y || f <= fmin) break;
    }
    b.setPosition(W / 2, top + Math.max(0, Math.min(20, (y - top - b.height) / 2)));
  },
});

{
  const U = UIScene.prototype;
  const createO = U.create;
  U.create = function () {
    this.pmMenu = null; this.winMenu = null; this.benchMenu = null; this.benchC = null; this.winParts = null; this.winHint = null; this.winNote = null; this._imPadPrev = null; this._imPrevMenu = null;
    createO.call(this);
    // непрозрачнее фон паузы: заголовок зоны и сообщения не просвечивают
    const bg = this.pause.list[0];
    if (bg && bg.clear) { bg.clear(); bg.fillStyle(0x030807, 0.94); bg.fillRect(0, 0, VW, VH); }
    this.pmHint = this.add.text(VW / 2, VH - 8, '', { fontFamily: IM.F, fontSize: '13px', color: '#9ff0c8', align: 'center' }).setOrigin(0.5, 1);
    this.pause.add(this.pmHint);
    const kb = this.input.keyboard;
    const on = (names, kind) => names.forEach((n) => kb.on('keydown-' + n, (e) => this.imKey(kind, e)));
    on(['UP', 'W'], 'up'); on(['DOWN', 'S'], 'down'); on(['LEFT', 'A'], 'left'); on(['RIGHT', 'D'], 'right'); on(['ENTER', 'SPACE'], 'act');
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'].forEach((n, i) => kb.on('keydown-' + n, (e) => this.imKey(i, e)));
  };
  const updO = U.update;
  U.update = function (time, delta) { const r = updO.call(this, time, delta); if (this.ready) this.imPad(); return r; };
  // выход в меню геймпадом: пока A (или другая кнопка) зажата, главное меню само запустило бы игру — ждём, пока кнопки отпустят
  const restartO = U.restart;
  U.restart = function () {
    const held = () => typeof Pads !== 'undefined' && Pads.list().some((p) => p.buttons.some((b) => b && (b.pressed || b.value > 0.5)));
    if (!held()) return restartO.call(this);
    if (this._restartWait) return undefined;
    this._restartWait = true; let n = 0, free = 0;
    const iv = setInterval(() => { free = held() ? 0 : free + 1; if (free >= 6 || ++n > 80) { clearInterval(iv); this._restartWait = false; restartO.call(this); } }, 25);
    return undefined;
  };
  const spO = U.showPause;
  U.showPause = function (on) {
    spO.call(this, on);
    if (!this.ready) return;
    // названия зон, подсказки и имя босса не должны просвечивать под паузой
    for (const o of [this.area, this.areaSub, this.toastTxt, this.bossName]) if (o && o.scene) o.setVisible(!on);
    if (on) this.pmRebuild(); else if (this.pmMenu) { this.pmMenu.destroy(); this.pmMenu = null; }
    this.pauseLayout();
  };
}

// ===== игра: меню скамьи, замирание ввода, защита от «залипших» кнопок =====
{
  const G = GameScene.prototype, NEUTRAL = { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false };
  const createO = G.create, rawO = G.rawInput, pauseO = G.togglePause, updO = G.update;
  G.create = function (...a) { this.benchMenuOpen = null; this._mlock = false; return createO.apply(this, a); };
  // после закрытия меню кнопки, которыми его выбирали (A, Пробел, Enter), не должны сработать как прыжок или удар
  G.menuLock = function () {
    this._mlock = true; this._mlockT = performance.now() + 1500;
    for (const p of this.players || []) { p.pend = {}; p.tapHold = {}; } // нажатия, накопленные за время меню, не должны сработать в игре
  };
  G.menuHeld = function () {
    if (this.benchMenuOpen) return true;
    const u = this.ui && this.ui();
    return !!(u && u.pause && u.pause.visible);
  };
  G.rawInput = function (i) {
    const r = rawO.call(this, i);
    if (this.menuHeld()) return { ...NEUTRAL };
    if (this._mlock) {
      const any = r && (r.left || r.right || r.up || r.down || r.jump || r.atk || r.dash || r.heal || r.bomb || r.tool);
      if (!any || performance.now() > this._mlockT) this._mlock = false; else return { ...NEUTRAL };
    }
    return r;
  };
  G.togglePause = function () {
    if (HowTo.open || Changelog.open) return;
    if (this.benchMenuOpen) { this.benchClose(); return; }
    const u = this.ui(), was = !!(u && u.pause && u.pause.visible);
    const r = pauseO.call(this);
    if (was && u.pause && !u.pause.visible) this.menuLock();
    return r;
  };
  // ↑ на скамье: меню вместо мгновенного отдыха
  G.benchOpen = function (p, b) {
    const gs = this, E = [];
    E.push(['Отдохнуть', () => { gs.benchClose(true); gs.benchRest(p, b); }]);
    if (gs.camp && !(gs.sr && gs.sr.cat === 'boss')) E.push(['Лавка', () => { gs.benchClose(true); gs.benchRest(p, b, true); Campaign.openShop(gs, p); }]);
    if (gs.mapV && typeof MapTravel !== 'undefined') E.push(['Карта и переходы', () => { gs.benchClose(true); gs.benchRest(p, b, true); MapTravel.show(gs); }]);
    if (!gs.sr && typeof Gear !== 'undefined') E.push(['Снаряжение', () => { Gear.open(gs, 'bench'); }]);
    if (E.length < 2) { this.benchRest(p, b); return; }
    const kb = HW_DEV.cur() === 'kb';
    this.benchMenuOpen = { p, b };
    if (!this.online) this.paused = true;
    Touch.show(false); Snd.play('bead');
    this.ui().benchShow(E.map(([l, f], i) => [kb ? `${i + 1} · ${l}` : l, f]));
  };
  G.benchClose = function (silent) {
    if (!this.benchMenuOpen) return;
    this.benchMenuOpen = null;
    if (!this.online) this.paused = false;
    this.ui().benchHide();
    this.menuLock();
    Touch.show(true, { bombs: !!this.L.crates });
  };
  G.update = function (t, d) {
    const bm = this.benchMenuOpen;
    // по сети мир идёт: удар, обрыв нити или победа закрывают меню
    if (bm && (this.won || this.wiping || bm.p.downed || bm.p.hp <= 0 || bm.p.hurtT > 0)) this.benchClose();
    return updO.call(this, t, d);
  };
  if (typeof MapTravel !== 'undefined') {
    const coO = MapTravel.canOpen;
    MapTravel.canOpen = function (gs) { return !gs.benchMenuOpen && coO.call(this, gs); };
  }
}
