import type { BossKind, KindApi } from '../kinds';

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
      teleport(k, x - b.w / 2, d.floor - b.h - 210);
      // Отдельный снимок: никакого слежения за игроком после исчезновения.
      b['vesselDropX'] = b.x;
    }
  },
  frame({ b, d, def, sc }) {
    if (d.atk !== 'pillars' || d.mode !== 'attack') return;
    const a = def.attacks.find((x) => x.id === 'pillars')!;
    const t = d.af - a.tell.frames;
    if (t <= 13) {
      const progress = Math.max(0, Math.min(1, t / 12));
      b.y = d.floor - b.h - 210 * (1 - progress * progress);
      b.x = Number(b['vesselDropX'] ?? b.x);
      b.vx = b.vy = 0;
      b.onGround = progress >= 1;
    }
    d.lock = { x: Number(b['vesselDropX'] ?? b.x) + b.w / 2, y: d.floor };
    if (t === 13) { sc.parts(18, b.x + b.w / 2, d.floor, 0xf4f1ff); sc.shake(120, 0.003); }
  },
  guard({ b, d, def }, hit) {
    const tell = def.attacks.find((a) => a.id === 'guard')?.tell.frames ?? 12;
    if (b.stagger <= 0 && d.atk === 'guard' && d.af >= tell && b.state === 'active' && hit.source === 'melee') return 'c_riposte';
  },
} satisfies BossKind;
