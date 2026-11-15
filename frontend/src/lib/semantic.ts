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
  ok: "bg-ok/15 text-ok-fg border-ok/40",
  lime: "bg-lime/15 text-lime-fg border-lime/40",
  warn: "bg-warn/15 text-warn-fg border-warn/40",
  caution: "bg-caution/15 text-caution-fg border-caution/40",
  danger: "bg-danger/15 text-danger-fg border-danger/40",
  info: "bg-info/15 text-info-fg border-info/40",
  neutral: "bg-neutral/15 text-neutral-fg border-neutral/40",
  violet: "bg-violet/15 text-violet-fg border-violet/40",
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
  dark: {
    ok: "#22c55e",
    lime: "#84cc16",
    warn: "#f59e0b",
    caution: "#f97316",
    danger: "#ef4444",
    info: "#38bdf8",
    neutral: "#94a3b8",
    violet: "#a78bfa",
  },
  light: {
    ok: "#16a34a",
    lime: "#65a30d",
    warn: "#d97706",
    caution: "#ea580c",
    danger: "#dc2626",
    info: "#0284c7",
    neutral: "#64748b",
    violet: "#7c3aed",
  },
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
