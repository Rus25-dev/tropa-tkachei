// ===== СЕНСОРНОЕ УПРАВЛЕНИЕ: стик слева, кнопки справа, пауза и полный экран =====
const Touch = {
  enabled: false, visible: false, bombs: false,
  state: { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false },
  stick: null, root: null, onTap: null,
  detect() {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '1') return true; if (q === '0') return false;
    return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  },
  init() {
    this.enabled = this.detect();
    document.documentElement.classList.toggle('touch', this.enabled);
    if (!this.enabled) return;
    const root = document.createElement('div'); root.id = 'touch'; root.hidden = true; this.root = root;
    root.innerHTML = `
      <div class="t-zone" id="t-zone"><div class="t-base" id="t-base" hidden><div class="t-knob" id="t-knob"></div></div><span class="t-hint" id="t-hint">тяни, чтобы идти</span></div>
      <div class="t-btns">
        <button class="t-btn t-heal" data-act="heal" type="button" aria-label="Лечение"><b>✚</b><i>Лечить</i></button>
        <button class="t-btn t-dash" data-act="dash" type="button" aria-label="Рывок"><b>»</b><i>Рывок</i></button>
        <button class="t-btn t-bomb" data-act="bomb" type="button" aria-label="Дымовая бомба" hidden><b>●</b><i>Бомба</i></button>
        <button class="t-btn t-atk" data-act="atk" type="button" aria-label="Удар"><b>⟋</b><i>Удар</i></button>
        <button class="t-btn t-jump" data-act="jump" type="button" aria-label="Прыжок"><b>▲</b><i>Прыжок</i></button>
      </div>
      <button class="t-pause" id="t-pause" type="button" aria-label="Пауза">❚❚</button>`;
    document.body.appendChild(root);
    // кнопки: каждая следит за своим пальцем
    root.querySelectorAll('.t-btn').forEach((b) => {
      const act = b.dataset.act, ids = new Set();
      const down = (e) => { e.preventDefault(); Snd.init(); ids.add(e.pointerId); try { b.setPointerCapture(e.pointerId); } catch (_) { }
        if (!this.state[act]) { this.state[act] = true; if (this.onTap) this.onTap(act); } b.classList.add('on'); this.buzz(); };
      const up = (e) => { ids.delete(e.pointerId); if (!ids.size) { this.state[act] = false; b.classList.remove('on'); } };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    // плавающий стик
    const zone = root.querySelector('#t-zone'), base = root.querySelector('#t-base'), knob = root.querySelector('#t-knob'), hint = root.querySelector('#t-hint');
    let sid = null, ox = 0, oy = 0;
    const R = 52;
    const move = (e) => {
      if (e.pointerId !== sid) return;
      let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const s = this.state, prevUp = s.up;
      s.left = dx < -16; s.right = dx > 16; s.up = dy < -26; s.down = dy > 26;
      if (s.up && !prevUp && this.onTap) this.onTap('up');
    };
    zone.addEventListener('pointerdown', (e) => {
      if (sid !== null) return; e.preventDefault(); Snd.init();
      sid = e.pointerId; ox = e.clientX; oy = e.clientY; try { zone.setPointerCapture(sid); } catch (_) { }
      base.hidden = false; base.style.left = ox + 'px'; base.style.top = oy + 'px'; knob.style.transform = ''; hint.hidden = true;
    });
    zone.addEventListener('pointermove', move);
    const end = (e) => { if (e.pointerId !== sid) return; sid = null; base.hidden = true; Object.assign(this.state, { left: false, right: false, up: false, down: false }); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    root.querySelector('#t-pause').addEventListener('click', () => { const gs = this.game(); if (gs) gs.togglePause(); });
    // полный экран и поворот
    const fs = document.getElementById('fs-btn');
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) || navigator.standalone;
    const ios = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (fs && !standalone && (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) {
      fs.hidden = false;
      fs.addEventListener('click', () => this.fullscreen());
    } else if (fs && !standalone && ios) {
      // на iPhone полноэкранного режима нет — подсказываем установить на экран «Домой»
      fs.hidden = false;
      const tip = document.getElementById('ios-tip');
      fs.addEventListener('click', () => { tip.hidden = false; });
      document.getElementById('ios-tip-ok').addEventListener('click', () => { tip.hidden = true; });
    }
    document.addEventListener('fullscreenchange', () => { if (fs) fs.hidden = !!document.fullscreenElement; });
  },
  fullscreen() {
    const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    Promise.resolve(req.call(el)).then(() => { try { screen.orientation.lock('landscape').catch(() => { }); } catch (_) { } }).catch(() => { });
  },
  buzz() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) { } },
  game() { const g = window.__game && window.__game.scene.getScene('game'); return g && g.sys.isActive() ? g : null; },
  show(on, opts) {
    if (!this.enabled || !this.root) return;
    this.visible = on; this.root.hidden = !on;
    if (opts && opts.bombs != null) this.root.querySelector('.t-bomb').hidden = !opts.bombs;
    if (!on) for (const k in this.state) this.state[k] = false;
  },
};
