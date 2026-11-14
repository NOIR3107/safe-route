from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.schemas.vehicle import VehicleCreate, VehicleUpdate, VehicleResponse
from app.services.resource_service import ResourceService

router = APIRouter(prefix="/vehicles", tags=["Vehicles"])


@router.get("/", response_model=List[VehicleResponse])
def list_vehicles(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return ResourceService.get_vehicles(db, skip=skip, limit=limit)


@router.post("/", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    data: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.TRANSPORT_COORDINATOR]))
):
    return ResourceService.create_vehicle(db, data)


@router.put("/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(
    vehicle_id: int,
    data: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.TRANSPORT_COORDINATOR, UserRole.RESPONSE_TEAM]))
):
    updated = ResourceService.update_vehicle(db, vehicle_id, data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    return updated
