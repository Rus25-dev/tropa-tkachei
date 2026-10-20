// ===== НАСТРОЙКИ И СОХРАНЕНИЕ (localStorage; без него всё работает на значениях по умолчанию) =====
const Settings = {
  def: { vol: 80, mvol: 60, shake: true, easy: false, vibro: true, bsize: 'M', bop: 100, lefty: false, boss: 0, speed: 100, noflash: false, outl: false },
  s: null, open: false, onClose: null, cur: 'list', entry: null,
  // разделы настроек: [id, название, подпись] — экран «Настройки» в меню и страницы оверлея строятся по этому списку
  SECS: [['sound', 'Звук', 'громкость звуков и музыки'], ['screen', 'Экран', 'тряска, вспышки, контуры, весь экран'], ['controls', 'Управление', 'клавиши, геймпад, кнопки на телефоне, левша'],
    ['game', 'Игра', 'лёгкий режим, скорость'], ['progress', 'Прогресс', 'сохранение, сброс']],
  load() {
    this.s = { ...this.def };
    try { const raw = localStorage.getItem('tt_settings'); if (raw) Object.assign(this.s, JSON.parse(raw)); } catch (_) { }
  },
  save() { try { localStorage.setItem('tt_settings', JSON.stringify(this.s)); } catch (_) { } this.apply(); },
  // прогресс главы: последняя скамья и бусины
  progress() { try { const p = JSON.parse(localStorage.getItem('tt_save') || 'null'); return p && typeof p.bench === 'number' ? p : null; } catch (_) { return null; } },
  saveProgress(p) {
    const cur = this.progress(), best = Math.max(p.best | 0, cur ? cur.best | 0 : 0, cur ? cur.chapter | 0 : 0, p.chapter | 0);
    try { localStorage.setItem('tt_save', JSON.stringify({ ...p, best })); } catch (_) { }
  },
  resetProgress() { try { localStorage.removeItem('tt_save'); } catch (_) { } },
  btnScale() { return { S: 0.85, M: 1, L: 1.18 }[this.s.bsize] || 1; },
  apply() {
    const de = document.documentElement;
    de.classList.toggle('lefty', !!this.s.lefty);
    de.style.setProperty('--bop', String(this.s.bop / 100));
    if (Snd.master) Snd.master.gain.value = 0.35 * (this.s.vol / 100);
    if (typeof Music !== 'undefined') Music.setVolume();
    if (typeof Layout !== 'undefined') Layout.apply();
  },
  init() {
    this.load();
    const el = document.getElementById('settings');
    const $ = (id) => document.getElementById(id);
    const bind = () => {
      $('st-vol').value = this.s.vol; $('st-vol-v').textContent = this.s.vol + '%';
      $('st-mvol').value = this.s.mvol; $('st-mvol-v').textContent = this.s.mvol + '%';
      $('st-shake').checked = this.s.shake; $('st-easy').checked = this.s.easy;
      $('st-vibro').checked = this.s.vibro; $('st-lefty').checked = this.s.lefty; $('st-noflash').checked = this.s.noflash; $('st-outl').checked = this.s.outl;
      el.querySelectorAll('[name=st-speed]').forEach((r) => { r.checked = +r.value === this.s.speed; });
      $('st-bop').value = this.s.bop; $('st-bop-v').textContent = this.s.bop + '%';
      el.querySelectorAll('[name=st-bsize]').forEach((r) => { r.checked = r.value === this.s.bsize; });
      const p = this.progress();
      $('st-prog').textContent = p ? `Сохранено: ${p.name || 'скамья'}, бусин ${p.beads || 0}` : 'Сохранения главы пока нет';
      $('st-reset').disabled = !p; $('st-reset').textContent = 'Сбросить прогресс';
      this.fsSync();
      // раскладка геймпада — только показ
      const k = (typeof Pads !== 'undefined' && Pads.list().length) ? Pads.kindNow : 'xbox', ps = k === 'ps';
      const rows = [[ps ? '✕' : 'A', 'прыжок'], [ps ? '□' : 'X', 'удар'], [ps ? '○ / R2' : 'B / RT', 'рывок'], [ps ? '△ / L2' : 'Y / LT', 'нить'], [ps ? 'L1' : 'LB', 'дымовуха'], [ps ? 'R1' : 'RB', 'инструмент'],
        [ps ? 'Options' : 'Start', 'пауза'], [ps ? 'Create' : 'Back', 'карта'], ['Стик', 'движение']];
      $('st-pad').innerHTML = rows.map(([b, t]) => `<span><b>${b}</b> — ${t}</span>`).join('');
    };
    this.bindUI = bind;
    $('st-vol').addEventListener('input', (e) => { this.s.vol = +e.target.value; $('st-vol-v').textContent = this.s.vol + '%'; this.save(); });
    $('st-vol').addEventListener('change', () => { Snd.init(); Snd.play('bead'); });
    $('st-mvol').addEventListener('input', (e) => { this.s.mvol = +e.target.value; $('st-mvol-v').textContent = this.s.mvol + '%'; Snd.init(); this.save(); });
    $('st-bop').addEventListener('input', (e) => { this.s.bop = +e.target.value; $('st-bop-v').textContent = this.s.bop + '%'; this.save(); });
    for (const k of ['shake', 'easy', 'vibro', 'lefty', 'noflash', 'outl']) $('st-' + k).addEventListener('change', (e) => { this.s[k] = e.target.checked; this.save(); });
    el.querySelectorAll('[name=st-bsize]').forEach((r) => r.addEventListener('change', () => { this.s.bsize = r.value; this.save(); }));
    el.querySelectorAll('[name=st-speed]').forEach((r) => r.addEventListener('change', () => { this.s.speed = +r.value; this.save(); }));
    if (typeof Access !== 'undefined') Access.init();
    $('st-reset').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Точно сбросить? Нажмите ещё раз'; setTimeout(() => { b.dataset.armed = ''; bind(); }, 3500); return; }
      b.dataset.armed = ''; this.resetProgress(); bind(); $('st-prog').textContent = 'Прогресс сброшен: глава начнётся с начала';
    });
    const list = $('st-list');
    this.SECS.forEach(([id, name, sub], i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'st-go'; b.dataset.go = id;
      b.innerHTML = `<b>${i + 1} · ${name}</b><small>${sub}</small>`;
      b.addEventListener('click', () => this.go(id)); list.append(b);
    });
    $('st-fs').addEventListener('click', () => this.fsToggle());
    document.addEventListener('fullscreenchange', () => this.fsSync());
    Ov.chrome(el, { crumbs: ['Настройки'], back: () => this.back(), digits: true, hint: { act: 'переключить', lr: 'менять' } });
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.back(); }
      else if (e.key === 'Enter' && e.target.type === 'checkbox') e.target.click();
    });
    el.querySelectorAll('.st-touch').forEach((n) => { n.hidden = !Touch.enabled; });
    this.apply();
  },
  // весь экран: на iPhone у сайтов такого режима нет
  fsOk() { const d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); },
  fsOn() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
  fsToggle() {
    if (!this.fsOk()) { const t = document.getElementById('ios-tip'); if (t) t.hidden = false; return; }
    if (this.fsOn()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) { } } else Touch.fullscreen();
    setTimeout(() => this.fsSync(), 250);
  },
  fsSync() {
    const b = document.getElementById('st-fs'), n = document.getElementById('st-fs-note'); if (!b) return;
    const tip = !this.fsOk() && !!document.getElementById('ios-tip');
    b.disabled = !this.fsOk() && !tip;
    b.textContent = this.fsOk() ? (this.fsOn() ? 'Выйти из полного экрана' : 'Весь экран') : tip ? 'Как убрать панели' : 'Недоступно';
    n.textContent = this.fsOk() ? 'Игра занимает весь экран (F11 в браузере делает то же)' : 'На iPhone полного экрана у сайтов нет: поставьте игру на экран «Домой»';
  },
  // открыть оверлей: без section — список разделов, с section — сразу страница раздела
  show(onClose, section) {
    this.onClose = onClose || null; this.entry = this.SECS.some((x) => x[0] === section) ? section : null;
    this.bindUI(); this.open = true;
    const el = document.getElementById('settings'); el.hidden = false;
    this.go(this.entry || 'list'); Ov.opened(el);
  },
  go(v) {
    const el = document.getElementById('settings'); this.cur = v;
    el.querySelectorAll('.st-sec').forEach((n) => { n.hidden = n.dataset.sec !== v; });
    const sec = this.SECS.find((x) => x[0] === v);
    document.getElementById('st-title').textContent = sec ? sec[1] : 'Настройки';
    const base = Ov.base(['Пауза', 'Настройки']); // из меню — его путь («Настройки»), из паузы — «Пауза › Настройки»
    this.crumbList = sec ? [...base, sec[1]] : base; Ov.crumbs(el, this.crumbList);
    const n = Nav.focusables(el).length;
    Ov.hint(el, { act: v === 'list' ? 'открыть' : 'переключить', nums: n, lr: v === 'list' ? '' : 'менять' });
    const f = Nav.focusables(el)[0]; if (f) setTimeout(() => f.focus(), 0);
  },
  back() { if (this.cur !== 'list' && !this.entry) this.go('list'); else this.hide(); },
  hide() { this.open = false; document.getElementById('settings').hidden = true; const cb = this.onClose; this.onClose = null; if (cb) cb(); },
};
