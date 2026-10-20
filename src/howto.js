// ===== «КАК ИГРАТЬ» И «ЧТО НОВОГО»: заглушки с публичным API =====
// Контракт для меню (src/menu.js): HowTo.show(onClose, section?) и Changelog.show(onClose). onClose вызывается, когда экран закрыт.
// Эти заглушки — простые HTML-экраны на общем каркасе Ov (хлебные крошки, «← Назад», подсказки); их можно заменить настоящими
// экранами с тем же API: меню знает только про show(onClose) и ничего больше.
const HowTo = {
  el: null, onClose: null,
  SECTIONS: {
    controls: ['Управление', () => [Access.line(false), 'Игрок 2: стрелки · Num1 или / — прыжок · Num2 или . — удар · Num3 или , — рывок · Num0 или M — лечение · Num4 или N — дымовуха', 'Геймпад: A прыжок · X удар · B / RT рывок · Y нить · LB дымовуха · RB инструмент · Start пауза']],
    combat: ['Бой', () => ['Удар иглой копит нить; лечение — 0,8 с на месте. Рывок сквозь атаку — идеальный уворот.', 'Отбив и нитяной всполох бьют броню; оглушённого босса можно казнить ударом вверх или вниз.']],
    bosses: ['Боссы', () => BOSSES.map((b) => b.name + ' — ' + b.about)],
  },
  build() {
    if (this.el) return;
    const el = this.el = document.createElement('div'); el.id = 'howto'; el.hidden = true;
    el.innerHTML = '<div class="card" role="dialog" aria-label="Как играть"><h2>Как играть</h2><div class="ht-body"></div></div>';
    document.body.appendChild(el);
    Ov.chrome(el, { crumbs: ['Как играть'], back: () => this.hide(), hint: { act: 'нажать', back: true } });
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.hide(); });
  },
  show(onClose, section) {
    this.build(); this.onClose = onClose || null;
    const body = this.el.querySelector('.ht-body'); body.innerHTML = '';
    for (const id of section && this.SECTIONS[section] ? [section] : Object.keys(this.SECTIONS)) {
      const [name, f] = this.SECTIONS[id], h = document.createElement('h3'); h.textContent = name; body.append(h);
      for (const t of f()) { const p = document.createElement('p'); p.textContent = t; body.append(p); }
    }
    this.el.hidden = false; Ov.opened(this.el);
    setTimeout(() => this.el.querySelector('.ovback').focus(), 0);
  },
  hide() { if (!this.el || this.el.hidden) return; this.el.hidden = true; const cb = this.onClose; this.onClose = null; if (cb) cb(); },
};

const Changelog = {
  el: null, onClose: null,
  build() {
    if (this.el) return;
    const el = this.el = document.createElement('div'); el.id = 'changelog'; el.hidden = true;
    el.innerHTML = '<div class="card" role="dialog" aria-label="Что нового"><h2>Что нового</h2><ul class="cl-list"></ul></div>';
    document.body.appendChild(el);
    Ov.chrome(el, { crumbs: ['Что нового'], back: () => this.hide(), hint: { act: 'нажать', back: true } });
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.hide(); });
  },
  show(onClose) {
    this.build(); this.onClose = onClose || null;
    const ul = this.el.querySelector('.cl-list'); ul.innerHTML = '';
    for (const l of CHANGELOG) { const li = document.createElement('li'); li.textContent = l; ul.append(li); }
    this.el.hidden = false; Ov.opened(this.el);
    setTimeout(() => this.el.querySelector('.ovback').focus(), 0);
  },
  hide() { if (!this.el || this.el.hidden) return; this.el.hidden = true; const cb = this.onClose; this.onClose = null; if (cb) cb(); },
};
