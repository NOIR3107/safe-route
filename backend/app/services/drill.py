"""Simulation / drill mode.

A drill BRANCHES FROM LIVE DATA: every table is copied from the live database into the drill
database and the clocks are rebased so the drill starts at T+0. Scripted events (bridge floods,
walk-ins, power cuts) then run on the copy while the server advances the drill clock. Live data is
never touched. "Replay" restores the T+0 copy; "End drill" switches everyone back to live.

A seeded synthetic scenario can also be loaded for stress tests; it is labelled as synthetic.
"""

from __future__ import annotations

import pickle
from pathlib import Path

from sqlalchemy import select, text, update
from sqlalchemy.engine import Engine

from app.core.config import BACKEND_DIR
from app.core.database import Base, dbs, serialize_writes
from app.models import EvacuationAssignment, OpsEvent, OpsState, PlanVersion
from app.repositories import Repos
from app.seed import load_scenario, resolve_events, scenario_by_id
from app.seed.scenarios import SCENARIOS

from .catalog import SHELTER_TRANSITIONS, add_walk_ins, apply_route_status, routes_via, set_facility_availability, transition_shelter
from .clock import now_minute
from .context import SYSTEM, Actor, ServiceError, utcnow
from .logbook import audit, log_event
from .planning import generate_initial_plan, progress_assignments

SNAPSHOT_FILE = BACKEND_DIR / "var" / "drill_snapshot.pkl"


# --------------------------------------------------------------------------- copying databases


def _dump(engine: Engine) -> dict[str, list[dict]]:
    with engine.connect() as conn:
        return {t.name: [dict(r) for r in conn.execute(select(t)).mappings()] for t in Base.metadata.sorted_tables}


def _restore(engine: Engine, data: dict[str, list[dict]]) -> None:
    with engine.begin() as conn:
        serialize_writes(conn)
        pg = conn.dialect.name == "postgresql"
        if pg:
            conn.execute(text("SET session_replication_role = replica"))  # load in any order, keys checked by the source
            conn.execute(text(f"TRUNCATE {', '.join(t.name for t in Base.metadata.sorted_tables)} RESTART IDENTITY CASCADE"))
        else:
            for t in reversed(Base.metadata.sorted_tables):
                conn.execute(t.delete())
        for t in Base.metadata.sorted_tables:
            rows = data.get(t.name) or []
            if rows:
                conn.execute(t.insert(), rows)
        if pg:
            conn.execute(text("SET session_replication_role = DEFAULT"))
            for t in Base.metadata.sorted_tables:
                pk = list(t.primary_key.columns)
                if len(pk) == 1 and pk[0].autoincrement is not False and str(pk[0].type) == "INTEGER":
                    conn.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{t.name}', '{pk[0].name}'), "
                            f"COALESCE((SELECT MAX({pk[0].name}) FROM {t.name}), 0) + 1, false)"
                        )
                    )


def _save_snapshot(data: dict) -> None:
    SNAPSHOT_FILE.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_FILE.write_bytes(pickle.dumps(data))


def _load_snapshot() -> dict | None:
    if not SNAPSHOT_FILE.exists():
        return None
    return pickle.loads(Path(SNAPSHOT_FILE).read_bytes())  # our own file, written by _save_snapshot


def branch_from_live(phase: str, timeline: list[dict] | None = None) -> None:
    """Copy live into the drill database and make drill T+0 = now."""
    live = Repos(dbs.Live(), "live")
    try:
        m0 = now_minute(live)
        live_state = live.ops.get()
        timeline = timeline if timeline is not None else list(live_state.timeline)
        scenario_id, duration = live_state.scenario_id, live_state.duration_minutes
    finally:
        live.db.close()
    _restore(dbs.drill_engine, _dump(dbs.live_engine))
    with dbs.Drill() as db:
        serialize_writes(db)
        db.execute(update(EvacuationAssignment).values(dispatch_minute=EvacuationAssignment.dispatch_minute - m0))
        db.execute(update(PlanVersion).values(sim_minute=PlanVersion.sim_minute - m0))
        db.execute(update(OpsEvent).values(sim_minute=OpsEvent.sim_minute - m0))
        state = db.get(OpsState, 1) or OpsState(id=1)
        state.sim_minute, state.phase, state.timeline, state.fired_event_ids = 0, phase, timeline, []
        state.scenario_id, state.duration_minutes, state.branched_at = scenario_id, duration, utcnow()
        db.add(state)
        db.commit()


