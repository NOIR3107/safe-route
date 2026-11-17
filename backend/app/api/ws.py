"""WebSocket endpoint and the server clock task (drill clock + heartbeat)."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.database import dbs, serialize_writes
from app.core.events import ALL, hub
from app.repositories import Repos
from app.services import drill

from .ops import clock_payload

router = APIRouter()
log = logging.getLogger("saferoute.clock")


@router.websocket("/ws")
async def websocket(ws: WebSocket) -> None:
    await hub.connect(ws)
    try:
        await ws.send_json({"type": "hello", "clock": await asyncio.to_thread(_clock)})
        while True:
            await ws.receive_text()  # the client may send pings; we only care that it is alive
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ws)


def _clock() -> dict:
    db = dbs.Drill() if dbs.mode == "drill" else dbs.Live()
    with db:
        return clock_payload(Repos(db, dbs.mode))


def _tick() -> tuple[dict, bool]:
    """One clock step: advance a running drill by `speed` minutes. Returns (clock, changed)."""
    changed = False
    if dbs.mode == "drill":
        with dbs.Drill() as db:
            repos = Repos(db, "drill")
            state = repos.ops.get()
            if state.phase == "running":
                serialize_writes(db)
                db.refresh(state)  # re-read after waiting for the lock
                changed = drill.advance(repos, state.speed)
                repos.commit()
    return _clock(), changed


async def clock_loop() -> None:
    """Runs for the life of the app: ticks the drill clock and sends a heartbeat every second."""
    beat = 0
    while True:
        await asyncio.sleep(settings.CLOCK_TICK_SECONDS)
        beat += 1
        try:
            clock, changed = await asyncio.to_thread(_tick)
        except Exception:  # keep the clock alive; the error is in the server log
            log.exception("clock tick failed")
            continue
        await hub.broadcast({"type": "tick", **clock})
        if changed:
            hub.publish(ALL, "drill")
        elif dbs.mode == "live" and beat % 10 == 0:
            hub.publish(["vehicles"], "live")  # estimated positions move with time
