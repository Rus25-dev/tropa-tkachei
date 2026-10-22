// Проверки честности волны 0 (поверх validate.ts): тело и трансформация, неподвижные боссы, уязвимые точки, существа, сущности арены, дирижёр нескольких боссов.
// Чистый TS, годится и для CLI (npm run boss:check), и для Vitest. Каждая находка — Issue: error (нечестно) или warn (подозрительно), текст по-русски.
import { P } from '../balance';
import { resolveAnti } from './anti';
import { effForm } from './form';
import { policyOf } from './policy';
import { activeEnd, arenaEnts, type ArenaEnt, type Attack, type BossDef, type Rules } from './schema';
import { attackEvents, bestInWindow, stepSpan, type Add, type ArenaInfo, type HitEvent } from './validate';

const FPS = 60;
const fr = (sec: number): number => Math.round(sec * FPS);
/** высота полосы «герой стоит на поверхности», px: зона урона, задевающая эту полосу, делает поверхность опасной */
const BAND = 44;

export function validateExtra(def: BossDef, rules: Rules, arena: ArenaInfo | undefined, add: Add, resolve: (id: string) => BossDef | undefined): void {
  bodies(def, arena, add);
  weakPoints(def, rules, add);
  creatures(def, rules, add);
  arenaEntities(def, rules, arena, add);
  conductor(def, rules, add, resolve);
  if (def.duel) add('warn', 'duel-wiring', 'duel: true — запуск раунда дуэли для боссов на данных ещё не подключён (волна 1): босс попадёт в список, но раунд не стартует', {});
  for (const [pi, ph] of def.phases.entries()) if (ph.silent && ph.rageFrames > 0) add('warn', 'silent-rage', `фаза ${pi + 1}: silent игнорирует rageFrames ${ph.rageFrames}`, { phase: pi + 1 });
  for (const [pi, ph] of def.phases.entries()) if (ph.scene && !ph.scene.skippable && ph.scene.frames > 60) add('warn', 'scene-unskippable', `фаза ${pi + 1}: сцена ${ph.scene.frames} кадров не пропускается — игроку, который пробует босса в сотый раз, это надоедает`, { phase: pi + 1 });
}

// ---------- тело, трансформация, неподвижный и летающий ----------
function bodies(def: BossDef, arena: ArenaInfo | undefined, add: Add): void {
  const anti = resolveAnti(def);
  let anyStill = false;
  def.phases.forEach((_ph, pi) => {
    const e = effForm(def, pi + 1), pol = policyOf(def, pi + 1), where = { phase: pi + 1 };
    anyStill ||= e.still;
    if (e.attacks) {
      const set = e.attacks, ok = pol.chains.filter((id) => def.chains.find((c) => c.id === id)?.steps.every((st) => set.has(st.attack)));
      if (!ok.length) add('error', 'form-empty', `фаза ${pi + 1}: набор приёмов тела не содержит ни одной связки политики — босс будет стоять столбом`, where);
      else for (const id of pol.chains) if (!ok.includes(id)) add('warn', 'form-blocked', `фаза ${pi + 1}: связка «${id}» политики недоступна телу (шаги вне набора приёмов)`, { ...where, chain: id });
    }
    if (e.still) {
      for (const id of pol.chains) for (const st of def.chains.find((c) => c.id === id)?.steps ?? []) {
        const a = def.attacks.find((x) => x.id === st.attack);
        if (a?.move.length) add('warn', 'still-move', `фаза ${pi + 1}: неподвижный босс, но у атаки «${a.id}» есть move — движение игнорируется`, { ...where, attack: a.id });
      }
      if (e.idle.walkSpeed > 0) add('warn', 'still-walk', `фаза ${pi + 1}: неподвижный босс, но idle.walkSpeed ${e.idle.walkSpeed}`, where);
    }
    if (arena) {
      if (e.size.w > arena.w || e.size.h > arena.h) add('error', 'body-size', `фаза ${pi + 1}: тело ${e.size.w}×${e.size.h} больше арены ${arena.w}×${arena.h}`, where);
      if (e.fly && e.fly.hover + e.size.h > arena.h - 32) add('error', 'fly-ceiling', `фаза ${pi + 1}: летающее тело (hover ${e.fly.hover} + высота ${e.size.h}) упирается в потолок арены ${arena.h}`, where);
    }
    if (e.fly && e.fly.hover < 16 && !e.still) add('warn', 'fly-low', `фаза ${pi + 1}: летающее тело держится ниже 16 px над полом — герой не сможет пройти под ним, и оно почти наземное`, where);
  });
  // неподвижного босса можно «пересидеть» вдали, куда не достают его приёмы: нужна перемещающая связка (relocateChain) — ранний выстрел по герою
  if (anyStill && anti && !anti.relocateChain) add('error', 'still-relocate', 'неподвижный босс без antiCheese.relocateChain: герой может стоять вне досягаемости и бить издали — нужна связка, достающая героя везде (снаряды, зоны арены)', {});
  if (anyStill && anti?.relocateChain) {
    const c = def.chains.find((x) => x.id === anti.relocateChain);
    // связка перемещения должна доставать героя там, где он стоит: удар/снаряд «в точку героя» (at/from: target) или зона арены (fire); снаряды с гравитацией до далёкой платформы не долетят
    const reach = c?.steps.some((st) => { const a = def.attacks.find((x) => x.id === st.attack); return a && (a.spawn.some((x) => x.from === 'target') || a.active.some((h) => h.hit.at === 'target') || a.fire.length > 0); });
    if (c && !reach) add('warn', 'still-relocate-reach', `связка «${c.id}» (relocateChain) неподвижного босса не накрывает героя там, где он стоит (нет from/at: target и нет запуска зон арены): отсидка на далёкой или высокой платформе останется безопасной`, { chain: c.id });
  }
}

