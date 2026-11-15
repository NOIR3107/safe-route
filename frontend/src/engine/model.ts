// What the allocation engine works on. It never sees API or DB rows; the service layer converts
// its state into these plain objects first. That keeps the engine pure and easy to unit test.
import type { Facility, LatLng, Severity } from "@/api/extensions";
import type { RouteRiskLevel, RouteStatus, ZonePriority, ZoneRiskLevel } from "@/api/schemas";

export interface EngineZone {
  zone_id: number;
  name: string;
  severity: Severity;
  centroid: LatLng;
  /** Backend fields used by the FR-06 priority score. */
  priority: ZonePriority;
  risk_level: ZoneRiskLevel;
  population: number;
  evacuated_count: number;
}

export interface EngineHousehold {
  household_id: string;
  zone_id: number;
  size: number;
  /** Hard requirements: an edge to a shelter lacking these is removed. */
  needs: Facility[];
  wants_pets: boolean;
  high_priority: boolean;
  /** Set during re-planning: the shelter this household was heading to before the event. */
  previous_shelter_id?: number | null;
  /** Set during re-planning when the household is already in a vehicle. */
  en_route_vehicle_ids?: number[];
}

export interface EngineShelter {
  shelter_id: number;
  name: string;
  open: boolean;
  closed_reason?: string;
  capacity: number;
  /** People already present or inbound on assignments that are *not* being re-planned. */
  committed: number;
  /** Walk-in buffer that the planner must not consume. */
  reserved: number;
  available_facilities: Facility[];
  /** Facilities listed for the shelter but currently unavailable (e.g. medical without power). */
  degraded_facilities: Facility[];
  position: LatLng;
}

export interface EngineRoute {
  route_id: number;
  zone_id: number;
  shelter_id: number;
  label: string;
  via: string[];
  distance_km: number;
  travel_time: number;
  risk_level: RouteRiskLevel;
  status: RouteStatus;
}

export interface EngineVehicle {
  vehicle_id: number;
  vehicle_type: string;
  capacity: number;
  position: LatLng;
}

export interface EngineInput {
  zones: EngineZone[];
  households: EngineHousehold[];
  shelters: EngineShelter[];
  routes: EngineRoute[];
  /** Vehicles free to be dispatched for this allocation. */
  vehicles: EngineVehicle[];
  /** Vehicles already carrying en-route households (looked up by id). */
  busy_vehicles?: EngineVehicle[];
}

/** A demand group: households of one zone that share hard needs and re-planning context. */
export interface DemandGroup {
  key: string;
  zone: EngineZone;
  households: EngineHousehold[];
  people: number;
  needs: Facility[];
  pet_share: number;
  high_priority_people: number;
  previous_shelter_id: number | null;
  en_route_vehicle_ids: number[];
  priority_score: number;
}
