import { h, render } from 'preact';
import { createSession, type LaunchParams } from './app/launch';
import { settings } from './app/store';
import { Music } from './view/audio/music';
import { Snd } from './view/audio/snd';
import { InputHub } from './input/hub';
import { App } from './ui/App';
import './ui/styles.css';
import { type Shared, createGame } from './view/game';

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
  gfx: () => ({ shake: settings.s.shake, noflash: settings.s.noflash, outl: settings.s.outl, quality: settings.s.gfx, perf: new URLSearchParams(location.search).get('perf') === '1' }),
};
const game = createGame(parent, shared);

/** Начать партию (меню, тесты, воспроизведение) */
function start(p: LaunchParams): void {
  Snd.init(); Snd.setVolume(settings.s.vol); Music.setVolume(settings.s.mvol);
  shared.session = createSession(p, version);
  game.events.emit('tt:session', shared.session);
}
function stop(): void { shared.session = null; game.events.emit('tt:session', null); }

(window as unknown as { __tt?: unknown }).__tt = { game, shared, start, stop };
render(h(App, { hub, version, build, start, stop, game, shared }), ui);
