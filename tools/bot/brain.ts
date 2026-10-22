// Мозг ИИ-тестера на ядре v2: перенос legacy/tools/botbrain.js. Чистая функция «состояние мира → кадр ввода» (метод act),
// без DOM, Phaser и часов: всё, что бот «решает случайно» (зевки, промахи, задержка реакции), берётся из ГСЧ с зерном.
// Идея: бот «видит» только то, что заметил (задержка реакции зависит от мастерства), предсказывает траектории снарядов
// и тел боссов и ищет безопасный путь поиском по лучу (шаги по 1/30 с, блоки по 0.1 с, горизонт 1.2 с).
// Мастерство (skill) 0..1 меняет: задержку реакции, «зевки» внимания, пропуски угроз, доступные приёмы
// (рывок, отбив, всполох, казнь) и ширину поиска. Бот не читает будущие решения босса — только его телеграфы.
/* eslint-disable @typescript-eslint/no-explicit-any -- прямой перенос JS-мозга v1.8: сущности ядра — «мешки» полей */
import { T } from '../../src/core/balance';
import { mulberry32 } from '../../src/core/rng';
import type { Inp } from '../../src/core/types';
import type { World } from '../../src/core/world';
import { kitHas } from '../../src/core/kit/abilities';
import { KIT } from '../../src/core/balance';

const DT = 1 / 30, BLOCK = 3, NS = 36, DEPTH = 12;
// скорости и тайминги мозга зашиты как в v1.8: бот моделирует игру по своей модели, а не читает баланс (иначе правка баланса «чинила» бы бота сама)
const RUN = 230, JUMP = 700, GR = 1500, DASHV = 540, CUT = 0.45;
const SKIP = new Set(['bomb']);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const ovl = (a: any, b: any): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

interface Act { dir: number; jump: number; dash: number; parry: number; cost: number }
// действия блока: направление, прыжок (удержание), рывок, отбив
const ACTS: Act[] = [];
for (const j of [0, 1]) for (const d of [-1, 0, 1]) ACTS.push({ dir: d, jump: j, dash: 0, parry: 0, cost: j ? 0.12 : 0 });
for (const d of [-1, 1]) ACTS.push({ dir: d, jump: 0, dash: 1, parry: 0, cost: 0.35 });
for (const d of [-1, 0, 1]) ACTS.push({ dir: d, jump: 0, dash: 0, parry: 1, cost: 0.3 });

export interface BrainStats { hurt: Record<string, number>; parry: number; pdodge: number; exec: number; stag: number; plans: number; burst: number }

