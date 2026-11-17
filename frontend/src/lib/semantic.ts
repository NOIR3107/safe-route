// Colours, icons and labels for every status in one place. Each status gets an icon and a text label
// as well as a colour, so nothing depends on colour alone.
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDot,
  Clock,
  Construction,
  DoorClosed,
  DoorOpen,
  Droplets,
  Gauge,
  HeartPulse,
  Loader,
  PawPrint,
  Plug,
  RotateCcw,
  ShieldCheck,
  Soup,
  TrafficCone,
  Truck,
  Undo2,
  Wrench,
  XCircle,
  Accessibility as AccessibilityIcon,
  BedDouble,
  type LucideIcon,
} from "lucide-react";
import type { ApprovalState, Facility, Severity, ShelterDisplayStatus } from "@/api/extensions";
import type { AssignmentStatus, RouteStatus, VehicleStatus } from "@/api/schemas";

export type Tone = "ok" | "lime" | "warn" | "caution" | "danger" | "info" | "neutral" | "violet";

export interface StatusStyle {
  tone: Tone;
  icon: LucideIcon;
  label: string;
}

/** Tailwind classes per tone (tinted background, accessible text, matching border). */
export const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok/12 text-ok-fg border-ok/30",
  lime: "bg-lime/12 text-lime-fg border-lime/30",
  warn: "bg-warn/12 text-warn-fg border-warn/30",
  caution: "bg-caution/12 text-caution-fg border-caution/30",
  danger: "bg-danger/12 text-danger-fg border-danger/30",
  info: "bg-info/12 text-info-fg border-info/30",
  neutral: "bg-neutral/12 text-neutral-fg border-neutral/30",
  violet: "bg-violet/12 text-violet-fg border-violet/30",
};

export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  lime: "text-lime",
  warn: "text-warn",
  caution: "text-caution",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-neutral",
  violet: "text-violet",
};

/** Raw colours for Leaflet (SVG attributes cannot use CSS variables). */
export const TONE_HEX: Record<"dark" | "light", Record<Tone, string>> = {
  // Same values as the --color-* status tokens in index.css.
  dark: {
    ok: "#3fb950",
    lime: "#8cc43a",
    warn: "#d6a02a",
    caution: "#e5793a",
    danger: "#f0534b",
    info: "#5b9cf0",
    neutral: "#8b9098",
    violet: "#a98bf0",
  },
  light: {
    ok: "#1a7f37",
    lime: "#5a8a0f",
    warn: "#b7791f",
    caution: "#d0601c",
    danger: "#cf222e",
    info: "#2f6fb3",
    neutral: "#6b6f76",
    violet: "#7651c9",
  },
}

/** Severity 1-5 colours (same values as the --color-sev-N tokens): one hue stepping in lightness, so
 * neighbouring levels stay distinct for colour-blind readers. Validated with the dataviz checker. */
export const SEVERITY_HEX: Record<"dark" | "light", Record<Severity, string>> = {
  dark: { 1: "#7a493e", 2: "#9f5646", 3: "#c4624e", 4: "#e97158", 5: "#ff876c" },
  light: { 1: "#e1a096", 2: "#d97e73", 3: "#cf5b4f", 4: "#bd3931", 5: "#a01f1b" },
};

export const SEVERITY: Record<Severity, StatusStyle> = {
  1: { tone: "ok", icon: CircleDot, label: "Sev 1 · Minimal" },
  2: { tone: "lime", icon: CircleDot, label: "Sev 2 · Low" },
  3: { tone: "warn", icon: AlertTriangle, label: "Sev 3 · Moderate" },
  4: { tone: "caution", icon: AlertTriangle, label: "Sev 4 · High" },
  5: { tone: "danger", icon: AlertOctagon, label: "Sev 5 · Extreme" },
};

export const SHELTER_STATUS: Record<ShelterDisplayStatus, StatusStyle> = {
  Open: { tone: "ok", icon: DoorOpen, label: "Open" },
  "Near Full": { tone: "warn", icon: Gauge, label: "Near full" },
  Full: { tone: "danger", icon: Ban, label: "Full" },
  Closed: { tone: "neutral", icon: DoorClosed, label: "Closed" },
};

export const ROUTE_STATUS: Record<RouteStatus, StatusStyle> = {
  Open: { tone: "ok", icon: CheckCircle2, label: "Open" },
  Congested: { tone: "warn", icon: TrafficCone, label: "Congested" },
  Blocked: { tone: "danger", icon: Construction, label: "Blocked" },
  Flooded: { tone: "danger", icon: Droplets, label: "Flooded" },
  Cleared: { tone: "info", icon: RotateCcw, label: "Cleared" },
};

export const ASSIGNMENT_STATUS: Record<AssignmentStatus, StatusStyle> = {
  Scheduled: { tone: "info", icon: Clock, label: "Scheduled" },
  "In Progress": { tone: "warn", icon: Loader, label: "En route" },
  Completed: { tone: "ok", icon: CheckCircle2, label: "Arrived" },
  Rerouted: { tone: "violet", icon: Undo2, label: "Rerouted" },
  Cancelled: { tone: "neutral", icon: XCircle, label: "Cancelled" },
};

export const VEHICLE_STATUS: Record<VehicleStatus, StatusStyle> = {
  Available: { tone: "ok", icon: CheckCircle2, label: "Available" },
  Assigned: { tone: "info", icon: Clock, label: "Assigned" },
  "In Transit": { tone: "warn", icon: Truck, label: "In transit" },
  Maintenance: { tone: "neutral", icon: Wrench, label: "Maintenance" },
};

export const APPROVAL: Record<ApprovalState, StatusStyle> = {
  Proposed: { tone: "info", icon: Clock, label: "Proposed" },
  Approved: { tone: "ok", icon: ShieldCheck, label: "Approved" },
  Overridden: { tone: "violet", icon: Undo2, label: "Overridden" },
};

export const FACILITY_ICON: Record<Facility, LucideIcon> = {
  Medical: HeartPulse,
  Power: Plug,
  Water: Droplets,
  Accessibility: AccessibilityIcon,
  Pets: PawPrint,
  Food: Soup,
  Bedding: BedDouble,
};

export function occupancyTone(utilization: number): Tone {
  if (utilization >= 0.95) return "danger";
  if (utilization >= 0.75) return "warn";
  return "ok";
}
