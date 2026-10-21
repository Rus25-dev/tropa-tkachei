// Каталог режимов фаззера и генерация задания по номеру прогона: тот же (зерно, номер) всегда даёт то же задание.
import { freshUp, type CampState } from '../../src/core/campaign';
import { CHARMS, TOOLS, canFit, CHARM_SLOTS, type LoadoutSave } from '../../src/core/loadout';
import { mulberry32, rngSeedFor } from '../../src/core/rng';
import { WEAPONS } from '../../src/core/weapons';

export const MODES = [
  'ch1', 'road2', 'road3', 'road4', 'korne',
  'arena-misha', 'arena-vladik', 'arena-tima', 'camp-arena2', 'camp-arena3', 'camp-arena4',
  'train-misha', 'train-vladik', 'train-tima',
  'chain', 'sr-trail', 'sr-boss',
] as const;
export type ModeId = (typeof MODES)[number];
export type Policy = 'random' | 'walker' | 'mixed';

export interface FuzzSpec {
  /** номер прогона (для отчёта) */
  run: number;
  seed: number;
  mode: ModeId;
  players: 1 | 2;
  /** длина прогона в тиках (в цепочках режимов — предел, цепочка может закончиться раньше) */
  ticks: number;
  policy: Policy;
  /** случайные действия интерфейса: пауза, лавка, карта, скамья, «Заново» */
  ui: boolean;
  easy: boolean;
  loadout: LoadoutSave;
  abil: string[];
  up: { hp: number; dmg: number; silk: number };
}

/** веса режимов: цепочки и забеги дороже, поэтому реже; боссов и главу I фаззим чаще */
const WEIGHTS: Record<ModeId, number> = {
  ch1: 14, road2: 5, road3: 5, road4: 5, korne: 8,
  'arena-misha': 8, 'arena-vladik': 8, 'arena-tima': 8, 'camp-arena2': 3, 'camp-arena3': 3, 'camp-arena4': 3,
  'train-misha': 2, 'train-vladik': 2, 'train-tima': 2,
  chain: 8, 'sr-trail': 5, 'sr-boss': 5,
};

function pick<T>(R: () => number, a: readonly T[]): T { return a[Math.floor(R() * a.length)]!; }

export function randomLoadout(R: () => number): LoadoutSave {
  const weapons = Object.keys(WEAPONS), tools = Object.keys(TOOLS), charms = Object.keys(CHARMS);
  const picked: string[] = [];
  for (let k = 0; k < 3; k++) { const c = pick(R, charms); if (!picked.includes(c) && canFit(picked, c) && picked.length < CHARM_SLOTS && R() < 0.8) picked.push(c); }
  return { weapon: pick(R, weapons), tool: R() < 0.7 ? pick(R, tools) : '', charms: picked, have: { weapons, tools, charms } };
}

export function makeSpec(baseSeed: number, run: number, only?: ModeId[]): FuzzSpec {
  const R = mulberry32(rngSeedFor(baseSeed >>> 0, 'fuzz-run:' + run));
  const modes = (only && only.length ? only : [...MODES]) as ModeId[];
  let tot = 0; for (const m of modes) tot += WEIGHTS[m];
  let r = R() * tot, mode = modes[0]!;
  for (const m of modes) { r -= WEIGHTS[m]; if (r <= 0) { mode = m; break; } }
  const long = mode === 'chain' || mode === 'sr-trail' || mode === 'sr-boss';
  const ticks = long ? 9000 + Math.floor(R() * 12000) : 1800 + Math.floor(R() * 12600);
  const abil = (['double', 'ledge', 'glide'] as const).filter(() => R() < 0.6);
  return {
    run, seed: Math.floor(R() * 4294967296) >>> 0, mode, players: mode.startsWith('sr-') ? 1 : R() < 0.3 ? 2 : 1, ticks,
    policy: pick(R, ['random', 'walker', 'mixed'] as const), ui: R() < 0.6, easy: !mode.startsWith('sr-') && R() < 0.15,
    loadout: randomLoadout(R), abil, up: { hp: Math.floor(R() * 4), dmg: Math.floor(R() * 3), silk: Math.floor(R() * 3) },
  };
}

/** состояние кампании для режимов «коридор» и «арена главы» */
export function campFor(spec: FuzzSpec, ch: number, st: 'road' | 'arena'): CampState {
  const abil: Record<string, boolean> = { double: true }; for (const a of spec.abil) abil[a] = true;
  return { ch, st, beads: 20, abil, up: { ...freshUp(), ...spec.up }, time: 0, deaths: 0 };
}
