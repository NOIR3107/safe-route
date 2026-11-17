"""Field team, shelter check-in, reunification and the public evacuee lookup."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.repositories import Repos
from app.schemas import requests as rq
from app.schemas.responses import AssignmentView, CheckInResult, Household, Roster
from app.services import operations
from app.services.catalog import assert_shelter_scope
from app.services.context import Actor
from app.services.views import household_view

from .catalog import run
from .deps import commit_and_publish, current_actor, get_repos, require

router = APIRouter(tags=["Field and shelter operations"])


def _result(r: dict) -> dict:
    return {**r, "household": household_view(r["household"]) if r["household"] else None}


# --------------------------------------------------------------------------- field team


@router.get("/field/tasks", response_model=list[AssignmentView])
def field_tasks(actor: Actor = Depends(current_actor), repos: Repos = Depends(get_repos)):
    return run(lambda: operations.field_tasks(repos, actor))


@router.get("/assignments/{assignment_id}/households", response_model=list[Household])
def assignment_households(assignment_id: int, _: Actor = Depends(current_actor), repos: Repos = Depends(get_repos)):
    return [household_view(h) for h in run(lambda: operations.assignment_households(repos, assignment_id))]


@router.post("/field/assignments/{assignment_id}/pickup", status_code=204)
def pickup(assignment_id: int, body: rq.PickupRequest, actor: Actor = Depends(require("field:update")), repos: Repos = Depends(get_repos)):
    run(lambda: operations.mark_picked_up(repos, assignment_id, body.household_ids, actor))
    commit_and_publish(repos)


@router.post("/field/assignments/{assignment_id}/arrive", status_code=204)
def arrive(assignment_id: int, actor: Actor = Depends(require("field:update")), repos: Repos = Depends(get_repos)):
    run(lambda: operations.mark_arrived(repos, assignment_id, actor))
    commit_and_publish(repos)


@router.post("/field/vehicles/{vehicle_id}/position", status_code=204)
def position(
    vehicle_id: int, body: rq.PositionReport, actor: Actor = Depends(require("vehicle:status")), repos: Repos = Depends(get_repos)
):
    """Real GPS from a field device; replaces the timeline estimate on the map."""
    run(lambda: operations.report_position(repos, vehicle_id, body.latitude, body.longitude, actor))
    commit_and_publish(repos, ["vehicles"])


# --------------------------------------------------------------------------- shelter operations


@router.get("/shelters/{shelter_id}/roster", response_model=Roster)
def roster(shelter_id: int, actor: Actor = Depends(require("shelter:checkin")), repos: Repos = Depends(get_repos)):
    run(lambda: assert_shelter_scope(actor, shelter_id))
    r = operations.roster(repos, shelter_id)
    return {"expected": [household_view(h) for h in r["expected"]], "present": [household_view(h) for h in r["present"]]}


@router.post("/shelters/{shelter_id}/checkin", response_model=CheckInResult)
def check_in(
    shelter_id: int, body: rq.CheckInRequest, actor: Actor = Depends(require("shelter:checkin")), repos: Repos = Depends(get_repos)
):
    def go():
        assert_shelter_scope(actor, shelter_id)
        return operations.check_in(repos, shelter_id, body.token, actor)

    result = _result(run(go))
    commit_and_publish(repos)
    return result


@router.post("/shelters/{shelter_id}/walk-ins", response_model=CheckInResult)
def walk_in(shelter_id: int, body: rq.WalkInRequest, actor: Actor = Depends(require("shelter:checkin")), repos: Repos = Depends(get_repos)):
    def go():
        assert_shelter_scope(actor, shelter_id)
        return operations.register_walk_in(repos, shelter_id, body.head_name, body.people, actor)

    result = _result(run(go))
    commit_and_publish(repos)
    return result


@router.get("/reunification")
def reunification(q: str = Query(min_length=1), _: Actor = Depends(current_actor), repos: Repos = Depends(get_repos)) -> list[dict]:
    """Find a family member across all shelters by name, household id or phone."""
    return operations.reunification_search(repos, q)


# --------------------------------------------------------------------------- public (no login)


@router.get("/public/lookup", tags=["Public"])
def public_lookup(q: str = Query(min_length=1, max_length=40), repos: Repos = Depends(get_repos)) -> list[dict]:
    """Evacuee lookup by zone code (e.g. VEL) or registered phone number. No login."""
    return operations.public_lookup(repos, q)
