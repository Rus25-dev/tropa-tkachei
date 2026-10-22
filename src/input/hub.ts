import { type Button, type Buttons, type InputFrame, edgesBetween, emptyButtons, mergeButtons } from '../core/input';
import { listPads, padFor, readPad } from './gamepad';
import { Keyboard, type KeySet } from './keyboard';

export interface PadEdge { pause: boolean; map: boolean }

/**
 * Единая точка ввода: клавиатура + геймпад + касание → InputFrame для ядра (удержание + фронты нажатий) для каждого локального игрока.
 * Фронт — переход «не нажата → нажата» между кадрами ИЛИ нажатие, случившееся между кадрами (короткий тап не теряется).
 */
export class InputHub {
  readonly keyboard = new Keyboard();
  /** Сюда пишет сенсорная панель (src/ui/TouchPad). Касанием управляет игрок, у которого есть экран (первый локальный). */
  touch: Partial<Record<Button, boolean>> = {};
  /** Касание уже использовалось: тогда на экране показываем сенсорные кнопки. */
  touchSeen = false;
  padSeen = false;
  /** Нажатия «пауза» и «карта» на геймпаде с прошлого опроса */
  padEdge: PadEdge = { pause: false, map: false };
  private prev: Buttons[] = [emptyButtons(), emptyButtons()];
  private pendTouch = new Set<Button>();
  private padPrev: { pause: boolean; map: boolean }[] = [];

  /** Нажатие сенсорной кнопки: фиксируем фронт сразу. */
  touchSet(b: Button, on: boolean): void { if (on && !this.touch[b]) this.pendTouch.add(b); this.touch[b] = on; this.touchSeen = true; }

  /** Снимает состояние ввода на этот кадр отрисовки для nPlayers игроков. Вызывать ровно раз за кадр. */
  frames(nPlayers: number): InputFrame[] {
    const pads = listPads();
    if (pads.length) this.padSeen = true;
    // пауза и карта геймпада: фронты по всем подключённым
    this.padEdge = { pause: false, map: false };
    pads.forEach((p, i) => {
      const s = readPad(p), pv = this.padPrev[i] ?? (this.padPrev[i] = { pause: false, map: false });
      if (s.pause && !pv.pause) this.padEdge.pause = true;
      if (s.map && !pv.map) this.padEdge.map = true;
      pv.pause = s.pause; pv.map = s.map;
    });
    const out: InputFrame[] = [];
    for (let i = 0; i < nPlayers; i++) {
      const sets: KeySet[] = nPlayers === 1 ? ['p1', 'arrows'] : i === 0 ? ['p1'] : ['p2'];
      const pad = padFor(i, nPlayers, pads);
      const buttons = mergeButtons(this.keyboard.held(sets), pad ? readPad(pad).held : {}, i === 0 ? this.touch : {});
      const prev = this.prev[i] ?? emptyButtons();
      const edges = edgesBetween(prev, buttons);
      for (const b of [...this.keyboard.taps(sets), ...(i === 0 ? this.pendTouch : [])]) {
        if (b === 'jump') edges.jumpP = true; else if (b === 'atk') edges.atkP = true; else if (b === 'dash') edges.dashP = true;
        else if (b === 'heal') edges.healP = true; else if (b === 'up') edges.upP = true; else if (b === 'bomb') edges.bombP = true; else if (b === 'tool') edges.toolP = true;
        else if (b === 'parry') edges.parryP = true; else if (b === 'bind') edges.bindP = true; else if (b === 'burst') edges.burstP = true;
      }
      this.prev[i] = buttons;
      out.push({ buttons, edges });
    }
    this.keyboard.tappedCodes.clear(); this.pendTouch.clear();
    return out;
  }
  /** Совместимость с каркасом этапа 1: кадр первого игрока */
  frame(): InputFrame { return this.frames(1)[0]!; }
  destroy(): void { this.keyboard.destroy(); }
}
