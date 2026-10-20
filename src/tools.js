// ===== ИНСТРУМЕНТЫ: метательная игла, капкан, нитяная бомба, нитяной крюк =====
// Кнопка «Инструмент» (E / RB / ✦) → useTool (loadout.js): списывает нить (cost), ставит перезарядку (cd) и зовёт TOOLS[id].use(sc, p).
// Сеть: инструменты-снаряды считает хост и хранит в this.tl (не в projs: иначе их сбивали бы отбив/всполох и они ранили бы героев);
// в снимок они уходят строками снаряда (NET_KINDS / NET_SIZES), у гостя лежат в this.projs. Удалённый игрок шлёт событие {k:'tool'}.
// Крюк — движение героя, оно у каждого клиента своё: тянет и считает попадание владелец, хосту уходит событие {k:'thook'}.
const TOOL_KIND = { tneedle: [12, 12], ttrap: [26, 10], tbomb: [12, 12] };
for (const k in TOOL_KIND) { if (!NET_KINDS.includes(k)) NET_KINDS.push(k); NET_SIZES[NET_KINDS.indexOf(k)] = TOOL_KIND[k]; }
const TOOL = {
  NEEDLE_SPD: 760, NEEDLE_DMG: 2, NEEDLE_STICK: 3, TRAP_LIFE: 8, TRAP_FREEZE: 2, TRAP_MAX: 2, TRAP_POISE: 3,
  BOMB_R: 90, BOMB_DMG: 3, BOMB_FUSE: 0.9, HOOK_R: 260, HOOK_SPD: 900, HOOK_STUN: 0.6,
};
const BOSS_FNS = [['boss', 'damageBoss'], ['vladik', 'damageVladik'], ['tima', 'damageTima']];
const FLY_TYPES = new Set(['gnat', 'bat', 'lurker']);
const isToolKind = (k) => k === 'tneedle' || k === 'ttrap' || k === 'tbomb';

TOOLS.throwneedle = { id: 'throwneedle', name: 'Метательная игла', desc: 'Летит по прямой (↑ или ↑+→ — вверх и по диагонали), пробивает слабых врагов, втыкается в стену и в босса на 3 с. Урон 2. Подбери — вернёт нить.', cost: 1, cd: 0.5, unlock: 'boss:korn', use: (sc, p) => sc.toolCast('throwneedle', p) };
TOOLS.trap = { id: 'trap', name: 'Капкан', desc: 'Ставится у ног на 8 с. Враг, наступивший на него, замирает на 2 с; босс копит стойку (+3), но не замирает. Не больше двух.', cost: 2, cd: 1.5, unlock: 'shop:50', use: (sc, p) => sc.toolCast('trap', p) };
TOOLS.threadbomb = { id: 'threadbomb', name: 'Нитяная бомба', desc: 'Бросок дугой. Взрыв радиусом 90: урон 3 врагам и боссу, отброс, сбивает снаряды.', cost: 3, cd: 2, unlock: 'shop:70', use: (sc, p) => sc.toolCast('threadbomb', p) };
TOOLS.hook = { id: 'hook', name: 'Нитяной крюк', desc: 'Нить на 260 px в сторону ввода (↑, вперёд, диагональ). В стену или платформу — притянет героя, во врага — подтянет и оглушит мелкого, в оглушённого босса — удар.', cost: 1, cd: 0.9, unlock: 'boss:tima', use: (sc, p) => sc.toolCast('hook', p) };

