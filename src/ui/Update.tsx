// Плашка «Вышла новая версия»: важна для иконки на экране «Домой» (iPhone держит старую версию в кэше и в памяти).
// Раз в 10 минут и при возвращении в приложение читает version.json рядом с index.html и сравнивает номер сборки.
import { useEffect, useState } from 'preact/hooks';

export function UpdateBanner({ build }: { build: string }) {
  const [latest, setLatest] = useState<{ version: string; build: string } | null>(null);
  const [later, setLater] = useState(false);
  useEffect(() => {
    const host = location.hostname;
    if (location.protocol !== 'https:' && host !== '127.0.0.1' && host !== 'localhost') return;
    const check = (): void => {
      fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((v: { version: string; build: string } | null) => {
        if (v && v.build && v.build !== build) setLatest(v);
      }).catch(() => undefined);
    };
    check();
    const vis = (): void => { if (!document.hidden) check(); };
    const show = (e: PageTransitionEvent): void => { if (e.persisted) check(); };
    document.addEventListener('visibilitychange', vis); window.addEventListener('pageshow', show);
    const id = setInterval(check, 10 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('pageshow', show); clearInterval(id); };
  }, [build]);
  if (!latest || later) return null;
  const reload = (): void => { const u = new URL(location.href); u.searchParams.set('v', String(latest.build).replace(/\s+/g, '-')); location.replace(u.toString()); };
  return (
    <div id="update" role="status" data-testid="update-banner">
      <span>Вышла новая версия {latest.version} · сборка {latest.build}</span>
      <button type="button" class="btn primary" onClick={reload}>Обновить</button>
      <button type="button" class="btn" onClick={() => setLater(true)}>Позже</button>
    </div>
  );
}
