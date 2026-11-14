from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class RouteBase(BaseModel):
    source: str
    destination: str
    distance_km: float = Field(gt=0, description="Distance in kilometers")
    travel_time: float = Field(ge=0, description="Estimated travel time in minutes")
    risk_level: str = "Low"  # Low, Moderate, High, Severe
    status: str = "Open"  # Open, Congested, Blocked, Flooded


class RouteCreate(RouteBase):
    pass


class RouteUpdate(BaseModel):
    source: Optional[str] = None
    destination: Optional[str] = None
    distance_km: Optional[float] = Field(None, gt=0)
    travel_time: Optional[float] = Field(None, ge=0)
    risk_level: Optional[str] = None
    status: Optional[str] = None


class RouteResponse(RouteBase):
    route_id: int

    model_config = ConfigDict(from_attributes=True)
