from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.evacuation import EvacuationPlan, EvacuationAssignment, VehicleAssignment
from app.models.shelter import Shelter
from app.models.route import Route
from app.models.vehicle import Vehicle
from app.models.disaster import Disaster, AffectedZone
from app.models.audit import Notification, AuditLog
from app.engines.allocation_engine import AllocationEngine


class ReplanningEngine:
    """
    FR-10: Dynamic reallocation when shelters or routes become unavailable.
    Re-routes displaced populations to alternative feasible shelters.
    """

    @classmethod
    def handle_contingency(
        cls,
        db: Session,
        plan_id: int,
        blocked_route_id: Optional[int] = None,
        full_or_damaged_shelter_id: Optional[int] = None,
        user_id: Optional[int] = None,
        reason: str = "Critical route blocked or shelter unavailable"
    ) -> List[EvacuationAssignment]:
        plan = db.query(EvacuationPlan).filter(EvacuationPlan.plan_id == plan_id).first()
        if not plan:
            raise ValueError(f"Evacuation plan {plan_id} not found")

        disaster = db.query(Disaster).filter(Disaster.disaster_id == plan.disaster_id).first()
        if not disaster:
            raise ValueError(f"Disaster {plan.disaster_id} not found")

        # 1. Update blocked route status if specified
        if blocked_route_id:
            route = db.query(Route).filter(Route.route_id == blocked_route_id).first()
            if route:
                route.status = "Blocked"
                route.risk_level = "Severe"

        # 2. Update damaged/full shelter status if specified
        if full_or_damaged_shelter_id:
            shelter = db.query(Shelter).filter(Shelter.shelter_id == full_or_damaged_shelter_id).first()
            if shelter:
                shelter.status = "Full"

        # 3. Find compromised assignments
        compromised_query = db.query(EvacuationAssignment).filter(
            EvacuationAssignment.plan_id == plan_id,
            EvacuationAssignment.status.in_(["Scheduled", "In Progress"])
        )

        compromised_assignments: List[EvacuationAssignment] = []
        for assign in compromised_query.all():
            if blocked_route_id and assign.route_id == blocked_route_id:
                compromised_assignments.append(assign)
            elif full_or_damaged_shelter_id and assign.shelter_id == full_or_damaged_shelter_id:
                compromised_assignments.append(assign)

        if not compromised_assignments:
            return []

        # 4. Rollback compromised assignments: release old shelter occupancy and vehicles
        total_people_displaced = 0
        displaced_zone_ids = set()

        for assign in compromised_assignments:
            old_shelter = db.query(Shelter).filter(Shelter.shelter_id == assign.shelter_id).first()
            if old_shelter:
                old_shelter.current_occupancy = max(0, old_shelter.current_occupancy - assign.people_count)

            # Free vehicles
            for va in assign.vehicle_assignments:
                veh = db.query(Vehicle).filter(Vehicle.vehicle_id == va.vehicle_id).first()
                if veh:
                    veh.status = "Available"
                db.delete(va)

            # Rollback zone evacuated count temporarily so re-allocation picks them up
            zone = db.query(AffectedZone).filter(AffectedZone.zone_id == assign.zone_id).first()
            if zone:
                zone.evacuated_count = max(0, zone.evacuated_count - assign.people_count)
                zone.status = "Pending"
                displaced_zone_ids.add(zone.zone_id)

            total_people_displaced += assign.people_count
            assign.status = "Rerouted"

        db.flush()

        # 5. Fetch available resources for dynamic replanning
        all_zones = db.query(AffectedZone).filter(AffectedZone.zone_id.in_(displaced_zone_ids)).all()
        active_shelters = db.query(Shelter).filter(
            Shelter.status == "Active",
            Shelter.shelter_id != (full_or_damaged_shelter_id or -1)
        ).all()
        open_routes = db.query(Route).filter(
            Route.status != "Blocked",
            Route.route_id != (blocked_route_id or -1)
        ).all()
        available_vehicles = db.query(Vehicle).filter(Vehicle.status == "Available").all()

        # 6. Reallocate displaced populations
        new_assignments = AllocationEngine.generate_plan(
            db=db,
            plan=plan,
            disaster=disaster,
            zones=all_zones,
            shelters=active_shelters,
            routes=open_routes,
            vehicles=available_vehicles
        )

        # 7. Audit log & notifications (FR-12)
        audit = AuditLog(
            user_id=user_id,
            action="DYNAMIC_REALLOCATION",
            entity_type="EvacuationPlan",
            entity_id=plan.plan_id,
            details=f"Reallocated {total_people_displaced} evacuees due to: {reason}. Generated {len(new_assignments)} new assignments."
        )
        db.add(audit)

        notification = Notification(
            user_id=user_id,
            message=f"CRITICAL REPLANNING: Plan #{plan.plan_id} dynamically reallocated {total_people_displaced} evacuees. Reason: {reason}",
            type="CRITICAL",
            status="Unread"
        )
        db.add(notification)

        db.commit()
        return new_assignments
