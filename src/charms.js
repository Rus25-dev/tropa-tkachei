// ===== ОБЕРЕГИ: 3 слота, предмет занимает 1–2 слота (поле slots) =====
// Эффекты — обёртки вокруг методов GameScene (баланс по умолчанию не меняется: без оберега всё как раньше).
Object.assign(CHARMS, {
  sting: { id: 'sting', name: 'Жало', desc: 'Удары иглы отравляют: 1 урона раз в 1.2 с, 4 раза. Боссов яд берёт вдвое слабее.', unlock: 'boss:misha', slots: 1, col: 0x86e05a },
  ember: { id: 'ember', name: 'Угольная нить', desc: 'Тяжёлый удар (третий в комбо) поджигает врага: 3 тика ожога, огонь перекидывается на соседей.', unlock: 'shop:45', slots: 1, col: 0xff8a3c },
  heart: { id: 'heart', name: 'Паучье сердце', desc: '+1 бутон здоровья. Тяжёлый оберег: занимает два слота.', unlock: 'shop:60', slots: 2, col: 0xff6a7a },
  swift: { id: 'swift', name: 'Быстрая нить', desc: 'Нить копится на 50 % быстрее: каждый второй набор даёт лишнюю единицу.', unlock: 'boss:korn', slots: 1, col: 0x9ff0c8 },
  stride: { id: 'stride', name: 'Тихий шаг', desc: 'Рывок перезаряжается на 25 % быстрее.', unlock: 'shop:40', slots: 1, col: 0xb9d4c8 },
  window: { id: 'window', name: 'Широкое окно', desc: 'Окно отбива шире на 50 % (0.2 → 0.3 с).', unlock: 'boss:vladik', slots: 1, col: 0xffffff },
  thorns: { id: 'thorns', name: 'Колючий плащ', desc: 'Когда враг ранит вас касанием, он получает 1 урона в ответ.', unlock: 'shop:55', slots: 1, col: 0xd9a35a },
  call: { id: 'call', name: 'Зов нити', desc: 'Бусины тянутся к вам издалека (в ~2.5 раза дальше).', unlock: 'shop:30', slots: 1, col: 0xffd47a },
  hunter: { id: 'hunter', name: 'Охотник', desc: '+15 % урона по оглушённым врагам и боссам; казнь даёт вдвое больше нити.', unlock: 'boss:tima', slots: 1, col: 0xe8e2cf },
});

// слоты: список надетых id → сколько слотов занято
Loadout.slotsOf = function (id) { const c = CHARMS[id]; return c ? (c.slots | 0) || 1 : 1; };
Loadout.slotsUsed = function (list) { return list.reduce((s, id) => s + this.slotsOf(id), 0); };
Loadout.canFit = function (list, id) { return this.slotsUsed(list) + this.slotsOf(id) <= CHARM_SLOTS; };
(function () {
  const equip = Loadout.equip, equipped = Loadout.equipped;
  // надеть оберег можно, только если хватает слотов; возвращает false, если не влезло
  Loadout.equip = function (kind, id) {
    if (kind === 'charm') {
      const d = this.data();
      if (!d.charms.includes(id) && !this.canFit(d.charms, id)) return false;
    }
    equip.call(this, kind, id); return true;
  };
  // при чтении тоже укладываемся в слоты (нужно, если реестр поменялся)
  Loadout.equipped = function (sc) {
    const r = equipped.call(this, sc), keep = [];
    for (const c of r.charms) if (this.canFit(keep, c)) keep.push(c);
    r.charms = keep; return r;
  };
})();

