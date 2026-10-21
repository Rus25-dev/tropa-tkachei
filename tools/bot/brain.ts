// Мозг ИИ-тестера на ядре v2: перенос legacy/tools/botbrain.js. Чистая функция «состояние мира → кадр ввода» (метод act),
// без DOM, Phaser и часов: всё, что бот «решает случайно» (зевки, промахи, задержка реакции), берётся из ГСЧ с зерном.
// Идея: бот «видит» только то, что заметил (задержка реакции зависит от мастерства), предсказывает траектории снарядов
// и тел боссов и ищет безопасный путь поиском по лучу (шаги по 1/30 с, блоки по 0.1 с, горизонт 1.2 с).
// Мастерство (skill) 0..1 меняет: задержку реакции, «зевки» внимания, пропуски угроз, доступные приёмы
// (рывок, отбив, всполох, казнь) и ширину поиска. Бот не читает будущие решения босса — только его телеграфы.
/* eslint-disable @typescript-eslint/no-explicit-any -- прямой перенос JS-мозга v1.8: сущности ядра — «мешки» полей */
import { T } from '../../src/core/balance';
import { tdGeo } from '../../src/core/misha';
import { mulberry32 } from '../../src/core/rng';
import type { Inp } from '../../src/core/types';
import type { World } from '../../src/core/world';

const DT = 1 / 30, BLOCK = 3, NS = 36, DEPTH = 12;
// скорости и тайминги мозга зашиты как в v1.8: бот моделирует игру по своей модели, а не читает баланс (иначе правка баланса «чинила» бы бота сама)
const RUN = 230, JUMP = 700, GR = 1500, DASHV = 540, CUT = 0.45;
const SKIP = new Set(['bomb', 'ringfx', 'staffghost', 'mark']);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const ovl = (a: any, b: any): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const mishaBag = (m: any): { x: number; y: number; w: number; h: number } => { const cx = m.x + m.w / 2; return { x: cx - 26 * m.face - 15, y: m.y + 12, w: 30, h: 40 }; };

interface Act { dir: number; jump: number; dash: number; parry: number; cost: number }
// действия блока: направление, прыжок (удержание), рывок, отбив
const ACTS: Act[] = [];
for (const j of [0, 1]) for (const d of [-1, 0, 1]) ACTS.push({ dir: d, jump: j, dash: 0, parry: 0, cost: j ? 0.12 : 0 });
for (const d of [-1, 1]) ACTS.push({ dir: d, jump: 0, dash: 1, parry: 0, cost: 0.35 });
for (const d of [-1, 0, 1]) ACTS.push({ dir: d, jump: 0, dash: 0, parry: 1, cost: 0.3 });

export interface BrainStats { hurt: Record<string, number>; parry: number; pdodge: number; exec: number; stag: number; plans: number; burst: number; bombs: number; bombHits: number }

/** Мозг одного героя. sc — мир ядра, idx — номер героя, skill — мастерство 0..1, seed — зерно решений бота */
export class Brain {
  readonly i: number; readonly s: number;
  readonly rng: () => number;
  readonly react: number; readonly missP: number; readonly lapseRate: number; readonly errRate: number;
  readonly canPerfect: boolean; readonly canDash: boolean; readonly canParry: boolean; readonly canBurst: boolean; readonly canExec: boolean;
  readonly beamW: number; readonly depth: number;
  seen = new WeakMap<object, { f: number; k: number }>();
  frame = 0; lapse = 0; prev: Record<string, boolean> = {}; planAt = -99;
  e: any = { x: 0, y: 0, w: 14, h: 26, vx: 0, vy: 0, onGround: false, noPlat: false };
  stateSince: { s: string | null; f: number } = { s: null, f: 0 };
  stats: BrainStats = { hurt: {}, parry: 0, pdodge: 0, exec: 0, stag: 0, plans: 0, burst: 0, bombs: 0, bombHits: 0 };
  poseCache: { key: string; f: number; v: any } | null = null;
  errT = 0; errDir = 0; errJump = false;
  lastBT: any = null; lastBest: any = null; lastHits = 0; lastTh = 0; lastThreats: any[] = [];
  private _tdRound?: number; private _tdSeen = 0; private _kn?: number; private _lcF = 0; private _tdWrong = 0;
  dbg = '';

  constructor(readonly sc: World, idx: number, skill: number, seed: number) {
    this.i = idx; this.s = skill; this.rng = mulberry32(seed || 1);
    const s = skill;
    this.react = Math.round(9 + 26 * (1 - s));              // кадров до того, как угроза замечена (0.95 → 10, 0.6 → 19, 0.3 → 27)
    this.missP = 0.3 * (1 - s);                             // шанс «проморгать» угрозу (реакция ×2.2)
    this.lapseRate = 0.5 * Math.pow(1 - s, 1.5);            // зевков в секунду
    this.errRate = 0.012 * Math.pow(1 - s, 1.2);            // промахов по кнопкам на кадр (0.95 → раз в 50 с, 0.6 → раз в 4 с, 0.3 → раз в 1.7 с)
    this.canPerfect = s >= 0.85;                            // идеальный отбив (отбив 2.0) по телеграфу — только у опытных; ниже — обычный
    this.canDash = s >= 0.35; this.canParry = s >= 0.7; this.canBurst = s >= 0.7; this.canExec = s >= 0.45;
    this.beamW = s >= 0.8 ? 40 : s >= 0.5 ? 28 : 16;
    this.depth = s >= 0.8 ? DEPTH : s >= 0.5 ? 10 : 8;
  }

