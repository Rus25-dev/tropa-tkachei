// Наблюдение нейросети-игрока: вектор признаков фиксированной длины из мира ядра (только чтение).
// Состав: «свои» признаки героя (HERO_DIM) и «мир» (WORLD_DIM: босс, снаряды, резерв под фазу «вида сверху»).
// Длина вектора и порядок признаков НЕ меняются, пока не переобучены модели (ml/rl): фаза «Пропустите!» ушла вместе со старым Мишей, её признаки — нули.
// Агент видит только то, что видит игрок: положение и состояние босса, телеграфы (снаряды с задержкой), но не будущие решения босса.
// Мир-часть можно запаздывать (задержка реакции человека) — см. Agent и RlEnv.
/* eslint-disable @typescript-eslint/no-explicit-any -- сущности ядра — «мешки» полей */
import { T } from '../core/balance';
import type { World } from '../core/world';

export const K_PROJ = 8;
/** Виды снарядов и состояния боссов — раскладка признаков под веса моделей (ml/rl): порядок не менять; некоторые виды и состояния ушли вместе со старыми боссами, их ячейки всегда нули. */
export const KINDS = ['letter', 'bigletter', 'rain', 'roller', 'bomb', 'spore', 'wave', 'rwave', 'rootspike', 'echo', 'note', 'clef', 'staff', 'stamp', 'box', 'trophy', 'bottle', 'drip', 'glob', 'poison', 'collector', 'pad', 'tbomb', 'tneedle', 'ttrap', 'rock'] as const;
const KIND_IDX = new Map<string, number>(KINDS.map((k, i) => [k, i]));
const SKIP = new Set(['ringfx', 'staffghost', 'mark']);
export const STATES = ['intro', 'sleep', 'roar', 'idle', 'recover', 'stun', 'cough', 'word', 'bigWind', 'chargeWind', 'charge', 'dictWind', 'rollWind', 'dead', 'gone', 'rage', 'leapWind', 'leap', 'rootWind', 'sporeWind',
  'clefWind', 'echoWind', 'lungeWind', 'lunge', 'smear', 'smearGo', 'staffWind', 'achWind', 'bankWind', 'beerWind', 'boxWind', 'collWind', 'drink', 'dust', 'dustDraw', 'lagFall', 'lagGone', 'lagWind', 'pad', 'ringWind', 'sneeze'] as const;
const STATE_IDX = new Map<string, number>(STATES.map((k, i) => [k, i]));

const PF = KINDS.length + 1 + 9; // признаки одного снаряда
export const HERO_DIM = 32;
export const BOSS_DIM = 16 + (STATES.length + 1) + 3 + 8;
export const TD_DIM = 1 + 6 + 7 + 3; // резерв под прежнюю фазу «Пропустите!» (7 состояний): раскладка вектора должна совпасть с весами моделей
export const WORLD_DIM = BOSS_DIM + TD_DIM + K_PROJ * PF;
export const OBS_DIM = HERO_DIM + WORLD_DIM;

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const AW = 44 * T, AH = 22 * T;

function ray(w: World, x: number, y: number, dx: number, dy: number, max: number): number {
  for (let d = 4; d < max; d += 8) if (w.isSolid(Math.floor((x + dx * d) / T), Math.floor((y + dy * d) / T))) return d / max;
  return 1;
}

/** Пишет «свою» часть (герой) в out[off..off+HERO_DIM) */
export function heroObs(w: World, idx: number, out: Float32Array, off: number): void {
  const p: any = w.players[idx], cx = p.x + 7, cy = p.y + 13;
  let k = off;
  const put = (v: number): void => { out[k++] = v; };
  put(clamp(cx / AW, 0, 1)); put(clamp(cy / AH, 0, 1));
  put(clamp(p.vx / 540, -1.5, 1.5)); put(clamp(p.vy / 720, -1.5, 1.5));
  put(p.onGround ? 1 : 0); put(p.face); put(p.hp / p.maxHp); put(p.hp / 5); put(clamp(p.silk / w.silkMax, 0, 1));
  put(p.inv > 0 ? 1 : 0); put(clamp(p.inv, 0, 1.5) / 1.5); put(p.hurtT > 0 ? 1 : 0);
  put(p.dashT > 0 ? 1 : 0); put(clamp(p.dashCd, 0, 1) * 3); put(p.canDash ? 1 : 0);
  put(p.atkT > 0 ? 1 : 0); put(clamp(p.atkCd, 0, 0.6) / 0.6);
  put(p.parryT > 0 ? 1 : 0); put(clamp(p.parryCd, 0, 1)); put(p.healCh > 0 ? 1 : 0);
  put(p.usedDouble ? 1 : 0); put(p.wallDir); put(p.bombs / 3); put(p.bombCd > 0 ? 1 : 0); put(p.downed ? 1 : 0);
  put(ray(w, cx, cy, -1, 0, 400)); put(ray(w, cx, cy, 1, 0, 400)); put(ray(w, cx, cy, 0, 1, 320)); put(ray(w, cx, cy, 0, -1, 320));
  put(0);
}