Object.assign(GameScene.prototype, {
  // направление броска / нити по вводу: ↑ — вверх, ↑ + сторона — диагональ, иначе вперёд
  toolAim(p) {
    const i = p.inp || {}, dir = (i.right ? 1 : 0) - (i.left ? 1 : 0), f = dir || p.face || 1;
    if (i.up) return dir ? { dx: f * 0.7071, dy: -0.7071, f } : { dx: 0, dy: -1, f };
    return { dx: f, dy: 0, f };
  },
  toolCast(id, p) {
    const a = this.toolAim(p);
    if (id === 'hook') { this.hookCast(p, a); return true; }
    const msg = { k: 'tool', id, i: p.i, x: Math.round(p.x + 7), y: Math.round(id === 'trap' ? p.y + 26 : p.y + 13), dx: Math.round(a.dx * 1000) / 1000, dy: Math.round(a.dy * 1000) / 1000, f: a.f };
    Snd.play(id === 'trap' ? 'pickup' : 'throw');
    if (this.auth()) this.toolSpawn(msg); else this.sendEv(msg);
    return true;
  },
  // хост: создать сущность инструмента
  toolSpawn(m) {
    const tl = this.tl || (this.tl = []);
    if (m.id === 'throwneedle') {
      tl.push({ kind: 'tneedle', x: m.x + m.dx * 14 - 6, y: m.y + m.dy * 14 - 6, w: 12, h: 12, vx: m.dx * TOOL.NEEDLE_SPD, vy: m.dy * TOOL.NEEDLE_SPD, st: 0, ft: 0.65, life: 25, owner: m.i, hit: new Set(), ang: Math.atan2(m.dy, m.dx) });
    } else if (m.id === 'trap') {
      const mine = tl.filter((q) => q.kind === 'ttrap' && q.owner === m.i);
      if (mine.length >= TOOL.TRAP_MAX) mine[0].life = 0; // третий капкан заменяет самый старый
      tl.push({ kind: 'ttrap', x: m.x - 13, y: m.y - 10, w: 26, h: 10, vx: 0, vy: 0, life: TOOL.TRAP_LIFE, arm: 0.3, tick: 0, owner: m.i });
      this.burst(6, m.x, m.y - 3, 0xe8d9a8);
    } else if (m.id === 'threadbomb') {
      const up = m.dy < 0, diag = up && m.dx !== 0;
      const vx = up ? (diag ? m.f * 240 : 0) : m.f * 340, vy = up ? (diag ? -520 : -680) : -330;
      tl.push({ kind: 'tbomb', x: m.x + m.f * 8 - 6, y: m.y - 8, w: 12, h: 12, vx, vy, fuse: TOOL.BOMB_FUSE, life: 5, owner: m.i });
    }
  },
  toolOwner(i) { return this.players[i] || this.players[0]; },
  // урон врагу от инструмента (мимо игольного пути: ни нити, ни бонуса острой иглы); false — не засчитан (броня, засадник под землёй)
  toolHurtEnemy(e, n, kdir, pierceArmor) {
    const dummy = { x: e.x + e.w / 2 - kdir * 40, heavy: false, atkDir: 'f', remote: true, face: kdir };
    if (pierceArmor) this._e2burst = true;
    let blocked = false;
    try { blocked = !!(e.e2 && this.e2Blocked(e, dummy)); } finally { if (pierceArmor) this._e2burst = false; }
    if (blocked) return false;
    e.hp -= n; e.flash = 0.1; this.sfx('hit');
    this.burst(8, e.x + e.w / 2, e.y + e.h / 2, 0xf4f1e6);
    e.kbT = 0.2; e.kbx = kdir * (e.type === 'beetle' ? 140 : 280); e.kby = -150;
    if (e.type === 'beetle' && e.state === 'charge') { e.state = 'stun'; e.st = 0.6; }
    if (e.hp <= 0) this.killEnemy(e);
    return true;
  },
  liveBoss(b) { return !!b && !['dead', 'gone', 'sleep', 'intro'].includes(b.state); },
  // урон боссу от инструмента — через те же damageBoss/Vladik/Tima, что и у всполоха (фазы, стойка, оглушение работают)
  toolHurtBoss(b, fn, p, n) {
    p.noSilkGain = true;
    try { for (let i = 0; i < n && this.liveBoss(b); i++) this[fn](p); } finally { p.noSilkGain = false; }
  },
  freezeEnemy(e, t) {
    if (!e || e.dead) return;
    e.frozenT = Math.max(e.frozenT || 0, t); e.kbT = 0; e.flash = 0.12;
    this.burst(8, e.x + e.w / 2, e.y + e.h / 2, 0xffe3a3);
  },
  tfxAdd(f, send) { (this.tfx || (this.tfx = [])).push(f); if (send) this.sendEv({ k: 'tfx', ...f, t: f.t }); },

  // ----- хост: шаг сущностей -----
  stepTools(dt) {
    const tl = this.tl; if (!tl || !tl.length) return;
    const bosses = BOSS_FNS.map(([key, fn]) => [this[key], fn]).filter(([b]) => b);
    for (const q of tl) {
      if (q.dead) continue;
      q.life -= dt; if (q.life <= 0) { q.dead = true; continue; }
      if (q.kind === 'tneedle') this.stepToolNeedle(q, dt, bosses);
      else if (q.kind === 'ttrap') this.stepToolTrap(q, dt, bosses);
      else if (q.kind === 'tbomb') this.stepToolBomb(q, dt, bosses);
    }
    this.tl = tl.filter((q) => !q.dead);
  },
  stepToolNeedle(q, dt, bosses) {
    const owner = this.toolOwner(q.owner);
    if (q.st === 0) { // полёт: два подшага, чтобы не пролетать сквозь тонкие стены
      q.ft -= dt; if (q.ft <= 0) { q.st = 3; q.vx *= 0.2; q.vy = 0; }
      for (let s = 0; s < 2 && q.st === 0; s++) {
        const px = q.x, py = q.y;
        q.x += q.vx * dt / 2; q.y += q.vy * dt / 2;
        const cx = q.x + 6, cy = q.y + 6;
        if (this.isSolid(Math.floor(cx / T), Math.floor(cy / T))) {
          q.x = px; q.y = py; q.st = 1; q.vx = q.vy = 0; q.life = 25;
          this.sfx('clink'); this.burst(5, cx, cy, 0xffe3a3); break;
        }
        for (const e of this.enemies) {
          if (e.dead || q.hit.has(e) || !overlap(q, e)) continue;
          q.hit.add(e);
          const ok = this.toolHurtEnemy(e, TOOL.NEEDLE_DMG, Math.sign(q.vx) || 1, false);
          if (!ok) { q.st = 3; q.vx = -q.vx * 0.15; q.vy = -120; this.sfx('clink'); break; }
          if (!e.dead) { q.st = 3; q.vx = -Math.sign(q.vx) * 40; q.vy = -140; break; } // не пробила — упала; слабых (убитых) пробивает насквозь
        }
        if (q.st !== 0) break;
        for (const [b, fn] of bosses) {
          if (!this.liveBoss(b) || !overlap(q, inset(b, 4))) continue;
          if (b.state === 'rage') { this.sfx('clink'); q.st = 3; q.vx = -q.vx * 0.15; q.vy = -120; break; }
          this.toolHurtBoss(b, fn, owner, TOOL.NEEDLE_DMG);
          q.st = 2; q.boss = b; q.ox = q.x - b.x; q.oy = q.y - b.y; q.stuckT = TOOL.NEEDLE_STICK; q.vx = q.vy = 0;
          this.sfx('clink'); break;
        }
        const m = this.misha;
        if (q.st === 0 && m && !['dead', 'intro'].includes(m.state) && overlap(q, inset(m, 6))) { q.st = 3; q.vx = -q.vx * 0.15; q.vy = -120; this.sfx('clink'); this.burst(5, q.x + 6, q.y + 6, 0xffffff); }
      }
    } else if (q.st === 2) { // воткнута в босса
      const b = q.boss; q.stuckT -= dt;
      if (b && this.liveBoss(b)) { q.x = b.x + q.ox; q.y = b.y + q.oy; }
      if (q.stuckT <= 0 || !b || !this.liveBoss(b)) { q.st = 3; q.vx = 0; q.vy = -80; q.boss = null; }
    } else if (q.st === 3) { // падает
      q.vy = Math.min(q.vy + 1100 * dt, 800); this.moveBody(q, dt);
      if (q.onGround) { q.st = 4; q.vx = q.vy = 0; }
    }
    // подобрать обратно (владелец): нить возвращается
    if ((q.st === 1 || q.st === 4) && owner && !owner.downed) {
      const r = { x: q.x - 22, y: q.y - 22, w: 56, h: 56 };
      if (overlap(owner, r)) {
        q.dead = true; Snd.play('pickup');
        if (owner.remote) this.sendEv({ k: 'silk', i: owner.i }); else owner.silk = Math.min(P.SILK, owner.silk + 1);
        this.burst(6, q.x + 6, q.y + 6, owner.pal.accent);
      }
    }
  },
  stepToolTrap(q, dt, bosses) {
    q.vy = Math.min(q.vy + 1100 * dt, 800); q.vx = 0; this.moveBody(q, dt);
    if (q.arm > 0) { q.arm -= dt; return; }
    q.tick -= dt;
    const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
    let near = false;
    for (const e of this.enemies) {
      if (e.dead || e.type === 'lurker') continue;
      if (Math.abs(e.x + e.w / 2 - cx) < 200 && Math.abs(e.y + e.h / 2 - cy) < 100) near = true;
      if (overlap(q, { x: e.x + 2, y: e.y + 2, w: e.w - 4, h: e.h - 2 }) && !(e.frozenT > 0)) {
        this.freezeEnemy(e, TOOL.TRAP_FREEZE); return this.trapSnap(q);
      }
    }
    for (const [b] of bosses) {
      if (!this.liveBoss(b)) continue;
      if (overlap(q, { x: b.x + 4, y: b.y + 4, w: b.w - 8, h: b.h - 4 })) { this.poiseAdd(b, TOOL.TRAP_POISE); return this.trapSnap(q, true); }
    }
    if (near && q.tick <= 0) { q.tick = 0.8; this.sfx('clink'); } // предупреждающий щелчок, когда враг рядом
  },
  trapSnap(q, boss) {
    q.dead = true; this.sfx('slam'); this.shake(80, 0.004);
    this.burst(14, q.x + q.w / 2, q.y, 0xffe3a3); this.tfxAdd({ f: 'snap', x: q.x + q.w / 2, y: q.y + q.h, t: 0.35, T: 0.35 }, true);
    if (boss) this.toastAll('Капкан! Стойка босса растёт');
  },
  stepToolBomb(q, dt, bosses) {
    q.vy = Math.min(q.vy + 1100 * dt, 800); q.fuse -= dt;
    this.moveBody(q, dt);
    if (q.onGround) { q.vx *= 0.75; if (Math.abs(q.vy) < 1) q.vy = 0; }
    if (q.hitL || q.hitR) q.vx = 0;
    let boom = q.fuse <= 0;
    if (!boom) for (const e of this.enemies) if (!e.dead && overlap(q, e)) { boom = true; break; }
    if (!boom) for (const [b] of bosses) if (this.liveBoss(b) && overlap(q, inset(b, 4))) { boom = true; break; }
    if (!boom) return;
    q.dead = true;
    this.toolExplode(q.x + 6, q.y + 6, this.toolOwner(q.owner));
  },
  toolExplode(cx, cy, p) {
    const R = TOOL.BOMB_R;
    this.sfx('slam'); this.shake(220, 0.01); this.hitstop = Math.max(this.hitstop || 0, 0.05);
    this.burst(30, cx, cy, p && p.pal ? p.pal.accent : 0xffe3a3); this.burst(14, cx, cy, 0xffffff);
    this.tfxAdd({ f: 'boom', x: cx, y: cy, t: 0.45, T: 0.45 }, true);
    for (const pr of this.projs) if (!pr.dead && pr.kind !== 'bomb' && !isToolKind(pr.kind) && Math.hypot(pr.x - cx, pr.y - cy) < R) pr.dead = true;
    for (const e of this.enemies) {
      if (e.dead || Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) > R) continue;
      this.toolHurtEnemy(e, TOOL.BOMB_DMG, Math.sign(e.x + e.w / 2 - cx) || 1, true);
    }
    for (const [key, fn] of BOSS_FNS) {
      const b = this[key]; if (!this.liveBoss(b)) continue;
      if (Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < R + b.w / 2) this.toolHurtBoss(b, fn, p, TOOL.BOMB_DMG);
    }
  },

  // ----- нитяной крюк (считает владелец) -----
  hookCast(p, a) {
    const cx = p.x + 7, cy = p.y + 13;
    let hit = null, ex = cx + a.dx * TOOL.HOOK_R, ey = cy + a.dy * TOOL.HOOK_R;
    const bosses = BOSS_FNS.map(([key, fn]) => [this[key], fn, key]).filter(([b]) => this.liveBoss(b));
    for (let d = 12; d <= TOOL.HOOK_R && !hit; d += 4) {
      const x = cx + a.dx * d, y = cy + a.dy * d, tx = Math.floor(x / T), ty = Math.floor(y / T), t = this.tileAt(tx, ty);
      if (t === SOLID || t === PLAT) { hit = { k: 'tile', x, y, tx, ty, plat: t === PLAT }; break; }
      for (const e of this.enemies) if (!e.dead && x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) { hit = { k: 'enemy', x, y, e }; break; }
      if (hit) break;
      for (const [b, fn, key] of bosses) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { hit = { k: 'boss', x, y, b, fn, key }; break; }
    }
    if (hit) { ex = hit.x; ey = hit.y; }
    Snd.play('throw');
    let pull = null;
    if (hit && hit.k === 'tile') {
      Snd.play('clink');
      pull = hit.plat ? { x: hit.x, y: hit.ty * T - 14 } : { x: hit.x - a.dx * 16, y: hit.y - a.dy * 16 };
    } else if (hit && hit.k === 'enemy') {
      const e = hit.e, small = e.hp <= 3 && e.type !== 'shell' && e.type !== 'beetle';
      Snd.play('clink');
      if (this.auth()) this.freezeEnemy(e, small ? TOOL.HOOK_STUN : 0.2); else this.sendEv({ k: 'thook', i: p.i, t: 'e', idx: this.enemies.indexOf(e), s: small ? 1 : 0 });
      if (small) { const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2, k = e.w / 2 + 14; pull = { x: ecx - a.dx * k, y: ecy - a.dy * k }; }
    } else if (hit && hit.k === 'boss') {
      const b = hit.b;
      if (b.stagger > 0 && !b.executed) {
        Snd.play('hitCrit');
        if (this.auth()) this.toolHurtBoss(b, hit.fn, p, 1); else this.sendEv({ k: 'thook', i: p.i, t: 'b', key: hit.key });
        const k = b.w / 2 + 14; pull = { x: b.x + b.w / 2 - a.dx * k, y: b.y + b.h / 2 - a.dy * k };
      } else Snd.play('clink');
    }
    this.tfxAdd({ f: 'hook', x: cx, y: cy, x1: ex, y1: ey, t: 0.28, T: 0.28, i: p.i }, true);
    if (pull) p.hk = { tx: pull.x, ty: pull.y, ax: ex, ay: ey, t: 0.5, stuck: 0 };
  },
  hookEnd(p) {
    p.hk = null; p.vx = 0; p.vy = Math.min(p.vy, 0) * 0.3;
  },
});

