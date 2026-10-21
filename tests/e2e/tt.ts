// Общее описание окна игры для e2e-тестов: window.__tt (его кладёт src/main.ts) и поддельный геймпад.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TT {
  game: { renderer: { type: number }; canvas: HTMLCanvasElement; scene: { isActive(k: string): boolean }; loop: { actualFps: number }; events: { emit(k: string, e: unknown): void } };
  shared: { session: { world: Record<string, any>; togglePause(): void; buy(id: string): void } | null };
  start(p: unknown): void; stop(): void;
  /** помощники для тестов: вызвать ядро напрямую */
  debug: { srFinish(w: Record<string, any>): void; /** дуэль: оборвать нить героя (конец раунда поражением) */ srDuelDefeat(w: Record<string, any>): void };
  /** «Гонки Ткачей» (src/app/races.ts) */
  races?: { watch: { tel: Record<string, unknown>; hist: Record<string, unknown[]>; solo: unknown } | null; org: { S: { phase: string } | null } | null; play: { state: { phase: string } | null } | null };
}
declare global { interface Window { __tt?: TT; __pad?: { axes: number[]; buttons: { pressed: boolean; value: number }[]; connected: boolean; id: string } } }
