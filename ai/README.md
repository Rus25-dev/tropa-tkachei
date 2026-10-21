# ИИ в «Тропе Ткачей»: карта и быстрый старт

Здесь собрано всё про ИИ-игроков и инструменты на них. Код остаётся на своих местах (его пути прописаны в `package.json`, тестах и документации), эта папка — **оглавление, отчёты и промт для агента**.

Промт для нового агента: [`AGENT_PROMPT.md`](AGENT_PROMPT.md) — скопируйте его целиком в начало сессии.
Отчёты: [`reports/`](reports/) (копии ключевых отчётов, источники указаны в каждом файле).

## Что есть

| Что | Зачем | Где | Запуск |
|---|---|---|---|
| **Эвристический бот** | «средний игрок» для таблиц побед и проверки баланса боссов; мастерство 0…1 | `tools/bot/` | `npm run bot -- table --fights 200 --boss misha --skill 0.6` |
| **Фаззер** | случайный ввод во всех режимах, проверка инвариантов, находки — в `tests/repro/` | `tools/fuzz/` | `npm run fuzz -- --seconds 60` (или `--hours 1`) |
| **Запись и просмотр боёв `.ttrec`** | сохранить бой и посмотреть движком игры | `src/core/ttrec.ts`, `tools/replay.ts`, `docs/TTREC.md` | `npm run replay -- файл.ttrec`, `npm run bot -- watch файл.ttrec` |
| **Optuna** | подбор баланса боссов через бота (игру не меняет) | `ml/tune.py`, `ml/README.md` | `ml/.venv/Scripts/python ml/tune.py --boss korne --target "skill0.6:winrate=0.55..0.65,time=80..120" --trials 50` |
| **Нейросеть-игрок (RL)** | PPO на GPU, играет боссов на уровне «обычного игрока» | `tools/rl/` (среда), `ml/rl/` (обучение, панель), `src/agent/` (агент в игре) | см. ниже |
| **Гонка двух агентов** | съёмка трейлера: два агента в «Гонке Ткачей» | кнопка на панели RL, `tests/e2e/agents.spec.ts` | панель `http://localhost:8765` |

## Быстрый старт нейросети-игрока (Windows, RTX 50xx)

Нужны Node 22+ (`npm ci`) и Python 3.13. **Веса и окружение Python — только локально** (в git и на сайт не попадают).

```powershell
npm run build                                   # панель показывает настоящую игру из dist/
ml\.venv-rl\Scripts\python ml\rl\panel.py       # панель: http://localhost:8765
ml\.venv-rl\Scripts\python ml\rl\train.py --name misha-avg --boss misha --persona average --minutes 60   # обучение
ml\.venv-rl\Scripts\python ml\rl\evaluate.py --run misha-avg --ckpt best --fights 200                    # оценка против бота
ml\.venv-rl\Scripts\python ml\rl\export.py --name tkachi --out public\agents\tkachi.json misha=misha-avg vladik=vladik-avg tima=tima-avg korne=korne-avg
```

В игре: `?agent=tkachi&persona=average` (характеры: `average`, `careful`, `aggressive`, `novice`). Установка PyTorch с CUDA 12.8+ описана в `ml/README.md` (раздел «Нейросеть-игрок (RL)»).

## Где что лежит

**В репозитории**

| Путь | Содержимое |
|---|---|
| `tools/bot/` | мозг бота, пул воркеров, таблицы побед |
| `tools/fuzz/` | фаззер, инварианты, минимизация находок |
| `tools/rl/` | среда боёв для RL, сервер, оценка агента, PeerJS-сервер для гонок |
| `ml/tune.py`, `ml/README.md` | Optuna и полная инструкция по RL |
| `ml/rl/` | обучение (PPO), модель, экспорт, оценка, панель, `personas.json` |
| `ml/rl/runs/README.md` | **главный отчёт по обучению** (цифры, что пошло не так) |
| `ml/rl/runs/<имя>/` | `config.json`, `summary.json` каждого прогона |
| `src/agent/`, `src/app/agent.ts` | агент внутри игры (`?agent=`) |
| `tests/repro/` | находки фаззера (воспроизводятся тестом) |
| `ai/` | эта папка: оглавление, промт, отчёты |

**Только на компьютере** (рабочая копия `C:\tt-rl`)

| Путь | Содержимое |
|---|---|
| `public/agents/tkachi.json` | веса нейросети (5 МБ), в `.gitignore` |
| `ml/rl/runs/<имя>/ckpt/`, `demos/`, `metrics.jsonl`, `eval*.json` | чекпоинты, записи боёв `.ttrec`, метрики и оценки |
| `ml/.venv-rl/` | окружение Python с PyTorch CUDA (≈4,4 ГБ) |

Собрать локальное в одну папку (копирование, ничего не удаляет): `powershell -File ai\collect-local.ps1 -From C:\tt-rl -To D:\Tropa-AI`.

## Чего ИИ пока не умеет (честно)

- Нейросеть обучена **только боям с боссами**; пробегать «Тропу целиком» (платформинг, коридоры) она не умеет — вне арены стоит. Это отдельный этап.
- Уровень «обычного игрока» задаётся при игре (температура, задержка реакции, «липкость»), сеть сама играет сильнее человека; характеры careful/aggressive/novice на долю побед не калибровались.
- Корнематке для обучения понадобилась усиленная награда (см. отчёт).
- Скорость просмотра гонки двух агентов и выбор одного босса гоночный движок не поддерживает.
