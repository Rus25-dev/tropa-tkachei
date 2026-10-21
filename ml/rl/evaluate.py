"""Оценка обученной политики против эвристического бота на тех же зёрнах, что у таблицы tools/bot.

python evaluate.py --run misha-avg-1 [--ckpt best] [--temp 1.0] [--stick 0.0] [--fights 200] [--workers 8]

Зёрна боя — как в tools/bot/table.ts: seed + r*13 + round(skill*100) для мастерства 0.3 / 0.6 / 0.95 (по умолчанию seed = 1).
Бот берётся из runs/baseline-<босс>.json (создаётся `npm run bot -- table --json`, см. --rebuild-baseline).
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path

import numpy as np
import torch

from envclient import ROOT, EnvServer, find_node
from model import ActorCritic, RunningNorm

HERE = Path(__file__).resolve().parent
SKILLS = [0.3, 0.6, 0.95]


def wilson(k: int, n: int, z: float = 1.96):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def boot(x, seed=7, B=2000):
    if len(x) == 0:
        return (float("nan"), float("nan"))
    r = np.random.default_rng(seed)
    m = [np.mean(r.choice(x, len(x))) for _ in range(B)]
    return (float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5)))


def load(run: Path, which: str, dev):
    s = torch.load(run / "ckpt" / f"{which}.pt", weights_only=False, map_location=dev)
    cfg = s["config"]
    m = ActorCritic(cfg["obs_dim"], cfg["hidden"]).to(dev)
    m.load_state_dict(s["model"])
    m.eval()
    n = RunningNorm(cfg["obs_dim"])
    n.load(s["norm"])
    return m, n, cfg


def play(srv: EnvServer, model, norm, dev, temp: float, seeds, stick: float = 0.0, rng=None, atkgap: int = 0):
    """Играет бои на заданных зёрнах (len(seeds) == srv.n). Возвращает массив сводок эпизодов [n, info_dim]."""
    rng = rng or np.random.default_rng(0)
    obs = srv.reset(seeds)
    alive = np.ones(srv.n, bool)
    out = np.zeros((srv.n, srv.info_dim), np.float32)
    mean = torch.tensor(norm.mean, dtype=torch.float32, device=dev)
    std = torch.tensor(norm.std(), dtype=torch.float32, device=dev)
    prev = None
    since = np.full(srv.n, 99)
    for _ in range(6000):
        with torch.inference_mode():
            x = ((torch.from_numpy(np.array(obs)).to(dev) - mean) / std).clamp(-10, 10)
            a = model.act(x, temp)[0].to(torch.uint8).cpu().numpy()
        if stick > 0 and prev is not None:
            keep = rng.random(srv.n) < stick
            a[keep] = prev[keep]
        if atkgap:  # минимальный промежуток между ударами, в решениях (медленный игрок)
            blocked = (a[:, 4] == 1) & (since < atkgap)
            a[blocked, 4] = 0
        since = np.where(a[:, 4] == 1, 0, since + 1)
        prev = a.copy()
        obs, rew, done, info = srv.step(a)
        for i in np.nonzero((done > 0) & alive)[0]:
            alive[i] = False
            out[i] = info[i]
        if not alive.any():
            break
    out[alive, 7] = 3  # не закончили: таймаут
    return out


def summarize(res: np.ndarray):
    n = len(res)
    wins = int(res[:, 2].sum())
    wt = res[res[:, 2] > 0, 5]
    lo, hi = wilson(wins, n)
    return {"n": n, "wins": wins, "win_rate": wins / n, "win_ci": [lo, hi], "win_time": float(wt.mean()) if len(wt) else None,
            "win_time_ci": list(boot(wt)) if len(wt) else None, "median_time": float(np.median(wt)) if len(wt) else None,
            "all_time": float(res[:, 5].mean()), "died": int((res[:, 7] == 2).sum()), "timeouts": int((res[:, 7] == 3).sum()),
            "hp_lost": float(res[:, 4].mean()), "boss_frac_lost": float(res[res[:, 2] == 0, 3].mean()) if (res[:, 2] == 0).any() else None,
            "parries": float(res[:, 6].mean())}


def baseline(boss: str, rebuild: bool, fights: int):
    p = HERE / "runs" / f"baseline-{boss}.json"
    if rebuild or not p.exists():
        out = subprocess.run([find_node(), str(ROOT / "node_modules/tsx/dist/cli.mjs"), "--import", "./tools/ldtk-register.mjs", "tools/bot/cli.ts", "table", "--json",
                              "--boss", boss, "--skill", ",".join(map(str, SKILLS)), "--fights", str(fights), "--workers", "4", "--seed", "1"],
                             cwd=ROOT, capture_output=True, text=True, encoding="utf8").stdout
        p.write_text(out, encoding="utf8")
    t = p.read_text(encoding="utf8")
    return json.loads(t[t.index('{"spec"'):])


def pct(x):
    return f"{100 * x:.0f}%"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--ckpt", default="last")
    ap.add_argument("--temp", type=float, default=None)
    ap.add_argument("--stick", type=float, default=0.0)
    ap.add_argument("--atkgap", type=int, default=0)
    ap.add_argument("--lag", type=int, default=-1)
    ap.add_argument("--skills", default="0.3,0.6,0.95")
    ap.add_argument("--fights", type=int, default=200)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--tag", default="")
    ap.add_argument("--rebuild-baseline", action="store_true")
    ap.add_argument("--runs", default=str(HERE / "runs"))
    a = ap.parse_args()
    run = Path(a.runs) / a.run
    dev = torch.device("cuda")
    model, norm, cfg = load(run, a.ckpt, dev)
    temp = cfg["temperature"] if a.temp is None else a.temp
    boss = cfg["boss"]
    batch = 50
    rows = {}
    srv = EnvServer(boss, batch, a.workers, max_sec=240, lag=cfg["lag_resolved"] if a.lag < 0 else a.lag, reward=cfg["reward_resolved"], autoreset=False)
    skills = [float(x) for x in a.skills.split(',')]
    for s in skills:
        seeds = [a.seed + r * 13 + round(s * 100) for r in range(a.fights)]
        res = np.concatenate([play(srv, model, norm, dev, temp, seeds[i:i + batch], a.stick, None, a.atkgap) for i in range(0, a.fights, batch)])
        rows[s] = summarize(res)
        print(f"  зёрна бота {s}: {rows[s]['wins']}/{rows[s]['n']}", flush=True)
    srv.close()
    base = baseline(boss, a.rebuild_baseline, a.fights)
    bc = {c["skill"]: c for c in base["cells"] if c["boss"] == boss}
    lines = [f"# Нейросеть `{a.run}` ({a.ckpt}, T={temp}, stick={a.stick}) против эвристического бота — {boss}, {a.fights} боёв на ячейку, те же зёрна\n",
             "| Зёрна как у бота | Игрок | Побед | Побед % [95% Уилсон] | Время победы, с [95% бутстрэп] | медиана, с | Урон герою | Обрывов нити | Таймаутов |", "|---|---|---|---|---|---|---|---|---|"]
    for s in skills:
        r, b = rows[s], bc.get(s)
        t = f"{r['win_time']:.0f} [{r['win_time_ci'][0]:.0f}–{r['win_time_ci'][1]:.0f}]" if r["win_time"] else "-"
        lines.append(f"| {s} | **нейросеть** | {r['wins']}/{r['n']} | {pct(r['win_rate'])} [{pct(r['win_ci'][0])}–{pct(r['win_ci'][1])}] | {t} | {r['median_time'] or 0:.0f} | {r['hp_lost']:.1f} | {r['died']} | {r['timeouts']} |")
        if b:
            lines.append(f"| {s} | бот (мастерство {s}) | {b['wins']}/{b['n']} | {pct(b['winRate'])} [{pct(b['winCI'][0])}–{pct(b['winCI'][1])}] | {b['winTime']['mean']:.0f} [{b['winTime']['ci'][0]:.0f}–{b['winTime']['ci'][1]:.0f}] | {b['winTime']['median']:.0f} | {b['dmg']:.1f} | {b['wipes']} | {b['timeouts']} |")
    md = "\n".join(lines)
    print(md)
    tag = a.tag or f"{a.ckpt}-T{temp}-s{a.stick}"
    (run / f"eval-{tag}.md").write_text(md, encoding="utf8")
    (run / f"eval-{tag}.json").write_text(json.dumps({"ckpt": a.ckpt, "temp": temp, "stick": a.stick, "cells": rows}, ensure_ascii=False, indent=1), encoding="utf8")
    r = rows[0.6 if 0.6 in rows else skills[0]]
    (run / "final.json").write_text(json.dumps({"name": a.run, "n": r["n"], "wins": r["wins"], "pct": pct(r["win_rate"]), "ci": f"{pct(r['win_ci'][0])}–{pct(r['win_ci'][1])}",
                                                "time": f"{r['win_time']:.0f}" if r["win_time"] else "-"}, ensure_ascii=False), encoding="utf8")


if __name__ == "__main__":
    main()
