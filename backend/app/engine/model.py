"""What the allocation engine works on.

The engine never sees database rows or HTTP requests. The services layer turns its data into these
plain objects first, which is what lets the engine be unit tested on its own (Experiment 4).
"""

from __future__ import annotations

from dataclasses import dataclass, field

LatLng = tuple[float, float]

FACILITIES = ("Medical", "Power", "Water", "Accessibility", "Pets", "Food", "Bedding")


@dataclass
class EngineZone:
    zone_id: int
    name: str
    severity: int  # 1..5
    centroid: LatLng
    priority: str  # P1..P4
    risk_level: str  # Extreme / High / Moderate / Low
    population: int
    evacuated_count: int
    # People in the zone still waiting who are elderly, disabled, children or need medical care.
    vulnerable_people: int = 0


@dataclass
class EngineHousehold:
    household_id: str
    zone_id: int
    size: int
    needs: list[str]  # hard requirements, e.g. ["Medical", "Accessibility"]
    wants_pets: bool
    high_priority: bool
    vulnerable: int = 0  # elderly + disabled + children + medical members
    # Only set while re-planning:
    previous_shelter_id: int | None = None
    en_route_vehicle_ids: list[int] = field(default_factory=list)


@dataclass
class EngineShelter:
    shelter_id: int
    name: str
    open: bool
    capacity: int
    committed: int  # people present + inbound on assignments that are not being re-planned
    reserved: int  # walk-in buffer the planner must not use
    available_facilities: list[str]
    degraded_facilities: list[str]
    position: LatLng
    closed_reason: str | None = None


@dataclass
class EngineRoute:
    route_id: int
    zone_id: int
    shelter_id: int
    label: str
    via: list[str]
    distance_km: float
    travel_time: float
    risk_level: str
    status: str


@dataclass
class EngineVehicle:
    vehicle_id: int
    vehicle_type: str
    capacity: int
    position: LatLng


@dataclass
class EngineInput:
    zones: list[EngineZone]
    households: list[EngineHousehold]
    shelters: list[EngineShelter]
    routes: list[EngineRoute]
    vehicles: list[EngineVehicle]  # free to dispatch
    busy_vehicles: list[EngineVehicle] = field(default_factory=list)  # already carrying en-route households


@dataclass
class DemandGroup:
    """Households of one zone that share hard needs and re-planning context."""

    key: str
    zone: EngineZone
    households: list[EngineHousehold]
    people: int
    needs: list[str]
    pet_share: float
    high_priority_people: int
    previous_shelter_id: int | None
    en_route_vehicle_ids: list[int]
    priority_score: float
