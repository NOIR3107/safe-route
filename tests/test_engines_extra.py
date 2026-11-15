"""Extra engine tests: priority scoring values, hard constraints and capacity handling (FR-06/07/08/09)."""
from app.engines.allocation_engine import AllocationEngine
from app.engines.priority_engine import PriorityEngine
from app.models.disaster import AffectedZone, Disaster
from app.models.evacuation import EvacuationPlan
from app.models.route import Route
from app.models.shelter import Shelter
from app.models.vehicle import Vehicle


def test_priority_score_formula():
    # 0.35*High(0.8) + 0.30*P1(1.0) + 0.20*Critical(1.0) + 0.15*min(1, 500/1000) = 0.855
    # Same number is asserted in the frontend engine test (frontend/src/engine/__tests__/replan.test.ts).
    disaster = Disaster(type="Flood", title="t", severity="Critical")
    zone = AffectedZone(name="z", location="z", population=600, evacuated_count=100, priority="P1", risk_level="High")
    assert PriorityEngine.calculate_zone_priority_score(zone, disaster) == 0.855


def test_fully_evacuated_zone_scores_zero():
    disaster = Disaster(type="Flood", title="t", severity="Critical")
    zone = AffectedZone(name="z", location="z", population=100, evacuated_count=100, priority="P1", risk_level="Extreme")
    assert PriorityEngine.calculate_zone_priority_score(zone, disaster) == 0


def test_priority_accepts_p1_with_suffix():
    disaster = Disaster(type="Flood", title="t", severity="Low")
    a = AffectedZone(name="a", location="a", population=100, evacuated_count=0, priority="P1-Critical", risk_level="Low")
    b = AffectedZone(name="b", location="b", population=100, evacuated_count=0, priority="P1", risk_level="Low")
    assert PriorityEngine.calculate_zone_priority_score(a, disaster) == PriorityEngine.calculate_zone_priority_score(b, disaster)


def test_flooded_route_is_never_chosen():
    open_route = Route(route_id=1, source="X", destination="S", distance_km=5, travel_time=20, risk_level="Low", status="Open")
    flooded = Route(route_id=2, source="X", destination="S", distance_km=1, travel_time=3, risk_level="Low", status="Flooded")
    chosen = AllocationEngine.find_feasible_route([flooded, open_route], "X", "S")
    assert chosen is not None and chosen.route_id == 1


def test_no_route_when_all_blocked():
    r = Route(route_id=1, source="X", destination="S", distance_km=5, travel_time=20, risk_level="Low", status="Blocked")
    assert AllocationEngine.find_feasible_route([r], "X", "S") is None


def test_suitability_prefers_capacity_and_short_trips():
    s = Shelter(name="s", location="S", capacity=100, current_occupancy=0, status="Active")
    near = Route(source="X", destination="S", distance_km=2, travel_time=6, risk_level="Low", status="Open")
    far = Route(source="X", destination="S", distance_km=20, travel_time=55, risk_level="High", status="Open")
    assert AllocationEngine.calculate_shelter_suitability(s, near, 100) > AllocationEngine.calculate_shelter_suitability(s, far, 100)
    closed = Shelter(name="c", location="S", capacity=100, current_occupancy=0, status="Closed")
    assert AllocationEngine.calculate_shelter_suitability(closed, near, 100) == -1.0


def test_population_split_across_shelters_respects_capacity(db_session, coordinator_user):
    disaster = Disaster(type="Flood", title="Split test", severity="High")
    db_session.add(disaster)
    db_session.commit()
    zone = AffectedZone(disaster_id=disaster.disaster_id, name="Z", location="Zone Z", population=150, priority="P1", risk_level="High")
    s1 = Shelter(name="Small", location="Hall 1", capacity=60, current_occupancy=0, status="Active")
    s2 = Shelter(name="Big", location="Hall 2", capacity=200, current_occupancy=0, status="Active")
    r1 = Route(source="Zone Z", destination="Hall 1", distance_km=1, travel_time=4, risk_level="Low", status="Open")
    r2 = Route(source="Zone Z", destination="Hall 2", distance_km=3, travel_time=10, risk_level="Low", status="Open")
    bus = Vehicle(vehicle_type="Bus", capacity=50, status="Available", current_location="Zone Z")
    db_session.add_all([zone, s1, s2, r1, r2, bus])
    db_session.commit()
    plan = EvacuationPlan(disaster_id=disaster.disaster_id, created_by=coordinator_user.user_id, name="p", status="Draft")
    db_session.add(plan)
    db_session.commit()

    assignments = AllocationEngine.generate_plan(db_session, plan, disaster, [zone], [s1, s2], [r1, r2], [bus])

    assert sum(a.people_count for a in assignments) == 150
    for a in assignments:
        shelter = s1 if a.shelter_id == s1.shelter_id else s2
        assert shelter.current_occupancy <= shelter.capacity
    assert zone.status == "Evacuated"
    assert plan.status == "Active"
