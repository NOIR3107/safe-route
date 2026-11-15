import { AlertOctagon, CheckCircle2, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { OpsEventLevel } from "@/api/extensions";
import { Skeleton } from "@/components/ui/primitives";
import { useOpsEvents } from "@/hooks/queries";
import { cn, fmtSim } from "@/lib/utils";
import { TONE_TEXT, type Tone } from "@/lib/semantic";
import { apiMode } from "@/api/client";

const LEVEL: Record<OpsEventLevel, { icon: LucideIcon; tone: Tone; label: string }> = {
  info: { icon: Info, tone: "info", label: "Info" },
  warning: { icon: TriangleAlert, tone: "warn", label: "Warning" },
  critical: { icon: AlertOctagon, tone: "danger", label: "Critical" },
  success: { icon: CheckCircle2, tone: "ok", label: "Resolved" },
};

export function EventFeed({ className, limit = 40 }: { className?: string; limit?: number }) {
  const { data, isLoading } = useOpsEvents();
  return (
    <section className={cn("flex min-h-0 flex-col", className)} aria-labelledby="feed-title">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 id="feed-title" className="text-xs font-semibold uppercase tracking-wider text-muted">
          Live event feed
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-ok" />
          </span>
          Live
        </span>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto" aria-live="polite" aria-relevant="additions">
        {isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="px-4 py-2">
                <Skeleton className="h-4 w-3/4" />
              </li>
            ))
          : (data ?? []).slice(0, limit).map((e) => {
              const l = LEVEL[e.level];
              return (
                <li key={e.id} className="flex items-start gap-3 border-b border-border/60 px-4 py-2 text-sm last:border-0">
                  <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-muted tabular-nums">{apiMode === "mock" ? fmtSim(e.sim_minute) : ""}</span>
                  <l.icon className={cn("mt-0.5 size-4 shrink-0", TONE_TEXT[l.tone])} aria-label={l.label} />
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{e.title}</p>
                    <p className="text-xs text-muted">{e.detail}</p>
                  </div>
                </li>
              );
            })}
        {data && data.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted">No events yet.</li> : null}
      </ol>
    </section>
  );
}
