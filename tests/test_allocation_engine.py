from app.models.disaster import Disaster, AffectedZone
from app.models.shelter import Shelter
from app.models.route import Route
from app.models.vehicle import Vehicle
from app.models.evacuation import EvacuationPlan
from app.engines.priority_engine import PriorityEngine
from app.engines.allocation_engine import AllocationEngine


def test_priority_engine_ranking():
    disaster = Disaster(
        disaster_id=1,
        type="Flood",
        title="Test Flood",
        severity="Critical"
    )
    zone_critical = AffectedZone(
        zone_id=1,
        disaster_id=1,
        name="Zone A - High Risk",
        location="Zone A",
        population=1000,
        evacuated_count=0,
        priority="P1",
        risk_level="Extreme"
    )
    zone_moderate = AffectedZone(
        zone_id=2,
        disaster_id=1,
        name="Zone B - Low Risk",
        location="Zone B",
        population=300,
        evacuated_count=0,
        priority="P4",
        risk_level="Low"
    )

    ranked = PriorityEngine.rank_zones_for_evacuation([zone_moderate, zone_critical], disaster)
    assert len(ranked) == 2
    # Critical zone must be prioritized first
    assert ranked[0][0].zone_id == zone_critical.zone_id
    assert ranked[0][1] > ranked[1][1]


def test_hard_constraint_excludes_blocked_route_and_full_shelter(db_session, coordinator_user):
    # Setup disaster
    disaster = Disaster(type="Flood", title="Noida Flood", severity="High")
    db_session.add(disaster)
    db_session.commit()

    zone = AffectedZone(
        disaster_id=disaster.disaster_id,
        name="Sector 62",
        location="Sector 62",
        population=100,
        priority="P1",
        risk_level="High"
    )
    db_session.add(zone)

    # Shelter 1: Full
    shelter_full = Shelter(name="Shelter Full", location="Loc 1", capacity=100, current_occupancy=100, status="Full")
    # Shelter 2: Available
    shelter_avail = Shelter(name="Shelter Avail", location="Loc 2", capacity=200, current_occupancy=20, status="Active")
    db_session.add_all([shelter_full, shelter_avail])

    # Route 1: Open to Shelter Avail
    route_open = Route(source="Sector 62", destination="Loc 2", distance_km=5.0, travel_time=15.0, status="Open")
    # Route 2: Blocked
    route_blocked = Route(source="Sector 62", destination="Loc 1", distance_km=2.0, travel_time=5.0, status="Blocked")
    db_session.add_all([route_open, route_blocked])

    vehicle = Vehicle(vehicle_type="Bus", capacity=50, status="Available", current_location="Sector 62")
    db_session.add(vehicle)
    db_session.commit()

    plan = EvacuationPlan(
        disaster_id=disaster.disaster_id,
        created_by=coordinator_user.user_id,
        name="Evacuation Plan Test",
        status="Draft"
    )
    db_session.add(plan)
    db_session.commit()

    assignments = AllocationEngine.generate_plan(
        db=db_session,
        plan=plan,
        disaster=disaster,
        zones=[zone],
        shelters=[shelter_full, shelter_avail],
        routes=[route_open, route_blocked],
        vehicles=[vehicle]
    )

    assert len(assignments) == 1
    # Assignment must be to shelter_avail, not shelter_full
    assert assignments[0].shelter_id == shelter_avail.shelter_id
    assert assignments[0].people_count == 100
    assert shelter_avail.current_occupancy == 120
    assert zone.evacuated_count == 100
    assert zone.status == "Evacuated"