// ---------- уязвимые точки ----------
function weakPoints(def: BossDef, rules: Rules, add: Add): void {
  const minOpen = rules.weak?.minOpenFrames ?? 0, atk = new Map(def.attacks.map((a) => [a.id, a]));
  const lens = new Map<string, number>();
  def.phases.forEach((_ph, pi) => {
    const e = effForm(def, pi + 1); if (!e.weak.length) return;
    const pol = policyOf(def, pi + 1), where = { phase: pi + 1 };
    const reach = new Set<string>();
    const chainIds = new Set([...pol.chains, ...pol.priority.map((p) => p.chain), ...(def.phases[pi]!.enterChain ? [def.phases[pi]!.enterChain!] : []), ...(def.antiCheese?.shoveChain ? [def.antiCheese.shoveChain] : []), ...(def.antiCheese?.relocateChain ? [def.antiCheese.relocateChain] : [])]);
    for (const id of chainIds) for (const st of def.chains.find((c) => c.id === id)?.steps ?? []) reach.add(st.attack);
    if (def.conductor) for (const a of def.attacks) reach.add(a.id); // атаки раздаёт дирижёр
    const minRest = pol.restFrames[0];
    for (const w of e.weak) {
      const inside = w.box.x < def.size.w && w.box.x + w.box.w > 0 && w.box.y < def.size.h && w.box.y + w.box.h > 0;
      if (!inside) add('warn', 'weak-box', `фаза ${pi + 1}: точка «${w.id}» вне тела босса (${e.size.w}×${e.size.h}) — в неё не попасть`, where);
      if (!w.open.length) continue;
      let best = 0, possible = false;
      for (const o of w.open) {
        const a: Attack | undefined = o.attack ? atk.get(o.attack) : undefined;
        if (o.attack && !reach.has(o.attack)) continue; // атака недоступна в этой фазе
        possible = true;
        const full = o.on === 'always' ? Infinity : o.on === 'idle' ? Math.max(minRest, 1) : o.on === 'stagger' ? Infinity
          : o.on === 'tell' ? (a ? a.tell.frames : minOf(def, (x) => x.tell.frames))
          : o.on === 'active' ? (a ? Math.max(0, activeEnd(a)) + 1 : minOf(def, (x) => Math.max(0, activeEnd(x)) + 1))
          : o.on === 'recover' ? (a ? a.recovery.frames : minOf(def, (x) => x.recovery.frames))
          : (a ? a.recovery.punishWindow.to - a.recovery.punishWindow.from + 1 : minOf(def, (x) => x.recovery.punishWindow.to - x.recovery.punishWindow.from + 1));
        const len = Math.min(full, (o.to ?? Infinity) + 1) - (o.from ?? 0);
        best = Math.max(best, len);
        if (len > 0 && len < minOpen) add('warn', 'weak-window', `фаза ${pi + 1}: окно точки «${w.id}» (${o.on}${o.attack ? ' ' + o.attack : ''}) ${len} кадров — короче нормы ${minOpen}`, { ...where, attack: o.attack });
      }
      lens.set(w.id, Math.max(lens.get(w.id) ?? 0, best));
      if (!possible) add('error', 'weak-unreachable', `фаза ${pi + 1}: точка «${w.id}» открывается только во время атак, которых нет в связках фазы — босса нельзя ранить`, where);
      else if (best < minOpen) add('error', 'weak-short', `фаза ${pi + 1}: точка «${w.id}» открыта не дольше ${Math.max(0, best)} кадров подряд, норма ${minOpen} — успеть ударить нельзя`, where);
    }
    if (e.weak.every((w) => w.open.length && w.open.every((o) => o.attack && !reach.has(o.attack)))) add('error', 'weak-none', `фаза ${pi + 1}: ни одна уязвимая точка не открывается — босс неуязвим`, where);
  });
}
function minOf(def: BossDef, f: (a: Attack) => number): number { return Math.min(...def.attacks.map(f)); }

