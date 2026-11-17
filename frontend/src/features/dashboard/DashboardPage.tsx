import { ListChecks } from "lucide-react";
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
    <div className="flex flex-col xl:h-full xl:min-h-[640px] xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col xl:min-h-0">
        <div className="relative h-[60vh] min-h-[360px] xl:h-auto xl:flex-1" aria-label="Operations map" role="region">
          {ready ? (
            <OpsMap zones={zones.data} shelters={shelters.data} routes={routes.data} vehicles={vehicles.data} assignments={assignments.data} />
          ) : (
            <Skeleton className="h-full w-full rounded-none" />
          )}
          {!planLoading && !plan && can("plan:generate") ? (
            <div className="absolute left-1/2 top-4 z-[1050] w-[min(92%,30rem)] -translate-x-1/2 rounded-lg border border-border bg-surface p-4 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]">
              <p className="font-medium">No evacuation plan yet</p>
              <p className="mt-0.5 text-sm text-muted">The engine will propose shelter assignments for every household; you approve or override them.</p>
              <Button className="mt-3" onClick={() => generate.mutate(strategy)} disabled={generate.isPending} data-testid="generate-plan">
                <ListChecks /> {generate.isPending ? "Generating…" : "Generate plan"}
              </Button>
            </div>
          ) : null}
        </div>
        <EventFeed className="h-52 shrink-0 border-t border-border bg-surface" />
      </div>
      <aside className="w-full shrink-0 border-t border-border bg-surface xl:w-[380px] xl:overflow-y-auto xl:border-t-0 xl:border-l" aria-label="Key performance indicators">
        <KpiPanel />
      </aside>
    </div>
  );
}
