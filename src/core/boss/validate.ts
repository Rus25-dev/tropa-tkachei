// Валидатор честности данных боссов (2.5, часть В): поверх zod-схемы и checkBossDef проверяет правила, которые в одной атаке не видны —
// связки, паузы, ответы на каждый тип удара, габариты в арене, поток урона. Чистый TS, без Node: годится и для CLI (npm run boss:check), и для Vitest.
// Каждая находка — Issue: уровень (error — нечестно, warn — подозрительно), место (босс / фаза / связка / шаг / атака / кадр) и текст по-русски.
import { HEAVY_KINDS, P } from '../balance';
import { BossDefSchema, activeEnd, checkBossDef, type Attack, type BossDef, type Chain, type Fairness, type Rules } from './schema';
import { resolveAnti } from './anti';

export interface Issue {
  level: 'error' | 'warn';
  /** короткий код проверки (для тестов и фильтров) */
  code: string;
  boss: string;
  phase?: number; chain?: string; step?: number; attack?: string;
  /** кадр атаки от начала замаха (если применимо) */
  frame?: number;
  msg: string;
}
/** внутренние размеры арены, px (без стен); нет — проверка габаритов пропускается */
export interface ArenaInfo { w: number; h: number }

const FPS = 60;
const fr = (sec: number): number => Math.round(sec * FPS);

/** События урона атаки: кадр от начала замаха, урон, тип. Удары и снаряды одного кадра — одно событие (герой получает один удар за неуязвимость). */
export interface HitEvent { t: number; dmg: number; kind: string; what: string }
export function attackEvents(a: Attack): HitEvent[] {
  const m = new Map<number, HitEvent>();
  const add = (t: number, dmg: number, kind: string, what: string): void => {
    const e = m.get(t);
    if (!e) m.set(t, { t, dmg, kind, what });
    else if (dmg > e.dmg) { e.dmg = dmg; e.kind = kind; e.what = what; }
  };
  for (const h of a.active) add(a.tell.frames + h.from, h.dmg, h.kind, 'удар');
  for (const s of a.spawn) add(a.tell.frames + s.at, s.dmg ?? (HEAVY_KINDS.has(s.proj.kind) ? 2 : 1), s.kind, 'снаряд «' + s.proj.kind + '»');
  return [...m.values()].sort((x, y) => x.t - y.t);
}
const firstDamageAt = (a: Attack): number => {
  let t = Infinity;
  for (const h of a.active) t = Math.min(t, h.from);
  for (const s of a.spawn) t = Math.min(t, s.at);
  return t === Infinity ? 0 : t;
};
/** сколько кадров занимает шаг связки: замах + рабочая часть + пауза после него */
function stepSpan(a: Attack, c: Chain, i: number): { tell: number; end: number; pause: number; total: number } {
  const last = i >= c.steps.length - 1, end = Math.max(0, activeEnd(a));
  const pause = last ? a.recovery.frames : (c.steps[i]!.gapFrames ?? a.recovery.frames);
  return { tell: a.tell.frames, end, pause, total: a.tell.frames + end + 1 + pause };
}
export const chainFrames = (def: BossDef, c: Chain): number => {
  let n = 0;
  c.steps.forEach((s, i) => { const a = def.attacks.find((x) => x.id === s.attack); if (a) n += stepSpan(a, c, i).total; });
  return n;
};

const kindsOf = (a: Attack): Set<string> => new Set([...a.active.map((x) => x.kind), ...a.spawn.map((x) => x.kind)]);

