import { h, render } from 'preact';
import { InputHub } from './input/hub';
import { App } from './ui/App';
import './ui/styles.css';
import { createGame } from './view/game';

const hub = new InputHub();
const version = __APP_VERSION__, build = __APP_BUILD__;
const parent = document.getElementById('game');
const ui = document.getElementById('ui');
if (!parent || !ui) throw new Error('Не найдены #game и #ui в index.html');
createGame(parent, { hub, version, build });
render(h(App, { hub, version, build }), ui);
