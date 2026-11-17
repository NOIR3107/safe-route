/**
 * Right-hand dock of the Command Dashboard, in order of importance:
 *   1. one number: people still at risk (with its trend)
 *   2. four secondary measures with change since the previous plan version and a sparkline
 *   3. the plan's state, with Approve when this role may approve
 *   4. shelters, most urgent first
 * Everything comes from the live store. When the connection is not live the numbers dim and say how
 * old they are, so stale figures never pass as current.
 */
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Ban, DoorClosed, Gauge } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { PlanVersion, ShelterView } from "@/api/extensions";
import { useLive } from "@/api/live";
import { Meter, Sparkline, type SparkPoint } from "@/components/charts/Sparkline";
import { useMapStore } from "@/components/map/mapStore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { useApprove, useClock, usePlan, useShelters, useSummary, useTimeline } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import { useNow } from "@/hooks/useNow";
import { cn, fmtMinutes, fmtNum, fmtPct } from "@/lib/utils";

const SHELTER_URGENCY: Record<ShelterView["display_status"], number> = { Full: 0, "Near Full": 1, Open: 2, Closed: 3 };
const STATUS_TONE: Record<ShelterView["display_status"], string> = {
  Open: "var(--color-ok)",
  "Near Full": "var(--color-warn)",
  Full: "var(--color-danger)",
  Closed: "var(--color-neutral)",
};

