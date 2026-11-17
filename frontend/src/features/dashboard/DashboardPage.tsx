/**
 * Command Dashboard. The map is the hero and fills the screen; the event log, the selection details
 * and the measures dock beside it and can each be collapsed.
 */
import { ListChecks, PanelRightClose, PanelRightOpen } from "lucide-react";
import { lazy, Suspense } from "react";
import { MapDetail } from "@/components/map/MapDetail";
import { useMapStore } from "@/components/map/mapStore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { useGeneratePlan, usePlan } from "@/hooks/queries";
import { useSession } from "@/hooks/session";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { EventFeed } from "./EventFeed";
import { KpiPanel } from "./KpiPanel";

const OpsGlobe = lazy(() => import("@/components/map/OpsGlobe"));

export function DashboardPage() {
  const { data: plan, isLoading: planLoading } = usePlan();
  const generate = useGeneratePlan();
  const strategy = useUiStore((s) => s.strategy);
  const { can } = useSession();
  const dockOpen = useMapStore((s) => s.dockOpen);
  const setDockOpen = useMapStore((s) => s.setDockOpen);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="relative h-[62vh] min-h-[420px] min-w-0 flex-1 lg:h-full">
        <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
          <OpsGlobe variant="full" />
        </Suspense>

        {!planLoading && !plan && can("plan:generate") ? (
          <div className="absolute top-14 left-1/2 z-30 w-[min(92%,28rem)] -translate-x-1/2 rounded-md border border-border bg-surface p-4 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)]">
            <p className="font-medium">No evacuation plan yet</p>
            <p className="mt-1 text-sm text-muted">
              The planner will propose a shelter, road and vehicle for every household. You approve or override each assignment.
            </p>
            <Button className="mt-3" onClick={() => generate.mutate(strategy)} disabled={generate.isPending} data-testid="generate-plan">
              <ListChecks /> {generate.isPending ? "Generating…" : "Generate plan"}
            </Button>
          </div>
        ) : null}

        <MapDetail className="absolute top-14 right-3 z-30 max-h-[calc(100%-5rem)] overflow-y-auto" />
        <EventFeed className="absolute bottom-6 left-3 z-20 w-[min(30rem,calc(100%-1.5rem))]" />

        <button
          type="button"
          onClick={() => setDockOpen(!dockOpen)}
          aria-label={dockOpen ? "Hide measures panel" : "Show measures panel"}
          aria-expanded={dockOpen}
          className="absolute right-3 bottom-6 z-20 hidden cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface/95 px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-fg lg:flex"
        >
          {dockOpen ? <PanelRightClose className="size-4" strokeWidth={1.75} /> : <PanelRightOpen className="size-4" strokeWidth={1.75} />}
          {dockOpen ? "Hide measures" : "Measures"}
        </button>
      </div>

      <aside
        aria-label="Key measures"
        className={cn(
          "shrink-0 overflow-y-auto border-border bg-surface max-lg:border-t lg:w-[22rem] lg:border-l",
          !dockOpen && "lg:hidden",
        )}
      >
        <KpiPanel />
      </aside>
    </div>
  );
}
