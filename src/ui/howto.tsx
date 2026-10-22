// «Как играть» (четыре вкладки) и «Что нового»: полноэкранные панели с прокруткой. Подсказки подстраиваются под устройство в руках.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { keyName } from '../app/keys';
import { records } from '../app/store';
import { listedDefs } from '../core/boss/catalog';
import { CHANGELOG } from '../data/changelog';
import { listPads, padKind } from '../input/gamepad';
import { Panel, Tabs, useDevice } from './kit';
import { padNames, type Dev } from './nav';

const ps = (): boolean => { try { const p = listPads()[0]; return !!p && padKind(p) === 'ps'; } catch { return false; } };

/** название кнопки действия на выбранном устройстве */
export function keyFor(dev: Dev, act: string): string {
  if (dev === 'kb') { try { return keyName(act as never); } catch { return act; } }
  if (dev === 'pad') {
    const p = ps();
    return ({ left: 'стик ←', right: 'стик →', up: 'стик ↑', down: 'стик ↓', jump: p ? '✕' : 'A', atk: p ? '□' : 'X', dash: p ? '○ / R2' : 'B / RT', heal: p ? '△ / L2' : 'Y / LT', bomb: p ? 'L1' : 'LB', tool: p ? 'R1' : 'RB', pause: p ? 'Options' : 'Start', map: p ? 'Create' : 'Back' } as Record<string, string>)[act] ?? act;
  }
  return ({ left: 'стик ←', right: 'стик →', up: 'стик ↑', down: 'стик ↓', jump: 'Прыжок', atk: 'Удар', dash: 'Рывок', heal: 'Нить ✚', bomb: 'Бомба', tool: 'Инструмент', pause: '❚❚', map: '▤' } as Record<string, string>)[act] ?? act;
}
const devName = (d: Dev): string => d === 'pad' ? (ps() ? 'DualSense / DualShock' : 'Геймпад (Xbox, Steam Deck)') : d === 'touch' ? 'Касание' : 'Клавиатура';

/** «текст [[клавиша]] текст» → текст и <kbd> */
export function Rich({ t }: { t: string }) {
  return <>{t.split(/(\[\[.*?\]\])/).map((part, i) => (part.startsWith('[[') ? <kbd key={i}>{part.slice(2, -2)}</kbd> : part))}</>;
}
const fmtMin = (s: number): string => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

const Rows = ({ list }: { list: [string, string][] }) => (<div class="hw-rows">{list.map(([k, t]) => (<div class="hw-row" key={k + t}><kbd>{k}</kbd><span>{t}</span></div>))}</div>);

