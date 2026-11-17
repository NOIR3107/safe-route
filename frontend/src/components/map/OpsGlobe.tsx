/**
 * The one map in SafeRoute: a CesiumJS globe (the 3D engine god's-eye-view is built on) showing
 * zones, shelters, routes, vehicles and assignment lines from the live data store.
 *
 * Entities are updated in place when data changes, so nothing flickers. Vehicles glide to each new
 * position (motion = information); with prefers-reduced-motion they jump.
 */
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  ArcGisMapServerImageryProvider,
  BoundingSphere,
  CallbackPositionProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantPositionProperty,
  ConstantProperty,
  DistanceDisplayCondition,
  EllipsoidTerrainProvider,
  Entity,
  HeadingPitchRange,
  ImageryLayer,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  PolygonHierarchy,
  PolylineDashMaterialProperty,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
  type MaterialProperty,
} from "cesium";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AssignmentView, RouteView, ShelterView, VehicleView, ZoneView } from "@/api/extensions";
import { useAssignments, useRoutes, useShelters, useVehicles, useZones } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { LayerControl } from "./LayerControl";
import { useMapStore, type MapSelection } from "./mapStore";
import { INK, lerpLatLng, routeStyle, severityHex, shelterMarkerSpec, vehicleColor, type Theme } from "./mapStyle";

const BASEMAP = {
  dark: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer",
  light: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer",
};
const LABELS = {
  dark: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer",
  light: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer",
};
const IMAGERY = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const GLIDE_MS = 900;
const LABEL_FONT = "500 12px 'IBM Plex Sans', system-ui, sans-serif";

declare global {
  interface Window {
    /** Read by the verification script: frames per second and number of objects drawn. */
    __saferouteMap?: { fps: number; entities: number };
  }
}

export interface OpsGlobeProps {
  /** "full" = dashboard hero with the layer control; "embedded" = smaller map on other pages. */
  variant?: "full" | "embedded";
  /** Fly to and highlight this entity (pages use it when a row is clicked). */
  focus?: MapSelection;
  className?: string;
}

export interface GlobeData {
  zones?: ZoneView[];
  shelters?: ShelterView[];
  routes?: RouteView[];
  vehicles?: VehicleView[];
  assignments?: AssignmentView[];
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const col = (hex: string, alpha = 1) => Color.fromCssColorString(hex).withAlpha(alpha);
const pos = (lat: number, lon: number, h = 0) => Cartesian3.fromDegrees(lon, lat, h);

/* ------------------------------------------------------------------ shelter ring images */

const ringCache = new Map<string, string>();

function shelterImage(spec: ReturnType<typeof shelterMarkerSpec>, theme: Theme, selected: boolean): string {
  const key = `${spec.size}|${spec.fill.toFixed(2)}|${spec.present.toFixed(2)}|${spec.color}|${spec.closed}|${theme}|${selected}`;
  const hit = ringCache.get(key);
  if (hit) return hit;
  const ink = INK[theme];
  const ratio = 2; // draw at 2x for crisp edges
  const size = spec.size + 8;
  const c = document.createElement("canvas");
  c.width = c.height = size * ratio;
  const g = c.getContext("2d")!;
  g.scale(ratio, ratio);
  const cx = size / 2;
  const r = spec.size / 2 - 2.5;
  const start = -Math.PI / 2;
  // halo so the ring reads on any basemap
  g.beginPath();
  g.arc(cx, cx, r + 3, 0, Math.PI * 2);
  g.fillStyle = ink.halo;
  g.globalAlpha = 0.85;
  g.fill();
  g.globalAlpha = 1;
  // track
  g.lineWidth = 4;
  g.beginPath();
  g.arc(cx, cx, r, 0, Math.PI * 2);
  g.strokeStyle = ink.faint;
  g.globalAlpha = 0.45;
  g.stroke();
  g.globalAlpha = 1;
  if (spec.closed) {
    g.setLineDash([3, 3]);
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.strokeStyle = ink.soft;
    g.stroke();
    g.setLineDash([]);
  } else {
    // inbound (lighter) then present (solid)
    g.lineCap = "butt";
    g.beginPath();
    g.arc(cx, cx, r, start, start + Math.PI * 2 * spec.fill);
    g.strokeStyle = spec.color;
    g.globalAlpha = 0.45;
    g.stroke();
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(cx, cx, r, start, start + Math.PI * 2 * spec.present);
    g.strokeStyle = spec.color;
    g.stroke();
  }
  // centre dot
  g.beginPath();
  g.arc(cx, cx, 2.5, 0, Math.PI * 2);
  g.fillStyle = spec.closed ? ink.soft : spec.color;
  g.fill();
  if (selected) {
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cx, r + 3.5, 0, Math.PI * 2);
    g.strokeStyle = ink.select;
    g.stroke();
  }
  const url = c.toDataURL();
  ringCache.set(key, url);
  return url;
}

