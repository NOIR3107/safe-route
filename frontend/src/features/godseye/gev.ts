// Talking to god's-eye-view (integrations/gods-eye-view) in embed mode.
//
// GEV runs as its own app (default http://localhost:4173). With ?embed=1 it shows just the globe and
// accepts { type: "gev:view", id, view } messages from the page framing it. A view sets the camera,
// exactly the given layers, and up to 24 annotations. It replies with "gev:view-applied" and says
// "gev:ready" once it can take views. See src/app/embed.js and src/view/index.js in that repo.

import type { LatLng, RouteView, ShelterView, ZoneView } from "@/api/extensions";

export const GEV_URL = (import.meta.env.VITE_GEV_URL ?? "http://localhost:4173").replace(/\/$/, "");
export const GEV_ORIGIN = new URL(GEV_URL).origin;

export const MAX_ANNOTATIONS = 24;

export type GevColor = "primary" | "amber" | "cyan" | "green" | "red";

export interface GevCamera {
  lat: number;
  lon: number;
  altitude_m: number;
  heading_deg: number;
  pitch_deg: number;
}

export type GevAnnotation =
  | { type: "pin" | "label" | "highlight"; latitude: number; longitude: number; label?: string; color?: GevColor }
  | { type: "arrow"; latitude: number; longitude: number; toLatitude: number; toLongitude: number; label?: string; color?: GevColor };

export interface GevView {
  camera: GevCamera;
  layers: string[];
  annotations: GevAnnotation[];
}

// Live GEV layers that are useful during a flood. Ids come from GEV's src/data/layerState.js.
export const FLOOD_LAYERS = [
  { id: "weather-radar", label: "Rain radar" },
  { id: "weather-satellite", label: "Satellite clouds" },
  { id: "wind", label: "Wind" },
  { id: "weather-cyclones", label: "Cyclone advisories" },
  { id: "local-dams", label: "Dams & reservoirs" },
  { id: "earthquakes", label: "Earthquakes" },
] as const;

/**
 * Camera that looks at `target` from the south at the given height. GEV places the camera at
 * lat/lon and looks along the heading, so we step back by altitude / tan(pitch) to keep the target
 * in the middle of the screen.
 */
export function cameraLookingAt(target: LatLng, altitude: number, pitch = -50): GevCamera {
  const ground = altitude / Math.tan((-pitch * Math.PI) / 180);
  const dLat = ground / 111_320;
  return {
    lat: round(target[0] - dLat),
    lon: round(target[1]),
    altitude_m: Math.round(altitude),
    heading_deg: 0,
    pitch_deg: pitch,
  };
}

export function overviewCamera(points: LatLng[]): GevCamera {
  if (points.length === 0) return cameraLookingAt([13.02, 80.235], 20_000);
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  const center: LatLng = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
  const spanKm = Math.max((Math.max(...lats) - Math.min(...lats)) * 111, (Math.max(...lons) - Math.min(...lons)) * 108);
  return cameraLookingAt(center, Math.min(60_000, Math.max(8_000, spanKm * 1_300)));
}

function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function shelterColor(s: ShelterView): GevColor {
  if (s.display_status === "Closed") return "primary";
  if (s.display_status === "Full") return "red";
  if (s.display_status === "Near Full") return "amber";
  return "green";
}

/**
 * SafeRoute's picture as GEV annotations, most important first, cut at 24:
 * shelters, zones, then closed roads, congested roads and (if asked) roads in use by the plan.
 *
 * Roads are sent as arrows from zone to shelter. GEV re-routes "route" annotations along real
 * streets in walking mode and adds "N min walk" to the label, which would mislead here.
 */
export function buildAnnotations(
  zones: ZoneView[],
  shelters: ShelterView[],
  routes: RouteView[],
  routesInUse: Set<number>,
  opts: { roadsInUse?: boolean } = {},
): GevAnnotation[] {
  const out: GevAnnotation[] = [];

  for (const s of shelters) {
    if (s.latitude == null || s.longitude == null) continue;
    const load = Math.round(((s.current_occupancy + s.inbound) / s.capacity) * 100);
    out.push({ type: "pin", latitude: s.latitude, longitude: s.longitude, label: `${s.name} (${load}%)`, color: shelterColor(s) });
  }

  for (const z of zones) {
    if (z.ext.polygon.length === 0) continue;
    const color: GevColor = z.ext.severity >= 4 ? "red" : z.ext.severity === 3 ? "amber" : "green";
    out.push({ type: "highlight", latitude: z.ext.centroid[0], longitude: z.ext.centroid[1], label: `${z.name} (sev ${z.ext.severity})`, color });
  }

  const routeAnnotation = (r: RouteView, color: GevColor, what: string): GevAnnotation => {
    const from = r.ext.path[0]!;
    const to = r.ext.path[r.ext.path.length - 1]!;
    return { type: "arrow", latitude: from[0], longitude: from[1], toLatitude: to[0], toLongitude: to[1], label: `R${r.route_id} ${what}`, color };
  };
  const usable = routes.filter((r) => r.ext.path.length >= 2);
  const closed = usable.filter((r) => r.status === "Blocked" || r.status === "Flooded");
  const congested = usable.filter((r) => r.status === "Congested" && routesInUse.has(r.route_id));
  const inUse = usable.filter((r) => routesInUse.has(r.route_id) && r.status !== "Congested" && !closed.includes(r));
  for (const r of closed) out.push(routeAnnotation(r, "red", r.status.toLowerCase()));
  for (const r of congested) out.push(routeAnnotation(r, "amber", "congested"));
  if (opts.roadsInUse) for (const r of inUse) out.push(routeAnnotation(r, "cyan", "in use"));

  return out.slice(0, MAX_ANNOTATIONS);
}

/** First page load: embed mode plus a camera in the hash, so the globe opens over the incident. */
export function embedSrc(camera: GevCamera): string {
  const hash = new URLSearchParams({
    lat: String(camera.lat),
    lon: String(camera.lon),
    alt: String(camera.altitude_m),
    heading: String(camera.heading_deg),
    pitch: String(camera.pitch_deg),
  });
  return `${GEV_URL}/?embed=1#${hash.toString()}`;
}

export interface GevApplied {
  type: "gev:view-applied";
  id: string | null;
  ok: boolean;
  error?: string;
  steps?: { step: string; ok: boolean }[];
}

export function isGevMessage(data: unknown): data is { type: "gev:ready" } | GevApplied {
  return typeof data === "object" && data !== null && "type" in data && (data.type === "gev:ready" || data.type === "gev:view-applied");
}