function Controls({ cur }: { cur: Dev }) {
  const order: Dev[] = [cur, ...(['kb', 'pad', 'touch'] as Dev[]).filter((d) => d !== cur)];
  return (<>
    {order.map((d, idx) => {
      const K = (a: string): string => keyFor(d, a), n = (a: string): string => keyName(a as never);
      return (<div key={d}>
        <h4>{devName(d)}{idx === 0 && <span class="hw-cur">сейчас</span>}</h4>
        {d === 'kb' ? (<>
          <Rows list={[[`${n('left')} ${n('right')}`, 'Идти влево и вправо'], [`${n('up')} / ${n('down')}`, 'Вверх: удар вверх, скамья. Вниз: лавка, спрыгнуть с платформы'], [n('jump'), 'Прыжок (держите — выше)'], [n('atk'), 'Удар'], [n('dash'), 'Рывок'],
            [n('heal'), 'Нить: лечение, отбив, ↑ + нить — всполох'], [n('bomb'), 'Дымовуха (на арене Миши)'], [n('tool'), 'Инструмент'], ['Esc', 'Пауза'], ['M  /  Tab', 'Карта и переходы (вдвоём за одним экраном — Tab)'], ['I', 'Снаряжение (в паузе)']]} />
          <p class="sub"><Rich t="Игрок 2 (вдвоём за одним компьютером): [[← → ↑ ↓]] ходить · [[Num1]] или [[/]] прыжок · [[Num2]] или [[.]] удар · [[Num3]] или [[,]] рывок · [[Num0]] или [[M]] нить · [[Num4]] или [[N]] дымовуха · [[Num5]] или [[J]] инструмент." /></p>
          <p class="sub"><Rich t="В одиночку можно и стрелками: [[← → ↑ ↓]] ходить · [[Z]] прыжок · [[X]] удар · [[C]] рывок · [[V]] нить · [[B]] дымовуха · [[E]] инструмент. Клавиши игрока 1 меняются в «Настройки → Управление»." /></p>
        </>) : d === 'pad' ? (<>
          <Rows list={[['Стик / ✛', 'Идти, ↑ — удар вверх, ↓ — вниз'], [K('jump'), 'Прыжок'], [K('atk'), 'Удар'], [K('dash'), 'Рывок'], [K('heal'), 'Нить: лечение, отбив, ↑ + нить — всполох'], [K('bomb'), 'Дымовуха (на арене Миши)'], [K('tool'), 'Инструмент'], [K('pause'), 'Пауза'], [K('map'), 'Карта и переходы']]} />
          <p class="sub">Геймпад подхватывается после первого нажатия кнопки. Сенсорные кнопки при этом прячутся.</p>
        </>) : (<>
          <Rows list={[['Стик слева', 'Идти; вверх — удар вверх, сесть на скамью, поднять напарника; вниз — лавка'], ['Прыжок', 'Прыжок (держите — выше)'], ['Удар', 'Удар'], ['Рывок', 'Рывок'], ['Нить ✚', 'Лечение, отбив, всполох'], ['Инструмент', 'Если инструмент надет'], ['Бомба', 'Только на арене Миши'], ['❚❚', 'Пауза (рядом — ▤ карта)']]} />
          <p class="sub">Коснитесь левой части экрана и тяните — стик появится под пальцем. Размер и прозрачность кнопок меняются в настройках.</p>
        </>)}
      </div>);
    })}
  </>);
}

function Moves({ d }: { d: Dev }) {
  const K = (a: string): string => `[[${keyFor(d, a)}]]`, up = d === 'kb' ? `[[${keyFor('kb', 'up')}]]` : '[[стик ↑]]', dn = d === 'kb' ? `[[${keyFor('kb', 'down')}]]` : '[[стик ↓]]';
  const list: [string, string][] = [
    ['Удар вверх и вниз', `${up} + ${K('atk')} — удар вверх. В прыжке ${dn} + ${K('atk')} — удар вниз: отскок от шипов и врагов.`],
    ['Отбив', `${K('heal')}, когда нить не полна, за миг до удара врага или снаряда. Окно 0,2 с: отбивает и то и другое.`],
    ['Идеальный отбив', `Нажмите ${K('heal')} в самый последний миг, в первую половину окна (≈ 0,1 с): золотое кольцо, звонок и надпись «ОТБИВ!». Даёт +2 нити вместо +1 и вдвое больше равновесия боссу — шкала над ним заполняется быстро, и он оглушается. Работает против ударов боссов с цветной подсказкой атак.`],
    ['Цвета атак', 'Жёлтый контур — удар можно отбить. Красный — отбить нельзя, уходите рывком (рывок сквозь удар засчитает идеальный уворот). Фиолетовый с крестом — не отбить и не проскочить рывком: только отпрыгнуть или отойти. Удар без цветного контура отбивается как обычно. В настройках «Контуры опасного» делает контуры ярче.'],
    ['Контратака', `После идеального отбива полсекунды вы неуязвимы, а золотая искра у руки говорит: следующий удар вперёд (${K('atk')}) бьёт в 1,5 раза сильнее и вдвое сильнее качает равновесие босса. Один раз за отбив.`],
    ['Нитяной всполох', `${up} + ${K('heal')} от 4 нити: волна вокруг героя отбрасывает врагов.`],
    ['Лечение', `Когда катушка нити полна, стойте на месте 1,1 с: ${K('heal')} вернёт 2 бутона. Урон прерывает лечение.`],
    ['Комбо и тяжёлый удар', 'Третий удар подряд — тяжёлый: шире и бьёт дважды. Серия ударов оглушает босса: он замирает и получает двойной урон.'],
    ['Казнь', 'Оглушили босса (полоска над ним)? Подойдите и ударьте вверх или вниз: добивающий удар и бонус нити.'],
    ['Рывок сквозь удар', `${K('dash')} в миг атаки врага — идеальный уворот: без урона и +2 нити.`],
    ['Прыжок от стены', `Прижмитесь к стене в падении и жмите ${K('jump')}. Спрыгнуть с платформы: ${dn} + ${K('jump')}.`],
    ['Хват за уступ', `Падая у края, жмите к нему — повиснете. ${up} или ${K('jump')} — подтянуться, ${dn} — отпустить, прыжок от стены — спрыгнуть.`],
    ['Планер «Парус»', `Награда за Владика: держите ${K('jump')} в падении, и плащ раскроется парусом.`],
    ['Заряженный удар', `Удерживайте ${K('atk')} около полсекунды, пока не раздастся звон и не вспыхнет оружие, и отпустите: особый сильный удар, у каждого оружия свой.`],
    ['Инструменты', `${K('tool')} — метательная игла, капкан, нитяная бомба или крюк; тратят нить, надеваются в «Снаряжении» (по одному).`],
    ['Оружие', 'Игла, парные иглы, серп, колотушка, игла-копьё: у каждого своя дальность, скорость и комбо. Открываются за боссов и в лавке.'],
    ['Обереги', `Три слота, девять оберегов (яд, ожог, +1 бутон, быстрая нить…). «Снаряжение» — в меню скамьи или в паузе${d === 'kb' ? ' ([[I]])' : ''}.`],
  ];
  return <div class="hw-grid">{list.map(([t, x]) => (<div class="hw-it" key={t}><h3>{t}</h3><p><Rich t={x} /></p></div>))}</div>;
}

