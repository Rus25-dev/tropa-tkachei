// ===== СНАРЯЖЕНИЕ: оружие, инструмент, обереги =====
// Реестры. Новые записи добавляют модули weapons.js, tools.js, charms.js (по одному файлу — меньше конфликтов).
//   WEAPONS[id] = { id, name, desc, reach, thick, atkT, cd, combo, comboWin, finisher, finT, finCd, dmg, onSwing?(sc,p), unlock }
//   TOOLS[id]   = { id, name, desc, cost (нить), cd (сек), use(sc, p) → true, если применён, unlock }
//   CHARMS[id]  = { id, name, desc, unlock }  — эффекты обереги реализуют сами через sc.hasCharm(p, id)
// unlock: 'start' | 'boss:korn|misha|vladik|tima' | 'shop:N' (цена в бусинах, покупается в лавке).
const WEAPONS = {
  needle: { id: 'needle', name: 'Игла', desc: 'Лёгкая и быстрая. Третий удар подряд — тяжёлый.', reach: 1, thick: 1, atkT: 0.12, cd: 0.26, combo: 3, comboWin: 0.6, finisher: true, finT: 0.16, finCd: 0.42, dmg: 1, unlock: 'start' },
};
const TOOLS = {};
const CHARMS = {};
const CHARM_SLOTS = 3;

const Loadout = {
  KEY: 'tt_loadout',
  data() {
    let d = null; try { d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (_) { }
    d = d && typeof d === 'object' ? d : {};
    d.weapon = d.weapon || 'needle'; d.tool = d.tool || ''; d.charms = Array.isArray(d.charms) ? d.charms : [];
    d.have = d.have || { weapons: ['needle'], tools: [], charms: [] };
    for (const k of ['weapons', 'tools', 'charms']) if (!Array.isArray(d.have[k])) d.have[k] = [];
    return d;
  },
  save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (_) { } },
  reg(kind) { return { weapons: WEAPONS, tools: TOOLS, charms: CHARMS }[kind]; },
  // всё доступно в босс-тесте (кроме забегов спидрана — там честное стартовое снаряжение)
  openAll(sc) { return sc && sc.mode === 'bosstest' && !sc.camp && !(sc.sr); },
  owned(kind, id, sc) {
    const e = this.reg(kind)[id]; if (!e) return false;
    return e.unlock === 'start' || this.openAll(sc) || this.data().have[kind].includes(id);
  },
  grant(kind, id) {
    const d = this.data(); if (!this.reg(kind)[id] || d.have[kind].includes(id)) return false;
    d.have[kind].push(id); this.save(d); return true;
  },
  // что надето у игрока
  equipped(sc) {
    if (sc && sc.sr) return { weapon: 'needle', tool: '', charms: [] };
    const d = this.data();
    const weapon = this.owned('weapons', d.weapon, sc) ? d.weapon : 'needle';
    const tool = d.tool && this.owned('tools', d.tool, sc) ? d.tool : '';
    const charms = d.charms.filter((c) => this.owned('charms', c, sc)).slice(0, CHARM_SLOTS);
    return { weapon, tool, charms };
  },
  equip(kind, id) {
    const d = this.data();
    if (kind === 'weapon') d.weapon = id; else if (kind === 'tool') d.tool = id;
    else if (kind === 'charm') { const i = d.charms.indexOf(id); if (i >= 0) d.charms.splice(i, 1); else if (d.charms.length < CHARM_SLOTS) d.charms.push(id); }
    this.save(d);
  },
  // награды за боссов
  onBoss(sc, bossId) {
    const got = [];
    for (const kind of ['weapons', 'tools', 'charms']) for (const id in this.reg(kind)) {
      const e = this.reg(kind)[id];
      if (e.unlock === 'boss:' + bossId && this.grant(kind, id)) got.push(e.name);
    }
    if (got.length && sc.ui) sc.ui().toast('Получено: ' + got.join(', ') + ' — выбрать на скамье', 5);
  },
};

Object.assign(GameScene.prototype, {
  wdef(p) { return WEAPONS[p.weaponId] || WEAPONS.needle; },
  hasCharm(p, id) { return !!(p.charms && p.charms.includes(id)); },
  // надеть сохранённое снаряжение на локальных героев (удалённых игроков настраивает сеть)
  applyLoadout() {
    const eq = Loadout.equipped(this);
    for (const p of this.players) {
      if (p.remote) continue;
      p.weaponId = eq.weapon; p.toolId = eq.tool; p.charms = eq.charms.slice(); p.toolCd = 0;
    }
  },
  useTool(p) {
    const T_ = TOOLS[p.toolId]; if (!T_ || p.downed || p.toolCd > 0 || p.hurtT > 0 || p.sit) return false;
    if (p.silk < (T_.cost || 0)) { if (!p.remote) Snd.play('clink'); return false; }
    if (!T_.use(this, p)) return false;
    p.silk -= T_.cost || 0; p.toolCd = T_.cd || 0.5; return true;
  },
});
(function () {
  const proto = GameScene.prototype;
  // таймер перезарядки инструмента
  const stepPlayer = proto.stepPlayer;
  proto.stepPlayer = function (p, dt) { p.toolCd = (p.toolCd || 0) - dt; return stepPlayer.call(this, p, dt); };
  // награды за боссов
  for (const [fn, id] of [['killBoss', 'korn'], ['mishaDie', 'misha'], ['vladikDie', 'vladik'], ['timaDie', 'tima']]) {
    const f = proto[fn]; if (!f) continue;
    proto[fn] = function (...a) { if (!this.sr && this.online !== 'guest') Loadout.onBoss(this, id); return f.apply(this, a); };
  }
})();
