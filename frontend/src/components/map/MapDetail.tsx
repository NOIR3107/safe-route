/**
 * Details of whatever was clicked on the map, with the actions this role may take (FR-11).
 * Shelter: occupancy and inbound vehicles. Zone: population and people remaining. Vehicle: route and
 * ETA. Route: status and the groups using it.
 */
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/common";
import { Meter } from "@/components/charts/Sparkline";
import { RouteStatusBadge, SeverityBadge, ShelterStatusBadge } from "@/components/status/badges";
import { Button } from "@/components/ui/button";
import { useAssignments, useClock, useRoutes, useShelters, useTeams, useTransitionRoute, useTransitionShelter, useVehicles, useZones } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import type { RouteStatus, ShelterStatus } from "@/api/schemas";
import { cn, fmtMinutes, fmtNum, fmtPct } from "@/lib/utils";
import { useMapStore } from "./mapStore";

const STATUS_TONE = { Open: "var(--color-ok)", "Near Full": "var(--color-warn)", Full: "var(--color-danger)", Closed: "var(--color-neutral)" } as const;

export function MapDetail({ className }: { className?: string }) {
  const selection = useMapStore((s) => s.selection);
  const select = useMapStore((s) => s.select);
  if (!selection) return null;
  return (
    <aside
      aria-label="Map selection details"
      className={cn("w-80 overflow-hidden rounded-md border border-border bg-surface/[0.97] shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)]", className)}
      data-testid="map-detail"
    >
      <button
        type="button"
        onClick={() => select(null)}
        aria-label="Close details"
        className="absolute top-2 right-2 cursor-pointer rounded-[4px] p-1 text-muted hover:bg-surface-2 hover:text-fg"
      >
        <X className="size-4" />
      </button>
      {selection.kind === "shelter" ? <ShelterDetail id={selection.id} /> : null}
      {selection.kind === "zone" ? <ZoneDetail id={selection.id} /> : null}
      {selection.kind === "vehicle" ? <VehicleDetail id={selection.id} /> : null}
      {selection.kind === "route" ? <RouteDetail id={selection.id} /> : null}
    </aside>
  );
}

