# План перехода на v2.0 (этап 0, шаг 1)

Основа: `docs/V2_PROMPT.md`, исходное состояние — `main` на v1.8 (11 500 строк в 39 модулях `src/*.js`, склейка `build.py`). Цель — та же игра по механике, но на Phaser 4 + TypeScript strict + Vite, с чистым ядром, которое запускается в Node.

## 0. Решения и допущения (подтвердите или поправьте)

| # | Решение | Почему |
|---|---|---|
| 1 | **Phaser 4.2.1** (точно, `npm view phaser`: `latest` = 4.2.1; 4.0.0, 4.1.0, 4.2.0 тоже стабильны) | последняя стабильная; Phaser 4 только WebGL, поэтому `?canvas=1` и Canvas-режим из v1.8 исчезают |
| 2 | Ветка **`v2`** долгоживущая, в неё идут небольшие PR; `main` заморожен (тег `v1.8-final`), в него только срочные правки v1.8 | как в промте |
| 3 | **«Тот же исход» = побитовое совпадение логики**: победитель, кадр победы, HP, бусины, позиции героя и босса на контрольных кадрах (хэш каждые 300 тиков, как в `journal.js`) | гонки и журналы требуют точности; порядок арифметики с плавающей точкой переносим 1:1, без «улучшений» формул |
| 4 | Расхождение золотой записи = стоп и разбор по хэшам (какой тик, какая подсистема), без подгонки | правило промта «спроси, если непонятно» |
| 5 | **Preact** для HTML-интерфейса, `idb-keyval` для журналов, `zod` для `races.json`, `uPlot` для графиков (версия 2.1) | как в промте |
| 6 | TURN: рекомендую **Cloudflare Calls TURN** (бесплатный большой лимит; ключи у вас, короткие учётные данные выдаёт бесплатный Worker; в репозитории секретов нет) и **metered.ca Open Relay** как проще-но-слабее. Нужна ваша регистрация на этапе 5 | на этапе 5 дам пошаговую инструкцию |
| 7 | Этап 7 (Optuna, RL/CUDA) делаю последним и **только после вашего одобрения** каждого шага | ML-код требует Python, CUDA 12.8+ для RTX 5080 |

## 1. Карта модулей v1.8 → v2

Принцип: всё, что влияет на исход, → `core/` (чистый TS, без Phaser, DOM, `Date.now`, `Math.random`, таймеров браузера); отрисовка → `view/`; сеть → `net/`; окна → `ui/`; числа баланса → `data/*.json`.

