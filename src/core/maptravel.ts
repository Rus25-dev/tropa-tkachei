// Карта и быстрые переходы (legacy/src/maptravel.js): открытые участки, телепорт между скамьями.
// Карта заполняется по мере прохождения (клетки 4×4 вокруг героев). Посещённые клетки и скамьи лежат в прогрессе (map[глава]).
import { T } from './balance';
import type { Player } from './types';
import type { World } from './world';
import { areaOf } from './coop';
import { campaignSave, campaignSaveName, canSave, saveProgress } from './campaign';

const CH = 4;
export interface MapState { open: boolean; busy: boolean; ownPause: boolean; sel: number }
export const freshMapState = (): MapState => ({ open: false, busy: false, ownPause: false, sel: -1 });

const key = (sc: World): string | null => (sc.camp && sc.camp.st !== 'arena' ? String(sc.camp.ch) : null);
const persistent = (sc: World): boolean => !!(sc.camp && key(sc) && canSave(sc));
const cid = (cx: number, cy: number): number => cy * 1000 + cx;

export function mapLoad(sc: World, _saved: unknown): void {
  sc.mapV = new Set(); sc.mapB = new Set(); sc.mapDirty = false; sc.mapSaveT = 0;
  sc.mt = freshMapState();
  if (!persistent(sc)) return;
  const p = sc.progress, m = p && p.map && p.map[key(sc)!]; if (!m) return;
  for (const v of m.v || []) if (Number.isInteger(v)) sc.mapV.add(v);
  for (const b of m.b || []) if (sc.benches[b]) sc.mapB.add(b);
}
export function mapExport(sc: World): Record<string, { v: number[]; b: number[] }> {
  const p = sc.progress, all = { ...((p && p.map) || {}) };
  if (persistent(sc) && sc.mapV) all[key(sc)!] = { v: [...sc.mapV], b: [...sc.mapB] };
  return all;
}
function persist(sc: World): void {
  sc.mapDirty = false;
  if (!persistent(sc)) return;
  const p = sc.progress; if (!p) return; // сохранения ещё нет: карта уйдёт с первой скамьёй
  saveProgress(sc, { ...p, map: mapExport(sc) });
}
const benchOf = (sc: World, p: Player): number => {
  let best = -1, bd = 40;
  sc.benches.forEach((b, i) => { const d = Math.abs(p.x + 7 - b.x) + Math.abs(p.y + 26 - b.y); if (d < bd) { bd = d; best = i; } });
  return best;
};
/** каждый шаг: открываем клетки вокруг героев, отмечаем скамьи */
export function mapVisit(sc: World, dt: number): void {
  if (!sc.mapV || !sc.players) return;
  for (const p of sc.players) {
    if (p.downed) continue;
    const tx = Math.floor((p.x + 7) / T), ty = Math.floor((p.y + 13) / T), C = CH;
    for (let cy = Math.floor((ty - 5) / C); cy <= Math.floor((ty + 5) / C); cy++) for (let cx = Math.floor((tx - 6) / C); cx <= Math.floor((tx + 6) / C); cx++) {
      if (cx < 0 || cy < 0 || cx * C >= sc.L.W || cy * C >= sc.L.H) continue;
      const id = cid(cx, cy); if (!sc.mapV.has(id)) { sc.mapV.add(id); sc.mapDirty = true; }
    }
    if (p.sit) { const bi = benchOf(sc, p); if (bi >= 0 && !sc.mapB.has(bi)) { sc.mapB.add(bi); sc.mapDirty = true; persist(sc); } }
  }
  if (sc.mapDirty) { sc.mapSaveT += dt; if (sc.mapSaveT > 3) { sc.mapSaveT = 0; persist(sc); } }
}
/** идёт ли бой с боссом (телепорт тогда запрещён) */
function fighting(sc: World): boolean {
  if (sc.td || sc.fightOn) return true;
  if (sc.gates && sc.gates[0] && sc.gates[0].closed) return true;
  for (const b of [sc.boss, sc.misha, sc.vladik, sc.tima]) if (b && !['sleep', 'gone', 'dead', 'intro'].includes(b.state) && !sc.bossDead) return true;
  return false;
}
const sitter = (sc: World): Player | null => sc.players.find((p) => !p.remote && p.sit && !p.downed) || null;
export const mapVisited = (sc: World): number[] => [...sc.mapB].filter((i) => sc.benches[i]).sort((a, b) => sc.benches[a]!.x - sc.benches[b]!.x);
/** можно ли сейчас телепортироваться на выбранную скамью; why — причина отказа */
export function mapCan(sc: World): { ok: boolean; why: string } {
  if (fighting(sc)) return { ok: false, why: 'Во время боя с боссом телепорт недоступен' };
  const s = sitter(sc);
  if (!s) return { ok: false, why: 'Телепорт: сядьте на скамью (↑ у скамьи)' };
  if (sc.mt.sel < 0 || !sc.mapB.has(sc.mt.sel)) return { ok: false, why: 'Выберите посещённую скамью' };
  if (benchOf(sc, s) === sc.mt.sel) return { ok: false, why: 'Вы уже у этой скамьи' };
  return { ok: true, why: '' };
}
export const mapCanOpen = (sc: World): boolean => !!(sc.mapV && !sc.benchMenuOpen && !sc.mt.open && !sc.mt.busy && !sc.won && !sc.wiping && !sc.shopOpen && !sc.paused);
export function mapShow(sc: World): void {
  if (!mapCanOpen(sc)) return;
  const s = sitter(sc), v = mapVisited(sc);
  sc.mt.sel = s && benchOf(sc, s) >= 0 ? benchOf(sc, s) : -1;
  if (sc.mt.sel < 0 && v.length) { const p = sc.players.find((q) => !q.remote) || sc.players[0]!; sc.mt.sel = v.reduce((a, i) => (Math.abs(sc.benches[i]!.x - p.x) < Math.abs(sc.benches[a]!.x - p.x) ? i : a), v[0]!); }
  sc.mt.open = true;
  sc.paused = true; sc.mt.ownPause = true;
  sc.snd('bead');
  sc.emit('mapShow');
}
export function mapClose(sc: World): void {
  if (!sc.mt.open) return;
  sc.mt.open = false;
  if (sc.mt.ownPause) { sc.paused = false; sc.mt.ownPause = false; }
  sc.emit('mapHide');
}
export function mapMove(sc: World, d: number): void {
  const v = mapVisited(sc); if (!v.length) return;
  const i = v.indexOf(sc.mt.sel);
  sc.mt.sel = v[i < 0 ? (d > 0 ? 0 : v.length - 1) : (i + d + v.length) % v.length]!;
  sc.snd('bead'); sc.emit('mapRefresh');
}
/** телепорт на выбранную скамью: затемнение → перенос → появление */
export function mapGo(sc: World): void {
  const c = mapCan(sc);
  if (!c.ok) { sc.toast(c.why); sc.snd('hit'); return; }
  const bi = sc.mt.sel, b = sc.benches[bi]!;
  sc.mt.busy = true; sc.mt.open = false; sc.emit('mapHide');
  sc.paused = true; sc.mt.ownPause = false; // на время затемнения мир стоит
  sc.snd('bench');
  sc.emit('fade', { out: true, ms: 350 });
  sc.after(0.42, () => {
    if (!sc.players) return;
    for (const p of sc.players) {
      if (p.remote) continue;
      Object.assign(p, { x: b.x - 7 + p.i * 22, y: b.y - 26, vx: 0, vy: 0, kbx: 0, dashT: 0, atkT: 0, healCh: 0, healT: 0, hurtT: 0, inv: 1, sit: true, onGround: true });
      p.safeX = p.x; p.safeY = p.y;
    }
    sc.respawn = { x: b.x, y: b.y };
    sc.emit('camSnap');
    sc.mapB.add(bi); sc.mapDirty = true;
    const ar = areaOf(sc, b.x / T);
    if (sc.mode === 'story') campaignSave(sc, { bench: bi, name: campaignSaveName(sc, ar.name) });
    sc.emit('fade', { out: false, ms: 500 });
    sc.toast(`Быстрый переход: ${ar.name}`);
    sc.paused = false;
    sc.mt.busy = false;
  });
}
