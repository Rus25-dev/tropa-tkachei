// Тестовые мини-боссы волны 0: по одному на каждую возможность каркаса (в data/bosses их нет — это только фикстуры для тестов и инструментов).
//   fx_morph  — трансформация: сцена с событиями, тело меняет размер и летает, набор приёмов, политика формы, рисовальщик-вариант;
//   fx_arena  — арена по расписанию: платформы (показ, исчезновение, ход), луч, зона по attack.fire, точка появления снарядов, барьер;
//   fx_trio   — дирижёр на трёх боссах (ведущий + fx_trio_b + fx_trio_c): расписание тактов и эстафета; fx_pool — то же с общим пулом здоровья;
//   fx_still  — неподвижный босс с уязвимыми точками (открыты в окнах), броня остального тела, исчезающие существа с мини-связками.
// Функции возвращают свежие «сырые» определения (JSON-совместимые): их можно портить в тестах и подавать в registerBoss.
import dummy from '../../data/bosses/dummy.json' with { type: 'json' };

export type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- черновые определения
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** атака манекена по id (проверенные числа) */
export const dummyAttack = (id: string): Raw => clone((dummy.attacks as Raw[]).find((a) => a['id'] === id)!);

const rest = (o: Raw = {}): Raw => ({ noRepeat: 0, restFrames: [30, 40], ...o });
const swing = (): Raw => dummyAttack('swing');
const oneChain = (id: string, attack: string, over: Raw = {}): Raw => ({ id, steps: [{ attack }], weight: 1, ...over });
/** общая основа: наземный босс манекена, защита от читов выключена (включается там, где она предмет теста) */
export function base(id: string, over: Raw = {}): Raw {
  return {
    id, name: 'Тест ' + id, arena: 'vladik', size: { w: 40, h: 78 }, hp: [60, 80], intro: { frames: 1 }, deathFrames: 60,
    attacks: [swing()], chains: [oneChain('c_swing', 'swing')],
    phases: [{ fromHp: 1, policy: { chains: ['c_swing'], ...rest() } }],
    antiCheese: { enabled: false },
    ...over,
  };
}

// ---------- трансформация ----------
const dive = (): Raw => ({
  id: 'dive', name: 'Пике',
  tell: { frames: 30, lockFace: true, cue: { color: 'red', sfx: 'swoop', pose: 'dive' } },
  move: [{ from: 0, to: 12, vx: 260, vy: 160, toward: 'player' }],
  active: [{ from: 0, to: 12, hit: { x: -30, y: 0, w: 80, h: 70 }, dmg: 1, kind: 'dodge' }],
  recovery: { frames: 44, punishWindow: { from: 6, to: 38 } },
});
export function morphBoss(id = 'fx_morph'): Raw {
  return base(id, {
    attacks: [swing(), dive(), dummyAttack('orb')],
    chains: [oneChain('c_swing', 'swing'), oneChain('c_dive', 'dive'), oneChain('c_orb', 'orb')],
    phases: [
      { fromHp: 1, policy: { chains: ['c_swing'], ...rest() } },
      {
        fromHp: 0.5, rageFrames: 20,
        scene: {
          frames: 90, skippable: true, say: 'Крылья!',
          events: [
            { at: 5, shake: { ms: 300, i: 0.01 }, sfx: 'roar' },
            { at: 40, morph: true, flash: { ms: 200 } },
            { at: 60, zoom: { k: 1.3, frames: 20 }, say: 'Держись!' },
          ],
        },
        form: { size: { w: 60, h: 44 }, fly: { hover: 90, speed: 160, bob: 0 }, draw: 'bat', color: 5588019, attacks: ['dive', 'orb'], idle: { walkSpeed: 40, keepDist: 100 }, contact: { dmg: 1, kind: 'dodge' } },
        enterChain: 'c_orb',
        policy: { chains: ['c_dive', 'c_orb'], ...rest({ noRepeat: 1 }) },
      },
    ],
  });
}
/** переход без рёва: фаза 2 включается сразу, переходной приём с телеграфом; форма с собственной политикой */
export function silentBoss(id = 'fx_silent'): Raw {
  const b = morphBoss(id);
  const p2 = (b['phases'] as Raw[])[1]!;
  p2['silent'] = true; p2['rageFrames'] = 0; delete p2['scene'];
  p2['form'] = { size: { w: 50, h: 60 }, policy: { chains: ['c_dive'], ...rest() } };
  delete p2['form'].fly; delete p2['form'].attacks; delete p2['form'].draw; delete p2['form'].idle; delete p2['form'].contact;
  return b;
}

