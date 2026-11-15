// Allocation (FR-07/08/09). Steps:
//   1. group households by zone + special needs
//   2. check every group/shelter pair (hard constraints) and cost it
//   3. let the strategy (Greedy or Min-Cost Flow) place whole households
//   4. dispatch vehicles and work out ETAs
//   5. write the explanation for each assignment and the plan metrics
import type {
  AssignmentExplanation,
  Facility,
  PlanMetrics,
  RejectedAlternative,
  StrategyId,
  UnallocatedGroup,
} from "@/api/extensions";
import type { DisasterSeverity } from "@/api/schemas";
import { CONGESTION_FACTOR, SEVERITY_WEIGHT, evaluateEdge, remainingCapacity, round1, type EdgeEvaluation } from "./cost";
import { approachMinutes, haversineKm } from "./geo";
import { MinCostFlow } from "./mcf";
import type { DemandGroup, EngineHousehold, EngineInput, EngineRoute, EngineVehicle, EngineZone } from "./model";
import { zonePriorityScore } from "./priority";

/* ------------------------------------------------------------------ public types */

export interface PlannedAssignment {
  zone_id: number;
  shelter_id: number;
  route_id: number;
  household_ids: string[];
  people: number;
  vehicle_ids: number[];
  approach_minutes: number;
  eta_minutes: number;
  /** Shuttle trips needed with the assigned vehicles. */
  trips: number;
  /** Seats per trip (sum of assigned vehicle capacity; whole group for walk-outs). */
  trip_capacity: number;
  /** One-way effective travel time (congestion applied). */
  travel_minutes: number;
  en_route: boolean;
  explanation: AssignmentExplanation;
}

export interface AllocationResult {
  strategy: StrategyId;
  assignments: PlannedAssignment[];
  unallocated: UnallocatedGroup[];
  metrics: PlanMetrics;
}

export interface AllocationOptions {
  strategy: StrategyId;
  disasterSeverity: DisasterSeverity;
}

/** A strategy decides how many whole households of each group go to each shelter. */
export interface AllocationStrategy {
  id: StrategyId;
  label: string;
  distribute(ctx: DistributionContext): Placement[];
}

export interface DistributionContext {
  groups: DemandGroup[];
  edges: Map<string, EdgeEvaluation[]>;
  capacity: Map<number, number>;
}

export interface Placement {
  group: DemandGroup;
  shelter_id: number | null;
  households: EngineHousehold[];
  /** Why cheaper shelters were skipped for this placement (strategy-specific wording). */
  skipped_reason?: string;
  unallocated_reason?: string;
}

/* ------------------------------------------------------------------ demand groups */

export const LOADING_MINUTES = 5;
export const WALK_SPEED_KMH = 4;

export function buildGroups(input: EngineInput, disasterSeverity: DisasterSeverity): DemandGroup[] {
  const zones = new Map(input.zones.map((z) => [z.zone_id, z]));
  const groups = new Map<string, DemandGroup>();
  for (const hh of input.households) {
    const zone = zones.get(hh.zone_id);
    if (!zone) continue;
    const needs = [...hh.needs].sort() as Facility[];
    const enRoute = [...(hh.en_route_vehicle_ids ?? [])].sort((a, b) => a - b);
    const key = [zone.zone_id, needs.join("+") || "general", hh.previous_shelter_id ?? "-", enRoute.join(".") || "-"].join("|");
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        zone,
        households: [],
        people: 0,
        needs,
        pet_share: 0,
        high_priority_people: 0,
        previous_shelter_id: hh.previous_shelter_id ?? null,
        en_route_vehicle_ids: enRoute,
        priority_score: zonePriorityScore(zone, disasterSeverity),
      };
      groups.set(key, g);
    }
    g.households.push(hh);
    g.people += hh.size;
    if (hh.high_priority) g.high_priority_people += hh.size;
  }
  for (const g of groups.values()) {
    const petPeople = g.households.filter((h) => h.wants_pets).reduce((s, h) => s + h.size, 0);
    g.pet_share = g.people > 0 ? petPeople / g.people : 0;
    g.households.sort((a, b) => b.size - a.size || a.household_id.localeCompare(b.household_id));
  }
  return [...groups.values()].sort(compareGroups);
}

