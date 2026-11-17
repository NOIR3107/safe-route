import { Ambulance, Boxes, Bus, Plus, Ship, Truck, Users, Car, type LucideIcon } from "lucide-react";
import { MapListLayout } from "@/components/layout/MapListLayout";
import { useMapStore } from "@/components/map/mapStore";
import { useMemo, useState } from "react";
import { TEAM_STATUSES, VEHICLE_TYPES, type TeamStatus, type Vehicle, type VehicleStatus } from "@/api/schemas";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/common";
import { EntityFormDialog, type FieldSpec, type FormValues } from "@/components/EntityFormDialog";
import { VehicleStatusBadge } from "@/components/status/badges";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { Badge, Card, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { useCreateTeam, useCreateVehicle, useResources, useTeams, useUpdateTeam, useUpdateVehicle, useVehicles } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import { fmtNum } from "@/lib/utils";

const TYPE_ICON: Record<Vehicle["vehicle_type"], LucideIcon> = { Bus, Ambulance, Truck, Boat: Ship, Van: Car };
const VEHICLE_FIELDS: FieldSpec[] = [
  { name: "vehicle_type", label: "Type", type: "select", options: VEHICLE_TYPES },
  { name: "capacity", label: "Seats", type: "number", min: 1, required: true },
  { name: "plate_number", label: "Plate / call sign" },
  { name: "current_location", label: "Depot / location", required: true },
];
const TEAM_FIELDS: FieldSpec[] = [
  { name: "name", label: "Team name", required: true, colSpan: 2 },
  { name: "members_count", label: "Members", type: "number", min: 1, required: true },
  { name: "contact_number", label: "Contact number", required: true },
  { name: "current_location", label: "Location" },
  { name: "status", label: "Status", type: "select", options: TEAM_STATUSES },
];

export function FleetPage() {
  const focus = useMapStore((st) => st.selection);
  const { data: vehicles } = useVehicles();
  const { data: teams } = useTeams();
  const count = (s: VehicleStatus) => (vehicles ?? []).filter((v) => v.status === s).length;
  const moving = count("Assigned") + count("In Transit");
  return (
    <div>
      <PageHeader
        icon={Bus}
        title="Vehicles & Rescue Teams"
        description="Capacity, type, location and availability (FR-05). Vehicles in transit are shown live on the dashboard map."
        stats={
          vehicles
            ? [
                { label: "Vehicles", value: vehicles.length, sub: `${fmtNum(vehicles.reduce((n, v) => n + v.capacity, 0))} seats` },
                { label: "Available", value: count("Available"), tone: count("Available") === 0 ? "danger" : undefined },
                { label: "Assigned or moving", value: moving },
                { label: "Maintenance", value: count("Maintenance"), tone: count("Maintenance") > 0 ? "warn" : undefined },
                { label: "Rescue teams", value: teams?.length ?? "–", sub: teams ? `${teams.filter((t) => t.status === "Available").length} available` : undefined },
              ]
            : undefined
        }
      />
      <MapListLayout focus={focus ?? undefined}>
        <Tabs defaultValue="vehicles">
          <TabsList aria-label="Fleet sections">
            <TabsTrigger value="vehicles">
              <Bus /> Vehicles
            </TabsTrigger>
            <TabsTrigger value="teams">
              <Users /> Rescue teams
            </TabsTrigger>
            <TabsTrigger value="resources">
              <Boxes /> Relief resources
            </TabsTrigger>
          </TabsList>
          <TabsContent value="vehicles" className="mt-4">
            <VehiclesTab />
          </TabsContent>
          <TabsContent value="teams" className="mt-4">
            <TeamsTab />
          </TabsContent>
          <TabsContent value="resources" className="mt-4">
            <ResourcesTab />
          </TabsContent>
        </Tabs>
      </MapListLayout>
    </div>
  );
}

function VehiclesTab() {
  const { data, isLoading, error, refetch } = useVehicles();
  const { data: teams } = useTeams();
  const { can } = useSession();
  const update = useUpdateVehicle();
  const create = useCreateVehicle();
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((v) => (type === "all" ? true : v.vehicle_type === type))
        .filter((v) => (status === "all" ? true : v.status === status))
        .filter((v) => `${v.plate_number ?? ""} ${v.current_location}`.toLowerCase().includes(q.toLowerCase())),
    [data, type, status, q],
  );
  const seats = rows.reduce((s, v) => s + v.capacity, 0);
  const submit = (v: FormValues) =>
    create.mutate(
      { vehicle_type: v.vehicle_type as Vehicle["vehicle_type"], capacity: Number(v.capacity), status: "Available", current_location: v.current_location!, plate_number: v.plate_number || null },
      { onSuccess: () => setAdding(false) },
    );

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Input aria-label="Search vehicles" placeholder="Plate or location…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
        <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className="w-36">
          <option value="all">All types</option>
          {VEHICLE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="all">All statuses</option>
          {(["Available", "Assigned", "In Transit", "Maintenance"] as const).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <span className="ml-auto text-xs text-muted">
          {rows.length} vehicles · {fmtNum(seats)} seats
        </span>
        {can("vehicle:write") ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add vehicle
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No vehicles match" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Vehicle</TH>
              <TH className="text-right">Seats</TH>
              <TH>Status</TH>
              <TH>Team</TH>
              <TH>Location</TH>
              <TH>Assignment</TH>
              {can("vehicle:status") ? <TH><span className="sr-only">Actions</span></TH> : null}
            </TR>
          </THead>
          <TBody>
            {rows.map((v) => {
              const Icon = TYPE_ICON[v.vehicle_type];
              const next: VehicleStatus | null = v.status === "Available" ? "Maintenance" : v.status === "Maintenance" ? "Available" : null;
              return (
                <TR key={v.vehicle_id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => useMapStore.getState().select({ kind: "vehicle", id: v.vehicle_id })}>
                  <TD>
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 text-muted" aria-hidden />
                      <span>
                        <span className="font-medium">{v.vehicle_type}</span> <span className="font-mono text-xs text-muted">{v.plate_number}</span>
                      </span>
                    </span>
                  </TD>
                  <TD className="text-right tabular-nums">{v.capacity}</TD>
                  <TD>
                    <VehicleStatusBadge status={v.status} />
                  </TD>
                  <TD className="text-xs">{teams?.find((t) => t.team_id === v.ext.team_id)?.name ?? "—"}</TD>
                  <TD className="text-xs text-muted">{v.current_location}</TD>
                  <TD className="text-xs">{v.assignment_id ? `#${v.assignment_id}` : "—"}</TD>
                  {can("vehicle:status") ? (
                    <TD className="text-right">
                      {next ? (
                        <Button variant="outline" size="sm" disabled={update.isPending} onClick={() => update.mutate({ id: v.vehicle_id, body: { status: next } })}>
                          {next === "Maintenance" ? "Send to maintenance" : "Mark available"}
                        </Button>
                      ) : null}
                    </TD>
                  ) : null}
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <EntityFormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add vehicle"
        fields={VEHICLE_FIELDS}
        initial={{ vehicle_type: "Bus", capacity: "60", plate_number: "", current_location: "Guindy Fire Station" }}
        submitLabel="Add"
        busy={create.isPending}
        onSubmit={submit}
      />
    </Card>
  );
}

function TeamsTab() {
  const { data, isLoading, error, refetch } = useTeams();
  const { can } = useSession();
  const update = useUpdateTeam();
  const create = useCreateTeam();
  const [adding, setAdding] = useState(false);
  const submit = (v: FormValues) =>
    create.mutate(
      { name: v.name!, members_count: Number(v.members_count), contact_number: v.contact_number!, status: v.status as TeamStatus, current_location: v.current_location || null },
      { onSuccess: () => setAdding(false) },
    );
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-xs text-muted">{data?.length ?? 0} teams</span>
        {can("team:write") ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add team
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <TableSkeleton cols={5} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Team</TH>
              <TH className="text-right">Members</TH>
              <TH>Contact</TH>
              <TH>Location</TH>
              <TH className="text-right">Vehicles</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((t) => (
              <TR key={t.team_id}>
                <TD className="font-medium">{t.name}</TD>
                <TD className="text-right tabular-nums">{t.members_count}</TD>
                <TD className="font-mono text-xs">{t.contact_number}</TD>
                <TD className="text-xs text-muted">{t.current_location}</TD>
                <TD className="text-right tabular-nums">{t.vehicle_ids.length}</TD>
                <TD>
                  {can("team:status") ? (
                    <Select
                      aria-label={`Status of ${t.name}`}
                      value={t.status}
                      onChange={(e) => update.mutate({ id: t.team_id, body: { status: e.target.value as TeamStatus } })}
                      className="h-8 w-32 text-xs"
                    >
                      {TEAM_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={t.status === "Deployed" ? "warn" : t.status === "Available" ? "ok" : "neutral"}>{t.status}</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <EntityFormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add rescue team"
        fields={TEAM_FIELDS}
        initial={{ name: "", members_count: "6", contact_number: "", current_location: "", status: "Standby" }}
        submitLabel="Add"
        busy={create.isPending}
        onSubmit={submit}
      />
    </Card>
  );
}

function ResourcesTab() {
  const { data, isLoading, error, refetch } = useResources();
  if (isLoading) return <TableSkeleton cols={4} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Resource</TH>
            <TH className="text-right">Quantity</TH>
            <TH>Availability</TH>
            <TH>Location</TH>
          </TR>
        </THead>
        <TBody>
          {(data ?? []).map((r) => (
            <TR key={r.resource_id}>
              <TD className="font-medium">{r.resource_type}</TD>
              <TD className="text-right tabular-nums">{fmtNum(r.quantity)}</TD>
              <TD>
                <Badge tone={r.availability === "Available" ? "ok" : r.availability === "Low Stock" ? "warn" : "danger"}>{r.availability}</Badge>
              </TD>
              <TD className="text-xs text-muted">{r.location}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
