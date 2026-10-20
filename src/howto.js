// ===== «КАК ИГРАТЬ» И «ЧТО НОВОГО»: полноэкранные окна поверх игры и меню =====
// Глобальные объекты (их зовут и главное меню, и пауза):
//   HowTo.show(onClose, section?)   section: 'controls' | 'moves' | 'coop' | 'bosses' (или номер вкладки 0..3)
//   Changelog.show(onClose)
// Окна — обычные HTML-элементы (как «Настройки»): настоящие пиксели на любом экране, прокрутка колёсиком и пальцем.
// Управление: клавиши (← → вкладки, ↑ ↓ прокрутка, Esc / Backspace — назад), геймпад (крестовина/стик, LB RB, B), касание.
// Пока окно открыто, игра клавиш не видит (перехват на window), а пауза по Start не снимается (см. ingame.js).
const Sheet = {
  cur: null, _css: false,
  injectCss() {
    if (this._css) return; this._css = true;
    const s = document.createElement('style');
    s.textContent = `
.hw { position: fixed; inset: 0; z-index: 8; background: #070d0c; color: #e8e2cf; display: flex; justify-content: center; box-sizing: border-box;
  font-family: var(--body, "Fira Sans", system-ui, sans-serif);
  padding: max(10px, var(--st, 0px)) max(14px, var(--sr, 0px)) max(8px, var(--sb, 0px)) max(14px, var(--sl, 0px)); }
.hw * { box-sizing: border-box; }
.hw-card { width: min(900px, 100%); height: 100%; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.hw-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none; }
.hw-head h2 { font: 700 34px var(--display, "Cormorant SC", Georgia, serif); margin: 0; color: #e8e2cf; letter-spacing: 0.01em; }
.hw-head .hw-ver { font-size: 13px; color: #6f9586; margin-left: 12px; font-weight: 400; font-family: var(--body, system-ui, sans-serif); letter-spacing: 0; }
.hw button { font: 600 15px var(--body, "Fira Sans", system-ui, sans-serif); border-radius: 7px; padding: 8px 14px; min-height: 38px; cursor: pointer;
  border: 1px solid #3a6b5a; background: #143029; color: #e8e2cf; }
.hw button:hover { border-color: #9ff0c8; }
.hw button:focus-visible { outline: 2px solid #ffd47a; outline-offset: 2px; }
.hw-body:focus { outline: none; }
.hw-tabs { display: flex; gap: 6px; flex: none; flex-wrap: wrap; }
.hw-tabs button { flex: 1 1 0; min-width: 0; padding: 6px 8px; background: #0c1815; color: #b9d4c8; }
.hw-tabs button[aria-selected=true] { background: #67ad62; border-color: #67ad62; color: #08130f; }
.hw-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y; scrollbar-color: #3a6b5a #0c1815;
  background: #0c1815; border: 1px solid #24433a; border-radius: 10px; padding: 14px 18px 18px; font-size: 15px; line-height: 1.45; color: #cfe2d8; user-select: none; -webkit-user-select: none; }
.hw-body h3 { font: 700 21px var(--display, "Cormorant SC", Georgia, serif); margin: 0 0 4px; color: #e8e2cf; }
.hw-body h4 { font: 600 12px var(--body, system-ui, sans-serif); letter-spacing: 0.08em; text-transform: uppercase; color: #6f9586; margin: 14px 0 6px; }
.hw-body h4:first-child { margin-top: 0; }
.hw-body p { margin: 0 0 6px; }
.hw-body .sub { color: #8fb8a8; font-size: 13px; }
.hw-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); gap: 10px 16px; }
.hw-it { background: #0f1f1b; border: 1px solid #1d3a31; border-radius: 8px; padding: 10px 12px; }
.hw-it.lock { opacity: 0.75; border-style: dashed; }
.hw-it .tag { font-size: 12px; color: #ffd47a; margin-bottom: 4px; }
.hw-it ul { margin: 4px 0 0; padding-left: 18px; }
.hw-it li { margin: 0 0 3px; }
.hw-rows { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 6px 22px; margin-bottom: 4px; }
.hw-row { display: flex; align-items: baseline; gap: 10px; border-bottom: 1px solid #16302a; padding: 4px 0; }
.hw-row > span { flex: 1; min-width: 0; }
.hw kbd { font: 600 13px var(--body, system-ui, sans-serif); display: inline-block; min-width: 1.6em; text-align: center; padding: 1px 7px; margin: 0 1px; border-radius: 5px;
  background: #1a3a31; border: 1px solid #3a6b5a; color: #ffe3a3; white-space: nowrap; }
.hw-row kbd { flex: none; }
.hw-cur { display: inline-block; font-size: 12px; font-weight: 600; background: #67ad62; color: #08130f; border-radius: 5px; padding: 1px 7px; margin-left: 8px; vertical-align: middle; font-family: var(--body, system-ui, sans-serif); letter-spacing: 0; text-transform: none; }
.hw-foot { flex: none; font-size: 13px; color: #6f9586; text-align: center; min-height: 18px; }
.hw-log { list-style: none; margin: 0; padding: 0; }
.hw-log li { padding: 7px 0; border-bottom: 1px solid #16302a; }
.hw-log li:last-child { border-bottom: 0; }
@media (max-height: 520px) {
  .hw { padding-top: max(6px, var(--st, 0px)); padding-bottom: max(4px, var(--sb, 0px)); }
  .hw-card { gap: 5px; }
  .hw-head h2 { font-size: 26px; }
  .hw button { min-height: 34px; padding: 5px 12px; font-size: 14px; }
  .hw-body { font-size: 14px; line-height: 1.38; padding: 10px 12px 14px; }
  .hw-body h3 { font-size: 19px; }
  .hw-foot { font-size: 12px; }
}
@media (max-width: 560px) { .hw-head h2 { font-size: 28px; } .hw-tabs button { font-size: 13px; padding: 6px 4px; } }
`;
    document.head.appendChild(s);
  },
  // «текст [[клавиша]] текст» → текст и <kbd>
  rich(el, str) {
    String(str).split(/(\[\[.*?\]\])/).forEach((part) => {
      if (!part) return;
      if (part.startsWith('[[')) { const k = document.createElement('kbd'); k.textContent = part.slice(2, -2); el.appendChild(k); }
      else el.appendChild(document.createTextNode(part));
    });
    return el;
  },
  h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; },
  // cfg: { id, title, ver?, tabs: [{ name, build(body) }], tab, onClose, foot() }
  open(cfg) {
    if (this.cur) this.close(true);
    this.injectCss();
    const S = this, h = this.h;
    const el = h('div', 'hw'); el.id = cfg.id; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', cfg.title);
    const card = h('div', 'hw-card'), head = h('div', 'hw-head'), ttl = h('h2', '', cfg.title);
    if (cfg.ver) ttl.appendChild(h('span', 'hw-ver', cfg.ver));
    const back = h('button', 'hw-back', '← Назад'); back.type = 'button';
    head.append(ttl, back); card.appendChild(head);
    const tabsEl = h('div', 'hw-tabs'); tabsEl.setAttribute('role', 'tablist');
    const tabBtns = (cfg.tabs.length > 1 ? cfg.tabs : []).map((t, i) => {
      const b = h('button', '', t.name); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = String(i);
      b.addEventListener('click', () => S.tab(i)); tabsEl.appendChild(b); return b;
    });
    if (tabBtns.length) card.appendChild(tabsEl);
    const body = h('div', 'hw-body'); body.tabIndex = 0; card.appendChild(body);
    const foot = h('div', 'hw-foot'); card.appendChild(foot);
    el.appendChild(card); document.body.appendChild(el);
    const st = { cfg, el, body, foot, tabBtns, i: 0, raf: 0, prev: null, last: performance.now(), closed: false };
    this.cur = st;
    back.addEventListener('click', () => S.close());
    // игра и меню не должны видеть клавиш, пока окно открыто
    st.onKey = (e) => { S.key(e); };
    window.addEventListener('keydown', st.onKey, true);
    st.onKeyUp = (e) => { e.stopImmediatePropagation(); };
    window.addEventListener('keyup', st.onKeyUp, true);
    const loop = (now) => { if (S.cur !== st) return; S.pad(now); st.raf = requestAnimationFrame(loop); };
    st.raf = requestAnimationFrame(loop);
    this.tab(cfg.tab || 0);
    setTimeout(() => { if (S.cur === st) body.focus({ preventScroll: true }); }, 0);
    return st;
  },
  tab(i) {
    const st = this.cur; if (!st) return;
    const n = st.cfg.tabs.length; i = (i % n + n) % n; st.i = i;
    st.body.textContent = ''; st.cfg.tabs[i].build(st.body);
    st.body.scrollTop = 0;
    st.tabBtns.forEach((b, k) => { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
    st.foot.textContent = st.cfg.foot ? st.cfg.foot() : '';
  },
  scroll(dy) { const st = this.cur; if (st) st.body.scrollTop += dy; },
  key(e) {
    const st = this.cur; if (!st) return;
    // Enter и Пробел на кнопке работают как обычно, остальное игра не увидит
    e.stopImmediatePropagation();
    const k = e.code, many = st.cfg.tabs.length > 1;
    let used = true;
    if (k === 'Escape' || k === 'Backspace') { if (!e.repeat) this.close(); }
    else if (many && (k === 'ArrowLeft' || k === 'KeyA' || k === 'KeyQ')) this.tab(st.i - 1);
    else if (many && (k === 'ArrowRight' || k === 'KeyD' || k === 'KeyE')) this.tab(st.i + 1);
    else if (many && /^Digit[1-9]$/.test(k) && +k.slice(5) <= st.cfg.tabs.length) this.tab(+k.slice(5) - 1);
    else if (k === 'ArrowUp' || k === 'KeyW') this.scroll(-64);
    else if (k === 'ArrowDown' || k === 'KeyS') this.scroll(64);
    else if (k === 'PageUp') this.scroll(-st.body.clientHeight * 0.85);
    else if (k === 'PageDown') this.scroll(st.body.clientHeight * 0.85);
    else if (k === 'Home') st.body.scrollTop = 0;
    else if (k === 'End') st.body.scrollTop = st.body.scrollHeight;
    else if (k === 'Space' && !(e.target && e.target.tagName === 'BUTTON')) this.scroll((e.shiftKey ? -1 : 1) * st.body.clientHeight * 0.85);
    else used = k === 'Tab' ? false : (k !== 'Enter' && k !== 'NumpadEnter' && k !== 'Space');
    if (used) e.preventDefault();
  },
  // геймпад: крестовина/стик — вкладки и прокрутка, LB/RB — вкладки, B / Start — назад
  pad(now) {
    const st = this.cur; if (!st || typeof Pads === 'undefined') return;
    const dt = Math.min(0.1, (now - st.last) / 1000); st.last = now;
    let s = { left: false, right: false, back: false, lb: false, rb: false, sy: 0 };
    for (const p of Pads.list()) {
      const r = Pads.read(p), b = (n) => !!(p.buttons[n] && p.buttons[n].pressed), ay = p.axes[1] || 0;
      s.left = s.left || r.left; s.right = s.right || r.right;
      s.back = s.back || b(1) || b(9) || b(8);
      s.lb = s.lb || b(4); s.rb = s.rb || b(5);
      s.sy += (b(13) ? 1 : 0) - (b(12) ? 1 : 0) + (Math.abs(ay) > 0.3 ? ay * 1.4 : 0);
    }
    const pv = st.prev; st.prev = s;
    if (!pv) return; // первый кадр: только запоминаем, чтобы нажатая при открытии кнопка не сработала
    const many = st.cfg.tabs.length > 1;
    if (many && ((s.left && !pv.left) || (s.lb && !pv.lb))) this.tab(st.i - 1);
    if (many && ((s.right && !pv.right) || (s.rb && !pv.rb))) this.tab(st.i + 1);
    if (s.sy) this.scroll(Math.max(-2, Math.min(2, s.sy)) * 420 * dt);
    if (s.back && !pv.back) this.close();
  },
  close(silent) {
    const st = this.cur; if (!st || st.closed) return;
    st.closed = true; this.cur = null;
    cancelAnimationFrame(st.raf);
    window.removeEventListener('keydown', st.onKey, true); window.removeEventListener('keyup', st.onKeyUp, true);
    st.el.remove();
    if (!silent && st.cfg.onClose) { try { st.cfg.onClose(); } catch (e) { console.error(e); } }
  },
};

// какое устройство сейчас в руках: геймпад (если им играли), касание или клавиатура
const HW_DEV = {
  cur() {
    if (typeof Pads !== 'undefined' && Pads.active && Pads.list().length) return 'pad';
    if (typeof Touch !== 'undefined' && Touch.enabled) return 'touch';
    return 'kb';
  },
  ps() { return typeof Pads !== 'undefined' && Pads.kindNow === 'ps'; },
  // название кнопки действия на выбранном устройстве
  key(dev, act) {
    if (dev === 'kb') { try { return Access.name(act); } catch (_) { return act; } }
    if (dev === 'pad') {
      const ps = this.ps();
      return { left: 'стик ←', right: 'стик →', up: 'стик ↑', down: 'стик ↓', jump: ps ? '✕' : 'A', atk: ps ? '□' : 'X', dash: ps ? '○ / R2' : 'B / RT',
        heal: ps ? '△ / L2' : 'Y / LT', bomb: ps ? 'L1' : 'LB', tool: ps ? 'R1' : 'RB', pause: ps ? 'Options' : 'Start', map: ps ? 'Create' : 'Back' }[act] || act;
    }
    return { left: 'стик ←', right: 'стик →', up: 'стик ↑', down: 'стик ↓', jump: 'Прыжок', atk: 'Удар', dash: 'Рывок', heal: 'Нить ✚', bomb: 'Бомба', tool: 'Инструмент', pause: '❚❚', map: '▤' }[act] || act;
  },
  name(dev) {
    if (dev === 'pad') return typeof Pads !== 'undefined' ? (Pads.kindNow === 'ps' ? 'DualSense / DualShock' : Pads.kindNow === 'deck' ? 'Steam Deck' : 'Xbox') : 'Геймпад';
    return dev === 'touch' ? 'Касание' : 'Клавиатура';
  },
};

const HowTo = {
  SECTIONS: ['controls', 'moves', 'coop', 'bosses'],
  get open() { return !!(Sheet.cur && Sheet.cur.cfg.id === 'howto'); },
  show(onClose, section) {
    let tab = typeof section === 'number' ? section : Math.max(0, this.SECTIONS.indexOf(section));
    if (typeof section === 'string' && /^\d+$/.test(section)) tab = +section;
    const self = this;
    return Sheet.open({
      id: 'howto', title: 'Как играть', onClose, tab,
      tabs: [
        { name: 'Управление', build: (b) => self.controls(b) },
        { name: 'Приёмы', build: (b) => self.moves(b) },
        { name: 'Кооп', build: (b) => self.coop(b) },
        { name: 'Боссы', build: (b) => self.bosses(b) },
      ],
      foot() {
        const d = HW_DEV.cur(), kb = '← → или Q E — вкладки · ↑ ↓, колёсико, Пробел — листать · Esc — назад';
        if (d === 'pad') return `Крестовина ◄ ► или ${HW_DEV.ps() ? 'L1 R1' : 'LB RB'} — вкладки · стик ▲▼ — листать · ${HW_DEV.ps() ? '○' : 'B'} — назад`;
        return d === 'touch' ? 'Проведите пальцем вверх или вниз, чтобы листать' : kb;
      },
    });
  },
  hide() { if (this.open) Sheet.close(); },

  // ----- вкладка «Управление»: текущее устройство первым -----
  controls(b) {
    const h = Sheet.h, cur = HW_DEV.cur(), order = [cur, ...['kb', 'pad', 'touch'].filter((d) => d !== cur)];
    const rows = (box, list) => { const g = h('div', 'hw-rows'); for (const [k, t] of list) { const r = h('div', 'hw-row'); const kb = h('kbd', '', k); const sp = h('span', '', t); r.append(kb, sp); g.appendChild(r); } box.appendChild(g); };
    order.forEach((d, idx) => {
      const t = h('h4', '', HW_DEV.name(d)); if (idx === 0) t.appendChild(h('span', 'hw-cur', 'сейчас')); b.appendChild(t);
      const K = (a) => HW_DEV.key(d, a);
      if (d === 'kb') {
        const n = (a) => Access.name(a);
        rows(b, [[`${n('left')} ${n('right')}`, 'Идти влево и вправо'], [`${n('up')} / ${n('down')}`, 'Вверх: удар вверх, скамья. Вниз: лавка, спрыгнуть с платформы'],
          [n('jump'), 'Прыжок (держите — выше)'], [n('atk'), 'Удар'], [n('dash'), 'Рывок'], [n('heal'), 'Нить: лечение, отбив, ↑ + нить — всполох'],
          [n('bomb'), 'Дымовуха (на арене Миши)'], [n('tool'), 'Инструмент'], ['Esc', 'Пауза'], ['M  /  Tab', 'Карта и переходы (вдвоём за одним экраном — Tab)'], ['I', 'Снаряжение (в паузе)']]);
        const p2 = h('p', 'sub'); Sheet.rich(p2, 'Игрок 2 (вдвоём за одним компьютером): [[← → ↑ ↓]] ходить · [[Num1]] или [[/]] прыжок · [[Num2]] или [[.]] удар · [[Num3]] или [[,]] рывок · [[Num0]] или [[M]] нить · [[Num4]] или [[N]] дымовуха · [[Num5]] или [[J]] инструмент.'); b.appendChild(p2);
        const p3 = h('p', 'sub'); Sheet.rich(p3, 'В одиночку можно и стрелками: [[← → ↑ ↓]] ходить · [[Z]] прыжок · [[X]] удар · [[C]] рывок · [[V]] нить · [[B]] дымовуха · [[E]] инструмент. Клавиши игрока 1 меняются в «Настройки → Управление».'); b.appendChild(p3);
      } else if (d === 'pad') {
        rows(b, [['Стик / ✛', 'Идти, ↑ — удар вверх, ↓ — вниз'], [K('jump'), 'Прыжок'], [K('atk'), 'Удар'], [K('dash'), 'Рывок'], [K('heal'), 'Нить: лечение, отбив, ↑ + нить — всполох'],
          [K('bomb'), 'Дымовуха (на арене Миши)'], [K('tool'), 'Инструмент'], [K('pause'), 'Пауза'], [K('map'), 'Карта и переходы']]);
        const p = h('p', 'sub', 'Геймпад подхватывается после первого нажатия кнопки. Сенсорные кнопки при этом прячутся.'); b.appendChild(p);
      } else {
        rows(b, [['Стик слева', 'Идти; вверх — удар вверх, сесть на скамью, поднять напарника; вниз — лавка'], ['Прыжок', 'Прыжок (держите — выше)'], ['Удар', 'Удар'], ['Рывок', 'Рывок'],
          ['Нить ✚', 'Лечение, отбив, всполох'], ['Инструмент', 'Если инструмент надет'], ['Бомба', 'Только на арене Миши'], ['❚❚', 'Пауза (рядом — ▤ карта)']]);
        const p = h('p', 'sub', 'Коснитесь левой части экрана и тяните — стик появится под пальцем. Размер и прозрачность кнопок меняются в настройках.'); b.appendChild(p);
      }
    });
  },

  // ----- вкладка «Приёмы»: коротко, с клавишами текущего устройства -----
  moves(b) {
    const h = Sheet.h, d = HW_DEV.cur(), K = (a) => `[[${HW_DEV.key(d, a)}]]`, kbTouch = d === 'touch';
    const up = d === 'touch' ? '[[стик ↑]]' : d === 'pad' ? '[[стик ↑]]' : `[[${HW_DEV.key('kb', 'up')}]]`, dn = d === 'touch' || d === 'pad' ? '[[стик ↓]]' : `[[${HW_DEV.key('kb', 'down')}]]`;
    const list = [
      ['Удар вверх и вниз', `${up} + ${K('atk')} — удар вверх. В прыжке ${dn} + ${K('atk')} — удар вниз: отскок от шипов и врагов.`],
      ['Отбив', `${K('heal')}, когда нить не полна, за миг до удара врага или снаряда. Окно 0,2 с: отбивает и то и другое.`],
      ['Нитяной всполох', `${up} + ${K('heal')} от 4 нити: волна вокруг героя отбрасывает врагов.`],
      ['Лечение', `Когда катушка нити полна, стойте на месте 1,1 с: ${K('heal')} вернёт 2 бутона. Урон прерывает лечение.`],
      ['Комбо и тяжёлый удар', `Третий удар подряд — тяжёлый: шире и бьёт дважды. Серия ударов оглушает босса: он замирает и получает двойной урон.`],
      ['Казнь', `Оглушили босса (полоска над ним)? Подойдите и ударьте вверх или вниз: добивающий удар и бонус нити.`],
      ['Рывок сквозь удар', `${K('dash')} в миг атаки врага — идеальный уворот: без урона и +2 нити.`],
      ['Прыжок от стены', `Прижмитесь к стене в падении и жмите ${K('jump')}. Спрыгнуть с платформы: ${dn} + ${K('jump')}.`],
      ['Хват за уступ', `Падая у края, жмите к нему — повиснете. ${up} или ${K('jump')} — подтянуться, ${dn} — отпустить, прыжок от стены — спрыгнуть.`],
      ['Планер «Парус»', `Награда за Владика: держите ${K('jump')} в падении, и плащ раскроется парусом.`],
      ['Заряженный удар', `Удерживайте ${K('atk')} около полсекунды, пока не раздастся звон и не вспыхнет оружие, и отпустите: особый сильный удар, у каждого оружия свой.`],
      ['Инструменты', `${K('tool')} — метательная игла, капкан, нитяная бомба или крюк; тратят нить, надеваются в «Снаряжении» (по одному).`],
      ['Оружие', `Игла, парные иглы, серп, колотушка, игла-копьё: у каждого своя дальность, скорость и комбо. Открываются за боссов и в лавке.`],
      ['Обереги', `Три слота, девять оберегов (яд, ожог, +1 бутон, быстрая нить…). «Снаряжение» — в меню скамьи или в паузе${d === 'kb' ? ' ([[I]])' : ''}.`],
    ];
    const g = h('div', 'hw-grid');
    for (const [t, txt] of list) { const it = h('div', 'hw-it'); it.appendChild(h('h3', '', t)); it.appendChild(Sheet.rich(h('p', '', ''), txt)); g.appendChild(it); }
    b.appendChild(g);
  },

  // ----- вкладка «Кооп» -----
  coop(b) {
    const h = Sheet.h, d = HW_DEV.cur(), K = (a) => `[[${HW_DEV.key(d, a)}]]`, up = d === 'kb' ? K('up') : '[[стик ↑]]';
    const list = [
      ['Поднять напарника', `Упавший герой — в коконе. Подойдите и держите ${up} около секунды. Скамья тоже поднимает: отдых у неё оживляет всех.`],
      ['Скамья', `${up} у скамьи открывает меню: «Отдохнуть» (здоровье, сохранение, место возрождения), «Лавка», «Карта и переходы», «Снаряжение». После обрыва нити вы очнётесь на последней скамье.`],
      ['Лавка', `Бусины общие. Маски здоровья, острая игла и лёгкая катушка. Выбор — стрелки или касание, купить — Enter / A, закрыть — Esc / B.`],
      ['Карта и переходы', `Откройте через «Карту» в паузе или в меню скамьи${d === 'kb' ? ' ([[M]], вдвоём за одним экраном — [[Tab]])' : d === 'pad' ? ` (${K('map')})` : ' (кнопка [[▤]])'}. С любой скамьи можно перенестись на посещённую; во время боя с боссом переход закрыт.`],
      ['Вдвоём за одним экраном', `Каждый играет своей раскладкой: игрок 1 — как в настройках, игрок 2 — стрелки и цифровая клавиатура. Пауза общая.`],
      ['По сети', `Каждый играет раскладкой игрока 1. Пауза и меню скамьи мир не останавливают, так что не задерживайтесь рядом с врагами. Дальше по главам ведёт хост.`],
    ];
    const g = h('div', 'hw-grid');
    for (const [t, txt] of list) { const it = h('div', 'hw-it'); it.appendChild(h('h3', '', t)); it.appendChild(Sheet.rich(h('p', '', ''), txt)); g.appendChild(it); }
    b.appendChild(g);
  },

  // ----- вкладка «Боссы»: совет открывается после первой встречи -----
  BOSS: [
    { id: 'korn', name: 'Корнематка', tips: ['Корни бьют из-под земли цепочкой к вам: место вспыхивает заранее — уходите прыжком или рывком.', 'Ярость на 60 % и 30 % здоровья: она неуязвима полторы секунды. Отойдите и ждите, нить не тратьте.', 'В третьей фазе она прыгает дважды и пускает корни в обе стороны: держите дистанцию, бейте после приземления.'] },
    { id: 'misha', name: 'Миша Додик', tips: ['«Пропустите!» — встаньте у него на пути в подсвеченном коридоре. «Диктант!» — ищите проём в стене из букв.', 'В первых двух фазах бейте иглой; дымовая бомба в рюкзак на спине снимает бутон целиком. Ящики «ДЫМ» стоят по краям арены.', 'В последней фазе рюкзак застёгнут: иглой не пробить, только бомбами. Заходите со спины или кидайте навесом.'] },
    { id: 'vladik', name: 'Владик Скрипка', tips: ['Скрипичные ключи возвращаются бумерангом: уходите и от обратного пути. Ноты можно срубить.', 'Нотный стан: стойте на безопасной линии (пол или парта). Шторы со слизью жгутся, пройти можно низом.', 'После выпада смычком — окно для ударов. В третьей фазе ноты падают с потолка.'] },
    { id: 'tima', name: 'Тима Пиво', tips: ['Коллекторы режутся иглой за два удара. В пене от бутылок бегать трудно: не стойте в лужах.', 'Он пьёт пиво и лечится — прервите его ударом. «Банкротство!»: уходите из-под печатей, мебель на 6 секунд изымают.', 'В третьей фазе ачивки-кубки падают с отскоком, а после геймпада идёт красное кольцо.'] },
  ],
  bosses(b) {
    const h = Sheet.h;
    b.appendChild(h('p', 'sub', 'Совет открывается после первой встречи с боссом.'));
    const g = h('div', 'hw-grid');
    for (const e of this.BOSS) {
      let r = { tries: 0, wins: 0, best: 0 };
      try { r = Records.get(e.id); } catch (_) { }
      const seen = r.tries > 0, it = h('div', 'hw-it' + (seen ? '' : ' lock'));
      it.appendChild(h('h3', '', seen ? e.name : '???'));
      if (!seen) { it.appendChild(h('p', 'sub', 'Вы ещё не встречали этого босса. Совет откроется после первой попытки.')); }
      else {
        it.appendChild(h('div', 'tag', `Попыток: ${r.tries} · побед: ${r.wins}` + (r.best ? ` · лучшее время: ${Records.fmt(r.best)}` : '')));
        const ul = h('ul'); for (const t of e.tips) ul.appendChild(h('li', '', t)); it.appendChild(ul);
      }
      g.appendChild(it);
    }
    b.appendChild(g);
  },
};

const Changelog = {
  get open() { return !!(Sheet.cur && Sheet.cur.cfg.id === 'changelog'); },
  show(onClose) {
    return Sheet.open({
      id: 'changelog', title: 'Что нового', onClose,
      ver: `версия ${typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : ''}${typeof GAME_BUILD !== 'undefined' && !/__/.test(GAME_BUILD) ? ' · сборка ' + GAME_BUILD : ''}`,
      tabs: [{ name: 'Что нового', build: (b) => { const ul = Sheet.h('ul', 'hw-log'); for (const l of CHANGELOG) ul.appendChild(Sheet.h('li', '', l)); b.appendChild(ul); } }],
      foot() {
        const d = HW_DEV.cur();
        return d === 'pad' ? `Стик или крестовина ▲▼ — листать · ${HW_DEV.ps() ? '○' : 'B'} — назад` : d === 'touch' ? 'Проведите пальцем вверх или вниз, чтобы листать' : '↑ ↓, колёсико, Пробел — листать · Esc — назад';
      },
    });
  },
  hide() { if (this.open) Sheet.close(); },
};
