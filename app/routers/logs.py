from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.models.audit import Notification, AuditLog
from app.schemas.audit import NotificationResponse, AuditLogResponse

router = APIRouter(prefix="/logs", tags=["Audit Logs & Notifications"])


@router.get("/notifications", response_model=List[NotificationResponse])
def get_notifications(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Returns system notifications and notifications for current user
    return db.query(Notification).filter(
        (Notification.user_id == current_user.user_id) | (Notification.user_id.is_(None))
    ).order_by(Notification.timestamp.desc()).offset(skip).limit(limit).all()


@router.put("/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notif = db.query(Notification).filter(Notification.notification_id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notif.status = "Read"
    db.commit()
    db.refresh(notif)
    return notif


@router.get("/audit", response_model=List[AuditLogResponse])
def get_audit_logs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY]))
):
    return db.query(AuditLog).order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
