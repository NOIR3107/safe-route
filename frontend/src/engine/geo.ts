import type { LatLng } from "@/api/extensions";

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function pathLengthKm(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += haversineKm(path[i - 1]!, path[i]!);
  return total;
}

/** Point at fraction t (0..1) of the way along a polyline. */
export function pointAlong(path: LatLng[], t: number): LatLng {
  if (path.length === 0) return [0, 0];
  if (path.length === 1 || t <= 0) return path[0]!;
  if (t >= 1) return path[path.length - 1]!;
  const total = pathLengthKm(path);
  let target = total * t;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = haversineKm(a, b);
    if (target <= seg && seg > 0) {
      const f = target / seg;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    target -= seg;
  }
  return path[path.length - 1]!;
}

/** Average urban speed used for vehicle approach legs during a flood (km/h). */
export const APPROACH_SPEED_KMH = 22;

export function approachMinutes(from: LatLng, to: LatLng): number {
  return Math.round((haversineKm(from, to) / APPROACH_SPEED_KMH) * 60);
}