  // ---------- восприятие ----------
  vis(obj: object): boolean {
    let r = this.seen.get(obj);
    if (!r) { r = { f: this.frame, k: this.rng() < this.missP ? 2.2 : 1 }; this.seen.set(obj, r); }
    return this.frame - r.f >= this.react * r.k;
  }
  // траектория снаряда на NS шагов: позиции и «активность» (после задержки/пока жив)
  trajProj(pr: any, p: any): any {
    const sc = this.sc, n = NS + 1, X = new Float32Array(n), Y = new Float32Array(n), ON = new Uint8Array(n), L = sc.L as any;
    let x = pr.x, y = pr.y, vx = pr.vx || 0, vy = pr.vy || 0, d = pr.delay > 0 ? pr.delay : 0, life = pr.life == null ? 9 : pr.life;
    let t0 = pr.t0 > 0 ? pr.t0 : 0, launched = !!pr.launched, bounces = pr.bounces || 0;
    const ax = pr.ax || 0, kind = pr.kind, w = pr.w, ppx = p.x + 7, ppy = p.y + 13;
    let ang = pr.ang || 0, alive = true;
    const tm: any = sc.tima, tcx = tm ? tm.x + tm.w / 2 : 0, tcy = tm ? tm.y + 34 : 0, hyper = tm && tm.hyper > 0;
    for (let i = 0; i < n; i++) {
      X[i] = x; Y[i] = y; ON[i] = (alive && d <= 0 && life > 0) ? 1 : 0;
      if (i === NS) break;
      for (let s = 0; s < 2; s++) {
        const h = DT / 2;
        if (d > 0) { d -= h; continue; }
        life -= h; if (life <= 0 || !alive) continue;
        switch (kind) {
          case 'spore': vy += 700 * h; x += vx * h; y += vy * h; break;
          case 'wave': case 'rwave': case 'echo': x += vx * h; break;
          case 'roller': x += vx * h; if (x < T || x + w > (L.W - 1) * T) { vx = -vx; x = clamp(x, T, (L.W - 1) * T - w); } break;
          case 'rock': vy = Math.min(vy + 1100 * h, 800); y += vy * h; break;
          case 'letter':
            if (!launched) { launched = true; const dx = ppx - (x + 11), dy = ppy - (y + 13), l = Math.hypot(dx, dy) || 1; vx = dx / l * pr.spd; vy = dy / l * pr.spd; }
            x += vx * h; y += vy * h; break;
          case 'bigletter': vy = Math.min(vy + 1100 * h, 820); y += vy * h; if (y + 60 > L.floorY * T) alive = false; break;
          case 'clef':
            if (t0 > 0) { t0 -= h; break; }
            vx += ax * h; x += vx * h; y += Math.sin(life * 6) * 30 * h;
            if (x < T || x + w > (L.W - 1) * T) { vx = -vx * 0.6; x = clamp(x, T, (L.W - 1) * T - w); }
            break;
          case 'note': vy = Math.min(vy + 900 * h, 700); x += vx * h; y += vy * h; break;
          case 'drip': vy = Math.min(vy + 900 * h, 600); y += vy * h; break;
          case 'bottle': vy = Math.min(vy + 1100 * h, 800); x += vx * h; y += vy * h; break;
          case 'box':
            vy = Math.min(vy + 1100 * h, 800); x += vx * h; y += vy * h;
            if (vy > 0 && sc.isSolid(Math.floor((x + 18) / T), Math.floor((y + 22) / T))) { y = Math.floor((y + 22) / T) * T - 22; if (bounces-- > 0) { vy = -380; vx *= 0.8; } else alive = false; }
            break;
          case 'trophy':
            vy = Math.min(vy + 1100 * h, 820); x += vx * h; y += vy * h;
            if (vy > 0 && sc.isSolid(Math.floor((x + 15) / T), Math.floor((y + 30) / T))) { y = Math.floor((y + 30) / T) * T - 30; if (bounces-- > 0) vy = -320; else alive = false; }
            break;
          case 'stamp': vy = Math.min(vy + 1300 * h, 900); y += vy * h; if (sc.isSolid(Math.floor((x + 40) / T), Math.floor((y + 44) / T))) alive = false; break;
          case 'rain': y += vy * h; break;
          case 'collector': { const dir = Math.sign(ppx - (x + 11)) || 1; x += dir * (pr.spd || 130) * h; break; }
          case 'pad': {
            const k = 1 - life / 2.2; ang += (pr.spin || 1) * h * (hyper ? 7.5 : 5.5);
            const rad = 20 + Math.min(1, k * 2.2) * 125 * (k > 0.8 ? (1 - k) * 5 : 1);
            x = tcx + Math.cos(ang) * rad - 13; y = tcy + Math.sin(ang) * rad * 0.75 - 9; break;
          }
          default: break; // rootspike, staff: неподвижны
        }
      }
    }
    return { X, Y, ON, w: pr.w, h: pr.h, kind, pad: 2, hk: pr.hk };
  }
  // тело босса: его скорость плюс начало рывка/прыжка, если телеграф уже замечен
  bossThreat(p: any): any {
    const sc = this.sc, b: any = sc.testBoss() || sc.boss;
    if (!b || ['dead', 'gone', 'sleep', 'intro'].includes(b.state) || (sc.misha && b.state === 'cough')) return null;
    const n = NS + 1, X = new Float32Array(n), Y = new Float32Array(n), ON = new Uint8Array(n).fill(1);
    let e: any = { x: b.x, y: b.y, w: b.w, h: b.h, vx: b.vx || 0, vy: b.vy || 0, onGround: !!b.onGround };
    let appear = -1;
    if (b.y < -100) { // «лаги» Тимы: пропал, упадёт на метку — метка видна, так что падение предсказуемо
      if (b.state !== 'lagGone' || b.lagX == null) return null;
      e = { x: b.lagX - b.w / 2, y: 4 * T + 6, w: b.w, h: b.h, vx: 0, vy: 260, onGround: false }; appear = Math.max(0, b.t || 0);
      if (this.frame - this.stateSince.f < this.react) return null;
    }
    const known = this.frame - this.stateSince.f >= this.react;
    const ppx = p.x + 7, bcx = b.x + b.w / 2, face = ppx > bcx ? 1 : -1, ev: any[] = [];
    const st = b.state, tr = Math.max(0, b.t || 0), ph = b.phase || 1;
    if (known) {
      if (sc.vladik) {
        if (st === 'lungeWind') ev.push([tr, (q: any) => { q.vx = face * 760; }], [tr + 0.34, (q: any) => { q.vx = 0; }]);
        if (st === 'lunge') ev.push([tr, (q: any) => { q.vx = 0; }]);
        if (st === 'leapWind') ev.push([tr, (q: any) => { q.vy = -720; q.vx = clamp((ppx - bcx) / 1.0, -380, 380); q.air = 0; }]);
      } else if (sc.misha) {
        const ph2 = b.hp <= b.maxHp / 2;
        if (st === 'chargeWind') ev.push([tr, (q: any) => { q.vx = face * (ph2 ? 520 : 450); }]);
      } else if (sc.tima) {
        if (st === 'lagFall') ev.push([0, (q: any) => { q.vy = Math.max(q.vy, 0); }]);
      } else if (b === sc.boss) {
        if (st === 'chargeWind') ev.push([tr, (q: any) => { q.vx = face * (ph >= 2 ? 460 : 400); }]);
        if (st === 'leapWind') ev.push([tr, (q: any) => { q.vy = -760; q.vx = clamp((ppx - bcx) / 1.0, -400, 400); q.air = 0; }]);
      }
    }
    if (st === 'leap' && b.air != null) e.air = b.air;
    let t = 0;
    for (let i = 0; i < n; i++) {
      X[i] = e.x + 8; Y[i] = e.y + 8; if (appear >= 0) ON[i] = i * DT >= appear ? 1 : 0;
      if (i === n - 1) break;
      if (appear > t) { t += DT; continue; }
      for (const v of ev) if (!v.done && t >= v[0]) { v[1](e); v.done = true; }
      if (e.air != null) e.air += DT;
      e.vy = Math.min(e.vy + GR * DT, 720); sc.moveBody(e, DT);
      if (e.air != null && e.onGround && e.air > 0.15) { e.vx = 0; e.air = null; }
      t += DT;
    }
    return { X, Y, ON, w: b.w - 16, h: b.h - 16, kind: 'body', pad: 0 };
  }
  buildThreats(p: any): any[] {
    const sc = this.sc, out: any[] = [], rx = 430, ry = 340;
    for (const pr of sc.projs as any[]) {
      if (pr.dead || SKIP.has(pr.kind) || pr.w === 0 || !this.vis(pr)) continue;
      const t = this.trajProj(pr, p);
      // отсев: траектория целиком далеко от героя
      let near = false;
      for (let i = 0; i <= NS; i += 2) if (t.ON[i] && Math.abs(t.X[i] + t.w / 2 - p.x) < rx + t.w / 2 && Math.abs(t.Y[i] + t.h / 2 - p.y) < ry + t.h / 2) { near = true; break; }
      if (near) out.push(t);
    }
    const bt = this.bossThreat(p);
    this.lastBT = bt;
    if (bt) { for (let i = 0; i <= NS; i += 2) if (Math.abs(bt.X[i] + bt.w / 2 - p.x) < rx + bt.w / 2 && Math.abs(bt.Y[i] + bt.h / 2 - p.y) < ry + bt.h / 2) { out.push(bt); break; } }
    if (sc.curtains) for (const c of sc.curtains) if (c.slime > 0 && this.vis(c)) {
      const n = NS + 1, X = new Float32Array(n).fill(c.x + 4), Y = new Float32Array(n).fill(c.y), ON = new Uint8Array(n);
      for (let i = 0; i < n; i++) ON[i] = c.slime - i * DT > 0 ? 1 : 0;
      out.push({ X, Y, ON, w: c.w - 8, h: c.h, kind: 'curtain', pad: 0 });
    }
    return out;
  }

