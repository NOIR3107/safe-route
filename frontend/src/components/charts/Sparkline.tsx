/**
 * Small trend line for stat tiles. 2px line in the de-emphasis ink, the latest point in the accent.
 * Hover (or focus) shows the value at the nearest point. One series, so no legend: the tile label
 * names it. The accessible name states first and last value.
 */
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface SparkPoint {
  /** Operation minute (T+). */
  x: number;
  y: number;
}

interface Props {
  points: SparkPoint[];
  label: string;
  format?: (v: number) => string;
  height?: number;
  className?: string;
}

export function Sparkline({ points, label, format = (v) => v.toLocaleString("en-IN"), height = 28, className }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  if (points.length < 2) {
    return <p className={cn("text-[11px] text-muted", className)} style={{ height }}>Not enough history yet</p>;
  }
  const w = 100;
  const h = height;
  const pad = 3;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const sx = (x: number) => (x1 === x0 ? w / 2 : ((x - x0) / (x1 - x0)) * w);
  const sy = (y: number) => (y1 === y0 ? h / 2 : h - pad - ((y - y0) / (y1 - y0)) * (h - pad * 2));
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" ");
  const last = points[points.length - 1]!;
  const shown = hover != null ? points[hover]! : null;
  const summary = `${label}: ${format(points[0]!.y)} at T+${points[0]!.x} to ${format(last.y)} at T+${last.x}`;

  const nearest = (clientX: number, rect: DOMRect) => {
    const x = x0 + ((clientX - rect.left) / rect.width) * (x1 - x0);
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(points[best]!.x - x)) best = i;
    });
    return best;
  };

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        width="100%"
        height={h}
        role="img"
        aria-labelledby={titleId}
        tabIndex={0}
        className="block overflow-visible rounded-sm outline-offset-2"
        onPointerMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(points.length - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((i) => Math.max(0, (i ?? points.length - 1) - 1));
          if (e.key === "ArrowRight") setHover((i) => Math.min(points.length - 1, (i ?? 0) + 1));
        }}
      >
        <title id={titleId}>{summary}</title>
        <path d={d} fill="none" stroke="var(--color-muted)" strokeOpacity={0.7} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {shown ? (
          <line x1={sx(shown.x)} x2={sx(shown.x)} y1={0} y2={h} stroke="var(--color-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      {/* points drawn in HTML so they stay round when the SVG stretches */}
      <span
        aria-hidden
        className="pointer-events-none absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal ring-2 ring-surface"
        style={{ left: `${sx(last.x)}%`, top: sy(last.y) }}
      />
      {shown ? (
        <span
          className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-[4px] bg-fg px-1.5 py-0.5 text-[11px] whitespace-nowrap text-bg tabular-nums"
          style={{ left: `${Math.min(85, Math.max(15, sx(shown.x)))}%` }}
        >
          T+{shown.x} · {format(shown.y)}
        </span>
      ) : null}
    </div>
  );
}

/** Ratio against a limit: solid = present, lighter = on the way. Fill colour carries the status. */
export function Meter({ present, inbound, tone, label }: { present: number; inbound: number; tone: string; label: string }) {
  const p = Math.max(0, Math.min(1, present));
  const t = Math.max(p, Math.min(1, present + inbound));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(t * 100)}
      className="relative h-1.5 w-full overflow-hidden rounded-[2px] bg-surface-2"
    >
      <div className="absolute inset-y-0 left-0 opacity-40 transition-[width] duration-500" style={{ width: `${t * 100}%`, background: tone }} />
      <div className="absolute inset-y-0 left-0 transition-[width] duration-500" style={{ width: `${p * 100}%`, background: tone }} />
    </div>
  );
}
