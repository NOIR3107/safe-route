import { useIsMutating } from "@tanstack/react-query";
import { AlertOctagon, ChevronRight, GitCompare, ListChecks, RefreshCw, ShieldCheck, Play } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AssignmentView, StrategyId } from "@/api/extensions";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/common";
import { ApprovalBadge, AssignmentStatusBadge, SeverityBadge } from "@/components/status/badges";
import { Button } from "@/components/ui/button";
import { Card, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/overlay";
import { useApprove, useAssignments, useGeneratePlan, usePlan, useVehicles, useZones } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import { FACILITY_ICON } from "@/lib/semantic";
import { cn, fmtMinutes, fmtNum, fmtSim } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { ExplanationDrawer } from "./ExplanationDrawer";
import { STRATEGY_LABEL } from "@/lib/labels";
import { StrategyComparisonPanel } from "./StrategyComparison";

export function PlanPage() {
  const { can } = useSession();
  const { data: plan, isLoading: planLoading } = usePlan();
  const { data: assignments, isLoading, error, refetch } = useAssignments();
  const { data: vehicles } = useVehicles();
  const { data: zones } = useZones();
  const strategy = useUiStore((s) => s.strategy);
  const setStrategy = useUiStore((s) => s.setStrategy);
  const generate = useGeneratePlan();
  const approve = useApprove();
  const busy = useIsMutating() > 0; // e.g. a re-plan is still running: wait for the new version
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [q, setQ] = useState("");

  const version = plan?.current_version ?? null;
  const rows = useMemo(() => {
    const list = (assignments ?? []).filter((a) => {
      if (zoneFilter !== "all" && String(a.zone_id) !== zoneFilter) return false;
      if (statusFilter === "active" && a.status === "Completed") return false;
      if (statusFilter !== "all" && statusFilter !== "active" && a.status !== statusFilter) return false;
      if (q && !`${a.zone_name} ${a.shelter_name} ${a.route_label ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    return list.sort((x, y) => y.severity - x.severity || x.ext.eta_minutes - y.ext.eta_minutes);
  }, [assignments, zoneFilter, statusFilter, q]);
  const selectedAssignment = assignments?.find((a) => a.assignment_id === selected) ?? null;

  const vehicleLabel = (a: AssignmentView) => {
    if (a.ext.vehicle_ids.length === 0) return "On foot";
    const types = a.ext.vehicle_ids.map((id) => vehicles?.find((v) => v.vehicle_id === id)?.vehicle_type ?? "Vehicle");
    const counts = types.reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {});
    return Object.entries(counts)
      .map(([t, n]) => `${n}× ${t}`)
      .join(", ");
  };

  const strategyToggle = (
    <div role="radiogroup" aria-label="Allocation strategy" className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
      {(["greedy", "min-cost-flow"] as StrategyId[]).map((s) => (
        <button
          key={s}
          role="radio"
          aria-checked={strategy === s}
          onClick={() => setStrategy(s)}
          className={cn("cursor-pointer rounded-md px-3 py-1 text-xs font-medium", strategy === s ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
        >
          {STRATEGY_LABEL[s]}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        icon={ListChecks}
        title="Allocation Plan"
        description={
          version ? (
            <>
              Plan v{version.version} · {STRATEGY_LABEL[version.strategy]} · {version.trigger.description} · {fmtSim(version.sim_minute)}
            </>
          ) : (
            "Zone → shelter assignments proposed by the allocation engine"
          )
        }
        actions={
          <>
            {strategyToggle}
            <Button variant="secondary" onClick={() => setCompare((c) => !c)} aria-pressed={compare}>
              <GitCompare /> {compare ? "Hide comparison" : "Compare strategies"}
            </Button>
            {can("plan:generate") ? (
              <Button onClick={() => generate.mutate(strategy)} disabled={generate.isPending} data-testid="generate-plan">
                {plan ? <RefreshCw /> : <Play />}
                {generate.isPending ? "Working…" : plan ? `Re-plan (${STRATEGY_LABEL[strategy]})` : "Generate plan"}
              </Button>
            ) : null}
            {version?.status === "Proposed" && can("plan:approve") ? (
              <Button variant="success" onClick={() => approve.mutate(version.version)} disabled={busy}>
                <ShieldCheck /> Approve v{version.version}
              </Button>
            ) : null}
          </>
        }
      />
      <div className="space-y-4 p-4 sm:p-6">
        {version ? (
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface md:grid-cols-5 [&>*]:border-border max-md:[&>*:nth-child(odd)]:border-r max-md:[&>*:nth-child(-n+4)]:border-b md:[&>*:not(:last-child)]:border-r">
            <Summary label="Status" value={<ApprovalBadge state={version.status === "Approved" ? "Approved" : "Proposed"} />} />
            <Summary label="People allocated" value={fmtNum(version.metrics.people_allocated)} />
            <Summary label="Unallocated" value={fmtNum(version.metrics.people_unallocated)} danger={version.metrics.people_unallocated > 0} />
            <Summary label="Avg / worst arrival" value={`${fmtMinutes(version.metrics.avg_eta)} / ${fmtMinutes(version.metrics.worst_eta)}`} />
            <Summary label="Assignments · vehicles" value={`${version.metrics.assignments} · ${version.metrics.vehicles_used}`} />
          </div>
        ) : null}

        <StrategyComparisonPanel enabled={compare} />

        {version && version.unallocated.length > 0 ? (
          <Card className="border-danger/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger-fg">
              <AlertOctagon className="size-4" aria-hidden /> {fmtNum(version.metrics.people_unallocated)} people could not be allocated
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-muted">
              {version.unallocated.map((u, i) => (
                <li key={i}>
                  {zones?.find((z) => z.zone_id === u.zone_id)?.name ?? `Zone ${u.zone_id}`}: {fmtNum(u.people)} people – {u.reason}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Input aria-label="Search assignments" placeholder="Search zone, shelter, route…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
            <Select aria-label="Filter by zone" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="w-44">
              <option value="all">All zones</option>
              {zones?.map((z) => (
                <option key={z.zone_id} value={z.zone_id}>
                  {z.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
              <option value="active">Active (not arrived)</option>
              <option value="all">All</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">En route</option>
              <option value="Completed">Arrived</option>
            </Select>
            <span className="ml-auto text-xs text-muted">{rows.length} assignments · click a row for “Why this shelter?”</span>
          </div>
          {isLoading || planLoading ? (
            <TableSkeleton cols={7} />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : !plan ? (
            <EmptyState
              icon={ListChecks}
              title="No plan generated yet"
              action={
                can("plan:generate") ? (
                  <Button onClick={() => generate.mutate(strategy)} disabled={generate.isPending}>
                    <Play /> Generate plan
                  </Button>
                ) : undefined
              }
            >
              The engine ranks zones by priority, removes infeasible shelters (blocked routes, missing facilities, no capacity) and proposes the lowest-cost assignment.
            </EmptyState>
          ) : rows.length === 0 ? (
            <EmptyState title="No assignments match these filters" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Zone</TH>
                  <TH>Shelter</TH>
                  <TH className="text-right">People</TH>
                  <TH>Needs</TH>
                  <TH>Vehicles</TH>
                  <TH>Route</TH>
                  <TH className="text-right">ETA</TH>
                  <TH>Status</TH>
                  <TH>Approval</TH>
                  <TH>
                    <span className="sr-only">Explain</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((a) => (
                  <TR
                    key={a.assignment_id}
                    className="cursor-pointer hover:bg-surface-2/70 focus-within:bg-surface-2/70"
                    onClick={() => setSelected(a.assignment_id)}
                    data-testid="assignment-row"
                  >
                    <TD>
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={a.severity} compact />
                        <span className="font-medium">{a.zone_name}</span>
                      </div>
                    </TD>
                    <TD>{a.shelter_name}</TD>
                    <TD className="text-right tabular-nums">
                      {fmtNum(a.people_count)}
                      <span className="block text-xs text-muted">{a.ext.household_ids.length} hh</span>
                    </TD>
                    <TD>
                      <div className="flex gap-1">
                        {a.ext.explanation.required_facilities.map((f) => {
                          const Icon = FACILITY_ICON[f];
                          return (
                            <Tooltip key={f} content={`Requires ${f.toLowerCase()}`}>
                              <span className="inline-flex size-6 items-center justify-center rounded-md border border-violet/40 bg-violet/10 text-violet-fg" role="img" aria-label={`Requires ${f}`}>
                                <Icon className="size-3.5" />
                              </span>
                            </Tooltip>
                          );
                        })}
                        {a.ext.explanation.required_facilities.length === 0 ? <span className="text-xs text-muted">General</span> : null}
                      </div>
                    </TD>
                    <TD className="text-xs">{vehicleLabel(a)}</TD>
                    <TD className="max-w-48 truncate text-xs text-muted" title={a.route_label ?? ""}>
                      {a.route_label}
                    </TD>
                    <TD className="text-right tabular-nums whitespace-nowrap">
                      {fmtMinutes(a.ext.eta_minutes)}
                      <span className="block text-xs text-muted">{fmtSim(a.ext.dispatch_minute + a.ext.eta_minutes)}</span>
                    </TD>
                    <TD>
                      <AssignmentStatusBadge status={a.status} />
                    </TD>
                    <TD>
                      <ApprovalBadge state={a.ext.approval} />
                    </TD>
                    <TD>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Why ${a.shelter_name} for ${a.zone_name}?`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(a.assignment_id);
                        }}
                      >
                        Why <ChevronRight />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        {plan && plan.versions.length > 1 ? (
          <p className="text-sm text-muted">
            This plan has {plan.versions.length} versions.{" "}
            <Link to="/plan/versions" className="underline decoration-fg/30 underline-offset-4 transition-colors hover:decoration-fg">
              See what changed and why →
            </Link>
          </p>
        ) : null}
      </div>
      <ExplanationDrawer assignment={selectedAssignment} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

/** One cell of the summary strip above the table: a single bordered row split by rules, not five cards. */
function Summary({ label, value, danger }: { label: string; value: ReactNode; danger?: boolean }) {
  return (
    <div className={cn("min-w-0 px-4 py-3", danger && "bg-danger/8")}>
      <p className="truncate text-xs text-muted">{label}</p>
      <div className={cn("mt-1 truncate text-[15px] font-semibold tabular-nums", danger && "text-danger-fg")}>{value}</div>
    </div>
  );
}

