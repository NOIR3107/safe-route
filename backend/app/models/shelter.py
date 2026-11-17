"""SHELTER (Experiment 5) and ShelterFacility (Experiment 3 class diagram).

Facilities live only in shelter_facilities, one row per facility. The old comma-separated
`facilities` text column was removed because a list in one column breaks 1NF.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

from .base import in_list
from .vocab import FACILITY_AVAILABILITY, FACILITY_TYPES, SHELTER_STATUSES


class Shelter(Base):
    __tablename__ = "shelters"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="chk_shelter_capacity_positive"),
        CheckConstraint("current_occupancy >= 0", name="chk_shelter_occupancy_non_negative"),
        CheckConstraint("current_occupancy <= capacity", name="chk_shelter_occupancy_lte_capacity"),
        CheckConstraint("reserved_pct >= 0 AND reserved_pct <= 0.5", name="chk_shelter_reserved_pct"),
        CheckConstraint("walk_ins >= 0", name="chk_shelter_walk_ins_non_negative"),
        CheckConstraint(in_list("status", SHELTER_STATUSES), name="chk_shelter_status"),
    )

    shelter_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    current_occupancy: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Active")
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    # Share of capacity kept free for walk-ins, and how many walk-ins already used it.
    reserved_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.10)
    walk_ins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    facilities_list: Mapped[list[ShelterFacility]] = relationship(
        back_populates="shelter", cascade="all, delete-orphan", order_by="ShelterFacility.facility_id", lazy="selectin"
    )

    def available_facilities(self) -> list[str]:
        return [f.facility_type for f in self.facilities_list if f.availability_status != "Unavailable"]

    def degraded_facilities(self) -> list[str]:
        return [f.facility_type for f in self.facilities_list if f.availability_status == "Unavailable"]


class ShelterFacility(Base):
    __tablename__ = "shelter_facilities"
    __table_args__ = (
        UniqueConstraint("shelter_id", "facility_type", name="uq_shelter_facility"),
        CheckConstraint(in_list("facility_type", FACILITY_TYPES), name="chk_facility_type"),
        CheckConstraint(in_list("availability_status", FACILITY_AVAILABILITY), name="chk_facility_availability"),
    )

    facility_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    shelter_id: Mapped[int] = mapped_column(ForeignKey("shelters.shelter_id", ondelete="CASCADE"), nullable=False, index=True)
    facility_type: Mapped[str] = mapped_column(String(40), nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer)
    availability_status: Mapped[str] = mapped_column(String(20), nullable=False, default="Available")

    shelter: Mapped[Shelter] = relationship(back_populates="facilities_list")
