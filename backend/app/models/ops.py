"""Operations tables: the event feed, the operation clock and the ingestion log."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

from .base import JSONType, in_list, utcnow
from .vocab import DRILL_PHASES, OPS_EVENT_LEVELS


class OpsEvent(Base):
    """One line of the dashboard's event feed."""

    __tablename__ = "ops_events"
    __table_args__ = (CheckConstraint(in_list("level", OPS_EVENT_LEVELS), name="chk_ops_event_level"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sim_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    level: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False, default="")


class OpsState(Base):
    """Single row (id = 1) holding the operation clock.

    In the live database the clock is wall time since the incident started. In the drill
    database it is the drill's own clock, which the server advances while the drill runs.
    """

    __tablename__ = "ops_state"
    __table_args__ = (
        CheckConstraint("id = 1", name="chk_ops_state_single_row"),
        CheckConstraint(in_list("phase", DRILL_PHASES), name="chk_ops_state_phase"),
        CheckConstraint("speed >= 1 AND speed <= 32", name="chk_ops_state_speed"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    sim_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    phase: Mapped[str] = mapped_column(String(10), nullable=False, default="idle")
    speed: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    scenario_id: Mapped[str | None] = mapped_column(String(60))
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=150)
    timeline: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)  # scripted drill events
    fired_event_ids: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    has_snapshot: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    branched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class IngestLog(Base):
    """Every message received from a live feed, kept for audit and for the "last update" display."""

    __tablename__ = "ingest_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONType, nullable=False)
    applied: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    error: Mapped[str | None] = mapped_column(Text)
