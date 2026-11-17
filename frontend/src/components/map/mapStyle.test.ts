import { describe, expect, it } from "vitest";
import { lerpLatLng, MAX_MARKER, MIN_MARKER, routeStyle, severityHex, shelterMarkerSpec } from "./mapStyle";

const shelter = (capacity: number, occ: number, inbound: number, display_status: "Open" | "Near Full" | "Full" | "Closed" = "Open") => ({
  capacity,
  current_occupancy: occ,
  inbound,
  display_status,
});

describe("shelter capacity rings (TC-UI-06..08)", () => {
  it("scales marker size with capacity, within limits", () => {
    const big = shelterMarkerSpec(shelter(2400, 0, 0), 2400, "dark");
    const small = shelterMarkerSpec(shelter(450, 0, 0), 2400, "dark");
    expect(big.size).toBe(MAX_MARKER);
    expect(small.size).toBeGreaterThan(MIN_MARKER);
    expect(small.size).toBeLessThan(big.size);
  });

  it("fills the ring with present + inbound and marks present separately", () => {
    const s = shelterMarkerSpec(shelter(1000, 600, 300, "Near Full"), 1000, "dark");
    expect(s.fill).toBeCloseTo(0.9);
    expect(s.present).toBeCloseTo(0.6);
  });

  it("colours the ring by status, from the shelter status scale", () => {
    const open = shelterMarkerSpec(shelter(100, 10, 0, "Open"), 100, "light");
    const full = shelterMarkerSpec(shelter(100, 100, 0, "Full"), 100, "light");
    expect(open.color).not.toBe(full.color);
    expect(shelterMarkerSpec(shelter(100, 0, 0, "Closed"), 100, "light").closed).toBe(true);
  });
});

describe("route styling (TC-UI-09..10)", () => {
  it("highlights problems and keeps unused open roads faint", () => {
    const blocked = routeStyle("Blocked", false, "dark");
    const unused = routeStyle("Open", false, "dark");
    const used = routeStyle("Open", true, "dark");
    expect(blocked.dashed && blocked.width > used.width).toBe(true);
    expect(unused.alpha).toBeLessThan(used.alpha);
    expect(blocked.z).toBeGreaterThan(used.z);
    expect(routeStyle("Cleared", false, "dark").alpha).toBeLessThan(used.alpha);
  });

  it("uses one severity hue per theme, darker in light mode as severity rises", () => {
    expect(severityHex(1, "light")).not.toBe(severityHex(5, "light"));
    expect(lerpLatLng([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
    expect(lerpLatLng([0, 0], [10, 20], 2)).toEqual([10, 20]);
  });
});
