// ===== МЕНЮ ИГРЫ (v1.7): карта экранов, ввод с клавиатуры / геймпада / касания, общий каркас =====
// Экран меню — запись в MENU: { id, parent, title, crumb?, root?, items: [...] | (m, ctx) => [...], info?, lr?, keys?, extra? }.
// Пункт: { key: '1'..'7', label, sub?, value?, act(m, ctx), lr?(m, ctx, dir), enabled?, hidden?, danger?, kind?: 'cards' }
// (label / sub / value / enabled / hidden могут быть функциями (m, ctx)). Новый раздел подключается одной записью menuAdd({...})
// и пунктом в items родителя. Переход — m.menuGo(id, ctx), назад — m.menuBack(); каркас сам рисует непрозрачный фон,
// «хлебные крошки», кнопку «← Назад», подсказки под текущее устройство и обрабатывает цифры, стрелки, Enter / Esc, геймпад и касание.
const MENU = {};
function menuAdd(d) { MENU[d.id] = d; return d; }

// ---------- какое устройство вводило последним (клавиатура / геймпад / касание) ----------
const Dev = {
  last: 'kb', subs: [],
  init() {
    this.last = Touch.enabled ? 'touch' : 'kb';
    window.addEventListener('keydown', () => this.set('kb'), true);
    window.addEventListener('pointerdown', (e) => this.set(e.pointerType === 'touch' ? 'touch' : 'kb'), true);
    this.set(this.last, true);
  },
  set(k, force) {
    if (this.last === k && !force) return;
    this.last = k; document.documentElement.classList.toggle('navpad', k === 'pad');
    this.refresh();
    for (const f of this.subs.slice()) { try { f(k); } catch (_) { } }
  },
  // подписи кнопок геймпада (PlayStation: ✕ / ○ / □)
  names() { let ps = false; try { const p = Pads.list()[0]; ps = !!p && Pads.kind(p) === 'ps'; } catch (_) { } return ps ? { ok: '✕', back: '○', x: '□' } : { ok: 'A', back: 'B', x: 'X' }; },
  // одна строка подсказок под текущее устройство; o: { nums, lr, back, act, extra: {kb, pad, touch} }
  hint(o) {
    o = o || {}; const act = o.act || 'открыть', ex = (o.extra && o.extra[this.last]) || '', n = this.names(), p = [];
    if (this.last === 'touch') {
      p.push(o.touchAct || 'Коснитесь пункта'); if (o.back !== false) p.push('«← Назад» — на уровень выше');
    } else if (this.last === 'pad') {
      p.push('↑ ↓ — выбор', `${n.ok} — ${act}`); if (o.lr) p.push('← → — ' + o.lr); if (o.back !== false) p.push(`${n.back} — назад`);
    } else {
      p.push('↑ ↓ — выбор', `Enter — ${act}`); if (o.nums) p.push((typeof o.nums === 'number' ? (o.nums > 1 ? `1–${o.nums}` : '1') : o.nums) + ' — сразу к пункту'); if (o.lr) p.push('← → — ' + o.lr); if (o.back !== false) p.push('Esc — назад');
    }
    if (ex) p.push(ex);
    return p.join(' · ');
  },
  refresh() { for (const el of Ov.all) if (el._hint) el._hint.textContent = this.hint(el._hintOpt); },
};

// ---------- геймпад в меню: общий опрос с краевыми срабатываниями и повтором для направлений ----------
const PadNav = {
  st: {}, t: {},
  poll(dt) {
    let ps = []; try { ps = Pads.list(); } catch (_) { }
    const cur = { up: false, down: false, left: false, right: false, ok: false, back: false, x: false }; let any = false;
    for (const p of ps) {
      const B = (n) => !!(p.buttons[n] && (p.buttons[n].pressed || p.buttons[n].value > 0.5));
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      cur.up = cur.up || ay < -0.55 || B(12); cur.down = cur.down || ay > 0.55 || B(13);
      cur.left = cur.left || ax < -0.55 || B(14); cur.right = cur.right || ax > 0.55 || B(15);
      cur.ok = cur.ok || B(0); cur.back = cur.back || B(1); cur.x = cur.x || B(2);
      if (B(0) || B(1) || B(2) || B(3) || B(9) || B(12) || B(13) || B(14) || B(15) || Math.abs(ax) > 0.4 || Math.abs(ay) > 0.4) any = true;
    }
    if (any) Dev.set('pad');
    const out = {};
    for (const k in cur) {
      if (cur[k]) {
        if (!this.st[k]) { out[k] = true; this.t[k] = 0.42; }
        else if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { this.t[k] -= dt; if (this.t[k] <= 0) { out[k] = true; this.t[k] = 0.11; } }
      }
      this.st[k] = cur[k];
    }
    return out;
  },
};