/** Все проверки честности для уже разобранного определения. */
export function validateBoss(def: BossDef, rules: Rules, arena?: ArenaInfo): Issue[] {
  const out: Issue[] = [];
  const F: Fairness | undefined = rules.fairness;
  const add = (level: Issue['level'], code: string, msg: string, where: Partial<Issue> = {}): void => { out.push({ level, code, boss: def.id, msg, ...where }); };
  const atk = new Map(def.attacks.map((a) => [a.id, a]));

  // 1. правила из схемы (замах, восстановление, окно наказания, ссылки) — как ошибки отчёта
  for (const e of checkBossDef(def, rules)) {
    const m = /^атака «([^»]+)»/.exec(e), c = /^связка «([^»]+)»/.exec(e), p = /^фаза (\d)/.exec(e);
    add('error', 'rule', e, { attack: m?.[1], chain: c?.[1], phase: p ? +p[1]! : undefined });
  }

  // 2. связки: окно после связки, паузы, реакция, неотбиваемые подряд
  if (F) for (const c of def.chains) {
    c.steps.forEach((s, i) => {
      const a = atk.get(s.attack); if (!a) return;
      const where = { chain: c.id, step: i, attack: a.id };
      const last = i === c.steps.length - 1;
      if (last) {
        const pw = a.recovery.punishWindow, len = pw.to - pw.from + 1;
        if (len < F.minChainPunishFrames) add('error', 'chain-punish', `после связки «${c.id}» окно наказания (атака «${a.id}») ${len} кадров, нужно не меньше ${F.minChainPunishFrames}`, { ...where, frame: a.tell.frames + Math.max(0, activeEnd(a)) + 1 + pw.from });
      } else {
        const gap = s.gapFrames ?? a.recovery.frames, nx = atk.get(c.steps[i + 1]!.attack);
        if (s.gapFrames !== undefined && gap < F.minChainGapFrames) add('error', 'gap-short', `связка «${c.id}», шаг ${i + 1}: пауза gapFrames ${gap} короче нормы ${F.minChainGapFrames} — следующий замах начнётся почти внахлёст`, where);
        if (nx) {
          const react = gap + nx.tell.frames + firstDamageAt(nx);
          if (react < F.minReactionFrames) add('error', 'react', `связка «${c.id}»: от конца ударов «${a.id}» до первого удара «${nx.id}» ${react} кадров, нужно не меньше ${F.minReactionFrames} (время на реакцию)`, { ...where, frame: a.tell.frames + Math.max(0, activeEnd(a)) + 1 + gap });
          if (kindsOf(a).has('unblockable') && kindsOf(nx).has('unblockable') && gap < F.minGapAfterUnblockable) add('error', 'unblockable-chain', `связка «${c.id}»: два неотбиваемых удара подряд («${a.id}» → «${nx.id}») с паузой ${gap} кадров, нужно не меньше ${F.minGapAfterUnblockable}`, where);
        }
      }
    });
    if (c.steps.length > 5) add('warn', 'chain-long', `связка «${c.id}» из ${c.steps.length} шагов: игроку трудно её выучить (норма 2–5)`, { chain: c.id });
  }

  // 3. паузы между связками (по политикам фаз)
  if (F) def.phases.forEach((ph, pi) => {
    const pol = ph.policy;
    if (pol.restFrames[0] < F.minRestFrames) add('error', 'rest', `фаза ${pi + 1}: пауза между связками (restFrames[0]) ${pol.restFrames[0]} кадров, нужно не меньше ${F.minRestFrames}`, { phase: pi + 1 });
    for (const id of pol.chains) {
      const c = def.chains.find((x) => x.id === id); if (!c) continue;
      const a = atk.get(c.steps[c.steps.length - 1]!.attack); if (!a) continue;
      const pause = a.recovery.frames + pol.restFrames[0];
      if (pause < F.minChainPauseFrames) add('error', 'pause', `фаза ${pi + 1}, связка «${c.id}»: между концом связки и следующим замахом не меньше ${pause} кадров (восстановление ${a.recovery.frames} + пауза ${pol.restFrames[0]}), нужно ${F.minChainPauseFrames}`, { phase: pi + 1, chain: c.id, attack: a.id });
    }
  });

  // 4. ответ на каждый удар
  for (const a of def.attacks) responses(def, a, add);

  // 5. габариты в арене
  if (arena) for (const a of def.attacks) bounds(def, a, arena, add);

  // 6. поток урона
  if (F) flux(def, F, add);

  // 7. прочее: неиспользуемые атаки и связки, одинаковые замахи, настройки защиты от читов
  usage(def, add);
  return out;
}

