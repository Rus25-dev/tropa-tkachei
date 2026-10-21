import { h, render } from 'preact';
import { createSession, type LaunchParams } from './app/launch';
import type { Session } from './core/session';
import { applySettings, initLayout } from './app/apply';
import { Online } from './app/online';
import { Races } from './app/races';
import * as jr from './app/journal';
import { loadKeys } from './app/keys';
import { flushRecording } from './app/record';
import { initWatch } from './app/watch';
import { initAgent } from './app/agent';
import { srDuelDefeat, srFinish } from './core/speedrun';
import { settings, sr as srStore } from './app/store';
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
const agentCtl = await initAgent().catch((e) => { console.error('агент:', e); return null; });
const game = createGame(parent, shared);
initLayout();

/** Начать партию (меню, тесты, воспроизведение) */
function start(p: LaunchParams): Session {
  Snd.init(); applySettings();
  const s = createSession(p, version);
  shared.session = s;
  agentCtl?.attach(s);
  game.events.emit('tt:session', s);
  return s;
}
function stop(): void { flushRecording(shared.session); shared.session = null; game.events.emit('tt:session', null); }

(window as unknown as { __tt?: unknown }).__tt = { game, shared, start, stop, agent: agentCtl, debug: { srFinish, srDuelDefeat } };
if (new URLSearchParams(location.search).get('dev') === '1') void import('./ui/devtools').then((m) => m.initDev());
const online = new Online({ version, start });
const races = new Races({ version, start, stop, shared, game, snd: (n) => Snd.play(n) });
shared.ghost = () => races.ghost();
if (agentCtl) { // агент в гонке: имя из ?aname=, сам нажимает «Готов» в комнате; дальше играет по сигналу «пошёл»
  const an = new URLSearchParams(location.search).get('aname'); if (an) srStore.setName(an);
  try { localStorage.removeItem('tt_rc_play'); } catch { /* нет хранилища */ } // свежий вход в комнату, без остатков прошлой гонки
  const stName = new URLSearchParams(location.search).get('aname'), stRid = encodeURIComponent(new URLSearchParams(location.search).get('rid') ?? '');
  if (stName) setInterval(() => { // сводка окна агента для панели обучения (POST на сервер панели): имя, тик, кадры в секунду, босс
    const w = shared.session?.world, b = w ? (w.testBoss() ?? w.boss) : null;
    void fetch('/api/agent-stat?rid=' + stRid, { method: 'POST', body: JSON.stringify({ name: stName, tick: w?.tickN ?? 0, fps: Math.round(game.loop.actualFps), boss: b ? b.state : null, bossFrac: b ? Math.max(0, b.hp) / b.maxHp : null, hp: w?.players[0]?.hp ?? null, ch: w?.camp?.ch ?? 0,
      decisions: agentCtl.stats.decisions, model: agentCtl.stats.boss, at: Date.now() }) }).catch(() => undefined);
  }, 1000);
  setInterval(() => { // гонка 1×1: хозяин выбирает «Босс-раш», оба нажимают «Готов»
    const d = races.duel, q = new URLSearchParams(location.search);
    try { // окна агентов в одном браузере обмениваются кодом комнаты через localStorage: хозяин пишет, гость читает
      if (d && d.role === 'host' && d.code) localStorage.setItem('tt_agent_room', JSON.stringify({ code: d.code, at: Date.now() }));
      if (!d && q.get('race') === 'duel' && q.get('arole') === 'guest' && !q.get('room')) {
        const r = JSON.parse(localStorage.getItem('tt_agent_room') ?? 'null') as { code: string; at: number } | null;
        if (r && Date.now() - r.at < 120_000) { races.openDuel('boss'); races.startDuel('guest', r.code); }
      }
    } catch { /* нет хранилища */ }
    if (d && d.state === 'room' && !d.lost && (d.status === 'online' || d.status === 'open')) {
      if (d.role === 'host' && d.cat !== 'boss') d.setCat('boss');
      else if (!d.me && (d.role === 'guest' ? d.cat === 'boss' : d.peerOnline)) d.toggleReady();
    }
  }, 700);
  setInterval(() => { const pl = races.play; if (pl && pl.code && pl.status === 'online' && pl.state?.phase === 'lobby' && !pl.me) pl.toggleReady(); }, 700);
}
jr.install(() => shared.session);
(window as unknown as { __tt?: Record<string, unknown> }).__tt!['races'] = races;
/** Организатор-автомат для съёмочной площадки (панель обучения): ?race=org&orgauto=1&disc=boss — выбирает дисциплину, стартует, когда готовы двое,
 *  раз в секунду сообщает состояние гонки серверу панели (POST /api/race-state) и выполняет её команды («ещё гонка»). Без панели запросы просто не проходят. */
if (new URLSearchParams(location.search).get('orgauto') === '1') {
  try { localStorage.removeItem('tt_rc_org'); } catch { /* нет хранилища */ } // каждая площадка — новая комната
  const rid = encodeURIComponent(new URLSearchParams(location.search).get('rid') ?? '');
  let want = new URLSearchParams(location.search).get('disc') ?? 'boss';
  let startAt = 0;
  setInterval(() => {
    const org = races.org; const S = org?.S; if (!org || !S) return;
    if (S.phase === 'lobby') {
      if (S.disc !== want) org.setDisc(want);
      else if (org.canStart()) { if (!startAt) startAt = Date.now() + 2500; else if (Date.now() >= startAt) { startAt = 0; org.start(); } } else startAt = 0;
    }
    const seats = org.seatList().map((p) => ({ seat: p.id, name: p.name, online: p.online, ready: p.ready, loaded: p.loaded, sp: p.splits.length, splits: p.splits, fin: p.fin ? { rta: p.fin.rta, deaths: p.fin.deaths } : null, dnf: p.dnf,
      tel: p.tel ? { c: p.tel['c'], s: p.tel['s'], el: p.tel['el'], sp: p.tel['sp'] } : null }));
    const res = S.result ? { winner: S.result.winner, gap: S.result.gap, players: S.result.players.map((r) => ({ name: r.name, time: r.time, dnf: r.dnf, place: r.place })) } : null;
    void fetch('/api/race-state?rid=' + rid, { method: 'POST', body: JSON.stringify({ srv: org.status, code: S.code, phase: S.phase, disc: S.disc, seed: S.seed, elapsed: org.elapsed(), watchers: org.watchers(), seats, result: res, at: Date.now() }) }).catch(() => undefined);
    void fetch('/api/race-cmd?rid=' + rid).then((r) => r.json()).then((cmds: { cmd: string; disc?: string }[]) => {
      for (const c of cmds) { if (c.cmd === 'again') { org.restart(); startAt = 0; } else if (c.cmd === 'disc' && c.disc) { want = c.disc; org.setDisc(c.disc); } }
    }).catch(() => undefined);
  }, 1000);
}

render(h(App, { hub, version, build, start, stop, game, shared, online, races }), ui);
// просмотр записей .ttrec: ?watch=адрес, перетаскивание файла, «Настройки → Игра → Открыть запись…»
initWatch({ version, game, end: stop, begin: (s) => { Snd.init(); applySettings(); shared.session = s; game.events.emit('tt:session', s); } });
