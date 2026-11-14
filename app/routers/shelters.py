from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.schemas.shelter import ShelterCreate, ShelterUpdate, ShelterResponse, ShelterFacilityCreate, ShelterFacilityResponse
from app.services.shelter_service import ShelterService

router = APIRouter(prefix="/shelters", tags=["Shelters"])


@router.get("/", response_model=List[ShelterResponse])
def list_shelters(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return ShelterService.get_all(db, skip=skip, limit=limit)


@router.get("/{shelter_id}", response_model=ShelterResponse)
def get_shelter(shelter_id: int, db: Session = Depends(get_db)):
    shelter = ShelterService.get_by_id(db, shelter_id)
    if not shelter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shelter not found")
    return shelter


@router.post("/", response_model=ShelterResponse, status_code=status.HTTP_201_CREATED)
def create_shelter(
    data: ShelterCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.SHELTER_MANAGER, UserRole.EVACUATION_COORDINATOR]))
):
    return ShelterService.create(db, data, user_id=current_user.user_id)


@router.put("/{shelter_id}", response_model=ShelterResponse)
def update_shelter(
    shelter_id: int,
    data: ShelterUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.SHELTER_MANAGER, UserRole.EVACUATION_COORDINATOR]))
):
    updated = ShelterService.update(db, shelter_id, data, user_id=current_user.user_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shelter not found")
    return updated


@router.post("/facilities", response_model=ShelterFacilityResponse, status_code=status.HTTP_201_CREATED)
def add_facility(
    data: ShelterFacilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.SHELTER_MANAGER]))
):
    return ShelterService.add_facility(db, data)
