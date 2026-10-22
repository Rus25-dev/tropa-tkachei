// «Гонки Ткачей» в интерфейсе: панель организатора, архив гонок, вход игрока, вход и окно обсервера, комната гонки 1×1, плашка восстановления забега.
// Все панели — на общих кирпичиках kit.tsx: «← Назад», хлебные крошки, клавиатура, геймпад и касание (кнопки не ниже 44 px).
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { SR_CATS } from '../core/balance';
import { computeElo, ratingOf, winChances } from '../core/elo';
import { fmt, fmtD } from '../core/timefmt';
import type { Races } from '../app/races';
import { openRating } from '../app/ratinglink';
import { fixRules, violation } from '../app/speedrun';
import { rcIds, sr as srStore } from '../app/store';
import { DISC, mergeNames, racesJson, type RaceEvent, type RaceResult, type RoomPlayer, type RoomState } from '../net/racecommon';
import { BOSS_INFO, fmtName, vetoNow, type DuelBoss } from '../core/duel';
import { bossName, chaseEnd, chaseLead, modsLine } from '../net/raceduel';
import { isBoss, stageText, sumOfBest, tagsOf } from '../net/raceprog';
import { mergeRaces, parseRaces } from '../net/racesfile';
import { watchBox } from '../view/fit';
import { useTick } from './ingame';
import { Panel } from './kit';
import { copyCard, downloadCard } from './racecard';
import { BossCards, ChaseChart, DuelSetup, LastRound, ModChips, OrderStrip, PhaseTable, PlanLine, SeriesScore, VetoLog } from './duelui';
import { BossTable, COL_A, COL_B, Ribbon, SplitsTable } from './racetables';

export function useRaces(r: Races): void {
  const [, n] = useState(0);
  useEffect(() => r.subscribe(() => n((x) => x + 1)), [r]);
}

/** скопировать текст в буфер (запасной путь — выделение и execCommand) */
export async function copyText(s: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(s); return true; } catch { /* запасной путь */ }
  try { const ta = document.createElement('textarea'); ta.value = s; ta.style.cssText = 'position:fixed;left:-999px;top:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
}
function download(name: string, text: string): boolean {
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return true;
  } catch { return false; }
}

function Clock({ get }: { get: () => number }) {
  useTick(200);
  return <>{fmt(get())}</>;
}
const PHASE = (S: { phase: string; pause: { on: boolean } }): string => ({ lobby: 'ожидание игроков', veto: 'бан/пик боссов', prep: 'загрузка у игроков', count: 'отсчёт', run: S.pause.on ? 'ТЕХНИЧЕСКАЯ ПАУЗА' : 'гонка идёт', done: 'гонка окончена' } as Record<string, string>)[S.phase] ?? S.phase;

