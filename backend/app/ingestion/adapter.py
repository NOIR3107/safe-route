"""Ingestion adapter: applies validated feed messages through the normal services.

Feed -> Pydantic validation (schemas.py) -> this adapter -> services -> repositories -> PostgreSQL,
then the API pushes a WebSocket "changed" message. The browser never reads the raw feed.
"""

from __future__ import annotations

from app.models import IngestLog
from app.repositories import Repos
from app.services import catalog, operations
from app.services.context import Actor, ServiceError

from .schemas import (
    ArrivalMsg,
    FacilityStatusMsg,
    PickupMsg,
    RouteGeometryMsg,
    RouteStatusMsg,
    ShelterOccupancyMsg,
    ShelterStatusMsg,
    VehiclePositionMsg,
    WalkInsMsg,
)

# A feed is trusted once its X-Ingest-Token checks out, so it may change any shelter or route.
FEED_ADMIN = Actor(user_id=None, name="Live feed", role="Admin")


def apply_message(repos: Repos, msg) -> None:
    if isinstance(msg, RouteStatusMsg):
        routes = [repos.routes.get(msg.route_id)] if msg.route_id else catalog.routes_via(repos, msg.segment)
        routes = [r for r in routes if r is not None]
        if not routes:
            raise ServiceError(404, f"No route matches {msg.route_id or msg.segment!r}")
        label = msg.reason or f"{msg.segment or f'R{msg.route_id}'} reported {msg.status.lower()}"
        catalog.apply_route_status(repos, [r.route_id for r in routes], msg.status, label, FEED_ADMIN)
    elif isinstance(msg, ShelterStatusMsg):
        s = repos.shelters.get(msg.shelter_id)
        if s is None:
            raise ServiceError(404, f"Shelter {msg.shelter_id} not found")
        if s.status != msg.status:
            catalog.transition_shelter(repos, msg.shelter_id, msg.status, msg.reason, FEED_ADMIN)
    elif isinstance(msg, ShelterOccupancyMsg):
        s = repos.shelters.get(msg.shelter_id)
        if s is None:
            raise ServiceError(404, f"Shelter {msg.shelter_id} not found")
        catalog.update_shelter(repos, msg.shelter_id, {"current_occupancy": min(msg.occupancy, s.capacity)}, FEED_ADMIN)
    elif isinstance(msg, WalkInsMsg):
        catalog.add_walk_ins(repos, msg.shelter_id, msg.people, msg.reason or f"{msg.people} walk-ins reported", FEED_ADMIN)
    elif isinstance(msg, FacilityStatusMsg):
        label = msg.reason or f"Facilities {', '.join(msg.facilities)} {msg.availability.lower()}"
        catalog.set_facility_availability(repos, msg.shelter_id, list(msg.facilities), msg.availability, label, FEED_ADMIN)
    elif isinstance(msg, VehiclePositionMsg):
        operations.report_position(repos, msg.vehicle_id, msg.latitude, msg.longitude, FEED_ADMIN)
    elif isinstance(msg, PickupMsg):
        operations.mark_picked_up(repos, msg.assignment_id, msg.household_ids, FEED_ADMIN)
    elif isinstance(msg, ArrivalMsg):
        operations.mark_arrived(repos, msg.assignment_id, FEED_ADMIN)
    elif isinstance(msg, RouteGeometryMsg):
        r = repos.routes.get(msg.route_id)
        if r is None:
            raise ServiceError(404, f"Route {msg.route_id} not found")
        r.path = [list(p) for p in msg.path]
        r.distance_km = round(msg.distance_km, 2)
        r.travel_time = round(msg.travel_time, 1)
        r.geometry_source = msg.source
    else:  # pragma: no cover - the discriminated union makes this unreachable
        raise ServiceError(422, f"Unsupported message {msg!r}")


def ingest(repos: Repos, source: str, messages: list) -> tuple[int, list[str]]:
    """Apply each message on its own savepoint, so one bad message does not drop the batch."""
    accepted, errors = 0, []
    for msg in messages:
        payload = msg.model_dump(mode="json")
        sp = repos.db.begin_nested()
        try:
            apply_message(repos, msg)
            sp.commit()
            repos.ingest.add(IngestLog(source=source, kind=msg.kind, payload=payload, applied=True))
            accepted += 1
        except ServiceError as e:
            sp.rollback()
            repos.ingest.add(IngestLog(source=source, kind=msg.kind, payload=payload, applied=False, error=e.message))
            errors.append(f"{msg.kind}: {e.message}")
    return accepted, errors
