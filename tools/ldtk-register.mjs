// Подключает импорт файлов LDtk (`import x from '…/tropa.ldtk' with { type: 'json' }`) в чистом Node (tsx, worker_threads).
// Vite и Vitest делают то же самым плагином из vite.config.ts. Запуск: node --import ./tools/ldtk-register.mjs … или `tsx --import …`.
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ldtk')) {
      return { format: 'json', shortCircuit: true, source: readFileSync(fileURLToPath(url), 'utf8') };
    }
    return nextLoad(url, context);
  },
});

// Содержимое игры (src/content: оружие, инструменты, обереги, приёмы…): в Node его надо загрузить до модулей ядра,
// иначе ожидание верхнего уровня при динамическом импорте попадёт в цикл импортов ядра. В Vite содержимое грузит src/content/index.ts.
await import('../src/content/node.ts');