# --------------------------------------------------------------------------- reading


def drill_view(repos: Repos) -> dict:
    s = repos.ops.get()
    in_drill = repos.mode == "drill"
    return {
        "scenario_id": s.scenario_id,
        "phase": s.phase if in_drill else "idle",
        "sim_minute": s.sim_minute if in_drill else 0,
        "speed": s.speed,
        "timeline": s.timeline,
        "fired_event_ids": s.fired_event_ids if in_drill else [],
        "has_snapshot": in_drill and SNAPSHOT_FILE.exists(),
        "mode": repos.mode,
        "duration_minutes": s.duration_minutes,
        "synthetic": bool(s.scenario_id and s.scenario_id.startswith("synthetic")),
    }


def scenarios() -> list[dict]:
    out = []
    for sid, build in SCENARIOS.items():
        sc = build()
        out.append(
            {
                "id": sc["id"],
                "name": sc["name"] if sid.startswith("synthetic") else f"{sc['name']} (branch from live data)",
                "description": sc["description"],
                "duration_minutes": sc["duration_minutes"],
                "events": [{k: v for k, v in e.items() if k != "shelter_key"} for e in sc["events"]],
            }
        )
    return out


# --------------------------------------------------------------------------- events


def apply_drill_event(repos: Repos, ev: dict, actor: Actor = SYSTEM) -> None:
    audit(repos, actor, "DRILL_EVENT", "Drill", None, f"T+{now_minute(repos)}: {ev['label']}{' (injected)' if ev.get('manual') else ''}")
    kind = ev["kind"]
    if kind in ("RouteSegmentBlocked", "RouteSegmentCongested", "RouteSegmentCleared"):
        routes = routes_via(repos, ev.get("segment", ""))
        if kind == "RouteSegmentBlocked":
            status = "Flooded" if any(w in ev.get("segment", "").lower() for w in ("bridge", "causeway")) else "Blocked"
            apply_route_status(repos, [r.route_id for r in routes], status, ev["label"], actor)
        elif kind == "RouteSegmentCongested":
            apply_route_status(repos, [r.route_id for r in routes if r.status == "Open"], "Congested", ev["label"], actor)
        else:
            apply_route_status(repos, [r.route_id for r in routes if r.status in ("Blocked", "Flooded")], "Cleared", ev["label"], actor)
    elif kind == "RouteBlocked" and ev.get("route_id") is not None:
        apply_route_status(repos, [ev["route_id"]], "Blocked", ev["label"], actor)
    elif kind == "FacilityLost":
        set_facility_availability(repos, ev["shelter_id"], ev.get("facilities", []), "Unavailable", ev["label"], actor)
    elif kind == "ShelterClosed":
        s = repos.shelters.get(ev["shelter_id"])
        if s and "Closed" in SHELTER_TRANSITIONS.get(s.status, ()):
            transition_shelter(repos, s.shelter_id, "Closed", ev["label"], Actor(actor.user_id, actor.name, "Admin"))
    elif kind == "WalkIns":
        add_walk_ins(repos, ev["shelter_id"], ev.get("people", 0), ev["label"], actor)
    state = repos.ops.get()
    state.fired_event_ids = [*state.fired_event_ids, ev["id"]]


def advance(repos: Repos, minutes: int) -> bool:
    """Advance the drill clock minute by minute, firing due events and moving assignments.
    Returns True if anything changed."""
    state = repos.ops.get()
    if repos.mode != "drill" or state.phase != "running":
        return False
    for _ in range(minutes):
        if state.phase != "running":
            break
        state.sim_minute += 1
        for ev in sorted(state.timeline, key=lambda e: e["at_minute"]):
            if ev["at_minute"] <= state.sim_minute and ev["id"] not in state.fired_event_ids:
                apply_drill_event(repos, ev)
        progress_assignments(repos)
        if state.sim_minute >= state.duration_minutes:
            state.phase = "finished"
            log_event(repos, "info", "Drill finished", f"Timeline complete at T+{state.sim_minute}")
    return True


# --------------------------------------------------------------------------- control