| Модуль v1.8 (строк) | Что внутри | Куда в v2 |
|---|---|---|
| `rng.js` (21) | mulberry32, `rngSeedFor`, потоки | `core/rng.ts` |
| `level.js` (100), части `campaign.js` (дороги, арены) | карта главы I, коридоры, арены | `data/levels/*.ldtk` + `core/level.ts` (загрузчик LDtk → тайлы, сущности), эталонные снимки тайл-в-тайл |
| `game.js` GameScene (≈1250 из 1782): `step`, `stepPlayer`, `moveBody`, урон, `stepEnemy`, `stepBoss`, `stepProjs`, `stepBeads`, `stepCoop`, `teamWipe`, `win`, `packSnap/applySnap`, `onNet` | физика героев, враги, снаряды, бусины, скамьи, кокон, смерть, победа | `core/world.ts` (состояние), `core/step.ts` (порядок шага), `core/player.ts`, `core/physics.ts`, `core/enemies.ts`, `core/projectiles.ts`, `core/coop.ts`, `core/snapshot.ts` |
| `game.js` отрисовка (`render`, `drawPlayer/Enemy/Boss`, `updateCamera`) | графика, камера | `view/` (`HeroView`, `EnemyView`, `BossView`, `Camera`) |
| `game.js` MenuScene, BGScene, UIScene (HUD) | меню, фоны, HUD | HUD → `view/hud.ts` (холст), меню → `ui/` (Preact), фон → `view/parallax.ts` |
| `bosses2.js` (278) | фазы, стойкость, оглушение, казнь, новые снаряды | `core/boss/machine.ts` (общий автомат) + `data/bosses/*.json` |
| `misha.js` (478), `vladik.js` (430), `tima.js` (469) | арены, атаки, снаряды боссов | `data/bosses/{misha,vladik,tima,korne}.json` (состояния, телеграфы, окна, параметры) + `core/boss/{kind}.ts` для того, что не выражается данными (фаза сверху у Миши, шторы Владика, лужи/коллекторы Тимы); рисование → `view/boss/` |
| `enemies2.js` (419) | новые враги и их ИИ | `core/enemies.ts` + `data/enemies.json` |
| `combat2.js` (82), `movement2.js` (183), `qol.js` (62) | отбив, всполох, стенолаз, хват, планер, мелочи | `core/combat.ts`, `core/movement.ts` |
| `weapons.js` (449), `tools.js` (410), `charms.js` (166), `status.js` (174), `loadout.js` (90) | оружие, инструменты, обереги, яд/ожог, снаряжение | `core/gear/*.ts` + `data/gear.json`; эффекты через точки расширения (см. раздел 2) |
| `campaign.js` (318) | главы, коридоры, лавка, сохранение | `core/campaign.ts`, `data/shop.json`; сохранение `tt_save` читается тем же форматом |
| `maptravel.js` (325) | карта и быстрые переходы | `core/travel.ts` + окно `ui/MapTravel` |
| `training.js` (118), `access.js` (158) | тренировка боссов, доступность (замедление, лёгкий режим, без вспышек) | `core/training.ts`; доступность → `core/options.ts` (то, что влияет на исход) и `view/` (то, что только на вид) |
| `speedrun.js` (714) | RTA/IGT, сплиты, код результата, гонка 1×1, комната, таблица друзей | ядро: `core/speedrun.ts` (тики, сплиты, код) · `net/race11.ts` · окна → `ui/` |
| `journal.js` (247) | журнал ввода, воспроизведение | `core/journal.ts` (запись/воспроизведение в чистом ядре, без интервалов) + `net/storage.ts` (IndexedDB) + Web Worker для восстановления |
| `race-net.js` (273) | надёжный канал | `net/reliable.ts` (общий для коопа и гонок), `net/peer-transport.ts` |
| `race-org.js` (424), `race-play.js` (301), `race-watch.js` (307), `race-stats.js` (91) | организатор, игрок, обсервер, статистика | `core/race/stats.ts`, `net/race/{org,play,watch}.ts`, окна → `ui/race/*`, отрисовка обсервера переиспользует `view/` |
| `net.js` (139) | кооп: PeerJS, лобби | `net/coop.ts` на `net/reliable.ts` + `ui/Lobby` |
| `gamepad.js` (107), `touch.js` (131), `uifix.js` (130) | геймпад, сенсорный ввод, поворот экрана | `input/{keyboard,gamepad,touch}.ts` → единый `InputFrame` для ядра; `ui/Rotate` |
| `menu.js` (546), `ingame.js` (352), `howto.js` (325), `loadoutui.js` (322), `settings.js` (117) | меню, пауза, скамья, справка, снаряжение, настройки | `ui/` (Preact): карта экранов `ui/menuMap.ts` как в v1.8, окна на HTML, навигация клавиатурой/геймпадом/касанием |
| `art.js` (257), `music.js` (105), `sound.js` (81) | процедурная графика, музыка, звуки | `view/art/` (текстуры один раз при входе в комнату), `view/audio/` (WebAudio, по событиям из `step()`) |
| `update.js` (30), `shell.html` | проверка версии, оболочка | `ui/Updater`, `index.html` Vite, `public/manifest.webmanifest` |
| `build.py` | склейка | Vite + `vite-plugin-singlefile`, `rating.html` (2.1) |