// ===================== организатор =====================
export function OrgPanel({ races }: { races: Races }) {
  useRaces(races);
  const org = races.org, S = org?.S;
  const [ask, setAsk] = useState<{ text: string; fn: () => void } | null>(null);
  const [copied, setCopied] = useState('');
  const [msg, setMsg] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const noBtn = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { const l = logRef.current; if (l) l.scrollTop = l.scrollHeight; }, [S?.events.length]);
  useEffect(() => { if (ask) noBtn.current?.focus(); }, [ask]);
  if (!org || !S) return null;
  const L = org.links(races.base()), ps = org.seatList(), f = fmt, eloT = computeElo(org.archive());
  const srv = ({ open: 'сервер: на связи', opening: 'сервер: подключаемся…', busy: `сервер: прежний код ещё занят, ждём (${org.srvInfo?.tries ?? 0})`, error: 'сервер: ошибка связи', closed: 'закрыто', idle: '' } as Record<string, string>)[org.status] ?? org.status;
  const confirmThen = (text: string, fn: () => void): void => setAsk({ text, fn });
  const card = (i: number) => {
    const p = ps[i];
    if (!p) return <div class="rc-box" data-testid={`org-p${i + 1}`}><h3>Игрок {i + 1}</h3><div class="lead">Ждём: отправьте ссылку игроку</div></div>;
    const t = p.tel as Record<string, number> | null, hp = t ? `${t['hp']}/${t['mh']}` : '—';
    const ph = p.fin ? 'финиш ' + f(p.fin.rta) : p.dnf ? 'сошёл' : S.phase === 'run' && t ? `${t['pa'] ? 'пауза · ' : ''}${stageText(S.disc, t, p.subs, false)} · ${f(t['el'] ?? 0)}` : S.phase === 'lobby' ? (p.ready ? 'готов' : 'не готов') : p.loaded ? 'загружен' : 'загружается…';
    return (
      <div class="rc-box" data-testid={`org-p${i + 1}`}>
        <h3><span class={`dot ${p.online ? 'on' : ''}`} />{p.name}</h3>
        <div data-testid={`org-p${i + 1}-state`}>{ph}</div>
        <div class="lead">{p.online ? `пинг ${p.rtt != null ? Math.round(p.rtt) + ' мс' : '…'}` : 'нет связи'}{t && S.phase === 'run' ? ` · маски ${hp} · смертей ${t['dt']}${p.lost ? ` (потеряно ${(p.lost / 1000).toFixed(1)} с)` : ''}` : ''}{p.restored ? ` · восстановлен ×${p.restored}` : ''}</div>
        {S.phase === 'lobby' && ps.length === 2 && <div class="lead" data-testid={`org-p${i + 1}-chance`}>Эло {ratingOf(eloT, p.name, S.disc).rating} · шанс на победу {winChances(eloT, ps[0]!.name, ps[1]!.name, S.disc)[i]} %</div>}
        {p.splits.length > 0 && !duel && <div class="lead">{p.splits.map((s, k) => `${tagsOf(S.disc)[k]} ${f(s)}`).join(' · ')}</div>}
      </div>
    );
  };
  const aw = (i: number) => <button type="button" class="btn" id={`rco-aw${i + 1}`} data-testid={`org-aw${i + 1}`} disabled={!(S.phase === 'run' || S.phase === 'count') || !ps[i]} onClick={() => confirmThen(`Присудить победу: ${ps[i]!.name}?`, () => org.award(ps[i]!.id))}>Присудить: {ps[i] ? ps[i]!.name : '—'}</button>;
  const links: [string, string, keyof typeof L][] = [['Игрокам', L.play, 'play'], ['Обсервер', L.watch, 'watch'], ['Для стрима', L.stream, 'stream'], ['OBS (фон прозрачный)', L.overlay, 'overlay']];
  const res = S.result;
  const duel = S.disc === 'duel', dpub = duel ? org.pub().duel ?? null : null, dplan = duel ? org.duelPlan() : null, dnow = dpub ? vetoNow(dpub.series) : null;
  const dover = !!dpub && dpub.series.stage === 'over';
  const startLabel = !duel ? (S.phase === 'prep' ? 'Начать без ожидания' : 'Старт гонки')
    : S.phase === 'prep' ? 'Начать без ожидания' : !S.duel ? 'Начать серию (бан/пик)' : S.phase === 'veto' ? 'Бан/пик идёт' : `Старт раунда ${dplan?.n ?? ''}`;
  const startOff = duel ? !((S.phase === 'lobby' && !S.duel && org.canStartSeries()) || (S.phase === 'lobby' && !!S.duel && org.canStart()) || (S.phase === 'prep' && ps.some((p) => p.online))) : !(org.canStart() || (S.phase === 'prep' && ps.some((p) => p.online)));
  return (
    <Panel crumbs={['Гонки Ткачей', 'Организатор']} onBack={() => races.setView(null)} digits={false} hint={{ act: 'нажать' }} label="Организатор гонки" cls="rc">
      <div class="st-page rcp">
        <div class="rc-head">
          <span class="rc-code" data-testid="org-code">{S.code}</span>
          <span class="chip" data-testid="org-phase">{PHASE(S)}</span>
          <span class={`chip ${org.status === 'open' ? '' : 'warn'}`} data-testid="org-server">{srv}</span>
          <span class="chip">обсерверов: <b data-testid="org-watchers">{org.watchers()}</b></span>
          {(S.phase === 'run' || S.phase === 'done') && <span class="chip" id="rco-clock"><Clock get={() => (S.phase === 'done' && res ? (res.players[0]?.time ?? 0) : org.elapsed())} /></span>}
        </div>
        <div class="rc-grid">
          <div class="rc-box"><h3>Ссылки</h3>
            {links.map(([label, url, key]) => (
              <div class="rc-link" key={key}><span>{label}</span><code data-testid={`org-link-${key}`}>{url}</code>
                <button type="button" class="btn" onClick={async () => { setCopied(key); await copyText(url).then((ok) => setCopied(ok ? key + '!' : key + '?')); setTimeout(() => setCopied(''), 1500); }}>{copied === key + '!' ? 'Скопировано' : copied === key + '?' ? 'Выделите вручную' : 'Копировать'}</button></div>
            ))}
          </div>
          <div class="rc-box"><h3>Гонка</h3>
            <label class="nm">Дисциплина
              <select id="rco-disc" data-testid="org-disc" disabled={S.phase !== 'lobby'} value={S.disc} onChange={(e) => org.setDisc((e.currentTarget as HTMLSelectElement).value)}>
                {Object.entries(DISC).map(([id, d]) => <option key={id} value={id} disabled={!d.ready}>{d.name}{d.ready ? '' : ' — ' + d.note}</option>)}
              </select></label>
            <div class="lead" data-testid="org-rules">{DISC[S.disc]?.rules}</div>
            {duel && <DuelSetup cfg={org.duelCfg()} locked={S.phase !== 'lobby' || !!S.duel} onChange={(c) => org.setDuelCfg(c)} />}
            <div class="lead">Одна гонка — одна дисциплина. Зерно общее: одинаковые враги и бусины у обоих. Зерно: <code>{S.seed}</code> {S.phase === 'lobby' && !duel && <button type="button" class="btn ghost" id="rco-seed" onClick={() => org.newSeedNow()}>другое</button>}</div>
            <div class="lead">Лёгкий режим и замедление игры игроку запрещены. Версия игры у всех должна быть {races.version}.</div>
          </div>
        </div>
        <div class="rc-grid">{card(0)}{card(1)}</div>
        {duel && dpub && (
          <div class="rc-box dl-orgbox" data-testid="org-duel-box"><h3>Серия</h3>
            <SeriesScore d={dpub} /><PlanLine d={dpub} /><OrderStrip d={dpub} />
            {S.phase === 'veto' && dnow && (<>
              <div class="lead" data-testid="org-veto-turn">Ходит <b>{dpub.names[dnow.side]}</b>: {dnow.kind === 'ban' ? 'бан' : 'пик'} (ход {dnow.step + 1} из {dnow.of}). Осталось: {dnow.left.map((b) => BOSS_INFO[b].short).join(', ')}.</div>
              <BossCards series={dpub.series} names={dpub.names} />
              <div class="row"><button type="button" class="btn" id="rco-autoveto" data-testid="org-autoveto" onClick={() => org.autoVeto()}>Выбрать за {dpub.names[dnow.side]}</button></div>
            </>)}
            {S.phase !== 'veto' && dpub.series.stage !== 'veto' && <VetoLog d={dpub} />}
            <LastRound d={dpub} />
            {(S.phase === 'run' || S.phase === 'done') && ps.length === 2 && dplan && (<>
              <ChaseChart names={dpub.names} a={org.chaseData()[dpub.seats[0]]} b={org.chaseData()[dpub.seats[1]]} pa={org.pub().players.find((p) => p.seat === dpub.seats[0])} pb={org.pub().players.find((p) => p.seat === dpub.seats[1])} id="org-duel-chase" />
              <div class="tbl-wrap"><PhaseTable names={dpub.names} pa={org.pub().players.find((p) => p.seat === dpub.seats[0])} pb={org.pub().players.find((p) => p.seat === dpub.seats[1])} ch={dplan.ch} id="org-duel-phases" /></div>
            </>)}
          </div>
        )}
        {!duel && (S.phase === 'run' || S.phase === 'done') && ps.length === 2 && (
          <div class="rc-box rc-splits" data-testid="org-splits"><h3>{isBoss(S.disc) ? 'Боссы и подсплиты' : 'Сплиты и подсплиты'}</h3>
            {isBoss(S.disc) && <div class="tbl-wrap"><BossTable disc={S.disc} a={org.pub().players[0]} b={org.pub().players[1]} id="org-boss-table" /></div>}
            <div class="tbl-wrap"><SplitsTable disc={S.disc} a={org.pub().players[0]} b={org.pub().players[1]} mode="full" id="org-splits-table" /></div>
          </div>
        )}
        <div class="rc-actions">
          <button type="button" class="btn primary" id="rco-start" data-testid="org-start" disabled={startOff} onClick={() => (S.phase === 'prep' ? org.maybeCount(true) : org.start())}>{startLabel}</button>
          {duel && S.phase === 'done' && <button type="button" class="btn primary" id="rco-next" data-testid="org-next" onClick={() => org.nextRound()}>{dover ? 'Новая серия' : 'Следующий раунд'}</button>}
          <button type="button" class="btn" id="rco-pause" data-testid="org-pause" disabled={S.phase !== 'run'} onClick={() => org.techPause()}>{S.pause.on ? 'Продолжить гонку' : 'Тех. пауза'}</button>
          <button type="button" class="btn" id="rco-restart" data-testid="org-restart" disabled={S.phase === 'lobby' || (duel && S.phase === 'done')} onClick={() => confirmThen(duel ? (S.phase === 'veto' ? 'Сбросить бан/пик и серию?' : 'Переиграть раунд: счёт серии не меняется, зерно новое.') : 'Переиграть: все вернутся в комнату, зерно сменится.', () => org.restart())}>{duel && S.phase === 'veto' ? 'Сбросить бан/пик' : duel ? 'Переиграть раунд' : 'Переиграть'}</button>
          {aw(0)}{aw(1)}
          <button type="button" class="btn" id="rco-undo" data-testid="org-undo" disabled={!S.acts.length} onClick={() => org.undo()}>Отменить действие</button>
          <button type="button" class="btn ghost" id="rco-cancel" data-testid="org-cancel" disabled={S.phase === 'lobby' || S.phase === 'done'} onClick={() => confirmThen('Отменить гонку без результата?', () => org.cancel())}>Отменить гонку</button>
        </div>
        {S.phase === 'done' && res && (
          <div class="rc-box" data-testid="org-result"><h3>Итог{duel && res.round ? ` раунда ${res.round}` : ''}</h3>
            {res.players.map((p) => <div key={p.seat}>{p.place}. {p.name} — {duel ? (p.dnf ? `босс не убит, снято ${Math.round(100 * (p.duel?.frac ?? 0))} %` : `убил босса за ${f(p.time ?? 0)}`) : p.dnf ? 'не финишировал' : f(p.time ?? 0)}{p.deaths != null ? ` · смертей ${p.deaths}` : ''}</div>)}
            <div class="lead">{res.winner === 'draw' ? 'Ничья' : res.winner ? 'Победитель: ' + res.winner : ''}{res.awarded ? ' (присуждено)' : ''}. Результат записан в архив.</div></div>
        )}
        <div class="rc-box"><h3>Лог</h3>
          <div class="rc-log" id="rco-log" ref={logRef} data-testid="org-log">
            {S.events.slice(-80).map((e: RaceEvent) => <div key={e.n}><span class="t">{e.t != null ? f(e.t) : '—:--'}</span> {e.x}</div>)}
          </div></div>
        <div class="rc-actions">
          <button type="button" class="btn" id="rco-arch" data-testid="org-archive" onClick={() => races.setView('archive')}>Архив гонок</button>
          <button type="button" class="btn" id="rco-dl" data-testid="org-download" onClick={() => { if (!download('races.json', racesJson(org.archive(), races.version, new Date().toISOString()))) setMsg('Не удалось скачать файл в этом браузере.'); }}>Скачать races.json</button>
          <button type="button" class="btn ghost" id="rco-hide" data-testid="org-hide" onClick={() => races.setView(null)}>Свернуть панель (комната работает)</button>
          <button type="button" class="btn ghost" id="rco-end" data-testid="org-end" onClick={() => confirmThen('Закрыть комнату? Игроки и обсерверы потеряют связь, незаписанная гонка пропадёт.', () => races.closeOrg())}>Закрыть комнату</button>
        </div>
        <div id="rco-msg" role="status" class="lead rc-ask" data-testid="org-msg">
          {ask ? (<>{ask.text} <button type="button" class="btn primary" id="rco-yes" data-testid="org-yes" onClick={() => { const fn = ask.fn; setAsk(null); fn(); }}>Да</button> <button type="button" class="btn" id="rco-no" data-testid="org-no" ref={noBtn} onClick={() => setAsk(null)}>Нет</button></>) : msg}
        </div>
      </div>
    </Panel>
  );
}

