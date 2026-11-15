import { AlertOctagon, ArrowRight, Clock, HeartPulse, Hourglass, Truck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApprovalBadge, ShelterStatusBadge } from "@/components/status/badges";
import { Badge, Card, Progress, Skeleton } from "@/components/ui/primitives";
import { usePlan, useShelters, useSummary, useVehicles } from "@/hooks/queries";
import { occupancyTone } from "@/lib/semantic";
import { cn, fmtMinutes, fmtNum, fmtPct } from "@/lib/utils";

function Kpi({ label, icon: Icon, children, className }: { label: string; icon: typeof Users; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("p-3.5", className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </Card>
  );
}

export function KpiPanel() {
  const { data: summary, isLoading } = useSummary();
  const { data: plan } = usePlan();
  const { data: shelters } = useShelters();
  const { data: vehicles } = useVehicles();
  const v = plan?.current_version ?? null;
  const m = v?.metrics;

  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 p-4" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }
  const affected = summary.population.total_affected;
  const evacuated = summary.population.total_evacuated;
  const remaining = affected - evacuated;
  const hpShare = m && m.high_priority_total > 0 ? m.high_priority_served / m.high_priority_total : 0;
  const cap = shelters?.reduce((s, x) => s + (x.display_status === "Closed" ? 0 : x.capacity), 0) ?? 0;
  const load = shelters?.reduce((s, x) => s + (x.display_status === "Closed" ? 0 : x.current_occupancy + x.inbound), 0) ?? 0;
  const util = cap > 0 ? load / cap : 0;
  const moving = vehicles?.filter((x) => x.status === "In Transit").length ?? 0;

  return (
    <div className="space-y-3 p-4">
      <Kpi label="People evacuated vs remaining" icon={Users}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-semibold tabular-nums tracking-tight" data-testid="kpi-evacuated">
            {fmtNum(evacuated)}
            <span className="ml-1 text-sm font-normal text-muted">evacuated</span>
          </p>
          <p className="text-sm tabular-nums text-muted">{fmtNum(remaining)} remaining</p>
        </div>
        <Progress className="mt-2" value={evacuated / Math.max(1, affected)} tone="ok" label="Evacuation progress" />
        <p className="mt-1 text-xs text-muted">{fmtPct(evacuated / Math.max(1, affected), 1)} of {fmtNum(affected)} needing assisted evacuation</p>
      </Kpi>

      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Avg evacuation time" icon={Clock}>
          <p className="text-xl font-semibold tabular-nums">{m ? fmtMinutes(m.avg_eta) : "—"}</p>
          <p className="text-xs text-muted">arrival from T+0</p>
        </Kpi>
        <Kpi label="Worst-case time" icon={Hourglass}>
          <p className="text-xl font-semibold tabular-nums">{m ? fmtMinutes(m.worst_eta) : "—"}</p>
          <p className="text-xs text-muted">last group to arrive</p>
        </Kpi>
        <Kpi label="High-priority served" icon={HeartPulse}>
          <p className="text-xl font-semibold tabular-nums">{m ? fmtPct(hpShare) : "—"}</p>
          <p className="text-xs text-muted">{m ? `${fmtNum(m.high_priority_served)} / ${fmtNum(m.high_priority_total)}` : "sev ≥ 4, medical, disabled"}</p>
        </Kpi>
        <Kpi label="Unallocated people" icon={AlertOctagon} className={m && m.people_unallocated > 0 ? "border-danger/50" : undefined}>
          <p className={cn("text-xl font-semibold tabular-nums", m && m.people_unallocated > 0 && "text-danger-fg")} data-testid="kpi-unallocated">
            {m ? fmtNum(m.people_unallocated) : "—"}
          </p>
          <p className="text-xs text-muted">{m && m.people_unallocated > 0 ? "need capacity / routes" : "everyone has a shelter"}</p>
        </Kpi>
      </div>

      <Kpi label="Shelter utilisation (present + inbound)" icon={Truck}>
        <div className="flex items-baseline justify-between">
          <p className="text-xl font-semibold tabular-nums">{fmtPct(util)}</p>
          <p className="text-xs text-muted">{moving} vehicles moving</p>
        </div>
        <ul className="mt-2 space-y-1.5">
          {(shelters ?? []).map((s) => {
            const u = (s.current_occupancy + s.inbound) / s.capacity;
            return (
              <li key={s.shelter_id} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{s.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="tabular-nums text-muted">{fmtPct(u)}</span>
                    <ShelterStatusBadge status={s.display_status} />
                  </span>
                </div>
                <Progress className="mt-1" value={u} tone={s.display_status === "Closed" ? "neutral" : occupancyTone(u)} label={`${s.name} utilisation`} />
              </li>
            );
          })}
        </ul>
      </Kpi>

      <Card className="p-3.5 text-sm">
        {v ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">Plan v{v.version}</span>
              <ApprovalBadge state={v.status === "Approved" ? "Approved" : "Proposed"} />
              {v.status === "Proposed" ? <Badge tone="warn">needs approval</Badge> : null}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{v.trigger.description}</p>
          </>
        ) : (
          <p className="text-muted">No evacuation plan yet.</p>
        )}
        <Link to="/plan" className="mt-2 inline-flex items-center gap-1 font-medium text-accent hover:underline">
          Open allocation plan <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Card>
    </div>
  );
}