def control(action: dict, actor: Actor) -> None:
    """start / pause / resume / speed / replay / reset / end. Opens its own sessions because it
    can switch which database the app uses."""
    kind = action["type"]
    if kind == "start" and dbs.mode == "live":
        branch_from_live("running")
        dbs.mode = "drill"
        with dbs.Drill() as db:
            repos = Repos(db, "drill")
            if repos.plans.current_plan() is None:
                generate_initial_plan(repos, "min-cost-flow", actor)
            state = repos.ops.get()
            audit(repos, actor, "DRILL_START", "Drill", None, f'Drill "{state.scenario_id}" branched from live data')
            log_event(
                repos, "info", "Drill started", f"Branched from live data · {len(state.timeline)} scripted events · speed {state.speed}×"
            )
            db.commit()
            _save_snapshot(_dump(dbs.drill_engine))
        _audit_live(actor, "DRILL_START", "Drill branched from live data (live data is not changed by the drill)")
        return
    if kind == "end":
        if dbs.mode == "drill":
            dbs.mode = "live"
            _audit_live(actor, "DRILL_END", "Drill ended; back to live data")
        return
    if kind == "reset":
        branch_from_live("ready")
        dbs.mode = "drill"
        SNAPSHOT_FILE.unlink(missing_ok=True)
        with dbs.Drill() as db:
            audit(Repos(db, "drill"), actor, "DRILL_RESET", "Drill", None, "Drill reset: branched again from live data")
            db.commit()
        return
    if dbs.mode != "drill":
        raise ServiceError(409, "No drill is running. Start a drill first.")
    if kind == "replay":
        snap = _load_snapshot()
        if snap is None:
            raise ServiceError(409, "Nothing to replay yet.")
        with dbs.Drill() as db:
            timeline = list(Repos(db, "drill").ops.get().timeline)  # keeps injected events
        _restore(dbs.drill_engine, snap)
        with dbs.Drill() as db:
            serialize_writes(db)
            repos = Repos(db, "drill")
            state = repos.ops.get()
            state.timeline, state.fired_event_ids, state.phase = timeline, [], "running"
            audit(repos, actor, "DRILL_REPLAY", "Drill", None, "Replaying drill from the T+0 snapshot")
            log_event(repos, "info", "Replay started", f"Replaying {len(timeline)} events from T+0")
            db.commit()
        return
    with dbs.Drill() as db:
        serialize_writes(db)
        state = Repos(db, "drill").ops.get()
        if kind == "start" and state.phase in ("ready", "idle"):
            state.phase = "running"
            if not SNAPSHOT_FILE.exists():
                db.commit()
                _save_snapshot(_dump(dbs.drill_engine))
        elif kind == "pause" and state.phase == "running":
            state.phase = "paused"
        elif kind == "resume" and state.phase == "paused":
            state.phase = "running"
        elif kind == "speed":
            state.speed = max(1, min(32, int(action.get("speed", 4))))
        db.commit()


def load_scenario_for_drill(scenario_id: str, actor: Actor) -> None:
    """Chennai: branch from live with the scenario's scripted events. Synthetic: load the seeded
    stress-test data into the drill database (clearly labelled as synthetic)."""
    sc = scenario_by_id(scenario_id)
    if not scenario_id.startswith("synthetic"):
        with dbs.Live() as db:
            shelter_ids = {s.name: s.shelter_id for s in Repos(db, "live").shelters.list()}
        keys = {key: shelter_ids.get(name) for key, name, *_ in sc["shelters"]}
        branch_from_live("ready", timeline=resolve_events(sc, {k: v for k, v in keys.items() if v}))
    else:
        with dbs.Drill() as db:
            load_scenario(db, sc)
            state = Repos(db, "drill").ops.get()
            state.phase = "ready"
            db.commit()
    dbs.mode = "drill"
    SNAPSHOT_FILE.unlink(missing_ok=True)
    with dbs.Drill() as db:
        audit(Repos(db, "drill"), actor, "DRILL_LOAD", "Drill", None, f"Loaded scenario {scenario_id}")
        db.commit()


def inject_event(repos: Repos, event: dict, actor: Actor) -> None:
    if repos.mode != "drill":
        raise ServiceError(409, "Events can only be injected during a drill. Use the normal status controls for live data.")
    state = repos.ops.get()
    n = sum(1 for e in state.timeline if str(e.get("id", "")).startswith("m")) + 1
    ev = {**event, "id": f"m{n}", "at_minute": state.sim_minute, "manual": True}
    state.timeline = sorted([*state.timeline, ev], key=lambda e: e["at_minute"])
    apply_drill_event(repos, ev, actor)


def _audit_live(actor: Actor, action: str, details: str) -> None:
    with dbs.Live() as db:
        audit(Repos(db, "live"), actor, action, "Drill", None, details)
        db.commit()
