// ===== ИГРА: «Тропа Ткачей» — кооперативная метроидвания =====
let VW = 960; const VH = 540;
// версия игры; номер сборки подставляет build.py
const GAME_VERSION = '1.3';
const GAME_BUILD = '__BUILD__';
const CHANGELOG = [
  'Рекорды боссов (попытки, лучшее время), возрождение у арены Корнематки, подсказки про отбив и всполох',
  'Кампания: после Корнематки — Глава II (Миша), III (Владик), IV (Тима) с коридорами перед аренами',
  'Прогресс по главам сохраняется на скамьях; «Продолжить» возвращает в нужную главу',
  'Лавка у скамьи (↓ на скамье): маски здоровья, острая игла, лёгкая катушка за бусины',
  'Казнь: оглушил босса — подойди и ударь вверх или вниз: добивающий удар, бонус нити',
  'Шкала стойкости над боссом, разные звуки ударов по каждому боссу, замедление и вспышка на смерть босса',
  'Новое в третьей фазе: эхо Владика, «лаги» Тимы, печатный валик Миши',
  'Нитяной всполох больше не копит нить на своих же ударах; боссы стали выносливее и честнее',
  'Бой: третий удар подряд — тяжёлый финишер (шире, бьёт дважды)',
  'Рывок сквозь атаку — идеальный уворот: без урона, +2 нити',
  'Босса можно оглушить серией ударов: замирает и получает двойной урон',
  'Отзывчивее управление: буфер удара и рывка, зависание в верхней точке прыжка, скольжение мимо углов потолка',
  'Боссы 2.0: у каждого 3 фазы, ярость и новые атаки',
  'Корнематка: корни из-под земли, двойные прыжки',
  'Миша: «Диктант!» и застёгнутый рюкзак',
  'Владик: нотный стан и выпад смычком',
  'Тима: коллекторы и падающие ачивки',
];
// ширина поля подстраивается под пропорции экрана: на вытянутых телефонах без чёрных полос
function computeVW() {
  const bx = Layout.box(), w = bx.w || window.innerWidth || 960, h = bx.h || window.innerHeight || 540;
  const a = Math.max(w, h) / Math.max(1, Math.min(w, h));
  return Math.round(clamp(VH * a, 960, 1280) / 2) * 2;
}
const STEP = 1 / 60;
const P = {
  G: 1500, RUN: 230, JUMP: 700, CUT: 0.45, MAXFALL: 720, COYOTE: 0.1, BUF: 0.13,
  DASH: 540, DASHT: 0.17, DASHCD: 0.45, WSLIDE: 110, WJX: 290, WJY: 600, WJLOCK: 0.16,
  POGO: 540, ATK_T: 0.12, ATK_CD: 0.26, INV: 1.0, HURT: 0.22, SILK: 9,
  BURST: 4, HEAL: 2, HEAL_T: 1.1, PARRY_T: 0.2, PARRY_CD: 0.65, APEX_VY: 90, APEX_G: 0.55, ATKBUF: 0.14, DASHBUF: 0.12, CORNER: 7,
};
const PAL = [
  { name: 'Ива', tag: 'Di', cloak: 0x2f9a8a, dark: 0x1b5c53, accent: 0x9ff0dc, hex: '#8fe8d2' },
  { name: 'Ярь', tag: 'Ta', cloak: 0xd8862a, dark: 0x8a4f16, accent: 0xffd9a0, hex: '#ffc46e' },
];
const MASK = 0xe8e2cf, INK = 0x10141a;
const PERSIST_KINDS = new Set(['wave', 'rwave', 'pad', 'stamp', 'box', 'clef', 'rootspike', 'staff', 'collector', 'trophy', 'echo', 'roller']);
// тяжёлые удары боссов отнимают 2 бутона: у них длинный телеграф, и их можно красиво избежать
const HEAVY_KINDS = new Set(['rwave', 'wave', 'rootspike', 'stamp', 'trophy', 'bigletter', 'roller', 'echo', 'box']);
const HEAVY_STATES = new Set(['charge', 'lunge', 'leap', 'lagFall']);
const SLASH_KINDS = new Set(['spore', 'letter', 'note', 'bottle', 'rain', 'collector']);
const STORY_KINDS = new Set(['spore', 'wave', 'rock']);
const NET_KINDS = ['spore', 'wave', 'rock', 'letter', 'bigletter', 'bomb', 'clef', 'note', 'drip', 'bottle', 'pad', 'rwave', 'ringfx', 'box', 'stamp', 'rootspike', 'rain', 'staff', 'collector', 'trophy', 'staffghost', 'echo', 'roller', 'mark'];
const NET_SIZES = [[12, 12], [24, 18], [16, 16], [22, 26], [56, 60], [12, 12], [28, 40], [14, 18], [8, 10], [10, 22], [26, 18], [24, 18], [0, 0], [36, 22], [80, 44], [36, 70], [22, 26], [1344, 10], [22, 22], [30, 30], [1344, 0], [40, 84], [46, 52], [0, 0]];
const BOSSES = [
  { id: 'misha', name: 'Миша Додик', about: 'Швыряется печатными буквами. Бей дымовыми бомбами в рюкзак.' },
  { id: 'vladik', name: 'Владик Скрипка', about: 'Кидает скрипичные ключи и мажет шторы слизью. Бей иглой.' },
  { id: 'tima', name: 'Тима Пиво', about: 'Пиво, банкротство, приставка и волшебная пыль. Бей иглой.' },
];
const KC = () => Phaser.Input.Keyboard.KeyCodes;

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inset = (r, d) => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- МЕНЮ ----------
class MenuScene extends Phaser.Scene {
  constructor() { super('menu'); }
  create() {
    this.leaving = false;
    genBackgrounds(this);
    this.add.tileSprite(0, 0, VW, VH, 'bgFar').setOrigin(0);
    this.rays = this.add.tileSprite(0, 0, VW, VH, 'bgRays').setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
    this.mid = this.add.tileSprite(0, 0, VW, VH, 'bgMid').setOrigin(0);
    this.fog = this.add.tileSprite(0, 0, VW, VH, 'bgFog').setOrigin(0);
    this.add.tileSprite(0, 0, VW, VH, 'bgGlow').setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
    this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: VW }, y: { min: 0, max: VH }, lifespan: 6000, speedY: { min: -14, max: -4 }, speedX: { min: -6, max: 6 },
      scale: { min: 0.3, max: 0.9 }, alpha: { start: 0.8, end: 0 }, tint: [0x9ff0c8, 0xffd47a], frequency: 120,
      blendMode: 'ADD',
    }).setAlpha(0.7);
    this.add.image(0, 0, 'vignette').setOrigin(0).setDisplaySize(VW, VH);

    const glow = this.add.graphics();
    glow.fillStyle(0x9ff0c8, 0.06); for (let r = 140; r > 10; r -= 14) glow.fillCircle(VW / 2, 160, r);
    this.hero = this.add.graphics();
    this.heroTags = PAL.map((pal) => makeTag(this, pal, 1).setScale(1.6));

    this.add.text(VW / 2, 92, 'ТРОПА ТКАЧЕЙ', { fontFamily: '"Cormorant SC", Georgia, serif', fontSize: '64px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5).setShadow(0, 0, '#9ff0c8', 18, false, true);
    this.add.text(VW / 2, 136, Campaign.subtitle(), { fontFamily: '"Fira Sans", sans-serif', fontSize: '17px', color: '#8fb8a8' }).setOrigin(0.5);

    const mkBtn = (y, label, sub, n) => {
      const t = this.add.text(VW / 2, y, label, { fontFamily: '"Cormorant SC", Georgia, serif', fontSize: '29px', color: '#cfe8dc', fontStyle: '600' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const s = this.add.text(VW / 2, y + 21, sub, { fontFamily: '"Fira Sans", sans-serif', fontSize: '13px', color: '#6f9586' }).setOrigin(0.5);
      t.on('pointerover', () => t.setColor('#ffd47a')); t.on('pointerout', () => t.setColor('#cfe8dc'));
      t.on('pointerdown', () => (n === 3 ? this.openLobby() : n === 4 ? this.openPick() : n === 5 ? this.openSettings() : this.go(n)));
      return [t, s];
    };
    const prog = Settings.progress(), cont = prog ? ` · продолжение: ${prog.name || 'скамья'}` : '';
    mkBtn(238, '1 · Один ткач', 'клавиша 1 · геймпад A' + cont, 1);
    mkBtn(284, '2 · Двое за одним компьютером', 'клавиша 2 · геймпад Y' + cont, 2);
    mkBtn(330, '3 · Вдвоём по сети', 'клавиша 3 · комната с кодом, работает и с серым IP', 3);
    mkBtn(376, '4 · Босс-тест', 'клавиша 4 · геймпад X · три босса на выбор, сразу в бой', 4);
    mkBtn(422, '5 · Настройки', 'клавиша 5 · громкость, тряска, лёгкий режим, кнопки', 5);

    const ctl = [
      'Игрок 1:  A D W S — ходить   Пробел — прыжок   F — удар   G — рывок   Q — лечение   R — дымовуха',
      'Игрок 2:  стрелки   Num1 или / — прыжок   Num2 или . — удар   Num3 или , — рывок   Num0 или M — лечение   Num4 или N — дымовуха',
      'В одиночку можно и так: стрелки + Z X C V B.   Геймпад: A прыжок, X удар, B/RB рывок, Y лечение, LB дымовуха.   Esc — пауза',
    ];
    if (Touch.enabled) ctl.splice(0, 3, 'Телефон: стик слева — идти (вверх: удар вверх, оживить напарника, скамья; вниз в прыжке: удар вниз).',
      'Кнопки справа: прыжок, удар, рывок, лечение, а на арене Миши ещё и бомба.   Лучше держать телефон горизонтально.', 'Можно подключить геймпад по Bluetooth — он подхватится сам.');
    document.documentElement.classList.add('in-menu');
    this.events.once('shutdown', () => document.documentElement.classList.remove('in-menu'));
    this.add.text(VW / 2, 488, ctl.join('\n'), { fontFamily: '"Fira Sans", sans-serif', fontSize: '12px', color: '#86a89a', align: 'center', lineSpacing: 7 }).setOrigin(0.5);

    const k = this.input.keyboard;
    // версия, сборка и что нового
    const vF = '"Fira Sans", sans-serif';
    this.add.text(14, 10, `Версия ${GAME_VERSION} · сборка ${GAME_BUILD}`, { fontFamily: vF, fontSize: '12px', fontStyle: '600', color: '#9fc4b4' });
    this.add.text(14, 28, 'Что нового:\n' + CHANGELOG.map((l) => '· ' + l).join('\n'), { fontFamily: vF, fontSize: '10.5px', color: '#7fa596', lineSpacing: 3, wordWrap: { width: Math.max(170, Math.min(230, VW / 2 - 300)) } });
    // выбор для босс-теста
    this.pick = this.add.container(0, 0).setVisible(false).setDepth(10);
    const pg = this.add.graphics(); pg.fillStyle(0x030807, 0.9); pg.fillRect(0, 0, VW, VH);
    const D = '"Cormorant SC", Georgia, serif', F = '"Fira Sans", sans-serif';
    const pt = this.add.text(VW / 2, 84, 'Босс-тест', { fontFamily: D, fontSize: '44px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5);
    this.pickIdx = 0;
    this.bossBtns = BOSSES.map((b, i) => {
      const t = this.add.text(VW / 2 + (i - 1) * 270, 150, b.name, { fontFamily: D, fontSize: '28px', color: '#8fb8a8', fontStyle: '700' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => this.setPick(i));
      return t;
    });
    this.pickLine = this.add.graphics();
    const ph = this.add.text(VW / 2, 186, '← → выбрать босса', { fontFamily: F, fontSize: '12px', color: '#6f9586' }).setOrigin(0.5);
    const ps = this.add.text(VW / 2, 222, '', { fontFamily: F, fontSize: '15px', color: '#cfe8dc' }).setOrigin(0.5);
    this.pickAbout = ps;
    const mkPick = (y, label, fn) => {
      const t = this.add.text(VW / 2, y, label, { fontFamily: D, fontSize: '30px', color: '#cfe8dc', fontStyle: '600' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffd47a')); t.on('pointerout', () => t.setColor('#cfe8dc')); t.on('pointerdown', fn);
      return t;
    };
    const p1 = mkPick(290, '1 · В одиночку', () => this.go(1, 'bosstest'));
    const p2 = mkPick(343, '2 · Вдвоём за одним компьютером', () => this.go(2, 'bosstest'));
    const p3 = mkPick(396, '3 · Вдвоём по сети', () => this.openLobby('bosstest'));
    const pb = mkPick(470, '← Назад (Esc)', () => this.closePick()); pb.setFontSize(22);
    this.pick.add([pg, pt, ...this.bossBtns, this.pickLine, ph, ps, p1, p2, p3, pb]);
    this.setPick(Settings.s.boss || 0);
    k.on('keydown', (e) => {
      Snd.init();
      if (Settings.open || !Lobby.el.hidden) return;
      if (this.pick.visible) {
        if (e.key === '1') this.go(1, 'bosstest'); if (e.key === '2') this.go(2, 'bosstest'); if (e.key === '3') this.openLobby('bosstest');
        if (e.key === 'Escape') this.closePick();
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф') this.setPick(this.pickIdx - 1);
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') this.setPick(this.pickIdx + 1);
        return;
      }
      if (e.key === '1') this.go(1); if (e.key === '2') this.go(2); if (e.key === '3') this.openLobby(); if (e.key === '4') this.openPick(); if (e.key === '5') this.openSettings();
    });
    if (Lobby.room) this.time.delayedCall(300, () => this.openLobby());
    Music.setDuck(1); Music.play('menu');
    this.input.on('pointerdown', () => Snd.init());
    this.t = 0;
  }
  openSettings() { if (this.leaving || Settings.open) return; Snd.init(); Settings.show(() => this.scene.restart()); }
  setPick(i) {
    this.pickIdx = (i + BOSSES.length) % BOSSES.length;
    if (Settings.s.boss !== this.pickIdx) { Settings.s.boss = this.pickIdx; Settings.save(); }
    this.bossBtns.forEach((t, k) => t.setColor(k === this.pickIdx ? '#ffd47a' : '#8fb8a8'));
    const t = this.bossBtns[this.pickIdx], g = this.pickLine; g.clear();
    g.fillStyle(0xffd47a, 1); g.fillRect(t.x - t.width / 2, 168, t.width, 2);
    this.pickAbout.setText(BOSSES[this.pickIdx].about);
  }
  openPick() { if (this.leaving) return; Snd.init(); this.pick.setVisible(true); this.pickT = 0.3; }
  closePick() { this.pick.setVisible(false); }
  openLobby(mode) {
    if (this.leaving) return; this.leaving = true; Snd.init();
    Lobby.mode = mode || 'story'; Lobby.boss = BOSSES[this.pickIdx].id; Lobby.bossName = BOSSES[this.pickIdx].name; Lobby.show();
  }
  goOnline(role, mode, boss, camp) {
    Snd.play('bench'); this.cameras.main.fadeOut(450, 3, 8, 7);
    this.time.delayedCall(460, () => this.scene.start('game', { players: 2, online: role, mode: mode || 'story', boss: boss || 'misha', camp: camp || null }));
  }
  go(n, mode) {
    if (this.leaving) return; this.leaving = true; Snd.init(); Snd.play('bench');
    this.cameras.main.fadeOut(450, 3, 8, 7);
    this.time.delayedCall(460, () => this.scene.start('game', { players: n, mode: mode || 'story', boss: BOSSES[this.pickIdx].id, camp: mode ? null : Campaign.resume() }));
  }
  update(time, delta) {
    this.t += delta / 1000;
    this.mid.tilePositionX += delta * 0.01; this.fog.tilePositionX += delta * 0.02; this.rays.setAlpha(0.75 + Math.sin(this.t * 0.6) * 0.25);
    const pads = this.input.gamepad ? this.input.gamepad.gamepads.filter(Boolean) : [];
    this.pickT = (this.pickT || 0) - delta / 1000;
    if (Settings.open) return;
    for (const pad of pads) {
      const b = (n) => !!(pad.buttons[n] && pad.buttons[n].pressed);
      if (this.pick.visible) {
        if (this.pickT > 0) continue;
        if (b(0)) this.go(1, 'bosstest'); if (b(3)) this.go(2, 'bosstest'); if (b(1)) this.closePick();
        const lr = (pad.left ? -1 : 0) + (pad.right ? 1 : 0);
        if (lr && !this._lrHeld) this.setPick(this.pickIdx + lr);
        this._lrHeld = !!lr;
        continue;
      }
      if (b(0)) this.go(1);
      if (b(3)) this.go(2);
      if (b(2)) this.openPick();
    }
    // два ткача на заставке
    const g = this.hero; g.clear();
    for (let i = 0; i < 2; i++) {
      const x = VW / 2 + (i ? 26 : -26), y = 214 + Math.sin(this.t * 2 + i) * 3;
      drawWeaver(g, x, y, i ? -1 : 1, PAL[i], { bob: 0, leg: 0, sway: Math.sin(this.t * 1.6 + i) * 1.5, lift: 0 }, 1.6);
      this.heroTags[i].setPosition(x + (i ? 1 : -1) * 0.5, y - 13 * 1.6);
    }
  }
}

// общий рисунок ткача (для меню и игры)
// надпись на плаще ткача (Di / Ti)
function makeTag(scene, pal, depth) {
  return scene.add.text(0, 0, pal.tag, { fontFamily: '"Fira Sans", sans-serif', fontSize: '9px', fontStyle: '700', color: '#f4efe0', stroke: '#10141a', strokeThickness: 2 })
    .setOrigin(0.5).setDepth(depth);
}
function drawWeaver(g, x, y, face, pal, a, scale) {
  const s = scale || 1, f = face;
  const X = (v) => x + v * s * f, Y = (v) => y + v * s;
  const { bob, leg, sway, lift } = a;
  g.lineStyle(2.4 * s, 0x1a1414, 1);
  g.lineBetween(X(-3), Y(-8), X(-3 + leg), Y(0)); g.lineBetween(X(3), Y(-8), X(3 - leg), Y(0));
  g.fillStyle(pal.dark, 1);
  g.fillPoints([{ x: X(0), y: Y(-22 - bob) }, { x: X(-11 + sway), y: Y(-4 + lift) }, { x: X(-5 + sway), y: Y(-7 + lift) }, { x: X(1 + sway), y: Y(-3 + lift) }, { x: X(9 + sway * 0.5), y: Y(-6 + lift) }], true);
  g.fillStyle(pal.cloak, 1);
  g.fillPoints([{ x: X(0), y: Y(-23 - bob) }, { x: X(-8 + sway), y: Y(-8 + lift) }, { x: X(7 + sway * 0.5), y: Y(-9 + lift) }], true);
  const hy = -24 - bob;
  g.lineStyle(1.6 * s, MASK, 1);
  g.lineBetween(X(-2), Y(hy - 5), X(-6), Y(hy - 11)); g.lineBetween(X(-6), Y(hy - 11), X(-11), Y(hy - 12));
  g.lineBetween(X(2), Y(hy - 5), X(3), Y(hy - 12)); g.lineBetween(X(3), Y(hy - 12), X(0), Y(hy - 16));
  g.fillStyle(MASK, 1); g.fillEllipse(X(1), Y(hy), 13 * s, 12 * s);
  g.fillStyle(INK, 1); g.fillEllipse(X(2), Y(hy + 1), 2.6 * s, 5 * s); g.fillEllipse(X(5.5), Y(hy + 1), 2.6 * s, 5 * s);
  g.fillStyle(pal.accent, 1); g.fillRect(Math.min(X(-4), X(4)), Y(hy + 5), 8 * s, 2 * s);
}

// ---------- ФОН ----------
class BGScene extends Phaser.Scene {
  constructor() { super('bg'); }
  create() {
    this.far = this.add.tileSprite(0, 0, VW, VH, 'bgFar').setOrigin(0);
    this.rays = this.add.tileSprite(0, 0, VW, VH, 'bgRays').setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
    this.mid = this.add.tileSprite(0, 0, VW, VH, 'bgMid').setOrigin(0);
    this.fog = this.add.tileSprite(0, 0, VW, VH, 'bgFog').setOrigin(0);
    this.glow = this.add.tileSprite(0, 0, VW, VH, 'bgGlow').setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
    this.t = 0;
    this.spores = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: VW }, y: { min: 0, max: VH }, lifespan: { min: 4000, max: 8000 },
      speedY: { min: -12, max: -3 }, speedX: { min: -8, max: 8 }, scale: { min: 0.25, max: 0.8 },
      alpha: { start: 0.8, end: 0 }, tint: [0x9ff0c8, 0xbff5dd, 0xffd47a], frequency: 160, blendMode: 'ADD',
    });
  }
  update() {
    const gs = this.scene.get('game'); if (!gs || !gs.cameras || !gs.camX) return;
    const room = !!(gs.L && gs.L.theme);
    for (const o of [this.far, this.rays, this.mid, this.fog, this.glow, this.spores]) o.setVisible(!room);
    const x = gs.camX, y = gs.camY; this.t += 1 / 60;
    this.far.tilePositionX = x * 0.08; this.far.tilePositionY = (y - 600) * 0.03;
    this.rays.tilePositionX = x * 0.14; this.rays.setAlpha(0.75 + Math.sin(this.t * 0.5) * 0.25);
    this.mid.tilePositionX = x * 0.3; this.mid.tilePositionY = (y - 600) * 0.1;
    this.fog.tilePositionX = x * 0.45 + this.t * 6; this.fog.tilePositionY = (y - 600) * 0.15;
    this.glow.tilePositionX = x * 0.5; this.glow.tilePositionY = (y - 600) * 0.2;
  }
}

// ---------- ИГРОВАЯ СЦЕНА ----------
class GameScene extends Phaser.Scene {
  constructor() { super('game'); }
  init(data) { this.startData = data; this.mode = data.mode || 'story'; this.bossKind = data.boss || 'misha'; this.nPlayers = data.players || 1; this.online = data.online || null; this.localIdx = data.online === 'guest' ? 1 : 0; Campaign.init(this, data); }
  auth() { return this.online !== 'guest'; }
  sendEv(o) { if (this.online) Net.send({ t: 'ev', ...o }); }
  sfx(n) { if (this.quiet) return; Snd.play(n); if (this.online === 'host') this.sendEv({ k: 'snd', n }); }
  burst(n, x, y, c) { if (this.quiet) return; this.parts.setParticleTint(c); this.parts.explode(n, x, y); if (this.online === 'host') this.sendEv({ k: 'burst', n, x: Math.round(x), y: Math.round(y), c }); }
  dustAt(n, x, y) { this.dust.explode(n, x, y); if (this.online === 'host') this.sendEv({ k: 'dust', n, x: Math.round(x), y: Math.round(y) }); }
  shake(d, i) { this.cameras.main.shake(d, i); if (this.online === 'host') this.sendEv({ k: 'shake', d, i }); }
  toastAll(m) { this.ui().toast(m); this.sendEv({ k: 'toast', m }); }

  create() {
    genBackgrounds(this);
    this.scene.launch('bg'); this.scene.launch('ui');
    this.enemies = []; this.boss = null;
    const arenas = { misha: buildMishaArena, vladik: buildVladikArena, tima: buildTimaArena };
    this.L = Campaign.level(this) || (this.mode === 'bosstest' ? (arenas[this.bossKind] || buildMishaArena)() : buildLevel());
    this.misha = null; this.crates = null; this.vladik = null; this.tima = null; this.curtains = null; this.puddles = null; this.repoT = 0;
    const L = this.L;
    this.grid = L.grid;
    // карта
    this.chunks = L.theme === 'class' ? drawClassroom(this, L) : L.theme === 'den' ? drawDen(this, L) : drawLevelChunks(this, L);
    for (const c of this.chunks) this.add.image(c.x, 0, c.key).setOrigin(0).setDepth(L.theme ? 0.2 : 1);

    // таблички
    for (const s of L.signs) {
      const sx = s.x * T + 16, sy = (s.y + 1) * T;
      const g = this.add.graphics().setDepth(0.5);
      g.fillStyle(0x3a2c20, 1); g.fillRect(sx - 2, sy - 34, 4, 34);
      g.fillStyle(0x2a3b33, 0.92); g.fillRoundedRect(sx - 14, sy - 50, 28, 20, 4);
      g.lineStyle(1, 0x67ad62, 0.8); g.strokeRoundedRect(sx - 14, sy - 50, 28, 20, 4);
      g.fillStyle(0x9ff0c8, 0.9); g.fillCircle(sx, sy - 40, 3);
      const txt = this.add.text(sx, sy - 62, Touch.enabled && s.touch ? s.touch : s.text, { fontFamily: '"Fira Sans", sans-serif', fontSize: '13px', color: '#d9ecdf', align: 'center', lineSpacing: 3, backgroundColor: 'rgba(8,18,15,0.72)', padding: { x: 8, y: 5 } }).setOrigin(0.5, 1).setDepth(8).setAlpha(0);
      s.txt = txt; s.px = sx; s.py = sy;
    }
    // скамьи
    this.benches = L.benches.map((b) => {
      const bx = b.x * T + 16, by = (b.y + 1) * T;
      const g = this.add.graphics().setDepth(2);
      g.fillStyle(0x4a3726, 1); g.fillRoundedRect(bx - 26, by - 16, 52, 6, 3);
      g.fillStyle(0x6b5236, 1); g.fillRect(bx - 24, by - 15, 48, 2);
      g.fillStyle(0x3a2a1c, 1); g.fillRect(bx - 22, by - 10, 4, 10); g.fillRect(bx + 18, by - 10, 4, 10);
      g.fillRoundedRect(bx - 26, by - 30, 52, 5, 2);
      g.lineStyle(2, 0x2a4636, 1); g.lineBetween(bx - 24, by - 28, bx - 28, by - 4); g.lineBetween(bx + 24, by - 28, bx + 30, by - 2);
      g.fillStyle(0x3a2a1c, 1); g.fillRect(bx + 32, by - 44, 3, 44);
      g.fillStyle(0xffd47a, 0.12); g.fillCircle(bx + 34, by - 48, 22); g.fillStyle(0xffd47a, 0.25); g.fillCircle(bx + 34, by - 48, 10);
      g.fillStyle(0xffe3a3, 1); g.fillCircle(bx + 34, by - 48, 4);
      const prompt = this.add.text(bx, by - 46, '↑ отдохнуть', { fontFamily: '"Fira Sans", sans-serif', fontSize: '13px', color: '#ffe3a3' }).setOrigin(0.5).setDepth(8).setAlpha(0);
      return { x: bx, y: by, prompt };
    });
    // выход
    this.exitR = L.exit ? { x: L.exit.x * T - 4, y: (L.exit.y - 2) * T, w: 40, h: 3 * T } : null;
    this.exitG = this.add.graphics().setDepth(1.5);

    // ворота
    this.gates = (L.gates || [L.gateIn, L.gateOut]).filter(Boolean).map((gd, i) => ({ ...gd, closed: false, g: this.add.graphics().setDepth(3), anim: 0, lockedUntilBoss: i === 1 }));
    if (this.gates[1]) this.setGate(this.gates[1], true);

    // слои рисования
    this.fx = this.add.graphics().setDepth(6);
    this.fxBack = this.add.graphics().setDepth(4.5);
    this.parts = this.add.particles(0, 0, 'spark', { emitting: false, lifespan: 500, speed: { min: 60, max: 220 }, scale: { start: 0.9, end: 0 }, blendMode: 'ADD' }).setDepth(7);
    this.dust = this.add.particles(0, 0, 'dot', { emitting: false, lifespan: 380, speed: { min: 20, max: 70 }, angle: { min: 200, max: 340 }, scale: { start: 1, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: 0x8fae9c, gravityY: 80 }).setDepth(7);

    // игроки
    this.respawn = { x: L.spawn.x * T + 16, y: (L.spawn.y + 1) * T };
    const prog = this.mode === 'story' && this.online !== 'guest' ? Settings.progress() : null;
    if (prog && this.benches[prog.bench]) { const b = this.benches[prog.bench]; this.respawn = { x: b.x, y: b.y }; }
    this.players = [];
    for (let i = 0; i < this.nPlayers; i++) this.players.push(this.makePlayer(i, this.respawn.x + i * 26, this.respawn.y));
    if (this.online) {
      for (const p of this.players) { p.remote = p.i !== this.localIdx; p.tx = p.x; p.ty = p.y; p.lastSeq = 0; p.netUp = false; }
      Net.onClose = () => this.onPeerLost();
      this.netAcc = 0; this.snapAcc = 0; this.pingAcc = 0; this.ping = null;
    }

    // враги, босс
    this.enemies = []; this.spawnEnemies();
    this.bossDead = this.mode === 'bosstest'; this.makeBoss();
    this.projs = []; this.beadsArr = [];
    if (this.mode === 'bosstest') {
      if (this.bossKind === 'vladik') this.setupVladikArena();
      else if (this.bossKind === 'tima') this.setupTimaArena();
      else this.setupMishaArena();
    }
    this.abil = this.mode === 'bosstest' ? { double: true } : { ...(prog && prog.abil || {}) };
    this.initItems();
    this.beads = prog ? prog.beads || 0 : 0; this.deaths = 0; this.timeSec = 0;
    Campaign.setup(this);

    // ввод
    this.setupInput();

    // камера
    const cam = this.cameras.main;
    cam.setBounds(0, 0, L.W * T, L.H * T);
    this.camX = this.respawn.x; this.camY = this.respawn.y - 80; this.zoom = 1.18;
    cam.centerOn(this.camX, this.camY);
    cam.fadeIn(600, 3, 8, 7);

    this.acc = 0; this.hitstop = 0; this.paused = false; this.wiping = false; this.won = false; this.animT = 0;
    this.areaIdx = -1; this.events.emit('ready');
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard.on('keydown', (e) => { Snd.init(); this.onKeyTap(e); });
    Touch.onTap = (act) => this.onTouchTap(act);
    const mcam = this.cameras.main, shakeOrig = mcam.shake.bind(mcam);
    mcam.shake = (...a) => (Settings.s.shake ? shakeOrig(...a) : mcam);
    // автопауза, когда вкладку свернули или переключились в другое приложение
    this._vis = () => { if (document.hidden && !this.online && !this.paused && !this.won && this.sys.isActive()) this.togglePause(); };
    document.addEventListener('visibilitychange', this._vis);
    this.events.once('shutdown', () => { document.removeEventListener('visibilitychange', this._vis); Music.setDuck(1); });
    Touch.show(true, { bombs: !!this.L.crates });
    this.events.once('shutdown', () => { Touch.show(false); Touch.onTap = null; });
  }
  ui() { return this.scene.get('ui'); }
  testBoss() { return this.misha || this.vladik || this.tima; }
  musicTrack() {
    if (this.won) return 'menu';
    if (this.mode === 'bosstest') return this.bossKind;
    const b = this.boss; return b && !['sleep', 'gone', 'dead'].includes(b.state) ? 'boss' : 'cave';
  }
  speedMul() { return 1; }
  togglePause() {
    if (this.won || Settings.open || this.shopOpen) return;
    const u = this.ui();
    if (this.online) u.showPause(!u.pause.visible); // по сети мир не останавливаем
    else { this.paused = !this.paused; u.showPause(this.paused); }
    Touch.show(!u.pause.visible);
    Music.setDuck(u.pause.visible ? 0.4 : 1);
  }

  // ----- ввод -----
  setupInput() {
    const k = this.input.keyboard, K = KC();
    const add = (arr) => arr.map((c) => k.addKey(c));
    const set = (m) => { const o = {}; for (const n in m) o[n] = add(m[n]); return o; };
    this.kb1 = set({ left: [K.A], right: [K.D], up: [K.W], down: [K.S], jump: [K.SPACE], atk: [K.F], dash: [K.G], heal: [K.Q], bomb: [K.R] });
    this.kbArrows = set({ left: [K.LEFT], right: [K.RIGHT], up: [K.UP], down: [K.DOWN], jump: [K.Z], atk: [K.X], dash: [K.C], heal: [K.V], bomb: [K.B] });
    this.kb2 = set({ left: [K.LEFT], right: [K.RIGHT], up: [K.UP], down: [K.DOWN], jump: [K.NUMPAD_ONE, K.FORWARD_SLASH], atk: [K.NUMPAD_TWO, K.PERIOD], dash: [K.NUMPAD_THREE, K.COMMA], heal: [K.NUMPAD_ZERO, K.M], bomb: [K.NUMPAD_FOUR, K.N] });
  }
  keySets(i) {
    if (this.online && i !== this.localIdx) return [];
    return (this.nPlayers === 1 || this.online) ? [this.kb1, this.kbArrows] : (i === 0 ? [this.kb1] : [this.kb2]);
  }
  touchIdx() { return this.online ? this.localIdx : 0; }
  onTouchTap(act) {
    const p = this.players && this.players[this.touchIdx()]; if (!p || p.remote) return;
    const pd = p.pend || (p.pend = {}); pd[act + 'P'] = true; p.tapHold = p.tapHold || {}; p.tapHold[act] = 2;
  }
  // нажатия ловим событиями: короткий тап не теряется даже при низком FPS
  onKeyTap(e) {
    if (e.repeat || !this.players) return;
    for (const p of this.players) {
      if (p.remote) continue;
      for (const set of this.keySets(p.i)) for (const act of ['jump', 'atk', 'dash', 'heal', 'bomb', 'up']) {
        if (set[act] && set[act].some((k) => k.keyCode === e.keyCode)) { const pd = p.pend || (p.pend = {}); pd[act + 'P'] = true; p.tapHold = p.tapHold || {}; p.tapHold[act] = 2; }
      }
    }
  }
  rawInput(i) {
    const out = { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false };
    const solo = this.nPlayers === 1 || !!this.online;
    if (this.online && i !== this.localIdx) return out;
    const sets = this.keySets(i);
    for (const s of sets) for (const n in out) if (s[n] && s[n].some((key) => key.isDown)) out[n] = true;
    if (Touch.enabled && i === this.touchIdx()) for (const n in out) if (Touch.state[n]) out[n] = true;
    const pads = this.input.gamepad ? this.input.gamepad.gamepads.filter((p) => p && p.connected !== false) : [];
    let pad = null;
    if (solo) pad = pads[0];
    else if (pads.length >= 2) pad = pads[i];
    else if (pads.length === 1 && i === 1) pad = pads[0];
    if (pad) {
      const b = (n) => !!(pad.buttons[n] && pad.buttons[n].pressed);
      const ax = pad.axes[0] ? pad.axes[0].getValue() : 0, ay = pad.axes[1] ? pad.axes[1].getValue() : 0;
      out.left ||= pad.left || ax < -0.4; out.right ||= pad.right || ax > 0.4;
      out.up ||= pad.up || ay < -0.5; out.down ||= pad.down || ay > 0.5;
      out.jump ||= b(0); out.atk ||= b(2); out.dash ||= b(1) || b(5) || b(7); out.heal ||= b(3); out.bomb ||= b(4) || b(6);
      if (b(9) && !this._startHeld) this.togglePause();
      this._startHeld = b(9);
    }
    return out;
  }

  // ----- сетка -----
  tileAt(tx, ty) { if (tx < 0 || tx >= this.L.W || ty < 0 || ty >= this.L.H) return SOLID; return this.grid[ty][tx]; }
  isSolid(tx, ty) { return this.tileAt(tx, ty) === SOLID; }
  setGate(gt, closed) {
    gt.closed = closed;
    for (let y = gt.y0; y <= gt.y1; y++) this.grid[y][gt.x] = closed ? SOLID : EMPTY;
  }
  moveBody(e, dt) {
    e.hitL = e.hitR = e.hitU = false; e.onGround = false;
    let nx = e.x + e.vx * dt;
    const y0 = Math.floor(e.y / T), y1 = Math.floor((e.y + e.h - 0.01) / T);
    if (e.vx > 0) {
      const tx = Math.floor((nx + e.w - 0.01) / T);
      for (let ty = y0; ty <= y1; ty++) if (this.isSolid(tx, ty)) { nx = tx * T - e.w; e.hitR = true; break; }
    } else if (e.vx < 0) {
      const tx = Math.floor(nx / T);
      for (let ty = y0; ty <= y1; ty++) if (this.isSolid(tx, ty)) { nx = (tx + 1) * T; e.hitL = true; break; }
    }
    e.x = nx; if (e.hitL || e.hitR) e.vx = 0;
    let ny = e.y + e.vy * dt;
    const x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.01) / T);
    if (e.vy > 0) {
      const ty = Math.floor((ny + e.h - 0.01) / T), prevB = e.y + e.h;
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.tileAt(tx, ty);
        if (t === SOLID || (t === PLAT && !e.noPlat && prevB <= ty * T + 0.5)) { ny = ty * T - e.h; e.onGround = true; break; }
      }
    } else if (e.vy < 0) {
      const ty = Math.floor(ny / T);
      for (let tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) { ny = (ty + 1) * T; e.hitU = true; break; }
    }
    e.y = ny; if (e.onGround || e.hitU) e.vy = 0;
  }
  solidRect(r) {
    const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 0.01) / T), y0 = Math.floor(r.y / T), y1 = Math.floor((r.y + r.h - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) return true;
    return false;
  }
  // скользим мимо угла потолка, если до свободного прохода меньше CORNER пикселей
  cornerNudge(p, wantY, vy0) {
    for (let d = 1; d <= P.CORNER; d++) for (const sg of [1, -1]) {
      const r = { x: p.x + sg * d, y: wantY, w: p.w, h: p.h };
      if (!this.solidRect(r)) { p.x = r.x; p.y = wantY; p.vy = vy0; p.hitU = false; return; }
    }
  }
  onPlatform(e) {
    const ty = Math.floor((e.y + e.h + 1) / T), x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.01) / T);
    let plat = false;
    for (let tx = x0; tx <= x1; tx++) { const t = this.tileAt(tx, ty); if (t === SOLID) return false; if (t === PLAT) plat = true; }
    return plat;
  }
  touchWall(e, dir) {
    const tx = dir > 0 ? Math.floor((e.x + e.w + 1) / T) : Math.floor((e.x - 1) / T);
    const ya = Math.floor((e.y + 4) / T), yb = Math.floor((e.y + e.h - 4) / T);
    for (let ty = ya; ty <= yb; ty++) if (this.isSolid(tx, ty)) return true;
    return false;
  }
  rectHitsTile(r, type, frac) {
    const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 0.01) / T), y0 = Math.floor(r.y / T), y1 = Math.floor((r.y + r.h - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (this.tileAt(tx, ty) !== type) continue;
      const tr = { x: tx * T + 2, y: ty * T + T * (1 - frac), w: T - 4, h: T * frac };
      if (overlap(r, tr)) return true;
    }
    return false;
  }
  groundBelowSolid(x, y) { const t = this.tileAt(Math.floor(x / T), Math.floor(y / T)); return t === SOLID || t === PLAT; }

  // ----- сущности -----
  makePlayer(i, x, y) {
    return {
      i, pal: PAL[i], x: x - 7, y: y - 26, w: 14, h: 26, vx: 0, vy: 0, face: 1, onGround: false,
      coyote: 0, jumpBuf: 0, jumpCut: true, dashT: 0, dashCd: 0, canDash: true, atkT: 0, atkCd: 0, atkDir: 'f', atkHits: null, pogoed: false,
      hp: Settings.s.easy ? 8 : 5, maxHp: Settings.s.easy ? 8 : 5, silk: 0, inv: 0, hurtT: 0, kbx: 0, downed: false, reviveT: 0, safeX: x - 7, safeY: y - 26, groundT: 0,
      wallDir: 0, wjLock: 0, healT: 0, landT: 0, sit: false, prev: {}, inp: {}, trail: [], bombs: this.L.crates ? 3 : 0, bombCd: 0,
      g: this.add.graphics().setDepth(5), tag: makeTag(this, PAL[i], 5.1),
    };
  }
  spawnEnemies() {
    for (const e of this.enemies) e.g.destroy();
    this.enemies = this.L.enemies.flatMap((d) => {
      const base = { type: d.type, vx: 0, vy: 0, face: -1, flash: 0, kbT: 0, kbx: 0, kby: 0, dead: false, t: Math.random() * 6, g: this.add.graphics().setDepth(4) };
      const fx = d.x * T + 16, fy = (d.y + 1) * T;
      const n2 = this.spawnEnemy2(d, base); if (n2) return n2; // новые враги (enemies2.js)
      if (d.type === 'crawler') return { ...base, w: 26, h: 16, x: fx - 13, y: fy - 16, hp: 3, vx: -45, beads: 3 };
      if (d.type === 'gnat') return { ...base, w: 20, h: 18, x: fx - 10, y: d.y * T, hx: fx, hy: d.y * T, hp: 2, beads: 2 };
      return { ...base, w: 36, h: 22, x: fx - 18, y: fy - 22, hp: 6, vx: -40, state: 'walk', st: 0, beads: 6 };
    });
  }
  makeBoss() {
    if (this.boss && this.boss.g) this.boss.g.destroy();
    if (!this.L.boss) { this.boss = { x: -9999, y: -9999, w: 1, h: 1, vx: 0, vy: 0, hp: 1, maxHp: 1, state: 'gone', t: 0, face: 1, flash: 0, g: this.add.graphics() }; return; }
    const b = this.L.boss, hp = BAL.hp.boss[this.nPlayers === 2 ? 1 : 0];
    this.boss = { x: b.x * T - 36, y: (b.y + 1) * T - 58, w: 72, h: 58, vx: 0, vy: 0, hp, maxHp: hp, phase: 1, state: 'sleep', t: 0, face: -1, jumps: 0, flash: 0, last: '', air: 0, g: this.add.graphics().setDepth(4) };
    if (this.bossDead) { this.boss.state = 'gone'; }
  }
  alivePlayers() { return this.players.filter((p) => !p.downed); }
  nearestPlayer(x, y) {
    let best = null, bd = 1e9;
    for (const p of this.alivePlayers()) { const d = Math.hypot(p.x + 7 - x, p.y + 13 - y); if (d < bd) { bd = d; best = p; } }
    return [best, bd];
  }

  // ----- основной цикл -----
  update(time, delta) {
    const rdt = Math.min(delta, 100) / 1000;
    let dt = rdt;
    // замедление времени на смерть босса: сначала почти стоп, потом плавно разгоняемся
    if (this.slowT > 0) { this.slowT -= rdt; const k = Math.max(0, this.slowT) / this.slowDur; dt = rdt * (k > 0.35 ? 0.22 : 0.22 + 0.78 * (1 - k / 0.35)); }
    this.animT += dt;
    // ввод с фронтами нажатий
    for (const p of this.players) {
      if (p.remote) continue;
      const r = this.rawInput(p.i), pr = p.prev, pd = p.pend || (p.pend = {});
      if (p.tapHold) for (const a in p.tapHold) if (p.tapHold[a] > 0) { r[a] = true; p.tapHold[a]--; }
      pd.jumpP ||= r.jump && !pr.jump; pd.atkP ||= r.atk && !pr.atk; pd.dashP ||= r.dash && !pr.dash; pd.healP ||= r.heal && !pr.heal; pd.upP ||= r.up && !pr.up; pd.bombP ||= r.bomb && !pr.bomb;
      p.raw = r; p.prev = r;
    }
    if (!this.paused && !this.wiping && !this.won) {
      if (this.hitstop > 0) { this.hitstop -= dt; }
      else {
        this.acc += dt;
        let first = true;
        while (this.acc >= STEP) {
          for (const p of this.players) {
            if (p.remote) { p.inp = { up: p.netUp }; continue; }
            if (first) { p.inp = { ...p.raw, ...p.pend }; p.pend = {}; }
            else p.inp = { ...p.raw, jumpP: false, atkP: false, dashP: false, healP: false, upP: false, bombP: false };
          }
          this.step(STEP); this.acc -= STEP; first = false;
          if (this.hitstop > 0 || this.wiping) { this.acc = 0; break; }
        }
        this.timeSec += dt;
      }
    }
    if (this.online) { this.netSmooth(dt); this.netTick(dt); }
    Music.play(this.musicTrack());
    Music.intensity = 1 + 0.07 * (this.bossPhaseForMusic() - 1);
    this.render(dt);
    this.updateCamera(dt);
  }

  step(dt) {
    if (this.td) { this.tdStep(dt); return; }
    const auth = this.auth();
    for (const p of this.players) { if (p.remote) p.atkT -= dt; else this.stepPlayer(p, dt); }
    for (const p of this.players) this.resolveAttack(p);
    if (auth) {
      for (const e of this.enemies) if (!e.dead) this.stepEnemy(e, dt);
      this.stepBoss(dt);
      if (this.misha) this.stepMisha(dt);
      if (this.vladik) this.stepVladik(dt);
      if (this.tima) this.stepTima(dt);
      this.stepProjs(dt);
      this.stepBeads(dt);
      this.stepItems();
    } else this.guestProjHits();
    this.stepCoop(dt);
    if (auth && this.online && !this.wiping && this.players.every((p) => p.downed)) this.teamWipe();
    // урон от касания (каждый считает только своего героя)
    for (const p of this.players) {
      if (p.remote || p.downed || p.inv > 0) continue;
      const pr = inset(p, 2);
      for (const e of this.enemies) if (!e.dead && overlap(pr, inset(e, 2))) { this.hurtPlayer(p, 1, e.x + e.w / 2); break; }
      const b = this.boss;
      if (p.inv <= 0 && (b.state !== 'sleep' && b.state !== 'dead' && b.state !== 'gone') && overlap(pr, inset(b, 8))) this.hurtPlayer(p, HEAVY_STATES.has(b.state) ? 2 : 1, b.x + b.w / 2);
      const m = this.misha;
      if (m && p.inv <= 0 && !['dead', 'intro', 'cough'].includes(m.state) && overlap(pr, inset(m, 8))) this.hurtPlayer(p, HEAVY_STATES.has(m.state) ? 2 : 1, m.x + m.w / 2);
      const vb = this.vladik || this.tima;
      if (vb && p.inv <= 0 && !['dead', 'intro'].includes(vb.state) && overlap(pr, inset(vb, 8))) this.hurtPlayer(p, HEAVY_STATES.has(vb.state) ? 2 : 1, vb.x + vb.w / 2);
      if (this.curtains && p.inv <= 0) for (const c of this.curtains) if (c.slime > 0 && overlap(pr, this.curtainHazard(c))) { this.hurtPlayer(p, 1, c.x + c.w / 2); break; }
    }
    // выход
    if (auth && this.exitR && this.bossDead && !this.won && this.players.some((p) => !p.downed && overlap(p, this.exitR))) this.win();
  }

  stepPlayer(p, dt) {
    const inp = p.inp;
    p.inv -= dt; p.hurtT -= dt; p.dashCd -= dt; p.bombCd -= dt; p.atkCd -= dt; p.atkT -= dt; p.wjLock -= dt; p.healT -= dt; p.coyote -= dt; p.jumpBuf -= dt; p.landT -= dt; p.atkBuf = (p.atkBuf || 0) - dt; p.comboT = (p.comboT || 0) - dt; p.parryT = (p.parryT || 0) - dt; p.parryCd = (p.parryCd || 0) - dt; p.dashBuf = (p.dashBuf || 0) - dt; p.execT = (p.execT || 0) - dt;
    if (p.downed) { p.vx *= 0.9; p.vy = Math.min(p.vy + P.G * dt, P.MAXFALL); this.moveBody(p, dt); return; }
    if (inp.jumpP) p.jumpBuf = P.BUF;
    if (inp.atkP) p.atkBuf = P.ATKBUF;
    if (inp.dashP) p.dashBuf = P.DASHBUF;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    // лечение занимает время: герой стоит на месте, любой урон прерывает его (нить потеряна)
    if (p.healCh > 0) {
      p.healCh -= dt; p.healT = p.healCh; p.vx = 0; p.vy = Math.min(p.vy + P.G * dt, P.MAXFALL); this.moveBody(p, dt);
      if (Math.random() < 0.3) this.parts.explode(1, p.x + 7 + (Math.random() - 0.5) * 16, p.y + 24);
      if (p.healCh <= 0) {
        p.hp = Math.min(p.maxHp, p.hp + P.HEAL); p.healCh = 0; p.healT = 0.3; Snd.play('heal');
        this.parts.setParticleTint(p.pal.accent); this.parts.explode(18, p.x + 7, p.y + 12);
      }
      return;
    }
    if (p.sit) {
      const dn = !!inp.down, dnP = dn && !p.dnPrev; p.dnPrev = dn;
      if (dir || inp.jumpP || inp.atkP || inp.dashP) p.sit = false;
      else {
        if (dnP) Campaign.openShop(this, p); p.vx = 0; p.vy = Math.min(p.vy + P.G * dt, P.MAXFALL); this.moveBody(p, dt); return; }
    }
    const wasGround = p.onGround;
    if (p.hurtT > 0) {
      p.vx = p.kbx; p.kbx *= 0.9; p.vy = Math.min(p.vy + P.G * dt, P.MAXFALL);
    } else if (p.dashT > 0) {
      p.dashT -= dt; p.vx = p.face * P.DASH; p.vy = 0;
      p.trail.push({ x: p.x + 7, y: p.y + 26, a: 1, f: p.face });
      if (p.dashT <= 0) p.vx = dir * P.RUN;
    } else {
      if (p.wjLock <= 0) { p.vx = dir * P.RUN * this.speedMul(p) + p.kbx; if (dir) p.face = dir; }
      p.kbx *= 0.8; if (Math.abs(p.kbx) < 5) p.kbx = 0;
      p.wallDir = 0;
      if (!p.onGround && p.vy > 0) { if (dir === 1 && this.touchWall(p, 1)) p.wallDir = 1; else if (dir === -1 && this.touchWall(p, -1)) p.wallDir = -1; }
      if (p.jumpBuf > 0) {
        if (inp.down && p.onGround && this.onPlatform(p)) {
          // ↓ + прыжок на платформе — спрыгнуть вниз сквозь неё
          p.dropT = 0.22; p.jumpBuf = 0; p.coyote = 0; p.onGround = false; p.vy = 60; p.y += 2;
        } else if (p.onGround || p.coyote > 0) {
          p.vy = -P.JUMP; p.jumpBuf = 0; p.coyote = 0; p.jumpCut = false; Snd.play('jump');
          this.dust.explode(5, p.x + 7, p.y + 26);
        } else if (this.touchWall(p, 1) || this.touchWall(p, -1)) {
          const wd = this.touchWall(p, 1) ? 1 : -1;
          p.usedDouble = false;
          p.vy = -P.WJY; p.vx = -wd * P.WJX; p.face = -wd; p.wjLock = P.WJLOCK; p.jumpBuf = 0; p.jumpCut = false; p.canDash = true;
          Snd.play('jump'); this.dust.explode(4, p.x + (wd > 0 ? 14 : 0), p.y + 14);
        } else if (this.abil.double && !p.usedDouble) {
          p.usedDouble = true; p.vy = -P.JUMP * 0.9; p.jumpBuf = 0; p.jumpCut = false; Snd.play('jump');
          this.parts.setParticleTint(p.pal.accent); this.parts.explode(10, p.x + 7, p.y + 26);
        }
      }
      if (!inp.jump && p.vy < 0 && !p.jumpCut) { p.vy *= P.CUT; p.jumpCut = true; }
      p.vy += P.G * dt * (inp.jump && Math.abs(p.vy) < P.APEX_VY && !p.onGround ? P.APEX_G : 1);
      if (p.wallDir !== 0 && p.vy > P.WSLIDE) p.vy = P.WSLIDE;
      if (p.vy > P.MAXFALL) p.vy = P.MAXFALL;
      if (p.dashBuf > 0 && p.dashCd <= 0 && (p.onGround || p.canDash)) {
        p.dashBuf = 0;
        if (p.wallDir) p.face = -p.wallDir;
        else if (dir) p.face = dir;
        p.dashT = P.DASHT; p.dashCd = P.DASHCD; if (!p.onGround) p.canDash = false; p.vy = 0; p.atkT = 0;
        Snd.play('dash');
      }
      if (p.atkBuf > 0 && p.atkCd <= 0 && (inp.up || inp.down) && this.tryExecute(p, inp.up ? 'u' : 'd')) {
        p.atkBuf = 0; // казнь оглушённого босса: удар вверх/вниз рядом с ним
      } else if (p.atkBuf > 0 && p.atkCd <= 0) {
        p.atkBuf = 0;
        p.atkDir = inp.up ? 'u' : (inp.down && !p.onGround ? 'd' : 'f');
        // комбо: третий удар подряд (в пределах 0.6 с) — тяжёлый финишер: шире, бьёт дважды, но дольше восстанавливается
        p.combo = p.comboT > 0 ? p.combo + 1 : 1; if (p.combo > 3) p.combo = 1;
        p.heavy = p.combo === 3 && p.atkDir === 'f'; p.comboT = 0.6;
        p.atkT = p.heavy ? 0.16 : P.ATK_T; p.atkCd = p.heavy ? 0.42 : P.ATK_CD; p.atkHits = new Set(); p.pogoed = false; p.seq = (p.seq || 0) + 1;
        Snd.play(p.heavy ? 'slam' : 'slash');
      }
      if (inp.bombP) this.throwBomb(p);
      if (inp.healP) {
        if (inp.up && p.silk >= P.BURST) this.silkBurst(p);
        else if (p.silk >= P.SILK && p.hp < p.maxHp) {
          p.silk = 0; p.healCh = P.HEAL_T; p.healT = P.HEAL_T; p.atkT = 0; Snd.play('bench');
          this.parts.setParticleTint(p.pal.accent); this.parts.explode(10, p.x + 7, p.y + 12);
        } else if (p.parryCd <= 0) { p.parryT = P.PARRY_T; p.parryCd = P.PARRY_CD; Snd.play('slash'); }
      }
    }
    p.dropT = (p.dropT || 0) - dt; p.noPlat = p.dropT > 0;
    const py0 = p.y, vy0 = p.vy;
    this.moveBody(p, dt);
    if (p.hitU && vy0 < 0 && p.hurtT <= 0) this.cornerNudge(p, py0 + vy0 * dt, vy0);
    if (this.crates) this.refillBombs(p);
    if (p.onGround) {
      p.coyote = P.COYOTE; p.canDash = true; p.usedDouble = false;
      if (!wasGround) { p.landT = 0.1; this.dust.explode(4, p.x + 7, p.y + 26); Snd.play('land'); }
    }
    // колючки
    if (this.rectHitsTile(inset(p, 3), SPIKE, 0.55)) {
      this.hurtPlayer(p, 1, null, true);
      if (!p.downed && p.hp > 0) { p.x = p.safeX; p.y = p.safeY; p.vx = p.vy = 0; p.kbx = 0; p.hurtT = 0.35; p.dashT = 0; }
    }
    if (p.onGround && !this.rectHitsTile({ x: p.x - 20, y: p.y, w: p.w + 40, h: p.h + 8 }, SPIKE, 1)) {
      p.groundT += dt; if (p.groundT > 0.12) { p.safeX = p.x; p.safeY = p.y; }
    } else p.groundT = 0;
    // хвост рывка
    for (const tr of p.trail) tr.a -= dt * 5;
    p.trail = p.trail.filter((tr) => tr.a > 0);
  }

  atkBox(p) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    if (p.atkDir === 'f') { const w = p.heavy ? 68 : 48; return { x: p.face > 0 ? cx + 2 : cx - 2 - w, y: cy - 17, w, h: 32 }; }
    if (p.atkDir === 'u') return { x: cx - 19, y: p.y - 40, w: 38, h: 46 };
    return { x: cx - 18, y: p.y + p.h - 8, w: 36, h: 44 };
  }
  resolveAttack(p) {
    if (p.downed || p.atkT <= 0 || !p.atkHits) return;
    const box = this.atkBox(p), auth = this.auth(), local = !p.remote;
    const pogo = () => {
      if (!local || p.pogoed) return; p.pogoed = true; p.vy = -P.POGO; p.canDash = true; p.jumpCut = true; p.dashT = 0; Snd.play('pogo');
    };
    for (const e of this.enemies) {
      if (e.dead || p.atkHits.has(e) || !overlap(box, e)) continue;
      p.atkHits.add(e);
      if (auth) { this.damageEnemy(e, p); if (p.heavy && !e.dead) this.damageEnemy(e, p); } else if (!this.e2Blocked(e, p, true)) { e.flash = 0.1; this.hitstop = 0.045; Snd.play('hit'); }
      if (local) { if (p.atkDir === 'd') pogo(); else if (p.atkDir === 'f') p.kbx = -p.face * 150; }
    }
    const b = this.boss;
    if (!p.atkHits.has(b) && b.state !== 'sleep' && b.state !== 'dead' && b.state !== 'gone' && overlap(box, b)) {
      p.atkHits.add(b);
      if (auth) { this.damageBoss(p); if (p.heavy && b.state !== 'dead' && b.state !== 'gone') this.damageBoss(p); } else { b.flash = 0.09; this.hitstop = 0.04; Snd.play('hit'); }
      if (local) { if (p.atkDir === 'd') pogo(); else if (p.atkDir === 'f') p.kbx = -p.face * 170; }
    }
    if (this.misha && this.mishaNeedle(p, box) && local) { if (p.atkDir === 'd') pogo(); else if (p.atkDir === 'f') p.kbx = -p.face * 190; }
    for (const [vb, fn] of [[this.vladik, 'damageVladik'], [this.tima, 'damageTima']]) {
      if (!vb || p.atkHits.has(vb) || ['dead', 'intro'].includes(vb.state) || !overlap(box, vb)) continue;
      p.atkHits.add(vb);
      if (auth) { this[fn](p); if (p.heavy && vb.state !== 'dead') this[fn](p); } else { vb.flash = 0.09; this.hitstop = 0.04; Snd.play('hit'); }
      if (local) { if (p.atkDir === 'd') pogo(); else if (p.atkDir === 'f') p.kbx = -p.face * 170; }
    }
    for (const pr of this.projs) if (SLASH_KINDS.has(pr.kind) && !pr.dead && overlap(box, pr)) {
      if (pr.kind === 'collector') { if (auth) this.hitCollector(pr, p.face); else this.sendEv({ k: 'cut', kind: 'collector', x: Math.round(pr.x), y: Math.round(pr.y), d: p.face }); if (local && p.atkDir === 'd') pogo(); continue; }
      if (auth) {
        pr.dead = true;
        if (pr.kind === 'letter' || pr.kind === 'rain') { this.paperAt(6, pr.x + 11, pr.y + 13); this.sfx('clink'); }
        else if (pr.kind === 'spore') this.burst(6, pr.x + 6, pr.y + 6, 0xc7f08a);
        else { this.burst(6, pr.x + pr.w / 2, pr.y + pr.h / 2, 0xffd47a); this.sfx('clink'); }
      } else if (pr.kind !== 'spore') { pr.dead = true; this.sendEv({ k: 'cut', kind: pr.kind, x: Math.round(pr.x), y: Math.round(pr.y) }); }
      if (local && p.atkDir === 'd') pogo();
    }
    if (local && p.atkDir === 'd' && !p.pogoed && this.rectHitsTile(box, SPIKE, 0.7)) { pogo(); this.parts.setParticleTint(0xffffff); this.parts.explode(5, box.x + 18, box.y + 30); }
  }
  // по боссу нить копится не с каждого удара (BAL.silkEvery): иначе лечения хватало бы на любой бой
  gainSilk(p, boss) { if (p.noSilkGain) return; if (boss && ((p.bossHits = (p.bossHits || 0) + 1) % BAL.silkEvery)) return; if (p.remote) this.sendEv({ k: 'silk', i: p.i }); else p.silk = Math.min(P.SILK, p.silk + 1); }
  damageEnemy(e, p) {
    if (e.e2 && this.e2Blocked(e, p)) return; // броня панциря, засадник под землёй
    e.hp -= 1 + Campaign.needleBonus(this); e.flash = 0.1; this.gainSilk(p); if (!p.remote) this.hitstop = 0.045; this.sfx('hit');
    this.burst(8, e.x + e.w / 2, e.y + e.h / 2, 0xf4f1e6);
    const dx = p.atkDir === 'f' ? p.face : Math.sign(e.x + e.w / 2 - (p.x + 7)) || 1;
    e.kbT = 0.14; e.kbx = dx * (e.type === 'beetle' ? 120 : 220); e.kby = p.atkDir === 'u' ? -220 : p.atkDir === 'd' ? 160 : -60;
    if (e.type === 'beetle' && e.state === 'charge') { e.state = 'stun'; e.st = 0.6; }
    if (e.hp <= 0) this.killEnemy(e);
  }
  killEnemy(e) {
    e.dead = true; e.g.clear(); this.sfx('kill'); this.shake(90, 0.004);
    this.burst(16, e.x + e.w / 2, e.y + e.h / 2, 0x9ff0c8);
    this.dropBeads(e.x + e.w / 2, e.y + e.h / 2, e.beads);
  }
  dropBeads(x, y, n) {
    for (let i = 0; i < n; i++) this.beadsArr.push({ x: x - 4, y: y - 4, w: 8, h: 8, vx: (Math.random() - 0.5) * 260, vy: -200 - Math.random() * 260, t: 0 });
  }
  hurtPlayer(p, dmg, srcX, spike) {
    if (p.inv > 0 || p.downed) return;
    if (p.parryT > 0 && !spike) { this.parrySuccess(p, srcX); return; }
    if (p.dashT > 0 && !spike) { // идеальный уворот: рывок сквозь удар — без урона, +нить, замедление
      p.inv = 0.35; p.pdodge = 0.4; if (!p.remote) { p.silk = Math.min(P.SILK, p.silk + 2); this.hitstop = 0.07; }
      Snd.play('clink'); this.parts.setParticleTint(p.pal.accent); this.parts.explode(14, p.x + 7, p.y + 13);
      return;
    }
    p.hp -= dmg; p.inv = P.INV; if (!p.remote) Touch.buzz(45); p.hurtT = P.HURT; p.dashT = 0; p.sit = false; p.atkT = 0; p.healCh = 0; p.healT = 0;
    p.vy = spike ? 0 : -320; p.kbx = srcX == null ? 0 : ((p.x + 7 < srcX) ? -1 : 1) * 260;
    this.hitstop = 0.09; this.cameras.main.shake(160, 0.008); Snd.play('hurt');
    this.parts.setParticleTint(0xffffff); this.parts.explode(10, p.x + 7, p.y + 13);
    if (p.hp <= 0) this.downPlayer(p);
  }
  downPlayer(p) {
    p.hp = 0; p.atkT = 0; p.dashT = 0;
    const partner = this.players.find((q) => q !== p && !q.downed);
    if (partner) { p.downed = true; p.reviveT = 0; p.kbx = 0; this.ui().toast(`${p.pal.name} в коконе. ${partner.pal.name}: подойди и держи ↑`); }
    else if (!this.auth()) { p.downed = true; p.reviveT = 0; } // обрыв нити объявит хост
    else this.teamWipe();
  }
  teamWipe() {
    if (this.wiping) return; this.wiping = true; this.deaths++;
    for (const p of this.players) if (!p.remote) p.downed = true;
    this.sendEv({ k: 'wipe' });
    this.ui().toast('Нить оборвалась…');
    this.time.delayedCall(700, () => this.cameras.main.fadeOut(600, 3, 8, 7));
    this.time.delayedCall(1350, () => this.respawnAll());
  }
  respawnAll() {
    this.spawnEnemies();
    for (const pr of this.projs) pr.dead = true;
    if (!this.bossDead) { this.makeBoss(); if (this.gates[0]) this.setGate(this.gates[0], false); this.ui().bossBar(false); }
    if (this.td) { this.td = null; this.tdFlip = false; this.cameras.main.setRotation(0); this.ui().tdShow(false); }
    if (this.misha && this.misha.state !== 'dead') { this.makeMisha(); this.ui().bossBar(false); }
    if (this.vladik && this.vladik.state !== 'dead') { this.makeVladik(); this.ui().bossBar(false); }
    if (this.tima && this.tima.state !== 'dead') { this.repoT = 0; this.makeTima(); this.sendEv({ k: 'repo', on: 0 }); this.ui().bossBar(false); }
    this.sendEv({ k: 'respawn', x: this.respawn.x, y: this.respawn.y });
    this.respawnLocal();
  }
  respawnLocal() {
    this.players.forEach((p) => {
      if (p.remote) return;
      Object.assign(p, { x: this.respawn.x - 7 + p.i * 24, y: this.respawn.y - 26, vx: 0, vy: 0, kbx: 0, hp: p.maxHp, downed: false, inv: 1, hurtT: 0, dashT: 0, atkT: 0, sit: false, reviveT: 0, healCh: 0, healT: 0, bombs: this.L.crates ? 3 : 0 });
      p.safeX = p.x; p.safeY = p.y;
    });
    this.camX = this.respawn.x; this.camY = this.respawn.y - 80;
    this.wiping = false; this.cameras.main.fadeIn(600, 3, 8, 7);
  }

  stepCoop(dt) {
    // скамьи
    for (const b of this.benches) {
      let near = false;
      for (const p of this.players) {
        if (p.downed || p.remote) continue;
        if (Math.abs(p.x + 7 - b.x) < 30 && Math.abs(p.y + 26 - b.y) < 12) {
          near = !p.sit;
          if (p.inp.upP && p.onGround && !p.sit) {
            p.sit = true; p.x = b.x - 7; p.hp = p.maxHp; this.respawn = { x: b.x, y: b.y }; Snd.play('bench');
            for (const q of this.players) if (q.downed && !q.remote) { q.downed = false; q.hp = 2; q.inv = 1.5; q.x = b.x - 7 + 22; q.y = b.y - 26; }
            this.sendEv({ k: 'bench', x: b.x, y: b.y });
            this.ui().toast(this.camp ? (Touch.enabled ? 'Скамья: здесь вы очнётесь. Прогресс сохранён. Стик вниз — лавка' : 'Скамья: здесь вы очнётесь. Прогресс сохранён. ↓ — лавка') : 'Скамья: здесь вы очнётесь. Прогресс сохранён');
            if (this.mode === 'story' && this.online !== 'guest') {
              const bi = this.benches.indexOf(b), area = this.L.areas.reduce((a, ar) => (b.x / T >= ar.x ? ar : a), this.L.areas[0]);
              Campaign.save(this, { bench: bi, name: Campaign.saveName(this, area.name) });
            }
          }
        }
      }
      b.prompt.setAlpha(near ? 1 : 0);
    }
    // оживление
    for (const p of this.players) {
      if (!p.downed || p.remote || this.wiping) continue;
      let helping = false;
      for (const q of this.players) {
        if (q === p || q.downed) continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) < 52 && q.inp.up && q.onGround) helping = true;
      }
      p.reviveT = helping ? p.reviveT + dt : Math.max(0, p.reviveT - dt * 2);
      if (p.reviveT >= 1) {
        p.downed = false; p.hp = 2; p.inv = 1.5; p.reviveT = 0; p.vy = -200; Snd.play('revive');
        this.parts.setParticleTint(p.pal.accent); this.parts.explode(20, p.x + 7, p.y + 13);
        this.ui().toast(`${p.pal.name} снова в строю`);
      }
    }
    // поводок: не даём разойтись за пределы экрана
    if (this.players.length === 2) {
      const [a, b] = this.players;
      if (!a.downed && !b.downed && (Math.abs(a.x - b.x) > 1150 || Math.abs(a.y - b.y) > 720)) {
        const lead = a.x > b.x ? a : b, lag = lead === a ? b : a;
        if (lead.onGround && !lag.remote) { lag.x = lead.x - lead.face * 20; lag.y = lead.y; lag.vx = lag.vy = 0; lag.inv = 0.6; this.ui().toast(`${lag.pal.name} догоняет по нити`); }
      }
    }
    // названия областей
    const lead = this.players.reduce((m, p) => (p.x > m.x ? p : m), this.players[0]);
    const tx = lead.x / T; let idx = 0;
    this.L.areas.forEach((a, i) => { if (tx >= a.x) idx = i; });
    if (idx !== this.areaIdx && this.ui().ready) { this.areaIdx = idx; this.ui().areaTitle(this.L.areas[idx].name); }
  }

  stepEnemy(e, dt) {
    e.flash -= dt; e.t += dt;
    if (e.e2) { this.stepEnemy2(e, dt); return; }
    if (e.kbT > 0) {
      e.kbT -= dt; e.vx = e.kbx;
      if (e.type === 'gnat') e.vy = e.kby;
      else e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
      this.moveBody(e, dt);
      return;
    }
    if (e.type === 'crawler') {
      const frontX = e.face > 0 ? e.x + e.w + 2 : e.x - 2;
      if (e.onGround && !this.groundBelowSolid(frontX, e.y + e.h + 4)) e.face = -e.face;
      e.vx = e.face * 45;
      e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
      this.moveBody(e, dt);
      if (e.hitL || e.hitR) e.face = -e.face;
    } else if (e.type === 'gnat') {
      const [tp, d] = this.nearestPlayer(e.x + 10, e.y + 9);
      let tx = e.hx + Math.sin(e.t * 0.9) * 40, ty = e.hy + Math.sin(e.t * 2.1) * 12, spd = 70;
      if (tp && d < 300) { tx = tp.x + 7; ty = tp.y + 4; spd = 115; }
      const dx = tx - (e.x + 10), dy = ty - (e.y + 9), dl = Math.hypot(dx, dy) || 1;
      e.vx += ((dx / dl) * spd - e.vx) * Math.min(1, dt * 2.2);
      e.vy += ((dy / dl) * spd - e.vy) * Math.min(1, dt * 2.2) + Math.sin(e.t * 9) * 4;
      e.face = e.vx >= 0 ? 1 : -1;
      this.moveBody(e, dt);
    } else if (e.type === 'beetle') {
      e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
      const [tp] = this.nearestPlayer(e.x + 18, e.y + 11);
      if (e.state === 'walk') {
        const frontX = e.face > 0 ? e.x + e.w + 2 : e.x - 2;
        if (e.onGround && !this.groundBelowSolid(frontX, e.y + e.h + 4)) e.face = -e.face;
        e.vx = e.face * 40;
        if (tp) {
          const dx = tp.x + 7 - (e.x + 18), dy = tp.y + 26 - (e.y + 22);
          if (Math.abs(dx) < 250 && Math.abs(dy) < 50 && Math.sign(dx) === e.face) { e.state = 'wind'; e.st = 0.45; e.vx = 0; }
        }
      } else if (e.state === 'wind') {
        e.vx = 0; e.st -= dt; if (e.st <= 0) { e.state = 'charge'; e.vx = e.face * 330; }
      } else if (e.state === 'charge') {
        e.vx = e.face * 330;
        const frontX = e.face > 0 ? e.x + e.w + 2 : e.x - 2;
        if (e.onGround && !this.groundBelowSolid(frontX, e.y + e.h + 4)) { e.state = 'stun'; e.st = 0.7; e.vx = 0; }
      } else if (e.state === 'stun') {
        e.vx = 0; e.st -= dt; if (e.st <= 0) { e.state = 'walk'; e.face = -e.face; }
      }
      this.moveBody(e, dt);
      if (e.hitL || e.hitR) {
        if (e.state === 'charge') { e.state = 'stun'; e.st = 0.9; this.cameras.main.shake(80, 0.004); }
        else if (e.state === 'walk') e.face = -e.face;
      }
    }
  }

  // ----- босс: Корнематка -----
  stepBoss(dt) {
    const b = this.boss; if (b.state === 'gone') return;
    b.flash -= dt;
    if (b.state === 'sleep') {
      if (!this.bossDead && this.players.some((p) => !p.downed && p.x / T > this.L.boss.trigger)) {
        this.setGate(this.gates[0], true); this.sfx('gate');
        b.state = 'roar'; b.t = 1.4; this.sfx('roar'); this.shake(900, 0.006);
        this.ui().bossBar(true, 'Корнематка'); this.ui().toast('');
      }
      b.vy = Math.min(b.vy + P.G * dt, P.MAXFALL); this.moveBody(b, dt); return;
    }
    if (b.state === 'dead') { b.t -= dt; if (b.t <= 0) { b.state = 'gone'; b.g.clear(); } return; }
    const phase2 = (b.phase || 1) >= 2, phase3 = (b.phase || 1) >= 3;
    const [tp] = this.nearestPlayer(b.x + b.w / 2, b.y + b.h / 2);
    const tx = tp ? tp.x + 7 : b.x;
    const faceT = () => { b.face = tx > b.x + b.w / 2 ? 1 : -1; };
    b.t -= dt;
    switch (b.state) {
      case 'roar': b.vx = 0; if (b.t <= 0) { b.state = 'idle'; b.t = 1.0; } break;
      case 'rage': b.vx = 0; if (b.t <= 0) { b.state = 'idle'; b.t = 0.3; } break;
      case 'rootWind':
        b.vx = 0; faceT();
        if (Math.random() < 0.5) this.dust.explode(1, b.x + b.w / 2 + (Math.random() - 0.5) * 60, b.y + b.h);
        if (b.t <= 0) { this.rootLine(tx, phase3); b.state = 'recover'; b.t = phase3 ? 0.6 : 0.9; }
        break;
      case 'idle':
        b.vx = 0; faceT(); b.t -= dt * BAL.pace.boss;
        if (b.t <= 0) {
          const pool = ['leap', 'spores', 'charge']; if (phase2) pool.push('roots', 'roots');
          const opts = pool.filter((o) => o !== b.last);
          const pick = opts[Math.floor(Math.random() * opts.length)]; b.last = pick;
          if (pick === 'leap') { b.state = 'leapWind'; b.t = 0.38; b.jumps = phase3 ? 2 : 1; }
          if (pick === 'roots') { b.state = 'rootWind'; b.t = 0.6; this.sfx('slam'); this.shake(500, 0.004); }
          if (pick === 'spores') { b.state = 'sporeWind'; b.t = 0.45; }
          if (pick === 'charge') { b.state = 'chargeWind'; b.t = phase2 ? 0.4 : 0.55; }
        }
        break;
      case 'leapWind':
        b.vx = 0; faceT();
        if (b.t <= 0) { b.state = 'leap'; b.vy = -760; b.vx = clamp((tx - (b.x + b.w / 2)) / 1.0, -400, 400); b.air = 0; this.sfx('jump'); }
        break;
      case 'leap':
        b.air += dt;
        if (b.onGround && b.air > 0.15) {
          b.vx = 0; this.shake(220, 0.012); this.sfx('slam');
          this.dustAt(14, b.x + b.w / 2, b.y + b.h);
          for (const d of [-1, 1]) this.projs.push({ kind: 'wave', x: b.x + b.w / 2 - 12 + d * 30, y: b.y + b.h - 18, w: 24, h: 18, vx: d * (phase2 ? 380 : 320), vy: 0, life: 2.4 });
          if (--b.jumps > 0) { b.state = 'leapWind'; b.t = 0.22; } else { b.state = 'recover'; b.t = phase2 ? 0.4 : 0.6; }
        }
        break;
      case 'sporeWind':
        b.vx = 0; faceT();
        if (b.t <= 0) {
          const n = phase3 ? 7 : phase2 ? 5 : 3; this.sfx('spit');
          for (let i = 0; i < n; i++) {
            const spread = (i - (n - 1) / 2);
            const dist = tx - (b.x + b.w / 2);
            this.projs.push({ kind: 'spore', x: b.x + b.w / 2 + b.face * 20, y: b.y + 8, w: 12, h: 12, vx: clamp(dist * 0.9, -420, 420) + spread * 70, vy: -420 - Math.abs(spread) * 40, life: 3 });
          }
          b.state = 'recover'; b.t = phase2 ? 0.45 : 0.7;
        }
        break;
      case 'chargeWind':
        b.vx = 0; faceT();
        if (b.t <= 0) { b.state = 'charge'; this.sfx('roar'); }
        break;
      case 'charge':
        b.vx = b.face * (phase2 ? 460 : 400);
        break;
      case 'stun': b.vx = 0; if (b.t <= 0) { b.state = 'idle'; b.t = phase2 ? 0.35 : 0.6; } break;
      case 'recover': b.vx = 0; b.t -= dt * BAL.pace.boss; if (b.t <= 0) { b.state = 'idle'; b.t = phase3 ? 0.25 : phase2 ? 0.35 : 0.6; } break;
    }
    b.vy = Math.min(b.vy + P.G * dt, P.MAXFALL);
    const was = b.state;
    this.moveBody(b, dt);
    if (was === 'charge' && (b.hitL || b.hitR)) {
      b.state = 'stun'; b.t = 1.0; this.shake(260, 0.014); this.sfx('slam');
      const ax0 = this.L.boss.arenaX0, ax1 = this.L.boss.arenaX1;
      const n = phase2 ? 5 : 3;
      for (let i = 0; i < n; i++) this.projs.push({ kind: 'rock', x: (ax0 + 2 + Math.random() * (ax1 - ax0 - 4)) * T, y: 19 * T, w: 16, h: 16, vx: 0, vy: 0, life: 3, delay: i * 0.18 });
    }
  }
  damageBoss(p) {
    const b = this.boss;
    if (b.state === 'rage') { Snd.play('clink'); return; }
    b.hp -= 1; b.flash = 0.09; this.gainSilk(p, true); if (!p.remote) this.hitstop = 0.04; this.sfx(this.bossHitSnd('boss', p));
    this.burst(10, clamp(p.x + 7 + p.face * 30, b.x, b.x + b.w), b.y + b.h / 2, 0xf4f1e6);
    this.ui().bossBar(true, 'Корнематка', b.hp / b.maxHp);
    if (b.hp <= 0) this.killBoss(); else this.checkPhase(b, 'Корнематка');
  }
  // корни из-под земли: цепочка шипов от босса к игроку и шип прямо под ним
  rootLine(tx, phase3) {
    const b = this.boss, fy = (this.L.boss.floorY || Math.floor((b.y + b.h) / T)) * T, ax0 = this.L.boss.arenaX0 * T + T, ax1 = this.L.boss.arenaX1 * T - T;
    const bx = b.x + b.w / 2, dir = Math.sign(tx - bx) || b.face, xs = [];
    for (let x = bx + dir * 60, i = 0; dir > 0 ? x < ax1 : x > ax0; x += dir * 52, i++) xs.push([x, 0.5 + i * 0.09]);
    xs.push([tx, 0.75]);
    if (phase3) for (let x = bx - dir * 60, i = 0; dir > 0 ? x > ax0 : x < ax1; x -= dir * 52, i++) xs.push([x, 0.8 + i * 0.09]);
    const groundY = b.y + b.h;
    for (const [x, delay] of xs) this.projs.push({ kind: 'rootspike', x: clamp(x, ax0, ax1) - 18, y: groundY - 70, w: 36, h: 70, vx: 0, vy: 0, life: 0.55, delay });
  }
  killBoss() {
    const b = this.boss; b.state = 'dead'; b.t = 1.4; this.bossDead = true;
    for (const pr of this.projs) pr.dead = true;
    this.sfx('roar'); this.shake(1200, 0.01); this.hitstop = 0.25; this.bossDeathFx(b);
    for (let i = 0; i < 6; i++) this.time.delayedCall(i * 180, () => this.burst(24, b.x + Math.random() * b.w, b.y + Math.random() * b.h, i % 2 ? 0xffd47a : 0x9ff0c8));
    this.time.delayedCall(1300, () => {
      this.dropBeads(b.x + b.w / 2, b.y + b.h / 2, 30);
      this.setGate(this.gates[0], false); this.setGate(this.gates[1], false); this.sfx('gate');
      this.ui().bossBar(false); this.toastAll('Корнематка повержена. Путь на восток открыт');
      for (const p of this.players) if (p.downed && !p.remote) { p.downed = false; p.hp = 2; p.inv = 1.5; }
      this.sendEv({ k: 'reviveAll' });
    });
  }
  stepProjs(dt) {
    for (const pr of this.projs) {
      if (pr.dead) continue;
      if (pr.delay > 0) { pr.delay -= dt; continue; }
      pr.life -= dt; if (pr.life <= 0) { pr.dead = true; continue; }
      if (pr.kind === 'spore') {
        pr.vy += 700 * dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        if (this.isSolid(Math.floor((pr.x + 6) / T), Math.floor((pr.y + 6) / T))) { pr.dead = true; this.burst(6, pr.x + 6, pr.y + 6, 0xc7f08a); }
      } else if (pr.kind === 'wave') {
        pr.x += pr.vx * dt;
        const fx = pr.vx > 0 ? pr.x + pr.w : pr.x;
        if (this.isSolid(Math.floor(fx / T), Math.floor((pr.y + 9) / T))) pr.dead = true;
        if (Math.random() < 0.5) this.dust.explode(1, pr.x + pr.w / 2, pr.y + pr.h);
      } else if (pr.kind === 'rock') {
        pr.vy = Math.min(pr.vy + 1100 * dt, 800); pr.y += pr.vy * dt;
        if (this.isSolid(Math.floor((pr.x + 8) / T), Math.floor((pr.y + 16) / T))) { pr.dead = true; this.dustAt(8, pr.x + 8, pr.y + 16); }
      } else if (pr.kind === 'letter') this.stepLetter(pr, dt);
      else if (pr.kind === 'bigletter') this.stepBigLetter(pr, dt);
      else if (pr.kind === 'bomb') { this.stepBomb(pr, dt); continue; }
      else if (pr.kind === 'clef') this.stepClef(pr, dt);
      else if (pr.kind === 'note') this.stepNote(pr, dt);
      else if (pr.kind === 'drip') this.stepDrip(pr, dt);
      else if (pr.kind === 'ringfx') { this.stepTimaProj(pr, dt); continue; }
      else if (pr.kind === 'staffghost' || pr.kind === 'mark') continue;
      else if (this.stepExtraProj(pr, dt)) { /* новые снаряды боссов 2.0 */ }
      else if (this.tima) this.stepTimaProj(pr, dt);
      if (pr.dead) continue;
      for (const p of this.players) if (!p.remote && !p.downed && p.inv <= 0 && overlap(inset(p, 2), pr)) { this.hurtPlayer(p, HEAVY_KINDS.has(pr.kind) ? 2 : 1, pr.x + pr.w / 2); if (!PERSIST_KINDS.has(pr.kind)) pr.dead = true; }
    }
    this.projs = this.projs.filter((pr) => !pr.dead);
  }
  stepBeads(dt) {
    for (const bd of this.beadsArr) {
      bd.t += dt;
      const [tp, d] = this.nearestPlayer(bd.x + 4, bd.y + 4);
      if (tp && d < 80 && bd.t > 0.35) {
        const dx = tp.x + 7 - bd.x, dy = tp.y + 13 - bd.y, l = Math.hypot(dx, dy) || 1;
        bd.x += (dx / l) * 420 * dt; bd.y += (dy / l) * 420 * dt;
        if (overlap(tp, bd)) { bd.dead = true; this.beads++; this.sfx('bead'); }
        continue;
      }
      const vy0 = bd.vy; bd.vy = Math.min(bd.vy + 1000 * dt, 700);
      this.moveBody(bd, dt);
      if (bd.onGround) { if (vy0 > 140) bd.vy = -vy0 * 0.4; bd.vx *= 0.85; }
      if (bd.hitL || bd.hitR) bd.vx = -bd.vx * 0.5;
      if (bd.t > 30) bd.dead = true;
    }
    this.beadsArr = this.beadsArr.filter((b) => !b.dead);
  }
  win() {
    if (Campaign.preWin(this)) return;
    this.won = true; Snd.play('win');
    const s = { time: this.timeSec, beads: this.beads, deaths: this.deaths, players: this.nPlayers };
    if (this.mode === 'bosstest') {
      if (this.vladik) { s.title = 'Владик Скрипка повержен'; s.hits = this.needleHits; }
      else if (this.tima) { s.title = 'Тима Пиво повержен'; s.hits = this.timaHits; }
      else { s.title = 'Миша Додик повержен'; s.bag = this.bagHits; }
    }
    Campaign.decorate(this, s);
    this.sendEv({ k: 'win', s });
    this.ui().victory(s);
  }

  // ----- сеть -----
  packPlayer(p) {
    const r = (v) => Math.round(v * 10) / 10, f2 = (v) => Math.round(Math.max(0, v) * 100) / 100;
    return { t: 'p', i: p.i, x: r(p.x), y: r(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), f: p.face, g: p.onGround ? 1 : 0,
      d: f2(p.dashT), s: p.sit ? 1 : 0, h: f2(p.healT), l: f2(p.landT), hp: p.hp, mh: p.maxHp, sk: p.silk, dn: p.downed ? 1 : 0,
      iv: f2(p.inv), u: p.raw && p.raw.up ? 1 : 0, rv: f2(p.reviveT), sq: p.seq || 0, ad: p.atkDir, bm: p.bombs, hv: p.heavy ? 1 : 0, tp: this.td ? [Math.round(p.tdx), Math.round(p.tdy)] : null };
  }
  packSnap() {
    const r = Math.round, b = this.boss;
    const st = (e) => (e.state === 'wind' || e.state === 'charge') ? 1 : e.state === 'stun' ? 2 : 0;
    const mi = this.misha, vl = this.vladik, tm = this.tima, r10 = (x) => Math.round(x * 10) / 10;
    return { t: 's',
      e: this.enemies.map((e) => [r(e.x), r(e.y), e.face, e.dead ? 1 : 0, e.flash > 0 ? 1 : 0, st(e), this.packEnemy2(e)]),
      b: [r(b.x), r(b.y), b.face, b.hp, b.maxHp, b.state, b.flash > 0 ? 1 : 0, Math.round(b.t * 100) / 100, this.packPoise(b)],
      pr: this.projs.map((q) => [NET_KINDS.indexOf(q.kind), r(q.x), r(q.y), r(q.vx), r(q.vy), q.delay > 0 ? 1 : 0, q.ch || (q.kind === 'ringfx' ? r(q.r) : '')]),
      vl: vl ? [r(vl.x), r(vl.y), vl.face, vl.hp, vl.maxHp, vl.state, vl.flash > 0 ? 1 : 0, r10(vl.t), vl.sayT > 0 ? vl.say : '', this.curtains.map((c) => [r10(c.slime), Math.round(c.wet * 100) / 100]), this.packPoise(vl)] : null,
      tm: tm ? [r(tm.x), r(tm.y), tm.face, tm.hp, tm.maxHp, tm.state, tm.flash > 0 ? 1 : 0, r10(tm.t), tm.sayT > 0 ? tm.say : '', r10(tm.hyper), this.repo ? 1 : 0, this.puddles.map((q) => [r(q.x), q.w, r(q.y), r10(q.t)]), this.packPoise(tm)] : null,
      td: this.td ? [this.td.state, this.td.lane, r(this.td.mx), this.td.blocks, this.td.need, this.td.sayT > 0 ? this.td.say : ''] : null,
      mi: mi ? [r(mi.x), r(mi.y), mi.face, mi.hp, mi.maxHp, mi.state, mi.flash > 0 ? 1 : 0, Math.round(mi.t * 100) / 100, mi.sayT > 0 ? mi.say : '', r10(mi.zipT || 0)] : null,
      bd: this.beadsArr.map((d) => [r(d.x), r(d.y)]), bc: this.beads,
      g: this.gates.map((gt) => (gt.closed ? 1 : 0)), bD: this.bossDead ? 1 : 0, rs: [r(this.respawn.x), r(this.respawn.y)] };
  }
  onNet(m) {
    if (!this.players || !this.online) return;
    if (m.t === 'p') {
      const p = this.players[m.i]; if (!p || !p.remote) return;
      Object.assign(p, { tx: m.x, ty: m.y, vx: m.vx, vy: m.vy, face: m.f, onGround: !!m.g, dashT: m.d, sit: !!m.s, healT: m.h, landT: m.l,
        hp: m.hp, maxHp: m.mh, silk: m.sk, downed: !!m.dn, inv: m.iv, netUp: !!m.u, reviveT: m.rv, netT: 0, bombs: m.bm || 0, heavy: !!m.hv });
      if (m.tp) { p.tdx = m.tp[0]; p.tdy = m.tp[1]; }
      p.inp = { up: p.netUp };
      if (m.sq !== p.lastSeq) { p.lastSeq = m.sq; p.atkT = P.ATK_T; p.atkHits = new Set(); p.atkDir = m.ad; p.pogoed = true; }
    } else if (m.t === 's' && this.online === 'guest') this.applySnap(m);
    else if (m.t === 'ev') this.onEv(m);
    else if (m.t === 'ping') Net.send({ t: 'pong', ts: m.ts });
    else if (m.t === 'pong') this.ping = Math.round(performance.now() - m.ts);
  }
  applySnap(m) {
    m.e.forEach((a, i) => {
      const e = this.enemies[i]; if (!e) return;
      const dead = !!a[3];
      if (e.tx == null || dead !== e.dead || Math.abs(e.x - a[0]) > 90) { e.x = a[0]; e.y = a[1]; }
      e.tx = a[0]; e.ty = a[1]; e.face = a[2];
      if (dead && !e.dead) e.g.clear();
      e.dead = dead; if (a[4]) e.flash = 0.1;
      e.state = a[5] === 1 ? 'charge' : a[5] === 2 ? 'stun' : 'walk';
      if (a[6]) this.applyEnemy2(e, a[6]);
    });
    const b = this.boss, B = m.b;
    if (b.tx == null || Math.abs(b.x - B[0]) > 140) { b.x = B[0]; b.y = B[1]; }
    b.tx = B[0]; b.ty = B[1]; b.face = B[2]; b.hp = B[3]; b.maxHp = B[4]; b.state = B[5]; if (B[6]) b.flash = 0.09; b.t = B[7]; this.unpackPoise(b, B[8]);
    const old = this.projs;
    this.projs = m.pr.map((a, i) => {
      const q = { kind: NET_KINDS[a[0]], x: a[1], y: a[2], vx: a[3], vy: a[4], delay: a[5] ? 1 : 0, ch: a[6], w: NET_SIZES[a[0]][0], h: NET_SIZES[a[0]][1], life: 1 };
      if (q.kind === 'ringfx') q.r = a[6];
      q.rot = old[i] && old[i].kind === q.kind ? old[i].rot || 0 : 0;
      return q;
    });
    const syncBoss = (bb, A, name, flagKey, pzIdx) => {
      if (bb.tx == null || Math.abs(bb.x - A[0]) > 140 || Math.abs(bb.y - A[1]) > 220) { bb.x = A[0]; bb.y = A[1]; }
      this.unpackPoise(bb, A[pzIdx]);
      bb.tx = A[0]; bb.ty = A[1]; bb.face = A[2]; bb.hp = A[3]; bb.maxHp = A[4]; bb.state = A[5]; if (A[6]) bb.flash = 0.09; bb.t = A[7];
      if (A[8]) { bb.say = A[8]; bb.sayT = 0.2; }
      const show = bb.state !== 'dead';
      if (show !== !!this[flagKey]) { this[flagKey] = show; this.ui().bossBar(show, name); }
      if (show) this.ui().bossBar(true, null, Math.max(0, bb.hp) / bb.maxHp);
    };
    if (m.vl && this.vladik) { syncBoss(this.vladik, m.vl, 'Владик Скрипка', '_vb', 10); m.vl[9].forEach((c, i) => { if (this.curtains[i]) { this.curtains[i].slime = c[0]; this.curtains[i].wet = c[1]; } }); }
    if (m.tm && this.tima) { syncBoss(this.tima, m.tm, 'Тима Пиво', '_tb', 12); this.tima.hyper = m.tm[9]; this.setRepo(!!m.tm[10]); this.puddles = m.tm[11].map((q) => ({ x: q[0], w: q[1], y: q[2], t: q[3] })); }
    if (m.td && !this.td) this.tdBegin(true);
    if (!m.td && this.td) this.tdEnd(false, true);
    if (m.td && this.td) { const d = m.td; Object.assign(this.td, { state: d[0], lane: d[1], mx: d[2], blocks: d[3], need: d[4] }); if (d[5]) { this.td.say = d[5]; this.td.sayT = 0.2; } }
    if (m.mi && this.misha) {
      const M = m.mi, mm = this.misha;
      if (mm.tx == null || Math.abs(mm.x - M[0]) > 140) { mm.x = M[0]; mm.y = M[1]; }
      mm.tx = M[0]; mm.ty = M[1]; mm.face = M[2]; mm.hp = M[3]; mm.maxHp = M[4]; mm.state = M[5]; if (M[6]) mm.flash = 0.1; mm.t = M[7];
      if (M[8]) { mm.say = M[8]; mm.sayT = 0.2; }
      mm.zipT = M[9] || 0;
      const showM = mm.state !== 'dead';
      if (showM !== !!this._mb) { this._mb = showM; this.ui().bossBar(showM, 'Миша Додик'); }
      if (showM) this.ui().bossBar(true, null, Math.max(0, mm.hp) / mm.maxHp);
    }
    this.beadsArr = m.bd.map((a) => ({ x: a[0], y: a[1], w: 8, h: 8 }));
    this.beads = m.bc;
    m.g.forEach((c, i) => { if (this.gates[i] && this.gates[i].closed !== !!c) this.setGate(this.gates[i], !!c); });
    this.bossDead = !!m.bD; this.respawn = { x: m.rs[0], y: m.rs[1] };
    const show = !this.bossDead && !['sleep', 'gone', 'dead'].includes(b.state);
    if (show !== !!this._bb) { this._bb = show; this.ui().bossBar(show, 'Корнематка'); }
    if (show) this.ui().bossBar(true, null, b.hp / b.maxHp);
  }
  onEv(m) {
    switch (m.k) {
      case 'snd': Snd.play(m.n); break;
      case 'smoke': if (this.smoke) this.smoke.explode(m.n, m.x, m.y); break;
      case 'paper': if (this.paper) this.paper.explode(m.n, m.x, m.y); break;
      case 'bomb': if (this.auth() && this.L.crates) this.projs.push({ kind: 'bomb', ...m.b, w: 12, h: 12, life: 3, owner: m.i }); break;
      case 'cut':
        if (this.auth()) {
          const kind = m.kind || 'letter';
          const q = this.projs.find((pr) => pr.kind === kind && !pr.dead && Math.abs(pr.x - m.x) < 40 && Math.abs(pr.y - m.y) < 40);
          if (q && kind === 'collector') { this.hitCollector(q, m.d || 1); break; }
          if (q) { q.dead = true; if (kind === 'letter' || kind === 'rain') this.paperAt(6, q.x + 11, q.y + 13); else this.burst(6, q.x + q.w / 2, q.y + q.h / 2, 0xffd47a); this.sfx('clink'); }
        }
        break;
      case 'burstSkill': if (this.auth() && this.players[1]) this.silkBurstHit(this.players[1], m.x, m.y); break;
      case 'repo': if (!this.auth() && this.tima) this.setRepo(!!m.on); break;
      case 'bankrupt': if (this.tima) this.bankruptSilk(); break;
      case 'foam': if (this.foam) this.foam.explode(m.n, m.x, m.y); break;
      case 'burst': this.parts.setParticleTint(m.c); this.parts.explode(m.n, m.x, m.y); break;
      case 'dust': this.dust.explode(m.n, m.x, m.y); break;
      case 'shake': this.cameras.main.shake(m.d, m.i); break;
      case 'toast': this.ui().toast(m.m); break;
      case 'flash': this.cameras.main.flash(260, 255, 240, 220); break;
      case 'deathfx': this.deathFxLocal(); break;
      case 'execfx': { const q = this.players[m.i]; if (q && q.remote) { q.execT = 0.4; q.execDir = m.d; } this.execFxLocal(m.x, m.y, m.d); break; }
      case 'exec': if (this.auth()) { const q = this.players[m.i], kit = q && this.execKit(m.key); if (q && kit) this.execBoss(q, kit, m.d); } break;
      case 'kb': this.knockFrom(m.x); break;
      case 'silk': { const p = this.players[m.i]; if (p && !p.remote) p.silk = Math.min(P.SILK, p.silk + 1); break; }
      case 'bench':
        this.respawn = { x: m.x, y: m.y };
        for (const q of this.players) if (q.downed && !q.remote) { q.downed = false; q.hp = 2; q.inv = 1.5; q.x = m.x - 7 + 22; q.y = m.y - 26; Snd.play('revive'); }
        this.ui().toast('Напарник отдыхает на скамье: здесь вы очнётесь');
        break;
      case 'reviveAll': for (const q of this.players) if (q.downed && !q.remote) { q.downed = false; q.hp = 2; q.inv = 1.5; } break;
      case 'wipe':
        if (this.wiping) break;
        this.wiping = true; for (const q of this.players) if (!q.remote) q.downed = true;
        this.ui().toast('Нить оборвалась…');
        this.time.delayedCall(700, () => this.cameras.main.fadeOut(600, 3, 8, 7));
        break;
      case 'respawn': this.respawn = { x: m.x, y: m.y }; this.respawnLocal(); break;
      case 'win': if (!this.won) { this.won = true; Snd.play('win'); this.ui().victory(m.s); } break;
      default: Campaign.onEv(this, m);
    }
  }
  netSmooth(dt) {
    const k = 1 - Math.exp(-dt * 16);
    for (const p of this.players) {
      if (!p.remote || p.tx == null) continue;
      p.netT = (p.netT || 0) + dt;
      const ex = Math.min(p.netT, 0.12), tx = p.tx + p.vx * ex, ty = p.ty + (p.onGround ? 0 : p.vy * ex);
      if (Math.abs(tx - p.x) > 160 || Math.abs(ty - p.y) > 160) { p.x = tx; p.y = ty; } else { p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; }
      if (p.dashT > 0) { p.dashT -= dt; p.trail.push({ x: p.x + 7, y: p.y + 26, a: 1, f: p.face }); }
      p.inv -= dt; p.healT -= dt; p.landT -= dt; p.execT = (p.execT || 0) - dt;
      for (const tr of p.trail) tr.a -= dt * 5;
      p.trail = p.trail.filter((tr) => tr.a > 0);
    }
    if (this.online === 'guest') {
      const k2 = 1 - Math.exp(-dt * 14);
      for (const e of this.enemies) if (!e.dead && e.tx != null) { e.x += (e.tx - e.x) * k2; e.y += (e.ty - e.y) * k2; e.flash -= dt; }
      const b = this.boss; if (b.tx != null) { b.x += (b.tx - b.x) * k2; b.y += (b.ty - b.y) * k2; b.flash -= dt; }
      for (const mm of [this.misha, this.vladik, this.tima]) if (mm && mm.tx != null) { mm.x += (mm.tx - mm.x) * k2; mm.y += (mm.ty - mm.y) * k2; mm.flash -= dt; mm.sayT -= dt; }
      for (const pr of this.projs) {
        if (pr.delay) continue;
        if (pr.kind === 'ringfx') { pr.r += 900 * dt; continue; }
        if (pr.kind === 'pad') continue;
        if (pr.kind === 'clef' || pr.kind === 'bottle') pr.rot = (pr.rot || 0) + dt * 10;
        if (pr.kind === 'spore') pr.vy += 700 * dt;
        if (pr.kind === 'rootspike' || pr.kind === 'staff' || pr.kind === 'staffghost') continue;
        if (pr.kind === 'collector') { pr.vx = 0; pr.vy = 0; continue; }
        else if (['rock', 'bigletter', 'bomb', 'note', 'drip', 'bottle', 'box', 'stamp', 'trophy'].includes(pr.kind)) pr.vy = Math.min(pr.vy + 1100 * dt, 800);
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        if (pr.kind === 'wave' && Math.random() < 0.3) this.dust.explode(1, pr.x + pr.w / 2, pr.y + pr.h);
      }
    }
  }
  guestProjHits() {
    for (const p of this.players) {
      if (p.remote || p.downed || p.inv > 0) continue;
      for (const pr of this.projs) if (!pr.dead && !pr.delay && pr.kind !== 'bomb' && pr.kind !== 'ringfx' && pr.kind !== 'staffghost' && pr.kind !== 'mark' && overlap(inset(p, 2), pr)) { this.hurtPlayer(p, HEAVY_KINDS.has(pr.kind) ? 2 : 1, pr.x + pr.w / 2); if (!PERSIST_KINDS.has(pr.kind)) pr.dead = true; break; }
    }
    this.projs = this.projs.filter((q) => !q.dead);
  }
  netTick(dt) {
    if (!Net.conn) return;
    if (performance.now() - Net.lastRecv > 10000) { const c = Net.conn; Net.conn = null; try { c.close(); } catch (_) { } this.onPeerLost(); return; }
    this.netAcc += dt; this.snapAcc += dt; this.pingAcc += dt;
    if (this.netAcc >= 1 / 30) { this.netAcc = 0; const p = this.players[this.localIdx]; if (p) Net.send(this.packPlayer(p)); }
    if (this.online === 'host' && this.snapAcc >= 1 / 20) { this.snapAcc = 0; Net.send(this.packSnap()); }
    if (this.pingAcc >= 2) { this.pingAcc = 0; Net.send({ t: 'ping', ts: performance.now() }); }
  }
  onPeerLost() {
    if (!this.sys.isActive()) return;
    if (this.online === 'host') {
      const rem = this.players.find((p) => p.remote);
      if (rem) { rem.g.destroy(); rem.tag.destroy(); this.players = this.players.filter((p) => !p.remote); this.ui().removePlayer(rem.i); }
      this.online = null; this.nPlayers = 1;
      this.ui().toast('Связь с напарником потеряна. Игра продолжается в одиночку');
    } else {
      this.ui().toast('Хост отключился. Возвращаемся в меню…');
      this.time.delayedCall(2800, () => this.ui().restart());
    }
  }

  // ----- камера -----
  updateCamera(dt) {
    const cam = this.cameras.main;
    if (this.tdFlip) return; // во время «вида сверху» камерой управляет переворот
    const pts = this.alivePlayers().length ? this.alivePlayers() : this.players;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + p.w); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y + p.h); }
    const mi = this.testBoss(), withBoss = mi && (mi.state !== 'dead' || mi.t > 0.3);
    if (withBoss) { x0 = Math.min(x0, mi.x - 20); x1 = Math.max(x1, mi.x + mi.w + 20); y0 = Math.min(y0, mi.y - 40); }
    let tx = (x0 + x1) / 2, ty = (y0 + y1) / 2 - 30;
    if (pts.length === 1 && !withBoss) tx += pts[0].face * 50;
    const zmin = Math.max(0.66, VW / (this.L.W * T), VH / (this.L.H * T));
    const zt = clamp(Math.min(VW / (x1 - x0 + 520), VH / (y1 - y0 + 300)), zmin, 1.18);
    const k = 1 - Math.exp(-dt * 5);
    this.camX += (tx - this.camX) * k; this.camY += (ty - this.camY) * k;
    this.zoom += (zt - this.zoom) * (1 - Math.exp(-dt * 3));
    cam.setZoom(this.zoom); cam.centerOn(this.camX, this.camY);
  }

  // ----- отрисовка -----
  render(dt) {
    const fx = this.fx, fb = this.fxBack; fx.clear(); fb.clear();
    const now = this.animT;
    // таблички проявляются рядом с игроком
    for (const s of this.L.signs) {
      const near = this.players.some((p) => Math.abs(p.x + 7 - s.px) < 150 && Math.abs(p.y + 26 - s.py) < 120);
      s.txt.setAlpha(s.txt.alpha + ((near ? 1 : 0) - s.txt.alpha) * Math.min(1, dt * 8));
    }
    // хвосты рывка
    for (const p of this.players) for (const tr of p.trail) {
      fb.fillStyle(p.pal.cloak, tr.a * 0.35); fb.fillEllipse(tr.x, tr.y - 13, 18, 22);
    }
    for (const p of this.players) this.drawPlayer(p, now);
    for (const e of this.enemies) if (!e.dead) this.drawEnemy(e, now);
    this.drawBoss(now);
    this.drawItems(now);
    if (this.misha) { this.drawMisha(now); this.drawLetters(now); }
    if (this.vladik) { this.drawCurtains(now); this.drawVladik(now); }
    if (this.tima) this.drawTima(now);
    // удары
    for (const p of this.players) {
      if (p.downed || p.atkT <= 0) continue;
      const k = p.atkT / P.ATK_T, cx = p.x + p.w / 2, cy = p.y + p.h / 2 - 2;
      const th = p.atkDir === 'f' ? (p.face > 0 ? 0 : Math.PI) : p.atkDir === 'u' ? -Math.PI / 2 : Math.PI / 2;
      const ux = Math.cos(th), uy = Math.sin(th);
      const R = 36, ox = cx + ux * 4, oy = cy + uy * 4;
      fx.fillStyle(0xf6f3e8, 0.9 * k);
      fx.beginPath(); fx.arc(ox, oy, R, th - 1.15, th + 1.15, false); fx.arc(ox - ux * 12, oy - uy * 12, R - 2, th + 1.15, th - 1.15, true); fx.closePath(); fx.fillPath();
      fx.lineStyle(2, p.pal.accent, 0.8 * k); fx.beginPath(); fx.arc(ox, oy, R + 2, th - 1.0, th + 1.0, false); fx.strokePath();
    }
    // снаряды
    for (const pr of this.projs) {
      if (!STORY_KINDS.has(pr.kind)) continue;
      if (pr.delay > 0) {
        fx.fillStyle(0x8fae9c, 0.5); fx.fillTriangle(pr.x + 2, 19 * T, pr.x + 14, 19 * T, pr.x + 8, 19 * T + 8); continue;
      }
      if (pr.kind === 'spore') {
        fx.fillStyle(0xc7f08a, 0.25); fx.fillCircle(pr.x + 6, pr.y + 6, 10);
        fx.fillStyle(0xa8d86a, 1); fx.fillCircle(pr.x + 6, pr.y + 6, 6); fx.fillStyle(0xe8ffc0, 1); fx.fillCircle(pr.x + 4, pr.y + 4, 2);
      } else if (pr.kind === 'wave') {
        fx.fillStyle(0x9ff0c8, 0.3); fx.fillEllipse(pr.x + 12, pr.y + 14, 34, 18);
        fx.fillStyle(0x6b8f6a, 1);
        for (let i = 0; i < 3; i++) fx.fillTriangle(pr.x + i * 8, pr.y + 18, pr.x + 4 + i * 8, pr.y + 2 + Math.sin(now * 30 + i) * 3, pr.x + 8 + i * 8, pr.y + 18);
      } else if (pr.kind === 'rock') {
        fx.fillStyle(0x2b3d36, 1); fx.fillRoundedRect(pr.x, pr.y, 16, 16, 4); fx.fillStyle(0x3b7448, 1); fx.fillRect(pr.x + 2, pr.y, 12, 3);
      }
    }
    if (this.vladik) this.drawVladikProjs(now);
    if (this.tima) { this.drawTimaProjs(now); this.drawStampLabels(); }
    this.drawExtraProjs(now);
    this.drawPoiseBars(now);
    // бусины
    for (const bd of this.beadsArr) {
      fx.fillStyle(0xffd47a, 0.25); fx.fillCircle(bd.x + 4, bd.y + 4, 7);
      fx.fillStyle(0xffe3a3, 1); fx.fillCircle(bd.x + 4, bd.y + 4, 3.5);
    }
    // прогресс оживления
    for (const p of this.players) if (p.downed && p.reviveT > 0) {
      fx.lineStyle(3, p.pal.accent, 1); fx.beginPath(); fx.arc(p.x + 7, p.y - 6, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.reviveT, false); fx.strokePath();
    }
    // ворота
    for (const gt of this.gates) {
      gt.anim += ((gt.closed ? 1 : 0) - gt.anim) * Math.min(1, dt * 6);
      const g = gt.g; g.clear(); if (gt.anim < 0.02) continue;
      const x = gt.x * T, top = gt.y0 * T, h = (gt.y1 - gt.y0 + 1) * T * gt.anim;
      g.fillStyle(0x1f2a24, 1); g.fillRect(x + 2, top, T - 4, h);
      g.lineStyle(3, 0x4a3726, 1); for (let i = 0; i < 3; i++) g.lineBetween(x + 6 + i * 10, top, x + 6 + i * 10 + Math.sin(i * 2) * 3, top + h);
      g.lineStyle(2, 0x3b7448, 1); for (let yy = top + 10; yy < top + h; yy += 28) g.lineBetween(x + 2, yy, x + T - 2, yy + 6);
      if (gt.lockedUntilBoss) { g.fillStyle(0x9ff0c8, 0.6 + Math.sin(now * 3) * 0.2); g.fillCircle(x + T / 2, top + h / 2, 4); }
    }
    // выход
    const eg = this.exitG; eg.clear();
    if (!this.exitR) return;
    const ex = this.exitR.x + 20, ey = this.exitR.y + this.exitR.h;
    eg.lineStyle(4, 0x2a4636, 1); eg.beginPath(); eg.arc(ex, ey - 40, 30, Math.PI, 0, false); eg.strokePath();
    eg.lineBetween(ex - 30, ey - 40, ex - 30, ey); eg.lineBetween(ex + 30, ey - 40, ex + 30, ey);
    if (this.bossDead) {
      eg.fillStyle(0xffe3a3, 0.1 + Math.sin(now * 2) * 0.04); eg.fillRect(ex - 28, ey - 66, 56, 66);
      eg.lineStyle(2, 0xffe3a3, 0.8); eg.lineBetween(ex, ey - 70, ex, ey);
    }
  }

  drawPlayer(p, now) {
    const g = p.g; g.clear();
    const cx = p.x + p.w / 2, fy = p.y + p.h;
    g.setPosition(0, 0); g.setScale(1);
    p.tag.setVisible(!p.downed);
    if (p.downed) {
      g.setAlpha(1);
      const pulse = 0.5 + Math.sin(now * 3 + p.i) * 0.2;
      g.fillStyle(p.pal.accent, 0.15 * pulse + 0.05); g.fillCircle(cx, fy - 14, 22);
      g.fillStyle(0xe9e4d4, 1); g.fillEllipse(cx, fy - 13, 20, 27);
      g.lineStyle(1.2, 0xb9b3a0, 1);
      for (let i = 0; i < 5; i++) g.lineBetween(cx - 10, fy - 24 + i * 5, cx + 10, fy - 20 + i * 5);
      g.fillStyle(p.pal.cloak, 1); g.fillTriangle(cx - 4, fy - 1, cx + 4, fy - 1, cx, fy + 3);
      return;
    }
    const blink = p.inv > 0 && Math.floor(now * 20) % 2 === 0;
    g.setAlpha(blink ? 0.35 : 1);
    let sx = 1, sy = 1;
    if (!p.onGround) { if (p.vy < -150) { sx = 0.88; sy = 1.12; } else if (p.vy > 250) { sx = 0.93; sy = 1.07; } }
    if (p.landT > 0) { sx = 1.15; sy = 0.86; }
    if (p.dashT > 0) { sx = 1.25; sy = 0.82; }
    if (p.sit) { sy = 0.82; sx = 1.08; }
    g.setPosition(cx, fy); g.setScale(sx, sy);
    const run = p.onGround && Math.abs(p.vx) > 10 && !p.sit;
    const ph = now * 14;
    const a = {
      leg: run ? Math.sin(ph) * 5 : (p.onGround ? 0 : 2),
      bob: run ? Math.abs(Math.sin(ph)) * 1.5 : Math.sin(now * 2.5 + p.i) * 0.8,
      sway: run ? -4 : (!p.onGround ? (p.vy < 0 ? -2 : 3) : Math.sin(now * 2) * 1),
      lift: (!p.onGround && p.vy > 0) ? -4 : 0,
    };
    if (p.healT > 0) { g.fillStyle(p.pal.accent, 0.25 * (p.healT / 0.6)); g.fillCircle(0, -14, 24); }
    this.drawPlayerFx(p, g);
    drawWeaver(g, 0, 0, p.face, p.pal, a, 1);
    p.tag.setPosition(cx + p.face * 0.5, fy + (-12.5 - a.bob * 0.5) * sy).setScale(sx, sy).setAlpha(blink ? 0.35 : 1);
    if (p.atkT <= 0 && !p.sit) {
      const f = p.face;
      g.lineStyle(1.8, 0xcfd6dc, 1); g.lineBetween(-6 * f, -10 - a.bob, -13 * f, -25 - a.bob);
      g.lineStyle(1, p.pal.accent, 0.9); g.strokeCircle(-13 * f, -26 - a.bob, 2);
    }
  }

  drawEnemy(e, now) {
    const g = e.g; g.clear();
    if (e.e2) { this.drawEnemy2(e, now); return; }
    const fl = e.flash > 0;
    const cx = e.x + e.w / 2, fy = e.y + e.h, f = e.face || 1;
    if (e.type === 'crawler') {
      const legs = Math.sin(now * 12 + e.t) * 2;
      g.lineStyle(1.6, 0x1a1a14, 1);
      for (let i = -1; i <= 1; i++) g.lineBetween(cx + i * 7, fy - 5, cx + i * 7 + (i % 2 ? legs : -legs), fy);
      g.fillStyle(fl ? 0xffffff : 0x4d6b3a, 1); g.fillEllipse(cx, fy - 9, 28, 17);
      g.fillStyle(fl ? 0xffffff : 0x6f9a4e, 1); g.fillEllipse(cx - 2 * f, fy - 12, 18, 7);
      g.fillStyle(0x3b7448, 1); g.fillCircle(cx - 6, fy - 16, 3); g.fillCircle(cx + 2, fy - 17, 2.5);
      g.fillStyle(0xffb347, 1); g.fillCircle(cx + 11 * f, fy - 7, 2.2);
    } else if (e.type === 'gnat') {
      const cy = e.y + 9, wing = Math.sin(now * 50 + e.t) > 0;
      g.fillStyle(0xd8f0e8, wing ? 0.55 : 0.25); g.fillEllipse(cx - 5, cy - 9, 12, 7); g.fillEllipse(cx + 5, cy - 9, 12, 7);
      g.fillStyle(fl ? 0xffffff : 0x6b4a6e, 1); g.fillCircle(cx, cy, 8);
      g.fillStyle(fl ? 0xffffff : 0x8d6a90, 1); g.fillEllipse(cx - 2 * f, cy - 3, 8, 4);
      g.fillStyle(0x2a1c2c, 1); g.fillTriangle(cx - 6 * f, cy + 2, cx - 14 * f, cy + 6, cx - 5 * f, cy + 6);
      g.fillStyle(0xff7a6b, 1); g.fillCircle(cx + 4 * f, cy - 1, 2.2);
    } else {
      const angry = e.state === 'wind' || e.state === 'charge';
      const shake = e.state === 'wind' ? Math.sin(now * 60) * 1.5 : 0;
      const x = cx + shake;
      g.lineStyle(2, 0x15161c, 1);
      const legs = e.state === 'charge' ? Math.sin(now * 30) * 3 : Math.sin(now * 10) * 2;
      for (let i = -1; i <= 1; i++) g.lineBetween(x + i * 10, fy - 6, x + i * 10 + legs * (i % 2 ? 1 : -1), fy);
      g.fillStyle(fl ? 0xffffff : 0x3d4a5c, 1); g.fillEllipse(x, fy - 12, 38, 22);
      g.fillStyle(fl ? 0xffffff : 0x56667d, 1); g.fillEllipse(x - 4 * f, fy - 16, 22, 8);
      g.fillStyle(0xcfc6a8, 1); g.fillTriangle(x + 14 * f, fy - 14, x + 30 * f, fy - 22, x + 16 * f, fy - 8);
      g.fillStyle(angry ? 0xff4d3c : 0xffb347, 1); g.fillCircle(x + 12 * f, fy - 10, 2.6);
      if (e.state === 'stun') { g.fillStyle(0xffe3a3, 0.8); for (let i = 0; i < 3; i++) g.fillCircle(x + Math.cos(now * 6 + i * 2.1) * 12, fy - 30 + Math.sin(now * 6 + i * 2.1) * 4, 2); }
    }
  }

  drawBoss(now) {
    const b = this.boss, g = b.g; g.clear();
    if (b.state === 'gone') return;
    const cx = b.x + b.w / 2, fy = b.y + b.h, f = b.face;
    let shake = 0, squash = 1;
    if (b.state === 'leapWind' || b.state === 'chargeWind' || b.state === 'sporeWind') shake = Math.sin(now * 70) * 2;
    if (b.state === 'leapWind') squash = 0.85;
    if (b.state === 'roar') shake = Math.sin(now * 50) * 3;
    const alpha = b.state === 'dead' ? Math.max(0, b.t / 1.4) : 1;
    g.setAlpha(alpha);
    const x = cx + shake, fl = b.flash > 0, sleep = b.state === 'sleep';
    const H = 56 * squash, phase2 = b.hp <= b.maxHp / 2;
    // корни-лапы
    g.lineStyle(4, 0x2a3a26, 1);
    for (let i = 0; i < 4; i++) {
      const lx = x - 26 + i * 17, sw = Math.sin(now * (b.state === 'charge' ? 24 : 4) + i) * 4;
      g.lineBetween(lx, fy - 10, lx + sw - 6, fy);
    }
    g.fillStyle(fl ? 0xffffff : 0x34482f, 1); g.fillEllipse(x, fy - H / 2 - 4, 80, H);
    g.fillStyle(fl ? 0xffffff : 0x4a6a3c, 1); g.fillEllipse(x - 6 * f, fy - H / 2 - 12, 58, H * 0.5);
    g.fillStyle(0x5d8a46, 1);
    for (let i = 0; i < 6; i++) g.fillCircle(x - 30 + i * 12, fy - H - 1 + Math.sin(i * 1.7) * 3, 6 + (i % 3));
    g.fillStyle(0xffd47a, 1); g.fillCircle(x - 18, fy - H - 8, 2.5); g.fillCircle(x + 14, fy - H - 6, 2);
    // морда
    const ex = x + 22 * f, ey = fy - H / 2 - 2;
    g.fillStyle(0x1a2016, 1); g.fillEllipse(ex, ey + 4, 24, 26);
    const eyeC = sleep ? 0x55604a : (phase2 ? 0xff5a3c : 0xff9a3c);
    g.fillStyle(eyeC, sleep ? 0.6 : 0.3); g.fillCircle(ex - 3 * f, ey - 2, 9); g.fillCircle(ex + 6 * f, ey + 1, 7);
    g.fillStyle(eyeC, 1);
    if (sleep) { g.fillRect(ex - 7 * f - 3, ey - 2, 7, 2); g.fillRect(ex + 6 * f - 3, ey + 1, 6, 2); }
    else { g.fillCircle(ex - 3 * f, ey - 2, 3.6); g.fillCircle(ex + 6 * f, ey + 1, 3); }
    if (b.state === 'sporeWind' || b.state === 'roar') { g.fillStyle(0x0c0f0a, 1); g.fillEllipse(ex + 2 * f, ey + 11, 12, 8); }
    if (b.state === 'stun') { g.fillStyle(0xffe3a3, 0.9); for (let i = 0; i < 4; i++) g.fillCircle(x + Math.cos(now * 5 + i * 1.6) * 30, fy - H - 14 + Math.sin(now * 5 + i * 1.6) * 6, 2.5); }
  }
}