function Head({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="border-b border-border px-4 pt-3 pb-3 pr-10">
      <p className="text-xs text-muted">{kicker}</p>
      <h3 className="mt-0.5 text-[15px] leading-snug font-semibold">{title}</h3>
      {children ? <div className="mt-1.5 flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ shelter */

function ShelterDetail({ id }: { id: number }) {
  const s = useShelters().data?.find((x) => x.shelter_id === id);
  const vehicles = useVehicles().data ?? [];
  const assignments = useAssignments().data ?? [];
  const { can, user } = useSession();
  const transition = useTransitionShelter();
  const [confirm, setConfirm] = useState<ShelterStatus | null>(null);
  if (!s) return <p className="p-4 text-sm text-muted">Shelter not found.</p>;
  const inboundAssignments = assignments.filter((a) => a.shelter_id === id && (a.status === "Scheduled" || a.status === "In Progress"));
  const inboundVehicles = vehicles.filter((v) => v.assignment_id != null && inboundAssignments.some((a) => a.assignment_id === v.assignment_id));
  const mayChange = can("shelter:write") && (user?.role !== "Shelter Manager" || user.scope.shelter_id === id);
  const load = (s.current_occupancy + s.inbound) / s.capacity;
  return (
    <>
      <Head kicker="Shelter" title={s.name}>
        <ShelterStatusBadge status={s.display_status} />
        <span className="text-xs text-muted">{s.location}</span>
      </Head>
      <div className="px-4 pt-3">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-muted">Present + on the way</span>
          <span className="font-semibold tabular-nums">{fmtPct(load)}</span>
        </div>
        <div className="mt-1.5">
          <Meter present={s.current_occupancy / s.capacity} inbound={s.inbound / s.capacity} tone={STATUS_TONE[s.display_status]} label="Shelter load" />
        </div>
      </div>
      <Rows
        rows={[
          ["Present", fmtNum(s.current_occupancy)],
          ["On the way", fmtNum(s.inbound)],
          ["Capacity", fmtNum(s.capacity)],
          ["Walk-in reserve left", fmtNum(Math.max(0, s.reserved - s.ext.walk_ins))],
          ["Inbound vehicles", inboundVehicles.length ? summarizeVehicles(inboundVehicles.map((v) => v.vehicle_type)) : "none"],
        ]}
      />
      <p className="px-4 pb-3 text-xs text-muted">Facilities: {s.available_facilities.join(", ") || "none"}</p>
      {mayChange ? (
        <div className="flex gap-2 border-t border-border px-4 py-3">
          {s.status === "Active" ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setConfirm("Full")}>
                Mark full
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirm("Closed")}>
                Close shelter
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirm("Active")}>
              Reopen
            </Button>
          )}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm != null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "Closed" ? `Close ${s.name}?` : confirm === "Full" ? `Mark ${s.name} full?` : `Reopen ${s.name}?`}
        description={
          confirm === "Active"
            ? "Anyone still without a shelter will be re-planned to include it."
            : `${fmtNum(s.inbound)} people heading here will be re-planned to other shelters. The change is written to the audit log.`
        }
        confirmLabel={confirm === "Closed" ? "Close shelter" : confirm === "Full" ? "Mark full" : "Reopen"}
        tone={confirm === "Active" ? "default" : "danger"}
        requireReason={confirm !== "Active"}
        busy={transition.isPending}
        onConfirm={(reason) => {
          if (confirm) transition.mutate({ id, status: confirm, reason: reason || undefined }, { onSuccess: () => setConfirm(null) });
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ zone */

function ZoneDetail({ id }: { id: number }) {
  const z = useZones().data?.find((x) => x.zone_id === id);
  const assignments = useAssignments().data ?? [];
  if (!z) return <p className="p-4 text-sm text-muted">Zone not found.</p>;
  const going = assignments.filter((a) => a.zone_id === id && (a.status === "Scheduled" || a.status === "In Progress"));
  const byShelter = new Map<string, number>();
  for (const a of going) byShelter.set(a.shelter_name, (byShelter.get(a.shelter_name) ?? 0) + a.people_count);
  return (
    <>
      <Head kicker={`Zone ${z.ext.code}`} title={z.name}>
        <SeverityBadge severity={z.ext.severity} />
        <span className="text-xs text-muted">Priority {z.priority}</span>
      </Head>
      <Rows
        rows={[
          ["Needing evacuation", fmtNum(z.population)],
          ["Still in the zone", <span key="r" className="font-semibold">{fmtNum(z.remaining)}</span>],
          ["Evacuated", fmtNum(z.evacuated_count)],
          ["Households", fmtNum(z.household_count)],
          ["Elderly / children", `${fmtNum(z.vulnerable.elderly)} / ${fmtNum(z.vulnerable.children)}`],
          ["Disabled / medical", `${fmtNum(z.vulnerable.disabled)} / ${fmtNum(z.vulnerable.medical)}`],
        ]}
      />
      {byShelter.size ? (
        <div className="border-t border-border px-4 py-3 text-[13px]">
          <p className="text-xs text-muted">Being moved to</p>
          <ul className="mt-1 space-y-0.5">
            {[...byShelter].map(([name, people]) => (
              <li key={name} className="flex justify-between gap-3">
                <span className="truncate">{name}</span>
                <span className="tabular-nums">{fmtNum(people)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ vehicle */

function VehicleDetail({ id }: { id: number }) {
  const v = useVehicles().data?.find((x) => x.vehicle_id === id);
  const assignments = useAssignments().data ?? [];
  const teams = useTeams().data ?? [];
  const minute = useClock().data?.sim_minute ?? 0;
  if (!v) return <p className="p-4 text-sm text-muted">Vehicle not found.</p>;
  const a = assignments.find((x) => x.assignment_id === v.assignment_id);
  const team = teams.find((t) => t.team_id === v.ext.team_id);
  const eta = a ? Math.max(0, a.ext.dispatch_minute + a.ext.eta_minutes - minute) : null;
  return (
    <>
      <Head kicker={`${v.vehicle_type}, ${v.capacity} seats`} title={v.plate_number ?? `Vehicle ${v.vehicle_id}`}>
        <span className="text-xs text-muted">{v.status}</span>
        <span className="text-xs text-muted">
          Position: {v.ext.position_source === "gps" ? "GPS" : v.ext.position_source === "estimated" ? "estimated from the trip plan" : "at base"}
        </span>
      </Head>
      <Rows
        rows={[
          ["Team", team?.name ?? "–"],
          ["Carrying", a ? `${fmtNum(a.people_count)} from ${a.zone_name}` : "–"],
          ["To", a?.shelter_name ?? "–"],
          ["Route", a?.route_label ?? "–"],
          ["All delivered in", eta != null ? fmtMinutes(eta) : "–"],
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ route */

const NEXT_ROUTE: Partial<Record<RouteStatus, RouteStatus[]>> = {
  Open: ["Congested", "Blocked"],
  Congested: ["Open", "Blocked"],
  Blocked: ["Cleared"],
  Flooded: ["Cleared"],
  Cleared: ["Open", "Blocked"],
};

function RouteDetail({ id }: { id: number }) {
  const r = useRoutes().data?.find((x) => x.route_id === id);
  const assignments = useAssignments().data ?? [];
  const { can } = useSession();
  const transition = useTransitionRoute();
  const [confirm, setConfirm] = useState<RouteStatus | null>(null);
  if (!r) return <p className="p-4 text-sm text-muted">Route not found.</p>;
  const using = assignments.filter((a) => a.route_id === id && (a.status === "Scheduled" || a.status === "In Progress"));
  return (
    <>
      <Head kicker={`Route R${r.route_id}`} title={`${r.source} → ${r.destination}`}>
        <RouteStatusBadge status={r.status} />
        <span className="text-xs text-muted">{r.ext.geometry_source === "osrm" ? "road geometry from OSRM" : "schematic corridor"}</span>
      </Head>
      <Rows
        rows={[
          ["Via", r.ext.via.join(", ") || "direct"],
          ["Distance", `${r.distance_km} km`],
          ["Free-flow time", fmtMinutes(r.travel_time)],
          ["Risk", r.risk_level],
          ["Groups using it", using.length ? `${using.length} (${fmtNum(using.reduce((n, a) => n + a.people_count, 0))} people)` : "none"],
        ]}
      />
      {can("route:status") ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          {(NEXT_ROUTE[r.status] ?? []).map((st) => (
            <Button key={st} size="sm" variant="secondary" onClick={() => setConfirm(st)}>
              {st === "Blocked" ? "Block" : st === "Congested" ? "Mark congested" : st === "Cleared" ? "Mark cleared" : "Mark open"}
            </Button>
          ))}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm != null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Set R${r.route_id} to ${confirm ?? ""}?`}
        description={
          confirm === "Blocked"
            ? `${using.length} group(s) on this road will be re-planned. The change is written to the audit log.`
            : "The change is written to the audit log."
        }
        confirmLabel="Change status"
        tone={confirm === "Blocked" ? "danger" : "default"}
        requireReason={confirm === "Blocked"}
        busy={transition.isPending}
        onConfirm={(reason) => {
          if (confirm) transition.mutate({ id, status: confirm, reason: reason || undefined }, { onSuccess: () => setConfirm(null) });
        }}
      />
    </>
  );
}

function summarizeVehicles(types: string[]): string {
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${n} ${t.toLowerCase()}${n > 1 ? (t === "Bus" ? "es" : "s") : ""}`).join(", ");
}
