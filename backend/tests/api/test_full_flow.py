"""The lab file's full flow on the real API and PostgreSQL. TC-API-09 .. TC-API-20 (FR-01, FR-02, FR-07, FR-09, FR-10, FR-11, FR-12).

disaster -> zones -> plan -> close shelter -> reallocation -> approve -> override -> field -> check-in.
"""

from __future__ import annotations

API = "/api/v1"


def generate(client, h, strategy="min-cost-flow"):
    r = client.post(f"{API}/evacuations/generate", headers=h, json={"strategy": strategy})
    assert r.status_code == 200, r.text
    return r.json()


def test_api09_create_disaster_and_zone(client, auth):
    """Acceptance criterion 1."""
    h = auth("Emergency Authority")
    d = client.post(f"{API}/disasters", headers=h, json={"type": "Cyclone", "title": "Cyclone Test – Ennore", "severity": "High"})
    assert d.status_code == 201
    z = client.post(
        f"{API}/zones",
        headers=h,
        json={
            "disaster_id": d.json()["disaster_id"],
            "name": "Ennore",
            "location": "Ennore",
            "population": 300,
            "priority": "P1",
            "risk_level": "High",
            "latitude": 13.21,
            "longitude": 80.32,
        },
    )
    assert z.status_code == 201 and z.json()["ext"]["code"] == "ENN"
    actions = [a["action"] for a in client.get(f"{API}/logs/audit", headers=h).json()]
    assert "CREATE_DISASTER" in actions and "CREATE_ZONE" in actions


def test_zone_names_sharing_a_prefix_get_distinct_codes(client, auth):
    h = auth("Evacuation Coordinator")
    body = {"disaster_id": 1, "location": "Adyar", "population": 10, "latitude": 13.0, "longitude": 80.25}
    codes = [client.post(f"{API}/zones", headers=h, json={**body, "name": n}).json()["ext"]["code"] for n in ("Adyar East", "Adyar West")]
    assert len(set(codes)) == 2 and all(c.startswith("ADY") for c in codes)
    explicit = client.post(f"{API}/zones", headers=h, json={**body, "name": "Other", "code": codes[0]})
    assert explicit.status_code == 409


def test_api10_invalid_zone_is_422(client, auth):
    r = client.post(
        f"{API}/zones", headers=auth("Evacuation Coordinator"), json={"disaster_id": 1, "name": "X", "location": "X", "population": -5}
    )
    assert r.status_code == 422


def test_api11_generate_plan_is_stored_and_respects_capacity(client, auth):
    """Acceptance criteria 2 and 3."""
    h = auth("Evacuation Coordinator")
    plan = generate(client, h)
    v = plan["current_version"]
    assert v["version"] == 1 and v["status"] == "Proposed"
    assert v["metrics"]["people_allocated"] + v["metrics"]["people_unallocated"] == 5350
    shelters = client.get(f"{API}/shelters", headers=h).json()
    for s in shelters:
        assert s["current_occupancy"] + s["inbound"] <= s["capacity"]
        assert s["display_status"] != "Closed"
    assignments = client.get(f"{API}/evacuations/assignments", headers=h).json()
    assert len(assignments) == v["metrics"]["assignments"]
    assert all(a["ext"]["explanation"]["cost"]["total"] > 0 for a in assignments)


def test_api12_closing_a_shelter_reallocates_into_a_new_proposed_version(client, auth):
    """Acceptance criterion 4 (FR-10)."""
    h = auth("Evacuation Coordinator")
    generate(client, h)
    client.post(f"{API}/evacuations/versions/1/approve", headers=h)
    before = [a for a in client.get(f"{API}/evacuations/assignments", headers=h).json() if a["shelter_id"] == 6]
    assert before, "seeded plan sends people to Guindy School"
    r = client.post(f"{API}/shelters/6/status", headers=h, json={"status": "Closed", "reason": "Structural crack reported"})
    assert r.status_code == 200 and r.json()["display_status"] == "Closed"
    plan = client.get(f"{API}/evacuations/plan", headers=h).json()
    v = plan["current_version"]
    assert v["version"] == 2 and v["status"] == "Proposed" and v["trigger"]["type"] == "ShelterClosed"
    assert v["diff"]["people_moved"] + v["diff"]["newly_unallocated"] == sum(a["people_count"] for a in before)
    after = client.get(f"{API}/evacuations/assignments", headers=h).json()
    assert not [a for a in after if a["shelter_id"] == 6 and a["status"] in ("Scheduled", "In Progress")]
    # Unaffected assignments keep their approval; only re-planned ones are Proposed.
    assert {a["ext"]["approval"] for a in after} == {"Approved", "Proposed"}
    notes = client.get(f"{API}/notifications", headers=h).json()
    assert any(n["message"].startswith("REPLANNING v2") for n in notes)