Новая структура: `src/core/`, `src/view/`, `src/net/`, `src/ui/`, `src/input/`, `data/`, `levels/`, `tests/{unit,e2e,golden,repro}/`, `tools/` (бот, фаззер, replay, sim), `ml/`.

## 2. Подмены `GameScene.prototype`: чем заменяются

В v1.8 модули «наслаиваются» обёртками поверх `GameScene.prototype` (порядок загрузки определяет порядок вызова). В ядре это явный конвейер с типизированными точками расширения.

| Модуль | Что подменяет | Замена в v2 |
|---|---|---|
| `access.js` | `setupInput, create, update, render, showPause` | `core/options.ts` (множитель скорости до шага — доступность не меняет логику внутри тика), остальное — `view/` и `ui/` |
| `bosses2.js` | `poiseAdd, execBoss, tryExecute, execKit…, bossDeathFx` | единый `core/boss/poise.ts` (ЯВНЫЙ вызов в обработчике удара), эффекты смерти → событие `boss.dead` для `view/` |
| `campaign.js` | `rawInput, onKeyTap, onTouchTap, update` (замирание ввода в лавке) | `core/step.ts`: «ввод заморожен» — функция `frozenInput(world)` в одном месте |
| `charms.js`, `weapons.js`, `tools.js`, `status.js`, `loadout.js` | `stepPlayer, hurtPlayer, damageEnemy, gainSilk, atkBox, resolveAttack, applyLoadout, packPlayer, speedMul…` | хуки `onStepPlayer / onHurt / onDamage / onSilkGain / atkBoxMod / speedMod` в `core/gear/hooks.ts`, порядок вызова фиксирован и покрыт тестом |
| `enemies2.js` | `stepExtraProj, parrySuccess, onEv, silkBurstHit` | `core/enemies.ts` + общий список снарядов; события — в `core/events.ts` |
| `gamepad.js`, `touch.js`, `uifix.js` | `update, hurtPlayer (вибрация), parrySuccess, silkBurst, phaseShift, poiseAdd, showPause` | события ядра → `view/haptics.ts`; ввод — `input/` |
| `ingame.js` | `create, update, restart, showPause, menuLock, menuHeld, rawInput, togglePause, benchOpen/Close` | `ui/` (меню скамьи и паузы) + `core/pause.ts` (флаги паузы/меню как часть состояния и журнала) |
| `journal.js` | `create, tick, update, toast` + обёртки действий интерфейса (`togglePause`, `benchRest`, `Campaign.buy`, `MapTravel.*`) | `core/journal.ts`: действия интерфейса — типизированные команды, которые ядро принимает на тике, поэтому журнал пишется в одном месте, а не обёртками |
| `loadoutui.js`, `maptravel.js` | `rawInput, onKeyTap, onTouchTap, togglePause, update, step, create` | `core/travel.ts` + окна `ui/` |
| `movement2.js` | `stepPlayer, packPlayer, onNet, drawPlayerFx, vladikDie` | `core/movement.ts` |
| `qol.js` | `step, respawnAll, [killBoss…], drawPlayerFx` | в `core/step.ts` / `view/` |
| `race-org.js`, `race-play.js`, `race-stats.js` | `create`, `teamWipe, parrySuccess, execBoss`, `hurtPlayer`, `damageBoss…` | `core/events.ts` (события боя) → подписка статистики и телеметрии; никаких обёрток |
| `speedrun.js` | `[killBoss…], teamWipe, init, create, rawInput, onKeyTap, onTouchTap, update, win, render, restart, retry, winEnter, srResult` | `core/speedrun.ts` слушает события `boss.dead`, `team.wipe`, `win`; экран итога — `ui/` |
| `status.js`, `tools.js` | `packSnap, applySnap, render, guestProjHits` | `core/snapshot.ts` (единая схема снимка, версия формата), статусы рисует `view/` |
| `training.js` | `init, create, step, hurtPlayer` | параметры в `world.options.training`, не обёртка |

