"""Read side: turns rows into the JSON the React app shows. No writes in here.

`PlanState` loads the current plan version, its assignments and the households once per request,
so building a list of 58 vehicles does not run 58 queries.
"""

from __future__ import annotations

import math
from functools import cached_property

from app.core.config import get_planning_config
from app.engine import shelter_display_status
from app.engine.geo import point_along
from app.models import (
    AffectedZone,
    EvacuationAssignment,
    Household,
    RescueTeam,
    Route,
    Shelter,
    Vehicle,
)
from app.repositories import Repos

from .clock import now_minute
from .context import iso


class PlanState:
    """Cached view of the current plan for one request."""

    def __init__(self, repos: Repos) -> None:
        self.repos = repos

    @cached_property
    def plan(self):
        return self.repos.plans.current_plan()

    @cached_property
    def version(self):
        return self.repos.plans.current_version(self.plan) if self.plan else None

    @cached_property
    def assignments(self) -> list[EvacuationAssignment]:
        return self.repos.plans.version_assignments(self.version)

    @cached_property
    def movable(self) -> list[EvacuationAssignment]:
        return [a for a in self.assignments if a.status in ("Scheduled", "In Progress")]

    @cached_property
    def households(self) -> dict[str, Household]:
        return {h.household_id: h for h in self.repos.households.list()}

    @cached_property
    def minute(self) -> int:
        return now_minute(self.repos)

    def refresh(self) -> None:
        for name in ("plan", "version", "assignments", "movable", "households", "minute"):
            self.__dict__.pop(name, None)

    # ---- derived numbers

    def inbound_for(self, shelter_id: int, exclude: set[str] | None = None) -> int:
        """People on movable assignments to this shelter who have not arrived yet."""
        n = 0
        for a in self.movable:
            if a.shelter_id != shelter_id:
                continue
            for hid in a.household_ids:
                h = self.households.get(hid)
                if h is None or h.delivered or (exclude and hid in exclude):
                    continue
                n += h.size
        return n

    def assignment_for_household(self, household_id: str) -> EvacuationAssignment | None:
        return next((a for a in self.assignments if household_id in a.household_ids), None)


def household_view(h: Household) -> dict:
    return {
        "household_id": h.household_id,
        "zone_id": h.zone_id,
        "token": h.token,
        "head_name": h.head_name,
        "phone": h.phone,
        "members": [m.name for m in h.members],
        "size": h.size,
        "elderly": h.elderly,
        "children": h.children,
        "disabled": h.disabled,
        "medical": h.medical,
        "pets": h.pets,
        "status": h.status,
        "shelter_id": h.shelter_id,
        "walk_in": h.walk_in,
    }


def reserved_total(s: Shelter) -> int:
    return math.ceil(s.capacity * s.reserved_pct)


def reserved_remaining(s: Shelter) -> int:
    return max(0, reserved_total(s) - s.walk_ins)


# --------------------------------------------------------------------------- shelters


def shelter_view(state: PlanState, s: Shelter) -> dict:
    cfg = get_planning_config()
    inbound = state.inbound_for(s.shelter_id)
    available = max(0, s.capacity - s.current_occupancy - reserved_remaining(s) - inbound)
    facilities = [f.facility_type for f in s.facilities_list]
    return {
        "shelter_id": s.shelter_id,
        "name": s.name,
        "location": s.location,
        "capacity": s.capacity,
        "current_occupancy": s.current_occupancy,
        "facilities": ",".join(facilities),
        "status": s.status,
        "latitude": s.latitude,
        "longitude": s.longitude,
        "available_capacity": available,
        "facilities_list": [
            {
                "facility_id": f.facility_id,
                "shelter_id": f.shelter_id,
                "facility_type": f.facility_type,
                "capacity": f.capacity,
                "availability_status": f.availability_status,
            }
            for f in s.facilities_list
        ],
        "ext": {"shelter_id": s.shelter_id, "reserved_pct": s.reserved_pct, "walk_ins": s.walk_ins},
        "reserved": reserved_total(s),
        "inbound": inbound,
        "available": available,
        "available_facilities": s.available_facilities(),
        "display_status": shelter_display_status(s.status, s.capacity, s.current_occupancy, inbound, cfg),
        "utilization": s.current_occupancy / s.capacity,
    }


# --------------------------------------------------------------------------- zones


def zone_view(state: PlanState, z: AffectedZone) -> dict:
    hhs = [h for h in state.households.values() if h.zone_id == z.zone_id]
    return {
        "zone_id": z.zone_id,
        "disaster_id": z.disaster_id,
        "name": z.name,
        "location": z.location,
        "state": z.state,
        "district": z.district,
        "population": z.population,
        "priority": z.priority,
        "risk_level": z.risk_level,
        "evacuated_count": z.evacuated_count,
        "status": z.status,
        "ext": {
            "zone_id": z.zone_id,
            "code": z.code,
            "severity": z.severity,
            "centroid": [z.centroid_lat, z.centroid_lon],
            "polygon": z.polygon,
        },
        "household_count": len(hhs),
        "vulnerable": {
            "elderly": sum(h.elderly for h in hhs),
            "disabled": sum(h.disabled for h in hhs),
            "medical": sum(h.medical for h in hhs),
            "children": sum(h.children for h in hhs),
        },
        # People in the zone not yet at a shelter (what the map drawer shows as "remaining").
        "remaining": sum(h.size for h in hhs if not h.delivered),
    }


