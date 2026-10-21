"""Клиент среды боя: запускает Node-сервер tools/rl/server.ts и говорит с ним бинарным протоколом (см. tools/rl/server.ts)."""
from __future__ import annotations

import json
import os
import shutil
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CMD_RESET, CMD_STEP, CMD_REC, CMD_QUIT, CMD_CFG = 1, 2, 3, 4, 5
DONE_WIN, DONE_DIED, DONE_TIMEOUT = 1, 2, 3


def find_node() -> str:
    n = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
    if not os.path.exists(n) and not shutil.which(n):
        raise RuntimeError("Не найден node (нужен Node 22+)")
    return n


class EnvServer:
    """N параллельных боёв. step() принимает uint8[N, n_heads], возвращает (obs, rew, done, info)."""

    def __init__(self, boss="misha", envs=64, workers=12, seed=1, max_sec=150, lag=3, reward=None, record=False,
                 autoreset=True, label="Нейросеть", quiet=True):
        args = [find_node(), str(ROOT / "node_modules/tsx/dist/cli.mjs"), "--import", "./tools/ldtk-register.mjs", "tools/rl/server.ts",
                "--boss", boss, "--envs", str(envs), "--workers", str(workers), "--seed", str(seed), "--max-sec", str(max_sec),
                "--lag", str(lag), "--reward", json.dumps(reward or {}), "--record", "1" if record else "0",
                "--autoreset", "1" if autoreset else "0", "--label", label]
        self.p = subprocess.Popen(args, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=None if not quiet else subprocess.DEVNULL, bufsize=0)
        h = self._read(16)
        self.obs_dim, self.n_heads, self.info_dim, self.n = struct.unpack("<4I", h)
        self.done_pad = (self.n + 3) // 4 * 4
        self.resp_len = self.n * self.obs_dim * 4 + self.n * 4 + self.done_pad + self.n * self.info_dim * 4

    def _read(self, n: int) -> bytes:
        buf = bytearray(n)
        mv = memoryview(buf)
        got = 0
        while got < n:
            r = self.p.stdout.readinto(mv[got:])
            if not r:
                raise RuntimeError("сервер среды завершился (код %s)" % self.p.poll())
            got += r
        return bytes(buf)

    def _send(self, cmd: int, data: bytes = b"") -> None:
        self.p.stdin.write(struct.pack("<2I", cmd, len(data)) + data)
        self.p.stdin.flush()

    def _parse(self):
        b = self._read(self.resp_len)
        n, o = self.n, self.obs_dim
        i = 0
        obs = np.frombuffer(b, np.float32, n * o, i).reshape(n, o); i += n * o * 4
        rew = np.frombuffer(b, np.float32, n, i); i += n * 4
        done = np.frombuffer(b, np.uint8, n, i); i += self.done_pad
        info = np.frombuffer(b, np.float32, n * self.info_dim, i).reshape(n, self.info_dim)
        return obs, rew, done, info

    def reset(self, seeds=None):
        data = b"" if seeds is None else np.asarray(seeds, np.uint32).tobytes()
        self._send(CMD_RESET, data)
        return self._parse()[0]

    def step(self, actions):
        self._send(CMD_STEP, np.ascontiguousarray(actions, np.uint8).tobytes())
        return self._parse()

    def get_rec(self, i: int) -> dict | None:
        self._send(CMD_REC, struct.pack("<I", i))
        n = struct.unpack("<I", self._read(4))[0]
        return json.loads(self._read(n).decode("utf8")) if n else None

    def config(self, cfg: dict) -> None:
        self._send(CMD_CFG, json.dumps(cfg).encode("utf8"))
        self._read(4)

    def close(self) -> None:
        try:
            self._send(CMD_QUIT)
        except Exception:
            pass
        try:
            self.p.wait(timeout=5)
        except Exception:
            self.p.kill()
