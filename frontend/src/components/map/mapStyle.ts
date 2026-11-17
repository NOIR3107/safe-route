/**
 * How things look on the map. Pure functions (no Cesium, no DOM) so the rules are unit tested.
 *
 * Colour carries status only: zones by severity, shelters by how full they are, problem routes in
 * amber/red. Everything else is grayscale so the problems stand out.
 */
import type { RouteStatus, VehicleStatus } from "@/api/schemas";
import type { Severity, ShelterDisplayStatus } from "@/api/extensions";
import { SEVERITY_HEX, SHELTER_STATUS, TONE_HEX, type Tone } from "@/lib/semantic";

export type Theme = "dark" | "light";

/** Neutral map ink per theme (routes in use, vehicles, labels). */
export const INK: Record<Theme, { strong: string; soft: string; faint: string; halo: string; select: string }> = {
  dark: { strong: "#e9eaec", soft: "#9aa0a8", faint: "#5b6068", halo: "#131417", select: "#4cc2d4" },
  light: { strong: "#18191b", soft: "#5d6066", faint: "#a6a9ad", halo: "#ffffff", select: "#0b7f92" },
};

export const toneHex = (tone: Tone, theme: Theme) => TONE_HEX[theme][tone];
export const severityHex = (s: Severity, theme: Theme) => SEVERITY_HEX[theme][s];

/* ------------------------------------------------------------------ shelters: capacity rings */

export interface ShelterMarkerSpec {
  /** Pixel diameter, scaled to capacity (area roughly proportional to capacity). */
  size: number;
  /** Fraction of the ring drawn: (present + inbound) / capacity, 0..1. */
  fill: number;
  /** Fraction already present (drawn solid); the rest of `fill` is inbound (drawn lighter). */
  present: number;
  color: string;
  closed: boolean;
}

export const MIN_MARKER = 20;
export const MAX_MARKER = 44;

export function shelterMarkerSpec(
  s: { capacity: number; current_occupancy: number; inbound: number; display_status: ShelterDisplayStatus },
  maxCapacity: number,
  theme: Theme,
): ShelterMarkerSpec {
  const ratio = Math.sqrt(Math.max(0, s.capacity) / Math.max(1, maxCapacity));
  const size = Math.round(MIN_MARKER + (MAX_MARKER - MIN_MARKER) * Math.min(1, ratio));
  const fill = Math.min(1, (s.current_occupancy + s.inbound) / Math.max(1, s.capacity));
  const present = Math.min(fill, s.current_occupancy / Math.max(1, s.capacity));
  return {
    size,
    fill,
    present,
    color: toneHex(SHELTER_STATUS[s.display_status].tone, theme),
    closed: s.display_status === "Closed",
  };
}

/* ------------------------------------------------------------------ routes */

export interface RouteStyle {
  color: string;
  alpha: number;
  width: number;
  dashed: boolean;
  /** Drawn above other routes (problems on top). */
  z: number;
}

/**
 * Active routes are thin and muted, problems are highlighted, cleared routes fade. Routes nobody uses
 * are nearly invisible so 40 corridors do not tangle into a knot.
 */
export function routeStyle(status: RouteStatus, inUse: boolean, theme: Theme): RouteStyle {
  const ink = INK[theme];
  switch (status) {
    case "Blocked":
    case "Flooded":
      return { color: toneHex("danger", theme), alpha: 0.95, width: 3, dashed: true, z: 3 };
    case "Congested":
      return { color: toneHex("warn", theme), alpha: inUse ? 0.95 : 0.55, width: inUse ? 3 : 2, dashed: false, z: 2 };
    case "Cleared":
      return { color: ink.soft, alpha: 0.35, width: 1.5, dashed: true, z: 1 };
    default:
      return inUse
        ? { color: ink.strong, alpha: 0.55, width: 1.75, dashed: false, z: 1 }
        : { color: ink.faint, alpha: 0.28, width: 1, dashed: false, z: 0 };
  }
}

/* ------------------------------------------------------------------ vehicles */

export function vehicleColor(status: VehicleStatus, theme: Theme): string {
  const ink = INK[theme];
  if (status === "In Transit") return ink.strong;
  if (status === "Assigned") return ink.soft;
  if (status === "Maintenance") return toneHex("caution", theme);
  return ink.faint;
}

/** Linear interpolation used to glide vehicles between position updates. */
export function lerpLatLng(a: [number, number], b: [number, number], t: number): [number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}
