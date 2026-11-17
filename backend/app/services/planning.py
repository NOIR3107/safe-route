"""Evacuation planning service (FR-06 to FR-10).

Feeds the engine, saves its result as a plan version, re-plans only what an event affects, moves
assignments along their trip timeline, and keeps the fleet busy where it saves the most time.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.core.config import get_planning_config
from app.engine import (
    STRATEGY_NAMES,
    ActiveAssignment,
    Displacement,
    EngineHousehold,
    EngineInput,
    EngineRoute,
    EngineShelter,
    EngineVehicle,
    EngineZone,
    Placement,
    PlannedAssignment,
    ReplanEvent,
    allocate,
    compare_strategies,
    diff_plans,
    select_affected,
)
from app.engine.allocate import js_round
from app.engine.geo import approach_minutes
from app.engine.priority import is_high_priority
from app.models import (
    EvacuationAssignment,
    EvacuationPlan,
    Household,
    PlanVersion,
    ResourceAllocation,
    Shelter,
    VehicleAssignment,
)
from app.repositories import Repos

from .context import SYSTEM, Actor, ServiceError, utcnow
from .logbook import audit, log_event, notify
from .views import PlanState, reserved_remaining

# --------------------------------------------------------------------------- engine projection


def needs_of(h: Household) -> list[str]:
    needs = []
    if h.medical > 0:
        needs.append("Medical")
    if h.disabled > 0:
        needs.append("Accessibility")
    return needs


def _zone_severity(state: PlanState, zone_id: int | None) -> int:
    z = state.repos.zones.get(zone_id) if zone_id is not None else None
    return z.severity if z else 3


def to_engine_household(state: PlanState, h: Household, prev: tuple[int, list[int]] | None = None) -> EngineHousehold:
    eh = EngineHousehold(
        household_id=h.household_id,
        zone_id=h.zone_id if h.zone_id is not None else -1,
        size=h.size,
        needs=needs_of(h),
        wants_pets=h.pets,
        high_priority=False,
        vulnerable=h.vulnerable,
        previous_shelter_id=prev[0] if prev else None,
        en_route_vehicle_ids=list(prev[1]) if prev else [],
    )
    eh.high_priority = is_high_priority(eh, _zone_severity(state, h.zone_id))
    return eh


def engine_zones(state: PlanState) -> list[EngineZone]:
    waiting_vulnerable: dict[int, int] = {}
    for h in state.households.values():
        if h.zone_id is not None and h.status == "Awaiting":
            waiting_vulnerable[h.zone_id] = waiting_vulnerable.get(h.zone_id, 0) + h.vulnerable
    return [
        EngineZone(
            zone_id=z.zone_id,
            name=z.name,
            severity=z.severity,
            centroid=(z.centroid_lat, z.centroid_lon),
            priority=z.priority,
            risk_level=z.risk_level,
            population=z.population,
            evacuated_count=z.evacuated_count,
            vulnerable_people=waiting_vulnerable.get(z.zone_id, 0),
        )
        for z in state.repos.zones.list()
    ]


def closed_reason(s: Shelter) -> str | None:
    if s.status == "Active":
        return None
    return "Shelter marked full by manager" if s.status == "Full" else f"Shelter {s.status.lower()}"


def engine_shelters(state: PlanState, excluded: set[str], only_ids: list[int] | None = None) -> list[EngineShelter]:
    out = []
    for s in state.repos.shelters.get_candidates():
        if only_ids is not None and s.shelter_id not in only_ids:
            continue
        out.append(
            EngineShelter(
                shelter_id=s.shelter_id,
                name=s.name,
                open=s.status == "Active",
                closed_reason=closed_reason(s),
                capacity=s.capacity,
                committed=s.current_occupancy + state.inbound_for(s.shelter_id, excluded),
                reserved=reserved_remaining(s),
                available_facilities=s.available_facilities(),
                degraded_facilities=s.degraded_facilities(),
                position=(s.latitude or 0.0, s.longitude or 0.0),
            )
        )
    return out


def engine_routes(state: PlanState) -> list[EngineRoute]:
    return [
        EngineRoute(
            route_id=r.route_id,
            zone_id=r.zone_id,
            shelter_id=r.shelter_id,
            label=r.label,
            via=r.via,
            distance_km=r.distance_km,
            travel_time=r.travel_time,
            risk_level=r.risk_level,
            status=r.status,
        )
        for r in state.repos.routes.get_routes()
    ]


def _engine_vehicle(state: PlanState, vehicle_id: int) -> EngineVehicle:
    v = state.repos.vehicles.get(vehicle_id)
    return EngineVehicle(v.vehicle_id, v.vehicle_type, v.capacity, (v.position_lat, v.position_lon))


def build_input(
    state: PlanState,
    households: list[Household],
    prev: dict[str, tuple[int, list[int]]],
    excluded: set[str],
    released_vehicles: set[int],
    only_shelters: list[int] | None = None,
) -> EngineInput:
    busy_ids = sorted({vid for _, vids in prev.values() for vid in vids})
    free = [
        _engine_vehicle(state, v.vehicle_id)
        for v in state.repos.vehicles.list()
        if (v.status == "Available" or v.vehicle_id in released_vehicles) and v.vehicle_id not in busy_ids
    ]
    return EngineInput(
        zones=engine_zones(state),
        households=[to_engine_household(state, h, prev.get(h.household_id)) for h in households if h.zone_id is not None],
        shelters=engine_shelters(state, excluded, only_shelters),
        routes=engine_routes(state),
        vehicles=free,
        busy_vehicles=[_engine_vehicle(state, vid) for vid in busy_ids],
    )


def disaster_severity(repos: Repos) -> str:
    d = repos.disasters.active()
    return d.severity if d else "High"


# --------------------------------------------------------------------------- writing results


def create_assignment(
    state: PlanState, plan: EvacuationPlan, pa: PlannedAssignment, version: int, approval: str, override_reason: str | None
) -> int:
    repos = state.repos
    now = utcnow()
    a = EvacuationAssignment(
        plan_id=plan.plan_id,
        zone_id=pa.zone_id,
        shelter_id=pa.shelter_id,
        route_id=pa.route_id,
        people_count=pa.people,
        status="In Progress" if pa.en_route else "Scheduled",
        version=version,
        approval=approval,
        override_reason=override_reason,
        dispatch_minute=state.minute,
        approach_minutes=pa.approach_minutes,
        eta_minutes=pa.eta_minutes,
        trips=max(1, pa.trips),
        trip_capacity=max(1, pa.trip_capacity),
        travel_minutes=pa.travel_minutes,
        delivered=0,
        base=0,
        explanation=pa.explanation,
    )
    repos.plans.add_assignment(a, pa.household_ids)
    for vid in pa.vehicle_ids:
        repos.plans.add_vehicle_assignment(
            VehicleAssignment(
                assignment_id=a.assignment_id,
                vehicle_id=vid,
                departure_time=now if pa.en_route else None,
                status="In Transit" if pa.en_route else "Assigned",
            )
        )
        v = repos.vehicles.get(vid)
        if v:
            v.status = "In Transit" if pa.en_route else "Assigned"
    repos.db.refresh(a)
    return a.assignment_id


def placements(state: PlanState, assignment_ids: list[int]) -> dict[str, Placement]:
    out: dict[str, Placement] = {}
    for a in state.repos.plans.assignments_by_ids(assignment_ids):
        if a.status == "Cancelled":
            continue
        for hid in a.household_ids:
            out[hid] = Placement(a.shelter_id, a.dispatch_minute + a.eta_minutes)
    return out


def plan_metrics(state: PlanState, assignment_ids: list[int], unallocated: list[dict]) -> dict:
    rows = [a for a in state.repos.plans.assignments_by_ids(assignment_ids)]
    allocated = sum(a.people_count for a in rows)
    arrivals = [(a.people_count, a.dispatch_minute + a.eta_minutes, a.explanation["cost"]["total"]) for a in rows]
    zones = {z.zone_id: z for z in state.repos.zones.list()}

    def is_hp(h: Household) -> bool:
        return h.zone_id is not None and (zones[h.zone_id].severity >= 4 or h.medical > 0 or h.disabled > 0)

    served = {hid for a in rows for hid in a.household_ids}
    hp_all = [h for h in state.households.values() if is_hp(h)]
    open_shelters = [s for s in state.repos.shelters.list() if s.status in ("Active", "Full")]
    cap = sum(s.capacity for s in open_shelters)
    load = sum(s.current_occupancy + state.inbound_for(s.shelter_id) for s in open_shelters)
    return {
        "people_allocated": allocated,
        "people_unallocated": sum(u["people"] for u in unallocated),
        "avg_eta": round(sum(at * p for p, at, _ in arrivals) / allocated, 1) if allocated else 0,
        "worst_eta": max((at for _, at, _ in arrivals), default=0),
        "high_priority_total": sum(h.size for h in hp_all),
        "high_priority_served": sum(h.size for h in hp_all if h.household_id in served or h.delivered),
        "total_cost": js_round(sum(c * p for p, _, c in arrivals)),
        "shelter_utilization": min(1.0, load / cap) if cap else 0,
        "assignments": len(rows),
        "vehicles_used": len({vid for a in rows for vid in a.vehicle_ids}),
    }


def allocate_resources(state: PlanState, version: PlanVersion) -> None:
    """FR-09 resource assignment: earmark supplies for each shelter in proportion to the people the
    version sends there. Stock is shared out proportionally when there is not enough."""
    repos = state.repos
    per_shelter: dict[int, int] = {}
    for a in repos.plans.version_assignments(version):
        per_shelter[a.shelter_id] = per_shelter.get(a.shelter_id, 0) + a.people_count
    rows: list[ResourceAllocation] = []
    for r in repos.resources.get_resources():
        if r.per_person <= 0 or r.quantity <= 0:
            continue
        wanted = {sid: math.ceil(n * r.per_person) for sid, n in per_shelter.items()}
        total = sum(wanted.values())
        scale = min(1.0, r.quantity / total) if total else 0
        for sid, qty in sorted(wanted.items()):
            q = math.floor(qty * scale)
            if q > 0:
                rows.append(ResourceAllocation(version_id=version.version_id, shelter_id=sid, resource_id=r.resource_id, quantity=q))
    repos.plans.replace_resource_allocations(version.version_id, rows)


# --------------------------------------------------------------------------- plan generation


def generate_initial_plan(repos: Repos, strategy: str, actor: Actor) -> PlanVersion:
    disaster = repos.disasters.active()
    if disaster is None:
        raise ServiceError(400, "No active disaster to plan for.")
    state = PlanState(repos)
    plan = repos.plans.add_plan(
        EvacuationPlan(
            disaster_id=disaster.disaster_id,
            created_by=actor.user_id or 1,
            name=f"{disaster.title} – Evacuation Plan",
            status="Active",
            priority="Critical",
        )
    )
    pending = repos.households.awaiting_with_zone()
    result = allocate(build_input(state, pending, {}, set(), set()), strategy, disaster.severity, get_planning_config())
    ids = [create_assignment(state, plan, pa, 1, "Proposed", None) for pa in result.assignments]
    version = repos.plans.add_version(
        PlanVersion(
            plan_id=plan.plan_id,
            version=1,
            status="Proposed",
            strategy=strategy,
            sim_minute=state.minute,
            trigger={"type": "Initial", "description": f"Initial plan generated with {STRATEGY_NAMES[strategy]}"},
            unallocated=result.unallocated,
            metrics=result.metrics,
            diff=None,
        ),
        ids,
    )
    state.refresh()
    version.metrics = plan_metrics(state, ids, result.unallocated)
    allocate_resources(state, version)
    _assign_teams(repos, plan, ids)
    m = version.metrics
    log = audit(
        repos,
        actor,
        "GENERATE_PLAN",
        "EvacuationPlan",
        plan.plan_id,
        f"v1 via {STRATEGY_NAMES[strategy]}: {len(ids)} assignments, {m['people_allocated']} people allocated, "
        f"{m['people_unallocated']} unallocated.",
    )
    notify(
        repos,
        "ALERT",
        f"Evacuation plan v1 proposed: {m['people_allocated']} people allocated to shelters. Awaiting coordinator approval.",
        log=log,
    )
    log_event(repos, "info", "Plan v1 proposed", f"{len(ids)} assignments · {m['people_unallocated']} people unallocated")
    return version


def _assign_teams(repos: Repos, plan: EvacuationPlan, assignment_ids: list[int]) -> None:
    """Class diagram: RescueTeam "assigned to" EvacuationPlan - every team whose vehicles the plan uses."""
    team_ids = set()
    for a in repos.plans.assignments_by_ids(assignment_ids):
        for vid in a.vehicle_ids:
            v = repos.vehicles.get(vid)
            if v and v.team_id:
                team_ids.add(v.team_id)
    for tid in team_ids:
        t = repos.teams.get(tid)
        if t:
            t.plan_id = plan.plan_id
            if t.status == "Available":
                t.status = "Deployed"


# --------------------------------------------------------------------------- re-planning (FR-10)


@dataclass
class ReplanOptions:
    event: ReplanEvent
    trigger: dict
    actor: Actor
    strategy: str | None = None
    include_unallocated: bool = True
    only_shelters: list[int] | None = None
    override_reason: str | None = None
    only_assignment: int | None = None


def replan(repos: Repos, opts: ReplanOptions) -> PlanVersion | None:
    """Re-plan the households an event affects (plus anyone still unallocated) against the capacity
    that is left, and save a new Proposed version with a diff. Returns None if nothing changes."""
    cfg = get_planning_config()
    state = PlanState(repos)
    plan, prev_version = state.plan, state.version
    if plan is None or prev_version is None:
        return None
    hh = state.households

    active = [
        ActiveAssignment(
            assignment_id=a.assignment_id,
            zone_id=a.zone_id,
            shelter_id=a.shelter_id,
            route_id=a.route_id,
            household_ids=[i for i in a.household_ids if i in hh and not hh[i].delivered],
            status=a.status,
            severity=_zone_severity(state, a.zone_id),
            required=a.explanation.get("required_facilities", []),
        )
        for a in state.movable
    ]
    if opts.only_assignment is not None:  # manual override: exactly this assignment
        displaced = [
            Displacement(a.assignment_id, a.household_ids, opts.event.label) for a in active if a.assignment_id == opts.only_assignment
        ]
    else:
        displaced = select_affected(active, opts.event, lambda i: hh[i].size if i in hh else 0)
    displaced = [d for d in displaced if d.household_ids]

    unalloc_ids = (
        [i for u in prev_version.unallocated for i in u["household_ids"] if i in hh and hh[i].status == "Awaiting"]
        if opts.include_unallocated
        else []
    )
    can_retry = opts.event.type in ("Regenerate", "RetryUnallocated")
    if not displaced and not (can_retry and unalloc_ids):
        return None

    displaced_ids = {i for d in displaced for i in d.household_ids}
    prev: dict[str, tuple[int, list[int]]] = {}
    released: set[int] = set()
    for d in displaced:
        a = repos.plans.assignment(d.assignment_id)
        stays = any(i not in displaced_ids for i in a.household_ids)
        any_en_route = False
        for i in d.household_ids:
            en_route = hh[i].status == "Picked Up"
            any_en_route = any_en_route or en_route
            prev[i] = (a.shelter_id, a.vehicle_ids if en_route else [])
        if not stays and not any_en_route:
            released.update(a.vehicle_ids)

    to_allocate = [hh[i] for i in [*sorted(displaced_ids), *unalloc_ids] if i in hh and not hh[i].delivered]
    strategy = opts.strategy or prev_version.strategy
    inp = build_input(state, to_allocate, prev, displaced_ids, released, opts.only_shelters)
    result = allocate(inp, strategy, disaster_severity(repos), cfg)

    if not displaced and not result.assignments:
        return None  # no-op: do not create an empty version
    if opts.override_reason and any(i in displaced_ids for u in result.unallocated for i in u["household_ids"]):
        reason = result.unallocated[0]["reason"] if result.unallocated else "Shelter cannot take this group"
        raise ServiceError(409, f"Override rejected: {reason}")

    # ---- from here on, commit the new version
    prev_placements = placements(state, prev_version.assignment_ids)
    remainder_ids: list[int] = []
    for d in displaced:
        a = repos.plans.assignment(d.assignment_id)
        keep = [i for i in a.household_ids if i not in displaced_ids]
        original_status = a.status
        a.status = "Rerouted"
        for va in a.vehicle_assignments:
            va.status = "Reassigned"
        if keep:
            remainder_ids.append(_split_remainder(state, a, keep, original_status))
    repos.flush()
    state.refresh()
    for vid in released:
        v = repos.vehicles.get(vid)
        if v and not any(vid in m.vehicle_ids for m in state.movable):
            v.status = "Available"

    number = prev_version.version + 1
    approval = "Overridden" if opts.override_reason else "Proposed"
    new_ids = [create_assignment(state, plan, pa, number, approval, opts.override_reason) for pa in result.assignments]
    carried = [
        a.assignment_id for a in repos.plans.assignments_by_ids(prev_version.assignment_ids) if a.status not in ("Rerouted", "Cancelled")
    ]
    assignment_ids = [*carried, *remainder_ids, *new_ids]

    prev_version.status = "Superseded"
    version = repos.plans.add_version(
        PlanVersion(
            plan_id=plan.plan_id,
            version=number,
            status="Proposed",
            strategy=strategy,
            sim_minute=state.minute,
            trigger=opts.trigger,
            unallocated=result.unallocated,
            metrics=result.metrics,
            diff=None,
        ),
        assignment_ids,
    )
    state.refresh()
    # Re-dispatch vehicles first so the diff shows the ETA impact evacuees will actually see.
    rebalance_fleet(repos, state=state)
    state.refresh()
    zone_names = {z.zone_id: z.name for z in repos.zones.list()}
    shelter_names = {s.shelter_id: s.name for s in repos.shelters.list()}
    households = {h.household_id: (h.zone_id, h.size) for h in state.households.values() if h.zone_id is not None}
    version.diff = diff_plans(
        prev_placements, placements(state, assignment_ids), households, zone_names, shelter_names, opts.trigger["description"]
    )
    version.metrics = plan_metrics(state, assignment_ids, result.unallocated)
    allocate_resources(state, version)
    plan.updated_at = utcnow()
    if plan.status == "Draft":
        plan.status = "Active"

    diff = version.diff
    delta = diff["avg_eta_delta"]
    summary = (
        f"v{number}: {diff['people_moved']} people moved, {diff['newly_allocated']} newly allocated, "
        f"{diff['newly_unallocated']} newly unallocated (avg ETA {'+' if delta > 0 else ''}{delta:g} min)."
    )
    if opts.override_reason:
        log = audit(
            repos,
            opts.actor,
            "ASSIGNMENT_OVERRIDE",
            "EvacuationAssignment",
            opts.trigger.get("assignment_id"),
            f'{opts.trigger["description"]}. Reason: "{opts.override_reason}". {summary}',
        )
    else:
        log = audit(repos, opts.actor, "DYNAMIC_REALLOCATION", "EvacuationPlan", plan.plan_id, f"{opts.trigger['description']}. {summary}")
    notify(
        repos, "WARNING" if opts.override_reason else "CRITICAL", f"REPLANNING {summary} Trigger: {opts.trigger['description']}", log=log
    )
    log_event(
        repos,
        "warning",
        f"Plan v{number} proposed",
        f"{opts.trigger['description']} · {diff['people_moved'] + diff['newly_allocated']} people re-assigned",
    )
    return version


def _split_remainder(state: PlanState, old: EvacuationAssignment, keep: list[str], original_status: str) -> int:
    """The households of a partly affected assignment that stay keep going, as a new row."""
    repos = state.repos
    hh = state.households
    people = sum(hh[i].size for i in keep if i in hh)
    all_delivered = all(i in hh and hh[i].delivered for i in keep)
    new = EvacuationAssignment(
        plan_id=old.plan_id,
        zone_id=old.zone_id,
        shelter_id=old.shelter_id,
        route_id=old.route_id,
        people_count=max(1, people),
        status="Completed" if all_delivered else original_status,
        version=old.version,
        approval=old.approval,
        override_reason=old.override_reason,
        dispatch_minute=old.dispatch_minute,
        approach_minutes=old.approach_minutes,
        eta_minutes=old.eta_minutes,
        trips=old.trips,
        trip_capacity=old.trip_capacity,
        travel_minutes=old.travel_minutes,
        delivered=sum(hh[i].size for i in keep if i in hh and hh[i].delivered),
        base=old.base,
        explanation=old.explanation,
    )
    repos.plans.add_assignment(new, keep)
    for va in old.vehicle_assignments:
        repos.plans.add_vehicle_assignment(
            VehicleAssignment(
                assignment_id=new.assignment_id,
                vehicle_id=va.vehicle_id,
                departure_time=va.departure_time,
                arrival_time=va.arrival_time,
                status="Completed" if all_delivered else "In Transit",
            )
        )
    repos.db.refresh(new)
    if all_delivered:
        release_vehicles(state, new)
    return new.assignment_id


def retry_unallocated(repos: Repos, description: str, actor: Actor) -> PlanVersion | None:
    """After a road clears or a shelter reopens, try to place anyone still unallocated."""
    v = repos.plans.current_version()
    if v is None or not v.unallocated:
        return None
    return replan(
        repos,
        ReplanOptions(
            event=ReplanEvent("RetryUnallocated", description),
            trigger={"type": "Regenerate", "description": description},
            actor=actor,
            include_unallocated=True,
        ),
    )


def check_shelter_overflow(repos: Repos, shelter_id: int, actor: Actor, label: str) -> PlanVersion | None:
    """Re-plan when the people planned for a shelter exceed what it can still take."""
    s = repos.shelters.get(shelter_id)
    if s is None:
        return None
    state = PlanState(repos)
    room = 0 if s.status == "Full" else max(0, s.capacity - s.current_occupancy - reserved_remaining(s))
    overflow = state.inbound_for(shelter_id) - room
    if overflow <= 0:
        return None
    return replan(
        repos,
        ReplanOptions(
            event=ReplanEvent("ShelterFull", label, shelter_id=shelter_id, overflow=overflow),
            trigger={"type": "ShelterFull", "description": label, "shelter_id": shelter_id},
            actor=actor,
            include_unallocated=False,
        ),
    )


# --------------------------------------------------------------------------- approval and override


def generate_or_regenerate(repos: Repos, strategy: str, actor: Actor) -> None:
    if repos.plans.current_plan() is None:
        generate_initial_plan(repos, strategy, actor)
        return
    label = f"Regenerated with {STRATEGY_NAMES[strategy]} by {actor.name}"
    v = replan(
        repos,
        ReplanOptions(
            event=ReplanEvent("Regenerate", label), trigger={"type": "Regenerate", "description": label}, actor=actor, strategy=strategy
        ),
    )
    if v is None:
        raise ServiceError(409, "Nothing left to re-plan: every group is already en route or delivered.")


def approve_version(repos: Repos, number: int, actor: Actor) -> None:
    v = repos.plans.current_version()
    if v is None or v.version != number:
        raise ServiceError(409, "Only the current plan version can be approved.")
    if v.status == "Approved":
        raise ServiceError(409, f"v{number} is already approved.")
    v.status = "Approved"
    v.approved_by = actor.user_id
    v.approved_at = utcnow()
    for a in repos.plans.assignments_by_ids(v.assignment_ids):
        if a.approval == "Proposed":
            a.approval = "Approved"
    m = v.metrics
    log = audit(
        repos,
        actor,
        "PLAN_APPROVED",
        "EvacuationPlan",
        v.plan_id,
        f"Approved plan v{number} ({m['people_allocated']} people, {m['assignments']} assignments)",
    )
    notify(repos, "INFO", f"Plan v{number} approved by {actor.name}.", log=log)
    log_event(repos, "success", f"Plan v{number} approved", f"by {actor.name}")


def override_assignment(repos: Repos, assignment_id: int, shelter_id: int, reason: str, actor: Actor) -> None:
    reason = reason.strip()
    if len(reason) < 10:
        raise ServiceError(422, "Override reason must be at least 10 characters.")
    a = repos.plans.assignment(assignment_id)
    if a is None:
        raise ServiceError(404, "Assignment not found")
    if a.status not in ("Scheduled", "In Progress"):
        raise ServiceError(409, f"Cannot override a {a.status.lower()} assignment.")
    if a.shelter_id == shelter_id:
        raise ServiceError(409, "Assignment already goes to that shelter.")
    target = repos.shelters.get(shelter_id)
    if target is None:
        raise ServiceError(404, "Shelter not found")
    frm = repos.shelters.get(a.shelter_id).name
    description = f"Manual override: assignment #{assignment_id} {frm} → {target.name} by {actor.name}"
    v = replan(
        repos,
        ReplanOptions(
            event=ReplanEvent("Regenerate", description),
            trigger={"type": "Override", "description": description, "assignment_id": assignment_id},
            actor=actor,
            include_unallocated=False,
            only_shelters=[shelter_id],
            override_reason=reason,
            only_assignment=assignment_id,
        ),
    )
    if v is None:
        raise ServiceError(409, "Nothing to override.")


def compare(repos: Repos) -> dict:
    """What-if: plan everyone not yet picked up with both strategies. Saves nothing."""
    state = PlanState(repos)
    pending = repos.households.awaiting_with_zone()
    excluded = {h.household_id for h in pending}
    released = {vid for a in state.movable for vid in a.vehicle_ids}
    inp = build_input(state, pending, {}, excluded, released)
    both = compare_strategies(inp, disaster_severity(repos), get_planning_config())
    return {k: r.metrics for k, r in both.items()}


# --------------------------------------------------------------------------- progress over time


def deliver_household(state: PlanState, h: Household, shelter_id: int, status: str) -> None:
    if h.delivered:
        if status == "Checked In":
            h.status = "Checked In"
        return
    h.status = status
    h.shelter_id = shelter_id
    s = state.repos.shelters.get(shelter_id)
    if s:
        s.current_occupancy = min(s.capacity, s.current_occupancy + h.size)
        if s.current_occupancy >= s.capacity and s.status == "Active":
            s.status = "Full"
    z = state.repos.zones.get(h.zone_id) if h.zone_id is not None else None
    if z:
        z.evacuated_count = min(z.population, z.evacuated_count + h.size)
        z.status = "Evacuated" if z.evacuated_count >= z.population else "Partially Evacuated"


def release_vehicles(state: PlanState, a: EvacuationAssignment) -> None:
    repos = state.repos
    shelter = repos.shelters.get(a.shelter_id)
    for va in a.vehicle_assignments:
        if va.status != "Reassigned":
            va.status = "Completed"
            va.arrival_time = utcnow()
    for vid in a.vehicle_ids:
        if any(m.assignment_id != a.assignment_id and vid in m.vehicle_ids for m in state.movable):
            continue
        v = repos.vehicles.get(vid)
        if v is None:
            continue
        if v.status != "Maintenance":
            v.status = "Available"
        if shelter and shelter.latitude is not None:
            v.position_lat, v.position_lon = shelter.latitude, shelter.longitude
            v.position_source = "depot"
            v.current_location = shelter.location


def complete_if_done(state: PlanState, a: EvacuationAssignment) -> None:
    hh = state.households
    if all(i in hh and hh[i].delivered for i in a.household_ids):
        a.status = "Completed"
        release_vehicles(state, a)
        shelter = state.repos.shelters.get(a.shelter_id)
        log_event(
            state.repos,
            "success",
            f"{len(a.household_ids)} households reached {shelter.name if shelter else 'the shelter'}",
            f"Assignment #{a.assignment_id} completed ({a.people_count} people)",
        )


def mark_in_progress(state: PlanState, a: EvacuationAssignment) -> None:
    if a.status != "Scheduled":
        return
    a.status = "In Progress"
    for va in a.vehicle_assignments:
        if va.status == "Assigned":
            va.status = "In Transit"
            va.departure_time = utcnow()
    for vid in a.vehicle_ids:
        v = state.repos.vehicles.get(vid)
        if v and v.status != "Maintenance":
            v.status = "In Transit"


def progress_assignments(repos: Repos) -> None:
    """Drill only: move every movable assignment along its trip timeline at the drill minute."""
    state = PlanState(repos)
    hh = state.households
    for a in list(state.movable):
        t = state.minute - a.dispatch_minute
        if t < 0:
            continue
        cycle = 5 + 2 * a.travel_minutes
        pickups = sum(1 for k in range(1, a.trips + 1) if a.approach_minutes + (k - 1) * cycle <= t)
        arrivals = sum(1 for k in range(1, a.trips + 1) if a.approach_minutes + 5 * k + a.travel_minutes * (2 * k - 1) <= t)
        picked_target = min(a.people_count, a.base + pickups * a.trip_capacity)
        delivered_target = min(a.people_count, a.base + arrivals * a.trip_capacity)
        cum = 0
        for hid in a.household_ids:
            h = hh.get(hid)
            if h is None:
                continue
            before = cum
            cum += h.size
            if before < delivered_target and not h.delivered:
                deliver_household(state, h, a.shelter_id, "Arrived")
                a.delivered += h.size
            elif before < picked_target and h.status == "Awaiting":
                h.status = "Picked Up"
        if pickups > 0:
            mark_in_progress(state, a)
        complete_if_done(state, a)
    repos.flush()
    state.refresh()
    rebalance_fleet(repos, state=state)


# --------------------------------------------------------------------------- fleet rebalancing


def _remaining_people(state: PlanState, a: EvacuationAssignment) -> tuple[int, int]:
    """(people already handled, people still to move). For walking groups, people already walking
    still count as remaining so a vehicle can pick them up on the way."""
    hh = state.households
    walking = not a.vehicle_ids
    base = 0
    for hid in a.household_ids:
        h = hh.get(hid)
        if h is None:
            continue
        if h.delivered if walking else h.status != "Awaiting":
            base += h.size
    return base, max(0, a.people_count - base)


def _vehicle_travel(state: PlanState, a: EvacuationAssignment) -> int:
    r = state.repos.routes.get(a.route_id) if a.route_id else None
    if r is None:
        return a.travel_minutes
    f = get_planning_config().congestion_factor.get(r.status, 1.0)
    return js_round(r.travel_time * f)


def _capacity_of(state: PlanState, vehicle_ids: list[int]) -> int:
    return sum(state.repos.vehicles.get(v).capacity for v in vehicle_ids)


def _finish_with(state: PlanState, a: EvacuationAssignment, vehicle_ids: list[int]) -> float:
    cfg = get_planning_config()
    _, remaining = _remaining_people(state, a)
    cap = _capacity_of(state, vehicle_ids)
    if cap == 0:
        return float("inf")
    trips = math.ceil(remaining / cap)
    travel = _vehicle_travel(state, a) if vehicle_ids else a.travel_minutes
    return state.minute + cfg.loading_minutes * trips + travel * (2 * trips - 1)


def _rebase(state: PlanState, a: EvacuationAssignment, vehicle_ids: list[int]) -> None:
    """Restart an assignment's trip timeline from now with a new set of vehicles."""
    cfg = get_planning_config()
    repos = state.repos
    base, remaining = _remaining_people(state, a)
    if remaining <= 0:
        return
    current = a.vehicle_ids
    for vid in vehicle_ids:
        if vid not in current:
            repos.plans.add_vehicle_assignment(
                VehicleAssignment(
                    assignment_id=a.assignment_id,
                    vehicle_id=vid,
                    departure_time=utcnow(),
                    status="In Transit" if a.status == "In Progress" else "Assigned",
                )
            )
            v = repos.vehicles.get(vid)
            v.status = "In Transit" if a.status == "In Progress" else "Assigned"
    for va in a.vehicle_assignments:
        if va.vehicle_id not in vehicle_ids and va.status not in ("Completed", "Reassigned"):
            va.status = "Reassigned"
    repos.db.refresh(a)
    zone = repos.zones.get(a.zone_id)
    cap = _capacity_of(state, vehicle_ids)
    approach = (
        min(
            approach_minutes(
                (repos.vehicles.get(v).position_lat, repos.vehicles.get(v).position_lon),
                (zone.centroid_lat, zone.centroid_lon),
                cfg.approach_speed_kmh,
            )
            for v in vehicle_ids
        )
        if vehicle_ids and zone
        else 0
    )
    trips = math.ceil(remaining / max(1, cap))
    if vehicle_ids:
        a.travel_minutes = _vehicle_travel(state, a)
    a.dispatch_minute = state.minute
    a.approach_minutes = approach
    a.eta_minutes = js_round(approach + cfg.loading_minutes * trips + a.travel_minutes * (2 * trips - 1))
    a.trips = trips
    a.trip_capacity = max(1, cap)
    a.base = base


