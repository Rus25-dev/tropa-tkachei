// «Дуэль ткачей» в самой игре: компактная плашка раунда вместо таблицы сплитов и итоговый экран раунда (вместо итога спидрана).
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { bossOfCh, BOSS_INFO } from '../core/duel';
import { modsText } from '../core/duelmods';
import type { SrResult, SrRun } from '../core/speedrun';
import { fmt } from '../core/timefmt';
import type { Races } from '../app/races';
import { WHY_TEXT } from '../net/raceduel';
import { Panel } from './kit';
import { ModChips, OrderStrip, PlanLine, SeriesScore } from './duelui';

/** плашка раунда в углу: босс и модификаторы вместо таблицы сплитов */
export function DuelHud({ run, time, children }: { run: SrRun; time: string; children?: ComponentChildren }) {
  const d = run.duel!, b = BOSS_INFO[bossOfCh(d.ch)];
  return (
    <div class="srhud duel" data-testid="srhud" aria-live="off">
      <div class={`rta ${run.t0 == null ? 'wait' : ''}`}>{time}</div>
      <div class="igt" data-testid="duel-hud-boss">Дуэль · {b.name}</div>
      <div class="igt dl-hudmods" data-testid="duel-hud-mods">{modsText(d.mods)}</div>
      {children}
    </div>
  );
}

/** итог раунда у игрока: убил босса или оборвал нить, вердикт организатора и счёт серии */
export function DuelResultScreen({ res, run, races, onMenu }: { res: SrResult; run: SrRun; races: Races; onMenu: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { const t = setTimeout(() => setArmed(true), 1200); return () => clearTimeout(t); }, []);
  const play = races.play, st = play?.state, d = st?.duel ?? null, o = res.duel!, boss = BOSS_INFO[bossOfCh(o.ch)];
  const side = d && play?.seat != null ? d.seats.indexOf(play.seat) : -1, last = d?.last ?? null;
  const decided = !!(st && st.phase === 'done' && last);
  const verdict = decided && last && side >= 0 ? (last.winner === 'draw' ? { t: 'НИЧЬЯ', s: 'раунд переиграют', c: '#ffd47a' } : (last.winner === 'a' ? 0 : 1) === side ? { t: 'РАУНД ВАШ', s: WHY_TEXT[last.why], c: '#9ff0c8' } : { t: 'РАУНД СОПЕРНИКА', s: WHY_TEXT[last.why], c: '#ff9a8a' }) : null;
  const onKey = (e: KeyboardEvent): boolean => { if (e.key === 'Enter' && armed) { onMenu(); return true; } return false; };
  return (
    <Panel root={false} crumbs={['Дуэль ткачей', `Раунд${last ? ' ' + last.n : ''}`]} onBack={() => { if (armed) onMenu(); }} digits={false} cls="srres" hint={{ act: 'выбрать' }} onKey={onKey} label="Итог раунда дуэли">
      <div class="st-page res" data-testid="duel-result">
        <h2 class="scr-t">Дуэль ткачей · {boss.name}</h2>
        <div class={`big ${o.kill ? '' : 'bad'}`} data-testid="duel-result-main">{o.kill ? fmt(res.rta) : `у босса осталось ${Math.round(100 * (o.mh > 0 ? o.hp / o.mh : 1))} %`}</div>
        <p class="lead">{o.kill ? 'Босс повержен.' : 'Нить оборвалась: раунд для вас закончен.'} RTA {fmt(res.rta)} · урон боссу {o.dmg}{res.deaths ? ` · обрывов нити: ${res.deaths}` : ''}</p>
        {verdict ? <div class="srbanner" data-testid="duel-banner" role="status"><div class="bn" style={{ color: verdict.c }}>{verdict.t}</div><div class="bs">{verdict.s}</div></div>
          : <div class="srbanner" data-testid="duel-banner" role="status"><div class="bn" style={{ color: '#ffe3a3' }}>{play?.status === 'online' ? 'Ждём соперника…' : 'Нет связи'}</div><div class="bs">{play?.status === 'online' ? 'итог раунда решит организатор по правилам дуэли' : 'итог уйдёт организатору, как только связь вернётся'}</div></div>}
        {d && <><SeriesScore d={d} /><PlanLine d={d} /><OrderStrip d={d} /></>}
        {d && d.series.stage === 'over' && <p class="lead good" data-testid="duel-series-over">Серия окончена: победил {d.names[d.series.winner ?? 0]}.</p>}
        <p class="lead">Следующий раунд запустит организатор: вы вернётесь в комнату сами. {run.duel ? <ModChips mods={run.duel.mods} /> : null}</p>
        <div class="row"><button type="button" class="btn primary" id="sr-menu" data-testid="duel-to-room" onClick={onMenu}>В комнату</button></div>
      </div>
    </Panel>
  );
}
