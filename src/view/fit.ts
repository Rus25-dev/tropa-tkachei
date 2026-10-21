// Масштаб логического поля под реальный холст. Логическое поле — VW × 540 (ширина по пропорциям экрана, как в v1.8);
// холст имеет размер CSS-размер × min(devicePixelRatio, 2), камеры сцен масштабируют поле на весь холст (родное разрешение: текст и контуры чёткие).
import type Phaser from 'phaser';
import { VH } from '../core/constants';
import { computeVW } from './layout';

export interface Fit { vw: number; scale: number; cssW: number; cssH: number; dpr: number }

export function currentFit(): Fit {
  const bx = document.getElementById('game')?.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(bx?.width || window.innerWidth)), cssH = Math.max(1, Math.round(bx?.height || window.innerHeight));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const vw = computeVW(cssW, cssH);
  // масштаб: логическое поле целиком помещается в холст
  const scale = Math.min((cssW * dpr) / vw, (cssH * dpr) / VH);
  return { vw, scale, cssW, cssH, dpr };
}

/** Настраивает основную камеру сцены на логическое поле: масштаб s, середина поля — центр холста. */
export function fitCamera(scene: Phaser.Scene, f: Fit, zoom = 1, cx = f.vw / 2, cy = VH / 2): void {
  const cam = scene.cameras.main;
  cam.setViewport(0, 0, scene.scale.width, scene.scale.height);
  cam.setZoom(f.scale * zoom);
  cam.centerOn(cx, cy);
}
