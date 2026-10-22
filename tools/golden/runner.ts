// «Бегун» для золотых записей: проходит главу I по тайловому пути до порога арены (BFS по пустым клеткам), прыгает у препятствий и ям, бьёт врагов, лечится.
// Если застрял, делает журналируемый перенос по пути (ex 20 x y): запись не зависает на трудных местах, а перенос воспроизводит любое ядро.
// Перенос с legacy/tools/golden-runner.js (там он внедрялся в страницу старой игры): та же логика, но на ядре v2 без браузера.
/* eslint-disable @typescript-eslint/no-explicit-any -- сущности ядра — «мешки» полей */
import { P } from '../../src/core/balance';
import type { Inp } from '../../src/core/types';
import type { World } from '../../src/core/world';

const SOLID_ = 1, SPIKE_ = 3;
export class Runner {
  path: { x: number; y: number }[] = [];
  f = 0; k = 0; lastK = 0; lastKf = 0; atkT = 0; jumpHold = 0; tele = 0; built = 0;
  goal!: { x: number; y: number };
  constructor(private sc: World, goalTile: { x: number; y: number }, private opt: { stuck?: number } = {}) { this.setGoal(goalTile); }
  private solid(tx: number, ty: number): boolean { const g = this.sc.grid; return ty < 0 || tx < 0 || ty >= g.length || tx >= g[0]!.length ? true : g[ty]![tx] === SOLID_; }
  private open(tx: number, ty: number): boolean { const g = this.sc.grid; return !(ty < 0 || tx < 0 || ty >= g.length || tx >= g[0]!.length) && g[ty]![tx] !== SOLID_ && g[ty]![tx] !== SPIKE_; }
  /** путь от клетки героя до цели по пустым клеткам (4 соседа) */
  setGoal(goal: { x: number; y: number }): void {
    this.goal = goal; const sc = this.sc, p = sc.players[0]!, W = sc.grid[0]!.length, H = sc.grid.length;
    const sx = Math.floor((p.x + 7) / 32), sy = Math.floor((p.y + 13) / 32), gx = goal.x, gy = goal.y;
    const idx = (x: number, y: number): number => y * W + x, prev = new Int32Array(W * H).fill(-2), q = [idx(sx, sy)]; prev[q[0]!] = -1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h]!, x = c % W, y = (c / W) | 0;
      if (x === gx && y === gy) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy; if (!this.open(nx, ny) || prev[idx(nx, ny)] !== -2) continue;
        prev[idx(nx, ny)] = c; q.push(idx(nx, ny));
      }
    }
    const g = idx(gx, gy), path: { x: number; y: number }[] = [];
    if (prev[g] !== -2) for (let c = g; c !== -1; c = prev[c]!) path.push({ x: c % W, y: (c / W) | 0 });
    path.reverse();
    this.path = path; this.k = 0; this.lastK = 0; this.lastKf = this.f; this.built = this.f;
  }
  /** ввод на кадр; ext — журналируемое отладочное действие (ex id x y) */
  act(frame: number, ext: (id: number, x: number, y: number) => void): Inp {
    this.f = frame; const sc = this.sc, p: any = sc.players[0], out: Record<string, boolean> = { left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false };
    if (!this.path.length && frame - this.built > 90) this.setGoal(this.goal); // пути нет (ворота ещё закрыты) — строим заново
    if (!this.path.length || p.downed || sc.wiping) return out;
    const px = Math.floor((p.x + 7) / 32), py = Math.floor((p.y + 13) / 32), path = this.path, n = path.length;
    for (let j = Math.min(n - 1, this.k + 40); j > this.k; j--) if (Math.abs(path[j]!.x - px) <= 1 && Math.abs(path[j]!.y - py) <= 1) { this.k = j; break; }
    if (this.k > this.lastK) { this.lastK = this.k; this.lastKf = frame; }
    // застряли: перенос вперёд по пути
    if (frame - this.lastKf > (this.opt.stuck || 420) && this.k < n - 2) {
      const t = path[Math.min(n - 1, this.k + 10)]!; ext(20, t.x * 32 + 9, (t.y + 1) * 32 - 26); this.k = Math.min(n - 1, this.k + 10); this.lastK = this.k; this.lastKf = frame; this.tele++;
      return out;
    }
    const tg = path[Math.min(n - 1, this.k + 2)]!, tcx = tg.x * 32 + 16, dx = tcx - (p.x + 7);
    const dir = dx > 10 ? 1 : dx < -10 ? -1 : 0;
    out['right'] = dir > 0; out['left'] = dir < 0;
    const ax = px + (dir || p.face), feetY = Math.floor((p.y + 25) / 32);
    const wall = this.solid(ax, feetY) || this.solid(ax, feetY - 1);
    const above = tg.y < py - 0;
    const floorAhead = this.solid(ax, feetY + 1) || this.solid(ax, feetY + 2) || this.solid(ax + dir, feetY + 1);
    const spike = sc.grid[feetY + 1] && (sc.grid[feetY + 1]![ax] === SPIKE_ || sc.grid[feetY]![ax] === SPIKE_);
    if (p.onGround && dir !== 0 && (wall || !floorAhead || spike || above)) { out['jump'] = true; this.jumpHold = 22; }
    else if (this.jumpHold > 0 && !p.onGround) { out['jump'] = true; this.jumpHold--; }
    else if (!p.onGround && p.vy > 0 && sc.abil && sc.abil['double'] && (above || !floorAhead) && p.canDouble !== false && frame % 17 === 0) out['jump'] = true; // второй прыжок на спуске
    if (!p.onGround && dir !== 0 && Math.abs(dx) > 120 && p.dashCd <= 0 && frame % 23 === 0) out['dash'] = true;
    // удар по близкому врагу
    this.atkT--;
    for (const e of sc.enemies) if (!e.dead) {
      const ex = e.x + e.w / 2 - (p.x + 7), ey = e.y + e.h / 2 - (p.y + 13);
      if (Math.abs(ex) < 58 && Math.abs(ey) < 36) { if (this.atkT <= 0) { out['atk'] = true; this.atkT = 7; } if (ex * (p.face || 1) < 0) { out['left'] = ex < 0; out['right'] = ex > 0; } break; }
    }
    // лечение, когда мало масок и нить полная
    if (p.hp <= 2 && p.silk >= P.SILK && p.onGround && frame % 5 === 0) out['heal'] = true;
    return out as Inp;
  }
}
