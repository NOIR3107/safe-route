import { Sparkles } from "lucide-react";
import { OpsMap } from "@/components/map/OpsMap";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { useAssignments, useGeneratePlan, usePlan, useRoutes, useShelters, useVehicles, useZones } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import { useUiStore } from "@/stores/ui";
import { EventFeed } from "./EventFeed";
import { KpiPanel } from "./KpiPanel";

export function DashboardPage() {
  const zones = useZones();
  const shelters = useShelters();
  const routes = useRoutes();
  const vehicles = useVehicles();
  const assignments = useAssignments();
  const { data: plan, isLoading: planLoading } = usePlan();
  const generate = useGeneratePlan();
  const strategy = useUiStore((s) => s.strategy);
  const { can } = useSession();
  const ready = zones.data && shelters.data && routes.data;

  return (
    <div className="flex h-full min-h-[640px] flex-col xl:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative min-h-[360px] flex-1" aria-label="Operations map" role="region">
          {ready ? (
            <OpsMap zones={zones.data} shelters={shelters.data} routes={routes.data} vehicles={vehicles.data} assignments={assignments.data} />
          ) : (
            <Skeleton className="h-full w-full rounded-none" />
          )}
          {!planLoading && !plan && can("plan:generate") ? (
            <div className="absolute left-1/2 top-4 z-[500] w-[min(92%,30rem)] -translate-x-1/2 rounded-xl border border-accent/40 bg-surface/95 p-4 shadow-xl backdrop-blur">
              <p className="font-medium">No evacuation plan yet</p>
              <p className="mt-0.5 text-sm text-muted">The engine will propose shelter assignments for every household; you approve or override them.</p>
              <Button className="mt-3" onClick={() => generate.mutate(strategy)} disabled={generate.isPending} data-testid="generate-plan">
                <Sparkles /> {generate.isPending ? "Generating…" : "Generate plan"}
              </Button>
            </div>
          ) : null}
        </div>
        <EventFeed className="h-48 shrink-0 border-t border-border bg-surface" />
      </div>
      <aside className="w-full shrink-0 overflow-y-auto border-l border-border bg-bg xl:w-[380px]" aria-label="Key performance indicators">
        <KpiPanel />
      </aside>
    </div>
  );
}
