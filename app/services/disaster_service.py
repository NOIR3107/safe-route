from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.disaster import Disaster, AffectedZone
from app.schemas.disaster import DisasterCreate, DisasterUpdate, AffectedZoneCreate, AffectedZoneUpdate
from app.services.audit_service import AuditService


class DisasterService:
    @staticmethod
    def get_all(db: Session, skip: int = 0, limit: int = 100) -> List[Disaster]:
        return db.query(Disaster).offset(skip).limit(limit).all()

    @staticmethod
    def get_by_id(db: Session, disaster_id: int) -> Optional[Disaster]:
        return db.query(Disaster).filter(Disaster.disaster_id == disaster_id).first()

    @staticmethod
    def create(db: Session, data: DisasterCreate, user_id: Optional[int] = None) -> Disaster:
        disaster = Disaster(
            type=data.type,
            title=data.title,
            description=data.description,
            severity=data.severity,
            status=data.status,
            start_date=data.start_date,
            end_date=data.end_date
        )
        db.add(disaster)
        db.commit()
        db.refresh(disaster)

        AuditService.log_event(
            db=db,
            user_id=user_id,
            action="CREATE_DISASTER",
            entity_type="Disaster",
            entity_id=disaster.disaster_id,
            details=f"Created disaster '{disaster.title}' ({disaster.type}) with severity {disaster.severity}"
        )
        AuditService.send_notification(
            db=db,
            message=f"NEW INCIDENT: {disaster.title} ({disaster.severity} severity) reported.",
            msg_type="ALERT"
        )
        return disaster

    @staticmethod
    def update(db: Session, disaster_id: int, data: DisasterUpdate, user_id: Optional[int] = None) -> Optional[Disaster]:
        disaster = db.query(Disaster).filter(Disaster.disaster_id == disaster_id).first()
        if not disaster:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(disaster, key, value)

        db.commit()
        db.refresh(disaster)

        AuditService.log_event(
            db=db,
            user_id=user_id,
            action="UPDATE_DISASTER",
            entity_type="Disaster",
            entity_id=disaster.disaster_id,
            details=f"Updated disaster #{disaster_id}: {update_dict}"
        )
        return disaster

    # Affected Zones
    @staticmethod
    def get_zones_by_disaster(db: Session, disaster_id: int) -> List[AffectedZone]:
        return db.query(AffectedZone).filter(AffectedZone.disaster_id == disaster_id).all()

    @staticmethod
    def create_zone(db: Session, data: AffectedZoneCreate, user_id: Optional[int] = None) -> AffectedZone:
        zone = AffectedZone(
            disaster_id=data.disaster_id,
            name=data.name,
            location=data.location,
            state=data.state,
            district=data.district,
            population=data.population,
            priority=data.priority,
            risk_level=data.risk_level
        )
        db.add(zone)
        db.commit()
        db.refresh(zone)

        AuditService.log_event(
            db=db,
            user_id=user_id,
            action="CREATE_AFFECTED_ZONE",
            entity_type="AffectedZone",
            entity_id=zone.zone_id,
            details=f"Registered zone '{zone.name}' with population {zone.population} (Priority {zone.priority})"
        )
        return zone

    @staticmethod
    def update_zone(db: Session, zone_id: int, data: AffectedZoneUpdate, user_id: Optional[int] = None) -> Optional[AffectedZone]:
        zone = db.query(AffectedZone).filter(AffectedZone.zone_id == zone_id).first()
        if not zone:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(zone, key, value)

        db.commit()
        db.refresh(zone)

        AuditService.log_event(
            db=db,
            user_id=user_id,
            action="UPDATE_AFFECTED_ZONE",
            entity_type="AffectedZone",
            entity_id=zone.zone_id,
            details=f"Updated zone #{zone_id}: {update_dict}"
        )
        return zone