type Add = (level: Issue['level'], code: string, msg: string, where?: Partial<Issue>) => void;
const hero = { run: P.RUN, w: 14, jump: (P.JUMP * P.JUMP) / (2 * P.G), dash: P.DASH * P.DASHT, react: 12 };

function responses(def: BossDef, a: Attack, add: Add): void {
  const where = { attack: a.id };
  const par = attackEvents(a).filter((e) => e.kind === 'parry');
  const parCd = fr(P.PARRY_CD);
  for (let i = 1; i < par.length; i++) {
    const gap = par[i]!.t - par[i - 1]!.t;
    if (gap < parCd) add('warn', 'parry-cd', `атака «${a.id}»: два отбиваемых удара через ${gap} кадров (кадры ${par[i - 1]!.t} и ${par[i]!.t} от замаха) — откат отбива ${parCd} кадров, второй придётся уворачиваться`, { ...where, frame: par[i]!.t });
  }
  // рывок с неуязвимостью: события 'dodge' ближе, чем откат рывка, второй пережить рывком нельзя
  const ev = attackEvents(a).filter((e) => e.kind !== 'parry'), dcd = fr(P.DASHCD);
  for (let i = 1; i < ev.length; i++) {
    const gap = ev[i]!.t - ev[i - 1]!.t;
    if (gap < dcd) add('warn', 'dash-cd', `атака «${a.id}»: удары через ${gap} кадров (кадры ${ev[i - 1]!.t} и ${ev[i]!.t}) — откат рывка ${dcd} кадров, второй надо переждать уходом или прыжком`, { ...where, frame: ev[i]!.t });
  }
  // удары по площади: можно ли уйти (бегом/рывком) или перепрыгнуть
  for (const h of a.active) {
    if (h.kind === 'parry') continue;
    const need = (h.hit.w + hero.w) / 2;                       // худший случай: герой в середине коробки
    const time = Math.max(0, a.tell.frames + h.from - hero.react) / FPS;
    const runs = hero.run * time + (h.kind === 'dodge' ? hero.dash : 0);
    const rise = Math.max(0, def.size.h - h.hit.y);              // насколько надо подняться, чтобы встать над коробкой
    const jumps = rise <= hero.jump * 0.9 && time * FPS >= 14;   // прыжок на нужную высоту занимает ~14 кадров
    const noGround = h.hit.at === 'self' && h.hit.y + h.hit.h <= 0; // коробка над головой босса — ходьбой не задеть
    if (!noGround && need > runs && !jumps) add('error', 'no-escape', `атака «${a.id}», удар ${h.kind} на кадрах ${h.from}–${h.to}: не уйти — коробка ${h.hit.w} px, до выхода ${Math.round(need)} px, а за ${Math.round(time * 60)} кадров герой пройдёт ${Math.round(runs)} px и не допрыгнет`, { ...where, frame: a.tell.frames + h.from });
    if (h.hit.at === 'target' && a.tell.frames < 24) add('warn', 'target-short', `атака «${a.id}»: удар по точке героя при замахе ${a.tell.frames} кадров — цель фиксируется в конце замаха`, { ...where, frame: a.tell.frames + h.from });
  }
  // быстрые снаряды с самонаведением в момент выстрела
  for (const s of a.spawn) {
    const sp = Math.hypot(s.vx, s.vy);
    if (s.aim && sp > 560) add('warn', 'aim-fast', `атака «${a.id}»: самонаводящийся снаряд со скоростью ${Math.round(sp)} px/с — его трудно прочитать`, { ...where, frame: a.tell.frames + s.at });
    if (s.kind === 'parry' && s.proj.life < 20) add('warn', 'proj-short', `атака «${a.id}»: отбиваемый снаряд живёт ${s.proj.life} кадров`, { ...where, frame: a.tell.frames + s.at });
  }
}

