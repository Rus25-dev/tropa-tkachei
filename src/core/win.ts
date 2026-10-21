// Победа сцены (legacy/src/game.js win + обёртка спидрана из speedrun.js).
import type { World } from './world';
import { decorate, preWin } from './campaign';
import { srAdvance, srOnSplit } from './speedrun';

/** победа: в забеге экрана победы нет — сплит и переход дальше (speedrun.js), иначе экран победы или переход в арену */
export function winGame(sc: World): void {
  const r = sc.sr;
  if (r && !sc.won && !(sc.camp && sc.camp.st === 'road')) {
    if (!r.done && sc.camp && sc.camp.ch >= 4) srOnSplit(sc);
    if (r.done) { sc.won = true; sc.emit('srResult'); return; }
    srAdvance(sc); return;
  }
  winBase(sc);
}
function winBase(sc: World): void {
  if (preWin(sc)) return;
  sc.won = true; sc.snd('win');
  const s: Record<string, unknown> = { time: sc.timeSec, beads: sc.beads, deaths: sc.deaths, players: sc.nPlayers };
  if (sc.mode === 'bosstest') {
    if (sc.vladik) { s['title'] = 'Владик Скрипка повержен'; s['hits'] = sc.needleHits; }
    else if (sc.tima) { s['title'] = 'Тима Пиво повержен'; s['hits'] = sc.timaHits; }
    else { s['title'] = 'Миша Додик повержен'; s['bag'] = sc.bagHits; }
  }
  decorate(sc, s);
  sc.sendEv({ k: 'win', s });
  sc.emit('victory', { s });
}
