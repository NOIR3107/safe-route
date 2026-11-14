from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.shelter import Shelter, ShelterFacility
from app.schemas.shelter import ShelterCreate, ShelterUpdate, ShelterFacilityCreate
from app.services.audit_service import AuditService


class ShelterService:
    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[Shelter]:
        shelters = db.query(Shelter).offset(skip).limit(limit).all()
        for s in shelters:
            s.available_capacity = max(0, s.capacity - s.current_occupancy)
        return shelters

    @staticmethod
    def get_by_id(db: Session, shelter_id: int) -> Optional[Shelter]:
        shelter = db.query(Shelter).filter(Shelter.shelter_id == shelter_id).first()
        if shelter:
            shelter.available_capacity = max(0, shelter.capacity - shelter.current_occupancy)
        return shelter

    @staticmethod
    def create(db: Session, data: ShelterCreate, user_id: Optional[int] = None) -> Shelter:
        shelter = Shelter(
            name=data.name,
            location=data.location,
            capacity=data.capacity,
            current_occupancy=data.current_occupancy,
            facilities=data.facilities,
            status=data.status,
            latitude=data.latitude,
            longitude=data.longitude
        )
        db.add(shelter)
        db.commit()
        db.refresh(shelter)
        shelter.available_capacity = max(0, shelter.capacity - shelter.current_occupancy)

        AuditService.log_event(
            db=db,
            user_id=user_id,
            action="CREATE_SHELTER",
            entity_type="Shelter",
            entity_id=shelter.shelter_id,
            details=f"Registered shelter '{shelter.name}' with capacity {shelter.capacity}"
        )
        return shelter

    @staticmethod
    def update(db: Session, shelter_id: int, data: ShelterUpdate, user_id: Optional[int] = None) -> Optional[Shelter]:
        shelter = db.query(Shelter).filter(Shelter.shelter_id == shelter_id).first()
        if not shelter:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(shelter, key, value)

        # Automatically update status if occupancy reaches capacity
        if shelter.current_occupancy >= shelter.capacity:
            shelter.status = "Full"
        elif shelter.status == "Full" and shelter.current_occupancy < shelter.capacity:
            shelter.status = "Active"

        db.commit()
        db.refresh(shelter)
        shelter.available_capacity = max(0, shelter.capacity - shelter.current_occupancy)

        AuditService.log_event(
            db=db,
            user_id=user_id,
            action="UPDATE_SHELTER",
            entity_type="Shelter",
            entity_id=shelter.shelter_id,
            details=f"Updated shelter #{shelter_id}: occupancy={shelter.current_occupancy}/{shelter.capacity}, status={shelter.status}"
        )
        return shelter

    @staticmethod
    def add_facility(db: Session, data: ShelterFacilityCreate) -> ShelterFacility:
        facility = ShelterFacility(
            shelter_id=data.shelter_id,
            facility_type=data.facility_type,
            capacity=data.capacity,
            availability_status=data.availability_status
        )
        db.add(facility)
        db.commit()
        db.refresh(facility)
        return facility
