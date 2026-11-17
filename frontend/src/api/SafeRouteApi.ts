// Every screen gets its data through this interface, implemented by HttpApi against the FastAPI
// backend (/api/v1). The browser never talks to a raw data feed: the backend's database is the source
// of truth, and the WebSocket in live.ts only says what changed.
import type {
  AssignmentView,
  DrillEvent,
  DrillScenarioSummary,
  DrillState,
  Facility,
  Household,
  OpsEvent,
  PlanView,
  PublicLookupResult,
  ReunificationHit,
  RouteView,
  SessionUser,
  ShelterView,
  StrategyComparison,
  StrategyId,
  TeamView,
  VehicleView,
  ZoneView,
} from "./extensions";
import type {
  AffectedZoneCreate,
  AffectedZoneUpdate,
  AuditLog,
  DashboardSummary,
  Disaster,
  Notification,
  RescueTeamCreate,
  RescueTeamUpdate,
  Resource,
  RouteCreate,
  RouteStatus,
  RouteUpdate,
  ShelterCreate,
  ShelterStatus,
  ShelterUpdate,
  Token,
  User,
  VehicleCreate,
  VehicleUpdate,
} from "./schemas";
import type { Clock, ResourceAllocation, RoadSegment, Timeline } from "./viewSchemas";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface DemoAccount {
  email: string;
  password: string;
  role: SessionUser["role"];
  name: string;
}

export interface CheckInResult {
  ok: boolean;
  message: string;
  household: Household | null;
}

export type DrillAction =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "speed"; speed: number }
  | { type: "replay" }
  | { type: "reset" }
  | { type: "end" };

export interface ShelterRoster {
  expected: Household[];
  present: Household[];
}

export interface SafeRouteApi {
  /* auth */
  login(email: string, password: string): Promise<Token>;
  me(): Promise<SessionUser>;
  demoAccounts(): Promise<DemoAccount[]>;

  /* reads */
  clock(): Promise<Clock>;
  dashboardSummary(): Promise<DashboardSummary>;
  /** Real history for the dashboard sparklines. */
  timeline(): Promise<Timeline>;
  listDisasters(): Promise<Disaster[]>;
  listUsers(): Promise<User[]>;
  listResources(): Promise<Resource[]>;
  listNotifications(): Promise<Notification[]>;
  markNotificationRead(id: number): Promise<Notification>;
  listAudit(): Promise<AuditLog[]>;
  listZones(): Promise<ZoneView[]>;
  listShelters(): Promise<ShelterView[]>;
  listRoutes(): Promise<RouteView[]>;
  listSegments(): Promise<RoadSegment[]>;
  listVehicles(): Promise<VehicleView[]>;
  listTeams(): Promise<TeamView[]>;
  opsEvents(): Promise<OpsEvent[]>;

  /* master data (FR-01..05) */
  createZone(body: AffectedZoneCreate): Promise<ZoneView>;
  updateZone(id: number, body: AffectedZoneUpdate): Promise<ZoneView>;
  createShelter(body: ShelterCreate): Promise<ShelterView>;
  updateShelter(id: number, body: ShelterUpdate): Promise<ShelterView>;
  createRoute(body: RouteCreate): Promise<RouteView>;
  updateRoute(id: number, body: RouteUpdate): Promise<RouteView>;
  createVehicle(body: VehicleCreate): Promise<VehicleView>;
  updateVehicle(id: number, body: VehicleUpdate): Promise<VehicleView>;
  createTeam(body: RescueTeamCreate): Promise<TeamView>;
  updateTeam(id: number, body: RescueTeamUpdate): Promise<TeamView>;

  /** Status changes that re-plan the affected groups on the server (FR-10). */
  transitionRoute(id: number, status: RouteStatus, reason?: string): Promise<RouteView>;
  transitionShelter(id: number, status: ShelterStatus, reason?: string): Promise<ShelterView>;
  setFacilities(shelterId: number, facilities: Facility[], availability: "Available" | "Unavailable", reason?: string): Promise<ShelterView>;

  /* planning (FR-06..10) */
  activePlan(): Promise<PlanView | null>;
  listAssignments(version?: number): Promise<AssignmentView[]>;
  generatePlan(strategy: StrategyId): Promise<PlanView>;
  compareStrategies(): Promise<StrategyComparison>;
  approveVersion(version: number): Promise<PlanView>;
  overrideAssignment(assignmentId: number, shelterId: number, reason: string): Promise<PlanView>;
  resourceAllocations(): Promise<ResourceAllocation[]>;

  /* field team */
  fieldTasks(): Promise<AssignmentView[]>;
  assignmentHouseholds(assignmentId: number): Promise<Household[]>;
  markPickedUp(assignmentId: number, householdIds: string[]): Promise<void>;
  markArrived(assignmentId: number): Promise<void>;
  reportPosition(vehicleId: number, latitude: number, longitude: number): Promise<void>;

  /* shelter operations */
  shelterRoster(shelterId: number): Promise<ShelterRoster>;
  checkIn(shelterId: number, token: string): Promise<CheckInResult>;
  registerWalkIn(shelterId: number, headName: string, people: number): Promise<CheckInResult>;
  reunificationSearch(query: string): Promise<ReunificationHit[]>;

  /* public (no login) */
  publicLookup(query: string): Promise<PublicLookupResult[]>;

  /* drills: run on a copy of live data on the server */
  drillState(): Promise<DrillState>;
  scenarios(): Promise<DrillScenarioSummary[]>;
  loadScenario(id: string): Promise<DrillState>;
  drillControl(action: DrillAction): Promise<DrillState>;
  injectEvent(event: Omit<DrillEvent, "id" | "at_minute">): Promise<DrillState>;
}
