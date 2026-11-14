from app.schemas.auth import Token, TokenData, UserBase, UserCreate, UserUpdate, UserResponse, LoginRequest
from app.schemas.disaster import (
    DisasterBase, DisasterCreate, DisasterUpdate, DisasterResponse,
    AffectedZoneBase, AffectedZoneCreate, AffectedZoneUpdate, AffectedZoneResponse
)
from app.schemas.shelter import (
    ShelterBase, ShelterCreate, ShelterUpdate, ShelterResponse,
    ShelterFacilityBase, ShelterFacilityCreate, ShelterFacilityResponse
)
from app.schemas.route import RouteBase, RouteCreate, RouteUpdate, RouteResponse
from app.schemas.vehicle import (
    VehicleBase, VehicleCreate, VehicleUpdate, VehicleResponse,
    RescueTeamBase, RescueTeamCreate, RescueTeamUpdate, RescueTeamResponse
)
from app.schemas.evacuation import (
    EvacuationPlanBase, EvacuationPlanCreate, EvacuationPlanResponse,
    EvacuationAssignmentBase, EvacuationAssignmentCreate, EvacuationAssignmentResponse,
    VehicleAssignmentBase, VehicleAssignmentCreate, VehicleAssignmentResponse,
    GeneratePlanRequest, DynamicReallocationRequest
)
from app.schemas.resource import ResourceBase, ResourceCreate, ResourceUpdate, ResourceResponse
from app.schemas.audit import (
    NotificationBase, NotificationCreate, NotificationResponse,
    AuditLogBase, AuditLogCreate, AuditLogResponse
)
