// Виртуальное время и фальшивая сеть с задержкой, потерями, дублями и «тихими» обрывами — для проверки надёжного канала в Node.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Closable, Conn, DialHandlers, Env, ListenHandlers, Transport } from '../../../src/net/types';

interface Timer { id: number; at: number; f: () => void; every: number; dead?: boolean }
export class Sim {
  t = 0; private q: Timer[] = []; private id = 0; private seed = 12345;
  rand(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  env(): Env {
    return {
      now: () => this.t, rand: () => this.rand(), wall: () => 1_700_000_000_000 + this.t,
      setTimeout: (f, ms) => { const h: Timer = { id: ++this.id, at: this.t + Math.max(0, ms), f, every: 0 }; this.q.push(h); return h; },
      clearTimeout: (h) => { if (h) (h as Timer).dead = true; },
      setInterval: (f, ms) => { const h: Timer = { id: ++this.id, at: this.t + ms, f, every: ms }; this.q.push(h); return h; },
      clearInterval: (h) => { if (h) (h as Timer).dead = true; },
    };
  }
  run(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      this.q = this.q.filter((h) => !h.dead);
      let best: Timer | null = null;
      for (const h of this.q) if (h.at <= end && (!best || h.at < best.at || (h.at === best.at && h.id < best.id))) best = h;
      if (!best) break;
      this.t = best.at; if (best.every) best.at += best.every; else best.dead = true;
      best.f();
    }
    this.t = end;
  }
}

interface Link { a: FakeConn; b: FakeConn; nodeA: string; nodeB: string; closed: boolean }
interface FakeConn extends Conn { onData: ((d: any) => void) | null; onClose: (() => void) | null }
interface Lis { h: ListenHandlers; node: string; zombie?: boolean }

export class FakeNet {
  lis = new Map<string, Lis>(); links = new Set<Link>(); cutNodes = new Set<string>(); dupRate = 0; lossRate = 0;
  constructor(public sim: Sim, public lat = 30) {}
  transport(node: string): Transport {
    return {
      listen: (id: string, h: ListenHandlers): Closable => {
        if (this.lis.has(id)) { this.sim.env().setTimeout(() => h.onError({ type: 'unavailable-id' }), 50); return { close() { /* занято */ } }; }
        const rec: Lis = { h, node }; this.lis.set(id, rec); this.sim.env().setTimeout(() => h.onOpen(), 20);
        return { close: () => { if (this.lis.get(id) === rec) this.lis.delete(id); } };
      },
      dial: (id: string, h: DialHandlers): Closable => {
        let dead = false;
        this.sim.env().setTimeout(() => {
          if (dead) return;
          const rec = this.lis.get(id);
          if (!rec || this.cutNodes.has(node) || this.cutNodes.has(rec.node)) { h.onError({ type: 'peer-unavailable' }); return; }
          if (rec.zombie) return; // организатор умер, id ещё числится у сервера: соединение не устанавливается, клиент ждёт таймаут
          const link = { a: null, b: null, nodeA: node, nodeB: rec.node, closed: false } as unknown as Link;
          const mk = (side: 'a' | 'b'): FakeConn => ({ onData: null, onClose: null, open: true, send: (o: unknown) => this.deliver(link, side, o), close: () => this.close(link, side) });
          link.a = mk('a'); link.b = mk('b'); this.links.add(link);
          h.onOpen(link.a); rec.h.onConn(link.b);
        }, this.lat);
        return { close() { dead = true; } };
      },
    };
  }
  private deliver(link: Link, from: 'a' | 'b', o: unknown): void {
    if (link.closed) return;
    const to = from === 'a' ? 'b' : 'a', copies = this.sim.rand() < this.dupRate ? 2 : 1;
    if (this.lossRate && this.sim.rand() < this.lossRate) return;
    const delay = this.lat + (this.jitter ? Math.floor(this.sim.rand() * this.jitter) : 0);
    for (let i = 0; i < copies; i++) this.sim.env().setTimeout(() => {
      if (link.closed || this.cutNodes.has(link.nodeA) || this.cutNodes.has(link.nodeB)) return; // тихая потеря
      const c = link[to]; if (c.onData) c.onData(JSON.parse(JSON.stringify(o)));
    }, delay + i * 7);
  }
  jitter = 0;
  private close(link: Link, side: 'a' | 'b'): void {
    if (link.closed) return; link.closed = true; const other = side === 'a' ? 'b' : 'a';
    const own = link[side]; this.sim.env().setTimeout(() => { if (own.onClose) own.onClose(); }, 1); // у закрывающего «close» тоже срабатывает
    this.sim.env().setTimeout(() => { if (!this.cutNodes.has(link.nodeA) && !this.cutNodes.has(link.nodeB)) { const c = link[other]; if (c.onClose) c.onClose(); } }, this.lat);
  }
  /** тихий обрыв: пакеты перестают ходить, закрытия никто не видит (как пропавший Wi‑Fi) */
  cut(node: string): void { this.cutNodes.add(node); }
  heal(node: string): void { this.cutNodes.delete(node); }
  /** организатор «умер» без прощания: слушатель пропадает не сразу (сервер-знакомитель держит id ещё ~12 с) */
  killHub(id: string, holdMs: number): void {
    const rec = this.lis.get(id); if (!rec) return; rec.zombie = true;
    for (const l of this.links) if (l.nodeB === rec.node) l.closed = true;
    this.sim.env().setTimeout(() => { if (this.lis.get(id) === rec) this.lis.delete(id); }, holdMs);
  }
}
