/**
 * Event log docked over the map: compact, filterable, collapsible. Severity is a bar in the left
 * margin plus a hidden word for screen readers, so it never relies on colour alone. A newly arrived
 * event is briefly highlighted (motion that carries information; skipped with reduced motion).
 */
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OpsEventLevel } from "@/api/extensions";
import { useMapStore } from "@/components/map/mapStore";
import { Skeleton } from "@/components/ui/primitives";
import { useOpsEvents } from "@/hooks/queries";
import { cn, fmtSim } from "@/lib/utils";

const LEVEL: Record<OpsEventLevel, { bar: string; word: string }> = {
  critical: { bar: "bg-danger", word: "Critical" },
  warning: { bar: "bg-warn", word: "Warning" },
  success: { bar: "bg-ok", word: "Resolved" },
  info: { bar: "bg-border", word: "Info" },
};

type Filter = "all" | "critical" | "warning";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["critical", "Critical"],
  ["warning", "Warnings"],
];

export function EventFeed({ className }: { className?: string }) {
  const { data, isLoading, isError } = useOpsEvents();
  const open = useMapStore((s) => s.logOpen);
  const setOpen = useMapStore((s) => s.setLogOpen);
  const [filter, setFilter] = useState<Filter>("all");
  const seen = useRef<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);

  const newest = data?.[0]?.id ?? null;
  useEffect(() => {
    if (newest == null) return;
    if (seen.current != null && newest > seen.current) {
      setFresh(newest);
      const t = setTimeout(() => setFresh(null), 2500);
      seen.current = newest;
      return () => clearTimeout(t);
    }
    seen.current = newest;
  }, [newest]);

  const rows = (data ?? []).filter((e) => filter === "all" || e.level === filter || (filter === "warning" && e.level === "critical"));
  const counts = {
    critical: (data ?? []).filter((e) => e.level === "critical").length,
    warning: (data ?? []).filter((e) => e.level === "warning").length,
  };

  return (
    <section
      aria-labelledby="log-title"
      className={cn("flex flex-col rounded-md border border-border bg-surface/95 shadow-[0_8px_24px_-10px_rgb(0_0_0/0.45)]", className)}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="event-log"
          className="flex cursor-pointer items-center gap-1.5 text-[13px] font-medium"
        >
          <ChevronDown className={cn("size-4 text-muted transition-transform", !open && "-rotate-90")} strokeWidth={1.75} aria-hidden />
          <span id="log-title">Event log</span>
          <span className="text-xs font-normal text-muted tabular-nums">{data?.length ?? 0}</span>
        </button>
        {open ? (
          <div role="radiogroup" aria-label="Filter events" className="ml-auto flex gap-0.5 text-xs">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                role="radio"
                aria-checked={filter === key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "cursor-pointer rounded-[4px] px-2 py-0.5 transition-colors",
                  filter === key ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg",
                )}
              >
                {label}
                {key !== "all" ? <span className="ml-1 tabular-nums opacity-70">{counts[key]}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {open ? (
        <ol id="event-log" className="max-h-52 overflow-y-auto border-t border-border" aria-live="polite" aria-relevant="additions">
          {isLoading
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="px-3 py-2">
                  <Skeleton className="h-4 w-3/4" />
                </li>
              ))
            : rows.slice(0, 60).map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    "relative grid grid-cols-[3.25rem_1fr] gap-x-2 py-1.5 pr-3 pl-4 text-[12.5px] transition-colors duration-700",
                    fresh === e.id ? "bg-signal/10" : "hover:bg-surface-2/50",
                  )}
                >
                  <span aria-hidden className={cn("absolute inset-y-1 left-1.5 w-[3px] rounded-full", LEVEL[e.level].bar)} />
                  <span className="pt-px font-mono text-[11.5px] text-muted tabular-nums">{fmtSim(e.sim_minute)}</span>
                  <span className="min-w-0">
                    <span className="sr-only">{LEVEL[e.level].word}: </span>
                    <span className="font-medium">{e.title}</span>
                    {e.detail ? <span className="block truncate text-xs text-muted">{e.detail}</span> : null}
                  </span>
                </li>
              ))}
          {isError ? <li className="px-4 py-4 text-sm text-danger-fg">The event log could not be loaded.</li> : null}
          {data && rows.length === 0 ? <li className="px-4 py-4 text-center text-sm text-muted">No events for this filter.</li> : null}
        </ol>
      ) : null}
    </section>
  );
}
