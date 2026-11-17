"""Operation clock, event feed, dashboard summary, notifications, audit log and drills."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.core.database import dbs
from app.core.events import ALL, hub
from app.models import User
from app.repositories import Repos
from app.schemas import requests as rq
from app.schemas.responses import AuditLogOut, Clock, DashboardSummary, DrillState, NotificationOut, OpsEventOut, ScenarioSummary
from app.services import drill
from app.services.clock import now_minute
from app.services.context import Actor, as_utc, iso, utcnow
from app.services.views import dashboard_summary

from .catalog import run
from .deps import commit_and_publish, current_actor, current_user, get_repos, require

router = APIRouter(tags=["Operations, audit and drills (FR-12)"])


def feed_status(live: Repos) -> dict:
    last, source = live.ingest.last_received()
    seconds = (utcnow() - as_utc(last)).total_seconds() if last else None
    return {
        "source": "replay" if settings.REPLAY_FEED else source,
        "last_received_at": iso(last),
        "seconds_since": round(seconds, 1) if seconds is not None else None,
        "stale": seconds is None or seconds > settings.FEED_STALE_SECONDS,
        "messages": live.ingest.count(),
        "replay": settings.REPLAY_FEED,
    }


def clock_payload(repos: Repos) -> dict:
    state = repos.ops.get()
    with dbs.Live() as db:
        feed = feed_status(Repos(db, "live"))
    return {
        "mode": repos.mode,
        "sim_minute": now_minute(repos),
        "phase": state.phase if repos.mode == "drill" else "live",
        "speed": state.speed,
        "server_time": utcnow().isoformat(),
        "feed": feed,
    }


@router.get("/ops/clock", response_model=Clock)
def clock(repos: Repos = Depends(get_repos)):
    """T+ clock, live/drill mode and feed freshness. The same data arrives on the WebSocket every second."""
    return clock_payload(repos)


@router.get("/ops/events", response_model=list[OpsEventOut])
def ops_events(_: Actor = Depends(current_actor), repos: Repos = Depends(get_repos)):
    return [
        {"id": e.id, "sim_minute": e.sim_minute, "timestamp": iso(e.timestamp), "level": e.level, "title": e.title, "detail": e.detail}
        for e in repos.events.newest_first()
    ]


@router.get("/dashboard/summary", response_model=DashboardSummary)
def summary(_: Actor = Depends(current_actor), repos: Repos = Depends(get_repos)):
    return dashboard_summary(repos)


@router.get("/notifications", response_model=list[NotificationOut])
def notifications(user: User = Depends(current_user), repos: Repos = Depends(get_repos)):
    return [
        {
            "notification_id": n.notification_id,
            "user_id": n.user_id,
            "message": n.message,
            "type": n.type,
            "status": n.status,
            "timestamp": iso(n.timestamp),
        }
        for n in repos.notifications.for_user(user.user_id)
    ]


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: int, user: User = Depends(current_user), repos: Repos = Depends(get_repos)):
    n = repos.notifications.get(notification_id)
    if n is None or (n.user_id is not None and n.user_id != user.user_id):
        raise HTTPException(404, "Notification not found")
    n.status = "Read"
    commit_and_publish(repos, ["notifications"])
    return {
        "notification_id": n.notification_id,
        "user_id": n.user_id,
        "message": n.message,
        "type": n.type,
        "status": n.status,
        "timestamp": iso(n.timestamp),
    }


@router.get("/logs/audit", response_model=list[AuditLogOut])
def audit_log(_: Actor = Depends(require("audit:read")), repos: Repos = Depends(get_repos)):
    """Append-only: there is no endpoint that edits or deletes audit entries."""
    return [
        {
            "log_id": a.log_id,
            "user_id": a.user_id,
            "action": a.action,
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "details": a.details,
            "timestamp": iso(a.timestamp),
        }
        for a in repos.audit.newest_first()
    ]


# --------------------------------------------------------------------------- drills


@router.get("/drill", response_model=DrillState)
def drill_state(repos: Repos = Depends(get_repos)):
    return drill.drill_view(repos)


@router.get("/drill/scenarios", response_model=list[ScenarioSummary])
def drill_scenarios():
    return drill.scenarios()


@router.post("/drill/load", response_model=DrillState)
def drill_load(body: rq.DrillLoad, actor: Actor = Depends(require("drill:run"))):
    run(lambda: drill.load_scenario_for_drill(body.scenario_id, actor))
    hub.publish(ALL, dbs.mode)
    with dbs.Drill() as db:
        return drill.drill_view(Repos(db, "drill"))


@router.post("/drill/control", response_model=DrillState)
def drill_control(body: rq.DrillControl, actor: Actor = Depends(require("drill:run"))):
    """start (branches from live data) / pause / resume / speed / replay / reset / end."""
    run(lambda: drill.control(body.model_dump(exclude_none=True), actor))
    hub.publish(ALL, dbs.mode)
    db = dbs.Drill() if dbs.mode == "drill" else dbs.Live()
    with db:
        return drill.drill_view(Repos(db, dbs.mode))


@router.post("/drill/events", response_model=DrillState)
def drill_inject(body: rq.DrillInject, actor: Actor = Depends(require("drill:run")), repos: Repos = Depends(get_repos)):
    run(lambda: drill.inject_event(repos, body.model_dump(exclude_none=True), actor))
    commit_and_publish(repos)
    return drill.drill_view(repos)