// ---------- HTML-оверлеи (лобби, настройки, клавиши, таблица друзей…): общий каркас и управление с геймпада ----------
const Ov = {
  all: [],
  // оборачивает оверлей: сверху «← Назад» и хлебные крошки, снизу строка подсказок; непрозрачный фон задаёт класс .ov
  chrome(el, o) {
    if (el._hint) { this.crumbs(el, o.crumbs); return; }
    el.classList.add('ov');
    const bar = document.createElement('header'); bar.className = 'ovbar';
    bar.innerHTML = '<button type="button" class="ovback">← Назад</button><nav class="crumbs" aria-label="Где вы"></nav>';
    const body = document.createElement('div'); body.className = 'ovbody';
    while (el.firstChild) body.appendChild(el.firstChild);
    const hint = document.createElement('div'); hint.className = 'ovhint'; hint.setAttribute('role', 'note');
    el.append(bar, body, hint);
    el._bar = bar; el._crumbs = bar.querySelector('.crumbs'); el._hint = hint; el._hintOpt = o.hint || { act: 'нажать' }; el._back = o.back;
    bar.querySelector('.ovback').addEventListener('click', () => el._back && el._back());
    // призрачный щелчок после касания по холсту: в первые 350 мс по новому оверлею не нажимаем
    el.addEventListener('click', (e) => { if (Dev.last === 'touch' && performance.now() - (el._openAt || 0) < 350) { e.preventDefault(); e.stopPropagation(); } }, true);
    this.all.push(el);
    Nav.register(el, () => el._back && el._back(), o.digits);
    this.crumbs(el, o.crumbs); this.hint(el, el._hintOpt);
  },
  crumbs(el, list) {
    if (!el._crumbs) return;
    el._crumbs.innerHTML = '';
    (list || []).forEach((c, i, a) => {
      if (i) { const s = document.createElement('span'); s.textContent = ' › '; s.className = 'sep'; el._crumbs.append(s); }
      const e = document.createElement(i === a.length - 1 ? 'b' : 'span'); e.textContent = c; el._crumbs.append(e);
    });
  },
  // путь до текущего экрана меню (если меню на экране), иначе запасной
  base(def) { const m = window.__game && window.__game.scene.getScene('menu'); const c = m && m.sys.isActive() && m.menuCrumbs ? m.menuCrumbs() : []; return c.length ? c : def; },
  hint(el, opt) { if (opt) el._hintOpt = opt; if (el._hint) el._hint.textContent = Dev.hint(el._hintOpt); },
  // оверлей только что открыли: охрана от призрачного щелчка и подсказка под текущее устройство
  opened(el) { el._openAt = performance.now(); this.hint(el); },
};

const Nav = {
  list: [], last: 0,
  register(el, back, digits) { this.list = this.list.filter((o) => o.el !== el); this.list.push({ el, back, digits }); },
  top() {
    let best = null, bz = -1;
    for (const o of this.list) {
      if (o.el.hidden || !o.el.isConnected) continue;
      const z = +getComputedStyle(o.el).zIndex || 0; if (z >= bz) { bz = z; best = o; }
    }
    return best;
  },
  any() { return !!this.top(); },
  focusables(el) {
    const out = [], seen = new Set(), root = el.querySelector('.ovbody') || el; // кнопка «← Назад» в панели сверху в обход (назад — кнопка B / Esc)
    for (const n of root.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])')) {
      if (n.hidden || n.closest('[hidden]') || !n.getClientRects().length) continue;
      if (n.type === 'radio') { if (seen.has(n.name)) continue; const g = [...root.querySelectorAll(`input[type=radio][name="${n.name}"]`)]; seen.add(n.name); out.push(g.find((r) => r.checked) || g[0]); continue; }
      out.push(n);
    }
    return out;
  },
  groupOf(n) { return n.type === 'radio' ? [...n.closest('.ov, body').querySelectorAll(`input[type=radio][name="${n.name}"]`)] : null; },
  focus(n) { n.focus({ preventScroll: true }); try { n.scrollIntoView({ block: 'nearest' }); } catch (_) { } },
  act(o, c) {
    const el = o.el;
    if (c.back) { if (o.back) o.back(); return; }
    const fl = this.focusables(el); if (!fl.length) return;
    const a = document.activeElement, inside = el.contains(a);
    let i = inside ? fl.findIndex((n) => n === a || (a.type === 'radio' && n.type === 'radio' && n.name === a.name)) : -1;
    if (c.up || c.down) { this.focus(fl[i < 0 ? 0 : (i + (c.down ? 1 : -1) + fl.length) % fl.length]); return; }
    if (c.left || c.right) {
      const d = c.right ? 1 : -1;
      if (inside && a.type === 'range') { const st = +a.step || 1, v = Math.max(+a.min, Math.min(+a.max, +a.value + d * st)); a.value = v; a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); return; }
      if (inside && a.type === 'radio') { const g = this.groupOf(a), k = (g.indexOf(a) + d + g.length) % g.length; g[k].click(); this.focus(g[k]); return; }
      if (i >= 0) this.focus(fl[(i + d + fl.length) % fl.length]); return;
    }
    if (c.ok) {
      if (!inside || i < 0) { this.focus(fl[0]); return; }
      if (a.tagName === 'BUTTON' || a.type === 'checkbox' || a.type === 'radio') a.click();
    }
  },
  init() {
    let t0 = performance.now();
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
      const o = this.top(); if (!o) return;
      const c = PadNav.poll(dt);
      for (const k in c) { this.act(o, c); break; }
    };
    requestAnimationFrame(loop);
    // Esc закрывает верхний оверлей, даже если фокус не внутри него (у лобби и клавиш свои обработчики: они помечают событие)
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || (Access && Access.listening)) return;
      const o = this.top(); if (!o) return;
      e.preventDefault(); e.stopPropagation(); if (o.back) o.back();
    }, true);
    // цифры 1–9 выбирают N-й пункт открытого оверлея (если он это разрешает и фокус не в поле ввода)
    document.addEventListener('keydown', (e) => {
      const o = this.top(); if (!o || !o.digits || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement; if (a && (a.type === 'text' || a.tagName === 'TEXTAREA' || a.type === 'search')) return;
      if (!/^[1-9]$/.test(e.key) || (Access && Access.listening)) return;
      const fl = this.focusables(o.el), n = fl[+e.key - 1]; if (!n) return;
      e.preventDefault(); e.stopPropagation();
      this.focus(n); if (n.tagName === 'BUTTON' || n.type === 'checkbox') n.click();
    }, true);
  },
};