/** Priority order: en-route first (stability), then severity, special needs, FR-06 score, size. */
export function compareGroups(a: DemandGroup, b: DemandGroup): number {
  return (
    b.en_route_vehicle_ids.length - a.en_route_vehicle_ids.length ||
    b.zone.severity - a.zone.severity ||
    b.needs.length - a.needs.length ||
    b.priority_score - a.priority_score ||
    b.people - a.people ||
    a.key.localeCompare(b.key)
  );
}

/* ------------------------------------------------------------------ strategies */

export const greedyStrategy: AllocationStrategy = {
  id: "greedy",
  label: "Greedy (priority-first, nearest feasible)",
  distribute({ groups, edges, capacity }) {
    const out: Placement[] = [];
    for (const g of groups) {
      const feasible = (edges.get(g.key) ?? []).filter(isFeasible).sort((a, b) => a.cost.total - b.cost.total);
      const byShelter = new Map<number, EngineHousehold[]>();
      const left: EngineHousehold[] = [];
      for (const hh of g.households) {
        const target = feasible.find((e) => (capacity.get(e.shelter.shelter_id) ?? 0) >= hh.size);
        if (!target) {
          left.push(hh);
          continue;
        }
        const id = target.shelter.shelter_id;
        capacity.set(id, (capacity.get(id) ?? 0) - hh.size);
        byShelter.set(id, [...(byShelter.get(id) ?? []), hh]);
      }
      for (const [shelter_id, households] of byShelter) {
        out.push({ group: g, shelter_id, households, skipped_reason: "Capacity already taken by higher-priority groups" });
      }
      if (left.length > 0) {
        out.push({ group: g, shelter_id: null, households: left, unallocated_reason: unallocatedReason(edges.get(g.key) ?? []) });
      }
    }
    return out;
  },
};

/** Cost of leaving a person unallocated; scaled by severity so low-severity groups are cut first. */
export function unallocatedCost(g: DemandGroup): number {
  return 10_000 * SEVERITY_WEIGHT[g.zone.severity] * (g.needs.length > 0 ? 1.5 : 1);
}

