// Просмотр записи .ttrec движком игры: ?watch=<адрес записи с этого же сайта>, перетаскивание файла в окно или «Настройки → Игра → Открыть запись…».
// Запись проигрывает ReplaySession (core/replaysession.ts): тот же мир, отрисовка и звук, но ввод берётся из журнала.
// Внизу экрана — небольшая панель просмотра (пауза, скорость, с начала, выход): обычный DOM, интерфейс игры не затрагивается.
import type Phaser from 'phaser';
import { normalizeSave } from '../core/loadout';
import { ReplaySession } from '../core/replaysession';
import type { Session } from '../core/session';
import { parseTtrec, ttrecTicks, type Ttrec } from '../core/ttrec';

interface Opts { version: string; game: Phaser.Game; begin: (s: Session) => void; end: () => void }

const CSS = `
#watch-bar{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:60;display:none;gap:6px;align-items:center;padding:6px 10px;background:rgba(10,18,15,.88);border:1px solid #2f4a40;border-radius:10px;color:#dfeee6;font:13px "Fira Sans",sans-serif}
#watch-bar.on{display:flex}
#watch-bar button{min-width:44px;min-height:34px;padding:0 10px;background:#1c2f28;color:#dfeee6;border:1px solid #3a5a4d;border-radius:7px;font:inherit;cursor:pointer}
#watch-bar button.cur{background:#2f6a57;border-color:#6fdcc0}
#watch-bar .t{opacity:.8;margin:0 6px;min-width:90px}
#watch-msg{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:70;max-width:90vw;padding:10px 14px;background:#3a1814;border:1px solid #a04a3c;border-radius:8px;color:#ffe3dc;font:14px "Fira Sans",sans-serif;display:none}
`;

export function initWatch(o: Opts): void {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const bar = document.createElement('div'); bar.id = 'watch-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Просмотр записи');
  const msg = document.createElement('div'); msg.id = 'watch-msg'; msg.setAttribute('role', 'alert');
  document.body.append(bar, msg);
  let cur: ReplaySession | null = null, curRec: Ttrec | null = null, speed = new URLSearchParams(location.search).get('wspeed') ? Number(new URLSearchParams(location.search).get('wspeed')) : 1;
  if (!(speed > 0 && speed <= 8)) speed = 1;

  const error = (text: string): void => { msg.textContent = 'Не удалось открыть запись: ' + text; msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 7000); };

  function render(): void {
    bar.replaceChildren();
    const s = cur; if (!s) { bar.classList.remove('on'); return; }
    bar.classList.add('on');
    const btn = (text: string, title: string, f: () => void, on = false): HTMLButtonElement => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = title; if (on) b.className = 'cur'; b.onclick = (): void => { f(); render(); }; return b; };
    const label = document.createElement('span'); label.className = 't';
    const upd = (): void => { if (cur !== s) return; const sec = Math.floor(s.world.tickN / 60); label.textContent = `${s.ended ? 'конец · ' : ''}${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
    upd(); const iv = setInterval(() => { if (cur !== s) clearInterval(iv); else upd(); }, 250);
    bar.append(btn(s.hold ? '▶' : '⏸', s.hold ? 'Продолжить' : 'Пауза', () => { s.hold = !s.hold; }),
      ...[0.5, 1, 2, 4].map((x) => btn('×' + x, 'Скорость просмотра', () => { speed = x; s.playSpeed = x; }, s.playSpeed === x)),
      btn('↺', 'С начала', () => { if (curRec) open(curRec); }), label, btn('Выйти', 'В главное меню', () => o.end()));
  }

  function open(rec: Ttrec): void {
    if (rec.setup.balance) return error('запись снята с изменённым балансом (инструменты разработчика): в игре она не воспроизводится, откройте её через npm run replay');
    if (rec.journal.race) return error('это журнал гонки: он воспроизводится только из окна гонки');
    const J = rec.journal;
    if (J.segs[0] && J.segs[0].data.mode === 'bosstest' && !J.segs[0].data.boss) return error('в записи не указан босс');
    let s: ReplaySession;
    try {
      s = new ReplaySession({ easy: !!rec.setup.easy, loadoutSave: normalizeSave(rec.setup.loadout), progress: rec.setup.progress ?? null, ver: rec.ver, clock: () => performance.now(), fx: true }, rec);
    } catch (e) { return error((e as Error).message); }
    s.playSpeed = speed; s.onRestart = () => open(rec);
    cur = s; curRec = rec;
    o.begin(s);
    render();
  }

  function openText(text: string): void {
    let rec: Ttrec;
    try { rec = parseTtrec(text); } catch (e) { return error((e as Error).message); }
    if (ttrecTicks(rec) === 0) return error('в записи нет ни одного тика');
    open(rec);
  }
  const openFile = (f: File): void => { void f.text().then(openText, () => error('файл не читается')); };

  // сессия сменилась (меню, новая партия): панель просмотра прячется, если это уже не просмотр
  o.game.events.on('tt:session', (s: Session | null) => { if (!(s instanceof ReplaySession)) { cur = null; curRec = null; } else cur = s; render(); });

  window.addEventListener('tt:watch-file', (e) => { const f = (e as CustomEvent<File>).detail; if (f) openFile(f); });
  window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => { const f = e.dataTransfer?.files[0]; if (f) { e.preventDefault(); openFile(f); } });

  // ?watch=адрес: только с этого же сайта (запись лежит рядом с игрой или отдаётся npm run bot -- watch)
  const raw = new URLSearchParams(location.search).get('watch');
  if (raw) {
    let url: URL | null = null;
    try { url = new URL(raw, location.href); } catch { /* ниже */ }
    if (!url || url.origin !== location.origin) error('адрес записи должен быть на том же сайте, что и игра');
    else void fetch(url.href).then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))).then(openText, (e: Error) => error(e.message));
  }
}
