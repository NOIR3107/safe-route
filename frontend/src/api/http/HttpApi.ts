/**
 * Live implementation against the FastAPI backend in this repository (`/api/v1`).
 * Every response is validated with the zod contract in ../schemas.ts. Features that need the
 * proposed extension endpoints (docs/api-extensions.md) throw NotSupportedError.
 */
import { z } from "zod";
import type {
  AssignmentView,
  DrillScenarioSummary,
  DrillState,
  Facility,
  OpsEvent,
  PlanView,
  RouteView,
  SessionUser,
  Severity,
  ShelterView,
  TeamView,
  VehicleView,
  ZoneView,
} from "../extensions";
import { FACILITIES } from "../extensions";
import {
  ApiError,
  NotSupportedError,
  type CheckInResult,
  type DemoAccount,
  type SafeRouteApi,
  type ShelterRoster,
} from "../SafeRouteApi";
import {
  AffectedZoneSchema,
  AuditLogSchema,
  DashboardSummarySchema,
  DisasterSchema,
  EvacuationAssignmentSchema,
  EvacuationPlanSchema,
  NotificationSchema,
  RescueTeamSchema,
  ResourceSchema,
  RouteSchema,
  ShelterSchema,
  TokenSchema,
  UserSchema,
  VehicleSchema,
  type AffectedZone,
  type AffectedZoneCreate,
  type AffectedZoneUpdate,
  type EvacuationAssignment,
  type RescueTeam,
  type RescueTeamCreate,
  type RescueTeamUpdate,
  type Route,
  type RouteCreate,
  type RouteStatus,
  type RouteUpdate,
  type Shelter,
  type ShelterCreate,
  type ShelterStatus,
  type ShelterUpdate,
  type Vehicle,
  type VehicleCreate,
  type VehicleUpdate,
} from "../schemas";

type Method = "GET" | "POST" | "PUT";

