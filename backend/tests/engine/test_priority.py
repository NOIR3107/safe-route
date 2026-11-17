"""FR-06 evacuation priority (TC-ENG-10 .. TC-ENG-13)."""

from __future__ import annotations

from app.engine import EngineInput, PlanningConfig
from app.engine.allocate import build_groups
from app.engine.priority import zone_priority_score

from .builders import household, zone

CFG = PlanningConfig()


def test_eng10_higher_risk_and_priority_score_higher():
    critical = zone(1, priority="P1", risk="Extreme", population=500)
    mild = zone(2, priority="P3", risk="Low", population=500)
    assert zone_priority_score(critical, "Critical", CFG) > zone_priority_score(mild, "Critical", CFG)


def test_eng11_vulnerable_people_raise_priority():
    plain = zone(1, population=400, vulnerable=0)
    vulnerable = zone(2, population=400, vulnerable=200)
    assert zone_priority_score(vulnerable, "High", CFG) > zone_priority_score(plain, "High", CFG)


def test_eng12_evacuated_zone_has_zero_priority():
    z = zone(1, population=100)
    z.evacuated_count = 100
    assert zone_priority_score(z, "Critical", CFG) == 0


def test_eng13_groups_ordered_by_severity_then_needs():
    zones = [zone(1, severity=2), zone(2, severity=5)]
    hhs = [household("A", 1, 3), household("B", 2, 3), household("C", 2, 2, needs=("Medical",))]
    groups = build_groups(EngineInput(zones, hhs, [], [], []), "High", CFG)
    order = [(g.zone.zone_id, tuple(g.needs)) for g in groups]
    assert order == [(2, ("Medical",)), (2, ()), (1, ())]


def test_eng14_vulnerable_households_go_first_within_a_group():
    hhs = [household("A", 1, 6, vulnerable=0), household("B", 1, 2, vulnerable=1)]
    g = build_groups(EngineInput([zone(1)], hhs, [], [], []), "High", CFG)[0]
    assert [h.household_id for h in g.households] == ["B", "A"]
