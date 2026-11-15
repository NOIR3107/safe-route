"""FR-11: role checks on the write endpoints (mirrors require_roles in the routers)."""
import pytest

from app.models.user import UserRole


def _disaster(client, headers):
    res = client.post("/api/v1/disasters/", json={"type": "Flood", "title": "RBAC test flood", "severity": "High"}, headers=headers)
    assert res.status_code == 201
    return res.json()["disaster_id"]


def test_no_token_is_rejected(client):
    res = client.post("/api/v1/disasters/", json={"type": "Flood", "title": "x", "severity": "High"})
    assert res.status_code == 401


def test_invalid_token_is_rejected(client):
    res = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert res.status_code == 401


@pytest.mark.parametrize(
    "role,expected",
    [
        (UserRole.EMERGENCY_AUTHORITY, 201),
        (UserRole.EVACUATION_COORDINATOR, 201),
        (UserRole.SHELTER_MANAGER, 403),
        (UserRole.TRANSPORT_COORDINATOR, 403),
        (UserRole.RESPONSE_TEAM, 403),
    ],
)
def test_create_disaster_roles(client, headers_for, role, expected):
    res = client.post("/api/v1/disasters/", json={"type": "Flood", "title": "t", "severity": "High"}, headers=headers_for(role))
    assert res.status_code == expected


def test_admin_is_always_allowed(client, admin_headers):
    # Admin isn't listed on /vehicles POST explicitly beyond ADMIN, but require_roles lets Admin through everywhere.
    res = client.post(
        "/api/v1/vehicles/",
        json={"vehicle_type": "Bus", "capacity": 50, "status": "Available", "current_location": "Depot"},
        headers=admin_headers,
    )
    assert res.status_code == 201


def test_shelter_manager_cannot_generate_plan(client, coordinator_headers, headers_for):
    disaster_id = _disaster(client, coordinator_headers)
    res = client.post(
        "/api/v1/evacuations/generate",
        json={"disaster_id": disaster_id, "plan_name": "should fail"},
        headers=headers_for(UserRole.SHELTER_MANAGER),
    )
    assert res.status_code == 403


def test_response_team_can_update_route_status_but_not_create_routes(client, admin_headers, headers_for):
    route = client.post(
        "/api/v1/routes/",
        json={"source": "A", "destination": "B", "distance_km": 2, "travel_time": 6, "risk_level": "Low", "status": "Open"},
        headers=admin_headers,
    ).json()
    team = headers_for(UserRole.RESPONSE_TEAM)
    assert client.put(f"/api/v1/routes/{route['route_id']}", json={"status": "Blocked"}, headers=team).status_code == 200
    create = client.post(
        "/api/v1/routes/",
        json={"source": "A", "destination": "C", "distance_km": 2, "travel_time": 6, "risk_level": "Low", "status": "Open"},
        headers=team,
    )
    assert create.status_code == 403


def test_audit_log_restricted_to_admin_and_authority(client, admin_headers, coordinator_headers, headers_for):
    assert client.get("/api/v1/logs/audit", headers=admin_headers).status_code == 200
    assert client.get("/api/v1/logs/audit", headers=headers_for(UserRole.EMERGENCY_AUTHORITY)).status_code == 200
    assert client.get("/api/v1/logs/audit", headers=coordinator_headers).status_code == 403


def test_only_admin_lists_users(client, admin_headers, coordinator_headers):
    assert client.get("/api/v1/users/", headers=admin_headers).status_code == 200
    assert client.get("/api/v1/users/", headers=coordinator_headers).status_code == 403


def test_inactive_user_is_blocked(client, db_session, coordinator_user, coordinator_headers):
    coordinator_user.is_active = False
    db_session.commit()
    assert client.get("/api/v1/auth/me", headers=coordinator_headers).status_code == 400
