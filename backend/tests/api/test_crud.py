"""Master data CRUD and operations endpoints (FR-01..05). TC-API-29 .. TC-API-38."""

from __future__ import annotations

API = "/api/v1"


def test_api29_create_and_update_shelter_with_facilities(client, auth):
    h = auth("Evacuation Coordinator")
    r = client.post(
        f"{API}/shelters",
        headers=h,
        json={
            "name": "Egmore Railway Hall",
            "location": "Egmore",
            "capacity": 600,
            "facilities": "Water, Food, Bedding",
            "latitude": 13.078,
            "longitude": 80.261,
        },
    )
    assert r.status_code == 201
    s = r.json()
    assert s["available_facilities"] == ["Water", "Food", "Bedding"] and s["display_status"] == "Open"
    u = client.put(
        f"{API}/shelters/{s['shelter_id']}", headers=h, json={"capacity": 650, "facilities": "Water,Food,Bedding,Medical"}
    ).json()
    assert u["capacity"] == 650 and "Medical" in u["available_facilities"]
    bad = client.put(f"{API}/shelters/{s['shelter_id']}", headers=h, json={"current_occupancy": 999})
    assert bad.status_code == 422


def test_api30_shelter_manager_cannot_register_shelters(client, auth):
    r = client.post(f"{API}/shelters", headers=auth("Shelter Manager"), json={"name": "Extra Hall", "location": "T. Nagar", "capacity": 10})
    assert r.status_code == 403


def test_api31_facility_loss_and_restore(client, auth):
    h = auth("Evacuation Coordinator")
    client.post(f"{API}/evacuations/generate", headers=h, json={"strategy": "min-cost-flow"})
    r = client.post(
        f"{API}/shelters/3/facilities",
        headers=h,
        json={"facilities": ["Power", "Medical"], "availability": "Unavailable", "reason": "Loyola power cut"},
    )
    assert r.status_code == 200 and "Medical" not in r.json()["available_facilities"]
    plan = client.get(f"{API}/evacuations/plan", headers=h).json()
    assert plan["current_version"]["trigger"]["type"] in ("FacilityLost", "Initial")
    r = client.post(f"{API}/shelters/3/facilities", headers=h, json={"facilities": ["Power", "Medical"], "availability": "Available"})
    assert "Medical" in r.json()["available_facilities"]


