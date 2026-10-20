// Заглушки команд, которые появятся на следующих этапах плана (docs/V2_PLAN.md): bot, fuzz, replay, sim.
const when = { sim: 'этап 2 (ядро: npm run sim -- --boss misha --frames 36000)', bot: 'этап 7 (бот на ядре)', fuzz: 'этап 7 (фаззер)', replay: 'этап 7 (воспроизведение .ttrec)' };
const name = process.argv[2] ?? '?';
console.log(`Команда «${name}» появится на ${when[name] ?? 'одном из следующих этапов'}.`);