/* ------------------------------------------------------------------ component */

/** The map fed from the live data store (signed-in pages). */
export default function OpsGlobe(props: OpsGlobeProps) {
  const data: GlobeData = {
    zones: useZones().data,
    shelters: useShelters().data,
    routes: useRoutes().data,
    vehicles: useVehicles().data,
    assignments: useAssignments().data,
  };
  return <GlobeView {...props} data={data} />;
}

/**
 * The one map implementation. Draws whatever data it is given, so the public page (no login) and the
 * field team's route map use exactly the same renderer as the dashboard.
 */
export function GlobeView({
  variant = "full",
  focus,
  className,
  data,
  highlightRouteIds,
}: OpsGlobeProps & { data: GlobeData; highlightRouteIds?: number[] }) {
  const theme = useUiStore((s) => s.theme);
  const { camera: savedCamera, tilt3d, layers, selection, setCamera, select } = useMapStore();
  const persistCamera = variant === "full";
  const camera = persistCamera ? savedCamera : null;
  const { zones, shelters, routes, vehicles, assignments } = data;

  const containerRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entities = useRef(new Map<string, Entity>());
  const glide = useRef(new Map<number, { from: [number, number]; to: [number, number]; t0: number }>());
  const fitted = useRef(false);
  const [stats, setStats] = useState({ fps: 0, entities: 0 });
  const [ready, setReady] = useState(false);

  const routesInUse = useMemo(
    () =>
      new Set([
        ...(assignments ?? []).filter((a) => a.status === "Scheduled" || a.status === "In Progress").map((a) => a.route_id ?? -1),
        ...(highlightRouteIds ?? []),
      ]),
    [assignments, highlightRouteIds],
  );

  /* ---------------- create the viewer once */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const viewer = new Viewer(el, {
      baseLayer: false,
      terrainProvider: new EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: creditRef.current ?? undefined,
      targetFrameRate: 60,
    });
    const scene = viewer.scene;
    scene.skyBox.show = false;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = false;
    scene.fog.enabled = false;
    scene.screenSpaceCameraController.minimumZoomDistance = 400;
    scene.screenSpaceCameraController.maximumZoomDistance = 250_000;
    viewerRef.current = viewer;

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((e: { position: Cartesian2 }) => {
      const picked: unknown = scene.pick(e.position);
      const id = (picked as { id?: Entity } | undefined)?.id?.id;
      if (typeof id !== "string") return select(null);
      const [kind, raw] = id.split(":");
      if (kind === "zone" || kind === "shelter" || kind === "route" || kind === "vehicle") select({ kind, id: Number(raw) });
    }, ScreenSpaceEventType.LEFT_CLICK);

    const onMoveEnd = () => {
      if (!persistCamera) return; // embedded maps do not move the dashboard's saved view
      const c = viewer.camera.positionCartographic;
      setCamera({
        longitude: CesiumMath.toDegrees(c.longitude),
        latitude: CesiumMath.toDegrees(c.latitude),
        height: c.height,
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
      });
    };
    viewer.camera.moveEnd.addEventListener(onMoveEnd);

    // FPS and object count, for the status line and the verification script.
    let frames = 0;
    const onRender = () => {
      frames += 1;
    };
    scene.postRender.addEventListener(onRender);
    const fpsTimer = setInterval(() => {
      const next = { fps: frames, entities: viewer.entities.values.length };
      frames = 0;
      window.__saferouteMap = next;
      setStats(next);
    }, 1000);

    setReady(true);
    const ents = entities.current;
    return () => {
      clearInterval(fpsTimer);
      handler.destroy();
      ents.clear();
      fitted.current = false;
      viewerRef.current = null;
      viewer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the viewer is created once per mount
  }, []);

  /* ---------------- basemap per theme, optional imagery */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return;
    const bg = theme === "dark" ? "#131417" : "#f5f5f3";
    viewer.scene.backgroundColor = col(bg);
    viewer.scene.globe.baseColor = col(theme === "dark" ? "#1b1d21" : "#e9e9e6");
    const urls = layers.imagery ? [IMAGERY, LABELS[theme]] : [BASEMAP[theme], LABELS[theme]];
    viewer.imageryLayers.removeAll();
    for (const url of urls) {
      const layer = ImageryLayer.fromProviderAsync(ArcGisMapServerImageryProvider.fromUrl(url), {});
      if (url === LABELS[theme]) layer.alpha = 0.55; // place names for orientation, quieter than our labels
      if (url === IMAGERY) {
        // satellite imagery dimmed so status colours still read on top
        layer.brightness = theme === "dark" ? 0.55 : 0.9;
        layer.saturation = 0.35;
      }
      viewer.imageryLayers.add(layer);
    }
  }, [theme, layers.imagery, ready]);

  /* ---------------- camera: restore, or fit to the data once */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready || fitted.current) return;
    if (focus) return; // focus effect handles it
    if (camera) {
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(camera.longitude, camera.latitude, camera.height),
        orientation: { heading: camera.heading, pitch: camera.pitch, roll: 0 },
      });
      fitted.current = true;
      return;
    }
    if (!zones && !shelters && !routes) return;
    const pts = [
      ...(zones ?? []).map((z) => z.ext.centroid),
      ...(shelters ?? []).filter((s) => s.latitude != null).map((s) => [s.latitude!, s.longitude!] as [number, number]),
      ...(routes ?? []).flatMap((r) => r.ext.path as [number, number][]),
    ];
    if (pts.length === 0) return;
    const lats = pts.map((p) => p[0]);
    const lons = pts.map((p) => p[1]);
    const pad = 0.01;
    viewer.camera.setView({
      destination: Rectangle.fromDegrees(Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad),
    });
    fitted.current = true;
  }, [ready, camera, zones, shelters, routes, focus]);

  /* ---------------- 2D / 3D tilt */
  const firstTilt = useRef(true);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return;
    if (firstTilt.current) {
      firstTilt.current = false;
      return;
    }
    // Tilt around the point in the middle of the screen, keeping the same distance.
    const c = viewer.camera;
    const ray = c.getPickRay(new Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2));
    const target = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
    const pitch = CesiumMath.toRadians(tilt3d ? -42 : -90);
    const duration = reducedMotion() ? 0 : 0.8;
    if (!target) {
      c.flyTo({ destination: c.position, orientation: { heading: c.heading, pitch, roll: 0 }, duration });
      return;
    }
    const range = Cartesian3.distance(c.position, target);
    c.flyToBoundingSphere(new BoundingSphere(target, 1), { offset: new HeadingPitchRange(c.heading, pitch, range), duration });
  }, [tilt3d, ready]);

  /* ---------------- helpers to upsert entities */
  const upsert = (id: string, make: () => Entity.ConstructorOptions) => {
    const viewer = viewerRef.current!;
    let e = entities.current.get(id);
    if (!e) {
      e = viewer.entities.add({ id, ...make() });
      entities.current.set(id, e);
    }
    return e;
  };
  const prune = (prefix: string, keep: Set<string>) => {
    const viewer = viewerRef.current!;
    for (const [id, e] of entities.current) {
      if (id.startsWith(prefix) && !keep.has(id)) {
        viewer.entities.remove(e);
        entities.current.delete(id);
      }
    }
  };
  const isSel = (kind: string, id: number) => selection?.kind === kind && selection.id === id;

  /* ---------------- zones */
  useEffect(() => {
    if (!viewerRef.current || !ready) return;
    const keep = new Set<string>();
    if (layers.zones) {
      for (const z of zones ?? []) {
        if (z.ext.polygon.length < 3) continue;
        const id = `zone:${z.zone_id}`;
        keep.add(id);
        const color = severityHex(z.ext.severity, theme);
        const ring = z.ext.polygon.map(([lat, lon]) => pos(lat, lon));
        const e = upsert(id, () => ({ polygon: {}, polyline: {}, label: {}, position: pos(z.ext.centroid[0], z.ext.centroid[1]) }));
        const sel = isSel("zone", z.zone_id);
        e.polygon!.hierarchy = new ConstantProperty(new PolygonHierarchy(ring));
        e.polygon!.material = new ColorMaterialProperty(col(color, sel ? 0.32 : 0.16));
        e.polygon!.height = new ConstantProperty(0);
        e.polyline!.positions = new ConstantProperty([...ring, ring[0]!]);
        e.polyline!.width = new ConstantProperty(sel ? 2.5 : 1.25);
        e.polyline!.material = new ColorMaterialProperty(col(sel ? INK[theme].select : color, 0.9));
        e.polyline!.clampToGround = new ConstantProperty(true);
        e.label!.text = new ConstantProperty(`${z.ext.code}  ${z.remaining.toLocaleString("en-IN")}`);
        e.label!.font = new ConstantProperty(LABEL_FONT);
        e.label!.fillColor = new ConstantProperty(col(INK[theme].strong));
        e.label!.outlineColor = new ConstantProperty(col(INK[theme].halo));
        e.label!.outlineWidth = new ConstantProperty(3);
        e.label!.style = new ConstantProperty(LabelStyle.FILL_AND_OUTLINE);
        e.label!.distanceDisplayCondition = new ConstantProperty(new DistanceDisplayCondition(0, 60_000));
        e.label!.disableDepthTestDistance = new ConstantProperty(Number.POSITIVE_INFINITY);
      }
    }
    prune("zone:", keep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, layers.zones, theme, selection, ready]);

  /* ---------------- routes and assignment lines */
  useEffect(() => {
    if (!viewerRef.current || !ready) return;
    const keep = new Set<string>();
    if (layers.routes) {
      const sorted = [...(routes ?? [])].sort(
        (a, b) => routeStyle(a.status, routesInUse.has(a.route_id), theme).z - routeStyle(b.status, routesInUse.has(b.route_id), theme).z,
      );
      for (const r of sorted) {
        if (r.ext.path.length < 2) continue;
        const id = `route:${r.route_id}`;
        keep.add(id);
        const st = routeStyle(r.status, routesInUse.has(r.route_id), theme);
        const sel = isSel("route", r.route_id);
        const e = upsert(id, () => ({ polyline: {} }));
        e.polyline!.positions = new ConstantProperty(r.ext.path.map(([lat, lon]) => pos(lat, lon)));
        e.polyline!.width = new ConstantProperty(sel ? st.width + 2 : st.width);
        e.polyline!.clampToGround = new ConstantProperty(true);
        e.polyline!.zIndex = new ConstantProperty(st.z);
        const color = col(sel ? INK[theme].select : st.color, sel ? 1 : st.alpha);
        e.polyline!.material = (st.dashed ? new PolylineDashMaterialProperty({ color, dashLength: 10 }) : new ColorMaterialProperty(color)) as MaterialProperty;
      }
    }
    prune("route:", keep);

    const keepA = new Set<string>();
    if (layers.assignments && zones && shelters) {
      const zmap = new Map(zones.map((z) => [z.zone_id, z]));
      const smap = new Map(shelters.map((s) => [s.shelter_id, s]));
      for (const a of assignments ?? []) {
        if (a.status !== "Scheduled" && a.status !== "In Progress") continue;
        const z = zmap.get(a.zone_id);
        const s = smap.get(a.shelter_id);
        if (!z || !s || s.latitude == null || s.longitude == null) continue;
        const id = `assign:${a.assignment_id}`;
        keepA.add(id);
        const e = upsert(id, () => ({ polyline: {} }));
        e.polyline!.positions = new ConstantProperty([pos(z.ext.centroid[0], z.ext.centroid[1], 30), pos(s.latitude, s.longitude, 30)]);
        e.polyline!.width = new ConstantProperty(1);
        e.polyline!.material = new PolylineDashMaterialProperty({ color: col(INK[theme].select, 0.6), dashLength: 6 });
      }
    }
    prune("assign:", keepA);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, routesInUse, assignments, zones, shelters, layers.routes, layers.assignments, theme, selection, ready]);

  /* ---------------- shelters (capacity rings) */
  useEffect(() => {
    if (!viewerRef.current || !ready) return;
    const keep = new Set<string>();
    if (layers.shelters) {
      const maxCap = Math.max(1, ...(shelters ?? []).map((s) => s.capacity));
      for (const s of shelters ?? []) {
        if (s.latitude == null || s.longitude == null) continue;
        const id = `shelter:${s.shelter_id}`;
        keep.add(id);
        const spec = shelterMarkerSpec(s, maxCap, theme);
        const sel = isSel("shelter", s.shelter_id);
        const e = upsert(id, () => ({ position: pos(s.latitude!, s.longitude!), billboard: {}, label: {} }));
        e.position = new ConstantPositionProperty(pos(s.latitude, s.longitude));
        e.billboard!.image = new ConstantProperty(shelterImage(spec, theme, sel));
        e.billboard!.width = new ConstantProperty(spec.size + 8);
        e.billboard!.height = new ConstantProperty(spec.size + 8);
        e.billboard!.disableDepthTestDistance = new ConstantProperty(Number.POSITIVE_INFINITY);
        e.billboard!.scaleByDistance = new ConstantProperty(new NearFarScalar(2_000, 1.15, 80_000, 0.75));
        e.label!.text = new ConstantProperty(shortName(s.name));
        e.label!.font = new ConstantProperty(LABEL_FONT);
        e.label!.fillColor = new ConstantProperty(col(INK[theme].strong));
        e.label!.outlineColor = new ConstantProperty(col(INK[theme].halo));
        e.label!.outlineWidth = new ConstantProperty(3);
        e.label!.style = new ConstantProperty(LabelStyle.FILL_AND_OUTLINE);
        e.label!.verticalOrigin = new ConstantProperty(VerticalOrigin.TOP);
        e.label!.pixelOffset = new ConstantProperty(new Cartesian2(0, spec.size / 2 + 6));
        e.label!.distanceDisplayCondition = new ConstantProperty(new DistanceDisplayCondition(0, sel ? 300_000 : 35_000));
        e.label!.disableDepthTestDistance = new ConstantProperty(Number.POSITIVE_INFINITY);
      }
    }
    prune("shelter:", keep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelters, layers.shelters, theme, selection, ready]);

  /* ---------------- vehicles (glide between updates) */
  useEffect(() => {
    if (!viewerRef.current || !ready) return;
    const keep = new Set<string>();
    const instant = reducedMotion();
    if (layers.vehicles) {
      const now = performance.now();
      for (const v of vehicles ?? []) {
        const id = `vehicle:${v.vehicle_id}`;
        keep.add(id);
        const target = v.ext.position as [number, number];
        const g = glide.current.get(v.vehicle_id);
        if (!g) glide.current.set(v.vehicle_id, { from: target, to: target, t0: now });
        else if (g.to[0] !== target[0] || g.to[1] !== target[1]) {
          const current = lerpLatLng(g.from, g.to, (now - g.t0) / GLIDE_MS);
          glide.current.set(v.vehicle_id, { from: instant ? target : current, to: target, t0: now });
        }
        const sel = isSel("vehicle", v.vehicle_id);
        const e = upsert(id, () => ({
          position: new CallbackPositionProperty((_t, result) => {
            const s = glide.current.get(v.vehicle_id);
            if (!s) return result;
            const [lat, lon] = lerpLatLng(s.from, s.to, (performance.now() - s.t0) / GLIDE_MS);
            return Cartesian3.fromDegrees(lon, lat, 20, undefined, result);
          }, false),
          point: {},
        }));
        e.point!.pixelSize = new ConstantProperty(sel ? 11 : v.status === "In Transit" ? 7 : 5);
        e.point!.color = new ConstantProperty(col(sel ? INK[theme].select : vehicleColor(v.status, theme)));
        e.point!.outlineColor = new ConstantProperty(col(INK[theme].halo));
        e.point!.outlineWidth = new ConstantProperty(1.5);
        e.point!.disableDepthTestDistance = new ConstantProperty(Number.POSITIVE_INFINITY);
      }
    }
    prune("vehicle:", keep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, layers.vehicles, theme, selection, ready]);

  /* ---------------- focus from list pages */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready || !focus) return;
    const target = locate(focus, zones, shelters, routes, vehicles);
    if (!target) return;
    select(focus);
    fitted.current = true;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(target[1], target[0] - (tilt3d ? 0.05 : 0), focus.kind === "route" ? 14_000 : 7_000),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(tilt3d ? -42 : -90), roll: 0 },
      duration: reducedMotion() ? 0 : 0.9,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.kind, focus?.id, ready]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-bg", className)}>
      <div ref={containerRef} className="absolute inset-0" aria-label="Operations map" role="application" />
      <div ref={creditRef} className="pointer-events-auto absolute right-2 bottom-1 z-10 max-w-[60%] text-[10px] text-muted [&_*]:!text-[10px]" />
      {variant === "full" ? <LayerControl stats={stats} /> : null}
    </div>
  );
}

function shortName(name: string): string {
  return name.split(",")[0]!.trim();
}

function locate(
  sel: NonNullable<MapSelection>,
  zones?: ZoneView[],
  shelters?: ShelterView[],
  routes?: RouteView[],
  vehicles?: VehicleView[],
): [number, number] | null {
  if (sel.kind === "zone") return zones?.find((z) => z.zone_id === sel.id)?.ext.centroid ?? null;
  if (sel.kind === "shelter") {
    const s = shelters?.find((x) => x.shelter_id === sel.id);
    return s?.latitude != null && s.longitude != null ? [s.latitude, s.longitude] : null;
  }
  if (sel.kind === "route") {
    const p = routes?.find((r) => r.route_id === sel.id)?.ext.path;
    return p && p.length ? (p[Math.floor(p.length / 2)] as [number, number]) : null;
  }
  return (vehicles?.find((v) => v.vehicle_id === sel.id)?.ext.position as [number, number] | undefined) ?? null;
}
