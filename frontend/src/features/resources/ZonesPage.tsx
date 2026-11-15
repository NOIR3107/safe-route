import { Accessibility, Baby, HeartPulse, Map as MapIcon, Pencil, PersonStanding, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { ZoneView } from "@/api/extensions";
import { ZONE_PRIORITIES, ZONE_RISK_LEVELS, type ZonePriority, type ZoneRiskLevel } from "@/api/schemas";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/common";
import { EntityFormDialog, type FieldSpec, type FormValues } from "@/components/EntityFormDialog";
import { SeverityBadge } from "@/components/status/badges";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlay";
import { Badge, Card, Input, Progress, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { useCreateZone, useDisasters, useUpdateZone, useZones } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import { fmtNum, fmtPct } from "@/lib/utils";

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Zone name", required: true },
  { name: "location", label: "Location (matches route source)", required: true },
  { name: "population", label: "Population needing evacuation", type: "number", min: 0, required: true },
  { name: "priority", label: "Priority", type: "select", options: ZONE_PRIORITIES },
  { name: "risk_level", label: "Risk level", type: "select", options: ZONE_RISK_LEVELS, help: "Sets the 1–5 severity used in the cost function." },
];

export function ZonesPage() {
  const { data, isLoading, error, refetch } = useZones();
  const { data: disasters } = useDisasters();
  const { can } = useSession();
  const create = useCreateZone();
  const update = useUpdateZone();
  const [q, setQ] = useState("");
  const [sev, setSev] = useState("all");
  const [editing, setEditing] = useState<ZoneView | "new" | null>(null);

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((z) => (sev === "all" ? true : String(z.ext.severity) === sev))
        .filter((z) => `${z.name} ${z.ext.code} ${z.location}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.ext.severity - a.ext.severity || a.name.localeCompare(b.name)),
    [data, q, sev],
  );

  const submit = (v: FormValues) => {
    const body = {
      name: v.name!.trim(),
      location: v.location!.trim(),
      population: Number(v.population),
      priority: v.priority as ZonePriority,
      risk_level: v.risk_level as ZoneRiskLevel,
    };
    if (editing === "new") {
      create.mutate({ ...body, disaster_id: disasters?.[0]?.disaster_id ?? 1, state: "Tamil Nadu", district: "Chennai" }, { onSuccess: () => setEditing(null) });
    } else if (editing) {
      update.mutate({ id: editing.zone_id, body }, { onSuccess: () => setEditing(null) });
    }
  };

  return (
    <div>
      <PageHeader
        icon={MapIcon}
        title="Affected Zones"
        description="Severity, population, vulnerable groups and households (FR-02)."
        actions={
          can("zone:write") ? (
            <Button onClick={() => setEditing("new")}>
              <Plus /> Register zone
            </Button>
          ) : null
        }
      />
      <div className="p-4 sm:p-6">
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Input aria-label="Search zones" placeholder="Search name or code…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
            <Select aria-label="Filter by severity" value={sev} onChange={(e) => setSev(e.target.value)} className="w-40">
              <option value="all">All severities</option>
              {[5, 4, 3, 2, 1].map((s) => (
                <option key={s} value={s}>
                  Severity {s}
                </option>
              ))}
            </Select>
            <span className="ml-auto text-xs text-muted">{rows.length} zones</span>
          </div>
          {isLoading ? (
            <TableSkeleton cols={8} />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No zones match" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Zone</TH>
                  <TH>Severity</TH>
                  <TH>Priority · risk</TH>
                  <TH className="text-right">Population</TH>
                  <TH className="w-44">Evacuated</TH>
                  <TH>Vulnerable</TH>
                  <TH className="text-right">Households</TH>
                  <TH>Status</TH>
                  {can("zone:write") ? <TH><span className="sr-only">Actions</span></TH> : null}
                </TR>
              </THead>
              <TBody>
                {rows.map((z) => {
                  const done = z.population > 0 ? z.evacuated_count / z.population : 0;
                  return (
                    <TR key={z.zone_id}>
                      <TD>
                        <p className="font-medium">{z.name}</p>
                        <p className="font-mono text-xs text-muted">{z.ext.code}</p>
                      </TD>
                      <TD>
                        <SeverityBadge severity={z.ext.severity} />
                      </TD>
                      <TD className="text-xs">
                        {z.priority} · {z.risk_level}
                      </TD>
                      <TD className="text-right tabular-nums">{fmtNum(z.population)}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Progress value={done} tone="ok" label={`${z.name} evacuated`} className="flex-1" />
                          <span className="w-10 text-right text-xs tabular-nums">{fmtPct(done)}</span>
                        </div>
                      </TD>
                      <TD>
                        <div className="flex gap-2 text-xs">
                          <Vuln icon={PersonStanding} n={z.vulnerable.elderly} label="Elderly" />
                          <Vuln icon={Baby} n={z.vulnerable.children} label="Children" />
                          <Vuln icon={Accessibility} n={z.vulnerable.disabled} label="Disabled" />
                          <Vuln icon={HeartPulse} n={z.vulnerable.medical} label="Medical patients" />
                        </div>
                      </TD>
                      <TD className="text-right tabular-nums">{fmtNum(z.household_count)}</TD>
                      <TD>
                        <Badge tone={z.status === "Evacuated" ? "ok" : z.status === "Pending" ? "neutral" : "warn"}>{z.status}</Badge>
                      </TD>
                      {can("zone:write") ? (
                        <TD>
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${z.name}`} onClick={() => setEditing(z)}>
                            <Pencil />
                          </Button>
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
        <p className="mt-3 text-xs text-muted">Households are always kept together: the engine never splits a household across shelters or vehicles.</p>
      </div>
      <EntityFormDialog
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Register affected zone" : `Edit ${editing?.name ?? "zone"}`}
        fields={FIELDS}
        initial={
          editing && editing !== "new"
            ? { name: editing.name, location: editing.location, population: String(editing.population), priority: editing.priority, risk_level: editing.risk_level }
            : { name: "", location: "", population: "100", priority: "P2", risk_level: "High" }
        }
        submitLabel={editing === "new" ? "Register" : "Save"}
        busy={create.isPending || update.isPending}
        onSubmit={submit}
      />
    </div>
  );
}

function Vuln({ icon: Icon, n, label }: { icon: typeof Baby; n: number; label: string }) {
  return (
    <Tooltip content={`${label}: ${n}`}>
      <span className="inline-flex items-center gap-0.5 text-muted" aria-label={`${label}: ${n}`}>
        <Icon className="size-3.5" aria-hidden />
        <span className="tabular-nums text-fg">{n}</span>
      </span>
    </Tooltip>
  );
}