// ---------- сцена меню: каркас экранов ----------
Object.assign(MenuScene.prototype, {
  mCs() { const d = this.scale && this.scale.displaySize; return d && d.height ? d.height / VH : 1; },
  mTop() { return this.mStack[this.mStack.length - 1]; },
  menuInit() {
    this.mStack = [{ id: 'main', ctx: {}, foc: 0 }]; this.mObj = []; this.mRows = []; this.mFoc = 0; this.busy = false;
    const onDev = () => { if (this.sys && this.sys.isActive()) this.menuRender(); };
    Dev.subs.push(onDev);
    const onRs = () => { const k = this.mCs().toFixed(3) + ':' + VW; if (k !== this.mKey) this.menuRender(); };
    this.scale.on('resize', onRs);
    this.events.once('shutdown', () => { Dev.subs = Dev.subs.filter((f) => f !== onDev); this.scale.off('resize', onRs); });
    this.menuRender();
    // первая отрисовка идёт в create(), когда масштаб холста ещё не устоялся (после scene.restart — особенно): перерисовываем на первом кадре
    this.events.once('postupdate', () => { if (this.sys.isActive()) this.menuRender(); });
  },
  menuCrumbs() { return this.mStack.slice(1).map((e) => { const d = MENU[e.id], c = d.crumb || d.title; return typeof c === 'function' ? c(this, e.ctx) : c; }).filter((c, i, a) => !i || c !== a[i - 1]); },
  menuGo(id, ctx) {
    if (!MENU[id] || this.leaving) return;
    this.mTop().foc = this.mFoc;
    const d = MENU[id]; this.mStack.push({ id, ctx: ctx || {}, foc: 0 });
    this.mFoc = d.foc != null ? d.foc : 0; Snd.play('bead'); this.menuRender();
    if (d.enter) d.enter(this, ctx || {});
  },
  // открыть экран «с нуля» по цепочке родителей (для коротких путей и тестов)
  menuOpen(id, ctx) {
    const chain = []; for (let d = MENU[id]; d; d = d.parent && MENU[d.parent]) chain.unshift(d.id);
    this.mStack = chain.map((x, i) => ({ id: x, ctx: i === chain.length - 1 ? (ctx || {}) : {}, foc: 0 }));
    if (this.mStack[0].id !== 'main') this.mStack.unshift({ id: 'main', ctx: {}, foc: 0 });
    this.mFoc = (MENU[id].foc) || 0; this.menuRender();
  },
  menuBack() {
    if (this.busy || this.leaving) return;
    if (this.mStack.length < 2) return;
    this.mStack.pop(); this.mFoc = this.mTop().foc || 0; Snd.play('clink'); this.menuRender();
  },
  // вызвать внешний оверлей (Как играть, Что нового…): пока он открыт, меню не реагирует; onClose возвращает управление
  menuBusy(fn) {
    if (this.busy || this.leaving) return; this.busy = true; Snd.init();
    let done = false; const end = () => { if (done) return; done = true; this.busy = false; if (this.sys.isActive()) this.menuRender(); };
    try { fn(end); } catch (e) { end(); throw e; }
  },
  menuBlocked() {
    if (this.busy || Settings.open || !Lobby.el.hidden || Nav.any()) return true;
    return false;
  },

  // ----- рисование -----
  menuRender() {
    // после scene.restart() (поворот телефона меняет ширину поля) create() идёт в статусе CREATING: isActive() там ложно и меню оставалось пустым
    const stt = this.sys.settings.status;
    if (!this.mStack || (stt !== Phaser.Scenes.RUNNING && stt !== Phaser.Scenes.CREATING)) return;
    for (const o of this.mObj) if (o && o.scene) o.destroy();
    this.mObj = []; this.mRows = [];
    const top = this.mTop(), desc = MENU[top.id], ctx = top.ctx, root = !!desc.root;
    const val = (v) => (typeof v === 'function' ? v(this, ctx) : v);
    const cs = this.mCs(), fmin = Math.ceil(11.4 / cs), zone = Math.ceil(44 / cs), pad = 36;
    this.mKey = cs.toFixed(3) + ':' + VW;
    const F = '"Fira Sans", sans-serif', D = '"Cormorant SC", Georgia, serif', fs = (n) => Math.max(n, fmin);
    const add = (o, z) => { o.setDepth(z || 12); this.mObj.push(o); return o; };
    const txt = (x, y, s, st, ox, oy) => add(this.add.text(x, y, s, st).setOrigin(ox == null ? 0 : ox, oy == null ? 0 : oy));
    const fit = (t, maxW, minPx) => { let f = parseFloat(t.style.fontSize); while (t.width > maxW && f > minPx) { f -= 1; t.setFontSize(f); } return t; };
    this.mBase.forEach((o) => o.setVisible(root)); this.mHero = root;
    // непрозрачный фон: сквозь экран не просвечивает ни главное меню, ни фон сцены
    if (!root) { const bg = add(this.add.rectangle(0, 0, VW, VH, 0x060d0b, 1).setOrigin(0), 9); bg.setInteractive(); }

    const items = (val(desc.items) || []).filter((it) => !val(it.hidden));
    const rows = items.map((it) => ({ it, kind: it.kind || 'btn', en: val(it.enabled) !== false, label: val(it.label), sub: val(it.sub), value: val(it.value), key: it.key, lr: !!it.lr }));
    this.mItems = rows;
    if (this.mFoc >= rows.length) this.mFoc = Math.max(0, rows.length - 1);

    // ----- нижняя строка подсказок -----
    const ks = rows.map((r) => r.key).filter(Boolean), nums = ks.length ? (ks.length > 1 ? ks[0] + '–' + ks[ks.length - 1] : ks[0]) : '', hasLR = rows.some((r) => r.lr || r.kind === 'cards') || !!desc.lr;
    const hf = fs(15);
    const hint = txt(VW / 2, VH - 8, Dev.hint({ nums, lr: hasLR ? (desc.lrText || 'менять') : '', back: !root, extra: val(desc.extra) }), { fontFamily: F, fontSize: hf + 'px', color: '#7fa596' }, 0.5, 1);
    fit(hint, VW - 2 * pad - (Touch.enabled ? 170 : 0), fmin);
    this.mHint = hint;
    const hintTop = VH - 8 - hint.height;

    // ----- верхняя полоса: «← Назад» и крошки (на корне — версия и «Что нового ›») -----
    const TB = Math.max(zone, 48);
    let ct;
    if (root) {
      const vt = txt(pad, zone / 2, `Версия ${GAME_VERSION} · сборка ${GAME_BUILD}`, { fontFamily: F, fontSize: fs(15) + 'px', color: '#9fc4b4', fontStyle: '600' }, 0, 0.5);
      const lk = txt(0, zone / 2, 'Что нового ›', { fontFamily: F, fontSize: fs(15) + 'px', color: '#ffd47a', fontStyle: '600' }, 0, 0.5);
      // версия не должна цеплять правую колонку (иначе пункты съезжают вниз и сжимаются): ужимаем строку версии, пока не поместится
      const vmax = Math.round(VW * 0.46) - 12 - pad - 18 - lk.width;
      fit(vt, vmax, fmin);
      if (vt.width > vmax) { vt.setText(`v${GAME_VERSION} · ${GAME_BUILD}`); fit(vt, vmax, fmin); } // на узком экране слово «Версия/сборка» убираем
      lk.x = vt.x + vt.width + 18;
      const lz = add(this.add.zone(lk.x - 8, 0, lk.width + 16, zone).setOrigin(0).setInteractive({ useHandCursor: true }));
      lz.on('pointerdown', () => this.menuChangelog());
      ct = lk.x + lk.width > Math.round(VW * 0.46) - 12 ? zone + 4 : 8; // правая колонка поднимается к самому верху, если версия её не задевает
    } else {
      const bz = add(this.add.zone(0, 0, 150, TB).setOrigin(0).setInteractive({ useHandCursor: true }));
      bz.on('pointerdown', () => this.menuBack());
      const bt = txt(pad - 8, TB / 2, '← Назад', { fontFamily: F, fontSize: fs(19) + 'px', color: '#cfe8dc', fontStyle: '600' }, 0, 0.5);
      bz.on('pointerover', () => bt.setColor('#ffd47a')); bz.on('pointerout', () => bt.setColor('#cfe8dc'));
      const cr = this.menuCrumbs(), cx0 = 166, maxW = VW - cx0 - pad, cf = fs(16);
      const mk = (parts) => {
        const last = parts[parts.length - 1], pre = parts.slice(0, -1).join(' › ');
        const a = pre ? txt(cx0, TB / 2, pre + ' › ', { fontFamily: F, fontSize: cf + 'px', color: '#7fa596' }, 0, 0.5) : null;
        const b = txt(cx0 + (a ? a.width : 0), TB / 2, last, { fontFamily: F, fontSize: cf + 'px', color: '#ffd47a', fontStyle: '600' }, 0, 0.5);
        return [a, b];
      };
      let parts = cr.slice(), pair = mk(parts);
      while (pair[1].x + pair[1].width > cx0 + maxW && parts.length > 1) { pair.forEach((o) => o && o.destroy()); parts = parts.length > 2 ? ['…', ...parts.slice(2)] : parts.slice(1); pair = mk(parts); }
      if (pair[1].x + pair[1].width > cx0 + maxW) fit(pair[1], cx0 + maxW - pair[1].x, fmin);
      const ln = add(this.add.graphics(), 10); ln.fillStyle(0x1d3630, 1); ln.fillRect(0, TB, VW, 1);
      ct = TB + 12;
    }
    const cb = hintTop - 10, avail = cb - ct;

    // ----- правая колонка: пункты -----
    const rx = Math.round(VW * 0.46), rw = VW - rx - pad;
    const cards = rows.find((r) => r.kind === 'cards');
    const nrows = rows.filter((r) => r.kind !== 'cards').length, chh = 92;
    let rh = Math.min(68, Math.max(zone, 56));
    const need0 = (cards ? chh + 8 : 0);
    if (nrows * rh + need0 > avail) rh = Math.max(36, Math.floor((avail - need0) / Math.max(1, nrows)));
    const used = nrows * rh + need0;
    let y = ct + (root ? Math.max(0, (avail - used) / 2) : Math.max(0, Math.min(18, (avail - used) / 2)));
    const paint = () => this.menuPaint();
    rows.forEach((r, i) => {
      const it = r.it;
      if (r.kind === 'cards') {
        const gap = 10, cw = Math.floor((rw - gap * (BOSSES.length - 1)) / BOSSES.length);
        r.cards = BOSSES.map((b, k) => {
          const x = rx + k * (cw + gap), rec = Records.get(b.id);
          const bg = add(this.add.rectangle(x, y, cw, chh, 0x0e1f1b, 0.9).setOrigin(0).setInteractive({ useHandCursor: true }), 11);
          const nm = txt(x + cw / 2, y + 9, b.name, { fontFamily: D, fontSize: '21px', fontStyle: '700', color: '#cfe8dc', align: 'center', wordWrap: { width: cw - 14 } }, 0.5, 0);
          const rc = txt(x + cw / 2, y + chh - 8, rec.best ? 'рекорд ' + Records.fmt(rec.best) : 'нет рекорда', { fontFamily: F, fontSize: fs(15) + 'px', color: '#7fa596', align: 'center' }, 0.5, 1);
          fit(rc, cw - 10, fmin);
          bg.on('pointerdown', () => { this.mFoc = i; if (it.pick) it.pick(this, ctx, k); this.menuRender(); });
          return { bg, nm, rc };
        });
        y += chh + 8; r.y = y; return;
      }
      const zn = add(this.add.rectangle(rx, y, rw, rh - 4, 0x0e1f1b, 0.62).setOrigin(0).setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, -2, rw, rh), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: r.en }), 11); // зона нажатия на весь шаг строки, с промежутком
      const bar = add(this.add.rectangle(rx, y, 4, rh - 4, 0xffd47a, 1).setOrigin(0), 12);
      const num = r.key ? txt(rx + 18, y + (rh - 4) / 2, r.key, { fontFamily: F, fontSize: '21px', fontStyle: '600', color: '#ffd47a' }, 0, 0.5) : null;
      const lx = rx + (r.key ? 52 : 20);
      const val2 = r.value != null && r.value !== '' ? txt(rx + rw - 16, y + (rh - 4) / 2, String(r.value), { fontFamily: F, fontSize: fs(17) + 'px', fontStyle: '600', color: '#ffd47a' }, 1, 0.5) : null;
      const mw = rw - (lx - rx) - 14 - (val2 ? val2.width + 14 : 0);
      const lf = rh >= 60 ? 27 : 24;
      const lab = txt(lx, y, r.label, { fontFamily: D, fontSize: lf + 'px', fontStyle: '600', color: '#cfe8dc' }, 0, 0);
      fit(lab, mw, 18);
      let sub = null;
      if (r.sub) { sub = txt(lx, y, r.sub, { fontFamily: F, fontSize: fs(15) + 'px', color: '#7fa596' }, 0, 0); fit(sub, mw, fmin); }
      const th = lab.height + (sub ? sub.height + 1 : 0), ty = y + ((rh - 4) - th) / 2;
      lab.y = ty; if (sub) sub.y = ty + lab.height + 1;
      zn.on('pointerover', (p) => { if (!(p && p.wasTouch) && this.mFoc !== i) { this.mFoc = i; paint(); } });
      zn.on('pointerdown', () => { this.mFoc = i; this.menuAct(i); });
      Object.assign(r, { zn, bar, num, lab, sub, val2, y });
      y += rh;
    });

    // ----- левая колонка: заголовок и описание -----
    const lx0 = pad, lw = rx - pad - 30;
    if (root) {
      const cx = lx0 + lw / 2;
      const t1 = txt(cx, zone + 40, 'ТРОПА ТКАЧЕЙ', { fontFamily: D, fontSize: '60px', fontStyle: '700', color: '#e8e2cf' }, 0.5, 0);
      fit(t1, lw, 34); t1.setShadow(0, 0, '#9fc4b4', 16, false, true);
      txt(cx, t1.y + t1.height + 2, Campaign.subtitle(), { fontFamily: F, fontSize: fs(17) + 'px', color: '#8fb8a8' }, 0.5, 0);
      this.heroX = cx; this.heroY = Math.min(cb - 60, Math.max(t1.y + t1.height + 90, 300));
      this.mGlow.clear(); this.mGlow.fillStyle(0x9fc4b4, 0.06); for (let rr = 110; rr > 10; rr -= 12) this.mGlow.fillCircle(cx, this.heroY - 24, rr);
    } else {
      const title = val(desc.title), t = txt(lx0, ct, title, { fontFamily: D, fontSize: '46px', fontStyle: '700', color: '#e8e2cf', wordWrap: { width: lw } });
      fit(t, lw, 28); t.setShadow(0, 0, '#9ff0c8', 12, false, true);
      let iy = t.y + t.height + 10;
      const paras = (desc.info && desc.info(this, ctx)) || [];
      const lay = (f) => {
        const made = []; let yy = iy;
        for (const p0 of paras) {
          const p = typeof p0 === 'string' ? { t: p0 } : p0; if (!p.t) continue;
          const big = p.head ? 1.25 : 1, size = Math.round(Math.max(fmin, (p.fs || 16) + f) * big);
          const o = this.add.text(lx0, yy, p.t, { fontFamily: p.head ? D : F, fontSize: size + 'px', fontStyle: p.head ? '700' : '400', color: p.c || '#b9d4c8', wordWrap: { width: lw }, lineSpacing: Math.round(size / 5) }).setDepth(12);
          this.mObj.push(o); made.push(o); yy += o.height + (p.head ? 4 : 10);
        }
        return { made, bottom: yy };
      };
      let f = 0, res = lay(f);
      while (res.bottom > cb && f > -4) { res.made.forEach((o) => o.destroy()); f -= 1; res = lay(f); }
    }
    this.mRowsReady = true;
    this.menuPaint();
  },
  menuPaint() {
    const rows = this.mItems || [];
    rows.forEach((r, i) => {
      const foc = i === this.mFoc;
      if (r.kind === 'cards') {
        const sel = r.it.sel ? r.it.sel(this) : -1;
        r.cards.forEach((c, k) => {
          c.bg.setFillStyle(foc && k === sel ? 0x1c4a3d : k === sel ? 0x153329 : 0x0e1f1b, 0.95);
          c.bg.setStrokeStyle(k === sel ? 2 : 1, k === sel ? 0xffd47a : 0x24433a, 1);
          c.nm.setColor(k === sel ? '#ffd47a' : '#cfe8dc'); c.rc.setColor(k === sel ? '#ffe3a3' : '#7fa596');
        });
        return;
      }
      r.zn.setFillStyle(foc ? 0x184238 : 0x0e1f1b, foc ? 0.97 : 0.62);
      r.bar.setVisible(foc);
      const dis = !r.en;
      r.lab.setColor(dis ? '#5f7a6f' : foc ? '#ffd47a' : (r.it.danger ? '#ffb48a' : '#cfe8dc'));
      if (r.sub) r.sub.setColor(dis ? '#557064' : foc ? '#b9d4c8' : '#7fa596');
      if (r.num) r.num.setColor(dis ? '#557064' : '#ffd47a');
      if (r.val2) r.val2.setColor(dis ? '#557064' : '#ffd47a');
    });
  },

  // ----- действия -----
  menuAct(i) {
    const r = this.mItems && this.mItems[i]; if (!r || this.menuBlocked() || this.leaving) return;
    if (r.kind === 'cards') { const it = r.it; if (it.enter) it.enter(this, this.mTop().ctx); else { this.mFoc = Math.min(this.mItems.length - 1, i + 1); this.menuPaint(); } return; }
    if (!r.en) { Snd.init(); Snd.play('hit'); return; }
    Snd.init(); if (r.it.act) r.it.act(this, this.mTop().ctx);
  },
  menuKeyDigit(d) { const i = (this.mItems || []).findIndex((r) => r.key === d); if (i >= 0) { this.mFoc = i; this.menuAct(i); } },
  menuLR(dir) {
    const r = this.mItems && this.mItems[this.mFoc], desc = MENU[this.mTop().id], ctx = this.mTop().ctx; if (!r) return;
    if (r.it.lr) r.it.lr(this, ctx, dir); else if (desc.lr) desc.lr(this, ctx, dir);
  },
  menuMove(d) {
    const n = (this.mItems || []).length; if (!n) return;
    this.mFoc = (this.mFoc + d + n) % n; Snd.play('bead'); this.menuPaint();
  },
  menuCmd(c) {
    if (c.up) this.menuMove(-1); else if (c.down) this.menuMove(1);
    if (c.left) this.menuLR(-1); else if (c.right) this.menuLR(1);
    if (c.ok) this.menuAct(this.mFoc);
    if (c.back) this.menuBack();
    if (c.x && MENU[this.mTop().id].root) this.menuChangelog();
  },
  menuKey(e) {
    Snd.init();
    if (this.menuBlocked() || this.leaving || e.repeat === true && /^\d$/.test(e.key)) return;
    const k = e.key, desc = MENU[this.mTop().id];
    if (/^[1-9]$/.test(k)) { this.menuKeyDigit(k); return; }
    if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'ц' || k === 'Ц') this.menuMove(-1);
    else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === 'ы' || k === 'Ы') this.menuMove(1);
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ф' || k === 'Ф') this.menuLR(-1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'в' || k === 'В') this.menuLR(1);
    else if (k === 'Enter' || k === ' ') { if (e.repeat) return; this.menuAct(this.mFoc); }
    else if (k === 'Escape' || k === 'Backspace') this.menuBack();
    else if ((e.code === 'KeyN') && desc.root) this.menuChangelog();
    else if (desc.keys && desc.keys[e.code] && !e.repeat) desc.keys[e.code](this, this.mTop().ctx);
  },
  menuUpdate(dt) {
    if (!this.mStack) return;
    if (this.menuBlocked() || this.leaving) { return; }
    const c = PadNav.poll(dt); for (const k in c) { this.menuCmd(c); break; }
  },
  menuChangelog() { this.menuBusy((done) => Changelog.show(done)); },
  menuHowTo(section) { this.menuBusy((done) => HowTo.show(done, section)); },
  // старые имена точек входа
  openSettings() { this.menuOpen('settings'); },
  openPick() { this.menuOpen('bosstest'); },
  closePick() { if (this.mTop().id === 'bosstest') this.menuBack(); },
  openSpeedrun() { this.menuOpen('speedrun'); },
});

