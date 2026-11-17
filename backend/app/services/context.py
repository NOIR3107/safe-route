"""Small shared types for the services layer."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass(frozen=True)
class Actor:
    """Who is doing something (written to the audit log)."""

    user_id: int | None
    name: str
    role: str = "System"
    shelter_id: int | None = None
    team_id: int | None = None


SYSTEM = Actor(user_id=None, name="SafeRoute Engine")
FEED = Actor(user_id=None, name="Live feed", role="Feed")


class ServiceError(Exception):
    """A rule was broken. The API turns it into an HTTP error with the same status and message."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def utcnow() -> datetime:
    return datetime.now(UTC)


def as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def iso(dt: datetime | None) -> str | None:
    return as_utc(dt).astimezone(UTC).isoformat() if dt else None
