export type KeeperStage = 'idle' | 'tell' | 'active' | 'recover';
const smooth = (t: number): number => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };

/** Непрерывные ключи кисти: подготовка → замах → проводка → возврат. Только чтение кадров ядра. */
export function keeperPose(pose: string, stage: KeeperStage, progress: number): { a: number; reach: number; both: boolean } {
  const low = ['low_sweep', 'crouch', 'crouch_white'].includes(pose);
  const both = ['palms_raise', 'palms_out', 'oath_open', 'brace', 'reversal'].includes(pose);
  const wind = low ? 1.4 : pose === 'reversal' ? -0.35 : pose === 'oath_open' ? -2.8 : pose === 'lean' ? 2.5 : -2;
  const follow = low ? -0.6 : pose === 'sky_weave' ? 2.8 : pose === 'oath_open' ? -1.1 : both ? 0 : 1.2;
  const t = smooth(progress);
  const a = stage === 'tell' ? 0.7 + (wind - 0.7) * t : stage === 'active' ? wind + (follow - wind) * t : stage === 'recover' ? follow + (0.7 - follow) * t : 0.7;
  return { a, reach: 28 + (stage === 'active' ? Math.sin(t * Math.PI) * 10 : 0), both };
}
