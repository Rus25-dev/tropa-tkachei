// ===== ВРАГИ 2: плевальщик, жук-панцирь, стая мышей, засадник =====
// У каждого — телеграф и своё правило. Считает только хост (stepEnemy2), гость получает состояние в снимке
// (packEnemy2 / applyEnemy2) и рисует по e.state / e.st. Хуки в game.js: spawnEnemy2, stepEnemy2, drawEnemy2, e2Blocked.
const E2_STATES = {
  spitter: ['idle', 'flee', 'hop', 'wind', 'recover'],
  shell: ['walk', 'wind', 'rush', 'spin', 'tire', 'stun'],
  bat: ['roost', 'hover', 'wind', 'dive', 'rise'],
  lurker: ['hidden', 'track', 'warn', 'erupt', 'tell', 'pounce', 'tired', 'dig'],
};
const E2_VULN = ['erupt', 'tell', 'pounce', 'tired']; // засадника можно бить только вне земли
const E2_UNDER = ['hidden', 'track', 'warn', 'dig']; // в этих состояниях тело спрятано на 50 px под полом
NET_KINDS.push('glob'); NET_SIZES.push([12, 12]); SLASH_KINDS.add('glob'); // плевок: летит дугой, его можно сбить ударом

Object.assign(GameScene.prototype, {
  // ----- появление: вызывается из spawnEnemies; вернёт врага, массив врагов или null -----
  spawnEnemy2(d, base) {
    const fx = d.x * T + 16, fy = (d.y + 1) * T;
    const mk = (o) => ({ ...base, e2: true, st: 0, cd: 0.6 + Math.random(), ...o });
    switch (d.type) {
      case 'spitter': return mk({ w: 22, h: 20, x: fx - 11, y: fy - 20, hp: 3, beads: 4, state: 'idle', hx: fx, face: -1 });
      case 'shell': return mk({ w: 44, h: 28, x: fx - 22, y: fy - 28, hp: 8, beads: 10, state: 'walk', armorT: 0, heavyBody: true });
      case 'lurker': return mk({ w: 28, h: 24, x: fx - 14, y: fy + 50, hp: 3, beads: 5, state: 'hidden', fy, cd: 0.5 });
      case 'bats': { // три мыши висят под потолком (d.y — первая свободная клетка под ним)
        const sq = { bats: [], awake: false, t: 1, n: 0 };
        return [-22, 0, 22].map((ox, k) => {
          const b = mk({ type: 'bat', w: 20, h: 16, x: fx + ox - 10, y: d.y * T, hx: fx + ox, hy: d.y * T, hp: 2, beads: 2, state: 'roost', k, sq, order: 0, g: k ? this.add.graphics().setDepth(4) : base.g });
          sq.bats.push(b); return b;
        });
      }
    }
    return null;
  },

  // ----- броня и неуязвимость: true — удар не засчитан (guest — вызов на стороне гостя, урона нет, только отклик) -----
  e2Blocked(e, p, guest) {
    if (!e.e2) return false;
    if (e.type === 'lurker') return !E2_VULN.includes(e.state);
    if (e.type !== 'shell' || e.armorT > 0 || this._e2burst || p.heavy || p.atkDir === 'd') return false;
    // панцирь: обычный удар отскакивает; пробивает тяжёлый финишер, удар вниз, отбив (броня трескается на 3 с) и всполох нити
    e.blockT = 0.15;
    Snd.play('clink');
    const fx = e.x + e.w / 2 + Math.sign(p.x + 7 - (e.x + e.w / 2)) * e.w * 0.4, fy = e.y + e.h * 0.45;
    this.parts.setParticleTint(0xffe3a3); this.parts.explode(8, fx, fy);
    if (!guest && !p.remote) { if (this.online === 'host') { this.sendEv({ k: 'snd', n: 'clink' }); this.sendEv({ k: 'burst', n: 8, x: Math.round(fx), y: Math.round(fy), c: 0xffe3a3 }); } }
    if (!p.remote) this.hitstop = 0.03;
    if (!this._shellHint && !p.remote) { this._shellHint = true; this.ui().toast('Панцирь не пробить обычным ударом: нужен тяжёлый (3-й удар), удар вниз или отбив'); }
    return true;
  },
  // отбив ломает броню рядом стоящим панцирям; у гостя отбив считается у него, поэтому сообщаем хосту
  e2Parry(cx, cy) {
    for (const e of this.enemies) {
      if (e.dead || e.type !== 'shell' || Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) > 110) continue;
      e.state = 'stun'; e.st = 0.8; e.armorT = 3; e.vx = 0; e.flash = 0.15;
      this.burst(14, e.x + e.w / 2, e.y + e.h / 2, 0xffa040); this.sfx('slam');
      if (!this._crackHint) { this._crackHint = true; this.toastAll('Броня треснула — бей!'); }
    }
  },

  // ----- снимок -----
  packEnemy2(e) {
    if (!e.e2) return 0;
    return [Math.max(0, E2_STATES[e.type].indexOf(e.state)), Math.round(Math.max(0, e.st) * 100) / 100, e.armorT > 0 ? 1 : 0, e.blockT > 0 ? 1 : 0];
  },
  applyEnemy2(e, a) {
    if (!e.e2 || !a) return;
    const L = E2_STATES[e.type]; e.state = L[a[0]] || L[0]; e.st = a[1]; e.armorT = a[2] ? 1 : 0; if (a[3]) e.blockT = 0.15;
  },

  // ----- ИИ -----
  stepEnemy2(e, dt) {
    if (e.blockT > 0) e.blockT -= dt;
    if (e.type === 'spitter') this.stepSpitter(e, dt);
    else if (e.type === 'shell') this.stepShell(e, dt);
    else if (e.type === 'bat') this.stepBat(e, dt);
    else if (e.type === 'lurker') this.stepLurker(e, dt);
  },
  // отброс после удара; fly — летающие без гравитации
  e2Knock(e, dt, fly) {
    if (e.kbT <= 0) return false;
    e.kbT -= dt; e.vx = e.kbx * (e.heavyBody ? 0.45 : 1);
    e.vy = fly ? e.kby : Math.min(e.vy + P.G * dt, P.MAXFALL);
    this.moveBody(e, dt); return true;
  },
  ledgeAhead(e) { const fx = e.face > 0 ? e.x + e.w + 2 : e.x - 2; return e.onGround && !this.groundBelowSolid(fx, e.y + e.h + 4); },

  // (1) Плевальщик: держит дистанцию и плюёт дугой; вблизи убегает, в углу перепрыгивает через игрока
  stepSpitter(e, dt) {
    e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
    if (this.e2Knock(e, dt, false)) return;
    e.st -= dt; e.cd -= dt;
    const [tp, d] = this.nearestPlayer(e.x + e.w / 2, e.y + e.h / 2);
    const dx = tp ? tp.x + 7 - (e.x + e.w / 2) : 0, ad = Math.abs(dx), dy = tp ? tp.y + 13 - (e.y + e.h / 2) : 0, away = dx > 0 ? -1 : 1;
    switch (e.state) {
      case 'idle':
        e.vx = 0;
        if (!tp || d > 480) { // дежурит возле места
          if (Math.abs(e.x - e.hx) > 50) e.face = e.x < e.hx ? 1 : -1;
          else if (e.hitL || e.hitR || this.ledgeAhead(e) || Math.random() < dt * 0.3) e.face = -e.face;
          e.vx = e.face * 28; if (this.ledgeAhead(e)) { e.face = -e.face; e.vx = 0; }
        } else {
          e.face = dx > 0 ? 1 : -1;
          if (ad < 115 && Math.abs(dy) < 90) { e.state = 'flee'; e.st = 0.9; }
          else if (e.cd <= 0 && ad <= 420 && Math.abs(dy) < 200) { e.state = 'wind'; e.st = 0.65; this.sfx('spit'); }
        }
        break;
      case 'flee':
        e.face = away; e.vx = away * 150;
        if (this.ledgeAhead(e) || e.hitL || e.hitR) { // загнали в угол — прыжок через игрока
          e.state = 'hop'; e.vy = -430; e.vx = -away * 210; e.face = -away; e.st = 0.2;
        } else if (e.st <= 0 && ad > 170) { e.state = 'idle'; e.cd = Math.min(e.cd, 0.35); }
        break;
      case 'hop':
        if (e.onGround && e.st <= 0) { e.state = 'idle'; e.cd = 0.5; e.vx = 0; }
        break;
      case 'wind': // щёки раздуваются: время уйти с линии
        e.vx = 0; if (tp) e.face = dx > 0 ? 1 : -1;
        if (e.st <= 0) { if (tp) this.spitAt(e, tp); e.state = 'recover'; e.st = 0.5; e.cd = 2.0; }
        break;
      case 'recover': e.vx = 0; if (e.st <= 0) e.state = 'idle'; break;
    }
    this.moveBody(e, dt);
  },
  spitAt(e, tp) {
    const ox = e.x + e.w / 2 + e.face * 10, oy = e.y + 6, G = 700;
    const tx = tp.x + 7 + clamp((tp.vx || 0) * 0.2, -40, 40), ty = tp.y + 13;
    const tf = clamp(Math.abs(tx - ox) / 260, 0.45, 1.1);
    this.projs.push({ kind: 'glob', x: ox - 6, y: oy - 6, w: 12, h: 12, vx: clamp((tx - ox) / tf, -420, 420), vy: clamp((ty - oy - 0.5 * G * tf * tf) / tf, -800, 400), life: 3.2 });
    this.sfx('spit'); this.burst(5, ox, oy, 0xc7f08a);
  },

  // (2) Жук-панцирь: разбег → вращение; бронирован (см. e2Blocked), врезавшись в стену, оглушает себя и трескает броню
  stepShell(e, dt) {
    e.armorT = Math.max(0, (e.armorT || 0) - dt);
    e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
    if (this.e2Knock(e, dt, false)) return;
    e.st -= dt;
    const [tp] = this.nearestPlayer(e.x + e.w / 2, e.y + e.h / 2);
    const dx = tp ? tp.x + 7 - (e.x + e.w / 2) : 0, dy = tp ? tp.y + 26 - (e.y + e.h) : 0, sees = tp && Math.abs(dx) < 300 && Math.abs(dy) < 60;
    switch (e.state) {
      case 'walk':
        if (this.ledgeAhead(e) || e.hitL || e.hitR) e.face = -e.face;
        e.vx = e.face * 32;
        if (sees && Math.sign(dx) === e.face) { e.state = 'wind'; e.st = 0.7; e.vx = 0; this.sfx('roar'); }
        else if (sees && Math.abs(dx) < 140) e.face = Math.sign(dx) || e.face; // видит за спиной — разворачивается
        break;
      case 'wind': // встаёт на дыбы и скребёт землёй
        e.vx = 0; if (Math.random() < dt * 25) this.dust.explode(1, e.x + e.w / 2 - e.face * 16, e.y + e.h);
        if (e.st <= 0) { e.state = 'rush'; e.st = 1.0; }
        break;
      case 'rush':
        e.vx = e.face * 320;
        if (Math.random() < dt * 20) this.dust.explode(1, e.x + e.w / 2 - e.face * 18, e.y + e.h);
        if (this.ledgeAhead(e) || e.st <= 0) { e.state = 'spin'; e.st = 1.5; e.vx = e.face * 250; this.sfx('slash'); }
        break;
      case 'spin': // свернулся в шар и катается, отскакивая от стен и краёв
        e.vx = e.face * 250;
        if (this.ledgeAhead(e)) e.face = -e.face;
        if (Math.random() < dt * 14) { this.parts.setParticleTint(0xffe3a3); this.parts.explode(1, e.x + e.w / 2, e.y + e.h); }
        if (e.st <= 0) { e.state = 'tire'; e.st = 0.9; e.vx = 0; }
        break;
      case 'tire': e.vx = 0; if (e.st <= 0) { e.state = 'walk'; e.face = -e.face; } break; // отдышка: броня всё ещё цела
      case 'stun': e.vx = 0; if (e.st <= 0) { e.state = 'walk'; e.face = -e.face; } break;
    }
    this.moveBody(e, dt);
    if ((e.hitL || e.hitR) && e.state === 'rush') { // врезался в стену: оглушён, броня треснула
      e.state = 'stun'; e.st = 1.3; e.armorT = 1.3; e.vx = 0; this.shake(120, 0.006); this.sfx('slam');
      this.burst(10, e.x + e.w / 2 + e.face * 20, e.y + e.h / 2, 0xffa040);
    } else if ((e.hitL || e.hitR) && e.state === 'spin') e.face = -e.face;
  },

  // (3) Стая мышей: висят под потолком; проснувшись, кружат над игроком, а по очереди пикируют
  stepBat(e, dt) {
    const sq = e.sq;
    if (sq.bats.find((b) => !b.dead) === e) this.batSquad(sq, dt);
    if (e.kbT > 0 && (e.state === 'dive' || e.state === 'wind')) { e.state = 'rise'; e.st = 0.8; }
    if (this.e2Knock(e, dt, true)) return;
    e.st -= dt;
    const [tp] = this.nearestPlayer(e.x + 10, e.y + 8), cx = e.x + 10, cy = e.y + 8;
    const steer = (tx, ty, spd, k) => {
      const dx = tx - cx, dy = ty - cy, dl = Math.hypot(dx, dy) || 1;
      e.vx += ((dx / dl) * spd - e.vx) * Math.min(1, dt * k); e.vy += ((dy / dl) * spd - e.vy) * Math.min(1, dt * k);
    };
    const above = () => ({ x: tp ? clamp(tp.x + 7 + (e.k - 1) * 70 + Math.sin(e.t * 1.3 + e.k * 2) * 26, e.hx - 340, e.hx + 340) : e.hx, y: tp ? Math.max(tp.y - 105 + Math.sin(e.t * 2 + e.k) * 14, e.hy + 36) : e.hy + 40 });
    switch (e.state) {
      case 'roost': e.vx = e.vy = 0; e.x = e.hx - 10; e.y = e.hy; return;
      case 'hover': { const a = above(); steer(a.x, a.y, 120, 2.4); e.face = e.vx >= 0 ? 1 : -1; break; }
      case 'wind': // замирает, багровеют глаза, потом бросок в то место, где был игрок
        e.vx += (0 - e.vx) * Math.min(1, dt * 8); e.vy += (-25 - e.vy) * Math.min(1, dt * 8);
        if (tp) e.face = tp.x + 7 > cx ? 1 : -1;
        if (e.st <= 0 && tp) {
          const ax = tp.x + 7 + clamp((tp.vx || 0) * 0.12, -30, 30) - cx, ay = tp.y + 16 - cy, dl = Math.hypot(ax, ay) || 1;
          e.vx = (ax / dl) * 400; e.vy = (ay / dl) * 400; e.state = 'dive'; e.st = 1.0; this.sfx('dash');
        } else if (e.st <= 0) { e.state = 'rise'; e.st = 0.5; }
        break;
      case 'dive': {
        const rx = tp ? tp.x + 7 - cx : 0, ry = tp ? tp.y + 13 - cy : 0;
        if (e.st <= 0 || e.onGround || e.hitL || e.hitR || e.hitU || (tp && rx * e.vx + ry * e.vy < 0 && Math.hypot(rx, ry) > 30)) { e.state = 'rise'; e.st = 0.9; }
        break;
      }
      case 'rise': {
        const home = !sq.awake, a = above();
        steer(home ? e.hx : a.x, home ? e.hy + 8 : a.y, 150, 3); e.face = e.vx >= 0 ? 1 : -1;
        if (home && Math.hypot(e.hx - cx, e.hy + 8 - cy) < 10) { e.state = 'roost'; e.vx = e.vy = 0; return; }
        if (!home && e.st <= 0) e.state = 'hover';
        break;
      }
    }
    this.moveBody(e, dt);
  },
  // дирижёр стаи (его ведёт первая живая мышь): будит, выпускает в пике по одной, усыпляет
  batSquad(sq, dt) {
    const alive = sq.bats.filter((b) => !b.dead), lead = alive[0];
    const [tp] = this.nearestPlayer(lead.hx, lead.hy);
    const near = (r) => tp && Math.abs(tp.x + 7 - lead.hx) < r && tp.y + 13 > lead.hy - 80 && tp.y + 13 < lead.hy + 520;
    if (!sq.awake) {
      if (near(300)) { sq.awake = true; sq.t = 1.0; for (const b of alive) if (b.state === 'roost') { b.state = 'hover'; b.vy = 70; } this.sfx('dash'); }
      return;
    }
    if (!near(460)) { sq.awake = false; for (const b of alive) if (b.state === 'hover') { b.state = 'rise'; b.st = 99; } return; } // игрок ушёл — возвращаются на потолок
    sq.t -= dt;
    if (sq.t <= 0) { // пикирует та, что дольше всех не пикировала
      const cand = alive.filter((b) => b.state === 'hover').sort((a, b) => a.order - b.order)[0];
      if (cand) { cand.state = 'wind'; cand.st = 0.55; cand.order = ++sq.n; sq.t = 1.15; this.sfx('spit'); } else sq.t = 0.3;
    }
  },

  // (4) Прыгун-засадник: прячется под полом, ползёт под игроком, трещит землёй и выпрыгивает; потом ещё бросок
  stepLurker(e, dt) {
    const under = E2_UNDER.includes(e.state);
    if (!under) e.vy = Math.min(e.vy + P.G * dt, P.MAXFALL);
    if (!under && this.e2Knock(e, dt, false)) return;
    e.st -= dt; e.cd -= dt;
    const [tp] = this.nearestPlayer(e.x + e.w / 2, e.y + e.h / 2);
    const cx = e.x + e.w / 2, row = Math.round(e.fy / T);
    const px = tp ? tp.x + 7 : 0, onFloor = tp && tp.onGround && Math.abs(tp.y + 26 - e.fy) < 48;
    switch (e.state) {
      case 'hidden':
        e.y = e.fy + 50; e.vx = e.vy = 0;
        if (tp && e.cd <= 0 && onFloor && Math.abs(px - cx) < 170) { e.state = 'track'; e.st = 2.2; }
        break;
      case 'track': {
        e.y = e.fy + 50;
        if (!tp || Math.abs(px - cx) > 280 || Math.abs(tp.y + 26 - e.fy) > 140) { e.state = 'hidden'; e.cd = 1.2; break; }
        const dir = Math.sign(px - cx) || 1, nx = e.x + dir * 150 * dt, col = Math.floor((nx + e.w / 2) / T);
        if (!this.isSolid(col, row - 1) && this.groundBelowSolid(col * T + 4, row * T + 4)) e.x = nx;
        if (Math.abs(px - (e.x + e.w / 2)) < 24 || e.st <= 0) { e.state = 'warn'; e.st = 0.75; this.sfx('squish'); } // замирает там, где остановился
        break;
      }
      case 'warn': // трещины и красный круг на земле: уходи с этого места
        e.y = e.fy + 50;
        if (Math.random() < dt * 20) this.dust.explode(1, cx + (Math.random() - 0.5) * 36, e.fy);
        if (e.st <= 0) { e.state = 'erupt'; e.air = 0; e.y = e.fy - e.h; e.vy = -640; e.vx = 0; this.shake(200, 0.008); this.sfx('slam'); this.dustAt(10, cx, e.fy); }
        break;
      case 'erupt':
        e.air += dt; this.moveBody(e, dt);
        if (e.onGround && e.air > 0.15) { e.state = 'tell'; e.st = 0.35; e.vx = 0; e.fy = e.y + e.h; }
        return;
      case 'tell': // присел перед броском
        e.vx = 0; if (tp) e.face = px > cx ? 1 : -1;
        if (e.st <= 0) { e.state = 'pounce'; e.air = 0; e.vx = e.face * 240; e.vy = -420; this.sfx('jump'); }
        break;
      case 'pounce':
        e.air += dt; this.moveBody(e, dt);
        if (e.onGround && e.air > 0.1) { e.state = 'tired'; e.st = 1.1; e.vx = 0; e.fy = e.y + e.h; }
        return;
      case 'tired': e.vx = 0; if (e.st <= 0) { e.state = 'dig'; e.st = 0.5; e.y = e.fy + 50; this.dustAt(6, cx, e.fy); } break;
      case 'dig': e.y = e.fy + 50; if (e.st <= 0) { e.state = 'hidden'; e.cd = 2.2; } break;
    }
    if (!under || e.state === 'erupt') this.moveBody(e, dt);
  },

  // ----- рисование -----
  drawEnemy2(e, now) {
    const g = e.g; g.clear();
    if (e.type === 'spitter') this.drawSpitter(g, e, now);
    else if (e.type === 'shell') this.drawShell(g, e, now);
    else if (e.type === 'bat') this.drawBat(g, e, now);
    else if (e.type === 'lurker') this.drawLurker(g, e, now);
  },
  drawSpitter(g, e, now) {
    const fl = e.flash > 0, cx = e.x + e.w / 2, fy = e.y + e.h, f = e.face || 1;
    const wind = e.state === 'wind', k = wind ? clamp(1 - e.st / 0.65, 0, 1) : 0, flee = e.state === 'flee' || e.state === 'hop';
    const sx = e.state === 'hop' ? 0.9 : 1, sh = wind ? Math.sin(now * 50) * k : 0;
    g.lineStyle(2, 0x2a3414, 1);
    const lg = flee ? Math.sin(now * 28) * 4 : 0;
    g.lineBetween(cx - 5, fy - 5, cx - 7 + lg, fy); g.lineBetween(cx + 5, fy - 5, cx + 7 - lg, fy);
    g.fillStyle(fl ? 0xffffff : 0x6f8a34, 1); g.fillEllipse(cx + sh, fy - 9, 22 * sx, 16 / sx + k * 2);
    g.fillStyle(fl ? 0xffffff : 0xa9bf5a, 1); g.fillEllipse(cx + sh - 2 * f, fy - 6, 14, 8);
    g.fillStyle(fl ? 0xffffff : (wind ? 0xd5f26a : 0x86a342), 1); g.fillCircle(cx + sh + 7 * f, fy - 10, 6 + k * 5); // щёки раздуваются
    g.fillStyle(0x15200a, 1); g.fillCircle(cx + sh + 8 * f, fy - 16, 3.2);
    g.fillStyle(flee ? 0xffffff : 0xffe36b, 1); g.fillCircle(cx + sh + 8 * f, fy - 16, 2.2);
    g.fillStyle(0x15200a, 1); g.fillCircle(cx + sh + 9 * f, fy - 16, flee ? 0.7 : 1.1);
    if (wind) { // светящийся рот и кольцо-предупреждение
      g.fillStyle(0xc7f08a, 0.5 + 0.4 * k); g.fillCircle(cx + sh + 13 * f, fy - 9, 2 + 3 * k);
      g.lineStyle(1.5, 0xc7f08a, 0.3 + 0.4 * Math.abs(Math.sin(now * 24))); g.strokeCircle(cx + 13 * f, fy - 9, 6 + 10 * k);
    }
    if (e.state === 'recover') { g.fillStyle(0xc7f08a, 0.7); g.fillCircle(cx + 15 * f, fy - 7 + Math.sin(now * 20), 1.6); }
  },
  drawShell(g, e, now) {
    const fl = e.flash > 0, cx = e.x + e.w / 2, fy = e.y + e.h, f = e.face || 1, cracked = e.armorT > 0, st = e.state;
    const blink = cracked && Math.sin(now * 22) > 0;
    const plate = fl ? 0xffffff : (cracked ? 0x7a5a48 : 0x5a6470), shine = fl ? 0xffffff : (cracked ? 0xa07a5c : 0x8d9aab), rim = 0x20262e;
    if (st === 'spin') { // шар: вращающиеся швы
      const cy = fy - 16, a = now * 20 * f;
      g.fillStyle(plate, 1); g.fillCircle(cx, cy, 16); g.lineStyle(2.5, rim, 1); g.strokeCircle(cx, cy, 16);
      g.lineStyle(2, shine, 1); for (let i = 0; i < 3; i++) g.lineBetween(cx + Math.cos(a + i * 2.1) * 4, cy + Math.sin(a + i * 2.1) * 4, cx + Math.cos(a + i * 2.1) * 15, cy + Math.sin(a + i * 2.1) * 15);
      g.fillStyle(0xffe3a3, 0.5); g.fillEllipse(cx - f * 14, fy - 1, 22, 4); // след от искр
    } else {
      const wind = st === 'wind', rush = st === 'rush';
      const k = wind ? clamp(1 - e.st / 0.7, 0, 1) : 0, sh = wind ? Math.sin(now * 60) * 1.8 : 0, x = cx + sh;
      const lean = rush ? 3 * f : -k * 3 * f, rise = wind ? k * 5 : 0;
      g.lineStyle(2.4, rim, 1); const lg = rush ? Math.sin(now * 40) * 4 : st === 'walk' ? Math.sin(now * 9) * 2.5 : 0;
      for (let i = -1; i <= 1; i++) g.lineBetween(x + i * 12, fy - 7 - rise * 0.5, x + i * 12 + lg * (i % 2 ? 1 : -1), fy);
      g.fillStyle(plate, 1); g.fillEllipse(x + lean, fy - 14 - rise, 44, 26 + rise * 0.3);
      g.fillStyle(shine, 1); g.fillEllipse(x + lean - 4 * f, fy - 20 - rise, 26, 9);
      g.lineStyle(2, rim, 1); g.lineBetween(x + lean, fy - 26 - rise, x + lean - 2 * f, fy - 4 - rise);
      g.lineBetween(x + lean - 10, fy - 24 - rise, x + lean - 12, fy - 8 - rise); g.lineBetween(x + lean + 10, fy - 24 - rise, x + lean + 12, fy - 8 - rise);
      g.fillStyle(0xcfc6a8, 1); g.fillTriangle(x + lean + 18 * f, fy - 16 - rise, x + lean + 34 * f, fy - 22 - rise, x + lean + 20 * f, fy - 8 - rise); // рог
      g.fillStyle(wind || rush ? 0xff4d3c : 0xffb347, 1); g.fillCircle(x + lean + 15 * f, fy - 12 - rise, 2.8);
      if (st === 'stun' || st === 'tire') { g.fillStyle(0xffe3a3, 0.8); for (let i = 0; i < 3; i++) g.fillCircle(x + Math.cos(now * 6 + i * 2.1) * 14, fy - 34 + Math.sin(now * 6 + i * 2.1) * 4, 2); }
    }
    if (cracked) { // раскалённые трещины: броню можно пробить
      g.lineStyle(2, blink ? 0xffffff : 0xffa040, 1);
      g.lineBetween(cx - 8, fy - 24, cx - 2, fy - 16); g.lineBetween(cx - 2, fy - 16, cx - 7, fy - 8); g.lineBetween(cx + 6, fy - 25, cx + 10, fy - 14);
    }
    if (e.blockT > 0) { g.lineStyle(2.5, 0xffffff, 0.9); g.strokeCircle(cx, fy - 14, 24 + (0.15 - e.blockT) * 80); e.blockT -= 1 / 60; }
  },
  drawBat(g, e, now) {
    const fl = e.flash > 0, cx = e.x + e.w / 2, cy = e.y + e.h / 2, f = e.face || 1, st = e.state;
    if (st === 'roost') { // висит вниз головой, крылья сложены
      g.fillStyle(0x2a2233, 1); g.fillEllipse(cx, cy + 2, 10, 14); g.fillTriangle(cx - 5, cy - 4, cx - 12, cy + 8, cx - 1, cy + 8); g.fillTriangle(cx + 5, cy - 4, cx + 12, cy + 8, cx + 1, cy + 8);
      g.fillStyle(0x5a3f66, 1); g.fillCircle(cx, cy + 8, 4); g.fillStyle(0xff9a7a, 0.7); g.fillCircle(cx - 1.5, cy + 9, 1); g.fillCircle(cx + 1.5, cy + 9, 1);
      return;
    }
    const wind = st === 'wind', dive = st === 'dive', k = wind ? clamp(1 - e.st / 0.55, 0, 1) : 0;
    const flap = dive ? 0.3 : Math.sin(now * (wind ? 38 : 24) + e.k * 2), sh = wind ? Math.sin(now * 70) * 1.6 * k : 0, x = cx + sh;
    if (dive) { g.lineStyle(2, 0xff7a6b, 0.35); g.lineBetween(x, cy, x - (e.vx || 0) * 0.07, cy - (e.vy || 0) * 0.07); }
    g.fillStyle(fl ? 0xffffff : 0x3a2a48, 1);
    g.fillTriangle(x - 3, cy - 2, x - 20, cy - 8 - flap * 9, x - 14, cy + 6); g.fillTriangle(x + 3, cy - 2, x + 20, cy - 8 - flap * 9, x + 14, cy + 6);
    g.fillStyle(fl ? 0xffffff : 0x5a3f66, 1); g.fillEllipse(x, cy, 12, 14);
    g.fillTriangle(x - 5, cy - 6, x - 3, cy - 12, x - 1, cy - 6); g.fillTriangle(x + 5, cy - 6, x + 3, cy - 12, x + 1, cy - 6);
    g.fillStyle(wind || dive ? 0xff3a2a : 0xffb347, 1); g.fillCircle(x - 2 * f + 1, cy - 2, 1.8); g.fillCircle(x + 3 * f, cy - 2, 1.8);
    if (wind) { g.lineStyle(1.5, 0xff3a2a, 0.3 + 0.5 * k); g.strokeCircle(x, cy, 10 + 8 * k); }
  },
  drawLurker(g, e, now) {
    const fl = e.flash > 0, cx = e.x + e.w / 2, st = e.state, f = e.face || 1;
    if (E2_UNDER.includes(st)) e.fy = e.y - 50; // гость: уровень пола вычисляется из положения
    const fy = e.fy;
    if (st === 'hidden') { // еле заметные трещинки и пыль
      g.lineStyle(1.5, 0x1b120a, 0.5); g.lineBetween(cx - 12, fy, cx - 4, fy - 1.5); g.lineBetween(cx + 3, fy - 1, cx + 13, fy);
      g.fillStyle(0x6b5a44, 0.35); g.fillEllipse(cx, fy - 1, 22, 3);
      return;
    }
    if (st === 'track') { // ползущий бугор
      const w = 30 + Math.sin(now * 20) * 3;
      g.fillStyle(0x4a3a2a, 0.9); g.fillEllipse(cx, fy - 2, w, 8); g.fillStyle(0x7a6850, 0.8); g.fillEllipse(cx, fy - 4, w * 0.6, 4);
      g.lineStyle(1.5, 0x2a1d10, 0.8); for (let i = -2; i <= 2; i++) g.lineBetween(cx + i * 7, fy - 1, cx + i * 9, fy + 2);
      return;
    }
    if (st === 'warn') { // красная печать, трещины, камешки
      const k = clamp(1 - e.st / 0.75, 0, 1), p = Math.abs(Math.sin(now * (14 + 14 * k)));
      g.fillStyle(0xd23a2a, 0.15 + 0.25 * p); g.fillEllipse(cx, fy - 1, 54, 12);
      g.lineStyle(2, 0xff5a3a, 0.5 + 0.5 * p); g.strokeEllipse(cx, fy - 1, 54 * (0.6 + 0.4 * k), 12);
      g.lineStyle(2, 0x1b120a, 1); for (let i = 0; i < 5; i++) { const a = i * 1.25 - 2.5; g.lineBetween(cx, fy, cx + Math.cos(a) * 26, fy + Math.sin(a) * 5); }
      g.fillStyle(0x7a6850, 1); for (let i = 0; i < 4; i++) g.fillRect(cx - 14 + i * 9, fy - 3 - k * 10 * ((i * 37) % 5 / 5 + 0.3) - Math.abs(Math.sin(now * 18 + i)) * 3, 3, 3);
      return;
    }
    // тело: присел перед броском / дигинг (сплющивается в землю) / обычное
    let sy = 1, by = e.y + e.h;
    if (st === 'dig') { sy = clamp(e.st / 0.5, 0.05, 1); by = fy; }
    if (st === 'tell') sy = 0.8 + 0.1 * Math.sin(now * 50);
    const h = 24 * sy, y0 = by - h, sh = st === 'tell' ? Math.sin(now * 60) * 1.4 : 0, x = cx + sh;
    g.fillStyle(fl ? 0xffffff : 0x7a5434, 1); g.fillEllipse(x, y0 + h * 0.6, 28, h * 0.9);
    g.fillStyle(fl ? 0xffffff : 0xa87a4c, 1); g.fillEllipse(x - 3 * f, y0 + h * 0.4, 16, h * 0.35);
    g.fillStyle(fl ? 0xffffff : 0x4a3220, 1); for (let i = -1; i <= 1; i++) g.fillTriangle(x + i * 8 - 3, y0 + h * 0.3, x + i * 8 + 3, y0 + h * 0.3, x + i * 8, y0 - 5 * sy);
    g.fillStyle(0x1b120a, 1); g.fillEllipse(x + 8 * f, y0 + h * 0.65, 9, 7 * sy); // пасть
    g.fillStyle(st === 'tell' || st === 'pounce' || st === 'erupt' ? 0xff3a2a : 0xffe36b, 1); g.fillCircle(x + 7 * f, y0 + h * 0.35, 2.2);
    if (st === 'tired') { g.fillStyle(0xffe3a3, 0.8); for (let i = 0; i < 3; i++) g.fillCircle(x + Math.cos(now * 6 + i * 2.1) * 12, y0 - 8 + Math.sin(now * 6 + i * 2.1) * 3, 2); }
  },
});

