from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.evacuation import EvacuationPlan, EvacuationAssignment
from app.models.disaster import Disaster, AffectedZone
from app.models.shelter import Shelter
from app.models.route import Route
from app.models.vehicle import Vehicle
from app.models.audit import AuditLog, Notification
from app.schemas.evacuation import GeneratePlanRequest, DynamicReallocationRequest
from app.engines.allocation_engine import AllocationEngine
from app.engines.replanning_engine import ReplanningEngine
from app.services.audit_service import AuditService


class EvacuationService:
    @staticmethod
    def get_plans(db: Session, skip: int = 0, limit: int = 100) -> List[EvacuationPlan]:
        return db.query(EvacuationPlan).offset(skip).limit(limit).all()

    @staticmethod
    def get_plan_by_id(db: Session, plan_id: int) -> Optional[EvacuationPlan]:
        return db.query(EvacuationPlan).filter(EvacuationPlan.plan_id == plan_id).first()

    @staticmethod
    def generate_evacuation_plan(
        db: Session,
        request: GeneratePlanRequest,
        created_by: int
    ) -> EvacuationPlan:
        disaster = db.query(Disaster).filter(Disaster.disaster_id == request.disaster_id).first()
        if not disaster:
            raise ValueError(f"Disaster {request.disaster_id} does not exist")

        zones = db.query(AffectedZone).filter(AffectedZone.disaster_id == request.disaster_id).all()
        if not zones:
            raise ValueError(f"No affected zones registered for disaster {request.disaster_id}")

        shelters = db.query(Shelter).filter(Shelter.status == "Active").all()
        if not shelters:
            raise ValueError("No active shelters available for allocation")

        routes = db.query(Route).filter(Route.status != "Blocked").all()
        vehicles = db.query(Vehicle).filter(Vehicle.status == "Available").all()

        # Create EvacuationPlan record
        plan = EvacuationPlan(
            disaster_id=request.disaster_id,
            created_by=created_by,
            name=request.plan_name,
            status="In Generation",
            priority="High"
        )
        db.add(plan)
        db.flush()

        # Run constraint-based allocation engine
        assignments = AllocationEngine.generate_plan(
            db=db,
            plan=plan,
            disaster=disaster,
            zones=zones,
            shelters=shelters,
            routes=routes,
            vehicles=vehicles
        )

        AuditService.log_event(
            db=db,
            user_id=created_by,
            action="GENERATE_EVACUATION_PLAN",
            entity_type="EvacuationPlan",
            entity_id=plan.plan_id,
            details=f"Generated plan '{plan.name}' with {len(assignments)} assignments"
        )

        AuditService.send_notification(
            db=db,
            user_id=created_by,
            message=f"PLAN CREATED: Evacuation plan '{plan.name}' successfully generated with {len(assignments)} assignments.",
            msg_type="INFO"
        )

        db.refresh(plan)
        return plan

    @staticmethod
    def trigger_dynamic_reallocation(
        db: Session,
        request: DynamicReallocationRequest,
        user_id: int
    ) -> List[EvacuationAssignment]:
        new_assignments = ReplanningEngine.handle_contingency(
            db=db,
            plan_id=request.plan_id,
            blocked_route_id=request.blocked_route_id,
            full_or_damaged_shelter_id=request.full_shelter_id,
            user_id=user_id,
            reason=request.reason
        )
        return new_assignments

    @staticmethod
    def get_dashboard_summary(db: Session) -> dict:
        total_disasters = db.query(Disaster).count()
        active_disasters = db.query(Disaster).filter(Disaster.status == "Active").count()
        
        total_zones = db.query(AffectedZone).count()
        total_population_affected = sum(z.population for z in db.query(AffectedZone).all())
        total_evacuated = sum(z.evacuated_count for z in db.query(AffectedZone).all())

        total_shelters = db.query(Shelter).count()
        total_shelter_capacity = sum(s.capacity for s in db.query(Shelter).all())
        current_shelter_occupancy = sum(s.current_occupancy for s in db.query(Shelter).all())

        available_vehicles = db.query(Vehicle).filter(Vehicle.status == "Available").count()
        total_vehicles = db.query(Vehicle).count()

        active_plans = db.query(EvacuationPlan).filter(EvacuationPlan.status == "Active").count()
        total_assignments = db.query(EvacuationAssignment).count()

        open_routes = db.query(Route).filter(Route.status == "Open").count()
        blocked_routes = db.query(Route).filter(Route.status.in_(["Blocked", "Flooded"])).count()

        return {
            "disasters": {
                "total": total_disasters,
                "active": active_disasters
            },
            "population": {
                "total_affected": total_population_affected,
                "total_evacuated": total_evacuated,
                "evacuation_progress_percentage": round((total_evacuated / max(1, total_population_affected)) * 100, 2)
            },
            "shelters": {
                "total": total_shelters,
                "total_capacity": total_shelter_capacity,
                "current_occupancy": current_shelter_occupancy,
                "occupancy_rate_percentage": round((current_shelter_occupancy / max(1, total_shelter_capacity)) * 100, 2)
            },
            "logistics": {
                "total_vehicles": total_vehicles,
                "available_vehicles": available_vehicles,
                "open_routes": open_routes,
                "blocked_routes": blocked_routes
            },
            "plans": {
                "active_plans": active_plans,
                "total_assignments": total_assignments
            }
        }
