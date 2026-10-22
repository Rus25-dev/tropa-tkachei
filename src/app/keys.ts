// Переназначение клавиш игрока 1 (доступность). Формат в localStorage `tt_keys` — как в v1.8: { действие: [keyCode, подпись] };
// к нему добавляется третий элемент — `code` (KeyboardEvent.code), по нему и играет v2. Старые сохранения читаются по keyCode.
import type { Button } from '../core/input';
import { KEY_MAPS } from '../input/keyboard';

export type Act = Exclude<Button, never>;
export const ACTS: [Act, string][] = [['left', 'Идти влево'], ['right', 'Идти вправо'], ['up', 'Вверх (удар вверх, скамья)'], ['down', 'Вниз (удар вниз, лавка)'],
  ['jump', 'Прыжок'], ['atk', 'Удар'], ['dash', 'Рывок'], ['heal', 'Нить: лечение и отбив'], ['bomb', 'Дымовуха'], ['tool', 'Инструмент'], ['parry', 'Только отбив'], ['bind', 'Только лечение'], ['burst', 'Нитяной всполох']];
type Bind = [number, string, string?];
export const DEF: Record<Act, Bind> = {
  left: [65, 'A', 'KeyA'], right: [68, 'D', 'KeyD'], up: [87, 'W', 'KeyW'], down: [83, 'S', 'KeyS'], jump: [32, 'Пробел', 'Space'],
  atk: [70, 'F', 'KeyF'], dash: [71, 'G', 'KeyG'], heal: [81, 'Q', 'KeyQ'], bomb: [82, 'R', 'KeyR'], tool: [69, 'E', 'KeyE'],
  parry: [84, 'T', 'KeyT'], bind: [89, 'Y', 'KeyY'], burst: [72, 'H', 'KeyH'],
};
/** клавиши игрока 2, стрелок и запасной раскладки заняты и не отдаются */
export const RESERVED = new Set([27, 37, 38, 39, 40, 96, 97, 98, 99, 100, 102, 103, 104, 188, 190, 191, 77, 78, 90, 88, 67, 86, 66]);

/** код клавиши по старому keyCode (для сохранений v1.8) */
export function codeFromKeyCode(k: number): string {
  if (k >= 65 && k <= 90) return 'Key' + String.fromCharCode(k);
  if (k >= 48 && k <= 57) return 'Digit' + (k - 48);
  if (k >= 112 && k <= 123) return 'F' + (k - 111);
  if (k >= 101 && k <= 105) return 'Numpad' + (k - 96);
  const m: Record<number, string> = { 32: 'Space', 13: 'Enter', 9: 'Tab', 8: 'Backspace', 16: 'ShiftLeft', 17: 'ControlLeft', 18: 'AltLeft', 186: 'Semicolon', 187: 'Equal', 189: 'Minus', 192: 'Backquote',
    219: 'BracketLeft', 220: 'Backslash', 221: 'BracketRight', 222: 'Quote', 45: 'Insert', 46: 'Delete', 36: 'Home', 35: 'End', 33: 'PageUp', 34: 'PageDown', 106: 'NumpadMultiply', 107: 'NumpadAdd', 109: 'NumpadSubtract', 110: 'NumpadDecimal', 111: 'NumpadDivide' };
  return m[k] ?? '';
}

const clone = (): Record<Act, Bind> => { const o = {} as Record<Act, Bind>; for (const [a] of ACTS) o[a] = [...DEF[a]] as Bind; return o; };
export const keys: { map: Record<Act, Bind> } = { map: clone() };

export function loadKeys(): void {
  keys.map = clone();
  try {
    const raw = JSON.parse(localStorage.getItem('tt_keys') ?? 'null') as Record<string, unknown[]> | null;
    if (raw) for (const [a] of ACTS) {
      const r = raw[a];
      if (r && typeof r[0] === 'number' && typeof r[1] === 'string') {
        const code = typeof r[2] === 'string' ? r[2] : codeFromKeyCode(r[0]);
        if (code) keys.map[a] = [r[0], r[1].slice(0, 12), code];
      }
    }
    // Новые команды получают свободные клавиши: старая раскладка могла уже занять T/Y/H.
    if (raw) {
      const used = new Set(ACTS.filter(([a]) => raw[a]).map(([a]) => keys.map[a][2]));
      for (const a of ['parry', 'bind', 'burst'] as const) if (!raw[a]) {
        const choices = [DEF[a], ...['T', 'Y', 'H', 'U', 'I', 'O', 'P', 'J', 'K', 'L'].map((c): Bind => [c.charCodeAt(0), c, 'Key' + c])];
        const free = choices.find((b) => !used.has(b[2]) && !RESERVED.has(b[0]));
        if (free) { keys.map[a] = [...free]; used.add(free[2]); }
      }
    }
  } catch { /* битое сохранение: клавиши по умолчанию */ }
  // защита от дубликатов и занятых клавиш — сброс по умолчанию
  const seen = new Set<string>();
  for (const [a] of ACTS) { const c = keys.map[a][2] ?? ''; if (seen.has(c) || RESERVED.has(keys.map[a][0])) { resetKeys(); return; } seen.add(c); }
  applyKeys();
}
export function saveKeys(): void { try { localStorage.setItem('tt_keys', JSON.stringify(keys.map)); } catch { /* нет доступа */ } }
export function resetKeys(): void { keys.map = clone(); saveKeys(); applyKeys(); }
export const keyName = (a: Act): string => keys.map[a][1];

/** переносит назначение в раскладку игрока 1 клавиатуры */
export function applyKeys(): void {
  const p1: Record<string, Button> = {};
  for (const [a] of ACTS) { const c = keys.map[a][2]; if (c) p1[c] = a; }
  for (const k of Object.keys(KEY_MAPS.p1)) delete KEY_MAPS.p1[k];
  Object.assign(KEY_MAPS.p1, p1);
}

/** подпись клавиши для кнопки */
export function labelOf(e: KeyboardEvent): string {
  const c = e.code || '';
  const m: Record<string, string> = { Space: 'Пробел', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', CapsLock: 'Caps' };
  if (m[c]) return m[c]!;
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^Numpad/.test(c)) return 'Num ' + c.slice(6);
  return (e.key && e.key.length <= 8 ? e.key.toUpperCase() : c || String(e.keyCode)).slice(0, 12);
}
/** назначение клавиши действию; если она уже стоит на другом действии, они меняются местами */
export function assignKey(act: Act, e: KeyboardEvent): boolean {
  if (RESERVED.has(e.keyCode) || !e.code) return false;
  const old = keys.map[act].slice() as Bind;
  for (const [a] of ACTS) if (a !== act && keys.map[a][2] === e.code) keys.map[a] = old;
  keys.map[act] = [e.keyCode, labelOf(e), e.code]; saveKeys(); applyKeys(); return true;
}
/** строка подсказки про раскладку игрока 1 */
export function keyLine(): string {
  const n = keyName, mv = [n('left'), n('right'), n('up'), n('down')].join(' ');
  return `${mv} — ходить · ${n('jump')} — прыжок · ${n('atk')} — удар · ${n('dash')} — рывок · ${n('heal')} — нить · ${n('parry')} — отбив · ${n('bind')} — лечение · ${n('burst')} — всполох`;
}
