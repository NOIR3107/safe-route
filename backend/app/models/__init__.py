"""SQLAlchemy models. The 11 entities of the Experiment 5 ER diagram are marked with (ER)."""

from .audit import AuditLog, Notification  # (ER) NOTIFICATION, AUDITLOG
from .disaster import AffectedZone, Disaster, Household, HouseholdMember  # (ER) DISASTER, AFFECTEDZONE
from .fleet import RescueTeam, Vehicle  # (ER) VEHICLE
from .ops import IngestLog, OpsEvent, OpsState
from .plan import (  # (ER) EVACUATIONPLAN, ASSIGNMENT
    AssignmentHousehold,
    EvacuationAssignment,
    EvacuationPlan,
    PlanVersion,
    PlanVersionAssignment,
    ResourceAllocation,
    VehicleAssignment,
)
from .resource import Resource  # (ER) RESOURCE
from .route import RoadSegment, Route, RouteSegment  # (ER) ROUTE
from .shelter import Shelter, ShelterFacility  # (ER) SHELTER
from .user import User  # (ER) USER

__all__ = [
    "AffectedZone",
    "AssignmentHousehold",
    "AuditLog",
    "Disaster",
    "EvacuationAssignment",
    "EvacuationPlan",
    "Household",
    "HouseholdMember",
    "IngestLog",
    "Notification",
    "OpsEvent",
    "OpsState",
    "PlanVersion",
    "PlanVersionAssignment",
    "RescueTeam",
    "Resource",
    "ResourceAllocation",
    "RoadSegment",
    "Route",
    "RouteSegment",
    "Shelter",
    "ShelterFacility",
    "User",
    "Vehicle",
    "VehicleAssignment",
]
