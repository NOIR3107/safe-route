"""Master data (FR-01 to FR-05) and the status changes that trigger re-planning (FR-10).

Changing a route to Blocked/Flooded, closing a shelter, marking it Full or losing a facility all
re-plan the affected groups straight away; that is acceptance criterion 4 of the lab file.
"""

from __future__ import annotations

from app.engine.geo import path_length_km
from app.models import AffectedZone, Disaster, RescueTeam, Resource, Route, RouteSegment, Shelter, ShelterFacility, Vehicle
from app.repositories import Repos

from .context import Actor, ServiceError
from .logbook import audit, log_event, notify
from .planning import ReplanEvent, ReplanOptions, check_shelter_overflow, replan, retry_unallocated

# Legal status changes. Anything else is rejected with 409.
ROUTE_TRANSITIONS = {
    "Open": ("Congested", "Blocked", "Flooded"),
    "Congested": ("Open", "Blocked", "Flooded"),
    "Blocked": ("Cleared",),
    "Flooded": ("Cleared",),
    "Cleared": ("Open", "Congested", "Blocked", "Flooded"),
}
SHELTER_TRANSITIONS = {
    "Active": ("Full", "Closed"),
    "Full": ("Active", "Closed"),
    "Closed": ("Active",),
    "Inactive": ("Active",),
}


def _changes(obj, body: dict) -> dict:
    """Apply the fields that were sent and return what actually changed (for the audit log)."""
    changed = {}
    for k, v in body.items():
        if v is not None and getattr(obj, k) != v:
            setattr(obj, k, v)
            changed[k] = v
    return changed


def assert_shelter_scope(actor: Actor, shelter_id: int) -> None:
    if actor.role == "Shelter Manager" and actor.shelter_id != shelter_id:
        raise ServiceError(403, "Shelter Managers can only manage their own shelter.")


RISK_TO_SEVERITY = {"Extreme": 5, "High": 4, "Moderate": 3, "Low": 2}

# --------------------------------------------------------------------------- disasters and zones (FR-01, FR-02)


def create_disaster(repos: Repos, body: dict, actor: Actor) -> Disaster:
    d = repos.disasters.add(Disaster(**body, created_by=actor.user_id))
    log = audit(repos, actor, "CREATE_DISASTER", "Disaster", d.disaster_id, f"{d.type}: {d.title} ({d.severity})")
    notify(repos, "CRITICAL", f"{d.title}: incident declared ({d.severity}).", log=log)
    log_event(repos, "critical", "Incident declared", d.description or d.title)
    return d


def update_disaster(repos: Repos, disaster_id: int, body: dict, actor: Actor) -> Disaster:
    d = repos.disasters.get(disaster_id)
    if d is None:
        raise ServiceError(404, "Disaster not found")
    changed = _changes(d, body)
    audit(repos, actor, "UPDATE_DISASTER", "Disaster", disaster_id, str(changed))
    return d


def create_zone(repos: Repos, body: dict, actor: Actor) -> AffectedZone:
    if repos.disasters.get(body["disaster_id"]) is None:
        raise ServiceError(422, "disaster_id does not exist")
    code = (body.pop("code", None) or body["name"][:3]).upper()
    if repos.zones.by_code(code):
        raise ServiceError(409, f"Zone code {code} is already used")
    lat, lon = body.pop("latitude", None), body.pop("longitude", None)
    if lat is None or lon is None:
        raise ServiceError(422, "latitude and longitude are needed to place the zone on the map")
    polygon = body.pop("polygon", None) or _square(lat, lon, 0.6)
    severity = body.pop("severity", None) or RISK_TO_SEVERITY.get(body.get("risk_level", "High"), 3)
    z = repos.zones.add(AffectedZone(**body, code=code, severity=severity, centroid_lat=lat, centroid_lon=lon, polygon=polygon))
    audit(repos, actor, "CREATE_ZONE", "AffectedZone", z.zone_id, f"Registered zone {z.name} (pop {z.population})")
    log_event(repos, "warning", f"Zone {z.name} registered", f"{z.population} people · severity {z.severity}")
    return z


def _square(lat: float, lon: float, km: float) -> list[list[float]]:
    d_lat, d_lon = km / 111, km / 108
    return [[lat + d_lat, lon], [lat, lon + d_lon], [lat - d_lat, lon], [lat, lon - d_lon]]


