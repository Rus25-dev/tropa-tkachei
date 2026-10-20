// ===== КАРТА И БЫСТРЫЕ ПЕРЕХОДЫ: клавиша M / кнопка на телефоне, открытые участки, телепорт между скамьями =====
// Карта заполняется по мере прохождения (клетки 4×4 вокруг героев). Посещённые клетки и скамьи лежат в
// Settings.progress().map[глава] рядом с остальным прогрессом. Телепорт: только с сидячей позиции на скамье,
// только вне боя с боссом; по сети переносится лишь свой герой, остальное доносит событие 'bench'.
const MapTravel = {
  CH: 4, open: false, busy: false, ownPause: false, sel: -1,
  key(gs) { return gs.camp && gs.camp.st !== 'arena' ? String(gs.camp.ch) : null; },
  persistent(gs) { return !!(gs.camp && this.key(gs) && Campaign.canSave(gs)); },
  cid(cx, cy) { return cy * 1000 + cx; },
  revealed(gs, tx, ty) { return gs.mapV.has(this.cid(Math.floor(tx / this.CH), Math.floor(ty / this.CH))); },
  load(gs) {
    gs.mapV = new Set(); gs.mapB = new Set(); gs.mapDirty = false; gs.mapSaveT = 0;
    if (!this.persistent(gs)) return;
    const p = Settings.progress(), m = p && p.map && p.map[this.key(gs)]; if (!m) return;
    for (const v of m.v || []) if (Number.isInteger(v)) gs.mapV.add(v);
    for (const b of m.b || []) if (gs.benches[b]) gs.mapB.add(b);
  },
  exportMap(gs) {
    const p = Settings.progress(), all = { ...((p && p.map) || {}) };
    if (this.persistent(gs) && gs.mapV) all[this.key(gs)] = { v: [...gs.mapV], b: [...gs.mapB] };
    return all;
  },
  persist(gs) {
    gs.mapDirty = false;
    if (!this.persistent(gs)) return;
    const p = Settings.progress(); if (!p) return; // сохранения ещё нет: карта уйдёт с первой скамьёй
    Settings.saveProgress({ ...p, map: this.exportMap(gs) });
  },
  // каждый шаг: открываем клетки вокруг героев, отмечаем скамьи
  visit(gs, dt) {
    if (!gs.mapV || !gs.players) return;
    for (const p of gs.players) {
      if (p.downed) continue;
      const tx = Math.floor((p.x + 7) / T), ty = Math.floor((p.y + 13) / T), C = this.CH;
      for (let cy = Math.floor((ty - 5) / C); cy <= Math.floor((ty + 5) / C); cy++) for (let cx = Math.floor((tx - 6) / C); cx <= Math.floor((tx + 6) / C); cx++) {
        if (cx < 0 || cy < 0 || cx * C >= gs.L.W || cy * C >= gs.L.H) continue;
        const id = this.cid(cx, cy); if (!gs.mapV.has(id)) { gs.mapV.add(id); gs.mapDirty = true; }
      }
      if (p.sit) { const bi = this.benchOf(gs, p); if (bi >= 0 && !gs.mapB.has(bi)) { gs.mapB.add(bi); gs.mapDirty = true; this.persist(gs); } }
    }
    if (gs.mapDirty) { gs.mapSaveT += dt; if (gs.mapSaveT > 3) { gs.mapSaveT = 0; this.persist(gs); } }
  },
  benchOf(gs, p) {
    let best = -1, bd = 40;
    gs.benches.forEach((b, i) => { const d = Math.abs(p.x + 7 - b.x) + Math.abs(p.y + 26 - b.y); if (d < bd) { bd = d; best = i; } });
    return best;
  },
  area(gs, b) { const L = gs.L; return L.areas.reduce((a, ar) => (b.x / T >= ar.x ? ar : a), L.areas[0]); },
  // идёт ли бой с боссом (телепорт тогда запрещён)
  fighting(gs) {
    if (gs.td || gs.fightOn) return true;
    if (gs.gates && gs.gates[0] && gs.gates[0].closed) return true;
    for (const b of [gs.boss, gs.misha, gs.vladik, gs.tima]) if (b && !['sleep', 'gone', 'dead', 'intro'].includes(b.state) && !gs.bossDead) return true;
    return false;
  },
  sitter(gs) { return gs.players.find((p) => !p.remote && p.sit && !p.downed) || null; },
  visited(gs) { return [...gs.mapB].filter((i) => gs.benches[i]).sort((a, b) => gs.benches[a].x - gs.benches[b].x); },
  // можно ли сейчас телепортироваться на выбранную скамью; why — причина отказа
  can(gs) {
    if (this.fighting(gs)) return { ok: false, why: 'Во время боя с боссом телепорт недоступен' };
    const s = this.sitter(gs);
    if (!s) return { ok: false, why: Touch.enabled ? 'Телепорт: сядьте на скамью (стик вверх у скамьи)' : 'Телепорт: сядьте на скамью (↑ у скамьи)' };
    if (this.sel < 0 || !gs.mapB.has(this.sel)) return { ok: false, why: 'Выберите посещённую скамью' };
    if (this.benchOf(gs, s) === this.sel) return { ok: false, why: 'Вы уже у этой скамьи' };
    return { ok: true, why: '' };
  },
  allowM(gs) { return gs.nPlayers === 1 || !!gs.online; },
  canOpen(gs) {
    const u = gs.ui();
    return !!(gs.mapV && u && u.ready && !this.open && !this.busy && !gs.won && !gs.wiping && !gs.shopOpen && !gs.paused && !Settings.open && !(u.pause && u.pause.visible));
  },
  toggle(gs) { if (this.open) this.close(gs); else this.show(gs); },
  show(gs) {
    if (!this.canOpen(gs)) return;
    const s = this.sitter(gs), v = this.visited(gs);
    this.sel = s && this.benchOf(gs, s) >= 0 ? this.benchOf(gs, s) : -1;
    if (this.sel < 0 && v.length) { const p = gs.players.find((q) => !q.remote) || gs.players[0]; this.sel = v.reduce((a, i) => (Math.abs(gs.benches[i].x - p.x) < Math.abs(gs.benches[a].x - p.x) ? i : a), v[0]); }
    this.open = true;
    if (!gs.online) { gs.paused = true; this.ownPause = true; }
    Touch.show(false); Snd.play('bead');
    gs.ui().mapShow();
  },
  close(gs) {
    if (!this.open) return;
    this.open = false;
    if (this.ownPause) { gs.paused = false; this.ownPause = false; }
    gs.ui().mapHide();
    if (!this.busy) Touch.show(true, { bombs: !!gs.L.crates });
  },
  move(gs, d) {
    const v = this.visited(gs); if (!v.length) return;
    const i = v.indexOf(this.sel);
    this.sel = v[i < 0 ? (d > 0 ? 0 : v.length - 1) : (i + d + v.length) % v.length];
    Snd.play('bead'); gs.ui().mapRefresh();
  },
  // телепорт на выбранную скамью: затемнение → перенос → появление
  go(gs) {
    const c = this.can(gs);
    if (!c.ok) { gs.ui().toast(c.why); Snd.play('hit'); return; }
    const bi = this.sel, b = gs.benches[bi];
    this.busy = true; this.open = false; gs.ui().mapHide();
    if (!gs.online) { gs.paused = true; this.ownPause = false; } // на время затемнения мир стоит
    Snd.play('bench');
    gs.cameras.main.fadeOut(350, 3, 8, 7); gs.ui().cameras.main.fadeOut(350, 3, 8, 7);
    gs.after(0.42, () => {
      if (!gs.players) return;
      for (const p of gs.players) {
        if (p.remote) continue;
        Object.assign(p, { x: b.x - 7 + p.i * 22, y: b.y - 26, vx: 0, vy: 0, kbx: 0, dashT: 0, atkT: 0, healCh: 0, healT: 0, hurtT: 0, inv: 1, sit: true, onGround: true });
        p.safeX = p.x; p.safeY = p.y;
      }
      gs.respawn = { x: b.x, y: b.y };
      gs.camX = b.x; gs.camY = b.y - 80; gs.cameras.main.centerOn(gs.camX, gs.camY);
      gs.sendEv({ k: 'bench', x: b.x, y: b.y });
      gs.mapB.add(bi); gs.mapDirty = true;
      const ar = this.area(gs, b);
      if (gs.mode === 'story' && gs.online !== 'guest') Campaign.save(gs, { bench: bi, name: Campaign.saveName(gs, ar.name) });
      gs.cameras.main.fadeIn(500, 3, 8, 7); gs.ui().cameras.main.fadeIn(500, 3, 8, 7);
      gs.ui().toast(`Быстрый переход: ${ar.name}`);
      if (!gs.online) gs.paused = false;
      this.busy = false; Touch.show(true, { bombs: !!gs.L.crates });
    });
  },
  onKey(gs, e) {
    const k = e.code;
    if (!this.open) {
      if (e.repeat) return;
      if (k === 'Tab' || (k === 'KeyM' && this.allowM(gs))) { e.preventDefault(); this.show(gs); }
      return;
    }
    if (k === 'Tab' || (k === 'KeyM' && this.allowM(gs)) || k === 'KeyQ' || k === 'KeyE') { e.preventDefault(); this.close(gs); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'KeyA' || k === 'KeyW') this.move(gs, -1);
    else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'KeyD' || k === 'KeyS') this.move(gs, 1);
    else if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space' || k === 'KeyF') this.go(gs);
  },
  tick(gs) {
    const ui = gs.ui();
    if (this.open) {
      const p = gs.players.find((q) => !q.remote);
      // по сети мир идёт: при ударе, обрыве нити или победе карту закрываем
      if (gs.won || gs.wiping || (p && (p.downed || p.hurtT > 0))) { this.close(gs); return; }
      const pads = gs.input.gamepad ? gs.input.gamepad.gamepads.filter(Boolean) : [];
      let l = false, r = false, ok = false, back = false;
      for (const pad of pads) { const b = (n) => !!(pad.buttons[n] && pad.buttons[n].pressed); l = l || pad.left || pad.up; r = r || pad.right || pad.down; ok = ok || b(0); back = back || b(1) || b(8); }
      const prev = gs._mapPad || {}; gs._mapPad = { l, r, ok, back };
      if (l && !prev.l) this.move(gs, -1);
      if (r && !prev.r) this.move(gs, 1);
      if (ok && !prev.ok) this.go(gs);
      if (back && !prev.back) this.close(gs);
      if (this.open) ui.mapDynamic();
    } else if (gs._mapPad) gs._mapPad = null;
  },
};

