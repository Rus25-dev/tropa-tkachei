// Главное меню и его экраны (карта как в v1.8): Продолжить · Кампания · Босс-тест · Спидран · Гонки Ткачей · Как играть · Настройки.
// Навигация — стек экранов с хлебными крошками; «← Назад», Esc и кнопка B возвращают на уровень выше.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CHAPTERS, SR_CATS } from '../core/balance';
import { freshCamp, freshUp, type CampState } from '../core/campaign';
import { fixRules, fmt, violation, SR_ABOUT } from '../app/speedrun';
import { menuPlayers, progress, records, setMenuPlayers, sr as srStore, training } from '../app/store';
import type { LaunchParams } from '../app/launch';
import { HowTo, Changelog, type HowSection } from './howto';
import { Item, Panel, Screen } from './kit';
import { Friends } from './speedrun';
import { Settings } from './settings';
import { padNames } from './nav';

export const BOSSES = [
  { id: 'misha', name: 'Миша Додик', about: 'Швыряется печатными буквами. Бей дымовыми бомбами в рюкзак.' },
  { id: 'vladik', name: 'Владик Скрипка', about: 'Кидает скрипичные ключи и мажет шторы слизью. Бей иглой.' },
  { id: 'tima', name: 'Тима Пиво', about: 'Пиво, банкротство, приставка и волшебная пыль. Бей иглой.' },
];
const fmtMin = (s: number): string => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const recLine = (id: string): string => {
  const r = records.get(id);
  return r.tries ? `Попыток: ${r.tries} · побед: ${r.wins}` + (r.best ? ` · лучшее время: ${fmtMin(r.best)}` : '') : 'Ещё не пробовали';
};

/** Что меню умеет вызвать снаружи (запуск игры, сеть, гонки) */
export interface MenuCtl {
  version: string; build: string;
  launch(p: LaunchParams): void;
  /** сетевая комната: coop-кампания / coop-босс / гонка 1×1 */
  net?(mode: 'story' | 'bosstest' | 'race', camp?: CampState | null, boss?: string): void;
  /** пункты «Гонки Ткачей»: организатор, игрок, обсервер, архив */
  racesItems?(): { label: string; sub?: string; act: () => void; disabled?: boolean }[];
  racesInfo?(): string[];
}

interface Entry { id: string; ctx?: Record<string, unknown> }
const chapterCamp = (ch: number): CampState => {
  const p = progress.get();
  return { ch, st: ch === 1 ? 'level' : 'road', beads: ch === 1 ? 0 : (p?.beads ?? 0) | 0, abil: ch === 1 ? {} : { ...(p?.abil ?? {}) }, up: { ...freshUp(), ...(p?.up ?? {}) }, time: 0, deaths: 0 };
};
const subtitle = (): string => { const p = progress.get(), c = p && CHAPTERS[p.chapter ?? 1]; return c ? `Глава ${c.roman} · ${c.name}` : 'Глава I · Мшистая Глубь'; };

let pickIdx = 0;

export function Menu({ ctl, initial }: { ctl: MenuCtl; initial?: Entry[] }) {
  const [stack, setStack] = useState<Entry[]>(initial ?? [{ id: 'main' }]);
  const top = stack[stack.length - 1]!;
  const go = (id: string, ctx?: Record<string, unknown>): void => setStack((s) => [...s, { id, ctx }]);
  const back = (): void => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const crumbs = stack.slice(1).map((e) => CRUMB[e.id]?.(e.ctx ?? {}) ?? e.id).filter((c, i, a) => !i || c !== a[i - 1]);
  // сообщить тестам и приложению, где мы
  useEffect(() => { document.documentElement.dataset['menu'] = top.id; }, [top.id]);
  const ctx = top.ctx ?? {};
  const p = { ctl, go, back, crumbs, ctx };
  switch (top.id) {
    case 'campaign': return <Campaign {...p} />;
    case 'newgame': return <NewGame {...p} />;
    case 'chapters': return <Chapters {...p} />;
    case 'mode': return <Mode {...p} />;
    case 'net': return <Net {...p} />;
    case 'bosstest': return <BossTest {...p} />;
    case 'speedrun': return <Speedrun {...p} />;
    case 'srcat': return <SrCat {...p} />;
    case 'friends': return <Friends crumbs={['Спидран']} onBack={back} last={null} />;
    case 'races': return <Races {...p} />;
    case 'howto': return <HowTo crumbs={crumbs.slice(0, -1)} section={ctx['section'] as HowSection | undefined} onBack={back} />;
    case 'changelog': return <Changelog version={ctl.version} build={ctl.build} crumbs={crumbs.slice(0, -1)} onBack={back} />;
    case 'settings': return <Settings crumbs={crumbs.slice(0, -1)} section={ctx['section'] as string | undefined} onBack={back} />;
    default: return <Main {...p} />;
  }
}

