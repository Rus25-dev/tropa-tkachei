import type { BossKind, KindApi } from '../kinds';
import { vesselPick, VESSEL_CHOICES, type VesselMemory } from '../vessel-policy';

/** Телепорт выбирает свободную точку пола и не оставляет контактный удар на герое. */
function teleport(k: KindApi, x: number, y: number): boolean {
  const { sc, b } = k;
  const nx = Math.max(48, Math.min(sc.L.W * 32 - b.w - 48, x));
  if (sc.solidRect({ x: nx, y, w: b.w, h: b.h })) return false;
  sc.parts(12, b.x + b.w / 2, b.y + b.h / 2, 0xd8d4e8);
  b.x = nx; b.y = y; b.vx = b.vy = 0;
  sc.parts(12, b.x + b.w / 2, b.y + b.h / 2, 0xd8d4e8);
  return true;
}

export default {
  select({ b, sc, rng }, available) {
    const memory = (b['vesselChoice'] ??= { counts: {}, missed: {} }) as VesselMemory;
    const [p] = sc.nearestPlayer(b.x + b.w / 2, b.y);
    if (p && Math.abs(p.x + p.w / 2 - b.x - b.w / 2) < 100) {
      const close = (b['vesselCloseChoice'] ??= { counts: {}, missed: {} }) as VesselMemory;
      const reaction = vesselPick([{ chain: 'continue', weight: 0.6, maxRepeat: 3, maxMissed: 2 }, { chain: 'c_guard', weight: 0.2, maxRepeat: 1, maxMissed: 4 }, { chain: 'c_backstep', weight: 0.2, maxRepeat: 1, maxMissed: 4 }], close, ['continue', ...available], rng);
      if (reaction && reaction !== 'continue') return reaction;
    }
    return vesselPick(VESSEL_CHOICES[Math.min(2, (b.phase || 1) - 1)]!, memory, available, rng);
  },
  fx: { wait() {} },
  onAttack(k, attack) {
    const { sc, b, d } = k;
    const [p] = sc.nearestPlayer(b.x + b.w / 2, b.y);
    if (!p) return;
    if (attack === 'daggers') {
      const right = p.x < sc.L.W * 16;
      const x = right ? sc.L.W * 32 - b.w - 96 : 96;
      teleport(k, x, d.floor - b.h);
      b.face = p.x + p.w / 2 > b.x + b.w / 2 ? 1 : -1;
      d.dir = b.face;
    }
    if (attack === 'pillars') {
      const x = Math.max(80, Math.min(sc.L.W * 32 - 80, p.x + p.w / 2));
      const height = (15.38 - 9.2) * ((sc.L.W * 32 - 96) / 38.63);
      teleport(k, x - b.w / 2, d.floor - b.h - height);
      b['vesselDropHeight'] = height;
      b.onGround = false;
      delete b['vesselLandingY'];
      // Отдельный снимок: никакого слежения за игроком после исчезновения.
      b['vesselDropX'] = b.x;
    }
  },
  frame({ b, d, def, sc }) {
    if (d.atk !== 'pillars' || d.mode !== 'attack') return;
    const a = def.attacks.find((x) => x.id === 'pillars')!;
    const x = Number(b['vesselDropX'] ?? b.x);
    b.x = x; b.vx = 0;
    d.lock = { x: x + b.w / 2, y: Number(b['vesselLandingY'] ?? d.floor) };
    if (d.af < a.tell.frames) {
      b.y = d.floor - b.h - Number(b['vesselDropHeight'] ?? 210);
      b.vy = 0; b.onGround = false;
    } else if (d.af === a.tell.frames && !b.onGround) {
      // Stomp Down: исходные -85 Unity units/s, переведённые в ось Y вниз.
      b.vy = 85 * ((sc.L.W * 32 - 96) / 38.63);
    } else if (d.af === a.tell.frames + 1) {
      b['vesselLandingY'] = b.y + b.h; d.lock.y = b.y + b.h;
      sc.parts(18, x + b.w / 2, d.floor, 0xf4f1ff); sc.shake(120, 0.003);
    }
  },
  guard({ b, d, def }, hit) {
    const tell = def.attacks.find((a) => a.id === 'guard')?.tell.frames ?? 12;
    if (b.stagger <= 0 && d.atk === 'guard' && d.af >= tell && b.state === 'active' && hit.source === 'melee') return 'c_riposte';
  },
} satisfies BossKind;
