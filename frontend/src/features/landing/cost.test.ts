import { describe, expect, it } from "vitest";
import { routeCost } from "./cost";

describe("landing route cost (mirror of backend route_cost)", () => {
  it("multiplies travel time by congestion and severity, then adds penalties", () => {
    const r = routeCost({ travelMin: 24, status: "Congested", severity: 4, risk: "Moderate", missing: ["Water"], overNinety: true });
    // 24 × 1.6 × 2.0 = 76.8, + 4 risk + 8 water + 6 crowding
    expect(r?.terms.map((t) => t.value)).toEqual([76.8, 4, 8, 6]);
    expect(r?.total).toBe(94.8);
  });

  it("an open, low-risk road to a well-equipped shelter is travel cost only", () => {
    expect(routeCost({ travelMin: 10, status: "Open", severity: 1, risk: "Low", missing: [], overNinety: false })).toEqual({
      total: 10,
      terms: [{ key: "travel", label: "Travel", value: 10, note: "10 min × 1.00 (Open) × 1 (severity 1)" }],
    });
  });

  it("a flooded road fails the hard constraint", () => {
    expect(routeCost({ travelMin: 5, status: "Flooded", severity: 5, risk: "Low", missing: [], overNinety: false })).toBeNull();
  });
});