const hv = new Float32Array(1);
void hv;
/** Пишет «мировую» часть в out[off..off+WORLD_DIM) */
export function worldObs(w: World, idx: number, out: Float32Array, off: number): void {
  out.fill(0, off, off + WORLD_DIM);
  const p: any = w.players[idx];
  const b: any = w.testBoss();
  const misha = b?.d?.id === 'misha2'; // рюкзак Миши: те же признаки, что были у прежнего Миши
  const hcx = p.x + 7, hcy = p.y + 13;
  let k = off;
  if (b) {
    const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2, gone = b.y < -100;
    const phase = Math.min(3, b.phase || 1);
    out[k++] = clamp((bcx - hcx) / 400, -2.5, 2.5); out[k++] = gone ? 0 : clamp((bcy - hcy) / 300, -2.5, 2.5);
    out[k++] = clamp((b.vx || 0) / 500, -1.5, 1.5); out[k++] = clamp((b.vy || 0) / 700, -1.5, 1.5);
    out[k++] = b.w / 100; out[k++] = b.h / 100; out[k++] = Math.max(0, b.hp) / b.maxHp; out[k++] = b.face || 0;
    out[k++] = clamp(Math.max(0, b.t || 0), 0, 3) / 3; out[k++] = clamp((b.stagger || 0), 0, 2) / 2; out[k++] = b.flash > 0 ? 1 : 0; out[k++] = gone ? 1 : 0;
    out[k++] = clamp(bcx / AW, 0, 1); out[k++] = b.onGround ? 1 : 0;
    out[k++] = misha && (b.phase || 1) >= 3 ? 1 : 0; out[k++] = 0;
    const si = STATE_IDX.get(b.state); out[k + (si ?? STATES.length)] = 1; k += STATES.length + 1;
    out[k + phase - 1] = 1; k += 3;
    if (misha) { // рюкзак Миши: куда кидать дымовуху
      const bagx = bcx - 26 * b.face, bagy = b.y + 32;
      out[k] = clamp((bagx - hcx) / 400, -2.5, 2.5); out[k + 1] = clamp((bagy - hcy) / 300, -2.5, 2.5); out[k + 2] = (b.bagT ?? 0) > w.timeSec ? 1 : 0;
      out[k + 3] = (hcx - bcx) * b.face < 0 ? 1 : 0; // герой за спиной (со стороны рюкзака)
    }
    k += 8;
  } else k += BOSS_DIM;
  k += TD_DIM; // резерв: прежняя фаза «Пропустите!» (нули)
  // ближайшие снаряды
  const sel: { d: number; q: any }[] = [];
  for (const q of w.projs as any[]) {
    if (q.dead || SKIP.has(q.kind) || q.w === 0) continue;
    const d = Math.hypot(q.x + q.w / 2 - hcx, q.y + q.h / 2 - hcy);
    if (sel.length < K_PROJ) sel.push({ d, q }); else {
      let wi = 0; for (let i = 1; i < sel.length; i++) if (sel[i]!.d > sel[wi]!.d) wi = i;
      if (d < sel[wi]!.d) sel[wi] = { d, q };
    }
  }
  sel.sort((a, c) => a.d - c.d);
  for (let j = 0; j < sel.length; j++) {
    const q = sel[j]!.q, o = k + j * PF;
    out[o + (KIND_IDX.get(q.kind) ?? KINDS.length)] = 1;
    const f = o + KINDS.length + 1;
    out[f] = clamp((q.x + q.w / 2 - hcx) / 400, -2.5, 2.5); out[f + 1] = clamp((q.y + q.h / 2 - hcy) / 300, -2.5, 2.5);
    out[f + 2] = clamp((q.vx || 0) / 600, -2, 2); out[f + 3] = clamp((q.vy || 0) / 600, -2, 2);
    out[f + 4] = q.w / 60; out[f + 5] = q.h / 60;
    out[f + 6] = q.delay > 0 ? clamp(q.delay, 0, 1.5) / 1.5 : 0; out[f + 7] = q.delay > 0 ? 1 : 0; out[f + 8] = clamp(q.life == null ? 1 : q.life, 0, 4) / 4;
  }
}

export function buildObs(w: World, idx: number, out: Float32Array, off = 0): void {
  heroObs(w, idx, out, off); worldObs(w, idx, out, off + HERO_DIM);
}
