import { VH, VW_MAX, VW_MIN } from '../core/constants';

/** Ширина логического поля по пропорциям окна (как computeVW в v1.8): на вытянутых телефонах без чёрных полос; не зависит от поворота. */
export function computeVW(w: number, h: number): number {
  const a = Math.max(w, h) / Math.max(1, Math.min(w, h));
  return Math.round(Math.min(VW_MAX, Math.max(VW_MIN, VH * a)) / 2) * 2;
}
