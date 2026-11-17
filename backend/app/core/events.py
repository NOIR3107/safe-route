"""WebSocket hub: pushes "something changed" to every open browser.

The database stays the source of truth. A message only tells the React store which data to fetch
again, so a dropped message can never leave the screen with wrong numbers: on reconnect the client
simply refetches everything.

Message types:
  {"type": "changed", "topics": [...], "mode": "live"|"drill", "seq": n, "at": iso}
  {"type": "tick", "mode", "clock": {...}, "feed": {...}, "server_time": iso}   (heartbeat, ~1/s)
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.seq = 0

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def broadcast(self, message: dict) -> None:
        data = json.dumps(message, default=str)
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_text(data)
            except Exception:  # client went away mid-send
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def publish(self, topics: list[str], mode: str) -> None:
        """Called from request handlers (which run in a worker thread) after a commit."""
        self.seq += 1
        msg = {"type": "changed", "topics": topics, "mode": mode, "seq": self.seq, "at": datetime.now(UTC).isoformat()}
        if self.loop is None or not self.clients:
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self.loop:
            self.loop.create_task(self.broadcast(msg))
        else:
            asyncio.run_coroutine_threadsafe(self.broadcast(msg), self.loop)


hub = Hub()

# Topics the frontend store understands. "*" means refetch everything.
ALL = ["*"]
