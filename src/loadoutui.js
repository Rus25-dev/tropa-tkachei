// ===== ЭКРАН «СНАРЯЖЕНИЕ»: оружие, инструмент, обереги =====
// Открывается пунктом «Снаряжение» в лавке на скамье и кнопкой в паузе (клавиша I, на геймпаде Y). В босс-тесте всё доступно (Loadout.openAll).
// Управление: ↑↓ — выбор, ←→ (или Q/E, LB/RB) — раздел, Enter / Пробел / F / A — надеть или купить, Esc / B — назад; мышь и касание — по кнопкам.
// Читает реестры WEAPONS / TOOLS / CHARMS, поэтому подхватывает всё, что добавят другие модули; пустой реестр показывает заглушку.
const Gear = {
  KINDS: ['weapons', 'tools', 'charms'],
  NAMES: { weapons: 'Оружие', tools: 'Инструмент', charms: 'Обереги' },
  SINGLE: { weapons: 'weapon', tools: 'tool', charms: 'charm' },
  BOSS: { korn: 'Корнематка', misha: 'Миша Додик', vladik: 'Владик Скрипка', tima: 'Тима Пиво' },
  ROWS: 8, ROWH: 34,

  canOpen(gs) {
    const u = gs && gs.ui && gs.ui();
    return !!(gs && u && u.ready && !gs.gearOpen && !gs.sr && !gs.won && !gs.wiping && !Settings.open && !(typeof MapTravel !== 'undefined' && MapTravel.open));
  },
  open(gs, from) {
    if (!this.canOpen(gs)) return false;
    gs.gearOpen = true; gs.gearFrom = from; gs._gearPad = null;
    Touch.show(false); Snd.play('bead'); gs.ui().gearShow(from);
    return true;
  },
  close(gs) {
    if (!gs.gearOpen) return;
    setTimeout(() => { gs.gearOpen = false; }, 0); // Esc не должен тут же включить паузу
    gs.ui().gearHide(gs.gearFrom);
  },
  // что лежит в разделе
  items(gs, kind) {
    const out = [], reg = Loadout.reg(kind);
    if (kind === 'tools') out.push({ id: '', none: true, e: { id: '', name: 'Без инструмента', desc: 'Кнопка инструмента (E / RB) ничего не делает.' } });
    for (const id in reg) out.push({ id, e: reg[id] });
    for (const it of out) it.owned = it.none ? true : Loadout.owned(kind, it.id, gs);
    return out;
  },
  equippedIds(gs, kind) {
    const d = Loadout.equipped(gs);
    return kind === 'weapons' ? [d.weapon] : kind === 'tools' ? [d.tool] : d.charms;
  },
  price(e) { const m = /^shop:(\d+)$/.exec(e.unlock || ''); return m ? +m[1] : 0; },
  lockText(e) {
    const u = e.unlock || '';
    if (u.startsWith('boss:')) return `Получите: босс ${this.BOSS[u.slice(5)] || u.slice(5)}`;
    if (u.startsWith('shop:')) return `Цена: ${u.slice(5)} бусин`;
    return 'Пока недоступно';
  },
  stats(kind, e) {
    const L = [];
    if (kind === 'weapons') {
      if (e.dmg != null) L.push(`Урон: ${e.dmg}`);
      if (e.reach != null) L.push(`Дальность: ×${e.reach}`);
      if (e.cd) L.push(`Пауза между ударами: ${e.cd} с`);
      if (e.combo) L.push(`Комбо: ${e.combo} уд.${e.finisher ? ', последний — тяжёлый' : ''}`);
    } else if (kind === 'tools') {
      if (e.cost != null) L.push(`Стоит нити: ${e.cost}`);
      if (e.cd) L.push(`Перезарядка: ${e.cd} с`);
    } else L.push(`Занимает слотов: ${Loadout.slotsOf ? Loadout.slotsOf(e.id) : 1} из ${CHARM_SLOTS}`);
    return L.join('\n');
  },
  // что сейчас можно сделать с предметом
  state(gs, kind, it) {
    const e = it.e;
    if (!it.owned) {
      const pr = this.price(e);
      if (pr) return { act: 'buy', price: pr, ok: gs.beads >= pr && gs.auth(), label: gs.auth() ? `Купить за ${pr} бусин` : 'Покупает хост' };
      return { act: 'none', ok: false, label: this.lockText(e) };
    }
    const eq = this.equippedIds(gs, kind).includes(it.id);
    if (kind === 'charms') {
      if (eq) return { act: 'equip', ok: true, eq, label: 'Снять' };
      const fit = Loadout.canFit(Loadout.data().charms, it.id);
      return { act: 'equip', ok: fit, eq, label: fit ? 'Надеть' : 'Нет места: снимите другой оберег' };
    }
    if (eq) return { act: 'none', ok: false, eq, label: 'Надето' };
    return { act: 'equip', ok: true, eq, label: 'Надеть' };
  },
  doAct(gs, kind, it) {
    const ui = gs.ui(), st = this.state(gs, kind, it), e = it.e;
    if (st.act === 'none') { ui.gearSay(st.eq ? 'Уже надето' : st.label); return; }
    if (st.act === 'buy') {
      if (!gs.auth()) { ui.gearSay('Покупать в лавке может только хост'); return; }
      if (gs.beads < st.price) { ui.gearSay(`Не хватает бусин: нужно ${st.price}`); Snd.play('hit'); return; }
      if (!Loadout.grant(kind, it.id)) { ui.gearSay('Уже куплено'); return; }
      gs.beads -= st.price; Snd.play('revive');
      for (const p of gs.players) if (!p.remote) { gs.parts.setParticleTint(0xffd47a); gs.parts.explode(14, p.x + 7, p.y + 10); }
      const pg = Settings.progress();
      if (gs.camp) Campaign.save(gs, { bench: pg ? pg.bench | 0 : 0 }); // бусины сохраняются, остальные поля прогресса остаются
      ui.gearSay(`Куплено: ${e.name}. Нажмите ещё раз, чтобы надеть`);
      return;
    }
    if (!st.ok) { ui.gearSay(st.label); Snd.play('hit'); return; }
    const done = Loadout.equip(this.SINGLE[kind], it.id);
    if (done === false) { ui.gearSay('Не хватает слотов'); return; }
    gs.applyLoadout(); Snd.play('bench');
    ui.gearSay(kind === 'charms' ? (st.eq ? `Снято: ${e.name}` : `Надето: ${e.name}`) : `Надето: ${e.name}`);
  },

  // каждый кадр: геймпад и защита от «зависшего» экрана
  tick(gs) {
    const u = gs.ui();
    if (gs.won || gs.wiping || (gs.gearFrom === 'shop' && (!gs.shopP || !gs.shopP.sit || gs.shopP.downed))) { this.close(gs); return; }
    if (!u.gearC || !u.gearC.visible) return;
    let up = false, down = false, left = false, right = false, ok = false, back = false, lb = false, rb = false;
    for (const pad of Pads.list()) {
      const b = (n) => !!(pad.buttons[n] && pad.buttons[n].pressed), ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      up = up || b(12) || ay < -0.6; down = down || b(13) || ay > 0.6; left = left || b(14) || ax < -0.6; right = right || b(15) || ax > 0.6;
      ok = ok || b(0); back = back || b(1); lb = lb || b(4); rb = rb || b(5);
    }
    const prev = gs._gearPad || { up: 1, down: 1, left: 1, right: 1, ok: 1, back: 1, lb: 1, rb: 1 }; // первый кадр: ничего не «нажато заново»
    gs._gearPad = { up, down, left, right, ok, back, lb, rb };
    if (up && !prev.up) u.gearMove(-1);
    if (down && !prev.down) u.gearMove(1);
    if ((left && !prev.left) || (lb && !prev.lb)) u.gearTab(-1);
    if ((right && !prev.right) || (rb && !prev.rb)) u.gearTab(1);
    if (ok && !prev.ok) u.gearAct();
    if (back && !prev.back) this.close(gs);
  },
};

