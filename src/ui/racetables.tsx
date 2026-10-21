// Таблицы и лента кампании «Гонок Ткачей»: общие для табло обсервера и панели организатора (стили — .rw-hud в styles.css и .rcp).
// Данные берутся из снимка комнаты (RoomState.players): подсплиты, сплиты и личный рекорд каждого игрока; ничего не считают сами, кроме сравнения.
import { fmt } from '../core/timefmt';
import type { RoomPlayer } from '../net/racecommon';
import { bestBoss, bossRows, cmpRows, dtxt, ribbonPos, sumOfBestNow, tagsOf, type CmpRow } from '../net/raceprog';

const ROMAN = ['I', 'II', 'III', 'IV'];
export const COL_A = '#8fe8d2', COL_B = '#ffc46e';

/** лента кампании I–IV (или четыре босса) с точками обоих игроков */
export function Ribbon({ disc, a, b, ta, tb }: { disc: string; a?: RoomPlayer; b?: RoomPlayer; ta?: Record<string, unknown>; tb?: Record<string, unknown> }) {
  const labels = disc === 'boss' ? tagsOf(disc) : ROMAN, pa = ribbonPos(disc, a, ta), pb = ribbonPos(disc, b, tb);
  const dot = (p: number, col: string, name: string | undefined, shop: boolean, lane: number) => (
    <i class={`rib-dot ${shop ? 'shop' : ''}`} style={{ left: `${(p * 100).toFixed(1)}%`, background: col, top: lane ? '60%' : '10%' }} title={name}>{shop ? <b>лавка</b> : null}</i>
  );
  return (
    <div class="rib" data-testid="watch-ribbon" role="img" aria-label="Лента кампании">
      <div class="rib-seg">{labels.map((l, i) => <span key={i} class={Math.floor(Math.min(3.999, Math.max(pa, pb) * 4)) === i ? 'on' : ''}>{l}</span>)}</div>
      <div class="rib-track">
        {dot(pa, COL_A, a?.name, !!ta?.['sh'], 0)}{dot(pb, COL_B, b?.name, !!tb?.['sh'], 1)}
      </div>
    </div>
  );
}

const cls = (ms: number | null): string => (ms == null ? '' : ms < 0 ? 'g' : ms > 0 ? 'r' : '');
/** таблица сплитов: время обоих, разница между игроками (A − B) и к личному рекорду; live — только текущая глава и сплиты глав, full — все подсплиты */
export function SplitsTable({ disc, a, b, mode, id }: { disc: string; a?: RoomPlayer; b?: RoomPlayer; mode: 'live' | 'full' | 'cur'; id?: string }) {
  let rows: CmpRow[] = cmpRows(disc, a, b);
  const cur = Math.min(4, Math.max((a?.splits || []).filter((x) => x != null).length, (b?.splits || []).filter((x) => x != null).length) + 1);
  if (mode === 'live') rows = rows.filter((r) => r.k === 'kill' || r.ch === cur);
  else if (mode === 'cur') rows = rows.filter((r) => r.ch === cur); // только текущий босс (босс-раш): фазы боя
  else rows = rows.filter((r) => r.k === 'kill' || r.ch <= cur || r.a != null || r.b != null); // главы, до которых ещё никто не дошёл, показываются одной строкой смерти босса
  const hasPb = !!(a?.pb || b?.pb);
  const sa = sumOfBestNow(a?.pb, a?.splits || []), sb = sumOfBestNow(b?.pb, b?.splits || []);
  const t = (v: number | null): string => (v == null ? '—' : fmt(v));
  return (
    <table class={`rt rtm-${mode}`} data-testid={id ?? 'splits-table'}>
      <thead><tr><th>Подсплит</th><th style={{ color: COL_A }}>{a ? a.name : '—'}</th><th style={{ color: COL_B }}>{b ? b.name : '—'}</th><th>Δ</th>{hasPb && <><th title="к личному рекорду" style={{ color: COL_A }}>рек.</th><th title="к личному рекорду" style={{ color: COL_B }}>рек.</th></>}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} class={r.k === 'kill' ? 'main' : r.ch === cur ? 'cur' : ''} data-key={r.key}>
            <td>{r.label}</td><td>{t(r.a)}</td><td>{t(r.b)}</td><td class={cls(r.d)}>{dtxt(r.d)}</td>
            {hasPb && <><td class={cls(r.pa)}>{dtxt(r.pa)}</td><td class={cls(r.pb)}>{dtxt(r.pb)}</td></>}
          </tr>
        ))}
        {mode !== 'cur' && <tr class="sum" data-testid="splits-sob"><td>Сумма лучших отрезков</td><td>{t(sa)}</td><td>{t(sb)}</td><td class={cls(sa != null && sb != null ? sa - sb : null)}>{sa != null && sb != null ? dtxt(sa - sb) : ''}</td>{hasPb && <><td /><td /></>}</tr>}
      </tbody>
    </table>
  );
}

/** босс-раш: таблица «босс × игрок» — время боя, урон боссу, отбивы, разница между игроками и лучший босс каждого */
export function BossTable({ disc, a, b, id }: { disc: string; a?: RoomPlayer; b?: RoomPlayer; id?: string }) {
  const rows = bossRows(disc, a, b), cur = Math.min(4, Math.max((a?.splits || []).length, (b?.splits || []).length) + 1);
  const t = (v: number | null): string => (v == null ? '—' : fmt(v)), n = (v: number | undefined): string => (v == null ? '—' : String(Math.round(v)));
  const sa = sumOfBestNow(a?.pb, a?.splits || []), sb = sumOfBestNow(b?.pb, b?.splits || []);
  const ba = bestBoss(rows, 'a'), bb = bestBoss(rows, 'b'), nm = (ch: number | null): string => (ch == null ? '—' : tagsOf(disc)[ch - 1] ?? '—');
  return (
    <table class="rt rtm-boss" data-testid={id ?? 'boss-table'}>
      <thead>
        <tr><th rowSpan={2}>Босс</th><th colSpan={3} style={{ color: COL_A }}>{a ? a.name : '—'}</th><th colSpan={3} style={{ color: COL_B }}>{b ? b.name : '—'}</th><th rowSpan={2}>Δ</th></tr>
        <tr class="sub"><th>время</th><th>урон</th><th>отб.</th><th>время</th><th>урон</th><th>отб.</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.ch} class={r.ch === cur ? 'cur' : ''} data-key={`boss${r.ch}`}>
            <td>{r.name}</td>
            <td class={r.win === 'a' ? 'g w' : ''}>{t(r.ta)}</td><td>{n(r.a?.dmg)}</td><td>{n(r.a?.parries)}</td>
            <td class={r.win === 'b' ? 'g w' : ''}>{t(r.tb)}</td><td>{n(r.b?.dmg)}</td><td>{n(r.b?.parries)}</td>
            <td class={cls(r.d)}>{dtxt(r.d)}</td>
          </tr>
        ))}
        <tr class="sum" data-testid="boss-best"><td>Лучший босс</td><td colSpan={3}>{nm(ba)}</td><td colSpan={3}>{nm(bb)}</td><td /></tr>
        <tr class="sum" data-testid="boss-sob"><td>Сумма лучших</td><td colSpan={3}>{sa != null ? fmt(sa) : '—'}</td><td colSpan={3}>{sb != null ? fmt(sb) : '—'}</td><td class={cls(sa != null && sb != null ? sa - sb : null)}>{sa != null && sb != null ? dtxt(sa - sb) : ''}</td></tr>
      </tbody>
    </table>
  );
}
