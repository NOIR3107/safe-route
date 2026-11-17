import { Building2, Pencil, Plus } from "lucide-react";
import { EmbeddedMap } from "@/components/map/EmbeddedMap";
import type { MapSelection } from "@/components/map/mapStore";
import { useMemo, useState } from "react";
import { FACILITIES, type Facility, type ShelterView } from "@/api/extensions";
import type { ShelterStatus } from "@/api/schemas";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/common";
import { EntityFormDialog, type FieldSpec, type FormValues } from "@/components/EntityFormDialog";
import { FacilityIcons, ShelterStatusBadge } from "@/components/status/badges";
import { TransitionMenu } from "@/components/TransitionMenu";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Progress, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { useCreateShelter, useShelters, useTransitionShelter, useUpdateShelter } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import { occupancyTone, type StatusStyle } from "@/lib/semantic";
import { SHELTER_STATUS } from "@/lib/semantic";
import { DISRUPTIVE_SHELTER, SHELTER_TRANSITIONS } from "@/lib/stateMachines";
import { fmtNum, fmtPct } from "@/lib/utils";

// Backend status to badge style. "Active" shows as Open or Near Full depending on how full it is.
const BACKEND_STYLE: Record<ShelterStatus, StatusStyle> = {
  Active: { ...SHELTER_STATUS.Open, label: "Open (accepting)" },
  Full: SHELTER_STATUS.Full,
  Closed: SHELTER_STATUS.Closed,
  Inactive: { ...SHELTER_STATUS.Closed, label: "Inactive" },
};

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", required: true, colSpan: 2 },
  { name: "location", label: "Location (matches route destination)", required: true },
  { name: "capacity", label: "Total capacity", type: "number", min: 1, required: true },
  { name: "current_occupancy", label: "Current occupancy", type: "number", min: 0, required: true },
  { name: "facilities", label: "Facilities (comma-separated)", colSpan: 2, help: `Any of: ${FACILITIES.join(", ")}` },
  { name: "latitude", label: "Latitude", type: "number", step: 0.0001 },
  { name: "longitude", label: "Longitude", type: "number", step: 0.0001 },
];

export function SheltersPage() {
  const [focus, setFocus] = useState<MapSelection>(null);
  const { data, isLoading, error, refetch } = useShelters();
  const { can, user } = useSession();
  const create = useCreateShelter();
  const update = useUpdateShelter();
  const transition = useTransitionShelter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<ShelterView | "new" | null>(null);
  const scoped = user?.role === "Shelter Manager";

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((s) => (status === "all" ? true : s.display_status === status))
        .filter((s) => `${s.name} ${s.location}`.toLowerCase().includes(q.toLowerCase())),
    [data, q, status],
  );

  const submit = (v: FormValues) => {
    const body = {
      name: v.name!.trim(),
      location: v.location!.trim(),
      capacity: Number(v.capacity),
      current_occupancy: Number(v.current_occupancy),
      facilities: v.facilities ?? "",
      latitude: v.latitude ? Number(v.latitude) : null,
      longitude: v.longitude ? Number(v.longitude) : null,
    };
    if (editing === "new") create.mutate(body, { onSuccess: () => setEditing(null) });
    else if (editing) update.mutate({ id: editing.shelter_id, body }, { onSuccess: () => setEditing(null) });
  };

  return (
    <div>
      <PageHeader
        icon={Building2}
        title={scoped ? "My Shelter" : "Shelters"}
        description={
          scoped
            ? "Shelter Managers can view and edit only their own shelter (RBAC scope)."
            : "Total, reserved (10% walk-in buffer) and available capacity; facilities; status state machine Open → Near Full → Full → Closed (FR-03)."
        }
        actions={
          can("shelter:write") && !scoped ? (
            <Button onClick={() => setEditing("new")}>
              <Plus /> Register shelter
            </Button>
          ) : null
        }
      />
      <div className="space-y-4 p-4 sm:p-6">
        <EmbeddedMap focus={focus ?? undefined} />
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Input aria-label="Search shelters" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
            <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              <option value="all">All statuses</option>
              {(["Open", "Near Full", "Full", "Closed"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            {scoped ? <Badge tone="info">Scoped to shelter #{user?.scope.shelter_id}</Badge> : null}
            <span className="ml-auto text-xs text-muted">{rows.length} shelters</span>
          </div>
          {isLoading ? (
            <TableSkeleton cols={7} />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No shelters match" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Shelter</TH>
                  <TH>Status</TH>
                  <TH className="w-56">Occupancy (present + inbound)</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Reserved</TH>
                  <TH className="text-right">Available</TH>
                  <TH>Facilities</TH>
                  {can("shelter:write") ? <TH><span className="sr-only">Actions</span></TH> : null}
                </TR>
              </THead>
              <TBody>
                {rows.map((s) => {
                  const load = (s.current_occupancy + s.inbound) / s.capacity;
                  const listed = (s.facilities ?? "").split(",").map((f) => f.trim()).filter((f): f is Facility => (FACILITIES as readonly string[]).includes(f));
                  return (
                    <TR key={s.shelter_id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setFocus({ kind: "shelter", id: s.shelter_id })}>
                      <TD>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted">
                          #{s.shelter_id} · {s.location}
                        </p>
                      </TD>
                      <TD>
                        <ShelterStatusBadge status={s.display_status} />
                      </TD>
                      <TD>
                        <Progress value={load} tone={s.display_status === "Closed" ? "neutral" : occupancyTone(load)} label={`${s.name} load`} />
                        <p className="mt-1 text-xs tabular-nums text-muted">
                          {fmtNum(s.current_occupancy)} + {fmtNum(s.inbound)} inbound · {fmtPct(load)}
                        </p>
                      </TD>
                      <TD className="text-right tabular-nums">{fmtNum(s.capacity)}</TD>
                      <TD className="text-right tabular-nums text-muted">
                        {fmtNum(s.reserved)}
                        {s.ext.walk_ins > 0 ? <span className="block text-xs">{fmtNum(s.ext.walk_ins)} walk-ins</span> : null}
                      </TD>
                      <TD className="text-right font-medium tabular-nums">{fmtNum(s.available)}</TD>
                      <TD>
                        <FacilityIcons available={s.available_facilities} listed={listed} />
                      </TD>
                      {can("shelter:write") ? (
                        <TD>
                          <div className="flex justify-end gap-1">
                            <TransitionMenu
                              label="Status"
                              entityName={s.name}
                              options={SHELTER_TRANSITIONS[s.status]}
                              styles={BACKEND_STYLE}
                              disruptive={DISRUPTIVE_SHELTER}
                              busy={transition.isPending}
                              onTransition={(to, reason) => transition.mutate({ id: s.shelter_id, status: to, reason })}
                            />
                            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                              <Pencil />
                            </Button>
                          </div>
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
      <EntityFormDialog
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Register shelter" : "Edit shelter"}
        fields={FIELDS}
        initial={
          editing && editing !== "new"
            ? {
                name: editing.name,
                location: editing.location,
                capacity: String(editing.capacity),
                current_occupancy: String(editing.current_occupancy),
                facilities: editing.facilities ?? "",
                latitude: editing.latitude != null ? String(editing.latitude) : "",
                longitude: editing.longitude != null ? String(editing.longitude) : "",
              }
            : { name: "", location: "", capacity: "500", current_occupancy: "0", facilities: "Power,Water,Food,Bedding", latitude: "", longitude: "" }
        }
        submitLabel={editing === "new" ? "Register" : "Save"}
        busy={create.isPending || update.isPending}
        onSubmit={submit}
      />
    </div>
  );
}