// ----- хуки в GameScene -----
{
  const G = GameScene.prototype, createO = G.create, stepO = G.step, updO = G.update, rawO = G.rawInput, tapO = G.onKeyTap, touchO = G.onTouchTap, pauseO = G.togglePause;
  const frozen = () => MapTravel.open || MapTravel.busy;
  G.create = function () {
    createO.call(this);
    MapTravel.open = false; MapTravel.busy = false; MapTravel.ownPause = false; MapTravel.sel = -1;
    MapTravel.load(this);
    this.input.keyboard.on('keydown', (e) => MapTravel.onKey(this, e));
    if (Touch.enabled && Touch.root) {
      let b = Touch.root.querySelector('#t-map');
      if (!b) { b = document.createElement('button'); b.id = 't-map'; b.className = 't-map'; b.type = 'button'; b.setAttribute('aria-label', 'Карта'); b.textContent = '▤'; Touch.root.appendChild(b); }
      b.onclick = () => { const gs = Touch.game(); if (gs) MapTravel.toggle(gs); };
    }
  };
  G.step = function (dt) { stepO.call(this, dt); MapTravel.visit(this, dt); };
  G.update = function (t, d) { MapTravel.tick(this); return updO.call(this, t, d); };
  G.rawInput = function (i) {
    if (frozen()) return { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false };
    return rawO.call(this, i);
  };
  G.onKeyTap = function (e) { if (!frozen()) tapO.call(this, e); };
  G.onTouchTap = function (act) { if (!frozen()) touchO.call(this, act); };
  G.togglePause = function () { if (MapTravel.open) { MapTravel.close(this); return; } if (MapTravel.busy) return; pauseO.call(this); };

  // прогресс карты не теряется ни при обычном сохранении у скамьи, ни при переходе на новую главу
  const saveO = Campaign.save, decO = Campaign.decorate;
  Campaign.save = function (gs, extra) { return saveO.call(this, gs, { map: MapTravel.exportMap(gs), ...extra }); };
  Campaign.decorate = function (gs, s) {
    const old = Settings.progress(), map = old && old.map;
    decO.call(this, gs, s);
    const now = Settings.progress();
    if (map && now && !now.map) Settings.saveProgress({ ...now, map });
  };
}

