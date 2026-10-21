// Спидран в интерфейсе: таблица друзей, таймер со сплитами в забеге и итоговый экран.
import { useEffect, useState } from 'preact/hooks';
import { SR_CATS } from '../core/balance';
import { rta as runRta, type SrResult, type SrRun } from '../core/speedrun';
import type { World } from '../core/world';
import { boardRows, entryOf, fmt, fmtD, friends, friendsAdd, friendsSave, text, type ResultLike } from '../app/speedrun';
import { sr as srStore } from '../app/store';
import { Panel, Item } from './kit';

/** Таблица друзей: вставка строк «Скопировать результат», рекорд игрока и последний забег */
export function Friends({ crumbs, onBack, last, version }: { crumbs: string[]; onBack: () => void; last: (ResultLike & { taint?: string | null }) | null; version?: string }) {
  const [name, setName] = useState(srStore.name());
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<{ t: string; bad: boolean }>({ t: '', bad: false });
  const [, bump] = useState(0);
  const add = (): void => {
    const r = friendsAdd(paste);
    if (r.ok) setPaste('');
    setMsg({ t: [r.ok ? `Добавлено: ${r.ok}` : '', r.dup ? `Уже были: ${r.dup}` : '', ...r.errs].filter(Boolean).join('\n') || 'Нечего добавлять', bad: r.errs.length > 0 });
    bump((n) => n + 1);
  };
  return (
    <Panel crumbs={[...crumbs, 'Таблица друзей']} onBack={onBack} digits={false} hint={{ act: 'нажать' }} label="Таблица друзей" cls="friends">
      <div class="st-page fr">
        <h2 class="scr-t">Таблица друзей</h2>
        <p class="lead">Вставьте результаты друзей по одному в строку (у друга: «Скопировать результат» на итоговом экране). Код ловит опечатки при копировании, но не подделку: без сервера результаты честны лишь на слово.</p>
        <label class="nm">Ваше имя (подставится в копируемый результат)
          <input id="sr-name" maxLength={20} autocomplete="off" placeholder="например, Ива" value={name} onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setName(v); srStore.setName(v); }} /></label>
        <textarea id="sr-paste" spellcheck={false} value={paste} onInput={(e) => setPaste((e.currentTarget as HTMLTextAreaElement).value)} placeholder="Вася: ТТ v1.4 Тропа целиком 23:41.52 (IGT 22:58.10) обрывов 3 · сплиты … · код A1B2C3" />
        <div class="row"><button type="button" class="btn primary" id="sr-add" onClick={add}>Добавить в таблицу</button>
          <button type="button" class="btn" id="sr-clear" onClick={() => { friendsSave([]); setMsg({ t: 'Чужие результаты очищены', bad: false }); bump((n) => n + 1); }}>Очистить чужие результаты</button></div>
        <div id="sr-fmsg" role="status" class={msg.bad ? 'bad' : 'good'} style={{ whiteSpace: 'pre-line' }}>{msg.t}</div>
        {(['trail', 'boss'] as const).map((id) => {
          const rows = boardRows(id, last);
          return (<div key={id}>
            <h3>{SR_CATS[id].name}</h3>
            {rows.length ? (<div class="tbl-wrap"><table>
              <thead><tr><th>#</th><th>Игрок</th><th>RTA</th><th>IGT</th><th>Обрывов</th><th>Версия</th><th /></tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} class={r.me ? 'me' : ''}><td>{i + 1}</td><td>{r.name}</td><td>{fmt(r.e.rta * 10)}</td><td>{fmt(r.e.igt * 10)}</td><td>{r.e.deaths}</td><td>{r.e.ver}{version && r.e.ver !== version ? ' ⚠' : ''}</td>
                  <td class="x">{r.friend && <button type="button" class="del" aria-label="Убрать" onClick={() => { friendsSave(friends().filter((x) => x.id !== r.friend!.id)); bump((n) => n + 1); }}>✕</button>}</td></tr>))}</tbody>
            </table></div>) : <div class="lead">Пока пусто: добавьте результаты друзей или пройдите забег сами.</div>}
          </div>);
        })}
      </div>
    </Panel>
  );
}

/** Таймер забега: RTA, IGT, сплиты с дельтой к рекорду, обратный отсчёт. Обновляется 10 раз в секунду. */
export function SrHud({ w, cd, rival }: { w: World; cd?: string; rival?: { text: string; col: string } | null }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 100); return () => clearInterval(id); }, []);
  const r = w.sr; if (!r) return null;
  if (r.done || r.result) return null;
  const big = cd ? <div class={`srcd ${cd.length > 3 ? 'sm' : ''}`} data-testid="sr-cd" role="status">{cd}</div> : null;
  const cat = SR_CATS[r.cat], pb = srStore.rec(r.cat).pb, cur = r.splits.length, time = runRta(r);
  return (
    <>{big}<div class="srhud" data-testid="srhud" aria-live="off">
      <div class={`rta ${r.taint ? 'bad' : r.done ? 'done' : r.t0 == null ? 'wait' : ''}`}>{fmt(time)}</div>
      <div class={`igt ${r.taint ? 'bad' : ''}`}>IGT {fmt(r.igt)}{w.paused ? ' · пауза' : ''}{r.t0 == null && !r.race ? ' · ждём первого шага' : ''}{r.taint ? ' · ВНЕ ЗАЧЁТА' : ''}</div>
      <table class="splits"><tbody>
        {cat.tags.map((tag, i) => {
          const sp = r.splits[i], d = sp && pb && pb.splits[i] ? sp.rta - pb.splits[i]!.rta : null;
          return (<tr key={tag} class={sp ? 'got' : i === cur && !r.done ? 'now' : ''}>
            <td>{i === cur && !r.done ? '▸ ' : '  '}{tag}</td><td>{sp ? fmt(sp.rta) : i === cur ? fmt(time) : '—'}</td><td class={d == null ? '' : d <= 0 ? 'up' : 'down'}>{d == null ? '' : fmtD(d)}</td>
          </tr>);
        })}
      </tbody></table>
      {rival && <div class="srrival" data-testid="sr-rival" style={{ color: rival.col }}>{rival.text}</div>}
    </div></>
  );
}

