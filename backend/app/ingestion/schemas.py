"""What a live feed may send. Every message is validated here before it touches the database.

One envelope can carry many messages:
    {"source": "field-devices", "messages": [{"kind": "route_status", "segment": "Thiru Vi Ka Bridge",
                                              "status": "Flooded", "reason": "River overtops"}]}
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

RouteStatus = Literal["Open", "Congested", "Blocked", "Flooded", "Cleared"]
ShelterStatus = Literal["Active", "Full", "Inactive", "Closed"]
Facility = Literal["Medical", "Power", "Water", "Accessibility", "Pets", "Food", "Bedding"]


class RouteStatusMsg(BaseModel):
    kind: Literal["route_status"]
    route_id: int | None = None
    segment: str | None = None  # every route over this named road / bridge
    status: RouteStatus
    reason: str | None = None

    @model_validator(mode="after")
    def one_target(self):
        if (self.route_id is None) == (self.segment is None):
            raise ValueError("give exactly one of route_id or segment")
        return self


class ShelterStatusMsg(BaseModel):
    kind: Literal["shelter_status"]
    shelter_id: int
    status: ShelterStatus
    reason: str | None = None


class ShelterOccupancyMsg(BaseModel):
    """Head count at the shelter door (people present now)."""

    kind: Literal["shelter_occupancy"]
    shelter_id: int
    occupancy: int = Field(ge=0)


class WalkInsMsg(BaseModel):
    kind: Literal["walk_ins"]
    shelter_id: int
    people: int = Field(ge=1, le=5000)
    reason: str | None = None


class FacilityStatusMsg(BaseModel):
    kind: Literal["facility_status"]
    shelter_id: int
    facilities: list[Facility] = Field(min_length=1)
    availability: Literal["Available", "Limited", "Unavailable"]
    reason: str | None = None


class VehiclePositionMsg(BaseModel):
    kind: Literal["vehicle_position"]
    vehicle_id: int
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PickupMsg(BaseModel):
    kind: Literal["pickup_confirmed"]
    assignment_id: int
    household_ids: list[str] = Field(min_length=1)


class ArrivalMsg(BaseModel):
    kind: Literal["arrival_confirmed"]
    assignment_id: int


class RouteGeometryMsg(BaseModel):
    """Road geometry and travel time from a routing service (OSRM, as used by god's-eye-view)."""

    kind: Literal["route_geometry"]
    route_id: int
    path: list[tuple[float, float]] = Field(min_length=2)
    distance_km: float = Field(gt=0)
    travel_time: float = Field(ge=0)  # minutes
    source: Literal["osrm"] = "osrm"


FeedMessage = Annotated[
    RouteStatusMsg
    | ShelterStatusMsg
    | ShelterOccupancyMsg
    | WalkInsMsg
    | FacilityStatusMsg
    | VehiclePositionMsg
    | PickupMsg
    | ArrivalMsg
    | RouteGeometryMsg,
    Field(discriminator="kind"),
]


class FeedBatch(BaseModel):
    source: str = Field(min_length=2, max_length=40)
    messages: list[FeedMessage] = Field(min_length=1, max_length=500)