// ---------- экраны ----------
const MENU_LAST = 'tt_players';
const menuPlayers = () => { try { return localStorage.getItem(MENU_LAST) === '2' ? 2 : 1; } catch (_) { return 1; } };
const menuChapterCamp = (ch) => {
  const p = Settings.progress() || {};
  return { ch, st: ch === 1 ? 'level' : 'road', beads: ch === 1 ? 0 : (p.beads | 0), abil: ch === 1 ? {} : { ...(p.abil || {}) }, up: { ...Campaign.freshUp(), ...(p.up || {}) }, time: 0, deaths: 0 };
};

menuAdd({
  id: 'main', root: true, title: 'Тропа Ткачей',
  items: (m) => {
    const p = Settings.progress();
    return [
      { key: '1', label: 'Продолжить', sub: () => (p ? (p.name || 'скамья') + (menuPlayers() === 2 ? ' · вдвоём' : '') : ''), hidden: !p,
        act: (m) => m.go(menuPlayers(), undefined, Campaign.resume()) },
      { key: '2', label: 'Кампания', sub: 'новая игра, главы, вдвоём', act: (m) => m.menuGo('campaign') },
      { key: '3', label: 'Босс-тест', sub: 'три босса, тренировка, рекорды', act: (m) => m.menuGo('bosstest') },
      { key: '4', label: 'Спидран', sub: 'Тропа целиком, Босс-раш, гонка 1×1', act: (m) => m.menuGo('speedrun') },
      { key: '5', label: 'Гонки Ткачей', sub: 'организатор, игрок, обсервер', act: (m) => m.menuGo('races') },
      { key: '6', label: 'Как играть', sub: 'управление, приёмы, боссы', act: (m) => m.menuHowTo() },
      { key: '7', label: 'Настройки', sub: 'звук, экран, управление, игра', act: (m) => m.menuGo('settings') },
    ];
  },
  extra: () => ({ kb: 'N — что нового', pad: `${Dev.names().x} — что нового` }),
});