const CRUMB: Record<string, (c: Record<string, unknown>) => string> = {
  campaign: () => 'Кампания', newgame: () => 'Новая игра', chapters: () => 'Глава', mode: (c) => (c['crumb'] as string) || 'Режим', net: () => 'По сети',
  bosstest: () => 'Босс-тест', speedrun: () => 'Спидран', srcat: (c) => SR_CATS[c['cat'] as 'trail' | 'boss'].name, friends: () => 'Таблица друзей',
  races: () => 'Гонки Ткачей', howto: () => 'Как играть', changelog: () => 'Что нового', settings: () => 'Настройки',
};
interface P { ctl: MenuCtl; go: (id: string, ctx?: Record<string, unknown>) => void; back: () => void; crumbs: string[]; ctx: Record<string, unknown> }

function Dim({ children }: { children: ComponentChildren }) { return <p class="dim">{children}</p>; }

function Main({ ctl, go }: P) {
  const pr = progress.get();
  const players = menuPlayers();
  // N — «Что нового» (клавиатура), X — геймпад
  useEffect(() => {
    const k = (e: KeyboardEvent): void => { if (e.code === 'KeyN' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target as HTMLElement | null)?.matches?.('input,textarea')) go('changelog'); };
    window.addEventListener('keydown', k);
    let raf = 0, was = false;
    const loop = (): void => { raf = requestAnimationFrame(loop); const p = navigator.getGamepads?.()[0]; const x = !!p?.buttons[2]?.pressed; if (x && !was) go('changelog'); was = x; };
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('keydown', k); cancelAnimationFrame(raf); };
  }, []);
  return (
    <Panel root hint={{ nums: 7, extra: { kb: 'N — что нового', pad: `${padNames().x} — что нового` } }} label="Главное меню"
      aside={<div class="topline">
        <span class="ver-line" data-testid="menu-version"><span class="long">Версия </span>{ctl.version}<span class="long"> · сборка </span><span class="short"> · </span>{ctl.build}</span>
        <button type="button" class="link" data-testid="open-changelog" onClick={() => go('changelog')}>Что нового ›</button>
      </div>}>
      <Screen hero={<div class="hero"><h1 class="logo">ТРОПА ТКАЧЕЙ</h1><div class="subtitle">{subtitle()}</div></div>}>
        {pr && <Item n={1} id="m-continue" label="Продолжить" sub={(pr.name || 'скамья') + (players === 2 ? ' · вдвоём' : '')} onClick={() => ctl.launch({ kind: 'story', players })} />}
        <Item n={2} id="m-campaign" label="Кампания" sub="новая игра, главы, вдвоём" onClick={() => go('campaign')} />
        <Item n={3} id="m-bosstest" label="Босс-тест" sub="три босса, тренировка, рекорды" onClick={() => go('bosstest')} />
        <Item n={4} id="m-speedrun" label="Спидран" sub="Тропа целиком, Босс-раш, гонка 1×1" onClick={() => go('speedrun')} />
        <Item n={5} id="m-races" label="Гонки Ткачей" sub="организатор, игрок, обсервер" onClick={() => go('races')} />
        <Item n={6} id="m-howto" label="Как играть" sub="управление, приёмы, боссы" onClick={() => go('howto')} />
        <Item n={7} id="m-settings" label="Настройки" sub="звук, экран, управление, игра" onClick={() => go('settings')} />
      </Screen>
    </Panel>
  );
}

