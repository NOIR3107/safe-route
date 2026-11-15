// Copies of the backend's Pydantic response models (app/schemas/*), same field names and the same
// status values as app/models/*. The TS types are inferred from the zod schemas, so the types and the
// runtime check in live mode can't get out of sync.
import { z } from "zod";

/* ------------------------------------------------------------------ vocabularies */

export const USER_ROLES = [
  "Admin",
  "Emergency Authority",
  "Evacuation Coordinator",
  "Shelter Manager",
  "Transport Coordinator",
  "Response Team",
] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const DISASTER_SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;
export const DISASTER_STATUSES = ["Active", "Under Control", "Resolved"] as const;
export const ZONE_PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export const ZONE_RISK_LEVELS = ["Extreme", "High", "Moderate", "Low"] as const;
export const ZONE_STATUSES = ["Pending", "In Progress", "Partially Evacuated", "Evacuated"] as const;
export const SHELTER_STATUSES = ["Active", "Full", "Inactive", "Closed"] as const;
export const FACILITY_AVAILABILITY = ["Available", "Limited", "Unavailable"] as const;
/** Backend vocabulary plus `Cleared` (backend accepts any string; its engine only excludes Blocked/Flooded). */
export const ROUTE_STATUSES = ["Open", "Congested", "Blocked", "Flooded", "Cleared"] as const;
export const ROUTE_RISK_LEVELS = ["Low", "Moderate", "High", "Severe"] as const;
export const VEHICLE_TYPES = ["Bus", "Ambulance", "Truck", "Boat", "Van"] as const;
export const VEHICLE_STATUSES = ["Available", "Assigned", "In Transit", "Maintenance"] as const;
export const TEAM_STATUSES = ["Available", "Deployed", "Standby"] as const;
export const PLAN_STATUSES = ["Draft", "Active", "Completed", "Reallocated", "Cancelled"] as const;
export const ASSIGNMENT_STATUSES = ["Scheduled", "In Progress", "Completed", "Rerouted", "Cancelled"] as const;
export const VEHICLE_ASSIGNMENT_STATUSES = ["Assigned", "In Transit", "Completed", "Reassigned"] as const;
export const RESOURCE_AVAILABILITY = ["Available", "Low Stock", "Depleted"] as const;
export const NOTIFICATION_TYPES = ["INFO", "WARNING", "ALERT", "CRITICAL"] as const;

export type DisasterSeverity = (typeof DISASTER_SEVERITIES)[number];
export type DisasterStatus = (typeof DISASTER_STATUSES)[number];
export type ZonePriority = (typeof ZONE_PRIORITIES)[number];
export type ZoneRiskLevel = (typeof ZONE_RISK_LEVELS)[number];
export type ZoneStatus = (typeof ZONE_STATUSES)[number];
export type ShelterStatus = (typeof SHELTER_STATUSES)[number];
export type RouteStatus = (typeof ROUTE_STATUSES)[number];
export type RouteRiskLevel = (typeof ROUTE_RISK_LEVELS)[number];
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];
export type TeamStatus = (typeof TEAM_STATUSES)[number];
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/* ------------------------------------------------------------------ auth & users (schemas/auth.py) */

export const TokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  role: UserRoleSchema,
  user_id: z.number().int(),
  name: z.string(),
});
export type Token = z.infer<typeof TokenSchema>;

export const UserSchema = z.object({
  user_id: z.number().int(),
  name: z.string(),
  email: z.string(),
  role: UserRoleSchema,
  phone_number: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
});
export type User = z.infer<typeof UserSchema>;

/* ------------------------------------------------------------------ disasters & zones (schemas/disaster.py) */

export const AffectedZoneSchema = z.object({
  zone_id: z.number().int(),
  disaster_id: z.number().int(),
  name: z.string(),
  location: z.string(),
  state: z.string().nullable(),
  district: z.string().nullable(),
  population: z.number().int().nonnegative(),
  priority: z.enum(ZONE_PRIORITIES),
  risk_level: z.enum(ZONE_RISK_LEVELS),
  evacuated_count: z.number().int().nonnegative(),
  status: z.enum(ZONE_STATUSES),
});
export type AffectedZone = z.infer<typeof AffectedZoneSchema>;