/** Мозг одного героя. sc — мир ядра, idx — номер героя, skill — мастерство 0..1, seed — зерно решений бота */
export class Brain {
  readonly i: number; readonly s: number;
  readonly rng: () => number;
  readonly react: number; readonly missP: number; readonly lapseRate: number; readonly errRate: number;
  readonly canPerfect: boolean; readonly canDash: boolean; readonly canParry: boolean; readonly canBurst: boolean; readonly canExec: boolean;
  readonly beamW: number; readonly depth: number;
  /** модель рывка бота: шаги планирования (1/30 с), откат в шагах и скорость; теневой рывок (мастерство ≥ 0,9, приём открыт) — дольше и быстрее */
  readonly dashSteps: number; readonly dashCdSteps: number; readonly dashV: number;
  seen = new WeakMap<object, { f: number; k: number }>();
  frame = 0; lapse = 0; prev: Record<string, boolean> = {}; planAt = -99;
  e: any = { x: 0, y: 0, w: 14, h: 26, vx: 0, vy: 0, onGround: false, noPlat: false };
  stateSince: { s: string | null; f: number } = { s: null, f: 0 };
  stats: BrainStats = { hurt: {}, parry: 0, pdodge: 0, exec: 0, stag: 0, plans: 0, burst: 0 };
  errT = 0; errDir = 0; errJump = false;
  lastBT: any = null; lastBest: any = null; lastHits = 0; lastTh = 0; lastThreats: any[] = [];
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
    const shade = s >= 0.9 && !!sc.players[idx] && kitHas(sc, sc.players[idx]!, 'shadow');
    this.dashSteps = shade ? Math.round(KIT.SHADOW.T / DT) : 4; this.dashCdSteps = shade ? Math.ceil(KIT.SHADOW.CD / DT) : 14; this.dashV = shade ? KIT.SHADOW.SPD : DASHV;
  }

  // ---------- восприятие ----------
  vis(obj: object): boolean {
    let r = this.seen.get(obj);
    if (!r) { r = { f: this.frame, k: this.rng() < this.missP ? 2.2 : 1 }; this.seen.set(obj, r); }
    return this.frame - r.f >= this.react * r.k;
  }
  // траектория снаряда на NS шагов: позиции и «активность» (после задержки/пока жив)
  trajProj(pr: any): any {
    const sc = this.sc, n = NS + 1, X = new Float32Array(n), Y = new Float32Array(n), ON = new Uint8Array(n), L = sc.L as any;
    let x = pr.x, y = pr.y, vx = pr.vx || 0, vy = pr.vy || 0, d = pr.delay > 0 ? pr.delay : 0, life = pr.life == null ? 9 : pr.life;
    let t0 = pr.t0 > 0 ? pr.t0 : 0;
    const ax = pr.ax || 0, kind = pr.kind, w = pr.w, alive = true;
    for (let i = 0; i < n; i++) {
      X[i] = x; Y[i] = y; ON[i] = (alive && d <= 0 && life > 0) ? 1 : 0;
      if (i === NS) break;
      for (let s = 0; s < 2; s++) {
        const h = DT / 2;
        if (d > 0) { d -= h; continue; }
        life -= h; if (life <= 0 || !alive) continue;
        switch (kind) {
          case 'spore': vy += 700 * h; x += vx * h; y += vy * h; break;
          case 'wave': case 'echo': x += vx * h; break;
          case 'rock': vy = Math.min(vy + 1100 * h, 800); y += vy * h; break;
          case 'clef':
            if (t0 > 0) { t0 -= h; break; }
            vx += ax * h; x += vx * h; y += Math.sin(life * 6) * 30 * h;
            if (x < T || x + w > (L.W - 1) * T) { vx = -vx * 0.6; x = clamp(x, T, (L.W - 1) * T - w); }
            break;
          case 'note': vy = Math.min(vy + 900 * h, 700); x += vx * h; y += vy * h; break;
          default: break;
        }
      }
    }
    return { X, Y, ON, w: pr.w, h: pr.h, kind, pad: 2, hk: pr.hk };
  }
  // тело босса: движется со своей скоростью под гравитацией (рывки и прыжки боссов на данных заданы атаками: их тело ловят по скорости в кадре)
  bossThreat(): any {
    const sc = this.sc, b: any = sc.testBoss();
    if (!b || ['dead', 'gone', 'sleep', 'intro'].includes(b.state)) return null;
    const n = NS + 1, X = new Float32Array(n), Y = new Float32Array(n), ON = new Uint8Array(n).fill(1);
    const e: any = { x: b.x, y: b.y, w: b.w, h: b.h, vx: b.vx || 0, vy: b.vy || 0, onGround: !!b.onGround };
    for (let i = 0; i < n; i++) {
      X[i] = e.x + 8; Y[i] = e.y + 8;
      if (i === n - 1) break;
      e.vy = Math.min(e.vy + GR * DT, 720); sc.moveBody(e, DT);
    }
    return { X, Y, ON, w: b.w - 16, h: b.h - 16, kind: 'body', pad: 0 };
  }
  buildThreats(p: any): any[] {
    const sc = this.sc, out: any[] = [], rx = 430, ry = 340;
    for (const pr of sc.projs as any[]) {
      if (pr.dead || SKIP.has(pr.kind) || pr.w === 0 || !this.vis(pr)) continue;
      const t = this.trajProj(pr);
      // отсев: траектория целиком далеко от героя
      let near = false;
      for (let i = 0; i <= NS; i += 2) if (t.ON[i] && Math.abs(t.X[i] + t.w / 2 - p.x) < rx + t.w / 2 && Math.abs(t.Y[i] + t.h / 2 - p.y) < ry + t.h / 2) { near = true; break; }
      if (near) out.push(t);
    }
    const bt = this.bossThreat();
    this.lastBT = bt;
    if (bt) { for (let i = 0; i <= NS; i += 2) if (Math.abs(bt.X[i] + bt.w / 2 - p.x) < rx + bt.w / 2 && Math.abs(bt.Y[i] + bt.h / 2 - p.y) < ry + bt.h / 2) { out.push(bt); break; } }
    return out;
  }

  // ---------- поиск по лучу ----------
  rootNode(p: any): any {
    const st = (v: number): number => Math.max(0, Math.floor(v / DT + 1e-6));
    return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, og: !!p.onGround, cd: p.canDash !== false, dcd: Math.max(0, Math.ceil(p.dashCd / DT - 1e-6)), dT: st(p.dashT),
      face: p.face, ud: !!p.usedDouble, jh: !!this.prev['jump'], cut: p.jumpCut !== false, coy: Math.max(0, p.coyote), inv: Math.max(0, Math.ceil((p.inv || 0) / DT - 1e-6)),
      pt: st(p.parryT || 0), pcd: Math.max(0, Math.ceil((p.parryCd || 0) / DT - 1e-6)), cost: 0, first: null, hits: 0 };
  }
  // Все окна (рывок, отбив, неуязвимость) считаем в шагах планирования и округляем в невыгодную для бота сторону
  stepNode(n: any, a: Act, first: boolean, k: number, threats: any[]): void {
    const sc = this.sc, e = this.e;
    if (n.inv > 0) n.inv--;
    if (n.dcd > 0) n.dcd--;
    if (n.pcd > 0) n.pcd--;
    if (first && a.parry && this.canParry && n.pcd <= 0 && n.pt <= 0 && n.dT <= 0) { n.pt = 5; n.pcd = 20; }
    const dir = a.dir;
    let dashing = false;
    if (n.dT > 0) {
      dashing = true; n.dT--; n.vx = n.face * this.dashV; n.vy = 0;
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
      if (first && a.dash && this.canDash && n.dcd <= 0 && (n.og || n.cd)) { dashing = true; n.dT = this.dashSteps; n.dcd = this.dashCdSteps; if (!n.og) n.cd = false; if (dir) n.face = dir; n.vy = 0; n.vx = n.face * this.dashV; }
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
      const early = n.pt >= 3, parryable = n.pt > 0 && (t.hk === undefined || t.hk === 'parry');
      if (parryable) { n.inv = 16; n.pt = 0; n.pcd = 5; n.cost -= 1.4; if (t.hk === 'parry' && this.canPerfect && early) n.cost -= 0.5; } // удар в первые шаги окна (pt начинается с 5) — идеальный отбив; отдельного поля нет: лишнее поле узла замедляет перебор в разы
      else if (dashing && t.hk !== 'unblockable') { n.inv = 11; n.cost -= this.canDash ? 0.6 : 0; }
      else { n.cost += 100; n.inv = 31; n.hits++; }
    }
    if (n.pt > 0) n.pt--;
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
    const b: any = sc.testBoss();
    if (b && b.state !== this.stateSince.s) this.stateSince = { s: b.state, f: frame };
    if (p.downed) return this.finish(inp);
    // зевок внимания: повторяем прошлый ввод
    if (this.lapse > 0) { this.lapse--; Object.assign(inp, this.prev, { atk: false, dash: false, heal: false, bomb: false }); return this.finish(inp); }
    if (this.lapseRate > 0 && this.rng() < this.lapseRate / 60) { this.lapse = 6 + Math.floor(this.rng() * (6 + 30 * (1 - this.s))); }
    // напарник в коконе
    const partner = sc.players.find((q) => q !== p && q.downed);
    if (partner && Math.abs(partner.x - p.x) < 300) { this.reviveAct(p, partner, inp); return this.finish(inp); }
    this.meleeAct(p, inp, b);
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
}
