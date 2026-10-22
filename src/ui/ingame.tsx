// Внутриигровые окна: пауза, меню скамьи, лавка, карта с быстрыми переходами, снаряжение, экран победы, тренировка.
// Состояние берётся из мира (опрос ~10 раз в секунду) и событий ядра; действия идут через Session (они пишутся в журнал).
import { useEffect, useRef, useState } from 'preact/hooks';
import { CHAPTERS, SHOP, T } from '../core/balance';
import { price as shopPrice, type CampState } from '../core/campaign';
import { areaOf, benchEntries, type BenchEntry } from '../core/coop';
import { mapCan, mapVisited } from '../core/maptravel';
import type { Session } from '../core/session';
import { dps, teleText } from '../core/training';
import { EMPTY, PLAT, SPIKE } from '../core/balance';
import type { World } from '../core/world';
import { CHARMS, CHARM_SLOTS, KINDS, KIND_NAMES, equippedIds, equippedNow, gearAct, gearItems, gearState, lockText, priceOf, slotsOf, statsOf, type GItem, type GKind } from '../app/gear';
import { keyName } from '../app/keys';
import { Snd } from '../view/audio/snd';
import { HowTo } from './howto';
import { Item, Panel, useDevice } from './kit';
import { Settings } from './settings';

export function useTick(ms = 100): number {
  const [n, setN] = useState(0);
  useEffect(() => { const id = setInterval(() => setN((x) => x + 1), ms); return () => clearInterval(id); }, [ms]);
  return n;
}

export interface WinSummary { title?: string; time: number; beads: number; deaths: number; players: number; hits?: number; bag?: number; camp?: { title: string; final: boolean; ch: number; time: number; deaths: number; next: CampState | null } }

// ===== пауза =====
export function Pause({ ses, online, onRetry, onExit, openGear }: { ses: Session; online: boolean; onRetry: () => void; onExit: () => void; openGear: () => void }) {
  const w = ses.world;
  const [sub, setSub] = useState<null | 'howto' | 'settings'>(null);
  const kb = useDevice() === 'kb';
  const resume = (): void => ses.togglePause();
  if (sub === 'howto') return <HowTo crumbs={['Пауза']} onBack={() => setSub(null)} />;
  if (sub === 'settings') return <Settings crumbs={['Пауза']} onBack={() => setSub(null)} locked={!!w.sr} />;
  const entries: { id: string; label: string; sub?: string; act: () => void }[] = [];
  entries.push({ id: 'resume', label: 'Продолжить', act: resume });
  if (!online && !(w.sr && (w.sr.rc || w.sr.race))) entries.push({ id: 'retry', label: 'Заново', act: onRetry }); // в гонке начать заново нельзя
  if (w.train) entries.push({ id: 'trreset', label: kb ? 'Сброс босса (Y)' : 'Сброс босса', act: () => ses.trainReset() });
  if (w.mapV) entries.push({ id: 'map', label: 'Карта', act: () => { ses.togglePause(); ses.mapShow(); } });
  if (!w.sr) entries.push({ id: 'gear', label: kb ? 'Снаряжение (I)' : 'Снаряжение', act: openGear });
  entries.push({ id: 'howto', label: 'Как играть', act: () => setSub('howto') });
  entries.push({ id: 'settings', label: 'Настройки', act: () => setSub('settings') });
  entries.push({ id: 'exit', label: 'В главное меню', act: onExit });
  const onKey = (e: KeyboardEvent): boolean => {
    if (e.code === 'KeyI' && !w.sr && !e.repeat) { openGear(); return true; }
    if (e.code === 'KeyY' && w.train && !e.repeat) { ses.trainReset(); return true; }
    return false;
  };
  return (
    <Panel bare cls="pause" onBack={resume} onKey={onKey} hint={{ nums: entries.length, act: 'выбрать', extra: { kb: online ? 'по сети мир не останавливается' : undefined } }} label="Пауза">
      <div class="pause-in">
        <h2 class="pause-t" data-testid="pause-title">Пауза</h2>
        <div class="pause-list">
          {entries.map((x, i) => <Item key={x.id} n={i + 1} id={`pause-${x.id}`} label={x.label} onClick={x.act} cls="center" />)}
        </div>
        {w.train && <p class="dim center">Тренировка: здоровье бесконечное, рекорды не пишутся. {teleText(w.train)}</p>}
        {!kb ? null : <p class="dim center">Игрок 1: {keyName('left')} {keyName('right')} — ходить · {keyName('jump')} — прыжок · {keyName('atk')} — удар · {keyName('dash')} — рывок · {keyName('heal')} — лечение · {keyName('bomb')} — дымовуха</p>}
      </div>
    </Panel>
  );
}

