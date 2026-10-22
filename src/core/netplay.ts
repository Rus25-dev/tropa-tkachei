/* eslint-disable @typescript-eslint/no-explicit-any */
// Игра вдвоём по сети (legacy/src/game.js: packPlayer, packSnap, onNet, applySnap, onEv, netSmooth, guestProjHits + обёртки из
// weapons/charms/movement2/tools/status/enemies2). Хост считает мир целиком; гость считает только своего героя, остальное получает
// снимками (20 раз в секунду) и событиями. Сообщения — простые объекты: упаковку в бинарный вид и доставку делает слой net/.
// Ядро ничего не знает о сети: исходящие события уходят через w.sendEv (событие 'nev' в очереди сессии), входящие применяются отсюда.
// БОССЫ НА ДАННЫХ ПО СЕТИ НЕ ПОДДЕРЖАНЫ: в снимок они не входят. Поэтому вход в арену по сети закрыт (campaign.netBossBlock), а Босс-тест по сети отключён в меню;
// остальное (уровни, коридоры, враги, снаряды, бусины, ворота, инструменты) синхронизируется как раньше.
import { CH_SHOW, HEAVY_KINDS, P, PERSIST_KINDS, dataIdx } from './balance';
import type { Enemy, Player, Proj } from './types';
import { applyUp, buy, freshUp, go as campaignGo } from './campaign';
import { knockFrom, deathFxLocal, bossOf, execBoss } from './bosses2';
import { parryPoise, silkBurstHit, respawnLocal } from './combat';
import { e2Parry, E2_STATES } from './enemies';
import { hurtPlayer } from './damage';
import { statusMask } from './status';
import { freezeEnemy, isToolKind, toolHurtBoss, toolSpawn, type ToolMsg } from './tools';
import { mkSw, wdef } from './weapons';
import { inset, overlap, type World } from './world';
import { kitChargeFrac, kitCode, kitFromNet, kitTrail } from './kit/moves';
import { netKindReg, toolEntReg } from './plugin/regs';

export type NetMsg = Record<string, any>;

/** виды на проводе в снимке гостя: снаряды (здесь) и сущности инструментов (src/content/tools, поле entities).
 *  Код netId общий для хоста и гостя (одна сборка) и только добавляется: 0–7 снаряды, 8–12 инструменты. */
const PROJ_NET: [string, number, number][] = [['spore', 12, 12], ['wave', 24, 18], ['rock', 16, 16], ['bomb', 12, 12], ['clef', 28, 40], ['note', 14, 18], ['echo', 40, 84], ['glob', 12, 12]];
PROJ_NET.forEach(([id, w, h], netId) => { if (!netKindReg.has(id)) netKindReg.define({ id, netId, size: [w, h] }); });
const netIdOf = (kind: string): number => netKindReg.get(kind)?.netId ?? -1;
const r10 = (x: number): number => Math.round(x * 10) / 10;
const r100 = (x: number): number => Math.round(x * 100) / 100;

