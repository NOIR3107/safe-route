// Builds the full mock database from a scenario: users, disaster, zones + households, shelters,
// roads, vehicles, teams, resources. Same scenario + seed = same data every time.
import type { Facility, Household, LatLng, RouteExt, VehicleExt, ZoneExt } from "@/api/extensions";
import { SCHEMA_VERSION, type DbState, type ShelterRow, type UserRow } from "@/api/mock/state";
import type { AffectedZone, RescueTeam, Resource, Route, Vehicle } from "@/api/schemas";
import { pathLengthKm } from "@/engine/geo";
import { Prng } from "./prng";
import type { ScenarioDefinition } from "./scenario";

const FIRST_NAMES = [
  "Lakshmi", "Murugan", "Priya", "Karthik", "Meena", "Senthil", "Anitha", "Ravi", "Kavitha", "Suresh",
  "Divya", "Ganesh", "Revathi", "Arun", "Selvi", "Vignesh", "Saranya", "Prakash", "Deepa", "Bala",
  "Nandhini", "Rajesh", "Gayathri", "Mani", "Shalini", "Ramesh", "Janani", "Venkat", "Malathi", "Dinesh",
  "Fathima", "Joseph", "Mary", "Abdul", "Sophia", "Imran", "Yamuna", "Hari", "Pooja", "Siva",
] as const;
const LAST_NAMES = [
  "Narayanan", "Subramanian", "Krishnan", "Raman", "Pillai", "Iyer", "Natarajan", "Sundaram", "Rajan", "Kumar",
  "Selvam", "Murthy", "Balasubramanian", "Venkatesan", "Arumugam", "Shanmugam", "Joseph", "Basha", "Fernando", "Devi",
] as const;

export const DEMO_PASSWORDS: Record<string, string> = {
  "admin@saferoute.org": "Admin@12345",
  "coordinator@saferoute.org": "Coord@12345",
  "commander@saferoute.org": "Command@12345",
  "shelter.tnagar@saferoute.org": "Shelter@12345",
  "transport@saferoute.org": "Transport@12345",
  "field.alpha@saferoute.org": "Field@12345",
};

