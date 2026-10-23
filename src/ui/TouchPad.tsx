// Сенсорное управление (legacy/src/touch.js): плавающий стик слева (появляется под пальцем), кнопки справа, пауза / карта / полный экран сверху.
// Нажатия идут в InputHub (фронты считает он). Каждое удержание закреплено за своими пальцами (pointerId): отпускание одного пальца
// не снимает кнопку, которую держит другой. Потеря фокуса, сворачивание, поворот и выход из игры отпускают всё сразу.
// Раскладка «полная» — отдельные отбив, лечение и всполох, как отдельные клавиши; «простая» — одна кнопка «Нить», как клавиша нити.
// Область касания не меньше 48 px при любом размере кнопок (::before в styles.css). Места кнопок, расстояние, размер и прозрачность — из настроек.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Button } from '../core/input';
import { P } from '../core/balance';
import { selectedTool, toolSlot } from '../core/tool-kit';
import { toolAmmo } from '../core/tool-ammo';
import { TOOLS } from '../core/loadout';
import type { Player } from '../core/types';
import type { World } from '../core/world';
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

// ---------- раскладка ----------
/** кнопка панели: id (он же ключ сдвига в настройках), что нажимает, место по умолчанию от правого нижнего угла (px при размере «обычные») */
export interface PadBtn { id: string; b: Button; cls: string; big: string; label: string; aria: string; r: number; bt: number; size: number }
/** Кнопки для раскладки. tool / bombs — показывать ли инструмент и дымовуху (дымовуха только на арене Миши). */
export function padButtons(o: { simple: boolean; tool: boolean; bombs: boolean }): PadBtn[] {
  const L: PadBtn[] = [
    { id: 'jump', b: 'jump', cls: 't-jump', big: '▲', label: 'Прыжок', aria: 'Прыжок', r: 0, bt: 0, size: 88 },
    { id: 'atk', b: 'atk', cls: 't-atk', big: '⟋', label: 'Удар', aria: 'Удар', r: 100, bt: 8, size: 76 },
    { id: 'dash', b: 'dash', cls: 't-dash', big: '»', label: 'Рывок', aria: 'Рывок', r: 6, bt: 100, size: 66 },
  ];
  if (o.simple) L.push({ id: 'heal', b: 'heal', cls: 't-heal', big: '✚', label: 'Нить', aria: 'Нить: лечение, отбив, со стиком вверх — всполох', r: 98, bt: 96, size: 64 });
  else L.push(
    { id: 'parry', b: 'parry', cls: 't-parry', big: '◇', label: 'Отбив', aria: 'Отбив', r: 98, bt: 96, size: 64 },
    { id: 'heal', b: 'bind', cls: 't-heal', big: '✚', label: 'Лечение', aria: 'Лечение', r: 176, bt: 112, size: 56 },
    { id: 'burst', b: 'burst', cls: 't-burst', big: '✺', label: 'Всполох', aria: 'Нитяной всполох', r: 246, bt: 120, size: 52 },
  );
  if (o.tool) L.push({ id: 'tool', b: 'tool', cls: 't-tool', big: '✦', label: 'Инстр.', aria: 'Инструмент', r: 186, bt: 26, size: 62 });
  if (o.bombs) L.push({ id: 'bomb', b: 'bomb', cls: 't-bomb', big: '●', label: 'Бомба', aria: 'Дымовая бомба', r: 256, bt: 36, size: 56 });
  return L;
}
/** место кнопки с учётом расстояния (tgap) и сдвига игрока; у левши горизонталь зеркалится */
export function padStyle(btn: PadBtn): Record<string, string> {
  const g = (settings.s.tgap || 100) / 100, [dx, dy] = settings.s.tpos?.[btn.id] ?? [0, 0];
  const side = Math.round(btn.r * g - dx), bottom = Math.round(btn.bt * g - dy);
  return { [settings.s.lefty ? 'left' : 'right']: side + 'px', bottom: bottom + 'px', width: btn.size + 'px', height: btn.size + 'px' };
}

