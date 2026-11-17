/** The same map as the dashboard, in a smaller frame for list pages. Clicking a row focuses it. */
import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { MapDetail } from "./MapDetail";
import type { MapSelection } from "./mapStore";

const OpsGlobe = lazy(() => import("./OpsGlobe"));

export function EmbeddedMap({ focus, className }: { focus?: MapSelection; className?: string }) {
  return (
    <div className={cn("relative h-80 overflow-hidden rounded-lg border border-border", className)}>
      <ErrorBoundary compact>
        <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
          <OpsGlobe variant="embedded" focus={focus} />
        </Suspense>
      </ErrorBoundary>
      <MapDetail className="absolute top-3 right-3 z-30 max-h-[calc(100%-1.5rem)] overflow-y-auto" />
    </div>
  );
}