function Coop({ d }: { d: Dev }) {
  const K = (a: string): string => `[[${keyFor(d, a)}]]`, up = d === 'kb' ? K('up') : '[[стик ↑]]';
  const list: [string, string][] = [
    ['Поднять напарника', `Упавший герой — в коконе. Подойдите и держите ${up} около секунды. Скамья тоже поднимает: отдых у неё оживляет всех.`],
    ['Скамья', `${up} у скамьи открывает меню: «Отдохнуть» (здоровье, сохранение, место возрождения), «Лавка», «Карта и переходы», «Снаряжение». После обрыва нити вы очнётесь на последней скамье.`],
    ['Лавка', 'Бусины общие. Маски здоровья, острая игла и лёгкая катушка. Выбор — стрелки или касание, купить — Enter / A, закрыть — Esc / B.'],
    ['Карта и переходы', `Откройте через «Карту» в паузе или в меню скамьи${d === 'kb' ? ' ([[M]], вдвоём за одним экраном — [[Tab]])' : d === 'pad' ? ` (${K('map')})` : ' (кнопка [[▤]])'}. С любой скамьи можно перенестись на посещённую; во время боя с боссом переход закрыт.`],
    ['Вдвоём за одним экраном', 'Каждый играет своей раскладкой: игрок 1 — как в настройках, игрок 2 — стрелки и цифровая клавиатура. Пауза общая.'],
    ['По сети', 'Каждый играет раскладкой игрока 1. Пауза и меню скамьи мир не останавливают, так что не задерживайтесь рядом с врагами. Дальше по главам ведёт хост.'],
  ];
  return <div class="hw-grid">{list.map(([t, x]) => (<div class="hw-it" key={t}><h3>{t}</h3><p><Rich t={x} /></p></div>))}</div>;
}

