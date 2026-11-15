/**
 * End-to-end check of the demo flow at the service layer (no browser):
 * login as Coordinator → generate plan → explanation → drill → route blocks → re-plan + diff →
 * override is audited. Also checks RBAC and the "only affected assignments change" guarantee.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { CHENNAI_FLOOD, buildState } from "@/seed";
import { MockApi } from "../MockApi";

let token: string | null = null;
let api: MockApi;

async function loginAs(email: string, password: string) {
  token = null;
  token = (await api.login(email, password)).access_token;
}

beforeEach(async () => {
  token = null;
  api = new MockApi(() => token, { latencyMs: 0, persist: false, initial: buildState(CHENNAI_FLOOD, new Date("2026-11-15T02:00:00Z")) });
  await loginAs("coordinator@saferoute.org", "Coord@12345");
});

describe("seeded Chennai scenario", () => {
  it("builds realistic, consistent seed data", async () => {
    const [zones, shelters, routes, vehicles] = await Promise.all([api.listZones(), api.listShelters(), api.listRoutes(), api.listVehicles()]);
    expect(zones).toHaveLength(8);
    expect(shelters).toHaveLength(7);
    expect(routes.length).toBeGreaterThan(30);
    expect(vehicles.length).toBeGreaterThan(40);
    for (const z of zones) expect(z.population).toBeGreaterThan(0);
    expect(zones.reduce((s, z) => s + z.vulnerable.medical, 0)).toBeGreaterThan(0);
  });
});

describe("demo flow", () => {
  it("generates an explainable plan, re-plans on events and audits overrides", async () => {
    const plan = await api.generatePlan("min-cost-flow");
    const v1 = plan.current_version!;
    expect(v1.version).toBe(1);
    expect(v1.metrics.people_allocated).toBeGreaterThan(4000);
    expect(v1.metrics.high_priority_served).toBeGreaterThan(0);

    const assignments = await api.listAssignments();
    expect(assignments.length).toBe(v1.assignment_ids.length);
    const a = assignments[0]!;
    expect(a.ext.explanation.summary.length).toBeGreaterThan(20);
    expect(a.ext.explanation.alternatives.length).toBeGreaterThan(0);
    expect(a.ext.explanation.cost.total).toBeGreaterThan(0);

    // Comparison runs both strategies without committing anything.
    const cmp = await api.compareStrategies();
    expect(cmp.greedy.people_allocated + cmp.greedy.people_unallocated).toBe(
      cmp["min-cost-flow"].people_allocated + cmp["min-cost-flow"].people_unallocated,
    );
    expect((await api.activePlan())!.versions).toHaveLength(1);

    await api.approveVersion(1);
    expect((await api.activePlan())!.current_version!.status).toBe("Approved");

    // Drill: start and run to just after the bridge floods (T+20).
    await api.drillControl({ type: "start" });
    const bridgeRoutes = (await api.listRoutes()).filter((r) => r.ext.via.includes("Thiru Vi Ka Bridge")).map((r) => r.route_id);
    const beforeBridge = await api.listAssignments();
    const untouched = beforeBridge.filter((x) => !bridgeRoutes.includes(x.route_id ?? -1) && x.status !== "Completed").map((x) => x.assignment_id);
    const onBridge = beforeBridge.filter((x) => bridgeRoutes.includes(x.route_id ?? -1));
    await api.advanceClock(21);

    const routes = await api.listRoutes();
    expect(routes.filter((r) => bridgeRoutes.includes(r.route_id)).every((r) => r.status === "Flooded")).toBe(true);

    const after = await api.activePlan();
    if (onBridge.length > 0) {
      expect(after!.versions.length).toBeGreaterThan(2 - 1);
      const v2 = after!.versions.find((v) => v.trigger.type === "RouteBlocked")!;
      expect(v2).toBeDefined();
      expect(v2.diff!.people_moved + v2.diff!.newly_unallocated).toBeGreaterThan(0);
      // Only affected assignments changed: every untouched assignment survives into v2 unchanged.
      for (const id of untouched) expect(v2.assignment_ids).toContain(id);
      // No new assignment uses a flooded route.
      const current = await api.listAssignments();
      expect(current.filter((x) => x.status !== "Completed").every((x) => !bridgeRoutes.includes(x.route_id ?? -1))).toBe(true);
    }

    // Run past the power loss (T+45) and the shelter closure (T+70).
    await api.advanceClock(55);
    const versions = (await api.activePlan())!.versions;
    const triggers = versions.map((v) => v.trigger.type);
    expect(triggers).toContain("FacilityLost");
    expect(triggers).toContain("ShelterClosed");
    const now = await api.listAssignments();
    const loyola = (await api.listShelters()).find((s) => s.name.startsWith("Loyola"))!;
    expect(loyola.available_facilities).not.toContain("Medical");
    expect(now.filter((x) => x.shelter_id === loyola.shelter_id && x.status !== "Completed").every((x) => !x.ext.explanation.required_facilities.includes("Medical"))).toBe(true);
    const summary = await api.dashboardSummary();
    expect(summary.population.total_evacuated).toBeGreaterThan(0);

    // Manual override with a reason → audited.
    const target = now.find((x) => x.status === "Scheduled" && x.ext.explanation.alternatives.some((alt) => alt.verdict === "higher-cost"));
    expect(target).toBeDefined();
    const alt = target!.ext.explanation.alternatives.find((x) => x.verdict === "higher-cost")!;
    await api.overrideAssignment(target!.assignment_id, alt.shelter_id, "Family requested shelter near relatives");
    const overridden = (await api.listAssignments()).find((x) => x.ext.approval === "Overridden");
    expect(overridden?.ext.override_reason).toBe("Family requested shelter near relatives");

    // The audit log is restricted to Admin / Incident Commander (GET /logs/audit).
    await loginAs("commander@saferoute.org", "Command@12345");
    const log = await api.listAudit();
    expect(log.some((l) => l.action === "ASSIGNMENT_OVERRIDE" && (l.details ?? "").includes("near relatives"))).toBe(true);
    expect(log.some((l) => l.action === "DYNAMIC_REALLOCATION")).toBe(true);
    expect(log.some((l) => l.action === "PLAN_APPROVED")).toBe(true);
  });

  it("supports replay from the T+0 snapshot", async () => {
    await api.drillControl({ type: "start" });
    await api.advanceClock(25);
    const v = (await api.activePlan())!.versions.length;
    await api.drillControl({ type: "replay" });
    expect((await api.drillState()).sim_minute).toBe(0);
    await api.advanceClock(25);
    expect((await api.activePlan())!.versions.length).toBe(v);
  });
});

describe("RBAC", () => {
  it("rejects plan generation for a Shelter Manager and scopes shelters", async () => {
    await loginAs("shelter.tnagar@saferoute.org", "Shelter@12345");
    await expect(api.generatePlan("greedy")).rejects.toMatchObject({ status: 403 });
    const shelters = await api.listShelters();
    expect(shelters).toHaveLength(1);
    await expect(api.updateShelter(2, { capacity: 10 })).rejects.toMatchObject({ status: 403 });
  });

  it("requires an override reason", async () => {
    await api.generatePlan("greedy");
    const a = (await api.listAssignments())[0]!;
    await expect(api.overrideAssignment(a.assignment_id, 1, "x")).rejects.toMatchObject({ status: 422 });
  });

  it("only Admin and Incident Commander read the audit log", async () => {
    await expect(api.listAudit()).rejects.toMatchObject({ status: 403 });
  });
});

describe("shelter operations & public lookup", () => {
  it("checks in by token, registers walk-ins and finds family members", async () => {
    await api.generatePlan("min-cost-flow");
    await loginAs("shelter.tnagar@saferoute.org", "Shelter@12345");
    const roster = await api.shelterRoster(1);
    const hh = roster.expected[0]!;
    const before = (await api.listShelters())[0]!.current_occupancy;
    const res = await api.checkIn(1, hh.token);
    expect(res.ok).toBe(true);
    expect((await api.listShelters())[0]!.current_occupancy).toBe(before + hh.size);
    expect((await api.checkIn(1, hh.token)).ok).toBe(false);
    const walk = await api.registerWalkIn(1, "Test Walkin", 3);
    expect(walk.ok).toBe(true);
    const hits = await api.reunificationSearch(hh.members[0]!.split(" ")[0]!);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("finds the demo household by phone number", async () => {
    await api.generatePlan("min-cost-flow");
    token = null;
    const res = await api.publicLookup("98400 12345");
    expect(res[0]!.head_name).toBe("Lakshmi Narayanan");
    expect(res[0]!.shelter).not.toBeNull();
    const zone = await api.publicLookup("VEL");
    expect(zone.length).toBeGreaterThan(0);
  });
});