# --------------------------------------------------------------------------- routes, fleet


def route_view(r: Route) -> dict:
    return {
        "route_id": r.route_id,
        "source": r.source,
        "destination": r.destination,
        "distance_km": r.distance_km,
        "travel_time": r.travel_time,
        "risk_level": r.risk_level,
        "status": r.status,
        "ext": {
            "route_id": r.route_id,
            "zone_id": r.zone_id,
            "shelter_id": r.shelter_id,
            "path": r.path,
            "via": r.via,
            "geometry_source": r.geometry_source,
        },
    }


def _lerp(a: tuple[float, float], b: tuple[float, float], f: float) -> tuple[float, float]:
    t = min(1.0, max(0.0, f))
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def vehicle_position(state: PlanState, v: Vehicle, routes: dict[int, Route]) -> tuple[tuple[float, float], int | None, str]:
    """Where a vehicle is: a recent GPS report if there is one, otherwise an estimate from its
    assignment's trip timeline (approach, load, drive, return), otherwise where it is parked."""
    for a in state.movable:
        if v.vehicle_id not in a.vehicle_ids:
            continue
        if v.position_source == "gps":
            return (v.position_lat, v.position_lon), a.assignment_id, "gps"
        route = routes.get(a.route_id) if a.route_id else None
        path = route.path if route else None
        if not path:
            break
        t = state.minute - a.dispatch_minute
        home = (v.position_lat, v.position_lon)
        if t < a.approach_minutes:
            f = t / a.approach_minutes if a.approach_minutes > 0 else 1
            return _lerp(home, tuple(path[0]), max(0.0, f)), a.assignment_id, "estimated"
        cycle = 5 + 2 * a.travel_minutes
        tt = t - a.approach_minutes
        k = tt // max(1, cycle)
        within = tt - k * cycle
        if k >= a.trips:
            return tuple(path[-1]), a.assignment_id, "estimated"
        if within < 5:
            return tuple(path[0]), a.assignment_id, "estimated"
        if within < 5 + a.travel_minutes:
            return point_along(path, (within - 5) / max(1, a.travel_minutes)), a.assignment_id, "estimated"
        return point_along(path, 1 - (within - 5 - a.travel_minutes) / max(1, a.travel_minutes)), a.assignment_id, "estimated"
    return (v.position_lat, v.position_lon), None, v.position_source


def vehicle_view(state: PlanState, v: Vehicle, routes: dict[int, Route]) -> dict:
    pos, assignment_id, source = vehicle_position(state, v, routes)
    return {
        "vehicle_id": v.vehicle_id,
        "vehicle_type": v.vehicle_type,
        "capacity": v.capacity,
        "status": v.status,
        "current_location": v.current_location,
        "plate_number": v.plate_number,
        "ext": {
            "vehicle_id": v.vehicle_id,
            "team_id": v.team_id,
            "depot": [v.depot_lat, v.depot_lon],
            "position": [round(pos[0], 6), round(pos[1], 6)],
            "position_source": source,
        },
        "assignment_id": assignment_id,
    }


def team_view(t: RescueTeam, vehicles: list[Vehicle]) -> dict:
    return {
        "team_id": t.team_id,
        "name": t.name,
        "members_count": t.members_count,
        "contact_number": t.contact_number,
        "status": t.status,
        "current_location": t.current_location,
        "plan_id": t.plan_id,
        "vehicle_ids": [v.vehicle_id for v in vehicles if v.team_id == t.team_id],
    }


# --------------------------------------------------------------------------- assignments and plans


def assignment_row(a: EvacuationAssignment) -> dict:
    return {
        "assignment_id": a.assignment_id,
        "plan_id": a.plan_id,
        "zone_id": a.zone_id,
        "shelter_id": a.shelter_id,
        "route_id": a.route_id,
        "people_count": a.people_count,
        "status": a.status,
        "created_at": iso(a.created_at),
        "vehicle_assignments": [
            {
                "vehicle_assignment_id": va.vehicle_assignment_id,
                "assignment_id": va.assignment_id,
                "vehicle_id": va.vehicle_id,
                "departure_time": iso(va.departure_time),
                "arrival_time": iso(va.arrival_time),
                "status": va.status,
            }
            for va in a.vehicle_assignments
        ],
    }