// ----- оверлей карты в UIScene -----
{
  const createO = UIScene.prototype.create;
  UIScene.prototype.create = function () {
    createO.call(this);
    this.mapC = null;
    const hint = Touch.enabled ? 'Кнопка ▤ рядом с паузой — карта' : 'M (вдвоём за одним экраном — Tab) — карта и быстрые переходы между скамьями';
    this.pause.add(this.mapHint = this.add.text(VW / 2, VH - 26, hint, { fontFamily: '"Fira Sans", sans-serif', fontSize: '13px', color: '#6f9586' }).setOrigin(0.5));
  };
}
Object.assign(UIScene.prototype, {
  mapBuild() {
    const D = '"Cormorant SC", Georgia, serif', F = '"Fira Sans", sans-serif', c = this.add.container(0, 0).setVisible(false).setDepth(48);
    const bg = this.add.graphics(); bg.fillStyle(0x030807, 0.92); bg.fillRect(0, 0, VW, VH);
    bg.fillStyle(0x0b1714, 0.97); bg.fillRoundedRect(20, 20, VW - 40, VH - 40, 10); bg.lineStyle(2, 0x3c5a50, 1); bg.strokeRoundedRect(20, 20, VW - 40, VH - 40, 10);
    const catcher = this.add.rectangle(VW / 2, VH / 2, VW, VH, 0xffffff, 0.001).setInteractive();
    catcher.on('pointerdown', (p) => this.mapTap(p.x, p.y));
    this.mapStatic = this.add.graphics(); this.mapDyn = this.add.graphics();
    this.mapTitle = this.add.text(VW / 2, 46, '', { fontFamily: D, fontSize: '32px', color: '#e8e2cf', fontStyle: '700' }).setOrigin(0.5);
    this.mapInfo = this.add.text(VW / 2, 392, '', { fontFamily: F, fontSize: '17px', color: '#ffe3a3', fontStyle: '600' }).setOrigin(0.5);
    this.mapWhy = this.add.text(VW / 2, 418, '', { fontFamily: F, fontSize: '14px', color: '#9ff0c8' }).setOrigin(0.5);
    this.mapLegend = this.add.text(VW / 2, 446, '◆ скамья   ● герой   ◇ нераскрытая способность   ▭ арена босса', { fontFamily: F, fontSize: '12px', color: '#86a89a' }).setOrigin(0.5);
    this.mapKeys = this.add.text(VW / 2, 508, '', { fontFamily: F, fontSize: '12px', color: '#6f9586' }).setOrigin(0.5);
    const btn = (x, label, fn) => {
      const t = this.add.text(x, 476, label, { fontFamily: D, fontSize: '24px', color: '#cfe8dc', fontStyle: '700', backgroundColor: 'rgba(20,48,41,0.9)', padding: { x: 14, y: 5 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn); return t;
    };
    this.mapBtnGo = btn(VW / 2 - 110, 'Телепорт', () => MapTravel.go(this.gs));
    this.mapBtnX = btn(VW / 2 + 110, 'Закрыть', () => MapTravel.close(this.gs));
    this.mapLabels = [];
    c.add([bg, catcher, this.mapStatic, this.mapDyn, this.mapTitle, this.mapInfo, this.mapWhy, this.mapLegend, this.mapKeys, this.mapBtnGo, this.mapBtnX]);
    this.mapC = c;
  },
  mapGeo() {
    const L = this.gs.L, aw = 860, ah = 290, s = Math.min(aw / L.W, ah / L.H, 10);
    return { s, ox: (VW - L.W * s) / 2, oy: 86 + (ah - L.H * s) / 2 };
  },
  mapShow() {
    if (!this.ready) return;
    if (!this.mapC || !this.mapC.scene) this.mapBuild();
    this.mapTitle.setText(`Карта · ${this.gs.L.region || 'Мшистая Глубь'}`);
    this.mapKeys.setText(Touch.enabled ? 'Нажмите на скамью, затем «Телепорт»' : '← → ↑ ↓ — выбрать скамью   ·   Enter — телепорт   ·   M / Esc — закрыть   ·   геймпад: A — телепорт, B — закрыть');
    this.mapDrawStatic(); this.mapC.setVisible(true); this.mapRefresh(); this.mapDynamic();
  },
  mapHide() { if (this.mapC) this.mapC.setVisible(false); },
  // неизменяемая часть: открытые клетки уровня и названия посещённых зон
  mapDrawStatic() {
    const gs = this.gs, L = gs.L, grid = gs.grid || L.grid, { s, ox, oy } = this.mapGeo(), g = this.mapStatic; g.clear();
    for (const t of this.mapLabels) t.destroy(); this.mapLabels = [];
    const at = (x, y) => (x < 0 || y < 0 || x >= L.W || y >= L.H ? SOLID : grid[y][x]);
    const cls = (x, y) => {
      if (!MapTravel.revealed(gs, x, y)) return 0;
      const t = grid[y][x];
      if (t === EMPTY) return 1;
      if (t === PLAT) return 3;
      if (t === SPIKE) return 4;
      return at(x - 1, y) !== SOLID || at(x + 1, y) !== SOLID || at(x, y - 1) !== SOLID || at(x, y + 1) !== SOLID ? 2 : 0;
    };
    const col = [0, 0x1d3a31, 0x7fb59f, 0x1d3a31, 0x1d3a31];
    for (let y = 0; y < L.H; y++) {
      let x = 0;
      while (x < L.W) {
        const k = cls(x, y); let x2 = x + 1;
        while (x2 < L.W && cls(x2, y) === k) x2++;
        if (k) {
          g.fillStyle(col[k], k === 1 ? 0.85 : 1); g.fillRect(ox + x * s, oy + y * s, (x2 - x) * s + 0.4, s + 0.4);
          if (k === 3) { g.fillStyle(0xd9c48a, 1); g.fillRect(ox + x * s, oy + y * s, (x2 - x) * s, Math.max(1.2, s * 0.35)); }
          if (k === 4) { g.fillStyle(0xd9715f, 1); g.fillRect(ox + x * s, oy + (y + 0.45) * s, (x2 - x) * s, Math.max(1.2, s * 0.55)); }
        }
        x = x2;
      }
    }
    // зоны, в которых что-то открыто
    L.areas.forEach((a, i) => {
      const x1 = i + 1 < L.areas.length ? L.areas[i + 1].x : L.W;
      let seen = false; for (const id of gs.mapV) { const tx = (id % 1000) * MapTravel.CH; if (tx + MapTravel.CH > a.x && tx < x1) { seen = true; break; } }
      if (!seen) return;
      const t = this.add.text(ox + a.x * s + 3, oy - 6 - (i % 2) * 14, a.name, { fontFamily: '"Fira Sans", sans-serif', fontSize: '12px', color: '#bfe3d3' }).setOrigin(0, 1);
      this.mapC.add(t); this.mapLabels.push(t);
    });
  },
  mapRefresh() {
    const gs = this.gs, sel = MapTravel.sel, c = MapTravel.can(gs), b = gs.benches[sel];
    this.mapInfo.setText(b ? `Скамья: ${MapTravel.area(gs, b).name}` : (gs.mapB.size ? 'Выберите скамью' : 'Вы ещё не отдыхали на скамьях'));
    this.mapWhy.setText(c.ok ? (Touch.enabled ? 'Нажмите «Телепорт»' : 'Enter — телепорт на эту скамью') + (gs.online ? ' (только вы)' : '') : c.why);
    this.mapWhy.setColor(c.ok ? '#9ff0c8' : '#d9a37a');
    this.mapBtnGo.setAlpha(c.ok ? 1 : 0.4);
  },
  // подвижная часть: скамьи, предметы, арена, герои
  mapDynamic() {
    const gs = this.gs, L = gs.L, { s, ox, oy } = this.mapGeo(), g = this.mapDyn, now = this.time.now / 1000; g.clear();
    if ((this._mapStamp = (this._mapStamp || 0) + 1) % 30 === 0) this.mapRefresh();
    const rv = (tx, ty) => MapTravel.revealed(gs, tx, ty);
    // арена босса
    if (L.boss && L.boss.arenaX0 != null) {
      const x0 = L.boss.arenaX0, x1 = L.boss.arenaX1 + 1, y0 = L.gateIn ? L.gateIn.y0 - 6 : L.boss.y - 14, y1 = L.boss.y + 1;
      let seen = false; for (let x = x0; x <= x1 && !seen; x += MapTravel.CH) seen = rv(x, Math.floor(L.boss.y));
      if (seen) { g.lineStyle(2, 0xd9715f, 0.9); g.strokeRect(ox + x0 * s, oy + y0 * s, (x1 - x0) * s, (y1 - y0) * s); }
    } else if (L.road && L.exit) {
      const ex = ox + L.exit.x * s, ey = oy + L.exit.y * s;
      g.fillStyle(0xd9715f, 1); g.fillTriangle(ex + 8, ey - 14, ex + 8, ey - 2, ex - 4, ey - 8);
    }
    // способности, которые ещё не взяты (если участок открыт)
    for (const it of gs.items || []) {
      if (it.got || !rv(it.x, it.y)) continue;
      const x = ox + (it.x + 0.5) * s, y = oy + (it.y + 0.5) * s + Math.sin(now * 3) * 1.2, r = 5;
      g.fillStyle(0xffe3a3, 1); g.fillTriangle(x, y - r - 1, x + r, y, x - r, y); g.fillTriangle(x, y + r + 1, x + r, y, x - r, y);
    }
    // скамьи
    const sitter = MapTravel.sitter(gs), cur = sitter ? MapTravel.benchOf(gs, sitter) : -1;
    gs.benches.forEach((b, i) => {
      const tx = b.x / T, ty = b.y / T - 0.5, x = ox + tx * s, y = oy + ty * s, vis = gs.mapB.has(i);
      if (!vis && !rv(Math.floor(tx), Math.floor(ty))) return;
      if (vis) { g.fillStyle(0xffd47a, 1); g.fillTriangle(x, y - 6, x + 6, y, x, y + 6); g.fillTriangle(x, y - 6, x - 6, y, x, y + 6); }
      else { g.lineStyle(1.5, 0x6f9586, 0.8); g.strokeTriangle(x, y - 5, x + 5, y, x, y + 5); g.strokeTriangle(x, y - 5, x - 5, y, x, y + 5); }
      if (i === cur) { g.lineStyle(1.5, 0x9ff0c8, 1); g.strokeCircle(x, y, 10); }
      if (i === MapTravel.sel) { g.lineStyle(2, 0xffffff, 0.55 + 0.4 * Math.sin(now * 6)); g.strokeCircle(x, y, 13 + Math.sin(now * 6)); }
    });
    // герои
    for (const p of gs.players) {
      const x = ox + (p.x + 7) / T * s, y = oy + (p.y + 13) / T * s, a = p.remote || Math.sin(now * 8) > -0.3 ? 1 : 0.35;
      g.fillStyle(0x030807, 1); g.fillCircle(x, y, 5.5); g.fillStyle(p.pal.accent, a); g.fillCircle(x, y, 4);
    }
  },
  mapTap(px, py) {
    const gs = this.gs, { s, ox, oy } = this.mapGeo();
    let best = -1, bd = 26;
    gs.benches.forEach((b, i) => {
      if (!gs.mapB.has(i)) return;
      const d = Math.hypot(ox + b.x / T * s - px, oy + (b.y / T - 0.5) * s - py); if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    if (best === MapTravel.sel) MapTravel.go(gs); else { MapTravel.sel = best; Snd.play('bead'); this.mapRefresh(); }
  },
});
