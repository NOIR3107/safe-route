from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class VehicleBase(BaseModel):
    vehicle_type: str  # Bus, Ambulance, Truck, Boat, Van
    capacity: int = Field(gt=0, description="Passenger capacity")
    status: str = "Available"  # Available, Assigned, In Transit, Maintenance
    current_location: str
    plate_number: Optional[str] = None


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    vehicle_type: Optional[str] = None
    capacity: Optional[int] = Field(None, gt=0)
    status: Optional[str] = None
    current_location: Optional[str] = None
    plate_number: Optional[str] = None


class VehicleResponse(VehicleBase):
    vehicle_id: int

    model_config = ConfigDict(from_attributes=True)


class RescueTeamBase(BaseModel):
    name: str
    members_count: int = Field(gt=0, default=5)
    contact_number: str
    status: str = "Available"  # Available, Deployed, Standby
    current_location: Optional[str] = None


class RescueTeamCreate(RescueTeamBase):
    pass


class RescueTeamUpdate(BaseModel):
    name: Optional[str] = None
    members_count: Optional[int] = Field(None, gt=0)
    contact_number: Optional[str] = None
    status: Optional[str] = None
    current_location: Optional[str] = None


class RescueTeamResponse(RescueTeamBase):
    team_id: int

    model_config = ConfigDict(from_attributes=True)
