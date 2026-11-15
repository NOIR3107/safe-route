import { AlertOctagon, ArrowRight, Construction, DoorClosed, History, PlugZap, RefreshCw, Sparkles, Undo2, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { DiffMove, PlanMetrics, PlanVersion, ReplanTrigger } from "@/api/extensions";
import { EmptyState, ErrorState, PageHeader } from "@/components/common";
import { ApprovalBadge } from "@/components/status/badges";
import { Badge, Card, Skeleton } from "@/components/ui/primitives";
import { usePlan, useZones } from "@/hooks/queries";
import { cn, fmtMinutes, fmtNum, fmtSim, signed } from "@/lib/utils";
import type { Tone } from "@/lib/semantic";
import { STRATEGY_LABEL } from "@/lib/labels";

const TRIGGER: Record<ReplanTrigger["type"], { icon: LucideIcon; tone: Tone; label: string }> = {
  Initial: { icon: Sparkles, tone: "info", label: "Initial plan" },
  Regenerate: { icon: RefreshCw, tone: "info", label: "Re-optimised" },
  RouteBlocked: { icon: Construction, tone: "danger", label: "Route blocked" },
  ShelterFull: { icon: Users, tone: "warn", label: "Shelter full" },
  ShelterClosed: { icon: DoorClosed, tone: "danger", label: "Shelter closed" },
  FacilityLost: { icon: PlugZap, tone: "caution", label: "Facility lost" },
  Override: { icon: Undo2, tone: "violet", label: "Manual override" },
};

export function VersionsPage() {
  const { data: plan, isLoading, error, refetch } = usePlan();
  const versions = plan?.versions ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const current = versions.find((v) => v.version === selected) ?? versions[versions.length - 1] ?? null;
  const previous = current ? (versions.find((v) => v.version === current.version - 1) ?? null) : null;

  return (
    <div>
      <PageHeader icon={History} title="Plan Versions" description="Every re-plan creates a new version. Only affected assignments change; the diff shows who moved, why, and the time impact." />
      <div className="p-4 sm:p-6">
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : versions.length === 0 ? (
          <EmptyState icon={History} title="No plan versions yet">
            Generate a plan, then start a drill or block a route to see re-planning.
          </EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <nav aria-label="Version timeline">
              <ol className="relative space-y-2 border-l border-border pl-5">
                {[...versions].reverse().map((v) => {
                  const t = TRIGGER[v.trigger.type];
                  const active = current?.version === v.version;
                  return (
                    <li key={v.version} className="relative">
                      <span className={cn("absolute -left-[29px] top-3 flex size-4 items-center justify-center rounded-full border-2 border-bg", active ? "bg-accent" : "bg-border")} aria-hidden />
                      <button
                        onClick={() => setSelected(v.version)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "w-full cursor-pointer rounded-lg border p-3 text-left transition-colors",
                          active ? "border-accent/60 bg-accent/10" : "border-border bg-surface hover:bg-surface-2",
                        )}
                        data-testid="version-item"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">v{v.version}</span>
                          <span className="font-mono text-xs text-muted">{fmtSim(v.sim_minute)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone={t.tone}>
                            <t.icon /> {t.label}
                          </Badge>
                          {v.status === "Approved" ? <ApprovalBadge state="Approved" /> : v.status === "Proposed" ? <ApprovalBadge state="Proposed" /> : <Badge tone="neutral">Superseded</Badge>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted">{v.trigger.description}</p>
                        {v.diff ? (
                          <p className="mt-1 text-xs">
                            <span className="font-medium">{fmtNum(v.diff.people_moved + v.diff.newly_allocated)}</span> re-assigned ·{" "}
                            <span className={cn(v.diff.avg_eta_delta > 0 ? "text-danger-fg" : "text-ok-fg")}>{signed(v.diff.avg_eta_delta, " min")}</span>
                          </p>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
            {current ? <VersionDetail v={current} prev={previous} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function VersionDetail({ v, prev }: { v: PlanVersion; prev: PlanVersion | null }) {
  const t = TRIGGER[v.trigger.type];
  const { data: zones } = useZones();
  return (
    <div className="space-y-4" data-testid="version-detail">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <t.icon className="size-5" aria-hidden /> Version {v.version}: {t.label}
            </h2>
            <p className="mt-1 text-sm text-muted">{v.trigger.description}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>{STRATEGY_LABEL[v.strategy]}</p>
            <p>{fmtSim(v.sim_minute)}</p>
            {v.approved_by ? <p>Approved by {v.approved_by}</p> : null}
          </div>
        </div>
        <MetricDeltas m={v.metrics} prev={prev?.metrics ?? null} />
      </Card>

      {v.diff ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">What changed vs v{v.version - 1}</h3>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Badge tone="info">{fmtNum(v.diff.people_moved)} moved</Badge>
              {v.diff.newly_allocated > 0 ? <Badge tone="ok">{fmtNum(v.diff.newly_allocated)} newly allocated</Badge> : null}
              {v.diff.newly_unallocated > 0 ? <Badge tone="danger">{fmtNum(v.diff.newly_unallocated)} lost a shelter</Badge> : null}
              <Badge tone="neutral">{fmtNum(v.diff.people_unchanged)} unchanged</Badge>
            </div>
          </div>
          {v.diff.moves.length === 0 ? (
            <EmptyState title="No households changed shelter" />
          ) : (
            <ul className="divide-y divide-border">
              {v.diff.moves.map((m, i) => (
                <MoveRow key={i} m={m} />
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card className="p-4 text-sm text-muted">This is the first version, so there is nothing to compare against.</Card>
      )}

      {v.unallocated.length > 0 ? (
        <Card className="border-danger/40 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-danger-fg">
            <AlertOctagon className="size-4" aria-hidden /> Unallocated in this version
          </p>
          <ul className="mt-1 text-muted">
            {v.unallocated.map((u, i) => (
              <li key={i}>
                {zones?.find((z) => z.zone_id === u.zone_id)?.name ?? `Zone ${u.zone_id}`}: {fmtNum(u.people)} people – {u.reason}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function MoveRow({ m }: { m: DiffMove }) {
  const delta = m.eta_before != null && m.eta_after != null ? m.eta_after - m.eta_before : null;
  return (
    <li className="grid gap-2 px-4 py-3 md:grid-cols-[140px_1fr_auto] md:items-center" data-testid="diff-move">
      <div>
        <p className="font-medium">{m.zone_name}</p>
        <p className="text-xs text-muted">
          {fmtNum(m.people)} people · {m.households} households
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className={cn("rounded-md border px-2 py-1", m.from_shelter_name ? "border-border bg-surface-2 line-through decoration-muted/70" : "border-dashed border-danger/50 text-danger-fg")}>
          {m.from_shelter_name ?? "Unallocated"}
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted" aria-label="moved to" />
        <span className={cn("rounded-md border px-2 py-1 font-medium", m.to_shelter_name ? "border-accent/50 bg-accent/10" : "border-dashed border-danger/50 text-danger-fg")}>
          {m.to_shelter_name ?? "No feasible shelter"}
        </span>
      </div>
      <div className="text-right text-xs">
        {delta != null ? (
          <>
            <p className="font-mono text-muted">
              {fmtSim(m.eta_before!)} → {fmtSim(m.eta_after!)}
            </p>
            <Badge tone={delta > 0 ? "danger" : delta < 0 ? "ok" : "neutral"}>{signed(delta, " min")}</Badge>
          </>
        ) : m.eta_after != null ? (
          <p className="font-mono text-muted">arrives {fmtSim(m.eta_after)}</p>
        ) : null}
      </div>
      <p className="text-xs text-muted md:col-span-3">Why: {m.reason}</p>
    </li>
  );
}

function MetricDeltas({ m, prev }: { m: PlanMetrics; prev: PlanMetrics | null }) {
  const items: { label: string; value: string; delta: number | null; lowerIsBetter: boolean; unit: string }[] = [
    { label: "Allocated", value: fmtNum(m.people_allocated), delta: prev ? m.people_allocated - prev.people_allocated : null, lowerIsBetter: false, unit: "" },
    { label: "Unallocated", value: fmtNum(m.people_unallocated), delta: prev ? m.people_unallocated - prev.people_unallocated : null, lowerIsBetter: true, unit: "" },
    { label: "Avg arrival", value: fmtMinutes(m.avg_eta), delta: prev ? m.avg_eta - prev.avg_eta : null, lowerIsBetter: true, unit: " min" },
    { label: "Worst arrival", value: fmtMinutes(m.worst_eta), delta: prev ? m.worst_eta - prev.worst_eta : null, lowerIsBetter: true, unit: " min" },
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((i) => {
        const good = i.delta == null || i.delta === 0 ? null : i.lowerIsBetter ? i.delta < 0 : i.delta > 0;
        return (
          <div key={i.label} className="rounded-lg border border-border bg-surface-2/50 p-2.5">
            <dt className="text-xs text-muted">{i.label}</dt>
            <dd className="mt-0.5 flex items-baseline gap-2">
              <span className="font-semibold tabular-nums">{i.value}</span>
              {i.delta != null && Math.round(i.delta) !== 0 ? (
                <span className={cn("text-xs tabular-nums", good ? "text-ok-fg" : "text-danger-fg")}>{signed(i.delta, i.unit)}</span>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