// ----- обёртки без правок чужих файлов -----
(function () {
  const proto = GameScene.prototype;
  // плевок: дуга под гравитацией
  const stepExtra = proto.stepExtraProj;
  proto.stepExtraProj = function (pr, dt) {
    if (pr.kind !== 'glob') return stepExtra.call(this, pr, dt);
    pr.vy += 700 * dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (this.isSolid(Math.floor((pr.x + 6) / T), Math.floor((pr.y + 6) / T))) { pr.dead = true; this.burst(7, pr.x + 6, pr.y + 6, 0xc7f08a); }
    return true;
  };
  const drawExtra = proto.drawExtraProjs;
  proto.drawExtraProjs = function (now) {
    drawExtra.call(this, now);
    const fx = this.fx;
    for (const pr of this.projs) if (pr.kind === 'glob') {
      const x = pr.x + 6, y = pr.y + 6;
      fx.fillStyle(0xc7f08a, 0.2); fx.fillCircle(x, y, 11);
      fx.fillStyle(0x86a342, 1); fx.fillCircle(x, y, 6.5); fx.fillStyle(0xd5f26a, 1); fx.fillCircle(x - 1.5, y - 1.5, 3);
      fx.fillStyle(0x86a342, 0.6); fx.fillCircle(x - pr.vx * 0.02, y - pr.vy * 0.02, 3.5); // хвостик капли
    }
  };
  // отбив ломает броню панциря (у гостя — через событие)
  const parry = proto.parrySuccess;
  proto.parrySuccess = function (p, srcX) {
    parry.call(this, p, srcX);
    const cx = p.x + 7, cy = p.y + 13;
    if (this.auth()) this.e2Parry(cx, cy); else this.sendEv({ k: 'e2parry', x: Math.round(cx), y: Math.round(cy) });
  };
  const onEv = proto.onEv;
  proto.onEv = function (m) {
    if (m.k === 'e2parry') { if (this.auth()) this.e2Parry(m.x, m.y); return; }
    return onEv.call(this, m);
  };
  // нитяной всполох пробивает броню
  const burstHit = proto.silkBurstHit;
  proto.silkBurstHit = function (p, cx, cy) { this._e2burst = true; try { burstHit.call(this, p, cx, cy); } finally { this._e2burst = false; } };
})();
