/**
 * Drill / simulation mode: scripted events on a sim clock. Each event mutates the world (routes,
 * shelters) and raises the matching re-planning event, so the plan re-plans live.
 */
import type { DrillEvent, DrillState, RouteView } from "../extensions";
import type { RouteStatus } from "../schemas";
import { buildState, scenarioById } from "@/seed";
import {
  SYSTEM,
  audit,
  checkShelterOverflow,
  generateInitialPlan,
  logEvent,
  notify,
  progressAssignments,
  replan,
  retryUnallocated,
  type Actor,
} from "./planning";
import type { DbState } from "./state";
import { currentPlan } from "./views";

export function drillView(db: DbState): DrillState {
  return {
    scenario_id: db.drill.scenario_id,
    phase: db.drill.phase,
    sim_minute: db.sim_minute,
    speed: db.drill.speed,
    timeline: db.drill.timeline,
    fired_event_ids: db.drill.fired_event_ids,
    has_snapshot: db.drill.snapshot != null,
  };
}

export function freshState(scenarioId: string): DbState {
  return buildState(scenarioById(scenarioId));
}

function isBridge(segment: string): boolean {
  return /bridge|causeway/i.test(segment);
}

/** Sets a route status and runs the matching re-planning event. */
export function applyRouteStatus(db: DbState, routeIds: number[], status: RouteStatus, label: string, actor: Actor): void {
  const changed: number[] = [];
  for (const id of routeIds) {
    const r = db.routes.find((x) => x.route_id === id);
    if (!r || r.status === status) continue;
    r.status = status;
    if (status === "Blocked" || status === "Flooded") r.risk_level = "Severe";
    changed.push(id);
  }
  if (changed.length === 0) return;
  audit(db, actor, "ROUTE_STATUS_CHANGE", "Route", changed[0]!, `${label}: R${changed.join(", R")} → ${status}`);
  if (status === "Blocked" || status === "Flooded") {
    notify(db, "CRITICAL", `${label}. ${changed.length} route${changed.length > 1 ? "s" : ""} now ${status.toLowerCase()}.`);
    logEvent(db, "critical", label, `R${changed.join(", R")} ${status.toLowerCase()}`);
    replan(db, {
      event: { type: "RouteBlocked", route_ids: changed, label },
      trigger: { type: "RouteBlocked", description: label, route_ids: changed },
      actor,
    });
  } else if (status === "Congested") {
    notify(db, "WARNING", `${label}. Travel times on ${changed.length} route(s) up ~60%.`);
    logEvent(db, "warning", label, `R${changed.join(", R")} congested`);
  } else {
    notify(db, "INFO", `${label}. ${changed.length} route(s) usable again.`);
    logEvent(db, "success", label, `R${changed.join(", R")} ${status.toLowerCase()}`);
    retryUnallocated(db, label, actor);
  }
}

function routesVia(db: DbState, segment: string): RouteView[] {
  return db.routes
    .map((r) => ({ ...r, ext: db.route_ext.find((e) => e.route_id === r.route_id)! }))
    .filter((r) => r.ext.via.includes(segment));
}

