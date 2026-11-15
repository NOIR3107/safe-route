import { describe, expect, it } from "vitest";
import { allocate, compareStrategies } from "../allocate";
import { households, input, route, shelter, zone } from "./fixtures";

const SEVERITY = "High" as const;

function everyHouseholdOnce(result: ReturnType<typeof allocate>, ids: string[]) {
  const placed = [...result.assignments.flatMap((a) => a.household_ids), ...result.unallocated.flatMap((u) => u.household_ids)];
  expect(placed.sort()).toEqual([...ids].sort());
}

describe.each(["greedy", "min-cost-flow"] as const)("%s strategy", (strategy) => {
  it("keeps households together and never exceeds plannable capacity", () => {
    const hh = [...households(1, [4, 3, 5, 2, 6, 1]), ...households(2, [5, 5, 4])];
    const inp = input({
      zones: [zone(1), zone(2)],
      households: hh,
      shelters: [shelter(1, { capacity: 15, reserved: 2 }), shelter(2, { capacity: 30, committed: 10, reserved: 3 })],
      routes: [route(1, 1, 5), route(1, 2, 9), route(2, 1, 7), route(2, 2, 6)],
    });
    const r = allocate(inp, { strategy, disasterSeverity: SEVERITY });
    everyHouseholdOnce(
      r,
      hh.map((h) => h.household_id),
    );
    const load = new Map<number, number>();
    for (const a of r.assignments) {
      load.set(a.shelter_id, (load.get(a.shelter_id) ?? 0) + a.people);
      const sizes = a.household_ids.map((id) => hh.find((h) => h.household_id === id)!.size);
      expect(a.people).toBe(sizes.reduce((s, n) => s + n, 0));
    }
    expect(load.get(1) ?? 0).toBeLessThanOrEqual(15 - 2);
    expect(load.get(2) ?? 0).toBeLessThanOrEqual(30 - 10 - 3);
  });

  it("never sends medical households to a shelter without a medical facility", () => {
    const hh = [
      ...households(1, [3, 2], { needs: ["Medical"] }),
      ...households(1, [4, 4]).map((h, i) => ({ ...h, household_id: `G-${i}` })),
    ];
    const inp = input({
      zones: [zone(1)],
      households: hh,
      shelters: [shelter(1, { available_facilities: ["Power", "Water", "Food"] }), shelter(2)],
      routes: [route(1, 1, 3), route(1, 2, 30)],
    });
    const r = allocate(inp, { strategy, disasterSeverity: SEVERITY });
    for (const a of r.assignments) {
      if (a.household_ids.some((id) => id.startsWith("HH-"))) expect(a.shelter_id).toBe(2);
    }
    const medical = r.assignments.find((a) => a.explanation.required_facilities.includes("Medical"))!;
    expect(medical.shelter_id).toBe(2);
    const rejected = medical.explanation.alternatives.find((x) => x.shelter_id === 1)!;
    expect(rejected.verdict).toBe("infeasible");
    expect(rejected.reasons.join(" ")).toMatch(/medical/i);
  });

  it("removes edges for blocked routes and explains why", () => {
    const hh = households(1, [3, 3]);
    const inp = input({
      zones: [zone(1)],
      households: hh,
      shelters: [shelter(1), shelter(2)],
      routes: [route(1, 1, 4, { status: "Flooded" }), route(1, 2, 20)],
    });
    const r = allocate(inp, { strategy, disasterSeverity: SEVERITY });
    expect(r.assignments.every((a) => a.shelter_id === 2)).toBe(true);
    expect(r.assignments[0]!.explanation.alternatives[0]!.reasons.join(" ")).toMatch(/flooded/);
  });

  it("reports unallocated people when capacity is short", () => {
    const hh = households(1, [10, 10, 10]);
    const inp = input({ zones: [zone(1)], households: hh, shelters: [shelter(1, { capacity: 20 })], routes: [route(1, 1, 5)] });
    const r = allocate(inp, { strategy, disasterSeverity: SEVERITY });
    expect(r.metrics.people_allocated).toBe(20);
    expect(r.metrics.people_unallocated).toBe(10);
    expect(r.unallocated[0]!.reason).toMatch(/capacity/);
  });
});

describe("Min-Cost Flow vs Greedy", () => {
  it("finds a cheaper global assignment where greedy is myopic", () => {
    // Zone 1 ranks first (P1). Greedy gives it shelter 1 (cost 10) and pushes zone 2 onto the slow
    // route to shelter 2 (cost 40). MCF swaps: zone 1 → shelter 2 (11), zone 2 → shelter 1 (12).
    const hh = [...households(1, [5, 5]), ...households(2, [5, 5])];
    const inp = input({
      zones: [zone(1, { priority: "P1" }), zone(2, { priority: "P3" })],
      households: hh,
      shelters: [shelter(1, { capacity: 10 }), shelter(2, { capacity: 10 })],
      routes: [route(1, 1, 10), route(1, 2, 11), route(2, 1, 12), route(2, 2, 40)],
    });
    const both = compareStrategies(inp, SEVERITY);
    expect(both["min-cost-flow"].metrics.total_cost).toBeLessThan(both.greedy.metrics.total_cost);
    expect(both["min-cost-flow"].metrics.people_allocated).toBe(20);
    const z2 = both["min-cost-flow"].assignments.find((a) => a.zone_id === 2)!;
    expect(z2.shelter_id).toBe(1);
  });

  it("cuts low-severity zones first when capacity is short", () => {
    const hh = [...households(1, [10]), ...households(2, [10])];
    const inp = input({
      zones: [zone(1, { severity: 5 }), zone(2, { severity: 1 })],
      households: hh,
      shelters: [shelter(1, { capacity: 10 })],
      routes: [route(1, 1, 30), route(2, 1, 5)],
    });
    const r = allocate(inp, { strategy: "min-cost-flow", disasterSeverity: SEVERITY });
    expect(r.assignments.map((a) => a.zone_id)).toEqual([1]);
    expect(r.unallocated[0]!.zone_id).toBe(2);
  });
});

describe("vehicles & ETA", () => {
  it("prefers ambulances for medical groups and computes shuttle trips", () => {
    const hh = [
      ...households(1, [2], { needs: ["Medical"] }),
      ...households(1, [50, 50]).map((h, i) => ({ ...h, household_id: `G${i}` })),
    ];
    const inp = input({ zones: [zone(1)], households: hh, shelters: [shelter(1, { capacity: 500 })], routes: [route(1, 1, 10)] });
    const r = allocate(inp, { strategy: "greedy", disasterSeverity: SEVERITY });
    const medical = r.assignments.find((a) => a.explanation.required_facilities.includes("Medical"))!;
    expect(medical.vehicle_ids).toContain(3);
    const general = r.assignments.find((a) => a.people === 100)!;
    expect(general.trips).toBe(Math.ceil(100 / general.trip_capacity));
    expect(general.eta_minutes).toBe(
      general.approach_minutes + 5 * general.trips + general.travel_minutes * (2 * general.trips - 1),
    );
  });
});
