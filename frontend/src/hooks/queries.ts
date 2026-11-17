import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { DrillEvent, Facility, StrategyId } from "@/api/extensions";
import { startLiveConnection, useLive } from "@/api/live";
import type { DrillAction } from "@/api/SafeRouteApi";
import type {
  AffectedZoneCreate,
  AffectedZoneUpdate,
  RescueTeamCreate,
  RescueTeamUpdate,
  RouteCreate,
  RouteStatus,
  RouteUpdate,
  ShelterCreate,
  ShelterStatus,
  ShelterUpdate,
  VehicleCreate,
  VehicleUpdate,
} from "@/api/schemas";
import { useAuthStore } from "@/stores/auth";
import { errorMessage } from "@/lib/utils";

export const keys = {
  summary: ["summary"],
  disasters: ["disasters"],
  zones: ["zones"],
  shelters: ["shelters"],
  routes: ["routes"],
  vehicles: ["vehicles"],
  teams: ["teams"],
  resources: ["resources"],
  plan: ["plan"],
  assignments: (v?: number) => ["assignments", v ?? "current"] as QueryKey,
  compare: ["compare"],
  events: ["events"],
  clock: ["clock"],
  drill: ["drill"],
  scenarios: ["scenarios"],
  notifications: ["notifications"],
  audit: ["audit"],
  users: ["users"],
  fieldTasks: ["fieldTasks"],
  households: (id: number) => ["households", id] as QueryKey,
  roster: (id: number) => ["roster", id] as QueryKey,
  reunify: (q: string) => ["reunify", q] as QueryKey,
  publicLookup: (q: string) => ["public", q] as QueryKey,
  segments: ["segments"],
  allocations: ["allocations"],
  timeline: ["timeline"],
} as const;

/**
 * Opens the WebSocket once for the whole app. Server "changed" messages refetch the matching
 * queries, so screens never poll and never fetch on their own.
 */
export function useLiveConnection(): void {
  const qc = useQueryClient();
  useEffect(() => startLiveConnection(qc), [qc]);
}

/* ---------------- queries */

export const useSummary = () => useQuery({ queryKey: keys.summary, queryFn: () => api.dashboardSummary() });
export const useDisasters = () => useQuery({ queryKey: keys.disasters, queryFn: () => api.listDisasters() });
export const useZones = () => useQuery({ queryKey: keys.zones, queryFn: () => api.listZones() });
export const useShelters = () => useQuery({ queryKey: keys.shelters, queryFn: () => api.listShelters() });
export const useRoutes = () => useQuery({ queryKey: keys.routes, queryFn: () => api.listRoutes() });
export const useVehicles = () => useQuery({ queryKey: keys.vehicles, queryFn: () => api.listVehicles() });
export const useTeams = () => useQuery({ queryKey: keys.teams, queryFn: () => api.listTeams() });
export const useResources = () => useQuery({ queryKey: keys.resources, queryFn: () => api.listResources() });
export const usePlan = () => useQuery({ queryKey: keys.plan, queryFn: () => api.activePlan() });
export const useAssignments = (version?: number) =>
  useQuery({ queryKey: keys.assignments(version), queryFn: () => api.listAssignments(version) });
export const useCompare = (enabled: boolean) =>
  useQuery({ queryKey: keys.compare, queryFn: () => api.compareStrategies(), enabled, retry: false });
export const useOpsEvents = () => useQuery({ queryKey: keys.events, queryFn: () => api.opsEvents() });
/** Clock and feed status: pushed by the WebSocket heartbeat, fetched once as a fallback. */
export function useClock() {
  const pushed = useLive((s) => s.clock);
  const q = useQuery({ queryKey: keys.clock, queryFn: () => api.clock(), staleTime: 5_000 });
  return { ...q, data: pushed ?? q.data };
}
export const useTimeline = () => useQuery({ queryKey: keys.timeline, queryFn: () => api.timeline() });
export const useSegments = () => useQuery({ queryKey: keys.segments, queryFn: () => api.listSegments(), staleTime: Infinity });
export const useResourceAllocations = (enabled = true) =>
  useQuery({ queryKey: keys.allocations, queryFn: () => api.resourceAllocations(), enabled, retry: false });
export const useDrill = () => useQuery({ queryKey: keys.drill, queryFn: () => api.drillState() });
export const useScenarios = () => useQuery({ queryKey: keys.scenarios, queryFn: () => api.scenarios(), staleTime: Infinity });
export const useNotifications = () => {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: keys.notifications, queryFn: () => api.listNotifications(), enabled: !!token });
};
export const useAudit = (enabled = true) => useQuery({ queryKey: keys.audit, queryFn: () => api.listAudit(), enabled, retry: false });
export const useUsers = () => useQuery({ queryKey: keys.users, queryFn: () => api.listUsers(), retry: false });
export const useFieldTasks = () => useQuery({ queryKey: keys.fieldTasks, queryFn: () => api.fieldTasks(), retry: false, networkMode: "offlineFirst" });
export const useHouseholds = (assignmentId: number | null) =>
  useQuery({
    queryKey: keys.households(assignmentId ?? -1),
    queryFn: () => api.assignmentHouseholds(assignmentId!),
    enabled: assignmentId != null,
    networkMode: "offlineFirst",
  });
