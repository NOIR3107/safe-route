from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.schemas.evacuation import (
    EvacuationPlanResponse,
    GeneratePlanRequest,
    DynamicReallocationRequest,
    EvacuationAssignmentResponse
)
from app.services.evacuation_service import EvacuationService

router = APIRouter(prefix="/evacuations", tags=["Evacuation Planning & Decision Engine"])


@router.get("/plans", response_model=List[EvacuationPlanResponse])
def get_plans(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return EvacuationService.get_plans(db, skip=skip, limit=limit)


@router.get("/plans/{plan_id}", response_model=EvacuationPlanResponse)
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = EvacuationService.get_plan_by_id(db, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evacuation plan not found")
    return plan


@router.post("/generate", response_model=EvacuationPlanResponse, status_code=status.HTTP_201_CREATED)
def generate_plan(
    request: GeneratePlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY, UserRole.EVACUATION_COORDINATOR]))
):
    try:
        plan = EvacuationService.generate_evacuation_plan(
            db=db,
            request=request,
            created_by=current_user.user_id
        )
        return plan
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/reallocate", response_model=List[EvacuationAssignmentResponse])
def dynamic_reallocation(
    request: DynamicReallocationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.EMERGENCY_AUTHORITY, UserRole.EVACUATION_COORDINATOR]))
):
    try:
        new_assignments = EvacuationService.trigger_dynamic_reallocation(
            db=db,
            request=request,
            user_id=current_user.user_id
        )
        return new_assignments
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
