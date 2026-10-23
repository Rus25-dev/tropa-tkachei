// Особая логика боссов (волна 0): необязательный файл src/core/boss/kinds/<id>.ts с default-экспортом BossKind.
// Файл находится сам: в Vite и Vitest — через import.meta.glob (eager), в Node-инструментах (tsx: sim, bot, boss:check, boss:nohit) — чтением папки и динамическим import.
// Правило для файлов kinds/*.ts: из ядра импортировать только ТИПЫ (import type), иначе получится цикл с исполнителем; нужное исполнитель передаёт в KindApi.
// Что можно: хук кадра, смена фазы, начало атаки, смерть, особые эффекты атак (attack.fx → kind.fx[имя]) и запрет связки (allow).
import type { Boss } from '../types';
import type { BossHit } from '../hit';
import type { World } from '../world';
import type { DState } from './exec';
import type { BossDef } from './schema';

/** Всё, что хук видит: мир, босс, его состояние исполнителя, определение, индекс в sc.bosses и поток ГСЧ боссов (детерминизм: только он, без Math.random). */
export interface KindApi { sc: World; b: Boss; d: DState; def: BossDef; i: number; rng: () => number }
export interface BossKind {
  /** Авторская политика выбирает только из прошедших условия связок. */
  select?(k: KindApi, available: readonly string[]): string | null;
  /** Перехват попадания до урона: вернуть связку ответа, чтобы блокировать удар. */
  guard?(k: KindApi, hit: BossHit): string | void;
  /** Успешный урон: можно ответить связкой с полным замахом. Не вызывается при смерти, смене фазы и оглушении. */
  onDamage?(k: KindApi, damage: number): string | void;
  /** каждый кадр исполнителя (после стандартного шага кадра) */
  frame?(k: KindApi): void;
  /** фаза сменилась (после рёва, сцены и применения тела) */
  onPhase?(k: KindApi, phase: number): void;
  /** началась атака (замах) */
  onAttack?(k: KindApi, attack: string): void;
  /** босс убит */
  onDeath?(k: KindApi): void;
  /** особые эффекты атак: attack.fx: [{ at, name, args }] вызывают fx[name](k, args) в этот кадр */
  fx?: Record<string, (k: KindApi, args: Record<string, unknown>) => void>;
  /** запретить выбор связки в текущей обстановке (дополнительно к requires) */
  allow?(k: KindApi, chain: string): boolean;
}

const KINDS = new Map<string, BossKind>();
/** Подключить особую логику босса вручную (тесты, фикстуры); файлы kinds/<id>.ts подключаются сами */
export function registerKind(id: string, kind: BossKind): void { KINDS.set(id, kind); }
export function unregisterKind(id: string): void { KINDS.delete(id); }
export const kindOf = (id: string): BossKind | undefined => KINDS.get(id);
export const kindIds = (): string[] => [...KINDS.keys()];

const idOfPath = (p: string): string => (p.split(/[\\/]/).pop() ?? p).replace(/\.(ts|js|mjs)$/, '');
const isKind = (m: unknown): m is BossKind => !!m && typeof m === 'object';

// ---------- автообнаружение ----------
function viaVite(): Record<string, unknown> | null {
  try { return import.meta.glob<unknown>(['./kinds/*.ts', '!./kinds/*.test.ts'], { eager: true, import: 'default' }); } catch { return null; }
}
const vite = viaVite();
if (vite) for (const p of Object.keys(vite).sort()) { const m = vite[p]; if (isKind(m)) KINDS.set(idOfPath(p), m); }

/** Подключить все kinds-файлы папки (Node): имя файла без расширения — id босса. Возвращает подключённые id. */
export async function loadKindsFromDir(dir: string): Promise<string[]> {
  const fs = process.getBuiltinModule('node:fs'), url = process.getBuiltinModule('node:url'), path = process.getBuiltinModule('node:path');
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.(ts|mjs|js)$/.test(x) && !/\.test\.(ts|js|mjs)$/.test(x) && !x.endsWith('.d.ts')).sort()) {
    const m = (await import(/* @vite-ignore */ url.pathToFileURL(path.join(dir, f)).href)) as { default?: unknown };
    if (isKind(m.default)) { KINDS.set(idOfPath(f), m.default); out.push(idOfPath(f)); }
  }
  return out;
}
if (!vite && typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function') {
  const url = process.getBuiltinModule('node:url');
  await loadKindsFromDir(url.fileURLToPath(import.meta.url.replace(/[^/]*$/, 'kinds/'))); // без new URL(…, import.meta.url): Vite принял бы её за ресурс
}
