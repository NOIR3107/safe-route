/** Interactive explainer: change one road and one shelter, watch the planner's cost respond. */
import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { routeCost, SOFT_FACILITIES, type CostInput, type RoadStatus, type RouteRisk } from "./cost";
import { EASE } from "./ease";

const SCALE = 260; // bar length in weighted minutes; keeps changes visible without a background track
const SHADE: Record<string, string> = { travel: "bg-brand", risk: "bg-fg/55", facility: "bg-fg/35", utilization: "bg-fg/20" };

function Segmented<T extends string | number>({ label, options, value, onChange, render }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; render?: (v: T) => string }) {
  const id = useId();
  return (
    <div>
      <p id={id} className="text-[12.5px] font-medium text-muted">{label}</p>
      <div role="radiogroup" aria-labelledby={id} className="mt-2 flex rounded-md border border-border bg-bg p-0.5">
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={String(o)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o)}
              className={cn("relative flex-1 cursor-pointer rounded-[5px] px-2 py-1.5 text-[12.5px] font-medium transition-colors", on ? "text-fg" : "text-muted hover:text-fg")}
            >
              {on ? <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-[5px] bg-surface-2 shadow-panel ring-1 ring-border" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
              <span className="relative">{render ? render(o) : String(o)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = value.toFixed(1);
      return;
    }
    const c = animate(prev.current, value, { duration: 0.5, ease: EASE, onUpdate: (v) => (el.textContent = v.toFixed(1)) });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce]);
  return <span ref={ref}>{value.toFixed(1)}</span>;
}

export function CostPlayground() {
  const [input, setInput] = useState<CostInput>({ travelMin: 24, status: "Congested", severity: 4, risk: "Moderate", missing: ["Water"], overNinety: false });
  const set = <K extends keyof CostInput>(k: K, v: CostInput[K]) => setInput((s) => ({ ...s, [k]: v }));
  const result = routeCost(input);
  const travelId = useId();

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-float sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Try the cost function</h3>
        <p className="text-[12.5px] text-muted">Real weights from the planner</p>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor={travelId} className="text-[12.5px] font-medium text-muted">Travel time on this road</label>
            <span className="font-mono text-[13px] tabular-nums">{input.travelMin} min</span>
          </div>
          <input id={travelId} type="range" min={5} max={90} step={1} value={input.travelMin} onChange={(e) => set("travelMin", Number(e.target.value))} className="mt-2.5 w-full cursor-pointer accent-brand" />
        </div>
        <Segmented<RoadStatus> label="Road status" options={["Open", "Cleared", "Congested", "Flooded"]} value={input.status} onChange={(v) => set("status", v)} />
        <Segmented<RouteRisk> label="Route risk" options={["Low", "Moderate", "High", "Severe"]} value={input.risk} onChange={(v) => set("risk", v)} />
        <Segmented<CostInput["severity"]> label="Zone severity" options={[1, 2, 3, 4, 5]} value={input.severity} onChange={(v) => set("severity", v)} />
        <div>
          <p className="text-[12.5px] font-medium text-muted">Shelter is missing</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SOFT_FACILITIES.map((f) => {
              const on = input.missing.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("missing", on ? input.missing.filter((m) => m !== f) : [...input.missing, f])}
                  className={cn("cursor-pointer rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors", on ? "border-fg/40 bg-surface-2 text-fg" : "border-border text-muted hover:text-fg")}
                >
                  {f}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={input.overNinety}
              onClick={() => set("overNinety", !input.overNinety)}
              className={cn("cursor-pointer rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors", input.overNinety ? "border-fg/40 bg-surface-2 text-fg" : "border-border text-muted hover:text-fg")}
            >
              Spare room (fills past 90%)
            </button>
          </div>
        </div>
      </div>

      <div className="mt-7 border-t border-border pt-6" aria-live="polite">
        {result ? (
          <>
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-[2.6rem] leading-none font-medium tracking-[-0.04em] tabular-nums">
                <AnimatedNumber value={result.total} />
              </span>
              <span className="text-[13px] text-muted">weighted minutes per person</span>
            </div>
            <div className="mt-5 flex h-2 gap-0.5" aria-hidden>
              {result.terms.map((t) => (
                <motion.span key={t.key} layout className={cn("h-full rounded-[2px]", SHADE[t.key])} animate={{ width: `${Math.min(100, (t.value / SCALE) * 100)}%` }} transition={{ duration: 0.5, ease: EASE }} />
              ))}
            </div>
            <ul className="mt-5 space-y-2">
              {result.terms.map((t) => (
                <li key={t.key} className="flex items-start gap-3 text-[12.5px]">
                  <span aria-hidden className={cn("mt-1 size-2 shrink-0 rounded-[2px]", SHADE[t.key])} />
                  <span className="w-20 shrink-0 text-muted">{t.label}</span>
                  <span className="min-w-0 flex-1 font-mono text-[11.5px] leading-relaxed text-fg/85">{t.note}</span>
                  <span className="font-mono tabular-nums">{t.value}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="rounded-md border border-danger/35 bg-danger/10 px-4 py-4">
            <p className="text-[15px] font-medium text-danger-fg">Ruled out</p>
            <p className="mt-1 text-[13px] leading-relaxed text-danger-fg/90">Flooded roads fail a hard constraint. No cost makes them acceptable, so the planner never assigns anyone to one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
