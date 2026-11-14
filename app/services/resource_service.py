from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.vehicle import Vehicle, RescueTeam
from app.models.resource import Resource
from app.schemas.vehicle import VehicleCreate, VehicleUpdate, RescueTeamCreate, RescueTeamUpdate
from app.schemas.resource import ResourceCreate, ResourceUpdate


class ResourceService:
    # Vehicles
    @staticmethod
    def get_vehicles(db: Session, skip: int = 0, limit: int = 100) -> List[Vehicle]:
        return db.query(Vehicle).offset(skip).limit(limit).all()

    @staticmethod
    def create_vehicle(db: Session, data: VehicleCreate) -> Vehicle:
        vehicle = Vehicle(
            vehicle_type=data.vehicle_type,
            capacity=data.capacity,
            status=data.status,
            current_location=data.current_location,
            plate_number=data.plate_number
        )
        db.add(vehicle)
        db.commit()
        db.refresh(vehicle)
        return vehicle

    @staticmethod
    def update_vehicle(db: Session, vehicle_id: int, data: VehicleUpdate) -> Optional[Vehicle]:
        vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
        if not vehicle:
            return None
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(vehicle, k, v)
        db.commit()
        db.refresh(vehicle)
        return vehicle

    # Rescue Teams
    @staticmethod
    def get_rescue_teams(db: Session, skip: int = 0, limit: int = 100) -> List[RescueTeam]:
        return db.query(RescueTeam).offset(skip).limit(limit).all()

    @staticmethod
    def create_rescue_team(db: Session, data: RescueTeamCreate) -> RescueTeam:
        team = RescueTeam(
            name=data.name,
            members_count=data.members_count,
            contact_number=data.contact_number,
            status=data.status,
            current_location=data.current_location
        )
        db.add(team)
        db.commit()
        db.refresh(team)
        return team

    @staticmethod
    def update_rescue_team(db: Session, team_id: int, data: RescueTeamUpdate) -> Optional[RescueTeam]:
        team = db.query(RescueTeam).filter(RescueTeam.team_id == team_id).first()
        if not team:
            return None
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(team, k, v)
        db.commit()
        db.refresh(team)
        return team

    # Physical Resources (Water, medical kits, etc.)
    @staticmethod
    def get_resources(db: Session, skip: int = 0, limit: int = 100) -> List[Resource]:
        return db.query(Resource).offset(skip).limit(limit).all()

    @staticmethod
    def create_resource(db: Session, data: ResourceCreate) -> Resource:
        res = Resource(
            resource_type=data.resource_type,
            quantity=data.quantity,
            availability=data.availability,
            location=data.location
        )
        db.add(res)
        db.commit()
        db.refresh(res)
        return res

    @staticmethod
    def update_resource(db: Session, resource_id: int, data: ResourceUpdate) -> Optional[Resource]:
        res = db.query(Resource).filter(Resource.resource_id == resource_id).first()
        if not res:
            return None
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(res, k, v)
        db.commit()
        db.refresh(res)
        return res
