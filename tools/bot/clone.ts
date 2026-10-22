// Копия мира для «заглядывания вперёд» (no-hit бот): глубокая копия состояния с сохранением связей между объектами.
// Не копируются неизменяемые части (уровень, сетка, стартовые параметры, палитры) и таймеры (их замыкания смотрят в исходный мир).
// Потоки ГСЧ копируются через fork() с тем же состоянием: копия и оригинал дальше идут одинаково при одинаковом вводе.
import { World } from '../../src/core/world';

/** поля мира, которые только читаются в бою: копировать их незачем */
const SHARED = new Set(['L', 'grid', 'startData', 'camp', 'progress', 'sr']);

function walk(v: unknown, seen: Map<object, unknown>): unknown {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'function') {
      const f = v as { fork?: () => unknown };
      if (typeof f.fork === 'function') { // поток ГСЧ: копия с тем же состоянием, одна на все ссылки
        const got = seen.get(v as object); if (got) return got;
        const n = f.fork(); seen.set(v as object, n); return n;
      }
    }
    return v;
  }
  const hit = seen.get(v); if (hit) return hit;
  if (Array.isArray(v)) { const a: unknown[] = new Array(v.length); seen.set(v, a); for (let i = 0; i < v.length; i++) a[i] = walk(v[i], seen); return a; }
  if (ArrayBuffer.isView(v)) { const c = (v as unknown as { slice(): object }).slice(); seen.set(v, c); return c; }
  if (v instanceof Set) { const s = new Set<unknown>(); seen.set(v, s); for (const x of v) s.add(walk(x, seen)); return s; }
  if (v instanceof Map) { const m = new Map<unknown, unknown>(); seen.set(v, m); for (const [k, x] of v) m.set(walk(k, seen), walk(x, seen)); return m; }
  const o = Object.create(Object.getPrototypeOf(v) as object | null) as Record<string, unknown>;
  seen.set(v, o);
  for (const k of Object.keys(v)) o[k] = walk((v as Record<string, unknown>)[k], seen);
  return o;
}

/** Копия мира: дальше её можно «прокручивать» сколько угодно, оригинал не меняется. */
export function cloneWorld(w: World): World {
  const seen = new Map<object, unknown>();
  const c = Object.create(Object.getPrototypeOf(w) as object | null) as Record<string, unknown>;
  seen.set(w, c);
  const src = w as unknown as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    if (SHARED.has(k)) c[k] = src[k];
    else if (k === 'tmr') c[k] = [];
    else if (k === 'fxq') c[k] = [];
    else c[k] = walk(src[k], seen);
  }
  return c as unknown as World;
}
