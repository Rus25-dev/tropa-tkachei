import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// Файлы проектов LDtk (levels/*.ldtk) — это JSON: подключаем их как JSON-модули (в Node то же делает tools/ldtk-register.mjs).
const ldtkJson = (): Plugin => ({
  name: 'ldtk-json',
  enforce: 'pre',
  transform(code, id) { return id.split('?')[0]!.endsWith('.ldtk') ? { code: `export default ${code.trim()};`, map: null } : null; },
});

// Сборка в один index.html (для GitHub Pages). Версия берётся из package.json, номер сборки — из переменной BUILD или даты.
const build = process.env.BUILD ?? new Date().toISOString().slice(2, 16).replace(/[-:T]/g, '').replace(/^(\d{6})(\d{4})$/, '$1.$2');

export default defineConfig({
  base: './',
  plugins: [ldtkJson(), preact(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(build),
  },
  build: { target: 'es2022', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000, sourcemap: false },
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