// ===== меню скамьи =====
const BENCH_LABEL: Record<BenchEntry, string> = { rest: 'Отдохнуть', shop: 'Лавка', map: 'Карта и переходы', gear: 'Снаряжение' };
export function Bench({ ses }: { ses: Session }) {
  const entries = benchEntries(ses.world);
  return (
    <Panel bare cls="modal bench" onBack={() => ses.benchClose()} hint={{ nums: entries.length, act: 'выбрать' }} label="Скамья">
      <div class="modal-in">
        <h2 class="pause-t">Скамья</h2>
        <div class="pause-list">
          {entries.map((e, i) => <Item key={e} n={i + 1} id={`bench-${e}`} cls="center" label={BENCH_LABEL[e]} onClick={() => ses.benchPick(e)} />)}
        </div>
      </div>
    </Panel>
  );
}

// ===== лавка =====
export function Shop({ ses }: { ses: Session }) {
  useTick();
  const w = ses.world;
  return (
    <Panel bare cls="modal shop" onBack={() => ses.closeShop()} hint={{ nums: SHOP.length, act: 'купить' }} label="Лавка у скамьи">
      <div class="modal-in wide">
        <h2 class="pause-t">Лавка у скамьи</h2>
        <p class="beads" data-testid="shop-beads">Бусин: {w.beads}</p>
        <div class="pause-list">
          {SHOP.map((it, i) => {
            const lvl = w.up[it.id] | 0, max = lvl >= it.max, pr = max ? 0 : shopPrice(it.id, lvl);
            return (<Item key={it.id} n={i + 1} id={`shop-${it.id}`} disabled={max} label={it.name}
              sub={<span class="pips">{Array.from({ length: it.max }, (_, k) => <i key={k} class={k < lvl ? 'on' : ''} />)}</span>}
              value={max ? 'максимум' : `${pr} бусин`} onClick={() => ses.buy(it.id)} />);
          })}
        </div>
        <Item n="Esc" id="shop-close" label="Закрыть" onClick={() => ses.closeShop()} />
      </div>
    </Panel>
  );
}

// ===== карта и быстрые переходы =====
const CH = 4;
const cid = (cx: number, cy: number): number => cy * 1000 + cx;
const revealed = (w: World, tx: number, ty: number): boolean => w.mapV.has(cid(Math.floor(tx / CH), Math.floor(ty / CH)));

