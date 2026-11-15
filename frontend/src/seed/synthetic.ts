/**
 * Seeded synthetic scenario generator for stress-testing the planner at larger scale.
 * Same seed + parameters ⇒ identical scenario, so a drill can be replayed and compared.
 */
import type { DrillEvent, Facility, LatLng, Severity } from "@/api/extensions";
import type { RouteRiskLevel, ZonePriority, ZoneRiskLevel } from "@/api/schemas";
import { haversineKm } from "@/engine/geo";
import { Prng } from "./prng";
import type { CorridorDef, ScenarioDefinition, ShelterDef, ZoneDef } from "./scenario";

export interface SyntheticOptions {
  seed: number;
  zones: number;
  shelters: number;
  center?: LatLng;
}

const PRIORITY_BY_SEV: Record<Severity, ZonePriority> = { 5: "P1", 4: "P1", 3: "P2", 2: "P3", 1: "P4" };
const RISK_BY_SEV: Record<Severity, ZoneRiskLevel> = { 5: "Extreme", 4: "High", 3: "High", 2: "Moderate", 1: "Low" };

export function generateSyntheticScenario(opts: SyntheticOptions): ScenarioDefinition {
  const rng = new Prng(opts.seed);
  const center = opts.center ?? [13.03, 80.24];
  const riverLat = center[0];
  const spread = 0.06 + opts.zones * 0.002;
  const point = (): LatLng => [center[0] + (rng.next() - 0.5) * spread, center[1] + (rng.next() - 0.5) * spread * 1.2];

  const bridges: Record<string, LatLng> = {};
  const bridgeCount = Math.max(2, Math.round(opts.zones / 6));
  for (let i = 0; i < bridgeCount; i++) {
    bridges[`Bridge ${String.fromCharCode(65 + i)}`] = [riverLat, center[1] - spread * 0.5 + (spread * (i + 0.5)) / bridgeCount];
  }

  const zones: ZoneDef[] = Array.from({ length: opts.zones }, (_, i) => {
    const sev = rng.weighted<Severity>([[5, 2], [4, 3], [3, 3], [2, 2], [1, 1]]);
    return {
      code: `Z${String(i + 1).padStart(2, "0")}`,
      name: `Sector ${i + 1}`,
      location: `Sector ${i + 1}`,
      centroid: point(),
      radius_km: 0.5 + rng.next() * 0.6,
      population: rng.int(150, 900),
      severity: sev,
      priority: PRIORITY_BY_SEV[sev],
      risk_level: RISK_BY_SEV[sev],
    };
  });
  const totalPop = zones.reduce((s, z) => s + z.population, 0);
  const shelters: ShelterDef[] = Array.from({ length: opts.shelters }, (_, i) => {
    const facilities: Facility[] = ["Water", "Food", "Bedding"];
    if (rng.chance(0.8)) facilities.push("Power");
    if (rng.chance(0.55)) facilities.push("Medical");
    if (rng.chance(0.6)) facilities.push("Accessibility");
    if (rng.chance(0.3)) facilities.push("Pets");
    return {
      key: `S${i + 1}`,
      name: `Relief Camp ${i + 1}`,
      location: `Camp Site ${i + 1}`,
      position: point(),
      capacity: Math.round(((totalPop * 1.15) / opts.shelters) * (0.6 + rng.next() * 0.8)),
      occupancy: rng.int(0, 60),
      facilities,
    };
  });

  const corridors: CorridorDef[] = [];
  for (const z of zones) {
    const nearest = [...shelters].sort((a, b) => haversineKm(z.centroid, a.position) - haversineKm(z.centroid, b.position)).slice(0, 4);
    for (const s of nearest) {
      const crosses = z.centroid[0] < riverLat !== s.position[0] < riverLat;
      const via: string[] = [];
      if (crosses) {
        const bridge = Object.entries(bridges).sort(
          (a, b) => Math.abs(a[1][1] - z.centroid[1]) - Math.abs(b[1][1] - z.centroid[1]),
        )[0]![0];
        via.push(bridge);
      }
      corridors.push({ zone: z.code, shelter: s.key, via, risk: rng.weighted<RouteRiskLevel>([["Low", 4], ["Moderate", 3], ["High", 1]]) });
    }
  }

  const bridgeNames = Object.keys(bridges);
  const events: DrillEvent[] = [
    { id: "s1", at_minute: 15, kind: "RouteSegmentBlocked", segment: bridgeNames[0]!, label: `${bridgeNames[0]} washed out` },
    { id: "s2", at_minute: 35, kind: "FacilityLost", shelter_id: 1, facilities: ["Power", "Medical"], label: "Relief Camp 1 loses power" },
    { id: "s3", at_minute: 55, kind: "ShelterClosed", shelter_id: Math.min(2, opts.shelters), label: "Relief Camp 2 closed – access road unsafe" },
  ];
  if (bridgeNames[1]) {
    events.push({ id: "s4", at_minute: 80, kind: "RouteSegmentBlocked", segment: bridgeNames[1], label: `${bridgeNames[1]} closed` });
  }

  return {
    id: `synthetic-${opts.seed}-${opts.zones}x${opts.shelters}`,
    name: `Synthetic stress test (seed ${opts.seed}, ${opts.zones} zones)`,
    description: `Seeded synthetic flood with ${opts.zones} zones, ${opts.shelters} shelters and ${bridgeNames.length} river crossings.`,
    seed: opts.seed,
    duration_minutes: 120,
    center,
    disaster: {
      type: "Flood",
      title: `Synthetic Flood (seed ${opts.seed})`,
      description: "Generated scenario for load and regression testing of the allocation engine.",
      severity: "High",
      state: "Tamil Nadu",
      district: "Chennai",
    },
    zones,
    shelters,
    segments: bridges,
    corridors,
    depots: [
      { name: "North Depot", position: [center[0] + spread * 0.3, center[1]] },
      { name: "South Depot", position: [center[0] - spread * 0.3, center[1]] },
    ],
    fleet: [
      { type: "Bus", capacity: 60, count: Math.max(6, Math.round(opts.zones * 1.5)), plate_prefix: "SYN-B" },
      { type: "Van", capacity: 12, count: Math.max(3, Math.round(opts.zones / 3)), plate_prefix: "SYN-V" },
      { type: "Ambulance", capacity: 6, count: Math.max(2, Math.round(opts.zones / 4)), plate_prefix: "SYN-A" },
    ],
    teams: [
      { name: "Synthetic Team Alpha", members: 6, contact: "+91 44 0000 0001", location: "North Depot" },
      { name: "Synthetic Team Bravo", members: 6, contact: "+91 44 0000 0002", location: "South Depot" },
    ],
    events,
  };
}
