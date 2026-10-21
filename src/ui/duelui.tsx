// «Дуэль ткачей» в интерфейсе: карточки боссов для бан/пик, счёт серии, настройки серии у организатора, график погони и таблица фаз.
// Одни и те же кирпичики показывают панель игрока, панель организатора и табло обсервера (стили .dl-* в styles.css, на табло — крупнее).
import { BOSS_INFO, cardStates, DUEL_BOSSES, fmtName, FORMATS, scoreText, type DuelBoss, type Series, type SeriesFmt, type Side } from '../core/duel';
import { DUEL_MODS, MOD_INFO, type DuelMod } from '../core/duelmods';
import { fmt } from '../core/timefmt';
import { chaseEnd, chaseLead, lastPhaseDiff, phaseRows, thin, vetoLines, WHY_TEXT, type ChasePt, type PhaseRow } from '../net/raceduel';
import type { DuelCfg, DuelPub, RoomPlayer } from '../net/racecommon';

export const COL_A = '#8fe8d2', COL_B = '#ffc46e';
const sideCol = (s: Side): string => (s === 0 ? COL_A : COL_B);

/** палитра боссов — та же, что в картинке обсервера (view/scenes/WatchScene.ts) */
const PAL: Record<DuelBoss, [string, string, string]> = { korne: ['#34482f', '#5d8a46', '#ffd47a'], misha: ['#4f5b78', '#c8463c', '#ffd47a'], vladik: ['#5a3f78', '#e0b84a', '#ff5a3c'], tima: ['#7a5a2a', '#f0d070', '#ff5a3c'] };
/** портрет босса: простая фигурка в цветах босса */
export function BossFace({ boss, size = 64 }: { boss: DuelBoss; size?: number }) {
  const [body, head, eye] = PAL[boss];
  return (
    <svg class="dl-face" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={BOSS_INFO[boss].name}>
      <ellipse cx="50" cy="90" rx="34" ry="6" fill="#000" opacity=".3" />
      <rect x="14" y="26" width="72" height="62" rx="16" fill={body} />
      <rect x="23" y="34" width="54" height="26" rx="11" fill={head} />
      <circle cx="62" cy="47" r="5" fill={eye} /><circle cx="46" cy="47" r="4.4" fill={eye} />
      {boss === 'korne' && <path d="M30 26 Q26 10 36 6 M70 26 Q74 10 64 6" stroke={head} stroke-width="5" fill="none" stroke-linecap="round" />}
      {boss === 'misha' && <rect x="2" y="42" width="18" height="30" rx="5" fill="#c8463c" />}
      {boss === 'vladik' && <path d="M88 20 L58 82" stroke="#e8e2cf" stroke-width="4" stroke-linecap="round" />}
      {boss === 'tima' && <g fill="#fff" opacity=".85"><circle cx="30" cy="22" r="7" /><circle cx="44" cy="14" r="5" /><circle cx="70" cy="20" r="6" /></g>}
    </svg>
  );
}

/** значки модификаторов */
export function ModChips({ mods }: { mods: readonly DuelMod[] }) {
  return mods.length ? <span class="dl-mods">{mods.map((m) => <span key={m} class={`dl-mod m-${m}`} title={MOD_INFO[m].note} data-testid={`mod-${m}`}>{MOD_INFO[m].name}</span>)}</span> : <span class="dl-mods"><span class="dl-mod none">без модификаторов</span></span>;
}

const STATE_TEXT = (s: ReturnType<typeof cardStates>[DuelBoss], names: [string, string]): string => (s.st === 'ban' ? `БАН · ${names[s.side]}` : s.st === 'pick' ? `ПИК · ${names[s.side]}` : s.st === 'decider' ? 'РЕШАЮЩИЙ' : '');