function MapView({ ses, onPick }: { ses: Session; onPick: (i: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const n = useTick(66);
  const w = ses.world;
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.max(1, Math.round(r.width * dpr)), ph = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const g = cv.getContext('2d'); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    const L = w.L, s = Math.min((r.width - 20) / L.W, (r.height - 40) / L.H, 10), ox = (r.width - L.W * s) / 2, oy = 28 + (r.height - 40 - L.H * s) / 2;
    const grid = L.grid, at = (x: number, y: number): number => (x < 0 || y < 0 || x >= L.W || y >= L.H ? 1 : grid[y]![x]!);
    const cls = (x: number, y: number): number => {
      if (!revealed(w, x, y)) return 0;
      const t = grid[y]![x]!;
      if (t === EMPTY) return 1; if (t === PLAT) return 3; if (t === SPIKE) return 4;
      return at(x - 1, y) !== 1 || at(x + 1, y) !== 1 || at(x, y - 1) !== 1 || at(x, y + 1) !== 1 ? 2 : 0;
    };
    const col = ['', '#1d3a31', '#7fb59f', '#1d3a31', '#1d3a31'];
    for (let y = 0; y < L.H; y++) {
      let x = 0;
      while (x < L.W) {
        const k = cls(x, y); let x2 = x + 1;
        while (x2 < L.W && cls(x2, y) === k) x2++;
        if (k) {
          g.globalAlpha = k === 1 ? 0.85 : 1; g.fillStyle = col[k]!; g.fillRect(ox + x * s, oy + y * s, (x2 - x) * s + 0.4, s + 0.4); g.globalAlpha = 1;
          if (k === 3) { g.fillStyle = '#d9c48a'; g.fillRect(ox + x * s, oy + y * s, (x2 - x) * s, Math.max(1.2, s * 0.35)); }
          if (k === 4) { g.fillStyle = '#d9715f'; g.fillRect(ox + x * s, oy + (y + 0.45) * s, (x2 - x) * s, Math.max(1.2, s * 0.55)); }
        }
        x = x2;
      }
    }
    g.font = '12px "Fira Sans", sans-serif'; g.textBaseline = 'bottom'; g.fillStyle = '#bfe3d3';
    L.areas.forEach((a, i) => {
      const x1 = i + 1 < L.areas.length ? L.areas[i + 1]!.x : L.W;
      let seen = false; for (const id of w.mapV) { const tx = (id % 1000) * CH; if (tx + CH > a.x && tx < x1) { seen = true; break; } }
      if (seen) g.fillText(a.name, ox + a.x * s + 3, oy - 6 - (i % 2) * 14);
    });
    const now = performance.now() / 1000;
    // арена босса / выход
    if (L.boss && L.boss.arenaX0 != null) {
      const x0 = L.boss.arenaX0, x1 = L.boss.arenaX1 + 1, y0 = L.gateIn ? L.gateIn.y0 - 6 : L.boss.y - 14, y1 = L.boss.y + 1;
      let seen = false; for (let x = x0; x <= x1 && !seen; x += CH) seen = revealed(w, x, Math.floor(L.boss.y));
      if (seen) { g.strokeStyle = 'rgba(217,113,95,.9)'; g.lineWidth = 2; g.strokeRect(ox + x0 * s, oy + y0 * s, (x1 - x0) * s, (y1 - y0) * s); }
    } else if (L.road && L.exit) {
      const ex = ox + L.exit.x * s, ey = oy + L.exit.y * s;
      g.fillStyle = '#d9715f'; g.beginPath(); g.moveTo(ex + 8, ey - 14); g.lineTo(ex + 8, ey - 2); g.lineTo(ex - 4, ey - 8); g.fill();
    }
    // способности, которые ещё не взяты
    for (const it of w.items) {
      if (it['got'] || !revealed(w, it['x'] as number, it['y'] as number)) continue;
      const x = ox + ((it['x'] as number) + 0.5) * s, y = oy + ((it['y'] as number) + 0.5) * s + Math.sin(now * 3) * 1.2, rr = 5;
      g.fillStyle = '#ffe3a3'; g.beginPath(); g.moveTo(x, y - rr - 1); g.lineTo(x + rr, y); g.lineTo(x, y + rr + 1); g.lineTo(x - rr, y); g.fill();
    }
    // скамьи
    const cur = w.players.find((p) => !p.remote && p.sit) ? benchNear(w) : -1;
    w.benches.forEach((b, i) => {
      const tx = b.x / T, ty = b.y / T - 0.5, x = ox + tx * s, y = oy + ty * s, vis = w.mapB.has(i);
      if (!vis && !revealed(w, Math.floor(tx), Math.floor(ty))) return;
      g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath();
      if (vis) { g.fillStyle = '#ffd47a'; g.fill(); } else { g.strokeStyle = 'rgba(111,149,134,.8)'; g.lineWidth = 1.5; g.stroke(); }
      if (i === cur) { g.strokeStyle = '#9ff0c8'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 10, 0, 7); g.stroke(); }
      if (i === w.mt.sel) { g.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * Math.sin(now * 6)})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 13 + Math.sin(now * 6), 0, 7); g.stroke(); }
    });
    for (const p of w.players) {
      const x = ox + (p.x + 7) / T * s, y = oy + (p.y + 13) / T * s, a = p.remote || Math.sin(now * 8) > -0.3 ? 1 : 0.35;
      g.fillStyle = '#030807'; g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill();
      g.globalAlpha = a; g.fillStyle = '#' + p.pal.accent.toString(16).padStart(6, '0'); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.globalAlpha = 1;
    }
    // подсказка для касания: запомнить геометрию
    (cv as unknown as { _geo?: unknown })._geo = { s, ox, oy };
  }, [n, w]);
  const tap = (e: MouseEvent): void => {
    const cv = ref.current as (HTMLCanvasElement & { _geo?: { s: number; ox: number; oy: number } }) | null; if (!cv?._geo) return;
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, { s, ox, oy } = cv._geo;
    let best = -1, bd = 26;
    w.benches.forEach((b, i) => { if (!w.mapB.has(i)) return; const d = Math.hypot(ox + b.x / T * s - px, oy + (b.y / T - 0.5) * s - py); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) onPick(best);
  };
  return <canvas ref={ref} class="mapcv" data-testid="map-canvas" onClick={tap} aria-label="Карта уровня" />;
}
function benchNear(w: World): number {
  const p = w.players.find((q) => !q.remote && q.sit); if (!p) return -1;
  let best = -1, bd = 40;
  w.benches.forEach((b, i) => { const d = Math.abs(p.x + 7 - b.x) + Math.abs(p.y + 26 - b.y); if (d < bd) { bd = d; best = i; } });
  return best;
}

