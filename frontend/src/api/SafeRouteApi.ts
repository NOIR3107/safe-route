// Every screen gets its data through this interface.
//   MockApi - runs in the browser, seeded, saved in IndexedDB   (VITE_API_MODE=mock)
//   HttpApi - the FastAPI backend in this repo                   (VITE_API_MODE=live)
// [ext] = needs a new backend endpoint (docs/api-extensions.md). HttpApi throws NotSupportedError
// for those for now.
import type {
  AssignmentView,
  DrillEvent,
  DrillScenarioSummary,
  DrillState,
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

export type ApiMode = "mock" | "live";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NotSupportedError extends ApiError {
  constructor(feature: string) {
    super(501, `"${feature}" needs a backend endpoint that is not implemented yet (see docs/api-extensions.md).`);
    this.name = "NotSupportedError";
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
  | { type: "reset" };

export interface ShelterRoster {
  expected: Household[];
  present: Household[];
}

export interface SafeRouteApi {
  readonly mode: ApiMode;
  /** Notifies listeners whenever server-side state changes (mock pushes; live relies on polling). */
  subscribe(listener: () => void): () => void;

  /* auth */
  login(email: string, password: string): Promise<Token>;
  me(): Promise<SessionUser>;
  demoAccounts(): Promise<DemoAccount[]>;

  /* backend reads */
  dashboardSummary(): Promise<DashboardSummary>;
  listDisasters(): Promise<Disaster[]>;
  listUsers(): Promise<User[]>;
  listResources(): Promise<Resource[]>;
  listNotifications(): Promise<Notification[]>;
  markNotificationRead(id: number): Promise<Notification>;
  listAudit(): Promise<AuditLog[]>;

  /* views = backend entity + [ext] fields */
  listZones(): Promise<ZoneView[]>;
  listShelters(): Promise<ShelterView[]>;
  listRoutes(): Promise<RouteView[]>;
  listVehicles(): Promise<VehicleView[]>;
  listTeams(): Promise<TeamView[]>;

  /* backend writes */
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

  /** State transitions that also fire re-planning events (RouteBlocked / ShelterClosed / ShelterFull). */
  transitionRoute(id: number, status: RouteStatus, reason?: string): Promise<RouteView>;
  transitionShelter(id: number, status: ShelterStatus, reason?: string): Promise<ShelterView>;

  /* planning */
  activePlan(): Promise<PlanView | null>;
  listAssignments(version?: number): Promise<AssignmentView[]>;
  generatePlan(strategy: StrategyId): Promise<PlanView>; // POST /evacuations/generate
  compareStrategies(): Promise<StrategyComparison>; // [ext]
  approveVersion(version: number): Promise<PlanView>; // [ext]
  overrideAssignment(assignmentId: number, shelterId: number, reason: string): Promise<PlanView>; // [ext]

  /* operations */
  opsEvents(): Promise<OpsEvent[]>; // [ext]
  clock(): Promise<{ sim_minute: number }>; // [ext]

  /* field team [ext] */
  fieldTasks(): Promise<AssignmentView[]>;
  assignmentHouseholds(assignmentId: number): Promise<Household[]>;
  markPickedUp(assignmentId: number, householdIds: string[]): Promise<void>;
  markArrived(assignmentId: number): Promise<void>;

  /* shelter operations [ext] */
  shelterRoster(shelterId: number): Promise<ShelterRoster>;
  checkIn(shelterId: number, token: string): Promise<CheckInResult>;
  registerWalkIn(shelterId: number, headName: string, people: number): Promise<CheckInResult>;
  reunificationSearch(query: string): Promise<ReunificationHit[]>;

  /* public [ext] (no auth) */
  publicLookup(query: string): Promise<PublicLookupResult[]>;

  /* drills [ext] */
  drillState(): Promise<DrillState>;
  scenarios(): Promise<DrillScenarioSummary[]>;
  loadScenario(id: string): Promise<DrillState>;
  drillControl(action: DrillAction): Promise<DrillState>;
  advanceClock(minutes: number): Promise<DrillState>;
  injectEvent(event: Omit<DrillEvent, "id" | "at_minute">): Promise<DrillState>;
  resetDemo(): Promise<void>;
}
