// «Настройки»: пять разделов (Звук, Экран, Управление, Игра, Прогресс) и экран переназначения клавиш.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ACTS, assignKey, keyName, resetKeys, type Act } from '../app/keys';
import { applySettings } from '../app/apply';
import { progress, settings, type SettingsData } from '../app/store';
import { listPads, padKind } from '../input/gamepad';
import { Snd } from '../view/audio/snd';
import { Item, Panel, Screen, useSettings, useDevice } from './kit';
import { navLock } from './nav';
import { TouchLayoutEditor } from './TouchPad';

export const SECS: [string, string, string][] = [['sound', 'Звук', 'громкость звуков и музыки'], ['screen', 'Экран', 'тряска, вспышки, контуры, качество, весь экран'],
  ['controls', 'Управление', 'клавиши, геймпад, кнопки на телефоне, левша'], ['game', 'Игра', 'лёгкий режим, скорость'], ['progress', 'Прогресс', 'сохранение, сброс']];

const set = <K extends keyof SettingsData>(k: K, v: SettingsData[K]): void => { settings.set(k, v); applySettings(); };

function Check({ id, label, sub, k, disabled }: { id: string; label: string; sub?: string; k: 'shake' | 'noflash' | 'outl' | 'vibro' | 'lefty' | 'easy' | 'rec' | 'kit'; disabled?: boolean }) {
  const s = useSettings();
  return (
    <label class="opt" for={id}>
      <input id={id} type="checkbox" checked={s[k]} disabled={disabled} onChange={(e) => { set(k, (e.currentTarget as HTMLInputElement).checked); }} />
      <span class="optt">{label}{sub && <small>{sub}</small>}</span>
    </label>
  );
}
function Range({ id, label, k, min, max, step, beep }: { id: string; label: string; k: 'vol' | 'mvol' | 'bop' | 'tgap'; min: number; max: number; step: number; beep?: boolean }) {
  const s = useSettings();
  return (
    <label class="opt" for={id}>
      <span class="optt">{label}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={s[k]} onInput={(e) => { Snd.init(); set(k, Number((e.currentTarget as HTMLInputElement).value)); }} onChange={() => { if (beep) { Snd.init(); Snd.play('bead'); } }} />
      <span class="val">{s[k]}%</span>
    </label>
  );
}
function Seg<K extends 'bsize' | 'speed' | 'gfx' | 'tlayout'>({ name, label, k, opts, disabled }: { name: string; label: string; k: K; opts: [SettingsData[K], string][]; disabled?: boolean }) {
  const s = useSettings();
  return (
    <div class="row">
      <span class="lbl">{label}</span>
      <span class="seg">
        {opts.map(([v, t]) => (<label key={String(v)}><input type="radio" name={name} value={String(v)} checked={s[k] === v} disabled={disabled} onChange={() => set(k, v)} />{t}</label>))}
      </span>
    </div>
  );
}

