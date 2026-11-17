/**
 * The SafeRoute API client (FastAPI backend, /api/v1). Every response is checked with zod
 * (schemas.ts, viewSchemas.ts) before a screen sees it.
 */
import { z } from "zod";
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
} from "../extensions";
import { ApiError, type CheckInResult, type DemoAccount, type DrillAction, type SafeRouteApi, type ShelterRoster } from "../SafeRouteApi";
import {
  AuditLogSchema,
  DashboardSummarySchema,
  DisasterSchema,
  NotificationSchema,
  ResourceSchema,
  TokenSchema,
  UserSchema,
  type AffectedZoneCreate,
  type AffectedZoneUpdate,
  type RescueTeamCreate,
  type RescueTeamUpdate,
  type RouteCreate,
  type RouteStatus,
  type RouteUpdate,
  type ShelterCreate,
  type ShelterStatus,
  type ShelterUpdate,
  type VehicleCreate,
  type VehicleUpdate,
} from "../schemas";
import {
  AssignmentViewSchema,
  CheckInResultSchema,
  ClockSchema,
  DemoAccountSchema,
  DrillStateSchema,
  HouseholdSchema,
  OpsEventSchema,
  PlanViewSchema,
  PublicLookupSchema,
  ResourceAllocationSchema,
  ReunificationHitSchema,
  RosterSchema,
  RouteViewSchema,
  ScenarioSummarySchema,
  SegmentSchema,
  SessionUserSchema,
  ShelterViewSchema,
  StrategyComparisonSchema,
  TeamViewSchema,
  TimelineSchema,
  VehicleViewSchema,
  ZoneViewSchema,
} from "../viewSchemas";

type Method = "GET" | "POST" | "PUT";
const None = z.null();