function Campaign({ go, back, crumbs }: P) {
  const p = progress.get(), best = p ? Math.max((p.best ?? 0) | 0, (p.chapter ?? 0) | 0) : 0;
  return (
    <Panel crumbs={crumbs} onBack={back} hint={{ nums: 2 }} label="Кампания">
      <Screen title="Кампания" info={<><p>Четыре главы: Корнематка, Миша, Владик, Тима. Прогресс сохраняется на скамьях.</p><Dim>{p ? 'Сохранение: ' + (p.name || 'скамья') : 'Сохранения пока нет.'}</Dim></>}>
        <Item n={1} id="c-new" label="Новая игра" sub={p ? 'с главы I; старое сохранение заменится позже' : 'с главы I'} onClick={() => (progress.get() ? go('newgame') : go('mode', { camp: freshCamp(), crumb: 'Новая игра', fresh: true }))} />
        <Item n={2} id="c-chapters" label="Выбрать главу" sub={best >= 2 ? 'пройденные главы' : 'откроется после главы I'} disabled={best < 2} onClick={() => go('chapters')} />
      </Screen>
    </Panel>
  );
}

function NewGame({ go, back, crumbs }: P) {
  const p = progress.get();
  return (
    <Panel crumbs={crumbs} onBack={back} hint={{ nums: 2 }} label="Начать заново?">
      <Screen title="Начать заново?" info={<><p>Сейчас сохранено: {p?.name || 'скамья'}.</p><p>Старое сохранение останется, пока вы не сядете на первую скамью новой игры: тогда оно заменится.</p></>}>
        <Item n={1} id="ng-yes" danger label="Да, начать заново" sub="бусины и улучшения с нуля" onClick={() => go('mode', { camp: freshCamp(), crumb: 'Новая игра', fresh: true })} />
        <Item n={2} id="ng-no" label="Нет, назад" onClick={back} />
      </Screen>
    </Panel>
  );
}

function Chapters({ go, back, crumbs }: P) {
  const p = progress.get(), best = Math.max(p?.best ?? 0, p?.chapter ?? 0, 1) | 0;
  return (
    <Panel crumbs={crumbs} onBack={back} hint={{ nums: best }} label="Выбор главы">
      <Screen title="Выбор главы" info={<p>Можно переиграть любую пройденную главу. Сохранение продолжится с неё, но открытые главы не потеряются.</p>}>
        {Object.keys(CHAPTERS).map(Number).filter((ch) => ch <= best).map((ch) => {
          const c = CHAPTERS[ch]!;
          return <Item key={ch} n={ch} id={`ch-${ch}`} label={`Глава ${c.roman} · ${c.name}`} sub={ch === 1 ? 'Корнематка' : `${c.road} → ${BOSSES.find((b) => b.id === c.boss)?.name ?? ''}`} onClick={() => go('mode', { camp: chapterCamp(ch), crumb: `Глава ${c.roman}` })} />;
        })}
      </Screen>
    </Panel>
  );
}

function Mode({ ctl, go, back, crumbs, ctx }: P) {
  const camp = ctx['camp'] as CampState, fresh = !!ctx['fresh'];
  const play = (n: 1 | 2): void => { setMenuPlayers(n); ctl.launch({ kind: 'story', players: n, camp, fresh }); };
  return (
    <Panel crumbs={crumbs} onBack={back} hint={{ nums: 3 }} label="Как играем?">
      <Screen title="Как играем?" info={<><p>Выберите, с кем идёте по Тропе.</p><Dim>Вдвоём по сети: один создаёт комнату и присылает код, второй входит по коду.</Dim></>}>
        <Item n={1} id="md-one" label="Один ткач" sub="клавиатура или геймпад" onClick={() => play(1)} />
        <Item n={2} id="md-two" label="Двое за одним компьютером" sub="игрок 2 — на стрелках" onClick={() => play(2)} />
        <Item n={3} id="md-net" label="Вдвоём по сети" sub="создать комнату или войти по коду" onClick={() => go('net', { mode: 'story', camp })} />
      </Screen>
    </Panel>
  );
}

function Net({ ctl, back, crumbs, ctx }: P) {
  const mode = ctx['mode'] as 'story' | 'bosstest', camp = ctx['camp'] as CampState | undefined, boss = ctx['boss'] as string | undefined;
  const ready = !!ctl.net;
  return (
    <Panel crumbs={crumbs} onBack={back} hint={{ nums: 2 }} label="Вдвоём по сети">
      <Screen title="Вдвоём по сети" info={<><p>Соединение идёт напрямую между браузерами (PeerJS). Порты и белый IP не нужны.</p>{!ready && <Dim>Сетевая игра подключается на этапе 5 переноса.</Dim>}</>}>
        <Item n={1} id="net-host" label="Создать комнату" sub="пришлите другу код или ссылку" disabled={!ready} onClick={() => ctl.net?.(mode, camp, boss)} />
        <Item n={2} id="net-join" label="Войти по коду" sub="код из пяти символов от друга" disabled={!ready} onClick={() => ctl.net?.(mode, camp, boss)} />
      </Screen>
    </Panel>
  );
}

