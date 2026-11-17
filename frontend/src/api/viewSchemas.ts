// Runtime checks for the backend's view responses (entity + derived fields), matching
// backend/app/schemas/responses.py. They check the fields every screen relies on; nested documents
// (explanations, diffs, triggers) are typed in extensions.ts and only checked for being objects here.
import { z } from "zod";
import {
  AffectedZoneSchema,
  ASSIGNMENT_STATUSES,
  EvacuationAssignmentSchema,
  EvacuationPlanSchema,
  RescueTeamSchema,
  ROUTE_STATUSES,
  RouteSchema,
  ShelterSchema,
  UserRoleSchema,
  VehicleSchema,
} from "./schemas";

const LatLngSchema = z.tuple([z.number(), z.number()]);
const Obj = z.record(z.string(), z.unknown());

export const SessionUserSchema = z.object({
  user_id: z.number().int(),
  name: z.string(),
  email: z.string(),
  role: UserRoleSchema,
  scope: z.object({
    user_id: z.number().int(),
    shelter_id: z.number().int().nullable(),
    team_id: z.number().int().nullable(),
    zone_ids: z.array(z.number().int()).nullable(),
  }),
});

export const DemoAccountSchema = z.object({ email: z.string(), password: z.string(), role: UserRoleSchema, name: z.string() });

export const ZoneViewSchema = AffectedZoneSchema.extend({
  ext: z.object({
    zone_id: z.number().int(),
    code: z.string(),
    severity: z.number().int().min(1).max(5),
    centroid: LatLngSchema,
    polygon: z.array(LatLngSchema),
  }),
  household_count: z.number().int().nonnegative(),
  vulnerable: z.object({ elderly: z.number(), disabled: z.number(), medical: z.number(), children: z.number() }),
  remaining: z.number().int().nonnegative(),
});

export const ShelterViewSchema = ShelterSchema.extend({
  ext: z.object({ shelter_id: z.number().int(), reserved_pct: z.number(), walk_ins: z.number().int() }),
  reserved: z.number().int(),
  inbound: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  available_facilities: z.array(z.string()),
  display_status: z.enum(["Open", "Near Full", "Full", "Closed"]),
  utilization: z.number(),
});

export const RouteViewSchema = RouteSchema.extend({
  ext: z.object({
    route_id: z.number().int(),
    zone_id: z.number().int(),
    shelter_id: z.number().int(),
    path: z.array(LatLngSchema),
    via: z.array(z.string()),
    geometry_source: z.enum(["schematic", "osrm"]),
  }),
});

export const VehicleViewSchema = VehicleSchema.extend({
  ext: z.object({
    vehicle_id: z.number().int(),
    team_id: z.number().int().nullable(),
    depot: LatLngSchema,
    position: LatLngSchema,
    position_source: z.enum(["depot", "estimated", "gps"]),
  }),
  assignment_id: z.number().int().nullable(),
});

export const TeamViewSchema = RescueTeamSchema.extend({ plan_id: z.number().int().nullable(), vehicle_ids: z.array(z.number().int()) });

export const AssignmentViewSchema = EvacuationAssignmentSchema.extend({
  ext: z.object({
    assignment_id: z.number().int(),
    household_ids: z.array(z.string()),
    eta_minutes: z.number(),
    dispatch_minute: z.number(),
    approach_minutes: z.number(),
    vehicle_ids: z.array(z.number().int()),
    explanation: Obj,
    approval: z.enum(["Proposed", "Approved", "Overridden"]),
    override_reason: z.string().nullable(),
    version: z.number().int(),
  }),
  zone_name: z.string(),
  shelter_name: z.string(),
  route_label: z.string().nullable(),
  severity: z.number().int().min(1).max(5),
});

export const PlanMetricsSchema = z.object({
  people_allocated: z.number(),
  people_unallocated: z.number(),
  avg_eta: z.number(),
  worst_eta: z.number(),
  high_priority_total: z.number(),
  high_priority_served: z.number(),
  total_cost: z.number(),
  shelter_utilization: z.number(),
  assignments: z.number(),
  vehicles_used: z.number(),
});

export const PlanVersionSchema = z.object({
  version: z.number().int(),
  plan_id: z.number().int(),
  created_at: z.string(),
  sim_minute: z.number(),
  trigger: Obj,
  strategy: z.enum(["greedy", "min-cost-flow"]),
  status: z.enum(["Proposed", "Approved", "Superseded"]),
  assignment_ids: z.array(z.number().int()),
  unallocated: z.array(Obj),
  metrics: PlanMetricsSchema,
  diff: Obj.nullable(),
  approved_by: z.string().nullable(),
  approved_at: z.string().nullable(),
});

export const PlanViewSchema = EvacuationPlanSchema.extend({
  versions: z.array(PlanVersionSchema),
  current_version: PlanVersionSchema.nullable(),
});

