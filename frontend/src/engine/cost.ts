// Cost per person, in "weighted minutes":
//
//   travel_time * congestion * severity_weight
//   + route risk penalty
//   + penalty for missing power/water/food (and pets, if the group has them)
//   + penalty if the shelter would go above 90%
//   + stability penalty (only when re-planning and the group would change destination)
//
// Hard constraints (FR-07) skip the shelter completely: closed, no capacity left, every road to it
// blocked/flooded, or a facility the group needs (medical, wheelchair access) is missing.
import type { CostBreakdown, Facility, Severity } from "@/api/extensions";
import type { RouteRiskLevel, RouteStatus } from "@/api/schemas";
import type { DemandGroup, EngineRoute, EngineShelter } from "./model";

export const SEVERITY_WEIGHT: Record<Severity, number> = { 1: 1.0, 2: 1.25, 3: 1.5, 4: 2.0, 5: 2.5 };

export const CONGESTION_FACTOR: Record<RouteStatus, number> = {
  Open: 1.0,
  Cleared: 1.15, // reopened roads carry debris and diversions
  Congested: 1.6,
  Blocked: Number.POSITIVE_INFINITY,
  Flooded: Number.POSITIVE_INFINITY,
};

export const RISK_PENALTY: Record<RouteRiskLevel, number> = { Low: 0, Moderate: 4, High: 10, Severe: 20 };

export const SOFT_FACILITY_PENALTY = 8;
export const PET_PENALTY = 6;
export const UTILIZATION_THRESHOLD = 0.9;
export const UTILIZATION_PENALTY = 6;
/** Penalty for sending a re-planned group somewhere other than where it was already heading. */
export const STABILITY_PENALTY_DESTINATION = 12;
/** Extra penalty when that group is already in a vehicle. Keeps en-route groups stable. */
export const STABILITY_PENALTY_EN_ROUTE = 40;

const SOFT_FACILITIES: Facility[] = ["Power", "Water", "Food"];

export function isRouteUsable(status: RouteStatus): boolean {
  return status !== "Blocked" && status !== "Flooded";
}

export type EdgeEvaluation =
  | { feasible: true; shelter: EngineShelter; route: EngineRoute; cost: CostBreakdown }
  | {
      feasible: false;
      shelter: EngineShelter;
      route: EngineRoute | null;
      verdict: "infeasible" | "capacity-exhausted";
      reasons: string[];
    };

export function routeCost(group: DemandGroup, route: EngineRoute, shelter: EngineShelter): CostBreakdown {
  const notes: string[] = [];
  const severityWeight = SEVERITY_WEIGHT[group.zone.severity];
  const congestion = CONGESTION_FACTOR[route.status];
  const travelCost = route.travel_time * congestion * severityWeight;
  notes.push(
    `${route.travel_time} min × ${congestion.toFixed(2)} (${route.status}) × ${severityWeight} (severity ${group.zone.severity})`,
  );

  const risk = RISK_PENALTY[route.risk_level];
  if (risk > 0) notes.push(`${route.risk_level} route risk +${risk}`);

  let facility = 0;
  for (const f of SOFT_FACILITIES) {
    if (!shelter.available_facilities.includes(f)) {
      facility += SOFT_FACILITY_PENALTY;
      notes.push(`No ${f.toLowerCase()} +${SOFT_FACILITY_PENALTY}`);
    }
  }
  if (group.pet_share > 0 && !shelter.available_facilities.includes("Pets")) {
    const p = Math.round(PET_PENALTY * group.pet_share * 10) / 10;
    facility += p;
    notes.push(`Pets not accepted (${Math.round(group.pet_share * 100)}% have pets) +${p}`);
  }

  let utilization = 0;
  const after = (shelter.committed + group.people) / shelter.capacity;
  if (after > UTILIZATION_THRESHOLD) {
    utilization = UTILIZATION_PENALTY;
    notes.push(`Would push shelter above ${UTILIZATION_THRESHOLD * 100}% +${UTILIZATION_PENALTY}`);
  }

  let stability = 0;
  if (group.previous_shelter_id != null && group.previous_shelter_id !== shelter.shelter_id) {
    stability += STABILITY_PENALTY_DESTINATION;
    notes.push(`Changes destination +${STABILITY_PENALTY_DESTINATION} (stability)`);
    if (group.en_route_vehicle_ids.length > 0) {
      stability += STABILITY_PENALTY_EN_ROUTE;
      notes.push(`Group already en route +${STABILITY_PENALTY_EN_ROUTE} (stability)`);
    }
  }

  const total = round1(travelCost + risk + facility + utilization + stability);
  return {
    travel_time: route.travel_time,
    congestion_factor: congestion,
    severity_weight: severityWeight,
    travel_cost: round1(travelCost),
    risk_penalty: risk,
    facility_penalty: round1(facility),
    utilization_penalty: utilization,
    stability_penalty: stability,
    total,
    notes,
  };
}

/** Remaining plannable capacity of a shelter (never negative). */
export function remainingCapacity(shelter: EngineShelter): number {
  return Math.max(0, shelter.capacity - shelter.committed - shelter.reserved);
}

/** Can this group go to this shelter at all? If yes, use the cheapest open road to it. */
export function evaluateEdge(
  group: DemandGroup,
  shelter: EngineShelter,
  routes: EngineRoute[],
  remaining: number,
): EdgeEvaluation {
  const reasons: string[] = [];
  const candidateRoutes = routes.filter((r) => r.zone_id === group.zone.zone_id && r.shelter_id === shelter.shelter_id);

  if (!shelter.open) {
    reasons.push(shelter.closed_reason ?? "Shelter is closed");
  }
  for (const need of group.needs) {
    if (!shelter.available_facilities.includes(need)) {
      reasons.push(
        shelter.degraded_facilities.includes(need)
          ? `${need} facility currently unavailable`
          : `No ${need.toLowerCase()} facility (required by ${group.people} people)`,
      );
    }
  }
  if (candidateRoutes.length === 0) {
    reasons.push("No road corridor from this zone");
  }
  const usable = candidateRoutes.filter((r) => isRouteUsable(r.status));
  if (candidateRoutes.length > 0 && usable.length === 0) {
    for (const r of candidateRoutes) reasons.push(`Route ${r.label} ${r.status.toLowerCase()}`);
  }
  if (reasons.length > 0) {
    return { feasible: false, shelter, route: candidateRoutes[0] ?? null, verdict: "infeasible", reasons };
  }
  if (remaining <= 0) {
    return {
      feasible: false,
      shelter,
      route: usable[0] ?? null,
      verdict: "capacity-exhausted",
      reasons: ["No plannable capacity left (10% walk-in reserve is protected)"],
    };
  }

  let best: { route: EngineRoute; cost: CostBreakdown } | null = null;
  for (const r of usable) {
    const c = routeCost(group, r, shelter);
    if (!best || c.total < best.cost.total) best = { route: r, cost: c };
  }
  return { feasible: true, shelter, route: best!.route, cost: best!.cost };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
