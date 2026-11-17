import { Ban, CheckCircle2, CircleDollarSign, Clock4, ShieldCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import type { AssignmentView, CostBreakdown, RejectedAlternative } from "@/api/extensions";
import { ConfirmDialog } from "@/components/common";
import { ApprovalBadge, AssignmentStatusBadge, SeverityBadge } from "@/components/status/badges";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/overlay";
import { Badge, Label, Select } from "@/components/ui/primitives";
import { useApprove, useOverride, usePlan, useVehicles } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import { FACILITY_ICON } from "@/lib/semantic";
import { cn, fmtMinutes, fmtNum, fmtSim } from "@/lib/utils";
import { STRATEGY_LABEL } from "@/lib/labels";

export function ExplanationDrawer({ assignment, onOpenChange }: { assignment: AssignmentView | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={assignment != null} onOpenChange={onOpenChange}>
      {assignment ? <DrawerBody a={assignment} close={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function DrawerBody({ a, close }: { a: AssignmentView; close: () => void }) {
  const { can } = useSession();
  const { data: plan } = usePlan();
  const { data: vehicles } = useVehicles();
  const approve = useApprove();
  const override = useOverride();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const feasible = a.ext.explanation.alternatives.filter((x) => x.verdict === "higher-cost");
  const [target, setTarget] = useState<number | null>(feasible[0]?.shelter_id ?? null);
  const version = plan?.current_version;
  const movable = a.status === "Scheduled" || a.status === "In Progress";
  const ex = a.ext.explanation;

  return (
    <SheetContent title="Why this shelter?" description={`${a.zone_name} → ${a.shelter_name}`} data-testid="explanation-drawer">
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={a.severity} />
          <AssignmentStatusBadge status={a.status} />
          <ApprovalBadge state={a.ext.approval} />
          <Badge tone="info">{STRATEGY_LABEL[ex.strategy]}</Badge>
          {ex.required_facilities.map((f) => {
            const Icon = FACILITY_ICON[f];
            return (
              <Badge key={f} tone="violet">
                <Icon /> needs {f.toLowerCase()}
              </Badge>
            );
          })}
        </div>

        <p className="rounded-md border border-border border-l-2 border-l-fg/70 bg-surface-2 px-3.5 py-3 text-sm leading-relaxed">{ex.summary}</p>
        {a.ext.override_reason ? (
          <p className="rounded-md border border-violet/30 border-l-2 border-l-violet bg-violet/8 px-3.5 py-3 text-sm">
            <Undo2 className="mr-1 inline size-4" aria-hidden /> Overridden: “{a.ext.override_reason}”
          </p>
        ) : null}

        <dl className="grid grid-cols-3 overflow-hidden rounded-md border border-border text-sm [&>div]:border-border [&>div:nth-child(-n+2)]:border-r [&>div:nth-child(-n+3)]:border-b">
          <Fact label="People" value={`${fmtNum(a.people_count)} (${a.ext.household_ids.length} households)`} />
          <Fact label="ETA" value={`${fmtMinutes(a.ext.eta_minutes)} · ${fmtSim(a.ext.dispatch_minute + a.ext.eta_minutes)}`} />
          <Fact label="Route" value={a.route_label ?? "—"} />
          <Fact
            label="Vehicles"
            value={
              a.ext.vehicle_ids.length === 0
                ? "Guided walk-out"
                : a.ext.vehicle_ids
                    .map((id) => vehicles?.find((v) => v.vehicle_id === id))
                    .map((v) => (v ? `${v.vehicle_type} ${v.plate_number ?? ""}` : ""))
                    .join(", ")
            }
            className="col-span-3"
          />
        </dl>

        <section aria-labelledby="cost-h">
          <h3 id="cost-h" className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <CircleDollarSign className="size-4 text-muted" aria-hidden /> Cost breakdown <span className="font-normal text-muted">(per person, weighted minutes)</span>
          </h3>
          <CostBars cost={ex.cost} />
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            {ex.cost.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="alt-h">
          <h3 id="alt-h" className="mb-2 text-sm font-semibold">Alternatives considered</h3>
          <ul className="space-y-2">
            {ex.alternatives.map((alt) => (
              <AlternativeRow key={alt.shelter_id} alt={alt} />
            ))}
            {ex.alternatives.length === 0 ? <li className="text-sm text-muted">No other shelters exist.</li> : null}
          </ul>
        </section>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        {version && version.status === "Proposed" && can("plan:approve") ? (
          <Button variant="success" onClick={() => approve.mutate(version.version)} disabled={approve.isPending} data-testid="approve-version">
            <ShieldCheck /> Approve plan v{version.version}
          </Button>
        ) : version?.status === "Approved" ? (
          <Badge tone="ok">
            <CheckCircle2 /> v{version.version} approved by {version.approved_by}
          </Badge>
        ) : null}
        {can("plan:override") ? (
          <Button variant="secondary" onClick={() => setOverrideOpen(true)} disabled={!movable || feasible.length === 0} data-testid="override-open">
            <Undo2 /> Override…
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        title="Override this assignment"
        tone="default"
        confirmLabel="Apply override"
        requireReason
        busy={override.isPending}
        description={
          <span className="block space-y-3">
            <span className="block">
              Send {fmtNum(a.people_count)} people from {a.zone_name} to a different feasible shelter. Creates a new plan version; the reason is written to the audit
              log.
            </span>
            <span className="block space-y-1">
              <Label htmlFor="override-target">New shelter</Label>
              <Select id="override-target" value={target ?? ""} onChange={(e) => setTarget(Number(e.target.value))}>
                {feasible.map((f) => (
                  <option key={f.shelter_id} value={f.shelter_id}>
                    {f.shelter_name} (cost {f.cost}, +{f.delta_pct}%)
                  </option>
                ))}
              </Select>
            </span>
          </span>
        }
        onConfirm={(reason) => {
          if (target == null) return;
          override.mutate(
            { assignmentId: a.assignment_id, shelterId: target, reason },
            {
              onSuccess: () => {
                setOverrideOpen(false);
                close();
              },
            },
          );
        }}
      />
    </SheetContent>
  );
}

function Fact({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("px-3 py-2.5", className)}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

/** Single-hue magnitude bars: each component as a share of the total cost. */
function CostBars({ cost }: { cost: CostBreakdown }) {
  const rows = [
    { label: "Travel (time × congestion × severity)", value: cost.travel_cost },
    { label: "Route risk penalty", value: cost.risk_penalty },
    { label: "Facility penalty", value: cost.facility_penalty },
    { label: "Utilisation penalty", value: cost.utilization_penalty },
    { label: "Stability penalty", value: cost.stability_penalty },
  ];
  return (
    <div className="rounded-lg border border-border p-3">
      <table className="w-full text-sm">
        <caption className="sr-only">Cost components</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="w-1/2 py-1 pr-2 text-left text-xs font-normal text-muted">
                {r.label}
              </th>
              <td className="py-1">
                <div className="h-2 rounded-full bg-surface-2">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${cost.total > 0 ? (r.value / cost.total) * 100 : 0}%` }} />
                </div>
              </td>
              <td className="w-14 py-1 text-right font-mono text-xs tabular-nums">{r.value}</td>
            </tr>
          ))}
          <tr className="border-t border-border">
            <th scope="row" className="pt-2 text-left text-xs font-semibold">
              Total
            </th>
            <td />
            <td className="pt-2 text-right font-mono text-sm font-semibold tabular-nums">{cost.total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AlternativeRow({ alt }: { alt: RejectedAlternative }) {
  const verdict =
    alt.verdict === "infeasible"
      ? { tone: "danger" as const, icon: Ban, label: "Infeasible" }
      : alt.verdict === "capacity-exhausted"
        ? { tone: "warn" as const, icon: Clock4, label: "No capacity left" }
        : { tone: "neutral" as const, icon: CircleDollarSign, label: `+${alt.delta_pct}% cost` };
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{alt.shelter_name}</p>
        <Badge tone={verdict.tone}>
          <verdict.icon /> {verdict.label}
        </Badge>
      </div>
      <ul className="mt-1 space-y-0.5 text-xs text-muted">
        {alt.reasons.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
    </li>
  );
}
