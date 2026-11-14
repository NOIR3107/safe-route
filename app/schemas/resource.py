from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ResourceBase(BaseModel):
    resource_type: str  # Water, Food Packs, Medical Kits, Blankets, Fuel, Generators
    quantity: int = Field(ge=0, description="Available count")
    availability: str = "Available"  # Available, Low Stock, Depleted
    location: Optional[str] = None


class ResourceCreate(ResourceBase):
    pass


class ResourceUpdate(BaseModel):
    resource_type: Optional[str] = None
    quantity: Optional[int] = Field(None, ge=0)
    availability: Optional[str] = None
    location: Optional[str] = None


class ResourceResponse(ResourceBase):
    resource_id: int

    model_config = ConfigDict(from_attributes=True)