(function () {
  const proto = GameScene.prototype;
  // ----- жизненный цикл -----
  const create = proto.create;
  proto.create = function (...a) { this.tl = []; this.tfx = []; return create.apply(this, a); };
  const respawnAll = proto.respawnAll;
  proto.respawnAll = function (...a) { this.tl = []; for (const p of this.players) p.hk = null; return respawnAll.apply(this, a); };
  const step = proto.step;
  proto.step = function (dt) {
    step.call(this, dt);
    if (this.tfx && this.tfx.length) this.tfx = this.tfx.filter((f) => (f.t -= dt) > 0);
    if (this.auth() && this.tl && this.tl.length && !this.td) this.stepTools(dt);
  };
  // ----- замёрзшие враги -----
  const stepEnemy = proto.stepEnemy;
  proto.stepEnemy = function (e, dt) {
    if (!(e.frozenT > 0)) return stepEnemy.call(this, e, dt);
    e.frozenT -= dt; e.flash -= dt; e.kbT = 0; e.vx = 0;
    if (FLY_TYPES.has(e.type)) e.vy = 0; else { e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL); this.moveBody(e, dt); }
  };
  // ----- тяга крюка -----
  const stepPlayer = proto.stepPlayer;
  proto.stepPlayer = function (p, dt) {
    const hk = p.hk;
    if (!hk) return stepPlayer.call(this, p, dt);
    const inp = p.inp || {};
    if (p.downed || p.hurtT > 0 || p.healCh > 0 || inp.jumpP || inp.dashP) { p.hk = null; return stepPlayer.call(this, p, dt); }
    const x0 = p.x, y0 = p.y;
    stepPlayer.call(this, p, dt);
    if (p.downed || p.hurtT > 0) { p.hk = null; return; }
    p.x = x0; p.y = y0; // движение этого кадра заменяет тяга; рывок, его перезарядка и стамина не трогаются
    const cx = p.x + 7, cy = p.y + 13, dx = hk.tx - cx, dy = hk.ty - cy, d = Math.hypot(dx, dy);
    hk.t -= dt;
    if (d < 9 || hk.t <= 0) { this.hookEnd(p); return; }
    const sp = Math.min(TOOL.HOOK_SPD, d / dt);
    p.vx = dx / d * sp; p.vy = dy / d * sp; p.face = Math.abs(dx) > 4 ? Math.sign(dx) : p.face;
    this.moveBody(p, dt);
    if (Math.hypot(p.x - x0, p.y - y0) < sp * dt * 0.35) { if (++hk.stuck >= 2) this.hookEnd(p); } else hk.stuck = 0;
    if (p.onGround) p.coyote = P.COYOTE;
  };
  // ----- кнопка и события по сети -----
  const onEv = proto.onEv;
  proto.onEv = function (m) {
    switch (m.k) {
      case 'tool': if (this.auth()) this.toolSpawn(m); return;
      case 'tfx': (this.tfx || (this.tfx = [])).push({ ...m }); return;
      case 'thook': {
        if (!this.auth()) return;
        const p = this.players[m.i];
        if (m.t === 'e') this.freezeEnemy(this.enemies[m.idx], m.s ? TOOL.HOOK_STUN : 0.2);
        else if (p) { const kv = BOSS_FNS.find(([k]) => k === m.key), b = kv && this[kv[0]]; if (b && this.liveBoss(b) && b.stagger > 0) this.toolHurtBoss(b, kv[1], p, 1); }
        return;
      }
    }
    return onEv.call(this, m);
  };
  // отбив и всполох не трогают капканы и иглы: прячем их на время вызова
  // (они лежат в this.tl, а не в projs — отдельно от снарядов боссов; гостю они приходят в projs, поэтому его проверку попаданий оборачиваем)
  const guestHits = proto.guestProjHits;
  proto.guestProjHits = function () {
    const keep = this.projs.filter((q) => isToolKind(q.kind));
    this.projs = this.projs.filter((q) => !isToolKind(q.kind));
    try { return guestHits.call(this); } finally { this.projs = this.projs.concat(keep); }
  };
  // ----- снимок -----
  const packSnap = proto.packSnap;
  proto.packSnap = function () {
    const s = packSnap.call(this), r = Math.round;
    for (const q of this.tl || []) {
      const ch = q.kind === 'tneedle' ? [q.st, Math.round(q.ang * 100) / 100, q.st === 2 ? Math.round(q.stuckT * 10) / 10 : 0] : q.kind === 'ttrap' ? [Math.round(q.life * 10) / 10, q.arm > 0 ? 1 : 0] : [Math.round(q.fuse * 100) / 100];
      s.pr.push([NET_KINDS.indexOf(q.kind), r(q.x), r(q.y), r(q.vx), r(q.vy), 0, ch]);
    }
    const fz = []; this.enemies.forEach((e, i) => { if (!e.dead && e.frozenT > 0) fz.push(i); });
    if (fz.length) s.tf = fz;
    return s;
  };
  const applySnap = proto.applySnap;
  proto.applySnap = function (m) {
    applySnap.call(this, m);
    const fz = new Set(m.tf || []);
    this.enemies.forEach((e, i) => { e.frozenT = fz.has(i) ? 0.3 : 0; });
  };

  // ----- рисование -----
  const drawExtra = proto.drawExtraProjs;
  proto.drawExtraProjs = function (now) {
    drawExtra.call(this, now);
    const fx = this.fx, guest = this.online === 'guest';
    const list = guest ? this.projs.filter((q) => isToolKind(q.kind)) : (this.tl || []);
    for (const q of list) {
      const x = q.x + q.w / 2, y = q.y + q.h / 2, ch = q.ch;
      if (q.kind === 'tneedle') {
        const st = guest ? (ch && ch[0]) || 0 : q.st, ang = guest ? (ch && ch[1]) || 0 : q.ang;
        const ux = Math.cos(ang), uy = Math.sin(ang), L = 13, vib = st === 2 ? Math.sin(now * 60) * 1.2 : 0;
        if (st === 1 || st === 4) { fx.fillStyle(0xffe3a3, 0.12 + Math.sin(now * 5) * 0.06); fx.fillCircle(x, y, 15); }
        if (st === 0) { fx.lineStyle(1.5, 0xffe3a3, 0.45); fx.lineBetween(x - ux * L, y - uy * L, x - ux * (L + 14), y - uy * (L + 14)); }
        fx.lineStyle(2.5, 0xf6f3e8, 1); fx.lineBetween(x - ux * L + vib, y - uy * L, x + ux * L + vib, y + uy * L);
        fx.fillStyle(0xffffff, 1); fx.fillCircle(x + ux * L + vib, y + uy * L, 2);
        fx.fillStyle(0xffd47a, 1); fx.fillCircle(x - ux * L, y - uy * L, 2);
      } else if (q.kind === 'ttrap') {
        const life = guest ? (ch && ch[0]) || 0 : q.life, arming = guest ? (ch && ch[1]) : q.arm > 0;
        if (life < 2 && Math.floor(now * 10) % 2) continue;
        const bx = q.x, by = q.y + q.h;
        fx.fillStyle(0x000000, 0.3); fx.fillEllipse(x, by, q.w + 6, 6);
        fx.fillStyle(0x59483a, 1); fx.fillRect(bx, by - 4, q.w, 4);
        fx.fillStyle(0xd9d4c3, 1);
        for (let i = 0; i < 5; i++) { const tx = bx + 2 + i * 5; fx.fillTriangle(tx, by - 4, tx + 5, by - 4, tx + 2.5, by - 12); }
        const blink = arming ? 0.3 : 0.5 + Math.sin(now * 8) * 0.5;
        fx.fillStyle(0xff6a4a, 0.25 + blink * 0.6); fx.fillCircle(x, by - 2, 2.2);
        fx.lineStyle(1, 0xffe3a3, 0.35); fx.strokeCircle(x, by - 4, 18 + Math.sin(now * 4) * 2);
      } else if (q.kind === 'tbomb') {
        const fuse = guest ? (ch && ch[0]) || 0 : q.fuse, pul = 1 + Math.sin(now * (14 + (TOOL.BOMB_FUSE - fuse) * 30)) * 0.12;
        fx.fillStyle(0xffd47a, 0.2); fx.fillCircle(x, y, 11 * pul);
        fx.fillStyle(0xe9e2cf, 1); fx.fillCircle(x, y, 6.5 * pul);
        fx.lineStyle(1.5, 0x8a7a55, 1); fx.beginPath(); fx.arc(x, y, 5, 0.3, 2.6, false); fx.strokePath(); fx.beginPath(); fx.arc(x, y, 5, 3.4, 5.7, false); fx.strokePath();
        fx.fillStyle(0xff9a3c, 1); fx.fillCircle(x + 3, y - 8, 2 + Math.sin(now * 30) * 0.6);
      }
    }
    // замёрзшие враги: нитяная сеть
    for (const e of this.enemies) if (!e.dead && e.frozenT > 0) {
      const ex = e.x + e.w / 2, ey = e.y + e.h / 2, rx = e.w / 2 + 4, ry = e.h / 2 + 4;
      fx.lineStyle(1.5, 0xe8f6ff, 0.8); fx.strokeEllipse(ex, ey, rx * 2, ry * 2);
      fx.lineBetween(ex - rx, ey - ry * 0.5, ex + rx, ey + ry * 0.5); fx.lineBetween(ex - rx, ey + ry * 0.5, ex + rx, ey - ry * 0.5); fx.lineBetween(ex, ey - ry, ex, ey + ry);
    }
    // тяга крюка: нить от героя до точки зацепа
    for (const p of this.players) if (p.hk) {
      fx.lineStyle(2, p.pal.accent, 0.9); fx.lineBetween(p.x + 7, p.y + 13, p.hk.ax, p.hk.ay);
      fx.fillStyle(0xffffff, 1); fx.fillCircle(p.hk.ax, p.hk.ay, 3);
    }
    for (const f of this.tfx || []) {
      const k = Math.max(0, f.t / (f.T || 0.3));
      if (f.f === 'hook') {
        const pl = this.players[f.i], col = pl && pl.pal ? pl.pal.accent : 0xffe3a3;
        fx.lineStyle(2.5, col, k); fx.lineBetween(f.x, f.y, f.x1, f.y1);
        fx.lineStyle(1.2, 0xffffff, k); fx.lineBetween(f.x, f.y, f.x1, f.y1);
        const ang = Math.atan2(f.y1 - f.y, f.x1 - f.x);
        fx.lineStyle(2.5, 0xffffff, k);
        for (const s of [-0.7, 0.7]) fx.lineBetween(f.x1, f.y1, f.x1 - Math.cos(ang + s) * 9, f.y1 - Math.sin(ang + s) * 9);
      } else if (f.f === 'boom') {
        const r = TOOL.BOMB_R * (1 - k * k);
        fx.fillStyle(0xffe3a3, 0.22 * k); fx.fillCircle(f.x, f.y, r);
        fx.lineStyle(4, 0xffffff, k); fx.strokeCircle(f.x, f.y, r);
        fx.lineStyle(2, 0xffd47a, k); fx.strokeCircle(f.x, f.y, r * 0.7);
      } else if (f.f === 'snap') {
        fx.lineStyle(3, 0xffffff, k);
        for (let s = -2; s <= 2; s++) fx.lineBetween(f.x + s * 6, f.y, f.x + s * 9, f.y - 26 * (1 - k * 0.3));
      }
    }
  };

  // ----- HUD: значок инструмента под катушкой нити -----
  const uiUpdate = UIScene.prototype.update;
  UIScene.prototype.update = function (time, delta) {
    uiUpdate.call(this, time, delta);
    const gs = this.gs; if (!gs || !gs.players || !this.ready) return;
    const g = this.hud;
    gs.players.forEach((p, i) => {
      const D_ = TOOLS[p.toolId]; if (!D_) return;
      const sx = i === 0 ? 40 : VW - 40, cy = 94, R = 13, cost = D_.cost || 0;
      const can = p.silk >= cost, cd = Math.max(0, p.toolCd || 0), frac = D_.cd ? Math.min(1, cd / D_.cd) : 0;
      g.fillStyle(0x0b1714, 0.85); g.fillCircle(sx, cy, R + 2);
      const col = frac > 0 ? 0x6f8f83 : can ? 0xf4efe0 : 0x8a4a42;
      // значок
      g.lineStyle(2, col, 1); g.fillStyle(col, 1);
      if (D_.id === 'throwneedle') { g.lineBetween(sx - 7, cy + 7, sx + 7, cy - 7); g.fillTriangle(sx + 8, cy - 8, sx + 3, cy - 6, sx + 6, cy - 3); g.lineStyle(1, col, 0.6); g.lineBetween(sx - 7, cy + 7, sx - 11, cy + 11); }
      else if (D_.id === 'trap') { g.fillRect(sx - 8, cy + 3, 16, 3); for (let k = 0; k < 4; k++) g.fillTriangle(sx - 8 + k * 4, cy + 3, sx - 4 + k * 4, cy + 3, sx - 6 + k * 4, cy - 5); }
      else if (D_.id === 'threadbomb') { g.strokeCircle(sx, cy + 2, 6); g.lineBetween(sx + 3, cy - 3, sx + 6, cy - 8); g.fillCircle(sx + 7, cy - 9, 1.6); }
      else if (D_.id === 'hook') { g.beginPath(); g.moveTo(sx - 8, cy + 8); g.lineTo(sx - 1, cy - 4); g.strokePath(); g.beginPath(); g.arc(sx + 3, cy - 5, 5, Math.PI * 0.9, Math.PI * 2.2, false); g.strokePath(); }
      else g.fillCircle(sx, cy, 4);
      // перезарядка: тёмный сектор убывает по часовой, снаружи — дуга готовности
      if (frac > 0) {
        g.fillStyle(0x000000, 0.62); g.beginPath(); g.moveTo(sx, cy); g.arc(sx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false); g.closePath(); g.fillPath();
        g.lineStyle(2, p.pal.accent, 0.9); g.beginPath(); g.arc(sx, cy, R + 2, -Math.PI / 2 + Math.PI * 2 * frac, Math.PI * 1.5, false); g.strokePath();
      } else { g.lineStyle(2, can ? p.pal.accent : 0x8a4a42, can ? 0.9 : 0.7); g.strokeCircle(sx, cy, R + 2); }
      // стоимость: точки нити
      for (let k = 0; k < cost; k++) { const dx = sx + (k - (cost - 1) / 2) * 8, filled = p.silk > k; g.fillStyle(filled ? p.pal.cloak : 0x2b3b35, 1); g.fillCircle(dx, cy + R + 8, 2.8); }
    });
  };
})();
