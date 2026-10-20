// ===== ДОСТУПНОСТЬ: переназначение клавиш, скорость игры, «без вспышек», «контуры опасного» =====
const Access = {
  ACTS: [['left', 'Идти влево'], ['right', 'Идти вправо'], ['up', 'Вверх (удар вверх, скамья)'], ['down', 'Вниз (удар вниз, лавка)'],
    ['jump', 'Прыжок'], ['atk', 'Удар'], ['dash', 'Рывок'], ['heal', 'Нить: лечение и отбив'], ['bomb', 'Дымовуха'], ['tool', 'Инструмент']],
  DEF: { left: [65, 'A'], right: [68, 'D'], up: [87, 'W'], down: [83, 'S'], jump: [32, 'Пробел'], atk: [70, 'F'], dash: [71, 'G'], heal: [81, 'Q'], bomb: [82, 'R'], tool: [69, 'E'] },
  // клавиши игрока 2, стрелок и запасной раскладки заняты и не отдаются
  RESERVED: new Set([27, 37, 38, 39, 40, 96, 97, 98, 99, 100, 188, 190, 191, 77, 78, 90, 88, 67, 86, 66]),
  keys: null, listening: null, scene: null,
  load() {
    this.keys = {};
    for (const a in this.DEF) this.keys[a] = [...this.DEF[a]];
    try {
      const raw = JSON.parse(localStorage.getItem('tt_keys') || 'null');
      if (raw) for (const a in this.DEF) if (raw[a] && typeof raw[a][0] === 'number' && typeof raw[a][1] === 'string') this.keys[a] = [raw[a][0], raw[a][1].slice(0, 12)];
    } catch (_) { }
    // защита от битого сохранения: дубликаты или занятые клавиши — сброс по умолчанию
    const seen = new Set();
    for (const a in this.keys) { const c = this.keys[a][0]; if (seen.has(c) || this.RESERVED.has(c)) { this.reset(); return; } seen.add(c); }
  },
  save() { try { localStorage.setItem('tt_keys', JSON.stringify(this.keys)); } catch (_) { } },
  reset() { this.keys = {}; for (const a in this.DEF) this.keys[a] = [...this.DEF[a]]; this.save(); },
  name(a) { return this.keys[a][1]; },
  codeOf(a) { return this.keys[a][0]; },
  label(e) {
    const c = e.code || '';
    const m = { Space: 'Пробел', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\', CapsLock: 'Caps' };
    if (m[c]) return m[c];
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit\d$/.test(c)) return c.slice(5);
    if (/^Numpad/.test(c)) return 'Num ' + c.slice(6);
    return (e.key && e.key.length <= 8 ? e.key.toUpperCase() : c || String(e.keyCode)).slice(0, 12);
  },
  // назначение клавиши действию; если она уже стоит на другом действии, они меняются местами
  assign(act, code, name) {
    if (this.RESERVED.has(code)) return false;
    const old = this.keys[act].slice();
    for (const a in this.keys) if (a !== act && this.keys[a][0] === code) this.keys[a] = old;
    this.keys[act] = [code, name]; this.save(); return true;
  },
  // строка подсказки про раскладку игрока 1 (для меню и паузы)
  line(sep) {
    const n = (a) => this.name(a), mv = [n('left'), n('right'), n('up'), n('down')].join(' ');
    const sp = sep ? ' · ' : '   ';
    return `Игрок 1:  ${mv} — ходить${sp}${n('jump')} — прыжок${sp}${n('atk')} — удар${sp}${n('dash')} — рывок${sp}${n('heal')} — лечение${sp}${n('bomb')} — дымовуха`;
  },
  // подсказки на табличках уровня: подставляем актуальные клавиши
  sign(t) {
    const n = (a) => this.name(a);
    return t.replace('A / D —', `${n('left')} / ${n('right')} —`).replace('Пробел — прыжок', `${n('jump')} — прыжок`)
      .replace('F — удар', `${n('atk')} — удар`).replace('Q — связать', `${n('heal')} — связать`).replace('G — рывок', `${n('dash')} — рывок`)
      .replace('Q без полной', `${n('heal')} без полной`).replace('Стик/↑ + Q', `Стик/${n('up')} + ${n('heal')}`).replace('S + F', `${n('down')} + ${n('atk')}`);
  },
  refreshPause(u) {
    if (!u || !u.ready || !u.pauseL1 || Touch.enabled) return;
    const ls = u.pauseL1.text.split('\n'); ls[0] = this.line(true); u.pauseL1.setText(ls.join('\n'));
  },
  speed() { return (this.scene && this.scene.online) ? 1 : (Settings.s.speed || 100) / 100; },
  // мягкое затемнение вместо белой вспышки
  dim(sc, d) {
    const u = sc.ui && sc.ui(); if (!u || !u.ready || !u.add) return;
    const r = u.add.rectangle(VW / 2, VH / 2, VW, VH, 0x050c0a, 0.34).setDepth(50);
    u.tweens.add({ targets: r, alpha: 0, duration: Math.max(260, d * 1.3), onComplete: () => r.destroy() });
  },

  // ----- экран «Управление» -----
  init() {
    this.load();
    const el = this.el = document.getElementById('keys');
    const render = () => {
      const box = el.querySelector('.kr'); box.innerHTML = '';
      for (const [a, t] of this.ACTS) {
        const row = document.createElement('div'); row.className = 'krow';
        const l = document.createElement('span'); l.textContent = t;
        const b = document.createElement('button'); b.type = 'button'; b.dataset.act = a; b.className = 'kb';
        b.textContent = this.listening === a ? 'Нажмите клавишу…' : this.name(a);
        if (this.listening === a) b.classList.add('listen');
        b.addEventListener('click', () => { this.listening = this.listening === a ? null : a; this.note(''); render(); });
        row.append(l, b); box.append(row);
      }
    };
    this.render = render;
    el.querySelector('#kb-def').addEventListener('click', () => { this.reset(); this.listening = null; render(); this.note('Клавиши возвращены по умолчанию', true); });
    Ov.chrome(el, { crumbs: ['Настройки', 'Управление', 'Клавиши'], back: () => this.hide(), hint: { act: 'назначить' } });
    document.getElementById('st-keys').addEventListener('click', () => this.show());
    window.addEventListener('keydown', (e) => {
      if (el.hidden) return;
      e.stopPropagation(); // пока открыт экран, игра клавиш не видит
      if (this.listening) {
        e.preventDefault();
        if (e.key === 'Escape') { this.listening = null; render(); this.note(''); return; }
        if (e.repeat) return;
        const a = this.listening, nm = this.label(e), ok = this.assign(a, e.keyCode, nm);
        this.listening = null; render();
        this.note(ok ? `«${nm}» назначена` : 'Эта клавиша занята игроком 2 или запасной раскладкой', true);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
    }, true);
  },
  note(t, keep) { const n = this.el.querySelector('#kb-note'); n.textContent = t || 'Нажмите на действие, затем на нужную клавишу. Если она уже занята, действия поменяются местами.'; n.dataset.keep = keep ? '1' : ''; },
  show() {
    this.listening = null; this.render(); this.note(''); this.el.hidden = false; Ov.crumbs(this.el, [...(Settings.crumbList || ['Настройки']), 'Клавиши']); Ov.opened(this.el);
    setTimeout(() => this.el.querySelector('.kb').focus(), 0);
  },
  hide() { this.listening = null; this.el.hidden = true; if (this.scene && this.scene.ui) this.refreshPause(this.scene.ui()); const b = document.getElementById('st-keys'); if (b) b.focus(); },
};

(function () {
  const G = GameScene.prototype;
  // раскладка игрока 1 из настроек
  const setupO = G.setupInput;
  G.setupInput = function () {
    setupO.call(this);
    const k = this.input.keyboard, o = {};
    for (const [a] of Access.ACTS) o[a] = [k.addKey(Access.codeOf(a))];
    this.kb1 = o;
  };
  const createO = G.create;
  G.create = function (...a) {
    this.accG = null; Access.scene = this;
    createO.apply(this, a);
    const cam = this.cameras.main, flashO = cam.flash.bind(cam);
    cam.flash = (d, ...c) => { if (!Settings.s.noflash) return flashO(d, ...c); Access.dim(this, d || 250); return cam; };
    this.events.once('shutdown', () => { if (Access.scene === this) Access.scene = null; });
  };
  // замедление игры (по сети всегда 100 %)
  const updO = G.update;
  G.update = function (time, delta) { Access.scene = this; return updO.call(this, time, delta * Access.speed()); };
  // яркие контуры снарядов и шипов
  const NOT_HARM = new Set(['bomb', 'ringfx', 'staffghost', 'mark']);
  const renderO = G.render;
  G.render = function (dt) {
    renderO.call(this, dt);
    if (!Settings.s.outl || this.td) { if (this.accG) this.accG.clear(); return; }
    if (!this.accG || !this.accG.scene) this.accG = this.add.graphics().setDepth(8.5);
    const g = this.accG; g.clear();
    const line = (x, y, w, h) => {
      g.lineStyle(5, 0x000000, 0.65); g.strokeRect(x, y, w, h);
      g.lineStyle(2.5, 0xffe600, 1); g.strokeRect(x, y, w, h);
    };
    const wv = this.cameras.main.worldView;
    if (this._spkFor !== this.grid) {
      this._spkFor = this.grid; this._spk = [];
      for (let y = 0; y < this.L.H; y++) for (let x = 0; x < this.L.W; x++) if (this.grid[y][x] === SPIKE) this._spk.push([x * T, y * T]);
    }
    for (const [x, y] of this._spk) if (x > wv.x - T && x < wv.right && y > wv.y - T && y < wv.bottom) line(x + 1, y + T * 0.38, T - 2, T * 0.62);
    for (const pr of this.projs) {
      if (pr.dead || pr.delay > 0 || NOT_HARM.has(pr.kind) || !(pr.w > 0)) continue;
      line(pr.x - 1, pr.y - 1, pr.w + 2, pr.h + 2);
    }
  };
  // подсказки в паузе обновляем при каждом показе
  const sp = UIScene.prototype.showPause;
  UIScene.prototype.showPause = function (on) {
    if (on) Access.refreshPause(this);
    return sp.call(this, on);
  };
})();
