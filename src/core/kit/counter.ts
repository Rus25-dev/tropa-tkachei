// Контрудар (v2.7, набор игрока; ориентир механики — одноимённый приём Metroid Dread): удар в окно перед ударом врага.
// Нажатие удара (кнопка удара, вперёд, на земле) в последние WINDOW_F кадров замаха босса на данных, который стоит вплотную (до REACH px от тела),
// срывает его атаку: босс оглушён на STUN_T (с убывающей отдачей оглушений каркаса), получает BONUS урона сразу, а ваш же удар этого кадра
// становится усиленной контратакой (механизм Парирования 2.0: p.counterT → ×COUNTER_DMG урона и ×COUNTER_POISE_MUL равновесия, см. player.ts, damage.ts).
// Берутся только жёлтые и красные замахи: фиолетовые («печать») и белые (отгон, перемещение) контрударом не срываются — защита от читов каркаса не обходится.
// Приём не новая кнопка: он живёт на кнопке удара. Состояние в мешке полей героя: cxCd (откат, кадры), cxFx (кольцо, секунды), cxN (сколько раз сработал).
// Всё считается в кадрах и целых счётчиках: без Date.now, Math.random и таймеров, ввод — тот же, что пишет журнал (повтор по журналу даёт то же самое).
// Встраивание: kitStep (moves.ts) зовёт counterStep перед шагом нижних слоёв; kitHas('counter') закрыт, пока unlock = 'locked' и нет флага kit в Босс-тесте.
// Числа лежат здесь (а не в balance.json), чтобы приём не пересекался с правками раздела KIT других приёмов; кадры (60/с) и пиксели (тайл 32).
import { PARRY2 } from '../balance';
import type { BossRef } from '../balance';
import { bossRefs } from '../bosses2';
import { dataStaggerBegin, onStagger, onStaggerWorld, type DState } from '../boss/exec';
import { bossDamage, bossLive } from '../status';
import type { Boss, Player } from '../types';
import type { World } from '../world';
import { kitHas } from './abilities';
import { bossDef } from '../boss/registry';

export const COUNTER = {
  /** окно: сколько последних кадров замаха босса (включая кадр перед ударом) принимают контрудар */
  WINDOW_F: 9,
  /** на сколько px от края тела босса допускается контрудар (дальше обычный удар не достаёт) */
  REACH: 70,
  /** оглушение босса, секунды (до убывающей отдачи каркаса; обычное оглушение стойкости — STAGGER_T = 1,5) */
  STUN_T: 0.9,
  /** откат приёма, кадры */
  CD_F: 90,
  /** урон боссу сразу, единицы здоровья (идёт через обычный урон боссу: броня уязвимых точек его не пропускает) */
  BONUS: 3,
  /** неуязвимость героя после контрудара, секунды */
  INV_T: 0.4,
  /** нить за успешный контрудар */
  SILK: 1,
  /** кольцо вокруг героя (только отрисовка), секунды */
  FX_T: 0.4,
} as const;

const dstate = (b: Boss): DState | undefined => b['d'] as DState | undefined;

/** Цвет замаха, который можно сорвать контрударом: жёлтый и красный */
export const counterColor = (c: string): boolean => c === 'yellow' || c === 'red';

/** Кадров до первого удара атаки босса, если он сейчас в замахе (>= 1), иначе 0 */
export function tellLeft(b: Boss): number {
  const d = dstate(b);
  return d && b.state === 'tell' && d.mode === 'attack' && d.cue ? d.cue.left : 0;
}