export const minCostFlowStrategy: AllocationStrategy = {
  id: "min-cost-flow",
  label: "Min-Cost Flow (global optimum)",
  distribute({ groups, edges, capacity }) {
    const shelterIds = [...capacity.keys()];
    const shelterNode = new Map(shelterIds.map((id, i) => [id, 1 + groups.length + i]));
    const source = 0;
    const sink = 1 + groups.length + shelterIds.length;
    const mcf = new MinCostFlow(sink + 1);

    const flowEdges: { g: DemandGroup; shelter_id: number; id: number; cost: number }[] = [];
    groups.forEach((g, gi) => {
      const gNode = 1 + gi;
      mcf.addEdge(source, gNode, g.people, 0);
      for (const e of edges.get(g.key) ?? []) {
        if (!e.feasible) continue;
        const id = mcf.addEdge(gNode, shelterNode.get(e.shelter.shelter_id)!, g.people, e.cost.total);
        flowEdges.push({ g, shelter_id: e.shelter.shelter_id, id, cost: e.cost.total });
      }
      mcf.addEdge(gNode, sink, g.people, unallocatedCost(g));
    });
    for (const id of shelterIds) mcf.addEdge(shelterNode.get(id)!, sink, capacity.get(id) ?? 0, 0);
    mcf.solve(source, sink);

    // Round the fractional-by-person flow back to whole households (households are never split).
    const out: Placement[] = [];
    for (const g of groups) {
      const quotas = new Map<number, number>();
      for (const fe of flowEdges) if (fe.g === g) quotas.set(fe.shelter_id, mcf.flowOn(fe.id));
      const feasible = (edges.get(g.key) ?? []).filter(isFeasible).sort((a, b) => a.cost.total - b.cost.total);
      const byShelter = new Map<number, EngineHousehold[]>();
      const left: EngineHousehold[] = [];
      for (const hh of g.households) {
        let target = feasible.find(
          (e) => (quotas.get(e.shelter.shelter_id) ?? 0) >= hh.size && (capacity.get(e.shelter.shelter_id) ?? 0) >= hh.size,
        );
        if (!target) {
          // Rounding slack: use the shelter with the most leftover quota that still has room.
          target = [...feasible]
            .filter((e) => (quotas.get(e.shelter.shelter_id) ?? 0) > 0 && (capacity.get(e.shelter.shelter_id) ?? 0) >= hh.size)
            .sort((a, b) => (quotas.get(b.shelter.shelter_id) ?? 0) - (quotas.get(a.shelter.shelter_id) ?? 0))[0];
        }
        if (!target) {
          left.push(hh);
          continue;
        }
        const id = target.shelter.shelter_id;
        quotas.set(id, (quotas.get(id) ?? 0) - hh.size);
        capacity.set(id, (capacity.get(id) ?? 0) - hh.size);
        byShelter.set(id, [...(byShelter.get(id) ?? []), hh]);
      }
      // Second pass: anyone left over goes to any feasible shelter with room (rounding leftovers).
      const stillLeft: EngineHousehold[] = [];
      for (const hh of left) {
        const target = feasible.find((e) => (capacity.get(e.shelter.shelter_id) ?? 0) >= hh.size);
        if (!target) {
          stillLeft.push(hh);
          continue;
        }
        const id = target.shelter.shelter_id;
        capacity.set(id, (capacity.get(id) ?? 0) - hh.size);
        byShelter.set(id, [...(byShelter.get(id) ?? []), hh]);
      }
      for (const [shelter_id, households] of byShelter) {
        out.push({
          group: g,
          shelter_id,
          households,
          skipped_reason: "Capacity reserved for groups where it lowers total system cost more",
        });
      }
      if (stillLeft.length > 0) {
        out.push({ group: g, shelter_id: null, households: stillLeft, unallocated_reason: unallocatedReason(edges.get(g.key) ?? []) });
      }
    }
    return out;
  },
};

export const STRATEGIES: Record<StrategyId, AllocationStrategy> = {
  greedy: greedyStrategy,
  "min-cost-flow": minCostFlowStrategy,
};

/* ------------------------------------------------------------------ pipeline */

export function allocate(input: EngineInput, options: AllocationOptions): AllocationResult {
  const strategy = STRATEGIES[options.strategy];
  const groups = buildGroups(input, options.disasterSeverity);

  const capacity = new Map<number, number>();
  for (const s of input.shelters) if (s.open) capacity.set(s.shelter_id, remainingCapacity(s));

  const edges = new Map<string, EdgeEvaluation[]>();
  for (const g of groups) {
    edges.set(
      g.key,
      input.shelters.map((s) => evaluateEdge(g, s, input.routes, s.open ? remainingCapacity(s) : 0)),
    );
  }

  const placements = strategy.distribute({ groups, edges, capacity: new Map(capacity) });

  const drafts: PlannedAssignment[] = [];
  const unallocated: UnallocatedGroup[] = [];
  for (const p of placements) {
    const ids = p.households.map((h) => h.household_id);
    const people = p.households.reduce((s, h) => s + h.size, 0);
    if (p.shelter_id == null) {
      unallocated.push({ zone_id: p.group.zone.zone_id, household_ids: ids, people, reason: p.unallocated_reason ?? "No feasible shelter" });
      continue;
    }
    const groupEdges = edges.get(p.group.key) ?? [];
    const chosen = groupEdges.find((e) => e.shelter.shelter_id === p.shelter_id);
    if (!chosen || !chosen.feasible) continue;
    drafts.push({
      zone_id: p.group.zone.zone_id,
      shelter_id: p.shelter_id,
      route_id: chosen.route.route_id,
      household_ids: ids,
      people,
      vehicle_ids: [],
      approach_minutes: 0,
      eta_minutes: 0,
      trips: 1,
      trip_capacity: people,
      travel_minutes: 0,
      en_route: p.group.en_route_vehicle_ids.length > 0,
      explanation: explain(p, chosen, groupEdges, strategy.id),
    });
  }

  dispatchVehicles(drafts, input, groups);
  const metrics = computeMetrics(input, drafts, unallocated);
  return { strategy: strategy.id, assignments: drafts, unallocated, metrics };
}

