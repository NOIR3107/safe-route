from typing import Optional
from sqlalchemy.orm import Session
from app.models.audit import AuditLog, Notification


class AuditService:
    @staticmethod
    def log_event(
        db: Session,
        user_id: Optional[int],
        action: str,
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        details: Optional[str] = None
    ) -> AuditLog:
        log = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    @staticmethod
    def send_notification(
        db: Session,
        message: str,
        user_id: Optional[int] = None,
        msg_type: str = "INFO"
    ) -> Notification:
        notification = Notification(
            user_id=user_id,
            message=message,
            type=msg_type,
            status="Unread"
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
        return notification
