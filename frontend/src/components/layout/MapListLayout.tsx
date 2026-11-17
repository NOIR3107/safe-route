/**
 * List pages that also show the map (zones, shelters, fleet, routes). On very wide screens the map
 * pins beside the table; otherwise it sits above it, because the tables need the full width.
 */
import type { ReactNode } from "react";
import { EmbeddedMap } from "@/components/map/EmbeddedMap";
import type { MapSelection } from "@/components/map/mapStore";

export function MapListLayout({ focus, children, footnote }: { focus?: MapSelection; children: ReactNode; footnote?: ReactNode }) {
  return (
    <div className="grid gap-5 p-4 sm:p-7 2xl:grid-cols-[minmax(0,1fr)_minmax(400px,34%)] 2xl:items-start">
      <div className="2xl:sticky 2xl:top-7 2xl:order-2">
        <EmbeddedMap focus={focus} className="h-72 shadow-panel sm:h-[22rem] 2xl:h-[calc(100dvh-12rem)]" />
      </div>
      <div className="min-w-0 space-y-3 2xl:order-1">
        {children}
        {footnote ? <p className="px-1 text-xs text-muted">{footnote}</p> : null}
      </div>
    </div>
  );
}
