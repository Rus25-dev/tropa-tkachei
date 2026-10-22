// Волна 0, автообнаружение: босс = один файл data/bosses/<id>.json; карточки Босс-теста, списки гонок и дуэли строятся из реестра.
// Проверяется и путь Vite/Vitest (import.meta.glob), и путь Node-инструментов (tsx читает папки).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cardOf, duelBossIds, LEGACY_CARDS, listedDefs, raceBossIds, testCards } from '../../src/core/boss/catalog';
import { kindIds, kindOf, loadKindsFromDir, registerKind, unregisterKind } from '../../src/core/boss/kinds';
import { bossDef, dataBossIds, readBossFiles, registerBoss, unregisterBoss } from '../../src/core/boss/registry';
import { base, type Raw } from '../fixtures/bosses';

const tmp: string[] = [];
afterAll(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }); });
// Настоящие боссы на данных (data/bosses/*.json, кроме манекена) добавляются по мере выхода версий — тест на них не завязан.
const REAL = new Set(dataBossIds().filter((id) => id !== 'dummy' && !id.startsWith('cat_')));
const real = (xs: string[]): string[] => xs.filter((x) => !REAL.has(x));
const ids = (xs: { id: string }[]): string[] => real(xs.map((x) => x.id));

describe('реестр боссов находит файлы сам', () => {
  it('Vitest (Vite): манекен из data/bosses/dummy.json найден без регистрации; rules.json боссом не считается', () => {
    expect(bossDef('dummy')).toBeTruthy(); expect(dataBossIds()).toContain('dummy'); expect(dataBossIds()).not.toContain('rules');
  });

  it('Node (tsx): те же файлы находятся чтением папки — без Vite, без правок общих списков', () => {
    const code = "import('./src/core/boss/catalog.ts').then((m) => { console.log(JSON.stringify({ dev: m.testCards(true).map((c) => c.id), off: m.testCards(false).map((c) => c.id), race: m.raceBossIds() })); });";
    const out = execFileSync('npx', ['tsx', '--import', './tools/ldtk-register.mjs', '-e', code], { encoding: 'utf8', cwd: process.cwd(), timeout: 60_000 });
    const r = JSON.parse(out.trim().split('\n').pop()!) as { dev: string[]; off: string[]; race: string[] };
    expect(real(r.dev)).toEqual(['misha', 'vladik', 'tima', 'dummy']); expect(real(r.off)).toEqual(['misha', 'vladik', 'tima']);
    expect(real(r.race)).toEqual(['korne', 'misha', 'vladik', 'tima']);
  }, 90_000);

  it('чтение папки: боссы по именам файлов, rules.json пропускается, чужие файлы не мешают', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-bosses-')); tmp.push(dir);
    writeFileSync(join(dir, 'rules.json'), '{}'); writeFileSync(join(dir, 'b_second.json'), JSON.stringify({ id: 'b_second' })); writeFileSync(join(dir, 'a_first.json'), JSON.stringify({ id: 'a_first' })); writeFileSync(join(dir, 'notes.txt'), 'x');
    expect(readBossFiles(dir)).toEqual([{ id: 'a_first' }, { id: 'b_second' }]);
  });

  it('кинды: файл <id>.mjs в папке подключается по имени; пустая и несуществующая папка — не ошибка', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-kinds-')); tmp.push(dir);
    writeFileSync(join(dir, 'kk_one.mjs'), 'export default { frame() {}, fx: { boom() {} } };');
    writeFileSync(join(dir, 'kk_two.mjs'), 'export const notDefault = 1;');
    writeFileSync(join(dir, 'kk_skip.test.mjs'), 'export default {};');
    expect(await loadKindsFromDir(dir)).toEqual(['kk_one']);
    expect(kindOf('kk_one')?.fx?.['boom']).toBeTypeOf('function'); expect(kindIds()).toContain('kk_one');
    unregisterKind('kk_one');
    expect(await loadKindsFromDir(join(dir, 'нет'))).toEqual([]);
    mkdirSync(join(dir, 'пусто')); expect(await loadKindsFromDir(join(dir, 'пусто'))).toEqual([]);
    registerKind('kk_manual', {}); expect(kindOf('kk_manual')).toEqual({}); unregisterKind('kk_manual');
  });
});

describe('карточки и списки строятся из реестра', () => {
  const reg = (over: Raw): Raw => { const r = base(over['id'] as string, over); registerBoss(r); return r; };
  afterAll(() => { for (const id of ['cat_a', 'cat_b', 'cat_dev', 'cat_hid', 'cat_duel']) unregisterBoss(id); });

  it('без ?dev=1 карточки: старые боссы и показываемые боссы на данных; dev-карточка манекена — только в dev', () => {
    expect(ids(testCards(false))).toEqual(['misha', 'vladik', 'tima']);
    const dev = testCards(true), dummy = dev.find((c) => c.id === 'dummy')!;
    expect(ids(dev)).toEqual(['misha', 'vladik', 'tima', 'dummy']);
    expect(dummy.name).toBe('Манекен-наставник (dev)'); expect(dummy.arenaName).toBe('Кабинет музыки'); expect(dummy.data).toBe(true); expect(dummy.dev).toBe(true);
    expect(LEGACY_CARDS.map((c) => c.landmark)).toEqual(['Глава II', 'Глава III', 'Глава IV']);
  });

  it('новый файл — новая карточка с названием, ориентиром, ареной; порядок по order и id; служебные и dev скрыты', () => {
    reg({ id: 'cat_b', name: 'Бэ', order: 20, landmark: 'Ориентир Бэ', arena: 'tima' });
    reg({ id: 'cat_a', name: 'А', order: 10, landmark: 'Ориентир А' });
    reg({ id: 'cat_dev', name: 'Для разработчиков', dev: true });
    reg({ id: 'cat_hid', name: 'Участник', hidden: true });
    expect(ids(testCards(false))).toEqual(['misha', 'vladik', 'tima', 'cat_a', 'cat_b']);
    expect(ids(testCards(true))).toEqual(['misha', 'vladik', 'tima', 'cat_a', 'cat_b', 'cat_dev', 'dummy']);
    const b = cardOf(bossDef('cat_b')!); expect(b).toMatchObject({ name: 'Бэ', landmark: 'Ориентир Бэ', arena: 'tima', arenaName: 'Берлога Тимы', data: true });
    expect(real(listedDefs(false).map((d) => d.id))).toEqual(['cat_a', 'cat_b']);
    expect(real(raceBossIds())).toEqual(['korne', 'misha', 'vladik', 'tima', 'cat_a', 'cat_b']);
    expect(real(duelBossIds())).toEqual(['korne', 'misha', 'vladik', 'tima']); // duel по умолчанию выключен
    reg({ id: 'cat_duel', name: 'Дуэльный', duel: true });
    expect(real(duelBossIds())).toEqual(['korne', 'misha', 'vladik', 'tima', 'cat_duel']);
  });

  it('арена с сущностями (раздел arena = { level, ents }) даёт ту же карточку', () => {
    const r = base('cat_a', { arena: { level: 'misha', ents: [] } }); registerBoss(r);
    expect(cardOf(bossDef('cat_a')!).arena).toBe('misha');
  });
});
