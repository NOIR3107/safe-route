"""Database engines and sessions.

There are two databases with the same schema:
  live  - the real operation (the source of truth)
  drill - a copy of live made when a drill starts, so a drill can never change live data

`get_db` hands out a session for whichever one is active. Users and logins always use live.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs = {"connect_args": {"check_same_thread": False}}
    return create_engine(url, **kwargs)


class Databases:
    """Holds both engines and remembers which one requests should use."""

    def __init__(self, live_url: str, drill_url: str) -> None:
        self.live_engine = make_engine(live_url)
        self.drill_engine = make_engine(drill_url)
        self.Live = sessionmaker(bind=self.live_engine, autoflush=False, expire_on_commit=False)
        self.Drill = sessionmaker(bind=self.drill_engine, autoflush=False, expire_on_commit=False)
        self.mode = "live"  # "live" | "drill"

    def session(self) -> Session:
        return self.Drill() if self.mode == "drill" else self.Live()

    def live_session(self) -> Session:
        return self.Live()


dbs = Databases(settings.DATABASE_URL, settings.DRILL_DATABASE_URL)

WRITE_LOCK_KEY = 7262


def serialize_writes(db) -> None:
    """Take a PostgreSQL transaction lock so writes run one at a time.

    Without it the drill clock (a background task) and a user's request could update the same rows
    in opposite order and deadlock. The lock is released automatically at commit or rollback.
    Reads never take it. Accepts a Session or a Connection.
    """
    dialect = db.bind.dialect if isinstance(db, Session) else db.dialect
    if dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": WRITE_LOCK_KEY})


def get_db() -> Iterator[Session]:
    db = dbs.session()
    try:
        yield db
    finally:
        db.close()


def get_live_db() -> Iterator[Session]:
    db = dbs.live_session()
    try:
        yield db
    finally:
        db.close()
