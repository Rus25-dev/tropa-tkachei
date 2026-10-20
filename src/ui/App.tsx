import { useEffect, useState } from 'preact/hooks';
import type { InputHub } from '../input/hub';
import { TouchPad } from './TouchPad';

/** Корень интерфейса поверх холста. На этапе 4 здесь появятся меню, пауза, окна; сейчас — версия и сенсорная панель. */
export function App({ hub, version, build }: { hub: InputHub; version: string; build: string }) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const [touch, setTouch] = useState(coarse || new URLSearchParams(location.search).get('touch') === '1');
  useEffect(() => {
    const on = () => setTouch(true);
    window.addEventListener('touchstart', on, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', on);
  }, []);
  return (
    <>
      <div class="ver" data-testid="version">v{version} · {build}</div>
      {touch ? <TouchPad hub={hub} /> : null}
    </>
  );
}
