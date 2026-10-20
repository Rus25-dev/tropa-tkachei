import type { Button } from '../core/input';
import type { InputHub } from '../input/hub';

const BTNS: { b: Button; label: string; cls: string }[] = [
  { b: 'jump', label: 'Прыжок', cls: 'a' }, { b: 'atk', label: 'Удар', cls: 'b' }, { b: 'dash', label: 'Рывок', cls: 'c' },
  { b: 'heal', label: 'Нить', cls: 'd' }, { b: 'tool', label: 'Инстр.', cls: 'e' },
];
const DIRS: Button[] = ['left', 'right', 'up', 'down'];

/** Сенсорное управление каркаса: стик слева (4 направления), кнопки справа. Нажатия идут в InputHub; зоны ≥ 44 px. */
export function TouchPad({ hub }: { hub: InputHub }) {
  const press = (b: Button, on: boolean) => (e: PointerEvent) => { e.preventDefault(); hub.touchSet(b, on); };
  const stick = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    hub.touchSet('left', dx < -0.3); hub.touchSet('right', dx > 0.3); hub.touchSet('up', dy < -0.5); hub.touchSet('down', dy > 0.5);
  };
  const release = () => { for (const b of DIRS) hub.touchSet(b, false); };
  return (
    <div class="touchpad" data-testid="touchpad">
      <div class="stick" data-testid="stick" onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); stick(e); }} onPointerMove={(e) => { if (e.buttons & 1) stick(e); }} onPointerUp={release} onPointerCancel={release}>
        <span>стик</span>
      </div>
      <div class="btns">
        {BTNS.map(({ b, label, cls }) => (
          <button key={b} type="button" class={`tb ${cls}`} data-btn={b} onPointerDown={press(b, true)} onPointerUp={press(b, false)} onPointerCancel={press(b, false)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