export function applyDrillEvent(db: DbState, ev: DrillEvent, actor: Actor = SYSTEM): void {
  audit(db, actor, "DRILL_EVENT", "Drill", null, `T+${db.sim_minute}: ${ev.label}${ev.manual ? " (injected)" : ""}`);
  switch (ev.kind) {
    case "RouteSegmentBlocked": {
      const ids = routesVia(db, ev.segment ?? "").map((r) => r.route_id);
      applyRouteStatus(db, ids, isBridge(ev.segment ?? "") ? "Flooded" : "Blocked", ev.label, actor);
      break;
    }
    case "RouteSegmentCongested": {
      const ids = routesVia(db, ev.segment ?? "").filter((r) => r.status === "Open").map((r) => r.route_id);
      applyRouteStatus(db, ids, "Congested", ev.label, actor);
      break;
    }
    case "RouteSegmentCleared": {
      const ids = routesVia(db, ev.segment ?? "")
        .filter((r) => r.status === "Blocked" || r.status === "Flooded")
        .map((r) => r.route_id);
      applyRouteStatus(db, ids, "Cleared", ev.label, actor);
      break;
    }
    case "RouteBlocked":
      if (ev.route_id != null) applyRouteStatus(db, [ev.route_id], "Blocked", ev.label, actor);
      break;
    case "FacilityLost": {
      const s = db.shelters.find((x) => x.shelter_id === ev.shelter_id);
      if (!s) break;
      const lost: readonly string[] = ev.facilities ?? [];
      for (const f of s.facilities_list) if (lost.includes(f.facility_type)) f.availability_status = "Unavailable";
      notify(db, "CRITICAL", `${ev.label}. Medical/power-dependent evacuees will be re-planned.`);
      logEvent(db, "critical", ev.label, `${s.name}: ${ev.facilities?.join(", ")} unavailable`);
      replan(db, {
        event: { type: "FacilityLost", shelter_id: s.shelter_id, facilities: ev.facilities ?? [], label: ev.label },
        trigger: { type: "FacilityLost", description: ev.label, shelter_id: s.shelter_id, facilities: ev.facilities ?? [] },
        actor,
      });
      break;
    }
    case "ShelterClosed": {
      const s = db.shelters.find((x) => x.shelter_id === ev.shelter_id);
      if (!s) break;
      s.status = "Closed";
      notify(db, "CRITICAL", `${ev.label}. All inbound groups will be re-planned.`);
      logEvent(db, "critical", ev.label, `${s.name} closed`);
      replan(db, {
        event: { type: "ShelterClosed", shelter_id: s.shelter_id, label: ev.label },
        trigger: { type: "ShelterClosed", description: ev.label, shelter_id: s.shelter_id },
        actor,
      });
      break;
    }
    case "WalkIns": {
      const s = db.shelters.find((x) => x.shelter_id === ev.shelter_id);
      if (!s) break;
      const people = Math.min(ev.people ?? 0, s.capacity - s.current_occupancy);
      s.current_occupancy += people;
      const ext = db.shelter_ext.find((e) => e.shelter_id === s.shelter_id);
      if (ext) ext.walk_ins += people;
      notify(db, "WARNING", `${ev.label}. Walk-in reserve at ${s.name} consumed.`);
      logEvent(db, "warning", ev.label, `${s.name} occupancy now ${s.current_occupancy}/${s.capacity}`);
      checkShelterOverflow(db, s.shelter_id, actor, `${s.name} near capacity after ${people} walk-ins`);
      break;
    }
  }
  db.drill.fired_event_ids.push(ev.id);
}

/** Advances the sim clock minute by minute, firing due events and progressing assignments. */
export function advance(db: DbState, minutes: number, durationMinutes: number): void {
  for (let i = 0; i < minutes; i++) {
    if (db.drill.phase !== "running") return;
    db.sim_minute += 1;
    for (const ev of db.drill.timeline) {
      if (ev.at_minute <= db.sim_minute && !db.drill.fired_event_ids.includes(ev.id)) applyDrillEvent(db, ev);
    }
    progressAssignments(db);
    if (db.sim_minute >= durationMinutes) {
      db.drill.phase = "finished";
      logEvent(db, "info", "Drill finished", `Timeline complete at T+${db.sim_minute}`);
    }
  }
}

export function startDrill(db: DbState, actor: Actor): void {
  if (!currentPlan(db)) generateInitialPlan(db, "min-cost-flow", actor);
  const snapshot = { ...db, drill: { ...db.drill, snapshot: null } };
  db.drill.snapshot = JSON.stringify(snapshot);
  db.drill.phase = "running";
  audit(db, actor, "DRILL_START", "Drill", null, `Drill "${db.drill.scenario_id}" started at T+${db.sim_minute}`);
  logEvent(db, "info", "Drill started", `${db.drill.timeline.length} scripted events · speed ${db.drill.speed}×`);
}

/** Restores the T+0 snapshot but keeps the recorded timeline (incl. injected events) for replay. */
export function replayDrill(db: DbState): DbState {
  if (!db.drill.snapshot) return db;
  const restored = JSON.parse(db.drill.snapshot) as DbState;
  restored.drill = { ...db.drill, fired_event_ids: [], phase: "running" };
  logEvent(restored, "info", "Replay started", `Replaying ${restored.drill.timeline.length} events from T+${restored.sim_minute}`);
  return restored;
}
