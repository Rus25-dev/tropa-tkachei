import { type Button, type Buttons, type InputFrame, edgesBetween, emptyButtons, mergeButtons } from '../core/input';
import { readGamepads } from './gamepad';
import { Keyboard } from './keyboard';

/**
 * Единая точка ввода: клавиатура + геймпад + касание → InputFrame для ядра (удержание + фронты нажатий).
 * Фронт — переход «не нажата → нажата» между кадрами ИЛИ нажатие, случившееся между кадрами (короткий тап не теряется).
 */
export class InputHub {
  readonly keyboard = new Keyboard();
  /** Сюда пишет сенсорная панель (src/ui/TouchPad). */
  touch: Partial<Record<Button, boolean>> = {};
  /** Касание уже использовалось: тогда на экране показываем сенсорные кнопки. */
  touchSeen = false;
  padSeen = false;
  private prev: Buttons = emptyButtons();
  private pendTouch = new Set<Button>();

  /** Нажатие сенсорной кнопки: фиксируем фронт сразу. */
  touchSet(b: Button, on: boolean): void { if (on && !this.touch[b]) this.pendTouch.add(b); this.touch[b] = on; this.touchSeen = true; }

  /** Снимает состояние ввода на этот кадр отрисовки. Вызывать ровно раз за кадр. */
  frame(): InputFrame {
    const pad = readGamepads();
    if (pad.any) this.padSeen = true;
    const buttons = mergeButtons(this.keyboard.held(), pad.held, this.touch);
    const edges = edgesBetween(this.prev, buttons);
    for (const b of [...this.keyboard.tapped, ...this.pendTouch]) {
      if (b === 'jump') edges.jumpP = true; else if (b === 'atk') edges.atkP = true; else if (b === 'dash') edges.dashP = true;
      else if (b === 'heal') edges.healP = true; else if (b === 'up') edges.upP = true; else if (b === 'bomb') edges.bombP = true; else if (b === 'tool') edges.toolP = true;
    }
    this.keyboard.tapped.clear(); this.pendTouch.clear();
    this.prev = buttons;
    return { buttons, edges };
  }
  destroy(): void { this.keyboard.destroy(); }
}
