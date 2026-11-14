from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.schemas.resource import ResourceCreate, ResourceUpdate, ResourceResponse
from app.services.resource_service import ResourceService

router = APIRouter(prefix="/resources", tags=["Relief Resources"])


@router.get("/", response_model=List[ResourceResponse])
def list_resources(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return ResourceService.get_resources(db, skip=skip, limit=limit)


@router.post("/", response_model=ResourceResponse, status_code=status.HTTP_201_CREATED)
def create_resource(
    data: ResourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY, UserRole.SHELTER_MANAGER]))
):
    return ResourceService.create_resource(db, data)


@router.put("/{resource_id}", response_model=ResourceResponse)
def update_resource(
    resource_id: int,
    data: ResourceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY, UserRole.SHELTER_MANAGER]))
):
    updated = ResourceService.update_resource(db, resource_id, data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource item not found")
    return updated
