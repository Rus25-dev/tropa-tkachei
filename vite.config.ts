import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// Сборка в один index.html (для GitHub Pages). Версия берётся из package.json, номер сборки — из переменной BUILD или даты.
const build = process.env.BUILD ?? new Date().toISOString().slice(2, 16).replace(/[-:T]/g, '').replace(/^(\d{6})(\d{4})$/, '$1.$2');

/** version.json рядом с index.html: по нему игра узнаёт, что вышла новая сборка (плашка «Обновить») */
const versionFile = { name: 'tt-version-json', generateBundle(this: { emitFile(f: { type: 'asset'; fileName: string; source: string }): void }) { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, build }) }); } };

export default defineConfig({
  base: './',
  plugins: [preact(), viteSingleFile(), versionFile],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(build),
  },
  build: { target: 'es2022', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 4000, sourcemap: false },
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
