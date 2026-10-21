#!/usr/bin/env python
"""Подбор баланса боссов через Optuna и ИИ-бота (этап 7).

    python ml/tune.py --boss korne --target "skill0.6:winrate=0.55..0.65,time=80..120" --trials 50

Что делает: Optuna предлагает множители баланса (здоровье босса, темп, стойкость и т. п.), для каждого набора запускается
`tools/bot/cli.ts table --json --balance <временный файл>` (бот на ядре, пул воркеров), по таблице считается, насколько доля побед
и время боя выходят за целевые границы. Лучшие значения и графики пишутся в ml/reports/<босс>-<время>/.

Важно: скрипт ничего не пишет в игру. data/balance.json меняется ТОЛЬКО вручную после одобрения: возьмите `best_balance.json`
из отчёта и перенесите значения в data/balance.json (форма та же). Копия баланса, которую видит бот, — временный файл-переопределение
(`--balance`), только для Node-инструментов.

Цель задаётся как «<уровень бота>:<метрика>=<от>..<до>[,<метрика>=<от>..<до>]», несколько целей — через «;»:
    skill0.6:winrate=0.55..0.65,time=80..120;skill0.95:winrate=0.85..1
Метрики: winrate (доля побед, 0..1), time (среднее время победного боя, с), wipes (доля обрывов нити, 0..1), dmg (средний урон за бой).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BALANCE = ROOT / "data" / "balance.json"
TSX = ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"
BOT = ROOT / "tools" / "bot" / "cli.ts"
LDTK = ROOT / "tools" / "ldtk-register.mjs"

METRICS = {"winrate": "winRate", "time": "winTime", "wipes": "wipeRate", "dmg": "dmg"}


# ----- цели -----
@dataclass
class Goal:
    skill: float
    metric: str
    lo: float
    hi: float


def parse_target(text: str) -> list[Goal]:
    """'skill0.6:winrate=0.55..0.65,time=80..120;skill0.95:winrate=0.85..1' -> список целей."""
    goals: list[Goal] = []
    for part in filter(None, (p.strip() for p in text.split(";"))):
        m = re.fullmatch(r"skill\s*([0-9.]+)\s*:(.+)", part)
        if not m:
            raise ValueError(f"цель «{part}»: ожидалось skill<число>:метрика=от..до")
        skill = float(m.group(1))
        if not 0 <= skill <= 1:
            raise ValueError(f"мастерство {skill} вне 0..1")
        for item in m.group(2).split(","):
            g = re.fullmatch(r"\s*(\w+)\s*=\s*(-?[0-9.]+)\s*\.\.\s*(-?[0-9.]+)\s*", item)
            if not g or g.group(1) not in METRICS:
                raise ValueError(f"метрика «{item.strip()}»: нужна одна из {', '.join(METRICS)} и вид имя=от..до")
            lo, hi = float(g.group(2)), float(g.group(3))
            if lo > hi:
                raise ValueError(f"{g.group(1)}: нижняя граница больше верхней")
            goals.append(Goal(skill, g.group(1), lo, hi))
    if not goals:
        raise ValueError("пустая цель")
    return goals


def miss(value: float, lo: float, hi: float) -> float:
    """Насколько значение вне [lo, hi], в долях ширины полосы (0 — внутри)."""
    if math.isnan(value):
        return 1.0
    width = max(hi - lo, 1e-9, abs(hi) * 0.1)
    return max(0.0, (lo - value) / width, (value - hi) / width)


# ----- пространство поиска -----
def load_base() -> dict:
    return json.loads(BALANCE.read_text(encoding="utf-8"))


def space_for(boss: str) -> dict[str, tuple[float, float]]:
    """Множители к исходным значениям: границы по умолчанию. Свои — через --space файл.json."""
    sp = {
        "hp": (0.5, 1.8),      # здоровье босса (обе записи: один игрок и вдвоём)
        "pace": (0.5, 1.8),    # темп боя босса: меньше — реже атакует
        "stagger_t": (0.7, 2.0),  # сколько босс стоит оглушённым
        "exec_frac": (0.5, 2.0),  # доля здоровья, которую снимает казнь
    }
    return sp


BOSS_KEY = {"korne": "boss", "vladik": "vladik", "tima": "tima", "misha": "misha"}


def to_override(base: dict, boss: str, p: dict[str, float]) -> dict:
    """Множители -> частичный баланс в форме data/balance.json (его принимает бот через --balance)."""
    key = BOSS_KEY[boss]
    o: dict = {"BAL": {"hp": {}, "pace": {}}}
    if "hp" in p:
        o["BAL"]["hp"][key] = [max(1, round(v * p["hp"])) for v in base["BAL"]["hp"][key]]
    if "pace" in p:
        o["BAL"]["pace"][key] = round(base["BAL"]["pace"][key] * p["pace"], 4)
    if "stagger_t" in p:
        o["STAGGER_T"] = round(base["STAGGER_T"] * p["stagger_t"], 4)
    if "exec_frac" in p:
        o["EXEC_FRAC"] = round(base["EXEC_FRAC"] * p["exec_frac"], 4)
    if not o["BAL"]["hp"]:
        del o["BAL"]["hp"]
    if not o["BAL"]["pace"]:
        del o["BAL"]["pace"]
    if not o["BAL"]:
        del o["BAL"]
    return o


# ----- запуск бота -----
def find_node() -> str:
    """node из PATH, переменной NODE или обычного места установки на Windows."""
    win = "C:/Program Files/nodejs/node.exe"
    for cand in (os.environ.get("NODE"), shutil.which("node"), win, "/usr/local/bin/node", "/opt/homebrew/bin/node"):
        if cand and (shutil.which(cand) or os.path.exists(cand)):
            return cand
    raise RuntimeError("не найден node: установите Node 22+ или задайте переменную NODE с путём к node")


def run_table(boss: str, skills: list[float], fights: int, override: dict, workers: int | None, seed: int, max_sec: int) -> dict:
    """npm run bot -- table --json c переопределением баланса; возвращает разобранный JSON."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(override, f)
        path = f.name
    try:
        cmd = [find_node(), str(TSX), "--import", LDTK.as_uri(), str(BOT), "table", "--json", "--boss", boss,
               "--skill", ",".join(str(s) for s in skills), "--fights", str(fights), "--seed", str(seed), "--max", str(max_sec), "--balance", path]
        if workers is not None:
            cmd += ["--workers", str(workers)]
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
        if r.returncode != 0:
            raise RuntimeError(f"бот завершился с кодом {r.returncode}:\n{r.stderr[-800:]}")
        return json.loads(r.stdout.strip().splitlines()[-1])
    finally:
        os.unlink(path)


