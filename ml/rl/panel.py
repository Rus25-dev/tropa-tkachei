"""Живая панель обучения: python panel.py [--port 8765] [--runs ml/rl/runs]

Показывает графики из metrics.jsonl / eval.jsonl (Server-Sent Events), таблицу оценок против эвристического бота и встроенную настоящую игру,
которая проигрывает записи боёв нейросети (.ttrec) по ?watch=. Игру отдаёт этот же сервер из dist/ (`npm run build`): запись должна лежать
на том же сайте, что и игра.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RUNS = HERE / "runs"
SAFE = re.compile(r"^[\w.\-]+$")


def last_lines(path: Path, n: int):
    if not path.exists():
        return []
    out = []
    for l in path.read_text(encoding="utf8").splitlines()[-n:]:
        try:
            out.append(json.loads(l))
        except ValueError:
            pass
    return out


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _send(self, code, body: bytes, ctype="application/json", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text") or ctype == "application/json" else ""))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _file(self, p: Path):
        if not p.is_file():
            return self._send(404, b"not found", "text/plain")
        ct = mimetypes.guess_type(str(p))[0] or ("application/json" if p.suffix == ".ttrec" else "application/octet-stream")
        if p.suffix == ".ttrec":
            ct = "application/json"
        self._send(200, p.read_bytes(), ct)

    def do_POST(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        run = (q.get("run") or [""])[0]
        if u.path == "/api/race-state":
            try:
                race_of((q.get("rid") or [""])[0])["state"] = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf8"))
            except ValueError:
                pass
            return self._send(200, b"{}")
        if u.path == "/api/agent-stat":
            try:
                d = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf8"))
                race_of((q.get("rid") or [""])[0])["agents"][d["name"]] = d
            except (ValueError, KeyError):
                pass
            return self._send(200, b"{}")
        if u.path == "/api/race-cmd":
            race_of((q.get("rid") or [""])[0])["cmds"].append({"cmd": (q.get("cmd") or [""])[0], "disc": (q.get("disc") or [""])[0]})
            return self._send(200, b"{}")
        if u.path == "/api/demo-now" and SAFE.match(run) and (RUNS / run).is_dir():
            (RUNS / run / "demo_now").write_text("1")
            return self._send(200, b'{"ok":true}')
        if u.path == "/api/race":
            return self._send(200, json.dumps(start_race(run, q)).encode("utf8"))
        self._send(404, b"{}")

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        run = (q.get("run") or [""])[0]
        if u.path in ("/", "/index.html"):
            return self._file(HERE / "panel" / "index.html")
        if u.path == "/api/runs":
            rs = sorted([d.name for d in RUNS.iterdir() if d.is_dir() and (d / "metrics.jsonl").exists()], key=lambda n: -(RUNS / n / "metrics.jsonl").stat().st_mtime) if RUNS.exists() else []
            return self._send(200, json.dumps(rs).encode("utf8"))
        if u.path.startswith("/runs/") and ".." not in u.path:
            return self._file(RUNS / u.path[6:])
        if u.path == "/api/state" and SAFE.match(run):
            d = RUNS / run
            cfg = json.loads((d / "config.json").read_text(encoding="utf8")) if (d / "config.json").exists() else {}
            bl = RUNS / f"baseline-{cfg.get('boss', 'misha')}.json"
            try:
                txt = bl.read_text(encoding="utf8") if bl.exists() else ""
                base = json.loads(txt[txt.index('{"spec"'):]) if '{"spec"' in txt else None
            except ValueError:
                base = None
            return self._send(200, json.dumps({"config": cfg, "metrics": last_lines(d / "metrics.jsonl", 100000), "evals": last_lines(d / "eval.jsonl", 500), "baseline": base,
                                               "demos": sorted(p.name for p in (d / "demos").glob("*.ttrec")) if (d / "demos").exists() else []}).encode("utf8"))
        if u.path == "/api/race-state":
            r = race_of((q.get("rid") or [""])[0])
            return self._send(200, json.dumps({**(r["state"] or {}), "agents": r["agents"], "srvtime": time.time()} if (r["state"] or r["agents"]) else None).encode("utf8"))
        if u.path == "/api/race-cmd":
            r = race_of((q.get("rid") or [""])[0])
            c, r["cmds"] = r["cmds"], []
            return self._send(200, json.dumps(c).encode("utf8"))
        if u.path == "/api/progress":
            return self._send(200, json.dumps(progress()).encode("utf8"))
        if u.path == "/events" and SAFE.match(run):
            return self._sse(RUNS / run)
        if u.path.startswith("/game/"):
            rel = u.path[6:] or "index.html"
            if ".." in rel:
                return self._send(404, b"")
            return self._file(ROOT / "dist" / rel)
        if u.path == "/game":
            self.send_response(302); self.send_header("Location", "/game/"); self.send_header("Content-Length", "0"); self.end_headers(); return
        self._send(404, b"not found", "text/plain")

    def _sse(self, d: Path):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        pos = {"metrics.jsonl": (d / "metrics.jsonl").stat().st_size if (d / "metrics.jsonl").exists() else 0,
               "eval.jsonl": (d / "eval.jsonl").stat().st_size if (d / "eval.jsonl").exists() else 0}
        kinds = {"metrics.jsonl": "metric", "eval.jsonl": "eval"}
        try:
            while True:
                for fn, kind in kinds.items():
                    p = d / fn
                    if p.exists() and p.stat().st_size > pos[fn]:
                        with open(p, "rb") as f:
                            f.seek(pos[fn])
                            chunk = f.read()
                        nl = chunk.rfind(b"\n")
                        if nl >= 0:
                            pos[fn] += nl + 1
                            for line in chunk[: nl + 1].decode("utf8").splitlines():
                                if line.strip():
                                    self.wfile.write(f"event: {kind}\ndata: {line}\n\n".encode("utf8"))
                self.wfile.write(b": ping\n\n")
                self.wfile.flush()
                time.sleep(1.0)
        except (BrokenPipeError, ConnectionResetError, OSError):
            return


def _last(path: Path):
    ls = last_lines(path, 1)
    return ls[0] if ls else None


def progress() -> dict:
    """Очередь запусков и сводка текущего: статусы, лимиты из config.json, прогресс, расчёт времени до конца."""
    now = time.time()
    qf = RUNS / "queue.json"
    q = json.loads(qf.read_text(encoding="utf8")) if qf.exists() else []
    known = {x["name"] for x in q}
    for d in sorted(RUNS.iterdir()) if RUNS.exists() else []:
        if d.is_dir() and d.name not in known and (d / "metrics.jsonl").exists():
            q.append({"name": d.name, "boss": "", "persona": ""})
    out, cur = [], None
    fresh = [x for x in q if (RUNS / x["name"] / "metrics.jsonl").exists() and now - (RUNS / x["name"] / "metrics.jsonl").stat().st_mtime < 45]
    running = max(fresh, key=lambda x: (RUNS / x["name"] / "metrics.jsonl").stat().st_mtime)["name"] if fresh else None
    for x in q:
        d = RUNS / x["name"]
        m = _last(d / "metrics.jsonl") if d.exists() else None
        cfg = json.loads((d / "config.json").read_text(encoding="utf8")) if (d / "config.json").exists() else {}
        row = {"name": x["name"], "boss": cfg.get("boss") or x.get("boss", ""), "persona": cfg.get("persona") or x.get("persona", ""), "note": x.get("note", "")}
        if m is None:
            row["status"] = "wait"
        else:
            row["status"] = "run" if x["name"] == running else "done"
            row.update({"episodes": m.get("episodes"), "steps": m.get("steps"), "elapsed": m.get("elapsed"), "win": m.get("win"), "ep_sec": m.get("ep_sec"), "update": m.get("update")})
            lim = []
            if cfg.get("minutes"):
                lim.append(f"лимит {cfg['minutes']:g} мин")
            if cfg.get("steps"):
                lim.append(f"до {cfg['steps']/1e6:g} млн шагов")
            if cfg.get("stop_win"):
                lim.append(f"стоп при {cfg['stop_win']*100:.0f}% побед за последние 300 боёв")
            row["limits"] = lim
            fr = []
            if cfg.get("minutes"):
                fr.append(m["elapsed"] / (cfg["minutes"] * 60))
            if cfg.get("steps"):
                fr.append(m["steps"] / cfg["steps"])
            if cfg.get("stop_win") and m.get("win") is not None:
                fr.append(min(1.0, m["win"] / cfg["stop_win"]))
            row["progress"] = min(1.0, max(fr)) if fr else None
            if row["status"] == "run":
                left = []
                if cfg.get("minutes"):
                    left.append(cfg["minutes"] * 60 - m["elapsed"])
                if cfg.get("steps") and m["steps"] > 0:
                    left.append((cfg["steps"] - m["steps"]) * m["elapsed"] / m["steps"])
                row["eta_sec"] = max(0, min(left)) if left else None
                ev = last_lines(d / "eval.jsonl", 1000)
                every = cfg.get("eval_every", 60)
                row["eval"] = {"laps": len(ev), "per_lap": 16, "every": every, "next_in": max(0, round((ev[-1]["t"] if ev else m["t"] - m["elapsed"]) + every - now)) if True else None,
                               "last": {k: ev[-1].get(k) for k in ("update", "wins", "n", "win_rate", "mean_sec")} if ev else None}
                cur = row
        out.append(row)
    return {"queue": out, "current": cur, "now": now}


class Srv(ThreadingHTTPServer):
    daemon_threads = True

    def server_bind(self):  # без getfqdn: на Windows он тормозит запуск на несколько секунд
        import socketserver
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[0], self.server_address[1]


RACE_PROCS: list = []
RACES: dict = {}  # rid -> {"state", "cmds", "agents", "at"}: у каждой страницы панели своя гонка, несколько браузеров не мешают друг другу


def race_of(rid: str) -> dict:
    now = time.time()
    for k in [k for k, v in RACES.items() if now - v["at"] > 3600]:
        del RACES[k]
    r = RACES.setdefault(rid or "-", {"state": None, "cmds": [], "agents": {}, "at": now})
    r["at"] = now
    return r


def start_race(run: str, q: dict) -> dict:
    """Кнопка «Запустить гонку двух агентов»: см. ml/rl/race.py (этап 3)."""
    try:
        sys.path.insert(0, str(HERE))
        import race  # noqa: PLC0415
        res = race.launch(run, {k: v[0] for k, v in q.items()}, RACE_PROCS)
        res["rid"] = "r%x" % int(time.time() * 1000)
        return res
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def main():
    global RUNS
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--runs", default=str(RUNS))
    a = ap.parse_args()
    RUNS = Path(a.runs)
    # игру для окон гонки отдаём ещё с четырёх портов: у каждого окна свой источник (origin = хост + порт), значит своё хранилище браузера
    for k in range(1, 5):
        try:
            extra = Srv(("127.0.0.1", a.port + k), H)
            extra.daemon_threads = True
            threading.Thread(target=extra.serve_forever, daemon=True).start()
        except OSError as e:
            print("порт занят", a.port + k, e)
    srv = Srv(("127.0.0.1", a.port), H)
    srv.daemon_threads = True
    print(f"Панель: http://localhost:{a.port}/", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
