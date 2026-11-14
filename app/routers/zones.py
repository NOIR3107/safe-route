from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.models.disaster import AffectedZone
from app.schemas.disaster import AffectedZoneCreate, AffectedZoneUpdate, AffectedZoneResponse
from app.services.disaster_service import DisasterService

router = APIRouter(prefix="/zones", tags=["Affected Zones"])


@router.get("/disaster/{disaster_id}", response_model=List[AffectedZoneResponse])
def get_zones_for_disaster(disaster_id: int, db: Session = Depends(get_db)):
    return DisasterService.get_zones_by_disaster(db, disaster_id)


@router.get("/", response_model=List[AffectedZoneResponse])
def get_all_zones(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(AffectedZone).offset(skip).limit(limit).all()


@router.get("/{zone_id}", response_model=AffectedZoneResponse)
def get_zone_by_id(zone_id: int, db: Session = Depends(get_db)):
    zone = db.query(AffectedZone).filter(AffectedZone.zone_id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Affected zone not found")
    return zone


@router.post("/", response_model=AffectedZoneResponse, status_code=status.HTTP_201_CREATED)
def register_zone(
    data: AffectedZoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY, UserRole.EVACUATION_COORDINATOR]))
):
    return DisasterService.create_zone(db, data, user_id=current_user.user_id)


@router.put("/{zone_id}", response_model=AffectedZoneResponse)
def update_zone(
    zone_id: int,
    data: AffectedZoneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY, UserRole.EVACUATION_COORDINATOR, UserRole.RESPONSE_TEAM]))
):
    updated = DisasterService.update_zone(db, zone_id, data, user_id=current_user.user_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Affected zone not found")
    return updated
