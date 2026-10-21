// Режим ?perf=1: FPS, время логики и отрисовки, число объектов, память. Для замеров в docs/PERF.md и для ручной проверки на слабых устройствах.
import type Phaser from 'phaser';

export class PerfOverlay {
  private el: HTMLDivElement | null = null;
  private logic = 0; private draw = 0; private ticks = 0; private frames = 0; private t0 = performance.now();
  readonly samples: { fps: number; logic: number; draw: number; mem: number }[] = [];
  constructor(public on: boolean) {
    if (!on) return;
    this.el = document.createElement('div'); this.el.setAttribute('data-testid', 'perf');
    this.el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:20;font:600 12px ui-monospace,Consolas,monospace;color:#9ff0c8;background:rgba(7,13,12,.78);padding:6px 8px;border-radius:6px;white-space:pre;pointer-events:none';
    document.body.appendChild(this.el);
  }
  /** замер одного кадра: время логики (тики) и отрисовки в мс */
  frame(logicMs: number, drawMs: number, ticks: number, game: Phaser.Game, quality: string, objects: number): void {
    if (!this.on) return;
    this.logic += logicMs; this.draw += drawMs; this.ticks += ticks; this.frames++;
    const now = performance.now();
    if (now - this.t0 < 500) return;
    const n = this.frames, mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
    const s = { fps: game.loop.actualFps, logic: this.logic / n, draw: this.draw / n, mem: mem / 1048576 };
    this.samples.push(s); if (this.samples.length > 600) this.samples.shift();
    if (this.el) this.el.textContent = `fps ${s.fps.toFixed(0)} · логика ${s.logic.toFixed(2)} мс (${(this.ticks / n).toFixed(1)} тика/кадр) · отрисовка ${s.draw.toFixed(2)} мс\nкачество ${quality} · объектов ${objects} · память ${s.mem ? s.mem.toFixed(0) + ' МБ' : '—'}`;
    this.logic = this.draw = this.ticks = this.frames = 0; this.t0 = now;
  }
  destroy(): void { this.el?.remove(); }
}
