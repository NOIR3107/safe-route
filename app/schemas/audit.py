from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class NotificationBase(BaseModel):
    message: str
    type: str = "INFO"  # INFO, WARNING, ALERT, CRITICAL
    status: str = "Unread"


class NotificationCreate(NotificationBase):
    user_id: Optional[int] = None


class NotificationResponse(NotificationBase):
    notification_id: int
    user_id: Optional[int] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditLogBase(BaseModel):
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    details: Optional[str] = None


class AuditLogCreate(AuditLogBase):
    user_id: Optional[int] = None


class AuditLogResponse(AuditLogBase):
    log_id: int
    user_id: Optional[int] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)