export function buildState(def: ScenarioDefinition, now: Date = new Date()): DbState {
  const rng = new Prng(def.seed);
  const iso = now.toISOString();
  const seq: Record<string, number> = {};
  const id = (t: string) => (seq[t] = (seq[t] ?? 0) + 1);

  /* ---------------- users (the first two match app/main.py's seeded accounts) */
  const userDefs: [string, string, UserRow["role"], string][] = [
    ["System Administrator", "admin@saferoute.org", "Admin", "+91-9876543210"],
    ["Evacuation Coordinator", "coordinator@saferoute.org", "Evacuation Coordinator", "+91-9876543211"],
    ["Incident Commander", "commander@saferoute.org", "Emergency Authority", "+91-9876543212"],
    ["Shelter Manager – T. Nagar", "shelter.tnagar@saferoute.org", "Shelter Manager", "+91-9876543213"],
    ["Transport Coordinator", "transport@saferoute.org", "Transport Coordinator", "+91-9876543214"],
    ["Field Team Alpha Lead", "field.alpha@saferoute.org", "Response Team", "+91-9876543215"],
  ];
  const users: UserRow[] = userDefs.map(([name, email, role, phone]) => ({
    user_id: id("users"),
    name,
    email,
    role,
    phone_number: phone,
    is_active: true,
    created_at: iso,
    password: DEMO_PASSWORDS[email]!,
  }));
  const scopes = users.map((u) => ({
    user_id: u.user_id,
    shelter_id: u.role === "Shelter Manager" ? 1 : null,
    team_id: u.role === "Response Team" ? 1 : null,
    zone_ids: null,
  }));

  /* ---------------- disaster */
  const disaster_id = id("disasters");
  const disasters = [
    {
      disaster_id,
      type: def.disaster.type,
      title: def.disaster.title,
      description: def.disaster.description,
      severity: def.disaster.severity,
      status: "Active" as const,
      start_date: iso,
      end_date: null,
      created_at: iso,
    },
  ];

  /* ---------------- zones + households */
  const zones: AffectedZone[] = [];
  const zone_ext: ZoneExt[] = [];
  const households: Household[] = [];
  const zoneIdByCode = new Map<string, number>();
  for (const z of def.zones) {
    const zone_id = id("zones");
    zoneIdByCode.set(z.code, zone_id);
    zones.push({
      zone_id,
      disaster_id,
      name: z.name,
      location: z.location,
      state: def.disaster.state,
      district: def.disaster.district,
      population: 0, // set from generated households below
      priority: z.priority,
      risk_level: z.risk_level,
      evacuated_count: 0,
      status: "Pending",
    });
    zone_ext.push({ zone_id, code: z.code, severity: z.severity, centroid: z.centroid, polygon: blob(z.centroid, z.radius_km, rng) });

    let people = 0;
    let n = 0;
    while (people < z.population) {
      n++;
      const size = Math.min(
        z.population - people,
        rng.weighted([[1, 10], [2, 18], [3, 22], [4, 25], [5, 15], [6, 7], [7, 3]] as const),
      );
      const isDemo = n === 1 && def.demo_household?.zone === z.code;
      const last = rng.pick(LAST_NAMES);
      const head = isDemo ? def.demo_household!.head_name : `${rng.pick(FIRST_NAMES)} ${last}`;
      const members = [head];
      for (let i = 1; i < size; i++) members.push(`${rng.pick(FIRST_NAMES)} ${isDemo ? "Narayanan" : last}`);
      const elderly = countOf(size, 0.12, rng);
      const children = countOf(size, 0.22, rng);
      const disabled = rng.chance(0.05) ? 1 : 0;
      const medical = rng.chance(0.04) ? 1 : 0;
      households.push({
        household_id: `HH-${z.code}-${String(n).padStart(4, "0")}`,
        zone_id,
        token: `SR-${z.code}-${String(rng.int(1000, 9999))}${String(n).padStart(3, "0")}`,
        head_name: head,
        phone: isDemo ? def.demo_household!.phone : `+91 9${rng.int(1000, 9999)} ${rng.int(10000, 99999)}`,
        members,
        size,
        elderly,
        children,
        disabled,
        medical,
        pets: rng.chance(0.12),
        status: "Awaiting",
        shelter_id: null,
        walk_in: false,
      });
      people += size;
    }
    zones[zones.length - 1]!.population = people;
  }

  /* ---------------- shelters */
  const shelters: ShelterRow[] = [];
  const shelterIdByKey = new Map<string, number>();
  for (const s of def.shelters) {
    const shelter_id = id("shelters");
    shelterIdByKey.set(s.key, shelter_id);
    shelters.push({
      shelter_id,
      name: s.name,
      location: s.location,
      capacity: s.capacity,
      current_occupancy: s.occupancy,
      facilities: s.facilities.join(","),
      status: "Active",
      latitude: s.position[0],
      longitude: s.position[1],
      facilities_list: s.facilities.map((f: Facility) => ({
        facility_id: id("facilities"),
        shelter_id,
        facility_type: f,
        capacity: null,
        availability_status: "Available" as const,
      })),
    });
  }
  const shelter_ext = shelters.map((s) => ({ shelter_id: s.shelter_id, reserved_pct: 0.1, walk_ins: 0 }));

  /* ---------------- routes (one per corridor; source/destination strings as the backend expects) */
  const routes: Route[] = [];
  const route_ext: RouteExt[] = [];
  for (const c of def.corridors) {
    const zDef = def.zones.find((z) => z.code === c.zone)!;
    const sDef = def.shelters.find((s) => s.key === c.shelter)!;
    const path: LatLng[] = [zDef.centroid, ...c.via.map((v) => def.segments[v]!).filter(Boolean), sDef.position];
    const distance = Math.round(pathLengthKm(path) * 1.3 * 10) / 10; // road factor over straight segments
    const route_id = id("routes");
    routes.push({
      route_id,
      source: zDef.location,
      destination: sDef.location,
      distance_km: Math.max(0.5, distance),
      travel_time: Math.max(4, Math.round((distance / 20) * 60)),
      risk_level: c.risk,
      status: "Open",
    });
    route_ext.push({ route_id, zone_id: zoneIdByCode.get(c.zone)!, shelter_id: shelterIdByKey.get(c.shelter)!, path, via: c.via });
  }

  /* ---------------- teams, fleet */
  const teams: RescueTeam[] = def.teams.map((t) => ({
    team_id: id("teams"),
    name: t.name,
    members_count: t.members,
    contact_number: t.contact,
    status: "Deployed",
    current_location: t.location,
  }));
  const vehicles: Vehicle[] = [];
  const vehicle_ext: VehicleExt[] = [];
  let depotIdx = 0;
  for (const f of def.fleet) {
    for (let i = 0; i < f.count; i++) {
      const vehicle_id = id("vehicles");
      const depot = def.depots[depotIdx++ % def.depots.length]!;
      vehicles.push({
        vehicle_id,
        vehicle_type: f.type,
        capacity: f.capacity,
        status: "Available",
        current_location: depot.name,
        plate_number: `${f.plate_prefix}-${String(4500 + i)}`,
      });
      const jitter: LatLng = [depot.position[0] + (rng.next() - 0.5) * 0.004, depot.position[1] + (rng.next() - 0.5) * 0.004];
      vehicle_ext.push({ vehicle_id, team_id: teams[(vehicle_id - 1) % teams.length]!.team_id, depot: jitter, position: jitter });
    }
  }

  const resources: Resource[] = [
    { resource_id: id("resources"), resource_type: "Drinking Water (L)", quantity: 18000, availability: "Available", location: "Corporation Store, Saidapet" },
    { resource_id: id("resources"), resource_type: "Food Packs", quantity: 6200, availability: "Available", location: "Amma Canteen Hub, T. Nagar" },
    { resource_id: id("resources"), resource_type: "Medical Kits", quantity: 140, availability: "Low Stock", location: "GH Chennai" },
    { resource_id: id("resources"), resource_type: "Blankets", quantity: 4100, availability: "Available", location: "Red Cross Godown, Egmore" },
    { resource_id: id("resources"), resource_type: "Diesel for Generators (L)", quantity: 900, availability: "Low Stock", location: "IOCL Depot, Guindy" },
  ];

  return {
    schema_version: SCHEMA_VERSION,
    scenario_id: def.id,
    sim_minute: 0,
    seq,
    users,
    scopes,
    disasters,
    zones,
    zone_ext,
    households,
    shelters,
    shelter_ext,
    routes,
    route_ext,
    vehicles,
    vehicle_ext,
    teams,
    resources,
    plans: [],
    assignments: [],
    vehicle_assignments: [],
    assignment_ext: [],
    progress: [],
    versions: [],
    notifications: [
      {
        notification_id: id("notifications"),
        user_id: null,
        message: `${def.disaster.title}: incident declared. ${def.zones.length} zones flagged for assisted evacuation.`,
        type: "CRITICAL",
        status: "Unread",
        timestamp: iso,
      },
    ],
    audit: [
      {
        log_id: id("audit"),
        user_id: 1,
        action: "CREATE_DISASTER",
        entity_type: "Disaster",
        entity_id: disaster_id,
        details: `Seeded scenario "${def.name}"`,
        timestamp: iso,
      },
    ],
    events: [
      {
        id: id("events"),
        sim_minute: 0,
        timestamp: iso,
        level: "critical",
        title: "Incident declared",
        detail: def.disaster.description,
      },
    ],
    drill: { scenario_id: def.id, phase: "ready", speed: 4, timeline: def.events, fired_event_ids: [], snapshot: null },
  };
}

function countOf(size: number, p: number, rng: Prng): number {
  let n = 0;
  for (let i = 0; i < size; i++) if (rng.chance(p)) n++;
  return n;
}

/** Irregular polygon around a centroid; ~radius_km, deterministic for a given PRNG state. */
function blob(c: LatLng, radiusKm: number, rng: Prng): LatLng[] {
  const pts: LatLng[] = [];
  const n = 10;
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((c[0] * Math.PI) / 180));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.7 + rng.next() * 0.45;
    pts.push([c[0] + Math.sin(a) * dLat * r, c[1] + Math.cos(a) * dLng * r]);
  }
  return pts;
}
