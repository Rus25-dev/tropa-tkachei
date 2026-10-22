// No-hit проверка боссов на данных:  npm run boss:nohit -- --boss dummy --runs 50 [--mode strict|parry] [--scan-only] [--seed 1] [--max 240] [--json]
// 1) каждая связка в каждой фазе из набора стартовых положений: «проходима без урона: да/нет, кадр и положение, где нет выхода»;
// 2) --runs целых боёв no-hit ботом: доля безупречных прохождений, время боя без урона, урон по связкам.
// Режим parry включится, только если в ядре есть Парирование 2.0 (иначе сообщит и продолжит в strict).
import { mean, median, pct, num } from '../bot/stats';
import { parryImplemented, runFlawless, scanChains, scanFight, scanTransitions, type ChainReport, type FightScan, type FlawlessResult, type NoHitCfg, type NoHitMode, type TransitionReport } from '../bot/nohit';
import { bossDef } from '../../src/core/boss/registry';

const argv = process.argv.slice(2);
const opt = (n: string, d?: string): string | undefined => { const i = argv.indexOf('--' + n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const flag = (n: string): boolean => argv.includes('--' + n);

export const SCAN_AT = [0.03, 0.5, 0.97];
export const SCAN_OFFSETS = [-350, -200, -100, -45, 45, 100, 200, 350];

export function renderScan(rs: ChainReport[]): string {
  const out = ['| Фаза | Связка | Проходима без урона | Чистых стартов | Где нет выхода |', '|---|---|---|---|---|'];
  for (const r of rs) {
    const f = r.fails[0];
    const where = f ? `кадр боя ${f.forced.tick}${f.forced.attackFrame !== null ? `, кадр атаки «${f.forced.attack}» ${f.forced.attackFrame}` : ''}; герой ${f.forced.hero.dx >= 0 ? 'справа' : 'слева'} от центра босса на ${Math.abs(f.forced.hero.dx)} px (x ${f.forced.hero.x}, y ${f.forced.hero.y}); босс на ${pct(f.bossAt)} арены; выживает ещё ${f.forced.survives} кадров${f.forced.exhausted ? '' : ' (поиск оборван по лимиту)'}` : '';
    out.push(`| ${r.phase} | ${r.chain} | ${r.passable ? 'да' : '**НЕТ**'} | ${r.clean}/${r.scenarios} | ${where} |`);
  }
  return out.join('\n');
}
export function renderTransitions(rs: TransitionReport[]): string {
  const out = ['| Фаза | Переживается без урона | Чистых стартов | Где нет выхода |', '|---|---|---|---|'];
  for (const r of rs) {
    const f = r.fails[0];
    out.push(`| ${r.phase} | ${r.passable ? 'да' : '**НЕТ**'} | ${r.clean}/${r.scenarios} | ${f ? `кадр боя ${f.forced.tick}${f.forced.attack ? `, «${f.forced.attack}»` : ''}; герой на ${f.forced.hero.dx >= 0 ? 'правее' : 'левее'} центра босса на ${Math.abs(f.forced.hero.dx)} px` : ''} |`);
  }
  return out.join('\n');
}
export function renderFightScan(rs: FightScan[]): string {
  const out = ['| Зерно | Кадров | Ударов по герою | Бот переживает бой |', '|---|---|---|---|'];
  for (const r of rs) out.push(`| ${r.seed} | ${r.frames} | ${r.hits} | ${r.passable ? 'да' : '**НЕТ**' + (r.forced[0] ? ` (кадр ${r.forced[0].tick}, ${r.forced[0].attack ?? 'вне атаки'})` : '')} |`);
  return out.join('\n');
}
export function renderFights(rs: FlawlessResult[]): string {
  const n = rs.length, won = rs.filter((r) => r.won), flaw = rs.filter((r) => r.flawless);
  const lines = [`Боёв: ${n}; убит босс: ${won.length}/${n}; безупречно (без единого удара по герою): ${flaw.length}/${n} (${pct(flaw.length / n)}).`,
    `Время боя: среднее ${num(mean(rs.map((r) => r.sec)), 1)} с, медиана ${num(median(rs.map((r) => r.sec)), 1)} с; время до первого урона (без урона): среднее ${num(mean(rs.map((r) => r.noHitSec)), 1)} с.`];
  const ch: Record<string, { starts: number; hurt: number }> = {};
  for (const r of rs) for (const k in r.chains) { const c = (ch[k] ??= { starts: 0, hurt: 0 }); c.starts += r.chains[k]!.starts; c.hurt += r.chains[k]!.hurt; }
  lines.push('', '| Связка | Стартов | Ударов по герою | Безупречных |', '|---|---|---|---|');
  for (const [k, v] of Object.entries(ch).sort()) lines.push(`| ${k} | ${v.starts} | ${v.hurt} | ${v.starts ? pct(1 - Math.min(1, v.hurt / v.starts)) : '-'} |`);
  const forced = rs.flatMap((r) => r.forced.map((f) => ({ seed: r.seed, f })));
  if (forced.length) {
    lines.push('', `Места, где бот не нашёл безопасного продолжения: ${forced.length}`);
    for (const { seed, f } of forced.slice(0, 8)) lines.push(`  бой ${seed}, кадр ${f.tick}: ${f.attack ?? 'вне атаки'}${f.attackFrame !== null ? ` (кадр атаки ${f.attackFrame})` : ''}, герой dx ${f.hero.dx} dy ${f.hero.dy}, выживает ещё ${f.survives} кадров`);
  }
  return lines.join('\n');
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href || process.argv[1]?.endsWith('nohit-cli.ts')) {
  const boss = opt('boss', 'dummy')!;
  if (!bossDef(boss)) { console.error(`Нет босса на данных «${boss}»`); process.exit(2); }
  let mode = (opt('mode', 'strict') as NoHitMode);
  if (mode === 'parry' && !parryImplemented()) { console.error('Режим parry отключён: в ядре нет Парирования 2.0 (HitKind-логики). Работаю в режиме strict.'); mode = 'strict'; }
  const cfg: Partial<NoHitCfg> = { mode, horizon: +(opt('horizon', '56')!) };
  const seed = +(opt('seed', '1')!), runs = +(opt('runs', '50')!);
  const t0 = performance.now();
  const scan = scanChains({ boss, bossAt: SCAN_AT, offsets: SCAN_OFFSETS, seed, cfg });
  const trans = scanTransitions({ boss, bossAt: SCAN_AT, offsets: SCAN_OFFSETS, seed, cfg });
  const multi = bossDef(boss)!.conductor ? scanFight(boss, [seed, seed + 1], cfg, 2) : [];
  const fights: FlawlessResult[] = [];
  if (!flag('scan-only')) for (let i = 0; i < runs; i++) fights.push(runFlawless(boss, seed + i * 13, cfg, +(opt('max', '240')!)));
  if (flag('json')) console.log(JSON.stringify({ boss, mode, scan, trans, multi, fights }, null, 2));
  else {
    console.log(`No-hit бот: босс «${boss}», режим ${mode}, горизонт ${cfg.horizon} кадров, ${((performance.now() - t0) / 1000).toFixed(0)} с счёта\n`);
    console.log('Проходимость связок (из ' + SCAN_AT.length * SCAN_OFFSETS.length + ' стартовых положений на связку и фазу)\n');
    console.log(renderScan(scan));
    if (trans.length) { console.log('\nПереходы между фазами (рёв, сцена, переходный приём, сущности арены фазы)\n'); console.log(renderTransitions(trans)); }
    if (multi.length) { console.log('\nБой нескольких боссов под дирижёром (бот только уходит от ударов, 2 цикла расписания)\n'); console.log(renderFightScan(multi)); }
    if (fights.length) { console.log('\nЦелые бои\n'); console.log(renderFights(fights)); }
  }
  process.exitCode = scan.some((r) => !r.passable) || trans.some((r) => !r.passable) || multi.some((r) => !r.passable) ? 1 : 0;
}