// ===================== архив гонок =====================
export function ArchivePanel({ races }: { races: Races }) {
  useRaces(races);
  const [n, bump] = useState(0);
  const [ask, setAsk] = useState(false);
  const [a, setA] = useState(''), [b, setB] = useState('');
  const [msg, setMsg] = useState('');
  void n;
  const arch = races.archive();
  const elo = computeElo(arch);
  const load = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    const r = parseRaces(await f.text());
    if (!r.ok) { setMsg(r.error); return; }
    const m = mergeRaces(races.archive(), r.races); races.saveArchive(m.races);
    setMsg(`Загружено гонок: ${r.races.length}, новых: ${m.added}.`); bump((x) => x + 1);
  };
  const card = async (r: RaceResult, copy: boolean): Promise<void> => {
    const ch = elo.perRace[r.id]?.disc, ok = copy ? await copyCard(r, ch) : await downloadCard(r, ch);
    setMsg(ok ? (copy ? 'Картинка скопирована в буфер.' : 'Картинка сохранена.') : 'Не удалось получить картинку в этом браузере.');
  };
  const names = [...new Set(arch.flatMap((r) => r.players.map((p) => p.name)))];
  const sno = new Map<string, number>(); for (const r of arch) if (r.seriesId && !sno.has(r.seriesId)) sno.set(r.seriesId, sno.size + 1);
  const from = a || names[0] || '', to = b || names[0] || '';
  const merge = (): void => {
    if (!from || !to || from === to) { setMsg('Выберите двух разных игроков.'); return; }
    const all = races.archive(), cnt = mergeNames(all, from, to);
    races.saveArchive(all);
    setMsg(`Объединено записей: ${cnt}.`); bump((x) => x + 1);
  };
  const clear = (): void => { races.saveArchive([]); setAsk(false); bump((x) => x + 1); };
  return (
    <Panel crumbs={['Гонки Ткачей', 'Архив']} onBack={() => races.setView(races.org?.S ? 'org' : null)} digits={false} hint={{ act: 'нажать' }} label="Архив гонок" cls="rc">
      <div class="st-page rcp">
        <h2 class="scr-t">Архив гонок</h2>
        <p class="lead">История гонок и рейтинг Эло (старт 1000, пересчитывается по всей истории). Архив можно скачать как <b>races.json</b> и загрузить обратно.</p>
        <div class="row">
          <button type="button" class="btn primary" id="rca-dl" data-testid="arch-download" onClick={() => { if (!download('races.json', racesJson(arch, races.version, new Date().toISOString()))) setMsg('Не удалось скачать файл в этом браузере.'); }}>Скачать races.json</button>
          <button type="button" class="btn" id="rca-rating" data-testid="arch-rating-link" onClick={openRating}>Страница рейтинга</button>
          <label class="btn" id="rca-load-l">Загрузить races.json<input type="file" id="rca-load" data-testid="arch-load" accept=".json,application/json" hidden onChange={(e) => { void load((e.currentTarget as HTMLInputElement).files?.[0]); (e.currentTarget as HTMLInputElement).value = ''; }} /></label>
          {ask ? (<span class="rc-ask">Стереть весь архив гонок? <button type="button" class="btn danger" id="rca-yes" onClick={clear}>Да</button> <button type="button" class="btn" onClick={() => setAsk(false)}>Нет</button></span>)
            : <button type="button" class="btn ghost" id="rca-clear" data-testid="arch-clear" onClick={() => setAsk(true)}>Очистить архив</button>}
        </div>
        <div class="rc-box"><h3>Объединить игроков</h3>
          <div class="lead">Один человек мог войти под разными именами («Ярь» и «ярь »): выберите, кого в кого слить.</div>
          <div class="row">
            <select id="rca-a" aria-label="Кого слить" value={from} onChange={(e) => setA((e.currentTarget as HTMLSelectElement).value)}>{names.map((x) => <option key={x}>{x}</option>)}</select>
            <span>→</span>
            <select id="rca-b" aria-label="С кем слить" value={to} onChange={(e) => setB((e.currentTarget as HTMLSelectElement).value)}>{names.map((x) => <option key={x}>{x}</option>)}</select>
            <button type="button" class="btn" id="rca-merge" onClick={merge}>Объединить</button>
          </div>
          <div id="rca-msg" role="status" class="lead">{msg}</div>
        </div>
        {elo.all.length ? (
          <div class="rc-box"><h3>Рейтинг Эло</h3>
            <div class="tbl-wrap"><table data-testid="arch-rating">
              <thead><tr><th>#</th><th>Игрок</th><th>Эло</th><th>Гонок</th><th>П / Н / Пор</th></tr></thead>
              <tbody>{elo.all.map((x, i) => <tr key={x.key}><td>{i + 1}</td><td>{x.name}</td><td><b>{x.rating}</b></td><td>{x.games}</td><td>{x.wins} / {x.draws} / {x.losses}</td></tr>)}</tbody>
            </table></div>
            {Object.entries(elo.byDisc).map(([d, rows]) => <div key={d} class="lead">{DISC[d]?.name ?? d}: {rows.map((x) => ` ${x.rating}`).join(' · ')}</div>)}
          </div>
        ) : null}
        {arch.length ? (
          <div class="tbl-wrap"><table data-testid="arch-table">
            <thead><tr><th>Дата</th><th>Дисциплина</th><th>Игроки и время</th><th>Победитель</th><th>Эло</th><th>Картинка</th></tr></thead>
            <tbody>{arch.slice().reverse().map((r: RaceResult) => (
              <tr key={r.id} data-series={r.seriesId}><td>{new Date(r.date).toLocaleString('ru-RU')}</td><td>{DISC[r.discipline]?.name ?? r.discipline}{r.duel && <div class="lead" data-testid="arch-duel">Серия №{sno.get(r.seriesId ?? '') ?? '?'} · {fmtName(r.duel.fmt)} · раунд {r.round ?? r.duel.slot + 1} · {bossName(r.duel.boss as DuelBoss)} · {modsLine(r.duel.mods as never)}</div>}</td>
                <td>{r.players.map((p) => (r.duel ? `${p.name} ${p.dnf ? `босс не убит (${Math.round(100 * (p.duel?.frac ?? 0))} %)` : fmt(p.time ?? 0)}` : `${p.name} ${p.dnf ? '—' : fmt(p.time ?? 0)}`)).join(' · ')}</td>
                <td>{r.winner === 'draw' ? 'ничья' : r.winner ?? '—'}{r.awarded ? ' (присуждено)' : ''}{r.duel && <div class="lead">счёт {r.duel.score[0]}:{r.duel.score[1]}{r.duel.final ? ` · серия: ${r.duel.seriesWinner}` : ''}</div>}</td>
                <td>{r.players.map((p) => p.eloBefore != null && p.eloAfter != null ? `${p.eloAfter - p.eloBefore >= 0 ? '+' : '−'}${Math.abs(p.eloAfter - p.eloBefore)}` : '—').join(' / ')}</td>
                <td><button type="button" class="btn ghost" onClick={() => void card(r, false)}>PNG</button> <button type="button" class="btn ghost" onClick={() => void card(r, true)}>Копировать</button></td></tr>
            ))}</tbody>
          </table></div>
        ) : <div class="lead" data-testid="arch-empty">Пока нет ни одной гонки.</div>}
      </div>
    </Panel>
  );
}

