"""Evacuation plans, plan versions and assignments."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    AssignmentHousehold,
    EvacuationAssignment,
    EvacuationPlan,
    PlanVersion,
    PlanVersionAssignment,
    ResourceAllocation,
    VehicleAssignment,
)

ACTIVE_EXCLUDED = ("Rerouted", "Cancelled")
MOVABLE = ("Scheduled", "In Progress")


class PlanRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ---- plans and versions

    def current_plan(self) -> EvacuationPlan | None:
        return self.db.scalar(select(EvacuationPlan).where(EvacuationPlan.status != "Cancelled").order_by(EvacuationPlan.plan_id.desc()))

    def add_plan(self, plan: EvacuationPlan) -> EvacuationPlan:
        self.db.add(plan)
        self.db.flush()
        return plan

    def versions(self, plan_id: int) -> list[PlanVersion]:
        return list(self.db.scalars(select(PlanVersion).where(PlanVersion.plan_id == plan_id).order_by(PlanVersion.version)))

    def current_version(self, plan: EvacuationPlan | None = None) -> PlanVersion | None:
        plan = plan or self.current_plan()
        if plan is None:
            return None
        return self.db.scalar(select(PlanVersion).where(PlanVersion.plan_id == plan.plan_id).order_by(PlanVersion.version.desc()))

    def version(self, plan_id: int, number: int) -> PlanVersion | None:
        return self.db.scalar(select(PlanVersion).where(PlanVersion.plan_id == plan_id, PlanVersion.version == number))

    def add_version(self, version: PlanVersion, assignment_ids: list[int]) -> PlanVersion:
        version.members = [PlanVersionAssignment(assignment_id=a) for a in assignment_ids]
        self.db.add(version)
        self.db.flush()
        return version

    def set_version_members(self, version: PlanVersion, assignment_ids: list[int]) -> None:
        version.members = [PlanVersionAssignment(assignment_id=a) for a in assignment_ids]
        self.db.flush()

    # ---- assignments

    def assignment(self, assignment_id: int) -> EvacuationAssignment | None:
        return self.db.get(EvacuationAssignment, assignment_id)

    def assignments_by_ids(self, ids: list[int]) -> list[EvacuationAssignment]:
        if not ids:
            return []
        return list(
            self.db.scalars(
                select(EvacuationAssignment).where(EvacuationAssignment.assignment_id.in_(ids)).order_by(EvacuationAssignment.assignment_id)
            )
        )

    def version_assignments(self, version: PlanVersion | None) -> list[EvacuationAssignment]:
        """Assignments active in a version (everything except Rerouted / Cancelled)."""
        if version is None:
            return []
        return [a for a in self.assignments_by_ids(version.assignment_ids) if a.status not in ACTIVE_EXCLUDED]

    def movable(self, version: PlanVersion | None) -> list[EvacuationAssignment]:
        return [a for a in self.version_assignments(version) if a.status in MOVABLE]

    def add_assignment(self, a: EvacuationAssignment, household_ids: list[str]) -> EvacuationAssignment:
        a.households = [AssignmentHousehold(household_id=h, position=i) for i, h in enumerate(household_ids)]
        self.db.add(a)
        self.db.flush()
        return a

    def add_vehicle_assignment(self, va: VehicleAssignment) -> VehicleAssignment:
        self.db.add(va)
        self.db.flush()
        return va

    # ---- supplies (FR-09)

    def replace_resource_allocations(self, version_id: int, rows: list[ResourceAllocation]) -> None:
        self.db.execute(delete(ResourceAllocation).where(ResourceAllocation.version_id == version_id))
        self.db.add_all(rows)
        self.db.flush()

    def resource_allocations(self, version_id: int) -> list[ResourceAllocation]:
        return list(
            self.db.scalars(
                select(ResourceAllocation)
                .where(ResourceAllocation.version_id == version_id)
                .order_by(ResourceAllocation.shelter_id, ResourceAllocation.resource_id)
            )
        )
