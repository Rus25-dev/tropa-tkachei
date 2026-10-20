// ===== СТАТУСЫ: яд, ожог, замедление =====
// API: Status.apply(sc, target, kind, dur?, src?) → true, если статус наложен. kind: 'poison' | 'burn' | 'slow'.
//   target — враг из sc.enemies или босс (sc.boss / sc.vladik / sc.tima). Мишу нельзя ранить иглой — на нём статусы не держатся.
//   dur — для яда/ожога длительность в секундах (по умолчанию 4 тика × 1.2 с и 3 тика × 0.8 с), для замедления — секунды (3).
//   src — герой, чьим уроном считаются тики (для нити/хитстопа не важен; по умолчанию первый локальный).
// Яд: 1 урона раз в 1.2 с, 4 тика. Ожог: 1 урона раз в 0.8 с, 3 тика, на каждом тике поджигает рядом стоящих (цепочка не длиннее 2 звеньев).
// Замедление/оцепенение: −40 % скорости 3 с (время врага течёт в 0.6×).
// Боссы: статусы вдвое слабее (тик бьёт через раз, замедление −20 %), не складываются (одновременно один урон-статус; повтор лишь обновляет таймер).
// Урон боссу идёт через исходную функцию урона (RAW из bosses2.js) без нити, звука и стойкости — фазы и оглушение не ломаются.
// Сеть: считает только хост/одиночка; в снимок идёт маска статусов (e[7], sf) — гость лишь рисует.
const Status = {
  KINDS: {
    poison: { name: 'Яд', iv: 1.2, n: 4, col: 0x86e05a, bit: 1 },
    burn: { name: 'Ожог', iv: 0.8, n: 3, col: 0xff8a3c, bit: 2 },
    slow: { name: 'Оцепенение', t: 3, col: 0x6ab8ff, bit: 4 },
  },
  BOSS_KEYS: ['boss', 'vladik', 'tima'],
  bossKey(sc, t) { for (const k of this.BOSS_KEYS) if (sc[k] === t) return k; return null; },
  isBoss(sc, t) { return !!t && (this.bossKey(sc, t) || sc.misha === t) ? true : false; },
  bossLive(b) { return !!b && !['sleep', 'dead', 'gone', 'intro', 'rage'].includes(b.state); },
  alive(sc, t) {
    if (!t) return false;
    if (this.isBoss(sc, t)) return t.hp > 0 && !['dead', 'gone'].includes(t.state);
    return !t.dead && t.hp > 0;
  },
  has(t, kind) { return !!(t && t.status && t.status[kind]); },
  src(sc, p) { return p || sc.players.find((q) => !q.remote) || sc.players[0]; },

  apply(sc, t, kind, dur, src) {
    const K = this.KINDS[kind]; if (!K || !t || !sc.auth() || !this.alive(sc, t)) return false;
    if (sc.misha === t) return false;
    const boss = this.isBoss(sc, t), s = t.status || (t.status = {});
    if (kind === 'slow') {
      const left = dur != null ? dur : K.t;
      if (s.slow) s.slow.t = Math.max(s.slow.t, left); else s.slow = { t: left };
      return true;
    }
    if (boss) { // не складываются: один урон-статус за раз
      const other = kind === 'poison' ? 'burn' : 'poison';
      if (s[other]) return false;
    }
    const n = dur != null ? Math.max(1, Math.round(dur / K.iv)) : K.n;
    if (s[kind]) { s[kind].left = Math.max(s[kind].left, n); s[kind].src = src || s[kind].src; return true; }
    s[kind] = { left: n, cd: K.iv, src: src || null, gen: 0 };
    return true;
  },
  clear(t) { if (t) t.status = null; },
  // маска для снимка и отрисовки
  mask(sc, t) {
    if (!t) return 0;
    if (!sc.auth()) return t.stv | 0;
    const s = t.status; if (!s) return 0;
    let m = 0; for (const k in s) if (s[k]) m |= this.KINDS[k].bit; return m;
  },

  // урон боссу тиком: исходная функция без нити/звука/стойкости
  bossDamage(sc, key, p, n) {
    const b = key === 'boss' ? sc.boss : sc[key], raw = typeof RAW !== 'undefined' ? RAW[key] : null;
    if (!raw || !this.bossLive(b)) return;
    const hs = sc.hitstop, hp0 = b.hp, nsg = p.noSilkGain, q = sc.quiet;
    sc.quiet = true; p.noSilkGain = true;
    for (let i = 0; i < n && b.hp > 0 && this.bossLive(b); i++) raw.call(sc, p);
    sc.quiet = q; p.noSilkGain = nsg; sc.hitstop = hs;
    if (b.hp < hp0) b.flash = Math.max(b.flash || 0, 0.06);
  },
  // тик урона
  tick(sc, t, kind, st) {
    const K = this.KINDS[kind], p = this.src(sc, st.src), boss = this.isBoss(sc, t);
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    if (boss) {
      const key = this.bossKey(sc, t);
      t.stAcc = (t.stAcc || 0) + 0.5;
      if (t.stAcc >= 1) { t.stAcc -= 1; this.bossDamage(sc, key, p, 1); }
    } else {
      if (t.e2 && t.type === 'lurker' && typeof E2_UNDER !== 'undefined' && E2_UNDER.includes(t.state)) return;
      t.hp -= 1; t.flash = 0.08;
      sc.burst(kind === 'poison' ? 5 : 6, cx, cy, K.col);
      if (t.hp <= 0) { sc.killEnemy(t); t.status = null; return; }
    }
    if (kind === 'burn' && st.gen < 2) { // поджигает рядом стоящих
      for (const o of sc.enemies) {
        if (o === t || o.dead || (o.status && o.status.burn)) continue;
        if (Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) > 72) continue;
        if (this.apply(sc, o, 'burn', null, st.src)) o.status.burn.gen = st.gen + 1;
      }
    }
  },
  step(sc, dt) {
    if (!sc.auth() || sc.td) return;
    const list = [...sc.enemies, sc.boss, sc.vladik, sc.tima];
    for (const t of list) {
      const s = t && t.status; if (!s) continue;
      if (!this.alive(sc, t)) { t.status = null; continue; }
      if (s.slow) { s.slow.t -= dt; if (s.slow.t <= 0) delete s.slow; }
      for (const kind of ['poison', 'burn']) {
        const st = s[kind]; if (!st) continue;
        if (this.isBoss(sc, t) && !this.bossLive(t)) continue; // в рёве/неуязвимости таймер замирает
        st.cd -= dt;
        if (st.cd <= 0) {
          st.cd += this.KINDS[kind].iv; st.left--;
          this.tick(sc, t, kind, st);
          if (!t.status) break;
          if (st.left <= 0) delete s[kind];
        }
      }
      if (t.status && !t.status.poison && !t.status.burn && !t.status.slow) t.status = null;
    }
  },
  // отрисовка: цветная вуаль на цели, значки над головой, пузырьки/искры/снежинки
  draw(sc, now) {
    if (!sc.stG || !sc.stG.scene) sc.stG = sc.add.graphics().setDepth(5.6);
    const g = sc.stG; g.clear();
    const targets = [...sc.enemies, sc.boss, sc.vladik, sc.tima];
    for (const t of targets) {
      if (!t || t.dead || t.w < 2) continue;
      const m = this.mask(sc, t); if (!m) continue;
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2, pul = 0.5 + Math.sin(now * 8 + cx) * 0.5;
      const kinds = Object.keys(this.KINDS).filter((k) => m & this.KINDS[k].bit);
      for (const k of kinds) {
        const K = this.KINDS[k];
        g.fillStyle(K.col, 0.16 + pul * 0.1); g.fillEllipse(cx, cy, t.w * 0.95, t.h * 0.95);
        if (Math.random() < 0.06) {
          const d = sc.dust; d.setParticleTint(K.col); d.explode(1, cx + (Math.random() - 0.5) * t.w * 0.7, t.y + t.h * (0.3 + Math.random() * 0.5)); d.setParticleTint(0x8fae9c);
        }
      }
      // значки
      const iy = t.y - 10, x0 = cx - (kinds.length - 1) * 8;
      kinds.forEach((k, i) => {
        const K = this.KINDS[k], x = x0 + i * 16;
        g.fillStyle(0x0b0f0e, 0.75); g.fillCircle(x, iy, 7);
        g.fillStyle(K.col, 1);
        if (k === 'poison') { g.fillCircle(x, iy + 1.5, 3); g.fillTriangle(x - 2.6, iy + 0.5, x + 2.6, iy + 0.5, x, iy - 4); }
        else if (k === 'burn') { g.fillTriangle(x - 3.2, iy + 4, x + 3.2, iy + 4, x, iy - 5); g.fillStyle(0xffe3a3, 1); g.fillTriangle(x - 1.4, iy + 4, x + 1.4, iy + 4, x, iy - 1); }
        else { g.lineStyle(1.5, K.col, 1); g.lineBetween(x - 4, iy, x + 4, iy); g.lineBetween(x, iy - 4, x, iy + 4); g.lineBetween(x - 3, iy - 3, x + 3, iy + 3); g.lineBetween(x - 3, iy + 3, x + 3, iy - 3); }
      });
    }
  },
};