// ---------- что показывают кнопки ----------
interface Live { tool: string; toolName: string; ammo: number | null; slot: string; toolReady: boolean; toolCd: number; healReady: boolean; burstReady: boolean; parryReady: boolean }
const NOLIVE: Live = { tool: '', toolName: '', ammo: null, slot: 'neutral', toolReady: true, toolCd: 0, healReady: false, burstReady: false, parryReady: true };
/** короткое имя инструмента для кнопки: последнее слово названия («Метательная игла» → «Игла») */
const shortName = (name: string): string => { const w = name.trim().split(/\s+/).pop() ?? ''; return w.charAt(0).toUpperCase() + w.slice(1); };
function liveOf(w: World | null, p: Player | undefined): Live {
  if (!w || !p || p.remote) return NOLIVE;
  const tool = selectedTool(p), T = TOOLS[tool], ammo = tool ? toolAmmo(p, tool) : null, cd = (p['toolCd'] as number) || 0;
  return {
    tool, toolName: T ? shortName(T.name) : '', ammo, slot: toolSlot(p),
    toolReady: !!T && ammo !== 0 && cd <= 0 && p.silk >= (T.cost || 0),
    toolCd: T && cd > 0 ? Math.round(Math.min(1, cd / (T.cd || 0.5)) * 20) / 20 : 0,
    healReady: p.silk >= w.silkMax && p.hp < p.maxHp, burstReady: p.silk >= P.BURST,
    parryReady: ((p['parryCd'] as number) || 0) <= 0,
  };
}

// ---------- стик с гистерезисом: направление включается дальше, чем выключается, чтобы дрожание пальца не переключало слот инструмента ----------
type Dirs = Record<'left' | 'right' | 'up' | 'down', boolean>;
const R = 52, ON_X = 18, OFF_X = 10, ON_Y = 30, OFF_Y = 18;
const NODIRS: Dirs = { left: false, right: false, up: false, down: false };
export function stickDirs(dx: number, dy: number, was: Dirs): Dirs {
  return {
    left: dx < -(was.left ? OFF_X : ON_X), right: dx > (was.right ? OFF_X : ON_X),
    up: dy < -(was.up ? OFF_Y : ON_Y), down: dy > (was.down ? OFF_Y : ON_Y),
  };
}

interface Props { hub: InputHub; tool: boolean; bombs: boolean; /** мир для подсказок на кнопках (запас, откат, готовность) */ world?: () => World | null; /** открытые приёмы рывка (kit): подсказки на кнопке рывка */ kit?: string[]; hidden?: boolean; padMode?: boolean; showMap?: boolean; onPause: () => void; onMap: () => void }