/** Runs both strategies on the same input without committing anything. */
export function compareStrategies(input: EngineInput, disasterSeverity: DisasterSeverity) {
  return {
    greedy: allocate(input, { strategy: "greedy", disasterSeverity }),
    "min-cost-flow": allocate(input, { strategy: "min-cost-flow", disasterSeverity }),
  };
}

/* ------------------------------------------------------------------ explanations */

function explain(
  p: Placement,
  chosen: Extract<EdgeEvaluation, { feasible: true }>,
  groupEdges: EdgeEvaluation[],
  strategy: StrategyId,
): AssignmentExplanation {
  const feasible = groupEdges.filter(isFeasible).sort((a, b) => a.cost.total - b.cost.total);
  const cheapest = feasible[0];
  const isCheapest = cheapest?.shelter.shelter_id === chosen.shelter.shelter_id;
  const g = p.group;

  const parts: string[] = [];
  if (isCheapest) {
    parts.push(`${chosen.shelter.name} has the lowest weighted cost (${chosen.cost.total}) of ${feasible.length} feasible shelter${feasible.length === 1 ? "" : "s"}.`);
  } else {
    parts.push(`${chosen.shelter.name} chosen (cost ${chosen.cost.total}); cheaper options were not available to this group: ${p.skipped_reason ?? "capacity"}.`);
  }
  parts.push(`Severity ${g.zone.severity} zone, so travel time is weighted ×${SEVERITY_WEIGHT[g.zone.severity]}.`);
  if (g.needs.length > 0) parts.push(`Group requires ${g.needs.join(" + ").toLowerCase()}, so shelters without it were excluded.`);
  if (g.en_route_vehicle_ids.length > 0) parts.push("Group is already in vehicles; the stability penalty discourages changing its destination.");

  const alternatives: RejectedAlternative[] = groupEdges
    .filter((e) => e.shelter.shelter_id !== chosen.shelter.shelter_id)
    .map((e): RejectedAlternative => {
      if (!e.feasible) {
        return {
          shelter_id: e.shelter.shelter_id,
          shelter_name: e.shelter.name,
          route_id: e.route?.route_id ?? null,
          verdict: e.verdict,
          reasons: e.reasons,
          cost: null,
          delta_pct: null,
        };
      }
      const delta = Math.round(((e.cost.total - chosen.cost.total) / Math.max(0.1, chosen.cost.total)) * 100);
      const cheaper = e.cost.total < chosen.cost.total;
      return {
        shelter_id: e.shelter.shelter_id,
        shelter_name: e.shelter.name,
        route_id: e.route.route_id,
        verdict: cheaper ? "capacity-exhausted" : "higher-cost",
        reasons: cheaper
          ? [p.skipped_reason ?? "Capacity used elsewhere"]
          : [`Weighted cost ${e.cost.total} vs ${chosen.cost.total}`, ...topDifferences(chosen.cost.notes, e.cost.notes)],
        cost: e.cost.total,
        delta_pct: delta,
      };
    })
    .sort((a, b) => verdictRank(a.verdict) - verdictRank(b.verdict) || (a.cost ?? 1e9) - (b.cost ?? 1e9));

  return { summary: parts.join(" "), cost: chosen.cost, required_facilities: g.needs, alternatives, strategy };
}

