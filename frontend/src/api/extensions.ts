// Data the frontend needs that the backend doesn't store yet: geometry, households, plan versions,
// explanations, drills, check-ins, field tasks. Everything is keyed by a backend id (zone_id,
// shelter_id, ...) so it sits next to the backend tables instead of replacing them.
// Proposed endpoints for these: docs/api-extensions.md
import type {
  AffectedZone,
  AssignmentStatus,
  EvacuationAssignment,
  EvacuationPlan,
  RescueTeam,
  Route,
  Shelter,
  UserRole,
  Vehicle,
} from "./schemas";

export type LatLng = [number, number];

/** Canonical facility vocabulary (backend stores these comma-separated in `Shelter.facilities`). */
export const FACILITIES = ["Medical", "Power", "Water", "Accessibility", "Pets", "Food", "Bedding"] as const;
export type Facility = (typeof FACILITIES)[number];

export type Severity = 1 | 2 | 3 | 4 | 5;

/* ------------------------------------------------------------------ zones & households */

export type HouseholdStatus = "Awaiting" | "Picked Up" | "Arrived" | "Checked In";

export interface Household {
  household_id: string; // e.g. HH-VEL-0012 (walk-ins: WI-<shelter>-<n>)
  /** null for walk-ins registered at a shelter without a known origin zone. */
  zone_id: number | null;
  token: string; // printed on the evacuee slip / QR code
  head_name: string;
  phone: string;
  members: string[];
  size: number;
  elderly: number;
  children: number;
  disabled: number;
  medical: number;
  pets: boolean;
  status: HouseholdStatus;
  /** Shelter the household physically checked in to (null until arrival). */
  shelter_id: number | null;
  /** Walk-ins registered directly at a shelter have no planned assignment. */
  walk_in: boolean;
}

export interface VulnerableCounts {
  elderly: number;
  disabled: number;
  medical: number;
  children: number;
}

export interface ZoneExt {
  zone_id: number;
  /** Short public code evacuees type on the public page, e.g. "VEL". */
  code: string;
  severity: Severity;
  centroid: LatLng;
  polygon: LatLng[];
}

/** AffectedZone joined with its extension and derived household statistics. */
export interface ZoneView extends AffectedZone {
  ext: ZoneExt;
  vulnerable: VulnerableCounts;
  household_count: number;
}

/* ------------------------------------------------------------------ shelters */

/** UI state machine: Open -> Near Full -> Full -> Closed (Near Full is derived from occupancy). */
export type ShelterDisplayStatus = "Open" | "Near Full" | "Full" | "Closed";

export interface ShelterExt {
  shelter_id: number;
  reserved_pct: number; // 0.10 = 10% buffer for walk-ins
  walk_ins: number;
}

export interface ShelterView extends Shelter {
  ext: ShelterExt;
  reserved: number;
  /** People with an active assignment who have not arrived yet. */
  inbound: number;
  /** capacity - occupancy - reserved - inbound (never below 0). */
  available: number;
  available_facilities: Facility[];
  display_status: ShelterDisplayStatus;
  utilization: number; // 0..1, occupancy / capacity
}

/* ------------------------------------------------------------------ routes, vehicles, teams */

export interface RouteExt {
  route_id: number;
  zone_id: number;
  shelter_id: number;
  path: LatLng[];
  /** Named road segments this corridor uses; a scenario event can close a segment (e.g. a bridge). */
  via: string[];
}

export interface RouteView extends Route {
  ext: RouteExt;
}

export interface VehicleExt {
  vehicle_id: number;
  team_id: number | null;
  depot: LatLng;
  position: LatLng;
}

export interface VehicleView extends Vehicle {
  ext: VehicleExt;
  /** Active assignment the vehicle is serving, if any. */
  assignment_id: number | null;
}

export interface TeamView extends RescueTeam {
  vehicle_ids: number[];
}

/* ------------------------------------------------------------------ explainability */

export interface CostBreakdown {
  travel_time: number;
  congestion_factor: number;
  severity_weight: number;
  travel_cost: number;
  risk_penalty: number;
  facility_penalty: number;
  utilization_penalty: number;
  stability_penalty: number;
  total: number;
  notes: string[];
}

export type AlternativeVerdict = "infeasible" | "higher-cost" | "capacity-exhausted";

export interface RejectedAlternative {
  shelter_id: number;
  shelter_name: string;
  route_id: number | null;
  verdict: AlternativeVerdict;
  reasons: string[];
  cost: number | null;
  /** Percentage more expensive than the chosen option. */
  delta_pct: number | null;
}

export interface AssignmentExplanation {
  summary: string;
  cost: CostBreakdown;
  required_facilities: Facility[];
  alternatives: RejectedAlternative[];
  strategy: StrategyId;
}

export type ApprovalState = "Proposed" | "Approved" | "Overridden";

export interface AssignmentExt {
  assignment_id: number;
  household_ids: string[];
  eta_minutes: number;
  /** Simulation minute at which this assignment was dispatched. */
  dispatch_minute: number;
  /** Minutes for the vehicle to reach the pickup point. */
  approach_minutes: number;
  vehicle_ids: number[];
  explanation: AssignmentExplanation;
  approval: ApprovalState;
  override_reason: string | null;
  version: number;
}