export function MapTravel({ ses }: { ses: Session }) {
  useTick(100);
  const w = ses.world, c = mapCan(w), v = mapVisited(w), sel = w.benches[w.mt.sel];
  const onKey = (e: KeyboardEvent): boolean => {
    const k = e.code;
    if (k === 'Tab' || k === 'KeyM' || k === 'KeyQ' || k === 'KeyE') { ses.mapClose(); return true; }
    if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'KeyA' || k === 'KeyW') { ses.mapMove(-1); return true; }
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'KeyD' || k === 'KeyS') { ses.mapMove(1); return true; }
    if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space' || k === 'KeyF') { ses.mapGo(); return true; }
    return false;
  };
  const touch = useDevice() === 'touch';
  return (
    <Panel bare cls="map" onBack={() => ses.mapClose()} onKey={onKey} digits={false} label="Карта"
      foot={touch ? 'Нажмите на скамью, затем «Телепорт»' : '← → ↑ ↓ — выбрать скамью · Enter — телепорт · M / Esc — закрыть'}>
      <div class="map-in">
        <h2 class="pause-t">Карта · {w.L.region || 'Мшистая Глубь'}</h2>
        <MapView ses={ses} onPick={(i) => { if (i === w.mt.sel) ses.mapGo(); else { w.mt.sel = i; Snd.play('bead'); } }} />
        <div class="map-info" data-testid="map-info">{sel ? `Скамья: ${areaOf(w, sel.x / T).name}` : v.length ? 'Выберите скамью' : 'Вы ещё не отдыхали на скамьях'}</div>
        <div class={`map-why ${c.ok ? 'ok' : ''}`}>{c.ok ? (touch ? 'Нажмите «Телепорт»' : 'Enter — телепорт на эту скамью') : c.why}</div>
        <div class="map-legend">◆ скамья · ● герой · ◇ нераскрытая способность · ▭ арена босса</div>
        <div class="row center">
          <button type="button" class="btn primary" id="map-go" aria-disabled={c.ok ? undefined : 'true'} style={{ opacity: c.ok ? 1 : 0.45 }} onClick={() => ses.mapGo()}>Телепорт</button>
          <button type="button" class="btn" id="map-close" onClick={() => ses.mapClose()}>Закрыть</button>
        </div>
      </div>
    </Panel>
  );
}

