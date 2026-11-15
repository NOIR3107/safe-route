/**
 * Greedy vs Min-Cost Flow, side by side. Small multiples (one chart per metric, each with its own
 * scale; never a dual axis), validated two-slot palette, legend + direct labels, hover tooltips,
 * and a table view.
 */
import { BarChart3, Table2, Trophy } from "lucide-react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PlanMetrics, StrategyComparison as Comparison, StrategyId } from "@/api/extensions";
import { ErrorState } from "@/components/common";
import { Badge, Card, Skeleton, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { useCompare } from "@/hooks/queries";
import { useChartTheme } from "@/lib/chartTheme";
import { STRATEGY_LABEL } from "@/lib/labels";
import { fmtMinutes, fmtNum, fmtPct } from "@/lib/utils";


interface MetricDef {
  key: string;
  label: string;
  better: "lower" | "higher";
  value: (m: PlanMetrics) => number;
  format: (n: number) => string;
}

const METRICS: MetricDef[] = [
  { key: "cost", label: "Total weighted cost", better: "lower", value: (m) => m.total_cost, format: (n) => fmtNum(Math.round(n)) },
  { key: "avg", label: "Avg ETA from dispatch", better: "lower", value: (m) => m.avg_eta, format: (n) => fmtMinutes(n) },
  { key: "worst", label: "Worst-case ETA", better: "lower", value: (m) => m.worst_eta, format: (n) => fmtMinutes(n) },
  { key: "unalloc", label: "Unallocated people", better: "lower", value: (m) => m.people_unallocated, format: (n) => fmtNum(n) },
  {
    key: "hp",
    label: "High-priority served",
    better: "higher",
    value: (m) => (m.high_priority_total > 0 ? m.high_priority_served / m.high_priority_total : 1),
    format: (n) => fmtPct(n, 1),
  },
  { key: "veh", label: "Vehicles used", better: "lower", value: (m) => m.vehicles_used, format: (n) => fmtNum(n) },
];

function winner(def: MetricDef, c: Comparison): StrategyId | null {
  const g = def.value(c.greedy);
  const f = def.value(c["min-cost-flow"]);
  if (Math.abs(g - f) < 1e-9) return null;
  return (def.better === "lower" ? g < f : g > f) ? "greedy" : "min-cost-flow";
}

export function StrategyComparisonPanel({ enabled }: { enabled: boolean }) {
  const { data, isLoading, error, refetch } = useCompare(enabled);
  const ct = useChartTheme();
  const SERIES: Record<StrategyId, string> = { greedy: ct.series1, "min-cost-flow": ct.series2 };
  if (!enabled) return null;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Strategy comparison</h2>
          <p className="text-xs text-muted">What-if: both strategies plan everyone not yet picked up, against current roads and shelters. Nothing is committed. Min-Cost Flow minimises total severity-weighted cost; Greedy serves the highest-priority zone first.</p>
        </div>
        <ul className="flex items-center gap-3 text-xs" aria-label="Legend">
          {(["greedy", "min-cost-flow"] as const).map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm" style={{ background: SERIES[s] }} aria-hidden />
              {STRATEGY_LABEL[s]}
            </li>
          ))}
        </ul>
      </div>
      {isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {METRICS.map((m) => (
            <Skeleton key={m.key} className="h-32" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data ? (
        <Tabs defaultValue="charts" className="mt-3">
          <TabsList aria-label="Comparison view">
            <TabsTrigger value="charts">
              <BarChart3 /> Charts
            </TabsTrigger>
            <TabsTrigger value="table">
              <Table2 /> Table
            </TabsTrigger>
          </TabsList>
          <TabsContent value="charts" className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {METRICS.map((def) => (
              <MetricChart key={def.key} def={def} data={data} />
            ))}
          </TabsContent>
          <TabsContent value="table" className="mt-3">
            <Table>
              <THead>
                <TR>
                  <TH>Metric</TH>
                  <TH className="text-right">Greedy</TH>
                  <TH className="text-right">Min-Cost Flow</TH>
                  <TH>Better</TH>
                </TR>
              </THead>
              <TBody>
                {METRICS.map((def) => {
                  const w = winner(def, data);
                  return (
                    <TR key={def.key}>
                      <TD>{def.label}</TD>
                      <TD className="text-right tabular-nums">{def.format(def.value(data.greedy))}</TD>
                      <TD className="text-right tabular-nums">{def.format(def.value(data["min-cost-flow"]))}</TD>
                      <TD>{w ? <Badge tone="ok"><Trophy /> {STRATEGY_LABEL[w]}</Badge> : <span className="text-xs text-muted">tie</span>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TabsContent>
        </Tabs>
      ) : null}
    </Card>
  );
}

function MetricChart({ def, data }: { def: MetricDef; data: Comparison }) {
  const ct = useChartTheme();
  const SERIES: Record<StrategyId, string> = { greedy: ct.series1, "min-cost-flow": ct.series2 };
  const rows = (["greedy", "min-cost-flow"] as const).map((s) => ({ id: s, name: STRATEGY_LABEL[s], value: def.value(data[s]) }));
  const w = winner(def, data);
  return (
    <figure className="rounded-lg border border-border bg-surface-2/40 p-3">
      <figcaption className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{def.label}</span>
        <span className="text-muted">{def.better} is better</span>
      </figcaption>
      <div className="mt-1 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 4, bottom: 0, left: 4 }} barCategoryGap="28%">
            <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: ct.border }} tick={{ fill: ct.muted, fontSize: 11 }} interval={0} />
            <YAxis hide domain={[0, "auto"]} />
            <Tooltip
              cursor={{ fill: ct.surface2 }}
              contentStyle={{ background: ct.surface, border: `1px solid ${ct.border}`, borderRadius: 8, fontSize: 12, color: ct.fg }}
              labelStyle={{ color: ct.fg, fontWeight: 600 }}
              itemStyle={{ color: ct.fg }}
              formatter={(v) => [def.format(Number(v)), def.label]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false} minPointSize={2}>
              {rows.map((r) => (
                <Cell key={r.id} fill={SERIES[r.id]} />
              ))}
              <LabelList dataKey="value" position="top" formatter={(v: unknown) => def.format(Number(v))} style={{ fill: ct.fg, fontSize: 11, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-muted">{w ? `${STRATEGY_LABEL[w]} wins` : "Tie"}</p>
    </figure>
  );
}
