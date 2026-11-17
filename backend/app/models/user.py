"""USER (Experiment 5): User_ID (PK), Name, Role, Email."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

from .base import in_list, utcnow
from .vocab import USER_ROLES


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(in_list("role", USER_ROLES), name="chk_user_role"),)

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    # Scope: a Shelter Manager manages one shelter, a Response Team user belongs to one team.
    shelter_id: Mapped[int | None] = mapped_column(ForeignKey("shelters.shelter_id", ondelete="SET NULL"))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("rescue_teams.team_id", ondelete="SET NULL"))
