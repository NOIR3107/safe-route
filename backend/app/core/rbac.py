"""FR-11 role-based access control: who may do what.

Roles come from the lab file (Experiment 1 charter and Experiment 2 stakeholders). Medical/Relief
staff and NGO volunteers are read-only. Admin may do everything. The React app has a copy of this
matrix in frontend/src/lib/rbac.ts so it can hide what a role cannot use; the server is what
actually enforces it.
"""

from __future__ import annotations

ADMIN = "Admin"
EMERGENCY_AUTHORITY = "Emergency Authority"
EVACUATION_COORDINATOR = "Evacuation Coordinator"
SHELTER_MANAGER = "Shelter Manager"
TRANSPORT_COORDINATOR = "Transport Coordinator"
RESPONSE_TEAM = "Response Team"
RELIEF_STAFF = "Relief Staff"  # medical / relief personnel, read-only
NGO_VOLUNTEER = "NGO Volunteer"  # read-only

ROLES = (
    ADMIN,
    EMERGENCY_AUTHORITY,
    EVACUATION_COORDINATOR,
    SHELTER_MANAGER,
    TRANSPORT_COORDINATOR,
    RESPONSE_TEAM,
    RELIEF_STAFF,
    NGO_VOLUNTEER,
)
READ_ONLY_ROLES = (RELIEF_STAFF, NGO_VOLUNTEER)

MATRIX: dict[str, tuple[str, ...]] = {
    "dashboard:view": (EMERGENCY_AUTHORITY, EVACUATION_COORDINATOR, TRANSPORT_COORDINATOR, RELIEF_STAFF, NGO_VOLUNTEER),
    "plan:view": (EMERGENCY_AUTHORITY, EVACUATION_COORDINATOR, TRANSPORT_COORDINATOR, RELIEF_STAFF, NGO_VOLUNTEER),
    "plan:generate": (EMERGENCY_AUTHORITY, EVACUATION_COORDINATOR),
    "plan:approve": (EMERGENCY_AUTHORITY, EVACUATION_COORDINATOR),
    "plan:override": (EMERGENCY_AUTHORITY, EVACUATION_COORDINATOR),
    "drill:run": (EMERGENCY_AUTHORITY, EVACUATION_COORDINATOR),
    "disaster:write": (EMERGENCY_AUTHORITY, EVACUATION_COORDINATOR),
    "zone:write": (EMERGENCY_AUTHORITY, EVACUATION_COORDINATOR),
    "shelter:write": (SHELTER_MANAGER, EVACUATION_COORDINATOR),
    "route:write": (TRANSPORT_COORDINATOR, EVACUATION_COORDINATOR),
    "route:status": (TRANSPORT_COORDINATOR, EVACUATION_COORDINATOR, RESPONSE_TEAM),
    "vehicle:write": (TRANSPORT_COORDINATOR,),
    "vehicle:status": (TRANSPORT_COORDINATOR, RESPONSE_TEAM),
    "team:write": (EMERGENCY_AUTHORITY,),
    "team:status": (EMERGENCY_AUTHORITY, RESPONSE_TEAM),
    "resource:write": (EMERGENCY_AUTHORITY, SHELTER_MANAGER),
    "audit:read": (EMERGENCY_AUTHORITY,),
    "shelter:checkin": (SHELTER_MANAGER,),
    "field:update": (RESPONSE_TEAM,),
    "users:manage": (),
}


def can(role: str | None, permission: str) -> bool:
    if role is None:
        return False
    if permission not in MATRIX:
        raise KeyError(f"Unknown permission {permission!r}")
    return role == ADMIN or role in MATRIX[permission]


def roles_for(permission: str) -> list[str]:
    return [ADMIN, *MATRIX[permission]]
