from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base


class UserRole:
    ADMIN = "Admin"
    EMERGENCY_AUTHORITY = "Emergency Authority"
    EVACUATION_COORDINATOR = "Evacuation Coordinator"
    SHELTER_MANAGER = "Shelter Manager"
    TRANSPORT_COORDINATOR = "Transport Coordinator"
    RESPONSE_TEAM = "Response Team"


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default=UserRole.EVACUATION_COORDINATOR)
    phone_number = Column(String(30), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    evacuation_plans = relationship("EvacuationPlan", back_populates="creator")
    notifications = relationship("Notification", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")