/** четыре карточки боссов: свободен / забанен / выбран / решающий. Если задан onSelect — свободные карточки выбираются нажатием */
export function BossCards({ series, names, selected, onSelect, big }: { series: Series; names: [string, string]; selected?: DuelBoss | null; onSelect?: (b: DuelBoss) => void; big?: boolean }) {
  const st = cardStates(series);
  return (
    <div class={`dl-cards ${big ? 'lg' : ''}`} data-testid="duel-cards">
      {DUEL_BOSSES.map((b) => {
        const s = st[b], free = s.st === 'free', order = s.st === 'pick' ? series.order.indexOf(b) + 1 : 0;
        return (
          <button type="button" key={b} class={`dl-card st-${s.st} ${selected === b ? 'sel' : ''}`} style={s.st === 'ban' || s.st === 'pick' ? { '--sc': sideCol(s.side) } as never : undefined}
            data-testid={`duel-card-${b}`} data-state={s.st} disabled={!onSelect || !free} aria-pressed={selected === b} onClick={() => onSelect?.(b)}>
            <BossFace boss={b} size={big ? 150 : 64} />
            <span class="nm">{BOSS_INFO[b].name}</span>
            <span class="nt">{BOSS_INFO[b].note}</span>
            <span class="bd">{STATE_TEXT(s, names)}{order && series.stage !== 'veto' ? ` · раунд ${order}` : ''}{s.st === 'pick' && series.decider === b && series.stage !== 'veto' && series.fmt === 5 ? ' · и решающий' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

/** строка счёта серии: «Ива 1 : 0 Ярь · Bo3» */
export function SeriesScore({ d, compact }: { d: DuelPub; compact?: boolean }) {
  const s = d.series;
  return (
    <div class={`dl-score ${compact ? 'compact' : ''}`} data-testid="duel-score" aria-label={`Счёт серии ${d.names[0]} ${s.score[0]}, ${d.names[1]} ${s.score[1]}`}>
      <span class="n a" style={{ color: COL_A }}>{d.names[0]}</span>
      <b class="sc"><i>{s.score[0]}</i> : <i>{s.score[1]}</i></b>
      <span class="n b" style={{ color: COL_B }}>{d.names[1]}</span>
      <span class="fm">{fmtName(s.fmt)}{s.stage === 'over' ? ' · серия окончена' : ''}</span>
    </div>
  );
}
/** план текущего раунда: «Раунд 2 · Миша Додик · Зеркало» */
export function PlanLine({ d }: { d: DuelPub }) {
  const p = d.plan;
  if (!p) return <div class="dl-plan" data-testid="duel-plan">{d.series.stage === 'over' ? `Серия окончена: победил ${d.names[d.series.winner ?? 0]} (${scoreText(d.series)})` : 'Бан/пик боссов'}</div>;
  return <div class="dl-plan" data-testid="duel-plan"><b>Раунд {p.n}</b> · {BOSS_INFO[p.boss].name} · <ModChips mods={p.mods} /></div>;
}
/** порядок боссов серии с результатами уже сыгранных раундов */
export function OrderStrip({ d }: { d: DuelPub }) {
  const s = d.series;
  if (s.stage === 'veto') return null;
  const done = s.rounds.filter((r) => r.winner !== 'draw');
  return (
    <ol class="dl-order" data-testid="duel-order">
      {s.order.map((b, i) => {
        const r = done[i], cur = !r && i === done.length && s.stage === 'play';
        return <li key={i} class={`${r ? 'done' : ''} ${cur ? 'cur' : ''}`}><span class="b">{BOSS_INFO[b].short}</span><span class="w" style={r ? { color: r.winner === 'a' ? COL_A : COL_B } : undefined}>{r ? d.names[r.winner === 'a' ? 0 : 1] : cur ? 'сейчас' : 'ждёт'}</span></li>;
      })}
    </ol>
  );
}

/** журнал бан/пика по ходам */
export function VetoLog({ d }: { d: DuelPub }) {
  const lines = vetoLines(d.series);
  return (
    <ol class="dl-vlog" data-testid="duel-vlog">
      {lines.map((l) => <li key={l.n} class={l.kind}><span style={l.side != null ? { color: sideCol(l.side) } : undefined}>{l.side != null ? d.names[l.side] : 'Решающий'}</span> {l.kind === 'ban' ? 'банит' : l.kind === 'pick' ? 'выбирает' : 'выпадает'} <b>{BOSS_INFO[l.boss].name}</b></li>)}
    </ol>
  );
}

/** итог последнего раунда одной строкой */
export function LastRound({ d }: { d: DuelPub }) {
  const l = d.last; if (!l) return null;
  const w = l.winner === 'draw' ? 'ничья' : d.names[l.winner === 'a' ? 0 : 1];
  return <div class="dl-last" data-testid="duel-last">Раунд {l.n} · {BOSS_INFO[l.boss].short}: {l.winner === 'draw' ? 'ничья, переигрываем' : <><b style={{ color: l.winner === 'a' ? COL_A : COL_B }}>{w}</b> — {WHY_TEXT[l.why]}</>}{l.gap != null && l.why === 'faster' ? ` (+${fmt(Math.abs(l.gap))})` : ''}</div>;
}

// ----- график погони -----
const W = 600, H = 190, PR = 14, PT = 14;
/** здоровье двух боссов во времени: линия на игрока (сколько осталось у его босса, %), отметки фаз и разница на последний момент */
export function ChaseChart({ names, a, b, pa, pb, id, big, ch }: { names: [string, string]; a?: readonly ChasePt[]; b?: readonly ChasePt[]; pa?: RoomPlayer; pb?: RoomPlayer; id?: string; big?: boolean; /** глава босса раунда: по ней считается разница к фазам */ ch?: number }) {
  const fs = big ? 22 : 12, PL = big ? 58 : 40, PB = big ? 34 : 26;
  const end = chaseEnd(a, b), xmax = Math.max(30000, Math.ceil((end * 1.06) / 15000) * 15000);
  const X = (t: number): number => PL + (Math.min(t, xmax) / xmax) * (W - PL - PR), Y = (rem: number): number => PT + ((100 - rem) / 100) * (H - PT - PB);
  const line = (pts: readonly ChasePt[] | undefined): string => thin(pts, 160).map(([t, f], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(100 - f / 10).toFixed(1)}`).join('');
  const last = (pts: readonly ChasePt[] | undefined): number | null => (pts && pts.length ? 100 - pts[pts.length - 1]![1] / 10 : null);
  const la = last(a), lb = last(b), lead = end ? chaseLead(a, b, end) : 0;
  const marks = (p: RoomPlayer | undefined, pts: readonly ChasePt[] | undefined, col: string) => (p?.subs || []).filter((s) => s.k === 'ph2' || s.k === 'ph3').map((s) => {
    const f = pts && pts.length ? pts.reduce((best, q) => (Math.abs(q[0] - s.rta) < Math.abs(best[0] - s.rta) ? q : best), pts[0]!)[1] : 0;
    return <g key={s.k + s.ch}><circle cx={X(s.rta)} cy={Y(100 - f / 10)} r={4.5} fill="#050a09" stroke={col} stroke-width="2" /><text x={X(s.rta)} y={Y(100 - f / 10) - 8} fill={col} font-size={fs} text-anchor="middle">{s.k === 'ph2' ? 'Ф2' : 'Ф3'}</text></g>;
  });
  const lp = ch ? lastPhaseDiff(phaseRows(pa, pb, ch)) : null;
  const ph = lp && lp.d != null ? (lp.d === 0 ? `${lp.label}: одновременно` : `${lp.label}: ${lp.d < 0 ? names[0] : names[1]} быстрее на ${(Math.abs(lp.d) / 1000).toFixed(1)} с`) : '';
  const ticks: number[] = []; for (let t = 0; t <= xmax; t += xmax > 90000 ? 30000 : 15000) ticks.push(t);
  return (
    <div class={`dl-chase ${big ? 'lg' : ''}`} data-testid={id ?? 'duel-chase'}>
      <div class="hd"><span style={{ color: COL_A }}>{names[0]} <b>{la != null ? Math.round(la) + ' %' : '—'}</b></span><span class="ti">здоровье босса</span><span style={{ color: COL_B }}>{names[1]} <b>{lb != null ? Math.round(lb) + ' %' : '—'}</b></span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График погони: здоровье двух боссов во времени" preserveAspectRatio="none">
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke="#24433a" stroke-width="1" /><text x={PL - 6} y={Y(v) + 4} fill="#8fb8a8" font-size={fs} text-anchor="end">{v}</text></g>)}
        {ticks.map((t) => <text key={t} x={X(t)} y={H - 7} fill="#8fb8a8" font-size={fs} text-anchor={t >= xmax ? 'end' : 'middle'}>{fmt(t).replace(/\.\d+$/, '')}</text>)}
        <path d={line(a)} fill="none" stroke={COL_A} stroke-width="3" stroke-linejoin="round" /><path d={line(b)} fill="none" stroke={COL_B} stroke-width="3" stroke-linejoin="round" />
        {marks(pa, a, COL_A)}{marks(pb, b, COL_B)}
        {a && a.length ? <circle cx={X(a[a.length - 1]![0])} cy={Y(la!)} r="5" fill={COL_A} /> : null}{b && b.length ? <circle cx={X(b[b.length - 1]![0])} cy={Y(lb!)} r="5" fill={COL_B} /> : null}
      </svg>
      <div class="ft" data-testid="duel-chase-lead">{!end ? 'Ждём начала боя…' : lead === 0 ? 'Поровну по здоровью босса' : `${lead > 0 ? names[0] : names[1]} впереди на ${Math.abs(lead).toFixed(1)} п. п.`}{ph ? <span class="ph" data-testid="duel-chase-phase"> · {ph}</span> : null}</div>
    </div>
  );
}

const sgn = (d: number | null): string => (d == null ? '' : d === 0 ? '±0.0' : `${d < 0 ? '−' : '+'}${(Math.abs(d) / 1000).toFixed(1)}`);
/** разница к фазам: когда каждый начал бой, дошёл до фаз 2 и 3 и добил босса */
export function PhaseTable({ names, pa, pb, ch, id }: { names: [string, string]; pa?: RoomPlayer; pb?: RoomPlayer; ch: number; id?: string }) {
  const rows: PhaseRow[] = phaseRows(pa, pb, ch), t = (v: number | null): string => (v == null ? '—' : fmt(v));
  return (
    <table class="rt dl-phases" data-testid={id ?? 'duel-phases'}>
      <thead><tr><th>Фаза босса</th><th style={{ color: COL_A }}>{names[0]}</th><th style={{ color: COL_B }}>{names[1]}</th><th>Δ, с</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.k} data-key={r.k}><td>{r.label}</td><td>{t(r.a)}</td><td>{t(r.b)}</td><td class={r.d == null ? '' : r.d < 0 ? 'g' : r.d > 0 ? 'r' : ''}>{sgn(r.d)}</td></tr>)}</tbody>
    </table>
  );
}

// ----- настройки серии (организатор) -----
export function DuelSetup({ cfg, locked, onChange }: { cfg: DuelCfg; locked: boolean; onChange: (c: Partial<DuelCfg>) => void }) {
  const toggle = (m: DuelMod): void => onChange({ fixed: cfg.fixed.includes(m) ? cfg.fixed.filter((x) => x !== m) : [...cfg.fixed, m] });
  return (
    <div class="dl-setup" data-testid="org-duel-setup">
      <div class="row" role="radiogroup" aria-label="Формат серии">
        {FORMATS.map((f: SeriesFmt) => <button type="button" key={f} class={`btn ${cfg.fmt === f ? 'primary' : ''}`} id={`rco-fmt-${f}`} data-testid={`org-duel-fmt-${f}`} aria-pressed={cfg.fmt === f} disabled={locked} onClick={() => onChange({ fmt: f })}>{fmtName(f)}</button>)}
      </div>
      <div class="lead">Модификаторы раундов (в каждом раунде):</div>
      <div class="row" role="group" aria-label="Модификаторы">
        {DUEL_MODS.map((m) => <button type="button" key={m} class={`btn ${cfg.fixed.includes(m) ? 'primary' : ''}`} id={`rco-mod-${m}`} data-testid={`org-duel-mod-${m}`} title={MOD_INFO[m].note} aria-pressed={cfg.fixed.includes(m)} disabled={locked} onClick={() => toggle(m)}>{MOD_INFO[m].name}</button>)}
        <button type="button" class={`btn ${cfg.random ? 'primary' : ''}`} id="rco-mod-random" data-testid="org-duel-random" title="к постоянным добавляется один случайный из остальных, из зерна комнаты" aria-pressed={cfg.random} disabled={locked} onClick={() => onChange({ random: !cfg.random })}>+ случайный на раунд</button>
      </div>
    </div>
  );
}
