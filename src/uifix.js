// ===== ИНТЕРФЕЙС: вёрстка паузы, автопауза в портрете, реплики боссов и сенсорные кнопки на телефоне =====
// Подключается последним среди модулей интерфейса: оборачивает методы UIScene и GameScene.
const UIFix = {
  F: '"Fira Sans", sans-serif', D: '"Cormorant SC", Georgia, serif',
  // во сколько раз холст на экране отличается от игровых координат (на телефоне < 1)
  cs(scene) { const d = scene.scale && scene.scale.displaySize; return d && d.height ? d.height / VH : 1; },
  inter(a, b, m) { return a.x < b.x + b.width - (m || 0) && a.x + a.width > b.x + (m || 0) && a.y < b.y + b.height - (m || 0) && a.y + a.height > b.y + (m || 0); },
  portrait() { return !!(Touch.enabled && window.matchMedia && matchMedia('(orientation: portrait)').matches); },
};

// ----- пауза: справка в две колонки, нижние кнопки и подсказки в одну стопку -----
Object.assign(UIScene.prototype, {
  pauseLayout() {
    if (!this.ready || !this.pause || !this.pauseL1 || !this.pauseL1.scene) return;
    const F = UIFix.F, W = VW, H = VH, pc = this.pauseL1, ok = (o) => o && o.scene;
    // источник текста — pauseL1 (его правит Access.refreshPause); сам он скрыт, а читают две колонки
    pc.setVisible(false); this._pauseDirty = false;
    if (!this.pauseColA) {
      const st = { fontFamily: F, color: '#b9d4c8', align: 'left' };
      this.pauseColA = this.add.text(0, 0, '', st); this.pauseColB = this.add.text(0, 0, '', st);
      this.pause.add([this.pauseColA, this.pauseColB]);
    }
    // 1. нижняя стопка (снизу вверх)
    let y = H - 8;
    const hint = (o) => { if (!ok(o) || !o.visible) return; o.setOrigin(0.5, 1).setFontSize(12).setWordWrapWidth(W - 60); o.setPosition(W / 2, y); y -= o.height + 3; };
    hint(this.mapHint); hint(this.padHint); hint(this.trKeys); hint(this.trTele);
    const row = (items) => {
      items = items.filter((o) => ok(o) && o.visible); if (!items.length) return;
      items.forEach((o) => o.setScale(1).setOrigin(0.5));
      const gap = 14, sum = items.reduce((s, o) => s + o.width, 0) + gap * (items.length - 1), k = Math.min(1, (W - 24) / sum);
      items.forEach((o) => o.setScale(k));
      const h = Math.max(...items.map((o) => o.displayHeight)); let x = W / 2 - (sum * k) / 2;
      for (const o of items) { o.setPosition(x + o.displayWidth / 2, y - h / 2); x += o.displayWidth + gap * k; }
      y -= h + 6;
    };
    row([this.gearBtn, this.trBtn]);
    row(this.pauseBtns || []);
    // 2. заголовок сверху
    const t = this.pauseTitle; t.setFontSize(40).setOrigin(0.5, 0).setPosition(W / 2, 12);
    const top = t.y + t.height + 4, avail = y - top - 2;
    // 3. справка: самый крупный шрифт, при котором две колонки помещаются
    const paras = pc.text.split('\n').filter((s) => s.trim()).map((s) => '· ' + s);
    const colW = Math.floor((Math.min(W - 40, 1040) - 24) / 2), A = this.pauseColA, B = this.pauseColB;
    const x0 = Math.round(W / 2 - colW - 12);
    A.setPosition(x0, top); B.setPosition(x0 + colW + 24, top);
    let best = null;
    for (const fs of Touch.enabled ? [18, 17, 16, 15, 14, 13, 12, 11, 10] : [15, 14, 13, 12, 11, 10]) {
      for (const c of [A, B]) c.setFontSize(fs).setLineSpacing(Math.round(fs / 4)).setWordWrapWidth(colW);
      // подбор разреза абзацев на две колонки с наименьшей высотой
      let bk = 1, bh = 1e9;
      for (let k = 1; k < paras.length; k++) {
        A.setText(paras.slice(0, k).join('\n')); B.setText(paras.slice(k).join('\n'));
        const h = Math.max(A.height, B.height); if (h < bh) { bh = h; bk = k; }
      }
      A.setText(paras.slice(0, bk).join('\n')); B.setText(paras.slice(bk).join('\n'));
      best = Math.max(A.height, B.height);
      if (best <= avail) break;
    }
    // если места лишнего много — опускаем справку к середине свободной области
    const off = Math.max(0, Math.min(24, (avail - best) / 2)); A.y = top + off; B.y = top + off;
  },
});
{
  const sp = UIScene.prototype.showPause;
  UIScene.prototype.showPause = function (on) { sp.call(this, on); if (this.trHud) this.trHud.setVisible(!on); /* счётчик тренировки лежит поверх справки */ if (on) this.pauseLayout(); };
  const uc = UIScene.prototype.create;
  UIScene.prototype.create = function () {
    uc.call(this);
    const pc = this.pauseL1, set = pc.setText.bind(pc);
    pc.setText = (s) => { set(s); if (this.pause.visible) this.pauseLayout(); else this._pauseDirty = true; return pc; }; // Access.refreshPause меняет первую строку
    const psv = this.pause.setVisible.bind(this.pause); // после «Настроек» пауза показывается напрямую — подтянуть справку
    this.pause.setVisible = (v) => { psv(v); if (v && this._pauseDirty) this.pauseLayout(); return this.pause; };
    if (Touch.enabled && this.tdSay) this.tdSay.setFontSize(Phaser.Math.Clamp(Math.round(16 / UIFix.cs(this)), 17, 26)).setPadding(12, 6); // реплика Миши в «виде сверху»
  };
}

