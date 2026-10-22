// Босс «Миша Додик»: арена «Старая типография», буквы, рюкзак и дымовухи, фаза «Пропустите!» (legacy/src/misha.js).
import { BAL, MISHA_BIG, MISHA_SAY_HIT, MISHA_WORDS, P, T, clamp, dataKey } from './balance';
import type { Boss, Player, Rect } from './types';
import type { World } from './world';
import { inset, overlap } from './world';
import { bossDeathFx } from './bosses2';
import { gainSilk } from './damage';
import { bossDamage } from './status';
import { bossDeath } from './korne';
import { teamWipe } from './combat';
import { winGame } from './win';
import { wdef } from './weapons';
import { statBegin, statBossHit } from './racestats';

/** ширина поля для геометрии фазы «Пропустите!»: в v1.8 она зависела от пропорций экрана (баг), в v2 фиксирована */
const TD_VW = 960;

export function setupMishaArena(sc: World): void {
  const L = sc.L;
  sc.crates = (L.crates || []).map((c) => { const cx = c.x * T + 16, by = (c.y + 1) * T; return { x: cx - 22, y: by - 46, w: 44, h: 46 }; });
  sc.bagHits = 0; sc._needleTip = false;
  makeMisha(sc);
}
export function makeMisha(sc: World): void {
  const d = sc.L.misha!, hp = BAL.hp.misha[sc.nPlayers === 2 ? 1 : 0]!;
  sc.misha = { x: d.x * T - 28, y: (d.y + 1) * T - 74, w: 56, h: 74, vx: 0, vy: 0, face: -1, hp, maxHp: hp, state: 'intro', t: 3.2,
    flash: 0, last: '', turnT: 0, hitCd: 0, tdMarks: [Math.ceil(hp * 2 / 3), Math.ceil(hp / 3)], tdUsed: [], armorSaid: false, tdQueue: false, say: 'ЭЙ! ЭТО МОЙ РЮКЗАК!', sayT: 3.0, zipT: 0, barShown: false };
}
export const makeMishaIfAlive = makeMisha;

const mishaBag = (m: Boss): Rect => { const cx = m.x + m.w / 2; return { x: cx - 26 * m.face - 15, y: m.y + 12, w: 30, h: 40 }; };
function mishaSpeak(m: Boss, text: string, dur?: number): void { m['say'] = text; m['sayT'] = Math.max(dur || 1.6, 1.4 + text.length * 0.07); }
const smokeAt = (sc: World, n: number, x: number, y: number): void => { sc.emit('smoke', { n, x, y }); if (sc.online === 'host') sc.sendEv({ k: 'smoke', n, x: Math.round(x), y: Math.round(y) }); };
const vr = (sc: World): number => sc.rngFor('visual')(); // только для реплик: на исход боя не влияет

