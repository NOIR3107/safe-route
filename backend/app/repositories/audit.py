"""Audit log, notifications and the operations event feed (FR-12)."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import AuditLog, Notification, OpsEvent


class AuditRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, entry: AuditLog) -> AuditLog:
        self.db.add(entry)
        self.db.flush()
        return entry

    def newest_first(self, limit: int = 500) -> list[AuditLog]:
        return list(self.db.scalars(select(AuditLog).order_by(AuditLog.log_id.desc()).limit(limit)))


class NotificationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, n: Notification) -> Notification:
        self.db.add(n)
        self.db.flush()
        return n

    def get(self, notification_id: int) -> Notification | None:
        return self.db.get(Notification, notification_id)

    def for_user(self, user_id: int, limit: int = 100) -> list[Notification]:
        q = (
            select(Notification)
            .where(or_(Notification.user_id.is_(None), Notification.user_id == user_id))
            .order_by(Notification.notification_id.desc())
            .limit(limit)
        )
        return list(self.db.scalars(q))


class OpsEventRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, e: OpsEvent) -> OpsEvent:
        self.db.add(e)
        self.db.flush()
        return e

    def newest_first(self, limit: int = 80) -> list[OpsEvent]:
        return list(self.db.scalars(select(OpsEvent).order_by(OpsEvent.id.desc()).limit(limit)))
