// ===== ГЕЙМПАДЫ: DualSense / DualShock, Xbox, Steam Deck =====
// Читаем navigator.getGamepads() напрямую (стандартная раскладка): сам Phaser отдаёт кнопки, но не стик и не триггеры как нужно.
// Раскладка (индексы стандартного геймпада; в скобках PlayStation):
//   A (✕) прыжок · X (□) удар · B (○) / RB (R1) / RT (R2) рывок · Y (△) / LT (L2) нить (лечение, отбив, ↑+нить — всполох)
//   LB (L1) дымовуха · Start (Options) пауза · Back (Create/Share) или тачпад — карта · стик/крестовина — движение
const Pads = {
  active: false, idleT: 0, held: {}, name: '', kindNow: 'xbox',
  list() {
    let a = []; try { a = Array.from(navigator.getGamepads ? navigator.getGamepads() : []); } catch (_) { }
    return a.filter((p) => p && p.connected !== false && p.buttons && p.buttons.length >= 4);
  },
  kind(p) {
    const id = (p.id || '').toLowerCase();
    if (/054c|dualsense|dualshock|wireless controller|playstation|sony/.test(id)) return 'ps';
    if (/steam|28de|deck/.test(id)) return 'deck';
    if (/xbox|xinput|045e|microsoft/.test(id)) return 'xbox';
    return 'generic';
  },
  label(k) { return { ps: 'DualSense / DualShock', deck: 'Steam Deck', xbox: 'Xbox', generic: 'геймпад' }[k]; },
  // нормализованное состояние одного геймпада
  read(p) {
    const B = (n) => !!(p.buttons[n] && (p.buttons[n].pressed || p.buttons[n].value > 0.5));
    const T = (n) => !!(p.buttons[n] && (p.buttons[n].pressed || p.buttons[n].value > 0.35));
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, dz = 0.32;
    const s = {
      left: ax < -dz || B(14), right: ax > dz || B(15), up: ay < -0.5 || B(12), down: ay > 0.5 || B(13),
      jump: B(0), atk: B(2), dash: B(1) || T(7), heal: B(3) || T(6), bomb: B(4), tool: B(5),
      pause: B(9), map: B(8) || B(17),
    };
    s.any = s.left || s.right || s.up || s.down || s.jump || s.atk || s.dash || s.heal || s.bomb || s.pause;
    return s;
  },
  // кадр: определяем «режим геймпада» (прячем сенсорные кнопки) и ловим фронт паузы/карты
  frame(scene, dt) {
    const ps = this.list();
    let any = false;
    ps.forEach((p, i) => {
      const s = this.read(p); if (s.any) any = true;
      const h = this.held[i] || (this.held[i] = {});
      if (s.pause && !h.pause && scene.togglePause) scene.togglePause();
      if (s.map && !h.map && typeof MapTravel !== 'undefined' && scene.sys.isActive() && !MapTravel.open && MapTravel.canOpen(scene)) { scene._mapPad = { back: true }; MapTravel.show(scene); }
      h.pause = s.pause; h.map = s.map;
      this.kindNow = this.kind(p); this.name = this.label(this.kindNow);
    });
    if (any) { this.idleT = 0; if (!this.active) this.setActive(true); } else { this.idleT += dt; }
    return ps.length;
  },
  setActive(on) {
    this.active = on;
    if (typeof Touch !== 'undefined' && Touch.root) Touch.root.classList.toggle('padmode', on);
  },
  hint(k) {
    k = k || this.kindNow;
    const ps = k === 'ps';
    const A = ps ? '✕' : 'A', X = ps ? '□' : 'X', B_ = ps ? '○' : 'B', Y = ps ? '△' : 'Y';
    const L1 = ps ? 'L1' : 'LB', R1 = ps ? 'R1' : 'RB', L2 = ps ? 'L2' : 'LT', R2 = ps ? 'R2' : 'RT';
    return `${this.label(k)}: ${A} прыжок · ${X} удар · ${B_} / ${R2} рывок · ${Y} / ${L2} нить (лечение, отбив; ↑+нить — всполох) · ${L1} дымовуха · ${R1} инструмент · ${ps ? 'Options' : 'Start'} пауза · ${ps ? 'Create' : 'Back'} карта`;
  },
};

// вибрация геймпада (Chrome/Edge: DualSense и Xbox; Firefox пока не умеет)
const Haptics = {
  rumble(ms, strong, weak) {
    if (typeof Settings !== 'undefined' && Settings.s && Settings.s.vibro === false) return;
    for (const p of Pads.list()) {
      const a = p.vibrationActuator; if (!a || !a.playEffect) continue;
      try { a.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => { }); } catch (_) { }
    }
  },
};

(function () {
  const proto = GameScene.prototype;
  // опрос каждый кадр
  const update = proto.update;
  proto.update = function (time, delta) { Pads.frame(this, delta / 1000); return update.call(this, time, delta); };
  // отдача
  const hurt = proto.hurtPlayer;
  proto.hurtPlayer = function (p, ...a) {
    const hp = p.hp, inv = p.inv; hurt.call(this, p, ...a);
    if (!p.remote && (p.hp < hp)) Haptics.rumble(p.hp <= 0 ? 420 : 180, 0.9, 0.5);
    return undefined;
  };
  const parry = proto.parrySuccess;
  proto.parrySuccess = function (p, ...a) { if (!p.remote) Haptics.rumble(110, 0.25, 0.9); return parry.call(this, p, ...a); };
  const burst = proto.silkBurst;
  proto.silkBurst = function (p, ...a) { if (!p.remote) Haptics.rumble(220, 0.8, 0.6); return burst.call(this, p, ...a); };
  const shift = proto.phaseShift;
  if (shift) proto.phaseShift = function (...a) { Haptics.rumble(380, 1, 0.8); return shift.apply(this, a); };
  const poise = proto.poiseAdd;
  if (poise) proto.poiseAdd = function (b, n) { const was = b && b.stagger; const r = poise.call(this, b, n); if (b && b.stagger > 0 && !was) Haptics.rumble(260, 0.7, 0.7); return r; };
  // строка раскладки в паузе
  const showPause = UIScene.prototype.showPause;
  UIScene.prototype.showPause = function (on) {
    showPause.call(this, on);
    if (!this.ready || !on || !Pads.list().length) { if (this.padHint) this.padHint.setVisible(false); return; }
    if (!this.padHint) { this.padHint = this.add.text(VW / 2, VH - 44, '', { fontFamily: '"Fira Sans", sans-serif', fontSize: '13px', color: '#9ff0c8', align: 'center', wordWrap: { width: VW - 80 } }).setOrigin(0.5); this.pause.add(this.padHint); }
    this.padHint.setText(Pads.hint()).setVisible(true);
  };
})();

// подключение: сообщение о геймпаде; касание экрана возвращает сенсорные кнопки
window.addEventListener('gamepadconnected', (e) => {
  const k = Pads.kind(e.gamepad);
  try { const ui = window.__game && window.__game.scene.getScene('ui'); if (ui && ui.toast && ui.ready) ui.toast('Подключён геймпад: ' + Pads.label(k), 3); } catch (_) { }
});
document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && Pads.active) Pads.setActive(false); }, true);