// ----- бомбы игроков -----
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
export function stepBomb(sc: World, pr: { x: number; y: number; vx: number; vy: number; w: number; h: number; dead?: boolean }, dt: number): void {
  pr.vy = Math.min(pr.vy + 1100 * dt, 800); pr.x += pr.vx * dt; pr.y += pr.vy * dt;
  const m = sc.misha, cx = pr.x + 6, cy = pr.y + 6;
  if (m && !['dead', 'intro'].includes(m.state)) {
    const bag = mishaBag(m), behind = (cx - (m.x + m.w / 2)) * m.face < 0;
    // падающая сверху бомба «залетает» в открытую молнию — зона над рюкзаком шире
    const mouth = pr.vy > 0 ? { x: bag.x - 8, y: bag.y - 26, w: bag.w + 16, h: bag.h + 26 } : bag;
    if (behind && overlap(pr, mouth)) {
      pr.dead = true;
      if (m['zipT'] > 0) { smokeAt(sc, 5, bag.x + 15, bag.y); sc.sfx('clink'); if (m['sayT'] <= 0) mishaSpeak(m, 'ЗАКРЫТО!', 1.0); return; }
      mishaBagHit(sc);
      return;
    }
    if (overlap(pr, inset(m, 4))) {
      pr.dead = true; smokeAt(sc, 6, cx, cy); sc.sfx('puff');
      if (vr(sc) < 0.5) mishaSpeak(m, m.state === 'cough' ? 'МИМО!' : 'ХА, МИМО!', 1.1);
      return;
    }
  }
  else if (dataMishaBomb(sc, pr, cx, cy)) return;
  if (sc.isSolid(Math.floor(cx / T), Math.floor(cy / T))) { pr.dead = true; smokeAt(sc, 8, cx, cy - 4); sc.sfx('puff'); }
}
/** Новый Миша на данных (misha2): дымовуха в рюкзак за спиной снимает 3 единицы здоровья (в фазе «застёгнуто» — только когда рюкзак открыт, это решает общий урон по боссу). true — бомба потрачена. */
const BAG_BOMB_HITS = 3, BAG_BOMB_CD = 0.9;
function dataMishaBomb(sc: World, pr: { x: number; y: number; vy: number; w: number; h: number; dead?: boolean; [k: string]: unknown }, cx: number, cy: number): boolean {
  const m = sc.bosses[0];
  if (!m || (m['d'] as { id?: string } | undefined)?.id !== 'misha2' || ['dead', 'intro', 'rage'].includes(m.state)) return false;
  const bag = mishaBag(m), behind = (cx - (m.x + m.w / 2)) * m.face < 0;
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
export function mishaBagHit(sc: World): void {
  const S = statBegin(sc), cur = sc.testBoss() ?? sc.boss, h0 = cur ? cur.hp : 0;
  mishaBagHitBase(sc);
  if (S) statBossHit(sc, cur, h0);
}
function mishaBagHitBase(sc: World): void {
  const m = sc.misha!, bag = mishaBag(m);
  if (m['hitCd'] > 0) { smokeAt(sc, 6, bag.x + 15, bag.y); sc.sfx('puff'); return; }
  m.hp -= 1; m.flash = 0.12; m['hitCd'] = 0.9; sc.bagHits++;
  smokeAt(sc, 26, bag.x + 15, bag.y + 4); sc.sfx('bag'); sc.sfx('puff'); sc.sfx('cough'); sc.shake(180, 0.008); sc.hitstop = 0.06;
  sc.bossBar(true, 'Миша Додик', Math.max(0, m.hp) / m.maxHp);
  if (m.hp <= 0) { mishaDie(sc); return; }
  m.state = 'cough'; m.t = 1.5; m.vx = 0;
  for (const mark of m['tdMarks']) if (m.hp <= mark && !m['tdUsed'].includes(mark)) { m['tdUsed'].push(mark); m['tdQueue'] = true; }
  mishaSpeak(m, MISHA_SAY_HIT[Math.floor(vr(sc) * MISHA_SAY_HIT.length)]!, 1.3);
  if (m.hp === Math.floor(m.maxHp / 2)) sc.toastAll('Миша злится: буквы летят быстрее');
}
function mishaDieBase(sc: World): void {
  const m = sc.misha!; m.state = 'dead'; m.t = 2.6; m.vx = 0; sc.bossDead = true; bossDeathFx(sc);
  for (const pr of sc.projs) if (pr.kind !== 'bomb') pr.dead = true;
  mishaSpeak(m, 'ЭТО СДЕЛАЛ ТАМИК!', 2.6); sc.sfx('roar'); sc.shake(900, 0.008);
  sc.emit('mishaBursts', {});
  sc.after(3.3, () => { sc.bossBar(false); winGame(sc); });
}
export function mishaDie(sc: World): void { bossDeath(sc, 'mishaDie', mishaDieBase); }

export function mishaNeedle(sc: World, p: Player, box: Rect): boolean {
  const m = sc.misha;
  if (!m || p.atkHits!.has(m) || ['dead', 'intro'].includes(m.state) || !overlap(box, m)) return false;
  p.atkHits!.add(m);
  if (!mishaArmored(m)) { if (sc.auth()) mishaNeedleHit(sc, p, m); else { m.flash = 0.08; sc.snd('hit'); } return true; }
  // третья фаза: рюкзак застёгнут на все замки — иглой не пробить
  m.flash = 0.06;
  gainSilk(sc, p, true); sc.snd('clink'); sc.parts(5, clamp(p.x + 7 + p.face * 26, m.x, m.x + m.w), m.y + m.h / 2, 0xffffff);
  if (!sc._needleTip) { sc._needleTip = true; sc.toast('Последняя фаза: иглой Мишу не пробить. Дымовуху ему в рюкзак!', 5.5); }
  return true;
}
// третья фаза (последняя треть здоровья): только дымовые бомбы
const mishaArmored = (m: Boss): boolean => m.hp <= m['tdMarks'][1];
// первые две фазы: Миша бьётся иглой как обычный босс, 4 удара = 1 «единица» здоровья (бомба в рюкзак снимает целую)
function mishaNeedleHit(sc: World, p: Player, m: Boss): void {
  const S = statBegin(sc), h0 = m.hp;
  mishaNeedleHitBase(sc, p, m);
  if (S) { const d = Math.max(0, h0 - m.hp); S.hits++; S.dmg += d; S.bossDmg += d; }
}
function mishaNeedleHitBase(sc: World, p: Player, m: Boss): void {
  if (['dead', 'intro'].includes(m.state)) return;
  const W = wdef(p), floor = m['tdMarks'][1];
  const d = 0.25 * (W && W.dmg ? W.dmg : 1) * (p['heavy'] ? 2 : 1);
  m.hp = Math.max(floor, m.hp - d); m.flash = 0.1; gainSilk(sc, p, true); if (!p.remote) sc.hitstop = 0.04;
  sc.sfx('hit'); sc.parts(8, clamp(p.x + 7 + p.face * 26, m.x, m.x + m.w), m.y + m.h / 2, 0xf4f1e6);
  sc.bossBar(true, 'Миша Додик', Math.max(0, m.hp) / m.maxHp);
  let queued = false;
  for (const mark of m['tdMarks']) if (m.hp <= mark && !m['tdUsed'].includes(mark)) { m['tdUsed'].push(mark); m['tdQueue'] = true; queued = true; }
  if (queued) { m.state = 'cough'; m.t = 0.9; m.vx = 0; }
  if (m.hp <= floor && !m['armorSaid']) {
    m['armorSaid'] = true; mishaSpeak(m, 'ЗАСТЁГИВАЮ НА ВСЕ ЗАМКИ!', 2.2); sc.sfx('gate'); sc.shake(300, 0.008);
    sc.toastAll('Последняя фаза: иглой Мишу больше не пробить — только дымовухи в рюкзак!');
  } else if (vr(sc) < 0.18 && m['sayT'] <= 0) mishaSpeak(m, MISHA_SAY_HIT[Math.floor(vr(sc) * MISHA_SAY_HIT.length)]!, 1.1);
}

// ----- поведение -----
export function stepMisha(sc: World, dt: number): void {
  const m = sc.misha; if (!m) return;
  m.flash -= dt; m['hitCd'] -= dt; m['sayT'] -= dt;
  if (m['zipT'] > 0) { m['zipT'] -= dt; if (m['zipT'] <= 0) { mishaSpeak(m, 'ФУХ, ЖАРКО… ОТКРОЮ', 1.6); sc.sfx('puff'); } }
  if (!m['barShown']) { m['barShown'] = true; sc.bossBar(true, 'Миша Додик', m.hp / m.maxHp); }
  if (m.state === 'dead') { m.t -= dt; m.vy = Math.min(m.vy + P.G * dt, P.MAXFALL); sc.moveBody(m, dt); return; }
  const phase2 = m.hp <= m.maxHp / 2;
  const [tp] = sc.nearestPlayer(m.x + m.w / 2, m.y + m.h / 2);
  const tx = tp ? tp.x + 7 : m.x + m.w / 2, mcx = m.x + m.w / 2;
  const want = tx > mcx ? 1 : -1;
  m.t -= dt;
  switch (m.state) {
    case 'intro': m.vx = 0; if (m.t <= 0) { m.state = 'idle'; m.t = 0.8; } break;
    case 'idle': {
      m.t -= dt * BAL.pace.misha;
      if (want !== m.face) { m['turnT'] += dt; if (m['turnT'] > (phase2 ? 0.32 : 0.5)) { m.face = want; m['turnT'] = 0; } } else m['turnT'] = 0;
      m.vx = Math.abs(tx - mcx) > 220 ? m.face * 70 : 0;
      if (m.t <= 0) {
        const late = m['tdUsed'].length;
        let opts = ['letters', 'big', 'charge'];
        if (late >= 1) opts.push('dict', 'dict');
        if (late >= 2 && m['zipT'] <= 0) opts.push('zip');
        if (late >= 1) opts.push('roller');
        if (late >= 2) opts.push('roller', 'roller');
        opts = opts.filter((o) => o !== m.last);
        const pick = opts[Math.floor(sc.rBoss() * opts.length)]!; m.last = pick; m.vx = 0;
        if (pick === 'letters') mishaWord(sc, phase2);
        if (pick === 'big') { m.state = 'bigWind'; m.t = 0.6; mishaSpeak(m, 'ДЕТДОМ!', 1.2); }
        if (pick === 'charge') { m.state = 'chargeWind'; m.t = phase2 ? 0.35 : 0.5; m.face = want; mishaSpeak(m, 'С ДОРОГИ!', 1.0); }
        if (pick === 'dict') { m.state = 'dictWind'; m.t = 0.8; mishaSpeak(m, 'ДИКТАНТ! ПИШЕМ!', 1.4); sc.sfx('roar'); }
        if (pick === 'roller') { m.state = 'rollWind'; m.t = 0.8; mishaSpeak(m, 'ПЕЧАТЬ! ВАЛИК!', 1.5); sc.sfx('gate'); }
        if (pick === 'zip') { m['zipT'] = 4.5; m.state = 'recover'; m.t = 0.5; mishaSpeak(m, 'ЗАКРЫЛ! ХА-ХА!', 1.6); sc.sfx('gate'); sc.toastAll('Рюкзак застёгнут — подожди, пока Мише станет жарко'); }
      }
      break;
    }
    // печатный валик (последняя треть боя): катится от стены за спиной героя через всю арену и обратно
    case 'rollWind':
      m.vx = 0;
      if (m.t <= 0) {
        const side = tx > mcx ? 1 : -1, W = sc.L.W;
        sc.projs.push({ kind: 'roller', x: side > 0 ? (W - 1) * T - 46 : T, y: sc.L.floorY! * T - 52 || 18 * T - 52, w: 46, h: 52, vx: -side * 330, vy: 0, life: 9, delay: 1.0, rev: 0 });
        sc.sfx('slam'); m.state = 'recover'; m.t = 1.2;
      }
      break;
    case 'dictWind':
      m.vx = 0;
      if (m.t <= 0) { mishaDictation(sc, m['tdUsed'].length >= 2 ? 3 : m['tdUsed'].length >= 1 ? 2 : 1); m.state = 'recover'; m.t = 1.4; }
      break;
    case 'word': m.vx = 0; if (m.t <= 0) { if (phase2 && sc.rBoss() < 0.45) mishaWord(sc, phase2); else { m.state = 'recover'; m.t = phase2 ? 0.45 : 0.7; } } break; // во второй половине боя иногда сразу второе слово
    case 'bigWind':
      m.vx = 0;
      if (m.t <= 0) {
        const targets = sc.alivePlayers().length ? sc.alivePlayers() : sc.players;
        const n: number = phase2 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const p = targets[i % targets.length]!, off = n === 1 ? 0 : (i - 1) * 110;
          const x = clamp(p.x + 7 + off, 2 * T, (sc.L.W - 2) * T) - 28;
          sc.projs.push({ kind: 'bigletter', ch: MISHA_BIG[Math.floor(sc.rBoss() * MISHA_BIG.length)], x, y: 7 * T, w: 56, h: 60, vx: 0, vy: 0, life: 3, delay: 0.75 + i * 0.15 });
        }
        m.state = 'recover'; m.t = phase2 ? 0.8 : 1.1;
      }
      break;
    case 'chargeWind': m.vx = 0; if (m.t <= 0) { m.state = 'charge'; sc.sfx('roar'); } break;
    case 'charge': m.vx = m.face * (phase2 ? 520 : 450); break;
    case 'cough': m.vx = 0;
      if (m.t <= 0) { m.state = 'idle'; m.t = phase2 ? 0.4 : 0.7; if (m['tdQueue']) { m['tdQueue'] = false; tdBegin(sc); } }
      break;
    case 'stun': m.vx = 0; if (m.t <= 0) { m.state = 'idle'; m.t = 0.5; } break;
    case 'recover': m.vx = 0; m.t -= dt * BAL.pace.misha; if (m.t <= 0) { m.state = 'idle'; m.t = phase2 ? 0.35 : 0.65; } break;
  }
  m.vy = Math.min(m.vy + P.G * dt, P.MAXFALL);
  const was = m.state;
  sc.moveBody(m, dt);
  if (was === 'charge' && (m.hitL || m.hitR)) {
    m.state = 'stun'; m.t = 1.4; sc.shake(260, 0.012); sc.sfx('slam'); mishaSpeak(m, 'АЙ!', 1.0);
    sc.dustAt(12, m.face > 0 ? m.x + m.w : m.x, m.y + m.h / 2);
  }
}
function mishaWord(sc: World, phase2: boolean): void {
  const m = sc.misha!, word = MISHA_WORDS[Math.floor(sc.rBoss() * MISHA_WORDS.length)]!;
  m.state = 'word'; m.t = 0.5 + word.length * 0.13 + 0.25;
  mishaSpeak(m, word + '!', m.t);
  const step = 26, half = ((word.length - 1) * step) / 2 + 14;
  const cx = clamp(m.x + m.w / 2, T + half + 6, (sc.L.W - 1) * T - half - 6);
  for (let i = 0; i < word.length; i++) {
    sc.projs.push({ kind: 'letter', ch: word[i], x: cx - ((word.length - 1) * step) / 2 + i * step - 11, y: m.y - 100, w: 22, h: 26,
      vx: 0, vy: 0, life: 4, delay: 0.42 + i * 0.1, launched: false, spd: phase2 ? 500 : 410, bounce: phase2 ? 1 : 0 });
  }
}
// диктант: буквы падают стеной по всей ширине, в стене есть проём — найди его
function mishaDictation(sc: World, waves: number): void {
  const x0 = 2 * T, x1 = (sc.L.W - 2) * T, step = 36, cols = Math.floor((x1 - x0) / step);
  const word = 'ДИКТАНТПРОВЕРКАОШИБОКДВОЙКА';
  for (let w = 0; w < waves; w++) {
    const gap = 2 + Math.floor(sc.rBoss() * (cols - 5));
    for (let i = 0; i < cols; i++) {
      if (i >= gap && i <= gap + 2) continue;
      sc.projs.push({ kind: 'rain', ch: word[(i + w * 5) % word.length], x: x0 + i * step, y: 4 * T + 6, w: 22, h: 26, vx: 0, vy: 330 + w * 40, life: 4, delay: 0.9 + w * 1.5 + i * 0.012 });
    }
  }
}
export function stepLetter(sc: World, pr: { x: number; y: number; vx: number; vy: number; dead?: boolean; [k: string]: unknown }, dt: number): void {
  if (!pr['launched']) {
    pr['launched'] = true;
    const [tp] = sc.nearestPlayer(pr.x + 11, pr.y + 13);
    const tx = tp ? tp.x + 7 : pr.x, ty = tp ? tp.y + 13 : pr.y + 200;
    const dx = tx - (pr.x + 11), dy = ty - (pr.y + 13), l = Math.hypot(dx, dy) || 1;
    pr.vx = (dx / l) * (pr['spd'] as number); pr.vy = (dy / l) * (pr['spd'] as number); sc.snd('letter'); if (sc.online === 'host') sc.sendEv({ k: 'snd', n: 'letter' });
  }
  pr.x += pr.vx * dt; pr.y += pr.vy * dt;
  const cx = pr.x + 11, cy = pr.y + 13;
  if (sc.isSolid(Math.floor(cx / T), Math.floor(cy / T))) {
    if ((pr['bounce'] as number) > 0) {
      (pr['bounce'] as number)--; pr.x -= pr.vx * dt * 2; pr.y -= pr.vy * dt * 2;
      const sx = sc.isSolid(Math.floor((cx + Math.sign(pr.vx) * 12) / T), Math.floor(cy / T));
      if (sx) pr.vx = -pr.vx; else pr.vy = -pr.vy;
    } else { pr.dead = true; sc.paperAt(6, cx, cy); }
  }
}
export function stepBigLetter(sc: World, pr: { x: number; y: number; vy: number; dead?: boolean }, dt: number): void {
  pr.vy = Math.min(pr.vy + 1100 * dt, 820); pr.y += pr.vy * dt;
  if (sc.isSolid(Math.floor((pr.x + 28) / T), Math.floor((pr.y + 60) / T))) {
    pr.dead = true; sc.dustAt(14, pr.x + 28, pr.y + 60); sc.paperAt(10, pr.x + 28, pr.y + 50); sc.shake(150, 0.008); sc.sfx('slam');
  }
}