menuAdd({
  id: 'campaign', parent: 'main', title: 'Кампания',
  info: () => ['Четыре главы: Корнематка, Миша, Владик, Тима. Прогресс сохраняется на скамьях.', { t: Settings.progress() ? 'Сохранение: ' + (Settings.progress().name || 'скамья') : 'Сохранения пока нет.', c: '#ffe3a3' }],
  items: () => {
    const p = Settings.progress(), best = p ? Math.max(p.best | 0, p.chapter | 0) : 0;
    return [
      { key: '1', label: 'Новая игра', sub: p ? 'с главы I; старое сохранение заменится позже' : 'с главы I',
        act: (m) => (Settings.progress() ? m.menuGo('newgame') : m.menuGo('mode', { camp: Campaign.fresh(), crumb: 'Новая игра' })) },
      { key: '2', label: 'Выбрать главу', sub: best >= 2 ? 'пройденные главы' : 'откроется после главы I', enabled: best >= 2, act: (m) => m.menuGo('chapters') },
    ];
  },
});

menuAdd({
  id: 'newgame', parent: 'campaign', title: 'Начать заново?', crumb: 'Новая игра', foc: 1,
  info: () => [`Сейчас сохранено: ${(Settings.progress() || {}).name || 'скамья'}.`, 'Старое сохранение останется, пока вы не сядете на первую скамью новой игры: тогда оно заменится.'],
  items: () => [
    { key: '1', label: 'Да, начать заново', sub: 'бусины и улучшения с нуля', danger: true, act: (m) => m.menuGo('mode', { camp: Campaign.fresh(), crumb: 'Новая игра' }) },
    { key: '2', label: 'Нет, назад', act: (m) => m.menuBack() },
  ],
});

