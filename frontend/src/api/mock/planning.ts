// Service layer of the mock backend. Feeds the engine, saves its output as a new plan version (only
// the affected assignments change), and moves assignments along as the clock runs.
import { LOADING_MINUTES, allocate, type AllocationResult, type PlannedAssignment } from "@/engine/allocate";
import { CONGESTION_FACTOR, SEVERITY_WEIGHT } from "@/engine/cost";
import { approachMinutes } from "@/engine/geo";
import { diffPlans, type HouseholdPlacement } from "@/engine/diff";
import type { EngineHousehold, EngineInput, EngineRoute, EngineShelter, EngineVehicle, EngineZone } from "@/engine/model";
import { selectAffected, type ActiveAssignmentLite, type Displacement, type ReplanEvent } from "@/engine/replan";
import type {
  ApprovalState,
  Facility,
  Household,
  OpsEventLevel,
  PlanMetrics,
  PlanVersion,
  ReplanTrigger,
  StrategyId,
  UnallocatedGroup,
} from "../extensions";
import { ApiError } from "../SafeRouteApi";
import type { NotificationType } from "../schemas";
import { nextId, type AssignmentRow, type DbState, type PlanRow } from "./state";
import {
  availableFacilities,
  currentPlan,
  currentVersion,
  degradedFacilities,
  extOf,
  householdMap,
  inboundFor,
  isDelivered,
  movableAssignments,
  progressOf,
  reservedRemaining,
  routeLabel,
  shelterView,
  versionAssignments,
} from "./views";

export interface Actor {
  user_id: number | null;
  name: string;
}

export const SYSTEM: Actor = { user_id: null, name: "SafeRoute Engine" };

/* ------------------------------------------------------------------ logging */

export function simTimestamp(db: DbState, minute = db.sim_minute): string {
  const start = Date.parse(db.disasters[0]?.start_date ?? new Date().toISOString());
  return new Date(start + minute * 60_000).toISOString();
}

export function logEvent(db: DbState, level: OpsEventLevel, title: string, detail: string): void {
  db.events.push({ id: nextId(db, "events"), sim_minute: db.sim_minute, timestamp: simTimestamp(db), level, title, detail });
}

export function audit(db: DbState, actor: Actor, action: string, entityType: string | null, entityId: number | null, details: string): void {
  db.audit.push({
    log_id: nextId(db, "audit"),
    user_id: actor.user_id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
    timestamp: simTimestamp(db),
  });
}

export function notify(db: DbState, type: NotificationType, message: string, userId: number | null = null): void {
  db.notifications.push({
    notification_id: nextId(db, "notifications"),
    user_id: userId,
    message,
    type,
    status: "Unread",
    timestamp: simTimestamp(db),
  });
}

/* ------------------------------------------------------------------ engine projection */

export function needsOf(h: Household): Facility[] {
  const needs: Facility[] = [];
  if (h.medical > 0) needs.push("Medical");
  if (h.disabled > 0) needs.push("Accessibility");
  return needs;
}

function engineZones(db: DbState): EngineZone[] {
  return db.zones.map((z) => {
    const ext = db.zone_ext.find((e) => e.zone_id === z.zone_id)!;
    return {
      zone_id: z.zone_id,
      name: z.name,
      severity: ext.severity,
      centroid: ext.centroid,
      priority: z.priority,
      risk_level: z.risk_level,
      population: z.population,
      evacuated_count: z.evacuated_count,
    };
  });
}

function toEngineHousehold(db: DbState, h: Household, prev?: { shelter_id: number; vehicle_ids: number[] }): EngineHousehold {
  const severity = db.zone_ext.find((e) => e.zone_id === h.zone_id)?.severity ?? 3;
  return {
    household_id: h.household_id,
    zone_id: h.zone_id ?? -1,
    size: h.size,
    needs: needsOf(h),
    wants_pets: h.pets,
    high_priority: severity >= 4 || h.medical > 0 || h.disabled > 0,
    previous_shelter_id: prev?.shelter_id ?? null,
    en_route_vehicle_ids: prev?.vehicle_ids ?? [],
  };
}

function engineShelters(db: DbState, excluded: Set<string>, onlyIds?: number[]): EngineShelter[] {
  return db.shelters
    .filter((s) => !onlyIds || onlyIds.includes(s.shelter_id))
    .map((s) => {
      const open = s.status === "Active";
      return {
        shelter_id: s.shelter_id,
        name: s.name,
        open,
        closed_reason: open ? undefined : s.status === "Full" ? "Shelter marked full by manager" : `Shelter ${s.status.toLowerCase()}`,
        capacity: s.capacity,
        committed: s.current_occupancy + inboundFor(db, s.shelter_id, excluded),
        reserved: reservedRemaining(db, s),
        available_facilities: availableFacilities(s),
        degraded_facilities: degradedFacilities(s),
        position: [s.latitude ?? 0, s.longitude ?? 0],
      };
    });
}

