// Движение нырка: голубой шлейф вверх и остриё вниз, высокий след.
import { defineAbilityView } from '../regs';

export default defineAbilityView({
  id: 'dive',
  trails: { 4: { col: 0xcfe8ff, a: 0.35, h: 30 } },
  fx: {
    6: (g) => {
      g.lineStyle(3, 0xcfe8ff, 0.8); g.lineBetween(0, -34, 0, -80); g.lineStyle(2, 0xffffff, 0.7); g.lineBetween(-5, -34, -5, -62); g.lineBetween(5, -34, 5, -62);
      g.fillStyle(0xcfe8ff, 0.7); g.fillTriangle(-6, 0, 6, 0, 0, 12);
    },
  },
});
