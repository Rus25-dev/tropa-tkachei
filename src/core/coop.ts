// Кооператив и скамьи: меню скамьи, оживление напарника, поводок, названия областей (legacy/src/game.js stepCoop + ingame.js benchOpen/benchClose).
import { T } from './balance';
import type { Player } from './types';
import type { World } from './world';
import { benchRest } from './combat';
import { openShop } from './campaign';
import { mapShow } from './maptravel';

export const areaOf = (sc: World, tx: number): { x: number; name: string } => sc.L.areas.reduce((a, ar) => (tx >= ar.x ? ar : a), sc.L.areas[0]!);

type Bench = { x: number; y: number; near?: boolean };

export function stepCoop(sc: World, dt: number): void {
  // скамьи
  for (const b of sc.benches as Bench[]) {
    let near = false;
    for (const p of sc.players) {
      if (p.downed || p.remote) continue;
      if (Math.abs(p.x + 7 - b.x) < 30 && Math.abs(p.y + 26 - b.y) < 12) {
        near = !p.sit;
        if (p.inp.upP && p.onGround && !p.sit && !sc.benchMenuOpen) benchOpen(sc, p, b);
      }
    }
    b.near = near;
  }
  // оживление
  for (const p of sc.players) {
    if (!p.downed || p.remote || sc.wiping) continue;
    let helping = false;
    for (const q of sc.players) {
      if (q === p || q.downed) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) < 52 && q.inp.up && q.onGround) helping = true;
    }
    p.reviveT = helping ? p.reviveT + dt : Math.max(0, p.reviveT - dt * 2);
    if (p.reviveT >= 1) {
      p.downed = false; p.hp = 2; p.inv = 1.5; p.reviveT = 0; p.vy = -200; sc.snd('revive');
      sc.parts(20, p.x + 7, p.y + 13, p.pal.accent);
      sc.toast(`${p.pal.name} снова в строю`);
    }
  }
  // поводок: не даём разойтись за пределы экрана
  if (sc.players.length === 2) {
    const [a, b] = sc.players as [Player, Player];
    if (!a.downed && !b.downed && (Math.abs(a.x - b.x) > 1150 || Math.abs(a.y - b.y) > 720)) {
      const lead = a.x > b.x ? a : b, lag = lead === a ? b : a;
      if (lead.onGround && !lag.remote) { lag.x = lead.x - lead.face * 20; lag.y = lead.y; lag.vx = lag.vy = 0; lag.inv = 0.6; sc.toast(`${lag.pal.name} догоняет по нити`); }
    }
  }
  // названия областей
  const lead = sc.players.reduce((m, p) => (p.x > m.x ? p : m), sc.players[0]!);
  const tx = lead.x / T; let idx = 0;
  sc.L.areas.forEach((a, i) => { if (tx >= a.x) idx = i; });
  if (idx !== sc.areaIdx) { sc.areaIdx = idx; sc.emit('area', { name: sc.L.areas[idx]!.name }); }
}

// ↑ на скамье: меню вместо мгновенного отдыха (ingame.js)
export type BenchEntry = 'rest' | 'shop' | 'map' | 'gear';
export function benchEntries(sc: World): BenchEntry[] {
  const E: BenchEntry[] = ['rest'];
  if (sc.camp && !(sc.sr && sc.sr.cat === 'boss')) E.push('shop');
  E.push('map');
  if (!sc.sr) E.push('gear');
  return E;
}
export function benchOpen(sc: World, p: Player, b: Bench): void {
  const E = benchEntries(sc);
  if (E.length < 2) { benchRest(sc, p, b); return; }
  sc.benchMenuOpen = { p, b };
  sc.paused = true;
  sc.snd('bead');
  sc.emit('benchShow', { entries: E });
}
export function benchClose(sc: World, _silent?: boolean): void {
  if (!sc.benchMenuOpen) return;
  sc.benchMenuOpen = null;
  sc.paused = false;
  sc.emit('benchHide');
}
/** выбор пункта меню скамьи (ingame.js): закрывает меню и выполняет действие */
export function benchPick(sc: World, entry: BenchEntry): void {
  const bm = sc.benchMenuOpen; if (!bm) return;
  const { p, b } = bm;
  if (entry === 'rest') { benchClose(sc, true); benchRest(sc, p, b); }
  else if (entry === 'shop') { benchClose(sc, true); benchRest(sc, p, b, true); openShop(sc, p); }
  else if (entry === 'map') { benchClose(sc, true); benchRest(sc, p, b, true); mapShow(sc); }
  else sc.emit('gearOpen', { from: 'bench' });
}
