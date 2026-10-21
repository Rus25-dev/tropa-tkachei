// Формат ввода для ядра. Совпадает с журналом v1.8 (legacy/src/journal.js): удержание кнопок + фронты нажатий.
export const BUTTONS = ['left', 'right', 'up', 'down', 'jump', 'atk', 'dash', 'heal', 'bomb', 'tool'] as const;
export type Button = (typeof BUTTONS)[number];
export type Buttons = Record<Button, boolean>;
/** Фронты нажатий (кнопка стала нажатой с прошлого тика) — их ядро видит только на первом шаге кадра. */
export const EDGES = ['jumpP', 'atkP', 'dashP', 'healP', 'upP', 'bombP', 'toolP'] as const;
export type Edge = (typeof EDGES)[number];
export type Edges = Record<Edge, boolean>;
export interface InputFrame { buttons: Buttons; edges: Edges }

export const emptyButtons = (): Buttons => ({ left: false, right: false, up: false, down: false, jump: false, atk: false, dash: false, heal: false, bomb: false, tool: false });
export const emptyEdges = (): Edges => ({ jumpP: false, atkP: false, dashP: false, healP: false, upP: false, bombP: false, toolP: false });
export const emptyFrame = (): InputFrame => ({ buttons: emptyButtons(), edges: emptyEdges() });

/** Сливает несколько источников ввода (клавиатура, геймпад, касание): кнопка нажата, если нажата в любом. */
export function mergeButtons(...sources: Partial<Buttons>[]): Buttons {
  const out = emptyButtons();
  for (const s of sources) for (const b of BUTTONS) if (s[b]) out[b] = true;
  return out;
}

/** Фронты между двумя состояниями кнопок: нажатие — это переход «не нажата → нажата». */
export function edgesBetween(prev: Buttons, next: Buttons): Edges {
  return { jumpP: next.jump && !prev.jump, atkP: next.atk && !prev.atk, dashP: next.dash && !prev.dash, healP: next.heal && !prev.heal, upP: next.up && !prev.up, bombP: next.bomb && !prev.bomb, toolP: next.tool && !prev.tool };
}

/** Упаковка в число для журнала: 10 бит удержания + 7 бит фронтов (формат v1.8). */
export function packFrame(f: InputFrame): number {
  let m = 0;
  BUTTONS.forEach((b, i) => { if (f.buttons[b]) m |= 1 << i; });
  EDGES.forEach((e, i) => { if (f.edges[e]) m |= 1 << (10 + i); });
  return m;
}
export function unpackFrame(m: number): InputFrame {
  const f = emptyFrame();
  BUTTONS.forEach((b, i) => { f.buttons[b] = !!(m & (1 << i)); });
  EDGES.forEach((e, i) => { f.edges[e] = !!(m & (1 << (10 + i))); });
  return f;
}
