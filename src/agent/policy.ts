// Инференс политики в игре и в Node: маленький MLP (tanh) + мультидискретные головы. Без внешних библиотек.
// Веса приходят из JSON (ml/rl/export.py). Вычисления в float32, порядок сложения фиксирован — результат повторяем в одном движке.
import { mulberry32 } from '../core/rng';

export interface Layer { in: number; out: number; w: number[]; b: number[] }
export interface AgentModel {
  boss: string; obsDim: number; heads: number[]; lag: number; skip: number;
  mean: number[]; std: number[]; layers: Layer[]; pi: Layer;
  trained?: { run: string; ckpt: string; steps: number; update: number; persona?: string };
}
/** Характер игрока: температура выбора действия, шанс повторить прошлое решение, минимальный промежуток между ударами (в решениях), задержка восприятия (playLag, в решениях; по умолчанию как при обучении), поправки температуры по боссам */
export interface PersonaPlay { title?: string; playLag?: number; temperature: number; stick: number; atkGap: number; bossTemp?: Record<string, number> }
export interface AgentPack { format: 'tt-agent'; v: 1; name: string; personas: Record<string, PersonaPlay>; models: Record<string, AgentModel> }

interface FLayer { nIn: number; nOut: number; w: Float32Array; b: Float32Array }
const fl = (l: Layer): FLayer => ({ nIn: l.in, nOut: l.out, w: Float32Array.from(l.w), b: Float32Array.from(l.b) });

export class Policy {
  private layers: FLayer[]; private pi: FLayer;
  private mean: Float32Array; private invStd: Float32Array;
  private bufs: Float32Array[]; readonly logits: Float32Array; private x: Float32Array;
  readonly heads: number[];
  constructor(readonly model: AgentModel) {
    this.layers = model.layers.map(fl); this.pi = fl(model.pi);
    this.mean = Float32Array.from(model.mean); this.invStd = Float32Array.from(model.std, (s) => 1 / s);
    this.x = new Float32Array(model.obsDim);
    this.bufs = this.layers.map((l) => new Float32Array(l.nOut));
    this.logits = new Float32Array(this.pi.nOut);
    this.heads = model.heads;
  }
  private dense(l: FLayer, inp: Float32Array, out: Float32Array, act: boolean): void {
    const { nIn, nOut, w, b } = l;
    for (let o = 0; o < nOut; o++) {
      let s = b[o]!; const base = o * nIn;
      for (let i = 0; i < nIn; i++) s += w[base + i]! * inp[i]!;
      out[o] = act ? Math.tanh(s) : s;
    }
  }
  /** логиты по сырому наблюдению */
  forward(obs: Float32Array): Float32Array {
    const x = this.x;
    for (let i = 0; i < x.length; i++) { const v = (obs[i]! - this.mean[i]!) * this.invStd[i]!; x[i] = v < -10 ? -10 : v > 10 ? 10 : v; }
    let cur: Float32Array = x;
    for (let k = 0; k < this.layers.length; k++) { this.dense(this.layers[k]!, cur, this.bufs[k]!, true); cur = this.bufs[k]!; }
    this.dense(this.pi, cur, this.logits, false);
    return this.logits;
  }
  /** выбор действия по головам: температура T (0 — жадно), равномерные числа из rng */
  sample(logits: Float32Array, temp: number, rng: () => number, out: Uint8Array): void {
    let o = 0;
    for (let h = 0; h < this.heads.length; h++) {
      const n = this.heads[h]!;
      let best = 0;
      if (temp <= 0) { for (let i = 1; i < n; i++) if (logits[o + i]! > logits[o + best]!) best = i; }
      else {
        let mx = -Infinity; for (let i = 0; i < n; i++) mx = Math.max(mx, logits[o + i]!);
        let z = 0; const p: number[] = [];
        for (let i = 0; i < n; i++) { const e = Math.exp((logits[o + i]! - mx) / temp); p.push(e); z += e; }
        let u = rng() * z; best = n - 1;
        for (let i = 0; i < n; i++) { u -= p[i]!; if (u <= 0) { best = i; break; } }
      }
      out[h] = best; o += n;
    }
  }
}
export { mulberry32 };
