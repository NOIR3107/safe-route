def test_create_and_read_disaster(client, coordinator_headers):
    payload = {
        "type": "Flood",
        "title": "Yamuna River Flood 2026",
        "description": "Rising water levels threatening low-lying sectors in Noida",
        "severity": "Critical",
        "status": "Active"
    }
    create_res = client.post("/api/v1/disasters/", json=payload, headers=coordinator_headers)
    assert create_res.status_code == 201
    disaster_id = create_res.json()["disaster_id"]

    get_res = client.get(f"/api/v1/disasters/{disaster_id}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "Yamuna River Flood 2026"
    assert get_res.json()["severity"] == "Critical"


def test_register_affected_zone(client, coordinator_headers):
    # First create disaster
    disaster_res = client.post("/api/v1/disasters/", json={
        "type": "Earthquake",
        "title": "NCR Tremor Incident",
        "severity": "High"
    }, headers=coordinator_headers)
    disaster_id = disaster_res.json()["disaster_id"]

    # Register affected zone
    zone_payload = {
        "disaster_id": disaster_id,
        "name": "Sector 62 Cluster A",
        "location": "Sector 62, Noida",
        "state": "Uttar Pradesh",
        "district": "Gautam Buddha Nagar",
        "population": 450,
        "priority": "P1",
        "risk_level": "Extreme"
    }
    zone_res = client.post("/api/v1/zones/", json=zone_payload, headers=coordinator_headers)
    assert zone_res.status_code == 201
    zone_data = zone_res.json()
    assert zone_data["name"] == "Sector 62 Cluster A"
    assert zone_data["population"] == 450
    assert zone_data["priority"] == "P1"
