// Управление меню: какое устройство вводило последним (клавиатура / геймпад / касание), подсказки под него, навигация фокусом
// по кнопкам открытой панели (стрелки, W S, цифры, Enter, Esc), геймпад (крестовина/стик, A, B) и касание. Один обработчик на всё
// приложение: панели только регистрируются (Panel в kit.tsx), верхняя по z-порядку получает ввод.
import { listPads, padKind } from '../input/gamepad';

export type Dev = 'kb' | 'pad' | 'touch';
type Fn = () => void;

let last: Dev = 'kb';
const subs = new Set<Fn>();
export const device = { get: (): Dev => last, subscribe: (f: Fn) => { subs.add(f); return () => { subs.delete(f); }; } };
export function setDevice(d: Dev): void {
  if (d === last) return;
  last = d; document.documentElement.classList.toggle('navpad', d === 'pad');
  for (const f of [...subs]) f();
}

/** подписи кнопок геймпада (PlayStation: ✕ / ○ / □) */
export function padNames(): { ok: string; back: string; x: string } {
  let ps = false;
  try { const p = listPads()[0]; ps = !!p && padKind(p) === 'ps'; } catch { /* нет геймпада */ }
  return ps ? { ok: '✕', back: '○', x: '□' } : { ok: 'A', back: 'B', x: 'X' };
}

export interface HintOpt { nums?: number | string; lr?: string; back?: boolean; act?: string; extra?: Partial<Record<Dev, string>>; touchAct?: string }
/** одна строка подсказок под текущее устройство */
export function hintText(o: HintOpt = {}, dev: Dev = last): string {
  const act = o.act ?? 'открыть', ex = o.extra?.[dev] ?? '', n = padNames(), p: string[] = [];
  if (dev === 'touch') { p.push(o.touchAct ?? 'Коснитесь пункта'); if (o.back !== false) p.push('«← Назад» — на уровень выше'); }
  else if (dev === 'pad') { p.push('↑ ↓ — выбор', `${n.ok} — ${act}`); if (o.lr) p.push('← → — ' + o.lr); if (o.back !== false) p.push(`${n.back} — назад`); }
  else {
    p.push('↑ ↓ — выбор', `Enter — ${act}`);
    if (o.nums) p.push((typeof o.nums === 'number' ? (o.nums > 1 ? `1–${o.nums}` : '1') : o.nums) + ' — сразу к пункту');
    if (o.lr) p.push('← → — ' + o.lr);
    if (o.back !== false) p.push('Esc — назад');
  }
  if (ex) p.push(ex);
  return p.join(' · ');
}

// ----- панели -----
export interface PanelReg { el: HTMLElement; back: () => void; digits: boolean; onKey?: (e: KeyboardEvent) => boolean }
const panels: PanelReg[] = [];
export function registerPanel(r: PanelReg): () => void { panels.push(r); return () => { const i = panels.indexOf(r); if (i >= 0) panels.splice(i, 1); }; }
const zOf = (el: HTMLElement): number => Number(getComputedStyle(el).zIndex) || 0;
/** верхняя открытая панель: по z-index, при равенстве — открытая позже */
export function topPanel(): PanelReg | null {
  let best: PanelReg | null = null, bz = -1;
  for (const r of panels) { if (!r.el.isConnected) continue; const z = zOf(r.el); if (z >= bz) { bz = z; best = r; } }
  return best;
}
export const anyPanel = (): boolean => panels.some((r) => r.el.isConnected);
/** пока true, клавиши 1–9 и стрелки не перехватываются (экран «Управление» ждёт нажатие клавиши) */
export const navLock = { on: false };

