import { MAX_TICKS_PER_FRAME, STEP } from './constants';

/**
 * Часы логики: накапливают реальное время кадров и отдают целое число тиков по 1/60 с (как GameScene.update в v1.8:
 * ограничение числа тиков за кадр, остаток сбрасывается при долгой просадке). Сами часы не знают о реальном времени —
 * им передают уже измеренную длину кадра, поэтому они одинаково работают в игре, в Node и в воспроизведении журнала.
 */
export class TickClock {
  private acc = 0;
  /** Сколько всего тиков отдано. */
  ticks = 0;

  /** dtMs — длина кадра в миллисекундах. Возвращает, сколько тиков логики пора выполнить. */
  advance(dtMs: number): number {
    this.acc += Math.min(dtMs, 100) / 1000;
    let n = 0;
    while (this.acc >= STEP && n < MAX_TICKS_PER_FRAME) { this.acc -= STEP; n++; }
    if (this.acc > STEP * MAX_TICKS_PER_FRAME) this.acc = 0;
    this.ticks += n;
    return n;
  }
  reset(): void { this.acc = 0; this.ticks = 0; }
}