def update_zone(repos: Repos, zone_id: int, body: dict, actor: Actor) -> AffectedZone:
    z = repos.zones.get(zone_id)
    if z is None:
        raise ServiceError(404, "Affected zone not found")
    if "risk_level" in body and body["risk_level"] and "severity" not in body:
        body["severity"] = RISK_TO_SEVERITY.get(body["risk_level"], z.severity)
    changed = _changes(z, body)
    if z.evacuated_count > z.population:
        raise ServiceError(422, "evacuated_count cannot exceed population")
    audit(repos, actor, "UPDATE_ZONE", "AffectedZone", zone_id, str(changed))
    return z


# --------------------------------------------------------------------------- shelters (FR-03)


def _set_facilities(repos: Repos, s: Shelter, names: list[str]) -> None:
    existing = {f.facility_type: f for f in s.facilities_list}
    s.facilities_list = [existing.get(n) or ShelterFacility(facility_type=n, availability_status="Available") for n in names]
    repos.flush()


def parse_facilities(text: str | None) -> list[str]:
    return [f.strip() for f in (text or "").split(",") if f.strip()]


def create_shelter(repos: Repos, body: dict, actor: Actor) -> Shelter:
    if actor.role == "Shelter Manager":
        raise ServiceError(403, "Shelter Managers cannot register new shelters.")
    facilities = parse_facilities(body.pop("facilities", None))
    if body.get("current_occupancy", 0) > body["capacity"]:
        raise ServiceError(422, "Occupancy cannot exceed capacity (chk_shelter_occupancy_lte_capacity)")
    s = repos.shelters.add(Shelter(**body))
    _set_facilities(repos, s, facilities)
    audit(repos, actor, "CREATE_SHELTER", "Shelter", s.shelter_id, f"Registered {s.name} (capacity {s.capacity})")
    retry_unallocated(repos, f"New shelter {s.name} opened", actor)
    return s


def update_shelter(repos: Repos, shelter_id: int, body: dict, actor: Actor) -> Shelter:
    assert_shelter_scope(actor, shelter_id)
    s = repos.shelters.get(shelter_id)
    if s is None:
        raise ServiceError(404, "Shelter not found")
    body.pop("status", None)  # status changes go through transition_shelter
    facilities = body.pop("facilities", None)
    new_cap = body.get("capacity") or s.capacity
    new_occ = body.get("current_occupancy") if body.get("current_occupancy") is not None else s.current_occupancy
    if new_occ > new_cap:
        raise ServiceError(422, "Occupancy cannot exceed capacity (chk_shelter_occupancy_lte_capacity)")
    changed = _changes(s, body)
    if facilities is not None:
        _set_facilities(repos, s, parse_facilities(facilities))
        changed["facilities"] = facilities
    audit(repos, actor, "UPDATE_SHELTER", "Shelter", shelter_id, str(changed))
    check_shelter_overflow(repos, shelter_id, actor, f"{s.name} capacity updated")
    return s


def transition_shelter(repos: Repos, shelter_id: int, status: str, reason: str | None, actor: Actor) -> Shelter:
    assert_shelter_scope(actor, shelter_id)
    s = repos.shelters.get(shelter_id)
    if s is None:
        raise ServiceError(404, "Shelter not found")
    if status not in SHELTER_TRANSITIONS.get(s.status, ()):
        raise ServiceError(409, f"Illegal transition {s.status} → {status}")
    label = (reason or "").strip() or f"{s.name} set to {status} by {actor.name}"
    s.status = status
    audit(repos, actor, "SHELTER_STATUS_CHANGE", "Shelter", shelter_id, label)
    if status in ("Closed", "Inactive"):
        notify(repos, "CRITICAL", f"{label}. Inbound groups will be re-planned.")
        log_event(repos, "critical", label, f"{s.name} {status.lower()}")
        replan(
            repos,
            ReplanOptions(
                event=ReplanEvent("ShelterClosed", label, shelter_id=shelter_id),
                trigger={"type": "ShelterClosed", "description": label, "shelter_id": shelter_id},
                actor=actor,
            ),
        )
    elif status == "Full":
        log_event(repos, "warning", label, f"{s.name} accepting no further planned arrivals")
        check_shelter_overflow(repos, shelter_id, actor, label)
    else:
        log_event(repos, "success", label, f"{s.name} accepting evacuees")
        retry_unallocated(repos, label, actor)
    return s


