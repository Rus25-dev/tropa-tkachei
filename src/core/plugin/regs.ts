// Реестры содержимого — в одном листовом модуле (без зависимостей, кроме типов), чтобы автозагрузка src/content
// не попадала в циклы импорта ядра: ядро и файлы содержимого импортируют реестры отсюда.
import type { WeaponDef } from '../weapon-kit';
import type { ToolDef, ToolEntDef, ToolMsg } from '../tool-kit';
import type { CharmDef } from '../charm-kit';
import type { World } from '../world';
import { Registry } from './registry';

export const weaponReg = new Registry<WeaponDef>('оружие', (d) => {
  if (!(d.dmg > 0) || !(d.combo >= 1)) throw new Error(`оружие «${d.id}»: нужны dmg > 0 и combo ≥ 1`);
  if (!d.unlock) throw new Error(`оружие «${d.id}»: нет unlock`);
});

/** виды на проводе в снимке гостя (снаряды и сущности инструментов): код netId, размер строки */
export interface NetKind { id: string; netId: number; size: [number, number] }
export const netKindReg = new Registry<NetKind>('виды в снимке');

/** сущности инструментов (w.tl) по виду */
export const toolEntReg = new Registry<ToolEntDef>('сущности инструментов');
/** сообщения 'tool' с особыми id (не инструменты): удары нырка и т. п. */
export const toolMsgs = new Map<string, (sc: World, m: ToolMsg) => void>();

export const toolReg = new Registry<ToolDef>('инструменты', (d) => {
  if (!(d.cost >= 0) || !(d.cd >= 0)) throw new Error(`инструмент «${d.id}»: нужны cost ≥ 0 и cd ≥ 0`);
  if (!d.unlock) throw new Error(`инструмент «${d.id}»: нет unlock`);
});
toolReg.onDefine((d) => {
  for (const e of d.entities ?? []) { if (!toolEntReg.has(e.id)) toolEntReg.define(e); if (!netKindReg.has(e.id)) netKindReg.define({ id: e.id, netId: e.netId, size: e.size }); }
  for (const [k, f] of Object.entries(d.msgs ?? {})) toolMsgs.set(k, f);
});

export const charmReg = new Registry<CharmDef>('обереги', (d) => {
  if (!(d.slots >= 1)) throw new Error(`оберег «${d.id}»: slots ≥ 1`);
  if (!d.unlock) throw new Error(`оберег «${d.id}»: нет unlock`);
});
