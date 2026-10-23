import { describe, expect, it } from 'vitest';
import { World } from '../../src/core/world';
import { applyLoadout, defaultLoadout, equipped, normalizeSave, useTool, TOOLS } from '../../src/core/loadout';
import { selectedTool, toolAim } from '../../src/core/tool-kit';
import { canStartAction } from '../../src/core/player-actions';
import { packPlayer, applyPlayer } from '../../src/core/netplay';
import { cloneWorld } from '../../tools/bot/clone';
import { toolAmmo, gainToolAmmo } from '../../src/core/tool-ammo';
import { benchRest, respawnLocal } from '../../src/core/combat';
import { Session } from '../../src/core/session';
import { SessionRecorder } from '../../src/core/recording';
import { emptyFrame } from '../../src/core/input';
import { hash3 } from '../../src/core/journal';
import { replayJournal } from '../../src/core/replay';
import { makeTtrec, ttrecError } from '../../src/core/ttrec';
import { ReplaySession } from '../../src/core/replaysession';

const setup = () => {
  const w = new World({ seed: 8, mode: 'bosstest', boss: 'vessel', players: 1 });
  applyLoadout(w, { ...defaultLoadout(), tool: 'throwneedle', toolSlots: { up: 'spirit', down: 'threadbomb' } });
  const p = w.players[0]!; p.silk = 10; p.atkT = p.atkCd = p.landT = p.hurtT = 0;
  return { w, p };
};
describe('направленные инструменты', () => {
  it('старое сохранение и пустые слоты сохраняют основной инструмент', () => {
    const d = normalizeSave({ tool: 'throwneedle', have: { tools: ['throwneedle'] } });
    expect(equipped(d, false, false).tool).toBe('throwneedle');
    const { p } = setup(); p.toolSlots = {}; p.inp = { down: true };
    expect(selectedTool(p)).toBe('throwneedle');
  });
  it('направленные слоты фильтруют недоступные предметы; забег их не получает', () => {
    const d = normalizeSave({ toolSlots: { up: 'spirit', down: 'missing' } });
    expect(equipped(d, false, false).toolSlots).toBeUndefined();
    expect(equipped(d, true, false).toolSlots).toEqual({ up: 'spirit' });
    expect(equipped(d, true, true)).toEqual(defaultLoadout());
  });
  it('выбирает три инструмента; конфликт ↑↓ возвращает основной', () => {
    const { p } = setup();
    for (const [inp, id] of [[{}, 'throwneedle'], [{ up: true }, 'spirit'], [{ down: true }, 'threadbomb'], [{ up: true, down: true }, 'throwneedle']] as const) {
      p.inp = inp; expect(selectedTool(p)).toBe(id);
    }
  });
  it('бросает вниз и вниз по диагонали, конфликт направлений нейтрален', () => {
    const { p } = setup(); p.inp = { down: true };
    expect(toolAim(p)).toMatchObject({ dx: 0, dy: 1 });
    p.inp = { down: true, left: true };
    const a = toolAim(p); expect(a.dx).toBeLessThan(0); expect(a.dy).toBeGreaterThan(0); expect(Math.hypot(a.dx, a.dy)).toBeCloseTo(1);
    p.inp = { up: true, down: true }; expect(toolAim(p).dy).toBe(0);
  });
  it('расходует цену выбранного инструмента и создаёт бомбу с направлением вниз', () => {
    const { w, p } = setup(); p.inp = { down: true };
    expect(useTool(w, p)).toBe(true); expect(p.silk).toBe(10 - TOOLS.threadbomb!.cost);
    expect(w.tl).toHaveLength(1); expect(w.tl[0]).toMatchObject({ kind: 'tbomb', vx: 0, vy: 340 });
    expect(useTool(w, p)).toBe(false); expect(w.tl).toHaveLength(1);
  });
  it.each(['dashT', 'hurtT', 'healCh', 'execT', 'atkT', 'atkCd', 'landT'])( '%s запрещает инструмент и не расходует нить', (key) => {
    const { w, p } = setup(); p[key] = 1;
    expect(canStartAction(p, 'tool')).toBe(false); expect(useTool(w, p)).toBe(false);
    expect(p.silk).toBe(10); expect(w.tl).toHaveLength(0);
  });
  it('недостаток нити не запускает перезарядку и смена снаряжения её не сбрасывает', () => {
    const { w, p } = setup(); p.silk = 0; p.inp = { up: true };
    expect(useTool(w, p)).toBe(false); expect(p.toolCd).toBe(0);
    p.toolCd = 1.5; applyLoadout(w, defaultLoadout()); expect(p.toolCd).toBe(1.5);
  });
  it('запас общий для слотов; перестановка не даёт новых зарядов', () => {
    const { w, p } = setup(); p.silk = 0;
    for (let i = 0; i < 6; i++) { p.toolCd = 0; expect(useTool(w, p)).toBe(true); }
    expect(toolAmmo(p, 'throwneedle')).toBe(0); p.toolCd = 0;
    expect(useTool(w, p)).toBe(false); expect(w.tl).toHaveLength(6);
    applyLoadout(w, { ...defaultLoadout(), toolSlots: { up: 'throwneedle' } }); p.inp = { up: true };
    expect(useTool(w, p)).toBe(false); expect(p.silk).toBe(0);
    gainToolAmmo(p, 'throwneedle'); expect(useTool(w, p)).toBe(true);
  });
  it('отдых и возрождение пополняют запас, подбор ограничен вместимостью', () => {
    const { w, p } = setup(); p.toolAmmo = { throwneedle: 0, threadbomb: 0 };
    benchRest(w, p, { x: p.x + 7, y: p.y + 26 }, true);
    expect(toolAmmo(p, 'throwneedle')).toBe(6); expect(toolAmmo(p, 'threadbomb')).toBe(3);
    gainToolAmmo(p, 'throwneedle'); expect(toolAmmo(p, 'throwneedle')).toBe(6);
    p.toolAmmo.threadbomb = 0; respawnLocal(w); expect(toolAmmo(p, 'threadbomb')).toBe(3);
  });
  it('копия мира хранит независимый набор слотов', () => {
    const { w, p } = setup(), copy = cloneWorld(w);
    copy.players[0]!.toolSlots.up = 'hook'; expect(p.toolSlots.up).toBe('spirit');
  });
  it('смена оружия прерывает старый удар и не обходит восстановление', () => {
    const { w, p } = setup(); p.atkT = 0.2; p.atkCd = 0.1; p.chg = 1; p.atkBuf = 0.1;
    applyLoadout(w, { ...defaultLoadout(), weapon: 'mace' });
    expect(p.atkT).toBe(0); expect(p.chg).toBe(0); expect(p.atkBuf).toBe(0); expect(p.atkCd).toBeGreaterThan(0.1);
  });
  it('сетевой снимок передаёт слоты и ввод вниз; старый снимок не оставляет их', () => {
    const { w, p } = setup(); p.raw = { down: true }; const m = packPlayer(w, p);
    const target = setup(); target.p.remote = true; applyPlayer(target.w, m);
    expect(selectedTool(target.p)).toBe('threadbomb');
    delete m.ts; delete m.di; applyPlayer(target.w, m);
    expect(selectedTool(target.p)).toBe('throwneedle');
  });
  it('новая запись хранит правила, запас и воспроизводится в ядре и просмотре', () => {
    const save = normalizeSave({ tool: 'throwneedle', toolSlots: { up: 'throwneedle', down: 'threadbomb' } });
    const cfg = { loadoutSave: save, progress: null, easy: false, ver: 'gameplay', clock: () => 0, fx: false };
    const s = new Session(cfg, { seed: 88, mode: 'bosstest', boss: 'vessel', players: 1 });
    const rec = new SessionRecorder(s, { ver: 'gameplay', easy: false });
    for (let i = 0; i < 650; i++) {
      if (i === 310) s.setLoadout(normalizeSave({ tool: 'throwneedle', toolSlots: { up: 'hook', down: 'throwneedle' } }));
      const f = emptyFrame(); f.buttons.down = true; if (i === 150) f.edges.toolP = true; s.frame(1000 / 60, [f]);
    }
    expect(rec.journal.segs[0]!.data.gameplay).toBe(2); expect(rec.journal.segs[0]!.hv).toBe(3);
    expect(rec.journal.segs[0]!.acts.some((a) => a[1] === 'gear')).toBe(true);
    const result = replayJournal(rec.journal, { loadoutSave: s.cfg.loadoutSave }); expect(result.ok).toBe(true);
    if (result.ok) expect(hash3(result.world)).toBe(hash3(s.world));
    const file = makeTtrec(rec.journal, { ver: 'gameplay', meta: { kind: 'player' }, setup: { loadout: s.cfg.loadoutSave } });
    expect(ttrecError(file)).toBeNull();
    const viewer = new ReplaySession(cfg, file);
    for (let i = 0; i < 700 && !viewer.ended; i++) viewer.frame(1000 / 60, []);
    expect(viewer.ended).toBe(true); expect(hash3(viewer.world)).toBe(hash3(s.world));
    const h = hash3(s.world); s.world.players[0]!.toolAmmo = { throwneedle: 0 }; expect(hash3(s.world)).not.toBe(h);
  });
});
