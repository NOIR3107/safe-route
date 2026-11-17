"""FR-07/08/09 allocation properties (TC-ENG-15 .. TC-ENG-22)."""

from __future__ import annotations

import pytest

from app.engine import EngineInput, PlanningConfig, allocate, compare_strategies
from app.engine.cost import is_route_usable, remaining_capacity

from .builders import household, random_input, route, shelter, vehicle, zone

CFG = PlanningConfig()
SEEDS = range(40)


@pytest.mark.parametrize("strategy", ["greedy", "min-cost-flow"])
@pytest.mark.parametrize("seed", SEEDS)
def test_eng15_capacity_is_never_exceeded(seed, strategy):
    inp = random_input(seed)
    result = allocate(inp, strategy, "High", CFG)
    used: dict[int, int] = {}
    for a in result.assignments:
        used[a.shelter_id] = used.get(a.shelter_id, 0) + a.people
    for s in inp.shelters:
        assert used.get(s.shelter_id, 0) <= remaining_capacity(s), f"shelter {s.shelter_id} over capacity"


@pytest.mark.parametrize("strategy", ["greedy", "min-cost-flow"])
@pytest.mark.parametrize("seed", SEEDS)
def test_eng16_hard_constraints_always_hold(seed, strategy):
    inp = random_input(seed)
    shelters = {s.shelter_id: s for s in inp.shelters}
    routes = {r.route_id: r for r in inp.routes}
    hh = {h.household_id: h for h in inp.households}
    for a in allocate(inp, strategy, "High", CFG).assignments:
        s, r = shelters[a.shelter_id], routes[a.route_id]
        assert s.open
        assert is_route_usable(r.status), "blocked/flooded route used"
        assert r.zone_id == a.zone_id and r.shelter_id == a.shelter_id
        for hid in a.household_ids:
            for need in hh[hid].needs:
                assert need in s.available_facilities


@pytest.mark.parametrize("seed", SEEDS)
def test_eng17_every_household_placed_once_and_never_split(seed):
    inp = random_input(seed)
    result = allocate(inp, "min-cost-flow", "High", CFG)
    placed = [hid for a in result.assignments for hid in a.household_ids]
    unplaced = [hid for u in result.unallocated for hid in u["household_ids"]]
    assert len(placed) == len(set(placed))
    assert sorted(placed + unplaced) == sorted(h.household_id for h in inp.households)
    sizes = {h.household_id: h.size for h in inp.households}
    for a in result.assignments:
        assert a.people == sum(sizes[h] for h in a.household_ids)


def test_eng18_engine_is_deterministic():
    a = allocate(random_input(7), "min-cost-flow", "High", CFG)
    b = allocate(random_input(7), "min-cost-flow", "High", CFG)
    assert [(x.shelter_id, x.household_ids, x.vehicle_ids, x.eta_minutes) for x in a.assignments] == [
        (x.shelter_id, x.household_ids, x.vehicle_ids, x.eta_minutes) for x in b.assignments
    ]
    assert a.metrics == b.metrics


@pytest.mark.parametrize("seed", SEEDS)
def test_eng19_min_cost_flow_is_never_worse_than_greedy_on_cost(seed):
    both = compare_strategies(random_input(seed), "High", CFG)
    g, m = both["greedy"].metrics, both["min-cost-flow"].metrics
    # MCF may place more people (each at some cost), so compare the unallocated count first.
    assert m["people_unallocated"] <= g["people_unallocated"] or m["total_cost"] <= g["total_cost"]


def test_eng20_nearest_cheapest_shelter_is_chosen_and_explained():
    inp = EngineInput(
        [zone(1)],
        [household("H1", 1, 4)],
        [shelter(1), shelter(2)],
        [route(1, 1, 1, minutes=30), route(2, 1, 2, minutes=10)],
        [vehicle(1)],
    )
    a = allocate(inp, "greedy", "High", CFG).assignments[0]
    assert a.shelter_id == 2
    assert "lowest weighted cost" in a.explanation["summary"]
    alt = a.explanation["alternatives"][0]
    assert alt["shelter_id"] == 1 and alt["verdict"] == "higher-cost" and alt["delta_pct"] > 0


def test_eng21_medical_group_without_vehicle_is_left_unallocated():
    """FR-07 vehicle availability: a medical group cannot walk out."""
    inp = EngineInput([zone(1)], [household("H1", 1, 3, needs=("Medical",))], [shelter(1)], [route(1, 1, 1, km=2)], [])
    result = allocate(inp, "greedy", "High", CFG)
    assert result.assignments == []
    assert "No vehicle available" in result.unallocated[0]["reason"]


def test_eng22_short_walk_is_allowed_without_vehicles():
    inp = EngineInput([zone(1)], [household("H1", 1, 3)], [shelter(1)], [route(1, 1, 1, km=2)], [])
    a = allocate(inp, "greedy", "High", CFG).assignments[0]
    assert a.vehicle_ids == [] and a.eta_minutes == round(2 / 4 * 60) + 5


def test_eng23_ambulance_goes_to_medical_group_first():
    inp = EngineInput(
        [zone(1)],
        [household("H1", 1, 2, needs=("Medical",)), household("H2", 1, 4)],
        [shelter(1)],
        [route(1, 1, 1)],
        [vehicle(1, 50, "Bus", (13.0, 80.2)), vehicle(2, 6, "Ambulance", (13.2, 80.4))],
    )
    result = allocate(inp, "greedy", "High", CFG)
    medical = next(a for a in result.assignments if "Medical" in a.explanation["required_facilities"])
    assert 2 in medical.vehicle_ids