export class HttpApi implements SafeRouteApi {
  readonly mode = "live" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null,
  ) {}

  subscribe(): () => void {
    return () => undefined; // live mode relies on TanStack Query polling
  }

  private async request<S extends z.ZodType>(method: Method, path: string, schema: S, body?: unknown): Promise<z.infer<S>> {
    const token = this.getToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, `Cannot reach the SafeRoute API at ${this.baseUrl}. Is the backend running?`);
    }
    const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const detail = typeof data === "object" && data && "detail" in data ? (data as { detail: unknown }).detail : null;
      throw new ApiError(res.status, typeof detail === "string" ? detail : `Request failed (${res.status})`);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new ApiError(502, `Response from ${path} did not match the API contract: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    }
    return parsed.data;
  }

  /* ---------------- auth */

  login(email: string, password: string) {
    return this.request("POST", "/auth/login/json", TokenSchema, { email, password });
  }

  async me(): Promise<SessionUser> {
    const u = await this.request("GET", "/auth/me", UserSchema);
    return { user_id: u.user_id, name: u.name, email: u.email, role: u.role, scope: { user_id: u.user_id, shelter_id: null, team_id: null, zone_ids: null } };
  }

  async demoAccounts(): Promise<DemoAccount[]> {
    // Accounts seeded by app/main.py::seed_default_admin
    return [
      { email: "admin@saferoute.org", password: "Admin@12345", role: "Admin", name: "System Administrator" },
      { email: "coordinator@saferoute.org", password: "Coord@12345", role: "Evacuation Coordinator", name: "Evacuation Coordinator" },
    ];
  }

  /* ---------------- backend reads */

  dashboardSummary() {
    return this.request("GET", "/dashboard/summary", DashboardSummarySchema);
  }
  listDisasters() {
    return this.request("GET", "/disasters/", z.array(DisasterSchema));
  }
  listUsers() {
    return this.request("GET", "/users/", z.array(UserSchema));
  }
  listResources() {
    return this.request("GET", "/resources/", z.array(ResourceSchema));
  }
  listNotifications() {
    return this.request("GET", "/logs/notifications", z.array(NotificationSchema));
  }
  markNotificationRead(id: number) {
    return this.request("PUT", `/logs/notifications/${id}/read`, NotificationSchema);
  }
  listAudit() {
    return this.request("GET", "/logs/audit", z.array(AuditLogSchema));
  }

  /* ---------------- views (backend rows + neutral extension defaults) */

  async listZones(): Promise<ZoneView[]> {
    return (await this.request("GET", "/zones/", z.array(AffectedZoneSchema))).map(toZoneView);
  }
  async listShelters(): Promise<ShelterView[]> {
    return (await this.request("GET", "/shelters/", z.array(ShelterSchema))).map(toShelterView);
  }
  async listRoutes(): Promise<RouteView[]> {
    return (await this.request("GET", "/routes/", z.array(RouteSchema))).map(toRouteView);
  }
  async listVehicles(): Promise<VehicleView[]> {
    return (await this.request("GET", "/vehicles/", z.array(VehicleSchema))).map(toVehicleView);
  }
  async listTeams(): Promise<TeamView[]> {
    return (await this.request("GET", "/rescue-teams/", z.array(RescueTeamSchema))).map(toTeamView);
  }

  /* ---------------- writes */

  async createZone(body: AffectedZoneCreate) {
    return toZoneView(await this.request("POST", "/zones/", AffectedZoneSchema, body));
  }
  async updateZone(id: number, body: AffectedZoneUpdate) {
    return toZoneView(await this.request("PUT", `/zones/${id}`, AffectedZoneSchema, body));
  }
  async createShelter(body: ShelterCreate) {
    return toShelterView(await this.request("POST", "/shelters/", ShelterSchema, body));
  }
  async updateShelter(id: number, body: ShelterUpdate) {
    return toShelterView(await this.request("PUT", `/shelters/${id}`, ShelterSchema, body));
  }
  async createRoute(body: RouteCreate) {
    return toRouteView(await this.request("POST", "/routes/", RouteSchema, body));
  }
  async updateRoute(id: number, body: RouteUpdate) {
    return toRouteView(await this.request("PUT", `/routes/${id}`, RouteSchema, body));
  }
  async createVehicle(body: VehicleCreate) {
    return toVehicleView(await this.request("POST", "/vehicles/", VehicleSchema, body));
  }
  async updateVehicle(id: number, body: VehicleUpdate) {
    return toVehicleView(await this.request("PUT", `/vehicles/${id}`, VehicleSchema, body));
  }
  async createTeam(body: RescueTeamCreate) {
    return toTeamView(await this.request("POST", "/rescue-teams/", RescueTeamSchema, body));
  }
  async updateTeam(id: number, body: RescueTeamUpdate) {
    return toTeamView(await this.request("PUT", `/rescue-teams/${id}`, RescueTeamSchema, body));
  }

  /** PUT /routes/{id}, then POST /evacuations/reallocate when the route became unusable (FR-10). */
  async transitionRoute(id: number, status: RouteStatus, reason?: string): Promise<RouteView> {
    const route = await this.updateRoute(id, { status });
    if (status === "Blocked" || status === "Flooded") {
      const plan = await this.activePlan();
      if (plan) {
        await this.request("POST", "/evacuations/reallocate", z.array(EvacuationAssignmentSchema), {
          plan_id: plan.plan_id,
          blocked_route_id: id,
          reason: reason ?? `Route ${id} ${status.toLowerCase()}`,
        });
      }
    }
    return route;
  }

  async transitionShelter(id: number, status: ShelterStatus, reason?: string): Promise<ShelterView> {
    const shelter = await this.updateShelter(id, { status });
    if (status === "Full" || status === "Closed" || status === "Inactive") {
      const plan = await this.activePlan();
      if (plan) {
        await this.request("POST", "/evacuations/reallocate", z.array(EvacuationAssignmentSchema), {
          plan_id: plan.plan_id,
          full_shelter_id: id,
          reason: reason ?? `Shelter ${id} ${status.toLowerCase()}`,
        });
      }
    }
    return shelter;
  }

  /* ---------------- planning */

  async activePlan(): Promise<PlanView | null> {
    const plans = await this.request("GET", "/evacuations/plans", z.array(EvacuationPlanSchema));
    const plan = plans.filter((p) => p.status !== "Cancelled").at(-1);
    return plan ? { ...plan, versions: [], current_version: null } : null;
  }

  async listAssignments(): Promise<AssignmentView[]> {
    const [plan, zones, shelters] = await Promise.all([this.activePlan(), this.listZones(), this.listShelters()]);
    if (!plan) return [];
    return plan.assignments
      .filter((a) => a.status !== "Rerouted" && a.status !== "Cancelled")
      .map((a) => toAssignmentView(a, zones, shelters));
  }

  async generatePlan(): Promise<PlanView> {
    const disasters = await this.listDisasters();
    const active = disasters.find((d) => d.status === "Active") ?? disasters[0];
    if (!active) throw new ApiError(400, "Create a disaster before generating a plan.");
    const plan = await this.request("POST", "/evacuations/generate", EvacuationPlanSchema, {
      disaster_id: active.disaster_id,
      plan_name: `${active.title} – Evacuation Plan`,
      consider_traffic: true,
    });
    return { ...plan, versions: [], current_version: null };
  }

  compareStrategies(): never {
    throw new NotSupportedError("Strategy comparison");
  }
  approveVersion(): never {
    throw new NotSupportedError("Plan approval");
  }
  overrideAssignment(): never {
    throw new NotSupportedError("Assignment override");
  }

  /* ---------------- operations: the live feed is built from backend notifications */

  async opsEvents(): Promise<OpsEvent[]> {
    const notes = await this.listNotifications();
    return notes.map((n) => ({
      id: n.notification_id,
      sim_minute: 0,
      timestamp: n.timestamp,
      level: n.type === "CRITICAL" ? "critical" : n.type === "WARNING" || n.type === "ALERT" ? "warning" : "info",
      title: n.type,
      detail: n.message,
    }));
  }
  async clock() {
    return { sim_minute: 0 };
  }

  fieldTasks(): never {
    throw new NotSupportedError("Field tasks");
  }
  assignmentHouseholds(): never {
    throw new NotSupportedError("Household lists");
  }
  markPickedUp(): never {
    throw new NotSupportedError("Pickup confirmation");
  }
  markArrived(): never {
    throw new NotSupportedError("Arrival confirmation");
  }
  shelterRoster(): Promise<ShelterRoster> {
    throw new NotSupportedError("Shelter roster");
  }
  checkIn(): Promise<CheckInResult> {
    throw new NotSupportedError("Check-in");
  }
  registerWalkIn(): Promise<CheckInResult> {
    throw new NotSupportedError("Walk-in registration");
  }
  reunificationSearch(): never {
    throw new NotSupportedError("Family reunification search");
  }
  publicLookup(): never {
    throw new NotSupportedError("Public evacuee lookup");
  }

  async drillState(): Promise<DrillState> {
    return { scenario_id: null, phase: "idle", sim_minute: 0, speed: 1, timeline: [], fired_event_ids: [], has_snapshot: false };
  }
  async scenarios(): Promise<DrillScenarioSummary[]> {
    return [];
  }
  loadScenario(): never {
    throw new NotSupportedError("Drill scenarios");
  }
  drillControl(): never {
    throw new NotSupportedError("Drill control");
  }
  advanceClock(): never {
    throw new NotSupportedError("Simulation clock");
  }
  injectEvent(): never {
    throw new NotSupportedError("Drill events");
  }
  async resetDemo(): Promise<void> {
    throw new NotSupportedError("Demo reset");
  }
}

/* ---------------- backend rows to view models (extension fields get empty defaults) */

const RISK_TO_SEVERITY: Record<AffectedZone["risk_level"], Severity> = { Extreme: 5, High: 4, Moderate: 3, Low: 2 };

function toZoneView(z: AffectedZone): ZoneView {
  return {
    ...z,
    ext: { zone_id: z.zone_id, code: z.name.slice(0, 3).toUpperCase(), severity: RISK_TO_SEVERITY[z.risk_level], centroid: [0, 0], polygon: [] },
    vulnerable: { elderly: 0, disabled: 0, medical: 0, children: 0 },
    household_count: 0,
  };
}

function parseFacilities(s: Shelter): Facility[] {
  const listed = s.facilities_list.filter((f) => f.availability_status !== "Unavailable").map((f) => f.facility_type);
  const names = listed.length > 0 ? listed : (s.facilities ?? "").split(",").map((x) => x.trim());
  return names.filter((f): f is Facility => (FACILITIES as readonly string[]).includes(f));
}

function toShelterView(s: Shelter): ShelterView {
  const reserved = Math.ceil(s.capacity * 0.1);
  const available = s.available_capacity ?? Math.max(0, s.capacity - s.current_occupancy - reserved);
  const load = s.current_occupancy / s.capacity;
  return {
    ...s,
    ext: { shelter_id: s.shelter_id, reserved_pct: 0.1, walk_ins: 0 },
    reserved,
    inbound: 0,
    available,
    available_facilities: parseFacilities(s),
    display_status:
      s.status === "Closed" || s.status === "Inactive" ? "Closed" : s.status === "Full" || available <= 0 ? "Full" : load >= 0.75 ? "Near Full" : "Open",
    utilization: load,
  };
}

function toRouteView(r: Route): RouteView {
  return { ...r, ext: { route_id: r.route_id, zone_id: 0, shelter_id: 0, path: [], via: [] } };
}

function toVehicleView(v: Vehicle): VehicleView {
  return { ...v, ext: { vehicle_id: v.vehicle_id, team_id: null, depot: [0, 0], position: [0, 0] }, assignment_id: null };
}

function toTeamView(t: RescueTeam): TeamView {
  return { ...t, vehicle_ids: [] };
}

function toAssignmentView(a: EvacuationAssignment, zones: ZoneView[], shelters: ShelterView[]): AssignmentView {
  const zone = zones.find((z) => z.zone_id === a.zone_id);
  return {
    ...a,
    ext: {
      assignment_id: a.assignment_id,
      household_ids: [],
      eta_minutes: 0,
      dispatch_minute: 0,
      approach_minutes: 0,
      vehicle_ids: a.vehicle_assignments.map((v) => v.vehicle_id),
      explanation: {
        summary: "Ranked by the backend suitability score (capacity 45%, travel time 35%, route risk 20%). Detailed explanations need the /explanations extension endpoint.",
        cost: { travel_time: 0, congestion_factor: 1, severity_weight: 1, travel_cost: 0, risk_penalty: 0, facility_penalty: 0, utilization_penalty: 0, stability_penalty: 0, total: 0, notes: [] },
        required_facilities: [],
        alternatives: [],
        strategy: "greedy",
      },
      approval: "Proposed",
      override_reason: null,
      version: 1,
    },
    zone_name: zone?.name ?? `Zone ${a.zone_id}`,
    shelter_name: shelters.find((s) => s.shelter_id === a.shelter_id)?.name ?? `Shelter ${a.shelter_id}`,
    route_label: a.route_id != null ? `R${a.route_id}` : null,
    severity: zone?.ext.severity ?? 3,
  };
}
