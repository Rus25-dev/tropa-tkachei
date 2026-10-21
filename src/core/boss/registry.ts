// Реестр боссов на данных: JSON из data/bosses подключаются как модули (как data/balance.json) и проверяются при загрузке ядра.
import rulesRaw from '../../../data/bosses/rules.json' with { type: 'json' };
import dummyRaw from '../../../data/bosses/dummy.json' with { type: 'json' };
import { parseBossDef, parseRules, type BossDef, type Rules } from './schema';

export const BOSS_RULES: Rules = parseRules(rulesRaw);
const DEFS: Record<string, BossDef> = {};
/** Добавить босса (для новых боссов 2.6+ и тестов): проверяет по схеме и правилам честности. */
export function registerBoss(raw: unknown): BossDef {
  const d = parseBossDef(raw, BOSS_RULES); DEFS[d.id] = d; return d;
}
registerBoss(dummyRaw);

export const bossDef = (id: string): BossDef | undefined => DEFS[id];
export const dataBossIds = (): string[] => Object.keys(DEFS);
/** id босса-манекена для карточки разработчика (?dev=1) */
export const DEV_BOSS_ID = 'dummy';