function engineRoutes(db: DbState): EngineRoute[] {
  return db.routes.map((r) => {
    const ext = db.route_ext.find((e) => e.route_id === r.route_id)!;
    return {
      route_id: r.route_id,
      zone_id: ext.zone_id,
      shelter_id: ext.shelter_id,
      label: routeLabel(db, r.route_id) ?? `R${r.route_id}`,
      via: ext.via,
      distance_km: r.distance_km,
      travel_time: r.travel_time,
      risk_level: r.risk_level,
      status: r.status,
    };
  });
}

function engineVehicle(db: DbState, id: number): EngineVehicle {
  const v = db.vehicles.find((x) => x.vehicle_id === id)!;
  const ext = db.vehicle_ext.find((x) => x.vehicle_id === id)!;
  return { vehicle_id: id, vehicle_type: v.vehicle_type, capacity: v.capacity, position: ext.position };
}

export function buildInput(
  db: DbState,
  households: Household[],
  prev: Map<string, { shelter_id: number; vehicle_ids: number[] }>,
  excluded: Set<string>,
  releasedVehicles: Set<number>,
  onlyShelters?: number[],
): EngineInput {
  const busyIds = new Set([...prev.values()].flatMap((p) => p.vehicle_ids));
  const free = db.vehicles
    .filter((v) => (v.status === "Available" || releasedVehicles.has(v.vehicle_id)) && !busyIds.has(v.vehicle_id))
    .map((v) => engineVehicle(db, v.vehicle_id));
  return {
    zones: engineZones(db),
    households: households.filter((h) => h.zone_id != null).map((h) => toEngineHousehold(db, h, prev.get(h.household_id))),
    shelters: engineShelters(db, excluded, onlyShelters),
    routes: engineRoutes(db),
    vehicles: free,
    busy_vehicles: [...busyIds].map((id) => engineVehicle(db, id)),
  };
}

export function disasterSeverity(db: DbState) {
  return db.disasters[0]?.severity ?? "High";
}

/* ------------------------------------------------------------------ writing results */

function createAssignment(
  db: DbState,
  plan: PlanRow,
  pa: PlannedAssignment,
  version: number,
  approval: ApprovalState,
  overrideReason: string | null,
): number {
  const assignment_id = nextId(db, "assignments");
  const now = simTimestamp(db);
  db.assignments.push({
    assignment_id,
    plan_id: plan.plan_id,
    zone_id: pa.zone_id,
    shelter_id: pa.shelter_id,
    route_id: pa.route_id,
    people_count: pa.people,
    status: pa.en_route ? "In Progress" : "Scheduled",
    created_at: now,
  });
  for (const vehicle_id of pa.vehicle_ids) {
    db.vehicle_assignments.push({
      vehicle_assignment_id: nextId(db, "vehicle_assignments"),
      assignment_id,
      vehicle_id,
      departure_time: pa.en_route ? now : null,
      arrival_time: null,
      status: pa.en_route ? "In Transit" : "Assigned",
    });
    const v = db.vehicles.find((x) => x.vehicle_id === vehicle_id);
    if (v) v.status = pa.en_route ? "In Transit" : "Assigned";
  }
  db.assignment_ext.push({
    assignment_id,
    household_ids: pa.household_ids,
    eta_minutes: pa.eta_minutes,
    dispatch_minute: db.sim_minute,
    approach_minutes: pa.approach_minutes,
    vehicle_ids: pa.vehicle_ids,
    explanation: pa.explanation,
    approval,
    override_reason: overrideReason,
    version,
  });
  db.progress.push({
    assignment_id,
    trips: pa.trips,
    trip_capacity: Math.max(1, pa.trip_capacity),
    travel_minutes: pa.travel_minutes,
    delivered: 0,
    base: 0,
  });
  return assignment_id;
}

function placements(db: DbState, assignmentIds: number[]): Map<string, HouseholdPlacement> {
  const map = new Map<string, HouseholdPlacement>();
  for (const id of assignmentIds) {
    const a = db.assignments.find((x) => x.assignment_id === id);
    if (!a || a.status === "Cancelled") continue;
    const ext = extOf(db, id);
    for (const hh of ext.household_ids) map.set(hh, { shelter_id: a.shelter_id, eta: ext.dispatch_minute + ext.eta_minutes });
  }
  return map;
}