// ---------- упаковка: герой ----------
/** поза и состояние своего героя: 30 раз в секунду напарнику */
export function packPlayer(_w: World, p: Player): NetMsg {
  const f2 = (v: number): number => r100(Math.max(0, v));
  const m: NetMsg = { t: 'p', i: p.i, x: r10(p.x), y: r10(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), f: p.face, g: p.onGround ? 1 : 0,
    d: f2(p.dashT), s: p.sit ? 1 : 0, h: f2(p.healT), l: f2(p.landT), hp: p.hp, mh: p.maxHp, sk: p.silk, dn: p.downed ? 1 : 0,
    iv: f2(p.inv), u: p.raw && p.raw.up ? 1 : 0, rv: f2(p.reviveT), sq: p['seq'] || 0, ad: p.atkDir, bm: p.bombs, hv: p['heavy'] ? 1 : 0, wp: p['weaponId'] || 'needle', tl: p['toolId'] || '' };
  if (p['charms'] && p['charms'].length) m['cm'] = p['charms'].join(',');
  m['wk'] = p['swk'] || 'g'; if ((p['chg'] || 0) > CH_SHOW) m['cg'] = r100(p['chg']);
  m['lg'] = p['ledge'] ? p['ledge'].side : 0; m['gl'] = p['gliding'] ? 1 : 0;
  const ks = kitCode(p); if (ks || p['kgF'] > 0) { m['ks'] = ks; m['kg'] = p['kgF'] | 0; const kc = kitChargeFrac(p); if (kc > 0) m['kc'] = r100(kc); } // приёмы набора игрока (v2.5): только если что-то идёт
  return m;
}
/** поза напарника (у хоста — гостя, у гостя — хоста) */
export function applyPlayer(w: World, m: NetMsg): void {
  const p = w.players[m['i']]; if (!p || !p.remote) return;
  const l0 = p['lastSeq'];
  Object.assign(p, { tx: m['x'], ty: m['y'], vx: m['vx'], vy: m['vy'], face: m['f'], onGround: !!m['g'], dashT: m['d'], sit: !!m['s'], healT: m['h'], landT: m['l'],
    hp: m['hp'], maxHp: m['mh'], silk: m['sk'], downed: !!m['dn'], inv: m['iv'], netUp: !!m['u'], reviveT: m['rv'], netT: 0, bombs: m['bm'] || 0, heavy: !!m['hv'], weaponId: m['wp'] || 'needle', toolId: m['tl'] || '', charms: m['cm'] ? String(m['cm']).split(',') : [] });
  p.inp = { up: p['netUp'] };
  if (m['sq'] !== p['lastSeq']) { p['lastSeq'] = m['sq']; p.atkT = P.ATK_T; p.atkHits = new Set(); p.atkDir = m['ad']; p.pogoed = true; }
  p['chg'] = m['cg'] || 0;
  if (p['lastSeq'] !== l0) { // новый удар удалённого героя: восстанавливаем его по оружию и коду удара
    const W = wdef(p), k = m['wk'] || 'g', e = W.sw && W.sw[k];
    p['swk'] = k; p['heavy'] = !!m['hv'];
    const dur = e && e.t != null ? e.t : (p['heavy'] ? W.finT : W.atkT);
    p.atkT = dur; p['sw'] = mkSw(W, k, p, dur);
  }
  p['ledgeDir'] = m['lg'] | 0; p['gliding'] = !!m['gl'];
  kitFromNet(p, m['ks'] | 0, m['kc'] || 0, m['kg'] | 0);
}

// ---------- упаковка: враги ----------
const packEnemy2 = (e: Enemy): unknown => {
  if (!e['e2']) return 0;
  return [Math.max(0, E2_STATES[e.type]!.indexOf(e['state'])), r100(Math.max(0, e['st'])), e['armorT'] > 0 ? 1 : 0, e['blockT'] > 0 ? 1 : 0];
};
const applyEnemy2 = (e: Enemy, a: number[]): void => {
  if (!e['e2'] || !a) return;
  const L = E2_STATES[e.type]!; e['state'] = L[a[0]!] || L[0]!; e['st'] = a[1]; e['armorT'] = a[2] ? 1 : 0; if (a[3]) e['blockT'] = 0.15;
};
/** снимок мира для гостя: 20 раз в секунду */
export function packSnap(w: World): NetMsg {
  const r = Math.round;
  const st = (e: Enemy): number => (e['state'] === 'wind' || e['state'] === 'charge') ? 1 : e['state'] === 'stun' ? 2 : 0;
  const s: NetMsg = { t: 's',
    e: w.enemies.map((e) => [r(e.x), r(e.y), e.face, e.dead ? 1 : 0, e.flash > 0 ? 1 : 0, st(e), packEnemy2(e)]),
    pr: w.projs.map((q) => [netIdOf(q.kind), r(q.x), r(q.y), r(q.vx), r(q.vy), (q.delay ?? 0) > 0 ? 1 : 0, q['ch'] || '']),
    bd: w.beadsArr.map((d) => [r(d.x), r(d.y)]), bc: w.beads,
    g: w.gates.map((gt) => (gt.closed ? 1 : 0)), bD: w.bossDead ? 1 : 0, rs: [r(w.respawn.x), r(w.respawn.y)] };
  // статусы (status.js): маски только если что-то горит
  let any = false;
  (s['e'] as unknown[][]).forEach((a, i) => { const k = statusMask(w, w.enemies[i]!); if (k) { a[7] = k; any = true; } });
  void any;
  // инструменты (tools.js): снаряды хоста уходят строками снарядов, замёрзшие враги — списком
  for (const q of w.tl as Record<string, any>[]) {
    const d = toolEntReg.get(q['kind']), ch = d?.netCh ? d.netCh(q) : [r100(q['fuse'])];
    (s['pr'] as unknown[]).push([netIdOf(q['kind']), r(q['x']), r(q['y']), r(q['vx']), r(q['vy']), 0, ch]);
  }
  const fz: number[] = []; w.enemies.forEach((e, i) => { if (!e.dead && e['frozenT'] > 0) fz.push(i); });
  if (fz.length) s['tf'] = fz;
  return s;
}

