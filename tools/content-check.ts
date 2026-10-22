// Проверка подключаемого содержимого: npm run content:check [-- --json].
// Загружает src/content (логика) и src/view/content (отрисовка, звуки), печатает, что найдено по каждому виду, и проверяет полноту:
//   ошибки (код выхода 1): у вещи нет обязательной отрисовки, босс ссылается на неизвестный снаряд или арену;
//   предупреждения: имя звука из ядра, содержимого или данных боссов не заведено в src/view/content/sounds.
// С ключом --json печатает { kinds, errors, warnings, missingSounds } — так отчёт забирает испытательный стенд.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { arenaReg, abilReg, charmReg, enemyReg, moveReg, projReg, toolEntReg, toolReg, weaponReg } from '../src/core/plugin/regs';
import { registerViews, VIEW_KINDS } from '../src/view/content/load';
import { abilityViewReg, arenaViewReg, enemyViewReg, kitFxView, projViewReg, soundReg, toolEntView, toolViewReg, weaponViewReg } from '../src/view/content/regs';
import { dataBossIds, bossDef, bossRaw } from '../src/core/boss/registry';
import { arenaErrs, projKindErrs } from '../src/core/boss/schema';

const ROOT = join(import.meta.dirname, '..');
const json = process.argv.includes('--json');

// ----- загрузка отрисовки (в Node нет import.meta.glob) -----
const viewDir = join(ROOT, 'src/view/content'), by: Record<string, Record<string, unknown>> = {};
for (const k of VIEW_KINDS) {
  const dir = join(viewDir, k.dir); let files: string[];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_') && !f.includes('.test.')).sort(); } catch { continue; }
  for (const f of files) (by[k.dir] ??= {})[f] = await import(pathToFileURL(join(dir, f)).href);
}
registerViews(by);

const errors: string[] = [], warnings: string[] = [];
const need = (ok: unknown, msg: string): void => { if (!ok) errors.push(msg); };

// ----- полнота: у каждой вещи есть то, без чего её не видно в игре -----
for (const id of weaponReg.ids()) need(weaponViewReg.get(id), `оружие «${id}»: нет src/view/content/weapons/${id}.ts`);
for (const id of toolReg.ids()) need(toolViewReg.get(id)?.icon, `инструмент «${id}»: нет значка (icon) в src/view/content/tools/${id}.ts`);
for (const id of toolEntReg.ids()) need(toolEntView.get(id), `сущность инструмента «${id}»: нет отрисовки (ents) в src/view/content/tools`);
for (const id of abilReg.ids()) need(abilityViewReg.get(id)?.icon, `приём «${id}»: нет значка (icon) в src/view/content/abilities/${id}.ts`);
for (const c of moveReg.list().flatMap((m) => m.codes ?? [])) need(kitFxView.get(c), `код состояния приёма ${c}: нет эффекта (fx) в src/view/content/abilities`);
for (const id of enemyReg.ids()) need(enemyViewReg.get(id), `враг «${id}»: нет src/view/content/enemies/${id}.ts`);
for (const id of projReg.ids()) need(projViewReg.get(id), `снаряд «${id}»: нет src/view/content/projectiles/${id}.ts`);
for (const id of arenaReg.ids()) if (!arenaViewReg.get(id)) warnings.push(`арена «${id}»: нет убранства src/view/content/arenas/${id}.ts (будет голый уровень)`);
for (const id of dataBossIds()) for (const e of [...projKindErrs(bossDef(id)), ...arenaErrs(bossDef(id)!)]) errors.push(`босс «${id}»: ${e}`);

// ----- звуки: какие имена называют ядро, содержимое и данные боссов -----
const used = new Map<string, Set<string>>(); // имя → где встречается
const note = (n: string, where: string): void => { if (!used.has(n)) used.set(n, new Set()); used.get(n)!.add(where); };
const walkTs = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walkTs(p) : p.endsWith('.ts') ? [p] : []; });
for (const base of ['src/core', 'src/content']) for (const p of walkTs(join(ROOT, base))) {
  const src = readFileSync(p, 'utf8'), rel = p.slice(ROOT.length + 1).replace(/\\/g, '/');
  for (const m of src.matchAll(/\.(?:sfx|snd)\(\s*'([A-Za-z0-9_]+)'/g)) note(m[1]!, rel);
  for (const m of src.matchAll(/\b(?:castSnd|snd|sfx)\s*:\s*'([A-Za-z0-9_]+)'/g)) note(m[1]!, rel);
  for (const m of src.matchAll(/return '([A-Za-z0-9_]+)';/g)) if (/Snd\(/.test(src.slice(Math.max(0, m.index! - 400), m.index))) note(m[1]!, rel); // помощники вида bossHitSnd
}
const walkJson = (o: unknown, where: string): void => {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach((x) => walkJson(x, where)); return; }
  for (const [k, v] of Object.entries(o)) { if (k === 'sfx' && typeof v === 'string') note(v, where); else walkJson(v, where); }
};
for (const id of dataBossIds()) walkJson(bossRaw(id), `data/bosses/${id}.json`);
const missing = [...used.keys()].filter((n) => !soundReg.has(n)).sort();
for (const n of missing) warnings.push(`звук «${n}» не заведён (src/view/content/sounds): ${[...used.get(n)!].join(', ')}`);

// ----- отчёт -----
const kinds = {
  weapons: weaponReg.ids(), tools: toolReg.ids(), charms: charmReg.ids(), abilities: abilReg.ids(), enemies: enemyReg.ids(),
  projectiles: projReg.ids(), arenas: arenaReg.ids(), sounds: soundReg.size, bosses: dataBossIds().length,
};
if (json) {
  console.log(JSON.stringify({ kinds, errors, warnings, missingSounds: missing.map((n) => ({ name: n, where: [...used.get(n)!] })) }, null, 2));
} else {
  console.log('Содержимое игры:');
  for (const [k, v] of Object.entries(kinds)) console.log(`  ${k.padEnd(12)} ${Array.isArray(v) ? `${v.length}: ${v.join(', ')}` : v}`);
  for (const e of errors) console.log(`  \x1b[31mошибка\x1b[0m ${e}`);
  for (const w of warnings) console.log(`  \x1b[33mпредупреждение\x1b[0m ${w}`);
  console.log(errors.length ? `\x1b[31mошибок: ${errors.length}\x1b[0m, предупреждений: ${warnings.length}` : `\x1b[32mошибок нет\x1b[0m, предупреждений: ${warnings.length}`);
}
process.exitCode = errors.length ? 1 : 0;
