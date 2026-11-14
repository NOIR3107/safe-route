from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.shelter import ShelterResponse
from app.schemas.route import RouteResponse


class VehicleAssignmentBase(BaseModel):
    vehicle_id: int
    departure_time: Optional[datetime] = None
    arrival_time: Optional[datetime] = None
    status: str = "Assigned"


class VehicleAssignmentCreate(VehicleAssignmentBase):
    assignment_id: int


class VehicleAssignmentResponse(VehicleAssignmentBase):
    vehicle_assignment_id: int
    assignment_id: int

    model_config = ConfigDict(from_attributes=True)


class EvacuationAssignmentBase(BaseModel):
    zone_id: int
    shelter_id: int
    route_id: Optional[int] = None
    people_count: int = Field(gt=0, description="Number of evacuees allocated")
    status: str = "Scheduled"


class EvacuationAssignmentCreate(EvacuationAssignmentBase):
    plan_id: int


class EvacuationAssignmentResponse(EvacuationAssignmentBase):
    assignment_id: int
    plan_id: int
    created_at: datetime
    vehicle_assignments: List[VehicleAssignmentResponse] = []

    model_config = ConfigDict(from_attributes=True)


class EvacuationPlanBase(BaseModel):
    disaster_id: int
    name: str
    priority: str = "High"


class EvacuationPlanCreate(EvacuationPlanBase):
    pass


class EvacuationPlanResponse(EvacuationPlanBase):
    plan_id: int
    created_by: int
    status: str
    created_at: datetime
    updated_at: datetime
    assignments: List[EvacuationAssignmentResponse] = []

    model_config = ConfigDict(from_attributes=True)


class GeneratePlanRequest(BaseModel):
    disaster_id: int
    plan_name: str
    consider_traffic: bool = True
    max_evacuees_per_batch: Optional[int] = None


class DynamicReallocationRequest(BaseModel):
    plan_id: int
    blocked_route_id: Optional[int] = None
    full_shelter_id: Optional[int] = None
    reason: str = "Route blocked or shelter reached capacity"
