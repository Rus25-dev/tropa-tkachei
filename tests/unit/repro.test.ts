// Регрессионные тесты находок фаззера: каждая запись tests/repro/*.json проигрывается ядром под инвариантами.
//   fixed — нарушение исправлено, больше не должно воспроизводиться;
//   known — особенность v1.8, которую нельзя менять: нарушение обязано воспроизводиться (тест это документирует);
//   open  — находка ещё не разобрана: тест красный, пока её не исправят или не пометят known.
// Находки сохраняет `npm run fuzz` (минимальной записью .ttrec), статус правится вручную после разбора.
import { describe, expect, it } from 'vitest';
import { ttrecError } from '../../src/core/ttrec';
import { findingKey } from '../../tools/fuzz/minimize';
import { loadRepros, REPRO_DIR } from '../../tools/fuzz/repro';
import { scanJournal } from '../../tools/fuzz/scan';

const repros = loadRepros();

describe('находки фаззера (tests/repro)', () => {
  it('каталог находок читается, все записи — корректные .ttrec', () => {
    expect(REPRO_DIR.replaceAll('\\', '/').endsWith('/tests/repro')).toBe(true);
    for (const { name, rep } of repros) expect(ttrecError(rep), name).toBeNull();
  });
  for (const { name, rep } of repros) {
    it(`${name}: ${rep.repro.status} — ${rep.repro.message.slice(0, 80)}`, () => {
      const f = scanJournal(rep.journal, { loadoutSave: rep.setup.loadout, easy: !!rep.setup.easy, ver: rep.ver, progress: rep.setup.progress ?? null });
      if (rep.repro.status === 'fixed') expect(f, f ? `${f.invariant}: ${f.message}` : '').toBeNull();
      else if (rep.repro.status === 'known') expect(f && findingKey(f)).toBe(rep.repro.key);
      else throw new Error(`Находка не разобрана (${rep.repro.invariant}): исправьте ядро или пометьте status: "known" с пояснением в note`);
    });
  }
});
