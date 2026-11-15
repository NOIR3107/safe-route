import type { Facility } from "@/api/extensions";
import type { EngineHousehold, EngineInput, EngineRoute, EngineShelter, EngineZone } from "../model";

export function zone(id: number, over: Partial<EngineZone> = {}): EngineZone {
  return {
    zone_id: id,
    name: `Zone ${id}`,
    severity: 3,
    centroid: [13 + id * 0.01, 80.2],
    priority: "P2",
    risk_level: "High",
    population: 100,
    evacuated_count: 0,
    ...over,
  };
}

export function shelter(id: number, over: Partial<EngineShelter> = {}): EngineShelter {
  return {
    shelter_id: id,
    name: `Shelter ${id}`,
    open: true,
    capacity: 100,
    committed: 0,
    reserved: 0,
    available_facilities: ["Power", "Water", "Food", "Medical", "Accessibility"] as Facility[],
    degraded_facilities: [],
    position: [13.05, 80.2 + id * 0.01],
    ...over,
  };
}

let rid = 0;
export function route(zoneId: number, shelterId: number, travel: number, over: Partial<EngineRoute> = {}): EngineRoute {
  rid++;
  const id = over.route_id ?? rid;
  return {
    route_id: id,
    zone_id: zoneId,
    shelter_id: shelterId,
    label: `R${id}`,
    via: [],
    distance_km: travel / 3,
    travel_time: travel,
    risk_level: "Low",
    status: "Open",
    ...over,
  };
}

/** Households of the given sizes for one zone. */
export function households(zoneId: number, sizes: number[], over: Partial<EngineHousehold> = {}): EngineHousehold[] {
  return sizes.map((size, i) => ({
    household_id: `HH-${zoneId}-${i + 1}`,
    zone_id: zoneId,
    size,
    needs: [],
    wants_pets: false,
    high_priority: false,
    ...over,
  }));
}

export function input(partial: Partial<EngineInput> & Pick<EngineInput, "zones" | "households" | "shelters" | "routes">): EngineInput {
  return {
    vehicles: [
      { vehicle_id: 1, vehicle_type: "Bus", capacity: 60, position: [13.0, 80.2] },
      { vehicle_id: 2, vehicle_type: "Bus", capacity: 60, position: [13.0, 80.21] },
      { vehicle_id: 3, vehicle_type: "Ambulance", capacity: 6, position: [13.0, 80.22] },
    ],
    ...partial,
  };
}