/** применить снимок хоста у гостя */
export function applySnap(w: World, m: NetMsg): void {
  (m['e'] as unknown[][]).forEach((a, i) => {
    const e = w.enemies[i]; if (!e) return;
    const dead = !!a[3];
    if (e['tx'] == null || dead !== e.dead || Math.abs(e.x - (a[0] as number)) > 90) { e.x = a[0] as number; e.y = a[1] as number; }
    e['tx'] = a[0]; e['ty'] = a[1]; e.face = a[2] as number;
    e.dead = dead; if (a[4]) e.flash = 0.1;
    e['state'] = a[5] === 1 ? 'charge' : a[5] === 2 ? 'stun' : 'walk';
    if (a[6]) applyEnemy2(e, a[6] as number[]);
    e['stv'] = (a[7] as number) | 0;
  });
  const old = w.projs;
  w.projs = (m['pr'] as unknown[][]).map((a, i) => {
    const nk = netKindReg.byNetId(a[0] as number)!, kind = nk.id, sz = nk.size;
    const q: Proj = { kind, x: a[1] as number, y: a[2] as number, vx: a[3] as number, vy: a[4] as number, delay: a[5] ? 1 : 0, ch: a[6], w: sz[0], h: sz[1], life: 1 };
    q['rot'] = old[i] && old[i]!.kind === q.kind ? old[i]!['rot'] || 0 : 0;
    return q;
  });
  w.beadsArr = (m['bd'] as number[][]).map((a) => ({ x: a[0]!, y: a[1]!, w: 8, h: 8 })) as never;
  w.beads = m['bc'];
  (m['g'] as number[]).forEach((c, i) => { if (w.gates[i] && !!w.gates[i]!.closed !== !!c) w.setGate(w.gates[i]!, !!c); });
  w.bossDead = !!m['bD']; w.respawn = { x: m['rs'][0], y: m['rs'][1] };
  // инструменты и статусы
  const fz = new Set<number>(m['tf'] || []);
  w.enemies.forEach((e, i) => { e['frozenT'] = fz.has(i) ? 0.3 : 0; });
}