export const DisasterSchema = z.object({
  disaster_id: z.number().int(),
  type: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  severity: z.enum(DISASTER_SEVERITIES),
  status: z.enum(DISASTER_STATUSES),
  start_date: z.string(),
  end_date: z.string().nullable(),
  created_at: z.string(),
  zones: z.array(AffectedZoneSchema),
});
export type Disaster = z.infer<typeof DisasterSchema>;

/* ------------------------------------------------------------------ shelters (schemas/shelter.py) */

export const ShelterFacilitySchema = z.object({
  facility_id: z.number().int(),
  shelter_id: z.number().int(),
  facility_type: z.string(),
  capacity: z.number().int().nullable(),
  availability_status: z.enum(FACILITY_AVAILABILITY),
});
export type ShelterFacility = z.infer<typeof ShelterFacilitySchema>;

export const ShelterSchema = z.object({
  shelter_id: z.number().int(),
  name: z.string(),
  location: z.string(),
  capacity: z.number().int().positive(),
  current_occupancy: z.number().int().nonnegative(),
  facilities: z.string().nullable(),
  status: z.enum(SHELTER_STATUSES),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  available_capacity: z.number().int().nullable(),
  facilities_list: z.array(ShelterFacilitySchema),
});
export type Shelter = z.infer<typeof ShelterSchema>;

/* ------------------------------------------------------------------ routes (schemas/route.py) */

export const RouteSchema = z.object({
  route_id: z.number().int(),
  source: z.string(),
  destination: z.string(),
  distance_km: z.number().positive(),
  travel_time: z.number().nonnegative(),
  risk_level: z.enum(ROUTE_RISK_LEVELS),
  status: z.enum(ROUTE_STATUSES),
});
export type Route = z.infer<typeof RouteSchema>;

/* ------------------------------------------------------------------ vehicles & teams (schemas/vehicle.py) */

