from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.user import User, UserRole
from app.schemas.route import RouteCreate, RouteUpdate, RouteResponse
from app.services.route_service import RouteService

router = APIRouter(prefix="/routes", tags=["Routes"])


@router.get("/", response_model=List[RouteResponse])
def list_routes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return RouteService.get_all(db, skip=skip, limit=limit)


@router.get("/{route_id}", response_model=RouteResponse)
def get_route(route_id: int, db: Session = Depends(get_db)):
    route = RouteService.get_by_id(db, route_id)
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    return route


@router.post("/", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
def create_route(
    data: RouteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.TRANSPORT_COORDINATOR, UserRole.EVACUATION_COORDINATOR]))
):
    return RouteService.create(db, data, user_id=current_user.user_id)


@router.put("/{route_id}", response_model=RouteResponse)
def update_route(
    route_id: int,
    data: RouteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.TRANSPORT_COORDINATOR, UserRole.EVACUATION_COORDINATOR, UserRole.RESPONSE_TEAM]))
):
    updated = RouteService.update(db, route_id, data, user_id=current_user.user_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    return updated
