import { h, render } from 'preact';
import { createSession, type LaunchParams } from './app/launch';
import type { Session } from './core/session';
import { applySettings, initLayout } from './app/apply';
import { Online } from './app/online';
import { loadKeys } from './app/keys';
import { srFinish } from './core/speedrun';
import { settings } from './app/store';
import { Snd } from './view/audio/snd';
import { InputHub } from './input/hub';
import { App } from './ui/App';
import './ui/styles.css';
import { type Shared, createGame } from './view/game';

loadKeys();
const hub = new InputHub();
const version = __APP_VERSION__, build = __APP_BUILD__;
const parent = document.getElementById('game');
const ui = document.getElementById('ui');
if (!parent || !ui) throw new Error('Не найдены #game и #ui в index.html');

const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const shared: Shared = {
  hub, version, build, session: null,
  touch: coarse || new URLSearchParams(location.search).get('touch') === '1',
  accessSpeed: () => (settings.s.speed || 100) / 100,
  gfx: () => ({ shake: settings.s.shake, noflash: settings.s.noflash, outl: settings.s.outl, vibro: settings.s.vibro, quality: settings.s.gfx, perf: new URLSearchParams(location.search).get('perf') === '1' }),
};
const game = createGame(parent, shared);
initLayout();

/** Начать партию (меню, тесты, воспроизведение) */
function start(p: LaunchParams): Session {
  Snd.init(); applySettings();
  const s = createSession(p, version);
  shared.session = s;
  game.events.emit('tt:session', s);
  return s;
}
function stop(): void { shared.session = null; game.events.emit('tt:session', null); }

(window as unknown as { __tt?: unknown }).__tt = { game, shared, start, stop, debug: { srFinish } };
if (new URLSearchParams(location.search).get('dev') === '1') void import('./ui/devtools').then((m) => m.initDev());
const online = new Online({ version, start });
render(h(App, { hub, version, build, start, stop, game, shared, online }), ui);