function BossTest({ ctl, go, back, crumbs }: P) {
  const [sel, setSel] = useState(pickIdx);
  const [, bump] = useState(0);
  const pick = (k: number): void => { pickIdx = (k + BOSSES.length) % BOSSES.length; setSel(pickIdx); };
  const b = BOSSES[sel]!;
  const cardsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardsRef.current; if (!el) return;
    const h = (e: Event): void => { const k = (pickIdx + (e as CustomEvent<number>).detail + BOSSES.length) % BOSSES.length; pick(k); el.querySelectorAll<HTMLElement>('.card')[k]?.focus({ preventScroll: true }); };
    el.addEventListener('lr', h); return () => el.removeEventListener('lr', h);
  }, []);
  const toggleTrain = (): void => { training.on = !training.on; training.save(); bump((n) => n + 1); };
  const phase = (d = 1): void => { if (!training.on) training.on = true; else training.phase = ((training.phase - 1 + d + 3) % 3) + 1; training.save(); bump((n) => n + 1); };
  const play = (n: 1 | 2): void => ctl.launch({ kind: 'bosstest', boss: b.id, players: n, train: training.on, trainPhase: training.phase });
  const onKey = (e: KeyboardEvent): boolean => {
    if (e.code === 'KeyT' && !e.repeat) { toggleTrain(); return true; }
    if (e.code === 'KeyP' && !e.repeat) { phase(); return true; }
    return false;
  };
  return (
    <Panel crumbs={crumbs} onBack={back} onKey={onKey} hint={{ nums: 5, lr: 'менять', extra: { kb: 'T — тренировка, P — фаза' } }} label="Босс-тест">
      <Screen title="Босс-тест" info={<>
        <h3 class="boss-name">{b.name}</h3><p>{b.about}</p><p class="rec">{recLine(b.id)}</p>
        <Dim>{training.on ? `Тренировка: бесконечное здоровье, счётчик урона и DPS, сброс босса клавишей Y. Старт с фазы ${training.phase}. Рекорды не пишутся.` : 'Бой сразу с выбранным боссом.'}</Dim>
      </>}>
        <div class="cards" role="radiogroup" aria-label="Босс" ref={cardsRef}>
          {BOSSES.map((x, k) => {
            const r = records.get(x.id);
            return (<button type="button" key={x.id} role="radio" aria-checked={k === sel} class={`card ${k === sel ? 'sel' : ''}`} data-testid={`boss-${x.id}`} data-lr="1" onFocus={() => pick(k)} onClick={() => pick(k)}>
              <span class="cn">{x.name}</span><span class="cr">{r.best ? 'рекорд ' + fmtMin(r.best) : 'нет рекорда'}</span>
            </button>);
          })}
        </div>
        <Item n={1} id="bt-one" label="Один ткач" sub="в бой сразу" onClick={() => play(1)} />
        <Item n={2} id="bt-two" label="Двое за одним компьютером" onClick={() => play(2)} />
        <Item n={3} id="bt-net" label="Вдвоём по сети" sub={training.on ? 'в тренировке — только вдвоём у одного компьютера' : 'создать комнату или войти по коду'} disabled={training.on} onClick={() => go('net', { mode: 'bosstest', boss: b.id })} />
        <Item n={4} id="bt-train" label="Тренировка" sub="здоровье бесконечное, счётчик урона" value={training.on ? 'вкл' : 'выкл'} onClick={toggleTrain} onLR={() => toggleTrain()} />
        <Item n={5} id="bt-phase" label="Старт с фазы" sub={training.on ? 'только в тренировке' : 'включит тренировку'} value={String(training.phase)} onClick={() => phase()} onLR={(d) => phase(d)} />
      </Screen>
    </Panel>
  );
}

