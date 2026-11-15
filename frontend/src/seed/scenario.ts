/**
 * Scenario definition format. Scenarios are *data*: zones, shelters, road corridors, fleet and a
 * scripted event timeline. `buildState()` turns a definition into a full database snapshot.
 */
import type { DrillEvent, Facility, LatLng, Severity } from "@/api/extensions";
import type {
  DisasterSeverity,
  RouteRiskLevel,
  ZonePriority,
  ZoneRiskLevel,
} from "@/api/schemas";

export interface ZoneDef {
  code: string;
  name: string;
  location: string;
  centroid: LatLng;
  radius_km: number;
  population: number;
  severity: Severity;
  priority: ZonePriority;
  risk_level: ZoneRiskLevel;
}

export interface ShelterDef {
  key: string;
  name: string;
  location: string;
  position: LatLng;
  capacity: number;
  occupancy: number;
  facilities: Facility[];
}

export interface CorridorDef {
  zone: string; // zone code
  shelter: string; // shelter key
  via: string[]; // named segments (must exist in `segments`)
  risk: RouteRiskLevel;
}

export interface VehicleDef {
  type: "Bus" | "Ambulance" | "Truck" | "Boat" | "Van";
  capacity: number;
  count: number;
  plate_prefix: string;
}

export interface DepotDef {
  name: string;
  position: LatLng;
}

export interface TeamDef {
  name: string;
  members: number;
  contact: string;
  location: string;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  seed: number;
  duration_minutes: number;
  center: LatLng;
  disaster: { type: string; title: string; description: string; severity: DisasterSeverity; state: string; district: string };
  zones: ZoneDef[];
  shelters: ShelterDef[];
  segments: Record<string, LatLng>;
  corridors: CorridorDef[];
  depots: DepotDef[];
  fleet: VehicleDef[];
  teams: TeamDef[];
  events: DrillEvent[];
  /** Known household used in docs/tests for the public lookup page. */
  demo_household?: { zone: string; head_name: string; phone: string };
}
