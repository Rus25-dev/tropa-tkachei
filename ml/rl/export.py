"""Экспорт обученных политик в компактный JSON для игры (инференс на TypeScript, src/agent/).

python export.py --name tkachi --out ../../public/agents/tkachi.json misha=misha-avg-1 vladik=vladik-avg-1 ...
Каждый аргумент вида босс=прогон[:чекпоинт] (чекпоинт по умолчанию last). Веса округляются до --digits значащих цифр (по умолчанию 4).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
PERSONAS = json.loads((HERE / "personas.json").read_text(encoding="utf8"))


DIGITS = 4


def arr(t) -> list:
    a = t.detach().cpu().numpy().astype(np.float64)
    return [float(f"{v:.{DIGITS}g}") for v in a.reshape(-1)]


def export_model(run: Path, which: str) -> dict:
    s = torch.load(run / "ckpt" / f"{which}.pt", weights_only=False, map_location="cpu")
    cfg, sd, nm = s["config"], s["model"], s["norm"]
    layers = []
    i = 0
    while f"body.{i}.weight" in sd:
        w = sd[f"body.{i}.weight"]
        layers.append({"in": w.shape[1], "out": w.shape[0], "w": arr(w), "b": arr(sd[f"body.{i}.bias"])})
        i += 1
    pi = sd["pi.weight"]
    std = np.sqrt(np.asarray(nm["var"]) + 1e-6)
    return {"boss": cfg["boss"], "obsDim": cfg["obs_dim"], "heads": cfg["heads"], "lag": cfg["lag_resolved"], "skip": 4,
            "mean": [float(f"{v:.6g}") for v in nm["mean"]], "std": [float(f"{v:.6g}") for v in std], "layers": layers,
            "pi": {"in": pi.shape[1], "out": pi.shape[0], "w": arr(pi), "b": arr(sd["pi.bias"])},
            "trained": {"run": run.name, "ckpt": which, "steps": s["steps"], "update": s["update"], "persona": cfg.get("persona")}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--digits", type=int, default=4, help="значащих цифр в весах")
    ap.add_argument("--runs", default=str(HERE / "runs"))
    ap.add_argument("models", nargs="+", help="босс=прогон[:чекпоинт]")
    a = ap.parse_args()
    global DIGITS
    DIGITS = a.digits
    pack = {"format": "tt-agent", "v": 1, "name": a.name, "personas": PERSONAS, "models": {}}
    for m in a.models:
        boss, rest = m.split("=")
        run, _, ck = rest.partition(":")
        pack["models"][boss] = export_model(Path(a.runs) / run, ck or "last")
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(f"{out}: {out.stat().st_size / 1024:.0f} КБ, боссы: {', '.join(pack['models'])}")


if __name__ == "__main__":
    main()