// ---------- арена по расписанию ----------
export function arenaBoss(id = 'fx_arena'): Raw {
  const zap: Raw = {
    id: 'zap', name: 'Зона',
    tell: { frames: 34, cue: { color: 'purple', sfx: 'zap', pose: 'point' } },
    fire: [{ at: 0, ent: 'zone_fire' }],
    recovery: { frames: 60, punishWindow: { from: 40, to: 59 } },
  };
  // зона должна успеть отработать до того, как босс снова станет уязвим: tell зоны 50 > tell атаки 34 — это предупреждение зоны, не атаки
  zap['recovery'] = { frames: 120, punishWindow: { from: 70, to: 110 } };
  return base(id, {
    arena: {
      level: 'vladik',
      ents: [
        { id: 'plat_start', kind: 'platform', area: { x: 320, y: 96, w: 128, h: 32 }, bind: { start: true }, timeline: [{ at: 0, op: 'show', warn: 30 }, { at: 240, op: 'hide', warn: 40 }, { at: 420, op: 'show', warn: 30 }], loop: 600 },
        { id: 'plat_solid', kind: 'platform', solid: true, area: { x: 640, y: 64, w: 96, h: 32 }, bind: { phase: [2] }, timeline: [{ at: 0, op: 'show', warn: 30 }, { at: 120, op: 'move', to: { x: 736, y: 64 }, frames: 60 }] },
        { id: 'beam_a', kind: 'beam', hit: 'dodge', area: { x: 0, y: 0, w: 200, h: 60 }, bind: { chain: 'c_beam', step: 0 }, timeline: [{ at: 0, tell: 40, active: 20 }] },
        { id: 'zone_fire', kind: 'beam', hit: 'unblockable', dmg: 2, area: { x: 1000, y: 0, w: 150, h: 200 }, timeline: [{ at: 0, tell: 50, active: 30 }] },
        { id: 'spawn1', kind: 'spawner', pos: { x: 700, y: 250 }, bind: { phase: [2] }, loop: 300, timeline: [{ at: 0, tell: 30, proj: { kind: 'rock', w: 16, h: 16, life: 120 }, kind: 'dodge', vy: 200 }] },
        { id: 'wall', kind: 'barrier', area: { x: 1280, y: 0, w: 32, h: 128 }, bind: { phase: [2] }, timeline: [{ at: 60, op: 'show', warn: 40 }, { at: 300, op: 'hide', warn: 40 }] },
      ],
    },
    attacks: [swing(), zap],
    chains: [oneChain('c_swing', 'swing'), oneChain('c_beam', 'swing'), oneChain('c_zap', 'zap')],
    phases: [
      { fromHp: 1, policy: { chains: ['c_swing', 'c_beam', 'c_zap'], ...rest({ noRepeat: 1 }) } },
      { fromHp: 0.5, rageFrames: 10, policy: { chains: ['c_swing', 'c_zap'], ...rest({ noRepeat: 1 }) } },
    ],
  });
}