export const VehicleSchema = z.object({
  vehicle_id: z.number().int(),
  vehicle_type: z.enum(VEHICLE_TYPES),
  capacity: z.number().int().positive(),
  status: z.enum(VEHICLE_STATUSES),
  current_location: z.string(),
  plate_number: z.string().nullable(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;

export const RescueTeamSchema = z.object({
  team_id: z.number().int(),
  name: z.string(),
  members_count: z.number().int().positive(),
  contact_number: z.string(),
  status: z.enum(TEAM_STATUSES),
  current_location: z.string().nullable(),
});
export type RescueTeam = z.infer<typeof RescueTeamSchema>;

/* ------------------------------------------------------------------ evacuation (schemas/evacuation.py) */

export const VehicleAssignmentSchema = z.object({
  vehicle_assignment_id: z.number().int(),
  assignment_id: z.number().int(),
  vehicle_id: z.number().int(),
  departure_time: z.string().nullable(),
  arrival_time: z.string().nullable(),
  status: z.enum(VEHICLE_ASSIGNMENT_STATUSES),
});
export type VehicleAssignment = z.infer<typeof VehicleAssignmentSchema>;

export const EvacuationAssignmentSchema = z.object({
  assignment_id: z.number().int(),
  plan_id: z.number().int(),
  zone_id: z.number().int(),
  shelter_id: z.number().int(),
  route_id: z.number().int().nullable(),
  people_count: z.number().int().positive(),
  status: z.enum(ASSIGNMENT_STATUSES),
  created_at: z.string(),
  vehicle_assignments: z.array(VehicleAssignmentSchema),
});
export type EvacuationAssignment = z.infer<typeof EvacuationAssignmentSchema>;

export const EvacuationPlanSchema = z.object({
  plan_id: z.number().int(),
  disaster_id: z.number().int(),
  name: z.string(),
  priority: z.string(),
  created_by: z.number().int(),
  status: z.enum(PLAN_STATUSES),
  created_at: z.string(),
  updated_at: z.string(),
  assignments: z.array(EvacuationAssignmentSchema),
});
export type EvacuationPlan = z.infer<typeof EvacuationPlanSchema>;

/* ------------------------------------------------------------------ resources (schemas/resource.py) */

export const ResourceSchema = z.object({
  resource_id: z.number().int(),
  resource_type: z.string(),
  quantity: z.number().int().nonnegative(),
  availability: z.enum(RESOURCE_AVAILABILITY),
  location: z.string().nullable(),
});
export type Resource = z.infer<typeof ResourceSchema>;

/* ------------------------------------------------------------------ audit (schemas/audit.py) */

export const NotificationSchema = z.object({
  notification_id: z.number().int(),
  user_id: z.number().int().nullable(),
  message: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  status: z.enum(["Unread", "Read"]),
  timestamp: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const AuditLogSchema = z.object({
  log_id: z.number().int(),
  user_id: z.number().int().nullable(),
  action: z.string(),
  entity_type: z.string().nullable(),
  entity_id: z.number().int().nullable(),
  details: z.string().nullable(),
  timestamp: z.string(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

/* ------------------------------------------------------------------ dashboard (services/evacuation_service.py) */

export const DashboardSummarySchema = z.object({
  disasters: z.object({ total: z.number(), active: z.number() }),
  population: z.object({
    total_affected: z.number(),
    total_evacuated: z.number(),
    evacuation_progress_percentage: z.number(),
  }),
  shelters: z.object({
    total: z.number(),
    total_capacity: z.number(),
    current_occupancy: z.number(),
    occupancy_rate_percentage: z.number(),
  }),
  logistics: z.object({
    total_vehicles: z.number(),
    available_vehicles: z.number(),
    open_routes: z.number(),
    blocked_routes: z.number(),
  }),
  plans: z.object({ active_plans: z.number(), total_assignments: z.number() }),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

/* ------------------------------------------------------------------ request bodies */

export interface AffectedZoneCreate {
  disaster_id: number;
  name: string;
  location: string;
  state?: string | null;
  district?: string | null;
  population: number;
  priority: (typeof ZONE_PRIORITIES)[number];
  risk_level: ZoneRiskLevel;
}
export type AffectedZoneUpdate = Partial<Omit<AffectedZoneCreate, "disaster_id">> & {
  evacuated_count?: number;
  status?: ZoneStatus;
};

export interface ShelterCreate {
  name: string;
  location: string;
  capacity: number;
  current_occupancy?: number;
  facilities?: string | null;
  status?: ShelterStatus;
  latitude?: number | null;
  longitude?: number | null;
}
export type ShelterUpdate = Partial<ShelterCreate>;

export interface RouteCreate {
  source: string;
  destination: string;
  distance_km: number;
  travel_time: number;
  risk_level: RouteRiskLevel;
  status: RouteStatus;
}
export type RouteUpdate = Partial<RouteCreate>;

export interface VehicleCreate {
  vehicle_type: Vehicle["vehicle_type"];
  capacity: number;
  status: VehicleStatus;
  current_location: string;
  plate_number?: string | null;
}
export type VehicleUpdate = Partial<VehicleCreate>;

export interface RescueTeamCreate {
  name: string;
  members_count: number;
  contact_number: string;
  status: TeamStatus;
  current_location?: string | null;
}
export type RescueTeamUpdate = Partial<RescueTeamCreate>;

export interface GeneratePlanRequest {
  disaster_id: number;
  plan_name: string;
  consider_traffic?: boolean;
  max_evacuees_per_batch?: number | null;
}

export interface DynamicReallocationRequest {
  plan_id: number;
  blocked_route_id?: number | null;
  full_shelter_id?: number | null;
  reason: string;
}