const BOSS = [
  { id: 'korn', name: 'Корнематка', tips: ['Корни бьют из-под земли цепочкой к вам: место вспыхивает заранее — уходите прыжком или рывком.', 'Ярость на 60 % и 30 % здоровья: она неуязвима полторы секунды. Отойдите и ждите, нить не тратьте.', 'В третьей фазе она прыгает дважды и пускает корни в обе стороны: держите дистанцию, бейте после приземления.'] },
  { id: 'misha', name: 'Миша Додик', tips: ['«Пропустите!» — встаньте у него на пути в подсвеченном коридоре. «Диктант!» — ищите проём в стене из букв.', 'В первых двух фазах бейте иглой; дымовая бомба в рюкзак на спине снимает бутон целиком. Ящики «ДЫМ» стоят по краям арены.', 'В последней фазе рюкзак застёгнут: иглой не пробить, только бомбами. Заходите со спины или кидайте навесом.'] },
  { id: 'vladik', name: 'Владик Скрипка', tips: ['Скрипичные ключи возвращаются бумерангом: уходите и от обратного пути. Ноты можно срубить.', 'Нотный стан: стойте на безопасной линии (пол или парта). Шторы со слизью жгутся, пройти можно низом.', 'После выпада смычком — окно для ударов. В третьей фазе ноты падают с потолка.'] },
  { id: 'tima', name: 'Тима Пиво', tips: ['Коллекторы режутся иглой за два удара. В пене от бутылок бегать трудно: не стойте в лужах.', 'Он пьёт пиво и лечится — прервите его ударом. «Банкротство!»: уходите из-под печатей, мебель на 6 секунд изымают.', 'В третьей фазе ачивки-кубки падают с отскоком, а после геймпада идёт красное кольцо.'] },
];
function Bosses() {
  const all = [...BOSS, ...listedDefs(false).filter((d) => d.tips.length).map((d) => ({ id: d.id, name: d.name, tips: d.tips }))]; // боссы на данных добавляют свои советы сами (поле tips в JSON)
  return (<>
    <p class="sub">Совет открывается после первой встречи с боссом.</p>
    <div class="hw-grid">
      {all.map((e) => {
        const r = records.get(e.id), seen = r.tries > 0;
        return (<div class={`hw-it ${seen ? '' : 'lock'}`} key={e.id}>
          <h3>{seen ? e.name : '???'}</h3>
          {!seen ? <p class="sub">Вы ещё не встречали этого босса. Совет откроется после первой попытки.</p> : (<>
            <div class="tag">Попыток: {r.tries} · побед: {r.wins}{r.best ? ` · лучшее время: ${fmtMin(r.best)}` : ''}</div>
            <ul>{e.tips.map((t) => <li key={t}>{t}</li>)}</ul>
          </>)}
        </div>);
      })}
    </div>
  </>);
}

