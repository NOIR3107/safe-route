import L, { type LatLngBoundsExpression } from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { AssignmentView, LatLng, RouteView, ShelterView, VehicleView, ZoneView } from "@/api/extensions";
import { ROUTE_STATUS, SEVERITY, SHELTER_STATUS, TONE_HEX, VEHICLE_STATUS, type Tone } from "@/lib/semantic";
import { fmtNum, fmtPct } from "@/lib/utils";
import { useUiStore, type MapLayers } from "@/stores/ui";

export interface OpsMapProps {
  zones?: ZoneView[];
  shelters?: ShelterView[];
  routes?: RouteView[];
  vehicles?: VehicleView[];
  assignments?: AssignmentView[];
  className?: string;
  showLegend?: boolean;
  /** Fit to these points instead of all zones/shelters. */
  focus?: LatLng[];
  highlightRouteIds?: number[];
  onSelectShelter?: (id: number) => void;
}

const SHELTER_GLYPH: Record<ShelterView["display_status"], string> = { Open: "✓", "Near Full": "!", Full: "✕", Closed: "–" };

function shelterIcon(s: ShelterView, hex: Record<Tone, string>): L.DivIcon {
  const style = SHELTER_STATUS[s.display_status];
  const color = hex[style.tone];
  const pct = Math.round(((s.current_occupancy + s.inbound) / s.capacity) * 100);
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-4px)">
      <div style="width:30px;height:30px;border-radius:8px;background:${color};border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#0b1220;font:700 15px/1 Inter Variable,system-ui">${SHELTER_GLYPH[s.display_status]}</div>
      <div style="margin-top:2px;padding:0 4px;border-radius:4px;background:rgba(10,16,28,.85);color:#fff;font:600 10px/16px Inter Variable,system-ui;white-space:nowrap">${pct}%</div>
    </div>`;
  return L.divIcon({ html, className: "sr-marker", iconSize: [40, 48], iconAnchor: [20, 30], popupAnchor: [0, -26] });
}

/**
 * Keeps Leaflet in sync with its container: re-measures on every resize (grid/flex layouts settle after
 * mount) and fits the bounds once the container has a real size.
 */
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const userMoved = useRef(false);
  const latest = useRef(points);
  useEffect(() => {
    latest.current = points;
  });
  useEffect(() => {
    const el = map.getContainer();
    // Keep auto-fitting while the layout settles, until the user pans or zooms themselves.
    const fit = () => {
      map.invalidateSize();
      if (userMoved.current || latest.current.length === 0 || el.clientWidth < 50 || el.clientHeight < 50) return;
      map.fitBounds(latest.current as LatLngBoundsExpression, { padding: [16, 16], maxZoom: 15, animate: false });
    };
    const stop = () => {
      userMoved.current = true;
    };
    el.addEventListener("pointerdown", stop);
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("keydown", stop);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => {
      ro.disconnect();
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("keydown", stop);
    };
  }, [map]);
  const key = points.length;
  useEffect(() => {
    const el = map.getContainer();
    if (!userMoved.current && latest.current.length > 0 && el.clientWidth >= 50 && el.clientHeight >= 50) {
      map.fitBounds(latest.current as LatLngBoundsExpression, { padding: [16, 16], maxZoom: 15, animate: false });
    }
  }, [map, key]);
  return null;
}

export function OpsMap({ zones = [], shelters = [], routes = [], vehicles = [], assignments = [], className, showLegend = true, focus, highlightRouteIds, onSelectShelter }: OpsMapProps) {
  const theme = useUiStore((s) => s.theme);
  const layers = useUiStore((s) => s.layers);
  const hex = TONE_HEX[theme];

  const activeRouteIds = useMemo(
    () => new Set(highlightRouteIds ?? assignments.filter((a) => a.status === "Scheduled" || a.status === "In Progress").map((a) => a.route_id ?? -1)),
    [assignments, highlightRouteIds],
  );
  const points = useMemo<LatLng[]>(() => {
    if (focus && focus.length > 0) return focus;
    return [
      ...zones.filter((z) => z.ext.polygon.length > 0).map((z) => z.ext.centroid),
      ...shelters.filter((s) => s.latitude != null && s.longitude != null).map((s) => [s.latitude!, s.longitude!] as LatLng),
    ];
  }, [zones, shelters, focus]);

  const sortedRoutes = useMemo(
    () =>
      routes
        .filter((r) => r.ext.path.length > 1)
        .map((r) => ({ r, active: activeRouteIds.has(r.route_id), down: r.status === "Blocked" || r.status === "Flooded" }))
        .sort((a, b) => Number(a.active || a.down) - Number(b.active || b.down)),
    [routes, activeRouteIds],
  );

  return (
    <div className={className ?? "relative h-full w-full"}>
      <MapContainer center={points[0] ?? [13.03, 80.24]} zoom={12} zoomSnap={0.25} zoomDelta={0.5} className="h-full w-full" attributionControl>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
        <FitBounds points={points} />

        {layers.zones &&
          zones
            .filter((z) => z.ext.polygon.length > 2)
            .map((z) => {
              const sev = SEVERITY[z.ext.severity];
              const done = z.population > 0 ? z.evacuated_count / z.population : 0;
              return (
                <Polygon key={`z${z.zone_id}`} positions={z.ext.polygon} pathOptions={{ color: hex[sev.tone], weight: 2, fillOpacity: 0.22 - done * 0.14, dashArray: z.ext.severity >= 4 ? undefined : "4 4" }}>
                  <Tooltip direction="center" permanent className="!border-0 !bg-transparent !p-0 !shadow-none !text-[11px] !font-semibold" opacity={1}>
                    <span style={{ color: theme === "dark" ? "#fff" : "#0f172a", textShadow: theme === "dark" ? "0 1px 2px #000" : "0 1px 2px #fff" }}>
                      {z.ext.code} · S{z.ext.severity}
                    </span>
                  </Tooltip>
                  <Popup>
                    <strong>{z.name}</strong> ({z.ext.code})<br />
                    {sev.label} · {z.priority} · risk {z.risk_level}
                    <br />
                    Evacuated {fmtNum(z.evacuated_count)} / {fmtNum(z.population)} ({fmtPct(done)})
                    <br />
                    Vulnerable: {z.vulnerable.elderly} elderly · {z.vulnerable.children} children · {z.vulnerable.disabled} disabled · {z.vulnerable.medical} medical
                  </Popup>
                </Polygon>
              );
            })}

        {layers.routes &&
          sortedRoutes.map(({ r, active, down }) => {
            const st = ROUTE_STATUS[r.status];
            const visible = active || down;
            return (
              <Polyline
                key={`r${r.route_id}`}
                positions={r.ext.path}
                pathOptions={{
                  color: hex[st.tone],
                  weight: visible ? 4 : 2,
                  opacity: visible ? 0.95 : 0.22,
                  dashArray: down ? "2 8" : r.status === "Congested" ? "10 6" : r.status === "Cleared" ? "1 6" : undefined,
                  lineCap: "round",
                }}
              >
                <Tooltip sticky>
                  R{r.route_id}: {r.source} → {r.destination} · {st.label} · {r.travel_time} min
                  {r.ext.via.length ? ` · via ${r.ext.via.join(", ")}` : ""}
                </Tooltip>
              </Polyline>
            );
          })}

        {layers.shelters &&
          shelters
            .filter((s) => s.latitude != null && s.longitude != null)
            .map((s) => (
              <Marker
                key={`s${s.shelter_id}`}
                position={[s.latitude!, s.longitude!]}
                icon={shelterIcon(s, hex)}
                keyboard
                title={`${s.name}: ${SHELTER_STATUS[s.display_status].label}`}
                eventHandlers={onSelectShelter ? { click: () => onSelectShelter(s.shelter_id) } : undefined}
              >
                <Popup>
                  <strong>{s.name}</strong>
                  <br />
                  {SHELTER_STATUS[s.display_status].label} · {fmtNum(s.current_occupancy)} present + {fmtNum(s.inbound)} inbound / {fmtNum(s.capacity)}
                  <br />
                  Reserve {fmtNum(s.reserved)} · available {fmtNum(s.available)}
                  <br />
                  Facilities: {s.available_facilities.join(", ") || "none"}
                </Popup>
              </Marker>
            ))}

        {layers.vehicles &&
          vehicles
            .filter((v) => v.ext.position[0] !== 0)
            .map((v) => {
              const st = VEHICLE_STATUS[v.status];
              const moving = v.status === "In Transit";
              return (
                <CircleMarker
                  key={`v${v.vehicle_id}`}
                  center={v.ext.position}
                  radius={moving ? 5 : 3.5}
                  pathOptions={{ color: theme === "dark" ? "#0a101c" : "#ffffff", weight: 1.5, fillColor: hex[st.tone], fillOpacity: v.status === "Available" ? 0.6 : 1 }}
                >
                  <Tooltip>
                    {v.vehicle_type} {v.plate_number} · {st.label} · {v.capacity} seats
                  </Tooltip>
                </CircleMarker>
              );
            })}
      </MapContainer>
      {showLegend ? <MapLegend /> : null}
    </div>
  );
}

function MapLegend() {
  const layers = useUiStore((s) => s.layers);
  const toggle = useUiStore((s) => s.toggleLayer);
  const theme = useUiStore((s) => s.theme);
  const hex = TONE_HEX[theme];
  const items: { key: keyof MapLayers; label: string }[] = [
    { key: "zones", label: "Zones" },
    { key: "shelters", label: "Shelters" },
    { key: "routes", label: "Routes" },
    { key: "vehicles", label: "Vehicles" },
  ];
  return (
    <div className="absolute bottom-3 left-3 z-[500] max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-surface/95 p-2.5 text-xs shadow-lg backdrop-blur">
      <fieldset className="flex flex-wrap gap-x-3 gap-y-1">
        <legend className="sr-only">Map layers</legend>
        {items.map((i) => (
          <label key={i.key} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={layers[i.key]} onChange={() => toggle(i.key)} className="accent-[var(--color-accent)]" />
            {i.label}
          </label>
        ))}
      </fieldset>
      <div className="mt-2 hidden grid-cols-[auto_1fr] gap-x-2 gap-y-1 sm:grid">
        <span className="text-muted">Severity</span>
        <span className="flex items-center gap-1">
          {([1, 2, 3, 4, 5] as const).map((s) => (
            <span key={s} className="inline-flex h-4 w-5 items-center justify-center rounded-sm text-[10px] font-semibold text-black" style={{ background: hex[SEVERITY[s].tone] }}>
              {s}
            </span>
          ))}
        </span>
        <span className="text-muted">Shelter</span>
        <span className="flex flex-wrap gap-2">
          {(["Open", "Near Full", "Full", "Closed"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className="inline-flex size-3.5 items-center justify-center rounded-sm text-[9px] font-bold text-black" style={{ background: hex[SHELTER_STATUS[s].tone] }}>
                {SHELTER_GLYPH[s]}
              </span>
              {s}
            </span>
          ))}
        </span>
        <span className="text-muted">Route</span>
        <span className="flex flex-wrap gap-2">
          {(["Open", "Congested", "Blocked", "Cleared"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <svg width="18" height="6" aria-hidden>
                <line x1="1" y1="3" x2="17" y2="3" stroke={hex[ROUTE_STATUS[s].tone]} strokeWidth="3" strokeLinecap="round" strokeDasharray={s === "Blocked" ? "1 5" : s === "Congested" ? "6 3" : s === "Cleared" ? "1 4" : undefined} />
              </svg>
              {s}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
