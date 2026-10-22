// Убранство арены Владика (кабинет музыки): тема урока на доске — только в бою с Владиком 2.0.
import { T } from '../../../core/balance';
import { defineArenaView } from '../regs';

export default defineArenaView({
  id: 'vladik',
  decor: ({ scene, w, keep, font }) => {
    if (w.bossKind !== 'vladik2') return;
    keep(scene.add.text(14 * T, 5 * T + 22, 'Тема: скрипичный ключ', { fontFamily: font, fontSize: '13px', fontStyle: 'italic', color: '#e8eadf' }).setOrigin(0.5, 0).setAlpha(0.75).setDepth(0.25));
  },
});
