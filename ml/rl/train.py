"""PPO для боёв «Тропы Ткачей»: python train.py --name misha-avg --boss misha --persona average --envs 128 --workers 12

Симуляция идёт на процессоре (Node, worker_threads), сеть и обновления — на видеокарте. Каждые --eval-every секунд делается
показательный бой текущей политикой с записью .ttrec (его показывает панель, см. panel.py), считается оценка на фиксированных зёрнах.
"""
from __future__ import annotations

import argparse
import collections
import json
import subprocess
import threading
import time
from pathlib import Path

import numpy as np
import torch

from envclient import EnvServer
from model import HEADS, ActorCritic, RunningNorm

HERE = Path(__file__).resolve().parent
PERSONAS = json.loads((HERE / "personas.json").read_text(encoding="utf8"))
# зёрна оценки: те же, что у таблицы бота (skill 0.6, seed 1): seed + r*13 + round(skill*100)
EVAL_SEEDS = [1 + r * 13 + 60 for r in range(15)]


class GpuPoll(threading.Thread):
    """Загрузка и память видеокарты через nvidia-smi (раз в 5 с)."""

    def __init__(self):
        super().__init__(daemon=True)
        self.util, self.mem = 0.0, 0.0

    def run(self):
        while True:
            try:
                o = subprocess.run(["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"],
                                   capture_output=True, text=True, timeout=5).stdout.split(",")
                self.util, self.mem = float(o[0]), float(o[1])
            except Exception:
                pass
            time.sleep(5)


class RewardScaler:
    """Делит награду на стандартное отклонение дисконтированной суммы (как VecNormalize)."""

    def __init__(self, n: int, gamma: float):
        self.ret = np.zeros(n)
        self.norm = RunningNorm(1)
        self.gamma = gamma

    def __call__(self, r: np.ndarray, done: np.ndarray) -> np.ndarray:
        self.ret = self.ret * self.gamma + r
        self.norm.update(self.ret[:, None])
        self.ret[done] = 0
        return np.clip(r / float(self.norm.std()[0]), -10, 10)


def score_fight(won: bool, boss_frac: float, sec: float) -> float:
    return (10 if won else 0) + (1 - boss_frac) * 5 - sec * 0.01


