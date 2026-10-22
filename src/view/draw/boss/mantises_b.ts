// Рисунок Орса, прыгуна из боя «Три Богомола»: жилистый, янтарный, с короткими парными клинками, пригнут к земле.
import type { BossDrawFn } from '../bossdraw';
import { drawMantis, type MantisLook } from './mantises';

const ORS: MantisLook = { body: 0xc8a23a, dark: 0x6d531a, blade: 0xfff0b8, eye: 0xff9a5a, bladeLen: 0.6, pairs: 2, wings: false, stoop: 5 };
const base: BossDrawFn = (w, b, g, now, c) => drawMantis(w, b, g, now, c, ORS);
export default { base };
