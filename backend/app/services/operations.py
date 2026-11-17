"""Work on the ground: field teams, shelter check-in, reunification and the public lookup."""

from __future__ import annotations

import re

from app.models import Household, HouseholdMember
from app.repositories import Repos

from .context import Actor, ServiceError
from .logbook import audit, log_event
from .planning import check_shelter_overflow, complete_if_done, deliver_household, mark_in_progress
from .views import PlanState, assignment_view


def people_text(n: int) -> str:
    return f"{n} person" if n == 1 else f"{n} people"


# --------------------------------------------------------------------------- field team


def _lookup_maps(repos: Repos):
    zones = {z.zone_id: z for z in repos.zones.list()}
    shelters = {s.shelter_id: s for s in repos.shelters.list()}
    routes = {r.route_id: r for r in repos.routes.list()}
    return zones, shelters, routes


def field_tasks(repos: Repos, actor: Actor) -> list[dict]:
    if actor.role not in ("Response Team", "Admin"):
        raise ServiceError(403, "Field tasks are for response teams.")
    state = PlanState(repos)
    team_vehicles = {v.vehicle_id for v in repos.vehicles.list() if actor.role == "Admin" or v.team_id == actor.team_id}
    zones, shelters, routes = _lookup_maps(repos)
    rank = {"In Progress": 0, "Scheduled": 1}
    tasks = [a for a in state.assignments if any(v in team_vehicles for v in a.vehicle_ids)]
    tasks.sort(key=lambda a: (rank.get(a.status, 2), -zones[a.zone_id].severity, a.assignment_id))
    return [assignment_view(a, zones, shelters, routes) for a in tasks]


def assignment_households(repos: Repos, assignment_id: int) -> list[Household]:
    a = repos.plans.assignment(assignment_id)
    if a is None:
        raise ServiceError(404, "Assignment not found")
    hh = repos.households.by_ids(a.household_ids)
    return [hh[i] for i in a.household_ids if i in hh]


def mark_picked_up(repos: Repos, assignment_id: int, household_ids: list[str], actor: Actor) -> int:
    a = repos.plans.assignment(assignment_id)
    if a is None:
        raise ServiceError(404, "Assignment not found")
    state = PlanState(repos)
    allowed = set(a.household_ids)
    people = 0
    for hid in household_ids:
        h = state.households.get(hid)
        if h and hid in allowed and h.status == "Awaiting":
            h.status = "Picked Up"
            people += h.size
    mark_in_progress(state, a)
    audit(
        repos,
        actor,
        "PICKUP_CONFIRMED",
        "EvacuationAssignment",
        assignment_id,
        f"{len(household_ids)} households ({people} people) picked up",
    )
    log_event(repos, "info", "Field pickup confirmed", f"{people} people · assignment #{assignment_id}")
    return people


def mark_arrived(repos: Repos, assignment_id: int, actor: Actor) -> None:
    a = repos.plans.assignment(assignment_id)
    if a is None:
        raise ServiceError(404, "Assignment not found")
    state = PlanState(repos)
    for hid in a.household_ids:
        h = state.households.get(hid)
        if h and h.status == "Picked Up":
            deliver_household(state, h, a.shelter_id, "Arrived")
    audit(repos, actor, "ARRIVAL_CONFIRMED", "EvacuationAssignment", assignment_id, f"Arrival confirmed at shelter {a.shelter_id}")
    complete_if_done(state, a)


def report_position(repos: Repos, vehicle_id: int, lat: float, lon: float, actor: Actor) -> None:
    """A field device reports where its vehicle is (real GPS beats the timeline estimate)."""
    from .context import utcnow

    v = repos.vehicles.get(vehicle_id)
    if v is None:
        raise ServiceError(404, "Vehicle not found")
    if actor.role == "Response Team" and v.team_id != actor.team_id:
        raise ServiceError(403, "You can only report positions for your own team's vehicles.")
    v.position_lat, v.position_lon, v.position_source, v.position_at = lat, lon, "gps", utcnow()


# --------------------------------------------------------------------------- shelter operations


def roster(repos: Repos, shelter_id: int) -> dict:
    state = PlanState(repos)
    hh = state.households
    expected = [hh[i] for a in state.movable if a.shelter_id == shelter_id for i in a.household_ids if i in hh and not hh[i].delivered]
    present = [h for h in hh.values() if h.shelter_id == shelter_id and h.delivered]
    return {"expected": expected, "present": list(reversed(present))}


def check_in(repos: Repos, shelter_id: int, token: str, actor: Actor) -> dict:
    h = repos.households.by_token(token)
    if h is None:
        return {"ok": False, "message": f'No household found for token "{token}". Register as a walk-in instead.', "household": None}
    if h.status == "Checked In":
        at = repos.shelters.get(h.shelter_id).name if h.shelter_id else "another shelter"
        return {"ok": False, "message": f"{h.head_name}'s household is already checked in at {at}.", "household": h}
    shelter = repos.shelters.get(shelter_id)
    if shelter is None:
        raise ServiceError(404, "Shelter not found")
    if not h.delivered and shelter.current_occupancy + h.size > shelter.capacity:
        return {"ok": False, "message": f"{shelter.name} is at capacity; household of {h.size} cannot be admitted.", "household": h}
    state = PlanState(repos)
    planned = next((a for a in state.movable if h.household_id in a.household_ids), None)
    deliver_household(state, h, shelter_id, "Checked In")
    h.status = "Checked In"
    h.shelter_id = shelter_id
    if planned:
        complete_if_done(state, planned)
    elsewhere = planned is not None and planned.shelter_id != shelter_id
    audit(
        repos,
        actor,
        "CHECK_IN",
        "Household",
        None,
        f"{h.household_id} ({h.size} people) checked in at {shelter.name}{' – was planned elsewhere' if elsewhere else ''}",
    )
    log_event(repos, "success", f"Check-in at {shelter.name}", f"{h.head_name} +{h.size - 1} ({h.household_id})")
    if elsewhere:
        planned_name = repos.shelters.get(planned.shelter_id).name
        message = f"Checked in {people_text(h.size)}. Note: household was planned for {planned_name}; the plan has been updated."
    else:
        message = f"Checked in {h.head_name}'s household ({people_text(h.size)})."
    return {"ok": True, "message": message, "household": h}


