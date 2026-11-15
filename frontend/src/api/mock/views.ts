// Joins backend rows with their extension rows into what the screens show. No writes in here.
import { pointAlong } from "@/engine/geo";
import {
  FACILITIES,
  type AssignmentExt,
  type AssignmentView,
  type Facility,
  type Household,
  type LatLng,
  type PlanVersion,
  type RouteView,
  type ShelterDisplayStatus,
  type ShelterView,
  type TeamView,
  type VehicleView,
  type ZoneView,
} from "../extensions";
import type { DashboardSummary, EvacuationAssignment } from "../schemas";
import type { AssignmentProgress, AssignmentRow, DbState, PlanRow, ShelterRow } from "./state";

export const NEAR_FULL_THRESHOLD = 0.75;

/* ------------------------------------------------------------------ plan helpers */

export function currentPlan(db: DbState): PlanRow | null {
  const plans = db.plans.filter((p) => p.status !== "Cancelled");
  return plans[plans.length - 1] ?? null;
}

export function currentVersion(db: DbState): PlanVersion | null {
  const plan = currentPlan(db);
  if (!plan) return null;
  const versions = db.versions.filter((v) => v.plan_id === plan.plan_id);
  return versions[versions.length - 1] ?? null;
}

/** Assignment rows in the current version (any status except Rerouted/Cancelled). */
export function versionAssignments(db: DbState, version: PlanVersion | null = currentVersion(db)): AssignmentRow[] {
  if (!version) return [];
  const ids = new Set(version.assignment_ids);
  return db.assignments.filter((a) => ids.has(a.assignment_id) && a.status !== "Rerouted" && a.status !== "Cancelled");
}

export function movableAssignments(db: DbState): AssignmentRow[] {
  return versionAssignments(db).filter((a) => a.status === "Scheduled" || a.status === "In Progress");
}

export function extOf(db: DbState, assignmentId: number): AssignmentExt {
  return db.assignment_ext.find((e) => e.assignment_id === assignmentId)!;
}

export function progressOf(db: DbState, assignmentId: number): AssignmentProgress {
  return db.progress.find((p) => p.assignment_id === assignmentId)!;
}

export function householdMap(db: DbState): Map<string, Household> {
  return new Map(db.households.map((h) => [h.household_id, h]));
}

export function isDelivered(h: Household): boolean {
  return h.status === "Arrived" || h.status === "Checked In";
}

/* ------------------------------------------------------------------ shelters */

export function availableFacilities(s: ShelterRow): Facility[] {
  return s.facilities_list
    .filter((f) => f.availability_status !== "Unavailable")
    .map((f) => f.facility_type)
    .filter((f): f is Facility => (FACILITIES as readonly string[]).includes(f));
}

export function degradedFacilities(s: ShelterRow): Facility[] {
  return s.facilities_list
    .filter((f) => f.availability_status === "Unavailable")
    .map((f) => f.facility_type)
    .filter((f): f is Facility => (FACILITIES as readonly string[]).includes(f));
}

/** People on movable assignments to this shelter who have not arrived yet. */
export function inboundFor(db: DbState, shelterId: number, excludeHouseholds?: Set<string>): number {
  const hh = householdMap(db);
  let n = 0;
  for (const a of movableAssignments(db)) {
    if (a.shelter_id !== shelterId) continue;
    for (const id of extOf(db, a.assignment_id).household_ids) {
      const h = hh.get(id);
      if (!h || isDelivered(h) || excludeHouseholds?.has(id)) continue;
      n += h.size;
    }
  }
  return n;
}

export function reservedRemaining(db: DbState, s: ShelterRow): number {
  const ext = db.shelter_ext.find((e) => e.shelter_id === s.shelter_id);
  const reserved = Math.ceil(s.capacity * (ext?.reserved_pct ?? 0.1));
  return Math.max(0, reserved - (ext?.walk_ins ?? 0));
}

export function shelterView(db: DbState, s: ShelterRow): ShelterView {
  const ext = db.shelter_ext.find((e) => e.shelter_id === s.shelter_id) ?? { shelter_id: s.shelter_id, reserved_pct: 0.1, walk_ins: 0 };
  const reserved = Math.ceil(s.capacity * ext.reserved_pct);
  const inbound = inboundFor(db, s.shelter_id);
  const reserveLeft = reservedRemaining(db, s);
  const available = Math.max(0, s.capacity - s.current_occupancy - reserveLeft - inbound);
  const load = (s.current_occupancy + inbound) / s.capacity;
  let display: ShelterDisplayStatus;
  if (s.status === "Closed" || s.status === "Inactive") display = "Closed";
  else if (s.status === "Full" || s.current_occupancy >= s.capacity || available === 0) display = "Full";
  else if (load >= NEAR_FULL_THRESHOLD) display = "Near Full";
  else display = "Open";
  return {
    ...s,
    available_capacity: available,
    ext,
    reserved,
    inbound,
    available,
    available_facilities: availableFacilities(s),
    display_status: display,
    utilization: s.current_occupancy / s.capacity,
  };
}

/* ------------------------------------------------------------------ zones, routes, fleet */

export function zoneView(db: DbState, zoneId: number): ZoneView {
  const z = db.zones.find((x) => x.zone_id === zoneId)!;
  const ext = db.zone_ext.find((e) => e.zone_id === zoneId)!;
  const hh = db.households.filter((h) => h.zone_id === zoneId);
  return {
    ...z,
    ext,
    household_count: hh.length,
    vulnerable: {
      elderly: hh.reduce((s, h) => s + h.elderly, 0),
      disabled: hh.reduce((s, h) => s + h.disabled, 0),
      medical: hh.reduce((s, h) => s + h.medical, 0),
      children: hh.reduce((s, h) => s + h.children, 0),
    },
  };
}