def rebalance_fleet(repos: Repos, state: PlanState | None = None, quiet: bool = False) -> int:
    """Dispatch-level optimisation (never changes which shelter anyone goes to):
    1. groups left walking get pooled vehicles (free ones first, then a spare from groups with slack)
       if that beats walking;
    2. every other free vehicle goes to the group where it saves the most severity-weighted time."""
    cfg = get_planning_config()
    state = state or PlanState(repos)
    version = state.version
    if version is None:
        return 0
    zones = {z.zone_id: z for z in repos.zones.list()}

    def sev(a: EvacuationAssignment) -> float:
        return cfg.severity_weight[zones[a.zone_id].severity]

    def open_assignments() -> list[EvacuationAssignment]:
        return [a for a in state.movable if _remaining_people(state, a)[1] > 0]

    def finish(a: EvacuationAssignment) -> int:
        return a.dispatch_minute + a.eta_minutes

    moves = 0
    walkers = sorted((a for a in open_assignments() if not a.vehicle_ids), key=lambda a: (-sev(a), -a.people_count, a.assignment_id))
    for a in walkers:
        walk_finish = finish(a)
        donors = sorted(
            (d for d in open_assignments() if d is not a and len(d.vehicle_ids) >= 2),
            key=lambda d: (finish(d), d.assignment_id),
        )
        pool = [(v.vehicle_id, None) for v in repos.vehicles.available()] + [
            (d.vehicle_ids[-1], d) for d in donors if _finish_with(state, d, d.vehicle_ids[:-1]) <= walk_finish
        ]
        taken: list[tuple[int, EvacuationAssignment | None]] = []
        for item in pool:
            taken.append(item)
            if _remaining_people(state, a)[1] <= _capacity_of(state, [t[0] for t in taken]) * 2:
                break  # two shuttle trips or fewer
        if not taken or _finish_with(state, a, [t[0] for t in taken]) >= walk_finish - cfg.min_rebalance_gain_minutes:
            continue
        for vid, donor in taken:
            if donor is not None:
                _rebase(state, donor, [x for x in donor.vehicle_ids if x != vid])
        _rebase(state, a, [t[0] for t in taken])
        moves += len(taken)

    for v in repos.vehicles.available():
        best, best_score = None, 0.0
        for a in open_assignments():
            gain = finish(a) - _finish_with(state, a, [*a.vehicle_ids, v.vehicle_id])
            if gain < cfg.min_rebalance_gain_minutes:
                continue
            score = gain * sev(a)
            if score > best_score:
                best, best_score = a, score
        if best is None:
            continue
        _rebase(state, best, [*best.vehicle_ids, v.vehicle_id])
        moves += 1

    if moves:
        repos.flush()
        state.refresh()
        version.metrics = plan_metrics(state, version.assignment_ids, version.unallocated)
        if not quiet:
            log_event(
                repos,
                "info",
                "Fleet rebalanced",
                f"{moves} vehicle{'s' if moves > 1 else ''} re-dispatched to the slowest groups · "
                f"worst arrival now T+{version.metrics['worst_eta']}",
            )
    return moves


__all__ = [
    "SYSTEM",
    "ReplanOptions",
    "approve_version",
    "check_shelter_overflow",
    "compare",
    "complete_if_done",
    "deliver_household",
    "generate_initial_plan",
    "generate_or_regenerate",
    "mark_in_progress",
    "override_assignment",
    "progress_assignments",
    "rebalance_fleet",
    "replan",
    "retry_unallocated",
]
