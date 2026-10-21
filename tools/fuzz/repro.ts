// Находки фаззера на диске: tests/repro/*.json — записи .ttrec с описанием находки. Регрессионный тест (tests/unit/repro.test.ts) проигрывает каждую.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTtrec, parseTtrec, stringifyTtrec, type Ttrec } from '../../src/core/ttrec';
import { INVARIANTS, type Finding, type InvariantId } from './invariants';
import { findingKey } from './minimize';
import type { WorkResult } from './worker';

/** open — найдено, не разобрано (тест красный); fixed — исправлено в ядре (тест ждёт, что нарушения больше нет);
 *  known — особенность v1.8, которую нельзя менять (тест ждёт, что нарушение по-прежнему воспроизводится, и документирует это) */
export type ReproStatus = 'open' | 'fixed' | 'known';
export interface ReproInfo { invariant: InvariantId; key: string; message: string; tick: number; status: ReproStatus; mode: string; players: number; fuzzSeed: number; run: number; note?: string }
export type Repro = Ttrec & { repro: ReproInfo };

export const REPRO_DIR = fileURLToPath(new URL('../../tests/repro', import.meta.url));

const hash8 = (s: string): string => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h.toString(16).padStart(8, '0'); };

export function reproName(r: WorkResult): string {
  return `${r.spec.mode}-${r.finding!.invariant}-${hash8(findingKey(r.finding!) + ':' + r.spec.seed)}`;
}

export function makeRepro(r: WorkResult, fuzzSeed: number, ver: string): Repro {
  const f = r.finding as Finding;
  const t = makeTtrec(r.journal!, {
    ver, meta: { kind: 'fuzz', label: `${INVARIANTS[f.invariant]} · ${r.spec.mode}${r.spec.players === 2 ? ' · вдвоём' : ''}`, note: f.message },
    setup: { easy: r.spec.easy, loadout: r.spec.loadout, progress: r.progress },
  });
  return { ...t, repro: { invariant: f.invariant, key: findingKey(f), message: f.message, tick: f.tick, status: 'open', mode: r.spec.mode, players: r.spec.players, fuzzSeed, run: r.spec.run } };
}

export function saveRepro(name: string, rep: Repro, dir = REPRO_DIR): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name + '.json');
  writeFileSync(path, stringifyTtrec(rep) + '\n');
  return path;
}

export function loadRepros(dir = REPRO_DIR): { name: string; rep: Repro }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const text = readFileSync(join(dir, f), 'utf8');
    const rep = { ...parseTtrec(text), repro: (JSON.parse(text) as Repro).repro } as Repro;
    return { name: f.slice(0, -5), rep };
  });
}
