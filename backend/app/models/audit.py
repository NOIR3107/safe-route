"""NOTIFICATION and AUDITLOG (Experiment 5, FR-12)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

from .base import in_list, utcnow
from .vocab import NOTIFICATION_STATUSES, NOTIFICATION_TYPES


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(in_list("type", NOTIFICATION_TYPES), name="chk_notification_type"),
        CheckConstraint(in_list("status", NOTIFICATION_STATUSES), name="chk_notification_status"),
    )

    notification_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), index=True)  # null = everyone
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="INFO")
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="Unread")
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    # Class diagram: Notification "logged in" AuditLog.
    log_id: Mapped[int | None] = mapped_column(ForeignKey("audit_logs.log_id", ondelete="SET NULL"))


class AuditLog(Base):
    """Append-only: the API has no update or delete for it."""

    __tablename__ = "audit_logs"

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    entity_type: Mapped[str | None] = mapped_column(String(60))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[str | None] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)