def run_eval(srv: EnvServer, model: ActorCritic, norm: RunningNorm, dev, temp: float, seeds: list):
    """Один круг: srv.n боёв на заданных зёрнах, политика сэмплирует с температурой temp."""
    obs = srv.reset(seeds)
    alive = np.ones(srv.n, bool)
    res = {}
    mean = torch.tensor(norm.mean, dtype=torch.float32, device=dev)
    std = torch.tensor(norm.std(), dtype=torch.float32, device=dev)
    for _ in range(5000):
        with torch.no_grad():
            x = ((torch.from_numpy(np.array(obs)).to(dev) - mean) / std).clamp(-10, 10)
            a, _, _ = model.act(x, temp)
        obs, rew, done, info = srv.step(a.cpu().numpy().astype(np.uint8))
        for i in np.nonzero((done > 0) & alive)[0]:
            alive[i] = False
            res[int(i)] = info[i].copy()
        if not alive.any():
            break
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="misha-avg")
    ap.add_argument("--boss", default="misha")
    ap.add_argument("--persona", default="average", choices=list(PERSONAS))
    ap.add_argument("--envs", type=int, default=128)
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--rollout", type=int, default=128)
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--minibatches", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--gamma", type=float, default=0.995)
    ap.add_argument("--lam", type=float, default=0.95)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--ent", type=float, default=0.01)
    ap.add_argument("--vf", type=float, default=0.5)
    ap.add_argument("--hidden", type=int, default=256)
    ap.add_argument("--max-sec", type=float, default=150)
    ap.add_argument("--steps", type=float, default=0, help="остановиться после стольких шагов среды (0 — без предела)")
    ap.add_argument("--minutes", type=float, default=0, help="остановиться через столько минут (0 — без предела)")
    ap.add_argument("--stop-win", type=float, default=0, help="остановиться, когда доля побед за 300 боёв достигнет значения")
    ap.add_argument("--ckpt-every", type=int, default=25)
    ap.add_argument("--eval-every", type=float, default=60, help="секунд между показательными боями")
    ap.add_argument("--reward", default="{}", help="JSON с переопределением наград (поверх персонажа)")
    ap.add_argument("--lag", type=int, default=-1, help="задержка восприятия в решениях (по умолчанию из персонажа)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--runs", default=str(HERE / "runs"))
    args = ap.parse_args()

    persona = PERSONAS[args.persona]
    reward = {**persona["reward"], **json.loads(args.reward)}
    lag = persona["lag"] if args.lag < 0 else args.lag
    run = Path(args.runs) / args.name
    (run / "ckpt").mkdir(parents=True, exist_ok=True)
    (run / "demos").mkdir(exist_ok=True)
    assert torch.cuda.is_available(), "CUDA недоступна: установите torch со сборкой cu128 (см. ml/README.md)"
    dev = torch.device("cuda")
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    srv = EnvServer(args.boss, args.envs, args.workers, seed=args.seed * 7919, max_sec=args.max_sec, lag=lag, reward=reward, autoreset=True, quiet=False)
    N, D = srv.n, srv.obs_dim
    model = ActorCritic(D, args.hidden).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr, eps=1e-5)
    norm = RunningNorm(D)
    scaler = RewardScaler(N, args.gamma)
    update, steps, t_start, best_win = 0, 0, time.time(), -1.0
    cfg = dict(vars(args), reward_resolved=reward, lag_resolved=lag, temperature=persona["temperature"], obs_dim=D, heads=HEADS,
               started=time.strftime("%Y-%m-%d %H:%M:%S"), gpu=torch.cuda.get_device_name(0), torch=torch.__version__)
    ck = run / "ckpt" / "last.pt"
    if args.resume and ck.exists():
        s = torch.load(ck, weights_only=False)
        model.load_state_dict(s["model"]); opt.load_state_dict(s["opt"]); norm.load(s["norm"])
        update, steps, best_win = s["update"], s["steps"], s.get("best_win", -1.0)
        print(f"возобновление с обновления {update}, шагов {steps}")
    (run / "config.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf8")

    gpu = GpuPoll()
    gpu.start()
    metrics = open(run / "metrics.jsonl", "a", encoding="utf8", buffering=1)
    evalf = open(run / "eval.jsonl", "a", encoding="utf8", buffering=1)
    T = args.rollout
    b_obs = torch.zeros(T, N, D, device=dev)
    b_act = torch.zeros(T, N, len(HEADS), dtype=torch.long, device=dev)
    b_lp = torch.zeros(T, N, device=dev)
    b_val = torch.zeros(T + 1, N, device=dev)
    b_rew = torch.zeros(T, N, device=dev)
    b_done = torch.zeros(T, N, device=dev)
    obs = np.array(srv.reset())
    eps = collections.deque(maxlen=300)
    total_eps = 0
    last_eval, eval_srv, eval_n = time.time() - args.eval_every + 20, None, 0
    best_score, demo_seed_base = -1e9, 900_000 + args.seed * 1000

    def save(path: Path):
        torch.save({"model": model.state_dict(), "opt": opt.state_dict(), "norm": norm.state(), "update": update, "steps": steps,
                    "best_win": best_win, "config": cfg}, path)

    while True:
        t0 = time.time()
        mean = torch.tensor(norm.mean, dtype=torch.float32, device=dev)
        std = torch.tensor(norm.std(), dtype=torch.float32, device=dev)
        raw_buf = np.empty((T, N, D), np.float32)
        for t in range(T):
            raw_buf[t] = obs
            x = ((torch.from_numpy(obs).to(dev) - mean) / std).clamp(-10, 10)
            with torch.inference_mode():
                a, lp, v = model.act(x)
            b_obs[t] = x; b_act[t] = a; b_lp[t] = lp; b_val[t] = v
            obs, rew, done, info = srv.step(a.to(torch.uint8).cpu().numpy())
            obs = np.array(obs)
            d = done > 0
            rd = np.stack([scaler(rew.astype(np.float64), d).astype(np.float32), d.astype(np.float32)])
            rd_t = torch.from_numpy(rd).to(dev)
            b_rew[t] = rd_t[0]; b_done[t] = rd_t[1]
            for i in np.nonzero(d)[0]:
                eps.append(info[i].copy()); total_eps += 1
        steps += T * N
        with torch.no_grad():
            x = ((torch.from_numpy(obs).to(dev) - mean) / std).clamp(-10, 10)
            b_val[T] = model(x)[1]
        t_sim = time.time() - t0
        norm.update(raw_buf.reshape(-1, D))
        # GAE
        adv = torch.zeros(T, N, device=dev)
        last = torch.zeros(N, device=dev)
        for t in reversed(range(T)):
            nd = 1.0 - b_done[t]
            delta = b_rew[t] + args.gamma * b_val[t + 1] * nd - b_val[t]
            last = delta + args.gamma * args.lam * nd * last
            adv[t] = last
        ret = adv + b_val[:T]
        f_obs, f_act, f_lp = b_obs.reshape(-1, D), b_act.reshape(-1, len(HEADS)), b_lp.reshape(-1)
        f_adv, f_ret = adv.reshape(-1), ret.reshape(-1)
        B = f_obs.shape[0]
        mb = B // args.minibatches
        stats = collections.defaultdict(float)
        k = 0
        for _ in range(args.epochs):
            perm = torch.randperm(B, device=dev)
            for j in range(args.minibatches):
                ix = perm[j * mb:(j + 1) * mb]
                lp, ent, v = model.evaluate(f_obs[ix], f_act[ix])
                a_ = f_adv[ix]
                a_ = (a_ - a_.mean()) / (a_.std() + 1e-8)
                ratio = (lp - f_lp[ix]).exp()
                pl = -torch.min(ratio * a_, ratio.clamp(1 - args.clip, 1 + args.clip) * a_).mean()
                vl = 0.5 * ((v - f_ret[ix]) ** 2).mean()
                loss = pl + args.vf * vl - args.ent * ent.mean()
                opt.zero_grad(set_to_none=True)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 0.5)
                opt.step()
                with torch.no_grad():
                    stats["pi_loss"] += pl.item(); stats["v_loss"] += vl.item(); stats["entropy"] += ent.mean().item()
                    stats["kl"] += ((ratio - 1) - ratio.log()).mean().item()
                    stats["clipfrac"] += ((ratio - 1).abs() > args.clip).float().mean().item()
                    k += 1
        update += 1
        dt = time.time() - t0
        e = list(eps)

        def avg(i):
            return float(np.mean([x[i] for x in e])) if e else None

        m = {"t": time.time(), "update": update, "steps": steps, "sps": round(T * N / dt), "sim_frac": round(t_sim / dt, 2), "episodes": total_eps,
             "ep_ret": avg(0), "win": avg(2), "ep_sec": avg(5), "boss_frac": avg(3), "hp_lost": avg(4), "parries": avg(6), "bombs": avg(9),
             **{kk: v_ / k for kk, v_ in stats.items()}, "gpu_util": gpu.util, "gpu_mem_mb": gpu.mem,
             "torch_mem_mb": round(torch.cuda.memory_allocated() / 2 ** 20), "elapsed": round(time.time() - t_start)}
        metrics.write(json.dumps(m) + "\n")
        if update % 5 == 0:
            r = lambda x, n=2: None if x is None else round(x, n)  # noqa: E731
            print(f"u{update} шагов {steps/1e6:.2f}M sps {m['sps']} побед {r(m['win'])} награда {r(m['ep_ret'])} сек {r(m['ep_sec'], 1)} "
                  f"босс {r(m['boss_frac'])} энтропия {m['entropy']:.2f} gpu {gpu.util:.0f}%", flush=True)
        win_now = m["win"] if (m["win"] is not None and len(e) >= 100) else -1
        if update % args.ckpt_every == 0:
            save(ck)
            if win_now > best_win:
                best_win = win_now
                save(run / "ckpt" / "best.pt")
        # показательный бой и оценка
        demo_req = (run / "demo_now").exists()
        if time.time() - last_eval >= args.eval_every or demo_req:
            if demo_req:
                (run / "demo_now").unlink(missing_ok=True)
            if eval_srv is None:
                eval_srv = EnvServer(args.boss, 16, 4, seed=args.seed, max_sec=args.max_sec, lag=persona.get("playLag", lag), reward=reward, record=True,
                                     autoreset=False, label=args.name)
            model.eval()
            te = time.time()
            seeds = [demo_seed_base + eval_n] + EVAL_SEEDS[: eval_srv.n - 1]
            res = run_eval(eval_srv, model, norm, dev, persona["temperature"], seeds)
            model.train()
            scores = {i: score_fight(bool(r_[2]), float(r_[3]), float(r_[5])) for i, r_ in res.items()}
            bi = max(scores, key=scores.get) if scores else 0
            for idx, nm in ((0, "latest"), (bi, "round_best")):
                rec = eval_srv.get_rec(idx)
                if rec:
                    rec["meta"]["label"] = f"{args.name} · обновление {update} · {'демо-бой' if idx == 0 else 'лучший из круга'} · зерно {seeds[idx]} · {rec['meta'].get('label', '')}"
                    txt = json.dumps(rec, ensure_ascii=False)
                    (run / "demos" / f"{nm}.ttrec").write_text(txt, encoding="utf8")
                    if idx == 0:
                        (run / "demos" / f"u{update:06d}.ttrec").write_text(txt, encoding="utf8")
                    if nm == "round_best" and scores[bi] > best_score:
                        best_score = scores[bi]
                        (run / "demos" / "best.ttrec").write_text(txt, encoding="utf8")
            fights = [res[i] for i in range(1, eval_srv.n) if i in res]
            ev = {"t": time.time(), "update": update, "steps": steps, "kind": "eval", "n": len(fights), "wins": int(sum(f[2] for f in fights)),
                  "win_rate": float(np.mean([f[2] for f in fights])) if fights else None, "mean_sec": float(np.mean([f[5] for f in fights])) if fights else None,
                  "boss_frac": float(np.mean([f[3] for f in fights])) if fights else None, "hp_lost": float(np.mean([f[4] for f in fights])) if fights else None,
                  "demo": {"won": bool(res[0][2]) if 0 in res else None, "sec": float(res[0][5]) if 0 in res else None,
                           "boss_frac": float(res[0][3]) if 0 in res else None, "seed": seeds[0], "file": "demos/latest.ttrec"},
                  "eval_seconds": round(time.time() - te, 1)}
            evalf.write(json.dumps(ev) + "\n")
            eval_n += 1
            last_eval = time.time()
            d0 = ev["demo"]
            print(f"  оценка u{update}: побед {ev['wins']}/{ev['n']}, демо {'победа' if d0['won'] else 'поражение'} {d0['sec'] or 0:.0f} с", flush=True)
        stop = (args.steps and steps >= args.steps) or (args.minutes and time.time() - t_start >= args.minutes * 60) or (args.stop_win and win_now >= args.stop_win)
        if stop or (run / "stop").exists():
            break
    save(ck)
    if args.stop_win and win_now >= args.stop_win:
        save(run / "ckpt" / "target.pt")
    print("обучение завершено:", update, "обновлений,", steps, "шагов")
    srv.close()
    if eval_srv:
        eval_srv.close()


if __name__ == "__main__":
    main()