/** Босс, которого этот герой может сейчас сорвать контрударом (окно, дальность, цвет, нет оглушения и «иммунитета» после него), или null */
export function counterTarget(sc: World, p: Player): [Boss, BossRef] | null {
  const cx = p.x + p.w / 2;
  for (const [b, key] of bossRefs(sc)) {
    const d = dstate(b); if (!d || !bossLive(b) || b.stagger > 0 || ((b['poiseImmune'] as number) || 0) > 0) continue;
    const a = bossDef(d.id)?.attacks.find((x) => x.id === d.atk), spec = a?.counter;
    if (!a || spec === false) continue;
    // Совместимость прежних данных. Новые атаки задают counter явно.
    if (spec === undefined && (!d.cue || !counterColor(d.cue.color))) continue;
    const left = tellLeft(b);
    if (left < 1 || left > (spec?.windowFrames ?? COUNTER.WINDOW_F) || (spec?.grounded && !p.onGround)) continue;
    if (Math.abs(b.x + b.w / 2 - cx) > b.w / 2 + (spec?.reach ?? COUNTER.REACH) || p.y + p.h <= b.y || p.y >= b.y + b.h) continue;
    return [b, key];
  }
  return null;
}

/** Готов ли приём: есть, не в откате */
export const counterReady = (sc: World, p: Player): boolean => kitHas(sc, p, 'counter') && ((p['cxCd'] as number) | 0) <= 0;

/** Шаг приёма (из kitStep, до нижних слоёв): откат, кольцо, проверка нажатия удара. Вызывается только для своего героя. */
export function counterStep(sc: World, p: Player, dt: number): void {
  if ((p['cxCd'] as number) > 0) p['cxCd'] = (p['cxCd'] as number) - 1;
  if ((p['cxFx'] as number) > 0) p['cxFx'] = (p['cxFx'] as number) - dt;
  if (!sc.auth() || !kitHas(sc, p, 'counter') || ((p['cxCd'] as number) | 0) > 0) return;
  const inp = p.inp; if (!inp || !(inp.atkP || (p['atkBuf'] as number) > 0)) return;
  // удар вперёд начнётся именно в этом кадре (те же условия, что у базового шага): иначе нажатие остаётся в буфере и проверяется позже
  if (p.downed || p.hurtT > 0 || p.dashT > 0 || p.sit || (p['healCh'] as number) > 0 || p['ledge'] || p['fl'] || p['cr'] || p['dv'] || p.atkCd - dt > 1e-9 || inp.up || inp.down) return;
  const t = counterTarget(sc, p); if (!t) return;
  fire(sc, p, t[0], t[1]);
}

function fire(sc: World, p: Player, b: Boss, key: BossRef): void {
  const bx = b.x + b.w / 2, cx = p.x + p.w / 2;
  p.face = bx >= cx ? 1 : -1;
  p['cxCd'] = COUNTER.CD_F; p['cxFx'] = COUNTER.FX_T; p['cxN'] = ((p['cxN'] as number) | 0) + 1;
  p.inv = Math.max(p.inv, COUNTER.INV_T);
  p['counterT'] = PARRY2.COUNTER_T; // удар этого кадра — усиленная контратака Парирования 2.0
  p.silk = Math.min(sc.silkMax, p.silk + COUNTER.SILK);
  const hx = (bx + cx) / 2, hy = b.y + b.h / 2;
  bossDamage(sc, key, p, COUNTER.BONUS);
  if (bossLive(b) && b.hp > 0) { // босс мог сменить фазу или погибнуть от бонуса: тогда оглушать нечего
    b.stagger = COUNTER.STUN_T * dataStaggerBegin(b); b['poise'] = 0; b['poiseT'] = 0; b['executed'] = true; b.flash = 0.1; // казнь по срыву не положена: награда — удары по оглушённому
    onStagger(b); onStaggerWorld(sc, b);
  }
  if (!p.remote) sc.hitstop = 0.12;
  sc.snd('counterStrike'); sc.emit('counterStrike', { x: hx, y: p.y - 8, i: p.i }); sc.shake(160, 0.007);
  sc.emit('flash', { ms: 90, r: 190, g: 235, b: 255 });
  sc.parts(26, hx, hy, 0xbfe9ff); sc.parts(10, hx, hy, 0xffffff);
}
