// Константы ядра. Числа взяты из v1.8 (legacy/src/game.js): логика идёт фиксированным шагом 1/60 с.
export const STEP = 1 / 60;
/** Высота логического поля; ширина подстраивается под пропорции экрана (см. view/layout). */
export const VH = 540;
export const VW_MIN = 960;
export const VW_MAX = 1280;
/** Сколько тиков логики разрешено за один кадр отрисовки (как в v1.8: до 6–7 при просадке). */
export const MAX_TICKS_PER_FRAME = 7;
