// Публичная страница рейтинга «Гонок Ткачей»: читает data/races.json и пересчитывает Эло с нуля (computeElo). Без бэкенда, маршрутизация хэшем.
import { useEffect, useRef, useState } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { ELO_ALL, nkey, type EloTables } from '../core/elo';
import { fmt, fmtD } from '../core/timefmt';
import type { RaceResult } from '../net/racecommon';
import {
  disciplines, discName, duelLabel, duelMods, eloSeries, parseRoute, playerHref, playerProfile, raceHref, readRatingResponse, routeHash, seriesRounds, splitRows, timeOf,
  type RatingData, type Route,
} from './model';

const DATA_URL = './data/races.json';
const fmtDate = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const shortDate = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); };
const scopeName = (s: string): string => (s === ELO_ALL ? 'Общий' : discName(s));
const sign = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const winnerText = (r: RaceResult): string => (r.winner === 'draw' ? 'ничья' : r.winner ?? '—');

function useRoute(): Route {
  const [h, setH] = useState(() => location.hash);
  useEffect(() => {
    const on = (): void => { setH(location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on);
  }, []);
  return parseRoute(h);
}

export function App() {
  const [data, setData] = useState<RatingData | null>(null);
  useEffect(() => {
    let dead = false;
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(async (res) => readRatingResponse(res.status, await res.text()))
      .catch((): RatingData => ({ kind: 'missing', reason: 'Не удалось загрузить data/races.json (если страница открыта как локальный файл, запустите её через веб-сервер).' }))
      .then((d) => { if (!dead) setData(d); });
    return () => { dead = true; };
  }, []);
  const route = useRoute();
  useEffect(() => { document.title = route.page === 'player' ? `${route.name} — Рейтинг Ткачей` : 'Рейтинг Ткачей'; }, [route]);
  return (
    <div class="rt">
      <header class="rt-head">
        <a class="rt-back" href="./" data-testid="to-game">← В игру</a>
        <a class="rt-logo" href="#/" data-testid="to-home">Рейтинг Ткачей</a>
        <span class="rt-sub">{data?.kind === 'ok' ? `${data.races.length} ${plural(data.races.length, 'гонка', 'гонки', 'гонок')}` : 'Гонки Ткачей'}</span>
      </header>
      <main class="rt-main">
        {!data ? <p class="rt-lead" data-testid="rt-loading">Загружаю рейтинг…</p>
          : data.kind !== 'ok' ? <Stub data={data} />
            : route.page === 'player' ? <PlayerPage data={data} name={route.name} />
              : route.page === 'race' ? <RacePage data={data} id={route.id} />
                : <Home data={data} scope={route.scope} />}
      </main>
      <footer class="rt-foot">Эло пересчитывается из архива гонок с нуля: старт 1000, K = 40 для первых 10 гонок, затем 24. Серия «Дуэли ткачей» — одна партия: Эло меняется один раз, по итогу серии.</footer>
    </div>
  );
}

function plural(n: number, a: string, b: string, c: string): string {
  const m = n % 100, d = n % 10;
  return m >= 11 && m <= 14 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c;
}

// ----- заглушка -----
function Stub({ data }: { data: Exclude<RatingData, { kind: 'ok' }> }) {
  const [title, text] = data.kind === 'empty' ? ['Рейтинг пока пуст', 'В архиве нет ни одной гонки. Проведите гонку в «Гонках Ткачей» и положите свежий races.json в папку data.']
    : data.kind === 'missing' ? ['Рейтинга пока нет', `${data.reason} Организатор гонок публикует архив как data/races.json рядом с этой страницей.`]
      : ['Файл рейтинга не читается', data.error];
  return (
    <section class="rt-stub" data-testid="rt-stub">
      <h1>{title}</h1>
      <p class="rt-lead">{text}</p>
      <p class="rt-note">Как обновить: в игре откройте «Гонки Ткачей → Архив гонок», нажмите «Скачать races.json» и положите файл в папку <b>data</b>.</p>
      <a class="rt-btn" href="./">Вернуться в игру</a>
    </section>
  );
}

// ----- главная: таблицы -----
function Tabs({ tables, scope }: { tables: EloTables; scope: string }) {
  const list = [ELO_ALL, ...disciplines(tables)];
  return (
    <nav class="rt-tabs" aria-label="Дисциплина">
      {list.map((s) => <a key={s} class={`rt-tab${s === scope ? ' on' : ''}`} href={routeHash({ page: 'home', scope: s })} aria-current={s === scope ? 'page' : undefined} data-testid={`tab-${s}`}>{scopeName(s)}</a>)}
    </nav>
  );
}
function Home({ data, scope }: { data: Extract<RatingData, { kind: 'ok' }>; scope: string }) {
  const { tables, races } = data;
  const sc = scope === ELO_ALL || tables.byDisc[scope] ? scope : ELO_ALL;
  const rows = sc === ELO_ALL ? tables.all : tables.byDisc[sc]!;
  const last = races.slice(-12).reverse();
  return (
    <>
      <h1 class="rt-h1">{sc === ELO_ALL ? 'Общий рейтинг' : discName(sc)}</h1>
      <Tabs tables={tables} scope={sc} />
      <div class="rt-tw"><table class="rt-table" data-testid="rt-table">
        <thead><tr><th class="n">#</th><th>Игрок</th><th class="n">Эло</th><th class="n">Гонок</th><th class="n" title="победы / ничьи / поражения">П / Н / Пор</th></tr></thead>
        <tbody>{rows.map((x, i) => (
          <tr key={x.key}><td class="n">{i + 1}</td><td><a class="rt-cell" href={playerHref(x.name)}>{x.name}</a></td><td class="n"><b class="rt-elo">{x.rating}</b></td><td class="n">{x.games}</td><td class="n">{x.wins} / {x.draws} / {x.losses}</td></tr>
        ))}</tbody>
      </table></div>
      <h2 class="rt-h2">Последние гонки</h2>
      <RaceList races={last} tables={tables} />
    </>
  );
}
function RaceList({ races, tables, me }: { races: RaceResult[]; tables: EloTables; me?: string }) {
  if (!races.length) return <p class="rt-lead">Гонок пока нет.</p>;
  return (
    <div class="rt-tw"><table class="rt-table" data-testid="rt-races">
      <thead><tr><th>Дата</th><th>Дисциплина</th><th>Игроки и время</th><th>Победитель</th>{me ? <th class="n">Эло</th> : null}</tr></thead>
      <tbody>{races.map((r) => {
        const ch = me ? tables.perRace[r.id]?.all[me] : undefined;
        return (
          <tr key={r.id}>
            <td><a class="rt-cell" href={raceHref(r.id)} data-testid="race-link">{shortDate(r.date)}</a></td><td>{discName(r.discipline)}{r.duel && <div class="rt-cs" data-testid="duel-label">{duelLabel(r)} · {duelMods(r)}</div>}</td>
            <td>{r.players.map((p) => (r.duel ? `${p.name} ${p.dnf ? `босс жив (снято ${Math.round(100 * (p.duel?.frac ?? 0))} %)` : fmt(timeOf(p) ?? 0)}` : `${p.name} ${p.dnf ? 'сошёл' : fmt(timeOf(p) ?? 0)}`)).join(' · ')}</td>
            <td>{winnerText(r)}{r.duel && <div class="rt-cs">счёт {r.duel.score[0]}:{r.duel.score[1]}{r.duel.final ? ` · серия: ${r.duel.seriesWinner}` : ''}</div>}</td>
            {me ? <td class="n">{ch ? <span class={ch.after >= ch.before ? 'up' : 'down'}>{sign(ch.after - ch.before)}</span> : '—'}</td> : null}
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

// ----- профиль игрока -----
function PlayerPage({ data, name }: { data: Extract<RatingData, { kind: 'ok' }>; name: string }) {
  const { races, tables } = data, prof = playerProfile(races, tables, name);
  const [scope, setScope] = useState(ELO_ALL);
  if (!prof) return <NotFound what="Игрока" text={name} />;
  const sc = prof.scopes.some((s) => s.scope === scope) ? scope : ELO_ALL, main = prof.scopes[0]!;
  const series = eloSeries(races, tables, prof.key, sc);
  return (
    <>
      <p class="rt-crumb"><a href="#/">← Рейтинг</a></p>
      <h1 class="rt-h1" data-testid="player-name">{prof.name}</h1>
      <div class="rt-cards">
        {prof.scopes.map((s) => (
          <div class="rt-card" key={s.scope} data-testid={`card-${s.scope}`}>
            <span class="rt-cl">{scopeName(s.scope)}</span><b class="rt-big">{s.rating}</b>
            <span class="rt-cs">{s.rank}-е место из {s.of} · {s.games} {plural(s.games, 'гонка', 'гонки', 'гонок')} · {s.wins}/{s.draws}/{s.losses}</span>
          </div>
        ))}
      </div>
      <h2 class="rt-h2">Эло по времени</h2>
      <div class="rt-seg" role="group" aria-label="Что показывать на графике">
        {prof.scopes.map((s) => <button type="button" key={s.scope} class={`rt-segb${s.scope === sc ? ' on' : ''}`} aria-pressed={s.scope === sc} onClick={() => setScope(s.scope)}>{scopeName(s.scope)}</button>)}
      </div>
      <EloChart series={series} />
      <h2 class="rt-h2">Рекорды</h2>
      <div class="rt-recs" data-testid="records">
        {prof.best.map((b) => <a class="rt-rec" key={b.disc} href={raceHref(b.raceId)}><span class="rt-cl">Лучшее время · {discName(b.disc)}</span><b>{fmt(b.time)}</b><span class="rt-cs">{shortDate(b.date)}</span></a>)}
        <div class="rt-rec"><span class="rt-cl">Серия побед</span><b>{prof.streak}</b><span class="rt-cs">подряд, максимум</span></div>
        {prof.bestGain ? <a class="rt-rec" href={raceHref(prof.bestGain.raceId)}><span class="rt-cl">Лучший прирост Эло</span><b class="up">{sign(prof.bestGain.delta)}</b><span class="rt-cs">за одну гонку</span></a> : null}
        <div class="rt-rec"><span class="rt-cl">Всего гонок</span><b>{prof.total}</b><span class="rt-cs">{main.wins} {plural(main.wins, 'победа', 'победы', 'побед')}</span></div>
      </div>
      <h2 class="rt-h2">Личные встречи</h2>
      {prof.h2h.length ? (
        <div class="rt-tw"><table class="rt-table" data-testid="h2h">
          <thead><tr><th>Соперник</th><th class="n">Встреч</th><th class="n">П / Н / Пор</th></tr></thead>
          <tbody>{prof.h2h.map((o) => <tr key={o.key}><td><a class="rt-cell" href={playerHref(o.name)}>{o.name}</a></td><td class="n">{o.games}</td><td class="n">{o.wins} / {o.draws} / {o.losses}</td></tr>)}</tbody>
        </table></div>
      ) : <p class="rt-lead">Зачтённых личных встреч пока нет.</p>}
      <h2 class="rt-h2">Последние гонки</h2>
      <RaceList races={prof.recent} tables={tables} me={prof.key} />
    </>
  );
}
function NotFound({ what, text }: { what: string; text: string }) {
  return (
    <section class="rt-stub" data-testid="rt-notfound">
      <h1>{what} «{text}» нет в архиве</h1>
      <p class="rt-lead">Возможно, ссылка устарела или имя записано иначе.</p>
      <a class="rt-btn" href="#/">К рейтингу</a>
    </section>
  );
}

const AXIS = { stroke: '#7fa596', grid: { stroke: '#1d3630', width: 1 }, ticks: { stroke: '#1d3630', width: 1 }, font: '12px "Fira Sans", system-ui, sans-serif' };
function EloChart({ series }: { series: ReturnType<typeof eloSeries> }) {
  const box = useRef<HTMLDivElement>(null), tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const h = (): number => (window.innerHeight < 460 ? 190 : 270);
    const u = new uPlot({
      width: Math.max(240, el.clientWidth), height: h(), legend: { show: false }, padding: [10, 12, 0, 0],
      scales: { x: { time: true }, y: { range: (_u, lo, hi) => { const pad = Math.max(20, (hi - lo) * 0.2); return [Math.floor(lo - pad), Math.ceil(hi + pad)]; } } },
      axes: [
        { ...AXIS, values: (_u, v) => v.map((t) => shortDate(new Date(t * 1000).toISOString())) },
        { ...AXIS, size: 52 },
      ],
      series: [{}, { label: 'Эло', stroke: '#9ff0c8', width: 2.5, fill: 'rgba(159,240,200,.10)', points: { show: true, size: 9, fill: '#ffd47a', stroke: '#070d0c', width: 1.5 } }],
      cursor: { points: { size: 12, fill: '#ffd47a' }, drag: { x: false, y: false } },
      hooks: {
        setCursor: [(c) => {
          const i = c.cursor.idx, t = tip.current; if (!t) return;
          t.textContent = i != null && i >= 0 && series.ids[i] ? `${fmtDateSec(series.x[i]!)} · Эло ${series.y[i]} · нажмите, чтобы открыть гонку` : '';
        }],
        ready: [(c) => { c.over.addEventListener('click', () => { const i = c.cursor.idx; if (i != null && i >= 0 && series.ids[i]) location.hash = raceHref(series.ids[i]!); }); }],
      },
    }, [series.x, series.y], el);
    const ro = new ResizeObserver(() => u.setSize({ width: Math.max(240, el.clientWidth), height: h() }));
    ro.observe(el);
    return () => { ro.disconnect(); u.destroy(); };
  }, [series]);
  return (
    <div class="rt-chartbox">
      <div class="rt-chart" ref={box} data-testid="elo-chart" data-points={series.x.length} />
      <div class="rt-tip" ref={tip} aria-live="off">{series.ids.length > 1 ? 'Наведите на точку: дата и Эло.' : ''}</div>
    </div>
  );
}
const fmtDateSec = (s: number): string => fmtDate(new Date(s * 1000).toISOString());

const fmtSeries = (r: RaceResult): string => (r.duel?.final ? `· победил ${r.duel.seriesWinner}` : '· не завершена в этой записи');
// ----- гонка -----
function RacePage({ data, id }: { data: Extract<RatingData, { kind: 'ok' }>; id: string }) {
  const r = data.races.find((x) => x.id === id);
  if (!r) return <NotFound what="Гонки" text={id} />;
  const pr = data.tables.perRace[r.id], rows = splitRows(r), names = r.players.map((p) => p.name), two = r.players.length === 2;
  const lead = (d: number | null): string => (d == null ? '—' : d === 0 ? 'ровно' : `${names[d < 0 ? 0 : 1]} ${fmtD(-Math.abs(d))}`);
  return (
    <>
      <p class="rt-crumb"><a href="#/">← Рейтинг</a></p>
      <h1 class="rt-h1">{discName(r.discipline)}</h1>
      <p class="rt-lead" data-testid="race-meta">{fmtDate(r.date)} · зерно {r.seed} · версия игры {r.version} · {r.winner === 'draw' ? 'ничья' : r.winner ? `победил ${r.winner}${r.awarded ? ' (присуждено)' : ''}` : 'победителя нет'}</p>
      <div class="rt-cards">
        {r.players.map((p) => {
          const ch = pr?.all[nkey(p.name)];
          return (
            <div class={`rt-card${r.winner === p.name ? ' win' : ''}`} key={p.seat}>
              <span class="rt-cl">{r.winner === p.name ? 'Победитель' : r.winner === 'draw' ? 'Ничья' : 'Участник'}</span>
              <a class="rt-bigname" href={playerHref(p.name)}>{p.name}</a>
              <b class="rt-big">{p.dnf ? 'сошёл' : fmt(timeOf(p) ?? 0)}</b>
              <span class="rt-cs">{p.igt != null ? `IGT ${fmt(p.igt)} · ` : ''}{p.deaths != null ? `смертей ${p.deaths}` : ''}{ch ? <> · Эло {ch.before} → {ch.after} (<span class={ch.after >= ch.before ? 'up' : 'down'}>{sign(ch.after - ch.before)}</span>)</> : null}</span>
            </div>
          );
        })}
      </div>
      {r.duel && (
        <>
          <h2 class="rt-h2">Серия {fmtSeries(r)}</h2>
          <div class="rt-tw"><table class="rt-table" data-testid="series-rounds">
            <thead><tr><th class="n">Раунд</th><th>Босс · модификаторы</th><th>Победитель</th><th class="n">Счёт</th></tr></thead>
            <tbody>{seriesRounds(data.races, r).map((x) => (
              <tr key={x.id} class={x.id === r.id ? 'me' : ''}><td class="n"><a class="rt-cell" href={raceHref(x.id)}>{x.round ?? '—'}</a></td><td>{duelLabel(x).split(' · ').slice(2).join(' · ')} · {duelMods(x)}</td><td>{winnerText(x)}</td><td class="n">{x.duel!.score[0]}:{x.duel!.score[1]}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}
      <h2 class="rt-h2">Сплиты</h2>
      {rows.length ? (
        <div class="rt-tw"><table class="rt-table rt-splits" data-testid="splits">
          <thead>
            <tr><th rowSpan={2}>Отрезок</th><th colSpan={two ? 3 : names.length} class="g">Время отрезка</th><th colSpan={two ? 3 : names.length} class="g">Накопленное время</th></tr>
            <tr>{names.map((n) => <th key={`s${n}`} class="n">{n}</th>)}{two ? <th class="n">Разница</th> : null}{names.map((n) => <th key={`c${n}`} class="n">{n}</th>)}{two ? <th class="n">Разница</th> : null}</tr>
          </thead>
          <tbody>{rows.map((s) => (
            <tr key={s.tag}>
              <td>{s.tag}</td>
              {s.seg.map((v, i) => <td key={`s${i}`} class="n">{v == null ? '—' : fmt(v)}</td>)}{two ? <td class="n dlt">{lead(s.dSeg)}</td> : null}
              {s.cum.map((v, i) => <td key={`c${i}`} class="n">{v == null ? '—' : fmt(v)}</td>)}{two ? <td class="n dlt">{lead(s.dCum)}</td> : null}
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p class="rt-lead" data-testid="no-splits">У этой гонки нет сплитов (в дисциплине нет отрезков или игрок сошёл до первого).</p>}
    </>
  );
}
