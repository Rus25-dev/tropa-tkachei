import type { Button } from '../core/input';

// Раскладки как в v1.8 (legacy/src/game.js setupInput):
//  p1     — WASD, Пробел прыжок, F удар, G рывок, Q нить, R дымовуха, E инструмент
//  arrows — стрелки, Z/X/C/V/B, E (вместе с p1, когда играет один)
//  p2     — стрелки, Num1 или / прыжок, Num2 или . удар, Num3 или , рывок, Num0 или M нить, Num4 или N дымовуха, Num5 или J инструмент
export type KeySet = 'p1' | 'arrows' | 'p2';
export const KEY_MAPS: Record<KeySet, Record<string, Button>> = {
  p1: { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', Space: 'jump', KeyF: 'atk', KeyG: 'dash', KeyQ: 'heal', KeyR: 'bomb', KeyE: 'tool', KeyT: 'parry', KeyY: 'bind', KeyH: 'burst' },
  arrows: { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyZ: 'jump', KeyX: 'atk', KeyC: 'dash', KeyV: 'heal', KeyB: 'bomb', KeyE: 'tool' },
  p2: { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Numpad1: 'jump', Slash: 'jump', Numpad2: 'atk', Period: 'atk', Numpad3: 'dash', Comma: 'dash', Numpad0: 'heal', KeyM: 'heal', Numpad4: 'bomb', KeyN: 'bomb', Numpad5: 'tool', KeyJ: 'tool', Numpad6: 'parry', Numpad7: 'bind', Numpad8: 'burst' },
};
const ALL_CODES = new Set(Object.values(KEY_MAPS).flatMap((m) => Object.keys(m)));

/** Клавиатура на DOM-событиях: короткое нажатие между кадрами не теряется (tapped), удержание считается по множеству нажатых клавиш. */
export class Keyboard {
  private down = new Set<string>();
  /** Коды клавиш, нажатых с прошлого опроса (даже если клавишу успели отпустить). */
  tappedCodes = new Set<string>();
  /** Когда true, клавиши не попадают в игру (открыт текстовый ввод или меню). */
  enabled = true;
  constructor(private target: Window = window) {
    target.addEventListener('keydown', this.onDown, true);
    target.addEventListener('keyup', this.onUp, true);
    target.addEventListener('blur', this.onBlur);
  }
  private inField(e: KeyboardEvent): boolean { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  private onDown = (e: KeyboardEvent): void => {
    if (!this.enabled || this.inField(e) || !(ALL_CODES.has(e.code) || Object.values(KEY_MAPS).some((m) => e.code in m))) return;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (!e.repeat && !this.down.has(e.code)) this.tappedCodes.add(e.code);
    this.down.add(e.code);
  };
  private onUp = (e: KeyboardEvent): void => { this.down.delete(e.code); };
  private onBlur = (): void => { this.down.clear(); this.tappedCodes.clear(); };
  /** Какие кнопки удерживаются сейчас по выбранным раскладкам. */
  held(sets: KeySet[]): Partial<Record<Button, boolean>> {
    const out: Partial<Record<Button, boolean>> = {};
    for (const code of this.down) for (const s of sets) { const b = KEY_MAPS[s][code]; if (b) out[b] = true; }
    return out;
  }
  /** Кнопки, нажатые с прошлого опроса, по выбранным раскладкам. */
  taps(sets: KeySet[]): Button[] {
    const out: Button[] = [];
    for (const code of this.tappedCodes) for (const s of sets) { const b = KEY_MAPS[s][code]; if (b) out.push(b); }
    return out;
  }
  destroy(): void { this.target.removeEventListener('keydown', this.onDown, true); this.target.removeEventListener('keyup', this.onUp, true); this.target.removeEventListener('blur', this.onBlur); }
}