// ---------- существа ----------
function creatures(def: BossDef, rules: Rules, add: Add): void {
  if (!def.creatures.length) return;
  const maxTotal = rules.minions?.maxTotal ?? 8;
  for (const c of def.creatures) {
    const at = `существо «${c.id}»`;
    if (c.max > maxTotal) add('warn', 'creature-max', `${at}: max ${c.max} больше общего потолка ${maxTotal}`, {});
    if (c.life !== undefined && c.fade >= c.life) add('error', 'creature-fade', `${at}: fade ${c.fade} кадров не меньше life ${c.life}`, {});
    if (c.life !== undefined && c.fade < 20 && (c.contact || c.attacks.length)) add('warn', 'creature-fade-short', `${at}: бледнеет за ${c.fade} кадров до исчезновения — игрок не заметит, что оно безвредно`, {});
    if (!c.contact && !c.attacks.length) add('warn', 'creature-harmless', `${at}: без contact и без приёмов — оно безвредно`, {});
    for (const a of c.attacks) {
      const kinds = new Set([...a.active.map((x) => x.kind), ...a.spawn.map((x) => x.kind)]);
      let need = 0;
      for (const k of kinds) need = Math.max(need, rules.minTellFrames[k]);
      if (kinds.size && a.tell.frames < need) add('error', 'creature-tell', `${at}, приём «${a.id}»: замах ${a.tell.frames} кадров короче нормы ${need}`, { attack: a.id });
      if (a.recovery.frames < rules.minRecoveryFrames) add('error', 'creature-recovery', `${at}, приём «${a.id}»: восстановление ${a.recovery.frames} кадров короче нормы ${rules.minRecoveryFrames}`, { attack: a.id });
    }
    const used = new Set(def.attacks.flatMap((a) => a.summon.map((s) => s.creature)));
    for (const e of arenaEnts(def)) if (e.kind === 'spawner') for (const t of e.timeline) if (t.creature) used.add(t.creature);
    if (!used.has(c.id)) add('warn', 'creature-unused', `${at} никогда не призывается (ни attack.summon, ни spawner)`, {});
    if (c.attacks.length && !c.chains.length) add('warn', 'creature-nochain', `${at}: приёмы заданы, а мини-связок (chains) нет — приёмы не используются`, {});
  }
  for (const a of def.attacks) for (const s of a.summon) {
    const c = def.creatures.find((x) => x.id === s.creature);
    if (c && s.count > c.max) add('warn', 'summon-over', `атака «${a.id}»: призыв ${s.count} «${c.id}» при max ${c.max} — лишние пропадут`, { attack: a.id });
  }
}

