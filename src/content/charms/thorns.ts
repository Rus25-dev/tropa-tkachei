// Колючий плащ: враг, ранивший касанием, получает 1 урона в ответ.
import { bossOf, bossRefs } from '../../core/bosses2';
import { defineCharm } from '../../core/charm-kit';
import { killEnemy } from '../../core/combat';
import { bossDamage, bossLive } from '../../core/status';

export default defineCharm({
  id: 'thorns', order: 6, name: 'Колючий плащ', desc: 'Когда враг ранит вас касанием, он получает 1 урона в ответ.', unlock: 'shop:55', slots: 1, col: 0xd9a35a,
  hurt: (sc, p, { srcX, spike, hp0 }) => {
    if (spike || srcX == null || !(p.hp < hp0) || !sc.auth()) return;
    const px = p.x + 7, py = p.y + 13, near = (o: { x: number; y: number; w: number; h: number }): boolean => Math.abs(o.x + o.w / 2 - srcX) < 1.5 && Math.abs(o.y + o.h / 2 - py) < 60 + o.h / 2 && Math.abs(o.x + o.w / 2 - px) < 60 + o.w / 2;
    const e = sc.enemies.find((o) => !o.dead && near(o));
    if (e) {
      e.hp -= 1; e.flash = 0.1; sc.burst(8, e.x + e.w / 2, e.y + e.h / 2, 0xd9a35a); sc.sfx('clink');
      e.kbT = 0.14; e.kbx = Math.sign(e.x + e.w / 2 - px) * 200; e.kby = -80;
      if (e.hp <= 0) killEnemy(sc, e);
    } else {
      const key = bossRefs(sc).map(([, k]) => k).find((k) => { const b = bossOf(sc, k); return b && bossLive(b) && near(b); });
      if (key) { bossDamage(sc, key, p, 1); sc.burst(8, srcX, py, 0xd9a35a); }
    }
  },
});
