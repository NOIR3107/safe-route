import { describe, expect, it } from "vitest";
import { buildState, CHENNAI_FLOOD } from "@/seed";
import { routeView, shelterView, zoneView } from "@/api/mock/views";
import { buildAnnotations, cameraLookingAt, embedSrc, MAX_ANNOTATIONS } from "./gev";

describe("god's-eye-view adapter", () => {
  const db = buildState(CHENNAI_FLOOD, new Date("2026-11-15T02:00:00Z"));
  const zones = db.zones.map((z) => zoneView(db, z.zone_id));
  const shelters = db.shelters.map((s) => shelterView(db, s));
  const routes = db.routes.map((r) => routeView(db, r.route_id));

  it("never sends more than 24 annotations and puts shelters first", () => {
    const all = buildAnnotations(zones, shelters, routes, new Set(routes.map((r) => r.route_id)), { roadsInUse: true });
    expect(all.length).toBeLessThanOrEqual(MAX_ANNOTATIONS);
    expect(all.slice(0, shelters.length).every((a) => a.type === "pin")).toBe(true);
  });

  it("marks a flooded road with one short red pin on the road", () => {
    const flooded = routes.map((r, i) => (i === 0 ? { ...r, status: "Flooded" as const } : r));
    const ann = buildAnnotations(zones, shelters, flooded, new Set());
    const pin = ann.find((a) => a.label === "R1 flooded");
    expect(pin).toMatchObject({ type: "pin", color: "red" });
    expect(routes[0]!.ext.path).toContainEqual([pin!.latitude, pin!.longitude]);
  });

  it("keeps labels short and stable so the globe isn't redrawn every drill tick", () => {
    const ann = buildAnnotations(zones, shelters, routes, new Set());
    const labels = ann.map((a) => a.label).filter((l): l is string => !!l);
    expect(labels.every((l) => l.length <= 48 && !/%|km/.test(l))).toBe(true);
    // Only the worst zones get a name; the rest are coloured rings.
    expect(ann.filter((a) => a.type === "highlight" && a.label).length).toBe(zones.filter((z) => z.ext.severity >= 4).length);
  });

  it("leaves roads in use out unless asked", () => {
    const inUse = new Set(routes.map((r) => r.route_id));
    expect(buildAnnotations(zones, shelters, routes, inUse).some((a) => a.type === "arrow")).toBe(false);
    expect(buildAnnotations(zones, shelters, routes, inUse, { roadsInUse: true }).some((a) => a.type === "arrow")).toBe(true);
  });

  it("places the camera south of the target so it looks at it", () => {
    const cam = cameraLookingAt([13.0, 80.2], 2000, -45);
    expect(cam.lat).toBeLessThan(13.0);
    expect(cam.lon).toBe(80.2);
    expect(cam.pitch_deg).toBe(-45);
  });

  it("builds an embed URL with the camera in the hash", () => {
    const src = embedSrc(cameraLookingAt([13.02, 80.23], 10_000));
    expect(src).toContain("?embed=1#");
    expect(src).toMatch(/lat=12\.\d+&lon=80\.23/);
  });
});