// ===== ФАЗА «ПРОПУСТИТЕ!»: вид сверху, коридоры, Миша ведёт рукой по стене =====
interface Td { state: string; t: number; lane: number; mx: number; blocks: number; need: number; round: number; say: string; sayT: number; feint: boolean; fe: boolean }
export function tdGeo(): { x0: number; x1: number; lanes: { y0: number; y1: number }[]; walls: Rect[]; doors: number[][]; door: number; wt: number; start: number; goal: number } {
  const x0 = 96, x1 = TD_VW - 96, y0 = 122, lh = 104, wt = 14;
  const lanes = [0, 1, 2].map((i) => ({ y0: y0 + i * (lh + wt), y1: y0 + i * (lh + wt) + lh }));
  const L = x1 - x0, door = 84;
  const doors = [[x0 + L * 0.3, x0 + L * 0.72], [x0 + L * 0.5]];
  const walls: Rect[] = [{ x: x0 - wt, y: y0 - wt, w: L + wt * 2, h: wt }, { x: x0 - wt, y: lanes[2]!.y1, w: L + wt * 2, h: wt }];
  for (let i = 0; i < 2; i++) {
    const wy = lanes[i]!.y1; let sx = x0;
    for (const d of doors[i]!) { walls.push({ x: sx, y: wy, w: d - door / 2 - sx, h: wt }); sx = d + door / 2; }
    walls.push({ x: sx, y: wy, w: x1 - sx, h: wt });
  }
  return { x0, x1, lanes, walls, doors, door, wt, start: x0 + 34, goal: x1 - 26 };
}
export function tdBegin(sc: World, fromNet?: boolean): void {
  if (sc.td) return;
  const G = tdGeo(), m = sc.misha;
  const td: Td = { state: 'intro', t: 1.0, lane: 1, mx: G.start, blocks: 0, need: sc.nPlayers === 2 ? 4 : 3, round: 0, say: '', sayT: 0, feint: !!m && m['tdUsed'].length >= 2, fe: false };
  sc.td = td as unknown as Record<string, unknown>;
  const spots = [[G.x1 - 150, G.lanes[0]!.y0 + 52], [G.x1 - 150, G.lanes[2]!.y0 + 52]];
  sc.players.forEach((p, i) => {
    if (p.remote) return;
    if (p.downed) { p.downed = false; p.hp = Math.max(p.hp, 2); }
    p['tdx'] = spots[i % 2]![0]; p['tdy'] = spots[i % 2]![1]; p['tdDash'] = 0; p['tdDashCd'] = 0; p.atkT = 0; p.dashT = 0;
  });
  for (const pr of sc.projs) if (pr.kind !== 'bomb') pr.dead = true;
  sc.tdFlip = true;
  sc.emit('td', { on: true });
  if (!fromNet) { sc.sfx('roar'); sc.shake(400, 0.006); }
}
export function tdEnd(sc: World, success: boolean, fromNet?: boolean): void {
  if (!sc.td) return;
  sc.td = null;
  sc.emit('td', { on: false });
  for (const p of sc.players) if (!p.remote) { p.bombs = 3; p.inv = 1.2; }
  if (fromNet) return;
  const m = sc.misha!;
  if (success) {
    m.state = 'stun'; m.t = 3.2; m['hitCd'] = 0; m.vx = 0;
    mishaSpeak(m, 'НУ И ЛАДНО…', 1.6); sc.toastAll('Миша выдохся — рюкзак открыт!'); sc.sfx('gate');
  } else teamWipe(sc);
}
function tdPickLane(sc: World): void {
  const td = sc.td as unknown as Td, G = tdGeo();
  void G;
  let lane = Math.floor(sc.rBoss() * 3); if (lane === td.lane && sc.rBoss() < 0.6) lane = (lane + 1 + Math.floor(sc.rBoss() * 2)) % 3;
  td.lane = lane; td.mx = tdGeo().start; td.state = 'tele'; td.t = 1.1; td.round++; td.fe = false;
  td.say = ['ПОСТОРОНИСЬ!', 'Я ПРОЙДУ!', 'С ДОРОГИ!'][td.round % 3]!; td.sayT = 1.6;
}
function tdMove(sc: World, p: Player, dt: number): void {
  const G = tdGeo(), inp = p.inp || {}, r = 12;
  let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  p['tdDashCd'] -= dt; p['tdDash'] -= dt;
  if (inp.dashP && p['tdDashCd'] <= 0 && (dx || dy)) { p['tdDash'] = 0.16; p['tdDashCd'] = 0.5; sc.snd('dash'); }
  const sp = p['tdDash'] > 0 ? 620 : 250;
  if (dx || dy) p.face = dx > 0 ? 1 : dx < 0 ? -1 : p.face;
  const hit = (x: number, y: number): boolean => G.walls.some((w) => x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h);
  const nx = clamp(p['tdx'] + dx * sp * dt, G.x0 + r, G.x1 - r); if (!hit(nx, p['tdy'])) p['tdx'] = nx;
  const ny = p['tdy'] + dy * sp * dt; if (!hit(p['tdx'], ny)) p['tdy'] = ny;
}
export function tdStep(sc: World, dt: number): void {
  const td = sc.td as unknown as Td | null; if (!td) return;
  for (const p of sc.players) if (!p.remote) tdMove(sc, p, dt);
  td.sayT -= dt;
  const G = tdGeo();
  td.t -= dt;
  switch (td.state) {
    case 'intro': if (td.t <= 0) tdPickLane(sc); break;
    case 'tele': if (td.t <= 0) { td.state = 'walk'; sc.sfx('slam'); } break;
    case 'walk': {
      td.mx += (85 + td.round * 12) * dt;
      const ln = G.lanes[td.lane]!;
      const blocker = sc.players.find((p) => !p.downed && p['tdy'] > ln.y0 + 4 && p['tdy'] < ln.y1 - 4 && p['tdx'] - td.mx > 14 && p['tdx'] - td.mx < 46);
      if (blocker) {
        td.blocks++; td.state = 'blocked'; td.t = 1.3; td.say = 'ПРОПУСТИТЕ!'; td.sayT = 1.6;
        sc.sfx('roar'); sc.shake(220, 0.006);
      } else if (td.mx >= G.goal) { td.state = 'through'; td.t = 1.3; td.say = 'ПРОШЁЛ! ХА!'; td.sayT = 1.6; sc.sfx('win'); }
      else if (td.feint && !td.fe && td.mx > G.x0 + (G.x1 - G.x0) * 0.42) {
        // второй «Пропустите!»: на полпути Миша передумывает и перескакивает в другой коридор
        td.fe = true; td.lane = td.lane === 0 ? 1 : td.lane === 2 ? 1 : (sc.rBoss() < 0.5 ? 0 : 2); td.state = 'feint'; td.t = 0.9; // всегда в соседний коридор: двери рядом
        td.say = 'А НЕТ, ТУДА!'; td.sayT = 1.2; sc.sfx('roar');
      }
      break;
    }
    case 'feint': if (td.t <= 0) td.state = 'walk'; break;
    case 'blocked':
      if (td.t <= 0) { if (td.blocks >= td.need) { td.state = 'win'; td.t = 1.0; td.say = 'ВСЁ, ВСЁ, ПОНЯЛ…'; td.sayT = 1.6; } else tdPickLane(sc); }
      break;
    case 'through': if (td.t <= 0) tdEnd(sc, false); break;
    case 'win': if (td.t <= 0) tdEnd(sc, true); break;
  }
}
