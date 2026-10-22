// Общий реестр подключаемого содержимого (оружие, инструменты, обереги, приёмы, враги, снаряды, звуки, арены).
// Вещь описывается одним файлом src/content/<вид>/<id>.ts с default-экспортом описания; файлы находит src/content/index.ts.
// Порядок вещей задаёт поле order (а не порядок файлов в папке): от порядка зависят выбор в фаззере, списки в интерфейсе
// и порядок срабатывания хуков, то есть детерминизм и золотые записи. Числовые коды для сети (netId) уникальны и только добавляются.
// Модуль ничего не импортирует: его можно подключать из любого места ядра без циклов.

export interface Def { id: string; /** место в списке (меньше — раньше); у равных — по id */ order?: number; /** числовой код на проводе (сеть), если вид его требует */ netId?: number }

export class Registry<T extends Def> {
  private map = new Map<string, T>();
  private sorted: T[] | null = null;
  private byNet = new Map<number, T>();
  /** Живой объект «id → описание» в порядке order: старый код, который ждал Record (WEAPONS, TOOLS…), продолжает работать. */
  readonly record: Record<string, T> = {};
  private listeners: ((d: T) => void)[] = [];

  constructor(readonly kind: string, private check?: (d: T) => void) {}

  /** зарегистрировать вещь; повторный id — ошибка (два файла с одним id), кроме замены в тестах через replace */
  define(d: T): T {
    if (!d || typeof d.id !== 'string' || !d.id) throw new Error(`${this.kind}: у описания нет id`);
    if (this.map.has(d.id)) throw new Error(`${this.kind}: «${d.id}» описан дважды`);
    return this.put(d);
  }
  /** заменить или добавить (тесты, фикстуры) */
  replace(d: T): T { this.remove(d.id); return this.put(d); }
  remove(id: string): void {
    const d = this.map.get(id); if (!d) return;
    this.map.delete(id); if (d.netId !== undefined) this.byNet.delete(d.netId);
    this.rebuild();
  }
  private put(d: T): T {
    this.check?.(d);
    if (d.netId !== undefined) {
      const o = this.byNet.get(d.netId);
      if (o && o.id !== d.id) throw new Error(`${this.kind}: netId ${d.netId} занят «${o.id}», нужен новый для «${d.id}»`);
      this.byNet.set(d.netId, d);
    }
    this.map.set(d.id, d);
    this.rebuild();
    for (const f of this.listeners) f(d);
    return d;
  }
  private rebuild(): void {
    this.sorted = null;
    for (const k of Object.keys(this.record)) delete this.record[k];
    for (const d of this.list()) this.record[d.id] = d;
  }

  get(id: string | null | undefined): T | undefined { return id == null ? undefined : this.map.get(id); }
  has(id: string): boolean { return this.map.has(id); }
  byNetId(n: number): T | undefined { return this.byNet.get(n); }
  /** все вещи в порядке order, затем id */
  list(): T[] {
    if (!this.sorted) this.sorted = [...this.map.values()].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return this.sorted;
  }
  ids(): string[] { return this.list().map((d) => d.id); }
  get size(): number { return this.map.size; }
  /** подписаться на регистрацию (например, дополнить enum схемы данных боссов) */
  onDefine(f: (d: T) => void): void { this.listeners.push(f); for (const d of this.list()) f(d); }
}

/** Разложить модули, найденные import.meta.glob или чтением папки: default-экспорт — описание или массив описаний. */
export function collectDefaults<T>(mods: Record<string, unknown>): T[] {
  const out: T[] = [];
  for (const k of Object.keys(mods).sort()) {
    const m = mods[k] as { default?: unknown } | unknown;
    const d = m && typeof m === 'object' && 'default' in (m as object) ? (m as { default: unknown }).default : m;
    if (Array.isArray(d)) out.push(...(d as T[])); else if (d && typeof d === 'object') out.push(d as T);
  }
  return out;
}
