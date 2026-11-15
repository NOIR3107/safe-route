def test_create_shelter_and_facility(client, admin_headers):
    shelter_payload = {
        "name": "JSS Community Relief Shelter",
        "location": "Sector 62 Institutional Area, Noida",
        "capacity": 500,
        "current_occupancy": 0,
        "facilities": "Medical,Food,Bedding,Power Backup",
        "status": "Active"
    }
    shelter_res = client.post("/api/v1/shelters/", json=shelter_payload, headers=admin_headers)
    assert shelter_res.status_code == 201
    shelter = shelter_res.json()
    assert shelter["name"] == "JSS Community Relief Shelter"
    assert shelter["available_capacity"] == 500

    # Add facility
    fac_payload = {
        "shelter_id": shelter["shelter_id"],
        "facility_type": "Emergency Clinic",
        "capacity": 80,
        "availability_status": "Available"
    }
    fac_res = client.post("/api/v1/shelters/facilities", json=fac_payload, headers=admin_headers)
    assert fac_res.status_code == 201
    assert fac_res.json()["facility_type"] == "Emergency Clinic"


def test_create_and_update_route(client, admin_headers):
    route_payload = {
        "source": "Sector 62, Noida",
        "destination": "JSS Shelter, Noida",
        "distance_km": 3.5,
        "travel_time": 10.0,
        "risk_level": "Low",
        "status": "Open"
    }
    create_res = client.post("/api/v1/routes/", json=route_payload, headers=admin_headers)
    assert create_res.status_code == 201
    route_id = create_res.json()["route_id"]

    # Update route to blocked
    update_res = client.put(f"/api/v1/routes/{route_id}", json={"status": "Blocked", "risk_level": "Severe"}, headers=admin_headers)
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "Blocked"