// ---------- сущности арены ----------
interface Danger { t0: number; t1: number; x: number; y: number; w: number; h: number; aim: boolean; id: string }
interface Vis { t0: number; t1: number; x: number; y: number; w: number; h: number; id: string }
const HORIZON = 3600;

function arenaEntities(def: BossDef, rules: Rules, arena: ArenaInfo | undefined, add: Add): void {
  const ents = arenaEnts(def); if (!ents.length) return;
  const R = rules.arena;
  if (R && ents.length > R.maxEnts) add('error', 'ent-count', `сущностей арены ${ents.length}, норма не больше ${R.maxEnts}`, {});
  const referenced = new Set<string>();
  const groups = new Map<string, { off: number; e: ArenaEnt }[]>();
  const push = (k: string, off: number, e: ArenaEnt): void => { const l = groups.get(k) ?? []; l.push({ off, e }); groups.set(k, l); };
  for (const e of ents) {
    const b = e.bind;
    if (b?.start) push('start', 0, e);
    for (const n of b?.phase ?? []) push(`фаза ${n}`, 0, e);
    if (b?.chain) push(`связка ${b.chain} шаг ${(b.step ?? 0) + 1}`, 0, e);
  }
  for (const a of def.attacks) for (const f of a.fire) { const e = ents.find((x) => x.id === f.ent); if (e) { referenced.add(e.id); push(`атака ${a.id}`, a.tell.frames + f.at, e); } }
  for (const s of def.conductor?.schedule ?? []) if (s.arena) { const e = ents.find((x) => x.id === s.arena); if (e) { referenced.add(e.id); push(`дирижёр, такт ${s.beat}`, 0, e); } }
  for (const e of ents) {
    const at = `сущность арены «${e.id}»`, where = {};
    if (!e.bind && !referenced.has(e.id) && (e.kind === 'beam' || e.kind === 'spawner' || e.timeline.length)) add('warn', 'ent-unused', `${at} не запускается ни bind, ни attack.fire, ни дирижёром`, where);
    if (arena) geometry(e, arena, add, at);
    if (R) rulesOfEnt(e, rules, add, at);
  }
  // безопасное место: в любой момент группы сущностей остаётся пол или платформа не уже minSafeWidth, не задетые зонами урона
  if (arena && R) for (const [name, list] of groups) safeSpot(name, list, arena, R.minSafeWidth, add);
}
function geometry(e: ArenaEnt, arena: ArenaInfo, add: Add, at: string): void {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  if (e.kind === 'spawner') { if (e.pos.x < 0 || e.pos.x > arena.w || e.pos.y < 0 || e.pos.y > arena.h) add('error', 'ent-bounds', `${at}: точка (${e.pos.x}, ${e.pos.y}) вне арены ${arena.w}×${arena.h}`, {}); return; }
  rects.push(e.area);
  if (e.kind === 'beam') for (const op of e.timeline) if (op.area) rects.push(op.area);
  if (e.kind === 'platform' || e.kind === 'barrier') for (const op of e.timeline) if (op.op === 'move') rects.push({ ...e.area, x: op.to.x, y: op.to.y });
  for (const r of rects) if (r.x < 0 || r.y < 0 || r.x + r.w > arena.w || r.y + r.h > arena.h) add('error', 'ent-bounds', `${at}: область (${r.x}, ${r.y}, ${r.w}×${r.h}) выходит за арену ${arena.w}×${arena.h} (x — от левой стены, y — от пола вверх)`, {});
}
function rulesOfEnt(e: ArenaEnt, rules: Rules, add: Add, at: string): void {
  const R = rules.arena!;
  if (e.kind === 'platform' || e.kind === 'barrier') {
    const solid = e.kind === 'barrier' || e.solid;
    for (const op of e.timeline) {
      if (op.op === 'hide' && op.warn < R.minWarnFrames) add('error', 'plat-hide-warn', `${at}: исчезает с предупреждением ${op.warn} кадров (кадр ${op.at}), норма ${R.minWarnFrames} — герой не успеет уйти`, { frame: op.at });
      if (op.op === 'show' && solid && op.warn < R.minWarnFrames) add('error', 'plat-show-warn', `${at}: твёрдая площадка появляется с предупреждением ${op.warn} кадров (кадр ${op.at}), норма ${R.minWarnFrames} — она может замуровать героя`, { frame: op.at });
      if (op.op === 'move') {
        const steps = Math.max(Math.abs(op.to.x - e.area.x), Math.abs(op.to.y - e.area.y)) / 32;
        if (steps > 0 && op.frames / steps < R.minStepFrames) add('error', 'plat-fast', `${at}: ход на ${steps} клеток за ${op.frames} кадров — клетка быстрее ${R.minStepFrames} кадров, героя на ней не удержать`, { frame: op.at });
      }
    }
    if (e.kind === 'barrier' && e.timeline.length && !e.timeline.some((op) => op.op === 'hide') && !e.loop) add('warn', 'barrier-forever', `${at}: появляется и никогда не исчезает — арена сужается до конца боя`, {});
  } else if (e.kind === 'beam') {
    for (const op of e.timeline) {
      const need = rules.minTellFrames[e.hit];
      if (op.tell < need) add('error', 'beam-tell', `${at}: замах луча (${e.hit}) ${op.tell} кадров короче нормы ${need}`, { frame: op.at });
      if (op.aim && op.tell < 30) add('warn', 'beam-aim', `${at}: луч, наводящийся на героя, с замахом ${op.tell} кадров — слишком быстро для следящей зоны`, { frame: op.at });
    }
  } else {
    for (const op of e.timeline) {
      const need = op.creature ? rules.minTellFrames.parry : rules.minTellFrames[op.kind];
      if (op.tell < need) add('error', 'spawn-tell', `${at}: ${op.creature ? 'появление существа' : `снаряд (${op.kind})`} с замахом ${op.tell} кадров (кадр ${op.at}), норма ${need} — точка должна предупреждать`, { frame: op.at });
    }
  }
}