export function TouchPad({ hub, tool, bombs, world, kit, hidden, padMode, showMap, onPause, onMap }: Props) {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [on, setOn] = useState<Partial<Record<Button, boolean>>>({});
  const [hint, setHint] = useState(true);
  const [fs, setFs] = useState(isFs());
  const [live, setLive] = useState<Live>(NOLIVE);
  const [, bump] = useState(0);
  const sid = useRef<number | null>(null), origin = useRef({ x: 0, y: 0 });
  const dirs = useRef<Dirs>({ ...NODIRS });
  /** кто держит кнопку: набор пальцев (pointerId) на каждую */
  const holds = useRef(new Map<Button, Set<number>>());

  /** отпустить всё: кнопки, стик, ещё не отданные ядру нажатия, подсветку */
  const releaseAll = (): void => {
    holds.current.clear(); hub.touchReset();
    sid.current = null; dirs.current = { ...NODIRS };
    setBase(null); setOn({});
  };
  useEffect(() => { const t = setTimeout(() => setHint(false), 6000); return () => clearTimeout(t); }, []);
  useEffect(() => { const f = (): void => setFs(isFs()); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  useEffect(() => settings.subscribe(() => bump((n) => n + 1)), []);
  // потеря фокуса, сворачивание, уход со страницы, поворот — пальцы могли остаться «нажатыми» без события pointerup
  useEffect(() => {
    const off = (): void => releaseAll();
    const vis = (): void => { if (document.hidden) releaseAll(); };
    const so = screen.orientation as ScreenOrientation | undefined;
    window.addEventListener('blur', off); window.addEventListener('pagehide', off); window.addEventListener('orientationchange', off);
    document.addEventListener('visibilitychange', vis); so?.addEventListener?.('change', off);
    return () => {
      window.removeEventListener('blur', off); window.removeEventListener('pagehide', off); window.removeEventListener('orientationchange', off);
      document.removeEventListener('visibilitychange', vis); so?.removeEventListener?.('change', off);
      releaseAll(); // выход из игры: панель убрана
    };
  }, []);
  useEffect(() => { if (hidden) releaseAll(); }, [hidden]);
  // Android: первое касание разворачивает на весь экран
  useEffect(() => {
    if (!canFs() || isFs()) return;
    const auto = (): void => { document.removeEventListener('pointerup', auto, true); if (!isFs()) goFullscreen(); };
    document.addEventListener('pointerup', auto, true);
    return () => document.removeEventListener('pointerup', auto, true);
  }, []);
  // раз в кадр: какой инструмент сработает, запас, откаты (состояние меняется только при изменении)
  useEffect(() => {
    if (!world || hidden) return undefined;
    let raf = 0, last = '';
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const w = world(), l = liveOf(w, w?.players[0]), key = JSON.stringify(l);
      if (key !== last) { last = key; setLive(l); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world, hidden]);

  const hold = (b: Button, id: number, down: boolean): void => {
    let set = holds.current.get(b);
    if (down) { if (!set) holds.current.set(b, set = new Set()); set.add(id); } else if (set) set.delete(id);
    const pressed = !!set && set.size > 0;
    if (pressed !== !!hub.touch[b]) hub.touchSet(b, pressed);
    setOn((o) => (!!o[b] === pressed ? o : { ...o, [b]: pressed }));
  };
  const press = (b: Button) => {
    const up = (e: PointerEvent): void => hold(b, e.pointerId, false);
    return {
      onPointerDown: (e: PointerEvent) => { e.preventDefault(); Snd.init(); cap(e); hold(b, e.pointerId, true); buzz(); },
      onPointerUp: up, onPointerCancel: up, onLostPointerCapture: up,
      onContextMenu: (e: Event) => e.preventDefault(),
    };
  };
  const setDirs = (d: Dirs): void => {
    for (const k of ['left', 'right', 'up', 'down'] as const) if (d[k] !== dirs.current[k]) hub.touchSet(k, d[k]);
    dirs.current = d;
  };
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
    setDirs(stickDirs(dx, dy, dirs.current));
  };
  const zoneEnd = (e: PointerEvent): void => {
    if (e.pointerId !== sid.current) return;
    sid.current = null; setBase(null);
    setDirs({ ...NODIRS });
  };

  const simple = settings.s.tlayout === 'simple';
  const arrow = live.slot === 'up' ? '↑' : live.slot === 'down' ? '↓' : '';
  const kitHint = !!kit && kit.length > 0;
  const view = (x: PadBtn) => {
    let cls = x.cls, label = x.label, aria = x.aria;
    if (x.id === 'dash' && kit?.some((k) => k.startsWith('hold:'))) label = 'держи';
    if (x.id === 'dash' && kitHint) aria = 'Рывок: держите для заряда, в воздухе со стиком — вспышка';
    if (x.b === 'parry' && !live.parryReady) cls += ' dim';
    if (x.b === 'bind') cls += live.healReady ? ' ready' : ' dim';
    if (x.b === 'burst') cls += live.burstReady ? ' ready' : ' dim';
    const isTool = x.b === 'tool';
    if (isTool) { if (!live.toolReady) cls += ' dim'; label = live.toolName || label; aria = `Инструмент${live.toolName ? ': ' + live.toolName : ''}`; }
    return (
      <button type="button" key={x.id} class={`t-btn ${cls} ${on[x.b] ? 'on' : ''}`} style={isTool ? { ...padStyle(x), '--cd': String(live.toolCd) } : padStyle(x)}
        data-btn={x.id} data-tool={isTool ? live.tool : undefined} aria-label={aria} {...press(x.b)}>
        <b>{x.big}{isTool && arrow && <small>{arrow}</small>}</b><i>{label}</i>
        {isTool && live.ammo !== null && <s class="t-ammo">{live.ammo}</s>}
      </button>
    );
  };
  return (
    <div id="touch" class={`${padMode ? 'padmode' : ''}`} data-testid="touchpad" hidden={hidden}>
      <div class="t-zone" data-testid="stick" onPointerDown={zoneDown} onPointerMove={zoneMove} onPointerUp={zoneEnd} onPointerCancel={zoneEnd} onLostPointerCapture={zoneEnd}>
        {base && <div class="t-base" style={{ left: base.x + 'px', top: base.y + 'px' }}><div class="t-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} /></div>}
        <span class={`t-hint ${hint ? '' : 'gone'}`}>тяни, чтобы идти{simple ? ' · стик ↑ + Нить — всполох' : ''}{tool ? ' · стик ↑/↓ + инструмент — другой слот' : ''}{kitHint ? ' · рывок: держи — заряд, в воздухе со стиком — вспышка' : ''}</span>
      </div>
      <div class="t-btns">{padButtons({ simple, tool, bombs }).map(view)}</div>
      {showMap && <button type="button" class="t-map" aria-label="Карта" onClick={onMap}>▤</button>}
      <button type="button" class="t-pause" aria-label="Пауза" data-testid="t-pause" onClick={onPause}>❚❚</button>
      {canFs() && !fs && <button type="button" class="t-fs" aria-label="На весь экран" onClick={goFullscreen}>⛶</button>}
    </div>
  );
}

/** Расстановка кнопок: кнопки показаны как в игре, их можно перетаскивать пальцем; сдвиги сохраняются в настройках (tpos). */
export function TouchLayoutEditor({ onClose }: { onClose: () => void }) {
  const [, bump] = useState(0);
  const drag = useRef<{ id: string; pid: number; x: number; y: number; d0: [number, number] } | null>(null);
  useEffect(() => settings.subscribe(() => bump((n) => n + 1)), []);
  const simple = settings.s.tlayout === 'simple';
  const ts = (): number => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts')) || 1;
  const down = (id: string) => (e: PointerEvent): void => {
    e.preventDefault(); cap(e);
    drag.current = { id, pid: e.pointerId, x: e.clientX, y: e.clientY, d0: settings.s.tpos?.[id] ?? [0, 0] };
  };
  const move = (e: PointerEvent): void => {
    const d = drag.current; if (!d || d.pid !== e.pointerId) return;
    const k = ts(), mx = (e.clientX - d.x) / k * (settings.s.lefty ? -1 : 1), my = (e.clientY - d.y) / k;
    settings.s.tpos = { ...settings.s.tpos, [d.id]: [Math.round(d.d0[0] + mx), Math.round(d.d0[1] + my)] };
    bump((n) => n + 1);
  };
  const up = (e: PointerEvent): void => { if (drag.current?.pid === e.pointerId) { drag.current = null; settings.save(); } };
  return (
    <div id="touch" class="t-edit" data-testid="touch-editor" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div class="t-edit-bar">
        <span>Перетащите кнопки пальцем. Стик появляется там, где вы коснулись левой части экрана.</span>
        <button type="button" class="btn" data-testid="touch-edit-reset" onClick={() => settings.set('tpos', {})}>Сбросить</button>
        <button type="button" class="btn primary" data-testid="touch-edit-done" onClick={onClose}>Готово</button>
      </div>
      <div class="t-btns">
        {padButtons({ simple, tool: true, bombs: true }).map((x) => (
          <button type="button" key={x.id} class={`t-btn ${x.cls}`} style={padStyle(x)} data-btn={x.id} aria-label={'Передвинуть: ' + x.aria} onPointerDown={down(x.id)}>
            <b>{x.big}</b><i>{x.label}</i>
          </button>
        ))}
      </div>
    </div>
  );
}