def test_api32_create_route_through_named_segments(client, auth):
    h = auth("Transport Coordinator")
    r = client.post(
        f"{API}/routes",
        headers=h,
        json={"zone_id": 1, "shelter_id": 2, "risk_level": "Moderate", "via": ["Velachery Main Rd", "Anna Salai"]},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["ext"]["via"] == ["Velachery Main Rd", "Anna Salai"] and body["distance_km"] > 0 and len(body["ext"]["path"]) == 4
    assert client.post(f"{API}/routes", headers=h, json={"zone_id": 1, "shelter_id": 2, "via": ["Nowhere Rd"]}).status_code == 422
    segments = client.get(f"{API}/routes/segments", headers=h).json()
    assert any(s["name"] == "Thiru Vi Ka Bridge" for s in segments)
    u = client.put(f"{API}/routes/{body['route_id']}", headers=h, json={"travel_time": 30, "status": "Congested"}).json()
    assert u["travel_time"] == 30 and u["status"] == "Congested"


def test_api33_vehicles_and_teams(client, auth):
    t = auth("Transport Coordinator")
    v = client.post(
        f"{API}/vehicles",
        headers=t,
        json={"vehicle_type": "Boat", "capacity": 10, "current_location": "Adyar Estuary", "plate_number": "NDRF-B-9999"},
    )
    assert v.status_code == 201 and v.json()["ext"]["position_source"] == "depot"
    vid = v.json()["vehicle_id"]
    assert client.put(f"{API}/vehicles/{vid}", headers=t, json={"status": "Maintenance"}).json()["status"] == "Maintenance"
    cmd = auth("Emergency Authority")
    team = client.post(
        f"{API}/rescue-teams", headers=cmd, json={"name": "SDRF Echo", "members_count": 9, "contact_number": "+91 44 1111 2222"}
    )
    assert team.status_code == 201
    upd = client.put(f"{API}/rescue-teams/{team.json()['team_id']}", headers=auth("Response Team"), json={"status": "Deployed"}).json()
    assert upd["status"] == "Deployed"
    assert len(client.get(f"{API}/rescue-teams", headers=t).json()) == 5


def test_api34_field_device_gps_overrides_the_estimate(client, auth):
    f = auth("Response Team")
    team_vehicle = next(v for v in client.get(f"{API}/vehicles", headers=f).json() if v["ext"]["team_id"] == 1)
    r = client.post(f"{API}/field/vehicles/{team_vehicle['vehicle_id']}/position", headers=f, json={"latitude": 13.0, "longitude": 80.23})
    assert r.status_code == 204
    v = next(x for x in client.get(f"{API}/vehicles", headers=f).json() if x["vehicle_id"] == team_vehicle["vehicle_id"])
    assert v["ext"]["position"] == [13.0, 80.23] and v["ext"]["position_source"] == "gps"
    other = next(v for v in client.get(f"{API}/vehicles", headers=f).json() if v["ext"]["team_id"] != 1)
    assert (
        client.post(
            f"{API}/field/vehicles/{other['vehicle_id']}/position", headers=f, json={"latitude": 13.0, "longitude": 80.2}
        ).status_code
        == 403
    )


def test_api35_resources_and_disaster_update(client, auth):
    cmd = auth("Emergency Authority")
    r = client.post(f"{API}/resources", headers=cmd, json={"resource_type": "Tarpaulins", "quantity": 500, "per_person": 0.25})
    assert r.status_code == 201
    upd = client.put(f"{API}/resources/{r.json()['resource_id']}", headers=cmd, json={"quantity": 450, "availability": "Low Stock"}).json()
    assert upd["quantity"] == 450
    d = client.put(f"{API}/disasters/1", headers=cmd, json={"severity": "High"}).json()
    assert d["severity"] == "High" and len(d["zones"]) == 8


def test_api36_reunification_and_zone_lookup(client, auth):
    h = auth("Evacuation Coordinator")
    client.post(f"{API}/evacuations/generate", headers=h, json={"strategy": "greedy"})
    hits = client.get(f"{API}/reunification", headers=h, params={"q": "Lakshmi Narayanan"}).json()
    assert hits and hits[0]["planned_shelter_name"]
    zone = client.get(f"{API}/public/lookup", params={"q": "vel"}).json()
    assert zone[0]["zone_code"] == "VEL" and zone[0]["shelter"] is not None
    assert client.get(f"{API}/public/lookup", params={"q": "nowhere"}).json() == []


def test_api37_update_zone_and_users_list(client, auth):
    h = auth("Evacuation Coordinator")
    z = client.put(f"{API}/zones/1", headers=h, json={"risk_level": "Moderate"}).json()
    assert z["risk_level"] == "Moderate" and z["ext"]["severity"] == 3
    assert client.put(f"{API}/zones/1", headers=h, json={"evacuated_count": 99999}).status_code == 422
    assert client.get(f"{API}/users", headers=h).status_code == 403
    assert len(client.get(f"{API}/users", headers=auth("Admin")).json()) == 8


def test_api38_reallocate_compat_endpoint_and_notifications(client, auth):
    h = auth("Evacuation Coordinator")
    client.post(f"{API}/evacuations/generate", headers=h, json={"strategy": "min-cost-flow"})
    r = client.post(f"{API}/evacuations/reallocate", headers=h, json={"full_shelter_id": 4, "reason": "Mylapore hall roof leaking"})
    assert r.status_code == 200 and r.json()["current_version"]["version"] == 2
    n = client.get(f"{API}/notifications", headers=h).json()[0]
    read = client.post(f"{API}/notifications/{n['notification_id']}/read", headers=h).json()
    assert read["status"] == "Read"
    assert client.get(f"{API}/drill/scenarios").json()[0]["id"] == "chennai-adyar-flood"