def set_facility_availability(repos: Repos, shelter_id: int, facilities: list[str], availability: str, label: str, actor: Actor) -> Shelter:
    """A facility goes down (power cut, medical unit offline) or comes back."""
    s = repos.shelters.get(shelter_id)
    if s is None:
        raise ServiceError(404, "Shelter not found")
    changed = [f.facility_type for f in s.facilities_list if f.facility_type in facilities and f.availability_status != availability]
    for f in s.facilities_list:
        if f.facility_type in changed:
            f.availability_status = availability
    if not changed:
        return s
    audit(repos, actor, "FACILITY_STATUS_CHANGE", "Shelter", shelter_id, f"{label}: {', '.join(changed)} → {availability}")
    if availability == "Unavailable":
        notify(repos, "CRITICAL", f"{label}. Groups that need {', '.join(changed).lower()} will be re-planned.")
        log_event(repos, "critical", label, f"{s.name}: {', '.join(changed)} unavailable")
        replan(
            repos,
            ReplanOptions(
                event=ReplanEvent("FacilityLost", label, shelter_id=shelter_id, facilities=changed),
                trigger={"type": "FacilityLost", "description": label, "shelter_id": shelter_id, "facilities": changed},
                actor=actor,
            ),
        )
    else:
        log_event(repos, "success", label, f"{s.name}: {', '.join(changed)} available again")
        retry_unallocated(repos, label, actor)
    return s


def add_walk_ins(repos: Repos, shelter_id: int, people: int, label: str, actor: Actor) -> Shelter:
    """Unregistered people arriving at a shelter use up its walk-in reserve (a drill or feed event)."""
    s = repos.shelters.get(shelter_id)
    if s is None:
        raise ServiceError(404, "Shelter not found")
    n = min(people, s.capacity - s.current_occupancy)
    s.current_occupancy += n
    s.walk_ins += n
    notify(repos, "WARNING", f"{label}. Walk-in reserve at {s.name} consumed.")
    log_event(repos, "warning", label, f"{s.name} occupancy now {s.current_occupancy}/{s.capacity}")
    check_shelter_overflow(repos, shelter_id, actor, f"{s.name} near capacity after {n} walk-ins")
    return s


# --------------------------------------------------------------------------- routes (FR-04)


def create_route(repos: Repos, body: dict, actor: Actor) -> Route:
    zone = repos.zones.get(body.pop("zone_id"))
    shelter = repos.shelters.get(body.pop("shelter_id"))
    if zone is None or shelter is None:
        raise ServiceError(422, "zone_id and shelter_id must exist")
    via = body.pop("via", None) or []
    path = [[zone.centroid_lat, zone.centroid_lon]]
    segments = []
    for i, name in enumerate(via):
        seg = repos.routes.segment_by_name(name)
        if seg is None:
            raise ServiceError(422, f"Unknown road segment {name!r}")
        segments.append(RouteSegment(position=i, segment_id=seg.segment_id))
        path.append([seg.latitude, seg.longitude])
    path.append([shelter.latitude or zone.centroid_lat, shelter.longitude or zone.centroid_lon])
    distance = body.pop("distance_km", None) or max(0.5, round(path_length_km([tuple(p) for p in path]) * 1.3, 1))
    travel = body.pop("travel_time", None) or max(4, round(distance / 20 * 60))
    r = repos.routes.add(
        Route(
            **body,
            disaster_id=zone.disaster_id,
            zone_id=zone.zone_id,
            shelter_id=shelter.shelter_id,
            source=zone.location,
            destination=shelter.location,
            distance_km=distance,
            travel_time=travel,
            path=path,
            geometry_source="schematic",
        )
    )
    r.segments = segments
    repos.flush()
    audit(repos, actor, "CREATE_ROUTE", "Route", r.route_id, f"{r.source} → {r.destination}")
    retry_unallocated(repos, f"New route R{r.route_id} opened", actor)
    return r


def update_route(repos: Repos, route_id: int, body: dict, actor: Actor) -> Route:
    r = repos.routes.get(route_id)
    if r is None:
        raise ServiceError(404, "Route not found")
    status = body.pop("status", None)
    changed = _changes(r, body)
    if changed:
        audit(repos, actor, "UPDATE_ROUTE", "Route", route_id, str(changed))
    if status and status != r.status:
        apply_route_status(repos, [route_id], status, f"Route R{route_id} set to {status}", actor)
    return r


