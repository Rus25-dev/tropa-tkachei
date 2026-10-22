// Нитяные заклинания (v2.5, набор игрока): «Нитяной снаряд» (Vengeful Spirit), «Нырок» (Desolate Dive), «Вопль» (Howling Wraiths).
// Это записи реестра TOOLS (кнопка инструмента, без новых кнопок): тратят нить, имеют перезарядку, открываются как остальные инструменты (unlock).
// Снаряд и вопль живут в w.tl и считаются хостом (гость шлёт сообщение 'tool', как для иглы и бомбы); нырок ведёт герой-владелец (moves.ts),
// а удары нырка уходят хосту сообщениями 'tool' с id 'divestrike' и 'diveland'.
// Баланс: урон по боссу за одно применение делённый на перезарядку (nominal DPS) лежит в пределах ±25 % от иглы (KIT.NEEDLE_DPS), как у оружия.
import { KIT } from '../balance';
import { bossRefs } from '../bosses2';
import type { Player } from '../types';
import type { World } from '../world';
import { inset, overlap } from '../world';
import { liveBoss, toolHurtBoss, toolHurtEnemy, tfxAdd, toolSpawn, type ToolMsg } from '../tools';
import { toolReg } from '../plugin/regs';

/** номинальный урон по боссу за одно применение (все удары попали); описания — src/content/tools/<id>.ts */
export const spellDamage = (id: string): number => toolReg.get(id)?.nominalDmg ?? 0;
export const spellCd = (id: string): number => toolReg.get(id)?.cd ?? 0;

const dirOf = (p: Player): number => ((p.inp.right ? 1 : 0) - (p.inp.left ? 1 : 0)) || p.face || 1;

/** заклинание-снаряд: сообщение вперёд по вводу на высоте y, звук; сущность создаёт хост (spawn описания) */
export function spellMsg(sc: World, p: Player, id: string, y: number, snd: string): boolean {
  const f = dirOf(p);
  const msg: ToolMsg = { id, i: p.i, x: Math.round(p.x + 7), y: Math.round(y), dx: f, dy: 0, f };
  sc.snd(snd);
  if (sc.auth()) toolSpawn(sc, msg); else sc.sendEv({ k: 'tool', ...msg });
  return true;
}

const kdirOf = (e: { x: number; w: number }, cx: number): number => Math.sign(e.x + e.w / 2 - cx) || 1;

// ----- нырок: удары -----
/** герой в падении касается цели (вызывает владелец): один раз за нырок. true — удар засчитан или отправлен */
export function diveStrike(sc: World, p: Player): boolean {
  const r = { x: p.x - 4, y: p.y + p.h - 6, w: p.w + 8, h: 30 };
  const hit = sc.enemies.some((e) => !e.dead && overlap(r, e)) || bossRefs(sc).some(([b]) => liveBoss(b) && overlap(r, inset(b, 4)));
  if (!hit) return false;
  const cx = Math.round(p.x + p.w / 2), fy = Math.round(p.y + p.h);
  if (sc.auth()) diveStrikeHit(sc, p, cx, fy); else sc.sendEv({ k: 'tool', id: 'divestrike', i: p.i, x: cx, y: fy, dx: 0, dy: 0, f: 1 });
  return true;
}
export function diveStrikeHit(sc: World, p: Player, cx: number, fy: number): void {
  const r = { x: cx - 18, y: fy - 36, w: 36, h: 66 };
  for (const e of sc.enemies) if (!e.dead && overlap(r, e)) toolHurtEnemy(sc, e, 2, kdirOf(e, cx), false);
  for (const [b, key] of bossRefs(sc)) if (liveBoss(b) && b.state !== 'rage' && overlap(r, inset(b, 4))) toolHurtBoss(sc, key, p, KIT.DIVE.STRIKE, { source: 'area', weak: 'geometry', shape: { type: 'rect', rect: r } });
}
/** приземление нырка: ударная волна по земле */
export function diveLand(sc: World, p: Player): void {
  const cx = Math.round(p.x + p.w / 2), fy = Math.round(p.y + p.h);
  sc.snd('diveLand'); sc.shake(200, 0.009); sc.dustAt(10, cx, fy);
  sc.parts(24, cx, fy - 4, 0xcfe8ff);
  if (sc.auth()) diveLandHit(sc, p, cx, fy); else sc.sendEv({ k: 'tool', id: 'diveland', i: p.i, x: cx, y: fy, dx: 0, dy: 0, f: 1 });
}
export function diveLandHit(sc: World, p: Player, cx: number, fy: number): void {
  const R = KIT.DIVE.R, r = { x: cx - R, y: fy - 52, w: R * 2, h: 60 };
  tfxAdd(sc, { f: 'shock', x: cx, y: fy, t: 0.4, T: 0.4 }, true);
  for (const pr of sc.projs) if (!pr.dead && pr.kind !== 'bomb' && pr.hk !== 'unblockable' && !(pr.delay && pr.delay > 0) && overlap(r, pr)) pr.dead = true;
  for (const e of sc.enemies) if (!e.dead && overlap(r, e)) { toolHurtEnemy(sc, e, KIT.DIVE.ENEMY_DMG, kdirOf(e, cx), true); if (!e.dead) e.kby = -240; }
  for (const [b, key] of bossRefs(sc)) if (liveBoss(b) && b.state !== 'rage' && overlap(r, inset(b, 2))) toolHurtBoss(sc, key, p, KIT.DIVE.LAND_DMG, { source: 'area', weak: 'geometry', shape: { type: 'rect', rect: r } });
}