def assignment_view(
    a: EvacuationAssignment, zones: dict[int, AffectedZone], shelters: dict[int, Shelter], routes: dict[int, Route]
) -> dict:
    zone = zones.get(a.zone_id)
    route = routes.get(a.route_id) if a.route_id else None
    return {
        **assignment_row(a),
        "ext": {
            "assignment_id": a.assignment_id,
            "household_ids": a.household_ids,
            "eta_minutes": a.eta_minutes,
            "dispatch_minute": a.dispatch_minute,
            "approach_minutes": a.approach_minutes,
            "vehicle_ids": a.vehicle_ids,
            "explanation": a.explanation,
            "approval": a.approval,
            "override_reason": a.override_reason,
            "version": a.version,
        },
        "zone_name": zone.name if zone else f"Zone {a.zone_id}",
        "shelter_name": shelters[a.shelter_id].name if a.shelter_id in shelters else f"Shelter {a.shelter_id}",
        "route_label": route.label if route else None,
        "severity": zone.severity if zone else 3,
    }


def version_view(v, approver_names: dict[int, str]) -> dict:
    return {
        "version": v.version,
        "plan_id": v.plan_id,
        "created_at": iso(v.created_at),
        "sim_minute": v.sim_minute,
        "trigger": v.trigger,
        "strategy": v.strategy,
        "status": v.status,
        "assignment_ids": v.assignment_ids,
        "unallocated": v.unallocated,
        "metrics": v.metrics,
        "diff": v.diff,
        "approved_by": approver_names.get(v.approved_by) if v.approved_by else None,
        "approved_at": iso(v.approved_at),
    }


def plan_view(state: PlanState) -> dict | None:
    plan = state.plan
    if plan is None:
        return None
    repos = state.repos
    names = {u.user_id: u.name for u in repos.users.list()}
    versions = [version_view(v, names) for v in repos.plans.versions(plan.plan_id)]
    return {
        "plan_id": plan.plan_id,
        "disaster_id": plan.disaster_id,
        "name": plan.name,
        "priority": plan.priority,
        "created_by": plan.created_by,
        "status": plan.status,
        "created_at": iso(plan.created_at),
        "updated_at": iso(plan.updated_at),
        "assignments": [assignment_row(a) for a in state.assignments],
        "versions": versions,
        "current_version": versions[-1] if versions else None,
    }


def dashboard_summary(repos: Repos) -> dict:
    zones = repos.zones.list()
    shelters = repos.shelters.list()
    vehicles = repos.vehicles.list()
    routes = repos.routes.list()
    affected = sum(z.population for z in zones)
    evacuated = sum(z.evacuated_count for z in zones)
    cap = sum(s.capacity for s in shelters)
    occ = sum(s.current_occupancy for s in shelters)
    plan = repos.plans.current_plan()
    version = repos.plans.current_version(plan) if plan else None
    return {
        "disasters": {"total": len(repos.disasters.list()), "active": 1 if repos.disasters.active() else 0},
        "population": {
            "total_affected": affected,
            "total_evacuated": evacuated,
            "evacuation_progress_percentage": round(evacuated / max(1, affected) * 100, 2),
        },
        "shelters": {
            "total": len(shelters),
            "total_capacity": cap,
            "current_occupancy": occ,
            "occupancy_rate_percentage": round(occ / max(1, cap) * 100, 2),
        },
        "logistics": {
            "total_vehicles": len(vehicles),
            "available_vehicles": sum(1 for v in vehicles if v.status == "Available"),
            "open_routes": sum(1 for r in routes if r.status == "Open"),
            "blocked_routes": sum(1 for r in routes if r.status in ("Blocked", "Flooded")),
        },
        "plans": {
            "active_plans": 1 if plan and plan.status == "Active" else 0,
            "total_assignments": len(version.assignment_ids) if version else 0,
        },
    }


def timeline(repos: Repos, points: int = 12) -> dict:
    """Real history for the dashboard sparklines.

    evacuated: people at shelters by operation minute (from each household's arrival minute),
    sampled at `points` evenly spaced minutes from the incident start to now.
    versions: the metrics of every plan version at the minute it was created.
    """
    now = now_minute(repos)
    arrivals = sorted((h.arrived_minute, h.size) for h in repos.households.list() if h.delivered and h.arrived_minute is not None)
    start = 0
    step = max(1, (now - start) // max(1, points - 1)) if now > start else 1
    samples, total, i = [], 0, 0
    for k in range(points):
        minute = min(now, start + k * step)
        while i < len(arrivals) and arrivals[i][0] <= minute:
            total += arrivals[i][1]
            i += 1
        samples.append([minute, total])
    plan = repos.plans.current_plan()
    versions = []
    for v in repos.plans.versions(plan.plan_id) if plan else []:
        m = v.metrics
        versions.append(
            {
                "version": v.version,
                "minute": v.sim_minute,
                "avg_eta": m.get("avg_eta", 0),
                "worst_eta": m.get("worst_eta", 0),
                "people_unallocated": m.get("people_unallocated", 0),
                "high_priority_served": m.get("high_priority_served", 0),
                "high_priority_total": m.get("high_priority_total", 0),
            }
        )
    affected = sum(z.population for z in repos.zones.list())
    return {"now": now, "affected": affected, "evacuated": samples, "versions": versions}