Итого 22 модуля, ≈110 подмен → ≈12 точек расширения с зафиксированным порядком.

## 3. Таймеры → счётчики тиков

Уже сделано в v1.8: `GameScene.after()/tick()`. Что осталось и что станет:

| Где | Сейчас | В v2 |
|---|---|---|
| `game.js` 1032, `vladik.js` 315, `tima.js` 315, `misha.js` 121 | `delayedCall(i*170…)` — пачки визуальных взрывов при смерти босса (там же `Math.random`) | `view/`: подписка на событие `boss.dead`, таймеры в тиках вида (`ViewClock`), случайность — отдельный `viewRng`, на исход не влияет |
| `game.js` 1234, 1299, 1310 | сетевые: фейд, `ui().restart()` через 2,8 с, возвращение гостя | `net/`: счётчики кадров на стороне хоста по событиям |
| `game.js` 102, 121, 127, `speedrun.js` 369, 675, `race-play.js` 151 | запуск сцены через 460 мс после фейда | `ui/`/`view/` (не логика): `Transition` с анимацией, без влияния на ядро |
| `loadoutui.js` 24, `ingame.js` 274 | `setTimeout(0)` «чтобы Esc не включил паузу», опрос кнопок геймпада | команды с признаком «поглощено в этом кадре» в `input/` |
| `game.js` 1777 | `setTimeout(refit…)` после поворота | `ui/` (resize-наблюдатель) |
| `race-net.js`, `race-org.js`, `journal.js` | `setInterval/performance.now/Date.now` | `net/` и `ui/`; в ядре — только счёт тиков |

`Math.random` в игровой логике (≈35 мест: `game.js` 5, `misha.js` 7, `tima.js` 5, `vladik.js` 4, `enemies2.js` 4, `movement2.js` 4, `status.js` 2, `bosses2.js` 1, `weapons.js` 1): в v1.8 они на визуальных эффектах; при переносе каждое либо уходит в `view/` с `viewRng`, либо заменяется потоком `rngFor('…')`. **Правило линтера**: в `src/core/**` запрещены `Math.random`, `Date`, `performance`, `setTimeout`, `setInterval`, `requestAnimationFrame`, импорт Phaser/DOM.

## 4. Золотые записи (этап 0, шаг 4)

Журнал v1.8 пишет только одиночный забег (`gs.sr`, 1 игрок, офлайн). Нужно **минимально расширить** (отдельный PR в `main`, правка «срочных исправлений» — на ваше согласие):
1. Писать любой режим: `bosstest`, `story`, `speedrun`; `nPlayers` 1–2; ввод каждого локального игрока (два канала в RLE).
2. Режим `?rec=golden` для тестов: запись без `localStorage`-ограничений, итог в JSON.

Что записать (бот `tools/botbrain.js` + принудительные «читы» только как журналируемые действия):

| Запись | Режим | Исход, который фиксируем |
|---|---|---|
| `boss-korne-win/lose`, `boss-misha-win/lose`, `boss-vladik-win/lose`, `boss-tima-win/lose` | bosstest, 1 игрок | победа/поражение, кадр, HP героя, фаза, бусины, хэши каждые 300 тиков |
| `chapter1-full` | story, глава I целиком (с лавкой и смертью) | кадр победы, бусины, способности, сохранение |
| `road-ch2`, `road-ch3`, `road-ch4` | коридоры | кадр выхода, бусины, смерти |
| `coop-two-bots` | story, 2 локальных игрока | то же + подъём напарника |
| `speedrun-boss-rush` | спидран | сплиты (в тиках), IGT, код результата |
| `race-b1` | гонка: организатор + 2 игрока + обсервер (мост-заглушка, `tools/lib-bridge.js`) + восстановление игрока по журналу | события, сплиты, итог, архив-запись; хэш состояния игрока после восстановления |

