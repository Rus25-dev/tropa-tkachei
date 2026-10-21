import { copyFileSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Второй проход сборки (после основного vite.config.ts): публичная страница рейтинга dist/rating.html — один самодостаточный файл (uPlot и стили внутри),
// плюс data/races.json копируется в dist/data/races.json. В игру (dist/index.html) код рейтинга не попадает: у страницы свой вход.
const copyRaces = (): Plugin => ({
  name: 'tt-copy-races',
  closeBundle() { mkdirSync('dist/data', { recursive: true }); copyFileSync('data/races.json', 'dist/data/races.json'); },
});

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [preact(), viteSingleFile(), copyRaces()],
  build: { target: 'es2022', emptyOutDir: false, outDir: 'dist', assetsInlineLimit: 100_000_000, sourcemap: false, rollupOptions: { input: 'rating.html' } },
});
