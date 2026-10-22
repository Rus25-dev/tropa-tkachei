// Статусы: яд, ожог, замедление (legacy/src/status.js). Считает только мир; отрисовка берёт маску статусов из target.status.
// Урон боссу тиком идёт через исходную функцию урона (RAW) без нити, звука и стойкости — фазы и оглушение не ломаются.
import { STATUS_KINDS, dataKey, type StatusKind, type BossRef } from './balance';
import type { Boss, Enemy, Player } from './types';
import type { World } from './world';
import { killEnemy } from './combat';
import { enemyDef } from './enemies';
import { rawBossDamage } from './damage';
import { bossOf } from './bosses2';

type Target = (Enemy | Boss) & { status?: Record<string, { left: number; cd: number; src: Player | null; gen: number; t?: number }> | null };

export function bossKey(sc: World, t: unknown): BossRef | null {
  const i = sc.bosses.indexOf(t as never);
  return i >= 0 ? dataKey(i) : null;
}
export function isBoss(sc: World, t: unknown): boolean { return !!t && bossKey(sc, t) ? true : false; }
export function bossLive(b: Boss | null | undefined): boolean { return !!b && !['sleep', 'dead', 'gone', 'intro', 'rage'].includes(b.state); }
function alive(sc: World, t: Target | null): boolean {
  if (!t) return false;
  if (isBoss(sc, t)) return t.hp > 0 && !['dead', 'gone'].includes((t as Boss).state);
  return !(t as Enemy).dead && t.hp > 0;
}
export function src(sc: World, p?: Player | null): Player { return p || sc.players.find((q) => !q.remote) || sc.players[0]!; }

export function applyStatus(sc: World, t: Target | null, kind: StatusKind, dur?: number | null, srcP?: Player | null): boolean {
  const K = STATUS_KINDS[kind]; if (!K || !t || !sc.auth() || !alive(sc, t)) return false;
  const boss = isBoss(sc, t), s = t.status || (t.status = {});
  if (kind === 'slow') {
    const left = dur != null ? dur : (K as { t: number }).t;
    if (s['slow']) s['slow'].t = Math.max(s['slow'].t!, left); else s['slow'] = { t: left, left: 0, cd: 0, src: null, gen: 0 };
    return true;
  }
  if (boss) { // не складываются: один урон-статус за раз
    const other = kind === 'poison' ? 'burn' : 'poison';
    if (s[other]) return false;
  }
  const kk = K as { iv: number; n: number };
  const n = dur != null ? Math.max(1, Math.round(dur / kk.iv)) : kk.n;
  if (s[kind]) { s[kind]!.left = Math.max(s[kind]!.left, n); s[kind]!.src = srcP || s[kind]!.src; return true; }
  s[kind] = { left: n, cd: kk.iv, src: srcP || null, gen: 0 };
  return true;
}

// урон боссу тиком: исходная функция без нити/звука/стойкости
export function bossDamage(sc: World, key: BossRef, p: Player, n: number): void {
  const b = bossOf(sc, key);
  if (!bossLive(b)) return;
  const hs = sc.hitstop, hp0 = b!.hp, nsg = p['noSilkGain'], q = sc.quiet;
  sc.quiet = true; p['noSilkGain'] = true;
  try { rawBossDamage(sc, key, p, { amount: n, source: 'dot', weak: 'open' }); }
  finally { sc.quiet = q; p['noSilkGain'] = nsg; sc.hitstop = hs; }
  if (b!.hp < hp0) b!.flash = Math.max(b!.flash || 0, 0.06);
}

// тик урона
function tickDmg(sc: World, t: Target, kind: 'poison' | 'burn', st: { gen: number; src: Player | null }): void {
  const K = STATUS_KINDS[kind], p = src(sc, st.src), boss = isBoss(sc, t);
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  if (boss) {
    const key = bossKey(sc, t)!;
    t['stAcc'] = ((t['stAcc'] as number) || 0) + 0.5;
    if ((t['stAcc'] as number) >= 1) { (t['stAcc'] as number) -= 1; bossDamage(sc, key, p, 1); }
  } else {
    const e = t as Enemy;
    if (e['e2'] && enemyDef(e)?.dotImmune?.(e)) return;
    e.hp -= 1; e.flash = 0.08;
    sc.burst(kind === 'poison' ? 5 : 6, cx, cy, K.col);
    if (e.hp <= 0) { killEnemy(sc, e); e['status'] = null; return; }
  }
  if (kind === 'burn' && st.gen < 2) { // поджигает рядом стоящих
    for (const o of sc.enemies) {
      const os = (o as Target).status;
      if (o === t || o.dead || (os && os['burn'])) continue;
      if (Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) > 72) continue;
      if (applyStatus(sc, o as Target, 'burn', null, st.src)) (o as Target).status!['burn']!.gen = st.gen + 1;
    }
  }
}

/** status.js: Status.step — вызывается после основного шага мира */
/** маска статусов для снимка и отрисовки (у гостя — то, что пришло от хоста) */
export function statusMask(sc: World, t: Target | null): number {
  if (!t) return 0;
  if (!sc.auth()) return (t['stv'] as number | undefined ?? 0) | 0;
  const s = t.status; if (!s) return 0;
  let m = 0; for (const k in s) if (s[k]) m |= (STATUS_KINDS as Record<string, { bit: number }>)[k]!.bit; return m;
}
export function stepStatus(sc: World, dt: number): void {
  if (!sc.auth()) return;
  const list: (Target | null)[] = [...sc.enemies, ...sc.bosses];
  for (const t of list) {
    const s = t && t.status; if (!s) continue;
    if (!alive(sc, t)) { t!.status = null; continue; }
    if (s['slow']) { s['slow'].t! -= dt; if (s['slow'].t! <= 0) delete s['slow']; }
    for (const kind of ['poison', 'burn'] as const) {
      const st = s[kind]; if (!st) continue;
      if (isBoss(sc, t) && !bossLive(t as Boss)) continue; // в рёве/неуязвимости таймер замирает
      st.cd -= dt;
      if (st.cd <= 0) {
        st.cd += STATUS_KINDS[kind].iv; st.left--;
        tickDmg(sc, t!, kind, st);
        if (!t!.status) break;
        if (st.left <= 0) delete s[kind];
      }
    }
    if (t!.status && !t!.status['poison'] && !t!.status['burn'] && !t!.status['slow']) t!.status = null;
  }
}

/** замедление: время врага течёт медленнее (боссы — вдвое слабее). e — враг или босс; возвращает множитель dt. */
export function slowDt(sc: World, e: Target | null, dt: number, boss: boolean): number {
  if (typeof dt === 'number' && sc.auth()) {
    if (e && e.status && e.status['slow'] && (!boss || bossLive(e as Boss))) return dt * (boss ? 0.8 : 0.6);
  }
  return dt;
}
