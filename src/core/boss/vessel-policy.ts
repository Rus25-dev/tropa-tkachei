// Факты: GOG HK 1.5.12620, HK Prime/Control, Choice P1/P2/P3; все веса относительные.
export interface VesselChoice { chain: string; weight: number; maxRepeat: number; maxMissed: number }
export interface VesselMemory { counts: Record<string, number>; missed: Record<string, number> }
export const VESSEL_CHOICES: readonly (readonly VesselChoice[])[] = [
  [
    {
      "chain": "c_a3",
      "weight": 0.25,
      "maxRepeat": 2,
      "maxMissed": 5
    },
    {
      "chain": "c_pillars",
      "weight": 0.25,
      "maxRepeat": 2,
      "maxMissed": 5
    },
    {
      "chain": "c_lunge",
      "weight": 0.25,
      "maxRepeat": 2,
      "maxMissed": 5
    },
    {
      "chain": "c_daggers",
      "weight": 0.25,
      "maxRepeat": 2,
      "maxMissed": 5
    }
  ],
  [
    {
      "chain": "c_a3",
      "weight": 0.20000000298023224,
      "maxRepeat": 2,
      "maxMissed": 6
    },
    {
      "chain": "c_pillars",
      "weight": 0.20000000298023224,
      "maxRepeat": 2,
      "maxMissed": 6
    },
    {
      "chain": "c_lunge",
      "weight": 0.20000000298023224,
      "maxRepeat": 2,
      "maxMissed": 6
    },
    {
      "chain": "c_daggers",
      "weight": 0.20000000298023224,
      "maxRepeat": 2,
      "maxMissed": 6
    },
    {
      "chain": "c_focus",
      "weight": 0.20000000298023224,
      "maxRepeat": 1,
      "maxMissed": 6
    }
  ],
  [
    {
      "chain": "c_a3",
      "weight": 0.15000000596046448,
      "maxRepeat": 1,
      "maxMissed": 7
    },
    {
      "chain": "c_lunge",
      "weight": 0.15000000596046448,
      "maxRepeat": 2,
      "maxMissed": 8
    },
    {
      "chain": "c_focus",
      "weight": 0.10000000149011612,
      "maxRepeat": 1,
      "maxMissed": 8
    },
    {
      "chain": "c_pillars",
      "weight": 0.20000000298023224,
      "maxRepeat": 2,
      "maxMissed": 7
    },
    {
      "chain": "c_daggers",
      "weight": 0.20000000298023224,
      "maxRepeat": 1,
      "maxMissed": 7
    },
    {
      "chain": "c_tendrils",
      "weight": 0.4000000059604645,
      "maxRepeat": 1,
      "maxMissed": 5
    }
  ]
];

/** Политика повторов и пропущенных атак из SendRandomEventV3; RNG предоставляет мир. */
export function vesselPick(table: readonly VesselChoice[], mem: VesselMemory, available: readonly string[], random: () => number): string | null {
  const allowed = table.filter((r) => available.includes(r.chain));
  if (!allowed.length) return null;
  let picked: VesselChoice | undefined;
  // При нескольких просроченных событиях оригинал выбирает последнее в массиве.
  for (const r of allowed) if ((mem.missed[r.chain] ?? 0) >= r.maxMissed) picked = r;
  const forced = !!picked;
  // V3 делает случайную выборку даже когда затем переопределяет её просроченной атакой.
  if (forced) random();
  if (!picked) {
    const candidates = allowed.filter((r) => (mem.counts[r.chain] ?? 0) < r.maxRepeat);
    if (!candidates.length) return null;
    // Отбраковка повторов сохраняет расход RNG, но ограничена от зависания.
    const total = allowed.reduce((n, r) => n + r.weight, 0);
    for (let attempt = 0; attempt < 100 && !picked; attempt++) {
      let x = random() * total;
      const candidate = allowed.find((r) => (x -= r.weight) < 0) ?? allowed[allowed.length - 1]!;
      if ((mem.counts[candidate.chain] ?? 0) < candidate.maxRepeat) picked = candidate;
    }
    picked ??= candidates[0];
  }
  const repeat = forced ? 1 : (mem.counts[picked!.chain] ?? 0) + 1;
  for (const r of table) { mem.counts[r.chain] = 0; mem.missed[r.chain] = (mem.missed[r.chain] ?? 0) + 1; }
  mem.counts[picked!.chain] = repeat; mem.missed[picked!.chain] = 0;
  return picked!.chain;
}
