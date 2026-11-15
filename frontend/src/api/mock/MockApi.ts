// Browser-only version of the backend: same response shapes, same role rules and audit actions as
// FastAPI, plus the features the backend doesn't have yet. State is saved to IndexedDB.
import { compareStrategies as runComparison } from "@/engine/allocate";
import { can, type Permission } from "@/lib/rbac";
import { ROUTE_TRANSITIONS, SHELTER_TRANSITIONS } from "@/lib/stateMachines";
import { DEMO_PASSWORDS, SCENARIO_PRESETS, DEFAULT_SCENARIO } from "@/seed";
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
} from "../extensions";
import {
  ApiError,
  type CheckInResult,
  type DemoAccount,
  type DrillAction,
  type SafeRouteApi,
  type ShelterRoster,
} from "../SafeRouteApi";
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
} from "../schemas";
import { advance, applyDrillEvent, applyRouteStatus, drillView, freshState, replayDrill, startDrill } from "./drill";
import { clearState, loadState, saveState } from "./persist";
import {
  audit,
  buildInput,
  checkShelterOverflow,
  completeIfDone,
  deliverHousehold,
  disasterSeverity,
  generateInitialPlan,
  logEvent,
  markInProgress,
  notify,
  replan,
  retryUnallocated,
  simTimestamp,
  type Actor,
} from "./planning";
import { nextId, type DbState } from "./state";
import {
  assignmentView,
  currentPlan,
  currentVersion,
  dashboardSummary,
  extOf,
  householdMap,
  isDelivered,
  movableAssignments,
  routeLabel,
  routeView,
  shelterView,
  teamView,
  vehicleView,
  versionAssignments,
  zoneView,
} from "./views";

export interface MockApiOptions {
  latencyMs?: number;
  persist?: boolean;
  initial?: DbState;
}

const delay = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());
const TOKEN_PREFIX = "mock-jwt.";

export class MockApi implements SafeRouteApi {
  readonly mode = "mock" as const;
  private db!: DbState;
  private readonly ready: Promise<void>;
  private readonly listeners = new Set<() => void>();
  private readonly latency: number;
  private readonly persist: boolean;

  constructor(
    private readonly getToken: () => string | null,
    opts: MockApiOptions = {},
  ) {
    this.latency = opts.latencyMs ?? 120;
    const shouldPersist = opts.persist ?? true;
    this.persist = shouldPersist;
    this.ready = (async () => {
      this.db = opts.initial ?? (shouldPersist ? await loadState() : null) ?? freshState(DEFAULT_SCENARIO.id);
    })();
  }

  /* ------------------------------------------------------------------ plumbing */

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async read<T>(fn: (db: DbState) => T, latency = this.latency): Promise<T> {
    await this.ready;
    await delay(latency);
    return structuredClone(fn(this.db));
  }

  private async write<T>(fn: (db: DbState) => T): Promise<T> {
    await this.ready;
    await delay(Math.min(this.latency, 80));
    const result = fn(this.db);
    this.commit();
    return structuredClone(result);
  }

  private commit(): void {
    if (this.persist) saveState(this.db);
    for (const l of this.listeners) l();
  }

  private session(db: DbState): SessionUser {
    const token = this.getToken();
    const id = token?.startsWith(TOKEN_PREFIX) ? Number(token.split(".")[1]) : NaN;
    const user = db.users.find((u) => u.user_id === id);
    if (!user) throw new ApiError(401, "Could not validate credentials");
    if (!user.is_active) throw new ApiError(400, "Inactive user");
    const scope = db.scopes.find((s) => s.user_id === user.user_id) ?? { user_id: user.user_id, shelter_id: null, team_id: null, zone_ids: null };
    return { user_id: user.user_id, name: user.name, email: user.email, role: user.role, scope };
  }

  private require(db: DbState, permission: Permission): SessionUser {
    const user = this.session(db);
    if (!can(user.role, permission)) {
      throw new ApiError(403, `Operation not permitted for ${user.role} (${permission}).`);
    }
    return user;
  }

  private actor(u: SessionUser): Actor {
    return { user_id: u.user_id, name: u.name };
  }

  private assertShelterScope(u: SessionUser, shelterId: number): void {
    if (u.role === "Shelter Manager" && u.scope.shelter_id !== shelterId) {
      throw new ApiError(403, "Shelter Managers can only manage their own shelter.");
    }
  }

  /* ------------------------------------------------------------------ auth */