def transition_route(repos: Repos, route_id: int, status: str, reason: str | None, actor: Actor) -> Route:
    r = repos.routes.get(route_id)
    if r is None:
        raise ServiceError(404, "Route not found")
    if status not in ROUTE_TRANSITIONS.get(r.status, ()):
        raise ServiceError(409, f"Illegal transition {r.status} → {status}")
    apply_route_status(repos, [route_id], status, (reason or "").strip() or f"{r.label} marked {status.lower()} by {actor.name}", actor)
    return r


def apply_route_status(repos: Repos, route_ids: list[int], status: str, label: str, actor: Actor) -> list[int]:
    """Set route status and run the matching re-planning event."""
    changed = []
    for rid in route_ids:
        r = repos.routes.get(rid)
        if r is None or r.status == status:
            continue
        r.status = status
        if status in ("Blocked", "Flooded"):
            r.risk_level = "Severe"
        changed.append(rid)
    if not changed:
        return []
    ids = ", R".join(map(str, changed))
    audit(repos, actor, "ROUTE_STATUS_CHANGE", "Route", changed[0], f"{label}: R{ids} → {status}")
    if status in ("Blocked", "Flooded"):
        notify(repos, "CRITICAL", f"{label}. {len(changed)} route{'s' if len(changed) > 1 else ''} now {status.lower()}.")
        log_event(repos, "critical", label, f"R{ids} {status.lower()}")
        replan(
            repos,
            ReplanOptions(
                event=ReplanEvent("RouteBlocked", label, route_ids=changed),
                trigger={"type": "RouteBlocked", "description": label, "route_ids": changed},
                actor=actor,
            ),
        )
    elif status == "Congested":
        notify(repos, "WARNING", f"{label}. Travel times on {len(changed)} route(s) up ~60%.")
        log_event(repos, "warning", label, f"R{ids} congested")
    else:
        notify(repos, "INFO", f"{label}. {len(changed)} route(s) usable again.")
        log_event(repos, "success", label, f"R{ids} {status.lower()}")
        retry_unallocated(repos, label, actor)
    return changed


def routes_via(repos: Repos, segment: str) -> list[Route]:
    return repos.routes.via_segment(segment)


# --------------------------------------------------------------------------- vehicles, teams, resources (FR-05, FR-09)


def create_vehicle(repos: Repos, body: dict, actor: Actor) -> Vehicle:
    disaster = repos.disasters.active()
    lat = body.pop("latitude", None) or 13.03
    lon = body.pop("longitude", None) or 80.24
    v = repos.vehicles.add(
        Vehicle(
            **body,
            disaster_id=disaster.disaster_id if disaster else None,
            depot_lat=lat,
            depot_lon=lon,
            position_lat=lat,
            position_lon=lon,
            position_source="depot",
        )
    )
    audit(repos, actor, "CREATE_VEHICLE", "Vehicle", v.vehicle_id, f"{v.vehicle_type} ({v.capacity} seats)")
    return v


def update_vehicle(repos: Repos, vehicle_id: int, body: dict, actor: Actor) -> Vehicle:
    v = repos.vehicles.get(vehicle_id)
    if v is None:
        raise ServiceError(404, "Vehicle not found")
    changed = _changes(v, body)
    audit(repos, actor, "UPDATE_VEHICLE", "Vehicle", vehicle_id, str(changed))
    return v


def create_team(repos: Repos, body: dict, actor: Actor) -> RescueTeam:
    t = repos.teams.add(RescueTeam(**body))
    audit(repos, actor, "CREATE_TEAM", "RescueTeam", t.team_id, t.name)
    return t


def update_team(repos: Repos, team_id: int, body: dict, actor: Actor) -> RescueTeam:
    t = repos.teams.get(team_id)
    if t is None:
        raise ServiceError(404, "Rescue team not found")
    changed = _changes(t, body)
    audit(repos, actor, "UPDATE_TEAM", "RescueTeam", team_id, str(changed))
    return t


def create_resource(repos: Repos, body: dict, actor: Actor) -> Resource:
    disaster = repos.disasters.active()
    r = repos.resources.add(Resource(**body, disaster_id=disaster.disaster_id if disaster else None))
    audit(repos, actor, "CREATE_RESOURCE", "Resource", r.resource_id, f"{r.resource_type}: {r.quantity}")
    return r


def update_resource(repos: Repos, resource_id: int, body: dict, actor: Actor) -> Resource:
    r = repos.resources.get(resource_id)
    if r is None:
        raise ServiceError(404, "Resource not found")
    changed = _changes(r, body)
    audit(repos, actor, "UPDATE_RESOURCE", "Resource", resource_id, str(changed))
    return r
