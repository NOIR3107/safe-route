"""Response models. Field names match frontend/src/api/schemas.ts and extensions.ts exactly, so the
React app's zod validation and the OpenAPI docs at /docs describe the same thing."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

LatLng = list[float]


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int
    name: str


class UserScope(BaseModel):
    user_id: int
    shelter_id: int | None
    team_id: int | None
    zone_ids: list[int] | None = None


class SessionUser(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    scope: UserScope


class UserOut(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    phone_number: str | None
    is_active: bool
    created_at: str


class DemoAccount(BaseModel):
    email: str
    password: str
    role: str
    name: str


class Zone(BaseModel):
    zone_id: int
    disaster_id: int
    name: str
    location: str
    state: str | None
    district: str | None
    population: int
    priority: str
    risk_level: str
    evacuated_count: int
    status: str


class Disaster(BaseModel):
    disaster_id: int
    type: str
    title: str
    description: str | None
    severity: str
    status: str
    start_date: str
    end_date: str | None
    created_at: str
    zones: list[Zone]


class ZoneExt(BaseModel):
    zone_id: int
    code: str
    severity: int
    centroid: LatLng
    polygon: list[LatLng]


class Vulnerable(BaseModel):
    elderly: int
    disabled: int
    medical: int
    children: int


class ZoneView(Zone):
    ext: ZoneExt
    household_count: int
    vulnerable: Vulnerable
    remaining: int


class Facility(BaseModel):
    facility_id: int
    shelter_id: int
    facility_type: str
    capacity: int | None
    availability_status: str


class ShelterExt(BaseModel):
    shelter_id: int
    reserved_pct: float
    walk_ins: int


class ShelterView(BaseModel):
    shelter_id: int
    name: str
    location: str
    capacity: int
    current_occupancy: int
    facilities: str | None
    status: str
    latitude: float | None
    longitude: float | None
    available_capacity: int | None
    facilities_list: list[Facility]
    ext: ShelterExt
    reserved: int
    inbound: int
    available: int
    available_facilities: list[str]
    display_status: str
    utilization: float


class RouteExt(BaseModel):
    route_id: int
    zone_id: int
    shelter_id: int
    path: list[LatLng]
    via: list[str]
    geometry_source: str


class RouteView(BaseModel):
    route_id: int
    source: str
    destination: str
    distance_km: float
    travel_time: float
    risk_level: str
    status: str
    ext: RouteExt


class VehicleExt(BaseModel):
    vehicle_id: int
    team_id: int | None
    depot: LatLng
    position: LatLng
    position_source: str


class VehicleView(BaseModel):
    vehicle_id: int
    vehicle_type: str
    capacity: int
    status: str
    current_location: str
    plate_number: str | None
    ext: VehicleExt
    assignment_id: int | None


class TeamView(BaseModel):
    team_id: int
    name: str
    members_count: int
    contact_number: str
    status: str
    current_location: str | None
    plan_id: int | None
    vehicle_ids: list[int]


class ResourceOut(BaseModel):
    resource_id: int
    resource_type: str
    quantity: int
    availability: str
    location: str | None
    per_person: float


class VehicleAssignmentOut(BaseModel):
    vehicle_assignment_id: int
    assignment_id: int
    vehicle_id: int
    departure_time: str | None
    arrival_time: str | None
    status: str


class AssignmentRow(BaseModel):
    assignment_id: int
    plan_id: int
    zone_id: int
    shelter_id: int
    route_id: int | None
    people_count: int
    status: str
    created_at: str
    vehicle_assignments: list[VehicleAssignmentOut]


class AssignmentExt(BaseModel):
    assignment_id: int
    household_ids: list[str]
    eta_minutes: int
    dispatch_minute: int
    approach_minutes: int
    vehicle_ids: list[int]
    explanation: dict[str, Any]
    approval: str
    override_reason: str | None
    version: int


class AssignmentView(AssignmentRow):
    ext: AssignmentExt
    zone_name: str
    shelter_name: str
    route_label: str | None
    severity: int


class PlanVersionOut(BaseModel):
    version: int
    plan_id: int
    created_at: str
    sim_minute: int
    trigger: dict[str, Any]
    strategy: str
    status: str
    assignment_ids: list[int]
    unallocated: list[dict[str, Any]]
    metrics: dict[str, Any]
    diff: dict[str, Any] | None
    approved_by: str | None
    approved_at: str | None


class PlanView(BaseModel):
    plan_id: int
    disaster_id: int
    name: str
    priority: str
    created_by: int
    status: str
    created_at: str
    updated_at: str
    assignments: list[AssignmentRow]
    versions: list[PlanVersionOut]
    current_version: PlanVersionOut | None


class ResourceAllocationOut(BaseModel):
    shelter_id: int
    shelter_name: str
    resource_id: int
    resource_type: str
    quantity: int


class Household(BaseModel):
    household_id: str
    zone_id: int | None
    token: str
    head_name: str
    phone: str
    members: list[str]
    size: int
    elderly: int
    children: int
    disabled: int
    medical: int
    pets: bool
    status: str
    shelter_id: int | None
    walk_in: bool


class CheckInResult(BaseModel):
    ok: bool
    message: str
    household: Household | None


class Roster(BaseModel):
    expected: list[Household]
    present: list[Household]


class NotificationOut(BaseModel):
    notification_id: int
    user_id: int | None
    message: str
    type: str
    status: str
    timestamp: str


class AuditLogOut(BaseModel):
    log_id: int
    user_id: int | None
    action: str
    entity_type: str | None
    entity_id: int | None
    details: str | None
    timestamp: str


class OpsEventOut(BaseModel):
    id: int
    sim_minute: int
    timestamp: str
    level: str
    title: str
    detail: str


class FeedStatus(BaseModel):
    source: str | None  # e.g. "replay", "osrm", "field-devices"; None = no feed configured
    last_received_at: str | None
    seconds_since: float | None
    stale: bool
    messages: int
    replay: bool


class Clock(BaseModel):
    mode: str  # live | drill
    sim_minute: int
    phase: str
    speed: int
    server_time: str
    feed: FeedStatus


class DrillState(BaseModel):
    scenario_id: str | None
    phase: str
    sim_minute: int
    speed: int
    timeline: list[dict[str, Any]]
    fired_event_ids: list[str]
    has_snapshot: bool
    mode: str
    duration_minutes: int
    synthetic: bool


class ScenarioSummary(BaseModel):
    id: str
    name: str
    description: str
    duration_minutes: int
    events: list[dict[str, Any]]


class DashboardSummary(BaseModel):
    disasters: dict[str, int]
    population: dict[str, float]
    shelters: dict[str, float]
    logistics: dict[str, int]
    plans: dict[str, int]


class IngestResult(BaseModel):
    accepted: int
    rejected: int
    errors: list[str]
