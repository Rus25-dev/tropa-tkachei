import { useEffect, useState } from 'preact/hooks';
import type Phaser from 'phaser';
import type { LaunchParams } from '../app/launch';
import type { InputHub } from '../input/hub';
import type { Shared } from '../view/game';
import { TouchPad } from './TouchPad';

interface Props { hub: InputHub; version: string; build: string; start: (p: LaunchParams) => void; stop: () => void; game: Phaser.Game; shared: Shared }

/** Корень интерфейса поверх холста. Полное меню — этап 4; сейчас: временная панель запуска режимов, версия и сенсорная панель. */
export function App({ hub, version, build, start, stop, game, shared }: Props) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const [touch, setTouch] = useState(coarse || new URLSearchParams(location.search).get('touch') === '1');
  const [inGame, setInGame] = useState(false);
  useEffect(() => {
    const on = () => setTouch(true);
    window.addEventListener('touchstart', on, { once: true, passive: true });
    const sess = () => setInGame(!!shared.session);
    game.events.on('tt:session', sess);
    return () => { window.removeEventListener('touchstart', on); game.events.off('tt:session', sess); };
  }, []);
  const go = (p: LaunchParams) => () => start(p);
  return (
    <>
      <div class="ver" data-testid="version">v{version} · {build}</div>
      {!inGame ? (
        <div class="devmenu" data-testid="devmenu">
          <h1>Тропа Ткачей</h1>
          <button type="button" onClick={go({ kind: 'story' })}>Продолжить</button>
          <button type="button" onClick={go({ kind: 'story', fresh: true })}>Новая игра (глава I)</button>
          <button type="button" onClick={go({ kind: 'story', fresh: true, players: 2 })}>Вдвоём (глава I)</button>
          <button type="button" onClick={go({ kind: 'bosstest', boss: 'misha' })}>Босс-тест: Миша</button>
          <button type="button" onClick={go({ kind: 'bosstest', boss: 'vladik' })}>Босс-тест: Владик</button>
          <button type="button" onClick={go({ kind: 'bosstest', boss: 'tima' })}>Босс-тест: Тима</button>
          <button type="button" onClick={go({ kind: 'boss' })}>Спидран: Босс-раш</button>
          <button type="button" onClick={go({ kind: 'trail' })}>Спидран: Тропа целиком</button>
        </div>
      ) : (
        <button type="button" class="devback" data-testid="menu-back" onClick={stop}>В меню</button>
      )}
      {touch && inGame ? <TouchPad hub={hub} /> : null}
    </>
  );
}
