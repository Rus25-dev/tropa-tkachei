// Дымовые бомбы героя и ящики «ДЫМ» (арена Миши). Бросок, пополнение у ящиков и полёт бомбы; попадание в рюкзак Миши на данных (misha2) — здесь же.
import { T, dataKey } from './balance';
import type { Boss, Player, Rect } from './types';
import type { World } from './world';
import { inset, overlap } from './world';
import { bossDamage } from './status';

/** ящики арены по сущностям Crate уровня: прямоугольники, у которых бомбы пополняются */
export function setupCrates(sc: World): void {
  sc.crates = (sc.L.crates || []).map((c) => { const cx = c.x * T + 16, by = (c.y + 1) * T; return { x: cx - 22, y: by - 46, w: 44, h: 46 }; });
}

/** рюкзак за спиной Миши: куда должна попасть дымовуха */
export const mishaBag = (m: Boss): Rect => { const cx = m.x + m.w / 2; return { x: cx - 26 * m.face - 15, y: m.y + 12, w: 30, h: 40 }; };
const smokeAt = (sc: World, n: number, x: number, y: number): void => { sc.emit('smoke', { n, x, y }); if (sc.online === 'host') sc.sendEv({ k: 'smoke', n, x: Math.round(x), y: Math.round(y) }); };

export function throwBomb(sc: World, p: Player): void {
  if (!sc.L.crates || p.bombs <= 0 || p.bombCd > 0 || p.downed || p.sit) return;
  p.bombs--; p.bombCd = 0.35;
  const inp = p.inp, f = p.face;
  let vx = f * 360, vy = -430;
  if (inp.up) { vx = f * 230; vy = -650; } else if (inp.down) { vx = f * 170; vy = -180; }
  vx += p.vx * 0.25;
  const b = { kind: 'bomb', x: p.x + 7 + f * 8 - 6, y: p.y + 2, w: 12, h: 12, vx, vy, life: 3, owner: p.i };
  sc.snd('throw');
  if (sc.auth()) sc.projs.push(b);
  else sc.sendEv({ k: 'bomb', b: { x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(vx), vy: Math.round(vy) }, i: p.i });
}
export function refillBombs(sc: World, p: Player): void {
  if (!sc.crates || p.remote || p.downed) return;
  for (const c of sc.crates) if (p.bombs < 3 && overlap(p, c)) { p.bombs = 3; sc.snd('pickup'); sc.toast('Дымовухи: 3 из 3'); }
}

const BAG_BOMB_HITS = 3, BAG_BOMB_CD = 0.9;
export function stepBomb(sc: World, pr: { x: number; y: number; vx: number; vy: number; w: number; h: number; dead?: boolean }, dt: number): void {
  pr.vy = Math.min(pr.vy + 1100 * dt, 800); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
  const cx = pr.x + 6, cy = pr.y + 6;
  if (mishaBomb(sc, pr, cx, cy)) return;
  if (sc.isSolid(Math.floor(cx / T), Math.floor(cy / T))) { pr.dead = true; smokeAt(sc, 8, cx, cy - 4); sc.sfx('puff'); }
}
/** Миша на данных (misha2): дымовуха в рюкзак за спиной снимает 3 единицы здоровья (в фазе «застёгнуто» — только когда рюкзак открыт, это решает общий урон по боссу). true — бомба потрачена. */
function mishaBomb(sc: World, pr: { x: number; y: number; vy: number; w: number; h: number; dead?: boolean; [k: string]: unknown }, cx: number, cy: number): boolean {
  const m = sc.bosses[0];
  if (!m || (m['d'] as { id?: string } | undefined)?.id !== 'misha2' || ['dead', 'intro', 'rage'].includes(m.state)) return false;
  const bag = mishaBag(m), behind = (cx - (m.x + m.w / 2)) * m.face < 0;
  // падающая сверху бомба «залетает» в открытую молнию — зона над рюкзаком шире
  const mouth = pr.vy > 0 ? { x: bag.x - 8, y: bag.y - 26, w: bag.w + 16, h: bag.h + 26 } : bag;
  if (behind && overlap(pr, mouth)) {
    pr.dead = true;
    if (((m['bagT'] as number | undefined) ?? 0) > sc.timeSec) { smokeAt(sc, 6, bag.x + 15, bag.y); sc.sfx('puff'); return true; }
    m['bagT'] = sc.timeSec + BAG_BOMB_CD;
    smokeAt(sc, 26, bag.x + 15, bag.y + 4); sc.sfx('bag'); sc.sfx('puff'); sc.shake(180, 0.008);
    const owner = sc.players[pr['owner'] as number] ?? sc.players[0];
    if (owner && sc.auth()) bossDamage(sc, dataKey(0), owner, BAG_BOMB_HITS);
    return true;
  }
  if (overlap(pr, inset(m, 4))) { pr.dead = true; smokeAt(sc, 6, cx, cy); sc.sfx('puff'); return true; }
  return false;
}
