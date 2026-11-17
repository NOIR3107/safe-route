"""Request bodies. Pydantic rejects bad input with 422 before any service code runs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

DisasterSeverity = Literal["Low", "Medium", "High", "Critical"]
DisasterStatus = Literal["Active", "Under Control", "Resolved"]
ZonePriority = Literal["P1", "P2", "P3", "P4"]
ZoneRisk = Literal["Extreme", "High", "Moderate", "Low"]
ZoneStatus = Literal["Pending", "In Progress", "Partially Evacuated", "Evacuated"]
ShelterStatus = Literal["Active", "Full", "Inactive", "Closed"]
RouteStatus = Literal["Open", "Congested", "Blocked", "Flooded", "Cleared"]
RouteRisk = Literal["Low", "Moderate", "High", "Severe"]
VehicleType = Literal["Bus", "Ambulance", "Truck", "Boat", "Van"]
VehicleStatus = Literal["Available", "Assigned", "In Transit", "Maintenance"]
TeamStatus = Literal["Available", "Deployed", "Standby"]
ResourceAvailability = Literal["Available", "Low Stock", "Depleted"]
Strategy = Literal["greedy", "min-cost-flow"]
Facility = Literal["Medical", "Power", "Water", "Accessibility", "Pets", "Food", "Bedding"]


class LoginRequest(BaseModel):
    email: str
    password: str


class DisasterCreate(BaseModel):
    type: str = Field(min_length=2, max_length=50)
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None
    severity: DisasterSeverity = "High"
    status: DisasterStatus = "Active"


class DisasterUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    severity: DisasterSeverity | None = None
    status: DisasterStatus | None = None


class ZoneCreate(BaseModel):
    disaster_id: int
    name: str = Field(min_length=2, max_length=100)
    location: str = Field(min_length=2, max_length=200)
    state: str | None = None
    district: str | None = None
    population: int = Field(ge=0)
    priority: ZonePriority = "P2"
    risk_level: ZoneRisk = "High"
    code: str | None = Field(default=None, max_length=10)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class ZoneUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    state: str | None = None
    district: str | None = None
    population: int | None = Field(default=None, ge=0)
    priority: ZonePriority | None = None
    risk_level: ZoneRisk | None = None
    evacuated_count: int | None = Field(default=None, ge=0)
    status: ZoneStatus | None = None


class ShelterCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    location: str = Field(min_length=2, max_length=255)
    capacity: int = Field(gt=0)
    current_occupancy: int = Field(default=0, ge=0)
    facilities: str | None = None  # comma-separated in the request, stored one row per facility
    status: ShelterStatus = "Active"
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class ShelterUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    capacity: int | None = Field(default=None, gt=0)
    current_occupancy: int | None = Field(default=None, ge=0)
    facilities: str | None = None
    status: ShelterStatus | None = None
    latitude: float | None = None
    longitude: float | None = None


class StatusChange(BaseModel):
    status: str
    reason: str | None = Field(default=None, max_length=300)


class FacilityChange(BaseModel):
    facilities: list[Facility] = Field(min_length=1)
    availability: Literal["Available", "Limited", "Unavailable"]
    reason: str | None = None


class RouteCreate(BaseModel):
    zone_id: int
    shelter_id: int
    risk_level: RouteRisk = "Low"
    status: RouteStatus = "Open"
    via: list[str] = []
    distance_km: float | None = Field(default=None, gt=0)
    travel_time: float | None = Field(default=None, ge=0)


class RouteUpdate(BaseModel):
    distance_km: float | None = Field(default=None, gt=0)
    travel_time: float | None = Field(default=None, ge=0)
    risk_level: RouteRisk | None = None
    status: RouteStatus | None = None


class VehicleCreate(BaseModel):
    vehicle_type: VehicleType
    capacity: int = Field(gt=0)
    status: VehicleStatus = "Available"
    current_location: str
    plate_number: str | None = None
    team_id: int | None = None
    latitude: float | None = None
    longitude: float | None = None


class VehicleUpdate(BaseModel):
    vehicle_type: VehicleType | None = None
    capacity: int | None = Field(default=None, gt=0)
    status: VehicleStatus | None = None
    current_location: str | None = None
    plate_number: str | None = None
    team_id: int | None = None


class TeamCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    members_count: int = Field(gt=0)
    contact_number: str
    status: TeamStatus = "Available"
    current_location: str | None = None


class TeamUpdate(BaseModel):
    name: str | None = None
    members_count: int | None = Field(default=None, gt=0)
    contact_number: str | None = None
    status: TeamStatus | None = None
    current_location: str | None = None


class ResourceCreate(BaseModel):
    resource_type: str
    quantity: int = Field(ge=0)
    availability: ResourceAvailability = "Available"
    location: str | None = None
    per_person: float = Field(default=0, ge=0)


class ResourceUpdate(BaseModel):
    quantity: int | None = Field(default=None, ge=0)
    availability: ResourceAvailability | None = None
    location: str | None = None
    per_person: float | None = Field(default=None, ge=0)


class GeneratePlanRequest(BaseModel):
    strategy: Strategy = "min-cost-flow"


class OverrideRequest(BaseModel):
    shelter_id: int
    reason: str = Field(min_length=10, max_length=500)


class ReallocateRequest(BaseModel):
    """Compatible with the original backend's POST /evacuations/reallocate."""

    blocked_route_id: int | None = None
    full_shelter_id: int | None = None
    reason: str = Field(min_length=3)


class PickupRequest(BaseModel):
    household_ids: list[str] = Field(min_length=1)


class PositionReport(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CheckInRequest(BaseModel):
    token: str = Field(min_length=2)


class WalkInRequest(BaseModel):
    head_name: str = ""
    people: int = Field(ge=1, le=20)


class DrillControl(BaseModel):
    type: Literal["start", "pause", "resume", "speed", "replay", "reset", "end"]
    speed: int | None = Field(default=None, ge=1, le=32)


class DrillLoad(BaseModel):
    scenario_id: str


class DrillInject(BaseModel):
    kind: Literal[
        "RouteSegmentBlocked", "RouteSegmentCongested", "RouteSegmentCleared", "RouteBlocked", "FacilityLost", "ShelterClosed", "WalkIns"
    ]
    label: str = Field(min_length=3)
    segment: str | None = None
    route_id: int | None = None
    shelter_id: int | None = None
    facilities: list[Facility] | None = None
    people: int | None = Field(default=None, ge=1)
