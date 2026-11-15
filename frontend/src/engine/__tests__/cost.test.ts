import { describe, expect, it } from "vitest";
import {
  PET_PENALTY,
  RISK_PENALTY,
  SEVERITY_WEIGHT,
  SOFT_FACILITY_PENALTY,
  STABILITY_PENALTY_DESTINATION,
  STABILITY_PENALTY_EN_ROUTE,
  UTILIZATION_PENALTY,
  evaluateEdge,
  remainingCapacity,
  routeCost,
} from "../cost";
import type { DemandGroup } from "../model";
import { route, shelter, zone } from "./fixtures";

function group(over: Partial<DemandGroup> = {}): DemandGroup {
  return {
    key: "g",
    zone: zone(1),
    households: [],
    people: 10,
    needs: [],
    pet_share: 0,
    high_priority_people: 0,
    previous_shelter_id: null,
    en_route_vehicle_ids: [],
    priority_score: 0.5,
    ...over,
  };
}

describe("routeCost", () => {
  it("weights travel time by zone severity", () => {
    const r = route(1, 1, 20);
    for (const sev of [1, 2, 3, 4, 5] as const) {
      const c = routeCost(group({ zone: zone(1, { severity: sev }) }), r, shelter(1));
      expect(c.travel_cost).toBeCloseTo(20 * SEVERITY_WEIGHT[sev]);
      expect(c.total).toBeCloseTo(20 * SEVERITY_WEIGHT[sev]);
    }
  });

  it("applies congestion factor and route risk penalty", () => {
    const c = routeCost(group(), route(1, 1, 10, { status: "Congested", risk_level: "High" }), shelter(1));
    expect(c.congestion_factor).toBe(1.6);
    expect(c.travel_cost).toBeCloseTo(10 * 1.6 * 1.5);
    expect(c.risk_penalty).toBe(RISK_PENALTY.High);
  });

  it("adds a facility penalty per missing soft facility and for pets", () => {
    const s = shelter(1, { available_facilities: ["Medical"] });
    const c = routeCost(group({ pet_share: 0.5 }), route(1, 1, 10), s);
    expect(c.facility_penalty).toBeCloseTo(3 * SOFT_FACILITY_PENALTY + PET_PENALTY * 0.5);
  });

  it("penalises pushing a shelter above 90% utilisation", () => {
    const c = routeCost(group({ people: 20 }), route(1, 1, 10), shelter(1, { capacity: 100, committed: 75 }));
    expect(c.utilization_penalty).toBe(UTILIZATION_PENALTY);
  });

  it("adds stability penalties when re-planning changes a destination, more if en route", () => {
    const moved = routeCost(group({ previous_shelter_id: 2 }), route(1, 1, 10), shelter(1));
    expect(moved.stability_penalty).toBe(STABILITY_PENALTY_DESTINATION);
    const enRoute = routeCost(group({ previous_shelter_id: 2, en_route_vehicle_ids: [7] }), route(1, 1, 10), shelter(1));
    expect(enRoute.stability_penalty).toBe(STABILITY_PENALTY_DESTINATION + STABILITY_PENALTY_EN_ROUTE);
    const same = routeCost(group({ previous_shelter_id: 1 }), route(1, 1, 10), shelter(1));
    expect(same.stability_penalty).toBe(0);
  });
});

describe("evaluateEdge – hard constraints (FR-07)", () => {
  it("removes the edge when every route is blocked or flooded", () => {
    const e = evaluateEdge(group(), shelter(1), [route(1, 1, 10, { status: "Blocked" }), route(1, 1, 12, { status: "Flooded" })], 100);
    expect(e.feasible).toBe(false);
    if (!e.feasible) expect(e.reasons.join(" ")).toMatch(/blocked/);
  });

  it("uses the cheapest usable route when one of several is blocked", () => {
    const e = evaluateEdge(
      group(),
      shelter(1),
      [route(1, 1, 8, { status: "Blocked", route_id: 901 }), route(1, 1, 15, { route_id: 902 })],
      100,
    );
    expect(e.feasible).toBe(true);
    if (e.feasible) expect(e.route.route_id).toBe(902);
  });

  it("removes the edge when a required facility is missing or degraded", () => {
    const missing = evaluateEdge(group({ needs: ["Medical"] }), shelter(1, { available_facilities: ["Power"] }), [route(1, 1, 10)], 100);
    expect(missing.feasible).toBe(false);
    const degraded = evaluateEdge(
      group({ needs: ["Medical"] }),
      shelter(1, { available_facilities: ["Power"], degraded_facilities: ["Medical"] }),
      [route(1, 1, 10)],
      100,
    );
    expect(degraded.feasible).toBe(false);
    if (!degraded.feasible) expect(degraded.reasons[0]).toMatch(/currently unavailable/);
  });

  it("rejects closed shelters and shelters without plannable capacity", () => {
    expect(evaluateEdge(group(), shelter(1, { open: false }), [route(1, 1, 10)], 100).feasible).toBe(false);
    const full = evaluateEdge(group(), shelter(1), [route(1, 1, 10)], 0);
    expect(full.feasible).toBe(false);
    if (!full.feasible) expect(full.verdict).toBe("capacity-exhausted");
  });

  it("protects the walk-in reserve", () => {
    expect(remainingCapacity(shelter(1, { capacity: 100, committed: 85, reserved: 10 }))).toBe(5);
    expect(remainingCapacity(shelter(1, { capacity: 100, committed: 95, reserved: 10 }))).toBe(0);
  });
});