// ===================== игрок =====================
export function JoinPanel({ races }: { races: Races }) {
  useRaces(races);
  const play = races.play;
  const [code, setCode] = useState(races.prefill);
  const [name, setName] = useState(srStore.name());
  const inRoom = !!(play && play.code);
  const submit = (): void => { races.joinPlayer(code, name); };
  const leave = (): void => { races.leavePlay(); };
  const st = play?.state, v = violation();
  const conn = !play ? null : play.status === 'online' ? <span class="good">связь есть</span> : play.status === 'denied' ? <span class="bad">отказ: {play.denied}</span> : <span class="bad">нет связи, пробуем снова…</span>;
  const ph: Record<string, string> = { lobby: 'ожидание игроков', veto: 'бан/пик боссов', prep: 'загрузка', count: 'отсчёт', run: 'гонка идёт', done: 'гонка окончена', cancel: 'отменена' };
  const warn: string[] = [];
  if (v.length) warn.push(`Запрещено в гонке: ${v.join(', ')}.`);
  if (st && st.phase !== 'lobby' && !races.hasRc()) warn.push('Гонка уже идёт без вас: можно только смотреть.');
  return (
    <Panel crumbs={['Гонки Ткачей', 'Игрок']} onBack={() => { if (inRoom) leave(); else races.setView(null); }} digits={false} hint={{ act: 'нажать' }} label="Гонка Ткачей" cls="rc">
      <div class="st-page rcj">
        <h2 class="scr-t">Гонка Ткачей</h2>
        <p class="lead">{inRoom ? (play!.status === 'online' ? 'Когда оба готовы, организатор запустит общий отсчёт. Игра идёт у вас локально.' : 'Подключаемся к организатору…') : 'Вы играете у себя, организатор запускает общий отсчёт. По сети идут только положение, события и итог.'}</p>
        {!inRoom ? (
          <div class="rc-form">
            <label class="nm">Код комнаты
              <input id="rcj-code" data-testid="join-code" maxLength={8} autocomplete="off" autocapitalize="characters" placeholder="например, K7P4Q" value={code}
                onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} /></label>
            <label class="nm">Ваше имя (так вас увидит организатор и зрители)
              <input id="rcj-name" data-testid="join-name" maxLength={20} autocomplete="off" list="rcj-names" placeholder="например, Ярь" value={name}
                onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} /></label>
            <datalist id="rcj-names">{rcIds.names().map((x) => <option key={x} value={x} />)}</datalist>
            <div class="row"><button type="button" class="btn primary" id="rcj-go" data-testid="join-go" onClick={submit}>Войти</button></div>
          </div>
        ) : (
          <div class="rc-form">
            <div data-testid="join-status">Комната <b>{play!.code}</b> · вы: <b>{play!.name}</b> · {conn}{play!.client && play!.client.rtt != null ? ` · пинг ~${Math.round(play!.client.rtt)} мс` : ''}</div>
            {st && <div class="lead" data-testid="join-phase">{st.discName || 'Тропа целиком'} · {ph[st.phase] || st.phase}</div>}
            {st && st.disc === 'duel' && st.duel && <DuelPlayerBox races={races} />}
            <div data-testid="join-players">{st ? st.players.map((p: RoomPlayer) => <div key={p.seat} class={p.ready ? 'good' : ''}>{p.seat === play!.seat ? '▸ ' : ''}{p.name || '—'}: {!p.online ? 'нет связи' : p.ready ? 'готов' : 'не готов'}</div>) : null}</div>
            {warn.length > 0 && <div class="bad">{warn.join(' ')}</div>}
            <div class="row">
              <button type="button" class="btn primary" id="rcj-ready" data-testid="join-ready" disabled={play!.status !== 'online' || v.length > 0 || !st || st.phase !== 'lobby'} onClick={() => play!.toggleReady()}>{play!.me ? 'Не готов' : 'Готов'}</button>
              {v.length > 0 && <button type="button" class="btn" id="rcj-fix" onClick={() => { fixRules(); races.bump(); }}>Отключить запрещённые настройки</button>}
            </div>
          </div>
        )}
        <div id="rcj-msg" role="status" class={races.note || play?.msg ? (play?.msgKind || 'bad') : ''} data-testid="join-msg">{races.note || play?.msg || (play?.denied ? 'Не удалось войти: ' + play.denied : '')}</div>
        <div class="row"><button type="button" class="btn ghost" id="rcj-back" onClick={() => { if (inRoom) leave(); else races.setView(null); }}>{inRoom ? '← Выйти из комнаты' : '← Назад'}</button></div>
      </div>
    </Panel>
  );
}

