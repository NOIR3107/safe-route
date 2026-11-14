from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.evacuation_service import EvacuationService

router = APIRouter(prefix="/dashboard", tags=["Emergency Monitoring Dashboard"])


@router.get("/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    """
    Returns high-level statistics for the SafeRoute Emergency Monitoring Dashboard:
    - Disaster incident metrics
    - Population affected vs evacuated progress
    - Shelter occupancy and capacity buffer
    - Logistics (vehicles, routes open/blocked)
    - Active evacuation plans
    """
    return EvacuationService.get_dashboard_summary(db)