(function () {
  const proto = GameScene.prototype;
  // замедление: время врага течёт медленнее (боссы — вдвое слабее)
  const slowStep = (name, boss) => {
    const f = proto[name]; if (!f) return;
    proto[name] = function (...a) {
      const dt = a[a.length - 1];
      if (typeof dt === 'number' && this.auth() && !this.td) {
        const e = boss ? (name === 'stepBoss' ? this.boss : name === 'stepVladik' ? this.vladik : this.tima) : a[0];
        if (e && e.status && e.status.slow && (!boss || Status.bossLive(e))) a[a.length - 1] = dt * (boss ? 0.8 : 0.6);
      }
      return f.apply(this, a);
    };
  };
  slowStep('stepEnemy', false); slowStep('stepBoss', true); slowStep('stepVladik', true); slowStep('stepTima', true);
  const step = proto.step;
  proto.step = function (dt) { const r = step.call(this, dt); Status.step(this, dt); return r; };
  const render = proto.render;
  proto.render = function (dt) { const r = render.call(this, dt); Status.draw(this, this.time.now / 1000); return r; };
  // сеть: маски статусов в снимке (только если хоть что-то горит)
  const packSnap = proto.packSnap;
  proto.packSnap = function () {
    const m = packSnap.call(this); let any = false;
    m.e.forEach((a, i) => { const k = Status.mask(this, this.enemies[i]); if (k) { a[7] = k; any = true; } });
    const sf = [this.boss, this.vladik, this.tima].map((b) => Status.mask(this, b));
    if (sf.some(Boolean)) { m.sf = sf; any = true; }
    return m;
  };
  const applySnap = proto.applySnap;
  proto.applySnap = function (m) {
    applySnap.call(this, m);
    m.e.forEach((a, i) => { const e = this.enemies[i]; if (e) e.stv = a[7] | 0; });
    [this.boss, this.vladik, this.tima].forEach((b, i) => { if (b) b.stv = m.sf ? m.sf[i] | 0 : 0; });
  };
})();
