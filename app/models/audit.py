from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    notification_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    message = Column(Text, nullable=False)
    type = Column(String(30), nullable=False, default="INFO")  # INFO, WARNING, ALERT, CRITICAL
    status = Column(String(20), nullable=False, default="Unread")  # Unread, Read
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="notifications")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(60), nullable=True)
    entity_id = Column(Integer, nullable=True)
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="audit_logs")
