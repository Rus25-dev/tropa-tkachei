import { useEffect, useRef, useState } from 'preact/hooks';
import type Phaser from 'phaser';
import type { LaunchParams } from '../app/launch';
import { mapCanOpen } from '../core/maptravel';
import type { Online } from '../app/online';
import type { Session } from '../core/session';
import type { InputHub } from '../input/hub';
import type { Shared } from '../view/game';
import { Snd } from '../view/audio/snd';
import { Bench, Gear, MapTravel, Pause, Shop, TrainHud, Win, useTick, type WinSummary } from './ingame';
import { Menu, type MenuCtl } from './menus';
import { SrHud, SrResultScreen, Friends } from './speedrun';
import { TouchPad } from './TouchPad';
import { UpdateBanner } from './Update';
import { anyPanel, initNav, setDevice, topPanel } from './nav';
import { useDevice } from './kit';

interface Props { hub: InputHub; version: string; build: string; start: (p: LaunchParams) => Session; stop: () => void; game: Phaser.Game; shared: Shared; online: Online; extra?: Partial<MenuCtl> }
interface UiEvent { k: string; [key: string]: unknown }

/** Корень интерфейса поверх холста: меню, внутриигровые окна, сенсорная панель, подсказки поворота и iPhone */
export function App({ hub, version, build, start, stop, game, shared, online: net, extra }: Props) {
  const [touch, setTouch] = useState(shared.touch);
  const [ses, setSes] = useState<Session | null>(shared.session);
  const [win, setWin] = useState<WinSummary | null>(null);
  const [gear, setGear] = useState(false);
  const [friends, setFriends] = useState(false);
  const last = useRef<LaunchParams>({ kind: 'story' });
  const dev = useDevice();
  useTick(100); // состояние мира опрашиваем ~10 раз в секунду
  useEffect(() => {
    const onTouch = (): void => { setTouch(true); setDevice('touch'); };
    window.addEventListener('touchstart', onTouch, { once: true, passive: true });
    const onSess = (s: Session | null): void => { setSes(s); setWin(null); setGear(false); };
    game.events.on('tt:session', onSess);
    const onUi = (e: UiEvent): void => {
      if (e.k === 'victory') setWin(e['s'] as WinSummary);
      else if (e.k === 'worldReady') { setWin(null); setGear(false); }
      else if (e.k === 'gearOpen') setGear(true);
      else if (e.k === 'pauseKey') pauseKey();
      else if (e.k === 'mapKey') mapKey();
    };
    game.events.on('tt:ui', onUi);
    const offNav = initNav();
    return () => { window.removeEventListener('touchstart', onTouch); game.events.off('tt:session', onSess); game.events.off('tt:ui', onUi); offNav(); };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('touch', touch); }, [touch]);

  const s = ses, w = s?.world ?? null;
  const online = !!w?.online;
  const sess = () => shared.session;
  /** клавиши и геймпад игры замирают, пока на экране есть панель */
  useEffect(() => {
    let raf = 0;
    const loop = (): void => { raf = requestAnimationFrame(loop); hub.keyboard.enabled = !anyPanel(); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  // кнопки паузы и карты (клавиатура, геймпад, касание)
  function pauseKey(): void {
    const cur = sess(); if (!cur) return;
    const cw = cur.world, top = topPanel(), lbl = top?.el.getAttribute('aria-label');
    if (top && lbl !== 'Пауза' && lbl !== 'Скамья' && lbl !== 'Карта') return; // сверху настройки, снаряжение и т. п.: пауза их не закрывает
    if (cw.benchMenuOpen) { cur.benchClose(); return; }
    if (cw.mt.open) { cur.mapClose(); return; }
    if (cw.shopOpen || cw.mt.busy || cw.won) return;
    cur.togglePause();
  }
  function mapKey(): void {
    const cur = sess(); if (!cur) return;
    const cw = cur.world;
    if (cw.mt.open) cur.mapClose(); else if (mapCanOpen(cw)) cur.mapShow();
  }
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      const cur = sess(); if (!cur || anyPanel()) return;
      if (e.defaultPrevented) return;
      const cw = cur.world;
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); pauseKey(); }
      else if (e.code === 'Tab' || (e.code === 'KeyM' && cw.nPlayers === 1)) { if (!e.repeat) { e.preventDefault(); mapKey(); } }
      else if (e.code === 'KeyY' && cw.train && !e.repeat) cur.trainReset();
    };
    window.addEventListener('keydown', k);
    // автопауза: вкладку свернули или переключились в другое приложение; поворот телефона в «портрет» тоже пауза
    const vis = (): void => { const cur = sess(); if (document.hidden && cur && !cur.world.online && !cur.world.paused && !cur.world.won && !cur.sr) cur.togglePause(); };
    const bye = (): void => net.bye();
    window.addEventListener('pagehide', bye);
    document.addEventListener('visibilitychange', vis);
    const mq = matchMedia('(orientation: portrait)');
    const ori = (): void => { const cur = sess(); if (mq.matches && cur && document.documentElement.classList.contains('touch') && !cur.world.paused && !cur.world.won && !cur.sr) cur.togglePause(); };
    mq.addEventListener('change', ori);
    return () => { window.removeEventListener('keydown', k); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', bye); mq.removeEventListener('change', ori); };
  }, []);

  const launch = (p: LaunchParams): void => { Snd.init(); last.current = p; start(p); };
  const exit = (): void => { net.leave(); stop(); };
  net.onHostLost = () => { sess()?.world.toast('Хост отключился. Возвращаемся в меню…', 2.5); setTimeout(() => { if (shared.session) exit(); }, 2800); };
  const retry = (): void => {
    const cur = sess(); if (!cur) return;
    if (cur.sr) { launch({ kind: cur.sr.cat }); return; }
    cur.retry();
  };
  const ctl: MenuCtl = { version, build, launch, online: net, ...extra };
  const room = useRef(new URLSearchParams(location.search).get('room'));
  const initial = room.current ? [{ id: 'main' }, { id: 'lobby', ctx: { role: 'join', mode: 'story', fresh: false, code: room.current } }] : undefined;
  useEffect(() => { if (room.current) { const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u.toString()); } }, []);
  if (s && room.current) room.current = null; // ссылка с кодом использована один раз: после выхода из игры меню обычное

  // ----- что показывать в игре -----
  const paused = !!w && (w.paused || w.uiPause) && !w.benchMenuOpen && !w.shopOpen && !w.mt.open && !w.mt.busy && !w.won && !(w.sr && w.sr.tp != null);
  const srRes = w?.sr?.result ?? null;
  const anyOverlay = !!w && (paused || !!w.benchMenuOpen || w.shopOpen || w.mt.open || gear || !!win || !!srRes || friends);
  const padMode = dev === 'pad';
  return (
    <>
      {s && <div class="ver" data-testid="version">v{version} · {build}</div>}
      {!s && <Menu ctl={ctl} initial={initial} />}
      {s && w && (<>
        {w.sr && <SrHud w={w} />}
        {w.train && <TrainHud w={w} />}
        {touch && <TouchPad hub={hub} tool={!!w.players[0]?.['toolId']} bombs={!!w.L.crates} hidden={anyOverlay || padMode || !!w.won} padMode={padMode} showMap={!!w.mapV}
          onPause={() => pauseKey()} onMap={() => mapKey()} />}
        {paused && <Pause ses={s} online={online} onRetry={retry} onExit={exit} openGear={() => setGear(true)} />}
        {w.benchMenuOpen && <Bench ses={s} />}
        {w.shopOpen && <Shop ses={s} />}
        {w.mt.open && <MapTravel ses={s} />}
        {gear && <Gear ses={s} onClose={() => setGear(false)} />}
        {win && !srRes && <Win ses={s} s={win} online={online} onNext={(next) => { setWin(null); s.campGo(next); }} onRetry={retry} onExit={exit} />}
        {srRes && w.sr && !friends && <SrResultScreen res={srRes} run={w.sr} version={version} onAgain={retry} onMenu={exit} onFriends={() => setFriends(true)} />}
        {srRes && friends && <Friends crumbs={['Забег']} onBack={() => setFriends(false)} last={srRes} version={version} />}
      </>)}
      <div id="rotate" role="alert"><div><div class="ph" /><h3>Поверните телефон</h3><p>Игра идёт в горизонтальном положении. Пауза включена.</p></div></div>
      <IosTip />
      <UpdateBanner build={build} />
    </>
  );
}

/** Подсказка для iPhone: у сайтов нет полного экрана, зато игру можно поставить на экран «Домой» */
function IosTip() {
  const ios = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  const seen = (() => { try { return localStorage.getItem('tt_ios_tip') === '1'; } catch { return false; } })();
  const [show, setShow] = useState(false);
  useEffect(() => { if (ios && !standalone && !seen) { const t = setTimeout(() => setShow(true), 1200); return () => clearTimeout(t); } return undefined; }, []);
  if (!show) return null;
  return (
    <div id="ios-tip" role="dialog" aria-label="Без панелей Safari"><div class="card"><h4>Без панелей Safari</h4>
      <p>На iPhone браузер не даёт сайтам открываться на весь экран. Зато игру можно поставить как приложение: нажмите «Поделиться» → «На экран „Домой“». Тогда она откроется без панелей, как обычное приложение.</p>
      <button type="button" class="btn primary" onClick={() => { setShow(false); try { localStorage.setItem('tt_ios_tip', '1'); } catch { /* нет доступа */ } }}>Понятно</button></div></div>
  );
}