export function focusables(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [], seen = new Set<string>(), root = el.querySelector<HTMLElement>('.ovbody') ?? el;
  for (const n of Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'))) {
    if (n.hidden || n.closest('[hidden]') || !n.getClientRects().length) continue;
    const inp = n as HTMLInputElement;
    if (inp.type === 'radio') {
      if (seen.has(inp.name)) continue;
      const g = Array.from(root.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${inp.name}"]`)); seen.add(inp.name);
      out.push(g.find((r) => r.checked) ?? g[0]!); continue;
    }
    out.push(n);
  }
  return out;
}
export function focusEl(n: HTMLElement): void { n.focus({ preventScroll: true }); try { n.scrollIntoView({ block: 'nearest' }); } catch { /* старый браузер */ } }

interface Cmd { up?: boolean; down?: boolean; left?: boolean; right?: boolean; ok?: boolean; back?: boolean; x?: boolean }
function act(o: PanelReg, c: Cmd): void {
  if (c.back) { o.back(); return; }
  const fl = focusables(o.el); if (!fl.length) return;
  const a = document.activeElement as HTMLInputElement | null, inside = !!a && o.el.contains(a);
  const i = inside ? fl.findIndex((n) => n === a || (a?.type === 'radio' && (n as HTMLInputElement).type === 'radio' && (n as HTMLInputElement).name === a.name)) : -1;
  if (c.up || c.down) { focusEl(fl[i < 0 ? 0 : (i + (c.down ? 1 : -1) + fl.length) % fl.length]!); return; }
  if (c.left || c.right) {
    const d = c.right ? 1 : -1;
    if (inside && a && a.type === 'range') {
      const st = Number(a.step) || 1, v = Math.max(Number(a.min), Math.min(Number(a.max), Number(a.value) + d * st));
      a.value = String(v); a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); return;
    }
    if (inside && a && a.type === 'radio') {
      const g = Array.from(o.el.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${a.name}"]`)), k = (g.indexOf(a) + d + g.length) % g.length;
      g[k]!.click(); focusEl(g[k]!); return;
    }
    // вкладки: ← → переключают соседнюю вкладку
    if (inside && a && a.getAttribute('role') === 'tab') { const tabs = fl.filter((n) => n.getAttribute('role') === 'tab'), k = (tabs.indexOf(a) + d + tabs.length) % tabs.length; tabs[k]!.click(); focusEl(tabs[k]!); return; }
    if (inside && a && (a as HTMLElement).dataset['lr']) { a.dispatchEvent(new CustomEvent('lr', { detail: d, bubbles: true })); return; }
    if (i >= 0) focusEl(fl[(i + d + fl.length) % fl.length]!);
    return;
  }
  if (c.ok) {
    if (!inside || i < 0) { focusEl(fl[0]!); return; }
    if (a && (a.tagName === 'BUTTON' || a.type === 'checkbox' || a.type === 'radio')) a.click();
  }
}

// ----- геймпад в меню: краевые срабатывания и повтор для направлений -----
const padSt: Record<string, boolean> = {}, padT: Record<string, number> = {};
export function padPoll(dt: number): Cmd {
  const cur = { up: false, down: false, left: false, right: false, ok: false, back: false, x: false };
  let any = false;
  for (const p of listPads()) {
    const B = (n: number): boolean => { const b = p.buttons[n]; return !!b && (b.pressed || b.value > 0.5); };
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    cur.up ||= ay < -0.55 || B(12); cur.down ||= ay > 0.55 || B(13); cur.left ||= ax < -0.55 || B(14); cur.right ||= ax > 0.55 || B(15);
    cur.ok ||= B(0); cur.back ||= B(1); cur.x ||= B(2);
    if (B(0) || B(1) || B(2) || B(3) || B(9) || B(12) || B(13) || B(14) || B(15) || Math.abs(ax) > 0.4 || Math.abs(ay) > 0.4) any = true;
  }
  if (any) setDevice('pad');
  const out: Cmd = {};
  for (const k of Object.keys(cur) as (keyof typeof cur)[]) {
    if (cur[k]) {
      if (!padSt[k]) { out[k] = true; padT[k] = 0.42; }
      else if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { padT[k] = (padT[k] ?? 0) - dt; if ((padT[k] ?? 0) <= 0) { out[k] = true; padT[k] = 0.11; } }
    }
    padSt[k] = cur[k];
  }
  return out;
}

/** то, что нужно приложению: слушатели ввода; возвращает отписку */
export function initNav(opts: { onPadExtra?: (c: Cmd) => void; blocked?: () => boolean } = {}): () => void {
  setDevice(matchMedia('(pointer: coarse)').matches ? 'touch' : 'kb');
  const onKey = (): void => setDevice('kb');
  const onPtr = (e: PointerEvent): void => setDevice(e.pointerType === 'touch' ? 'touch' : 'kb');
  window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onPtr, true);
  let raf = 0, t0 = performance.now();
  const loop = (): void => {
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
    const o = topPanel();
    const c = padPoll(dt);
    if (!o) { opts.onPadExtra?.(c); return; }
    if (o.el.dataset['padlock']) return;
    if (c.up || c.down || c.left || c.right || c.ok || c.back) act(o, c);
    opts.onPadExtra?.(c);
  };
  raf = requestAnimationFrame(loop);
  // Esc закрывает верхнюю панель, цифры 1–9 выбирают N-й пункт
  const onNavKey = (e: KeyboardEvent): void => {
    const o = topPanel(); if (!o || navLock.on) return;
    if (o.onKey && o.onKey(e)) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Escape' || (e.key === 'Backspace' && !(e.target as HTMLElement)?.matches?.('input,textarea'))) { if (e.repeat) return; e.preventDefault(); e.stopPropagation(); o.back(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement as HTMLInputElement | null;
    const typing = !!a && (a.type === 'text' || a.tagName === 'TEXTAREA' || a.type === 'search');
    if (typing) return;
    if (/^[1-9]$/.test(e.key) && o.digits) {
      if (e.repeat) return;
      const n = o.el.querySelector<HTMLElement>('[data-n="' + e.key + '"]') ?? focusables(o.el)[Number(e.key) - 1]; if (!n) return;
      e.preventDefault(); e.stopPropagation(); focusEl(n);
      const inp = n as HTMLInputElement;
      if (n.tagName === 'BUTTON' || inp.type === 'checkbox') n.click();
      return;
    }
    const k = e.key;
    let c: Cmd | null = null;
    if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'ц' || k === 'Ц') c = { up: true };
    else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === 'ы' || k === 'Ы') c = { down: true };
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ф' || k === 'Ф') c = { left: true };
    else if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'в' || k === 'В') c = { right: true };
    if (c) {
      // у ползунка и переключателя ← → меняют значение, это делает act
      e.preventDefault(); e.stopPropagation(); act(o, c);
    }
  };
  window.addEventListener('keydown', onNavKey, true);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onPtr, true); window.removeEventListener('keydown', onNavKey, true); };
}