/** дуэль у игрока: счёт серии, бан/пик (выбор карточки и подтверждение), план раунда */
function DuelPlayerBox({ races }: { races: Races }) {
  const play = races.play!, st = play.state!, d = st.duel!;
  const [sel, setSel] = useState<DuelBoss | null>(null);
  const now = vetoNow(d.series), side = d.seats.indexOf(play.seat ?? -1), mine = !!now && side === now.side;
  const verb = now ? (now.kind === 'ban' ? 'забанить' : 'выбрать') : '';
  const pick = sel && now && now.left.includes(sel) ? sel : null;
  return (
    <div class="rc-box dl-playbox" data-testid="duel-box">
      <SeriesScore d={d} />
      {st.phase === 'veto' && now ? (<>
        <div class={mine ? 'dl-turn me' : 'dl-turn'} role="status" data-testid="duel-turn">{mine ? `Ваш ход: ${verb} босса` : `Ходит ${d.names[now.side]}: ${now.kind === 'ban' ? 'бан' : 'пик'}…`} <span class="dim">(ход {now.step + 1} из {now.of})</span></div>
        <div class="row"><button type="button" class="btn primary" id="rcj-veto" data-testid="duel-confirm" disabled={!mine || !pick} onClick={() => { if (pick) { play.veto(pick); setSel(null); } }}>{pick ? `Подтвердить: ${verb} ${BOSS_INFO[pick].short}` : mine ? `Выберите босса, которого хотите ${verb}` : 'Ждём соперника'}</button></div>
        <BossCards series={d.series} names={d.names} selected={pick} onSelect={mine ? setSel : undefined} />
        <VetoLog d={d} />
      </>) : (<>
        <PlanLine d={d} /><OrderStrip d={d} /><LastRound d={d} />
        {st.phase === 'lobby' && d.plan && <div class="lead" data-testid="duel-ready-hint">Нажмите «Готов», когда готовы к раунду {d.plan.n}: {bossName(d.plan.boss)}, {modsLine(d.plan.mods)}.</div>}
      </>)}
    </div>
  );
}

// ===================== обсервер: вход =====================
export function WatchJoinPanel({ races }: { races: Races }) {
  useRaces(races);
  const [code, setCode] = useState(races.prefill);
  const w = races.watch, go = (): void => { races.joinWatch(code); };
  const msg = races.note || (w?.denied ? 'Не удалось подключиться: ' + w.denied : w && w.connStatus === 'connecting' ? 'Подключаемся…' : w && w.connStatus === 'reconnecting' ? 'Комната не отвечает, пробуем снова…' : '');
  return (
    <Panel crumbs={['Гонки Ткачей', 'Обсервер']} onBack={() => { races.leaveWatch(); races.setView(null); }} digits={false} hint={{ act: 'нажать' }} label="Обсервер гонки" cls="rc">
      <div class="st-page rcj">
        <h2 class="scr-t">Обсервер гонки</h2>
        <p class="lead">Смотреть гонку Ткачей: две половины, табло и лента событий. Окно лучше держать на втором мониторе и не сворачивать: Chrome «усыпляет» скрытые окна. Для стрима откройте ссылку со <b>stream=1</b>.</p>
        <label class="nm">Код комнаты
          <input id="rwj-code" data-testid="watch-code" maxLength={8} autocomplete="off" autocapitalize="characters" placeholder="например, K7P4Q" value={code}
            onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} /></label>
        <div class="row"><button type="button" class="btn primary" id="rwj-go" data-testid="watch-go" onClick={go}>Смотреть</button></div>
        <div id="rwj-msg" role="status" class={w?.denied || races.note ? 'bad' : ''} data-testid="watch-msg">{msg}</div>
        <div class="row"><button type="button" class="btn ghost" id="rwj-back" onClick={() => { races.leaveWatch(); races.setView(null); }}>← Назад</button></div>
      </div>
    </Panel>
  );
}