Формат `tests/golden/<имя>.json`: `{ version, seed, mode, data, journal (RLE), expect: { outcome, frame, hp, beads, hashes: [[тик, хэш]…], final } }`. Прогон: `npm run replay -- tests/golden/<имя>.json` (v1.8: `tools/golden-v18.js` на старом `index.html`, v2: ядро в Node).

**Риск:** если в записи участвуют места, где v1.8 сам недетерминирован (например, реальное время в `slowT` у гостя, `Math.random` в игровой логике), запись отбракую и опишу причину, а не подгоню.

## 5. Порядок этапов и приёмка

| Этап | Результат | Проверка | Оценка |
|---|---|---|---|
| 0 | план (этот файл) → «да» → навыки Phaser в `.claude/skills/`, тег `v1.8-final`, золотые записи | `tools/golden-v18.js` проходит на `v1.8-final` | 1 PR в `main` + 1 PR в `v2` |
| 1 | каркас: Vite, TS strict, Phaser 4.2.1, Preact, ESLint, Vitest, Playwright Test, CI, пустая игра | CI зелёный, `index.html` в один файл | малый |
| 2 | ядро: 2.1 ГСЧ, ввод, физика; 2.2 бой; 2.3 боссы данными; 2.4 враги, кампания, спидран, журнал | после каждой части — Vitest + золотые записи этой части; `npm run sim` ≥ 100× | **самый крупный** |
| 3 | отрисовка Phaser 4 (view/), `?perf=1`, `docs/PERF.md` | скриншоты бок о бок, замеры ×1/×4/×6 | крупный |
| 4 | HTML-интерфейс на Preact | обход меню клавиатурой/геймпадом/касанием, скриншоты на 5 размерах | средний |
| 5 | сеть: общий надёжный слой для коопа и гонок, бинарная упаковка, TURN | тесты с задержкой/потерями + локальный PeerJS в CI | средний |
| 6 | уровни в LDtk | тайл-в-тайл совпадение | малый |
| 7 | бот, фаззер, `.ttrec`, Optuna, (RL) | отчёты в `ml/reports/` | средний, последний |
| 8 | приёмка и релиз 2.0 | все золотые записи, фаззер 1 ч, CI, PERF, сохранения v1.8 открываются | малый |

После каждого этапа — короткий отчёт: что сделано, цифры, что проверить руками (ПК, телефон, геймпад).

## 6. Что нужно от вас сейчас
1. Согласие на разделы 0 и 5 (или правки).
2. «Да» на расширение журнала в `main` отдельным PR (раздел 4, п. 1–2).
3. Подтвердите: навыки Phaser копирую из `phaserjs/phaser/skills/` (29 штук; обязательные — `v3-to-v4-migration`, `v4-new-features`, `filters-and-postfx`, `game-setup-and-config`; добавлю `scenes`, `cameras`, `tilemaps`, `particles`, `input-keyboard-mouse-touch`, `scale-and-responsive`, `loading-assets`, `audio-and-sound`, `time-and-timers`, `text-and-bitmaptext`, `render-textures`, `graphics-and-shapes`).
4. Что в v1.7 пропало на вашем устройстве (устройство, ориентация): исправлю в `main` отдельно, если это баг, а не «Поверните телефон».

