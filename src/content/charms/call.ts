// Зов нити: бусины тянутся издалека.
import { defineCharm } from '../../core/charm-kit';

export default defineCharm({ id: 'call', order: 7, name: 'Зов нити', desc: 'Бусины тянутся к вам издалека (в ~2.5 раза дальше).', unlock: 'shop:30', slots: 1, col: 0xffd47a, beadPull: true });
