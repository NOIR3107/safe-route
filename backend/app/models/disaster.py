"""DISASTER and AFFECTEDZONE (Experiment 5), plus the households living in each zone.

Households are what lets the planner keep families together and count vulnerable people
(FR-06): every member is one row in household_members, so the table stays in 1NF.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

from .base import JSONType, in_list, utcnow
from .vocab import (
    DISASTER_SEVERITIES,
    DISASTER_STATUSES,
    HOUSEHOLD_STATUSES,
    ZONE_PRIORITIES,
    ZONE_RISK_LEVELS,
    ZONE_STATUSES,
)


class Disaster(Base):
    __tablename__ = "disasters"
    __table_args__ = (
        CheckConstraint(in_list("severity", DISASTER_SEVERITIES), name="chk_disaster_severity"),
        CheckConstraint(in_list("status", DISASTER_STATUSES), name="chk_disaster_status"),
    )

    disaster_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Active")
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"))

    zones: Mapped[list[AffectedZone]] = relationship(back_populates="disaster", order_by="AffectedZone.zone_id")


class AffectedZone(Base):
    __tablename__ = "affected_zones"
    __table_args__ = (
        CheckConstraint("population >= 0", name="chk_zone_population_non_negative"),
        CheckConstraint("evacuated_count >= 0", name="chk_zone_evacuated_non_negative"),
        CheckConstraint("evacuated_count <= population", name="chk_zone_evacuated_lte_population"),
        CheckConstraint("severity BETWEEN 1 AND 5", name="chk_zone_severity_range"),
        CheckConstraint(in_list("priority", ZONE_PRIORITIES), name="chk_zone_priority"),
        CheckConstraint(in_list("risk_level", ZONE_RISK_LEVELS), name="chk_zone_risk_level"),
        CheckConstraint(in_list("status", ZONE_STATUSES), name="chk_zone_status"),
    )

    zone_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    disaster_id: Mapped[int] = mapped_column(ForeignKey("disasters.disaster_id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)  # public code, e.g. "VEL"
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False)
    state: Mapped[str | None] = mapped_column(String(60))
    district: Mapped[str | None] = mapped_column(String(60))
    population: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="P2")
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="High")
    severity: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    evacuated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Pending")
    centroid_lat: Mapped[float] = mapped_column(Float, nullable=False)
    centroid_lon: Mapped[float] = mapped_column(Float, nullable=False)
    # Zone outline as a list of [lat, lon] points: one geometric value, like a PostGIS POLYGON.
    polygon: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)

    disaster: Mapped[Disaster] = relationship(back_populates="zones")


class Household(Base):
    __tablename__ = "households"
    __table_args__ = (
        CheckConstraint("size > 0", name="chk_household_size_positive"),
        CheckConstraint("elderly >= 0 AND children >= 0 AND disabled >= 0 AND medical >= 0", name="chk_household_counts"),
        CheckConstraint(in_list("status", HOUSEHOLD_STATUSES), name="chk_household_status"),
    )

    household_id: Mapped[str] = mapped_column(String(30), primary_key=True)  # HH-VEL-0012, WI-1-0001
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("affected_zones.zone_id", ondelete="SET NULL"), index=True)
    token: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)  # printed on the evacuee slip
    head_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    elderly: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    children: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    disabled: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    medical: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pets: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Awaiting")
    shelter_id: Mapped[int | None] = mapped_column(ForeignKey("shelters.shelter_id", ondelete="SET NULL"))  # where they arrived
    walk_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    members: Mapped[list[HouseholdMember]] = relationship(
        order_by="HouseholdMember.position", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def vulnerable(self) -> int:
        return self.elderly + self.children + self.disabled + self.medical

    @property
    def delivered(self) -> bool:
        return self.status in ("Arrived", "Checked In")


class HouseholdMember(Base):
    __tablename__ = "household_members"

    household_id: Mapped[str] = mapped_column(ForeignKey("households.household_id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
