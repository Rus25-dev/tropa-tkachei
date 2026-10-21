// Режим ?dev=1: ползунки баланса прямо в игре (lil-gui). Меняют числа ядра на лету (физика, бой, инструменты) — для подбора по ощущению.
// Кнопка «Скопировать balance.json» кладёт текущие значения в буфер обмена; в игру они попадают только вручную (data/balance.json).
// Подключается только по ?dev=1 (отдельный динамический импорт), в обычной игре не загружается.
import GUI from 'lil-gui';
import { BAL, MV2, P, TOOL } from '../core/balance';

type Obj = Record<string, unknown>;
function addAll(g: GUI, o: Obj, path: string): void {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'number') {
      const step = Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 10 ? 0.1 : 0.01;
      g.add(o, k, v < 0 ? v * 3 : 0, v === 0 ? 10 : Math.max(Math.abs(v) * 3, 1), step).name(k);
    } else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) {
      const f = g.addFolder(k).close(); (v as number[]).forEach((_, i) => f.add(v as unknown as Obj, String(i), 0, Math.max(Math.abs(v[i] as number) * 3, 1), 1).name(`${k}[${i}]`));
    } else if (v && typeof v === 'object') addAll(g.addFolder(k).close(), v as Obj, path + '.' + k);
  }
}
export function initDev(): void {
  const gui = new GUI({ title: 'Баланс (?dev=1)' });
  gui.domElement.style.zIndex = '40';
  const groups: Record<string, Obj> = { P, BAL, TOOL, MV2 } as unknown as Record<string, Obj>;
  const snapshot = (): string => JSON.stringify(groups, null, 2);
  const orig = snapshot();
  for (const [name, o] of Object.entries(groups)) addAll(gui.addFolder(name).close(), o, name);
  gui.add({ copy: () => { void navigator.clipboard.writeText(snapshot()); } }, 'copy').name('Скопировать balance.json');
  gui.add({ reset: () => { const o = JSON.parse(orig) as Record<string, Obj>; for (const [n, src] of Object.entries(o)) Object.assign(groups[n]!, src); gui.controllersRecursive().forEach((c) => c.updateDisplay()); } }, 'reset').name('Сбросить');
}
