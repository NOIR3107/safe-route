import { describe, expect, it } from "vitest";
import { diffPlans } from "../diff";
import { MinCostFlow } from "../mcf";
import { zonePriorityScore } from "../priority";
import { selectAffected, type ActiveAssignmentLite } from "../replan";

const a = (over: Partial<ActiveAssignmentLite>): ActiveAssignmentLite => ({
  assignment_id: 1,
  zone_id: 1,
  shelter_id: 1,
  route_id: 1,
  household_ids: ["h1"],
  status: "Scheduled",
  severity: 3,
  required: [],
  ...over,
});

describe("selectAffected (only affected assignments change)", () => {
  const active = [
    a({ assignment_id: 1, route_id: 10, shelter_id: 1, household_ids: ["a", "b"] }),
    a({ assignment_id: 2, route_id: 11, shelter_id: 1, household_ids: ["c"], status: "In Progress" }),
    a({ assignment_id: 3, route_id: 12, shelter_id: 2, household_ids: ["d"], required: ["Medical"] }),
    a({ assignment_id: 4, route_id: 10, shelter_id: 2, household_ids: ["e"], status: "Completed" }),
  ];
  const size = () => 4;

  it("RouteBlocked touches only movable assignments on that route", () => {
    const out = selectAffected(active, { type: "RouteBlocked", route_ids: [10], label: "x" }, size);
    expect(out.map((d) => d.assignment_id)).toEqual([1]);
  });

  it("FacilityLost touches only groups that need the lost facility", () => {
    const out = selectAffected(active, { type: "FacilityLost", shelter_id: 2, facilities: ["Medical", "Power"], label: "x" }, size);
    expect(out.map((d) => d.assignment_id)).toEqual([3]);
  });

  it("ShelterFull displaces scheduled groups before en-route ones (stability)", () => {
    const out = selectAffected(active, { type: "ShelterFull", shelter_id: 1, overflow: 6, label: "x" }, size);
    expect(out.map((d) => d.assignment_id)).toEqual([1]);
    expect(out.flatMap((d) => d.household_ids)).toEqual(["a", "b"]);
    const more = selectAffected(active, { type: "ShelterFull", shelter_id: 1, overflow: 10, label: "x" }, size);
    expect(more.map((d) => d.assignment_id)).toEqual([1, 2]);
  });

  it("RetryUnallocated displaces nobody", () => {
    expect(selectAffected(active, { type: "RetryUnallocated", label: "x" }, size)).toEqual([]);
  });
});

describe("diffPlans", () => {
  it("aggregates moves per zone/from/to with the ETA impact", () => {
    const households = new Map([
      ["a", { zone_id: 1, size: 3 }],
      ["b", { zone_id: 1, size: 2 }],
      ["c", { zone_id: 2, size: 4 }],
    ]);
    const prev = new Map([
      ["a", { shelter_id: 1, eta: 30 }],
      ["b", { shelter_id: 1, eta: 30 }],
      ["c", { shelter_id: 2, eta: 20 }],
    ]);
    const next = new Map([
      ["a", { shelter_id: 3, eta: 40 }],
      ["b", { shelter_id: 3, eta: 40 }],
      ["c", { shelter_id: 2, eta: 20 }],
    ]);
    const d = diffPlans(prev, next, { households, zoneNames: new Map(), shelterNames: new Map(), reason: "bridge" });
    expect(d.people_moved).toBe(5);
    expect(d.people_unchanged).toBe(4);
    expect(d.avg_eta_delta).toBe(10);
    expect(d.moves).toHaveLength(1);
    expect(d.moves[0]).toMatchObject({ from_shelter_id: 1, to_shelter_id: 3, people: 5, households: 2, eta_before: 30, eta_after: 40 });
  });

  it("reports newly unallocated people", () => {
    const households = new Map([["a", { zone_id: 1, size: 3 }]]);
    const d = diffPlans(new Map([["a", { shelter_id: 1, eta: 10 }]]), new Map(), {
      households,
      zoneNames: new Map(),
      shelterNames: new Map(),
      reason: "closed",
    });
    expect(d.newly_unallocated).toBe(3);
    expect(d.moves[0]!.to_shelter_id).toBeNull();
  });
});

describe("MinCostFlow", () => {
  it("solves a small transportation problem optimally", () => {
    // s=0, a=1, b=2, x=3, y=4, t=5. Both sources prefer x; optimum sends a→y, b→x.
    const g = new MinCostFlow(6);
    g.addEdge(0, 1, 5, 0);
    g.addEdge(0, 2, 5, 0);
    const ax = g.addEdge(1, 3, 5, 1);
    const ay = g.addEdge(1, 4, 5, 2);
    const bx = g.addEdge(2, 3, 5, 1);
    const by = g.addEdge(2, 4, 5, 10);
    g.addEdge(3, 5, 5, 0);
    g.addEdge(4, 5, 5, 0);
    const res = g.solve(0, 5);
    expect(res.flow).toBe(10);
    expect(res.cost).toBe(15);
    expect([g.flowOn(ax), g.flowOn(ay), g.flowOn(bx), g.flowOn(by)]).toEqual([0, 5, 5, 0]);
  });
});

describe("zonePriorityScore (parity with app/engines/priority_engine.py)", () => {
  it("matches the backend weighted formula", () => {
    // 0.35*High(0.8) + 0.30*P1(1.0) + 0.20*Critical(1.0) + 0.15*min(1, 500/1000) = 0.855
    expect(zonePriorityScore({ population: 600, evacuated_count: 100, risk_level: "High", priority: "P1" }, "Critical")).toBe(0.855);
    expect(zonePriorityScore({ population: 100, evacuated_count: 100, risk_level: "High", priority: "P1" }, "Critical")).toBe(0);
  });
});
