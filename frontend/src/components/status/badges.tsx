import type { ApprovalState, Facility, Severity, ShelterDisplayStatus } from "@/api/extensions";
import type { AssignmentStatus, RouteStatus, VehicleStatus } from "@/api/schemas";
import { Badge } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/overlay";
import {
  APPROVAL,
  ASSIGNMENT_STATUS,
  FACILITY_ICON,
  ROUTE_STATUS,
  SEVERITY,
  SHELTER_STATUS,
  VEHICLE_STATUS,
  type StatusStyle,
} from "@/lib/semantic";
import { cn } from "@/lib/utils";

function StyleBadge({ s, short, className }: { s: StatusStyle; short?: string; className?: string }) {
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} className={className}>
      <Icon aria-hidden />
      {short ?? s.label}
    </Badge>
  );
}

export function SeverityBadge({ severity, compact }: { severity: Severity; compact?: boolean }) {
  return <StyleBadge s={SEVERITY[severity]} short={compact ? `Sev ${severity}` : undefined} />;
}

export function ShelterStatusBadge({ status }: { status: ShelterDisplayStatus }) {
  return <StyleBadge s={SHELTER_STATUS[status]} />;
}

export function RouteStatusBadge({ status }: { status: RouteStatus }) {
  return <StyleBadge s={ROUTE_STATUS[status]} />;
}

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  return <StyleBadge s={ASSIGNMENT_STATUS[status]} />;
}

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  return <StyleBadge s={VEHICLE_STATUS[status]} />;
}

export function ApprovalBadge({ state }: { state: ApprovalState }) {
  return <StyleBadge s={APPROVAL[state]} />;
}

export function FacilityIcons({ available, listed, className }: { available: Facility[]; listed?: Facility[]; className?: string }) {
  const all = listed ?? available;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1", className)} aria-label="Facilities">
      {all.map((f) => {
        const Icon = FACILITY_ICON[f];
        const ok = available.includes(f);
        return (
          <li key={f}>
            <Tooltip content={`${f}${ok ? "" : " – unavailable"}`}>
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-md border",
                  ok ? "border-border bg-surface-2 text-fg" : "border-danger/40 bg-danger/10 text-danger-fg line-through",
                )}
                aria-label={`${f}${ok ? " available" : " unavailable"}`}
                role="img"
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
