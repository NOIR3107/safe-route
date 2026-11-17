"""Master data endpoints: disasters, zones, shelters, routes, vehicles, teams, resources (FR-01..05)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.repositories import Repos
from app.schemas import requests as rq
from app.schemas.responses import Disaster, ResourceOut, RouteView, ShelterView, TeamView, VehicleView, ZoneView
from app.services import catalog
from app.services.context import Actor, ServiceError, iso
from app.services.views import PlanState, route_view, shelter_view, team_view, vehicle_view, zone_view

from .deps import commit_and_publish, current_actor, get_repos, require

# Every endpoint here needs a signed-in user; writes also need the right role.
router = APIRouter(tags=["Disasters, zones, shelters, routes, fleet (FR-01..05)"], dependencies=[Depends(current_actor)])


def run(fn):
    """Turn a broken business rule into the matching HTTP error."""
    try:
        return fn()
    except ServiceError as e:
        raise HTTPException(e.status, e.message) from e


def _zone_dict(z) -> dict:
    return {
        k: getattr(z, k)
        for k in (
            "zone_id",
            "disaster_id",
            "name",
            "location",
            "state",
            "district",
            "population",
            "priority",
            "risk_level",
            "evacuated_count",
            "status",
        )
    }


def disaster_dict(d) -> dict:
    return {
        "disaster_id": d.disaster_id,
        "type": d.type,
        "title": d.title,
        "description": d.description,
        "severity": d.severity,
        "status": d.status,
        "start_date": iso(d.start_date),
        "end_date": iso(d.end_date),
        "created_at": iso(d.created_at),
        "zones": [_zone_dict(z) for z in d.zones],
    }


# --------------------------------------------------------------------------- disasters (FR-01)


@router.get("/disasters", response_model=list[Disaster])
def list_disasters(repos: Repos = Depends(get_repos)):
    return [disaster_dict(d) for d in repos.disasters.list()]


@router.post("/disasters", response_model=Disaster, status_code=201)
def create_disaster(body: rq.DisasterCreate, actor: Actor = Depends(require("disaster:write")), repos: Repos = Depends(get_repos)):
    d = run(lambda: catalog.create_disaster(repos, body.model_dump(), actor))
    commit_and_publish(repos)
    return disaster_dict(d)


@router.put("/disasters/{disaster_id}", response_model=Disaster)
def update_disaster(
    disaster_id: int, body: rq.DisasterUpdate, actor: Actor = Depends(require("disaster:write")), repos: Repos = Depends(get_repos)
):
    d = run(lambda: catalog.update_disaster(repos, disaster_id, body.model_dump(exclude_none=True), actor))
    commit_and_publish(repos)
    return disaster_dict(d)


# --------------------------------------------------------------------------- zones (FR-02)


@router.get("/zones", response_model=list[ZoneView])
def list_zones(repos: Repos = Depends(get_repos)):
    state = PlanState(repos)
    return [zone_view(state, z) for z in repos.zones.list()]


@router.post("/zones", response_model=ZoneView, status_code=201)
def create_zone(body: rq.ZoneCreate, actor: Actor = Depends(require("zone:write")), repos: Repos = Depends(get_repos)):
    z = run(lambda: catalog.create_zone(repos, body.model_dump(), actor))
    commit_and_publish(repos)
    return zone_view(PlanState(repos), z)


@router.put("/zones/{zone_id}", response_model=ZoneView)
def update_zone(zone_id: int, body: rq.ZoneUpdate, actor: Actor = Depends(require("zone:write")), repos: Repos = Depends(get_repos)):
    z = run(lambda: catalog.update_zone(repos, zone_id, body.model_dump(exclude_none=True), actor))
    commit_and_publish(repos)
    return zone_view(PlanState(repos), z)


# --------------------------------------------------------------------------- shelters (FR-03)


@router.get("/shelters", response_model=list[ShelterView])
def list_shelters(repos: Repos = Depends(get_repos), actor: Actor = Depends(current_actor)):
    """Shelter Managers only see their own shelter."""
    state = PlanState(repos)
    rows = repos.shelters.list()
    if actor.role == "Shelter Manager":
        rows = [s for s in rows if s.shelter_id == actor.shelter_id]
    return [shelter_view(state, s) for s in rows]


@router.post("/shelters", response_model=ShelterView, status_code=201)
def create_shelter(body: rq.ShelterCreate, actor: Actor = Depends(require("shelter:write")), repos: Repos = Depends(get_repos)):
    s = run(lambda: catalog.create_shelter(repos, body.model_dump(), actor))
    commit_and_publish(repos)
    return shelter_view(PlanState(repos), s)


@router.put("/shelters/{shelter_id}", response_model=ShelterView)
def update_shelter(
    shelter_id: int, body: rq.ShelterUpdate, actor: Actor = Depends(require("shelter:write")), repos: Repos = Depends(get_repos)
):
    s = run(lambda: catalog.update_shelter(repos, shelter_id, body.model_dump(exclude_none=True), actor))
    commit_and_publish(repos)
    return shelter_view(PlanState(repos), s)


@router.post("/shelters/{shelter_id}/status", response_model=ShelterView)
def shelter_status(
    shelter_id: int, body: rq.StatusChange, actor: Actor = Depends(require("shelter:write")), repos: Repos = Depends(get_repos)
):
    """Open / Full / Closed. Closing or filling a shelter re-plans its inbound groups (FR-10)."""
    s = run(lambda: catalog.transition_shelter(repos, shelter_id, body.status, body.reason, actor))
    commit_and_publish(repos)
    return shelter_view(PlanState(repos), s)


@router.post("/shelters/{shelter_id}/facilities", response_model=ShelterView)
def shelter_facilities(
    shelter_id: int, body: rq.FacilityChange, actor: Actor = Depends(require("shelter:write")), repos: Repos = Depends(get_repos)
):
    def go():
        catalog.assert_shelter_scope(actor, shelter_id)
        label = body.reason or f"Facilities {', '.join(body.facilities)} {body.availability.lower()}"
        return catalog.set_facility_availability(repos, shelter_id, list(body.facilities), body.availability, label, actor)

    s = run(go)
    commit_and_publish(repos)
    return shelter_view(PlanState(repos), s)


# --------------------------------------------------------------------------- routes (FR-04)


@router.get("/routes", response_model=list[RouteView])
def list_routes(repos: Repos = Depends(get_repos)):
    return [route_view(r) for r in repos.routes.list()]


@router.get("/routes/segments")
def list_segments(repos: Repos = Depends(get_repos)) -> list[dict]:
    return [{"segment_id": s.segment_id, "name": s.name, "latitude": s.latitude, "longitude": s.longitude} for s in repos.routes.segments()]


@router.post("/routes", response_model=RouteView, status_code=201)
def create_route(body: rq.RouteCreate, actor: Actor = Depends(require("route:write")), repos: Repos = Depends(get_repos)):
    r = run(lambda: catalog.create_route(repos, body.model_dump(), actor))
    commit_and_publish(repos)
    return route_view(r)


@router.put("/routes/{route_id}", response_model=RouteView)
def update_route(route_id: int, body: rq.RouteUpdate, actor: Actor = Depends(require("route:status")), repos: Repos = Depends(get_repos)):
    r = run(lambda: catalog.update_route(repos, route_id, body.model_dump(exclude_none=True), actor))
    commit_and_publish(repos)
    return route_view(r)


@router.post("/routes/{route_id}/status", response_model=RouteView)
def route_status(route_id: int, body: rq.StatusChange, actor: Actor = Depends(require("route:status")), repos: Repos = Depends(get_repos)):
    """Blocking or flooding a route re-plans every group using it (FR-10)."""
    r = run(lambda: catalog.transition_route(repos, route_id, body.status, body.reason, actor))
    commit_and_publish(repos)
    return route_view(r)


# --------------------------------------------------------------------------- vehicles and teams (FR-05)


def _vehicle_views(repos: Repos, vehicles) -> list[dict]:
    state = PlanState(repos)
    routes = {r.route_id: r for r in repos.routes.list()}
    return [vehicle_view(state, v, routes) for v in vehicles]


@router.get("/vehicles", response_model=list[VehicleView])
def list_vehicles(repos: Repos = Depends(get_repos)):
    return _vehicle_views(repos, repos.vehicles.list())


@router.post("/vehicles", response_model=VehicleView, status_code=201)
def create_vehicle(body: rq.VehicleCreate, actor: Actor = Depends(require("vehicle:write")), repos: Repos = Depends(get_repos)):
    v = run(lambda: catalog.create_vehicle(repos, body.model_dump(), actor))
    commit_and_publish(repos)
    return _vehicle_views(repos, [v])[0]


@router.put("/vehicles/{vehicle_id}", response_model=VehicleView)
def update_vehicle(
    vehicle_id: int, body: rq.VehicleUpdate, actor: Actor = Depends(require("vehicle:status")), repos: Repos = Depends(get_repos)
):
    v = run(lambda: catalog.update_vehicle(repos, vehicle_id, body.model_dump(exclude_none=True), actor))
    commit_and_publish(repos)
    return _vehicle_views(repos, [v])[0]


@router.get("/rescue-teams", response_model=list[TeamView])
def list_teams(repos: Repos = Depends(get_repos)):
    vehicles = repos.vehicles.list()
    return [team_view(t, vehicles) for t in repos.teams.list()]


@router.post("/rescue-teams", response_model=TeamView, status_code=201)
def create_team(body: rq.TeamCreate, actor: Actor = Depends(require("team:write")), repos: Repos = Depends(get_repos)):
    t = run(lambda: catalog.create_team(repos, body.model_dump(), actor))
    commit_and_publish(repos)
    return team_view(t, repos.vehicles.list())


@router.put("/rescue-teams/{team_id}", response_model=TeamView)
def update_team(team_id: int, body: rq.TeamUpdate, actor: Actor = Depends(require("team:status")), repos: Repos = Depends(get_repos)):
    t = run(lambda: catalog.update_team(repos, team_id, body.model_dump(exclude_none=True), actor))
    commit_and_publish(repos)
    return team_view(t, repos.vehicles.list())


# --------------------------------------------------------------------------- resources


def _resource_dict(r) -> dict:
    return {k: getattr(r, k) for k in ("resource_id", "resource_type", "quantity", "availability", "location", "per_person")}


@router.get("/resources", response_model=list[ResourceOut])
def list_resources(repos: Repos = Depends(get_repos)):
    return [_resource_dict(r) for r in repos.resources.list()]


@router.post("/resources", response_model=ResourceOut, status_code=201)
def create_resource(body: rq.ResourceCreate, actor: Actor = Depends(require("resource:write")), repos: Repos = Depends(get_repos)):
    r = run(lambda: catalog.create_resource(repos, body.model_dump(), actor))
    commit_and_publish(repos)
    return _resource_dict(r)


@router.put("/resources/{resource_id}", response_model=ResourceOut)
def update_resource(
    resource_id: int, body: rq.ResourceUpdate, actor: Actor = Depends(require("resource:write")), repos: Repos = Depends(get_repos)
):
    r = run(lambda: catalog.update_resource(repos, resource_id, body.model_dump(exclude_none=True), actor))
    commit_and_publish(repos)
    return _resource_dict(r)