  async login(email: string, password: string): Promise<Token> {
    return this.write((db) => {
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || user.password !== password) throw new ApiError(401, "Incorrect email or password");
      audit(db, { user_id: user.user_id, name: user.name }, "LOGIN", "User", user.user_id, `${user.role} signed in`);
      return {
        access_token: `${TOKEN_PREFIX}${user.user_id}.${Math.random().toString(36).slice(2)}`,
        token_type: "bearer",
        role: user.role,
        user_id: user.user_id,
        name: user.name,
      };
    });
  }

  me(): Promise<SessionUser> {
    return this.read((db) => this.session(db), 0);
  }

  demoAccounts(): Promise<DemoAccount[]> {
    return this.read((db) => db.users.map((u) => ({ email: u.email, password: DEMO_PASSWORDS[u.email] ?? u.password, role: u.role, name: u.name })), 0);
  }

  /* ------------------------------------------------------------------ backend reads */

  dashboardSummary(): Promise<DashboardSummary> {
    return this.read((db) => dashboardSummary(db));
  }

  listDisasters(): Promise<Disaster[]> {
    return this.read((db) => db.disasters.map((d) => ({ ...d, zones: db.zones.filter((z) => z.disaster_id === d.disaster_id) })));
  }

  listUsers(): Promise<User[]> {
    return this.read((db) => {
      this.session(db);
      return db.users.map(({ password: _p, ...u }) => u);
    });
  }

  listResources(): Promise<Resource[]> {
    return this.read((db) => db.resources);
  }

  listNotifications(): Promise<Notification[]> {
    return this.read((db) => {
      const u = this.session(db);
      return db.notifications.filter((n) => n.user_id == null || n.user_id === u.user_id).slice().reverse();
    }, 0);
  }

  markNotificationRead(id: number): Promise<Notification> {
    return this.write((db) => {
      this.session(db);
      const n = db.notifications.find((x) => x.notification_id === id);
      if (!n) throw new ApiError(404, "Notification not found");
      n.status = "Read";
      return n;
    });
  }

  listAudit(): Promise<AuditLog[]> {
    return this.read((db) => {
      this.require(db, "audit:read");
      return db.audit.slice().reverse();
    });
  }

  /* ------------------------------------------------------------------ views */

  listZones(): Promise<ZoneView[]> {
    return this.read((db) => db.zones.map((z) => zoneView(db, z.zone_id)));
  }

  listShelters(): Promise<ShelterView[]> {
    return this.read((db) => {
      const token = this.getToken();
      const u = token ? this.session(db) : null;
      const rows = u?.role === "Shelter Manager" ? db.shelters.filter((s) => s.shelter_id === u.scope.shelter_id) : db.shelters;
      return rows.map((s) => shelterView(db, s));
    });
  }

  listRoutes(): Promise<RouteView[]> {
    return this.read((db) => db.routes.map((r) => routeView(db, r.route_id)));
  }

  listVehicles(): Promise<VehicleView[]> {
    return this.read((db) => db.vehicles.map((v) => vehicleView(db, v.vehicle_id)));
  }

  listTeams(): Promise<TeamView[]> {
    return this.read((db) => db.teams.map((t) => teamView(db, t.team_id)));
  }

  /* ------------------------------------------------------------------ CRUD (backend endpoints) */

  createZone(body: AffectedZoneCreate): Promise<ZoneView> {
    return this.write((db) => {
      const u = this.require(db, "zone:write");
      const zone_id = nextId(db, "zones");
      db.zones.push({
        zone_id,
        disaster_id: body.disaster_id,
        name: body.name,
        location: body.location,
        state: body.state ?? null,
        district: body.district ?? null,
        population: body.population,
        priority: body.priority,
        risk_level: body.risk_level,
        evacuated_count: 0,
        status: "Pending",
      });
      const center = db.zone_ext[0]?.centroid ?? [13.03, 80.24];
      const c: [number, number] = [center[0] + 0.01, center[1] + 0.01];
      db.zone_ext.push({
        zone_id,
        code: body.name.slice(0, 3).toUpperCase(),
        severity: riskToSeverity(body.risk_level),
        centroid: c,
        polygon: [
          [c[0] + 0.004, c[1]],
          [c[0], c[1] + 0.005],
          [c[0] - 0.004, c[1]],
          [c[0], c[1] - 0.005],
        ],
      });
      audit(db, this.actor(u), "CREATE_ZONE", "AffectedZone", zone_id, `Registered zone ${body.name} (pop ${body.population})`);
      return zoneView(db, zone_id);
    });
  }

  updateZone(id: number, body: AffectedZoneUpdate): Promise<ZoneView> {
    return this.write((db) => {
      const u = this.session(db);
      if (!can(u.role, "zone:write") && u.role !== "Response Team") throw new ApiError(403, "Operation not permitted");
      const z = db.zones.find((x) => x.zone_id === id);
      if (!z) throw new ApiError(404, "Affected zone not found");
      Object.assign(z, stripUndefined(body));
      if (body.risk_level) db.zone_ext.find((e) => e.zone_id === id)!.severity = riskToSeverity(body.risk_level);
      audit(db, this.actor(u), "UPDATE_ZONE", "AffectedZone", id, JSON.stringify(body));
      return zoneView(db, id);
    });
  }

  createShelter(body: ShelterCreate): Promise<ShelterView> {
    return this.write((db) => {
      const u = this.require(db, "shelter:write");
      if (u.role === "Shelter Manager") throw new ApiError(403, "Shelter Managers cannot register new shelters.");
      const shelter_id = nextId(db, "shelters");
      const facilities = (body.facilities ?? "").split(",").map((f) => f.trim()).filter(Boolean);
      db.shelters.push({
        shelter_id,
        name: body.name,
        location: body.location,
        capacity: body.capacity,
        current_occupancy: body.current_occupancy ?? 0,
        facilities: facilities.join(","),
        status: body.status ?? "Active",
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        facilities_list: facilities.map((f) => ({
          facility_id: nextId(db, "facilities"),
          shelter_id,
          facility_type: f,
          capacity: null,
          availability_status: "Available" as const,
        })),
      });
      db.shelter_ext.push({ shelter_id, reserved_pct: 0.1, walk_ins: 0 });
      audit(db, this.actor(u), "CREATE_SHELTER", "Shelter", shelter_id, `Registered ${body.name} (capacity ${body.capacity})`);
      return shelterView(db, db.shelters.find((s) => s.shelter_id === shelter_id)!);
    });
  }

  updateShelter(id: number, body: ShelterUpdate): Promise<ShelterView> {
    return this.write((db) => {
      const u = this.require(db, "shelter:write");
      this.assertShelterScope(u, id);
      const s = db.shelters.find((x) => x.shelter_id === id);
      if (!s) throw new ApiError(404, "Shelter not found");
      const { status: _ignored, ...rest } = body;
      const next = { ...s, ...stripUndefined(rest) };
      if (next.current_occupancy > next.capacity) throw new ApiError(422, "Occupancy cannot exceed capacity (chk_shelter_occupancy_lte_capacity)");
      if (body.facilities != null) {
        const list = body.facilities.split(",").map((f) => f.trim()).filter(Boolean);
        next.facilities_list = list.map(
          (f) =>
            s.facilities_list.find((x) => x.facility_type === f) ?? {
              facility_id: nextId(db, "facilities"),
              shelter_id: id,
              facility_type: f,
              capacity: null,
              availability_status: "Available" as const,
            },
        );
      }
      Object.assign(s, next);
      audit(db, this.actor(u), "UPDATE_SHELTER", "Shelter", id, JSON.stringify(rest));
      checkShelterOverflow(db, id, this.actor(u), `${s.name} capacity updated`);
      return shelterView(db, s);
    });
  }

  createRoute(body: RouteCreate): Promise<RouteView> {
    return this.write((db) => {
      const u = this.require(db, "route:write");
      const zone = db.zones.find((z) => z.location === body.source);
      const shelter = db.shelters.find((s) => s.location === body.destination);
      if (!zone || !shelter) throw new ApiError(422, "Source must match a zone location and destination a shelter location");
      const route_id = nextId(db, "routes");
      db.routes.push({ route_id, ...body });
      const zc = db.zone_ext.find((e) => e.zone_id === zone.zone_id)!.centroid;
      db.route_ext.push({ route_id, zone_id: zone.zone_id, shelter_id: shelter.shelter_id, path: [zc, [shelter.latitude ?? zc[0], shelter.longitude ?? zc[1]]], via: [] });
      audit(db, this.actor(u), "CREATE_ROUTE", "Route", route_id, `${body.source} → ${body.destination}`);
      retryUnallocated(db, `New route R${route_id} opened`, this.actor(u));
      return routeView(db, route_id);
    });
  }

  updateRoute(id: number, body: RouteUpdate): Promise<RouteView> {
    return this.write((db) => {
      const u = this.require(db, "route:status");
      const r = db.routes.find((x) => x.route_id === id);
      if (!r) throw new ApiError(404, "Route not found");
      const { status, ...rest } = body;
      Object.assign(r, stripUndefined(rest));
      audit(db, this.actor(u), "UPDATE_ROUTE", "Route", id, JSON.stringify(rest));
      if (status && status !== r.status) applyRouteStatus(db, [id], status, `Route R${id} set to ${status}`, this.actor(u));
      return routeView(db, id);
    });
  }

  createVehicle(body: VehicleCreate): Promise<VehicleView> {
    return this.write((db) => {
      const u = this.require(db, "vehicle:write");
      const vehicle_id = nextId(db, "vehicles");
      db.vehicles.push({ vehicle_id, ...body, plate_number: body.plate_number ?? null });
      const depot = db.vehicle_ext[0]?.depot ?? [13.03, 80.24];
      db.vehicle_ext.push({ vehicle_id, team_id: null, depot, position: depot });
      audit(db, this.actor(u), "CREATE_VEHICLE", "Vehicle", vehicle_id, `${body.vehicle_type} (${body.capacity} seats)`);
      return vehicleView(db, vehicle_id);
    });
  }

  updateVehicle(id: number, body: VehicleUpdate): Promise<VehicleView> {
    return this.write((db) => {
      const u = this.require(db, "vehicle:status");
      const v = db.vehicles.find((x) => x.vehicle_id === id);
      if (!v) throw new ApiError(404, "Vehicle not found");
      Object.assign(v, stripUndefined(body));
      audit(db, this.actor(u), "UPDATE_VEHICLE", "Vehicle", id, JSON.stringify(body));
      return vehicleView(db, id);
    });
  }

  createTeam(body: RescueTeamCreate): Promise<TeamView> {
    return this.write((db) => {
      const u = this.require(db, "team:write");
      const team_id = nextId(db, "teams");
      db.teams.push({ team_id, ...body, current_location: body.current_location ?? null });
      audit(db, this.actor(u), "CREATE_TEAM", "RescueTeam", team_id, body.name);
      return teamView(db, team_id);
    });
  }

  updateTeam(id: number, body: RescueTeamUpdate): Promise<TeamView> {
    return this.write((db) => {
      const u = this.require(db, "team:status");
      const t = db.teams.find((x) => x.team_id === id);
      if (!t) throw new ApiError(404, "Rescue team not found");
      Object.assign(t, stripUndefined(body));
      audit(db, this.actor(u), "UPDATE_TEAM", "RescueTeam", id, JSON.stringify(body));
      return teamView(db, id);
    });
  }

  transitionRoute(id: number, status: RouteStatus, reason?: string): Promise<RouteView> {
    return this.write((db) => {
      const u = this.require(db, "route:status");
      const r = db.routes.find((x) => x.route_id === id);
      if (!r) throw new ApiError(404, "Route not found");
      if (!ROUTE_TRANSITIONS[r.status].includes(status)) throw new ApiError(409, `Illegal transition ${r.status} → ${status}`);
      applyRouteStatus(db, [id], status, reason?.trim() || `${routeLabel(db, id)} marked ${status.toLowerCase()} by ${u.name}`, this.actor(u));
      return routeView(db, id);
    });
  }

  transitionShelter(id: number, status: ShelterStatus, reason?: string): Promise<ShelterView> {
    return this.write((db) => {
      const u = this.require(db, "shelter:write");
      this.assertShelterScope(u, id);
      const s = db.shelters.find((x) => x.shelter_id === id);
      if (!s) throw new ApiError(404, "Shelter not found");
      if (!SHELTER_TRANSITIONS[s.status].includes(status)) throw new ApiError(409, `Illegal transition ${s.status} → ${status}`);
      const label = reason?.trim() || `${s.name} set to ${status} by ${u.name}`;
      s.status = status;
      audit(db, this.actor(u), "SHELTER_STATUS_CHANGE", "Shelter", id, label);
      if (status === "Closed" || status === "Inactive") {
        notify(db, "CRITICAL", `${label}. Inbound groups will be re-planned.`);
        logEvent(db, "critical", label, `${s.name} ${status.toLowerCase()}`);
        replan(db, {
          event: { type: "ShelterClosed", shelter_id: id, label },
          trigger: { type: "ShelterClosed", description: label, shelter_id: id },
          actor: this.actor(u),
        });
      } else if (status === "Full") {
        logEvent(db, "warning", label, `${s.name} accepting no further planned arrivals`);
        checkShelterOverflow(db, id, this.actor(u), label);
      } else {
        logEvent(db, "success", label, `${s.name} accepting evacuees`);
        retryUnallocated(db, label, this.actor(u));
      }
      return shelterView(db, s);
    });
  }

  /* ------------------------------------------------------------------ planning */

  private planView(db: DbState): PlanView | null {
    const plan = currentPlan(db);
    if (!plan) return null;
    const versions = db.versions.filter((v) => v.plan_id === plan.plan_id);
    return {
      ...plan,
      assignments: versionAssignments(db).map((a) => ({ ...a, vehicle_assignments: db.vehicle_assignments.filter((v) => v.assignment_id === a.assignment_id) })),
      versions,
      current_version: versions[versions.length - 1] ?? null,
    };
  }

  activePlan(): Promise<PlanView | null> {
    return this.read((db) => this.planView(db));
  }

  listAssignments(version?: number): Promise<AssignmentView[]> {
    return this.read((db) => {
      const v = version == null ? currentVersion(db) : db.versions.find((x) => x.version === version && x.plan_id === currentPlan(db)?.plan_id) ?? null;
      if (!v) return [];
      const ids = new Set(v.assignment_ids);
      return db.assignments.filter((a) => ids.has(a.assignment_id)).map((a) => assignmentView(db, a));
    });
  }

  generatePlan(strategy: StrategyId): Promise<PlanView> {
    return this.write((db) => {
      const u = this.require(db, "plan:generate");
      if (!currentPlan(db)) {
        generateInitialPlan(db, strategy, this.actor(u));
      } else {
        const label = `Regenerated with ${strategy === "greedy" ? "Greedy" : "Min-Cost Flow"} by ${u.name}`;
        const v = replan(db, {
          event: { type: "Regenerate", label },
          trigger: { type: "Regenerate", description: label },
          actor: this.actor(u),
          strategy,
        });
        if (!v) throw new ApiError(409, "Nothing left to re-plan: every group is already en route or delivered.");
      }
      return this.planView(db)!;
    });
  }

  compareStrategies(): Promise<StrategyComparison> {
    return this.read((db) => {
      this.require(db, "plan:view");
      // What-if: plan everyone not yet picked up, from the current state of roads and shelters.
      const pending: Household[] = db.households.filter((h) => h.status === "Awaiting" && h.zone_id != null);
      const excluded = new Set(pending.map((h) => h.household_id));
      const released = new Set(movableAssignments(db).flatMap((a) => extOf(db, a.assignment_id).vehicle_ids));
      const input = buildInput(db, pending, new Map(), excluded, released);
      const both = runComparison(input, disasterSeverity(db));
      return { greedy: both.greedy.metrics, "min-cost-flow": both["min-cost-flow"].metrics };
    }, 200);
  }

  approveVersion(version: number): Promise<PlanView> {
    return this.write((db) => {
      const u = this.require(db, "plan:approve");
      const v = currentVersion(db);
      if (!v || v.version !== version) throw new ApiError(409, "Only the current plan version can be approved.");
      if (v.status === "Approved") throw new ApiError(409, `v${version} is already approved.`);
      v.status = "Approved";
      v.approved_by = u.name;
      v.approved_at = simTimestamp(db);
      for (const id of v.assignment_ids) {
        const ext = extOf(db, id);
        if (ext.approval === "Proposed") ext.approval = "Approved";
      }
      audit(db, this.actor(u), "PLAN_APPROVED", "EvacuationPlan", v.plan_id, `Approved plan v${version} (${v.metrics.people_allocated} people, ${v.metrics.assignments} assignments)`);
      notify(db, "INFO", `Plan v${version} approved by ${u.name}.`);
      logEvent(db, "success", `Plan v${version} approved`, `by ${u.name}`);
      return this.planView(db)!;
    });
  }

  overrideAssignment(assignmentId: number, shelterId: number, reason: string): Promise<PlanView> {
    return this.write((db) => {
      const u = this.require(db, "plan:override");
      if (reason.trim().length < 10) throw new ApiError(422, "Override reason must be at least 10 characters.");
      const a = db.assignments.find((x) => x.assignment_id === assignmentId);
      if (!a) throw new ApiError(404, "Assignment not found");
      if (a.status !== "Scheduled" && a.status !== "In Progress") throw new ApiError(409, `Cannot override a ${a.status.toLowerCase()} assignment.`);
      if (a.shelter_id === shelterId) throw new ApiError(409, "Assignment already goes to that shelter.");
      const from = db.shelters.find((s) => s.shelter_id === a.shelter_id)!.name;
      const to = db.shelters.find((s) => s.shelter_id === shelterId)?.name ?? `Shelter ${shelterId}`;
      const description = `Manual override: assignment #${assignmentId} ${from} → ${to} by ${u.name}`;
      // Re-plan only this assignment, restricted to the chosen shelter. Overrides bypass RouteBlocked selection.
      const v = replan(db, {
        event: { type: "Regenerate", label: description },
        trigger: { type: "Override", description, assignment_id: assignmentId },
        actor: this.actor(u),
        includeUnallocated: false,
        onlyShelters: [shelterId],
        override: { reason: reason.trim() },
        onlyAssignment: assignmentId,
      });
      if (!v) throw new ApiError(409, "Nothing to override.");
      return this.planView(db)!;
    });
  }

  /* ------------------------------------------------------------------ operations */

  opsEvents(): Promise<OpsEvent[]> {
    return this.read((db) => db.events.slice(-80).reverse(), 0);
  }

  clock(): Promise<{ sim_minute: number }> {
    return this.read((db) => ({ sim_minute: db.sim_minute }), 0);
  }

  /* ------------------------------------------------------------------ field team */

  fieldTasks(): Promise<AssignmentView[]> {
    return this.read((db) => {
      const u = this.session(db);
      if (u.role !== "Response Team" && u.role !== "Admin") throw new ApiError(403, "Field tasks are for response teams.");
      const teamVehicles = new Set(db.vehicle_ext.filter((v) => u.role === "Admin" || v.team_id === u.scope.team_id).map((v) => v.vehicle_id));
      return versionAssignments(db)
        .filter((a) => extOf(db, a.assignment_id).vehicle_ids.some((v) => teamVehicles.has(v)))
        .map((a) => assignmentView(db, a))
        .sort((x, y) => statusRank(x.status) - statusRank(y.status) || y.severity - x.severity);
    });
  }

  assignmentHouseholds(assignmentId: number): Promise<Household[]> {
    return this.read((db) => {
      this.session(db);
      const hh = householdMap(db);
      return extOf(db, assignmentId).household_ids.map((id) => hh.get(id)!).filter(Boolean);
    });
  }

  markPickedUp(assignmentId: number, householdIds: string[]): Promise<void> {
    return this.write((db) => {
      const u = this.require(db, "field:update");
      const a = db.assignments.find((x) => x.assignment_id === assignmentId);
      if (!a) throw new ApiError(404, "Assignment not found");
      const hh = householdMap(db);
      const allowed = new Set(extOf(db, assignmentId).household_ids);
      let n = 0;
      for (const id of householdIds) {
        const h = hh.get(id);
        if (h && allowed.has(id) && h.status === "Awaiting") {
          h.status = "Picked Up";
          n += h.size;
        }
      }
      markInProgress(db, a);
      audit(db, this.actor(u), "PICKUP_CONFIRMED", "EvacuationAssignment", assignmentId, `${householdIds.length} households (${n} people) picked up`);
      logEvent(db, "info", `Field pickup confirmed`, `${n} people · assignment #${assignmentId}`);
    });
  }

  markArrived(assignmentId: number): Promise<void> {
    return this.write((db) => {
      const u = this.require(db, "field:update");
      const a = db.assignments.find((x) => x.assignment_id === assignmentId);
      if (!a) throw new ApiError(404, "Assignment not found");
      const hh = householdMap(db);
      for (const id of extOf(db, assignmentId).household_ids) {
        const h = hh.get(id);
        if (h && h.status === "Picked Up") deliverHousehold(db, h, a.shelter_id, "Arrived");
      }
      audit(db, this.actor(u), "ARRIVAL_CONFIRMED", "EvacuationAssignment", assignmentId, `Arrival confirmed at shelter ${a.shelter_id}`);
      completeIfDone(db, a);
    });
  }

  /* ------------------------------------------------------------------ shelter operations */

  shelterRoster(shelterId: number): Promise<ShelterRoster> {
    return this.read((db) => {
      const u = this.require(db, "shelter:checkin");
      this.assertShelterScope(u, shelterId);
      const hh = householdMap(db);
      const expected = movableAssignments(db)
        .filter((a) => a.shelter_id === shelterId)
        .flatMap((a) => extOf(db, a.assignment_id).household_ids)
        .map((id) => hh.get(id)!)
        .filter((h) => h && !isDelivered(h));
      const present = db.households.filter((h) => h.shelter_id === shelterId && isDelivered(h));
      return { expected, present: present.slice().reverse() };
    });
  }

  checkIn(shelterId: number, token: string): Promise<CheckInResult> {
    return this.write((db) => {
      const u = this.require(db, "shelter:checkin");
      this.assertShelterScope(u, shelterId);
      const t = token.trim().toUpperCase();
      const h = db.households.find((x) => x.token.toUpperCase() === t || x.household_id.toUpperCase() === t);
      if (!h) return { ok: false, message: `No household found for token "${token}". Register as a walk-in instead.`, household: null };
      if (h.status === "Checked In") {
        const at = db.shelters.find((s) => s.shelter_id === h.shelter_id)?.name ?? "another shelter";
        return { ok: false, message: `${h.head_name}'s household is already checked in at ${at}.`, household: h };
      }
      const shelter = db.shelters.find((s) => s.shelter_id === shelterId)!;
      if (!isDelivered(h) && shelter.current_occupancy + h.size > shelter.capacity) {
        return { ok: false, message: `${shelter.name} is at capacity; household of ${h.size} cannot be admitted.`, household: h };
      }
      const planned = movableAssignments(db).find((a) => extOf(db, a.assignment_id).household_ids.includes(h.household_id));
      deliverHousehold(db, h, shelterId, "Checked In");
      h.status = "Checked In";
      h.shelter_id = shelterId;
      if (planned) completeIfDone(db, planned);
      const elsewhere = planned && planned.shelter_id !== shelterId;
      audit(db, this.actor(u), "CHECK_IN", "Household", null, `${h.household_id} (${h.size} people) checked in at ${shelter.name}${elsewhere ? " – was planned elsewhere" : ""}`);
      logEvent(db, "success", `Check-in at ${shelter.name}`, `${h.head_name} +${h.size - 1} (${h.household_id})`);
      return {
        ok: true,
        message: elsewhere
          ? `Checked in ${h.size} people. Note: household was planned for ${db.shelters.find((s) => s.shelter_id === planned.shelter_id)?.name}; the plan has been updated.`
          : `Checked in ${h.head_name}'s household (${h.size} people).`,
        household: h,
      };
    });
  }

  registerWalkIn(shelterId: number, headName: string, people: number): Promise<CheckInResult> {
    return this.write((db) => {
      const u = this.require(db, "shelter:checkin");
      this.assertShelterScope(u, shelterId);
      const shelter = db.shelters.find((s) => s.shelter_id === shelterId)!;
      if (people < 1 || people > 20) throw new ApiError(422, "Walk-in group must be 1–20 people.");
      if (shelter.current_occupancy + people > shelter.capacity) {
        return { ok: false, message: `${shelter.name} is at capacity.`, household: null };
      }
      const n = nextId(db, "walkins");
      const h: Household = {
        household_id: `WI-${shelterId}-${String(n).padStart(4, "0")}`,
        zone_id: null,
        token: `WI-${shelterId}-${n}`,
        head_name: headName.trim() || "Unregistered walk-in",
        phone: "",
        members: [headName.trim() || "Unregistered walk-in", ...Array.from({ length: people - 1 }, (_, i) => `Member ${i + 2}`)],
        size: people,
        elderly: 0,
        children: 0,
        disabled: 0,
        medical: 0,
        pets: false,
        status: "Awaiting",
        shelter_id: null,
        walk_in: true,
      };
      db.households.push(h);
      deliverHousehold(db, h, shelterId, "Checked In");
      const ext = db.shelter_ext.find((e) => e.shelter_id === shelterId);
      if (ext) ext.walk_ins += people;
      audit(db, this.actor(u), "WALK_IN", "Shelter", shelterId, `Walk-in ${h.household_id}: ${people} people`);
      logEvent(db, "info", `Walk-in at ${shelter.name}`, `${people} people (reserve buffer)`);
      checkShelterOverflow(db, shelterId, this.actor(u), `${shelter.name} capacity reached after walk-ins`);
      return { ok: true, message: `Registered walk-in group of ${people} (${h.household_id}).`, household: h };
    });
  }

  reunificationSearch(query: string): Promise<ReunificationHit[]> {
    return this.read((db) => {
      this.session(db);
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      const planned = new Map<string, number>();
      for (const a of versionAssignments(db)) for (const id of extOf(db, a.assignment_id).household_ids) planned.set(id, a.shelter_id);
      const shelterName = (id: number | null | undefined) => (id == null ? null : (db.shelters.find((s) => s.shelter_id === id)?.name ?? null));
      const hits: ReunificationHit[] = [];
      for (const h of db.households) {
        const idMatch = h.household_id.toLowerCase().includes(q) || h.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "§");
        for (const m of h.members) {
          if (!idMatch && !m.toLowerCase().includes(q)) continue;
          hits.push({
            household_id: h.household_id,
            member: m,
            head_name: h.head_name,
            zone_name: db.zones.find((z) => z.zone_id === h.zone_id)?.name ?? "Walk-in",
            status: h.status,
            shelter_name: shelterName(h.shelter_id),
            planned_shelter_name: shelterName(planned.get(h.household_id)),
          });
          if (idMatch) break;
        }
        if (hits.length >= 40) break;
      }
      return hits;
    });
  }

  /* ------------------------------------------------------------------ public */

  publicLookup(query: string): Promise<PublicLookupResult[]> {
    return this.read((db) => {
      const q = query.trim();
      if (!q) return [];
      const digits = q.replace(/\D/g, "");
      const assignmentFor = (householdId: string) =>
        versionAssignments(db).find((a) => extOf(db, a.assignment_id).household_ids.includes(householdId)) ?? null;
      const build = (zoneId: number, h: Household | null, a: ReturnType<typeof assignmentFor>): PublicLookupResult => {
        const zone = db.zones.find((z) => z.zone_id === zoneId)!;
        const zext = db.zone_ext.find((z) => z.zone_id === zoneId)!;
        const shelter = a ? db.shelters.find((s) => s.shelter_id === a.shelter_id) : undefined;
        const route = a?.route_id != null ? db.routes.find((r) => r.route_id === a.route_id) : undefined;
        const rext = route ? db.route_ext.find((r) => r.route_id === route.route_id) : undefined;
        const ext = a ? extOf(db, a.assignment_id) : null;
        return {
          zone_code: zext.code,
          zone_name: zone.name,
          household_id: h?.household_id ?? null,
          head_name: h?.head_name ?? null,
          people: h?.size ?? null,
          shelter: shelter
            ? {
                name: shelter.name,
                location: shelter.location,
                facilities: shelterView(db, shelter).available_facilities,
                latitude: shelter.latitude ?? 0,
                longitude: shelter.longitude ?? 0,
              }
            : null,
          route: route && rext ? { label: routeLabel(db, route.route_id) ?? "", travel_time: route.travel_time, status: route.status, path: rext.path } : null,
          eta_minutes: ext ? Math.max(0, ext.dispatch_minute + ext.approach_minutes - db.sim_minute) : null,
          assignment_status: a?.status ?? null,
          needs: {
            medical: (h?.medical ?? 0) > 0,
            accessibility: (h?.disabled ?? 0) > 0,
            pets: h?.pets ?? false,
            children: (h?.children ?? 0) > 0,
            elderly: (h?.elderly ?? 0) > 0,
          },
        };
      };
      if (digits.length >= 6) {
        return db.households
          .filter((h) => h.zone_id != null && h.phone.replace(/\D/g, "").endsWith(digits.slice(-10)))
          .slice(0, 5)
          .map((h) => build(h.zone_id!, h, assignmentFor(h.household_id)));
      }
      const zext = db.zone_ext.find((z) => z.code.toUpperCase() === q.toUpperCase());
      if (!zext) return [];
      const seen = new Set<number>();
      const out: PublicLookupResult[] = [];
      for (const a of versionAssignments(db)) {
        if (a.zone_id !== zext.zone_id || seen.has(a.shelter_id) || extOf(db, a.assignment_id).explanation.required_facilities.length > 0) continue;
        seen.add(a.shelter_id);
        out.push(build(zext.zone_id, null, a));
      }
      return out.length > 0 ? out : [build(zext.zone_id, null, null)];
    }, 250);
  }

  /* ------------------------------------------------------------------ drills */

  drillState(): Promise<DrillState> {
    return this.read((db) => drillView(db), 0);
  }

  scenarios(): Promise<DrillScenarioSummary[]> {
    return this.read(
      () =>
        SCENARIO_PRESETS.map((p) => {
          const def = p.build();
          return { id: def.id, name: def.name, description: def.description, duration_minutes: def.duration_minutes, events: def.events };
        }),
      0,
    );
  }

  loadScenario(id: string): Promise<DrillState> {
    return this.write((db) => {
      const u = this.require(db, "drill:run");
      this.db = freshState(id);
      audit(this.db, this.actor(u), "DRILL_LOAD", "Drill", null, `Loaded scenario ${id}`);
      return drillView(this.db);
    });
  }

  drillControl(action: DrillAction): Promise<DrillState> {
    return this.write((db) => {
      const u = this.require(db, "drill:run");
      switch (action.type) {
        case "start":
          if (db.drill.phase === "ready" || db.drill.phase === "idle") startDrill(db, this.actor(u));
          break;
        case "pause":
          if (db.drill.phase === "running") db.drill.phase = "paused";
          break;
        case "resume":
          if (db.drill.phase === "paused") db.drill.phase = "running";
          break;
        case "speed":
          db.drill.speed = Math.max(1, Math.min(32, action.speed));
          break;
        case "replay":
          this.db = replayDrill(db);
          audit(this.db, this.actor(u), "DRILL_REPLAY", "Drill", null, "Replaying drill from T+0 snapshot");
          break;
        case "reset":
          this.db = freshState(db.drill.scenario_id ?? DEFAULT_SCENARIO.id);
          audit(this.db, this.actor(u), "DRILL_RESET", "Drill", null, "Scenario reset to seed data");
          break;
      }
      return drillView(this.db);
    });
  }

  async advanceClock(minutes: number): Promise<DrillState> {
    await this.ready;
    const db = this.db;
    if (db.drill.phase !== "running") return structuredClone(drillView(db));
    const duration = SCENARIO_PRESETS.find((p) => p.id === db.drill.scenario_id)?.build().duration_minutes ?? 150;
    advance(db, minutes, duration);
    this.commit();
    return structuredClone(drillView(db));
  }

  injectEvent(event: Omit<DrillEvent, "id" | "at_minute">): Promise<DrillState> {
    return this.write((db) => {
      const u = this.require(db, "drill:run");
      const ev: DrillEvent = { ...event, id: `m${nextId(db, "manual_events")}`, at_minute: db.sim_minute, manual: true };
      db.drill.timeline = [...db.drill.timeline, ev].sort((a, b) => a.at_minute - b.at_minute);
      applyDrillEvent(db, ev, this.actor(u));
      return drillView(db);
    });
  }

  async resetDemo(): Promise<void> {
    await this.ready;
    await clearState();
    this.db = freshState(DEFAULT_SCENARIO.id);
    this.commit();
  }
}

/* ------------------------------------------------------------------ helpers */

function statusRank(s: string): number {
  return s === "In Progress" ? 0 : s === "Scheduled" ? 1 : 2;
}

function riskToSeverity(r: string): 1 | 2 | 3 | 4 | 5 {
  return r === "Extreme" ? 5 : r === "High" ? 4 : r === "Moderate" ? 3 : 2;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
