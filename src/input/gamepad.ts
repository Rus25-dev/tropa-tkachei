import type { Button } from '../core/input';

const DEAD = 0.35;
const pressed = (p: Gamepad, i: number): boolean => { const b = p.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };

/**
 * Геймпад в стандартной раскладке браузера (Xbox, DualSense/DualShock, Steam Deck). Таблица как в README v1.8:
 * A/✕ прыжок, X/□ удар, B/○ и RT/R2 рывок, Y/△ и LT/L2 нить, LB/L1 дымовуха, RB/R1 инструмент; стик и крестовина — движение.
 */
export function readGamepads(): { held: Partial<Record<Button, boolean>>; any: boolean; pause: boolean; map: boolean } {
  const held: Partial<Record<Button, boolean>> = {};
  let any = false, pause = false, map = false;
  const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of list) {
    if (!p || !p.connected) continue;
    any = true;
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    if (ax < -DEAD || pressed(p, 14)) held.left = true;
    if (ax > DEAD || pressed(p, 15)) held.right = true;
    if (ay < -DEAD || pressed(p, 12)) held.up = true;
    if (ay > DEAD || pressed(p, 13)) held.down = true;
    if (pressed(p, 0)) held.jump = true;
    if (pressed(p, 2)) held.atk = true;
    if (pressed(p, 1) || pressed(p, 7)) held.dash = true;
    if (pressed(p, 3) || pressed(p, 6)) held.heal = true;
    if (pressed(p, 4)) held.bomb = true;
    if (pressed(p, 5)) held.tool = true;
    if (pressed(p, 9)) pause = true;
    if (pressed(p, 8)) map = true;
  }
  return { held, any, pause, map };
}
