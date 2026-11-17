"""FR-10: which households an event displaces.

Only the affected assignments change. Everything else stays where it is and keeps using its shelter
capacity, so a re-plan never shuffles people who are not affected.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

MOVABLE = ("Scheduled", "In Progress")

EVENT_TYPES = ("RouteBlocked", "ShelterClosed", "ShelterFull", "FacilityLost", "Regenerate", "RetryUnallocated")


@dataclass
class ActiveAssignment:
    assignment_id: int
    zone_id: int
    shelter_id: int
    route_id: int | None
    household_ids: list[str]
    status: str
    severity: int
    required: list[str]


@dataclass
class ReplanEvent:
    type: str  # one of EVENT_TYPES
    label: str
    route_ids: list[int] = field(default_factory=list)
    shelter_id: int | None = None
    facilities: list[str] = field(default_factory=list)
    overflow: int = 0  # ShelterFull: people above what the shelter can still take


@dataclass
class Displacement:
    assignment_id: int
    household_ids: list[str]
    reason: str


def select_affected(active: list[ActiveAssignment], event: ReplanEvent, household_size: Callable[[str], int]) -> list[Displacement]:
    movable = [a for a in active if a.status in MOVABLE]

    def all_of(items):
        return [Displacement(a.assignment_id, a.household_ids, event.label) for a in items]

    if event.type == "RouteBlocked":
        return all_of(a for a in movable if a.route_id is not None and a.route_id in event.route_ids)
    if event.type == "ShelterClosed":
        return all_of(a for a in movable if a.shelter_id == event.shelter_id)
    if event.type == "FacilityLost":
        return all_of(a for a in movable if a.shelter_id == event.shelter_id and any(f in event.facilities for f in a.required))
    if event.type == "RetryUnallocated":
        return []
    if event.type == "Regenerate":
        return all_of(a for a in movable if a.status == "Scheduled")
    if event.type == "ShelterFull":
        # Stability: move groups that have not left yet before groups already on the road, and
        # lower-severity zones before higher-severity ones.
        overflow = event.overflow
        if overflow <= 0:
            return []
        candidates = sorted(
            (a for a in movable if a.shelter_id == event.shelter_id),
            key=lambda a: (a.status == "In Progress", a.severity, len(a.required), -a.assignment_id),
        )
        out: list[Displacement] = []
        for a in candidates:
            if overflow <= 0:
                break
            taken: list[str] = []
            for hid in sorted(a.household_ids, key=lambda i: -household_size(i)):
                if overflow <= 0:
                    break
                taken.append(hid)
                overflow -= household_size(hid)
            if taken:
                out.append(Displacement(a.assignment_id, taken, event.label))
        return out
    raise ValueError(f"Unknown re-plan event {event.type!r}")