## Состояние
| Этап | Статус |
|---|---|
| 0. Подготовка | сделано: план, навыки Phaser в `.claude/skills/`, тег `v1.8-final` (1.8.2), 15 золотых записей в `tests/golden` (14 + гонка `race-b1`), журнал расширен (версия 1.8.2) |
| 1. Каркас v2 | сделано: Vite 8, TypeScript 6.0.3 strict (7.0 пока не поддержан typescript-eslint), Phaser 4.2.1, Preact 11, ESLint 10 с запретами для `src/core`, Vitest 5, Playwright Test, GitHub Actions; пустая игра: сцены, масштаб, ввод (клавиатура, геймпад, касание), сборка в один `index.html` (1,4 МБ) |
| 2. Ядро | сделано: `src/core` (мир, физика, герои, оружие, инструменты, обереги, статусы, враги, четыре босса, кампания, лавка, карта, спидран-цепочка, журнал, статистика забега) без Phaser; **49 золотых записей совпадают побитно**, покрытие ядра золотыми записями ≈ 90 % строк; `npm run sim` — 3000–5000× реального времени. Боевые числа боссов вынесены в `data/balance.json` на этапе 7 |
| 3. Отрисовка | сделано (PR #15): Phaser 4, холст в родном разрешении (до ×2 на ретине), герои, враги, боссы, снаряды, HUD, звук и музыка, качество «Авто/Низкое/Среднее/Высокое» (цветокоррекция по главам, виньетка, свечение), замеры в `docs/PERF.md` (на слабом устройстве v2 быстрее v1.8, кроме 3-й фазы Миши) |
| 4. Интерфейс | сделано на Preact (PR этапа 4): главное меню и все экраны v1.8 (хлебные крошки, «← Назад», цифры, Esc/B, геймпад, касание), «Как играть», «Что нового», настройки (5 разделов, переназначение клавиш, качество графики), пауза, меню скамьи, лавка, карта, снаряжение, победа, тренировка, спидран (таймер, итог, таблица друзей), сенсорные кнопки, «Поверните телефон» = пауза, плашка обновления, подсказка для iPhone; тесты клавиатуры, геймпада, касания и вёрстки на 5 размерах |
| 6. Уровни в LDtk | сделано: главы I–IV и три арены (7 уровней, 17 256 тайлов, 122 сущности) лежат в `levels/tropa.ldtk` (LDtk 1.5.3); загрузчик `src/core/ldtk.ts` (чистая функция, ошибки по-русски), генератор `tools/ldtk-export.ts`, кодовые построители ушли в оракул `tests/oracle/levels-code.ts`; тест сравнивает уровни тайл-в-тайл и по всем сущностям и с оракулом, и с настоящим кодом v1.8 (`legacy/`, через vm); золотые записи не изменились. `npm run levels:check`; см. `levels/README.md` |
| 7. ИИ-инструменты | сделано (без RL-эксперимента): бот на ядре v2 (`tools/bot`, мозг из botbrain.js перенесён без изменений поведения: на зерне золотой записи v1.8 даёт тот же ввод тик в тик), пул worker_threads (ядра − 2), `npm run bot -- table` с интервалами Уилсона и бутстрэпом, `watch`; фаззер `npm run fuzz` (17 режимов, инварианты, сверка журнала, минимизатор, `tests/repro`); записи `.ttrec` (`docs/TTREC.md`, «Записывать мои бои», `?rec=1`, `?watch=`, `npm run replay`); баланс вынесен в `data/balance.json` со схемой; Optuna (`ml/`). Фаззер нашёл три ошибки журнала сессии (исправлены) и две особенности v1.8 в коопе (записаны как known) |
| 5. Сеть и гонки | сделано (PR #18, #19): кооператив и гонка 1×1 на PeerJS, «Гонки Ткачей» (организатор, игрок, обсервер, архив), общий журнал ввода и восстановление забега; TURN не используется (решение: только PeerJS) |
| 8. Приёмка | сделано (PR #20 и релизный): регрессии аудита v1.5, сохранения v1.8 открываются, контуры вместо вспышек, вибрация, `?dev=1`, workflow публикации в `gh-pages`, README под v2, версия 2.0.0 |
| Б. Гонки после 2.0 | 2.1 рейтинг Эло, повторы и трансляция (PR #25); **2.2 «Тропа целиком»** — подсплиты, лента кампании, таблица сплитов, полоска соперника и призрак (PR #27); **2.3 «Босс-раш»** — дисциплина организатора, таблица «босс × игрок», подсплиты по фазам; 2.4 «Дуэль ткачей» — впереди. Подробности: `docs/NEXT_VERSIONS.md` |
