from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


# Affected Zone Schemas
class AffectedZoneBase(BaseModel):
    name: str
    location: str
    state: Optional[str] = "Uttar Pradesh"
    district: Optional[str] = "Gautam Buddha Nagar"
    population: int = Field(ge=0, description="Affected population count")
    priority: str = Field(default="P1", description="Priority level e.g. P1, P2, P3, P4")
    risk_level: str = Field(default="High", description="Extreme, High, Moderate, Low")


class AffectedZoneCreate(AffectedZoneBase):
    disaster_id: int


class AffectedZoneUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    population: Optional[int] = Field(None, ge=0)
    priority: Optional[str] = None
    risk_level: Optional[str] = None
    evacuated_count: Optional[int] = Field(None, ge=0)
    status: Optional[str] = None


class AffectedZoneResponse(AffectedZoneBase):
    zone_id: int
    disaster_id: int
    evacuated_count: int
    status: str

    model_config = ConfigDict(from_attributes=True)


# Disaster Schemas
class DisasterBase(BaseModel):
    type: str  # Flood, Earthquake, Fire, Cyclone
    title: str
    description: Optional[str] = None
    severity: str = "High"  # Low, Medium, High, Critical
    status: str = "Active"  # Active, Under Control, Resolved


class DisasterCreate(DisasterBase):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class DisasterUpdate(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    end_date: Optional[datetime] = None


class DisasterResponse(DisasterBase):
    disaster_id: int
    start_date: datetime
    end_date: Optional[datetime] = None
    created_at: datetime
    zones: List[AffectedZoneResponse] = []

    model_config = ConfigDict(from_attributes=True)
