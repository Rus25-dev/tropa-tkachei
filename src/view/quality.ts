// Качество графики: «Авто / Низкое / Среднее / Высокое». Авто меряет FPS и снижает качество, если кадров меньше 55 дольше 2 с (без мигания:
// поднимается обратно только по явному выбору в настройках). Эффекты кладутся на камеру мира; HUD и меню от них свободны.
import Phaser from 'phaser';

export type Quality = 'low' | 'mid' | 'high';
export type QualitySetting = 'auto' | Quality;
const ORDER: Quality[] = ['low', 'mid', 'high'];

export class QualityGovernor {
  level: Quality;
  private lowFor = 0;
  constructor(public setting: QualitySetting, mobile: boolean) { this.level = setting === 'auto' ? (mobile ? 'mid' : 'high') : setting; }
  /** Применить настройку из меню (явный выбор пользователя сбрасывает авто-снижение) */
  set(setting: QualitySetting, mobile: boolean): boolean {
    this.setting = setting; const was = this.level;
    this.level = setting === 'auto' ? (mobile ? 'mid' : 'high') : setting; this.lowFor = 0;
    return this.level !== was;
  }
  /** Кадр: возвращает true, если уровень изменился */
  frame(dtSec: number, fps: number): boolean {
    if (this.setting !== 'auto') return false;
    if (fps > 0 && fps < 55) this.lowFor += dtSec; else this.lowFor = Math.max(0, this.lowFor - dtSec * 2);
    if (this.lowFor > 2) {
      this.lowFor = 0;
      const i = ORDER.indexOf(this.level);
      if (i > 0) { this.level = ORDER[i - 1]!; return true; }
    }
    return false;
  }
  /** множитель числа частиц */
  get particleMul(): number { return this.level === 'low' ? 0.45 : this.level === 'mid' ? 0.8 : 1; }
}

/** Цветокоррекция по главам: мох — холодно-зелёный, типография — сепия, класс — тёплый вечер, берлога — неон (матрица 4×5 ColorMatrix) */
export function gradeMatrix(room: string | undefined, chapter: number): number[] {
  if (room === 'class') return [1.07, 0.02, 0, 0, 0.012, 0, 1.0, 0, 0, 0.004, 0, 0, 0.9, 0, -0.006, 0, 0, 0, 1, 0];
  if (room === 'den') return [1.03, 0, 0.04, 0, 0.004, 0, 0.94, 0.03, 0, 0, 0.02, 0.03, 1.1, 0, 0.012, 0, 0, 0, 1, 0];
  if (chapter === 2) return [1.08, 0.12, 0.02, 0, 0.004, 0.04, 1.0, 0.04, 0, 0, 0.02, 0.06, 0.82, 0, -0.004, 0, 0, 0, 1, 0]; // типография: сепия
  if (chapter === 3) return [1.05, 0.02, 0, 0, 0.01, 0, 1.0, 0, 0, 0.004, 0, 0, 0.92, 0, -0.004, 0, 0, 0, 1, 0];
  if (chapter === 4) return [1.02, 0, 0.04, 0, 0.004, 0, 0.95, 0.03, 0, 0, 0.02, 0.03, 1.08, 0, 0.01, 0, 0, 0, 1, 0];
  return [0.95, 0.02, 0, 0, 0, 0, 1.03, 0.02, 0, 0.005, 0, 0.03, 1.02, 0, 0.008, 0, 0, 0, 1, 0]; // мох — холодно-зелёный
}

/** Набор фильтров камеры под уровень качества */
export function applyCameraFx(cam: Phaser.Cameras.Scene2D.Camera, q: Quality, matrix: number[]): void {
  cam.filters?.internal.clear(); cam.filters?.external.clear();
  if (q === 'low' || !cam.filters) return;
  const cm = cam.filters.internal.addColorMatrix(); cm.colorMatrix.set(matrix);
  if (q === 'high') {
    cam.filters.external.addVignette(0.5, 0.5, 0.78, 0.38);
    Phaser.Actions.AddEffectBloom(cam, { threshold: 0.78, blurRadius: 1.6, blurSteps: 3, blurQuality: 0, blendAmount: 0.45, useInternal: false });
  }
}
