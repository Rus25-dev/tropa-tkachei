import type { Button } from '../core/input';

const DEAD = 0.32;
const pressed = (p: Gamepad, i: number): boolean => { const b = p.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
const trig = (p: Gamepad, i: number): boolean => { const b = p.buttons[i]; return !!b && (b.pressed || b.value > 0.35); };

export type PadKind = 'ps' | 'deck' | 'xbox' | 'generic';
export interface PadState { held: Partial<Record<Button, boolean>>; pause: boolean; map: boolean; any: boolean }

/** Список подключённых геймпадов (стандартная раскладка браузера). */
export function listPads(): Gamepad[] {
  let a: (Gamepad | null)[] = [];
  try { a = Array.from(navigator.getGamepads ? navigator.getGamepads() : []); } catch { /* нет доступа */ }
  return a.filter((p): p is Gamepad => !!p && p.connected !== false && !!p.buttons && p.buttons.length >= 4);
}
export function padKind(p: Gamepad): PadKind {
  const id = (p.id || '').toLowerCase();
  if (/054c|dualsense|dualshock|wireless controller|playstation|sony/.test(id)) return 'ps';
  if (/steam|28de|deck/.test(id)) return 'deck';
  if (/xbox|xinput|045e|microsoft/.test(id)) return 'xbox';
  return 'generic';
}
export const padLabel = (k: PadKind): string => ({ ps: 'DualSense / DualShock', deck: 'Steam Deck', xbox: 'Xbox', generic: 'геймпад' })[k];

/**
 * Нормализованное состояние одного геймпада (таблица как в README v1.8):
 * A/✕ прыжок, X/□ удар, B/○ и RT/R2 рывок, Y/△ и LT/L2 нить, LB/L1 дымовуха, RB/R1 инструмент, Start/Options пауза, Back/Create/тачпад карта.
 */
export function readPad(p: Gamepad): PadState {
  const held: Partial<Record<Button, boolean>> = {};
  const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
  if (ax < -DEAD || pressed(p, 14)) held.left = true;
  if (ax > DEAD || pressed(p, 15)) held.right = true;
  if (ay < -0.5 || pressed(p, 12)) held.up = true;
  if (ay > 0.5 || pressed(p, 13)) held.down = true;
  if (pressed(p, 0)) held.jump = true;
  if (pressed(p, 2)) held.atk = true;
  if (pressed(p, 1) || trig(p, 7)) held.dash = true;
  if (pressed(p, 3) || trig(p, 6)) held.heal = true;
  if (pressed(p, 4)) held.bomb = true;
  if (pressed(p, 5)) held.tool = true;
  if (pressed(p, 10) && pressed(p, 11)) held.burst = true;
  else { if (pressed(p, 10)) held.parry = true; if (pressed(p, 11)) held.bind = true; }
  const pause = pressed(p, 9), map = pressed(p, 8) || pressed(p, 17);
  const any = Object.keys(held).length > 0 || pause;
  return { held, pause, map, any };
}

/** Какому игроку достаётся геймпад (правила v1.8): один игрок — первый геймпад; двое: два геймпада — каждому свой, один — второму игроку. */
export function padFor(i: number, nPlayers: number, pads: Gamepad[]): Gamepad | null {
  if (nPlayers === 1) return pads[0] ?? null;
  if (pads.length >= 2) return pads[i] ?? null;
  if (pads.length === 1 && i === 1) return pads[0]!;
  return null;
}

/** Вибрация геймпада (Chrome/Edge: DualSense и Xbox; Firefox пока не умеет) */
export function rumble(ms: number, strong: number, weak: number): void {
  for (const p of listPads()) {
    const a = (p as unknown as { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }).vibrationActuator; if (!a || !a.playEffect) continue;
    try { void a.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => undefined); } catch { /* не поддерживается */ }
  }
}