export function planMetrics(db: DbState, assignmentIds: number[], unallocated: UnallocatedGroup[]): PlanMetrics {
  const rows = assignmentIds.map((id) => db.assignments.find((a) => a.assignment_id === id)!).filter(Boolean);
  const allocated = rows.reduce((s, a) => s + a.people_count, 0);
  const arrivals = rows.map((a) => {
    const e = extOf(db, a.assignment_id);
    return { people: a.people_count, at: e.dispatch_minute + e.eta_minutes, cost: e.explanation.cost.total };
  });
  const isHp = (h: Household) => {
    const sev = db.zone_ext.find((z) => z.zone_id === h.zone_id)?.severity ?? 0;
    return h.zone_id != null && (sev >= 4 || h.medical > 0 || h.disabled > 0);
  };
  const served = new Set(rows.flatMap((a) => extOf(db, a.assignment_id).household_ids));
  const hpAll = db.households.filter(isHp);
  const open = db.shelters.filter((s) => s.status === "Active" || s.status === "Full");
  const cap = open.reduce((s, x) => s + x.capacity, 0);
  const load = open.reduce((s, x) => s + x.current_occupancy + inboundFor(db, x.shelter_id), 0);
  return {
    people_allocated: allocated,
    people_unallocated: unallocated.reduce((s, u) => s + u.people, 0),
    avg_eta: allocated > 0 ? Math.round((arrivals.reduce((s, a) => s + a.at * a.people, 0) / allocated) * 10) / 10 : 0,
    worst_eta: arrivals.reduce((m, a) => Math.max(m, a.at), 0),
    high_priority_total: hpAll.reduce((s, h) => s + h.size, 0),
    high_priority_served: hpAll.filter((h) => served.has(h.household_id) || isDelivered(h)).reduce((s, h) => s + h.size, 0),
    total_cost: Math.round(arrivals.reduce((s, a) => s + a.cost * a.people, 0)),
    shelter_utilization: cap > 0 ? Math.min(1, load / cap) : 0,
    assignments: rows.length,
    vehicles_used: new Set(rows.flatMap((a) => extOf(db, a.assignment_id).vehicle_ids)).size,
  };
}

/* ------------------------------------------------------------------ plan generation & re-planning */

export function generateInitialPlan(db: DbState, strategy: StrategyId, actor: Actor): PlanVersion {
  const disaster = db.disasters[0];
  if (!disaster) throw new ApiError(400, "No active disaster");
  const now = simTimestamp(db);
  const plan: PlanRow = {
    plan_id: nextId(db, "plans"),
    disaster_id: disaster.disaster_id,
    created_by: actor.user_id ?? 1,
    name: `${disaster.title} – Evacuation Plan`,
    status: "Active",
    priority: "Critical",
    created_at: now,
    updated_at: now,
  };
  db.plans.push(plan);
  const pending = db.households.filter((h) => h.status === "Awaiting" && h.zone_id != null);
  const result = allocate(buildInput(db, pending, new Map(), new Set(), new Set()), { strategy, disasterSeverity: disaster.severity });
  const ids = result.assignments.map((pa) => createAssignment(db, plan, pa, 1, "Proposed", null));
  const version: PlanVersion = {
    version: 1,
    plan_id: plan.plan_id,
    created_at: now,
    sim_minute: db.sim_minute,
    trigger: { type: "Initial", description: `Initial plan generated with ${strategyName(strategy)}` },
    strategy,
    status: "Proposed",
    assignment_ids: ids,
    unallocated: result.unallocated,
    metrics: result.metrics,
    diff: null,
    approved_by: null,
    approved_at: null,
  };
  db.versions.push(version);
  version.metrics = planMetrics(db, ids, result.unallocated); // after push so inbound counts this version
  audit(db, actor, "GENERATE_PLAN", "EvacuationPlan", plan.plan_id, `v1 via ${strategyName(strategy)}: ${ids.length} assignments, ${version.metrics.people_allocated} people allocated, ${version.metrics.people_unallocated} unallocated.`);
  notify(db, "ALERT", `Evacuation plan v1 proposed: ${version.metrics.people_allocated} people allocated to shelters. Awaiting coordinator approval.`);
  logEvent(db, "info", "Plan v1 proposed", `${ids.length} assignments · ${version.metrics.people_unallocated} people unallocated`);
  return version;
}

export function strategyName(s: StrategyId): string {
  return s === "greedy" ? "Greedy" : "Min-Cost Flow";
}

