/**
 * Top-bar status: which data you are looking at (LIVE / DRILL / REPLAY), the operation clock, and
 * whether the numbers on screen are current. Never lets stale numbers pass as live.
 */
import { useLive } from "@/api/live";
import { useClock } from "@/hooks/queries";
import { useNow } from "@/hooks/useNow";
import { cn, fmtSim } from "@/lib/utils";

export function OpsStatus() {
  const status = useLive((s) => s.status);
  const lastMessageAt = useLive((s) => s.lastMessageAt);
  const reconnectInAt = useLive((s) => s.reconnectInAt);
  const clock = useClock().data;
  const now = useNow(status === "live" ? 5_000 : 1_000);

  const ago = lastMessageAt ? Math.max(0, Math.round((now - lastMessageAt) / 1000)) : null;
  const retryIn = reconnectInAt ? Math.max(0, Math.round((reconnectInAt - now) / 1000)) : null;
  const mode = clock?.feed.replay ? "REPLAY" : clock?.mode === "drill" ? "DRILL" : "LIVE";
  const running = clock?.phase === "running";

  const conn = {
    connecting: { dot: "bg-muted", text: "Connecting…" },
    live: { dot: "bg-ok", text: "Live" },
    stale: { dot: "bg-warn", text: `Stale · last update ${ago ?? "?"} s ago` },
    disconnected: { dot: "bg-danger", text: `Disconnected${retryIn != null ? ` · retrying in ${retryIn} s` : ""}` },
  }[status];

  return (
    <div className="flex items-center gap-3 text-xs" data-testid="ops-status">
      <span
        className={cn(
          "rounded-[3px] px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wide",
          mode === "LIVE" ? "border border-border text-muted" : "bg-warn/15 text-warn-fg ring-1 ring-warn/40",
        )}
        title={
          mode === "REPLAY"
            ? "Recorded feed being replayed (development fallback) - not live data"
            : mode === "DRILL"
              ? "Everyone is working on a drill copy of the data. Live data is not changed."
              : "Live operational data"
        }
        data-testid="data-mode"
      >
        {mode}
      </span>
      {clock ? (
        <span className="font-mono text-[13px] font-medium tabular-nums" title="Operation clock (minutes since the incident started)">
          {fmtSim(clock.sim_minute)}
          {clock.mode === "drill" ? <span className="ml-1 text-muted">{running ? `${clock.speed}×` : clock.phase}</span> : null}
        </span>
      ) : null}
      <span className="flex items-center gap-1.5 text-muted" role="status" aria-live="polite" data-testid="connection-status" data-state={status}>
        <span className="relative flex size-2">
          {status === "live" ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-30 [animation-duration:2.5s]" /> : null}
          <span className={cn("relative inline-flex size-2 rounded-full", conn.dot)} />
        </span>
        <span className="hidden lg:inline">{conn.text}</span>
      </span>
      {clock?.feed.source && clock.feed.stale && clock.mode === "live" ? (
        <span className="hidden text-warn-fg xl:inline" title="No message from the live feed recently">
          Feed quiet {clock.feed.seconds_since != null ? fmtQuiet(clock.feed.seconds_since) : ""}
        </span>
      ) : null}
    </div>
  );
}


/** 42 s, 21 min, 3 h 5 min */
function fmtQuiet(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
