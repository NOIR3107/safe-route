"""Allocation (FR-07, FR-08, FR-09).

1. group households by zone and special needs (households are never split)
2. check every group/shelter pair against the hard constraints and cost it
3. let the strategy place whole households: Greedy or Min-Cost Flow
4. dispatch vehicles and work out ETAs (vehicle availability is a hard constraint for groups that
   cannot walk out)
5. write an explanation for each assignment, and the plan metrics

Everything here is deterministic: the same input always gives the same plan.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .config import PlanningConfig
from .cost import Edge, evaluate_edge, remaining_capacity, round1
from .geo import approach_minutes, haversine_km
from .mcf import MinCostFlow
from .model import DemandGroup, EngineHousehold, EngineInput, EngineRoute, EngineVehicle
from .priority import zone_priority_score

STRATEGIES = ("greedy", "min-cost-flow")
STRATEGY_NAMES = {"greedy": "Greedy", "min-cost-flow": "Min-Cost Flow"}


def js_round(x: float) -> int:
    """Round half up, like the original TypeScript (Python's round() rounds half to even)."""
    return int(math.floor(x + 0.5))


@dataclass
class PlannedAssignment:
    zone_id: int
    shelter_id: int
    route_id: int
    household_ids: list[str]
    people: int
    explanation: dict
    en_route: bool
    vehicle_ids: list[int] = field(default_factory=list)
    approach_minutes: int = 0
    eta_minutes: int = 0
    trips: int = 1
    trip_capacity: int = 0
    travel_minutes: int = 0


@dataclass
class AllocationResult:
    strategy: str
    assignments: list[PlannedAssignment]
    unallocated: list[dict]  # {zone_id, household_ids, people, reason}
    metrics: dict


@dataclass
class Placement:
    group: DemandGroup
    shelter_id: int | None
    households: list[EngineHousehold]
    skipped_reason: str | None = None
    unallocated_reason: str | None = None


# --------------------------------------------------------------------------- demand groups


def build_groups(inp: EngineInput, disaster_severity: str, cfg: PlanningConfig) -> list[DemandGroup]:
    zones = {z.zone_id: z for z in inp.zones}
    groups: dict[str, DemandGroup] = {}
    for hh in inp.households:
        zone = zones.get(hh.zone_id)
        if zone is None:
            continue
        needs = sorted(hh.needs)
        en_route = sorted(hh.en_route_vehicle_ids)
        key = "|".join(
            [
                str(zone.zone_id),
                "+".join(needs) or "general",
                "-" if hh.previous_shelter_id is None else str(hh.previous_shelter_id),
                ".".join(map(str, en_route)) or "-",
            ]
        )
        g = groups.get(key)
        if g is None:
            g = DemandGroup(
                key=key,
                zone=zone,
                households=[],
                people=0,
                needs=needs,
                pet_share=0.0,
                high_priority_people=0,
                previous_shelter_id=hh.previous_shelter_id,
                en_route_vehicle_ids=en_route,
                priority_score=zone_priority_score(zone, disaster_severity, cfg),
            )
            groups[key] = g
        g.households.append(hh)
        g.people += hh.size
        if hh.high_priority:
            g.high_priority_people += hh.size
    for g in groups.values():
        pet_people = sum(h.size for h in g.households if h.wants_pets)
        g.pet_share = pet_people / g.people if g.people else 0.0
        # FR-06 inside a group: households with vulnerable members are placed first.
        g.households.sort(key=lambda h: (-(h.vulnerable > 0), -h.size, h.household_id))
    return sorted(groups.values(), key=group_sort_key)


def group_sort_key(g: DemandGroup):
    """En-route groups first (stability), then severity, special needs, FR-06 score, size."""
    return (-len(g.en_route_vehicle_ids), -g.zone.severity, -len(g.needs), -g.priority_score, -g.people, g.key)


# --------------------------------------------------------------------------- strategies


def _feasible_sorted(edges: list[Edge]) -> list[Edge]:
    return sorted((e for e in edges if e.feasible), key=lambda e: (e.cost.total, e.shelter.shelter_id))


def _unallocated_reason(edges: list[Edge]) -> str:
    if any(e.feasible for e in edges):
        return "All feasible shelters are at plannable capacity"
    reasons: list[str] = []
    for e in edges:
        for r in e.reasons:
            if r not in reasons:
                reasons.append(r)
    return "No feasible shelter: " + "; ".join(reasons[:3])


def greedy(groups: list[DemandGroup], edges: dict[str, list[Edge]], capacity: dict[int, int]) -> list[Placement]:
    """Most urgent group first, each household to the cheapest feasible shelter with room."""
    out: list[Placement] = []
    for g in groups:
        feasible = _feasible_sorted(edges[g.key])
        by_shelter: dict[int, list[EngineHousehold]] = {}
        left: list[EngineHousehold] = []
        for hh in g.households:
            target = next((e for e in feasible if capacity.get(e.shelter.shelter_id, 0) >= hh.size), None)
            if target is None:
                left.append(hh)
                continue
            sid = target.shelter.shelter_id
            capacity[sid] -= hh.size
            by_shelter.setdefault(sid, []).append(hh)
        for sid, hhs in by_shelter.items():
            out.append(Placement(g, sid, hhs, skipped_reason="Capacity already taken by higher-priority groups"))
        if left:
            out.append(Placement(g, None, left, unallocated_reason=_unallocated_reason(edges[g.key])))
    return out


def unallocated_cost(g: DemandGroup, cfg: PlanningConfig) -> float:
    """Cost of leaving a person unallocated; scaled by severity so low-severity groups are cut first."""
    return 10_000 * cfg.severity_weight[g.zone.severity] * (1.5 if g.needs else 1.0)


def min_cost_flow(
    groups: list[DemandGroup], edges: dict[str, list[Edge]], capacity: dict[int, int], cfg: PlanningConfig
) -> list[Placement]:
    """Lowest total cost for everyone, then rounded back to whole households."""
    shelter_ids = list(capacity.keys())
    shelter_node = {sid: 1 + len(groups) + i for i, sid in enumerate(shelter_ids)}
    source, sink = 0, 1 + len(groups) + len(shelter_ids)
    mcf = MinCostFlow(sink + 1)

    flow_edges: list[tuple[str, int, int]] = []  # (group key, shelter id, edge id)
    for gi, g in enumerate(groups):
        g_node = 1 + gi
        mcf.add_edge(source, g_node, g.people, 0)
        for e in edges[g.key]:
            if e.feasible:
                eid = mcf.add_edge(g_node, shelter_node[e.shelter.shelter_id], g.people, e.cost.total)
                flow_edges.append((g.key, e.shelter.shelter_id, eid))
        mcf.add_edge(g_node, sink, g.people, unallocated_cost(g, cfg))
    for sid in shelter_ids:
        mcf.add_edge(shelter_node[sid], sink, capacity[sid], 0)
    mcf.solve(source, sink)

    out: list[Placement] = []
    for g in groups:
        quotas = {sid: mcf.flow_on(eid) for key, sid, eid in flow_edges if key == g.key}
        feasible = _feasible_sorted(edges[g.key])
        by_shelter: dict[int, list[EngineHousehold]] = {}
        left: list[EngineHousehold] = []
        for hh in g.households:
            target = next(
                (
                    e
                    for e in feasible
                    if quotas.get(e.shelter.shelter_id, 0) >= hh.size and capacity.get(e.shelter.shelter_id, 0) >= hh.size
                ),
                None,
            )
            if target is None:
                # Rounding slack: the shelter with the most leftover quota that still has room.
                options = [
                    e for e in feasible if quotas.get(e.shelter.shelter_id, 0) > 0 and capacity.get(e.shelter.shelter_id, 0) >= hh.size
                ]
                options.sort(key=lambda e: -quotas.get(e.shelter.shelter_id, 0))
                target = options[0] if options else None
            if target is None:
                left.append(hh)
                continue
            sid = target.shelter.shelter_id
            quotas[sid] = quotas.get(sid, 0) - hh.size
            capacity[sid] -= hh.size
            by_shelter.setdefault(sid, []).append(hh)
        still_left: list[EngineHousehold] = []
        for hh in left:  # second pass for rounding leftovers
            target = next((e for e in feasible if capacity.get(e.shelter.shelter_id, 0) >= hh.size), None)
            if target is None:
                still_left.append(hh)
                continue
            sid = target.shelter.shelter_id
            capacity[sid] -= hh.size
            by_shelter.setdefault(sid, []).append(hh)
        for sid, hhs in by_shelter.items():
            out.append(Placement(g, sid, hhs, skipped_reason="Capacity reserved for groups where it lowers total system cost more"))
        if still_left:
            out.append(Placement(g, None, still_left, unallocated_reason=_unallocated_reason(edges[g.key])))
    return out


# --------------------------------------------------------------------------- pipeline


def allocate(inp: EngineInput, strategy: str, disaster_severity: str, cfg: PlanningConfig) -> AllocationResult:
    if strategy not in STRATEGIES:
        raise ValueError(f"Unknown strategy {strategy!r}")
    groups = build_groups(inp, disaster_severity, cfg)

    capacity = {s.shelter_id: remaining_capacity(s) for s in inp.shelters if s.open}
    edges = {g.key: [evaluate_edge(g, s, inp.routes, remaining_capacity(s) if s.open else 0, cfg) for s in inp.shelters] for g in groups}
    cap_copy = dict(capacity)
    placements = greedy(groups, edges, cap_copy) if strategy == "greedy" else min_cost_flow(groups, edges, cap_copy, cfg)

    drafts: list[PlannedAssignment] = []
    unallocated: list[dict] = []
    for p in placements:
        ids = [h.household_id for h in p.households]
        people = sum(h.size for h in p.households)
        if p.shelter_id is None:
            unallocated.append(
                {
                    "zone_id": p.group.zone.zone_id,
                    "household_ids": ids,
                    "people": people,
                    "reason": p.unallocated_reason or "No feasible shelter",
                }
            )
            continue
        chosen = next(e for e in edges[p.group.key] if e.shelter.shelter_id == p.shelter_id)
        drafts.append(
            PlannedAssignment(
                zone_id=p.group.zone.zone_id,
                shelter_id=p.shelter_id,
                route_id=chosen.route.route_id,
                household_ids=ids,
                people=people,
                trip_capacity=people,
                en_route=bool(p.group.en_route_vehicle_ids),
                explanation=explain(p, chosen, edges[p.group.key], strategy, cfg),
            )
        )

    dispatch_vehicles(drafts, inp, groups, cfg)
    drafts, walkers_blocked = _enforce_vehicle_constraint(drafts, inp, cfg)
    unallocated.extend(walkers_blocked)
    return AllocationResult(strategy, drafts, unallocated, compute_metrics(inp, drafts, unallocated))


def compare_strategies(inp: EngineInput, disaster_severity: str, cfg: PlanningConfig) -> dict[str, AllocationResult]:
    """Runs both strategies on the same input without saving anything."""
    return {s: allocate(inp, s, disaster_severity, cfg) for s in STRATEGIES}


# --------------------------------------------------------------------------- explanations

_VERDICT_RANK = {"capacity-exhausted": 0, "higher-cost": 1, "infeasible": 2}


def explain(p: Placement, chosen: Edge, group_edges: list[Edge], strategy: str, cfg: PlanningConfig) -> dict:
    feasible = _feasible_sorted(group_edges)
    is_cheapest = bool(feasible) and feasible[0].shelter.shelter_id == chosen.shelter.shelter_id
    g = p.group
    n = len(feasible)
    parts = []
    if is_cheapest:
        parts.append(
            f"{chosen.shelter.name} has the lowest weighted cost ({chosen.cost.total:g}) of {n} feasible shelter{'' if n == 1 else 's'}."
        )
    else:
        parts.append(
            f"{chosen.shelter.name} chosen (cost {chosen.cost.total:g}); cheaper options were not available to this group: "
            f"{p.skipped_reason or 'capacity'}."
        )
    parts.append(f"Severity {g.zone.severity} zone, so travel time is weighted ×{cfg.severity_weight[g.zone.severity]:g}.")
    if g.needs:
        parts.append(f"Group requires {' + '.join(g.needs).lower()}, so shelters without it were excluded.")
    if g.en_route_vehicle_ids:
        parts.append("Group is already in vehicles; the stability penalty discourages changing its destination.")

    alternatives = []
    for e in group_edges:
        if e.shelter.shelter_id == chosen.shelter.shelter_id:
            continue
        if not e.feasible:
            alternatives.append(
                {
                    "shelter_id": e.shelter.shelter_id,
                    "shelter_name": e.shelter.name,
                    "route_id": e.route.route_id if e.route else None,
                    "verdict": e.verdict,
                    "reasons": e.reasons,
                    "cost": None,
                    "delta_pct": None,
                }
            )
            continue
        delta = js_round((e.cost.total - chosen.cost.total) / max(0.1, chosen.cost.total) * 100)
        cheaper = e.cost.total < chosen.cost.total
        diffs = [n_ for n_ in e.cost.notes if n_ not in chosen.cost.notes and " min × " not in n_][:2]
        alternatives.append(
            {
                "shelter_id": e.shelter.shelter_id,
                "shelter_name": e.shelter.name,
                "route_id": e.route.route_id,
                "verdict": "capacity-exhausted" if cheaper else "higher-cost",
                "reasons": [p.skipped_reason or "Capacity used elsewhere"]
                if cheaper
                else [f"Weighted cost {e.cost.total:g} vs {chosen.cost.total:g}", *diffs],
                "cost": e.cost.total,
                "delta_pct": delta,
            }
        )
    alternatives.sort(key=lambda a: (_VERDICT_RANK[a["verdict"]], a["cost"] if a["cost"] is not None else 1e9))
    return {
        "summary": " ".join(parts),
        "cost": chosen.cost.to_dict(),
        "required_facilities": list(g.needs),
        "alternatives": alternatives,
        "strategy": strategy,
    }


# --------------------------------------------------------------------------- vehicles and ETA


def effective_travel(route: EngineRoute, cfg: PlanningConfig) -> float:
    return route.travel_time * cfg.congestion_factor.get(route.status, 1.0)


def dispatch_vehicles(drafts: list[PlannedAssignment], inp: EngineInput, groups: list[DemandGroup], cfg: PlanningConfig) -> None:
    zones = {z.zone_id: z for z in inp.zones}
    routes = {r.route_id: r for r in inp.routes}
    busy = {v.vehicle_id: v for v in inp.busy_vehicles}
    free = {v.vehicle_id: v for v in inp.vehicles}
    pool: list[EngineVehicle] = list(inp.vehicles)

    ordered = sorted(
        drafts,
        key=lambda d: (
            -int(d.en_route),
            -zones[d.zone_id].severity,
            -len(d.explanation["required_facilities"]),
            -d.people,
        ),
    )

    def cap_of(d: PlannedAssignment) -> int:
        return sum((busy.get(vid) or free.get(vid)).capacity for vid in d.vehicle_ids if (busy.get(vid) or free.get(vid)))

    def take(d: PlannedAssignment) -> None:
        centroid = zones[d.zone_id].centroid
        medical = "Medical" in d.explanation["required_facilities"]
        pool.sort(key=lambda v: (-100 if medical and v.vehicle_type == "Ambulance" else 0) + haversine_km(v.position, centroid))
        if pool:
            d.vehicle_ids.append(pool.pop(0).vehicle_id)

    # En-route groups keep the vehicles they are sitting in.
    for d in ordered:
        if d.en_route:
            g = next(
                (x for x in groups if x.zone.zone_id == d.zone_id and any(h.household_id in d.household_ids for h in x.households)),
                None,
            )
            d.vehicle_ids = list(g.en_route_vehicle_ids) if g else []
    # Round 1: every new assignment gets its nearest suitable vehicle.
    for d in ordered:
        if not d.en_route:
            take(d)

    # Then keep adding a vehicle to the assignment with the worst severity-weighted ETA (minimax)
    # until everyone fits in one trip or the fleet runs out.
    def projected(d: PlannedAssignment) -> float:
        trips = math.ceil(d.people / max(1, cap_of(d)))
        if trips <= 1:
            return -1
        travel = effective_travel(routes[d.route_id], cfg)
        return (cfg.loading_minutes * trips + travel * (2 * trips - 1)) * cfg.severity_weight[zones[d.zone_id].severity]

    while pool:
        worst, worst_eta = None, 0.0
        for d in ordered:
            if d.en_route or not d.vehicle_ids:
                continue
            p = projected(d)
            if p > worst_eta:
                worst, worst_eta = d, p
        if worst is None:
            break
        take(worst)

    for d in drafts:
        route = routes[d.route_id]
        zone = zones[d.zone_id]
        travel = effective_travel(route, cfg)
        if d.en_route:
            d.approach_minutes, d.trips, d.trip_capacity = 0, 1, d.people
            d.travel_minutes = js_round(travel)
            d.eta_minutes = js_round(travel + cfg.loading_minutes)
            continue
        if not d.vehicle_ids:
            walk = js_round(route.distance_km / cfg.walk_speed_kmh * 60)
            d.approach_minutes, d.trips, d.trip_capacity = 0, 1, d.people
            d.travel_minutes = walk
            d.eta_minutes = walk + cfg.loading_minutes
            d.explanation["cost"]["notes"].append("No vehicle free; guided walk-out ETA")
            continue
        first = free.get(d.vehicle_ids[0])
        approach = approach_minutes(first.position, zone.centroid, cfg.approach_speed_kmh) if first else 0
        trips = math.ceil(d.people / max(1, cap_of(d)))
        d.approach_minutes = approach
        d.trips = trips
        d.trip_capacity = cap_of(d)
        d.travel_minutes = js_round(travel)
        d.eta_minutes = js_round(approach + cfg.loading_minutes * trips + d.travel_minutes * (2 * trips - 1))


def _enforce_vehicle_constraint(
    drafts: list[PlannedAssignment], inp: EngineInput, cfg: PlanningConfig
) -> tuple[list[PlannedAssignment], list[dict]]:
    """FR-07: a group with no vehicle may only walk out if it can (no medical/wheelchair need, short road)."""
    routes = {r.route_id: r for r in inp.routes}
    kept, blocked = [], []
    for d in drafts:
        if d.vehicle_ids or d.en_route:
            kept.append(d)
            continue
        needs = d.explanation["required_facilities"]
        too_far = routes[d.route_id].distance_km > cfg.max_walk_km
        if needs or too_far:
            why = "needs " + " + ".join(needs).lower() if needs else f"road is {routes[d.route_id].distance_km:g} km"
            blocked.append(
                {
                    "zone_id": d.zone_id,
                    "household_ids": d.household_ids,
                    "people": d.people,
                    "reason": f"No vehicle available and the group cannot walk out ({why})",
                }
            )
        else:
            kept.append(d)
    return kept, blocked


# --------------------------------------------------------------------------- metrics


def compute_metrics(inp: EngineInput, drafts: list[PlannedAssignment], unallocated: list[dict]) -> dict:
    hh = {h.household_id: h for h in inp.households}
    allocated = sum(d.people for d in drafts)
    eta_weighted = sum(d.eta_minutes * d.people for d in drafts)
    hp_total = sum(h.size for h in inp.households if h.high_priority)
    hp_served = sum(hh[i].size for d in drafts for i in d.household_ids if i in hh and hh[i].high_priority)
    open_shelters = [s for s in inp.shelters if s.open]
    cap = sum(s.capacity for s in open_shelters)
    committed = sum(s.committed for s in open_shelters)
    return {
        "people_allocated": allocated,
        "people_unallocated": sum(u["people"] for u in unallocated),
        "avg_eta": round1(eta_weighted / allocated) if allocated else 0,
        "worst_eta": max((d.eta_minutes for d in drafts), default=0),
        "high_priority_total": hp_total,
        "high_priority_served": hp_served,
        "total_cost": js_round(sum(d.explanation["cost"]["total"] * d.people for d in drafts)),
        "shelter_utilization": min(1.0, (committed + allocated) / cap) if cap else 0,
        "assignments": len(drafts),
        "vehicles_used": len({v for d in drafts for v in d.vehicle_ids}),
    }
