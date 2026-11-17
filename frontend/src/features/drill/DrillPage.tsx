import { CheckCircle2, CircleDashed, Construction, DoorClosed, FastForward, History, Pause, Play, PlayCircle, PlugZap, RotateCcw, SkipBack, Users, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import type { DrillEvent } from "@/api/extensions";
import { ConfirmDialog, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label, Progress, Select, Skeleton } from "@/components/ui/primitives";
import {
  useDrill,
  useDrillControl,
  useInjectEvent,
  useLoadScenario,
  useRoutes,
  useShelters,
  usePlan,
  useScenarios,
  useSummary,
} from "@/hooks/queries";
import { cn, fmtNum, fmtSim, signed } from "@/lib/utils";

const SPEEDS = [1, 4, 8, 16];

const OpsGlobe = lazy(() => import("@/components/map/OpsGlobe"));

export function DrillPage() {
  const { data: drill, isLoading } = useDrill();
  const { data: scenarios } = useScenarios();
  const control = useDrillControl();
  const load = useLoadScenario();
  const { data: plan } = usePlan();
  const { data: summary } = useSummary();
  const [confirm, setConfirm] = useState<null | "reset" | { load: string }>(null);
  const [pick, setPick] = useState<string>("");

  const scenario = scenarios?.find((s) => s.id === drill?.scenario_id) ?? null;
  const duration = drill?.duration_minutes ?? scenario?.duration_minutes ?? 150;
  const inDrill = drill?.mode === "drill";
  const phase = drill?.phase ?? "idle";
  const latest = plan?.current_version ?? null;


  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={PlayCircle}
        title="Simulation / Drill Mode"
        description={scenario ? scenario.description : "Load a scenario and play scripted disruptions; the plan re-plans live."}
        actions={
          <>
            <Select aria-label="Scenario" value={pick || drill?.scenario_id || ""} onChange={(e) => setPick(e.target.value)} className="w-72">
              {(scenarios ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={() => setConfirm({ load: pick || drill?.scenario_id || "" })} disabled={load.isPending}>
              Load scenario
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 gap-4 p-4 sm:p-6 xl:grid-cols-[1fr_380px]">
        <div className="flex min-h-0 flex-col gap-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              {phase === "running" ? (
                <Button onClick={() => control.mutate({ type: "pause" })} data-testid="drill-pause">
                  <Pause /> Pause
                </Button>
              ) : phase === "paused" ? (
                <Button onClick={() => control.mutate({ type: "resume" })} data-testid="drill-play">
                  <Play /> Resume
                </Button>
              ) : (
                <Button onClick={() => control.mutate({ type: "start" })} disabled={phase === "finished" || isLoading} data-testid="drill-play">
                  <Play /> {inDrill ? "Start" : "Start drill on a copy of live data"}
                </Button>
              )}
              <div role="radiogroup" aria-label="Playback speed" className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={drill?.speed === s}
                    onClick={() => control.mutate({ type: "speed", speed: s })}
                    disabled={!inDrill}
                    className={cn("cursor-pointer rounded-md px-2.5 py-1 font-mono text-xs", drill?.speed === s ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <FastForward className="size-4 text-muted" aria-hidden />
              <Button variant="secondary" onClick={() => control.mutate({ type: "replay" })} disabled={!drill?.has_snapshot} title="Restore T+0 and replay every event, including injected ones">
                <SkipBack /> Replay
              </Button>
              <Button variant="ghost" onClick={() => setConfirm("reset")}>
                <RotateCcw /> Reset
              </Button>
              {inDrill ? (
                <Button variant="secondary" onClick={() => control.mutate({ type: "end" })} data-testid="drill-end">
                  End drill, back to live
                </Button>
              ) : null}
              <div className="ml-auto text-right">
                <p className="font-mono text-2xl font-semibold tabular-nums" aria-live="polite" data-testid="sim-clock">
                  {fmtSim(drill?.sim_minute ?? 0)}
                </p>
                <p className="text-xs text-muted">
                  of {duration} min · {phase}
                </p>
              </div>
            </div>
            <TimelineTrack events={drill?.timeline ?? []} fired={drill?.fired_event_ids ?? []} now={drill?.sim_minute ?? 0} duration={duration} />
          </Card>

          <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-lg border border-border">
            <Suspense fallback={<Skeleton className="h-full w-full" />}>
              <OpsGlobe variant="embedded" />
            </Suspense>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle>Live status</CardTitle>
              <Link to="/plan/versions" className="text-xs underline decoration-fg/30 underline-offset-4 transition-colors hover:decoration-fg">
                Plan diff
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary ? (
                <div>
                  <div className="flex justify-between text-sm">
                    <span>Evacuated</span>
                    <span className="tabular-nums">
                      {fmtNum(summary.population.total_evacuated)} / {fmtNum(summary.population.total_affected)}
                    </span>
                  </div>
                  <Progress className="mt-1" value={summary.population.total_evacuated / Math.max(1, summary.population.total_affected)} tone="ok" label="Evacuated" />
                </div>
              ) : null}
              {latest ? (
                <div className="rounded-lg border border-border bg-surface-2/50 p-3 text-sm" data-testid="drill-latest-version">
                  <p className="font-medium">
                    Plan v{latest.version} <span className="font-normal text-muted">· {latest.status}</span>
                  </p>
                  <p className="text-xs text-muted">{latest.trigger.description}</p>
                  {latest.diff ? (
                    <p className="mt-1 text-xs">
                      {fmtNum(latest.diff.people_moved)} moved · {fmtNum(latest.diff.newly_unallocated)} lost shelter · avg ETA {signed(latest.diff.avg_eta_delta, " min")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs">
                    Unallocated: <span className={cn("font-semibold", latest.metrics.people_unallocated > 0 && "text-danger-fg")}>{fmtNum(latest.metrics.people_unallocated)}</span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">No plan yet. Starting the drill generates one automatically.</p>
              )}
            </CardContent>
          </Card>

          <InjectPanel disabled={phase !== "running" && phase !== "paused"} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <History className="size-4" aria-hidden /> Event timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {(drill?.timeline ?? []).map((e) => {
                  const done = drill?.fired_event_ids.includes(e.id);
                  return (
                    <li key={e.id} className={cn("flex items-start gap-2 text-sm", !done && "text-muted")} data-testid="timeline-event">
                      {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Fired" /> : <CircleDashed className="mt-0.5 size-4 shrink-0" aria-label="Pending" />}
                      <span className="w-12 shrink-0 font-mono text-xs leading-5">{fmtSim(e.at_minute)}</span>
                      <span className="min-w-0">
                        {e.label} {e.manual ? <Badge tone="violet">injected</Badge> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm != null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "reset" ? "Reset the scenario?" : "Load scenario?"}
        description="This discards the current plan, versions and drill progress and restores the scenario's seed data. The audit log of this session is cleared too."
        confirmLabel={confirm === "reset" ? "Reset" : "Load"}
        busy={control.isPending || load.isPending}
        onConfirm={() => {
          if (confirm === "reset") control.mutate({ type: "reset" }, { onSettled: () => setConfirm(null) });
          else if (confirm) load.mutate(confirm.load, { onSettled: () => setConfirm(null) });
        }}
      />
    </div>
  );
}

function TimelineTrack({ events, fired, now, duration }: { events: DrillEvent[]; fired: string[]; now: number; duration: number }) {
  return (
    <div className="mt-4">
      <div className="relative h-8" aria-hidden>
        <div className="absolute inset-x-0 top-3.5 h-1 rounded-full bg-surface-2" />
        <div className="absolute left-0 top-3.5 h-1 rounded-full bg-accent transition-[width] duration-700" style={{ width: `${Math.min(100, (now / duration) * 100)}%` }} />
        {events.map((e) => (
          <span
            key={e.id}
            title={`${fmtSim(e.at_minute)} ${e.label}`}
            className={cn(
              "absolute top-1.5 size-5 -translate-x-1/2 rounded-full border-2 border-surface",
              fired.includes(e.id) ? (e.manual ? "bg-violet" : "bg-danger") : "bg-border",
            )}
            style={{ left: `${Math.min(100, (e.at_minute / duration) * 100)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted">
        <span>T+0</span>
        <span>T+{Math.round(duration / 2)}</span>
        <span>T+{duration}</span>
      </div>
    </div>
  );
}

function InjectPanel({ disabled }: { disabled: boolean }) {
  const inject = useInjectEvent();
  const { data: routes } = useRoutes();
  const { data: shelters } = useShelters();
  const [routeId, setRouteId] = useState("");
  const [shelterId, setShelterId] = useState("");
  const [walkIns, setWalkIns] = useState(150);
  const usable = useMemo(() => (routes ?? []).filter((r) => r.status !== "Blocked" && r.status !== "Flooded"), [routes]);
  const open = useMemo(() => (shelters ?? []).filter((s) => s.status !== "Closed"), [shelters]);
  const route = usable.find((r) => String(r.route_id) === routeId) ?? usable[0];
  const shelter = open.find((s) => String(s.shelter_id) === shelterId) ?? open[0];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <Zap className="size-4 text-warn" aria-hidden /> Inject an event
          </CardTitle>
          <p className="text-xs text-muted">Recorded on the timeline so replays reproduce it.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="inject-route">Route</Label>
          <div className="flex gap-2">
            <Select id="inject-route" value={route ? String(route.route_id) : ""} onChange={(e) => setRouteId(e.target.value)} className="min-w-0 flex-1">
              {usable.map((r) => (
                <option key={r.route_id} value={r.route_id}>
                  R{r.route_id} {r.source} → {r.destination}
                </option>
              ))}
            </Select>
            <Button
              variant="danger"
              disabled={disabled || !route || inject.isPending}
              onClick={() => route && inject.mutate({ kind: "RouteBlocked", route_id: route.route_id, label: `Route R${route.route_id} ${route.source} → ${route.destination} blocked (debris)` })}
              data-testid="inject-block-route"
            >
              <Construction /> Block
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inject-shelter">Shelter</Label>
          <Select id="inject-shelter" value={shelter ? String(shelter.shelter_id) : ""} onChange={(e) => setShelterId(e.target.value)}>
            {open.map((s) => (
              <option key={s.shelter_id} value={s.shelter_id}>
                {s.name}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || !shelter}
              onClick={() => shelter && inject.mutate({ kind: "FacilityLost", shelter_id: shelter.shelter_id, facilities: ["Power", "Medical"], label: `${shelter.name} loses power` })}
            >
              <PlugZap /> Power loss
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || !shelter}
              onClick={() => shelter && inject.mutate({ kind: "ShelterClosed", shelter_id: shelter.shelter_id, label: `${shelter.name} closed by incident command` })}
            >
              <DoorClosed /> Close
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-24">
              <Label htmlFor="walkins">Walk-ins</Label>
              <Input id="walkins" type="number" min={10} max={1000} value={walkIns} onChange={(e) => setWalkIns(Number(e.target.value))} />
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || !shelter || walkIns < 1}
              onClick={() => shelter && inject.mutate({ kind: "WalkIns", shelter_id: shelter.shelter_id, people: walkIns, label: `${walkIns} walk-ins arrive at ${shelter.name}` })}
            >
              <Users /> Surge
            </Button>
          </div>
        </div>
        {disabled ? <p className="text-xs text-muted">Start the drill to inject events.</p> : null}
      </CardContent>
    </Card>
  );
}
