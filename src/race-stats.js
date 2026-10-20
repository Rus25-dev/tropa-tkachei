// ===== СТАТИСТИКА ЗАБЕГА: урон, DPS, точность, отбивы, увороты, казни, комбо, фазы, покупки =====
// Считается из самой симуляции (по тикам и хукам вокруг боевых функций) и ничего в игре не меняет. Поэтому при воспроизведении журнала
// (journal.js) получается то же самое. Живёт в Speedrun.run.stats; в гонке уходит организатору в телеметрии и в итоговом результате.
const RaceStats = {
  fresh() { return { dmg: 0, bossDmg: 0, taken: 0, heals: 0, swings: 0, hits: 0, parries: 0, dodges: 0, stuns: 0, execs: 0, combo: 0, kills: 0, fight: 0, ph: {}, buys: [], _: {} }; },
  of(gs) { const r = gs.sr; if (!r) return null; return r.stats || (r.stats = this.fresh()); },
  // компактный итог для сети и архива (без служебных полей)
  pack(S, igtTicks) {
    if (!S) return null;
    const fightSec = S.fight / 60, acc = S.swings ? Math.min(1, S.hits / S.swings) : 0;
    const ph = {}; for (const k in S.ph) ph[k] = Math.round(S.ph[k] / 6) / 10;
    const r1 = (x) => Math.round(x * 10) / 10;
    return { dmg: r1(S.dmg), bossDmg: r1(S.bossDmg), dps: fightSec > 0.5 ? r1(S.bossDmg / fightSec) : 0, taken: S.taken, deaths: undefined, heals: S.heals, swings: S.swings, hits: S.hits, acc: Math.round(acc * 100) / 100,
      parries: S.parries, dodges: S.dodges, stuns: S.stuns, execs: S.execs, combo: S.combo, kills: S.kills, fight: r1(fightSec), ph, buys: S.buys.slice(0, 20), igt: igtTicks != null ? Math.round(igtTicks) : undefined };
  },
  tick(gs) {
    const S = this.of(gs); if (!S) return;
    const p = gs.players[0], q = S._; if (!p) return;
    const sw = p.atkT > 0; if (sw && !q.atk) S.swings++; q.atk = sw;
    if ((p.combo | 0) > S.combo) S.combo = p.combo | 0;
    if (q.hp != null && p.hp > q.hp && p.healT > 0 && !gs.wiping) S.heals++;
    q.hp = p.hp;
    const b = gs.testBoss() || gs.boss;
    if (b && b.state && !gs.bossDead && !['sleep', 'dead', 'gone', 'intro'].includes(b.state) && !(b.hp <= 0)) {
      S.fight++;
      const key = (gs.camp ? gs.camp.ch : 1) + ':' + (b.phase || 1); S.ph[key] = (S.ph[key] | 0) + 1;
      const st = b.stagger > 0; if (st && !q.st) S.stuns++; q.st = st;
    } else q.st = false;
  },
};
(function () {
  const G = GameScene.prototype;
  const hpOf = (gs) => { const b = gs.testBoss() || gs.boss; return b ? b.hp : 0; };
  // удары по врагам и боссам: попадание считаем всегда, урон — по изменению здоровья
  const dmgWrap = (fn, boss) => {
    const o = G[fn]; if (!o) return;
    G[fn] = function (...a) {
      const S = this.sr && !this.replaying0 ? RaceStats.of(this) : null; if (!S) return o.apply(this, a);
      const e = boss ? null : a[0], b = boss ? (this.testBoss() || this.boss) : null, h0 = boss ? (b ? b.hp : 0) : (e ? e.hp : 0);
      const out = o.apply(this, a);
      const h1 = boss ? (b ? b.hp : 0) : (e ? e.hp : 0), d = Math.max(0, h0 - h1);
      if (d > 0 || boss) { S.hits++; S.dmg += d; if (boss) S.bossDmg += d; }
      if (!boss && e && e.dead && h0 > 0) S.kills++;
      return out;
    };
  };
  dmgWrap('damageEnemy', false);
  for (const f of ['damageBoss', 'damageVladik', 'damageTima', 'mishaBagHit']) dmgWrap(f, true);
  { // Миша бьётся иглой отдельной функцией: hp у него в долях
    const o = G.mishaNeedleHit;
    if (o) G.mishaNeedleHit = function (...a) {
      const S = this.sr ? RaceStats.of(this) : null; if (!S) return o.apply(this, a);
      const m = a[1], h0 = m ? m.hp : 0, out = o.apply(this, a), d = Math.max(0, h0 - (m ? m.hp : 0));
      S.hits++; S.dmg += d; S.bossDmg += d; return out;
    };
  }
  {
    const o = G.hurtPlayer;
    G.hurtPlayer = function (p, ...a) {
      const S = this.sr && !p.remote ? RaceStats.of(this) : null; if (!S) return o.call(this, p, ...a);
      const h0 = p.hp, pd0 = p.pdodge || 0, out = o.call(this, p, ...a);
      if (p.hp < h0) S.taken += h0 - p.hp;
      else if ((p.pdodge || 0) >= 0.39 && pd0 < 0.39) S.dodges++; // идеальный уворот: рывок сквозь удар
      return out;
    };
  }
  {
    const o = G.parrySuccess;
    if (o) G.parrySuccess = function (p, ...a) { const S = this.sr && !p.remote ? RaceStats.of(this) : null; if (S) S.parries++; return o.call(this, p, ...a); };
  }
  {
    const o = G.execBoss;
    if (o) G.execBoss = function (p, kit, dir) {
      const S = this.sr ? RaceStats.of(this) : null; const was = S && (this.testBoss() || this.boss) ? !!(this.testBoss() || this.boss).executed : false;
      const out = o.call(this, p, kit, dir);
      if (S && !was) { const b = this.testBoss() || this.boss; if (b && b.executed) S.execs++; }
      return out;
    };
  }
  void hpOf;
  // покупки в лавке
  const buyO = Campaign.buy;
  Campaign.buy = function (gs, id, fromGuest) {
    const S = gs.sr ? RaceStats.of(gs) : null, b0 = gs.beads, up0 = gs.up ? gs.up[id] : 0, out = buyO.call(this, gs, id, fromGuest);
    if (S && gs.beads < b0 && gs.up && gs.up[id] > up0) S.buys.push({ id, ch: gs.camp ? gs.camp.ch : 1, igt: Math.round(gs.sr.igt / 100) / 10, price: b0 - gs.beads });
    return out;
  };
  // тик: после основной логики (Speedrun.onTick вызывает RaceStats.tick)
  const onTickO = Speedrun.onTick;
  Speedrun.onTick = function (gs) { const out = onTickO.call(this, gs); const r = this.run; if (r && gs.sr && !r.hold && r.t0 != null && !r.done) RaceStats.tick(gs); return out; };
})();
