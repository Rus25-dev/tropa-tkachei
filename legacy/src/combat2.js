// ===== БОЙ 2: отбив, нитяной всполох, предметы-способности =====
Object.assign(GameScene.prototype, {
  // отбив: удар, пришедший в окно отбива, не ранит, даёт нить, сбивает снаряды и стойкость босса
  parrySuccess(p, srcX) {
    p.inv = 0.5; p.parryT = 0; p.parryCd = 0.15;
    if (!p.remote) { p.silk = Math.min(P.SILK, p.silk + 1); this.hitstop = 0.1; }
    const cx = p.x + 7, cy = p.y + 13;
    Snd.play('parry'); this.cameras.main.flash(90, 255, 255, 255);
    this.parts.setParticleTint(0xffffff); this.parts.explode(18, cx + p.face * 10, cy);
    for (const pr of this.projs) if (!pr.dead && pr.kind !== 'bomb' && Math.hypot(pr.x - cx, pr.y - cy) < 110) { pr.dead = true; this.burst(5, pr.x, pr.y, 0xffffff); }
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < 100) { e.kbT = 0.2; e.kbx = Math.sign(e.x - cx) * 300; e.kby = -120; e.flash = 0.1; if (e.state === 'charge') { e.state = 'stun'; e.st = 0.8; } }
    if (this.auth()) this.parryPoise(cx, cy); else this.sendEv({ k: 'parrypoise', x: Math.round(cx), y: Math.round(cy) });
  },
  parryPoise(cx, cy) {
    for (const b of [this.boss, this.vladik, this.tima]) if (b && Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < 190) this.poiseAdd(b, 3);
  },
  // нитяной всполох (↑ + кнопка нити): тратит BURST нити, бьёт всё вокруг и сбивает снаряды
  silkBurst(p) {
    p.silk -= P.BURST; p.inv = Math.max(p.inv, 0.3); p.healT = 0.3;
    const cx = p.x + 7, cy = p.y + 13;
    Snd.play('slam'); this.shake(180, 0.008); this.hitstop = 0.06;
    this.parts.setParticleTint(p.pal.accent); this.parts.explode(36, cx, cy);
    p.burstFx = 0.35;
    if (!this.auth()) { this.sendEv({ k: 'burstSkill', x: Math.round(cx), y: Math.round(cy) }); return; }
    this.silkBurstHit(p, cx, cy);
  },
  silkBurstHit(p, cx, cy) {
    const R = 120; p.noSilkGain = true; // всполох нить не копит: иначе он оплачивал бы сам себя
    for (const pr of this.projs) if (!pr.dead && pr.kind !== 'bomb' && Math.hypot(pr.x - cx, pr.y - cy) < R) pr.dead = true;
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < R) { this.damageEnemy(e, p); if (!e.dead) this.damageEnemy(e, p); }
    for (const [b, fn] of [[this.boss, 'damageBoss'], [this.vladik, 'damageVladik'], [this.tima, 'damageTima']]) {
      if (!b || ['dead', 'gone', 'sleep', 'intro'].includes(b.state)) continue;
      if (Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < R + b.w / 2) { for (let i = 0; i < 3 && !['dead', 'gone'].includes(b.state); i++) this[fn](p); }
    }
    p.noSilkGain = false;
  },
  // ----- предметы-способности на карте -----
  initItems() {
    this.items = (this.L.items || []).filter((it) => !this.abil[it.ability]).map((it) => ({ ...it, px: it.x * T + 16, py: (it.y + 1) * T - 20 }));
  },
  stepItems() {
    if (!this.items || !this.items.length) return;
    for (const it of this.items) {
      if (it.got) continue;
      for (const p of this.players) if (!p.remote && !p.downed && Math.hypot(p.x + 7 - it.px, p.y + 13 - it.py) < 28) {
        it.got = true; this.abil[it.ability] = true; Snd.play('revive');
        this.parts.setParticleTint(0xffe3a3); this.parts.explode(40, it.px, it.py); this.shake(300, 0.006);
        this.ui().toast(it.text, 5);
        if (this.online) this.sendEv({ k: 'abil', a: it.ability });
        if (this.auth()) Settings.saveProgress({ ...(Settings.progress() || { bench: 0, beads: this.beads }), abil: this.abil }); // у гостя сохранение не его: запишет хост
      }
    }
    this.items = this.items.filter((it) => !it.got);
  },
  // напарник подобрал способность (хост запоминает и сохраняет, гость убирает предмет с карты)
  itemEv(m) {
    if (!m.a) return;
    this.abil[m.a] = true;
    const it = (this.items || []).find((q) => q.ability === m.a);
    if (it) { this.parts.setParticleTint(0xffe3a3); this.parts.explode(30, it.px, it.py); this.ui().toast(it.text, 5); }
    this.items = (this.items || []).filter((q) => q.ability !== m.a);
    if (this.auth()) Settings.saveProgress({ ...(Settings.progress() || { bench: 0, beads: this.beads }), abil: this.abil });
  },
  drawItems(now) {
    if (!this.itemG || !this.itemG.scene) this.itemG = this.add.graphics().setDepth(2.5);
    const g = this.itemG; g.clear();
    for (const it of this.items || []) {
      const bob = Math.sin(now * 2.4) * 4;
      g.fillStyle(0xffd47a, 0.1); g.fillCircle(it.px, it.py + bob, 34); g.fillStyle(0xffd47a, 0.22); g.fillCircle(it.px, it.py + bob, 20);
      g.fillStyle(0xfff2c8, 1); g.fillTriangle(it.px, it.py + bob - 11, it.px + 9, it.py + bob, it.px - 9, it.py + bob); g.fillTriangle(it.px, it.py + bob + 11, it.px + 9, it.py + bob, it.px - 9, it.py + bob);
    }
  },
  drawPlayerFx(p, g) {
    if (p.parryT > 0) { g.lineStyle(2.5, 0xffffff, 0.9); g.strokeCircle(0, -14, 20 + (P.PARRY_T - p.parryT) * 50); }
    if (p.execT > 0) { // казнь: огромный росчерк вверх или вниз
      const k = p.execT / 0.42, up = p.execDir === 'u', dy = up ? -1 : 1, f = p.face;
      g.lineStyle(7, 0xfff6d8, k); g.beginPath(); g.arc(f * 8, -14 + dy * 6, 50 + (1 - k) * 22, up ? -Math.PI * 0.95 : Math.PI * 0.05, up ? -Math.PI * 0.05 : Math.PI * 0.95, false); g.strokePath();
      g.lineStyle(3, p.pal.accent, k); g.beginPath(); g.arc(f * 8, -14 + dy * 6, 62 + (1 - k) * 22, up ? -Math.PI * 0.9 : Math.PI * 0.1, up ? -Math.PI * 0.1 : Math.PI * 0.9, false); g.strokePath();
    }
    if (p.burstFx > 0) { const r = 120 * (1 - p.burstFx / 0.35); g.lineStyle(3, p.pal.accent, p.burstFx / 0.35); g.strokeCircle(0, -14, r); p.burstFx -= 0.016; }
  },
});