const fsOk = (): boolean => !!(document.documentElement.requestFullscreen || (document.documentElement as unknown as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen);
const fsOn = (): boolean => !!(document.fullscreenElement || (document as unknown as { webkitFullscreenElement?: unknown }).webkitFullscreenElement);
function toggleFs(): void {
  if (!fsOk()) return;
  if (fsOn()) { try { void document.exitFullscreen(); } catch { /* уже вышли */ } } else { void document.documentElement.requestFullscreen().catch(() => undefined); }
}

function PadMap() {
  const ps = (() => { try { const p = listPads()[0]; return !!p && padKind(p) === 'ps'; } catch { return false; } })();
  const rows: [string, string][] = [[ps ? '✕' : 'A', 'прыжок'], [ps ? '□' : 'X', 'удар'], [ps ? '○ / R2' : 'B / RT', 'рывок'], [ps ? '△ / L2' : 'Y / LT', 'нить'], [ps ? 'L1' : 'LB', 'дымовуха'], [ps ? 'R1' : 'RB', 'инструмент'],
    [ps ? 'Options' : 'Start', 'пауза'], [ps ? 'Create' : 'Back', 'карта'], ['Стик', 'движение']];
  return <div class="padmap">{rows.map(([b, t]) => (<span key={b}><b>{b}</b> — {t}</span>))}</div>;
}

function Section({ id, onKeys, locked }: { id: string; onKeys: () => void; locked?: boolean }) {
  const [fs, setFs] = useState(fsOn());
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);
  const [edit, setEdit] = useState(false);
  const [, bump] = useState(0);
  const touch = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).get('touch') === '1';
  useEffect(() => { const f = (): void => setFs(fsOn()); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t); }, [armed]);
  if (id === 'sound') return (<div class="st-box"><Range id="st-vol" label="Звуки" k="vol" min={0} max={100} step={10} beep /><Range id="st-mvol" label="Музыка" k="mvol" min={0} max={100} step={10} /></div>);
  if (id === 'screen') return (
    <div class="st-box">
      <Check id="st-shake" k="shake" label="Тряска экрана" sub="выключите, если укачивает" />
      <Check id="st-noflash" k="noflash" label="Без вспышек" sub="вместо белых вспышек — мягкое затемнение" />
      <Check id="st-outl" k="outl" label="Контуры опасного" sub="яркая обводка снарядов и шипов" />
      <Seg name="st-gfx" label="Качество графики" k="gfx" opts={[['auto', 'Авто'], ['low', 'Низкое'], ['mid', 'Среднее'], ['high', 'Высокое']]} />
      <span class="note">«Авто» снижает качество само, если кадров в секунду меньше 55. Высокое: цветокоррекция по главам, виньетка и свечение.</span>
      <div class="row"><span class="note">{fsOk() ? 'Игра занимает весь экран (F11 в браузере делает то же)' : 'На iPhone полного экрана у сайтов нет: поставьте игру на экран «Домой»'}</span>
        <button type="button" class="btn" id="st-fs" disabled={!fsOk()} onClick={() => { toggleFs(); setTimeout(() => setFs(fsOn()), 250); }}>{fsOk() ? (fs ? 'Выйти из полного экрана' : 'Весь экран') : 'Недоступно'}</button></div>
    </div>);
  if (id === 'controls') return (
    <div class="st-box">
      <button type="button" class="btn wide" id="st-keys" onClick={onKeys}>Клавиши игрока 1…</button>
      <Check id="st-vibro" k="vibro" label="Вибрация" sub="телефон (Android) и геймпад" />
      {touch && <Check id="st-lefty" k="lefty" label="Для левши" sub="кнопки слева, стик справа" />}
      {touch && <Range id="st-bop" label="Видимость кнопок" k="bop" min={30} max={100} step={10} />}
      {touch && <Seg name="st-bsize" label="Размер кнопок на телефоне" k="bsize" opts={[['S', 'Меньше'], ['M', 'Обычные'], ['L', 'Крупнее']]} />}
      {touch && <Seg name="st-tlayout" label="Кнопки нити" k="tlayout" opts={[['full', 'Отдельные'], ['simple', 'Одна «Нить»']]} />}
      {touch && <span class="note">«Отдельные» — свои кнопки для отбива, лечения и всполоха, как отдельные клавиши. «Одна „Нить“» — как клавиша нити: лечит при полной нити, иначе отбивает, со стиком вверх — всполох.</span>}
      {touch && <Range id="st-tgap" label="Расстояние между кнопками" k="tgap" min={80} max={140} step={10} />}
      {touch && <button type="button" class="btn wide" id="st-tedit" onClick={() => setEdit(true)}>Расставить кнопки…</button>}
      {edit && <TouchLayoutEditor onClose={() => setEdit(false)} />}
      <span class="lbl">Геймпад (раскладка только для просмотра)</span>
      <PadMap />
    </div>);
  if (id === 'game') return (
    <div class="st-box">
      {locked && <p class="note bad" id="st-srnote">Идёт забег: лёгкий режим и замедление игры заблокированы.</p>}
      <Check id="st-easy" k="easy" label="Лёгкий режим" sub="8 бутонов здоровья вместо 5; включится со следующего боя" disabled={locked} />
      <Seg name="st-speed" label="Скорость игры" k="speed" opts={[[100, '100 %'], [80, '80 %'], [60, '60 %']]} disabled={locked} />
      <span class="note">По сети скорость всегда 100 %. Лёгкий режим и замедление отключают спидран.</span>
      <Check id="st-kit" k="kit" label="Приёмы в Босс-тесте и Босс-раше" sub="теневой рывок, воздушная вспышка, кристальный рывок открыты сразу (в гонках и дуэлях не действуют); влияет на новые бои" disabled={locked} />
      <Check id="st-rec" k="rec" label="Записывать мои бои" sub="по окончании боя или забега скачивается файл .ttrec; ничего не отправляется в сеть" />
      <div class="row"><span class="note">Просмотр записи: файл .ttrec можно также перетащить в окно игры.</span>
        <label class="btn" id="st-watch">Открыть запись…<input type="file" accept=".ttrec,.json,application/json" hidden onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) window.dispatchEvent(new CustomEvent('tt:watch-file', { detail: f })); (e.currentTarget as HTMLInputElement).value = ''; }} /></label></div>
    </div>);
  const p = progress.get();
  return (
    <div class="st-box">
      <span id="st-prog" class="note">{done ? 'Прогресс сброшен: глава начнётся с начала' : p ? `Сохранено: ${p.name || 'скамья'}, бусин ${p.beads || 0}` : 'Сохранения главы пока нет'}</span>
      <div class="row"><span class="note">Сброс стирает сохранение главы: бусины, способности и улучшения.</span>
        <button type="button" class="btn danger" id="st-reset" disabled={!p} onClick={() => { if (!armed) { setArmed(true); return; } setArmed(false); progress.reset(); setDone(true); bump((n) => n + 1); }}>{armed ? 'Точно сбросить? Нажмите ещё раз' : 'Сбросить прогресс'}</button></div>
    </div>);
}