export const StrategyComparisonSchema = z.object({ greedy: PlanMetricsSchema, "min-cost-flow": PlanMetricsSchema });

export const OpsEventSchema = z.object({
  id: z.number().int(),
  sim_minute: z.number(),
  timestamp: z.string(),
  level: z.enum(["info", "warning", "critical", "success"]),
  title: z.string(),
  detail: z.string(),
});

export const FeedStatusSchema = z.object({
  source: z.string().nullable(),
  last_received_at: z.string().nullable(),
  seconds_since: z.number().nullable(),
  stale: z.boolean(),
  messages: z.number().int(),
  replay: z.boolean(),
});

export const ClockSchema = z.object({
  mode: z.enum(["live", "drill"]),
  sim_minute: z.number(),
  phase: z.string(),
  speed: z.number(),
  server_time: z.string(),
  feed: FeedStatusSchema,
});
export type Clock = z.infer<typeof ClockSchema>;
export type FeedStatus = z.infer<typeof FeedStatusSchema>;

export const DrillStateSchema = z.object({
  scenario_id: z.string().nullable(),
  phase: z.enum(["idle", "ready", "running", "paused", "finished"]),
  sim_minute: z.number(),
  speed: z.number(),
  timeline: z.array(Obj),
  fired_event_ids: z.array(z.string()),
  has_snapshot: z.boolean(),
  mode: z.enum(["live", "drill"]),
  duration_minutes: z.number(),
  synthetic: z.boolean(),
});

export const ScenarioSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  duration_minutes: z.number(),
  events: z.array(Obj),
});

const HOUSEHOLD_STATUSES = ["Awaiting", "Picked Up", "Arrived", "Checked In"] as const;

export const HouseholdSchema = z.object({
  household_id: z.string(),
  zone_id: z.number().int().nullable(),
  token: z.string(),
  head_name: z.string(),
  phone: z.string(),
  members: z.array(z.string()),
  size: z.number().int().positive(),
  elderly: z.number().int(),
  children: z.number().int(),
  disabled: z.number().int(),
  medical: z.number().int(),
  pets: z.boolean(),
  status: z.enum(HOUSEHOLD_STATUSES),
  shelter_id: z.number().int().nullable(),
  walk_in: z.boolean(),
});

export const CheckInResultSchema = z.object({ ok: z.boolean(), message: z.string(), household: HouseholdSchema.nullable() });
export const RosterSchema = z.object({ expected: z.array(HouseholdSchema), present: z.array(HouseholdSchema) });

export const ReunificationHitSchema = z.object({
  household_id: z.string(),
  member: z.string(),
  head_name: z.string(),
  zone_name: z.string(),
  status: z.enum(HOUSEHOLD_STATUSES),
  shelter_name: z.string().nullable(),
  planned_shelter_name: z.string().nullable(),
});

export const PublicLookupSchema = z.object({
  zone_code: z.string(),
  zone_name: z.string(),
  household_id: z.string().nullable(),
  head_name: z.string().nullable(),
  people: z.number().nullable(),
  shelter: z
    .object({ name: z.string(), location: z.string(), facilities: z.array(z.string()), latitude: z.number(), longitude: z.number() })
    .nullable(),
  route: z.object({ label: z.string(), travel_time: z.number(), status: z.enum(ROUTE_STATUSES), path: z.array(LatLngSchema) }).nullable(),
  eta_minutes: z.number().nullable(),
  assignment_status: z.enum(ASSIGNMENT_STATUSES).nullable(),
  needs: z.object({ medical: z.boolean(), accessibility: z.boolean(), pets: z.boolean(), children: z.boolean(), elderly: z.boolean() }),
});

export const ResourceAllocationSchema = z.object({
  shelter_id: z.number().int(),
  shelter_name: z.string(),
  resource_id: z.number().int(),
  resource_type: z.string(),
  quantity: z.number().int(),
});
export type ResourceAllocation = z.infer<typeof ResourceAllocationSchema>;

export const SegmentSchema = z.object({ segment_id: z.number().int(), name: z.string(), latitude: z.number(), longitude: z.number() });
export type RoadSegment = z.infer<typeof SegmentSchema>;

export const TimelineSchema = z.object({
  now: z.number(),
  affected: z.number(),
  /** [minute, people at shelters] - cumulative, 12 evenly spaced samples */
  evacuated: z.array(z.tuple([z.number(), z.number()])),
  versions: z.array(
    z.object({
      version: z.number().int(),
      minute: z.number(),
      avg_eta: z.number(),
      worst_eta: z.number(),
      people_unallocated: z.number(),
      high_priority_served: z.number(),
      high_priority_total: z.number(),
    }),
  ),
});
export type Timeline = z.infer<typeof TimelineSchema>;