export function KpiPanel() {
  const { data: summary, isLoading } = useSummary();
  const { data: plan } = usePlan();
  const { data: shelters } = useShelters();
  const { data: timeline } = useTimeline();
  const clock = useClock().data;
  const status = useLive((s) => s.status);
  const lastMessageAt = useLive((s) => s.lastMessageAt);
  const { can } = useSession();
  const approve = useApprove();
  const select = useMapStore((s) => s.select);
  const now = useNow();

  const v = plan?.current_version ?? null;
  const prev = plan && plan.versions.length > 1 ? plan.versions[plan.versions.length - 2]! : null;
  const fresh = status === "live";

  const atRiskTrend = useMemo<SparkPoint[]>(
    () => (timeline ? timeline.evacuated.map(([x, evac]) => ({ x, y: timeline.affected - evac })) : []),
    [timeline],
  );
  const versionTrend = (pick: (m: TimelineVersion) => number): SparkPoint[] =>
    timeline ? timeline.versions.map((tv) => ({ x: tv.minute, y: pick(tv) })) : [];

  const sortedShelters = useMemo(
    () =>
      [...(shelters ?? [])].sort(
        (a, b) =>
          SHELTER_URGENCY[a.display_status] - SHELTER_URGENCY[b.display_status] ||
          (b.current_occupancy + b.inbound) / b.capacity - (a.current_occupancy + a.inbound) / a.capacity,
      ),
    [shelters],
  );

  if (isLoading || !summary) {
    return (
      <div className="space-y-5 p-5" aria-busy="true" aria-label="Loading figures">
        <Skeleton className="h-28" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const affected = summary.population.total_affected;
  const evacuated = summary.population.total_evacuated;
  const atRisk = Math.max(0, affected - evacuated);
  const m = v?.metrics;
  const pm = prev?.metrics;
  const hpPct = (x?: { high_priority_served: number; high_priority_total: number }) =>
    x && x.high_priority_total > 0 ? x.high_priority_served / x.high_priority_total : 0;
  const ago = lastMessageAt ? Math.max(0, Math.round((now - lastMessageAt) / 1000)) : null;

  return (
    <div className={cn("divide-y divide-border transition-opacity", !fresh && "opacity-70")}>
      {/* 1 ---------------------------------------------------------------- hero */}
      <section className="px-5 pt-5 pb-4" aria-labelledby="at-risk">
        <h2 id="at-risk" className="text-[13px] font-medium text-muted">
          People still at risk
        </h2>
        <p className="mt-1 text-[3.25rem] leading-none font-semibold tracking-[-0.035em] tabular-nums" data-testid="kpi-at-risk">
          {fmtNum(atRisk)}
        </p>
        <p className="mt-2 text-[13px] text-muted tabular-nums" data-testid="kpi-evacuated">
          {fmtNum(evacuated)} of {fmtNum(affected)} evacuated ({fmtPct(evacuated / Math.max(1, affected))})
        </p>
        <Sparkline
          className="mt-3"
          points={atRiskTrend}
          label="People still at risk over time"
          height={36}
        />
        {!fresh ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-warn-fg" role="status">
            <AlertTriangle className="size-3.5" aria-hidden />
            {status === "disconnected" ? "Disconnected" : "Not updating"}
            {ago != null ? `: figures are from ${ago} s ago` : ""}
            {clock ? ` (T+${clock.sim_minute})` : ""}
          </p>
        ) : null}
      </section>

      {/* 2 ---------------------------------------------------------------- secondary */}
      <section className="grid grid-cols-2 [&>*]:border-border [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b" aria-label="Plan measures">
        <Stat
          label="Average arrival"
          value={m ? fmtMinutes(m.avg_eta) : "–"}
          delta={m && pm ? deltaMinutes(m.avg_eta - pm.avg_eta) : null}
          better={m && pm ? m.avg_eta < pm.avg_eta : null}
          trend={versionTrend((t) => t.avg_eta)}
          format={(x) => fmtMinutes(x)}
        />
        <Stat
          label="Worst-case arrival"
          value={m ? fmtMinutes(m.worst_eta) : "–"}
          delta={m && pm ? deltaMinutes(m.worst_eta - pm.worst_eta) : null}
          better={m && pm ? m.worst_eta < pm.worst_eta : null}
          trend={versionTrend((t) => t.worst_eta)}
          format={(x) => fmtMinutes(x)}
        />
        <Stat
          label="High-priority served"
          value={m ? fmtPct(hpPct(m)) : "–"}
          sub={m ? `${fmtNum(m.high_priority_served)} of ${fmtNum(m.high_priority_total)}` : undefined}
          delta={m && pm ? deltaPts(hpPct(m) - hpPct(pm)) : null}
          better={m && pm ? hpPct(m) > hpPct(pm) : null}
          trend={versionTrend((t) => (t.high_priority_total ? (t.high_priority_served / t.high_priority_total) * 100 : 0))}
          format={(x) => `${Math.round(x)}%`}
        />
        <Stat
          label="Unallocated people"
          value={m ? fmtNum(m.people_unallocated) : "–"}
          alert={!!m && m.people_unallocated > 0}
          sub={m ? (m.people_unallocated > 0 ? "need a shelter or a road" : "everyone has a shelter") : undefined}
          delta={m && pm ? signedNum(m.people_unallocated - pm.people_unallocated) : null}
          better={m && pm ? m.people_unallocated < pm.people_unallocated : null}
          trend={versionTrend((t) => t.people_unallocated)}
          testId="kpi-unallocated"
        />
      </section>

      {/* 3 ---------------------------------------------------------------- plan */}
      <PlanRow version={v} canApprove={can("plan:approve")} onApprove={(n) => approve.mutate(n)} busy={approve.isPending} />

      {/* 4 ---------------------------------------------------------------- shelters */}
      <section className="px-5 pt-4 pb-3" aria-labelledby="shelters-h">
        <div className="flex items-baseline justify-between">
          <h2 id="shelters-h" className="text-[13px] font-medium">
            Shelters, most urgent first
          </h2>
          <span className="text-xs text-muted">present + on the way</span>
        </div>
        <ul className="-mx-5 mt-2">
          {sortedShelters.map((s) => {
            const load = (s.current_occupancy + s.inbound) / s.capacity;
            return (
              <li key={s.shelter_id}>
                <button
                  type="button"
                  onClick={() => select({ kind: "shelter", id: s.shelter_id })}
                  className={cn(
                    "w-full cursor-pointer px-5 py-2 text-left text-[13px] transition-colors hover:bg-surface-2/60",
                    s.display_status === "Closed" && "text-muted",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{s.name}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <ShelterFlag status={s.display_status} />
                      <span className="w-10 text-right font-medium tabular-nums">{s.display_status === "Closed" ? "–" : fmtPct(load)}</span>
                    </span>
                  </span>
                  <span className="mt-1.5 block">
                    <Meter
                      present={s.current_occupancy / s.capacity}
                      inbound={s.inbound / s.capacity}
                      tone={STATUS_TONE[s.display_status]}
                      label={`${s.name}: ${fmtNum(s.current_occupancy)} present, ${fmtNum(s.inbound)} on the way, capacity ${fmtNum(s.capacity)}`}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

type TimelineVersion = {
  minute: number;
  avg_eta: number;
  worst_eta: number;
  people_unallocated: number;
  high_priority_served: number;
  high_priority_total: number;
};

function Stat({
  label,
  value,
  sub,
  delta,
  better,
  trend,
  format,
  alert,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  delta: string | null;
  better: boolean | null;
  trend: SparkPoint[];
  format?: (v: number) => string;
  alert?: boolean;
  testId?: string;
}) {
  return (
    <div className="min-w-0 px-5 py-3.5">
      <p className="truncate text-xs text-muted">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className={cn("text-[1.4rem] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums", alert && "text-danger-fg")} data-testid={testId}>
          {value}
        </p>
        {delta ? <Delta text={delta} better={better} /> : null}
      </div>
      {sub ? <p className={cn("mt-1 truncate text-xs tabular-nums", alert ? "text-danger-fg" : "text-muted")}>{sub}</p> : null}
      <Sparkline className="mt-2" points={trend} label={`${label} by plan version`} format={format} height={22} />
    </div>
  );
}

function Delta({ text, better }: { text: string; better: boolean | null }) {
  if (text === "0" || text === "0 min" || text === "+0 pts") return <span className="text-xs text-muted tabular-nums">no change</span>;
  const up = text.startsWith("+");
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs whitespace-nowrap tabular-nums", better == null ? "text-muted" : better ? "text-ok-fg" : "text-danger-fg")}
      title="Change since the previous plan version"
    >
      <Icon className="size-3" aria-hidden />
      {text.replace(/^[+-]/, "")}
      <span className="sr-only">{better ? "(better)" : "(worse)"} since the previous plan version</span>
    </span>
  );
}

function ShelterFlag({ status }: { status: ShelterView["display_status"] }) {
  if (status === "Open") return null; // nothing to act on
  const icon = { "Near Full": Gauge, Full: Ban, Closed: DoorClosed }[status];
  const Icon = icon;
  const cls = { "Near Full": "text-warn-fg", Full: "text-danger-fg", Closed: "text-muted" }[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", cls)}>
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      {status === "Near Full" ? "Near full" : status}
    </span>
  );
}

function PlanRow({
  version,
  canApprove,
  onApprove,
  busy,
}: {
  version: PlanVersion | null;
  canApprove: boolean;
  onApprove: (n: number) => void;
  busy: boolean;
}): ReactNode {
  if (!version) {
    return (
      <section className="flex items-center justify-between gap-3 px-5 py-3.5 text-[13px]">
        <span className="text-muted">No evacuation plan yet</span>
        <Link to="/plan" className="font-medium underline decoration-fg/30 underline-offset-4 hover:decoration-fg">
          Open plan
        </Link>
      </section>
    );
  }
  const needsApproval = version.status === "Proposed";
  return (
    <section className={cn("px-5 py-3.5 text-[13px]", needsApproval && "bg-warn/[0.06]")} aria-label="Current plan">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0">
          <span className="font-semibold">Plan v{version.version}</span>{" "}
          <span className={needsApproval ? "text-warn-fg" : "text-muted"}>
            {needsApproval ? "proposed, waiting for approval" : `approved${version.approved_by ? ` by ${version.approved_by}` : ""}`}
          </span>
        </p>
        {needsApproval && canApprove ? (
          <Button size="sm" onClick={() => onApprove(version.version)} disabled={busy} data-testid="dock-approve">
            Approve v{version.version}
          </Button>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted">{String(version.trigger.description ?? "")}</p>
      <Link to="/plan" className="mt-2 inline-block text-xs font-medium underline decoration-fg/30 underline-offset-4 hover:decoration-fg">
        Review assignments
      </Link>
    </section>
  );
}

function deltaMinutes(d: number): string {
  const r = Math.round(d);
  return r === 0 ? "0 min" : `${r > 0 ? "+" : "-"}${fmtMinutes(Math.abs(r))}`;
}
function deltaPts(d: number): string {
  const r = Math.round(d * 100);
  return `${r >= 0 ? "+" : "-"}${Math.abs(r)} pts`;
}
function signedNum(d: number): string {
  return d === 0 ? "0" : `${d > 0 ? "+" : "-"}${fmtNum(Math.abs(d))}`;
}