// ---------- дирижёр ----------
const member = (id: string, over: Raw = {}): Raw => base(id, { hidden: true, name: 'Участник ' + id, chains: [oneChain('c_a', 'swing')], phases: [{ fromHp: 1, policy: { chains: ['c_a'], ...rest() } }], ...over });
export function trioBosses(lead = 'fx_trio', pool = false): Raw[] {
  const b = `${lead}_b`, c = `${lead}_c`;
  const ld = base(lead, {
    attacks: [swing(), dummyAttack('slam')],
    chains: [oneChain('c_a', 'swing'), oneChain('c_b', 'slam')],
    phases: [{ fromHp: 1, policy: { chains: ['c_a', 'c_b'], ...rest({ noRepeat: 1 }) } }],
    conductor: {
      members: [{ boss: b, place: { x: 0.2 } }, { boss: c, place: { x: 0.8 } }], lead: 'conductor', pool, win: 'all', beat: 60, cycle: 6,
      schedule: [{ beat: 0, boss: 0, chain: 'c_a' }, { beat: 3, boss: 1, chain: 'c_a' }, { beat: 4, boss: 2, chain: 'c_a' }],
      relay: [{ from: 1, chain: 'c_a', to: 0, next: 'c_b', after: 10 }],
    },
  });
  return [ld, member(b), member(c)];
}

// ---------- неподвижный босс с уязвимыми точками и существами ----------
export function stillBoss(id = 'fx_still'): Raw {
  const call: Raw = {
    id: 'call', name: 'Зов',
    tell: { frames: 30, cue: { color: 'white', sfx: 'call', pose: 'raise' } },
    summon: [{ at: 0, creature: 'wisp', ox: 50, oy: -20, count: 2 }],
    recovery: { frames: 60, punishWindow: { from: 6, to: 50 } },
  };
  // «Град»: камни падают в точку, где стоял герой (from: target) — достаёт героя в любом месте арены, в том числе на платформе
  const sweep: Raw = { ...dummyAttack('rain'), id: 'sweep', name: 'Град' }; delete sweep['requires'];
  const shove: Raw = { ...dummyAttack('swing'), id: 'shove', name: 'Отгон', requires: { dist: [0, 400] } };
  return base(id, {
    size: { w: 80, h: 100 }, still: true, place: { x: 0.55, y: 0 }, hp: [40, 60],
    weak: [{ id: 'core', box: { x: 20, y: 40, w: 40, h: 40 }, open: [{ on: 'punish' }, { on: 'recover', from: 0, to: 60 }] }],
    attacks: [call, sweep, shove],
    chains: [oneChain('c_call', 'call'), oneChain('c_sweep', 'sweep'), oneChain('c_shove', 'shove')],
    phases: [{ fromHp: 1, policy: { chains: ['c_call', 'c_sweep'], ...rest({ noRepeat: 1 }) } }],
    creatures: [{
      id: 'wisp', name: 'Огонёк', size: { w: 20, h: 20 }, hp: 2, speed: 70, fly: { hover: 50, speed: 100, bob: 3 }, life: 360, fade: 40, max: 2,
      contact: { dmg: 1, kind: 'dodge' }, vanishOn: ['bossDeath', 'stagger'],
      attacks: [{ id: 'spit', tell: { frames: 26, cue: { color: 'yellow', sfx: 'spit', pose: 'puff' } }, spawn: [{ at: 0, proj: { kind: 'spore', w: 10, h: 10, life: 120 }, kind: 'parry', vx: 260, vy: -120, aim: true }], recovery: { frames: 30, punishWindow: { from: 4, to: 24 } } }],
      chains: [{ id: 'm_spit', steps: ['spit'], weight: 1 }], rest: [60, 90],
    }],
    antiCheese: { enabled: true, shoveChain: 'c_shove', relocateChain: 'c_sweep' },
  });
}

// ---------- «статуя»: мишень для проверок игрока ----------
/** Босс, который стоит и не нападает (атака требует героя на недосягаемой дистанции), здоровья много. Арена Владика 44×22.
 *  Нужен тестам механик героя (отбив, приёмы, оружие): раньше им служил спящий Владик-автомат. */
export function statueBoss(id = 'fx_statue'): Raw {
  const a = swing(); a['requires'] = { dist: [9000, 9500] };
  return base(id, { hp: [400, 560], idle: { walkSpeed: 0, keepDist: 90 }, attacks: [a], chains: [oneChain('c_swing', 'swing')] });
}
