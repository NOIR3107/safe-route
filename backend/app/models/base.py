"""Shared column helpers for the models."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

# JSONB on PostgreSQL, plain JSON elsewhere (the engine unit tests never touch a database).
JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(UTC)


def in_list(column: str, values: tuple[str, ...] | list[str]) -> str:
    """SQL for a CHECK constraint that limits a column to a fixed vocabulary."""
    quoted = ", ".join("'" + v.replace("'", "''") + "'" for v in values)
    return f"{column} IN ({quoted})"
