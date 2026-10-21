// Форматирование времени забега (legacy/src/speedrun.js: fmt, fmtD). Чистые функции: годятся и для ядра, и для сети, и для интерфейса.
const p2 = (n: number): string => String(n).padStart(2, '0');
/** 1:02.45 или 1:02:03.45 (сотые доли секунды) */
export function fmt(ms: number): string {
  const cs = Math.max(0, Math.floor(ms / 10)), h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, s = Math.floor(cs / 100) % 60, c = cs % 100;
  return h ? `${h}:${p2(m)}:${p2(s)}.${p2(c)}` : `${Math.floor(cs / 6000)}:${p2(s)}.${p2(c)}`;
}
/** дельта: +0:12.4 / -0:03.2 */
export function fmtD(ms: number): string {
  const a = Math.abs(ms), t = Math.floor(a / 100), m = Math.floor(t / 600), s = Math.floor(t / 10) % 60;
  return `${ms < 0 ? '-' : '+'}${m}:${p2(s)}.${t % 10}`;
}