export interface ReplanOptions {
  event: ReplanEvent;
  trigger: ReplanTrigger;
  actor: Actor;
  strategy?: StrategyId;
  includeUnallocated?: boolean;
  onlyShelters?: number[];
  override?: { reason: string };
  /** Displace exactly this assignment (manual override) instead of using the event selector. */
  onlyAssignment?: number;
}

/**
 * Event-driven re-planning (FR-10). Selects affected households, allocates them (plus anyone still
 * unallocated) against the remaining capacity, and records a new plan version with a diff.
 * Returns null when the event affects nothing.
 */
export function replan(db: DbState, opts: ReplanOptions): PlanVersion | null {
  const plan = currentPlan(db);
  const prevVersion = currentVersion(db);
  if (!plan || !prevVersion) return null;
  const hh = householdMap(db);

  const lite: ActiveAssignmentLite[] = movableAssignments(db).map((a) => {
    const ext = extOf(db, a.assignment_id);
    return {
      assignment_id: a.assignment_id,
      zone_id: a.zone_id,
      shelter_id: a.shelter_id,
      route_id: a.route_id,
      household_ids: ext.household_ids.filter((id) => {
        const h = hh.get(id);
        return !!h && !isDelivered(h);
      }),
      status: a.status,
      severity: db.zone_ext.find((z) => z.zone_id === a.zone_id)?.severity ?? 3,
      required: ext.explanation.required_facilities,
    };
  });
  const displaced: Displacement[] = (
    opts.onlyAssignment != null
      ? lite
          .filter((a) => a.assignment_id === opts.onlyAssignment)
          .map((a) => ({ assignment_id: a.assignment_id, household_ids: a.household_ids, reason: opts.event.label }))
      : selectAffected(lite, opts.event, (id) => hh.get(id)?.size ?? 0)
  ).filter((d) => d.household_ids.length > 0);
  const unallocIds =
    opts.includeUnallocated === false
      ? []
      : prevVersion.unallocated.flatMap((u) => u.household_ids).filter((id) => hh.get(id)?.status === "Awaiting");
  const canRetry = opts.event.type === "Regenerate" || opts.event.type === "RetryUnallocated";
  if (displaced.length === 0 && !(canRetry && unallocIds.length > 0)) return null;

  const displacedIds = new Set(displaced.flatMap((d) => d.household_ids));
  const prev = new Map<string, { shelter_id: number; vehicle_ids: number[] }>();
  const releasedVehicles = new Set<number>();
  for (const d of displaced) {
    const a = db.assignments.find((x) => x.assignment_id === d.assignment_id)!;
    const ext = extOf(db, a.assignment_id);
    const stays = ext.household_ids.some((id) => !displacedIds.has(id));
    let anyEnRoute = false;
    for (const id of d.household_ids) {
      const enRoute = hh.get(id)?.status === "Picked Up";
      anyEnRoute ||= enRoute;
      prev.set(id, { shelter_id: a.shelter_id, vehicle_ids: enRoute ? ext.vehicle_ids : [] });
    }
    if (!stays && !anyEnRoute) for (const v of ext.vehicle_ids) releasedVehicles.add(v);
  }

  const toAllocate = [...displacedIds, ...unallocIds]
    .map((id) => hh.get(id))
    .filter((h): h is Household => !!h && !isDelivered(h));
  const strategy = opts.strategy ?? prevVersion.strategy;
  const input = buildInput(db, toAllocate, prev, displacedIds, releasedVehicles, opts.onlyShelters);
  const result: AllocationResult = allocate(input, { strategy, disasterSeverity: disasterSeverity(db) });

  // Nothing displaced and nobody newly placed: don't create a no-op version.
  if (displaced.length === 0 && result.assignments.length === 0) return null;

  if (opts.override && result.unallocated.some((u) => u.household_ids.some((id) => displacedIds.has(id)))) {
    const reason = result.unallocated[0]?.reason ?? "Shelter cannot take this group";
    throw new ApiError(409, `Override rejected: ${reason}`);
  }

  // ---- mutate: everything below commits the new version
  const prevPlacements = placements(db, prevVersion.assignment_ids);
  const remainderIds: number[] = [];
  for (const d of displaced) {
    const a = db.assignments.find((x) => x.assignment_id === d.assignment_id)!;
    const ext = extOf(db, a.assignment_id);
    const keep = ext.household_ids.filter((id) => !displacedIds.has(id));
    const originalStatus = a.status;
    a.status = "Rerouted";
    for (const va of db.vehicle_assignments.filter((v) => v.assignment_id === a.assignment_id)) va.status = "Reassigned";
    if (keep.length > 0) {
      remainderIds.push(splitRemainder(db, a, keep, originalStatus));
    }
  }
  for (const vid of releasedVehicles) {
    const v = db.vehicles.find((x) => x.vehicle_id === vid);
    if (v && !movableAssignments(db).some((a) => extOf(db, a.assignment_id).vehicle_ids.includes(vid))) v.status = "Available";
  }

  const versionNo = prevVersion.version + 1;
  const approval: ApprovalState = opts.override ? "Overridden" : "Proposed";
  const newIds = result.assignments.map((pa) => createAssignment(db, plan, pa, versionNo, approval, opts.override?.reason ?? null));
  const carried = prevVersion.assignment_ids.filter((id) => {
    const a = db.assignments.find((x) => x.assignment_id === id);
    return a && a.status !== "Rerouted" && a.status !== "Cancelled";
  });
  const assignment_ids = [...carried, ...remainderIds, ...newIds];

  const diffContext = {
    households: new Map(db.households.filter((h) => h.zone_id != null).map((h) => [h.household_id, { zone_id: h.zone_id!, size: h.size }])),
    zoneNames: new Map(db.zones.map((z) => [z.zone_id, z.name])),
    shelterNames: new Map(db.shelters.map((s) => [s.shelter_id, s.name])),
    reason: opts.trigger.description,
  };

  prevVersion.status = "Superseded";
  const version: PlanVersion = {
    version: versionNo,
    plan_id: plan.plan_id,
    created_at: simTimestamp(db),
    sim_minute: db.sim_minute,
    trigger: opts.trigger,
    strategy,
    status: "Proposed",
    assignment_ids,
    unallocated: result.unallocated,
    metrics: result.metrics,
    diff: null,
    approved_by: null,
    approved_at: null,
  };
  db.versions.push(version);
  // Re-dispatch vehicles first so the diff reports the ETA impact the evacuees will actually see.
  rebalanceFleet(db);
  const diff = diffPlans(prevPlacements, placements(db, assignment_ids), diffContext);
  version.diff = diff;
  version.metrics = planMetrics(db, assignment_ids, result.unallocated);
  plan.updated_at = simTimestamp(db);
  if (plan.status === "Draft") plan.status = "Active";

  const summary = `v${versionNo}: ${diff.people_moved} people moved, ${diff.newly_allocated} newly allocated, ${diff.newly_unallocated} newly unallocated (avg ETA ${signed(diff.avg_eta_delta)} min).`;
  if (opts.override) {
    audit(db, opts.actor, "ASSIGNMENT_OVERRIDE", "EvacuationAssignment", opts.trigger.type === "Override" ? opts.trigger.assignment_id : null, `${opts.trigger.description}. Reason: "${opts.override.reason}". ${summary}`);
  } else {
    // Same action name as app/engines/replanning_engine.py
    audit(db, opts.actor, "DYNAMIC_REALLOCATION", "EvacuationPlan", plan.plan_id, `${opts.trigger.description}. ${summary}`);
  }
  notify(db, opts.override ? "WARNING" : "CRITICAL", `REPLANNING ${summary} Trigger: ${opts.trigger.description}`);
  logEvent(db, "warning", `Plan v${versionNo} proposed`, `${opts.trigger.description} · ${diff.people_moved + diff.newly_allocated} people re-assigned`);
  return version;
}

