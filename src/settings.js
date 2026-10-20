// ===== НАСТРОЙКИ И СОХРАНЕНИЕ (localStorage; без него всё работает на значениях по умолчанию) =====
const Settings = {
  def: { vol: 80, mvol: 60, shake: true, easy: false, vibro: true, bsize: 'M', bop: 100, lefty: false, boss: 0 },
  s: null, open: false, onClose: null,
  load() {
    this.s = { ...this.def };
    try { const raw = localStorage.getItem('tt_settings'); if (raw) Object.assign(this.s, JSON.parse(raw)); } catch (_) { }
  },
  save() { try { localStorage.setItem('tt_settings', JSON.stringify(this.s)); } catch (_) { } this.apply(); },
  // прогресс главы: последняя скамья и бусины
  progress() { try { const p = JSON.parse(localStorage.getItem('tt_save') || 'null'); return p && typeof p.bench === 'number' ? p : null; } catch (_) { return null; } },
  saveProgress(p) { try { localStorage.setItem('tt_save', JSON.stringify(p)); } catch (_) { } },
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
      $('st-vibro').checked = this.s.vibro; $('st-lefty').checked = this.s.lefty;
      $('st-bop').value = this.s.bop; $('st-bop-v').textContent = this.s.bop + '%';
      el.querySelectorAll('[name=st-bsize]').forEach((r) => { r.checked = r.value === this.s.bsize; });
      const p = this.progress();
      $('st-prog').textContent = p ? `Сохранено: ${p.name || 'скамья'}, бусин ${p.beads || 0}` : 'Сохранения главы пока нет';
      $('st-reset').disabled = !p; $('st-reset').textContent = 'Сбросить прогресс';
    };
    this.bindUI = bind;
    $('st-vol').addEventListener('input', (e) => { this.s.vol = +e.target.value; $('st-vol-v').textContent = this.s.vol + '%'; this.save(); });
    $('st-vol').addEventListener('change', () => { Snd.init(); Snd.play('bead'); });
    $('st-mvol').addEventListener('input', (e) => { this.s.mvol = +e.target.value; $('st-mvol-v').textContent = this.s.mvol + '%'; Snd.init(); this.save(); });
    $('st-bop').addEventListener('input', (e) => { this.s.bop = +e.target.value; $('st-bop-v').textContent = this.s.bop + '%'; this.save(); });
    for (const k of ['shake', 'easy', 'vibro', 'lefty']) $('st-' + k).addEventListener('change', (e) => { this.s[k] = e.target.checked; this.save(); });
    el.querySelectorAll('[name=st-bsize]').forEach((r) => r.addEventListener('change', () => { this.s.bsize = r.value; this.save(); }));
    $('st-reset').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Точно сбросить? Нажмите ещё раз'; setTimeout(() => { b.dataset.armed = ''; bind(); }, 3500); return; }
      b.dataset.armed = ''; this.resetProgress(); bind(); $('st-prog').textContent = 'Прогресс сброшен: глава начнётся с начала';
    });
    $('st-done').addEventListener('click', () => this.hide());
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.hide(); });
    el.querySelectorAll('.st-touch').forEach((n) => { n.hidden = !Touch.enabled; });
    this.apply();
  },
  show(onClose) { this.onClose = onClose || null; this.bindUI(); this.open = true; document.getElementById('settings').hidden = false; setTimeout(() => document.getElementById('st-done').focus(), 0); },
  hide() { this.open = false; document.getElementById('settings').hidden = true; const cb = this.onClose; this.onClose = null; if (cb) cb(); },
};
