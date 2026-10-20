// ===== УДОБСТВА: рекорды боссов, возрождение у арены, подсказка отбива =====
const Records = {
  all() { try { return JSON.parse(localStorage.getItem('tt_records') || '{}') || {}; } catch (_) { return {}; } },
  get(id) { return this.all()[id] || { tries: 0, wins: 0, best: 0 }; },
  put(id, r) { const a = this.all(); a[id] = r; try { localStorage.setItem('tt_records', JSON.stringify(a)); } catch (_) { } },
  fmt(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); },
  line(id) {
    const r = this.get(id);
    return r.tries ? `Попыток: ${r.tries} · побед: ${r.wins}` + (r.best ? ` · лучшее время: ${this.fmt(r.best)}` : '') : 'Ещё не пробовали';
  },
};

(function () {
  const proto = GameScene.prototype;
  const bossId = (sc) => (sc.mode === 'bosstest' ? sc.bossKind : 'korn');
  const bossLive = (sc) => {
    const b = sc.testBoss() || sc.boss;
    return !!b && !['sleep', 'gone', 'dead', 'intro'].includes(b.state);
  };
  // таймер боя и счётчик попыток
  const step = proto.step;
  proto.step = function (dt) {
    step.call(this, dt);
    if (this.online === 'guest' || this.train) return; // в тренировке (training.js) попытки и рекорды не считаем
    if (bossLive(this)) {
      if (!this.fightOn) {
        this.fightOn = true; this.fightT = 0;
        const id = bossId(this), r = Records.get(id); r.tries++; Records.put(id, r);
        if (r.tries > 1) this.ui().toast(`Попытка ${r.tries}`, 1.6);
        // возрождение у входа в арену Корнематки, чтобы не бежать через весь уровень
        if (this.mode === 'story' && this.L.gateIn && !this.bossDead) {
          const gi = this.L.gateIn; this.respawn = { x: (gi.x + 3) * T + 16, y: (gi.y1 + 1) * T };
        }
      }
      this.fightT += dt;
    }
  };
  const respawnAll = proto.respawnAll;
  proto.respawnAll = function () { this.fightOn = false; respawnAll.call(this); };
  // запись победы
  const onWin = function (sc) {
    if (!sc.fightOn || sc.fightWon || sc.train) return; sc.fightWon = true;
    const id = bossId(sc), r = Records.get(id), t = sc.fightT || 0;
    r.wins++; const rec = !r.best || t < r.best; if (rec) r.best = t; Records.put(id, r);
    sc.ui().toast(`Босс повержен за ${Records.fmt(t)}` + (rec ? ' — новый рекорд!' : ` (лучшее ${Records.fmt(r.best)})`), 4);
  };
  for (const fn of ['killBoss', 'mishaDie', 'vladikDie', 'timaDie']) {
    const f = proto[fn]; if (!f) continue;
    proto[fn] = function (...a) { onWin(this); return f.apply(this, a); };
  }
  // подсказка: кольцо вокруг героя, когда рядом летит опасное и отбив готов
  const fx = proto.drawPlayerFx;
  proto.drawPlayerFx = function (p, g) {
    fx.call(this, p, g);
    if (p.remote || p.parryT > 0 || p.parryCd > 0 || !this.projs) return;
    const cx = p.x + 7, cy = p.y + 13;
    for (const pr of this.projs) if (!pr.dead && pr.kind !== 'bomb' && pr.kind !== 'pad' && Math.hypot(pr.x - cx, pr.y - cy) < 95) {
      g.lineStyle(1.5, 0xffffff, 0.35 + 0.25 * Math.sin(this.animT * 18)); g.strokeCircle(0, -14, 27); return;
    }
  };
  // строка рекордов на экране выбора босса
  const setPick = MenuScene.prototype.setPick;
  MenuScene.prototype.setPick = function (i) {
    setPick.call(this, i);
    this.pickAbout.setText(BOSSES[this.pickIdx].about + '\n' + Records.line(BOSSES[this.pickIdx].id));
  };
})();