export interface AssignmentView extends EvacuationAssignment {
  ext: AssignmentExt;
  zone_name: string;
  shelter_name: string;
  route_label: string | null;
  severity: Severity;
}

/* ------------------------------------------------------------------ strategies, metrics, versions */

export type StrategyId = "greedy" | "min-cost-flow";

export interface PlanMetrics {
  people_allocated: number;
  people_unallocated: number;
  avg_eta: number;
  worst_eta: number;
  high_priority_total: number;
  high_priority_served: number;
  total_cost: number;
  shelter_utilization: number; // 0..1 after the plan lands
  assignments: number;
  vehicles_used: number;
}

export interface UnallocatedGroup {
  zone_id: number;
  household_ids: string[];
  people: number;
  reason: string;
}

export type ReplanTrigger =
  | { type: "Initial"; description: string }
  | { type: "Regenerate"; description: string }
  | { type: "RouteBlocked"; description: string; route_ids: number[] }
  | { type: "ShelterFull"; description: string; shelter_id: number }
  | { type: "ShelterClosed"; description: string; shelter_id: number }
  | { type: "FacilityLost"; description: string; shelter_id: number; facilities: Facility[] }
  | { type: "Override"; description: string; assignment_id: number };

export interface DiffMove {
  zone_id: number;
  zone_name: string;
  from_shelter_id: number | null;
  from_shelter_name: string | null;
  to_shelter_id: number | null;
  to_shelter_name: string | null;
  people: number;
  households: number;
  reason: string;
  eta_before: number | null;
  eta_after: number | null;
}

export interface PlanDiff {
  moves: DiffMove[];
  people_moved: number;
  people_unchanged: number;
  newly_unallocated: number;
  newly_allocated: number;
  avg_eta_delta: number;
}

export type VersionStatus = "Proposed" | "Approved" | "Superseded";

export interface PlanVersion {
  version: number;
  plan_id: number;
  created_at: string;
  sim_minute: number;
  trigger: ReplanTrigger;
  strategy: StrategyId;
  status: VersionStatus;
  assignment_ids: number[];
  unallocated: UnallocatedGroup[];
  metrics: PlanMetrics;
  diff: PlanDiff | null;
  approved_by: string | null;
  approved_at: string | null;
}

export interface PlanView extends EvacuationPlan {
  versions: PlanVersion[];
  current_version: PlanVersion | null;
}

export interface StrategyComparison {
  greedy: PlanMetrics;
  "min-cost-flow": PlanMetrics;
}

/* ------------------------------------------------------------------ live operations */

export type OpsEventLevel = "info" | "warning" | "critical" | "success";

export interface OpsEvent {
  id: number;
  sim_minute: number;
  timestamp: string;
  level: OpsEventLevel;
  title: string;
  detail: string;
}

export interface UserScope {
  user_id: number;
  shelter_id: number | null;
  team_id: number | null;
  zone_ids: number[] | null; // null = all zones
}

export interface SessionUser {
  user_id: number;
  name: string;
  email: string;
  role: UserRole;
  scope: UserScope;
}

/* ------------------------------------------------------------------ drills */

export type DrillEventKind =
  | "RouteSegmentBlocked"
  | "RouteSegmentCongested"
  | "RouteSegmentCleared"
  | "RouteBlocked"
  | "FacilityLost"
  | "ShelterClosed"
  | "WalkIns";

export interface DrillEvent {
  id: string;
  at_minute: number;
  kind: DrillEventKind;
  label: string;
  /** Named road segment for the *Segment* kinds. */
  segment?: string;
  route_id?: number;
  shelter_id?: number;
  facilities?: Facility[];
  people?: number;
  /** true when injected by an operator during the drill (recorded for replay). */
  manual?: boolean;
}

export interface DrillScenarioSummary {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  events: DrillEvent[];
}

export type DrillPhase = "idle" | "ready" | "running" | "paused" | "finished";

export interface DrillState {
  scenario_id: string | null;
  phase: DrillPhase;
  sim_minute: number;
  speed: number;
  timeline: DrillEvent[];
  fired_event_ids: string[];
  has_snapshot: boolean;
}

/* ------------------------------------------------------------------ public lookup */

export interface PublicLookupResult {
  zone_code: string;
  zone_name: string;
  household_id: string | null;
  head_name: string | null;
  people: number | null;
  shelter: { name: string; location: string; facilities: Facility[]; latitude: number; longitude: number } | null;
  route: { label: string; travel_time: number; status: Route["status"]; path: LatLng[] } | null;
  eta_minutes: number | null;
  assignment_status: AssignmentStatus | null;
  needs: { medical: boolean; accessibility: boolean; pets: boolean; children: boolean; elderly: boolean };
}

export interface ReunificationHit {
  household_id: string;
  member: string;
  head_name: string;
  zone_name: string;
  status: HouseholdStatus;
  shelter_name: string | null;
  planned_shelter_name: string | null;
}

export type { RescueTeam, Vehicle };