function topDifferences(chosenNotes: string[], altNotes: string[]): string[] {
  return altNotes.filter((n) => !chosenNotes.includes(n) && !n.includes(" min × ")).slice(0, 2);
}

function verdictRank(v: RejectedAlternative["verdict"]): number {
  return v === "capacity-exhausted" ? 0 : v === "higher-cost" ? 1 : 2;
}

function isFeasible(e: EdgeEvaluation): e is Extract<EdgeEvaluation, { feasible: true }> {
  return e.feasible;
}

function unallocatedReason(edges: EdgeEvaluation[]): string {
  const feasible = edges.filter(isFeasible);
  if (feasible.length > 0) return "All feasible shelters are at plannable capacity";
  const reasons = new Set(edges.flatMap((e) => (e.feasible ? [] : e.reasons)));
  return `No feasible shelter: ${[...reasons].slice(0, 3).join("; ")}`;
}

/* ------------------------------------------------------------------ vehicles & ETA */

function effectiveTravel(route: EngineRoute): number {
  const f = CONGESTION_FACTOR[route.status];
  return Number.isFinite(f) ? route.travel_time * f : route.travel_time;
}

function dispatchVehicles(drafts: PlannedAssignment[], input: EngineInput, groups: DemandGroup[]): void {
  const zones = new Map<number, EngineZone>(input.zones.map((z) => [z.zone_id, z]));
  const routes = new Map(input.routes.map((r) => [r.route_id, r]));
  const busy = new Map((input.busy_vehicles ?? []).map((v) => [v.vehicle_id, v]));
  const pool: EngineVehicle[] = [...input.vehicles];

  const ordered = [...drafts].sort(
    (a, b) =>
      Number(b.en_route) - Number(a.en_route) ||
      zones.get(b.zone_id)!.severity - zones.get(a.zone_id)!.severity ||
      b.explanation.required_facilities.length - a.explanation.required_facilities.length ||
      b.people - a.people,
  );

  const capOf = (d: PlannedAssignment) =>
    d.vehicle_ids.reduce((s, id) => s + (busy.get(id)?.capacity ?? input.vehicles.find((v) => v.vehicle_id === id)?.capacity ?? 0), 0);

  const take = (d: PlannedAssignment) => {
    const zone = zones.get(d.zone_id)!;
    const medical = d.explanation.required_facilities.includes("Medical");
    pool.sort((a, b) => {
      const pa = medical && a.vehicle_type === "Ambulance" ? -100 : 0;
      const pb = medical && b.vehicle_type === "Ambulance" ? -100 : 0;
      return pa + haversineKm(a.position, zone.centroid) - (pb + haversineKm(b.position, zone.centroid));
    });
    const v = pool.shift();
    if (v) d.vehicle_ids.push(v.vehicle_id);
    return v;
  };

  // En-route groups keep the vehicles they are sitting in.
  for (const d of ordered) {
    if (!d.en_route) continue;
    const g = groups.find((x) => x.zone.zone_id === d.zone_id && x.households.some((h) => d.household_ids.includes(h.household_id)));
    d.vehicle_ids = [...(g?.en_route_vehicle_ids ?? [])];
  }
  // Round 1: every new assignment gets its nearest suitable vehicle.
  for (const d of ordered) if (!d.en_route) take(d);
  // Further rounds (minimax): keep adding a vehicle to the assignment with the worst projected ETA,
  // weighted by severity, until every group fits in one trip or the fleet is exhausted.
  const projected = (d: PlannedAssignment) => {
    const trips = Math.ceil(d.people / Math.max(1, capOf(d)));
    if (trips <= 1) return -1;
    const travel = effectiveTravel(routes.get(d.route_id)!);
    return (LOADING_MINUTES * trips + travel * (2 * trips - 1)) * SEVERITY_WEIGHT[zones.get(d.zone_id)!.severity];
  };
  while (pool.length > 0) {
    let worst: PlannedAssignment | null = null;
    let worstEta = 0;
    for (const d of ordered) {
      if (d.en_route || d.vehicle_ids.length === 0) continue;
      const p = projected(d);
      if (p > worstEta) {
        worstEta = p;
        worst = d;
      }
    }
    if (!worst) break;
    take(worst);
  }

  for (const d of drafts) {
    const route = routes.get(d.route_id)!;
    const zone = zones.get(d.zone_id)!;
    const travel = effectiveTravel(route);
    if (d.en_route) {
      d.approach_minutes = 0;
      d.trips = 1;
      d.trip_capacity = d.people;
      d.travel_minutes = Math.round(travel);
      d.eta_minutes = Math.round(travel + LOADING_MINUTES);
      continue;
    }
    if (d.vehicle_ids.length === 0) {
      const walk = Math.round((route.distance_km / WALK_SPEED_KMH) * 60);
      d.approach_minutes = 0;
      d.trips = 1;
      d.trip_capacity = d.people;
      d.travel_minutes = walk;
      d.eta_minutes = walk + LOADING_MINUTES;
      d.explanation.cost.notes.push("No vehicle free; guided walk-out ETA");
      continue;
    }
    const firstVehicle = input.vehicles.find((v) => v.vehicle_id === d.vehicle_ids[0]);
    const approach = firstVehicle ? approachMinutes(firstVehicle.position, zone.centroid) : 0;
    const trips = Math.ceil(d.people / Math.max(1, capOf(d)));
    d.approach_minutes = approach;
    d.trips = trips;
    d.trip_capacity = capOf(d);
    d.travel_minutes = Math.round(travel);
    d.eta_minutes = Math.round(approach + LOADING_MINUTES * trips + d.travel_minutes * (2 * trips - 1));
  }
}