// ---------- события напарнику ----------
/** предмет-способность: напарник подобрал (хост запоминает и сохраняет, гость убирает предмет с карты) */
function itemEv(w: World, m: NetMsg): void {
  if (!m['a']) return;
  w.abil[m['a']] = true;
  const it = w.items.find((q) => q['ability'] === m['a']);
  if (it) { w.parts(30, it['px'] as number, it['py'] as number, 0xffe3a3); w.toast(it['text'] as string, 5); }
  w.items = w.items.filter((q) => q['ability'] !== m['a']);
  if (w.auth()) w.emit('save', { progress: { ...(w.progress || { bench: 0, beads: w.beads }), abil: w.abil } });
}
export function onEv(w: World, m: NetMsg): void {
  const auth = w.auth();
  switch (m['k']) {
    case 'snd': w.snd(m['n']); break;
    case 'smoke': w.emit('smoke', { n: m['n'], x: m['x'], y: m['y'] }); break;
    case 'paper': w.emit('paper', { n: m['n'], x: m['x'], y: m['y'] }); break;
    case 'foam': w.emit('foam', { n: m['n'], x: m['x'], y: m['y'] }); break;
    case 'burst': w.emit('burst', { n: m['n'], x: m['x'], y: m['y'], c: m['c'] }); break;
    case 'dust': w.emit('dust', { n: m['n'], x: m['x'], y: m['y'] }); break;
    case 'shake': w.emit('shake', { d: m['d'], i: m['i'] }); break;
    case 'toast': w.toast(m['m']); break;
    case 'flash': w.emit('flash', { ms: 260, r: 255, g: 240, b: 220 }); break;
    case 'bomb': if (auth && w.L.crates) w.projs.push({ kind: 'bomb', ...m['b'], w: 12, h: 12, life: 3, owner: m['i'] } as Proj); break;
    case 'cut':
      if (auth) {
        const kind = m['kind'] || 'spore';
        const q = w.projs.find((pr) => pr.kind === kind && !pr.dead && Math.abs(pr.x - m['x']) < 40 && Math.abs(pr.y - m['y']) < 40);
        if (q) { q.dead = true; w.burst(6, q.x + q.w / 2, q.y + q.h / 2, 0xffd47a); w.sfx('clink'); }
      }
      break;
    case 'burstSkill': if (auth && w.players[1]) silkBurstHit(w, w.players[1], m['x'], m['y']); break;
    case 'deathfx': deathFxLocal(w); break;
    case 'execfx': { const q = w.players[m['i']]; if (q && q.remote) { q['execT'] = 0.4; q['execDir'] = m['d']; } w.emit('execFx', { x: m['x'], y: m['y'], dir: m['d'] }); break; }
    case 'exec': if (auth) { const q = w.players[m['i']], key = String(m['key']); if (q && dataIdx(key) >= 0 && bossOf(w, key as 'd0')) execBoss(w, q, { key: key as 'd0' }, m['d']); } break;
    case 'abil': itemEv(w, m); break;
    case 'parrypoise': if (auth) parryPoise(w, m['x'], m['y'], !!m['pf']); break;
    case 'e2parry': if (auth) e2Parry(w, m['x'], m['y']); break;
    case 'kb': knockFrom(w, m['x']); break;
    case 'silk': { const p = w.players[m['i']]; if (p && !p.remote) p.silk = Math.min(w.silkMax, p.silk + 1); break; }
    case 'bench':
      w.respawn = { x: m['x'], y: m['y'] };
      for (const q of w.players) if (q.downed && !q.remote) { q.downed = false; q.hp = 2; q.inv = 1.5; q.x = m['x'] - 7 + 22; q.y = m['y'] - 26; w.snd('revive'); }
      w.toast('Напарник отдыхает на скамье: здесь вы очнётесь');
      break;
    case 'reviveAll': for (const q of w.players) if (q.downed && !q.remote) { q.downed = false; q.hp = 2; q.inv = 1.5; } break;
    case 'wipe':
      if (w.wiping) break;
      w.wiping = true; for (const q of w.players) if (!q.remote) q.downed = true;
      w.toast('Нить оборвалась…');
      w.after(0.7, () => w.emit('fade', { out: true, ms: 600 }));
      break;
    case 'respawn': w.respawn = { x: m['x'], y: m['y'] }; respawnLocal(w); break;
    case 'win': if (!w.won) { w.won = true; w.snd('win'); w.emit('victory', { s: m['s'] }); } break;
    // инструменты (tools.js)
    case 'tool': if (auth) toolSpawn(w, m as ToolMsg); break;
    case 'tfx': w.tfx.push({ ...m }); break;
    case 'thook': {
      if (!auth) break;
      const p = w.players[m['i']];
      if (m['t'] === 'e') freezeEnemy(w, w.enemies[m['idx']], m['s'] ? 0.6 : 0.2);
      else if (p) { const key = String(m['key']) as 'd0', bb = dataIdx(key) >= 0 ? bossOf(w, key) : null; if (bb && !['dead', 'gone', 'sleep', 'intro'].includes(bb.state) && bb.stagger > 0) toolHurtBoss(w, key, p, 1); }
      break;
    }
    // кампания (campaign.js)
    case 'next': if (w.online === 'guest' && !w.leaving) campaignGo(w, m['camp']); break;
    case 'buy': if (auth) buy(w, m['id'], true); break;
    case 'up': w.up = { ...freshUp(), ...m['up'] }; w.beads = m['beads']; applyUp(w); w.emit('shopRefresh'); break;
  }
}