// ===== снаряжение =====
export function Gear({ ses, onClose }: { ses: Session; onClose: () => void }) {
  const w = ses.world;
  const [ki, setKi] = useState(0);
  const [sel, setSel] = useState(0);
  const [say, setSay] = useState('');
  const [, bump] = useState(0);
  const wasSel = useRef(false);
  const kind: GKind = KINDS[ki]!;
  const list = gearItems(w, kind), it: GItem | undefined = list[Math.min(sel, list.length - 1)];
  const st = it ? gearState(w, kind, it) : null;
  const eqIds = equippedIds(w, kind);
  const dev = useDevice();
  const doAct = (): void => {
    if (!it) return;
    const r = gearAct(ses, kind, it); setSay(r.msg); if (r.snd) Snd.play(r.snd); bump((n) => n + 1);
  };
  const tab = (d: number): void => { setKi((k) => (k + d + KINDS.length) % KINDS.length); setSel(0); };
  const rowsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rowsRef.current; if (!el) return;
    const h = (e: Event): void => tab((e as CustomEvent<number>).detail);
    el.addEventListener('lr', h); return () => el.removeEventListener('lr', h);
  }, []);
  useEffect(() => {
    let raf = 0, prev = { lb: false, rb: false };
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      let lb = false, rb = false;
      for (const p of navigator.getGamepads?.() ?? []) { if (!p) continue; lb ||= !!p.buttons[4]?.pressed; rb ||= !!p.buttons[5]?.pressed; }
      if (lb && !prev.lb) tab(-1); if (rb && !prev.rb) tab(1);
      prev = { lb, rb };
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, []);
  const onKey = (e: KeyboardEvent): boolean => {
    if (e.code === 'KeyQ') { tab(-1); return true; }
    if (e.code === 'KeyE') { tab(1); return true; }
    if (e.code === 'KeyF' || e.code === 'KeyZ' || e.code === 'KeyX') { doAct(); return true; }
    return false;
  };
  const slots = (() => {
    const place: { id: string; s: number; n: number }[] = []; let s = 0;
    for (const id of equippedNow(w).charms) { const n = slotsOf(id); place.push({ id, s, n }); s += n; }
    return Array.from({ length: CHARM_SLOTS }, (_, i) => place.find((q) => i >= q.s && i < q.s + q.n) ?? null);
  })();
  return (
    <Panel bare cls="gear" onBack={onClose} onKey={onKey} digits={false} label="Снаряжение"
      foot={dev === 'touch' ? 'Нажмите на предмет, затем на кнопку действия' : '↑↓ выбор · ←→ раздел · Enter надеть/купить · Esc назад · геймпад: A, B, LB/RB'}>
      <div class="gear-in">
        <div class="gear-top"><span class="beads">Бусин: {w.beads}</span><h2 class="pause-t">Снаряжение</h2><button type="button" class="btn" id="gear-close" onClick={onClose}>Закрыть</button></div>
        <div class="tabs" role="tablist">{KINDS.map((k, i) => <button key={k} type="button" role="tab" aria-selected={i === ki} class="tab" tabIndex={i === ki ? 0 : -1} onClick={() => { setKi(i); setSel(0); }}>{KIND_NAMES[k]}</button>)}</div>
        <div class="gear-cols">
          <div class="gear-list" ref={rowsRef} role="listbox">
            {!list.length && <p class="dim">Пока ничего нет</p>}
            {list.map((x, i) => {
              const eq = eqIds.includes(x.id), pr = priceOf(x.e);
              return (<button key={x.id || 'none'} type="button" role="option" aria-selected={i === sel} data-lr="1" data-testid={`gear-row-${x.id || 'none'}`} class={`grow ${i === sel ? 'sel' : ''} ${x.owned ? '' : 'lock'}`}
                onFocus={() => setSel(i)} onPointerDown={() => { wasSel.current = i === sel; }} onClick={(e) => { if (e.detail === 0 || wasSel.current) doAct(); else setSel(i); }}>
                {kind === 'charms' && x.owned && <i class="dot" style={{ background: '#' + (CHARMS[x.id]?.col ?? 0xcfe8dc).toString(16).padStart(6, '0') }} />}
                <span class="gn">{x.e.name}</span>
                <span class={`gs ${!x.owned ? (pr && w.beads >= pr ? 'afford' : 'no') : 'yes'}`}>{!x.owned ? (pr ? `${pr} бусин` : 'закрыто') : eq ? (kind === 'abils' ? 'открыт' : 'надето') : ''}</span>
              </button>);
            })}
          </div>
          <div class="gear-det">
            {it && st ? (<>
              <h3 class="gd-n">{it.e.name}</h3>
              <div class="gd-s">{!it.owned ? lockText(it.e) : st.eq ? (kind === 'abils' ? 'Открыт' : 'Надето') : it.none ? '' : 'Есть у вас'}</div>
              <p class="gd-d">{it.e.desc}</p>
              {!it.none && <pre class="gd-st">{statsOf(kind, it.e).join('\n')}</pre>}
              <button type="button" class={`btn gact ${st.ok ? 'ok' : 'off'}`} id="gear-act" onClick={doAct}>{st.label}</button>
              <div class="gd-say" role="status">{say}</div>
            </>) : <p class="dim">Здесь пока пусто: предметы появятся по ходу игры.</p>}
          </div>
        </div>
        <div class="slots"><span class="dim">Слоты оберегов:</span>
          {slots.map((s, i) => <span key={i} class={`slot ${s ? 'full' : ''}`} style={s ? { borderColor: '#' + (CHARMS[s.id]?.col ?? 0xffd47a).toString(16).padStart(6, '0') } : undefined}>{s ? (CHARMS[s.id]?.name ?? s.id) : ''}</span>)}
        </div>
      </div>
    </Panel>
  );
}