export class HttpApi implements SafeRouteApi {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null,
    /** Called when the server rejects our token (expired, or the account no longer exists). */
    private readonly onUnauthorized: () => void = () => {},
  ) {}

  private async request<S extends z.ZodType>(method: Method, path: string, schema: S, body?: unknown): Promise<z.infer<S>> {
    const token = this.getToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, `Cannot reach the SafeRoute server at ${this.baseUrl}. Check that the backend is running.`);
    }
    const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.status === 401 && token) this.onUnauthorized();
    if (!res.ok) {
      const detail = typeof data === "object" && data && "detail" in data ? (data as { detail: unknown }).detail : null;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? `Invalid input: ${(detail as { msg?: string }[]).map((d) => d.msg).join("; ")}`
            : `Request failed (${res.status})`;
      throw new ApiError(res.status, message);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(502, `Response from ${path} did not match the API contract (${issue?.path.join(".")}: ${issue?.message})`);
    }
    return parsed.data;
  }

  /** View responses are checked with zod; their nested documents are typed in extensions.ts. */
  private view<T>(method: Method, path: string, schema: z.ZodType, body?: unknown): Promise<T> {
    return this.request(method, path, schema, body) as Promise<T>;
  }

  /* ---------------- auth */

  login(email: string, password: string) {
    return this.request("POST", "/auth/login", TokenSchema, { email, password });
  }
  me(): Promise<SessionUser> {
    return this.request("GET", "/auth/me", SessionUserSchema);
  }
  demoAccounts(): Promise<DemoAccount[]> {
    return this.request("GET", "/auth/demo-accounts", z.array(DemoAccountSchema));
  }

  /* ---------------- reads */

  clock() {
    return this.request("GET", "/ops/clock", ClockSchema);
  }
  dashboardSummary() {
    return this.request("GET", "/dashboard/summary", DashboardSummarySchema);
  }
  timeline() {
    return this.request("GET", "/dashboard/timeline", TimelineSchema);
  }
  listDisasters() {
    return this.request("GET", "/disasters", z.array(DisasterSchema));
  }
  listUsers() {
    return this.request("GET", "/users", z.array(UserSchema));
  }
  listResources() {
    return this.request("GET", "/resources", z.array(ResourceSchema));
  }
  listNotifications() {
    return this.request("GET", "/notifications", z.array(NotificationSchema));
  }
  markNotificationRead(id: number) {
    return this.request("POST", `/notifications/${id}/read`, NotificationSchema);
  }
  listAudit() {
    return this.request("GET", "/logs/audit", z.array(AuditLogSchema));
  }
  listZones() {
    return this.view<ZoneView[]>("GET", "/zones", z.array(ZoneViewSchema));
  }
  listShelters() {
    return this.view<ShelterView[]>("GET", "/shelters", z.array(ShelterViewSchema));
  }
  listRoutes() {
    return this.view<RouteView[]>("GET", "/routes", z.array(RouteViewSchema));
  }
  listSegments() {
    return this.request("GET", "/routes/segments", z.array(SegmentSchema));
  }
  listVehicles() {
    return this.view<VehicleView[]>("GET", "/vehicles", z.array(VehicleViewSchema));
  }
  listTeams() {
    return this.view<TeamView[]>("GET", "/rescue-teams", z.array(TeamViewSchema));
  }
  opsEvents() {
    return this.view<OpsEvent[]>("GET", "/ops/events", z.array(OpsEventSchema));
  }

  /* ---------------- master data */

  createZone(body: AffectedZoneCreate) {
    return this.view<ZoneView>("POST", "/zones", ZoneViewSchema, body);
  }
  updateZone(id: number, body: AffectedZoneUpdate) {
    return this.view<ZoneView>("PUT", `/zones/${id}`, ZoneViewSchema, body);
  }
  createShelter(body: ShelterCreate) {
    return this.view<ShelterView>("POST", "/shelters", ShelterViewSchema, body);
  }
  updateShelter(id: number, body: ShelterUpdate) {
    return this.view<ShelterView>("PUT", `/shelters/${id}`, ShelterViewSchema, body);
  }
  createRoute(body: RouteCreate) {
    return this.view<RouteView>("POST", "/routes", RouteViewSchema, body);
  }
  updateRoute(id: number, body: RouteUpdate) {
    return this.view<RouteView>("PUT", `/routes/${id}`, RouteViewSchema, body);
  }
  createVehicle(body: VehicleCreate) {
    return this.view<VehicleView>("POST", "/vehicles", VehicleViewSchema, body);
  }
  updateVehicle(id: number, body: VehicleUpdate) {
    return this.view<VehicleView>("PUT", `/vehicles/${id}`, VehicleViewSchema, body);
  }
  createTeam(body: RescueTeamCreate) {
    return this.view<TeamView>("POST", "/rescue-teams", TeamViewSchema, body);
  }
  updateTeam(id: number, body: RescueTeamUpdate) {
    return this.view<TeamView>("PUT", `/rescue-teams/${id}`, TeamViewSchema, body);
  }
  transitionRoute(id: number, status: RouteStatus, reason?: string) {
    return this.view<RouteView>("POST", `/routes/${id}/status`, RouteViewSchema, { status, reason });
  }
  transitionShelter(id: number, status: ShelterStatus, reason?: string) {
    return this.view<ShelterView>("POST", `/shelters/${id}/status`, ShelterViewSchema, { status, reason });
  }
  setFacilities(shelterId: number, facilities: Facility[], availability: "Available" | "Unavailable", reason?: string) {
    return this.view<ShelterView>("POST", `/shelters/${shelterId}/facilities`, ShelterViewSchema, { facilities, availability, reason });
  }

  /* ---------------- planning */

  activePlan() {
    return this.view<PlanView | null>("GET", "/evacuations/plan", PlanViewSchema.nullable());
  }
  listAssignments(version?: number) {
    return this.view<AssignmentView[]>("GET", `/evacuations/assignments${version != null ? `?version=${version}` : ""}`, z.array(AssignmentViewSchema));
  }
  generatePlan(strategy: StrategyId) {
    return this.view<PlanView>("POST", "/evacuations/generate", PlanViewSchema, { strategy });
  }
  compareStrategies() {
    return this.view<StrategyComparison>("GET", "/evacuations/compare", StrategyComparisonSchema);
  }
  approveVersion(version: number) {
    return this.view<PlanView>("POST", `/evacuations/versions/${version}/approve`, PlanViewSchema);
  }
  overrideAssignment(assignmentId: number, shelterId: number, reason: string) {
    return this.view<PlanView>("POST", `/evacuations/assignments/${assignmentId}/override`, PlanViewSchema, { shelter_id: shelterId, reason });
  }
  resourceAllocations() {
    return this.request("GET", "/evacuations/resource-allocations", z.array(ResourceAllocationSchema));
  }

  /* ---------------- field */

  fieldTasks() {
    return this.view<AssignmentView[]>("GET", "/field/tasks", z.array(AssignmentViewSchema));
  }
  assignmentHouseholds(assignmentId: number) {
    return this.view<Household[]>("GET", `/assignments/${assignmentId}/households`, z.array(HouseholdSchema));
  }
  async markPickedUp(assignmentId: number, householdIds: string[]) {
    await this.request("POST", `/field/assignments/${assignmentId}/pickup`, None, { household_ids: householdIds });
  }
  async markArrived(assignmentId: number) {
    await this.request("POST", `/field/assignments/${assignmentId}/arrive`, None);
  }
  async reportPosition(vehicleId: number, latitude: number, longitude: number) {
    await this.request("POST", `/field/vehicles/${vehicleId}/position`, None, { latitude, longitude });
  }

  /* ---------------- shelters */

  shelterRoster(shelterId: number) {
    return this.view<ShelterRoster>("GET", `/shelters/${shelterId}/roster`, RosterSchema);
  }
  checkIn(shelterId: number, token: string) {
    return this.view<CheckInResult>("POST", `/shelters/${shelterId}/checkin`, CheckInResultSchema, { token });
  }
  registerWalkIn(shelterId: number, headName: string, people: number) {
    return this.view<CheckInResult>("POST", `/shelters/${shelterId}/walk-ins`, CheckInResultSchema, { head_name: headName, people });
  }
  reunificationSearch(query: string) {
    return this.view<ReunificationHit[]>("GET", `/reunification?q=${encodeURIComponent(query)}`, z.array(ReunificationHitSchema));
  }
  publicLookup(query: string) {
    return this.view<PublicLookupResult[]>("GET", `/public/lookup?q=${encodeURIComponent(query)}`, z.array(PublicLookupSchema));
  }

  /* ---------------- drills */

  drillState() {
    return this.view<DrillState>("GET", "/drill", DrillStateSchema);
  }
  scenarios() {
    return this.view<DrillScenarioSummary[]>("GET", "/drill/scenarios", z.array(ScenarioSummarySchema));
  }
  loadScenario(id: string) {
    return this.view<DrillState>("POST", "/drill/load", DrillStateSchema, { scenario_id: id });
  }
  drillControl(action: DrillAction) {
    return this.view<DrillState>("POST", "/drill/control", DrillStateSchema, action);
  }
  injectEvent(event: Omit<DrillEvent, "id" | "at_minute">) {
    return this.view<DrillState>("POST", "/drill/events", DrillStateSchema, event);
  }
}
