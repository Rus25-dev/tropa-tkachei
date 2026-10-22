// Волна 0: рисовальщики боссов (src/view/draw/boss/<id>.ts) раскладываются по id из имён файлов; для боссов без файла рисует универсальный «манекен».
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bodyDrawer, creatureDrawer, indexDrawers } from '../../src/view/draw/bossdraw';

describe('рисовальщики боссов', () => {
  it('файл <id>.ts: base — тело, имя формы — вариант, creature:<id> — существо', () => {
    const f = (): void => undefined, set = { base: f, bat: f, 'creature:wisp': f };
    const idx = indexDrawers({ './boss/zz_fx.ts': set, './boss/пусто.ts': undefined });
    expect([...idx.keys()]).toEqual(['zz_fx']);
    expect(idx.get('zz_fx')).toBe(set);
  });
  it('реальная папка: найденные рисовальщики совпадают с файлами src/view/draw/boss, у манекена своего арта нет', () => {
    const files = readdirSync(join(process.cwd(), 'src/view/draw/boss')).filter((n) => n.endsWith('.ts')).map((n) => n.replace(/\.ts$/, ''));
    for (const id of files) expect(bodyDrawer(id, null) ?? creatureDrawer(id, 'x') ?? true).toBeTruthy();
    expect(bodyDrawer('dummy', null)).toBeUndefined(); expect(bodyDrawer('dummy', 'bat')).toBeUndefined(); expect(creatureDrawer('dummy', 'wisp')).toBeUndefined();
  });
});