export function routeView(db: DbState, routeId: number): RouteView {
  const r = db.routes.find((x) => x.route_id === routeId)!;
  return { ...r, ext: db.route_ext.find((e) => e.route_id === routeId)! };
}

export function routeLabel(db: DbState, routeId: number | null): string | null {
  if (routeId == null) return null;
  const ext = db.route_ext.find((e) => e.route_id === routeId);
  return ext && ext.via.length > 0 ? `R${routeId} via ${ext.via.join(" · ")}` : `R${routeId} direct`;
}

/** Vehicle position derived from its active assignment's trip timeline. */
export function vehiclePosition(db: DbState, vehicleId: number): { position: LatLng; assignment_id: number | null } {
  const vext = db.vehicle_ext.find((v) => v.vehicle_id === vehicleId)!;
  for (const a of movableAssignments(db)) {
    const ext = extOf(db, a.assignment_id);
    if (!ext.vehicle_ids.includes(vehicleId)) continue;
    const path = db.route_ext.find((r) => r.route_id === a.route_id)?.path;
    if (!path) break;
    const p = progressOf(db, a.assignment_id);
    const t = db.sim_minute - ext.dispatch_minute;
    if (t < ext.approach_minutes) {
      const f = ext.approach_minutes > 0 ? t / ext.approach_minutes : 1;
      return { position: lerp(vext.position, path[0]!, Math.max(0, f)), assignment_id: a.assignment_id };
    }
    const cycle = 5 + 2 * p.travel_minutes;
    const tt = t - ext.approach_minutes;
    const k = Math.floor(tt / Math.max(1, cycle));
    const within = tt - k * cycle;
    if (k >= p.trips) return { position: path[path.length - 1]!, assignment_id: a.assignment_id };
    if (within < 5) return { position: path[0]!, assignment_id: a.assignment_id };
    if (within < 5 + p.travel_minutes) {
      return { position: pointAlong(path, (within - 5) / Math.max(1, p.travel_minutes)), assignment_id: a.assignment_id };
    }
    return {
      position: pointAlong(path, 1 - (within - 5 - p.travel_minutes) / Math.max(1, p.travel_minutes)),
      assignment_id: a.assignment_id,
    };
  }
  return { position: vext.position, assignment_id: null };
}

function lerp(a: LatLng, b: LatLng, f: number): LatLng {
  const t = Math.min(1, f);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function vehicleView(db: DbState, vehicleId: number): VehicleView {
  const v = db.vehicles.find((x) => x.vehicle_id === vehicleId)!;
  const ext = db.vehicle_ext.find((e) => e.vehicle_id === vehicleId)!;
  const pos = vehiclePosition(db, vehicleId);
  return { ...v, ext: { ...ext, position: pos.position }, assignment_id: pos.assignment_id };
}

export function teamView(db: DbState, teamId: number): TeamView {
  const t = db.teams.find((x) => x.team_id === teamId)!;
  return { ...t, vehicle_ids: db.vehicle_ext.filter((v) => v.team_id === teamId).map((v) => v.vehicle_id) };
}

/* ------------------------------------------------------------------ assignments */

export function assignmentRow(db: DbState, a: AssignmentRow): EvacuationAssignment {
  return { ...a, vehicle_assignments: db.vehicle_assignments.filter((v) => v.assignment_id === a.assignment_id) };
}

export function assignmentView(db: DbState, a: AssignmentRow): AssignmentView {
  const zone = db.zones.find((z) => z.zone_id === a.zone_id);
  const zext = db.zone_ext.find((z) => z.zone_id === a.zone_id);
  return {
    ...assignmentRow(db, a),
    ext: extOf(db, a.assignment_id),
    zone_name: zone?.name ?? `Zone ${a.zone_id}`,
    shelter_name: db.shelters.find((s) => s.shelter_id === a.shelter_id)?.name ?? `Shelter ${a.shelter_id}`,
    route_label: routeLabel(db, a.route_id),
    severity: zext?.severity ?? 3,
  };
}

/* ------------------------------------------------------------------ dashboard (backend shape) */

export function dashboardSummary(db: DbState): DashboardSummary {
  const affected = db.zones.reduce((s, z) => s + z.population, 0);
  const evacuated = db.zones.reduce((s, z) => s + z.evacuated_count, 0);
  const cap = db.shelters.reduce((s, x) => s + x.capacity, 0);
  const occ = db.shelters.reduce((s, x) => s + x.current_occupancy, 0);
  return {
    disasters: { total: db.disasters.length, active: db.disasters.filter((d) => d.status === "Active").length },
    population: {
      total_affected: affected,
      total_evacuated: evacuated,
      evacuation_progress_percentage: round2((evacuated / Math.max(1, affected)) * 100),
    },
    shelters: {
      total: db.shelters.length,
      total_capacity: cap,
      current_occupancy: occ,
      occupancy_rate_percentage: round2((occ / Math.max(1, cap)) * 100),
    },
    logistics: {
      total_vehicles: db.vehicles.length,
      available_vehicles: db.vehicles.filter((v) => v.status === "Available").length,
      open_routes: db.routes.filter((r) => r.status === "Open").length,
      blocked_routes: db.routes.filter((r) => r.status === "Blocked" || r.status === "Flooded").length,
    },
    plans: {
      active_plans: db.plans.filter((p) => p.status === "Active").length,
      total_assignments: db.assignments.length,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
