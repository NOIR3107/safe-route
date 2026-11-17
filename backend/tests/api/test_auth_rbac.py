"""Authentication and role-based access (FR-11, acceptance criterion 5). TC-API-01 .. TC-API-08."""

from __future__ import annotations

import pytest

API = "/api/v1"


def test_api01_login_returns_jwt_and_role(client):
    r = client.post(f"{API}/auth/login", json={"email": "coordinator@saferoute.org", "password": "Coord@12345"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer" and body["role"] == "Evacuation Coordinator" and body["access_token"].count(".") == 2


def test_api02_wrong_password_is_401(client):
    r = client.post(f"{API}/auth/login", json={"email": "coordinator@saferoute.org", "password": "nope"})
    assert r.status_code == 401


def test_api03_no_token_or_bad_token_is_401(client):
    assert client.get(f"{API}/zones").status_code == 401
    assert client.get(f"{API}/zones", headers={"Authorization": "Bearer not.a.token"}).status_code == 401


def test_api04_me_returns_scope(client, auth):
    me = client.get(f"{API}/auth/me", headers=auth("Shelter Manager")).json()
    assert me["role"] == "Shelter Manager" and me["scope"]["shelter_id"] == 1


@pytest.mark.parametrize(
    "role,method,path,body",
    [
        ("Shelter Manager", "post", "/evacuations/generate", {"strategy": "greedy"}),
        ("Transport Coordinator", "post", "/evacuations/generate", {"strategy": "greedy"}),
        ("Response Team", "post", "/zones", {"disaster_id": 1, "name": "X", "location": "X", "population": 1}),
        ("Evacuation Coordinator", "get", "/logs/audit", None),
        ("Shelter Manager", "post", "/drill/control", {"type": "start"}),
        ("Relief Staff", "post", "/shelters/1/status", {"status": "Closed"}),
        ("NGO Volunteer", "post", "/routes/1/status", {"status": "Blocked"}),
    ],
)
def test_api05_wrong_role_gets_403(client, auth, role, method, path, body):
    r = getattr(client, method)(f"{API}{path}", headers=auth(role), **({"json": body} if body is not None else {}))
    assert r.status_code == 403, r.text


def test_api06_read_only_roles_can_view_the_plan_and_dashboard(client, auth):
    for role in ("Relief Staff", "NGO Volunteer"):
        assert client.get(f"{API}/evacuations/plan", headers=auth(role)).status_code == 200
        assert client.get(f"{API}/dashboard/summary", headers=auth(role)).status_code == 200


def test_api07_shelter_manager_only_sees_and_changes_own_shelter(client, auth):
    h = auth("Shelter Manager")
    shelters = client.get(f"{API}/shelters", headers=h).json()
    assert [s["shelter_id"] for s in shelters] == [1]
    assert client.post(f"{API}/shelters/2/status", headers=h, json={"status": "Full"}).status_code == 403
    assert client.get(f"{API}/shelters/2/roster", headers=h).status_code == 403


def test_api08_public_lookup_needs_no_login(client):
    r = client.get(f"{API}/public/lookup", params={"q": "98400 12345"})
    assert r.status_code == 200 and r.json()[0]["head_name"] == "Lakshmi Narayanan"
