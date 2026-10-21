// Ссылка на публичную страницу рейтинга (rating.html лежит рядом с игрой): открываем в новой вкладке, чтобы не прерывать игру.
export const RATING_URL = 'rating.html';
export function openRating(): void {
  // с признаком noopener window.open всегда возвращает null, поэтому связь с игрой обрываем сами
  const w = window.open(RATING_URL, '_blank');
  if (w) { try { w.opener = null; } catch { /* нет доступа */ } } else window.location.assign(RATING_URL);
}
