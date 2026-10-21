// Инварианты фаззера: что должно быть верно в любом состоянии мира при любом вводе.
// Проверки идут после каждого тика (дешёвые) и каждые CHECK_EVERY тиков (полный обход чисел состояния).
import type { World } from '../../src/core/world';

export const INVARIANTS = {
  exception: 'исключение в ядре',
  nan: 'NaN/Infinity в состоянии',
  solid: 'герой внутри твёрдого тайла',
  outside: 'герой вне уровня',
  range: 'здоровье/нить вне допустимых границ',
  stuck: 'застревание: герой не сдвинулся 30 с игрового времени',
  frozen: 'мир завис: затемнение, хитстоп или меню дольше допустимого',
  transition: 'переход между сценами не состоялся',
  replay: 'журнал ввода не воспроизводит то же состояние',
} as const;
export type InvariantId = keyof typeof INVARIANTS;

export interface Finding {
  invariant: InvariantId;
  message: string;
  /** номер тика забега (все сцены подряд), на котором нарушение замечено */
  tick: number;
  /** уточнение класса находки (входит в её ключ): например solid у напарника — след поводка v1.8 */
  cls?: string;
}

const CHECK_EVERY = 15;
/** герой должен выйти из стены не позже чем через столько секунд логического времени (0,5 с = 30 тиков при обычной скорости; замедление и хитстоп время не двигают) */
const SOLID_GRACE_S = 0.5;
/** окно «застревания»: 30 с игрового времени */
const STUCK_TICKS = 1800;

const bad = (v: unknown): boolean => typeof v === 'number' && !Number.isFinite(v);

/** Первое нечисловое поле (NaN/Infinity) в объекте, если оно есть; обход неглубокий, без циклов по ссылкам на мир */
export function findNonFinite(o: unknown, path: string, depth = 2): string | null {
  if (bad(o)) return path;
  if (!o || typeof o !== 'object' || depth < 0) return null;
  if (Array.isArray(o)) { for (let i = 0; i < o.length && i < 64; i++) { const r = findNonFinite(o[i], `${path}[${i}]`, depth - 1); if (r) return r; } return null; }
  if (o instanceof Set || o instanceof Map || o instanceof WeakMap) return null;
  for (const k in o as Record<string, unknown>) {
    const v = (o as Record<string, unknown>)[k];
    if (typeof v === 'function') continue;
    const r = findNonFinite(v, `${path}.${k}`, depth - 1); if (r) return r;
  }
  return null;
}

export class Monitor {
  private n = 0;
  private solidRun: number[] = [];
  /** в момент входа в тайл рядом стоял напарник: так выглядит «поводок» v1.8 (позже он мог уйти) */
  private leash: boolean[] = [];
  /** в момент входа в тайл герой стоял в колонке закрывшихся ворот арены: так выглядит закрытие ворот на герое в проёме (кооп, v1.8) */
  private gate: boolean[] = [];
  private prevT = 0;
  private world: World | null = null;
  private frozenAt = { wiping: 0, hitstop: 0, leaving: 0, busy: 0, paused: 0 };
  // «застревание»
  private win = { x: 0, y: 0, t: 0, sig: '', active: 0, move: 0 };

