"""FR-12: audit log, notifications and the event feed. Every change of state writes here."""

from __future__ import annotations

from app.models import AuditLog, Notification, OpsEvent
from app.repositories import Repos

from .clock import now_minute
from .context import Actor


def audit(repos: Repos, actor: Actor, action: str, entity_type: str | None, entity_id: int | None, details: str) -> AuditLog:
    return repos.audit.add(AuditLog(user_id=actor.user_id, action=action, entity_type=entity_type, entity_id=entity_id, details=details))


def notify(repos: Repos, type_: str, message: str, user_id: int | None = None, log: AuditLog | None = None) -> Notification:
    return repos.notifications.add(
        Notification(user_id=user_id, message=message, type=type_, status="Unread", log_id=log.log_id if log else None)
    )


def log_event(repos: Repos, level: str, title: str, detail: str) -> OpsEvent:
    return repos.events.add(OpsEvent(sim_minute=now_minute(repos), level=level, title=title, detail=detail))