  // ---------- поиск по лучу ----------
  rootNode(p: any): any {
    const st = (v: number): number => Math.max(0, Math.floor(v / DT + 1e-6));
    return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, og: !!p.onGround, cd: p.canDash !== false, dcd: Math.max(0, Math.ceil(p.dashCd / DT - 1e-6)), dT: st(p.dashT),
      face: p.face, ud: !!p.usedDouble, jh: !!this.prev['jump'], cut: p.jumpCut !== false, coy: Math.max(0, p.coyote), inv: Math.max(0, Math.ceil((p.inv || 0) / DT - 1e-6)),
      pt: st(p.parryT || 0), pe: typeof p.parryF === 'number' ? Math.floor(p.parryF / 2) : 9, pcd: Math.max(0, Math.ceil((p.parryCd || 0) / DT - 1e-6)), cost: 0, first: null, hits: 0 };
  }
  // Все окна (рывок, отбив, неуязвимость) считаем в шагах планирования и округляем в невыгодную для бота сторону
  stepNode(n: any, a: Act, first: boolean, k: number, threats: any[]): void {
    const sc = this.sc, e = this.e;
    if (n.inv > 0) n.inv--;
    if (n.dcd > 0) n.dcd--;
    if (n.pcd > 0) n.pcd--;
    if (first && a.parry && this.canParry && n.pcd <= 0 && n.pt <= 0 && n.dT <= 0) { n.pt = 5; n.pcd = 20; n.pe = 0; }
    const dir = a.dir;
    let dashing = false;
    if (n.dT > 0) {
      dashing = true; n.dT--; n.vx = n.face * DASHV; n.vy = 0;
      if (n.dT <= 0) n.vx = dir * RUN;
    } else {
      n.vx = dir * RUN; if (dir) n.face = dir;
      if (a.jump && !n.jh) {
        if (n.og || n.coy > 0) { n.vy = -JUMP; n.cut = false; n.og = false; n.coy = 0; }
        else if (sc.abil && sc.abil['double'] && !n.ud) { n.ud = true; n.vy = -JUMP * 0.9; n.cut = false; }
      }
      n.jh = !!a.jump;
      if (!a.jump && n.vy < 0 && !n.cut) { n.vy *= CUT; n.cut = true; }
      n.vy += GR * DT * ((a.jump && Math.abs(n.vy) < 90 && !n.og) ? 0.55 : 1); if (n.vy > 720) n.vy = 720;
      if (first && a.dash && this.canDash && n.dcd <= 0 && (n.og || n.cd)) { dashing = true; n.dT = 4; n.dcd = 14; if (!n.og) n.cd = false; if (dir) n.face = dir; n.vy = 0; n.vx = n.face * DASHV; }
    }
    const x0 = n.x, y0 = n.y;
    e.x = n.x; e.y = n.y; e.vx = n.vx; e.vy = n.vy; sc.moveBody(e, DT);
    n.x = e.x; n.y = e.y; n.vx = e.vx; n.vy = e.vy; n.og = e.onGround;
    if (n.og) { n.cd = true; n.ud = false; n.coy = 0.1; } else n.coy -= DT;
    // столкновения с угрозами
    const px0 = Math.min(x0, n.x) + 2, px1 = Math.max(x0, n.x) + 12, py0 = Math.min(y0, n.y) + 2, py1 = Math.max(y0, n.y) + 24;
    for (let q = 0; q < threats.length; q++) {
      const t = threats[q];
      if (!t.ON[k] && !t.ON[k - 1]) continue;
      const pad = t.pad;
      const tx0 = Math.min(t.X[k - 1], t.X[k]) - pad, tx1 = Math.max(t.X[k - 1], t.X[k]) + t.w + pad, ty0 = Math.min(t.Y[k - 1], t.Y[k]) - pad, ty1 = Math.max(t.Y[k - 1], t.Y[k]) + t.h + pad;
      if (px1 <= tx0 || px0 >= tx1 || py1 <= ty0 || py0 >= ty1) continue;
      if (n.inv > 0) continue;
      // вид удара (отбив 2.0): dodge отбивом не гасится, unblockable не гасится ни отбивом, ни рывком; без hk — как раньше
      const parryable = n.pt > 0 && (t.hk === undefined || t.hk === 'parry');
      if (parryable) { n.inv = 16; n.pt = 0; n.pcd = 5; n.cost -= 1.4; if (t.hk === 'parry' && this.canPerfect && n.pe <= 2) n.cost -= 0.5; } // удар в первые кадры окна — идеальный отбив
      else if (dashing && t.hk !== 'unblockable') { n.inv = 11; n.cost -= this.canDash ? 0.6 : 0; }
      else { n.cost += 100; n.inv = 31; n.hits++; }
    }
    if (n.pt > 0) { n.pt--; n.pe++; }
  }
  // можно ли простоять `steps` шагов (1/30 с) на месте, не получив урона
  safeStay(p: any, threats: any[], steps: number): boolean {
    const n = this.rootNode(p), a = ACTS[1]!;
    for (let k = 1; k <= steps && k <= NS; k++) { this.stepNode(n, a, false, k, threats); if (n.hits) return false; }
    return true;
  }
  // goal(n) -> стоимость позиции за блок
  search(p: any, threats: any[], goal: (n: any, bi: number) => number): any {
    const root = this.rootNode(p); let beam: any[] = [root];
    this.stats.plans++;
    for (let bi = 0; bi < this.depth; bi++) {
      const next = new Map<string, any>();
      for (const n of beam) {
        for (let ai = 0; ai < ACTS.length; ai++) {
          const a = ACTS[ai]!;
          if (a.dash && (!this.canDash || (bi > 0 && n.dcd > 9))) continue;
          if (a.parry && !this.canParry) continue;
          if (a.parry && bi > 3) continue;
          const m = Object.assign({}, n);
          for (let j = 0; j < BLOCK; j++) this.stepNode(m, a, j === 0, bi * BLOCK + j + 1, threats);
          m.cost += a.cost + goal(m, bi);
          if (bi === 0) m.first = a;
          m.path = (n.path || '') + ai.toString(36);
          const key = (m.x / 10 | 0) + ',' + (m.y / 10 | 0) + (m.vy > 50 ? 'd' : m.vy < -50 ? 'u' : 'z') + (m.dT > 0 ? 'D' : '') + (m.inv > 0 ? 'I' : '') + (m.cd ? 'c' : '') + (m.ud ? 'U' : '') + (m.jh ? 'j' : '') + (m.pt > 0 ? 'P' : '') + (m.dcd > 0 ? 'k' : '');
          const old = next.get(key);
          if (!old || old.cost > m.cost) next.set(key, m);
        }
      }
      beam = Array.from(next.values()).sort((u, v) => u.cost - v.cost).slice(0, this.beamW);
      if (!beam.length) break;
    }
    let best = beam[0]; for (const n of beam) if (n.cost < best.cost) best = n;
    this.lastBest = best;
    return best;
  }

  // ---------- главный шаг ----------
  /** Ввод героя на кадр (удержание кнопок). Вызывать перед каждым тиком мира; frame — номер тика боя. */
  act(frame: number): Inp {
    this.frame = frame;
    const sc = this.sc, p: any = sc.players[this.i];
    const inp: Record<string, boolean> = { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false };
    if (!p || p.remote) return inp as Inp;
    const b: any = sc.testBoss() || sc.boss;
    if (b && b.state !== this.stateSince.s) this.stateSince = { s: b.state, f: frame };
    if (sc.td) { this.tdAct(p, inp); return this.finish(inp); }
    if (p.downed) return this.finish(inp);
    // зевок внимания: повторяем прошлый ввод
    if (this.lapse > 0) { this.lapse--; Object.assign(inp, this.prev, { atk: false, dash: false, heal: false, bomb: false }); return this.finish(inp); }
    if (this.lapseRate > 0 && this.rng() < this.lapseRate / 60) { this.lapse = 6 + Math.floor(this.rng() * (6 + 30 * (1 - this.s))); }
    // напарник в коконе
    const partner = sc.players.find((q) => q !== p && q.downed);
    if (partner && Math.abs(partner.x - p.x) < 300) { this.reviveAct(p, partner, inp); return this.finish(inp); }
    if (sc.misha) this.mishaAct(p, inp, b); else this.meleeAct(p, inp, b);
    // промах по кнопкам: несколько кадров движение и прыжок случайные
    if (this.errT > 0 && p.healCh <= 0) {
      this.errT--; inp['left'] = this.errDir < 0; inp['right'] = this.errDir > 0; inp['jump'] = this.errJump; inp['dash'] = false; inp['heal'] = false;
    } else if (this.errRate > 0 && p.healCh <= 0 && this.rng() < this.errRate) { this.errT = 5 + Math.floor(this.rng() * 8); this.errDir = Math.floor(this.rng() * 3) - 1; this.errJump = this.rng() < 0.4; }
    return this.finish(inp);
  }
  private finish(inp: Record<string, boolean>): Inp {
    // фронты нажатий: кнопка действия должна быть отпущена на прошлом кадре
    for (const k of ['atk', 'dash', 'heal', 'bomb']) if (inp[k] && this.prev[k]) inp[k] = false;
    this.prev = Object.assign({}, inp);
    return inp as Inp;
  }
  private reviveAct(p: any, q: any, inp: Record<string, boolean>): void {
    const dx = q.x - p.x;
    if (Math.abs(dx) > 30) inp[dx > 0 ? 'right' : 'left'] = true; else inp['up'] = true;
  }
  // пользоваться ли замечанием: общая часть — выбрать движение
  private move(p: any, inp: Record<string, boolean>, goal: any, threats: any[]): any {
    const near = threats.length > 0;
    let a: Act | null = null;
    if (near) {
      const best = this.search(p, threats, goal);
      a = best.first;
      // нет ли реальной угрозы: если лучший путь тоже получает урон, всё равно идём им
      this.lastHits = best.hits;
    }
    if (a) {
      if (a.dir < 0) inp['left'] = true; else if (a.dir > 0) inp['right'] = true;
      if (a.jump) inp['jump'] = true;
      if (a.dash && !this.slip(0.04 + 0.2 * (1 - this.s))) inp['dash'] = true;
      if (a.parry && !this.slip(0.04 + 0.3 * (1 - this.s))) inp['heal'] = true;
      if (a.dash && p.dashCd <= 0) { if (a.dir < 0) { inp['left'] = true; inp['right'] = false; } else if (a.dir > 0) { inp['right'] = true; inp['left'] = false; } }
      return a;
    }
    // свободное поле: идём к цели
    const n = this.rootNode(p), dx = goal.target(n);
    if (dx < -4) inp['left'] = true; else if (dx > 4) inp['right'] = true;
    return { dir: dx < -4 ? -1 : dx > 4 ? 1 : 0 };
  }
  private slip(prob: number): boolean { return this.rng() < prob; }

  // ---------- бой с обычным боссом ----------
  private meleeAct(p: any, inp: Record<string, boolean>, b: any): void {
    if (!b || ['gone', 'dead', 'sleep'].includes(b.state)) return;
    const cx = b.x + b.w / 2, pcx = p.x + 7, adx = Math.abs(cx - pcx);
    const vuln = !['rage', 'intro', 'roar', 'lagWind'].includes(b.state);
    const stag = b.stagger > 0.25 && !b.executed;
    const half = b.w / 2 - 8 + 5;        // расстояние, ближе которого касание телом
    const lo = half + 12, hi = b.w / 2 + 42; // полоса удара
    // опытный игрок при малом здоровье и пустой нити не лезет в драку, а держит дистанцию и ждёт окно для лечения
    const wary = this.s >= 0.8 && p.hp <= 2 && p.silk < 9 && !(b.stagger > 0.25);
    const hold = (vuln && !wary) ? 0 : 1;
    const by = b.y + b.h / 2;
    const goal: any = (n: any): number => {
      const dx = Math.abs(n.x + 7 - cx);
      let c = 0;
      if (hold) c += Math.abs(dx - 190) / 90;
      else if (dx > hi) c += (dx - hi) / 55; else if (dx < lo) c += (lo - dx) / 25; else c -= 0.6;
      if (!hold && Math.abs(n.y + 13 - by) > 55) c += Math.min(1.2, (Math.abs(n.y + 13 - by) - 55) / 120);
      return c;
    };
    goal.target = (n: any): number => { const dx = cx - (n.x + 7); const ad = Math.abs(dx); if (hold) return ad < 150 ? -Math.sign(dx) * 20 : 0; return ad > hi - 6 ? dx : ad < lo + 4 ? -Math.sign(dx) * 20 : 0; };
    const threats = this.buildThreats(p);
    const a = this.move(p, inp, goal, threats);
    // лечение: стоять 1.1 с на месте можно, только если за это время ничто не заденет
    if (p.healCh > 0) { inp['left'] = inp['right'] = inp['jump'] = false; return; }
    if (p.silk >= 9 && p.hp <= p.maxHp - 2 && p.onGround && !this.prev['heal'] && this.safeStay(p, threats, 38)) { inp['left'] = inp['right'] = inp['jump'] = inp['dash'] = false; inp['heal'] = true; return; }
    // атака
    const dashing = a && (a.dash || a.parry) && (inp['dash'] || inp['heal']);
    if (!dashing && vuln && p.hurtT <= 0) {
      const face = p.face, cxp = p.x + 7;
      const box = { x: face > 0 ? cxp + 2 : cxp - 2 - 48, y: p.y + 13 - 17, w: 48, h: 32 };
      const inReach = ovl(box, b);
      const behind = adx < hi + 10 && (cx - pcx) * face < 0;
      if (stag && this.canExec && adx < b.w / 2 + 62 && Math.abs(by - (p.y + 13)) < b.h / 2 + 40 && p.atkCd <= 0.05) {
        inp['up'] = this.rng() < 0.5; inp['down'] = !inp['up']; inp['atk'] = true; this.stats.exec++;
      } else if (stag && this.canBurst && p.silk >= 4 && adx < 100 + b.w / 2) { inp['up'] = true; inp['heal'] = true; inp['atk'] = false; this.stats.burst++; }
      else if (inReach && p.atkCd <= 0.02) inp['atk'] = true;
      else if (behind && !inp['left'] && !inp['right'] && adx > lo) { inp[cx > pcx ? 'right' : 'left'] = true; }
      if (!stag && this.canBurst && p.silk >= 8 && adx < 90 + b.w / 2 && !(p.silk >= 9 && p.hp < p.maxHp)) { inp['up'] = true; inp['heal'] = true; inp['atk'] = false; this.stats.burst++; }
    }
    // сближение рывком к оглушённому
    if (stag && this.canDash && p.dashCd <= 0 && adx > hi + 30 && adx < 260 && !inp['dash'] && p.onGround && threats.length === 0) { inp['dash'] = true; inp[cx > pcx ? 'right' : 'left'] = true; }
  }

  // ---------- Миша: бомбы в рюкзак и «Пропустите!» ----------
  private simBomb(pxc: number, pyTop: number, face: number, mode: number, m: any): string {
    let vx = face * 360, vy = -430;
    if (mode === 1) { vx = face * 230; vy = -650; } else if (mode === 2) { vx = face * 170; vy = -180; }
    let x = pxc + face * 8 - 6, y = pyTop + 2;
    const sc = this.sc, bag = mishaBag(m), mcx = m.x + m.w / 2;
    const ins = { x: m.x + 4, y: m.y + 4, w: m.w - 8, h: m.h - 8 };
    for (let i = 0; i < 180; i++) {
      vy = Math.min(vy + 1100 / 60, 800); x += vx / 60; y += vy / 60;
      const pr = { x, y, w: 12, h: 12 }, cx = x + 6, cy = y + 6;
      const behind = (cx - mcx) * m.face < 0, mouth = vy > 0 ? { x: bag.x - 8, y: bag.y - 26, w: bag.w + 16, h: bag.h + 26 } : bag;
      if (behind && ovl(pr, mouth)) return 'bag' + (i / 60).toFixed(2);
      if (ovl(pr, ins)) return 'body';
      if (sc.isSolid(Math.floor(cx / T), Math.floor(cy / T))) return 'solid';
    }
    return 'none';
  }
  // подбор позиции броска: (x, лицом, режим), чтобы дымовуха влетела в рюкзак
  private bombPose(p: any, m: any): any {
    const sc = this.sc, key = Math.round(m.x / 6) + ':' + m.face;
    if (this.poseCache && this.poseCache.key === key && this.frame - this.poseCache.f < 30) return this.poseCache.v;
    const L: any = sc.L, gy = L.floorY ? L.floorY * T : 18 * T, top = gy - 26, mcx = m.x + m.w / 2, W = L.W * T;
    let best: any = null;
    for (let x = 2 * T; x < W - 2 * T; x += 6) {
      const d = Math.abs(x - mcx); if (d < 80 || d > 214) continue;
      for (const f of [-1, 1]) for (const mode of [0, 1, 2]) {
        const sb = this.simBomb(x, top, f, mode, m); if (sb.slice(0, 3) !== 'bag') continue;
        // шагов до позиции; пересечение Миши запрещено
        const cross = (x - mcx) * (p.x + 7 - mcx) < 0;
        const score = Math.abs(x - (p.x + 7)) + (cross ? 700 : 0) + (mode === 2 ? 30 : 0) + (d < 120 ? 120 : 0);
        if (!best || score < best.score) best = { x, f, mode, score, fl: +sb.slice(3) };
      }
    }
    this.poseCache = { key, f: this.frame, v: best };
    return best;
  }
  private mishaAct(p: any, inp: Record<string, boolean>, m: any): void {
    const sc = this.sc;
    if (!m || ['dead', 'gone'].includes(m.state)) return;
    const mcx = m.x + m.w / 2, pcx = p.x + 7;
    let gx = pcx, wantThrow: any = null;
    const crates: any[] = sc.crates || [];
    if (p.bombs <= 0 && crates.length) {
      let c = crates[0];
      for (const q of crates) if (Math.abs(q.x + q.w / 2 - pcx) < Math.abs(c.x + c.w / 2 - pcx)) c = q;
      // ближний к игроку ящик, но не через Мишу
      const same = crates.filter((q) => (q.x + q.w / 2 - mcx) * (pcx - mcx) > 0); if (same.length) c = same.reduce((a, q) => (Math.abs(q.x + q.w / 2 - pcx) < Math.abs(a.x + a.w / 2 - pcx) ? q : a));
      gx = c.x + c.w / 2;
    } else {
      const pose = this.bombPose(p, m);
      if (pose) { gx = pose.x; wantThrow = pose; } else gx = clamp(mcx + (pcx > mcx ? 190 : -190), 3 * T, (sc.L as any).W * T - 3 * T);
    }
    const goal: any = (n: any): number => Math.abs(n.x + 7 - gx) / 45;
    goal.target = (n: any): number => gx - (n.x + 7);
    const threats = this.buildThreats(p); this.lastTh = threats.length; this.lastThreats = threats;
    this.move(p, inp, goal, threats);
    // бросок: бросаем, пока Миша гарантированно стоит на месте, пока летит бомба
    const fl = wantThrow ? wantThrow.fl : 1;
    const still = wantThrow && (m.state === 'cough' || m.state === 'stun' ? m.t > wantThrow.fl * 0.5 : ['recover', 'word', 'bigWind', 'dictWind'].includes(m.state) && m.t > wantThrow.fl - 0.1);
    const canHit = m.zipT <= 0 && m.hitCd < fl - 0.2 && still && !sc.td;
    if (wantThrow && p.bombs > 0 && canHit && p.onGround && Math.abs(pcx - wantThrow.x) < 5 && p.bombCd <= 0 && p.hurtT <= 0 && !(inp['dash'] || inp['heal'])) {
      if (p.face !== wantThrow.f) { inp['left'] = inp['right'] = false; inp[wantThrow.f > 0 ? 'right' : 'left'] = true; }
      else if (!this.prev['left'] && !this.prev['right']) {
        inp['left'] = inp['right'] = false; inp['bomb'] = true; inp['up'] = wantThrow.mode === 1; inp['down'] = wantThrow.mode === 2; this.stats.bombs++;
      }
    }
    if (p.healCh > 0) { inp['left'] = inp['right'] = inp['jump'] = false; return; }
    if (p.silk >= 9 && p.hp <= p.maxHp - 2 && p.onGround && !this.prev['heal'] && this.safeStay(p, threats, 38)) { inp['left'] = inp['right'] = inp['jump'] = inp['dash'] = false; inp['heal'] = true; }
  }
  // «Пропустите!»: вид сверху. Нужно встать в ту дорожку, по которой идёт Миша, перед ним
  private tdAct(p: any, inp: Record<string, boolean>): void {
    const sc = this.sc, td: any = sc.td, G = tdGeo();
    if (!td) return;
    const r = 12, cyOf = (i: number): number => (G.lanes[i]!.y0 + G.lanes[i]!.y1) / 2;
    const inLane = (y: number): number => { for (let i = 0; i < 3; i++) if (y >= G.lanes[i]!.y0 + r && y <= G.lanes[i]!.y1 - r) return i; return -1; };
    let lane = td.lane, wait = false;
    if (td.state === 'tele' && this._tdRound !== td.round) {
      this._tdRound = td.round; this._tdSeen = this.frame + Math.round(this.react * 0.7); this._kn = td.lane; this._lcF = 0;
      this._tdWrong = this.rng() < 0.4 * (1 - this.s) ? this._tdSeen + 25 + Math.floor(40 * (1 - this.s)) : 0;
    }
    if (td.state === 'tele' || td.state === 'walk' || td.state === 'feint') {
      if (this.frame < (this._tdSeen || 0)) wait = true;
      else {
        // перескок Миши в другой коридор замечаем с задержкой реакции
        if (this._kn == null) this._kn = td.lane;
        if (td.lane !== this._kn) { if (!this._lcF) this._lcF = this.frame; if (this.frame - this._lcF >= Math.round(this.react * 1.1)) { this._kn = td.lane; this._lcF = 0; } } else this._lcF = 0;
        lane = this._kn;
        if (this._tdWrong && this.frame < this._tdWrong) lane = (lane + 1) % 3;
      }
    } else wait = true;
    const cur = inLane(p.tdy);
    let tx = p.tdx, ty = p.tdy;
    if (!wait) {
      const nearestDoor = (k: number): number => { const ds = G.doors[k]!; let d = ds[0]!; for (const q of ds) if (Math.abs(q - p.tdx) < Math.abs(d - p.tdx)) d = q; return d; };
      if (cur === lane) {
        // встаём над ближайшей к 0.65 длины дверью соседней стены: до другого коридора останется только шаг вниз/вверх
        let best = G.x0 + (G.x1 - G.x0) * 0.65, bd = 1e9;
        for (const k of [lane - 1, lane]) if (G.doors[k]) for (const d of G.doors[k]!) { const dd = Math.abs(d - (G.x0 + (G.x1 - G.x0) * 0.65)); if (dd < bd) { bd = dd; best = d; } }
        if (lane === 1) { const ds = G.doors[0]!.concat(G.doors[1]!).sort((u, v) => u - v); let lo = ds[0]!, hi = ds[ds.length - 1]!; for (let i = 0; i + 1 < ds.length; i++) if (ds[i]! <= best && ds[i + 1]! >= best) { lo = ds[i]!; hi = ds[i + 1]!; } best = (lo + hi) / 2; } // в середине: обе двери рядом
        tx = best; ty = cyOf(lane);
      } else if (cur >= 0) {
        const dirn = lane > cur ? 1 : -1, k = dirn > 0 ? cur : cur - 1, dx = nearestDoor(k);
        if (Math.abs(p.tdx - dx) > 10) { tx = dx; ty = p.tdy; } else { tx = dx; ty = cyOf(cur + dirn); }
      } else {
        let k = 0; for (let i = 0; i < 2; i++) if (p.tdy > G.lanes[i]!.y1 - 2 && p.tdy < G.lanes[i + 1]!.y0 + 2) k = i;
        tx = nearestDoor(k); ty = cyOf(lane);
      }
    }
    const ddx = tx - p.tdx, ddy = ty - p.tdy;
    if (wait) return;
    if (Math.abs(ddx) > 4) inp[ddx > 0 ? 'right' : 'left'] = true;
    if (Math.abs(ddy) > 4) inp[ddy > 0 ? 'down' : 'up'] = true;
  }
}
