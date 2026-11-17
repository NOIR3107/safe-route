import { Plus, Route as RouteIcon } from "lucide-react";
import { MapListLayout } from "@/components/layout/MapListLayout";
import type { MapSelection } from "@/components/map/mapStore";
import { useMemo, useState } from "react";
import { ROUTE_RISK_LEVELS, type RouteRiskLevel } from "@/api/schemas";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/common";
import { EntityFormDialog, type FieldSpec, type FormValues } from "@/components/EntityFormDialog";
import { RouteStatusBadge } from "@/components/status/badges";
import { TransitionMenu } from "@/components/TransitionMenu";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { useAssignments, useCreateRoute, useRoutes, useSegments, useShelters, useTransitionRoute, useZones } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import { ROUTE_STATUS } from "@/lib/semantic";
import { DISRUPTIVE_ROUTE, ROUTE_TRANSITIONS } from "@/lib/stateMachines";
import { fmtNum } from "@/lib/utils";

const RISK_TONE: Record<RouteRiskLevel, "ok" | "warn" | "caution" | "danger"> = { Low: "ok", Moderate: "warn", High: "caution", Severe: "danger" };

export function RoutesPage() {
  const [focus, setFocus] = useState<MapSelection>(null);
  const { data, isLoading, error, refetch } = useRoutes();
  const { data: assignments } = useAssignments();
  const { data: zones } = useZones();
  const { data: shelters } = useShelters();
  const { data: segments } = useSegments();
  const { can } = useSession();
  const transition = useTransitionRoute();
  const create = useCreateRoute();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [onlyUsed, setOnlyUsed] = useState(false);
  const [adding, setAdding] = useState(false);

  const usage = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of assignments ?? []) if (a.route_id != null && (a.status === "Scheduled" || a.status === "In Progress")) m.set(a.route_id, (m.get(a.route_id) ?? 0) + a.people_count);
    return m;
  }, [assignments]);

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((r) => (status === "all" ? true : r.status === status))
        .filter((r) => (onlyUsed ? usage.has(r.route_id) : true))
        .filter((r) => `R${r.route_id} ${r.source} ${r.destination} ${r.ext.via.join(" ")}`.toLowerCase().includes(q.toLowerCase())),
    [data, status, q, onlyUsed, usage],
  );

  const segmentNames = ["", ...(segments ?? []).map((s) => s.name)];
  const fields: FieldSpec[] = [
    { name: "zone", label: "From zone", type: "select", options: (zones ?? []).map((z) => z.name) },
    { name: "shelter", label: "To shelter", type: "select", options: (shelters ?? []).map((s) => s.name) },
    { name: "via1", label: "Through road or bridge (optional)", type: "select", options: segmentNames },
    { name: "via2", label: "Then through (optional)", type: "select", options: segmentNames },
    { name: "risk_level", label: "Risk level", type: "select", options: ROUTE_RISK_LEVELS },
    { name: "distance_km", label: "Distance (km)", type: "number", min: 0.1, step: 0.1, help: "Leave empty to estimate from the map" },
    { name: "travel_time", label: "Travel time (min)", type: "number", min: 0, help: "Leave empty to estimate" },
  ];

  const submit = (v: FormValues) => {
    const zone = zones?.find((z) => z.name === v.zone);
    const shelter = shelters?.find((s) => s.name === v.shelter);
    if (!zone || !shelter) return;
    create.mutate(
      {
        zone_id: zone.zone_id,
        shelter_id: shelter.shelter_id,
        via: [v.via1, v.via2].filter((x): x is string => !!x),
        risk_level: v.risk_level as RouteRiskLevel,
        status: "Open",
        ...(v.distance_km ? { distance_km: Number(v.distance_km) } : {}),
        ...(v.travel_time ? { travel_time: Number(v.travel_time) } : {}),
      },
      { onSuccess: () => setAdding(false) },
    );
  };

  return (
    <div>
      <PageHeader
        icon={RouteIcon}
        title="Routes"
        description="Road corridors and their status state machine Open → Congested → Blocked → Cleared (FR-04). Blocking a route in use re-plans only the groups on it."
        stats={
          data
            ? [
                { label: "Corridors", value: data.length },
                { label: "Open or cleared", value: data.filter((r) => r.status === "Open" || r.status === "Cleared").length, tone: "ok" },
                { label: "Congested", value: data.filter((r) => r.status === "Congested").length, tone: data.some((r) => r.status === "Congested") ? "warn" : undefined },
                { label: "Blocked or flooded", value: data.filter((r) => r.status === "Blocked" || r.status === "Flooded").length, tone: data.some((r) => r.status === "Blocked" || r.status === "Flooded") ? "danger" : undefined },
                { label: "People on routes", value: fmtNum([...usage.values()].reduce((a, b) => a + b, 0)), sub: "scheduled or moving" },
              ]
            : undefined
        }
        actions={
          can("route:write") ? (
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add route
            </Button>
          ) : null
        }
      />
      <MapListLayout focus={focus ?? undefined}>
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Input aria-label="Search routes" placeholder="Search route, place or bridge…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
            <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              <option value="all">All statuses</option>
              {(["Open", "Congested", "Blocked", "Flooded", "Cleared"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} className="accent-brand" />
              In use by the plan
            </label>
            <span className="ml-auto text-xs text-muted">{rows.length} routes</span>
          </div>
          {isLoading ? (
            <TableSkeleton cols={8} />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No routes match" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Route</TH>
                  <TH>From → To</TH>
                  <TH>Via</TH>
                  <TH className="text-right">Distance</TH>
                  <TH className="text-right">Time</TH>
                  <TH>Risk</TH>
                  <TH>Status</TH>
                  <TH className="text-right">People on it</TH>
                  {can("route:status") ? <TH><span className="sr-only">Actions</span></TH> : null}
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.route_id} data-testid={`route-row-${r.route_id}`} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setFocus({ kind: "route", id: r.route_id })}>
                    <TD className="font-mono text-xs">R{r.route_id}</TD>
                    <TD className="whitespace-nowrap">
                      {r.source} → {r.destination}
                    </TD>
                    <TD className="max-w-64 text-xs text-muted">{r.ext.via.join(" · ") || "direct"}</TD>
                    <TD className="text-right tabular-nums">{r.distance_km} km</TD>
                    <TD className="text-right tabular-nums">{r.travel_time} min</TD>
                    <TD>
                      <Badge tone={RISK_TONE[r.risk_level]}>{r.risk_level}</Badge>
                    </TD>
                    <TD>
                      <RouteStatusBadge status={r.status} />
                    </TD>
                    <TD className="text-right tabular-nums">{usage.get(r.route_id) ? fmtNum(usage.get(r.route_id)!) : <span className="text-muted">—</span>}</TD>
                    {can("route:status") ? (
                      <TD className="text-right">
                        <TransitionMenu
                          label="Status"
                          entityName={`route R${r.route_id}`}
                          options={ROUTE_TRANSITIONS[r.status]}
                          styles={ROUTE_STATUS}
                          disruptive={DISRUPTIVE_ROUTE}
                          busy={transition.isPending}
                          onTransition={(to, reason) => transition.mutate({ id: r.route_id, status: to, reason })}
                        />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </MapListLayout>
      <EntityFormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add route"
        description="Source must match a zone location and destination a shelter location (as in the backend allocation engine)."
        fields={fields}
        initial={{ source: zones?.[0]?.location ?? "", destination: shelters?.[0]?.location ?? "", distance_km: "5", travel_time: "15", risk_level: "Low" }}
        submitLabel="Add route"
        busy={create.isPending}
        onSubmit={submit}
      />
    </div>
  );
}
