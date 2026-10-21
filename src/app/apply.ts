// Применение настроек к странице: громкость, левша, прозрачность и размер сенсорных кнопок, раскладка под видимую область (вырез iPhone).
import { Music } from '../view/audio/music';
import { Snd } from '../view/audio/snd';
import { settings } from './store';

const BTN_SCALE = { S: 0.85, M: 1, L: 1.18 } as const;

/** размер и положение видимой области → CSS-переменные (--app-w/h/top, --ts — масштаб кнопок) */
export function applyLayout(): void {
  const de = document.documentElement, vv = window.visualViewport;
  const w = vv ? vv.width : window.innerWidth, h = vv ? vv.height : window.innerHeight, top = vv ? vv.offsetTop : 0;
  de.style.setProperty('--app-w', w + 'px'); de.style.setProperty('--app-h', h + 'px'); de.style.setProperty('--app-top', top + 'px');
  const k = BTN_SCALE[settings.s.bsize] ?? 1;
  de.style.setProperty('--ts', String(Math.max(0.62, Math.min(1.3, (Math.min(w, h) / 430) * k))));
}
export function applySettings(): void {
  const de = document.documentElement;
  de.classList.toggle('lefty', !!settings.s.lefty);
  de.style.setProperty('--bop', String(settings.s.bop / 100));
  Snd.setVolume(settings.s.vol); Music.setVolume(settings.s.mvol);
  applyLayout();
}
/** разовая настройка страницы: ?safe=Л,П,В,Н (имитация выреза), поворот и визуальный вьюпорт, запрет щипка и двойного тапа на iOS */
export function initLayout(): void {
  const sf = new URLSearchParams(location.search).get('safe');
  if (sf) {
    const [l, r, t, b] = sf.split(',').map((v) => (Number(v) || 0) + 'px'), st = document.documentElement.style;
    st.setProperty('--sl', l ?? '0px'); st.setProperty('--sr', r ?? '0px'); st.setProperty('--st', t ?? '0px'); st.setProperty('--sb', b ?? '0px');
  }
  applySettings();
  const on = (): void => applyLayout();
  window.addEventListener('resize', on);
  window.addEventListener('orientationchange', () => { on(); setTimeout(on, 150); setTimeout(on, 500); });
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', on); window.visualViewport.addEventListener('scroll', on); }
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, () => Snd.init(), { passive: true });
}
