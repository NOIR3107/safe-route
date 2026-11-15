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

  it("draws flooded roads as red arrows from zone to shelter", () => {
    const flooded = routes.map((r, i) => (i === 0 ? { ...r, status: "Flooded" as const } : r));
    const ann = buildAnnotations(zones, shelters, flooded, new Set());
    const arrow = ann.find((a) => a.type === "arrow");
    expect(arrow).toMatchObject({ type: "arrow", color: "red", label: "R1 flooded" });
    if (arrow?.type === "arrow") expect([arrow.latitude, arrow.longitude]).toEqual(routes[0]!.ext.path[0]);
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
