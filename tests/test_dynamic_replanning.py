from app.models.disaster import Disaster, AffectedZone
from app.models.shelter import Shelter
from app.models.route import Route
from app.models.vehicle import Vehicle
from app.models.evacuation import EvacuationPlan
from app.engines.allocation_engine import AllocationEngine
from app.engines.replanning_engine import ReplanningEngine


def test_dynamic_reallocation_on_route_blockage(db_session, coordinator_user):
    # Setup disaster and zone
    disaster = Disaster(type="Fire", title="Industrial Fire", severity="High")
    db_session.add(disaster)
    db_session.commit()

    zone = AffectedZone(
        disaster_id=disaster.disaster_id,
        name="Sector 18",
        location="Sector 18",
        population=80,
        priority="P1",
        risk_level="High"
    )
    db_session.add(zone)

    # Initial Shelter A & Route A
    shelter_a = Shelter(name="Shelter A", location="Sector 19", capacity=100, current_occupancy=0, status="Active")
    route_a = Route(source="Sector 18", destination="Sector 19", distance_km=2.0, travel_time=5.0, status="Open")

    # Secondary Shelter B & Route B (alternate route)
    shelter_b = Shelter(name="Shelter B", location="Sector 20", capacity=150, current_occupancy=0, status="Active")
    route_b = Route(source="Sector 18", destination="Sector 20", distance_km=4.0, travel_time=12.0, status="Open")

    vehicle = Vehicle(vehicle_type="MiniBus", capacity=40, status="Available", current_location="Sector 18")

    db_session.add_all([shelter_a, route_a, shelter_b, route_b, vehicle])
    db_session.commit()

    # Step 1: Initial evacuation plan
    plan = EvacuationPlan(
        disaster_id=disaster.disaster_id,
        created_by=coordinator_user.user_id,
        name="Initial Plan",
        status="Draft"
    )
    db_session.add(plan)
    db_session.commit()

    initial_assignments = AllocationEngine.generate_plan(
        db=db_session,
        plan=plan,
        disaster=disaster,
        zones=[zone],
        shelters=[shelter_a, shelter_b],
        routes=[route_a, route_b],
        vehicles=[vehicle]
    )
    assert len(initial_assignments) == 1
    # Allocated to Shelter A initially (shorter route)
    assert initial_assignments[0].shelter_id == shelter_a.shelter_id
    assert shelter_a.current_occupancy == 80

    # Step 2: Route A suddenly gets blocked! Trigger Dynamic Replanning (FR-10)
    new_assignments = ReplanningEngine.handle_contingency(
        db=db_session,
        plan_id=plan.plan_id,
        blocked_route_id=route_a.route_id,
        user_id=coordinator_user.user_id,
        reason="Fire expanded, blocking route A"
    )

    assert len(new_assignments) == 1
    # Now evacuees should be rerouted to Shelter B!
    assert new_assignments[0].shelter_id == shelter_b.shelter_id
    assert new_assignments[0].route_id == route_b.route_id
    # Old shelter occupancy rolled back, new shelter occupancy incremented
    assert shelter_a.current_occupancy == 0
    assert shelter_b.current_occupancy == 80
    assert route_a.status == "Blocked"