menuAdd({
  id: 'chapters', parent: 'campaign', title: 'Выбор главы', crumb: 'Глава',
  info: () => ['Можно переиграть любую пройденную главу. Сохранение продолжится с неё, но открытые главы не потеряются.'],
  items: () => {
    const p = Settings.progress() || {}, best = Math.max(p.best | 0, p.chapter | 0, 1);
    return Object.keys(CHAPTERS).map((k) => +k).filter((ch) => ch <= best).map((ch) => ({
      key: String(ch), label: `Глава ${CHAPTERS[ch].roman} · ${CHAPTERS[ch].name}`, sub: ch === 1 ? 'Корнематка' : `${CHAPTERS[ch].road} → ${BOSSES.find((b) => b.id === CHAPTERS[ch].boss).name}`,
      act: (m) => m.menuGo('mode', { camp: menuChapterCamp(ch), crumb: `Глава ${CHAPTERS[ch].roman}` }),
    }));
  },
});

menuAdd({
  id: 'mode', parent: 'campaign', title: 'Как играем?', crumb: (m, ctx) => ctx.crumb || 'Режим',
  info: (m, ctx) => ['Выберите, с кем идёте по Тропе.', { t: 'Вдвоём по сети: один создаёт комнату и присылает код, второй входит по коду.', c: '#7fa596' }],
  items: (m, ctx) => [
    { key: '1', label: 'Один ткач', sub: 'клавиатура или геймпад', act: (m) => m.go(1, undefined, ctx.camp) },
    { key: '2', label: 'Двое за одним компьютером', sub: 'игрок 2 — на стрелках', act: (m) => m.go(2, undefined, ctx.camp) },
    { key: '3', label: 'Вдвоём по сети', sub: 'создать комнату или войти по коду', act: (m) => m.menuGo('net', { mode: 'story', camp: ctx.camp }) },
  ],
});