// ---------- ИНТЕРФЕЙС ----------
class UIScene extends Phaser.Scene {
  constructor() { super('ui'); }
  create() {
    this.ready = false;
    this.gs = this.scene.get('game');
    this.add.image(0, 0, 'vignette').setOrigin(0).setDisplaySize(VW, VH);
    this.hud = this.add.graphics();
    const F = '"Fira Sans", sans-serif', D = '"Cormorant SC", Georgia, serif';
    this.names = this.gs.players.map((p, i) => this.add.text(i === 0 ? 72 : VW - 72, 20, p.pal.name, { fontFamily: D, fontSize: '20px', color: p.pal.hex, fontStyle: '700' }).setOrigin(i === 0 ? 0 : 1, 0));
    this.beadTxt = this.add.text(42, VH - 34, '0', { fontFamily: F, fontSize: '18px', color: '#ffe3a3' });
    this.netTxt = this.add.text(VW - 16, VH - 14, '', { fontFamily: F, fontSize: '12px', color: '#6f9586' }).setOrigin(1, 1);
    this.area = this.add.text(VW / 2, 92, '', { fontFamily: D, fontSize: '40px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5).setAlpha(0).setShadow(0, 0, '#000', 12, false, true);
    this.areaSub = this.add.text(VW / 2, 128, '', { fontFamily: F, fontSize: '13px', color: '#8fb8a8' }).setOrigin(0.5).setAlpha(0);
    this.toastTxt = this.add.text(VW / 2, VH - 92, '', { fontFamily: F, fontSize: '16px', color: '#e8e2cf', backgroundColor: 'rgba(6,14,12,0.8)', padding: { x: 14, y: 8 } }).setOrigin(0.5).setAlpha(0);
    this.bossName = this.add.text(VW / 2, VH - 58, '', { fontFamily: D, fontSize: '22px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5).setAlpha(0);
    this.bossOn = false; this.bossFrac = 1; this.bossShown = 1;
    // пауза
    this.pause = this.add.container(0, 0).setVisible(false);
    const pb = this.add.graphics(); pb.fillStyle(0x030807, 0.82); pb.fillRect(0, 0, VW, VH);
    const pt = this.add.text(VW / 2, 150, 'Пауза', { fontFamily: D, fontSize: '52px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5);
    const pc = this.add.text(VW / 2, 300, [
      'Игрок 1:  A D W S · Пробел — прыжок · F — удар · G — рывок · Q — лечение · R — дымовуха',
      'Игрок 2:  стрелки · Num1 или / — прыжок · Num2 или . — удар · Num3 или , — рывок · Num0 или M — лечение · Num4 или N — дымовуха',
      '', 'Удар вверх: держи ↑ + удар.  Удар вниз в прыжке: ↓ + удар — отскок от колючек и врагов.',
      'Прыжок от стены: прижмись к стене в падении и прыгни.  Спрыгнуть с платформы: ↓ + прыжок.',
      'Оглушённого босса (полоска над ним) можно казнить: подойди и ударь вверх или вниз.  Отбив: кнопка лечения (без ↑) в миг удара врага, если лечиться нельзя.',
      'Лечение: когда катушка нити полна, 1.1 с стоишь на месте и восстанавливаешь 2 бутона; урон прерывает лечение.',
      'Отбив: кнопка нити (Q), когда нить не полна, — окно 0.2 с, отбивает удар и снаряды.  Всполох: ↑ + нить (от 4 нити).',
      'Комбо: третий удар подряд — тяжёлый.  Рывок сквозь удар — идеальный уворот (+2 нити).  Серия ударов оглушает босса.',
      'Напарник в коконе: подойди и держи ↑ одну секунду.  Скамья (↑) лечит и оживляет.',
      'По сети каждый играет раскладкой игрока 1, а пауза не останавливает мир.',
    ].join('\n'), { fontFamily: F, fontSize: '14px', color: '#b9d4c8', align: 'center', lineSpacing: 7 }).setOrigin(0.5).setY(285);
    if (Touch.enabled) pc.setText([
      'Стик слева — идти. Вверх + удар — удар вверх, в прыжке вниз + удар — отскок.',
      'Прыжок от стены: прижмись стиком к стене в падении и жми «Прыжок».  Спрыгнуть с платформы: стик вниз + «Прыжок».',
      'Оглушённого босса (полоска над ним) можно казнить: подойди и ударь вверх или вниз (стик).',
      'Лечение: когда катушка нити полна, стоишь 1.1 с и восстанавливаешь 2 бутона; урон прерывает лечение.',
      'Отбив: кнопка нити (Q), когда нить не полна, — окно 0.2 с, отбивает удар и снаряды.  Всполох: ↑ + нить (от 4 нити).',
      'Комбо: третий удар подряд — тяжёлый.  Рывок сквозь удар — идеальный уворот (+2 нити).  Серия ударов оглушает босса.',
      'Напарник в коконе: подойди и держи стик вверх одну секунду.  Скамья: стик вверх.',
      'По сети пауза не останавливает мир.',
    ].join('\n')).setY(270);
    const mkB = (x, label, fn) => {
      const t = this.add.text(x, 420, label, { fontFamily: D, fontSize: '23px', color: '#cfe8dc', fontStyle: '700', backgroundColor: 'rgba(20,48,41,0.9)', padding: { x: 18, y: 8 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffd47a')); t.on('pointerout', () => t.setColor('#cfe8dc')); t.on('pointerdown', fn);
      return t;
    };
    const online = !!this.gs.online;
    const contL = Touch.enabled ? 'Продолжить' : 'Продолжить (Esc)';
    const labels = online ? [[contL, () => this.gs.togglePause()], ['Настройки', () => this.openSettings()], ['В главное меню', () => this.restart()]]
      : [[contL, () => this.gs.togglePause()], ['Заново', () => this.retry()], ['Настройки', () => this.openSettings()], ['В главное меню', () => this.restart()]];
    const pbtns = labels.map(([l, fn]) => mkB(0, l, fn));
    const gap = 18, total = pbtns.reduce((s, b) => s + b.width, 0) + gap * (pbtns.length - 1);
    let px = VW / 2 - total / 2; for (const b of pbtns) { b.setX(px + b.width / 2); px += b.width + gap; }
    this.pause.add([pb, pt, pc, ...pbtns]);
    this.win = this.add.container(0, 0).setVisible(false);
    // «вид сверху» для фазы Миши
    this.tdG = this.add.graphics();
    this.tdTags = [0, 1].map(() => this.add.text(0, 0, '', { fontFamily: F, fontSize: '11px', fontStyle: '700', color: '#f4efe0' }).setOrigin(0.5).setVisible(false));
    this.tdSay = this.add.text(0, 0, '', { fontFamily: F, fontSize: '17px', fontStyle: '700', color: '#1a1410', backgroundColor: '#f4efe0', padding: { x: 9, y: 5 } }).setOrigin(0.5, 1).setVisible(false);
    this.tdInfo = this.add.text(VW / 2, 92, '', { fontFamily: F, fontSize: '14px', color: '#ffd47a' }).setOrigin(0.5);
    this.tdTitle = this.add.text(VW / 2, 66, 'ПРОПУСТИТЕ!', { fontFamily: D, fontSize: '30px', fontStyle: '700', color: '#e8e2cf' }).setOrigin(0.5);
    this.tdLayer = this.add.container(0, 0, [this.tdG, ...this.tdTags, this.tdSay, this.tdInfo, this.tdTitle]).setVisible(false);
    this.children.sendToBack(this.tdLayer); // под всем интерфейсом: здоровье, подсказки, пауза видны поверх
    this.t = 0;
    this.input.keyboard.on('keydown-ENTER', () => { if (this.gs.won) this.winEnter(); });
    this.input.keyboard.on('keydown-SPACE', () => { if (this.gs.won) this.winEnter(); });
    this.input.keyboard.on('keydown-R', () => { if (this.gs.won && !this.gs.online) this.retry(); });
    this.ready = true;
  }
  winEnter() { this.restart(); }
  restart() { this.ready = false; Net.onClose = null; Net.close(); this.scene.stop('bg'); this.scene.stop('game'); this.scene.start('menu'); }
  openSettings() { this.pause.setVisible(false); Settings.show(() => { if (this.ready) this.pause.setVisible(true); }); }
  tdShow(on) {
    if (!this.ready) return;
    this.tweens.killTweensOf(this.tdLayer);
    if (on) { this.tdLayer.setVisible(true).setAlpha(0); this.tweens.add({ targets: this.tdLayer, alpha: 1, duration: 450, delay: 450 }); }
    else this.tweens.add({ targets: this.tdLayer, alpha: 0, duration: 300, onComplete: () => this.tdLayer.setVisible(false) });
  }
  drawTD() {
    const gs = this.gs, td = gs.td, g = this.tdG; g.clear();
    if (!td) { this.tdSay.setVisible(false); this.tdTags.forEach((t) => t.setVisible(false)); return; }
    const G = gs.tdGeo(), now = this.t;
    // пол и стены
    g.fillStyle(0x0b1512, 1); g.fillRect(0, 0, VW, VH);
    g.fillStyle(0x2a2620, 1); g.fillRect(G.x0, G.lanes[0].y0, G.x1 - G.x0, G.lanes[2].y1 - G.lanes[0].y0);
    G.lanes.forEach((ln, i) => {
      for (let x = G.x0; x < G.x1; x += 32) { g.fillStyle((x / 32 + i) % 2 ? 0x312c25 : 0x2a2620, 1); g.fillRect(x, ln.y0, 32, ln.y1 - ln.y0); }
      if (i === td.lane && (td.state === 'tele' || td.state === 'walk' || td.state === 'feint')) { g.fillStyle(0xff6a4a, td.state === 'tele' ? 0.18 + Math.sin(now * 14) * 0.08 : td.state === 'feint' ? 0.3 + Math.sin(now * 26) * 0.12 : 0.07); g.fillRect(G.x0, ln.y0, G.x1 - G.x0, ln.y1 - ln.y0); }
    });
    for (const w of G.walls) { g.fillStyle(0x5a6a62, 1); g.fillRect(w.x, w.y, w.w, w.h); g.fillStyle(0x7f9087, 1); g.fillRect(w.x, w.y, w.w, 3); }
    // старт и выход
    g.fillStyle(0x67ad62, 0.25); g.fillRect(G.x0, G.lanes[0].y0, 40, G.lanes[2].y1 - G.lanes[0].y0);
    g.fillStyle(0xd23a2a, 0.35 + Math.sin(now * 4) * 0.1); g.fillRect(G.x1 - 14, G.lanes[0].y0, 14, G.lanes[2].y1 - G.lanes[0].y0);
    // Миша сверху: рука скользит по стене коридора
    const ln = G.lanes[td.lane], my = (ln.y0 + ln.y1) / 2 + 10, mx = td.mx;
    const showM = td.state !== 'intro' && td.state !== 'win';
    if (showM) {
      g.lineStyle(2, 0x9aa39f, 0.5); for (let k = 0; k < 6; k++) { const sx = mx - 20 - k * 14; if (sx > G.x0) g.lineBetween(sx, ln.y0 + 2, sx - 8, ln.y0 + 6); }
      g.lineStyle(7, 0x4f5b78, 1); g.lineBetween(mx + 6, my - 10, mx + 14, ln.y0 + 4);
      g.fillStyle(0x7c86a0, 1); g.fillCircle(mx + 14, ln.y0 + 5, 5);
      g.fillStyle(0xe08a2c, 1); g.fillRoundedRect(mx - 34, my - 14, 18, 28, 5);
      g.fillStyle(0x4f5b78, 1); g.fillCircle(mx, my, 20);
      g.fillStyle(0xc8463c, 1); g.fillCircle(mx + 2, my, 11); g.fillRect(mx - 14, my - 4, 8, 8);
      if (td.state === 'blocked') { g.fillStyle(0xffe3a3, 0.9); for (let k = 0; k < 4; k++) g.fillCircle(mx + Math.cos(now * 6 + k * 1.6) * 26, my + Math.sin(now * 6 + k * 1.6) * 26, 2.5); }
    }
    // игроки сверху
    gs.players.forEach((p, i) => {
      if (p.tdx == null) return;
      g.fillStyle(0x000000, 0.35); g.fillEllipse(p.tdx + 2, p.tdy + 4, 26, 18);
      g.fillStyle(p.pal.cloak, 1); g.fillCircle(p.tdx, p.tdy, 12);
      g.fillStyle(MASK, 1); g.fillCircle(p.tdx + p.face * 3, p.tdy - 1, 6.5);
      g.lineStyle(1.6, MASK, 1); g.lineBetween(p.tdx - 3, p.tdy - 6, p.tdx - 9, p.tdy - 14); g.lineBetween(p.tdx + 3, p.tdy - 6, p.tdx + 6, p.tdy - 15);
      const tag = this.tdTags[i]; tag.setText(p.pal.tag).setPosition(p.tdx, p.tdy + 20).setVisible(true);
    });
    const say = td.sayT > 0 && td.say && showM;
    this.tdSay.setVisible(!!say); if (say) this.tdSay.setText(td.say).setPosition(clamp(mx, 140, VW - 140), ln.y0 - 20);
    this.tdInfo.setText(`Не пропусти Мишу! Встань у него на пути в подсвеченном коридоре.   Остановлено: ${td.blocks} из ${td.need}`);
  }
  retry() { const d = { ...this.gs.startData }; this.ready = false; this.scene.stop('bg'); this.scene.start('game', d); }
  removePlayer(i) { if (this.names[i]) this.names[i].setVisible(false); }
  showPause(on) { if (this.ready) this.pause.setVisible(on); }
  // очередь подсказок: каждая висит, пока её можно спокойно дочитать, новые не перебивают старые
  toast(msg, hold) {
    if (!this.ready) return;
    if (!msg) { this.toastQ = []; this.toastBusy = false; this.tweens.killTweensOf(this.toastTxt); this.toastTxt.setAlpha(0); return; }
    this.toastQ = this.toastQ || [];
    if (this.toastQ.some((q) => q.msg === msg) || (this.toastBusy && this.toastCur === msg)) return;
    this.toastQ.push({ msg, hold });
    if (this.toastQ.length > 3) this.toastQ.shift();
    if (!this.toastBusy) this.nextToast();
  }
  nextToast() {
    const q = (this.toastQ || []).shift();
    if (!q) { this.toastBusy = false; this.toastCur = ''; return; }
    this.toastBusy = true; this.toastCur = q.msg;
    const ms = (q.hold || clamp(2.2 + q.msg.length * 0.05, 3, 6)) * 1000 * (this.toastQ.length ? 0.8 : 1);
    this.tweens.killTweensOf(this.toastTxt);
    this.toastTxt.setText(q.msg).setAlpha(0);
    this.tweens.add({ targets: this.toastTxt, alpha: 1, duration: 180 });
    this.tweens.add({ targets: this.toastTxt, alpha: 0, delay: ms, duration: 450, onComplete: () => this.nextToast() });
  }
  areaTitle(name) {
    if (!this.ready) return;
    this.area.setText(name); this.areaSub.setText(this.gs.L.region || 'Мшистая Глубь');
    this.tweens.killTweensOf([this.area, this.areaSub]);
    this.area.setAlpha(0); this.areaSub.setAlpha(0);
    this.tweens.add({ targets: [this.area, this.areaSub], alpha: 1, duration: 700, yoyo: true, hold: 1800 });
  }
  bossBar(on, name, frac) { if (!this.ready) return; this.bossOn = on; if (name) this.bossName.setText(name); if (frac != null) this.bossFrac = frac; else if (on) this.bossFrac = 1; this.bossName.setAlpha(on ? 1 : 0); }
  victory(s) {
    const D = '"Cormorant SC", Georgia, serif', F = '"Fira Sans", sans-serif';
    const bg = this.add.graphics(); bg.fillStyle(0x030807, 0.88); bg.fillRect(0, 0, VW, VH);
    const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60).toString().padStart(2, '0');
    const t1 = this.add.text(VW / 2, 160, s.title || 'Глава I пройдена', { fontFamily: D, fontSize: '56px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5).setShadow(0, 0, '#9ff0c8', 16, false, true);
    const lines = s.bag != null ? `Время боя: ${m}:${sec}\nДымовух в рюкзаке: ${s.bag}\nОбрывов нити: ${s.deaths}\nТкачей: ${s.players}`
      : s.hits != null ? `Время боя: ${m}:${sec}\nУдаров иглой: ${s.hits}\nОбрывов нити: ${s.deaths}\nТкачей: ${s.players}`
      : `Время: ${m}:${sec}\nБусин собрано: ${s.beads}\nОбрывов нити: ${s.deaths}\nТкачей: ${s.players}`;
    const t2 = this.add.text(VW / 2, 260, lines, { fontFamily: F, fontSize: '18px', color: '#b9d4c8', align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0);
    const t3 = this.add.text(VW / 2, 440, this.gs.online ? 'Enter — в главное меню' : 'Enter — в главное меню   ·   R — ещё раз', { fontFamily: F, fontSize: '15px', color: '#ffe3a3' }).setOrigin(0.5);
    Touch.show(false);
    const btn = (x, label, fn) => {
      const t = this.add.text(x, 392, label, { fontFamily: D, fontSize: '26px', color: '#cfe8dc', fontStyle: '700', backgroundColor: 'rgba(20,48,41,0.9)', padding: { x: 16, y: 7 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffd47a')); t.on('pointerout', () => t.setColor('#cfe8dc')); t.on('pointerdown', fn);
      return t;
    };
    const extra = this.gs.online ? [btn(VW / 2, 'В главное меню', () => this.restart())]
      : [btn(VW / 2 - 130, 'В главное меню', () => this.restart()), btn(VW / 2 + 130, 'Ещё раз', () => this.retry())];
    if (Touch.enabled) t3.setVisible(false);
    this.win.add([bg, t1, t2, t3, ...extra]); this.win.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.win, alpha: 1, duration: 900 });
  }
  update(time, delta) {
    this.t += delta / 1000;
    if (this.tdLayer && this.tdLayer.visible) this.drawTD();
    const g = this.hud; g.clear();
    const gs = this.gs; if (!gs.players) return;
    gs.players.forEach((p, i) => {
      const left = i === 0, sx = left ? 40 : VW - 40, dir = left ? 1 : -1;
      // катушка нити
      const full = p.silk >= P.SILK;
      g.fillStyle(0x0b1714, 0.85); g.fillCircle(sx, 38, 22);
      g.lineStyle(2, 0x3c5a50, 1); g.strokeCircle(sx, 38, 22);
      if (p.silk > 0) {
        g.fillStyle(p.pal.cloak, full ? 0.9 + Math.sin(this.t * 6) * 0.1 : 0.85);
        g.beginPath(); g.moveTo(sx, 38); g.arc(sx, 38, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.silk / P.SILK), false); g.closePath(); g.fillPath();
      }
      g.fillStyle(MASK, 1); g.fillEllipse(sx, 38, 13, 12); g.fillStyle(INK, 1); g.fillEllipse(sx + 1, 39, 2.4, 4.5); g.fillEllipse(sx + 4, 39, 2.4, 4.5);
      if (full) { g.lineStyle(2, p.pal.accent, 0.5 + Math.sin(this.t * 6) * 0.4); g.strokeCircle(sx, 38, 26); }
      // бутоны здоровья
      for (let k = 0; k < p.maxHp; k++) {
        const hx = sx + dir * (40 + k * 20), hy = 54;
        if (k < p.hp) { g.fillStyle(MASK, 1); g.fillEllipse(hx, hy, 12, 16); g.fillStyle(p.pal.cloak, 1); g.fillTriangle(hx - 4, hy - 6, hx + 4, hy - 6, hx, hy - 11); }
        else { g.lineStyle(1.5, 0x4a5a52, 1); g.strokeEllipse(hx, hy, 12, 16); }
      }
      this.names[i].setText(p.downed ? `${p.pal.name} · в коконе` : p.pal.name);
      // дымовухи
      if (gs.L.crates) for (let k = 0; k < 3; k++) {
        const bx = sx + dir * (40 + k * 18), by = 78;
        if (k < p.bombs) { g.fillStyle(0x3a3f45, 1); g.fillCircle(bx, by, 6); g.fillStyle(0xffd47a, 1); g.fillCircle(bx + 3, by - 7, 2); }
        else { g.lineStyle(1.5, 0x4a5a52, 1); g.strokeCircle(bx, by, 6); }
      }
    });
    // последний бутон — края экрана пульсируют красным
    const me = gs.players[gs.online ? gs.localIdx : 0];
    if (me && !me.downed && me.hp === 1 && !gs.won) {
      const a = 0.18 + Math.sin(this.t * 5) * 0.1;
      for (let i = 0; i < 6; i++) { g.lineStyle(14 - i * 2, 0xd23a2a, a * (1 - i / 6)); g.strokeRect(i * 7, i * 7, VW - i * 14, VH - i * 14); }
    }
    // бусины
    g.fillStyle(0xffd47a, 0.25); g.fillCircle(26, VH - 24, 10); g.fillStyle(0xffe3a3, 1); g.fillCircle(26, VH - 24, 5);
    this.beadTxt.setText(String(gs.beads));
    if (gs.online) this.netTxt.setText(`по сети · комната ${Net.code || ''}${gs.ping != null ? ' · пинг ' + gs.ping + ' мс' : ''}`);
    else this.netTxt.setText('');
    // полоса босса
    if (this.bossOn) {
      this.bossShown += (this.bossFrac - this.bossShown) * Math.min(1, delta / 120);
      const w = 420, x = VW / 2 - w / 2, y = VH - 36;
      g.fillStyle(0x0b1714, 0.9); g.fillRect(x - 3, y - 3, w + 6, 14);
      g.fillStyle(0x6b2a22, 1); g.fillRect(x, y, w * this.bossShown, 8);
      g.fillStyle(0xff9a3c, 1); g.fillRect(x, y, w * this.bossFrac, 8);
      g.fillStyle(0xf4efe0, 0.85); g.fillRect(x + w / 2 - 1, y - 4, 2, 16);
    }
  }
}

// ---------- ЗАПУСК ----------
function startGame() {
  const el = document.getElementById('boot'); if (el) el.remove();
  VW = computeVW();
  window.__game = new Phaser.Game({
    type: new URLSearchParams(location.search).get('canvas') ? Phaser.CANVAS : Phaser.AUTO, parent: 'game', width: VW, height: VH, backgroundColor: '#070d0c',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
    input: { gamepad: true }, render: { antialias: true },
    scene: [MenuScene, BGScene, GameScene, UIScene],
  });
  // после поворота мобильные браузеры сообщают размер с опозданием — пересчитываем несколько раз
  const refit = () => {
    try {
      Layout.apply(); window.scrollTo(0, 0);
      const game = window.__game, menu = game.scene.getScene('menu');
      // в меню после поворота подгоняем ширину поля заново (в бою не трогаем — всё уже расставлено)
      if (menu && menu.sys.isActive() && !menu.leaving) {
        const nv = computeVW();
        if (Math.abs(nv - VW) >= 6) { VW = nv; game.scale.setGameSize(VW, VH); menu.scene.restart(); }
      }
      game.scale.refresh();
    } catch (_) { }
  };
  const later = () => { refit(); setTimeout(refit, 120); setTimeout(refit, 400); setTimeout(refit, 900); };
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
  document.addEventListener('fullscreenchange', later);
}