  /** вызывать после каждого тика мира; moved — нажимал ли ввод движение/прыжок в этом тике */
  check(w: World, moved: boolean): Finding | null {
    this.n++;
    if (w !== this.world) { this.world = w; this.solidRun = w.players.map(() => 0); this.prevT = w.timeSec; this.frozenAt = { wiping: 0, hitstop: 0, leaving: 0, busy: 0, paused: 0 }; this.win = { x: 0, y: 0, t: 0, sig: '', active: 0, move: 0 }; this.resetWindow(w); }
    const f = (invariant: InvariantId, message: string): Finding => ({ invariant, message, tick: this.n });
    const dtLogic = Math.max(0, w.timeSec - this.prevT); this.prevT = w.timeSec;

    // --- дешёвые, каждый тик ---
    for (let i = 0; i < w.players.length; i++) {
      const p = w.players[i]!;
      if (bad(p.x) || bad(p.y) || bad(p.vx) || bad(p.vy) || bad(p.hp) || bad(p.silk)) return f('nan', `герой ${i}: x=${p.x} y=${p.y} vx=${p.vx} vy=${p.vy} hp=${p.hp} silk=${p.silk}`);
      if (p.downed || p.remote) { this.solidRun[i] = 0; continue; }
      if (p.hp < 0 || p.hp > p.maxHp + 1e-9 || p.silk < -1e-9 || p.silk > w.silkMax + 1e-9) return f('range', `герой ${i}: hp=${p.hp}/${p.maxHp} silk=${p.silk}/${w.silkMax}`);
      // на паузе мир стоит: герой, замерший посреди подтягивания на уступ, остаётся в углу тайла, это не нарушение
      if (w.paused) continue;
      if (w.solidRect({ x: p.x + 1, y: p.y + 1, w: p.w - 2, h: p.h - 2 })) {
        if (this.solidRun[i]! === 0) this.leash[i] = w.players.some((q, k) => k !== i && !q.downed && Math.abs(q.x - p.x) <= 24 && Math.abs(q.y - p.y) <= 2);
        if (this.solidRun[i]! === 0) this.gate[i] = w.gates.some((g) => g.closed && p.x + p.w > g.x * 32 && p.x < (g.x + 1) * 32 && p.y + p.h > g.y0 * 32 && p.y < (g.y1 + 1) * 32);
        this.solidRun[i]! += dtLogic;
        if (this.solidRun[i]! > SOLID_GRACE_S) {
          // «поводок» v1.8 ставит отставшего напарника рядом с ведущим, не глядя на стены: отдельный класс
          const near = !!this.leash[i];
          return { ...f('solid', `герой ${i} внутри тайла${near ? ' рядом с напарником (поводок)' : this.gate[i] ? ' в проёме закрывшихся ворот' : ''}: x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} (${this.solidRun[i]!.toFixed(2)} с подряд)`), ...(near ? { cls: 'leash' } : this.gate[i] ? { cls: 'gate' } : {}) };
        }
      } else this.solidRun[i] = 0;
      const L = w.L;
      if (p.x < -200 || p.x > L.W * 32 + 200 || p.y > L.H * 32 + 400 || p.y < -600) return f('outside', `герой ${i} вне уровня: x=${p.x.toFixed(0)} y=${p.y.toFixed(0)}`);
    }

    // --- зависания флагов мира ---
    const z = this.frozenAt;
    z.wiping = w.wiping ? z.wiping + 1 : 0; z.hitstop = w.hitstop > 0 && !w.paused && !w.won && !w.wiping ? z.hitstop + 1 : 0; z.leaving = w.leaving ? z.leaving + 1 : 0; z.busy = w.mt?.busy ? z.busy + 1 : 0;
    if (z.wiping > 600) return f('frozen', 'обрыв нити не заканчивается более 10 с');
    if (z.hitstop > 120) return f('frozen', `хитстоп не заканчивается: ${w.hitstop}`);
    if (z.leaving > 300) return f('transition', 'сцена не сменилась через 5 с после выхода (leaving)');
    if (z.busy > 600) return f('frozen', 'быстрый переход по карте не завершается более 10 с');

    // --- полный обход чисел ---
    if (this.n % CHECK_EVERY === 0) {
      const b = w.testBoss() ?? w.boss;
      const r = findNonFinite(b, 'boss') ?? findNonFinite(w.enemies, 'enemies') ?? findNonFinite(w.projs, 'projs', 1) ?? findNonFinite(w.beadsArr, 'beads', 1) ?? findNonFinite(w.players, 'players', 1);
      if (r) return f('nan', `нечисловое поле ${r}`);
      if (b && b.hp > b.maxHp + 1e-9) return f('range', `здоровье босса ${b.hp} > максимума ${b.maxHp}`);
    }

    // --- застревание героя: 30 с на одном месте при нажатом движении ---
    return this.stuck(w, moved, f);
  }

  private resetWindow(w: World): void {
    const p = w.players[0]!; this.win = { x: p.x, y: p.y, t: 0, sig: this.sig(w), active: 0, move: 0 };
  }
  private sig(w: World): string {
    const b = w.testBoss() ?? w.boss;
    return [w.beads, w.players.map((p) => p.hp).join(','), b ? Math.round(b.hp) + b.state : '', w.enemies.filter((e) => !e.dead).length, w.deaths, w.areaIdx].join('|');
  }
  private stuck(w: World, moved: boolean, f: (i: InvariantId, m: string) => Finding): Finding | null {
    const k = this.win, live = w.players.filter((p) => !p.downed && !p.remote);
    if (!live.length) { this.resetWindow(w); return null; }
    // окно считается, только пока мир идёт и герой не сидит на скамье и не ждёт чего-то в меню
    const ok = !w.paused && !w.wiping && !w.won && !w.leaving && !w.shopOpen && !live.some((p) => p.sit) && !w.td;
    if (!ok) { this.resetWindow(w); return null; }
    const p = live[0]!;
    k.t++; if (moved) k.move++;
    if (Math.abs(p.x - k.x) > 24 || Math.abs(p.y - k.y) > 24 || this.sig(w) !== k.sig) { this.resetWindow(w); return null; }
    if (k.t >= STUCK_TICKS) {
      const share = k.move / k.t;
      this.resetWindow(w);
      if (share > 0.5) return f('stuck', `герой стоит на месте 30 с (x=${p.x.toFixed(0)} y=${p.y.toFixed(0)}), движение нажато ${(share * 100).toFixed(0)}% времени`);
    }
    return null;
  }
}