// (меню игры переехало в src/menu.js: непрозрачные экраны со своим каркасом, «Что нового» — отдельным экраном)

// ----- портретная ориентация на телефоне: бой не идёт под заглушкой «Поверните телефон» -----
{
  const upd = GameScene.prototype.update;
  GameScene.prototype.update = function (t, d) {
    const r = upd.call(this, t, d);
    UIFix.rotateCheck(this);
    UIFix.bubbles(this);
    UIFix.touchAvoid(this);
    return r;
  };
}
Object.assign(UIFix, {
  rotateCheck(gs) {
    if (!Touch.enabled) return;
    if (UIFix.portrait()) {
      if (!gs.paused && !gs.online && !gs.won && !gs.wiping && !gs.shopOpen && !gs.gearOpen && !Settings.open) { gs.togglePause(); if (gs.paused) gs._rotPause = true; }
    } else if (gs._rotPause) {
      gs._rotPause = false;
      if (gs.paused && !gs.won) gs.togglePause();
    }
  },
  // реплики боссов: на телефоне крупнее (чтобы на экране было не меньше ~15 px), с переносом, в пределах видимой области
  bubbles(gs) {
    if (!Touch.enabled) return;
    const cam = gs.cameras.main, wv = cam.worldView, k = UIFix.cs(gs) * cam.zoom;
    const fs = Phaser.Math.Clamp(Math.round(16 / Math.max(0.3, k)), 17, 30);
    for (const o of [gs.mishaSay, gs.vSay, gs.tSay]) {
      if (!o || !o.scene || !o.visible) continue;
      if (o.style.fontSize !== fs + 'px') o.setFontSize(fs).setPadding(Math.round(fs * 0.55), Math.round(fs * 0.3));
      const ww = Math.round(wv.width * 0.5);
      if (o.style.wordWrapWidth !== ww) o.setWordWrapWidth(ww);
      const hw = o.displayWidth / 2, m = 6 / Math.max(0.3, k);
      o.x = Phaser.Math.Clamp(o.x, wv.x + hw + m, wv.right - hw - m);
      o.y = Math.max(o.y, wv.y + o.displayHeight + m);
    }
  },
  // кнопки справа не должны закрывать рюкзак Миши (цель бомбы): перекрытые кнопки становятся прозрачными
  touchAvoid(gs) {
    if (!Touch.enabled || !Touch.root || ((gs.game.loop.frame || 0) & 3)) return;
    const btns = Touch.root.querySelectorAll('.t-btn'), m = gs.misha;
    let bag = null;
    if (Touch.visible && m && m.state !== 'dead' && m.state !== 'gone' && gs.mishaBag) {
      const b = gs.mishaBag(m), cam = gs.cameras.main, wv = cam.worldView, r = gs.game.canvas.getBoundingClientRect(), s = r.width / VW;
      bag = { l: r.left + (b.x - wv.x) * cam.zoom * s, t: r.top + (b.y - wv.y) * cam.zoom * s, w: b.w * cam.zoom * s, h: b.h * cam.zoom * s };
    }
    btns.forEach((el) => {
      let hit = false;
      if (bag && !el.hidden) { const q = el.getBoundingClientRect(), pad = 14; hit = bag.l < q.right + pad && bag.l + bag.w > q.left - pad && bag.t < q.bottom + pad && bag.t + bag.h > q.top - pad; }
      el.classList.toggle('dim', hit);
    });
  },
});
