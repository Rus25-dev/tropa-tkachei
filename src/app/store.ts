// Хранилище в браузере (localStorage): настройки, сохранение главы, снаряжение, рекорды боссов, спидран. Ключи и формат — как в v1.8,
// чтобы сохранения старой игры читались без миграции. Любой доступ обёрнут: в приватном режиме и при запрете хранилища игра идёт без сохранений.
import type { Progress } from '../core/campaign';
import { normalizeSave, type LoadoutSave, CHARMS, TOOLS, CHARM_SLOTS, canFit } from '../core/loadout';
import { WEAPONS } from '../core/weapons';

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); if (!raw) return fallback; return JSON.parse(raw) as T; } catch { return fallback; }
}
function write(key: string, v: unknown): void { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* переполнение или приватный режим */ } }
function remove(key: string): void { try { localStorage.removeItem(key); } catch { /* нет доступа */ } }

// ----- настройки -----
export interface SettingsData { vol: number; mvol: number; shake: boolean; easy: boolean; vibro: boolean; bsize: 'S' | 'M' | 'L'; bop: number; lefty: boolean; boss: number; speed: number; noflash: boolean; outl: boolean; gfx: 'auto' | 'low' | 'mid' | 'high' }
export const SETTINGS_DEFAULT: SettingsData = { vol: 80, mvol: 60, shake: true, easy: false, vibro: true, bsize: 'M', bop: 100, lefty: false, boss: 0, speed: 100, noflash: false, outl: false, gfx: 'auto' };

type Listener = () => void;
class SettingsStore {
  s: SettingsData = { ...SETTINGS_DEFAULT, ...read<Partial<SettingsData>>('tt_settings', {}) };
  private ls = new Set<Listener>();
  set<K extends keyof SettingsData>(k: K, v: SettingsData[K]): void { this.s[k] = v; this.save(); }
  save(): void { write('tt_settings', this.s); for (const l of this.ls) l(); }
  subscribe(l: Listener): () => void { this.ls.add(l); return () => this.ls.delete(l); }
}
export const settings = new SettingsStore();

// ----- сохранение главы -----
export const progress = {
  get(): Progress | null { const p = read<Progress | null>('tt_save', null); return p && typeof p.bench === 'number' ? p : null; },
  set(p: Progress): void { write('tt_save', p); },
  reset(): void { remove('tt_save'); },
};

// ----- снаряжение -----
export const loadout = {
  get(): LoadoutSave { return normalizeSave(read<unknown>('tt_loadout', null)); },
  set(d: LoadoutSave): void { write('tt_loadout', d); },
  /** награда за босса: выдать всё, что открывается за него; возвращает названия новых предметов */
  onBoss(bossId: string): string[] {
    const d = loadout.get(), got: string[] = [];
    for (const kind of ['weapons', 'tools', 'charms'] as const) {
      const reg = { weapons: WEAPONS, tools: TOOLS, charms: CHARMS }[kind] as Record<string, { unlock: string; name: string }>;
      for (const id in reg) if (reg[id]!.unlock === 'boss:' + bossId && !d.have[kind].includes(id)) { d.have[kind].push(id); got.push(reg[id]!.name); }
    }
    if (got.length) loadout.set(d);
    return got;
  },
  equip(kind: 'weapon' | 'tool' | 'charm', id: string): boolean {
    const d = loadout.get();
    if (kind === 'weapon') d.weapon = id; else if (kind === 'tool') d.tool = id;
    else {
      const i = d.charms.indexOf(id);
      if (i >= 0) d.charms.splice(i, 1);
      else if (canFit(d.charms, id) && d.charms.length < CHARM_SLOTS) d.charms.push(id); else return false;
    }
    loadout.set(d); return true;
  },
};

// ----- рекорды боссов -----
export interface BossRecord { tries: number; wins: number; best: number }
export const records = {
  all(): Record<string, BossRecord> { return read<Record<string, BossRecord>>('tt_records', {}); },
  get(id: string): BossRecord { return records.all()[id] ?? { tries: 0, wins: 0, best: 0 }; },
  put(id: string, r: BossRecord): void { const a = records.all(); a[id] = r; write('tt_records', a); },
};

// ----- журнал незавершённого забега (восстановление после падения вкладки) -----
export const journalStore = {
  get<T>(): T | null { return read<T | null>('tt_jr', null); },
  set(j: unknown): void { write('tt_jr', j); },
  clear(): void { remove('tt_jr'); },
};

// ----- спидран: рекорды и сегменты, имя, друзья -----
export interface SrCatRec { pb: { rta: number; igt: number; deaths: number; splits: { rta: number; igt: number }[]; ver: string; date: number } | null; seg: number[] }
export const sr = {
  store(): Record<string, SrCatRec> { return read<Record<string, SrCatRec>>('tt_sr', {}); },
  rec(cat: string): SrCatRec { return sr.store()[cat] ?? { pb: null, seg: [] }; },
  putRec(cat: string, r: SrCatRec): void { const s = sr.store(); s[cat] = r; write('tt_sr', s); },
  name(): string { try { return (localStorage.getItem('tt_sr_name') ?? '').slice(0, 20); } catch { return ''; } },
  setName(n: string): void { try { localStorage.setItem('tt_sr_name', n.slice(0, 20)); } catch { /* нет доступа */ } },
  friends(): string[] { const a = read<unknown>('tt_sr_friends', []); return Array.isArray(a) ? (a as string[]) : []; },
  saveFriends(a: string[]): void { write('tt_sr_friends', a); },
};
