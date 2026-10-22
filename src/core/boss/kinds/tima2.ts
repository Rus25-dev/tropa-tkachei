// Тима Пиво на каркасе: особая логика, которую не выразить данными. Числа боя лежат в data/bosses/tima2.json, здесь только поведение.
//   · лужи пива: упавшая на пол бутылка оставляет лужу на несколько секунд, на ней герой вдвое медленнее (как у прежнего Тимы);
//   · банкротство (fx bankrupt): если печать-удар задела героя, его нить делится пополам;
//   · лаг (fx blink): Тима исчезает и падает с потолка ровно в точку, где стоял герой к концу замаха;
//   · волшебная пыль: три удара по Тиме, пока он чертит круг, обрывают приём («апчхи» — длинная пауза, бей); иначе он «разгоняется»
//     (fx hyper): паузы между связками вдвое короче, но не короче HYPER_MIN_REST кадров.
// Модули исполнителя, мира и урона — только типы (правило no-restricted-imports); значения берём из balance и shared.
import { T } from '../../balance';
import { boxRect } from '../shared';
import type { BossKind, KindApi } from '../kinds';

const HYPER_FRAMES = 480; // 8 с
const HYPER_MIN_REST = 14; // быстрее нельзя: у героя должно остаться время на реакцию
const SNEEZE_FRAMES = 96; // апчхи: Тима стоит и не нападает
const SNEEZE_REST = 150;
const DUST_HITS = 3;
const PUDDLE_SEC = 5, PUDDLE_W = 80;
const DT = 1 / 60;

const num = (b: Record<string, unknown>, k: string): number => (typeof b[k] === 'number' ? (b[k] as number) : 0);

/** лужи: бутылка (spore босса) у пола — оставить лужу, пометив снаряд */
function puddles(k: KindApi): void {
  const { sc, d } = k;
  if (!sc.puddles) sc.puddles = [];
  for (const q of sc.puddles) q.t -= DT;
  sc.puddles = sc.puddles.filter((q) => q.t > 0);
  for (const pr of sc.projs) {
    if (pr.dead || pr.kind !== 'spore' || pr['src'] !== 'd' || pr.w > 20 || pr['pd']) continue; // бутылки — маленькие споры (приставка 36 px — не бутылка)
    if (pr.y + pr.h >= d.floor - 8 && pr.vy > 0) {
      pr['pd'] = 1;
      sc.puddles.push({ x: pr.x + pr.w / 2 - PUDDLE_W / 2, w: PUDDLE_W, y: d.floor, t: PUDDLE_SEC });
      sc.sfx('glass');
    }
  }
}

const kind: BossKind = {
  frame(k) {
    const { sc, b, d } = k;
    puddles(k);
    // апчхи: стоит, не нападает, окно наказания горит
    const sn = num(b, 'sneeze');
    if (sn > 0) { b['sneeze'] = sn - 1; b.vx = 0; if (d.mode === 'idle') { d.punish = true; } }
    // пыль: считаем удары по Тиме, пока длится приём
    if (d.mode === 'attack' && d.atk === 'dust') {
      const prev = num(b, 'dustHp');
      if (b.hp < prev) b['dustHits'] = num(b, 'dustHits') + 1;
      b['dustHp'] = b.hp;
      if (num(b, 'dustHits') >= DUST_HITS && b.state !== 'dead') {
        d.mode = 'idle'; d.f = 0; d.rest = SNEEZE_REST; d.atk = null; d.chain = null; d.punish = false; d.cue = null; d.enter = false;
        b['sneeze'] = SNEEZE_FRAMES; b['dustHits'] = 0; b.vx = 0;
        sc.sfx('cough'); sc.emit('dustFx', { n: 30, x: b.x + b.w / 2 + b.face * 30, y: b.y + 20 }); sc.toast('Апчхи! Бей, пока он чихает.', 2);
      }
    }
    // разгон: паузы короче
    const hy = num(b, 'hyper');
    if (hy > 0) {
      b['hyper'] = hy - 1;
      if (d.mode === 'idle' && d.rest - d.f > HYPER_MIN_REST) d.f++;
    }
  },
  onAttack(k, attack) {
    const { b } = k;
    if (attack === 'dust') { b['dustHits'] = 0; b['dustHp'] = b.hp; k.sc.toast('Тима чертит круг для пыли — беги и бей, пока не закончил!', 3); }
  },
  onPhase(k, phase) {
    const { b, sc } = k;
    b['hyper'] = 0; b['sneeze'] = 0;
    sc.toast(phase === 3 ? 'ВСЁ, Я ЗЛОЙ! ДОНАТ НА ВСЁ!' : 'Коллекторы выходят на охоту.', 2);
  },
  onDeath(k) { k.sc.puddles = []; k.b['hyper'] = 0; },
  allow(k, chain) {
    // пока разогнан, второй раз пыль не чертит
    if (chain === 'c_dust' && num(k.b, 'hyper') > 0) return false;
    return true;
  },
  fx: {
    /** печать банкротства: герой, которого задела коробка удара, теряет половину нити */
    bankrupt(k) {
      const { sc, b, d, def } = k;
      const a = def.attacks.find((x) => x.id === 'bank'); const h = a?.active[0]; if (!h) return;
      const r = boxRect(b, d.dir, h.hit, d.lock);
      for (const p of sc.players) {
        if (p.remote || p.downed) continue;
        if (p.x + p.w > r.x && p.x < r.x + r.w && p.y + p.h > r.y && p.y < r.y + r.h) p.silk = Math.floor(p.silk / 2);
      }
      sc.sfx('coin'); sc.shake(260, 0.012);
    },
    /** лаг: исчезнуть и появиться над точкой, где стоял герой */
    blink(k) {
      const { sc, b, d } = k;
      const lo = 2 * T + b.w / 2, hi = (sc.L.W - 2) * T - b.w / 2;
      const x = Math.max(lo, Math.min(hi, d.lock.x));
      b.x = x - b.w / 2; b.y = 4 * T + 4; b.vy = 0; b.vx = 0;
      sc.sfx('sparkle'); sc.burst(14, x, b.y + b.h / 2, 0xffe38a);
    },
    /** пыль досталась Тиме: разгон */
    hyper(k) {
      const { sc, b } = k;
      b['hyper'] = HYPER_FRAMES; sc.sfx('sparkle'); sc.toast('Тима разогнался: паузы между связками вдвое короче.', 2);
    },
  },
};
export default kind;