// ввод игры замирает, пока открыт экран; пауза по Esc не включается
{
  const G = GameScene.prototype, rawO = G.rawInput, tapO = G.onKeyTap, touchO = G.onTouchTap, pauseO = G.togglePause;
  G.rawInput = function (i) {
    if (this.gearOpen) return { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false };
    return rawO.call(this, i);
  };
  G.onKeyTap = function (e) { if (!this.gearOpen) tapO.call(this, e); };
  G.onTouchTap = function (act) { if (!this.gearOpen) touchO.call(this, act); };
  G.togglePause = function () { if (this.gearOpen) return; return pauseO.call(this); };
  // геймпад в лавке не должен двигать лавку под экраном снаряжения
  const tickO = Campaign.tick;
  Campaign.tick = function (gs) { if (gs.gearOpen) return Gear.tick(gs); return tickO.call(this, gs); };
  // в паузе: Y на геймпаде открывает экран (в других местах кнопка Y — нить)
  const updO = G.update;
  G.update = function (t, d) {
    if (!this.gearOpen && !this.sr) {
      const u = this.ui();
      if (u && u.ready && u.pause && u.pause.visible) {
        let y = false; for (const pad of Pads.list()) y = y || !!(pad.buttons[3] && pad.buttons[3].pressed);
        if (y && !this._gearY) Gear.open(this, 'pause');
        this._gearY = y;
      } else this._gearY = true; // чтобы нажатая вне паузы Y не открыла экран при входе в паузу
    }
    return updO.call(this, t, d);
  };
}