/* ------------------------------------------------------------------ metrics */

export function computeMetrics(input: EngineInput, drafts: PlannedAssignment[], unallocated: UnallocatedGroup[]): PlanMetrics {
  const hh = new Map(input.households.map((h) => [h.household_id, h]));
  const allocated = drafts.reduce((s, d) => s + d.people, 0);
  const unalloc = unallocated.reduce((s, u) => s + u.people, 0);
  const etaWeighted = drafts.reduce((s, d) => s + d.eta_minutes * d.people, 0);
  const hpTotal = input.households.filter((h) => h.high_priority).reduce((s, h) => s + h.size, 0);
  const hpServed = drafts
    .flatMap((d) => d.household_ids)
    .map((id) => hh.get(id))
    .filter((h): h is EngineHousehold => !!h && h.high_priority)
    .reduce((s, h) => s + h.size, 0);
  const open = input.shelters.filter((s) => s.open);
  const cap = open.reduce((s, x) => s + x.capacity, 0);
  const committed = open.reduce((s, x) => s + x.committed, 0);
  return {
    people_allocated: allocated,
    people_unallocated: unalloc,
    avg_eta: allocated > 0 ? round1(etaWeighted / allocated) : 0,
    worst_eta: drafts.reduce((m, d) => Math.max(m, d.eta_minutes), 0),
    high_priority_total: hpTotal,
    high_priority_served: hpServed,
    total_cost: Math.round(drafts.reduce((s, d) => s + d.explanation.cost.total * d.people, 0)),
    shelter_utilization: cap > 0 ? Math.min(1, (committed + allocated) / cap) : 0,
    assignments: drafts.length,
    vehicles_used: new Set(drafts.flatMap((d) => d.vehicle_ids)).size,
  };
}
