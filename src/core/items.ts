// Предметы-способности на карте (legacy/src/combat2.js: initItems, stepItems).
import { T } from './balance';
import type { World } from './world';
import { saveProgress } from './campaign';

export function initItems(sc: World): void {
  sc.items = (sc.L.items || []).filter((it) => !sc.abil[it.ability]).map((it) => ({ ...it, px: it.x * T + 16, py: (it.y + 1) * T - 20 }));
}
export function stepItems(sc: World): void {
  if (!sc.items || !sc.items.length) return;
  for (const it of sc.items) {
    if (it['got']) continue;
    for (const p of sc.players) if (!p.remote && !p.downed && Math.hypot(p.x + 7 - (it['px'] as number), p.y + 13 - (it['py'] as number)) < 28) {
      it['got'] = true; sc.abil[it['ability'] as string] = true; sc.snd('revive');
      sc.parts(40, it['px'] as number, it['py'] as number, 0xffe3a3); sc.shake(300, 0.006);
      sc.toast(it['text'] as string, 5);
      if (sc.online) sc.sendEv({ k: 'abil', a: it['ability'] });
      if (sc.auth()) saveProgress(sc, { ...(sc.progress || { bench: 0, beads: sc.beads }), abil: sc.abil }); // у гостя сохранение не его: запишет хост
    }
  }
  sc.items = sc.items.filter((it) => !it['got']);
}
