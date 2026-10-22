// Спидран вне ядра: время, код результата и строка для друзей, правила честности, таблица друзей (legacy/src/speedrun.js).
// Код результата считается ровно как в v1.8, чтобы строки друзей из старой версии принимались.
import { SR_CATS } from '../core/balance';
import { fmt } from '../core/timefmt';
import { settings, sr as store } from './store';

export const SR_ABOUT: Record<string, string> = {
  trail: 'Главы I–IV подряд, с нуля. Лавка и бусины разрешены. Сплит — на смерти босса каждой главы.',
  boss: 'Четыре босса подряд: Первый Кающийся, Миша, Владик, Тима. Все способности открыты, лавки нет.',
};
export { fmt, fmtD } from '../core/timefmt';
/** «1:02:03.45» → сотые доли секунды */
export function parseTime(str: string): number {
  const [a = '', c = '0'] = str.split('.'), parts = a.split(':').map(Number);
  let s = 0; for (const p of parts) s = s * 60 + p;
  return s * 100 + Number(c);
}

/** запрещённые в забеге настройки */
export function violation(): string[] {
  const v: string[] = [];
  if (settings.s.easy) v.push('Лёгкий режим');
  if ((settings.s.speed || 100) !== 100) v.push(`Замедление игры (${settings.s.speed} %)`);
  return v;
}
export function fixRules(): void { settings.s.easy = false; settings.s.speed = 100; settings.save(); }

export interface Entry { ver: string; cat: string; rta: number; igt: number; deaths: number; splits: number[] }
export interface Friend extends Entry { id: string; name: string; code: string }
/** код результата: хэш строки; защищает от опечаток, не от подделки */
export function code(e: Entry): string {
  const s = 'tropa-tkachei/' + e.ver + '/' + [e.ver, e.cat, e.rta, e.igt, e.deaths, e.splits.join(',')].join('|');
  let h = 0x811c9dc5;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return ((h >>> 0) & 0xffffff).toString(16).toUpperCase().padStart(6, '0');
}
export interface ResultLike { cat: string; ver: string; rta: number; igt: number; deaths: number; splits: { rta: number; igt: number }[] }
export function entryOf(res: ResultLike): Entry {
  const cs = (ms: number): number => Math.floor(ms / 10);
  return { ver: res.ver, cat: res.cat, rta: cs(res.rta), igt: cs(res.igt), deaths: res.deaths, splits: res.splits.map((s) => cs(s.rta)) };
}
export function text(e: Entry, name: string): string {
  const f = (cs: number): string => fmt(cs * 10), catName = (SR_CATS as Record<string, { name: string }>)[e.cat]?.name ?? e.cat;
  return `${name ? name + ': ' : ''}ТТ v${e.ver} ${catName} ${f(e.rta)} (IGT ${f(e.igt)}) обрывов ${e.deaths} · сплиты ${e.splits.map(f).join(' / ')} · код ${code(e)}`;
}
export type Parsed = { ok: true; e: Entry; name: string; code: string } | { ok: false; err: string };
/** разбор строки друга */
export function parse(line: string): Parsed {
  const T = '\\d+(?::\\d\\d)*\\.\\d\\d';
  const m = new RegExp(`^(.*?)\\s*ТТ v([\\w.\\-]+) (Тропа целиком|Босс-раш) (${T}) \\(IGT (${T})\\) обрывов (\\d+) · сплиты ([\\d:./ ]+?) · код ([0-9A-Fa-f]{6})\\s*$`).exec(line.trim());
  if (!m) return { ok: false, err: 'не похоже на результат (нужна строка из «Скопировать результат»)' };
  const cat = m[3] === 'Босс-раш' ? 'boss' : 'trail';
  const e: Entry = { ver: m[2]!, cat, rta: parseTime(m[4]!), igt: parseTime(m[5]!), deaths: Number(m[6]), splits: m[7]!.trim().split(/\s*\/\s*/).map((x) => parseTime(x)) };
  if (e.splits.length !== 4 || e.splits.some((x) => !(x >= 0))) return { ok: false, err: 'неверный список сплитов' };
  if (code(e) !== m[8]!.toUpperCase()) return { ok: false, err: 'код не совпал: вероятна опечатка при копировании' };
  for (let i = 1; i < 4; i++) if (e.splits[i]! < e.splits[i - 1]!) return { ok: false, err: 'сплиты идут не по порядку' };
  if (e.splits[3] !== e.rta) return { ok: false, err: 'итог не равен последнему сплиту' };
  const name = m[1]!.replace(/[\s:·\-—]+$/g, '').trim().slice(0, 24);
  return { ok: true, e, name: name || 'Без имени', code: m[8]!.toUpperCase() };
}

export const friends = (): Friend[] => store.friends() as unknown as Friend[];
/** добавить строки друзей; возвращает итог для сообщения */
export function friendsAdd(raw: string): { ok: number; dup: number; errs: string[] } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), list = friends(), errs: string[] = [];
  let ok = 0, dup = 0;
  lines.forEach((l, i) => {
    const p = parse(l);
    if (!p.ok) { errs.push(`Строка ${i + 1}: ${p.err}`); return; }
    if (list.some((x) => x.code === p.code && x.name === p.name && x.cat === p.e.cat)) { dup++; return; }
    list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: p.name, code: p.code, ...p.e }); ok++;
  });
  store.saveFriends(list as unknown as string[]);
  return { ok, dup, errs };
}
export const friendsSave = (a: Friend[]): void => store.saveFriends(a as unknown as string[]);

export interface BoardRow { name: string; e: Entry; me?: boolean; friend?: Friend }
/** строки таблицы по категории: друзья + ваш рекорд (+ последний забег) */
export function boardRows(cat: string, last: (ResultLike & { taint?: string | null }) | null): BoardRow[] {
  const rows: BoardRow[] = friends().filter((x) => x.cat === cat).map((x) => ({ name: x.name, e: x, friend: x }));
  const mine = store.name() || 'Вы', pb = store.rec(cat).pb;
  const add = (label: string, res: ResultLike): void => { rows.push({ name: label, e: { ...entryOf(res), cat }, me: true }); };
  if (pb) add(mine + ' (рекорд)', { ...pb, cat });
  if (last && last.cat === cat && !last.taint && (!pb || last.rta !== pb.rta)) add(mine + ' (этот забег)', last);
  return rows.sort((a, b) => a.e.rta - b.e.rta);
}
