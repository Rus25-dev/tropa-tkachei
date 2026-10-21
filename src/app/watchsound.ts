// Звук обсервера «Гонок Ткачей»: эффекты по событиям ленты и музыка босса того, кто идёт впереди. Своя громкость (по умолчанию 60 %) и «Без звука».
// Окно обсервера не ставится на паузу, поэтому звук идёт и в фоне; разблокируется первым кликом или клавишей (правила браузера).
import type { RaceEvent } from '../net/racecommon';
import type { RaceWatch } from '../net/racewatch';
import { Music } from '../view/audio/music';
import { Snd } from '../view/audio/snd';

/** событие ленты → звук синтезатора */
export const EVENT_SOUND: Record<string, string> = { veto: 'clink', cd: 'bead', go: 'gate', split: 'coin', death: 'hurt', buy: 'pickup', parry: 'parry', exec: 'exec', phase: 'roar', stun: 'stagger', done: 'bossdie', dnf: 'hurt', pause: 'clink' };
/** ключ босса в телеметрии → трек музыки */
export const BOSS_TRACK: Record<string, string> = { k: 'boss', m: 'misha', v: 'vladik', t: 'tima' };

const KEY = 'tt_rw_audio';
export class WatchSound {
  vol = 60; muted = false; track: string | null = null;
  private off: (() => void) | null = null; private timer = 0;
  constructor(private w: RaceWatch) {
    try { const o = JSON.parse(localStorage.getItem(KEY) || 'null') as { vol?: number; muted?: boolean } | null; if (o) { if (typeof o.vol === 'number') this.vol = Math.max(0, Math.min(100, o.vol)); this.muted = !!o.muted; } } catch { /* по умолчанию */ }
  }
  start(): void {
    this.apply();
    this.w.onFeed = (e) => this.onEvent(e);
    this.timer = window.setInterval(() => this.music(), 500);
  }
  stop(): void { if (this.w.onFeed) this.w.onFeed = null; window.clearInterval(this.timer); Music.stop(); this.track = null; this.off?.(); }
  private save(): void { try { localStorage.setItem(KEY, JSON.stringify({ vol: this.vol, muted: this.muted })); } catch { /* нет доступа */ } }
  private apply(): void { const v = this.muted ? 0 : this.vol; Snd.setVolume(v); Music.setVolume(v); }
  setVolume(v: number): void { this.vol = Math.max(0, Math.min(100, Math.round(v))); this.muted = false; this.apply(); this.save(); this.w.changed(); }
  toggleMute(): void { this.muted = !this.muted; this.apply(); this.save(); this.w.changed(); }
  onEvent(e: RaceEvent): void {
    if (this.muted || this.vol === 0 || this.w.replay) return;
    const n = EVENT_SOUND[e.k]; if (n) Snd.play(n);
  }
  /** трек: босс игрока, который дальше по дистанции (при равенстве — первый); нет боя — тишина */
  pickTrack(): string | null {
    const ps = this.w.S?.players || [];
    const fights = ps.map((p) => ({ n: (p.splits || []).filter((x) => x != null).length, b: this.w.tel[p.seat]?.['bs'] as { on?: boolean; k?: string } | undefined })).filter((x) => x.b?.on && x.b.k);
    fights.sort((a, b) => b.n - a.n);
    return fights[0] ? BOSS_TRACK[fights[0].b!.k!] ?? 'boss' : null;
  }
  private music(): void {
    if (this.muted || this.vol === 0 || this.w.S?.phase !== 'run') { if (this.track) { Music.stop(); this.track = null; } return; }
    const t = this.pickTrack();
    if (t === this.track) return;
    this.track = t; if (t) Music.play(t); else Music.stop();
  }
}