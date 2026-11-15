/**
 * In-memory "database" for the mock API. Backend tables are stored with exactly the backend columns;
 * extension tables sit beside them keyed by the same primary keys.
 */
import type {
  AssignmentExt,
  DrillEvent,
  DrillPhase,
  Household,
  OpsEvent,
  PlanVersion,
  RouteExt,
  ShelterExt,
  UserScope,
  VehicleExt,
  ZoneExt,
} from "../extensions";
import type {
  AffectedZone,
  AuditLog,
  Disaster,
  EvacuationAssignment,
  EvacuationPlan,
  Notification,
  RescueTeam,
  Resource,
  Route,
  Shelter,
  User,
  Vehicle,
  VehicleAssignment,
} from "../schemas";

export type DisasterRow = Omit<Disaster, "zones">;
export type ShelterRow = Omit<Shelter, "available_capacity">;
export type PlanRow = Omit<EvacuationPlan, "assignments">;
export type AssignmentRow = Omit<EvacuationAssignment, "vehicle_assignments">;
export type UserRow = User & { password: string };

export interface AssignmentProgress {
  assignment_id: number;
  trips: number;
  trip_capacity: number;
  /** People already handled before the current trip timeline started (set when the fleet is rebalanced). */
  base: number;
  travel_minutes: number;
  delivered: number;
}

export interface DrillRecord {
  scenario_id: string | null;
  phase: DrillPhase;
  speed: number;
  timeline: DrillEvent[];
  fired_event_ids: string[];
  /** JSON snapshot of the state at T+0 so the drill can be replayed. */
  snapshot: string | null;
}

export interface DbState {
  schema_version: number;
  scenario_id: string;
  sim_minute: number;
  seq: Record<string, number>;
  users: UserRow[];
  scopes: UserScope[];
  disasters: DisasterRow[];
  zones: AffectedZone[];
  zone_ext: ZoneExt[];
  households: Household[];
  shelters: ShelterRow[];
  shelter_ext: ShelterExt[];
  routes: Route[];
  route_ext: RouteExt[];
  vehicles: Vehicle[];
  vehicle_ext: VehicleExt[];
  teams: RescueTeam[];
  resources: Resource[];
  plans: PlanRow[];
  assignments: AssignmentRow[];
  vehicle_assignments: VehicleAssignment[];
  assignment_ext: AssignmentExt[];
  progress: AssignmentProgress[];
  versions: PlanVersion[];
  notifications: Notification[];
  audit: AuditLog[];
  events: OpsEvent[];
  drill: DrillRecord;
}

export const SCHEMA_VERSION = 4;

export function nextId(db: DbState, table: string): number {
  const n = (db.seq[table] ?? 0) + 1;
  db.seq[table] = n;
  return n;
}