def register_walk_in(repos: Repos, shelter_id: int, head_name: str, people: int, actor: Actor) -> dict:
    shelter = repos.shelters.get(shelter_id)
    if shelter is None:
        raise ServiceError(404, "Shelter not found")
    if not 1 <= people <= 20:
        raise ServiceError(422, "Walk-in group must be 1–20 people.")
    if shelter.current_occupancy + people > shelter.capacity:
        return {"ok": False, "message": f"{shelter.name} is at capacity.", "household": None}
    n = repos.households.next_walk_in_number(shelter_id)
    head = head_name.strip() or "Unregistered walk-in"
    hid = f"WI-{shelter_id}-{n:04d}"
    h = repos.households.add(
        Household(
            household_id=hid,
            zone_id=None,
            token=f"WI-{shelter_id}-{n}",
            head_name=head,
            phone="",
            size=people,
            status="Awaiting",
            walk_in=True,
            members=[HouseholdMember(position=0, name=head)]
            + [HouseholdMember(position=i, name=f"Member {i + 1}") for i in range(1, people)],
        )
    )
    state = PlanState(repos)
    deliver_household(state, h, shelter_id, "Checked In")
    shelter.walk_ins += people
    audit(repos, actor, "WALK_IN", "Shelter", shelter_id, f"Walk-in {hid}: {people} people")
    log_event(repos, "info", f"Walk-in at {shelter.name}", f"{people} people (reserve buffer)")
    check_shelter_overflow(repos, shelter_id, actor, f"{shelter.name} capacity reached after walk-ins")
    return {"ok": True, "message": f"Registered walk-in group of {people} ({hid}).", "household": h}


def reunification_search(repos: Repos, query: str) -> list[dict]:
    q = query.strip().lower()
    if len(q) < 2:
        return []
    digits = re.sub(r"\D", "", q)
    state = PlanState(repos)
    planned = {hid: a.shelter_id for a in state.assignments for hid in a.household_ids}
    shelters = {s.shelter_id: s.name for s in repos.shelters.list()}
    zones = {z.zone_id: z.name for z in repos.zones.list()}
    hits = []
    for h in state.households.values():
        id_match = q in h.household_id.lower() or (digits and digits in re.sub(r"\D", "", h.phone))
        for m in h.members:
            if not id_match and q not in m.name.lower():
                continue
            hits.append(
                {
                    "household_id": h.household_id,
                    "member": m.name,
                    "head_name": h.head_name,
                    "zone_name": zones.get(h.zone_id, "Walk-in"),
                    "status": h.status,
                    "shelter_name": shelters.get(h.shelter_id) if h.shelter_id else None,
                    "planned_shelter_name": shelters.get(planned.get(h.household_id)) if planned.get(h.household_id) else None,
                }
            )
            if id_match:
                break
        if len(hits) >= 40:
            break
    return hits


# --------------------------------------------------------------------------- public lookup (no login)


def public_lookup(repos: Repos, query: str) -> list[dict]:
    q = query.strip()
    if not q:
        return []
    state = PlanState(repos)
    digits = re.sub(r"\D", "", q)
    zones = {z.zone_id: z for z in repos.zones.list()}
    shelters = {s.shelter_id: s for s in repos.shelters.list()}
    routes = {r.route_id: r for r in repos.routes.list()}

    def build(zone_id: int, h: Household | None, a) -> dict:
        zone = zones[zone_id]
        shelter = shelters.get(a.shelter_id) if a else None
        route = routes.get(a.route_id) if a and a.route_id else None
        return {
            "zone_code": zone.code,
            "zone_name": zone.name,
            "household_id": h.household_id if h else None,
            "head_name": h.head_name if h else None,
            "people": h.size if h else None,
            "shelter": {
                "name": shelter.name,
                "location": shelter.location,
                "facilities": shelter.available_facilities(),
                "latitude": shelter.latitude or 0,
                "longitude": shelter.longitude or 0,
            }
            if shelter
            else None,
            "route": {"label": route.label, "travel_time": route.travel_time, "status": route.status, "path": route.path}
            if route
            else None,
            "eta_minutes": max(0, a.dispatch_minute + a.approach_minutes - state.minute) if a else None,
            "assignment_status": a.status if a else None,
            "needs": {
                "medical": bool(h and h.medical > 0),
                "accessibility": bool(h and h.disabled > 0),
                "pets": bool(h and h.pets),
                "children": bool(h and h.children > 0),
                "elderly": bool(h and h.elderly > 0),
            },
        }

    if len(digits) >= 6:
        matches = [h for h in state.households.values() if h.zone_id is not None and re.sub(r"\D", "", h.phone).endswith(digits[-10:])]
        return [build(h.zone_id, h, state.assignment_for_household(h.household_id)) for h in matches[:5]]

    zone = repos.zones.by_code(q)
    if zone is None:
        return []
    seen: set[int] = set()
    out = []
    for a in state.assignments:
        if a.zone_id != zone.zone_id or a.shelter_id in seen or a.explanation.get("required_facilities"):
            continue
        seen.add(a.shelter_id)
        out.append(build(zone.zone_id, None, a))
    return out or [build(zone.zone_id, None, None)]
