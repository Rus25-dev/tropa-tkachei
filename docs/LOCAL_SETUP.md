# Локальная разработка v2 (Windows PowerShell)

Проект на ветке `v2`: **Phaser 4.2.1 + TypeScript (strict) + Vite + Preact**. Старая игра v1.8 лежит в `legacy/` со своими тестами и золотыми записями: пока она эталон поведения. Прежняя инструкция для v1.8 — `docs/LOCAL_SETUP_v1.8.md`.

## Установка (один раз)
1. Поставьте **Git**, **Node.js 22+** (проверено на 24), **Python 3.10+** (нужен только для старой игры: `legacy/build.py`) и **Google Chrome**.
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install Git.Git
   ```
2. Склонируйте и поставьте зависимости:
   ```powershell
   git clone https://github.com/Rus25-dev/tropa-tkachei.git
   cd tropa-tkachei
   git checkout v2
   npm install
   npm run legacy:install   # зависимости старой игры (Phaser 3.90, playwright-core, peer)
   ```
3. Скажите тестам, где Chrome (в каждой новой сессии PowerShell или один раз в профиле):
   ```powershell
   $env:CHROME = "C:\Program Files\Google\Chrome\Application\chrome.exe"
   ```
   Если Chrome не указан, `npm run test:e2e` использует браузер Playwright: `npx playwright install chromium`.
4. Если PowerShell ругается на профиль («выполнение сценариев отключено»), это не мешает работе; чтобы убрать сообщение: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Команды
| Команда | Что делает |
|---|---|
| `npm run dev` | сервер разработки http://localhost:5173 (горячая перезагрузка) |
| `npm run build` | сборка в один `dist/index.html` (его публикует GitHub Pages) |
| `npm run preview` | показать собранное на http://localhost:4173 |
| `npm run typecheck` | проверка типов (`tsc`, strict) |
| `npm run lint` | ESLint; в `src/core/**` запрещены `Math.random`, `Date`, `performance`, таймеры, DOM и Phaser |
| `npm test` | Vitest (ядро, ввод, раскладка) |
| `npm run test:e2e` | Playwright Test: экраны, ввод, масштаб на 5 размерах (поднимает `preview` сам, нужна сборка `npm run build`) |
| `npm run test:full` | линт + типы + Vitest + сборка + e2e + золотые записи v1.8 |
| `npm run legacy:golden` | золотые записи v1.8 (`tests/golden`) на старой игре |
| `npm run legacy:test` | полный набор тестов старой игры |
| `npm run sim`, `bot`, `fuzz`, `replay` | появятся на этапах 2 и 7 (`docs/V2_PLAN.md`) |

Два набора тестов одновременно не запускайте: нагрузка даёт ложные падения.

## Структура
```
src/core/    ядро: правила, физика, боссы, ГСЧ, шаг 1/60 (чистый TS, без Phaser и DOM)
src/view/    отрисовка на Phaser 4 (читает состояние ядра)
src/input/   клавиатура, геймпад, касание → InputFrame для ядра
src/ui/      HTML-интерфейс на Preact поверх холста
src/net/     сеть (PeerJS/WebRTC)
data/        параметры боссов, врагов, баланса (JSON)
levels/      уровни (LDtk)
tests/       unit (Vitest), e2e (Playwright), golden (золотые записи v1.8), repro
tools/       бот, фаззер, воспроизведение
legacy/      игра v1.8 (Phaser 3) с тестами; эталон до релиза v2.0
```

## Старая игра (legacy/)
```powershell
cd legacy
npm run build            # python3 build.py → legacy/index.html
npm test                 # быстрые тесты
npm run test:full        # полный набор
npm run golden           # золотые записи (из ../tests/golden)
npm run peer             # локальный PeerJS-сервер для реальной сети
npm run test:real        # реальный WebRTC на localhost (организатор, 2 игрока, обсервер)
```
`python3` на Windows: положите копию `python.exe` под именем `python3.exe` рядом с `python.exe`.

## MCP-серверы для Claude Code
В корне лежит `.mcp.json`: Context7 (документация библиотек), Playwright, Chrome DevTools. Проверка: `claude mcp list`.
Навыки Phaser 4 для агентов — в `.claude/skills/` (16 штук из `phaserjs/phaser/skills`).
