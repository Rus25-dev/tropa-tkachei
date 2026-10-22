// Сенсорное управление (legacy/src/touch.js): плавающий стик слева (появляется под пальцем), кнопки справа, пауза / карта / полный экран сверху.
// Нажатия идут в InputHub (фронты считает он); зоны не меньше 44 px; размер и прозрачность — из настроек (--ts, --bop), «левша» зеркалит.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Button } from '../core/input';
import type { InputHub } from '../input/hub';
import { settings } from '../app/store';
import { Snd } from '../view/audio/snd';

const buzz = (ms = 8): void => { try { if (navigator.vibrate && settings.s.vibro) navigator.vibrate(ms); } catch { /* не поддерживается */ } };
const canFs = (): boolean => !!(document.documentElement.requestFullscreen || (document.documentElement as unknown as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen);
const isFs = (): boolean => !!(document.fullscreenElement || (document as unknown as { webkitFullscreenElement?: unknown }).webkitFullscreenElement);
export function goFullscreen(): void {
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  void el.requestFullscreen().then(() => { try { void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape')?.catch(() => undefined); } catch { /* не поддерживается */ } }).catch(() => undefined);
}

function cap(e: PointerEvent): void { try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* синтетическое событие или палец уже отпущен */ } }

interface Props { hub: InputHub; tool: boolean; bombs: boolean; /** открытые приёмы рывка (kit): подсказки на кнопке рывка */ kit?: string[]; hidden?: boolean; padMode?: boolean; showMap?: boolean; onPause: () => void; onMap: () => void }

export function TouchPad({ hub, tool, bombs, kit, hidden, padMode, showMap, onPause, onMap }: Props) {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [on, setOn] = useState<Partial<Record<Button, boolean>>>({});
  const [hint, setHint] = useState(true);
  const [fs, setFs] = useState(isFs());
  const sid = useRef<number | null>(null), origin = useRef({ x: 0, y: 0 });
  useEffect(() => { const t = setTimeout(() => setHint(false), 6000); return () => clearTimeout(t); }, []);
  useEffect(() => { const f = (): void => setFs(isFs()); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  // Android: первое касание разворачивает на весь экран
  useEffect(() => {
    if (!canFs() || isFs()) return;
    const auto = (): void => { document.removeEventListener('pointerup', auto, true); if (!isFs()) goFullscreen(); };
    document.addEventListener('pointerup', auto, true);
    return () => document.removeEventListener('pointerup', auto, true);
  }, []);
  const R = 52;
  const press = (b: Button) => ({
    onPointerDown: (e: PointerEvent) => { e.preventDefault(); Snd.init(); cap(e); hub.touchSet(b, true); setOn((o) => ({ ...o, [b]: true })); buzz(); },
    onPointerUp: () => { hub.touchSet(b, false); setOn((o) => ({ ...o, [b]: false })); },
    onPointerCancel: () => { hub.touchSet(b, false); setOn((o) => ({ ...o, [b]: false })); },
    onLostPointerCapture: () => { hub.touchSet(b, false); setOn((o) => ({ ...o, [b]: false })); },
    onContextMenu: (e: Event) => e.preventDefault(),
  });
  const zoneDown = (e: PointerEvent): void => {
    if (sid.current !== null) return;
    e.preventDefault(); Snd.init(); sid.current = e.pointerId; origin.current = { x: e.clientX, y: e.clientY };
    cap(e);
    setBase({ x: e.clientX, y: e.clientY }); setKnob({ x: 0, y: 0 }); setHint(false);
  };
  const zoneMove = (e: PointerEvent): void => {
    if (e.pointerId !== sid.current) return;
    let dx = e.clientX - origin.current.x, dy = e.clientY - origin.current.y; const l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    setKnob({ x: dx, y: dy });
    hub.touchSet('left', dx < -16); hub.touchSet('right', dx > 16); hub.touchSet('up', dy < -26); hub.touchSet('down', dy > 26);
  };
  const zoneEnd = (e: PointerEvent): void => {
    if (e.pointerId !== sid.current) return;
    sid.current = null; setBase(null);
    for (const b of ['left', 'right', 'up', 'down'] as Button[]) hub.touchSet(b, false);
  };
  useEffect(() => { if (hidden) { for (const b of ['left', 'right', 'up', 'down', 'jump', 'atk', 'dash', 'heal', 'bomb', 'tool'] as Button[]) hub.touchSet(b, false); sid.current = null; setBase(null); } }, [hidden]);
  const btn = (b: Button, cls: string, big: string, label: string, aria: string, hide?: boolean) => (
    <button type="button" class={`t-btn ${cls} ${on[b] ? 'on' : ''}`} data-btn={b} aria-label={aria} hidden={hide} {...press(b)}><b>{big}</b><i>{label}</i></button>
  );
  return (
    <div id="touch" class={`${padMode ? 'padmode' : ''}`} data-testid="touchpad" hidden={hidden}>
      <div class="t-zone" data-testid="stick" onPointerDown={zoneDown} onPointerMove={zoneMove} onPointerUp={zoneEnd} onPointerCancel={zoneEnd} onLostPointerCapture={zoneEnd}>
        {base && <div class="t-base" style={{ left: base.x + 'px', top: base.y + 'px' }}><div class="t-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} /></div>}
        <span class={`t-hint ${hint ? '' : 'gone'}`}>тяни, чтобы идти{kit && kit.length > 0 ? ' · рывок: держи — заряд, в воздухе со стиком — вспышка' : ''}</span>
      </div>
      <div class="t-btns">
        {btn('heal', 't-heal', '✚', 'Нить', 'Лечение')}
        {btn('dash', 't-dash', '»', kit?.some((k) => k.startsWith('hold:')) ? 'держи' : 'Рывок', kit && kit.length > 0 ? 'Рывок: держите для заряда, в воздухе со стиком — вспышка' : 'Рывок')}
        {btn('tool', 't-tool', '✦', 'Инстр.', 'Инструмент', !tool)}
        {btn('bomb', 't-bomb', '●', 'Бомба', 'Дымовая бомба', !bombs)}
        {btn('atk', 't-atk', '⟋', 'Удар', 'Удар')}
        {btn('jump', 't-jump', '▲', 'Прыжок', 'Прыжок')}
      </div>
      {showMap && <button type="button" class="t-map" aria-label="Карта" onClick={onMap}>▤</button>}
      <button type="button" class="t-pause" aria-label="Пауза" data-testid="t-pause" onClick={onPause}>❚❚</button>
      {canFs() && !fs && <button type="button" class="t-fs" aria-label="На весь экран" onClick={goFullscreen}>⛶</button>}
    </div>
  );
}
