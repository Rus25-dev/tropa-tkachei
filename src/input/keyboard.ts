import type { Button } from '../core/input';

// Раскладка как в v1.8 (игрок 1 и «стрелки» вместе, когда играет один): WASD/стрелки, Пробел/Z прыжок, F/X удар, G/C рывок, Q/V нить, R/B дымовуха, E инструмент.
export const KEY_MAP: Record<string, Button> = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  Space: 'jump', KeyZ: 'jump', KeyF: 'atk', KeyX: 'atk', KeyG: 'dash', KeyC: 'dash', KeyQ: 'heal', KeyV: 'heal', KeyR: 'bomb', KeyB: 'bomb', KeyE: 'tool',
};

/** Клавиатура на DOM-событиях: короткое нажатие между кадрами не теряется (taps), удержание считается по множеству нажатых клавиш. */
export class Keyboard {
  private down = new Set<string>();
  /** Нажатия, случившиеся с прошлого опроса (даже если клавишу успели отпустить). */
  tapped = new Set<Button>();
  constructor(private target: Window = window) {
    target.addEventListener('keydown', this.onDown, true);
    target.addEventListener('keyup', this.onUp, true);
    target.addEventListener('blur', this.onBlur);
  }
  private inField(e: KeyboardEvent): boolean { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  private onDown = (e: KeyboardEvent): void => {
    if (this.inField(e)) return;
    const b = KEY_MAP[e.code]; if (!b) return;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (!e.repeat && !this.down.has(e.code)) this.tapped.add(b);
    this.down.add(e.code);
  };
  private onUp = (e: KeyboardEvent): void => { this.down.delete(e.code); };
  private onBlur = (): void => { this.down.clear(); };
  /** Какие кнопки удерживаются сейчас. */
  held(): Partial<Record<Button, boolean>> {
    const out: Partial<Record<Button, boolean>> = {};
    for (const code of this.down) { const b = KEY_MAP[code]; if (b) out[b] = true; }
    return out;
  }
  destroy(): void { this.target.removeEventListener('keydown', this.onDown, true); this.target.removeEventListener('keyup', this.onUp, true); this.target.removeEventListener('blur', this.onBlur); }
}