function bounds(def: BossDef, a: Attack, arena: ArenaInfo, add: Add): void {
  const where = { attack: a.id };
  for (const h of a.active) {
    const b = h.hit, reach = Math.max(Math.abs(b.x), Math.abs(b.x + b.w));
    if (b.w > arena.w || b.h > arena.h) add('error', 'box-size', `атака «${a.id}»: коробка удара ${b.w}×${b.h} больше арены ${arena.w}×${arena.h}`, { ...where, frame: a.tell.frames + h.from });
    else if (reach > arena.w) add('error', 'box-reach', `атака «${a.id}»: коробка удара выходит на ${Math.round(reach)} px от центра — арена шириной ${arena.w}`, { ...where, frame: a.tell.frames + h.from });
    if (b.at === 'self' && (b.y + b.h < -def.size.h || b.y > def.size.h + 40)) add('error', 'box-y', `атака «${a.id}»: коробка удара по высоте (${b.y}…${b.y + b.h}) далеко от тела босса (высота ${def.size.h})`, { ...where, frame: a.tell.frames + h.from });
    else if (b.at === 'self' && b.y + b.h > def.size.h + 24) add('warn', 'box-floor', `атака «${a.id}»: коробка удара уходит ниже пола на ${Math.round(b.y + b.h - def.size.h)} px`, { ...where, frame: a.tell.frames + h.from });
  }
  for (const s of a.spawn) {
    if (Math.abs(s.ox) > arena.w || Math.abs(s.oy) > arena.h) add('error', 'spawn-out', `атака «${a.id}»: снаряд появляется в (${s.ox}, ${s.oy}) от точки привязки — за пределами арены ${arena.w}×${arena.h}`, { ...where, frame: a.tell.frames + s.at });
    const range = Math.hypot(s.vx, s.vy) * s.proj.life / FPS;
    if (range < 1 && Math.hypot(s.vx, s.vy) > 0) add('warn', 'proj-life', `атака «${a.id}»: снаряд исчезает, не пролетев и пикселя`, { ...where, frame: a.tell.frames + s.at });
  }
}

/** Максимум урона, который герой получает за окно: выбор событий с промежутком не меньше неуязвимости (взвешенное расписание). */
export function bestInWindow(ev: HitEvent[], win: number, inv: number): { dmg: number; from: number } {
  let best = 0, at = 0;
  for (let i = 0; i < ev.length; i++) {
    const w = ev.filter((e) => e.t >= ev[i]!.t && e.t < ev[i]!.t + win);
    const dp: number[] = new Array(w.length).fill(0) as number[];
    for (let k = 0; k < w.length; k++) {
      let prev = 0;
      for (let j = k - 1; j >= 0; j--) if (w[k]!.t - w[j]!.t >= inv) { prev = dp[j]!; break; }
      dp[k] = Math.max(k ? dp[k - 1]! : 0, prev + w[k]!.dmg);
    }
    const v = w.length ? dp[w.length - 1]! : 0;
    if (v > best) { best = v; at = ev[i]!.t; }
  }
  return { dmg: best, from: at };
}
/** Хронология ударов цепочки связок, начиная с кадра 0. */
function chainEvents(def: BossDef, c: Chain, t0: number): { ev: HitEvent[]; end: number } {
  const ev: HitEvent[] = []; let t = t0;
  c.steps.forEach((s, i) => {
    const a = def.attacks.find((x) => x.id === s.attack); if (!a) return;
    for (const e of attackEvents(a)) ev.push({ ...e, t: t + e.t });
    t += stepSpan(a, c, i).total;
  });
  return { ev, end: t };
}
function flux(def: BossDef, F: Fairness, add: Add): void {
  const win = fr(3), inv = fr(P.INV);
  def.phases.forEach((ph, pi) => {
    const limit = F.maxDamage3s[Math.min(pi, F.maxDamage3s.length - 1)]!;
    const chains = ph.policy.chains.map((id) => def.chains.find((c) => c.id === id)).filter((c): c is Chain => !!c);
    if (!chains.length) return;
    let worst = { dmg: 0, seq: '', from: 0 };
    const rest = ph.policy.restFrames[0];
    const walk = (seq: Chain[], ev: HitEvent[], t: number): void => {
      if (t > win * 2 + 60 || seq.length >= 4) {
        const b = bestInWindow(ev, win, inv);
        if (b.dmg > worst.dmg) worst = { dmg: b.dmg, seq: seq.map((c) => c.id).join(' → '), from: b.from };
        return;
      }
      for (const c of chains) {
        if (ph.policy.noRepeat > 0 && seq.length && seq[seq.length - 1] === c) continue;
        const r = chainEvents(def, c, t);
        walk([...seq, c], [...ev, ...r.ev], r.end + rest);
      }
    };
    walk([], [], 0);
    if (worst.dmg > limit) add('error', 'flux', `фаза ${pi + 1}: за 3 секунды можно получить до ${worst.dmg} урона (связки ${worst.seq}, с кадра ${worst.from}); предел ${limit}`, { phase: pi + 1, frame: worst.from });
  });
}