def test_api13_blocking_a_bridge_reroutes_only_its_groups(client, auth):
    h = auth("Evacuation Coordinator")
    generate(client, h)
    routes = client.get(f"{API}/routes", headers=h).json()
    bridge_routes = {r["route_id"] for r in routes if "Velachery Main Rd" in r["ext"]["via"]}
    used = [a for a in client.get(f"{API}/evacuations/assignments", headers=h).json() if a["route_id"] in bridge_routes]
    rid = used[0]["route_id"]
    assert client.post(f"{API}/routes/{rid}/status", headers=h, json={"status": "Blocked", "reason": "Tree fall"}).status_code == 200
    after = client.get(f"{API}/evacuations/assignments", headers=h).json()
    assert not [a for a in after if a["route_id"] == rid and a["status"] in ("Scheduled", "In Progress")]


def test_api14_illegal_route_transition_is_409(client, auth):
    h = auth("Transport Coordinator")
    assert client.post(f"{API}/routes/1/status", headers=h, json={"status": "Cleared"}).status_code == 409


def test_api15_approve_needs_the_current_version(client, auth):
    h = auth("Evacuation Coordinator")
    generate(client, h)
    assert client.post(f"{API}/evacuations/versions/5/approve", headers=h).status_code == 409
    r = client.post(f"{API}/evacuations/versions/1/approve", headers=h)
    assert r.status_code == 200 and r.json()["current_version"]["approved_by"] == "Evacuation Coordinator"
    assert client.post(f"{API}/evacuations/versions/1/approve", headers=h).status_code == 409


def test_api16_override_moves_one_assignment_with_reason(client, auth):
    h = auth("Evacuation Coordinator")
    generate(client, h)
    a = next(
        x
        for x in client.get(f"{API}/evacuations/assignments", headers=h).json()
        if x["shelter_id"] != 2 and not x["ext"]["explanation"]["required_facilities"]
    )
    short = client.post(
        f"{API}/evacuations/assignments/{a['assignment_id']}/override", headers=h, json={"shelter_id": 2, "reason": "short"}
    )
    assert short.status_code == 422
    r = client.post(
        f"{API}/evacuations/assignments/{a['assignment_id']}/override",
        headers=h,
        json={"shelter_id": 2, "reason": "Families asked to stay together at the stadium"},
    )
    assert r.status_code == 200, r.text
    v = r.json()["current_version"]
    assert v["trigger"]["type"] == "Override"
    moved = [x for x in client.get(f"{API}/evacuations/assignments", headers=h).json() if x["ext"]["approval"] == "Overridden"]
    assert moved and moved[0]["shelter_id"] == 2


def test_api17_compare_strategies_saves_nothing(client, auth):
    h = auth("Evacuation Coordinator")
    both = client.get(f"{API}/evacuations/compare", headers=h).json()
    assert set(both) == {"greedy", "min-cost-flow"}
    assert client.get(f"{API}/evacuations/plan", headers=h).json() is None


def test_api18_field_pickup_and_arrival_update_shelter_and_zone(client, auth):
    generate(client, auth("Evacuation Coordinator"))
    f = auth("Response Team")
    task = client.get(f"{API}/field/tasks", headers=f).json()[0]
    hh = client.get(f"{API}/assignments/{task['assignment_id']}/households", headers=f).json()
    shelter_before = next(s for s in client.get(f"{API}/shelters", headers=f).json() if s["shelter_id"] == task["shelter_id"])
    assert (
        client.post(
            f"{API}/field/assignments/{task['assignment_id']}/pickup", headers=f, json={"household_ids": [x["household_id"] for x in hh]}
        ).status_code
        == 204
    )
    assert client.post(f"{API}/field/assignments/{task['assignment_id']}/arrive", headers=f).status_code == 204
    shelter_after = next(s for s in client.get(f"{API}/shelters", headers=f).json() if s["shelter_id"] == task["shelter_id"])
    assert shelter_after["current_occupancy"] == shelter_before["current_occupancy"] + task["people_count"]
    summary = client.get(f"{API}/dashboard/summary", headers=f).json()
    assert summary["population"]["total_evacuated"] == task["people_count"]


def test_api19_check_in_and_walk_in_at_own_shelter(client, auth):
    generate(client, auth("Evacuation Coordinator"))
    m = auth("Shelter Manager")
    roster = client.get(f"{API}/shelters/1/roster", headers=m).json()
    token = roster["expected"][0]["token"]
    r = client.post(f"{API}/shelters/1/checkin", headers=m, json={"token": token}).json()
    assert r["ok"] and r["household"]["status"] == "Checked In"
    again = client.post(f"{API}/shelters/1/checkin", headers=m, json={"token": token}).json()
    assert not again["ok"] and "already checked in" in again["message"]
    w = client.post(f"{API}/shelters/1/walk-ins", headers=m, json={"head_name": "Unregistered", "people": 3}).json()
    assert w["ok"] and w["household"]["household_id"].startswith("WI-1-")
    assert client.post(f"{API}/shelters/1/walk-ins", headers=m, json={"people": 50}).status_code == 422


def test_api20_resource_allocations_follow_the_plan(client, auth):
    """FR-09 resource assignment."""
    h = auth("Evacuation Coordinator")
    generate(client, h)
    rows = client.get(f"{API}/evacuations/resource-allocations", headers=h).json()
    water = [r for r in rows if r["resource_type"].startswith("Drinking Water")]
    assert water and sum(r["quantity"] for r in water) <= 18000
