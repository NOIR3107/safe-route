import { Building2, Crosshair, ExternalLink, Globe2, MapPin, RefreshCw, Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LatLng } from "@/api/extensions";
import { PageHeader } from "@/components/common";
import { SeverityBadge, ShelterStatusBadge } from "@/components/status/badges";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Kbd } from "@/components/ui/primitives";
import { useAssignments, useRoutes, useShelters, useZones } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import {
  buildAnnotations,
  cameraLookingAt,
  embedSrc,
  FLOOD_LAYERS,
  GEV_ORIGIN,
  GEV_URL,
  isGevMessage,
  overviewCamera,
  type GevCamera,
  type GevView,
} from "./gev";

type Status = "connecting" | "ready" | "unreachable";

export function GodsEyePage() {
  const { data: zones } = useZones();
  const { data: shelters } = useShelters();
  const { data: routes } = useRoutes();
  const { data: assignments } = useAssignments();
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [layers, setLayers] = useState<string[]>(["weather-radar", "local-dams"]);
  const [overlay, setOverlay] = useState(true);
  const [roadsInUse, setRoadsInUse] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const camera = useRef<GevCamera | null>(null);
  const seq = useRef(0);

  const points = useMemo<LatLng[]>(
    () => [
      ...(zones ?? []).filter((z) => z.ext.polygon.length > 0).map((z) => z.ext.centroid),
      ...(shelters ?? []).filter((s) => s.latitude != null).map((s) => [s.latitude!, s.longitude!] as LatLng),
    ],
    [zones, shelters],
  );
  const overview = useMemo(() => overviewCamera(points), [points]);
  // The iframe src is fixed once, so data refreshes don't reload the globe.
  const [src] = useState(() => embedSrc(overviewCamera([])));

  const routesInUse = useMemo(
    () => new Set((assignments ?? []).filter((a) => a.status === "Scheduled" || a.status === "In Progress").map((a) => a.route_id ?? -1)),
    [assignments],
  );
  const annotations = useMemo(
    () => (overlay && zones && shelters && routes ? buildAnnotations(zones, shelters, routes, routesInUse, { roadsInUse }) : []),
    [overlay, zones, shelters, routes, routesInUse, roadsInUse],
  );

  // GEV applies views one after another, and each one switches layers, clears and redraws every
  // mark and flies the camera. Posting faster than that (the drill refreshes data every second)
  // builds a queue and the globe never settles: it flickers and can stay black. So: one view in
  // flight at a time, only the newest waiting one is sent after it, and identical views are skipped.
  const latest = useRef({ layers, annotations, overview });
  useEffect(() => {
    latest.current = { layers, annotations, overview };
  }, [layers, annotations, overview]);
  const inFlight = useRef<{ id: string; at: number } | null>(null);
  const waiting = useRef(false);
  const lastSig = useRef("");

  const post = useCallback((force: boolean) => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    if (inFlight.current && Date.now() - inFlight.current.at < 20_000) {
      waiting.current = true;
      return;
    }
    const { layers: l, annotations: a, overview: o } = latest.current;
    const view: GevView = { camera: camera.current ?? o, layers: l, annotations: a };
    const sig = JSON.stringify(view);
    if (!force && sig === lastSig.current) return;
    lastSig.current = sig;
    seq.current += 1;
    const id = `saferoute-${seq.current}`;
    inFlight.current = { id, at: Date.now() };
    waiting.current = false;
    win.postMessage({ type: "gev:view", id, view }, GEV_ORIGIN);
  }, []);

  const send = useCallback(
    (cam?: GevCamera) => {
      if (status !== "ready") return;
      if (cam) camera.current = cam;
      post(true);
    },
    [status, post],
  );

  // Listen for GEV's handshake and replies.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== GEV_ORIGIN || !isGevMessage(e.data)) return;
      if (e.data.type === "gev:ready") {
        inFlight.current = null;
        lastSig.current = "";
        setStatus("ready");
        return;
      }
      if (inFlight.current?.id === e.data.id) inFlight.current = null;
      setLastResult(e.data.ok ? "View applied" : `GEV: ${e.data.error ?? e.data.steps?.filter((s) => !s.ok).map((s) => s.step).join(", ") ?? "some steps failed"}`);
      if (waiting.current) post(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  // If GEV never says hello, it's probably not running (or not allowed to be framed).
  useEffect(() => {
    if (status !== "connecting") return;
    const t = setTimeout(() => setStatus((s) => (s === "connecting" ? "unreachable" : s)), 15_000);
    return () => clearTimeout(t);
  }, [status, frameKey]);

  // First view once GEV is ready, then again only when what's drawn really changes
  // (a road closes, a shelter fills up, a layer is ticked). post() drops identical views.
  useEffect(() => {
    if (status !== "ready") return;
    const t = setTimeout(() => post(false), 1_000);
    return () => clearTimeout(t);
  }, [status, layers, annotations, post]);

  const reconnect = () => {
    setStatus("connecting");
    setLastResult(null);
    inFlight.current = null;
    waiting.current = false;
    lastSig.current = "";
    setFrameKey((k) => k + 1);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Globe2}
        title="God's Eye View"
        description="Photorealistic 3D globe from the god's-eye-view project with SafeRoute's shelters, zones and closed roads drawn on top, plus live weather layers."
        actions={
          <>
            <Badge tone={status === "ready" ? "ok" : status === "connecting" ? "info" : "danger"}>
              {status === "ready" ? "Connected" : status === "connecting" ? "Connecting…" : "Not reachable"}
            </Badge>
            <Button variant="secondary" size="sm" onClick={reconnect} title="Restart the globe if it goes black or stops responding">
              <RefreshCw /> Reload globe
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <a href={GEV_URL} target="_blank" rel="noreferrer">
                <ExternalLink /> Open full app
              </a>
            </Button>
          </>
        }
      />
      <div className="grid min-h-0 flex-1 gap-4 p-4 sm:p-6 xl:grid-cols-[1fr_340px]">
        <div className="relative min-h-[480px] overflow-hidden rounded-lg border border-border bg-black">
          <iframe
            key={frameKey}
            ref={frame}
            src={src}
            title="god's-eye-view 3D globe"
            className="h-full w-full"
            allow="fullscreen; geolocation"
            onLoad={() => setStatus((s) => (s === "unreachable" ? "connecting" : s))}
          />
          {status === "unreachable" ? <NotRunning onRetry={reconnect} /> : null}
        </div>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle>Fly to</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => send(overview)} disabled={status !== "ready"}>
                <Crosshair /> Overview
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1">
                {(zones ?? []).map((z) => (
                  <li key={z.zone_id}>
                    <button
                      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
                      disabled={status !== "ready"}
                      onClick={() => send(cameraLookingAt(z.ext.centroid, 2_500, -45))}
                    >
                      <span className="flex items-center gap-2">
                        <MapPin className="size-4 text-muted" aria-hidden /> {z.name}
                      </span>
                      <SeverityBadge severity={z.ext.severity} compact />
                    </button>
                  </li>
                ))}
              </ul>
              <ul className="space-y-1 border-t border-border pt-3">
                {(shelters ?? []).map((s) => (
                  <li key={s.shelter_id}>
                    <button
                      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
                      disabled={status !== "ready" || s.latitude == null}
                      onClick={() => s.latitude != null && send(cameraLookingAt([s.latitude, s.longitude!], 900, -35))}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Building2 className="size-4 shrink-0 text-muted" aria-hidden />
                        <span className="truncate">{s.name}</span>
                      </span>
                      <ShelterStatusBadge status={s.display_status} />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Layers</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => send()} disabled={status !== "ready"}>
                <RefreshCw /> Sync now
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} className="accent-[var(--color-accent)]" />
                SafeRoute overlay <span className="text-xs text-muted">({annotations.length} marks)</span>
              </label>
              <p className="pl-6 text-xs text-muted">Shelters as pins with their status, zones as rings (worst ones named), closed roads as red pins, congested roads amber.</p>
              <label className="flex items-center gap-2 pl-6">
                <input type="checkbox" checked={roadsInUse} disabled={!overlay} onChange={(e) => setRoadsInUse(e.target.checked)} className="accent-[var(--color-accent)]" />
                Also roads in use (cyan)
              </label>
              {FLOOD_LAYERS.map((l) => (
                <label key={l.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={layers.includes(l.id)}
                    onChange={(e) => setLayers((cur) => (e.target.checked ? [...cur, l.id] : cur.filter((x) => x !== l.id)))}
                    className="accent-[var(--color-accent)]"
                  />
                  {l.label}
                </label>
              ))}
              {lastResult ? <p className={cn("pt-1 text-xs", lastResult.startsWith("GEV:") ? "text-warn-fg" : "text-muted")}>{lastResult}</p> : null}
            </CardContent>
          </Card>

          <p className="text-xs text-muted">
            God&apos;s Eye View is © Bilawal Sidhu, MIT licence (code only, third-party data keeps its own terms). Included as a git submodule in{" "}
            <code>integrations/gods-eye-view</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

function NotRunning({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg/95 p-6">
      <div className="max-w-md space-y-3 text-sm">
        <p className="flex items-center gap-2 text-base font-semibold">
          <Terminal className="size-5 text-muted" aria-hidden /> god&apos;s-eye-view isn&apos;t running
        </p>
        <p className="text-muted">It is a separate app. Start it from the frontend folder (first time: install its packages):</p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs">
          {"git submodule update --init\ncd frontend\nnpm run gev:install   # once\nnpm run gev"}
        </pre>
        <p className="text-muted">
          Or start both apps with <Kbd>npm run dev:all</Kbd>. It must be allowed to be framed by this page, which the script does by setting{" "}
          <code>GEV_EMBED_FRAME_ANCESTORS</code>.
        </p>
        <Button onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      </div>
    </div>
  );
}
