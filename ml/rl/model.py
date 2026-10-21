"""Actor-Critic для боя: MLP с мультидискретными головами. Нормализация наблюдений — бегущие среднее и дисперсия."""
from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn

HEADS = [3, 3, 2, 2, 4]  # см. src/agent/actions.ts


class RunningNorm:
    def __init__(self, dim: int, clip: float = 10.0):
        self.mean = np.zeros(dim, np.float64)
        self.var = np.ones(dim, np.float64)
        self.count = 1e-4
        self.clip = clip

    def update(self, x: np.ndarray) -> None:
        bm, bv, bc = x.mean(0), x.var(0), x.shape[0]
        d = bm - self.mean
        tot = self.count + bc
        self.mean = self.mean + d * bc / tot
        self.var = (self.var * self.count + bv * bc + d * d * self.count * bc / tot) / tot
        self.count = tot

    def std(self) -> np.ndarray:
        return np.sqrt(self.var + 1e-6)

    def state(self) -> dict:
        return {"mean": self.mean, "var": self.var, "count": self.count}

    def load(self, s: dict) -> None:
        self.mean, self.var, self.count = s["mean"], s["var"], s["count"]


def ortho(m: nn.Linear, gain: float) -> nn.Linear:
    nn.init.orthogonal_(m.weight, gain)
    nn.init.zeros_(m.bias)
    return m


class ActorCritic(nn.Module):
    def __init__(self, obs_dim: int, hidden: int = 256, layers: int = 2):
        super().__init__()
        dims = [obs_dim] + [hidden] * layers
        self.body = nn.ModuleList([ortho(nn.Linear(dims[i], dims[i + 1]), 2 ** 0.5) for i in range(layers)])
        self.pi = ortho(nn.Linear(hidden, sum(HEADS)), 0.01)
        self.v = ortho(nn.Linear(hidden, 1), 1.0)

    def trunk(self, x: torch.Tensor) -> torch.Tensor:
        for l in self.body:
            x = torch.tanh(l(x))
        return x

    def forward(self, x: torch.Tensor):
        h = self.trunk(x)
        return self.pi(h), self.v(h).squeeze(-1)

    def act(self, x: torch.Tensor, temp: float = 1.0, greedy: bool = False):
        """Сэмплирование без torch.distributions (быстрее): Gumbel-max по каждой голове."""
        logits, v = self(x)
        acts, lps = [], 0.0
        for c in torch.split(logits, HEADS, dim=-1):
            c = c / temp
            if greedy:
                a = c.argmax(-1)
            else:
                g = -torch.log((-torch.log(torch.rand_like(c).clamp(1e-10, 1.0 - 1e-7))))
                a = (c + g).argmax(-1)
            lps = lps + torch.log_softmax(c, -1).gather(-1, a[:, None]).squeeze(-1)
            acts.append(a)
        return torch.stack(acts, -1), lps, v

    def evaluate(self, x: torch.Tensor, a: torch.Tensor):
        logits, v = self(x)
        lp, ent = 0.0, 0.0
        for i, c in enumerate(torch.split(logits, HEADS, dim=-1)):
            ls = torch.log_softmax(c, -1)
            lp = lp + ls.gather(-1, a[:, i:i + 1]).squeeze(-1)
            ent = ent - (ls.exp() * ls).sum(-1)
        return lp, ent, v
