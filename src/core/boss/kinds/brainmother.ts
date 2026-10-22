// «Мозг-мать»: только постановка; все числа боя лежат в data/bosses/brainmother.json.
// Хук смерти: громкий финал (вспышка, тряска, реплика), длина — deathFrames босса.
import type { BossKind } from '../kinds';

export default {
  onDeath(k) {
    k.sc.emit('flash', { ms: 600, r: 255, g: 255, b: 255 });
    k.sc.shake(1200, 0.012);
    k.sc.toast('Свет гаснет…', 3);
  },
} satisfies BossKind;