function unroll<T>(e: ArenaEnt, off: number, f: (shift: number) => T[]): T[] {
  const out: T[] = [];
  if (e.loop) for (let k = 0; off + k * e.loop < HORIZON; k++) out.push(...f(off + k * e.loop));
  else out.push(...f(off));
  return out;
}
function visOf(e: ArenaEnt, off: number): Vis[] {
  if (e.kind !== 'platform' && e.kind !== 'barrier') return [];
  const out: Vis[] = [];
  const a = e.area;
  if (!e.timeline.length) return e.shown ? [{ t0: 0, t1: Infinity, ...a, id: e.id }] : [];
  for (const base of unroll(e, off, (s) => [s])) {
    let v = e.shown && base === off ? 0 : -1;
    for (const op of e.timeline) {
      if (op.op === 'show') { if (v < 0) v = base + op.at + op.warn; }
      else if (op.op === 'hide') { if (v >= 0) { out.push({ t0: v, t1: base + op.at + op.warn, ...a, id: e.id }); v = -1; } }
    }
    if (v >= 0) out.push({ t0: v, t1: e.loop ? base + e.loop : Infinity, ...a, id: e.id });
  }
  return out;
}
function dangerOf(e: ArenaEnt, off: number): Danger[] {
  if (e.kind !== 'beam') return [];
  return unroll(e, off, (s) => e.timeline.map((op): Danger => { const r = op.area ?? e.area; return { t0: s + op.at + op.tell, t1: s + op.at + op.tell + op.active, ...r, aim: op.aim, id: e.id }; }));
}
function safeSpot(name: string, list: { off: number; e: ArenaEnt }[], arena: ArenaInfo, minW: number, add: Add): void {
  const dangers = list.flatMap(({ e, off }) => dangerOf(e, off)).filter((d) => !d.aim && d.t0 < HORIZON);
  if (!dangers.length) return;
  const vis = list.flatMap(({ e, off }) => visOf(e, off));
  const times = new Set<number>();
  for (const d of dangers) { times.add(d.t0); times.add(d.t1 - 1); }
  for (const t of [...times].sort((a, b) => a - b)) {
    const act = dangers.filter((d) => d.t0 <= t && t < d.t1);
    if (!act.length) continue;
    // поверхности: пол (весь) и видимые в этот миг платформы; свободная длина = поверхность минус зоны, задевающие полосу над ней
    const surfaces: { x0: number; x1: number; top: number }[] = [{ x0: 0, x1: arena.w, top: 0 }];
    for (const v of vis) if (v.t0 <= t && t < v.t1) surfaces.push({ x0: v.x, x1: v.x + v.w, top: v.y + v.h });
    let ok = false;
    for (const s of surfaces) {
      const cuts = act.filter((d) => d.y < s.top + BAND && d.y + d.h > s.top).map((d) => [Math.max(s.x0, d.x), Math.min(s.x1, d.x + d.w)] as const).filter((c) => c[1] > c[0]).sort((a, b) => a[0] - b[0]);
      let cur = s.x0, best = 0;
      for (const [a, b] of cuts) { best = Math.max(best, a - cur); cur = Math.max(cur, b); }
      best = Math.max(best, s.x1 - cur);
      if (best >= minW) { ok = true; break; }
    }
    if (!ok) { add('error', 'beam-no-safe', `${name}: на кадре ${t} зоны урона (${[...new Set(act.map((d) => d.id))].join(', ')}) закрывают весь пол и все платформы — безопасного места шире ${minW} px нет`, { frame: t }); return; }
  }
}

