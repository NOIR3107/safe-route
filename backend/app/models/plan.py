"""EVACUATIONPLAN and ASSIGNMENT (Experiment 5), with plan versions (FR-10) and the vehicle and
supply assignments that make up FR-09.

Every re-plan saves a new PlanVersion with status "Proposed". A version lists the assignments that
are active in it (plan_version_assignments): unaffected assignments are carried over unchanged,
affected ones are marked "Rerouted" and replaced by new rows.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

from .base import JSONType, in_list, utcnow
from .vocab import (
    APPROVAL_STATES,
    ASSIGNMENT_STATUSES,
    PLAN_STATUSES,
    STRATEGIES,
    VEHICLE_ASSIGNMENT_STATUSES,
    VERSION_STATUSES,
)


class EvacuationPlan(Base):
    __tablename__ = "evacuation_plans"
    __table_args__ = (CheckConstraint(in_list("status", PLAN_STATUSES), name="chk_plan_status"),)

    plan_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    disaster_id: Mapped[int] = mapped_column(ForeignKey("disasters.disaster_id", ondelete="CASCADE"), nullable=False, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="High")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    versions: Mapped[list[PlanVersion]] = relationship(back_populates="plan", order_by="PlanVersion.version")


class PlanVersion(Base):
    __tablename__ = "plan_versions"
    __table_args__ = (
        UniqueConstraint("plan_id", "version", name="uq_plan_version"),
        CheckConstraint("version > 0", name="chk_version_positive"),
        CheckConstraint(in_list("status", VERSION_STATUSES), name="chk_version_status"),
        CheckConstraint(in_list("strategy", STRATEGIES), name="chk_version_strategy"),
    )

    version_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("evacuation_plans.plan_id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Proposed")
    strategy: Mapped[str] = mapped_column(String(20), nullable=False)
    sim_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Snapshots written once when the version is created (documents, never updated in place):
    trigger: Mapped[dict] = mapped_column(JSONType, nullable=False)  # what caused this version
    unallocated: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    metrics: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    diff: Mapped[dict | None] = mapped_column(JSONType)

    plan: Mapped[EvacuationPlan] = relationship(back_populates="versions")
    members: Mapped[list[PlanVersionAssignment]] = relationship(cascade="all, delete-orphan", lazy="selectin")

    @property
    def assignment_ids(self) -> list[int]:
        return sorted(m.assignment_id for m in self.members)


class PlanVersionAssignment(Base):
    __tablename__ = "plan_version_assignments"

    version_id: Mapped[int] = mapped_column(ForeignKey("plan_versions.version_id", ondelete="CASCADE"), primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("evacuation_assignments.assignment_id", ondelete="CASCADE"), primary_key=True)


class EvacuationAssignment(Base):
    __tablename__ = "evacuation_assignments"
    __table_args__ = (
        CheckConstraint("people_count > 0", name="chk_assignment_people_count_positive"),
        CheckConstraint(in_list("status", ASSIGNMENT_STATUSES), name="chk_assignment_status"),
        CheckConstraint(in_list("approval", APPROVAL_STATES), name="chk_assignment_approval"),
        CheckConstraint("trips >= 1 AND trip_capacity >= 1", name="chk_assignment_trips"),
    )

    assignment_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("evacuation_plans.plan_id", ondelete="CASCADE"), nullable=False, index=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("affected_zones.zone_id"), nullable=False, index=True)
    shelter_id: Mapped[int] = mapped_column(ForeignKey("shelters.shelter_id"), nullable=False, index=True)
    route_id: Mapped[int | None] = mapped_column(ForeignKey("routes.route_id"))
    people_count: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Scheduled")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False)  # version that created this row
    approval: Mapped[str] = mapped_column(String(20), nullable=False, default="Proposed")
    override_reason: Mapped[str | None] = mapped_column(Text)
    # Trip timeline, in operation minutes (T+):
    dispatch_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    approach_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    eta_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    trips: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    trip_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    travel_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delivered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    base: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # people handled before the current timeline
    # Why this shelter: cost breakdown and every rejected alternative (FR-08 explainability).
    explanation: Mapped[dict] = mapped_column(JSONType, nullable=False)

    households: Mapped[list[AssignmentHousehold]] = relationship(
        cascade="all, delete-orphan", order_by="AssignmentHousehold.position", lazy="selectin"
    )
    vehicle_assignments: Mapped[list[VehicleAssignment]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan", order_by="VehicleAssignment.vehicle_assignment_id", lazy="selectin"
    )

    @property
    def household_ids(self) -> list[str]:
        return [h.household_id for h in self.households]

    @property
    def vehicle_ids(self) -> list[int]:
        """Vehicles serving this assignment now (or that served it, once completed)."""
        return [va.vehicle_id for va in self.vehicle_assignments if va.status != "Reassigned"]


class AssignmentHousehold(Base):
    __tablename__ = "assignment_households"

    assignment_id: Mapped[int] = mapped_column(ForeignKey("evacuation_assignments.assignment_id", ondelete="CASCADE"), primary_key=True)
    household_id: Mapped[str] = mapped_column(ForeignKey("households.household_id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class VehicleAssignment(Base):
    __tablename__ = "vehicle_assignments"
    __table_args__ = (CheckConstraint(in_list("status", VEHICLE_ASSIGNMENT_STATUSES), name="chk_vehicle_assignment_status"),)

    vehicle_assignment_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("evacuation_assignments.assignment_id", ondelete="CASCADE"), nullable=False, index=True
    )
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.vehicle_id"), nullable=False, index=True)
    departure_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrival_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Assigned")

    assignment: Mapped[EvacuationAssignment] = relationship(back_populates="vehicle_assignments")


class ResourceAllocation(Base):
    """FR-09 resource assignment: relief supplies earmarked for a shelter by a plan version."""

    __tablename__ = "resource_allocations"
    __table_args__ = (CheckConstraint("quantity > 0", name="chk_resource_allocation_quantity_positive"),)

    allocation_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("plan_versions.version_id", ondelete="CASCADE"), nullable=False, index=True)
    shelter_id: Mapped[int] = mapped_column(ForeignKey("shelters.shelter_id", ondelete="CASCADE"), nullable=False)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.resource_id", ondelete="CASCADE"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
