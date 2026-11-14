from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class ShelterFacilityBase(BaseModel):
    facility_type: str  # Medical, Kitchen, Generator, Disabled Access, Sanitation
    capacity: Optional[int] = None
    availability_status: str = "Available"


class ShelterFacilityCreate(ShelterFacilityBase):
    shelter_id: int


class ShelterFacilityResponse(ShelterFacilityBase):
    facility_id: int
    shelter_id: int

    model_config = ConfigDict(from_attributes=True)


class ShelterBase(BaseModel):
    name: str
    location: str
    capacity: int = Field(gt=0, description="Total bed/people capacity")
    current_occupancy: int = Field(ge=0, default=0, description="Current number of occupants")
    facilities: Optional[str] = "Medical,Food,Bedding"
    status: str = "Active"  # Active, Full, Inactive, Closed
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ShelterCreate(ShelterBase):
    pass


class ShelterUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    capacity: Optional[int] = Field(None, gt=0)
    current_occupancy: Optional[int] = Field(None, ge=0)
    facilities: Optional[str] = None
    status: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ShelterResponse(ShelterBase):
    shelter_id: int
    available_capacity: Optional[int] = None
    facilities_list: List[ShelterFacilityResponse] = []

    model_config = ConfigDict(from_attributes=True)