export const useRoster = (shelterId: number | null) =>
  useQuery({ queryKey: keys.roster(shelterId ?? -1), queryFn: () => api.shelterRoster(shelterId!), enabled: shelterId != null, retry: false });
export const useReunify = (q: string) =>
  useQuery({ queryKey: keys.reunify(q), queryFn: () => api.reunificationSearch(q), enabled: q.trim().length >= 2, retry: false });
export const usePublicLookup = (q: string) =>
  useQuery({ queryKey: keys.publicLookup(q), queryFn: () => api.publicLookup(q), enabled: q.trim().length > 0, retry: false });

/* ---------------- mutations */

function useApiMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>, success?: string | ((r: TResult, v: TVars) => string)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (success) toast.success(typeof success === "string" ? success : success(r, v));
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export const useGeneratePlan = () =>
  useApiMutation((strategy: StrategyId) => api.generatePlan(strategy), (p) => `Plan v${p.current_version?.version ?? 1} proposed`);
export const useApprove = () => useApiMutation((version: number) => api.approveVersion(version), (_r, v) => `Plan v${v} approved`);
export const useOverride = () =>
  useApiMutation(
    (v: { assignmentId: number; shelterId: number; reason: string }) => api.overrideAssignment(v.assignmentId, v.shelterId, v.reason),
    "Override applied and logged to the audit trail",
  );
export const useTransitionRoute = () =>
  useApiMutation((v: { id: number; status: RouteStatus; reason?: string }) => api.transitionRoute(v.id, v.status, v.reason), (r) => `Route R${r.route_id} → ${r.status}`);
export const useTransitionShelter = () =>
  useApiMutation((v: { id: number; status: ShelterStatus; reason?: string }) => api.transitionShelter(v.id, v.status, v.reason), (r) => `${r.name} → ${r.status}`);

export const useCreateZone = () => useApiMutation((b: AffectedZoneCreate) => api.createZone(b), "Zone registered");
export const useUpdateZone = () => useApiMutation((v: { id: number; body: AffectedZoneUpdate }) => api.updateZone(v.id, v.body), "Zone updated");
export const useCreateShelter = () => useApiMutation((b: ShelterCreate) => api.createShelter(b), "Shelter registered");
export const useUpdateShelter = () => useApiMutation((v: { id: number; body: ShelterUpdate }) => api.updateShelter(v.id, v.body), "Shelter updated");
export const useCreateRoute = () => useApiMutation((b: RouteCreate) => api.createRoute(b), "Route added");
export const useUpdateRoute = () => useApiMutation((v: { id: number; body: RouteUpdate }) => api.updateRoute(v.id, v.body), "Route updated");
export const useCreateVehicle = () => useApiMutation((b: VehicleCreate) => api.createVehicle(b), "Vehicle added");
export const useUpdateVehicle = () => useApiMutation((v: { id: number; body: VehicleUpdate }) => api.updateVehicle(v.id, v.body), "Vehicle updated");
export const useCreateTeam = () => useApiMutation((b: RescueTeamCreate) => api.createTeam(b), "Team added");
export const useUpdateTeam = () => useApiMutation((v: { id: number; body: RescueTeamUpdate }) => api.updateTeam(v.id, v.body), "Team updated");

export const useDrillControl = () => useApiMutation((a: DrillAction) => api.drillControl(a));
export const useLoadScenario = () => useApiMutation((id: string) => api.loadScenario(id), "Scenario loaded");
export const useInjectEvent = () =>
  useApiMutation((e: Omit<DrillEvent, "id" | "at_minute">) => api.injectEvent(e), (_r, e) => `Injected: ${e.label}`);
export const useSetFacilities = () =>
  useApiMutation(
    (v: { shelterId: number; facilities: Facility[]; availability: "Available" | "Unavailable"; reason?: string }) =>
      api.setFacilities(v.shelterId, v.facilities, v.availability, v.reason),
    (r) => `${r.name}: facilities updated`,
  );
export const useMarkRead = () => useApiMutation((id: number) => api.markNotificationRead(id));
export const useCheckIn = () => useApiMutation((v: { shelterId: number; token: string }) => api.checkIn(v.shelterId, v.token));
export const useWalkIn = () =>
  useApiMutation((v: { shelterId: number; name: string; people: number }) => api.registerWalkIn(v.shelterId, v.name, v.people));