// ===================== обсервер: окно и табло =====================
export function WatchView({ races }: { races: Races }) {
  useRaces(races); useTick(100);
  const w = races.watch!, S = w.S;
  const ref = useRef<HTMLDivElement>(null);
  const fit = (): void => {
    const el = ref.current; if (!el) return;
    const b = watchBox(window.innerWidth, window.innerHeight);
    el.style.transform = `translate(${b.x}px,${b.y}px) scale(${b.scale})`;
  };
  useLayoutEffect(() => { fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);
  // горячие клавиши обсервера: H — табло, 1/2 — половина игрока на весь экран на 10 с, 0 — обе половины, R затем 1/2 — повтор последних 10 с, Space — заморозить ленту
  useEffect(() => {
    let armed = 0, hide = 0;
    const seatOf = (i: number): number | null => w.S?.players?.[i]?.seat ?? null;
    const k = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.closest?.('input,select,textarea')) return;
      const now = w.nowMs();
      if (e.key === 'Escape' && !races.stream) { races.leaveWatch(); return; }
      if (e.code === 'KeyH') w.hideBoard = !w.hideBoard;
      else if (e.code === 'Space') { w.frozen = !w.frozen; e.preventDefault(); }
      else if (e.code === 'KeyR') { armed = now + 1500; return; }
      else if (e.code === 'KeyM') races.sound?.toggleMute();
      else if (e.code === 'KeyT') w.splitsOn = !w.splitsOn;
      else if (e.code === 'Digit0') { w.solo = null; w.stopReplay(); }
      else if (e.code === 'Digit1' || e.code === 'Digit2') {
        const s = seatOf(e.code === 'Digit1' ? 0 : 1); if (s == null) return;
        if (now < armed) { armed = 0; w.startReplay(s); } else w.solo = { seat: s, until: now + 10000 };
      } else return;
      w.changed();
    };
    const mv = (): void => { document.documentElement.classList.remove('rw-nocursor'); clearTimeout(hide); if (races.stream) hide = window.setTimeout(() => document.documentElement.classList.add('rw-nocursor'), 2000); };
    window.addEventListener('keydown', k); window.addEventListener('mousemove', mv); mv();
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('mousemove', mv); clearTimeout(hide); document.documentElement.classList.remove('rw-nocursor'); };
  }, [races.stream]);
  if (!S) return null;
  const ps = S.players || [], p1 = ps[0], p2 = ps[1], t1 = p1 && w.tel[p1.seat], t2 = p2 && w.tel[p2.seat], phase = S.phase, now = performance.now();
  const masks = (t: Record<string, number> | undefined): string => (t ? '●'.repeat(Math.max(0, t['hp'] ?? 0)) + '○'.repeat(Math.max(0, (t['mh'] ?? 0) - (t['hp'] ?? 0))) : '');
  const chap = (t: Record<string, any> | undefined, p: RoomPlayer | undefined): string => (!t ? '' : stageText(S.disc, t, p?.subs, !!(p && p.fin))); // eslint-disable-line @typescript-eslint/no-explicit-any
  const duel = S.disc === 'duel', dpub = duel ? S.duel ?? null : null;
  const showTbl = !duel && (w.splitsOn || now < w.splitsUntil) && phase !== 'lobby' && phase !== 'veto' && phase !== 'prep' && phase !== 'count' && !!p1 && !!p2;
  const lead = duel ? null : w.lead(), clock = w.clockMs();
  const hpLead = duel && p1 && p2 ? chaseLead(w.chase[p1.seat], w.chase[p2.seat], chaseEnd(w.chase[p1.seat], w.chase[p2.seat])) : 0;
  const duelSeat = (i: number): RoomPlayer | undefined => (dpub ? ps.find((p) => p.seat === dpub.seats[i]) : undefined);
  const bossName = (k: string): string => ({ k: 'Первый Кающийся', m: 'Миша Додик', v: 'Владик Скрипка', t: 'Тима Пиво' } as Record<string, string>)[k] || 'Босс';
  const res = S.result || w.resultLite;
  const showCards = phase === 'lobby' || phase === 'prep' || phase === 'count';
  const chart = duel && dpub && dpub.plan && (phase === 'run' || (phase === 'done' && !res)) ? dpub : null;
  const cdText = w.cd && w.cd.n > 0 && now - w.cd.at < 1500 ? String(w.cd.n) : w.cd && w.cd.n === 0 && now - w.cd.at < 900 ? 'ПОШЁЛ!' : '';
  const card = (p: RoomPlayer | undefined) => (
    <div class="rwc"><div class="nm">{p ? p.name : 'Ждём игрока…'}</div>
      <div class="rd">{p ? (!p.online ? 'нет связи' : phase === 'lobby' ? (p.ready ? '✔ готов' : 'не готов') : p.loaded ? '✔ загружен' : 'загружается…') : ''}</div>
      {p && p.rtt != null && <div class="st">пинг {p.rtt} мс</div>}</div>
  );
  return (
    <div class="rw-wrap" data-testid="watch-view">
      {!races.stream && <button type="button" class="btn rw-exit" data-testid="watch-exit" onClick={() => races.leaveWatch()}>← Выйти</button>}
      {!races.stream && races.sound && (
        <div class="rw-vol" data-testid="watch-audio">
          <button type="button" class="btn" id="rw-mute" aria-pressed={races.sound.muted} onClick={() => races.sound?.toggleMute()}>{races.sound.muted ? 'Включить звук' : 'Без звука'}</button>
          <input type="range" min={0} max={100} step={5} aria-label="Громкость обсервера" value={races.sound.muted ? 0 : races.sound.vol} onInput={(e) => races.sound?.setVolume(Number((e.currentTarget as HTMLInputElement).value))} />
        </div>
      )}
      <div class="rw-hud" ref={ref}>
        <div class="mid" data-testid="watch-board" style={w.hideBoard || (duel && phase === 'veto') ? { display: 'none' } : undefined}>
          <div class="names"><div class="a" style={{ color: '#8fe8d2' }}>{p1 ? p1.name : '—'}</div><div class="st">{phase === 'run' ? (S.pause.on ? 'ПАУЗА' : 'гонка') : phase === 'done' ? 'финиш' : ''}</div><div class="b" style={{ color: '#ffc46e' }}>{p2 ? p2.name : '—'}</div></div>
          <div class="tm" data-testid="watch-time">{phase === 'run' || phase === 'done' ? fmt(clock) : phase === 'count' || phase === 'prep' ? 'старт' : '0:00.00'}</div>
          {duel ? (<><div class={`df ${hpLead > 0 ? 'p' : 'n'}`} data-testid="duel-hplead">{phase === 'run' || phase === 'done' ? (hpLead === 0 ? '±0 %' : `${hpLead > 0 ? '+' : '−'}${Math.abs(Math.round(hpLead))} %`) : ' '}</div><div class="st">{phase === 'run' || phase === 'done' ? 'снято здоровья босса, разница' : ' '}</div></>)
            : (<><div class={`df ${lead && lead.ms < 0 ? 'p' : 'n'}`}>{lead ? (lead.ms === 0 ? '±0.0' : fmtD(lead.ms)) : ' '}</div><div class="st">{lead ? lead.txt : ' '}</div></>)}
          <div class="names"><div class="a masks">{masks(t1)}</div><div class="st" /><div class="b masks">{masks(t2)}</div></div>
          <div class="stage" data-testid="watch-stage"><div class="a" style={{ color: COL_A }}>{chap(t1, p1)}</div><div class="b" style={{ color: COL_B }}>{chap(t2, p2)}</div></div>
          {duel ? ((phase === 'run' || phase === 'done') && dpub && <div class="dl-strip"><SeriesScore d={dpub} compact /><PlanLine d={dpub} /></div>) : (phase === 'run' || phase === 'done') && <Ribbon disc={S.disc} a={p1} b={p2} ta={t1} tb={t2} />}
        </div>
        {showTbl && !(phase === 'done' && res) && <div class="rt-live" data-testid="watch-splits">{isBoss(S.disc) ? <><BossTable disc={S.disc} a={p1} b={p2} id="watch-boss-table" /><SplitsTable disc={S.disc} a={p1} b={p2} mode="cur" id="watch-splits-table" /></> : <SplitsTable disc={S.disc} a={p1} b={p2} mode="live" id="watch-splits-table" />}</div>}
        {chart && dpub && (
          <div class="dl-watch" data-testid="duel-watch">
            <ChaseChart big names={dpub.names} a={w.chase[dpub.seats[0]]} b={w.chase[dpub.seats[1]]} pa={duelSeat(0)} pb={duelSeat(1)} ch={dpub.plan!.ch} />
            {w.splitsOn && <PhaseTable names={dpub.names} pa={duelSeat(0)} pb={duelSeat(1)} ch={dpub.plan!.ch} />}
          </div>
        )}
        {phase === 'veto' && dpub && (
          <div class="dl-vetoscr" data-testid="duel-veto">
            <h2>Бан/пик боссов · {`Bo${dpub.series.fmt}`}</h2>
            <div class="turn" data-testid="duel-veto-turn">{(() => { const n = vetoNow(dpub.series); return n ? `Ходит ${dpub.names[n.side]}: ${n.kind === 'ban' ? 'бан' : 'пик'} · ход ${n.step + 1} из ${n.of}` : ''; })()}</div>
            <BossCards big series={dpub.series} names={dpub.names} />
            <VetoLog d={dpub} />
          </div>
        )}
        {w.replay && <div class="rw-replay" data-testid="watch-replay">ПОВТОР · {w.S?.players?.find((p) => p.seat === w.replay!.seat)?.name}</div>}
        {w.connStatus !== 'online' && <div class="conn">нет связи с организатором, пробуем снова…</div>}
        {(phase === 'run') && !t1 && p1 && <div class="wait" style={{ left: '0px' }}>Ждём данные игрока…</div>}
        {(phase === 'run') && !t2 && p2 && <div class="wait" style={{ left: '960px' }}>Ждём данные игрока…</div>}
        {[[t1, 20], [t2, 980]].map(([t, x], i) => { const tt = t as Record<string, any> | undefined; return tt && tt['bs'] && tt['bs'].on ? ( // eslint-disable-line @typescript-eslint/no-explicit-any
          <div class="bar" key={i} style={{ left: `${(x as number) + 270}px` }}><span>{bossName(tt['bs'].k)} · фаза {tt['bs'].ph}</span><div class="hp"><i style={{ width: `${Math.max(0, Math.round(100 * tt['bs'].hp / tt['bs'].mh))}%` }} /></div></div>) : null; })}
        <div class="feed" data-testid="watch-feed">
          {w.feed.length ? w.feedView().slice(-4).map((e) => <div key={e.n} class={e.k}><span class="t">{e.t != null ? fmt(e.t) : '—:--'}</span>{e.x}</div>) : <div>Ждём событий…</div>}
        </div>
        {showCards && (<>
          <div class="rw-cards">{card(p1)}{card(p2)}</div>
          {cdText && <div class="big">{cdText}</div>}
          <div class="mid sub">{S.discName || 'Тропа целиком'} · комната {w.code}</div>
          {duel && dpub && <div class="dl-lobbyinfo" data-testid="duel-lobbyinfo"><SeriesScore d={dpub} /><PlanLine d={dpub} /><OrderStrip d={dpub} /><LastRound d={dpub} /></div>}
        </>)}
        {phase === 'done' && res && duel && dpub && <DuelOver w={w} d={dpub} a={duelSeat(0)} b={duelSeat(1)} />}
        {phase === 'done' && res && !duel && (w.splitsOn ? <div class="over full" data-testid="watch-over-splits"><h2>{isBoss(S.disc) ? 'Фазы боссов' : 'Сплиты и подсплиты'}</h2><SplitsTable disc={S.disc} a={p1} b={p2} mode="full" id="watch-splits-full" /></div> : <WatchOver w={w} />)}
      </div>
    </div>
  );
}
/** итог раунда дуэли на табло: кто и почему победил, счёт серии, график погони и разница к фазам */
function DuelOver({ w, d, a, b }: { w: NonNullable<Races['watch']>; d: NonNullable<RoomState['duel']>; a?: RoomPlayer; b?: RoomPlayer }) {
  const l = d.last, over = d.series.stage === 'over';
  return (
    <div class="over dl-over" data-testid="duel-over">
      <h2>{over ? `Серия: победил ${d.names[d.series.winner ?? 0]} ${d.series.score[0]}:${d.series.score[1]}` : l ? (l.winner === 'draw' ? 'Раунд: ничья' : `Раунд ${l.n}: ${d.names[l.winner === 'a' ? 0 : 1]}`) : 'Раунд окончен'}</h2>
      <SeriesScore d={d} />
      <LastRound d={d} />
      <ChaseChart big names={d.names} a={w.chase[d.seats[0]]} b={w.chase[d.seats[1]]} pa={a} pb={b} ch={l ? BOSS_INFO[l.boss].ch : d.plan?.ch} id="duel-over-chase" />
      <PhaseTable names={d.names} pa={a} pb={b} ch={l ? BOSS_INFO[l.boss].ch : d.plan?.ch ?? 1} id="duel-over-phases" />
      {!over && d.plan && <div class="dl-next">Дальше: раунд {d.plan.n} · {BOSS_INFO[d.plan.boss].name} · <ModChips mods={d.plan.mods} /></div>}
    </div>
  );
}
function WatchOver({ w }: { w: NonNullable<Races['watch']> }) {
  const f = fmt, r = (w.S!.result || w.resultLite) as { players: { seat: number; name: string; dnf: boolean; time: number }[]; winner: number | 'draw' | null; awarded: boolean; gap: number | null }, ps = w.S!.players || [];
  const rows = (r.players || []).slice().sort((a, b) => a.seat - b.seat), A = rows[0], B = rows[1];
  const S1 = A && w.stats[A.seat], S2 = B && w.stats[B.seat];
  const mk = (label: string, k: string, fm?: (v: any) => string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const val = (s: Record<string, any> | undefined): string => (s && s[k] != null ? (fm ? fm(s[k]) : String(s[k])) : '—'); // eslint-disable-line @typescript-eslint/no-explicit-any
    return <tr key={k}><td>{label}</td><td>{val(S1)}</td><td>{val(S2)}</td></tr>;
  };
  const win = r.winner === 'draw' ? 'Ничья' : r.winner != null ? 'Победил ' + (rows.find((x) => x.seat === r.winner)?.name ?? '') : 'Гонка окончена';
  const sp = (p: { seat: number }, i: number): string => { const q = ps.find((x) => x.seat === p.seat); return q && q.splits && q.splits[i] != null ? f(q.splits[i]!) : '—'; };
  const disc = w.S!.disc, tags = tagsOf(disc), qa = A && ps.find((x) => x.seat === A.seat), qb = B && ps.find((x) => x.seat === B.seat);
  const sobA = sumOfBest(qa?.pb), sobB = sumOfBest(qb?.pb), lostTxt = (q: RoomPlayer | undefined): string => (q && q.deaths ? `${q.deaths} · −${((q.lost ?? 0) / 1000).toFixed(1)} с` : '0');
  const boss = isBoss(disc);
  return (
    <div class={`over ${boss ? 'boss' : ''}`} data-testid="watch-over"><h2>{win}{r.awarded ? ' (присуждено)' : ''}{r.gap != null ? ' · +' + f(Math.abs(r.gap)) : ''}</h2>
      {boss && <BossTable disc={disc} a={qa} b={qb} id="watch-boss-over" />}
      <table><thead><tr><th /><th>{A?.name}</th><th>{B?.name}</th></tr></thead><tbody>
        <tr><td>Время</td><td>{A && !A.dnf ? f(A.time) : '—'}</td><td>{B && !B.dnf ? f(B.time) : '—'}</td></tr>
        {!boss && [0, 1, 2, 3].map((i) => <tr key={i}><td>{tags[i]}</td><td>{A ? sp(A, i) : ''}</td><td>{B ? sp(B, i) : ''}</td></tr>)}
        {!boss && <tr><td>Сумма лучших отрезков</td><td>{sobA != null ? f(sobA) : '—'}</td><td>{sobB != null ? f(sobB) : '—'}</td></tr>}
        <tr><td>Смерти · потеряно времени</td><td>{lostTxt(qa)}</td><td>{lostTxt(qb)}</td></tr>
        {mk('Урон боссам', 'bossDmg')}{mk('DPS в боях', 'dps')}{mk('Получено урона', 'taken')}{!boss && mk('Лечений', 'heals')}{mk('Точность', 'acc', (v) => Math.round(v * 100) + ' %')}{mk('Отбивы', 'parries')}{mk('Идеальные увороты', 'dodges')}{mk('Оглушения', 'stuns')}{mk('Казни', 'execs')}{mk('Самое длинное комбо', 'combo')}{!boss && mk('Покупок в лавке', 'buys', (v) => String((v as unknown[]).length))}
      </tbody></table></div>
  );
}