export function Settings({ section, crumbs, onBack, locked }: { section?: string; crumbs: string[]; onBack: () => void; locked?: boolean }) {
  const [sec, setSec] = useState<string | null>(section ?? null);
  const [keys, setKeys] = useState(false);
  if (keys) return <KeysScreen crumbs={[...crumbs, 'Настройки', 'Управление']} onBack={() => setKeys(false)} />;
  const cur = SECS.find((s) => s[0] === sec);
  const back = (): void => { if (sec && !section) setSec(null); else onBack(); };
  const cr = [...crumbs, 'Настройки', ...(cur ? [cur[1]] : [])];
  return (
    <Panel crumbs={cr} onBack={back} hint={{ act: cur ? 'переключить' : 'открыть', lr: cur ? 'менять' : '' }} label="Настройки" key={sec ?? 'list'}>
      {!cur ? (
        <Screen title="Настройки" info={<><p>Всё запоминается в этом браузере.</p><p class="dim">Сброс прогресса — в разделе «Прогресс».</p></>}>
          {SECS.map(([id, name, sub], i) => <Item key={id} n={i + 1} label={name} sub={sub} id={`st-go-${id}`} onClick={() => setSec(id)} />)}
        </Screen>
      ) : (
        <div class="st-page"><h2 class="scr-t">{cur[1]}</h2><Section id={cur[0]} onKeys={() => setKeys(true)} locked={locked} /></div>
      )}
    </Panel>
  );
}

function KeysScreen({ crumbs, onBack }: { crumbs: string[]; onBack: () => void }) {
  const [listen, setListenState] = useState<Act | null>(null);
  const listenRef = useRef<Act | null>(null);
  const [note, setNote] = useState('');
  const [, bump] = useState(0);
  useDevice();
  // «ждём клавишу» хранится и в ref: обработчик клавиш живёт всё время, нажатие сразу после щелчка не теряется
  const setListen = (a: Act | null): void => { listenRef.current = a; navLock.on = !!a; setListenState(a); };
  useLayoutEffect(() => {
    const h = (e: KeyboardEvent): void => {
      const act = listenRef.current; if (!act) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { setListen(null); setNote(''); return; }
      if (e.repeat) return;
      const ok = assignKey(act, e);
      setListen(null); bump((n) => n + 1);
      setNote(ok ? 'Клавиша назначена' : 'Эта клавиша занята игроком 2 или запасной раскладкой');
    };
    window.addEventListener('keydown', h, true);
    return () => { window.removeEventListener('keydown', h, true); navLock.on = false; };
  }, []);
  return (
    <Panel crumbs={crumbs} onBack={onBack} hint={{ act: 'назначить', nums: ACTS.length }} digits={!listen} padlock={!!listen} label="Управление">
      <div class="st-page keys">
        <h2 class="scr-t">Клавиши игрока 1</h2>
        <span class="lbl">Игрок 2 и стрелки не меняются</span>
        <div class="kr">
          {ACTS.map(([a, t]) => (
            <div class="krow" key={a}>
              <span>{t}</span>
              <button type="button" class={`btn kb ${listen === a ? 'listen' : ''}`} data-act={a} onClick={() => { setListen(listen === a ? null : a); setNote(''); }}>{listen === a ? 'Нажмите клавишу…' : keyName(a)}</button>
            </div>
          ))}
        </div>
        <div id="kb-note" role="status" class="note">{note || 'Нажмите на действие, затем на нужную клавишу. Если она уже занята, действия поменяются местами.'}</div>
        <button type="button" class="btn" id="kb-def" onClick={() => { resetKeys(); setListen(null); setNote('Клавиши возвращены по умолчанию'); bump((n) => n + 1); }}>По умолчанию</button>
      </div>
    </Panel>
  );
}
