"""DEV FALLBACK ONLY (REPLAY_FEED=true, off by default): replays a recorded feed into the live database.

Each line of the JSONL file is {"after_seconds": n, "source": "...", "messages": [...]}. The UI shows a
"REPLAY" label whenever this is on, so recorded data is never mistaken for a live feed.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from app.core.database import dbs, serialize_writes
from app.core.events import ALL, hub
from app.repositories import Repos

from .adapter import ingest
from .schemas import FeedBatch

log = logging.getLogger("saferoute.replay")


def read_feed(path: str | Path) -> list[tuple[float, FeedBatch]]:
    out = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        row = json.loads(line)
        batch = FeedBatch(source=row.get("source", "replay"), messages=row["messages"])
        out.append((float(row.get("after_seconds", 0)), batch))
    return out


async def run_replay(path: str, speed: float = 1.0) -> None:
    feed = read_feed(path)
    log.warning("REPLAY feed on: %d batches from %s at %.1fx", len(feed), path, speed)
    elapsed = 0.0
    for after, batch in feed:
        await asyncio.sleep(max(0.0, (after - elapsed) / max(speed, 0.01)))
        elapsed = after
        await asyncio.to_thread(_apply, batch)
    log.warning("REPLAY feed finished; the feed will now show as stale")


def _apply(batch: FeedBatch) -> None:
    with dbs.Live() as db:
        serialize_writes(db)
        repos = Repos(db, "live")
        ingest(repos, "replay", batch.messages)
        repos.commit()
    hub.publish(ALL, "live")
