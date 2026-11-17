"""Live feed ingestion endpoint. Feeds authenticate with the X-Ingest-Token header."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.database import dbs, serialize_writes
from app.core.events import ALL, hub
from app.ingestion.adapter import ingest
from app.ingestion.schemas import FeedBatch
from app.repositories import Repos
from app.schemas.responses import FeedStatus, IngestResult

from .deps import require_ingest_token
from .ops import feed_status

router = APIRouter(prefix="/ingest", tags=["Live data ingestion"])


@router.post("", response_model=IngestResult)
def post_feed(batch: FeedBatch, _: str = Depends(require_ingest_token)):
    """Validated by Pydantic, applied through the services, written to the LIVE database (also during a
    drill), then pushed to browsers over the WebSocket."""
    with dbs.Live() as db:
        serialize_writes(db)
        repos = Repos(db, "live")
        accepted, errors = ingest(repos, batch.source, batch.messages)
        repos.commit()
    hub.publish(ALL, "live")
    return {"accepted": accepted, "rejected": len(errors), "errors": errors}


@router.get("/status", response_model=FeedStatus)
def status():
    with dbs.Live() as db:
        return feed_status(Repos(db, "live"))
