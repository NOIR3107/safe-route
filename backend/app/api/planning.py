"""Evacuation planning endpoints (FR-06 to FR-10)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.engine import ReplanEvent
from app.repositories import Repos
from app.schemas import requests as rq
from app.schemas.responses import AssignmentView, PlanView, ResourceAllocationOut
from app.services import planning
from app.services.context import Actor
from app.services.views import PlanState, assignment_view, plan_view

from .catalog import run
from .deps import commit_and_publish, get_repos, require

router = APIRouter(prefix="/evacuations", tags=["Evacuation planning (FR-06..10)"])


@router.get("/plan", response_model=PlanView | None)
def active_plan(_: Actor = Depends(require("plan:view")), repos: Repos = Depends(get_repos)):
    return plan_view(PlanState(repos))


@router.get("/assignments", response_model=list[AssignmentView])
def list_assignments(
    version: int | None = Query(default=None), _: Actor = Depends(require("plan:view")), repos: Repos = Depends(get_repos)
):
    plan = repos.plans.current_plan()
    if plan is None:
        return []
    v = repos.plans.current_version(plan) if version is None else repos.plans.version(plan.plan_id, version)
    if v is None:
        return []
    zones = {z.zone_id: z for z in repos.zones.list()}
    shelters = {s.shelter_id: s for s in repos.shelters.list()}
    routes = {r.route_id: r for r in repos.routes.list()}
    return [assignment_view(a, zones, shelters, routes) for a in repos.plans.assignments_by_ids(v.assignment_ids)]


@router.post("/generate", response_model=PlanView)
def generate(body: rq.GeneratePlanRequest, actor: Actor = Depends(require("plan:generate")), repos: Repos = Depends(get_repos)):
    """Sequence diagram: Coordinator -> REST API -> EvacuationService -> AllocationEngine -> repositories -> DB."""
    run(lambda: planning.generate_or_regenerate(repos, body.strategy, actor))
    commit_and_publish(repos)
    return plan_view(PlanState(repos))


@router.get("/compare")
def compare(_: Actor = Depends(require("plan:view")), repos: Repos = Depends(get_repos)) -> dict:
    """Greedy vs Min-Cost Flow on the current situation. Saves nothing."""
    return planning.compare(repos)


@router.post("/versions/{version}/approve", response_model=PlanView)
def approve(version: int, actor: Actor = Depends(require("plan:approve")), repos: Repos = Depends(get_repos)):
    run(lambda: planning.approve_version(repos, version, actor))
    commit_and_publish(repos)
    return plan_view(PlanState(repos))


@router.post("/assignments/{assignment_id}/override", response_model=PlanView)
def override(
    assignment_id: int, body: rq.OverrideRequest, actor: Actor = Depends(require("plan:override")), repos: Repos = Depends(get_repos)
):
    run(lambda: planning.override_assignment(repos, assignment_id, body.shelter_id, body.reason, actor))
    commit_and_publish(repos)
    return plan_view(PlanState(repos))


@router.post("/reallocate", response_model=PlanView | None)
def reallocate(body: rq.ReallocateRequest, actor: Actor = Depends(require("plan:override")), repos: Repos = Depends(get_repos)):
    """Original backend's manual contingency endpoint, kept for compatibility. Prefer changing the
    route or shelter status, which triggers the same re-plan."""
    if body.blocked_route_id is None and body.full_shelter_id is None:
        raise HTTPException(422, "Give blocked_route_id or full_shelter_id")
    if body.blocked_route_id is not None:
        event = ReplanEvent("RouteBlocked", body.reason, route_ids=[body.blocked_route_id])
        trigger = {"type": "RouteBlocked", "description": body.reason, "route_ids": [body.blocked_route_id]}
    else:
        event = ReplanEvent("ShelterClosed", body.reason, shelter_id=body.full_shelter_id)
        trigger = {"type": "ShelterClosed", "description": body.reason, "shelter_id": body.full_shelter_id}
    run(lambda: planning.replan(repos, planning.ReplanOptions(event=event, trigger=trigger, actor=actor)))
    commit_and_publish(repos)
    return plan_view(PlanState(repos))


@router.get("/resource-allocations", response_model=list[ResourceAllocationOut])
def resource_allocations(_: Actor = Depends(require("plan:view")), repos: Repos = Depends(get_repos)):
    """FR-09: relief supplies earmarked per shelter by the current version."""
    v = repos.plans.current_version()
    if v is None:
        return []
    shelters = {s.shelter_id: s.name for s in repos.shelters.list()}
    resources = {r.resource_id: r.resource_type for r in repos.resources.list()}
    return [
        {
            "shelter_id": a.shelter_id,
            "shelter_name": shelters.get(a.shelter_id, ""),
            "resource_id": a.resource_id,
            "resource_type": resources.get(a.resource_id, ""),
            "quantity": a.quantity,
        }
        for a in repos.plans.resource_allocations(v.version_id)
    ]