// ---------- сглаживание и проверки у гостя ----------
/** кадр отрисовки: плавно подтягиваем напарника (и у гостя — врагов, боссов, снаряды) к последнему принятому состоянию */
export function netSmooth(w: World, dt: number): void {
  const k = 1 - Math.exp(-dt * 16);
  for (const p of w.players) {
    if (!p.remote || p['tx'] == null) continue;
    p['netT'] = (p['netT'] || 0) + dt;
    const ex = Math.min(p['netT'], 0.12), tx = p['tx'] + p.vx * ex, ty = p['ty'] + (p.onGround ? 0 : p.vy * ex);
    if (Math.abs(tx - p.x) > 160 || Math.abs(ty - p.y) > 160) { p.x = tx; p.y = ty; } else { p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; }
    if (p.dashT > 0) { p.dashT -= dt; (p.trail as unknown[]).push({ x: p.x + 7, y: p.y + 26, a: 1, f: p.face, s: kitTrail(p, true) }); }
    else { const s = kitTrail(p, false); if (s) (p.trail as unknown[]).push({ x: p.x + 7, y: p.y + 26, a: 1, f: p.face, s }); }
    p.inv -= dt; p.healT -= dt; p.landT -= dt; p['execT'] = (p['execT'] || 0) - dt;
    for (const tr of p.trail as { a: number }[]) tr.a -= dt * 5;
    p.trail = (p.trail as { a: number }[]).filter((tr) => tr.a > 0);
  }
  if (w.online === 'guest') {
    const k2 = 1 - Math.exp(-dt * 14);
    for (const e of w.enemies) if (!e.dead && e['tx'] != null) { e.x += (e['tx'] - e.x) * k2; e.y += (e['ty'] - e.y) * k2; e.flash -= dt; }
    for (const pr of w.projs) {
      if (pr.delay) continue;
      if (pr.kind === 'clef') pr['rot'] = (pr['rot'] || 0) + dt * 10;
      if (pr.kind === 'spore') pr.vy += 700 * dt;
      else if (['rock', 'bomb', 'note'].includes(pr.kind)) pr.vy = Math.min(pr.vy + 1100 * dt, 800);
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    }
  }
}

/** гость: попадания снарядов в своего героя (снаряды ему приходят в снимке) */
export function guestProjHits(w: World): void {
  const keep: Proj[] = w.projs.filter((q) => isToolKind(q.kind));
  w.projs = w.projs.filter((q) => !isToolKind(q.kind));
  try {
    for (const p of w.players) {
      if (p.remote || p.downed || p.inv > 0) continue;
      for (const pr of w.projs) if (!pr.dead && !pr.delay && pr.kind !== 'bomb' && overlap(inset(p, 2), pr)) {
        hurtPlayer(w, p, HEAVY_KINDS.has(pr.kind) ? 2 : 1, pr.x + pr.w / 2, false, pr.hk); if (!PERSIST_KINDS.has(pr.kind)) pr.dead = true; break;
      }
    }
    w.projs = w.projs.filter((q) => !q.dead);
  } finally { w.projs = w.projs.concat(keep); }
}

/** напарник пропал: хост продолжает один; если некому поднять героя в коконе — нить обрывается */
export function partnerLost(w: World): void {
  if (w.online !== 'host') return;
  w.players = w.players.filter((p) => !p.remote);
  w.online = null; w.nPlayers = 1;
  w.toast('Связь с напарником потеряна. Игра продолжается в одиночку');
  if (w.players.length && w.players.every((p) => p.downed)) w.teamWipe();
}
