from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.route import Route
from app.schemas.route import RouteCreate, RouteUpdate
from app.services.audit_service import AuditService


class RouteService:
    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[Route]:
        return db.query(Route).offset(skip).limit(limit).all()

    @staticmethod
    def get_by_id(db: Session, route_id: int) -> Optional[Route]:
        return db.query(Route).filter(Route.route_id == route_id).first()

    @staticmethod
    def create(db: Session, data: RouteCreate, user_id: Optional[int] = None) -> Route:
        route = Route(
            source=data.source,
            destination=data.destination,
            distance_km=data.distance_km,
            travel_time=data.travel_time,
            risk_level=data.risk_level,
            status=data.status
        )
        db.add(route)
        db.commit()
        db.refresh(route)

        AuditService.log_event(
            db=db,
            user_id=user_id,
            action="CREATE_ROUTE",
            entity_type="Route",
            entity_id=route.route_id,
            details=f"Added route from {route.source} to {route.destination} ({route.distance_km} km)"
        )
        return route

    @staticmethod
    def update(db: Session, route_id: int, data: RouteUpdate, user_id: Optional[int] = None) -> Optional[Route]:
        route = db.query(Route).filter(Route.route_id == route_id).first()
        if not route:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(route, key, value)

        db.commit()
        db.refresh(route)

        AuditService.log_event(
            db=db,
            user_id=user_id,
            action="UPDATE_ROUTE",
            entity_type="Route",
            entity_id=route.route_id,
            details=f"Updated route #{route_id}: status={route.status}, risk={route.risk_level}"
        )

        if route.status.upper() in ["BLOCKED", "FLOODED"]:
            AuditService.send_notification(
                db=db,
                message=f"WARNING: Route #{route.route_id} ({route.source} -> {route.destination}) is now {route.status.upper()}!",
                msg_type="WARNING"
            )

        return route