/** Итоговый экран забега: время, сплиты, личный рекорд, строка для друзей */
export function SrResultScreen({ res, run, version, onAgain, onMenu, onFriends, banner }: { res: SrResult; run: SrRun; version: string; onAgain: () => void; onMenu: () => void; onFriends: () => void; banner?: { text: string; sub: string; col: string } | null }) {
  const [copied, setCopied] = useState<'' | 'ok' | 'no'>('');
  const [armed, setArmed] = useState(false);
  useEffect(() => { const t = setTimeout(() => setArmed(true), 1200); return () => clearTimeout(t); }, []);
  const cat = SR_CATS[res.cat as 'trail' | 'boss'], pb = res.pbPrev as { rta: number; splits: { rta: number }[] } | null;
  const line = res.taint ? '' : text(entryOf({ ...res, ver: res.ver || version }), srStore.name());
  const rec = srStore.rec(res.cat);
  const pbl = res.taint ? `Вне зачёта: ${res.taint}. Рекорд не записан`
    : res.newPb ? (pb ? `Новый личный рекорд! Прошлый: ${fmt(pb.rta)} (${fmtD(res.rta - pb.rta)})` : 'Первый результат в этой категории: личный рекорд установлен')
      : pb ? `Личный рекорд: ${fmt(pb.rta)} (${fmtD(res.rta - pb.rta)})` : '';
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(line); setCopied('ok'); } catch { setCopied('no'); }
    setTimeout(() => setCopied(''), 2500);
  };
  const inRace = !!(run.race || run.rc);
  const onKey = (e: KeyboardEvent): boolean => { if (e.key === 'Enter' && armed) { onMenu(); return true; } if (e.code === 'KeyN' && armed && !inRace) { onAgain(); return true; } return false; };
  return (
    <Panel root={false} crumbs={[cat.name, 'Забег окончен']} onBack={() => { if (armed) onMenu(); }} digits={false} cls="srres" hint={{ act: 'выбрать' }} onKey={onKey} label="Итог забега">
      <div class="st-page res">
        <h2 class="scr-t">{cat.name} · забег окончен</h2>
        <div class={`big ${res.taint ? 'bad' : ''}`} data-testid="sr-total">{fmt(res.rta)}</div>
        <p class="lead">RTA (настенные часы) · IGT {fmt(res.igt)} (без пауз и лавки) · обрывов нити: {res.deaths}</p>
        {banner && <div class="srbanner" data-testid="sr-banner" role="status"><div class="bn" style={{ color: banner.col }}>{banner.text}</div><div class="bs">{banner.sub}</div></div>}
        <p class={`pbline ${res.taint ? 'bad' : res.newPb ? 'good' : ''}`}>{pbl}</p>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Сплит</th><th>RTA</th><th>Сегмент</th><th>IGT</th><th>к рекорду</th></tr></thead>
          <tbody>{res.splits.map((sp, i) => {
            const prev = i ? res.splits[i - 1]!.rta : 0, sg = sp.rta - prev, best = !res.taint && rec.seg[i] === sg, d = pb && pb.splits[i] ? sp.rta - pb.splits[i]!.rta : null;
            return (<tr key={i}><td>{cat.tags[i]}</td><td>{fmt(sp.rta)}</td><td class={best ? 'good' : ''}>{fmt(sg)}{best ? ' ★' : ''}</td><td>{fmt(sp.igt)}</td><td class={d == null ? '' : d <= 0 ? 'up' : 'down'}>{d == null ? '' : fmtD(d)}</td></tr>);
          })}</tbody>
        </table></div>
        {line && <p class="code" data-testid="sr-line">{line}</p>}
        <div class="row">
          {line && <button type="button" class="btn" id="sr-copy" onClick={copy}>{copied === 'ok' ? 'Скопировано!' : copied === 'no' ? 'Выделите и скопируйте строку выше' : 'Скопировать результат'}</button>}
          <button type="button" class="btn" id="sr-friends" onClick={onFriends}>Таблица друзей</button>
          {!inRace && <button type="button" class="btn" id="sr-again" onClick={onAgain}>Ещё раз (N)</button>}
          <button type="button" class="btn primary" id="sr-menu" onClick={onMenu}>В главное меню</button>
        </div>
      </div>
    </Panel>
  );
}
void Item;