(function () {
  const proto = GameScene.prototype, has = (sc, p, id) => !!(p && sc.hasCharm(p, id));

  // ----- Паучье сердце: +1 бутон (поверх масок из лавки) -----
  const applyUp = Campaign.applyUp;
  Campaign.applyUp = function (gs) {
    const prev = (gs.players || []).map((p) => [p.maxHp, p.hp]);
    applyUp.call(this, gs);
    (gs.players || []).forEach((p, i) => {
      if (p.remote || !prev[i]) return;
      const [pm, ph] = prev[i], target = p.maxHp + (gs.hasCharm(p, 'heart') ? 1 : 0);
      p.maxHp = target; p.hp = Math.min(target, ph + Math.max(0, target - pm));
      p.silk = Math.min(p.silk, P.SILK);
    });
  };
  const applyLoadout = proto.applyLoadout;
  proto.applyLoadout = function () {
    const r = applyLoadout.call(this);
    if (this.up) Campaign.applyUp(this); // пересчитать здоровье под обереги
    return r;
  };

  // ----- Быстрая нить: каждый второй набор нити даёт ещё одну единицу -----
  const gainSilk = proto.gainSilk;
  proto.gainSilk = function (p, boss) {
    gainSilk.call(this, p, boss);
    if (p.noSilkGain || !has(this, p, 'swift')) return;
    const gained = !boss || (p.bossHits | 0) % BAL.silkEvery === 0;
    if (!gained) return;
    p._sf = (p._sf || 0) + 0.5;
    if (p._sf >= 1) { p._sf -= 1; if (p.remote) this.sendEv({ k: 'silk', i: p.i }); else p.silk = Math.min(P.SILK, p.silk + 1); }
  };

  // ----- Тихий шаг (рывок) и Широкое окно (отбив) -----
  const stepPlayer = proto.stepPlayer;
  proto.stepPlayer = function (p, dt) {
    if (p.dashCd > 0 && has(this, p, 'stride')) p.dashCd -= dt * 0.25;
    const before = p.parryT || 0;
    const r = stepPlayer.call(this, p, dt);
    if (p.parryT > before && p.parryT >= P.PARRY_T - 1e-6 && has(this, p, 'window')) p.parryT = P.PARRY_T * 1.5;
    return r;
  };

  // ----- Колючий плащ -----
  const hurtPlayer = proto.hurtPlayer;
  proto.hurtPlayer = function (p, dmg, srcX, spike) {
    const hp0 = p.hp, r = hurtPlayer.call(this, p, dmg, srcX, spike);
    if (!spike && srcX != null && p.hp < hp0 && this.auth() && has(this, p, 'thorns')) {
      const px = p.x + 7, py = p.y + 13, near = (o) => Math.abs(o.x + o.w / 2 - srcX) < 1.5 && Math.abs(o.y + o.h / 2 - py) < 60 + o.h / 2 && Math.abs(o.x + o.w / 2 - px) < 60 + o.w / 2;
      const e = this.enemies.find((o) => !o.dead && near(o));
      if (e) {
        e.hp -= 1; e.flash = 0.1; this.burst(8, e.x + e.w / 2, e.y + e.h / 2, 0xd9a35a); this.sfx('clink');
        e.kbT = 0.14; e.kbx = Math.sign(e.x + e.w / 2 - px) * 200; e.kby = -80;
        if (e.hp <= 0) this.killEnemy(e);
      } else {
        const key = Status.BOSS_KEYS.find((k) => { const b = k === 'boss' ? this.boss : this[k]; return b && Status.bossLive(b) && near(b); });
        if (key) { Status.bossDamage(this, key, p, 1); this.burst(8, srcX, py, 0xd9a35a); }
      }
    }
    return r;
  };

  // ----- Зов нити: бусины притягиваются издалека -----
  const stepBeads = proto.stepBeads;
  proto.stepBeads = function (dt) {
    const callers = this.players.filter((p) => !p.remote && !p.downed && has(this, p, 'call'));
    if (callers.length) for (const bd of this.beadsArr) {
      if (bd.dead || bd.t <= 0.35) continue;
      let best = null, bd2 = 220;
      for (const p of callers) { const d = Math.hypot(p.x + 7 - bd.x - 4, p.y + 13 - bd.y - 4); if (d < bd2 && d >= 80) { bd2 = d; best = p; } }
      if (best) { // подтянуть в зону обычного притяжения
        const dx = best.x + 7 - bd.x - 4, dy = best.y + 13 - bd.y - 4, l = Math.hypot(dx, dy) || 1;
        bd.x += (dx / l) * 300 * dt; bd.y += (dy / l) * 300 * dt; bd.vy = Math.min(bd.vy, 0);
      }
    }
    return stepBeads.call(this, dt);
  };

  // ----- Жало, Угольная нить, Охотник: удары по врагам -----
  const meleeHit = (sc, p) => !p.noSilkGain && p.atkT > 0 && !!p.atkHits;
  const damageEnemy = proto.damageEnemy;
  proto.damageEnemy = function (e, p) {
    const hp0 = e.hp, stunned = e.state === 'stun';
    const r = damageEnemy.call(this, e, p);
    if (e.hp < hp0 && !e.dead && this.auth()) {
      if (meleeHit(this, p)) {
        if (has(this, p, 'sting')) Status.apply(this, e, 'poison', null, p);
        if (has(this, p, 'ember') && p.heavy && p.atkDir === 'f') Status.apply(this, e, 'burn', null, p);
      }
      if (stunned && has(this, p, 'hunter')) {
        p._hf = (p._hf || 0) + 0.15;
        if (p._hf >= 1) { p._hf -= 1; e.hp -= 1; if (e.hp <= 0) this.killEnemy(e); }
      }
    }
    return r;
  };
  for (const [fn, key] of [['damageBoss', 'boss'], ['damageVladik', 'vladik'], ['damageTima', 'tima']]) {
    const f = proto[fn]; if (!f) continue;
    proto[fn] = function (p) {
      const b = key === 'boss' ? this.boss : this[key], hp0 = b && b.hp, stag = b && b.stagger > 0;
      const r = f.call(this, p);
      if (b && b.hp < hp0 && b.hp > 0 && this.auth()) {
        if (meleeHit(this, p)) {
          if (has(this, p, 'sting')) Status.apply(this, b, 'poison', null, p);
          if (has(this, p, 'ember') && p.heavy && p.atkDir === 'f') Status.apply(this, b, 'burn', null, p);
        }
        if (stag && has(this, p, 'hunter') && !p.noSilkGain) {
          p._hf = (p._hf || 0) + 0.15;
          if (p._hf >= 1) { p._hf -= 1; Status.bossDamage(this, key, p, 1); }
        }
      }
      return r;
    };
  }
  // Охотник: казнь даёт вдвое больше нити (+3 вместо +3 → +6)
  const execBoss = proto.execBoss;
  proto.execBoss = function (p, kit, dir) {
    const b = kit.key === 'boss' ? this.boss : this[kit.key], was = b && b.executed;
    execBoss.call(this, p, kit, dir);
    if (b && b.executed && !was && has(this, p, 'hunter')) {
      if (p.remote) { for (let i = 0; i < 3; i++) this.sendEv({ k: 'silk', i: p.i }); } else p.silk = Math.min(P.SILK, p.silk + 3);
    }
  };
})();

// ----- сеть: на хосте нужно знать обереги гостя (его удары считает хост) -----
(function () {
  const proto = GameScene.prototype, packPlayer = proto.packPlayer;
  proto.packPlayer = function (p) { const m = packPlayer.call(this, p); if (p.charms && p.charms.length) m.cm = p.charms.join(','); return m; };
})();