/** прокрутка тела окна: ↑ ↓ PageUp/PageDown, стик геймпада */
function useScroll(ref: { current: HTMLElement | null }, deps: unknown[]): void {
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, deps);
  useEffect(() => {
    let raf = 0, t0 = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
      let sy = 0;
      for (const p of listPads()) { const ay = p.axes[1] ?? 0; if (Math.abs(ay) > 0.3) sy += ay * 1.4; }
      if (sy && ref.current) ref.current.scrollTop += Math.max(-2, Math.min(2, sy)) * 420 * dt;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

export const HOWTO_TABS = ['controls', 'moves', 'coop', 'bosses'] as const;
export type HowSection = typeof HOWTO_TABS[number];

export function HowTo({ section, crumbs, onBack }: { section?: HowSection; crumbs: string[]; onBack: () => void }) {
  const d = useDevice();
  const [tab, setTab] = useState(Math.max(0, HOWTO_TABS.indexOf(section ?? 'controls')));
  const body = useRef<HTMLDivElement>(null);
  useScroll(body, [tab]);
  const foot = d === 'pad' ? `Крестовина ◄ ► или ${ps() ? 'L1 R1' : 'LB RB'} — вкладки · стик ▲▼ — листать · ${padNames().back} — назад`
    : d === 'touch' ? 'Проведите пальцем вверх или вниз, чтобы листать' : '← → — вкладки · 1–4 — вкладка · ↑ ↓, колёсико, Пробел — листать · Esc — назад';
  // LB/RB — вкладки; PageUp/PageDown/Home/End/Space — листать
  const padPrev = useRef({ lb: false, rb: false });
  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      let lb = false, rb = false;
      for (const p of listPads()) { lb ||= !!p.buttons[4]?.pressed; rb ||= !!p.buttons[5]?.pressed; }
      if (lb && !padPrev.current.lb) setTab((t) => (t + 3) % 4);
      if (rb && !padPrev.current.rb) setTab((t) => (t + 1) % 4);
      padPrev.current = { lb, rb };
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const onKey = (e: KeyboardEvent): boolean => {
    const el = body.current; if (!el) return false;
    if (e.code === 'KeyQ' || e.key === 'ArrowLeft' || e.code === 'KeyA') { setTab((t) => (t + 3) % 4); return true; }
    if (e.code === 'KeyE' || e.key === 'ArrowRight' || e.code === 'KeyD') { setTab((t) => (t + 1) % 4); return true; }
    if (e.key === 'ArrowUp' || e.code === 'KeyW') { el.scrollTop -= 64; return true; }
    if (e.key === 'ArrowDown' || e.code === 'KeyS') { el.scrollTop += 64; return true; }
    if (e.code === 'PageUp') { el.scrollTop -= el.clientHeight * 0.85; return true; }
    if (e.code === 'PageDown') { el.scrollTop += el.clientHeight * 0.85; return true; }
    if (e.code === 'Home') { el.scrollTop = 0; return true; }
    if (e.code === 'End') { el.scrollTop = el.scrollHeight; return true; }
    if (e.code === 'Space' && !(e.target as HTMLElement | null)?.matches?.('button')) { el.scrollTop += (e.shiftKey ? -1 : 1) * el.clientHeight * 0.85; return true; }
    return false;
  };
  return (
    <Panel crumbs={[...crumbs, 'Как играть']} onBack={onBack} cls="hw" onKey={onKey} foot={foot} label="Как играть">
      <h2 class="hw-title">Как играть</h2>
      <Tabs tabs={['Управление', 'Приёмы', 'Кооп', 'Боссы']} i={tab} set={setTab} />
      <div class="hw-body" ref={body} tabIndex={0} data-testid="howto-body">
        {tab === 0 ? <Controls cur={d} /> : tab === 1 ? <Moves d={d} /> : tab === 2 ? <Coop d={d} /> : <Bosses />}
      </div>
    </Panel>
  );
}

export function Changelog({ version, build, crumbs, onBack }: { version: string; build: string; crumbs: string[]; onBack: () => void }) {
  const d = useDevice();
  const body = useRef<HTMLDivElement>(null);
  useScroll(body, []);
  const foot = d === 'pad' ? `Стик или крестовина ▲▼ — листать · ${padNames().back} — назад` : d === 'touch' ? 'Проведите пальцем вверх или вниз, чтобы листать' : '↑ ↓, колёсико, Пробел — листать · Esc — назад';
  const onKey = (e: KeyboardEvent): boolean => {
    const el = body.current; if (!el) return false;
    if (e.key === 'ArrowUp' || e.key === 'w') { el.scrollTop -= 64; return true; }
    if (e.key === 'ArrowDown' || e.key === 's') { el.scrollTop += 64; return true; }
    if (e.code === 'PageUp') { el.scrollTop -= el.clientHeight * 0.85; return true; }
    if (e.code === 'PageDown' || (e.code === 'Space' && !(e.target as HTMLElement | null)?.matches?.('button'))) { el.scrollTop += el.clientHeight * 0.85; return true; }
    return false;
  };
  const rows: ComponentChildren[] = CHANGELOG.map((l) => <li key={l}>{l}</li>);
  return (
    <Panel crumbs={[...crumbs, 'Что нового']} onBack={onBack} cls="hw" onKey={onKey} foot={foot} digits={false} label="Что нового">
      <h2 class="hw-title">Что нового <small class="hw-ver">версия {version}{build ? ` · сборка ${build}` : ''}</small></h2>
      <div class="hw-body" ref={body} tabIndex={0} data-testid="changelog-body"><ul class="hw-log">{rows}</ul></div>
    </Panel>
  );
}