function usage(def: BossDef, add: Add): void {
  const used = new Set<string>(), cfg = def.antiCheese;
  for (const ph of def.phases) {
    ph.policy.chains.forEach((c) => used.add(c));
    ph.policy.priority.forEach((p) => used.add(p.chain));
    if (ph.enterChain) used.add(ph.enterChain);
  }
  if (cfg?.shoveChain) used.add(cfg.shoveChain);
  if (cfg?.relocateChain) used.add(cfg.relocateChain);
  for (const c of def.chains) if (!used.has(c.id)) add('warn', 'chain-unused', `связка «${c.id}» не используется ни в одной фазе`, { chain: c.id });
  const inChains = new Set(def.chains.flatMap((c) => c.steps.map((s) => s.attack)));
  for (const a of def.attacks) if (!inChains.has(a.id)) add('warn', 'attack-unused', `атака «${a.id}» не входит ни в одну связку`, { attack: a.id });
  // одинаковые замахи у атак с разным типом удара: осознанная «обманка» или ошибка
  for (let i = 0; i < def.attacks.length; i++) for (let j = i + 1; j < def.attacks.length; j++) {
    const x = def.attacks[i]!, y = def.attacks[j]!;
    if (x.tell.cue.color !== y.tell.cue.color || x.tell.cue.sfx !== y.tell.cue.sfx || x.tell.cue.pose !== y.tell.cue.pose) continue;
    add('warn', 'cue-dup', `атаки «${x.id}» и «${y.id}» подают одинаковый сигнал (цвет, звук, поза) — игрок их не различит`, { attack: y.id });
  }
  // защита от читов: ссылки и применимость
  const chn = new Set(def.chains.map((c) => c.id));
  if (cfg?.shoveChain && !chn.has(cfg.shoveChain)) add('error', 'anti-ref', `antiCheese.shoveChain: нет связки «${cfg.shoveChain}»`, { chain: cfg.shoveChain });
  if (cfg?.relocateChain && !chn.has(cfg.relocateChain)) add('error', 'anti-ref', `antiCheese.relocateChain: нет связки «${cfg.relocateChain}»`, { chain: cfg.relocateChain });
  const a = resolveAnti(def);
  if (a) {
    if (!a.shoveChain && !def.phases.some((p) => p.policy.priority.length)) add('warn', 'anti-shove', 'защита от читов включена, но связка-отгон (antiCheese.shoveChain) не задана: «отогнать» не сработает', {});
    if (!a.relocateChain) add('warn', 'anti-relocate', 'защита от читов включена, но перемещающая связка (antiCheese.relocateChain) не задана: босс будет стоять на месте, пока герой невредим', {});
    if (a.shoveChain && a.relocateChain === a.shoveChain) add('warn', 'anti-same', 'связка-отгон и перемещающая связка совпадают', {});
  } else if (def.antiCheese?.enabled === false) add('warn', 'anti-off', 'защита от читов выключена у босса флагом antiCheese.enabled=false', {});
}

