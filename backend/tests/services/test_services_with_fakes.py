"""Service rules tested with fake repositories (TC-SVC-01 .. TC-SVC-09; FR-03, FR-04, FR-10, FR-11, FR-12). No database."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import catalog, planning
from app.services.context import Actor, ServiceError

from .fakes import FakeRepos, fake_route, fake_shelter

COORD = Actor(2, "Evacuation Coordinator", "Evacuation Coordinator")
MANAGER = Actor(4, "Shelter Manager", "Shelter Manager", shelter_id=1)


@pytest.fixture
def calls(monkeypatch):
    """Record the re-planning calls the services make instead of running the planner."""
    seen = []
    monkeypatch.setattr(catalog, "replan", lambda repos, opts: seen.append(("replan", opts.event.type, opts.event)))
    monkeypatch.setattr(catalog, "retry_unallocated", lambda repos, label, actor: seen.append(("retry", label)))
    monkeypatch.setattr(catalog, "check_shelter_overflow", lambda repos, sid, actor, label: seen.append(("overflow", sid)))
    return seen


def test_svc01_closing_a_shelter_replans_and_logs(calls):
    repos = FakeRepos(shelters=[fake_shelter(1)])
    catalog.transition_shelter(repos, 1, "Closed", "Structural crack", COORD)
    assert repos.shelters.get(1).status == "Closed"
    assert calls[0][:2] == ("replan", "ShelterClosed")
    assert [a.action for a in repos.audit.items] == ["SHELTER_STATUS_CHANGE"]
    assert repos.notifications.items[0].type == "CRITICAL"
    assert repos.events.items[0].sim_minute == 12


def test_svc02_illegal_transition_is_rejected_and_nothing_is_written(calls):
    repos = FakeRepos(shelters=[fake_shelter(1, status="Closed")])
    with pytest.raises(ServiceError) as e:
        catalog.transition_shelter(repos, 1, "Full", None, COORD)
    assert e.value.status == 409
    assert calls == [] and repos.audit.items == []


def test_svc03_shelter_manager_cannot_touch_another_shelter(calls):
    repos = FakeRepos(shelters=[fake_shelter(2)])
    with pytest.raises(ServiceError) as e:
        catalog.transition_shelter(repos, 2, "Full", None, MANAGER)
    assert e.value.status == 403


def test_svc04_flooded_route_triggers_route_blocked_replan(calls):
    repos = FakeRepos(routes=[fake_route(7)])
    catalog.transition_route(repos, 7, "Flooded", "River over the deck", COORD)
    r = repos.routes.get(7)
    assert r.status == "Flooded" and r.risk_level == "Severe"
    kind, event_type, event = calls[0]
    assert (kind, event_type, event.route_ids) == ("replan", "RouteBlocked", [7])


def test_svc05_cleared_route_retries_unallocated_people(calls):
    repos = FakeRepos(routes=[fake_route(3, status="Blocked")])
    catalog.transition_route(repos, 3, "Cleared", None, COORD)
    assert calls[0][0] == "retry"
    assert repos.notifications.items[0].type == "INFO"


def test_svc06_marking_full_checks_overflow(calls):
    repos = FakeRepos(shelters=[fake_shelter(1)])
    catalog.transition_shelter(repos, 1, "Full", None, MANAGER)
    assert calls == [("overflow", 1)]


def test_svc07_occupancy_above_capacity_is_rejected(calls):
    repos = FakeRepos(shelters=[fake_shelter(1, capacity=100)])
    with pytest.raises(ServiceError) as e:
        catalog.update_shelter(repos, 1, {"current_occupancy": 150}, COORD)
    assert e.value.status == 422


def _version(number=2, status="Proposed"):
    return SimpleNamespace(
        version=number,
        status=status,
        plan_id=1,
        assignment_ids=[1, 2],
        approved_by=None,
        approved_at=None,
        metrics={"people_allocated": 10, "assignments": 2},
    )


def test_svc08_only_the_current_version_can_be_approved():
    repos = FakeRepos(versions=[_version(2)])
    with pytest.raises(ServiceError) as e:
        planning.approve_version(repos, 1, COORD)
    assert e.value.status == 409


def test_svc09_approval_marks_assignments_and_is_audited():
    a1, a2 = SimpleNamespace(assignment_id=1, approval="Proposed"), SimpleNamespace(assignment_id=2, approval="Overridden")
    v = _version(2)
    repos = FakeRepos(versions=[v], assignments=[a1, a2])
    planning.approve_version(repos, 2, COORD)
    assert v.status == "Approved" and v.approved_by == 2
    assert (a1.approval, a2.approval) == ("Approved", "Overridden")  # overrides keep their label
    assert repos.audit.items[0].action == "PLAN_APPROVED"