menuAdd({
  id: 'net', parent: 'mode', title: 'Вдвоём по сети', crumb: 'По сети',
  info: () => ['Соединение идёт напрямую между браузерами, а если сеть не пускает — через ретранслятор. Порты и белый IP не нужны.'],
  items: (m, ctx) => [
    { key: '1', label: 'Создать комнату', sub: 'пришлите другу код или ссылку', act: (m) => m.openLobby(ctx.mode, 'host', ctx.camp) },
    { key: '2', label: 'Войти по коду', sub: 'код из пяти символов от друга', act: (m) => m.openLobby(ctx.mode, 'join', ctx.camp) },
  ],
});

menuAdd({
  id: 'bosstest', parent: 'main', title: 'Босс-тест', crumb: 'Босс-тест',
  lrText: 'менять',
  info: (m) => {
    const b = BOSSES[m.pickIdx], r = Records.get(b.id);
    return [{ t: b.name, head: true, c: '#ffd47a' }, b.about, { t: Records.line(b.id), c: '#ffe3a3' },
      { t: Training.on ? `Тренировка: бесконечное здоровье, счётчик урона и DPS, сброс босса клавишей Y. Старт с фазы ${Training.phase}. Рекорды не пишутся.` : 'Бой сразу с выбранным боссом.', c: '#7fa596' }];
  },
  lr: (m, ctx, d) => m.setPick(m.pickIdx + d),
  keys: { KeyT: () => menuTrainToggle(), KeyP: () => menuTrainPhase() },
  extra: () => ({ kb: 'T — тренировка, P — фаза' }),
  items: () => [
    { kind: 'cards', sel: (m) => m.pickIdx, pick: (m, ctx, k) => m.setPick(k), lr: (m, ctx, d) => m.setPick(m.pickIdx + d), enter: (m) => { m.mFoc = 1; m.menuPaint(); } },
    { key: '1', label: 'Один ткач', sub: 'в бой сразу', act: (m) => m.go(1, 'bosstest') },
    { key: '2', label: 'Двое за одним компьютером', act: (m) => m.go(2, 'bosstest') },
    { key: '3', label: 'Вдвоём по сети', sub: () => (Training.on ? 'в тренировке — только вдвоём у одного компьютера' : 'создать комнату или войти по коду'), enabled: () => !Training.on, act: (m) => m.menuGo('net', { mode: 'bosstest' }) },
    { key: '4', label: 'Тренировка', sub: 'здоровье бесконечное, счётчик урона', value: () => (Training.on ? 'вкл' : 'выкл'), act: () => menuTrainToggle(), lr: () => menuTrainToggle() },
    { key: '5', label: 'Старт с фазы', sub: () => (Training.on ? 'только в тренировке' : 'включит тренировку'), value: () => String(Training.phase), act: () => menuTrainPhase(), lr: (m, c, d) => menuTrainPhase(d) },
  ],
});
function menuTrainToggle() { Training.on = !Training.on; Training.save(); const m = window.__game && window.__game.scene.getScene('menu'); if (m) m.menuRender(); }
function menuTrainPhase(d) {
  if (!Training.on) { Training.on = true; } else Training.phase = ((Training.phase - 1 + (d || 1) + 3) % 3) + 1;
  Training.save(); const m = window.__game && window.__game.scene.getScene('menu'); if (m) m.menuRender();
}

