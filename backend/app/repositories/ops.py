"""The operation clock row and the ingestion log."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import IngestLog, OpsState


class OpsStateRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self) -> OpsState:
        state = self.db.get(OpsState, 1)
        if state is None:
            state = OpsState(id=1, sim_minute=0, phase="idle", speed=4, timeline=[], fired_event_ids=[])
            self.db.add(state)
            self.db.flush()
        return state


class IngestRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, entry: IngestLog) -> IngestLog:
        self.db.add(entry)
        self.db.flush()
        return entry

    def last_received(self) -> tuple[datetime | None, str | None]:
        row = self.db.execute(select(IngestLog.received_at, IngestLog.source).order_by(IngestLog.id.desc()).limit(1)).first()
        return (row[0], row[1]) if row else (None, None)

    def count(self) -> int:
        return self.db.scalar(select(func.count()).select_from(IngestLog)) or 0

    def recent(self, limit: int = 50) -> list[IngestLog]:
        return list(self.db.scalars(select(IngestLog).order_by(IngestLog.id.desc()).limit(limit)))
