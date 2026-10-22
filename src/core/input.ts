// Формат ввода для ядра. Совпадает с журналом v1.8 (legacy/src/journal.js): удержание кнопок + фронты нажатий.
export const BASE_BUTTONS = ['left', 'right', 'up', 'down', 'jump', 'atk', 'dash', 'heal', 'bomb', 'tool'] as const;
export const ACTION_BUTTONS = ['parry', 'bind', 'burst'] as const;
export const BUTTONS = [...BASE_BUTTONS, ...ACTION_BUTTONS] as const;
export type Button = (typeof BUTTONS)[number];
export type Buttons = Record<(typeof BASE_BUTTONS)[number], boolean> & Partial<Record<(typeof ACTION_BUTTONS)[number], boolean>>;
/** Фронты нажатий (кнопка стала нажатой с прошлого тика) — их ядро видит только на первом шаге кадра. */
export const BASE_EDGES = ['jumpP', 'atkP', 'dashP', 'healP', 'upP', 'bombP', 'toolP'] as const;
export const ACTION_EDGES = ['parryP', 'bindP', 'burstP'] as const;
export const EDGES = [...BASE_EDGES, ...ACTION_EDGES] as const;
export type Edge = (typeof EDGES)[number];
export type Edges = Record<(typeof BASE_EDGES)[number], boolean> & Partial<Record<(typeof ACTION_EDGES)[number], boolean>>;
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
  const out: Edges = { jumpP: next.jump && !prev.jump, atkP: next.atk && !prev.atk, dashP: next.dash && !prev.dash, healP: next.heal && !prev.heal, upP: next.up && !prev.up, bombP: next.bomb && !prev.bomb, toolP: next.tool && !prev.tool };
  ACTION_BUTTONS.forEach((b, i) => { if (b in next || b in prev) out[ACTION_EDGES[i]!] = !!next[b] && !prev[b]; });
  return out;
}

/** Упаковка в число для журнала: 10 бит удержания + 7 бит фронтов (формат v1.8). */
export function packFrame(f: InputFrame): number {
  let m = 0;
  BASE_BUTTONS.forEach((b, i) => { if (f.buttons[b]) m |= 1 << i; });
  BASE_EDGES.forEach((e, i) => { if (f.edges[e]) m |= 1 << (10 + i); });
  ACTION_BUTTONS.forEach((b, i) => { if (f.buttons[b]) m |= 1 << (17 + i); });
  ACTION_EDGES.forEach((e, i) => { if (f.edges[e]) m |= 1 << (20 + i); });
  return m;
}
export function unpackFrame(m: number): InputFrame {
  const f = emptyFrame();
  BASE_BUTTONS.forEach((b, i) => { f.buttons[b] = !!(m & (1 << i)); });
  BASE_EDGES.forEach((e, i) => { f.edges[e] = !!(m & (1 << (10 + i))); });
  ACTION_BUTTONS.forEach((b, i) => { if (m & (1 << (17 + i))) f.buttons[b] = true; });
  ACTION_EDGES.forEach((e, i) => { if (m & (1 << (20 + i))) f.edges[e] = true; });
  return f;
}
