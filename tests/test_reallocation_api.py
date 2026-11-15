"""FR-10 and FR-12 through the REST API: block a route, reallocate, check the audit trail and notification."""


def _setup(client, coordinator_headers, admin_headers):
    d = client.post("/api/v1/disasters/", json={"type": "Flood", "title": "Adyar test", "severity": "Critical"}, headers=coordinator_headers).json()
    client.post(
        "/api/v1/zones/",
        json={"disaster_id": d["disaster_id"], "name": "Saidapet", "location": "Saidapet", "population": 60, "priority": "P1", "risk_level": "High"},
        headers=coordinator_headers,
    )
    near = client.post("/api/v1/shelters/", json={"name": "T Nagar School", "location": "T Nagar", "capacity": 200}, headers=admin_headers).json()
    far = client.post("/api/v1/shelters/", json={"name": "Nehru Stadium", "location": "Periamet", "capacity": 500}, headers=admin_headers).json()
    r_near = client.post(
        "/api/v1/routes/",
        json={"source": "Saidapet", "destination": "T Nagar", "distance_km": 3.3, "travel_time": 10, "risk_level": "Low", "status": "Open"},
        headers=admin_headers,
    ).json()
    client.post(
        "/api/v1/routes/",
        json={"source": "Saidapet", "destination": "Periamet", "distance_km": 9, "travel_time": 30, "risk_level": "Low", "status": "Open"},
        headers=admin_headers,
    )
    client.post("/api/v1/vehicles/", json={"vehicle_type": "Bus", "capacity": 60, "status": "Available", "current_location": "Saidapet"}, headers=admin_headers)
    plan = client.post("/api/v1/evacuations/generate", json={"disaster_id": d["disaster_id"], "plan_name": "v1"}, headers=coordinator_headers).json()
    return plan, near, far, r_near


def test_route_blocked_moves_people_to_other_shelter(client, coordinator_headers, admin_headers):
    plan, near, far, r_near = _setup(client, coordinator_headers, admin_headers)
    assert plan["assignments"][0]["shelter_id"] == near["shelter_id"]

    res = client.post(
        "/api/v1/evacuations/reallocate",
        json={"plan_id": plan["plan_id"], "blocked_route_id": r_near["route_id"], "reason": "Saidapet bridge flooded"},
        headers=coordinator_headers,
    )
    assert res.status_code == 200
    new = res.json()
    assert len(new) == 1
    assert new[0]["shelter_id"] == far["shelter_id"]

    route = client.get(f"/api/v1/routes/{r_near['route_id']}").json()
    assert route["status"] == "Blocked"

    old = client.get(f"/api/v1/evacuations/plans/{plan['plan_id']}").json()["assignments"]
    assert any(a["status"] == "Rerouted" for a in old)


def test_reallocation_is_audited_and_notified(client, coordinator_headers, admin_headers):
    plan, _near, _far, r_near = _setup(client, coordinator_headers, admin_headers)
    client.post(
        "/api/v1/evacuations/reallocate",
        json={"plan_id": plan["plan_id"], "blocked_route_id": r_near["route_id"], "reason": "debris"},
        headers=coordinator_headers,
    )
    logs = client.get("/api/v1/logs/audit", headers=admin_headers).json()
    assert any(l["action"] == "DYNAMIC_REALLOCATION" and "debris" in (l["details"] or "") for l in logs)
    notes = client.get("/api/v1/logs/notifications", headers=coordinator_headers).json()
    assert any(n["type"] == "CRITICAL" for n in notes)


def test_reallocate_unknown_plan_returns_400(client, coordinator_headers):
    res = client.post("/api/v1/evacuations/reallocate", json={"plan_id": 9999, "blocked_route_id": 1, "reason": "x"}, headers=coordinator_headers)
    assert res.status_code == 400


def test_full_shelter_triggers_move(client, coordinator_headers, admin_headers):
    plan, near, far, _r = _setup(client, coordinator_headers, admin_headers)
    res = client.post(
        "/api/v1/evacuations/reallocate",
        json={"plan_id": plan["plan_id"], "full_shelter_id": near["shelter_id"], "reason": "walk-ins filled the school"},
        headers=coordinator_headers,
    )
    assert res.status_code == 200
    assert all(a["shelter_id"] == far["shelter_id"] for a in res.json())


def test_validation_rejects_bad_payloads(client, admin_headers):
    bad_shelter = client.post("/api/v1/shelters/", json={"name": "x", "location": "y", "capacity": 0}, headers=admin_headers)
    assert bad_shelter.status_code == 422
    bad_route = client.post(
        "/api/v1/routes/",
        json={"source": "a", "destination": "b", "distance_km": -1, "travel_time": 5},
        headers=admin_headers,
    )
    assert bad_route.status_code == 422
