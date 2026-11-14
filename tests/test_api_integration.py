def test_end_to_end_evacuation_workflow(client, coordinator_headers, admin_headers):
    # 1. Create Disaster
    disaster_res = client.post("/api/v1/disasters/", json={
        "type": "Flash Flood",
        "title": "East Expressway Flood",
        "severity": "Critical"
    }, headers=coordinator_headers)
    assert disaster_res.status_code == 201
    disaster_id = disaster_res.json()["disaster_id"]

    # 2. Register Zone
    zone_res = client.post("/api/v1/zones/", json={
        "disaster_id": disaster_id,
        "name": "Zone Alpha",
        "location": "Expressway Point 1",
        "population": 120,
        "priority": "P1",
        "risk_level": "Extreme"
    }, headers=coordinator_headers)
    assert zone_res.status_code == 201

    # 3. Register Shelter
    shelter_res = client.post("/api/v1/shelters/", json={
        "name": "Stadium Evacuation Center",
        "location": "North Stadium Complex",
        "capacity": 300,
        "current_occupancy": 0,
        "status": "Active"
    }, headers=admin_headers)
    assert shelter_res.status_code == 201

    # 4. Register Route
    route_res = client.post("/api/v1/routes/", json={
        "source": "Expressway Point 1",
        "destination": "North Stadium Complex",
        "distance_km": 6.2,
        "travel_time": 18.0,
        "risk_level": "Low",
        "status": "Open"
    }, headers=admin_headers)
    assert route_res.status_code == 201

    # 5. Register Vehicle
    veh_res = client.post("/api/v1/vehicles/", json={
        "vehicle_type": "Bus",
        "capacity": 60,
        "status": "Available",
        "current_location": "Expressway Point 1"
    }, headers=admin_headers)
    assert veh_res.status_code == 201

    # 6. Generate Plan via API
    gen_res = client.post("/api/v1/evacuations/generate", json={
        "disaster_id": disaster_id,
        "plan_name": "Expressway Evacuation Alpha"
    }, headers=coordinator_headers)
    assert gen_res.status_code == 201
    plan_data = gen_res.json()
    assert plan_data["status"] == "Active"
    assert len(plan_data["assignments"]) > 0

    # 7. Check Dashboard Summary
    dash_res = client.get("/api/v1/dashboard/summary")
    assert dash_res.status_code == 200
    summary = dash_res.json()
    assert summary["disasters"]["total"] >= 1
    assert summary["population"]["total_evacuated"] >= 120
    assert summary["plans"]["active_plans"] >= 1
