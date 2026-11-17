"""FR-07 hard constraints and FR-08 ranking (TC-ENG-01 .. TC-ENG-09)."""

from __future__ import annotations

from app.engine import EngineInput, PlanningConfig
from app.engine.allocate import build_groups
from app.engine.cost import evaluate_edge, remaining_capacity

from .builders import household, route, shelter, zone

CFG = PlanningConfig()


def group_for(needs=(), size=4, severity=4):
    inp = EngineInput([zone(1, severity=severity)], [household("H1", 1, size, needs)], [], [], [])
    return build_groups(inp, "Critical", CFG)[0]


def test_eng01_closed_shelter_is_infeasible():
    s = shelter(1, open_=False)
    e = evaluate_edge(group_for(), s, [route(1, 1, 1)], 100, CFG)
    assert not e.feasible and e.verdict == "infeasible"


def test_eng02_blocked_or_flooded_route_is_excluded():
    for status in ("Blocked", "Flooded"):
        e = evaluate_edge(group_for(), shelter(1), [route(1, 1, 1, status=status)], 100, CFG)
        assert not e.feasible
        assert any(status.lower() in r for r in e.reasons)


def test_eng03_open_route_is_used_when_one_of_two_is_blocked():
    routes = [route(1, 1, 1, minutes=5, status="Flooded"), route(2, 1, 1, minutes=15)]
    e = evaluate_edge(group_for(), shelter(1), routes, 100, CFG)
    assert e.feasible and e.route.route_id == 2


def test_eng04_missing_required_facility_is_infeasible():
    e = evaluate_edge(group_for(needs=("Medical",)), shelter(1, facilities=("Water", "Food")), [route(1, 1, 1)], 100, CFG)
    assert not e.feasible
    assert any("medical" in r.lower() for r in e.reasons)


def test_eng05_degraded_facility_is_reported_as_unavailable():
    s = shelter(1, facilities=("Water", "Food"), degraded=("Medical",))
    e = evaluate_edge(group_for(needs=("Medical",)), s, [route(1, 1, 1)], 100, CFG)
    assert not e.feasible
    assert "Medical facility currently unavailable" in e.reasons


def test_eng06_no_capacity_left_is_excluded():
    s = shelter(1, capacity=100, committed=90, reserved=10)
    assert remaining_capacity(s) == 0
    e = evaluate_edge(group_for(), s, [route(1, 1, 1)], remaining_capacity(s), CFG)
    assert not e.feasible and e.verdict == "capacity-exhausted"


def test_eng07_cost_ranks_faster_and_safer_shelters_first():
    g = group_for()
    fast = evaluate_edge(g, shelter(1), [route(1, 1, 1, minutes=8, risk="Low")], 100, CFG)
    slow = evaluate_edge(g, shelter(2), [route(2, 1, 2, minutes=8, risk="High")], 100, CFG)
    assert fast.cost.total < slow.cost.total
    assert slow.cost.risk_penalty == 10


def test_eng08_severity_weights_travel_time():
    low = evaluate_edge(group_for(severity=1), shelter(1), [route(1, 1, 1, minutes=10)], 100, CFG)
    high = evaluate_edge(group_for(severity=5), shelter(1), [route(1, 1, 1, minutes=10)], 100, CFG)
    assert low.cost.travel_cost == 10.0 and high.cost.travel_cost == 25.0


def test_eng09_ranking_weights_come_from_config():
    g = group_for()
    a = evaluate_edge(g, shelter(1), [route(1, 1, 1, minutes=10, risk="Severe")], 100, CFG)
    no_risk = PlanningConfig(risk_penalty={"Low": 0, "Moderate": 0, "High": 0, "Severe": 0})
    b = evaluate_edge(g, shelter(1), [route(1, 1, 1, minutes=10, risk="Severe")], 100, no_risk)
    assert a.cost.total - b.cost.total == 20
