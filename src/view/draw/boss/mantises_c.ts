// Рисунок Вьюн, метательницы из боя «Три Богомола»: тонкая, бирюзовая, с одним длинным клинком и прозрачными крыльями.
import type { BossDrawFn } from '../bossdraw';
import { drawMantis, type MantisLook } from './mantises';

const VYUN: MantisLook = { body: 0x5aa6a0, dark: 0x2c5a56, blade: 0xe6fbf6, eye: 0xb9fff0, bladeLen: 0.8, pairs: 1, wings: true, stoop: 0 };
const base: BossDrawFn = (w, b, g, now, c) => drawMantis(w, b, g, now, c, VYUN);
export default { base };
