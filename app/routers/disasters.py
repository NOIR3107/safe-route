from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.schemas.disaster import DisasterCreate, DisasterUpdate, DisasterResponse
from app.services.disaster_service import DisasterService

router = APIRouter(prefix="/disasters", tags=["Disasters"])


@router.get("/", response_model=List[DisasterResponse])
def list_disasters(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return DisasterService.get_all(db, skip=skip, limit=limit)


@router.get("/{disaster_id}", response_model=DisasterResponse)
def get_disaster(disaster_id: int, db: Session = Depends(get_db)):
    disaster = DisasterService.get_by_id(db, disaster_id)
    if not disaster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Disaster incident not found")
    return disaster


@router.post("/", response_model=DisasterResponse, status_code=status.HTTP_201_CREATED)
def create_disaster(
    data: DisasterCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY, UserRole.EVACUATION_COORDINATOR]))
):
    return DisasterService.create(db, data, user_id=current_user.user_id)


@router.put("/{disaster_id}", response_model=DisasterResponse)
def update_disaster(
    disaster_id: int,
    data: DisasterUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY, UserRole.EVACUATION_COORDINATOR]))
):
    updated = DisasterService.update(db, disaster_id, data, user_id=current_user.user_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Disaster incident not found")
    return updated
