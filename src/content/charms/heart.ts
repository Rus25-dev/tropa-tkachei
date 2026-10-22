// Паучье сердце: +1 бутон здоровья.
import { defineCharm } from '../../core/charm-kit';

export default defineCharm({ id: 'heart', order: 2, name: 'Паучье сердце', desc: '+1 бутон здоровья. Тяжёлый оберег: занимает два слота.', unlock: 'shop:60', slots: 2, col: 0xff6a7a, maxHp: 1 });