function Speedrun({ go, back, crumbs }: P) {
  const rl = (id: string): string => { const pb = srStore.rec(id).pb; return pb ? 'рекорд ' + fmt(pb.rta) : 'рекорда пока нет'; };
  return (
    <Panel crumbs={crumbs} onBack={back} hint={{ nums: 3 }} label="Спидран">
      <Screen title="Спидран" info={<><p>Забег на время: RTA идёт с первого шага до последнего удара финального босса, пауза останавливает только игровое время (IGT).</p><Dim>Обычное сохранение и рекорды боссов в забеге не затрагиваются. Лёгкий режим и замедление игры запрещены.</Dim></>}>
        <Item n={1} id="sr-trail" label={SR_CATS.trail.name} sub={rl('trail')} onClick={() => go('srcat', { cat: 'trail' })} />
        <Item n={2} id="sr-boss" label={SR_CATS.boss.name} sub={rl('boss')} onClick={() => go('srcat', { cat: 'boss' })} />
        <Item n={3} id="sr-friends" label="Мои рекорды и таблица друзей" sub="результаты друзей по коду" onClick={() => go('friends')} />
      </Screen>
    </Panel>
  );
}

function SrCat({ ctl, go, back, crumbs, ctx }: P) {
  const [, bump] = useState(0);
  const cat = ctx['cat'] as 'trail' | 'boss', rec = srStore.rec(cat), pb = rec.pb, bad = violation().length > 0;
  const best = rec.seg.length === 4 && rec.seg.every(Boolean) ? rec.seg.reduce((a, b) => a + b, 0) : 0;
  return (
    <Panel crumbs={crumbs} onBack={back} hint={{ nums: bad ? 4 : 3 }} label={SR_CATS[cat].name}>
      <Screen title={SR_CATS[cat].name} info={<>
        <p>{SR_ABOUT[cat]}</p>
        <p class="rec">{pb ? <>Личный рекорд: {fmt(pb.rta)} (IGT {fmt(pb.igt)}, обрывов {pb.deaths}, v{pb.ver})<br />Сплиты: {pb.splits.map((x) => fmt(x.rta)).join('  ')}{best ? <><br />Сумма лучших сегментов: {fmt(best)}</> : null}</> : 'Личного рекорда пока нет.'}</p>
        <Dim>Лёгкий режим: {violation().includes('Лёгкий режим') ? 'ВКЛЮЧЁН — запрещено' : 'выключен'}<br />Замедление игры: {violation().some((v) => v.startsWith('Замедление')) ? 'включено — запрещено' : '100 %'}</Dim>
      </>}>
        <Item n={1} id="sc-solo" label="Забег в одиночку" sub={bad ? 'сначала отключите запрещённые настройки' : 'с нуля, таймер ждёт первого шага'} disabled={bad} onClick={() => ctl.launch({ kind: cat })} />
        <Item n={2} id="sc-race" label="Гонка 1×1 с другом" sub={bad ? 'сначала отключите запрещённые настройки' : 'по сети: комната с кодом'} disabled={bad || !ctl.net} onClick={() => ctl.net?.('race')} />
        <Item n={3} id="sc-friends" label="Мои рекорды и таблица друзей" sub="результаты друзей по коду" onClick={() => go('friends')} />
        {bad && <Item n={4} id="sc-fix" danger label="Отключить запрещённые настройки" sub="лёгкий режим и замедление" onClick={() => { fixRules(); bump((n) => n + 1); }} />}
      </Screen>
    </Panel>
  );
}

function Races({ ctl, back, crumbs }: P) {
  const items = ctl.racesItems?.() ?? [
    { label: 'Создать гонку', sub: 'скоро в этой сборке', act: () => undefined, disabled: true },
    { label: 'Войти игроком по коду', sub: 'скоро в этой сборке', act: () => undefined, disabled: true },
    { label: 'Обсервер', sub: 'скоро в этой сборке', act: () => undefined, disabled: true },
    { label: 'Архив гонок', sub: 'скоро в этой сборке', act: () => undefined, disabled: true },
  ];
  const info = ctl.racesInfo?.() ?? ['Соревнование для двоих: организатор создаёт гонку, два игрока играют у себя, обсервер показывает обоих сразу.'];
  return (
    <Panel crumbs={crumbs} onBack={back} hint={{ nums: items.length }} label="Гонки Ткачей">
      <Screen title="Гонки Ткачей" info={<>{info.map((t) => <p key={t}>{t}</p>)}</>}>
        {items.map((it, i) => <Item key={it.label} n={i + 1} id={`rc-${i + 1}`} label={it.label} sub={it.sub} disabled={it.disabled} onClick={it.act} />)}
      </Screen>
    </Panel>
  );
}
