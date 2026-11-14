from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.schemas.vehicle import RescueTeamCreate, RescueTeamUpdate, RescueTeamResponse
from app.services.resource_service import ResourceService

router = APIRouter(prefix="/rescue-teams", tags=["Rescue Teams"])


@router.get("/", response_model=List[RescueTeamResponse])
def list_rescue_teams(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return ResourceService.get_rescue_teams(db, skip=skip, limit=limit)


@router.post("/", response_model=RescueTeamResponse, status_code=status.HTTP_201_CREATED)
def create_rescue_team(
    data: RescueTeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY]))
):
    return ResourceService.create_rescue_team(db, data)


@router.put("/{team_id}", response_model=RescueTeamResponse)
def update_rescue_team(
    team_id: int,
    data: RescueTeamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY, UserRole.RESPONSE_TEAM]))
):
    updated = ResourceService.update_rescue_team(db, team_id, data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rescue team not found")
    return updated
