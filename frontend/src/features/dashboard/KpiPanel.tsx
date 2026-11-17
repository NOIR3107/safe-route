import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApprovalBadge, ShelterStatusBadge } from "@/components/status/badges";
import { Badge, Progress, Skeleton } from "@/components/ui/primitives";
import { usePlan, useShelters, useSummary, useVehicles } from "@/hooks/queries";
import { occupancyTone } from "@/lib/semantic";
import { cn, fmtMinutes, fmtNum, fmtPct } from "@/lib/utils";

/** Section heading inside the panel; sentence case, same weight as card titles elsewhere. */
function Eyebrow({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-[13px] font-semibold">{children}</h3>
      {aside ? <span className="text-xs text-muted">{aside}</span> : null}
    </div>
  );
}

function Metric({ label, value, sub, alert, testId }: { label: string; value: ReactNode; sub: ReactNode; alert?: boolean; testId?: string }) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1.5 text-[1.35rem] leading-none font-semibold tabular-nums tracking-[-0.02em]", alert && "text-danger-fg")} data-testid={testId}>
        {value}
      </p>
      <p className={cn("mt-1.5 text-xs", alert ? "text-danger-fg" : "text-muted")}>{sub}</p>
    </div>
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
      <div className="space-y-4 p-4" aria-busy="true">
        <Skeleton className="h-20" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-56" />
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
  const unallocated = !!m && m.people_unallocated > 0;

  return (
    <div className="divide-y divide-border">
      <section className="px-4 pt-4 pb-4">
        <Eyebrow>People evacuated vs remaining</Eyebrow>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <p className="text-[2rem] leading-none font-semibold tabular-nums tracking-[-0.03em]" data-testid="kpi-evacuated">
            {fmtNum(evacuated)}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted">evacuated</span>
          </p>
          <p className="text-sm tabular-nums text-muted">
            <span className="font-medium text-fg">{fmtNum(remaining)}</span> remaining
          </p>
        </div>
        <Progress className="mt-3 h-2" value={evacuated / Math.max(1, affected)} tone="ok" label="Evacuation progress" />
        <p className="mt-2 text-xs text-muted">
          {fmtPct(evacuated / Math.max(1, affected), 1)} of {fmtNum(affected)} needing assisted evacuation
        </p>
      </section>

      <section className="grid grid-cols-2 [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b [&>*]:border-border">
        <Metric label="Avg evacuation time" value={m ? fmtMinutes(m.avg_eta) : "—"} sub="arrival from T+0" />
        <Metric label="Worst-case time" value={m ? fmtMinutes(m.worst_eta) : "—"} sub="last group to arrive" />
        <Metric
          label="High-priority served"
          value={m ? fmtPct(hpShare) : "—"}
          sub={m ? `${fmtNum(m.high_priority_served)} / ${fmtNum(m.high_priority_total)}` : "sev ≥ 4, medical, disabled"}
        />
        <Metric
          label="Unallocated people"
          value={m ? fmtNum(m.people_unallocated) : "—"}
          sub={unallocated ? "need capacity / routes" : "everyone has a shelter"}
          alert={unallocated}
          testId="kpi-unallocated"
        />
      </section>

      <section className="px-4 pt-4 pb-3">
        <Eyebrow aside={`${moving} vehicles moving`}>Shelter utilisation (present + inbound)</Eyebrow>
        <p className="mt-2.5 text-[1.35rem] leading-none font-semibold tabular-nums tracking-[-0.02em]">{fmtPct(util)}</p>
        <ul className="mt-3 -mx-4">
          {(shelters ?? []).map((s) => {
            const u = (s.current_occupancy + s.inbound) / s.capacity;
            return (
              <li key={s.shelter_id} className="px-4 py-2 text-[13px] transition-colors hover:bg-surface-2/60">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{s.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="w-9 text-right text-xs tabular-nums text-muted">{fmtPct(u)}</span>
                    <ShelterStatusBadge status={s.display_status} />
                  </span>
                </div>
                <Progress className="mt-1.5 h-1" value={u} tone={s.display_status === "Closed" ? "neutral" : occupancyTone(u)} label={`${s.name} utilisation`} />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="px-4 py-4 text-sm">
        {v ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">Plan v{v.version}</span>
              <ApprovalBadge state={v.status === "Approved" ? "Approved" : "Proposed"} />
              {v.status === "Proposed" ? <Badge tone="warn">needs approval</Badge> : null}
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{v.trigger.description}</p>
          </>
        ) : (
          <p className="text-muted">No evacuation plan yet.</p>
        )}
        <Link
          to="/plan"
          className="mt-3 inline-block text-[13px] font-medium underline decoration-fg/30 underline-offset-4 transition-colors hover:decoration-fg"
        >
          Open allocation plan
        </Link>
      </section>
    </div>
  );
}