const showPauseO = UIScene.prototype.showPause;
Object.assign(UIScene.prototype, {
  showPause(on) {
    showPauseO.call(this, on);
    if (!on || !this.ready || this.gs.sr) return;
    if (!this.gearBtn || !this.gearBtn.scene) {
      const F = '"Cormorant SC", Georgia, serif';
      const t = this.add.text(VW / 2, 478, Touch.enabled ? 'Снаряжение' : 'Снаряжение (I)', { fontFamily: F, fontSize: '23px', color: '#cfe8dc', fontStyle: '700', backgroundColor: 'rgba(20,48,41,0.9)', padding: { x: 18, y: 8 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffd47a')); t.on('pointerout', () => t.setColor('#cfe8dc')); t.on('pointerdown', () => Gear.open(this.gs, 'pause'));
      this.pause.add(t); this.gearBtn = t;
      if (!this._gearI) { this._gearI = () => { if (this.pause.visible && !this.gs.gearOpen) Gear.open(this.gs, 'pause'); }; this.input.keyboard.on('keydown-I', this._gearI); }
    }
  },

  gearBuild() {
    if (this.gearC && this.gearC.scene) this.gearC.destroy();
    const D = '"Cormorant SC", Georgia, serif', F = '"Fira Sans", sans-serif';
    const x0 = VW / 2 - 340, c = this.add.container(0, 0).setVisible(false).setDepth(60);
    this.gearX0 = x0;
    const bg = this.add.graphics(); bg.fillStyle(0x030807, 0.96); bg.fillRect(0, 0, VW, VH);
    bg.fillStyle(0x0b1714, 1); bg.fillRoundedRect(x0, 30, 680, 480, 10); bg.lineStyle(2, 0x3c5a50, 1); bg.strokeRoundedRect(x0, 30, 680, 480, 10);
    bg.lineStyle(1, 0x24403a, 1); bg.lineBetween(x0 + 340, 134, x0 + 340, 424);
    const title = this.add.text(VW / 2, 62, 'Снаряжение', { fontFamily: D, fontSize: '38px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5);
    this.gearBeads = this.add.text(x0 + 24, 50, '', { fontFamily: F, fontSize: '16px', color: '#ffe3a3' });
    const close = this.add.text(x0 + 656, 50, Touch.enabled ? 'Закрыть' : 'Закрыть (Esc)', { fontFamily: F, fontSize: '14px', color: '#cfe8dc', backgroundColor: 'rgba(20,48,41,0.9)', padding: { x: 10, y: 5 } }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    close.on('pointerover', () => close.setColor('#ffd47a')); close.on('pointerout', () => close.setColor('#cfe8dc')); close.on('pointerdown', () => Gear.close(this.gs));
    this.gearTabs = Gear.KINDS.map((k, i) => {
      const t = this.add.text(x0 + 24, 100, Gear.NAMES[k], { fontFamily: D, fontSize: '22px', fontStyle: '700', color: '#86a89a', padding: { x: 10, y: 4 } }).setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => { this.gearKind = i; this.gearSel = 0; this.gearOff = 0; this.gearRefresh(); });
      return t;
    });
    { let tx = x0 + 18; for (const t of this.gearTabs) { t.setX(tx); tx += t.width + 14; } }
    this.gearSelG = this.add.graphics();
    this.gearRows = [];
    for (let i = 0; i < Gear.ROWS; i++) {
      const y = 140 + i * Gear.ROWH;
      const name = this.add.text(x0 + 30, y + 5, '', { fontFamily: D, fontSize: '21px', color: '#cfe8dc', fontStyle: '700' });
      const stt = this.add.text(x0 + 322, y + 9, '', { fontFamily: F, fontSize: '13px', fontStyle: '600', color: '#86a89a' }).setOrigin(1, 0);
      const hit = this.add.rectangle(x0 + 175, y + Gear.ROWH / 2 - 1, 306, Gear.ROWH - 2, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { if (!Touch.enabled && this.gearItemsN > i + this.gearOff) { this.gearSel = i + this.gearOff; this.gearRefresh(); } });
      hit.on('pointerdown', () => {
        const idx = i + this.gearOff; if (idx >= this.gearItemsN) return;
        if (this.gearSel === idx) this.gearAct(); else { this.gearSel = idx; this.gearRefresh(); }
      });
      this.gearRows.push({ name, stt, hit, y });
      c.add([name, stt, hit]);
    }
    this.gearUp = this.add.text(x0 + 322, 128, '▲', { fontFamily: F, fontSize: '13px', color: '#ffd47a' }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    this.gearDn = this.add.text(x0 + 322, 428, '▼', { fontFamily: F, fontSize: '13px', color: '#ffd47a' }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    this.gearUp.on('pointerdown', () => this.gearMove(-1)); this.gearDn.on('pointerdown', () => this.gearMove(1));
    this.gearEmpty = this.add.text(x0 + 30, 160, 'Пока ничего нет', { fontFamily: F, fontSize: '14px', color: '#6f9586' });
    // правая панель
    const rx = x0 + 362;
    this.gearName = this.add.text(rx, 140, '', { fontFamily: D, fontSize: '30px', color: '#e8e2cf', fontStyle: '700', wordWrap: { width: 300 } });
    this.gearSub = this.add.text(rx, 178, '', { fontFamily: F, fontSize: '12px', color: '#86a89a' });
    this.gearDesc = this.add.text(rx, 202, '', { fontFamily: F, fontSize: '14px', color: '#b9d4c8', lineSpacing: 4, wordWrap: { width: 300 } });
    this.gearStat = this.add.text(rx, 300, '', { fontFamily: F, fontSize: '13px', color: '#9ff0c8', lineSpacing: 4 });
    this.gearBtn2 = this.add.text(rx, 372, '', { fontFamily: D, fontSize: '22px', fontStyle: '700', color: '#cfe8dc', backgroundColor: 'rgba(20,48,41,0.9)', padding: { x: 14, y: 6 } }).setInteractive({ useHandCursor: true });
    this.gearBtn2.on('pointerdown', () => this.gearAct());
    this.gearSayT = this.add.text(rx, 410, '', { fontFamily: F, fontSize: '12px', color: '#ffe3a3', wordWrap: { width: 300 } });
    // слоты оберегов
    this.gearSlotG = this.add.graphics();
    const sl = this.add.text(x0 + 24, 436, 'Слоты оберегов:', { fontFamily: F, fontSize: '13px', color: '#86a89a' });
    this.gearSlotT = [0, 1, 2].map(() => this.add.text(0, 0, '', { fontFamily: F, fontSize: '11px', color: '#e8e2cf', align: 'center', wordWrap: { width: 96 } }).setOrigin(0.5));
    this.gearHint = this.add.text(VW / 2, 496, '', { fontFamily: F, fontSize: '12px', color: '#6f9586' }).setOrigin(0.5);
    c.add([bg, title, this.gearBeads, close, ...this.gearTabs, this.gearSelG, this.gearUp, this.gearDn, this.gearEmpty, this.gearName, this.gearSub, this.gearDesc, this.gearStat, this.gearBtn2, this.gearSayT, this.gearSlotG, sl, ...this.gearSlotT, this.gearHint]);
    c.sendToBack(this.gearSelG); c.sendToBack(bg);
    this.gearC = c; this.gearKind = 0; this.gearSel = 0; this.gearOff = 0;
    if (this._gearKey) this.input.keyboard.off('keydown', this._gearKey);
    this._gearKey = (e) => {
      if (!this.gearC || !this.gearC.visible) return;
      const k = e.code;
      if (k === 'ArrowUp' || k === 'KeyW') this.gearMove(-1);
      else if (k === 'ArrowDown' || k === 'KeyS') this.gearMove(1);
      else if (k === 'ArrowLeft' || k === 'KeyA' || k === 'KeyQ') this.gearTab(-1);
      else if (k === 'ArrowRight' || k === 'KeyD' || k === 'KeyE') this.gearTab(1);
      else if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space' || k === 'KeyF' || k === 'KeyZ' || k === 'KeyX') this.gearAct();
      else if (k === 'Escape' || k === 'Backspace') Gear.close(this.gs);
    };
    this.input.keyboard.on('keydown', this._gearKey);
    if (this._gearWheel) this.input.off('wheel', this._gearWheel);
    this._gearWheel = (p, o, dx, dy) => { if (this.gearC && this.gearC.visible) this.gearMove(dy > 0 ? 1 : -1); };
    this.input.on('wheel', this._gearWheel);
  },
  gearShow(from) {
    if (!this.ready) return;
    this.gearBuild();
    if (from === 'shop' && this.shopC) this.shopC.setVisible(false);
    this.gearC.setVisible(true); this.gearSayT.setText('');
    this.gearRefresh();
  },
  gearHide(from) {
    if (this.gearC) this.gearC.setVisible(false);
    if (from === 'shop' && this.gs.shopOpen && this.shopC && this.shopC.scene) { this.shopC.setVisible(true); this.shopRefresh(); }
  },
  gearList() { return Gear.items(this.gs, Gear.KINDS[this.gearKind]); },
  gearMove(d) {
    const n = this.gearItemsN || 0; if (!n) return;
    this.gearSel = clamp(this.gearSel + d, 0, n - 1); this.gearRefresh();
  },
  gearTab(d) { const n = Gear.KINDS.length; this.gearKind = (this.gearKind + d + n) % n; this.gearSel = 0; this.gearOff = 0; this.gearRefresh(); },
  gearAct() {
    const list = this.gearList(), it = list[this.gearSel]; if (!it) return;
    Gear.doAct(this.gs, Gear.KINDS[this.gearKind], it); this.gearRefresh();
  },
  gearSay(m) {
    if (!this.gearSayT) return;
    this.gearSayT.setText(m); this.tweens.killTweensOf(this.gearSayT); this.gearSayT.setAlpha(1);
    this.tweens.add({ targets: this.gearSayT, alpha: 0, delay: 2600, duration: 500 });
  },
  gearRefresh() {
    const gs = this.gs, kind = Gear.KINDS[this.gearKind], list = this.gearList(), g = this.gearSelG, x0 = this.gearX0;
    g.clear();
    this.gearItemsN = list.length;
    this.gearSel = clamp(this.gearSel, 0, Math.max(0, list.length - 1));
    if (this.gearSel < this.gearOff) this.gearOff = this.gearSel;
    if (this.gearSel >= this.gearOff + Gear.ROWS) this.gearOff = this.gearSel - Gear.ROWS + 1;
    this.gearOff = clamp(this.gearOff, 0, Math.max(0, list.length - Gear.ROWS));
    this.gearBeads.setText(`Бусин: ${gs.beads}`);
    this.gearTabs.forEach((t, i) => {
      const on = i === this.gearKind; t.setColor(on ? '#ffd47a' : '#86a89a');
      if (on) { g.lineStyle(2, 0xffd47a, 0.9); g.lineBetween(t.x + 8, 128, t.x + t.width - 8, 128); }
    });
    this.gearEmpty.setVisible(!list.length);
    const eqIds = Gear.equippedIds(gs, kind);
    this.gearRows.forEach((r, i) => {
      const idx = i + this.gearOff, it = list[idx];
      r.hit.setVisible(!!it); r.name.setVisible(!!it); r.stt.setVisible(!!it);
      if (!it) return;
      const sel = idx === this.gearSel, eq = eqIds.includes(it.id);
      if (sel) { g.fillStyle(0x1d3a31, 0.9); g.fillRoundedRect(x0 + 24, r.y, 316, Gear.ROWH - 2, 5); g.lineStyle(1.5, 0xffd47a, 0.8); g.strokeRoundedRect(x0 + 24, r.y, 316, Gear.ROWH - 2, 5); }
      if (kind === 'charms' && it.owned) { g.fillStyle(it.e.col || 0xcfe8dc, 1); g.fillCircle(x0 + 36, r.y + Gear.ROWH / 2 - 1, 3.5); }
      r.name.setText(it.e.name).setColor(!it.owned ? '#5d7a6e' : sel ? '#ffd47a' : '#cfe8dc').setX(x0 + (kind === 'charms' && it.owned ? 46 : 32));
      const pr = Gear.price(it.e);
      if (!it.owned) r.stt.setText(pr ? `${pr} бусин` : 'закрыто').setColor(pr && gs.beads >= pr ? '#ffe3a3' : '#7a6a58');
      else r.stt.setText(eq ? 'надето' : '').setColor('#9ff0c8');
    });
    this.gearUp.setVisible(this.gearOff > 0); this.gearDn.setVisible(this.gearOff + Gear.ROWS < list.length);
    // правая панель
    const it = list[this.gearSel];
    if (!it) {
      this.gearName.setText(Gear.NAMES[kind]); this.gearSub.setText(''); this.gearDesc.setText('Здесь пока пусто: предметы появятся по ходу игры.'); this.gearStat.setText(''); this.gearBtn2.setVisible(false);
    } else {
      const st = Gear.state(gs, kind, it), e = it.e;
      this.gearName.setText(e.name);
      this.gearSub.setText(!it.owned ? Gear.lockText(e) : st.eq ? 'Надето' : it.none ? '' : 'Есть у вас');
      this.gearDesc.setText(e.desc || '');
      this.gearStat.setText(it.none ? '' : Gear.stats(kind, e));
      const col = st.act === 'none' ? (st.eq ? '#9ff0c8' : '#7a6a58') : st.ok ? '#ffe3a3' : '#7a6a58';
      this.gearBtn2.setVisible(true).setText(st.label).setColor(col);
    }
    this.drawGearSlots(gs);
    this.gearHint.setText(Touch.enabled ? 'Нажмите на предмет, затем на кнопку действия' : '↑↓ выбор · ←→ раздел · Enter надеть/купить · Esc назад · геймпад: A, B, LB/RB');
  },
  drawGearSlots(gs) {
    const g = this.gearSlotG, x0 = this.gearX0, W = 100, H = 30, y = 454; g.clear();
    const list = Loadout.equipped(gs).charms, used = [];
    let s = 0; const place = [];
    for (const id of list) { const n = Loadout.slotsOf(id); place.push({ id, s, n }); s += n; }
    for (let i = 0; i < CHARM_SLOTS; i++) used.push(false);
    this.gearSlotT.forEach((t) => t.setText(''));
    for (let i = 0; i < CHARM_SLOTS; i++) {
      const x = x0 + 24 + i * (W + 8), p = place.find((q) => i >= q.s && i < q.s + q.n);
      g.fillStyle(p ? 0x1d3a31 : 0x0e1c18, 1); g.fillRoundedRect(x, y, W, H, 5);
      g.lineStyle(1.5, p ? (CHARMS[p.id] && CHARMS[p.id].col) || 0xffd47a : 0x2c4a41, 1); g.strokeRoundedRect(x, y, W, H, 5);
    }
    place.forEach((q, k) => {
      const e = CHARMS[q.id], cx = x0 + 24 + q.s * (W + 8) + (q.n * W + (q.n - 1) * 8) / 2;
      if (this.gearSlotT[k]) this.gearSlotT[k].setPosition(cx, y + H / 2).setText(e ? e.name : q.id);
      if (q.n > 1) { // двойной оберег закрашивает щель между слотами
        const gx = x0 + 24 + q.s * (W + 8) + W; g.fillStyle(0x1d3a31, 1); g.fillRect(gx - 1, y + 1, 10, H - 2);
      }
    });
  },
});
