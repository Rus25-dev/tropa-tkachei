"""Кнопка панели «Гонка двух нейросетей»: полная «Гонка Ткачей» на локальном PeerJS — организатор-автомат, два игрока-агента и обсервер.

Здесь — подготовка: локальный сервер сигналов PeerJS (tools/rl/peer-server.mjs) и проверка пака агентов. Окна строит страница панели (iframe).
"""
from __future__ import annotations

import subprocess
import time

from envclient import ROOT, find_node

PEER_PORT = 9166


def _peer_running() -> bool:
    import socket
    s = socket.socket()
    s.settimeout(0.3)
    try:
        return s.connect_ex(("127.0.0.1", PEER_PORT)) == 0
    finally:
        s.close()


def launch(run: str, q: dict, procs: list) -> dict:
    """Готовит площадку: пак агентов собран, локальный PeerJS запущен. Окна (организатор, два игрока-агента, обсервер) панель создаёт сама
    внутри своей страницы: у каждого свой порт панели (8766–8769), поэтому у каждого своё хранилище браузера."""
    pack = q.get("pack", "tkachi")
    if not (ROOT / "dist" / "agents" / f"{pack}.json").exists():
        return {"ok": False, "error": f"нет dist/agents/{pack}.json: выполните npm run build (пак агентов лежит в public/agents/)"}
    if not _peer_running():
        procs.append(subprocess.Popen([find_node(), str(ROOT / "tools/rl/peer-server.mjs"), str(PEER_PORT)], cwd=ROOT))
        time.sleep(1.5)
    port = int(q.get("port", "8765"))
    return {"ok": True, "pack": pack, "peer": f"localhost:{PEER_PORT}",
            "origins": {"org": f"http://localhost:{port + 1}", "p1": f"http://localhost:{port + 2}", "p2": f"http://localhost:{port + 3}", "watch": f"http://localhost:{port + 4}"}}
