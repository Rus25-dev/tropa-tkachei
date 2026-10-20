import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Правила на баги (no-undef, no-unused-vars, no-fallthrough, eqeqeq smart) + чистота ядра:
// в src/core/** запрещены Math.random, Date, performance, таймеры браузера, DOM и Phaser — ядро обязано работать в чистом Node.
const coreBan = [
  { selector: "MemberExpression[object.name='Math'][property.name='random']", message: 'В ядре нельзя Math.random: берите поток из core/rng (this.rng / rngFor).' },
  { selector: "Identifier[name='Date']", message: 'В ядре нельзя Date: время считается тиками логики.' },
  { selector: "Identifier[name='performance']", message: 'В ядре нельзя performance: время считается тиками логики.' },
  { selector: "CallExpression[callee.name=/^(setTimeout|setInterval|requestAnimationFrame|queueMicrotask)$/]", message: 'В ядре нельзя таймеры браузера: все задержки — счётчики тиков.' },
];

export default tseslint.config(
  { ignores: ['dist/**', 'legacy/**', 'node_modules/**', 'tests/golden/**', 'tests/repro/**', 'ml/**', 'playwright-report/**', 'test-results/**', '**/*.min.js', 'dev-shots/**', 'shots/**', 'race-shots/**', 'touch/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-fallthrough': 'error',
      'no-undef': 'off', // для TypeScript проверяет компилятор (tsc), для .mjs-скриптов включаем ниже
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  { files: ['**/*.mjs', '**/*.js'], languageOptions: { globals: { console: 'readonly', process: 'readonly', fetch: 'readonly', setTimeout: 'readonly', URL: 'readonly' } }, rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...coreBan],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'requestAnimationFrame'],
      'no-restricted-imports': ['error', { patterns: ['phaser', 'preact', 'preact/*', '**/view/**', '**/ui/**', '**/net/**', '**/input/**', 'peerjs', 'idb-keyval'] }],
    },
  },
);