def evaluate(table: dict, goals: list[Goal]) -> tuple[float, dict[str, float]]:
    """Штраф по целям (0 — все метрики внутри полос) и измеренные значения для отчёта."""
    cells = {round(c["skill"], 4): c for c in table["cells"]}
    loss, got = 0.0, {}
    for g in goals:
        c = cells[round(g.skill, 4)]
        v = c["winTime"]["mean"] if g.metric == "time" else c[METRICS[g.metric]]
        v = float("nan") if v is None else float(v)
        got[f"skill{g.skill}:{g.metric}"] = v
        loss += miss(v, g.lo, g.hi)
    return loss, got


# ----- отчёт -----
def write_report(out: Path, args: argparse.Namespace, goals: list[Goal], base: dict, trials: list[dict], best: dict, verify: dict | None) -> None:
    import matplotlib

    matplotlib.use("Agg")  # без окон: графики только в файлы
    import matplotlib.pyplot as plt

    out.mkdir(parents=True, exist_ok=True)
    keys = sorted({k for t in trials for k in t["got"]})
    with open(out / "trials.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        params = sorted(trials[0]["params"]) if trials else []
        w.writerow(["trial", "loss", *params, *keys])
        for t in trials:
            w.writerow([t["n"], f"{t['loss']:.4f}", *[t["params"].get(p, "") for p in params], *[f"{t['got'].get(k, float('nan')):.4f}" for k in keys]])

    # график 1: ход оптимизации
    fig, ax = plt.subplots(figsize=(7, 4))
    xs = [t["n"] for t in trials]
    ax.plot(xs, [t["loss"] for t in trials], ".", alpha=0.5, label="штраф пробы")
    ax.plot(xs, [min(t["loss"] for t in trials[: i + 1]) for i in range(len(trials))], "-", label="лучший")
    ax.set_xlabel("проба"); ax.set_ylabel("штраф (0 — цель достигнута)"); ax.set_title("Ход подбора"); ax.legend(); ax.grid(alpha=0.3)
    fig.tight_layout(); fig.savefig(out / "history.png", dpi=130); plt.close(fig)

    # график 2: метрики по пробам на фоне целевых полос
    fig, axes = plt.subplots(len(keys), 1, figsize=(7, 2.6 * max(1, len(keys))), squeeze=False)
    for ax, k in zip(axes[:, 0], keys):
        g = next(x for x in goals if f"skill{x.skill}:{x.metric}" == k)
        ax.axhspan(g.lo, g.hi, color="tab:green", alpha=0.2, label="цель")
        ax.plot(xs, [t["got"].get(k, float("nan")) for t in trials], ".", color="tab:blue")
        ax.set_ylabel(k); ax.grid(alpha=0.3); ax.legend(loc="best")
    axes[-1, 0].set_xlabel("проба")
    fig.tight_layout(); fig.savefig(out / "metrics.png", dpi=130); plt.close(fig)

    # график 3: параметры против штрафа
    names = sorted(trials[0]["params"]) if trials else []
    if names:
        fig, axes = plt.subplots(1, len(names), figsize=(3.2 * len(names), 3.2), squeeze=False)
        for ax, p in zip(axes[0], names):
            ax.scatter([t["params"][p] for t in trials], [t["loss"] for t in trials], s=12, alpha=0.6)
            ax.set_xlabel(p + " (множитель)"); ax.grid(alpha=0.3)
        axes[0, 0].set_ylabel("штраф")
        fig.tight_layout(); fig.savefig(out / "params.png", dpi=130); plt.close(fig)

    override = to_override(base, args.boss, best["params"])
    (out / "best_balance.json").write_text(json.dumps(override, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [f"# Подбор баланса: {args.boss}", "", f"- Дата: {dt.datetime.now().isoformat(timespec='seconds')}", f"- Проб: {len(trials)}, боёв на ячейку: {args.fights}, зерно: {args.seed}",
             "- Цель: " + "; ".join(f"skill{g.skill}: {g.metric} {g.lo}..{g.hi}" for g in goals), "",
             "## Лучший набор", "", f"Штраф: {best['loss']:.4f} (метрики внутри целевых полос дают 0; небольшой остаток — плата за размер правок).", "", "| параметр | множитель |", "|---|---|"]
    lines += [f"| {k} | {v:.3f} |" for k, v in sorted(best["params"].items())]
    lines += ["", "Переопределение баланса (`best_balance.json`, форма как у data/balance.json):", "", "```json", json.dumps(override, ensure_ascii=False, indent=2), "```", "",
              "## Что получилось на лучшем наборе", "", "| метрика | значение | цель |", "|---|---|---|"]
    for g in goals:
        k = f"skill{g.skill}:{g.metric}"
        lines.append(f"| {k} | {best['got'].get(k, float('nan')):.3f} | {g.lo}..{g.hi} |")
    if verify:
        lines += ["", f"## Проверка на других зёрнах ({args.verify} боёв на ячейку)", "", "| метрика | значение | цель |", "|---|---|---|"]
        for g in goals:
            k = f"skill{g.skill}:{g.metric}"
            lines.append(f"| {k} | {verify['got'].get(k, float('nan')):.3f} | {g.lo}..{g.hi} |")
    lines += ["", "![ход подбора](history.png)", "![метрики](metrics.png)", "![параметры](params.png)", "",
              "> Игра не менялась. Чтобы применить значения, перенесите их из best_balance.json в data/balance.json вручную после одобрения и прогоните `npx vitest run` (золотые записи v1.8 привязаны к текущему балансу и разойдутся — это ожидаемо, их надо перезаписать осознанно).", ""]
    (out / "report.md").write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Подбор баланса боссов: Optuna + ИИ-бот. Игру не меняет.")
    ap.add_argument("--boss", required=True, choices=sorted(BOSS_KEY))
    ap.add_argument("--target", required=True, help='например "skill0.6:winrate=0.55..0.65,time=80..120"')
    ap.add_argument("--trials", type=int, default=50)
    ap.add_argument("--fights", type=int, default=40, help="боёв на ячейку (босс × мастерство) в каждой пробе")
    ap.add_argument("--verify", type=int, default=120, help="боёв на ячейку для проверки лучшего набора на других зёрнах (0 — не проверять)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--workers", type=int, default=None, help="воркеров бота (по умолчанию ядра − 2)")
    ap.add_argument("--max", type=int, default=240, dest="max_sec", help="лимит боя, с")
    ap.add_argument("--space", type=Path, help='JSON с границами множителей, например {"hp":[0.6,1.5],"pace":[0.7,1.4]}; ключ можно убрать — параметр не меняется')
    ap.add_argument("--out", type=Path, default=ROOT / "ml" / "reports")
    ap.add_argument("--dry-run", action="store_true", help="только разобрать цель и показать пространство поиска")
    args = ap.parse_args(argv)

    goals = parse_target(args.target)
    space = space_for(args.boss)
    if args.space:
        space = {k: (float(v[0]), float(v[1])) for k, v in json.loads(args.space.read_text(encoding="utf-8")).items()}
    base = load_base()
    skills = sorted({g.skill for g in goals})
    print(f"Цель: {', '.join(f'skill{g.skill} {g.metric} {g.lo}..{g.hi}' for g in goals)}")
    print(f"Пространство: {', '.join(f'{k} {lo}..{hi}' for k, (lo, hi) in space.items())}")
    if args.dry_run:
        print("Пример переопределения при множителях 1.0:", json.dumps(to_override(base, args.boss, {k: 1.0 for k in space})))
        return 0

    import optuna

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    trials: list[dict] = []

    def objective(trial: "optuna.Trial") -> float:
        params = {k: trial.suggest_float(k, lo, hi, log=True) for k, (lo, hi) in space.items()}
        table = run_table(args.boss, skills, args.fights, to_override(base, args.boss, params), args.workers, args.seed, args.max_sec)
        loss, got = evaluate(table, goals)
        loss += 0.02 * sum(abs(math.log(v)) for v in params.values())  # при равных результатах — поменьше правок
        trials.append({"n": trial.number, "loss": loss, "params": params, "got": got})
        print(f"проба {trial.number:3d}: штраф {loss:.3f}  " + "  ".join(f"{k}={v:.2f}" for k, v in got.items()), flush=True)
        return loss

    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=args.seed))
    study.optimize(objective, n_trials=args.trials)
    best = min(trials, key=lambda t: t["loss"])

    verify = None
    if args.verify:
        table = run_table(args.boss, skills, args.verify, to_override(base, args.boss, best["params"]), args.workers, args.seed + 9973, args.max_sec)
        verify = {"got": evaluate(table, goals)[1]}
    out = args.out / f"{args.boss}-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}"
    write_report(out, args, goals, base, trials, best, verify)
    print(f"Готово. Отчёт: {out / 'report.md'}\nИгра не менялась: data/balance.json правится вручную после одобрения.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
