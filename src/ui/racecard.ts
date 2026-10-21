// Картинка итогов гонки для Discord: PNG 1200×675 (победитель, время, разница, сплиты, изменение Эло). Рисуется на обычном 2D-холсте.
import { nkey, type EloChange } from '../core/elo';
import { fmt, fmtD } from '../core/timefmt';
import { BOSS_INFO, fmtName } from '../core/duel';
import { modsText } from '../core/duelmods';
import { DISC, type RaceResult } from '../net/racecommon';
import { tagsOf } from '../net/raceprog';

export const CARD_W = 1200, CARD_H = 675;
const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

function fit(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let s = text; while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
const sgn = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);

/** elo — изменения Эло по игрокам (если в записи их нет, например гонка загружена из файла) */
export function drawCard(g: CanvasRenderingContext2D, r: RaceResult, elo?: Record<string, EloChange>): void {
  g.fillStyle = '#10131c'; g.fillRect(0, 0, CARD_W, CARD_H);
  g.fillStyle = '#1b2233'; g.fillRect(0, 0, CARD_W, 110);
  g.fillStyle = '#e8c872'; g.font = `700 44px ${FONT}`; g.textBaseline = 'middle';
  g.fillText('Гонки Ткачей', 48, 56);
  g.fillStyle = '#b9c3d9'; g.font = `500 28px ${FONT}`; g.textAlign = 'right';
  g.fillText(`${DISC[r.discipline]?.name ?? r.discipline} · ${new Date(r.date).toLocaleDateString('ru-RU')}`, CARD_W - 48, 56);
  g.textAlign = 'left';
  const du = r.duel;
  const win = du?.final && du.seriesWinner ? `Серия: победил ${du.seriesWinner}` : r.winner === 'draw' ? 'Ничья' : r.winner ? (du ? `Раунд: ${r.winner}` : `Победил ${r.winner}`) : du ? 'Раунд: ничья' : 'Без победителя';
  g.fillStyle = '#ffffff'; g.font = `800 64px ${FONT}`;
  g.fillText(fit(g, win, CARD_W - 96), 48, 190);
  if (du) { g.fillStyle = '#7fe0a0'; g.font = `700 34px ${FONT}`; g.fillText(fit(g, `${fmtName(du.fmt)} · раунд ${r.round ?? du.slot + 1} · ${BOSS_INFO[du.boss as keyof typeof BOSS_INFO]?.name ?? du.boss} · счёт ${du.score[0]}:${du.score[1]} · ${modsText(du.mods as never)}`, CARD_W - 96), 48, 250); }
  else if (r.gap != null && r.winner !== 'draw') { g.fillStyle = '#7fe0a0'; g.font = `700 36px ${FONT}`; g.fillText(`отрыв ${fmtD(Math.abs(r.gap))}`, 48, 250); }
  const n = r.players.length, colW = (CARD_W - 96 - 32 * (n - 1)) / Math.max(1, n);
  r.players.forEach((p, i) => {
    const x = 48 + i * (colW + 32), y = 290, top = p.place === 1 && r.winner !== 'draw';
    g.fillStyle = top ? '#24402f' : '#1b2233'; g.fillRect(x, y, colW, 360);
    g.fillStyle = top ? '#7fe0a0' : '#b9c3d9'; g.font = `700 30px ${FONT}`;
    g.fillText(fit(g, `${p.place}. ${p.name}`, colW - 40), x + 20, y + 38);
    g.fillStyle = '#ffffff'; g.font = `800 72px ${FONT}`;
    g.fillText(p.dnf ? (du ? `снято ${Math.round(100 * (p.duel?.frac ?? 0))} %` : 'сошёл') : fmt(p.time ?? 0), x + 20, y + 120);
    g.font = `500 26px ${FONT}`; g.fillStyle = '#b9c3d9';
    const e = p.eloBefore != null && p.eloAfter != null ? { before: p.eloBefore, after: p.eloAfter } : elo?.[nkey(p.name)];
    if (e) {
      const d = e.after - e.before;
      g.fillText(`Эло ${e.before} → ${e.after}`, x + 20, y + 180);
      g.fillStyle = d > 0 ? '#7fe0a0' : d < 0 ? '#ff8f8f' : '#b9c3d9'; g.font = `700 30px ${FONT}`;
      g.fillText(sgn(d), x + colW - 20 - g.measureText(sgn(d)).width, y + 180);
      g.font = `500 26px ${FONT}`; g.fillStyle = '#b9c3d9';
    }
    if (du) { g.fillText(p.dnf ? 'босс не убит' : 'босс убит', x + 20, y + 240); if (p.duel) g.fillText(`урон боссу ${Math.round(p.duel.dmg)}`, x + 20, y + 274); }
    else p.splits.slice(0, 4).forEach((s, k) => g.fillText(`${tagsOf(r.discipline)[k] ?? k + 1}: ${fmt(s)}`, x + 20, y + 240 + k * 34));
  });
}
/** собрать PNG; null — холст недоступен */
export function cardPng(r: RaceResult, elo?: Record<string, EloChange>): Promise<Blob | null> {
  try {
    const c = document.createElement('canvas'); c.width = CARD_W; c.height = CARD_H;
    const g = c.getContext('2d'); if (!g) return Promise.resolve(null);
    drawCard(g, r, elo);
    return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
  } catch { return Promise.resolve(null); }
}
export async function downloadCard(r: RaceResult, elo?: Record<string, EloChange>): Promise<boolean> {
  const b = await cardPng(r, elo); if (!b) return false;
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `гонка-${r.id}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return true; } catch { return false; }
}
export async function copyCard(r: RaceResult, elo?: Record<string, EloChange>): Promise<boolean> {
  const b = await cardPng(r, elo); if (!b) return false;
  try { const CI = (window as unknown as { ClipboardItem?: new (o: Record<string, Blob>) => ClipboardItem }).ClipboardItem; if (!CI) return false; await navigator.clipboard.write([new CI({ 'image/png': b })]); return true; } catch { return false; }
}