function splitRemainder(db: DbState, old: AssignmentRow, keep: string[], originalStatus: AssignmentRow["status"]): number {
  const hh = householdMap(db);
  const ext = extOf(db, old.assignment_id);
  const prog = progressOf(db, old.assignment_id);
  const id = nextId(db, "assignments");
  const people = keep.reduce((s, k) => s + (hh.get(k)?.size ?? 0), 0);
  const allDelivered = keep.every((k) => {
    const h = hh.get(k);
    return !!h && isDelivered(h);
  });
  db.assignments.push({ ...old, assignment_id: id, people_count: Math.max(1, people), status: allDelivered ? "Completed" : originalStatus, created_at: simTimestamp(db) });
  for (const va of db.vehicle_assignments.filter((v) => v.assignment_id === old.assignment_id)) {
    db.vehicle_assignments.push({ ...va, vehicle_assignment_id: nextId(db, "vehicle_assignments"), assignment_id: id, status: allDelivered ? "Completed" : "In Transit" });
  }
  db.assignment_ext.push({ ...ext, assignment_id: id, household_ids: keep });
  db.progress.push({ ...prog, assignment_id: id, delivered: keep.filter((k) => isDelivered(hh.get(k)!)).reduce((s, k) => s + hh.get(k)!.size, 0) });
  if (allDelivered) releaseVehicles(db, id);
  return id;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Retries anyone still unallocated, e.g. after a route is cleared or a shelter reopens. */
export function retryUnallocated(db: DbState, description: string, actor: Actor): PlanVersion | null {
  const v = currentVersion(db);
  if (!v || v.unallocated.length === 0) return null;
  const next = replan(db, {
    event: { type: "RetryUnallocated", label: description },
    trigger: { type: "Regenerate", description },
    actor,
    includeUnallocated: true,
  });
  return next;
}

/** Re-plan when a shelter's planned inbound exceeds what it can still take (walk-ins, manual "Full"). */
export function checkShelterOverflow(db: DbState, shelterId: number, actor: Actor, label: string): PlanVersion | null {
  const s = db.shelters.find((x) => x.shelter_id === shelterId);
  if (!s) return null;
  const view = shelterView(db, s);
  const room = s.status === "Full" ? 0 : Math.max(0, s.capacity - s.current_occupancy - reservedRemaining(db, s));
  const overflow = view.inbound - room;
  if (overflow <= 0) return null;
  return replan(db, {
    event: { type: "ShelterFull", shelter_id: shelterId, overflow, label },
    trigger: { type: "ShelterFull", description: label, shelter_id: shelterId },
    actor,
    includeUnallocated: false,
  });
}

/* ------------------------------------------------------------------ progress over time */

export function deliverHousehold(db: DbState, h: Household, shelterId: number, status: "Arrived" | "Checked In"): void {
  if (isDelivered(h)) {
    if (status === "Checked In") h.status = "Checked In";
    return;
  }
  h.status = status;
  h.shelter_id = shelterId;
  const s = db.shelters.find((x) => x.shelter_id === shelterId);
  if (s) {
    s.current_occupancy = Math.min(s.capacity, s.current_occupancy + h.size);
    if (s.current_occupancy >= s.capacity && s.status === "Active") s.status = "Full";
  }
  const z = db.zones.find((x) => x.zone_id === h.zone_id);
  if (z) {
    z.evacuated_count = Math.min(z.population, z.evacuated_count + h.size);
    z.status = z.evacuated_count >= z.population ? "Evacuated" : "Partially Evacuated";
  }
}

export function releaseVehicles(db: DbState, assignmentId: number): void {
  const a = db.assignments.find((x) => x.assignment_id === assignmentId)!;
  const ext = extOf(db, assignmentId);
  const shelter = db.shelters.find((s) => s.shelter_id === a.shelter_id);
  for (const va of db.vehicle_assignments.filter((v) => v.assignment_id === assignmentId)) {
    if (va.status !== "Reassigned") {
      va.status = "Completed";
      va.arrival_time = simTimestamp(db);
    }
  }
  for (const vid of ext.vehicle_ids) {
    const stillBusy = movableAssignments(db).some((m) => m.assignment_id !== assignmentId && extOf(db, m.assignment_id).vehicle_ids.includes(vid));
    if (stillBusy) continue;
    const v = db.vehicles.find((x) => x.vehicle_id === vid);
    const vext = db.vehicle_ext.find((x) => x.vehicle_id === vid);
    if (v && v.status !== "Maintenance") v.status = "Available";
    if (vext && shelter?.latitude != null && shelter.longitude != null) vext.position = [shelter.latitude, shelter.longitude];
    if (v && shelter) v.current_location = shelter.location;
  }
}

export function completeIfDone(db: DbState, a: AssignmentRow): void {
  const hh = householdMap(db);
  const ext = extOf(db, a.assignment_id);
  if (ext.household_ids.every((id) => isDelivered(hh.get(id)!))) {
    a.status = "Completed";
    releaseVehicles(db, a.assignment_id);
    logEvent(db, "success", `${ext.household_ids.length} households reached ${db.shelters.find((s) => s.shelter_id === a.shelter_id)?.name}`, `Assignment #${a.assignment_id} completed (${a.people_count} people)`);
  }
}

export function markInProgress(db: DbState, a: AssignmentRow): void {
  if (a.status !== "Scheduled") return;
  a.status = "In Progress";
  for (const va of db.vehicle_assignments.filter((v) => v.assignment_id === a.assignment_id && v.status === "Assigned")) {
    va.status = "In Transit";
    va.departure_time = simTimestamp(db);
  }
  for (const vid of extOf(db, a.assignment_id).vehicle_ids) {
    const v = db.vehicles.find((x) => x.vehicle_id === vid);
    if (v && v.status !== "Maintenance") v.status = "In Transit";
  }
}

/** Advances every movable assignment along its trip timeline at the current sim minute. */
export function progressAssignments(db: DbState): void {
  const hh = householdMap(db);
  for (const a of movableAssignments(db)) {
    const ext = extOf(db, a.assignment_id);
    const p = progressOf(db, a.assignment_id);
    const t = db.sim_minute - ext.dispatch_minute;
    if (t < 0) continue;
    const cycle = 5 + 2 * p.travel_minutes;
    let pickups = 0;
    let arrivals = 0;
    for (let k = 1; k <= p.trips; k++) {
      if (ext.approach_minutes + (k - 1) * cycle <= t) pickups++;
      if (ext.approach_minutes + 5 * k + p.travel_minutes * (2 * k - 1) <= t) arrivals++;
    }
    const pickedTarget = Math.min(a.people_count, p.base + pickups * p.trip_capacity);
    const deliveredTarget = Math.min(a.people_count, p.base + arrivals * p.trip_capacity);
    let cum = 0;
    for (const id of ext.household_ids) {
      const h = hh.get(id);
      if (!h) continue;
      const before = cum;
      cum += h.size;
      if (before < deliveredTarget && !isDelivered(h)) {
        deliverHousehold(db, h, a.shelter_id, "Arrived");
        p.delivered += h.size;
      } else if (before < pickedTarget && h.status === "Awaiting") {
        h.status = "Picked Up";
      }
    }
    if (pickups > 0) markInProgress(db, a);
    completeIfDone(db, a);
  }
  rebalanceFleet(db);
}

/* ------------------------------------------------------------------ fleet rebalancing */

const MIN_GAIN_MINUTES = 8;

/**
 * People of an assignment still to be moved. For vehicle-less (walking) groups, people already walking
 * still count as remaining, so a vehicle can pick them up on the way.
 */
function remainingPeople(db: DbState, a: AssignmentRow): { base: number; remaining: number } {
  const hh = householdMap(db);
  const walking = extOf(db, a.assignment_id).vehicle_ids.length === 0;
  let base = 0;
  for (const id of extOf(db, a.assignment_id).household_ids) {
    const h = hh.get(id);
    if (!h) continue;
    if (walking ? isDelivered(h) : h.status !== "Awaiting") base += h.size;
  }
  return { base, remaining: Math.max(0, a.people_count - base) };
}

/** One-way vehicle travel on the assignment's route under current conditions. */
function vehicleTravel(db: DbState, a: AssignmentRow): number {
  const r = db.routes.find((x) => x.route_id === a.route_id);
  if (!r) return progressOf(db, a.assignment_id).travel_minutes;
  const f = CONGESTION_FACTOR[r.status];
  return Math.round(r.travel_time * (Number.isFinite(f) ? f : 1));
}

function projectedFinish(db: DbState, a: AssignmentRow): number {
  const ext = extOf(db, a.assignment_id);
  return ext.dispatch_minute + ext.eta_minutes;
}

/** Restarts an assignment's trip timeline from now with an explicit vehicle list. */
function rebase(db: DbState, a: AssignmentRow, vehicleIds: number[]): void {
  const ext = extOf(db, a.assignment_id);
  const p = progressOf(db, a.assignment_id);
  const { base, remaining } = remainingPeople(db, a);
  if (remaining <= 0) return;
  const added = vehicleIds.filter((v) => !ext.vehicle_ids.includes(v));
  const removed = ext.vehicle_ids.filter((v) => !vehicleIds.includes(v));
  const zone = db.zone_ext.find((z) => z.zone_id === a.zone_id);
  for (const vid of added) {
    db.vehicle_assignments.push({
      vehicle_assignment_id: nextId(db, "vehicle_assignments"),
      assignment_id: a.assignment_id,
      vehicle_id: vid,
      departure_time: simTimestamp(db),
      arrival_time: null,
      status: a.status === "In Progress" ? "In Transit" : "Assigned",
    });
    const v = db.vehicles.find((x) => x.vehicle_id === vid);
    if (v) v.status = a.status === "In Progress" ? "In Transit" : "Assigned";
  }
  for (const vid of removed) {
    const va = db.vehicle_assignments.find(
      (x) => x.assignment_id === a.assignment_id && x.vehicle_id === vid && x.status !== "Completed" && x.status !== "Reassigned",
    );
    if (va) va.status = "Reassigned";
  }
  const cap = vehicleIds.reduce((s, id) => s + (db.vehicles.find((v) => v.vehicle_id === id)?.capacity ?? 0), 0);
  const approach =
    vehicleIds.length === 0 || !zone
      ? 0
      : Math.min(...vehicleIds.map((id) => approachMinutes(db.vehicle_ext.find((v) => v.vehicle_id === id)!.position, zone.centroid)));
  const trips = Math.ceil(remaining / Math.max(1, cap));
  if (vehicleIds.length > 0) p.travel_minutes = vehicleTravel(db, a);
  ext.vehicle_ids = vehicleIds;
  ext.dispatch_minute = db.sim_minute;
  ext.approach_minutes = approach;
  ext.eta_minutes = Math.round(approach + LOADING_MINUTES * trips + p.travel_minutes * (2 * trips - 1));
  p.trips = trips;
  p.trip_capacity = Math.max(1, cap);
  p.base = base;
}

function finishWith(db: DbState, a: AssignmentRow, vehicleIds: number[]): number {
  const { remaining } = remainingPeople(db, a);
  const p = progressOf(db, a.assignment_id);
  const cap = vehicleIds.reduce((s, id) => s + (db.vehicles.find((v) => v.vehicle_id === id)?.capacity ?? 0), 0);
  if (cap === 0) return Number.POSITIVE_INFINITY;
  const trips = Math.ceil(remaining / cap);
  const travel = vehicleIds.length > 0 ? vehicleTravel(db, a) : p.travel_minutes;
  return db.sim_minute + LOADING_MINUTES * trips + travel * (2 * trips - 1);
}

/**
 * Dispatch-level optimisation (never changes a shelter assignment):
 *  1. Groups left without a vehicle (guided walk-outs) get a pooled set of vehicles – free ones first,
 *     then one spare from each group with slack – if that beats walking.
 *  2. Every other free vehicle goes to the group with the largest severity-weighted time saving.
 */
export function rebalanceFleet(db: DbState): number {
  const version = currentVersion(db);
  if (!version) return 0;
  const sev = (a: AssignmentRow) => SEVERITY_WEIGHT[db.zone_ext.find((z) => z.zone_id === a.zone_id)?.severity ?? 3];
  const open = () => movableAssignments(db).filter((a) => remainingPeople(db, a).remaining > 0);
  const vehiclesOf = (a: AssignmentRow) => extOf(db, a.assignment_id).vehicle_ids;
  let moves = 0;

  const walkers = open()
    .filter((a) => vehiclesOf(a).length === 0)
    .sort((x, y) => sev(y) - sev(x) || y.people_count - x.people_count);
  for (const a of walkers) {
    const walkFinish = projectedFinish(db, a);
    const pool: { vid: number; donor: AssignmentRow | null }[] = [
      ...db.vehicles.filter((v) => v.status === "Available").map((v) => ({ vid: v.vehicle_id, donor: null })),
      ...open()
        .filter((d) => d !== a && vehiclesOf(d).length >= 2)
        .sort((x, y) => projectedFinish(db, x) - projectedFinish(db, y))
        .filter((d) => finishWith(db, d, vehiclesOf(d).slice(0, -1)) <= walkFinish)
        .map((d) => ({ vid: vehiclesOf(d)[vehiclesOf(d).length - 1]!, donor: d })),
    ];
    const taken: typeof pool = [];
    for (const item of pool) {
      taken.push(item);
      const cap = taken.reduce((s2, t) => s2 + (db.vehicles.find((v) => v.vehicle_id === t.vid)?.capacity ?? 0), 0);
      if (remainingPeople(db, a).remaining <= cap * 2) break; // two shuttle trips or fewer
    }
    if (taken.length === 0 || finishWith(db, a, taken.map((t) => t.vid)) >= walkFinish - MIN_GAIN_MINUTES) continue;
    for (const t of taken) if (t.donor) rebase(db, t.donor, vehiclesOf(t.donor).filter((v) => v !== t.vid));
    rebase(db, a, taken.map((t) => t.vid));
    moves += taken.length;
  }

  for (const v of db.vehicles.filter((x) => x.status === "Available")) {
    let best: AssignmentRow | null = null;
    let bestScore = 0;
    for (const a of open()) {
      const gain = projectedFinish(db, a) - finishWith(db, a, [...vehiclesOf(a), v.vehicle_id]);
      if (gain < MIN_GAIN_MINUTES) continue;
      const score = gain * sev(a);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    if (!best) continue;
    rebase(db, best, [...vehiclesOf(best), v.vehicle_id]);
    moves++;
  }

  if (moves > 0) {
    version.metrics = planMetrics(db, version.assignment_ids, version.unallocated);
    logEvent(db, "info", "Fleet rebalanced", `${moves} vehicle${moves > 1 ? "s" : ""} re-dispatched to the slowest groups · worst arrival now T+${version.metrics.worst_eta}`);
  }
  return moves;
}

export function activeVersionAssignments(db: DbState): AssignmentRow[] {
  return versionAssignments(db);
}
