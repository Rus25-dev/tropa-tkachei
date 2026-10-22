// Реестры содержимого — в одном листовом модуле (без зависимостей, кроме типов), чтобы автозагрузка src/content
// не попадала в циклы импорта ядра: ядро и файлы содержимого импортируют реестры отсюда.
import type { WeaponDef } from '../weapon-kit';
import { Registry } from './registry';

export const weaponReg = new Registry<WeaponDef>('оружие', (d) => {
  if (!(d.dmg > 0) || !(d.combo >= 1)) throw new Error(`оружие «${d.id}»: нужны dmg > 0 и combo ≥ 1`);
  if (!d.unlock) throw new Error(`оружие «${d.id}»: нет unlock`);
});