// ===== победа =====
export function Win({ ses, s, online, onNext, onRetry, onExit }: { ses: Session; s: WinSummary; online: boolean; onNext: (next: CampState) => void; onRetry: () => void; onExit: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { const t = setTimeout(() => setArmed(true), 800); return () => clearTimeout(t); }, []);
  const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60).toString().padStart(2, '0'), k = s.camp, w = ses.world;
  let lines: string[];
  if (k) {
    if (k.final) {
      const tm = Math.floor(k.time / 60), ts = Math.floor(k.time % 60).toString().padStart(2, '0');
      lines = ['Корнематка, Миша, Владик и Тима побеждены.', `Нить сплетена: ${w.nPlayers === 2 ? 'вдвоём' : 'в одиночку'} вы дошли до конца.`, '', `Всё время кампании: ${tm}:${ts}`, `Обрывов нити за всю игру: ${k.deaths}`];
    } else {
      const nx = CHAPTERS[k.ch + 1]!;
      lines = [`Время главы: ${m}:${sec}`, `Бусин при себе: ${w.beads}`, `Обрывов нити: ${s.deaths ?? w.deaths}`, `Ткачей: ${s.players}`, '', `Дальше: Глава ${nx.roman} · ${nx.name}`];
    }
  } else if (s.bag != null) lines = [`Время боя: ${m}:${sec}`, `Дымовух в рюкзаке: ${s.bag}`, `Обрывов нити: ${s.deaths}`, `Ткачей: ${s.players}`];
  else if (s.hits != null) lines = [`Время боя: ${m}:${sec}`, `Ударов иглой: ${s.hits}`, `Обрывов нити: ${s.deaths}`, `Ткачей: ${s.players}`];
  else lines = [`Время: ${m}:${sec}`, `Бусин собрано: ${s.beads}`, `Обрывов нити: ${s.deaths}`, `Ткачей: ${s.players}`];
  const gate = (f: () => void) => () => { if (armed) f(); };
  return (
    <Panel bare cls="win" onBack={() => undefined} digits={false} hint={{ act: 'выбрать', back: false, extra: { kb: '← → — выбор' } }} label="Победа">
      <div class="win-in" data-testid="win-screen">
        <h1 class="win-t">{k ? k.title : s.title ?? 'Глава I пройдена'}</h1>
        {k && <div class="win-sub">{s.title ?? ''}</div>}
        <p class="win-body">{lines.map((l, i) => <span key={i}>{l}<br /></span>)}</p>
        {w.online === 'guest' && k?.next && <p class="win-sub">Ждём, когда хост поведёт дальше…</p>}
        <div class="row center win-btns">
          {k?.next && w.online !== 'guest' && <button type="button" class="btn primary" id="win-next" onClick={gate(() => onNext(k.next!))}>Дальше · глава {CHAPTERS[k.ch + 1]!.roman} →</button>}
          {!online && <button type="button" class="btn" id="win-retry" onClick={gate(onRetry)}>Заново</button>}
          <button type="button" class="btn" id="win-exit" onClick={gate(onExit)}>В главное меню</button>
        </div>
      </div>
    </Panel>
  );
}

// ===== тренировка: счётчик урона =====
export function TrainHud({ w }: { w: World }) {
  useTick(200);
  const tr = w.train, b = w.testBoss(); if (!tr) return null;
  const ph = b && b.maxHp ? (b.phase ?? 1) : 1, sum = tr.log.reduce((s, e) => s + e[1], 0);
  return (
    <div class="trhud" data-testid="train-hud">
      <div>ТРЕНИРОВКА · фаза {ph}</div>
      <div>Урон за 10 с: {sum} · DPS {dps(tr).toFixed(1)}</div>
      <div>Всего: {tr.total} · ударов по вам: {tr.hits}</div>
    </div>
  );
}
