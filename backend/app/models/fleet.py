"""VEHICLE (Experiment 5) and RescueTeam (Experiment 3 class diagram)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

from .base import in_list
from .vocab import POSITION_SOURCES, TEAM_STATUSES, VEHICLE_STATUSES, VEHICLE_TYPES


class RescueTeam(Base):
    __tablename__ = "rescue_teams"
    __table_args__ = (
        CheckConstraint("members_count > 0", name="chk_team_members_positive"),
        CheckConstraint(in_list("status", TEAM_STATUSES), name="chk_team_status"),
    )

    team_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    members_count: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    contact_number: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Available")
    current_location: Mapped[str | None] = mapped_column(String(120))
    # Class diagram: RescueTeam "assigned to" EvacuationPlan.
    # use_alter: users -> rescue_teams -> evacuation_plans -> users is a cycle, so this key is added
    # after the tables exist.
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("evacuation_plans.plan_id", ondelete="SET NULL", use_alter=True, name="fk_rescue_teams_plan_id")
    )


class Vehicle(Base):
    __tablename__ = "vehicles"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="chk_vehicle_capacity_positive"),
        CheckConstraint(in_list("vehicle_type", VEHICLE_TYPES), name="chk_vehicle_type"),
        CheckConstraint(in_list("status", VEHICLE_STATUSES), name="chk_vehicle_status"),
        CheckConstraint(in_list("position_source", POSITION_SOURCES), name="chk_vehicle_position_source"),
    )

    vehicle_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    disaster_id: Mapped[int | None] = mapped_column(ForeignKey("disasters.disaster_id", ondelete="SET NULL"), index=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("rescue_teams.team_id", ondelete="SET NULL"), index=True)
    vehicle_type: Mapped[str] = mapped_column(String(20), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Available")
    current_location: Mapped[str] = mapped_column(String(120), nullable=False)
    plate_number: Mapped[str | None] = mapped_column(String(30), unique=True)
    depot_lat: Mapped[float] = mapped_column(Float, nullable=False)
    depot_lon: Mapped[float] = mapped_column(Float, nullable=False)
    # Last known position. "gps" when a field device reported it, "depot" when parked.
    position_lat: Mapped[float] = mapped_column(Float, nullable=False)
    position_lon: Mapped[float] = mapped_column(Float, nullable=False)
    position_source: Mapped[str] = mapped_column(String(20), nullable=False, default="depot")
    position_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
