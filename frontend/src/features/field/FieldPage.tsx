import { CheckCircle2, ChevronDown, CloudUpload, MapPin, Navigation, RefreshCw, Smartphone, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { api } from "@/api/client";
import type { AssignmentView } from "@/api/extensions";
import { EmptyState, ErrorState } from "@/components/common";
import { AssignmentStatusBadge, SeverityBadge } from "@/components/status/badges";
import { Button } from "@/components/ui/button";
import { Badge, Card, Skeleton } from "@/components/ui/primitives";
import { useFieldTasks, useHouseholds, useRoutes, useShelters } from "@/hooks/queries";
import { useOnline, useSession } from "@/hooks/session";
import { cn, errorMessage, fmtMinutes, fmtNum, fmtSim, fmtTime } from "@/lib/utils";
import { pendingArrival, pendingPickups, useSyncQueue, type QueuedAction } from "@/stores/syncQueue";
import { useUiStore } from "@/stores/ui";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/** Replays queued offline actions in order once connectivity returns. */
function useSyncEngine(online: boolean) {
  const qc = useQueryClient();
  const { items, remove, markFailed, setSyncing, setSynced, syncing } = useSyncQueue();
  const run = useCallback(async () => {
    const queue = useSyncQueue.getState().items;
    if (queue.length === 0) return;
    setSyncing(true);
    let ok = 0;
    for (const item of queue) {
      try {
        await perform(item.action);
        remove(item.id);
        ok++;
      } catch (e) {
        markFailed(item.id, errorMessage(e));
        break;
      }
    }
    setSyncing(false);
    setSynced();
    if (ok > 0) toast.success(`Synced ${ok} offline update${ok > 1 ? "s" : ""}`);
    void qc.invalidateQueries();
  }, [qc, remove, markFailed, setSyncing, setSynced]);
  useEffect(() => {
    if (online && items.length > 0 && !syncing) void run();
  }, [online, items.length, syncing, run]);
  return run;
}

function perform(a: QueuedAction): Promise<void> {
  return a.kind === "pickup" ? api.markPickedUp(a.assignment_id, a.household_ids) : api.markArrived(a.assignment_id);
}

const GlobeView = lazy(() => import("@/components/map/OpsGlobe").then((m) => ({ default: m.GlobeView })));

export function FieldPage() {
  const { user } = useSession();
  const online = useOnline();
  const forceOffline = useUiStore((s) => s.forceOffline);
  const setForceOffline = useUiStore((s) => s.setForceOffline);
  const { items, lastSyncedAt, syncing } = useSyncQueue();
  const sync = useSyncEngine(online);
  const { data, isLoading, error, refetch } = useFieldTasks();
  const [open, setOpen] = useState<number | null>(null);
  const active = (data ?? []).filter((a) => a.status !== "Completed");
  const done = (data ?? []).filter((a) => a.status === "Completed");

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <div className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <Smartphone className="size-4 text-muted" aria-hidden /> Field tasks
            </h1>
            <p className="text-xs text-muted">{user?.name}</p>
          </div>
          <div className="flex items-center gap-2" role="status" aria-live="polite" data-testid="sync-status">
            {online ? (
              <Badge tone="ok">
                <Wifi /> Online
              </Badge>
            ) : (
              <Badge tone="danger">
                <WifiOff /> Offline
              </Badge>
            )}
            <Badge tone={items.length > 0 ? "warn" : "neutral"}>
              <CloudUpload /> {syncing ? "Syncing…" : `${items.length} queued`}
            </Badge>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{lastSyncedAt ? `Last synced ${fmtTime(lastSyncedAt)}` : "Not synced yet this session"}</span>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={forceOffline} onChange={(e) => setForceOffline(e.target.checked)} className="accent-[var(--color-accent)]" data-testid="simulate-offline" />
              Simulate offline
            </label>
            <Button variant="secondary" size="sm" disabled={!online || items.length === 0 || syncing} onClick={() => void sync()}>
              <RefreshCw /> Sync now
            </Button>
          </div>
        </div>
        {items.some((i) => i.error) ? <p className="mt-1 text-xs text-danger-fg">Last sync error: {items.find((i) => i.error)?.error}</p> : null}
      </div>

      <div className="space-y-3 p-4">
        {isLoading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28" />)
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : active.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No open tasks">
            Pickups assigned to your team's vehicles appear here once a plan is approved or proposed.
          </EmptyState>
        ) : (
          active.map((a) => <TaskCard key={a.assignment_id} a={a} open={open === a.assignment_id} onToggle={() => setOpen(open === a.assignment_id ? null : a.assignment_id)} online={online} />)
        )}
        {done.length > 0 ? (
          <p className="pt-2 text-center text-xs text-muted">
            {done.length} completed task{done.length > 1 ? "s" : ""} · {fmtNum(done.reduce((s, a) => s + a.people_count, 0))} people delivered
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TaskCard({ a, open, onToggle, online }: { a: AssignmentView; open: boolean; onToggle: () => void; online: boolean }) {
  const { items, enqueue } = useSyncQueue();
  const qc = useQueryClient();
  const { data: households, isLoading } = useHouseholds(open ? a.assignment_id : null);
  const queuedPickups = pendingPickups(items, a.assignment_id);
  const queuedArrival = pendingArrival(items, a.assignment_id);
  const pickedCount = (households ?? []).filter((h) => h.status !== "Awaiting" || queuedPickups.has(h.household_id)).length;

  const act = async (action: QueuedAction) => {
    if (!online) {
      enqueue(action);
      toast.info("Saved offline – will sync when back online");
      return;
    }
    try {
      await perform(action);
      void qc.invalidateQueries();
    } catch (e) {
      enqueue(action);
      toast.warning(`Queued for retry: ${errorMessage(e)}`);
    }
  };

  return (
    <Card className={cn("overflow-hidden", a.severity >= 4 && "border-l-4 border-l-caution")} data-testid="field-task">
      <button className="w-full cursor-pointer p-4 text-left" onClick={onToggle} aria-expanded={open}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-semibold">
              <MapPin className="size-4 shrink-0 text-danger" aria-hidden /> {a.zone_name}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
              <Navigation className="size-3.5 shrink-0" aria-hidden /> to {a.shelter_name}
            </p>
          </div>
          <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={a.severity} compact />
          <AssignmentStatusBadge status={a.status} />
          <Badge tone="neutral">
            {fmtNum(a.people_count)} people · {a.ext.household_ids.length} households
          </Badge>
          <Badge tone="info">ETA {fmtSim(a.ext.dispatch_minute + a.ext.eta_minutes)}</Badge>
          {a.ext.explanation.required_facilities.length > 0 ? <Badge tone="violet">needs {a.ext.explanation.required_facilities.join(" + ").toLowerCase()}</Badge> : null}
          {queuedPickups.size > 0 || queuedArrival ? <Badge tone="warn">pending sync</Badge> : null}
        </div>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-xs text-muted">
            Route: {a.route_label} · one-way {fmtMinutes(a.ext.explanation.cost.travel_time)}
          </p>
          <RouteMiniMap a={a} />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Pickup list <span className="text-muted">({pickedCount}/{households?.length ?? 0})</span>
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={!households || households.every((h) => h.status !== "Awaiting" || queuedPickups.has(h.household_id))}
              onClick={() =>
                void act({ kind: "pickup", assignment_id: a.assignment_id, household_ids: (households ?? []).filter((h) => h.status === "Awaiting" && !queuedPickups.has(h.household_id)).map((h) => h.household_id) })
              }
            >
              Mark all picked up
            </Button>
          </div>
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {(households ?? []).map((h) => {
                const picked = h.status !== "Awaiting" || queuedPickups.has(h.household_id);
                return (
                  <li key={h.household_id} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      id={`hh-${h.household_id}`}
                      className="size-5 accent-[var(--color-accent)]"
                      checked={picked}
                      disabled={picked}
                      onChange={() => void act({ kind: "pickup", assignment_id: a.assignment_id, household_ids: [h.household_id] })}
                    />
                    <label htmlFor={`hh-${h.household_id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                      <span className="font-medium">{h.head_name}</span> <span className="text-muted">· {h.size} people</span>
                      <span className="block text-xs text-muted">
                        {h.household_id}
                        {h.medical ? " · medical" : ""}
                        {h.disabled ? " · wheelchair" : ""}
                        {h.elderly ? ` · ${h.elderly} elderly` : ""}
                        {h.pets ? " · pets" : ""}
                      </span>
                    </label>
                    {queuedPickups.has(h.household_id) ? <Badge tone="warn">queued</Badge> : h.status !== "Awaiting" ? <Badge tone="ok">{h.status}</Badge> : null}
                  </li>
                );
              })}
            </ul>
          )}
          <Button className="h-12 w-full text-base" variant="success" disabled={queuedArrival || pickedCount === 0} onClick={() => void act({ kind: "arrived", assignment_id: a.assignment_id })}>
            <CheckCircle2 /> {queuedArrival ? "Arrival queued" : "Arrived at shelter"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function RouteMiniMap({ a }: { a: AssignmentView }) {
  const { data: routes } = useRoutes();
  const { data: shelters } = useShelters();
  const route = routes?.find((r) => r.route_id === a.route_id);
  const shelter = shelters?.filter((s) => s.shelter_id === a.shelter_id);
  if (!route || route.ext.path.length === 0) return null;
  return (
    <div className="h-44 overflow-hidden rounded-lg border border-border">
      <Suspense fallback={<Skeleton className="h-full w-full" />}>
        <GlobeView
          variant="embedded"
          data={{ routes: [route], shelters: shelter }}
          highlightRouteIds={[route.route_id]}
          focus={{ kind: "route", id: route.route_id }}
          className="relative h-full w-full"
        />
      </Suspense>
    </div>
  );
}
