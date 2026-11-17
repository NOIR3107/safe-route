"""FR-10 re-planning triggers, plan diff, shelter status thresholds (TC-ENG-24 .. TC-ENG-33)."""

from __future__ import annotations

import json

import pytest

from app.engine import (
    ActiveAssignment,
    Placement,
    PlanningConfig,
    ReplanEvent,
    diff_plans,
    load_planning_config,
    select_affected,
    shelter_display_status,
)

CFG = PlanningConfig()
SIZES = {"A": 4, "B": 3, "C": 5, "D": 2}


def active():
    return [
        ActiveAssignment(1, 1, 10, 100, ["A", "B"], "Scheduled", 5, []),
        ActiveAssignment(2, 2, 10, 101, ["C"], "In Progress", 3, ["Medical"]),
        ActiveAssignment(3, 2, 11, 102, ["D"], "Completed", 3, []),
    ]


def ids(displacements):
    return sorted((d.assignment_id, tuple(d.household_ids)) for d in displacements)


def test_eng24_route_blocked_moves_only_groups_on_that_route():
    out = select_affected(active(), ReplanEvent("RouteBlocked", "flood", route_ids=[101]), SIZES.get)
    assert ids(out) == [(2, ("C",))]


def test_eng25_shelter_closed_moves_every_movable_group_heading_there():
    out = select_affected(active(), ReplanEvent("ShelterClosed", "crack", shelter_id=10), SIZES.get)
    assert ids(out) == [(1, ("A", "B")), (2, ("C",))]


def test_eng26_facility_lost_moves_only_groups_that_need_it():
    out = select_affected(active(), ReplanEvent("FacilityLost", "power cut", shelter_id=10, facilities=["Medical"]), SIZES.get)
    assert ids(out) == [(2, ("C",))]


def test_eng27_completed_assignments_are_never_moved():
    out = select_affected(active(), ReplanEvent("ShelterClosed", "x", shelter_id=11), SIZES.get)
    assert out == []


def test_eng28_shelter_full_moves_just_enough_people_not_yet_on_the_road_first():
    out = select_affected(active(), ReplanEvent("ShelterFull", "walk-ins", shelter_id=10, overflow=3), SIZES.get)
    # Assignment 1 is Scheduled (not on the road), so it is trimmed first, biggest household first.
    assert ids(out) == [(1, ("A",))]


def test_eng29_regenerate_only_touches_scheduled():
    out = select_affected(active(), ReplanEvent("Regenerate", "again"), SIZES.get)
    assert ids(out) == [(1, ("A", "B"))]


def test_eng30_diff_reports_moves_and_eta_change():
    prev = {"A": Placement(10, 40), "B": Placement(10, 40), "C": Placement(10, 50)}
    nxt = {"A": Placement(10, 40), "B": Placement(12, 55), "C": Placement(12, 60)}
    d = diff_plans(
        prev, nxt, {"A": (1, 4), "B": (1, 3), "C": (2, 5)}, {1: "Velachery", 2: "Adyar"}, {10: "IIT", 12: "AU"}, "bridge flooded"
    )
    assert d["people_moved"] == 8 and d["people_unchanged"] == 4
    move = next(m for m in d["moves"] if m["zone_name"] == "Velachery")
    assert (move["from_shelter_name"], move["to_shelter_name"], move["eta_before"], move["eta_after"]) == ("IIT", "AU", 40, 55)
    assert d["avg_eta_delta"] == round((15 * 3 + 10 * 5) / 8, 1)


@pytest.mark.parametrize(
    "status,occupancy,inbound,expected",
    [
        ("Active", 100, 300, "Open"),
        ("Active", 500, 250, "Near Full"),
        ("Active", 600, 300, "Near Full"),  # 90 %: only the walk-in reserve is left, still not "Full"
        ("Active", 900, 100, "Full"),
        ("Full", 10, 0, "Full"),
        ("Closed", 0, 0, "Closed"),
        ("Inactive", 0, 0, "Closed"),
    ],
)
def test_eng31_shelter_status_comes_from_real_numbers(status, occupancy, inbound, expected):
    assert shelter_display_status(status, 1000, occupancy, inbound, CFG) == expected


def test_eng32_status_thresholds_are_configurable(tmp_path):
    f = tmp_path / "planning.json"
    f.write_text(json.dumps({"near_full_threshold": 0.5, "severity_weight": {"1": 1, "2": 1, "3": 1, "4": 1, "5": 9}}))
    cfg = load_planning_config(f)
    assert shelter_display_status("Active", 100, 55, 0, cfg) == "Near Full"
    assert cfg.severity_weight[5] == 9


def test_eng33_unknown_config_key_is_rejected(tmp_path):
    f = tmp_path / "planning.json"
    f.write_text(json.dumps({"near_ful_threshold": 0.5}))
    with pytest.raises(ValueError):
        load_planning_config(f)
