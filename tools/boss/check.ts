// Проверка честности данных боссов:  npm run boss:check [-- --boss dummy] [--json] [--no-color]
// Ошибки (красные) — бой нечестный, код выхода 1; предупреждения (жёлтые) — на усмотрение автора.
import { parseRules } from '../../src/core/boss/schema';
import { formatReport, validateRaw, type Issue } from '../../src/core/boss/validate';
import { arenaInfo, loadBossFiles, readRulesRaw } from './files';

const argv = process.argv.slice(2);
const opt = (n: string): string | undefined => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
const rules = parseRules(readRulesRaw());
const files = loadBossFiles(opt('boss'));
if (!files.length) { console.error('Нет боссов' + (opt('boss') ? ` «${opt('boss')}»` : '') + ' в data/bosses'); process.exit(2); }
const res = files.map((f) => ({ id: f.id, issues: validateRaw(f.raw, rules, arenaInfo((f.raw as { arena?: string }).arena)) as Issue[] }));
if (argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
else console.log(formatReport(res, !argv.includes('--no-color') && !process.env['NO_COLOR']));
process.exitCode = res.some((r) => r.issues.some((i) => i.level === 'error')) ? 1 : 0;