menuAdd({
  id: 'races', parent: 'main', title: 'Гонки Ткачей', crumb: 'Гонки Ткачей',
  info: () => [{ t: 'Скоро', head: true, c: '#ffd47a' }, 'Новый соревновательный режим появится в версии 1.8. Пока здесь заглушка.', { t: 'А пока: Спидран → Гонка 1×1 по сети уже работает.', c: '#7fa596' }],
  items: () => [
    { key: '1', label: 'Создать гонку', sub: 'появится в 1.8', enabled: false },
    { key: '2', label: 'Войти игроком по коду', sub: 'появится в 1.8', enabled: false },
    { key: '3', label: 'Обсервер', sub: 'появится в 1.8', enabled: false },
    { key: '4', label: 'Рейтинг и архив', sub: 'появится в 1.8', enabled: false },
  ],
});

menuAdd({
  id: 'settings', parent: 'main', title: 'Настройки', crumb: 'Настройки',
  info: () => ['Всё запоминается в этом браузере.', { t: 'Сброс прогресса — в разделе «Прогресс».', c: '#7fa596' }],
  items: () => Settings.SECS.map(([id, name, sub], i) => ({ key: String(i + 1), label: name, sub, act: (m) => m.menuBusy((done) => Settings.show(done, id)) })),
});
