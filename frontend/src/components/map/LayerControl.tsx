/** Collapsible layer control and legend for the map (top-left), plus the 2D / 3D tilt switch. */
import { ChevronDown, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { useUiStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { INK, routeStyle, severityHex, toneHex } from "./mapStyle";
import { useMapStore, type MapLayers } from "./mapStore";

const LAYER_LABELS: [keyof MapLayers, string][] = [
  ["zones", "Zones by severity"],
  ["shelters", "Shelters (ring = % full)"],
  ["routes", "Routes"],
  ["vehicles", "Vehicles"],
  ["assignments", "Assignment lines"],
  ["imagery", "Satellite imagery"],
];

export function LayerControl({ stats }: { stats: { fps: number; entities: number } }) {
  const theme = useUiStore((s) => s.theme);
  const { layers, toggleLayer, layerPanelOpen, setLayerPanelOpen, tilt3d, setTilt3d } = useMapStore();
  const ink = INK[theme];

  return (
    <>
      <div className="absolute top-3 left-3 z-20 w-60 rounded-md border border-border bg-surface/95 text-[13px] shadow-[0_6px_20px_-8px_rgb(0_0_0/0.4)]">
        <button
          type="button"
          onClick={() => setLayerPanelOpen(!layerPanelOpen)}
          aria-expanded={layerPanelOpen}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 font-medium"
        >
          <Layers className="size-4 text-muted" strokeWidth={1.75} aria-hidden />
          Layers
          <ChevronDown className={cn("ml-auto size-4 text-muted transition-transform", layerPanelOpen && "rotate-180")} strokeWidth={1.75} aria-hidden />
        </button>
        {layerPanelOpen ? (
          <div className="space-y-3 border-t border-border px-3 py-3">
            <ul className="space-y-1.5">
              {LAYER_LABELS.map(([key, label]) => (
                <li key={key}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t border-border pt-3 text-xs text-muted">
              <Legend label="Severity">
                {([1, 2, 3, 4, 5] as const).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1">
                    <span className="size-2.5 rounded-[2px]" style={{ background: severityHex(s, theme) }} />
                    {s}
                  </span>
                ))}
              </Legend>
              <Legend label="Shelter">
                <Swatch color={toneHex("ok", theme)} label="Open" ring />
                <Swatch color={toneHex("warn", theme)} label="Near full" ring />
                <Swatch color={toneHex("danger", theme)} label="Full" ring />
                <Swatch color={ink.soft} label="Closed" ring dashed />
              </Legend>
              <Legend label="Route">
                <Line style={routeStyle("Open", true, theme)} label="In use" />
                <Line style={routeStyle("Congested", true, theme)} label="Congested" />
                <Line style={routeStyle("Blocked", false, theme)} label="Blocked" />
                <Line style={routeStyle("Cleared", false, theme)} label="Cleared" />
              </Legend>
            </div>
            <p className="border-t border-border pt-2 text-[11px] text-muted tabular-nums" data-testid="map-stats">
              {stats.fps} fps · {stats.entities} objects
            </p>
          </div>
        ) : null}
      </div>

      <div role="radiogroup" aria-label="Map view" className="absolute top-3 right-3 z-20 flex rounded-md border border-border bg-surface/95 p-0.5 text-xs">
        {(["2D", "3D"] as const).map((v) => {
          const active = (v === "3D") === tilt3d;
          return (
            <button
              key={v}
              role="radio"
              aria-checked={active}
              type="button"
              onClick={() => setTilt3d(v === "3D")}
              className={cn(
                "cursor-pointer rounded-[4px] px-2.5 py-1 font-medium transition-colors",
                active ? "bg-fg text-bg" : "text-muted hover:text-fg",
              )}
            >
              {v}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Legend({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="w-14 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Swatch({ color, label, ring, dashed }: { color: string; label: string; ring?: boolean; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn("size-2.5", ring ? "rounded-full border-2 bg-transparent" : "rounded-[2px]", dashed && "border-dashed")}
        style={ring ? { borderColor: color } : { background: color }}
      />
      {label}
    </span>
  );
}

function Line({ style, label }: { style: ReturnType<typeof routeStyle>; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block w-4"
        style={{ borderTop: `${Math.max(1.5, style.width)}px ${style.dashed ? "dashed" : "solid"} ${style.color}`, opacity: Math.max(0.5, style.alpha) }}
      />
      {label}
    </span>
  );
}