// ---------- дирижёр ----------
function conductor(def: BossDef, rules: Rules, add: Add, resolve: (id: string) => BossDef | undefined): void {
  const cd = def.conductor; if (!cd) return;
  const F = rules.fairness, RC = rules.conductor;
  const defs: (BossDef | undefined)[] = [def, ...cd.members.map((m) => resolve(m.boss))];
  cd.members.forEach((m, k) => { if (!defs[k + 1]) add('error', 'cond-member', `дирижёр: нет босса «${m.boss}» в реестре — файл data/bosses/${m.boss}.json`, {}); });
  if (defs.some((d) => !d)) return;
  const ds = defs as BossDef[];
  if (cd.pool && new Set(ds.map((d) => d.hp.join('/'))).size > 1) add('warn', 'cond-pool-hp', 'общий пул здоровья берётся у ведущего; hp участников в их файлах игнорируется', {});
  if (!cd.schedule.length && !cd.relay.length) add('warn', 'cond-idle', 'дирижёр без расписания и эстафеты: участники с policy: conductor будут стоять', {});
  const beatF = cd.beat, cycleF = cd.beat * cd.cycle;
  interface Danger1 { boss: number; a: number; b: number }
  const hits: HitEvent[] = [], dang: Danger1[] = [], punish: { boss: number; a: number; b: number }[] = [];
  const busyUntil: number[] = ds.map(() => -1);
  const place = (boss: number, chainId: string, t0: number, via: string, depth: number): void => {
    const d = ds[boss]!, c = d.chains.find((x) => x.id === chainId);
    if (!c) { add('error', 'cond-chain', `дирижёр: у босса «${d.id}» нет связки «${chainId}» (${via})`, { chain: chainId }); return; }
    if (t0 < busyUntil[boss]! && depth === 0) add('warn', 'cond-overlap', `дирижёр: босс «${d.id}» получает связку «${chainId}» на кадре ${t0}, когда ещё занят (до ${busyUntil[boss]}) — приказ будет пропущен`, { chain: chainId, frame: t0 });
    let t = t0;
    c.steps.forEach((st, i) => {
      const a = d.attacks.find((x) => x.id === st.attack); if (!a) return;
      const sp = stepSpan(a, c, i);
      dang.push({ boss, a: t, b: t + sp.tell + sp.end + 1 });
      for (const e of attackEvents(a)) hits.push({ ...e, t: t + e.t, what: `${d.id}: ${e.what}` });
      if (i === c.steps.length - 1) { const pw = a.recovery.punishWindow; punish.push({ boss, a: t + sp.tell + sp.end + 1 + pw.from, b: t + sp.tell + sp.end + 1 + pw.to }); }
      t += sp.total;
    });
    busyUntil[boss] = Math.max(busyUntil[boss]!, t);
    if (depth < 3) for (const r of cd.relay) if (r.from === boss && r.chain === chainId) place(r.to, r.next, t + Math.max(1, r.after), `эстафета ${r.from} → ${r.to}`, depth + 1);
  };
  for (let rep = 0; rep < 2; rep++) for (const e of cd.schedule) {
    const t0 = rep * cycleF + e.beat * beatF;
    for (const i of e.boss === 'all' ? ds.map((_, k) => k) : [e.boss]) if (ds[i]) place(i, e.chain, t0, `такт ${e.beat}`, 0);
  }
  if (!hits.length) return;
  hits.sort((a, b) => a.t - b.t);
  // поток урона по всем боссам вместе
  if (F) {
    const limit = F.maxDamage3s[0]!, b = bestInWindow(hits, fr(3), fr(P.INV));
    if (b.dmg > limit) add('error', 'cond-flux', `дирижёр: за 3 секунды можно получить до ${b.dmg} урона от всех боссов вместе (с кадра ${b.from}); предел ${limit}`, { frame: b.from });
    const ub = hits.filter((h) => h.kind === 'unblockable');
    for (let i = 1; i < ub.length; i++) if (ub[i]!.t - ub[i - 1]!.t < F.minGapAfterUnblockable) add('error', 'cond-unblock', `дирижёр: два неотбиваемых удара разных боссов с промежутком ${ub[i]!.t - ub[i - 1]!.t} кадров (кадры ${ub[i - 1]!.t} и ${ub[i]!.t}), нужно не меньше ${F.minGapAfterUnblockable}`, { frame: ub[i]!.t });
  }
  // безопасные окна считаются по всем: пока бьёт один, другой не должен стоять у героя за спиной
  const merged: [number, number][] = [];
  for (const d of dang.slice().sort((a, b) => a.a - b.a)) { const l = merged[merged.length - 1]; if (l && d.a <= l[1]) l[1] = Math.max(l[1], d.b); else merged.push([d.a, d.b]); }
  let widest = 0, at = 0;
  for (let i = 0; i < merged.length; i++) {
    const nextStart = i + 1 < merged.length ? merged[i + 1]![0] : merged[0]![0] + cycleF;
    if (nextStart - merged[i]![1] > widest) { widest = nextStart - merged[i]![1]; at = merged[i]![1]; }
  }
  const need = Math.max(F?.minChainPunishFrames ?? 0, RC?.minSafeGapFrames ?? 0);
  if (widest < need) add('error', 'cond-no-window', `дирижёр: самое долгое окно без атак любого из боссов ${Math.round(widest)} кадров (после кадра ${at}), нужно не меньше ${need} — герою негде перевести дух и ударить`, { frame: at });
  // окна наказания каждого босса, не перекрытые чужими атаками
  const minPun = rules.minPunishFrames;
  for (const p of punish) {
    let free = p.b - p.a + 1;
    const others = dang.filter((d) => d.boss !== p.boss && d.b > p.a && d.a < p.b);
    if (others.length) {
      const cover = new Set<number>();
      for (const o of others) for (let t = Math.max(p.a, o.a); t <= Math.min(p.b, o.b); t++) cover.add(t);
      free -= cover.size;
    }
    if (free < minPun) add('warn', 'cond-punish-covered', `дирижёр: окно наказания босса «${ds[p.boss]!.id}» (кадры ${p.a}–${p.b}) почти целиком перекрыто атаками другого босса: свободно ${Math.max(0, free)} кадров из ${minPun} нужных`, { frame: p.a });
  }
}
