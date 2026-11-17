"""FR-07 hard constraints and FR-08 cost of sending a group to a shelter.

Cost per person, in "weighted minutes":

    travel_time * congestion * severity_weight      (ETA, scaled by how urgent the zone is)
    + route risk penalty
    + penalty per missing soft facility (power, water, food) and for pets if not accepted
    + penalty if the shelter would go above 90 % (free capacity)
    + stability penalty when re-planning a group that already had a destination

A shelter is skipped completely (hard constraint) when it is closed, has no plannable capacity left,
every road to it is blocked or flooded, or it lacks a facility the group needs (medical, wheelchair
access). Vehicle availability is checked after dispatch, in ``allocate``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import PlanningConfig
from .model import DemandGroup, EngineRoute, EngineShelter

UNUSABLE_ROUTE_STATUSES = ("Blocked", "Flooded")


def is_route_usable(status: str) -> bool:
    return status not in UNUSABLE_ROUTE_STATUSES


def round1(x: float) -> float:
    return round(x + 0.0, 1)


@dataclass
class CostBreakdown:
    travel_time: float
    congestion_factor: float
    severity_weight: float
    travel_cost: float
    risk_penalty: float
    facility_penalty: float
    utilization_penalty: float
    stability_penalty: float
    total: float
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {k: getattr(self, k) for k in self.__dataclass_fields__}


@dataclass
class Edge:
    """Result of checking one group against one shelter."""

    shelter: EngineShelter
    route: EngineRoute | None
    feasible: bool
    cost: CostBreakdown | None = None
    verdict: str | None = None  # "infeasible" | "capacity-exhausted" when not feasible
    reasons: list[str] = field(default_factory=list)


def route_cost(group: DemandGroup, route: EngineRoute, shelter: EngineShelter, cfg: PlanningConfig) -> CostBreakdown:
    notes: list[str] = []
    sev_w = cfg.severity_weight[group.zone.severity]
    congestion = cfg.congestion_factor.get(route.status, 1.0)
    travel_cost = route.travel_time * congestion * sev_w
    notes.append(f"{route.travel_time:g} min × {congestion:.2f} ({route.status}) × {sev_w:g} (severity {group.zone.severity})")

    risk = cfg.risk_penalty.get(route.risk_level, 0)
    if risk > 0:
        notes.append(f"{route.risk_level} route risk +{risk:g}")

    facility = 0.0
    for f in cfg.soft_facilities:
        if f not in shelter.available_facilities:
            facility += cfg.soft_facility_penalty
            notes.append(f"No {f.lower()} +{cfg.soft_facility_penalty:g}")
    if group.pet_share > 0 and "Pets" not in shelter.available_facilities:
        p = round1(cfg.pet_penalty * group.pet_share)
        facility += p
        notes.append(f"Pets not accepted ({round(group.pet_share * 100)}% have pets) +{p:g}")

    utilization = 0.0
    after = (shelter.committed + group.people) / shelter.capacity
    if after > cfg.utilization_threshold:
        utilization = cfg.utilization_penalty
        notes.append(f"Would push shelter above {cfg.utilization_threshold * 100:g}% +{utilization:g}")

    stability = 0.0
    if group.previous_shelter_id is not None and group.previous_shelter_id != shelter.shelter_id:
        stability += cfg.stability_penalty_destination
        notes.append(f"Changes destination +{cfg.stability_penalty_destination:g} (stability)")
        if group.en_route_vehicle_ids:
            stability += cfg.stability_penalty_en_route
            notes.append(f"Group already en route +{cfg.stability_penalty_en_route:g} (stability)")

    total = round1(travel_cost + risk + facility + utilization + stability)
    return CostBreakdown(
        travel_time=route.travel_time,
        congestion_factor=congestion,
        severity_weight=sev_w,
        travel_cost=round1(travel_cost),
        risk_penalty=risk,
        facility_penalty=round1(facility),
        utilization_penalty=utilization,
        stability_penalty=stability,
        total=total,
        notes=notes,
    )


def remaining_capacity(shelter: EngineShelter) -> int:
    """Plannable seats left: capacity minus committed people minus the walk-in reserve."""
    return max(0, shelter.capacity - shelter.committed - shelter.reserved)


def evaluate_edge(group: DemandGroup, shelter: EngineShelter, routes: list[EngineRoute], remaining: int, cfg: PlanningConfig) -> Edge:
    reasons: list[str] = []
    candidates = [r for r in routes if r.zone_id == group.zone.zone_id and r.shelter_id == shelter.shelter_id]

    if not shelter.open:
        reasons.append(shelter.closed_reason or "Shelter is closed")
    for need in group.needs:
        if need not in shelter.available_facilities:
            reasons.append(
                f"{need} facility currently unavailable"
                if need in shelter.degraded_facilities
                else f"No {need.lower()} facility (required by {group.people} people)"
            )
    if not candidates:
        reasons.append("No road corridor from this zone")
    usable = [r for r in candidates if is_route_usable(r.status)]
    if candidates and not usable:
        reasons.extend(f"Route {r.label} {r.status.lower()}" for r in candidates)

    if reasons:
        return Edge(shelter, candidates[0] if candidates else None, False, verdict="infeasible", reasons=reasons)
    if remaining <= 0:
        return Edge(
            shelter,
            usable[0],
            False,
            verdict="capacity-exhausted",
            reasons=[f"No plannable capacity left ({cfg.walk_in_reserve:.0%} walk-in reserve is protected)"],
        )

    best_route, best_cost = None, None
    for r in usable:
        c = route_cost(group, r, shelter, cfg)
        if best_cost is None or c.total < best_cost.total:
            best_route, best_cost = r, c
    return Edge(shelter, best_route, True, cost=best_cost)