// ===================== гонка 1×1 =====================
export function DuelPanel({ races }: { races: Races }) {
  useRaces(races);
  const d = races.duel;
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const v = violation();
  if (!d) {
    return (
      <Panel crumbs={['Спидран', 'Гонка 1×1']} onBack={() => races.setView(null)} digits={false} hint={{ act: 'нажать' }} label="Гонка 1×1" cls="rc">
        <div class="st-page rcj">
          <h2 class="scr-t">Гонка 1×1</h2>
          <p class="lead">Оба играют один и тот же забег одновременно, каждый в своей игре, на общем зерне. По сети идут только готовность, отсчёт, ваше положение и итог.</p>
          <div class="row"><button type="button" class="btn primary" id="du-host" data-testid="duel-host" disabled={v.length > 0} onClick={() => { setErr(races.startDuel('host') ?? ''); }}>Создать комнату</button></div>
          <div class="rc-form">
            <label class="nm">Или войти по коду друга
              <input id="du-code" data-testid="duel-code" maxLength={8} autocomplete="off" autocapitalize="characters" placeholder="например, K7P4Q" value={code}
                onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') setErr(races.startDuel('guest', code) ?? ''); }} /></label>
            <div class="row"><button type="button" class="btn" id="du-join" data-testid="duel-join" disabled={v.length > 0} onClick={() => setErr(races.startDuel('guest', code) ?? '')}>Войти</button></div>
          </div>
          {v.length > 0 && <div class="bad">Запрещено в спидране: {v.join(', ')}. <button type="button" class="btn" onClick={() => { fixRules(); races.bump(); }}>Отключить</button></div>}
          <div role="status" class="bad" data-testid="duel-err">{err}</div>
        </div>
      </Panel>
    );
  }
  const warn = d.blocked(), host = d.role === 'host';
  const rtt = d.rtt != null ? ` · пинг ~${Math.round(d.rtt)} мс` : '';
  const online = d.role === 'host' ? d.peerOnline : d.status === 'online';
  return (
    <Panel crumbs={['Спидран', 'Гонка 1×1', 'Комната']} onBack={() => races.leaveDuel()} digits={false} hint={{ act: 'нажать' }} label="Комната гонки 1×1" cls="rc">
      <div class="st-page rcj">
        <h2 class="scr-t">Гонка 1×1</h2>
        {host && <div class="rc-hostbox"><span class="lbl">Код комнаты</span><span class="rc-code" data-testid="duel-room-code">{d.code}</span>
          <span class="lb-link">{races.base()}?race=duel&amp;room={d.code}</span></div>}
        <div class="row" role="radiogroup" aria-label="Категория">
          {(['trail', 'boss'] as const).map((id) => <button type="button" key={id} class={`btn ${d.cat === id ? 'primary' : ''}`} id={`du-cat-${id}`} data-testid={`duel-cat-${id}`} disabled={!host || d.state !== 'room'} aria-pressed={d.cat === id} onClick={() => d.setCat(id)}>{SR_CATS[id].name}</button>)}
        </div>
        <div data-testid="duel-state">
          <div>{host ? 'Вы — хост: категорию выбираете вы.' : 'Категорию выбирает хост: ' + SR_CATS[d.cat].name + '.'}{rtt}</div>
          <div class={d.me ? 'good' : ''}>Вы: {d.me ? 'готов' : 'не готов'}</div>
          <div class={d.opp ? 'good' : ''}>Соперник: {d.lost ? 'нет связи' : !online && !d.opp ? 'ждём…' : d.opp ? 'готов' : 'не готов'}</div>
        </div>
        <div class="lead">{SR_CATS[d.cat] ? (d.cat === 'trail' ? 'Главы I–IV подряд, с нуля. Лавка и бусины разрешены. Сплит — на смерти босса каждой главы.' : 'Четыре босса подряд: Первый Кающийся, Миша, Владик, Тима. Все способности открыты, лавки нет.') : ''}</div>
        {warn.length > 0 && <div class="bad" data-testid="duel-warn">{warn.join(' ')}</div>}
        <div class="row">
          <button type="button" class="btn primary" id="du-ready" data-testid="duel-ready" disabled={d.lost || v.length > 0 || (!!d.peerVer && d.peerVer !== races.version) || d.state !== 'room' || d.status !== 'online' && d.status !== 'open'} onClick={() => d.toggleReady()}>{d.me ? 'Не готов' : 'Готов'}</button>
          {v.length > 0 && <button type="button" class="btn" onClick={() => { fixRules(); races.bump(); }}>Отключить запрещённые настройки</button>}
        </div>
        <div id="du-msg" role="status" class="lb-status wait" data-testid="duel-status">{d.denied ? 'Не удалось войти: ' + d.denied : d.status === 'online' || d.status === 'open' ? (d.state === 'room' ? '' : 'Загрузка забега…') : 'Подключаемся…'}</div>
        <div class="row"><button type="button" class="btn ghost" id="du-leave" onClick={() => races.leaveDuel()}>← Выйти из комнаты</button></div>
      </div>
    </Panel>
  );
}

// ===================== воспроизведение журнала =====================
export function RestoreOverlay({ pct }: { pct: number }) {
  return <div class="rc-restore" role="status" data-testid="restoring"><div>Восстанавливаем забег…</div><div class="rc-restore-p">{pct} %</div></div>;
}

/** Всё, что относится к гонкам и лежит поверх меню */
export function RacesLayer({ races }: { races: Races }) {
  useRaces(races);
  return (
    <>
      {races.view === 'org' && races.org?.S && <OrgPanel races={races} />}
      {races.view === 'archive' && <ArchivePanel races={races} />}
      {races.view === 'join' && <JoinPanel races={races} />}
      {races.view === 'watchjoin' && !races.watching && <WatchJoinPanel races={races} />}
      {races.view === 'duel' && <DuelPanel races={races} />}
      {races.watching && races.watch?.S && <WatchView races={races} />}
      {races.restoring && <RestoreOverlay pct={races.restoring.pct} />}
    </>
  );
}
