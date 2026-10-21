// Общие кирпичики интерфейса: панель с «← Назад», хлебными крошками и подсказкой; пункты меню; вкладки; подписка на хранилища.
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Snd } from '../view/audio/snd';
import { device, hintText, registerPanel, type Dev, type HintOpt } from './nav';
import { settings } from '../app/store';

/** Текущее устройство ввода (перерисовывает подписи при смене) */
export function useDevice(): Dev {
  const [d, setD] = useState<Dev>(device.get());
  useEffect(() => device.subscribe(() => setD(device.get())), []);
  return d;
}
/** Перерисовка при изменении настроек */
export function useSettings(): typeof settings.s {
  const [, setN] = useState(0);
  useEffect(() => settings.subscribe(() => setN((n) => n + 1)), []);
  return settings.s;
}

interface PanelProps {
  crumbs?: string[];
  onBack?: () => void;
  hint?: HintOpt;
  /** корень (главное меню) — без панели «Назад» */
  root?: boolean;
  /** без верхней панели, но непрозрачная (пауза, победа) */
  bare?: boolean;
  digits?: boolean;
  cls?: string;
  /** панель выше обычных (поверх другой) */
  z?: number;
  label?: string;
  /** собственная обработка клавиш: true — событие обработано */
  onKey?: (e: KeyboardEvent) => boolean;
  children?: ComponentChildren;
  /** вне прокручиваемой части и вне навигации по фокусу (строка версии в главном меню) */
  aside?: ComponentChildren;
  /** вместо подсказки по умолчанию */
  foot?: ComponentChildren;
  /** геймпад здесь не двигает фокус (идёт ввод клавиши) */
  padlock?: boolean;
}
/** Полноэкранная панель поверх холста. Непрозрачная (кроме корня): сквозь неё ничего не просвечивает. */
export function Panel({ crumbs = [], onBack, hint, root, bare, digits = true, cls = '', z, label, onKey, children, aside, foot, padlock }: PanelProps) {
  const ref = useRef<HTMLElement>(null);
  const dev = useDevice();
  const opened = useRef(performance.now());
  const back = useRef(onBack); back.current = onBack;
  const key = useRef(onKey); key.current = onKey;
  // регистрация — сразу после вставки в DOM, чтобы Esc сразу после перехода не терялся
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    opened.current = performance.now();
    const off = registerPanel({ el, digits, back: () => { if (back.current) { Snd.play('clink'); back.current(); } }, onKey: (e) => !!key.current?.(e) });
    // первый пункт получает фокус (клавиатура и геймпад сразу работают)
    const f = el.querySelector<HTMLElement>('.ovbody button:not([disabled]), .ovbody input:not([disabled])');
    if (f && !el.contains(document.activeElement)) f.focus({ preventScroll: true });
    return off;
  }, [digits]);
  const ghost = (e: MouseEvent): void => { if (device.get() === 'touch' && performance.now() - opened.current < 350) { e.preventDefault(); e.stopPropagation(); } };
  return (
    <section ref={ref} class={`ov ${root ? 'root' : ''} ${bare ? 'bare' : ''} ${cls}`} style={z ? { zIndex: z } : undefined} role="dialog" aria-label={label ?? crumbs[crumbs.length - 1] ?? 'Меню'} onClickCapture={ghost} data-padlock={padlock ? '1' : undefined} data-testid={root ? 'panel-root' : 'panel'}>
      {!root && !bare && (
        <header class="ovbar">
          <button type="button" class="ovback" onClick={() => { Snd.play('clink'); onBack?.(); }}>← Назад</button>
          <nav class="crumbs" aria-label="Где вы">
            {crumbs.map((c, i) => (<>{i > 0 && <span class="sep"> › </span>}{i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}</>))}
          </nav>
        </header>
      )}
      {aside}
      <div class="ovbody">{children}</div>
      <footer class="ovhint" role="group">{foot ?? hintText({ back: !root, ...hint }, dev)}</footer>
    </section>
  );
}

export interface ItemProps {
  n?: number | string;
  label: ComponentChildren;
  sub?: ComponentChildren;
  value?: ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  id?: string;
  cls?: string;
  /** ← → меняют значение пункта */
  onLR?: (d: number) => void;
}
export function Item({ n, label, sub, value, onClick, disabled, danger, id, cls = '', onLR }: ItemProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el || !onLR) return;
    const h = (e: Event): void => onLR((e as CustomEvent<number>).detail);
    el.addEventListener('lr', h); return () => el.removeEventListener('lr', h);
  }, [onLR]);
  return (
    <button ref={ref} type="button" class={`mi ${danger ? 'danger' : ''} ${disabled ? 'off' : ''} ${cls}`} aria-disabled={disabled ? 'true' : undefined} data-testid={id} data-n={n} data-lr={onLR ? '1' : undefined}
      onClick={() => { if (disabled) { Snd.init(); Snd.play('hit'); return; } Snd.init(); Snd.play('bead'); onClick?.(); }}>
      {n != null && <span class="mn">{n}</span>}
      <span class="mt"><span class="ml">{label}</span>{sub != null && sub !== '' && <span class="ms">{sub}</span>}</span>
      {value != null && value !== '' && <span class="mv">{value}</span>}
    </button>
  );
}

/** Левая колонка экрана (заголовок и описание) + правая (пункты) */
export function Screen({ title, info, children, hero }: { title?: ComponentChildren; info?: ComponentChildren; children: ComponentChildren; hero?: ComponentChildren }) {
  return (
    <div class="scr">
      <div class="scr-l">
        {hero}
        {title != null && <h2 class="scr-t">{title}</h2>}
        {info != null && <div class="scr-i">{info}</div>}
      </div>
      <div class="scr-r">{children}</div>
    </div>
  );
}

/** Вкладки (Как играть): ← → и LB/RB переключают, 1–4 прямой выбор */
export function Tabs({ tabs, i, set }: { tabs: string[]; i: number; set: (i: number) => void }) {
  return (
    <div class="tabs" role="tablist">
      {tabs.map((t, k) => (<button key={t} type="button" role="tab" aria-selected={k === i} tabIndex={k === i ? 0 : -1} class="tab" onClick={() => set(k)}>{t}</button>))}
    </div>
  );
}