/** Разбор сырого JSON и проверка: ошибки схемы тоже становятся находками (а не исключением). */
export function validateRaw(raw: unknown, rules: Rules, arena?: ArenaInfo): Issue[] {
  const r = BossDefSchema.safeParse(raw);
  const id = (raw as { id?: string } | null)?.id ?? '?';
  if (!r.success) return r.error.issues.map((i) => ({ level: 'error' as const, code: 'schema', boss: id, msg: `${i.path.join('.') || 'корень'}: ${i.message}` }));
  return validateBoss(r.data, rules, arena);
}

// ---------- отчёт ----------
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
const place = (i: Issue): string => [i.phase ? `фаза ${i.phase}` : '', i.chain ? `связка ${i.chain}` : '', i.step !== undefined ? `шаг ${i.step + 1}` : '', i.attack ? `атака ${i.attack}` : '', i.frame !== undefined ? `кадр ${i.frame}` : ''].filter(Boolean).join(' / ');
/** Отчёт по боссам: ошибки красным, предупреждения жёлтым (color=false — без цветов). */
export function formatReport(bosses: { id: string; issues: Issue[] }[], color = true): string {
  const c = (k: keyof typeof C, s: string): string => (color ? C[k] + s + C.off : s);
  const lines: string[] = [];
  for (const b of bosses) {
    const errs = b.issues.filter((i) => i.level === 'error'), warns = b.issues.filter((i) => i.level === 'warn');
    lines.push(c('bold', `Босс «${b.id}»`) + ' — ' + (errs.length ? c('red', `ошибок: ${errs.length}`) : c('green', 'ошибок нет')) + (warns.length ? ', ' + c('yellow', `предупреждений: ${warns.length}`) : ''));
    for (const i of [...errs, ...warns]) {
      const mark = i.level === 'error' ? c('red', 'ОШИБКА        ') : c('yellow', 'предупреждение');
      lines.push(`  ${mark} ${c(i.level === 'error' ? 'red' : 'yellow', i.msg)}` + (place(i) ? c('dim', `   [${place(i)}]`) : ''));
    }
  }
  return lines.join('\n');
}

/** Таблица кадровых данных босса (для отладки и тренировки): по атакам — замах, удары, снаряды, восстановление, окно наказания. Markdown. */
export function frameTable(def: BossDef): string {
  const kind: Record<string, string> = { parry: 'отбив', dodge: 'уворот', unblockable: 'неотбив.' };
  const out = [`| Атака | Замах | Удары (кадры от конца замаха) | Снаряды | Восстановление | Окно наказания | Сигнал |`, '|---|---|---|---|---|---|---|'];
  for (const a of def.attacks) {
    const hits = a.active.map((h) => `${h.from}–${h.to}: ${kind[h.kind]} ×${h.dmg}`).join('; ') || '—';
    const proj = a.spawn.map((x) => `${x.at}: ${x.proj.kind} ${kind[x.kind]}${x.count > 1 ? ' ×' + x.count : ''}`).join('; ') || '—';
    const pw = a.recovery.punishWindow;
    out.push(`| ${a.id} | ${a.tell.frames} | ${hits} | ${proj} | ${a.recovery.frames} | ${pw.from}–${pw.to} (${pw.to - pw.from + 1}) | ${a.tell.cue.color} / ${a.tell.cue.sfx} |`);
  }
  return out.join('\n');
}
