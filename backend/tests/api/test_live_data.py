"""Live data: ingestion replay, WebSocket push, drill isolation. TC-API-21 .. TC-API-28, TC-API-39 (FR-03, FR-04, FR-05, FR-10, FR-12)."""

from __future__ import annotations

from app.core.database import dbs
from app.ingestion import osrm
from app.ingestion.adapter import ingest
from app.ingestion.replay import read_feed
from app.repositories import Repos

API = "/api/v1"
TOKEN = {"X-Ingest-Token": "dev-ingest-token"}
SAMPLE = osrm.SAMPLE_FILE.parent / "adyar_feed.jsonl"


def test_api21_ingest_needs_the_token_and_valid_messages(client):
    msg = {"source": "test", "messages": [{"kind": "route_status", "segment": "Thiru Vi Ka Bridge", "status": "Flooded"}]}
    assert client.post(f"{API}/ingest", json=msg).status_code == 401
    bad = {"source": "test", "messages": [{"kind": "route_status", "status": "Flooded"}]}  # no target
    assert client.post(f"{API}/ingest", json=bad, headers=TOKEN).status_code == 422
    bad_kind = {"source": "test", "messages": [{"kind": "teleport", "vehicle_id": 1}]}
    assert client.post(f"{API}/ingest", json=bad_kind, headers=TOKEN).status_code == 422


def test_api22_feed_change_reaches_db_views_events_and_status(client, auth):
    """One value end to end: feed -> DB -> routes, events, notifications, feed status."""
    h = auth("Evacuation Coordinator")
    client.post(f"{API}/evacuations/generate", headers=h, json={"strategy": "min-cost-flow"})
    r = client.post(
        f"{API}/ingest",
        headers=TOKEN,
        json={
            "source": "river-gauge",
            "messages": [
                {"kind": "route_status", "segment": "Thiru Vi Ka Bridge", "status": "Flooded", "reason": "Gauge: water over the deck"}
            ],
        },
    )
    assert r.json() == {"accepted": 1, "rejected": 0, "errors": []}
    bridge = [x for x in client.get(f"{API}/routes", headers=h).json() if "Thiru Vi Ka Bridge" in x["ext"]["via"]]
    assert bridge and all(x["status"] == "Flooded" for x in bridge)
    assert client.get(f"{API}/ops/events", headers=h).json()[0]["title"].startswith("Plan v2") or any(
        e["title"] == "Gauge: water over the deck" for e in client.get(f"{API}/ops/events", headers=h).json()
    )
    status = client.get(f"{API}/ingest/status").json()
    assert status["source"] == "river-gauge" and status["stale"] is False and status["messages"] == 1


def test_api23_bad_message_is_rejected_but_batch_continues(client):
    r = client.post(
        f"{API}/ingest",
        headers=TOKEN,
        json={
            "source": "test",
            "messages": [
                {"kind": "shelter_status", "shelter_id": 999, "status": "Closed"},
                {"kind": "walk_ins", "shelter_id": 5, "people": 20},
            ],
        },
    ).json()
    assert r["accepted"] == 1 and r["rejected"] == 1 and "999" in r["errors"][0]


def test_api24_recorded_feed_replays_into_the_database(seeded):
    """Replays the recorded field-report sample end to end (the REPLAY dev fallback uses the same file)."""
    batches = read_feed(SAMPLE)
    assert len(batches) == 9
    with dbs.Live() as db:
        repos = Repos(db, "live")
        from app.services.context import SYSTEM
        from app.services.planning import generate_initial_plan

        generate_initial_plan(repos, "min-cost-flow", SYSTEM)
        results = [ingest(repos, b.source, b.messages) for _, b in batches]
        repos.commit()
        assert all(not errors for _, errors in results)
        assert repos.shelters.get(6).status == "Closed"
        assert repos.shelters.get(5).walk_ins == 300
        assert repos.vehicles.get(1).position_source == "gps"
        assert repos.ingest.count() == sum(len(b.messages) for _, b in batches)
        assert repos.plans.current_version().version > 1  # the feed triggered re-planning


def test_api25_recorded_osrm_geometry_is_valid(seeded):
    """Road geometry recorded from OSRM (god's-eye-view's routing source) is applied through ingestion."""
    recorded = osrm.load_recorded()
    assert len(recorded) >= 40
    with dbs.Live() as db:
        repos = Repos(db, "live")
        route = repos.routes.list()[0]
        key = f"{repos.zones.get(route.zone_id).code}->{repos.shelters.get(route.shelter_id).name}"
        from app.ingestion.schemas import RouteGeometryMsg

        g = recorded[key]
        accepted, _ = ingest(
            repos,
            "osrm",
            [
                RouteGeometryMsg(
                    kind="route_geometry",
                    route_id=route.route_id,
                    path=[tuple(p) for p in g["path"]],
                    distance_km=g["distance_km"],
                    travel_time=g["travel_time"],
                )
            ],
        )
        assert accepted == 1 and route.geometry_source == "osrm" and len(route.path) > 2


def test_api26_websocket_says_hello_and_pushes_changes(client, auth):
    h = auth("Evacuation Coordinator")
    with client.websocket_connect(f"{API}/ws") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello" and hello["clock"]["mode"] == "live"
        client.post(f"{API}/shelters/7/status", headers=h, json={"status": "Full"})
        for _ in range(5):
            msg = ws.receive_json()
            if msg["type"] == "changed":
                assert msg["topics"] == ["*"] and msg["mode"] == "live"
                break
        else:
            raise AssertionError("no change message")


def test_api39_timeline_tracks_arrivals_and_versions(client, auth):
    h = auth("Evacuation Coordinator")
    client.post(f"{API}/evacuations/generate", headers=h, json={"strategy": "min-cost-flow"})
    client.post(f"{API}/drill/control", headers=h, json={"type": "start"})
    with dbs.Drill() as db:
        from app.core.database import serialize_writes
        from app.services.drill import advance

        serialize_writes(db)
        repos = Repos(db, "drill")
        advance(repos, 60)
        repos.commit()
    t = client.get(f"{API}/dashboard/timeline", headers=h).json()
    assert len(t["evacuated"]) == 12 and t["affected"] == 5350
    counts = [c for _, c in t["evacuated"]]
    assert counts == sorted(counts) and counts[-1] > 0  # cumulative, and people did arrive
    assert [v["version"] for v in t["versions"]][0] == 1 and len(t["versions"]) > 1
    client.post(f"{API}/drill/control", headers=h, json={"type": "end"})


def test_api27_drill_branches_from_live_and_never_changes_it(client, auth):
    h = auth("Evacuation Coordinator")
    client.post(f"{API}/evacuations/generate", headers=h, json={"strategy": "min-cost-flow"})
    live_before = client.get(f"{API}/dashboard/summary", headers=h).json()
    d = client.post(f"{API}/drill/control", headers=h, json={"type": "start"}).json()
    assert d["mode"] == "drill" and d["phase"] == "running" and d["sim_minute"] == 0
    with dbs.Drill() as db:
        from app.services.drill import advance

        repos = Repos(db, "drill")
        advance(repos, 75)
        repos.commit()
    drill = client.get(f"{API}/drill", headers=h).json()
    assert set(drill["fired_event_ids"]) >= {"e1", "e2", "e3", "e4", "e5"}
    assert client.get(f"{API}/dashboard/summary", headers=h).json()["population"]["total_evacuated"] > 0
    client.post(f"{API}/drill/control", headers=h, json={"type": "end"})
    assert client.get(f"{API}/ops/clock").json()["mode"] == "live"
    assert client.get(f"{API}/dashboard/summary", headers=h).json() == live_before


def test_api28_inject_needs_a_drill_and_replay_restores_t0(client, auth):
    h = auth("Evacuation Coordinator")
    ev = {"kind": "RouteSegmentBlocked", "segment": "Anna Salai", "label": "Bus breakdown on Anna Salai"}
    assert client.post(f"{API}/drill/events", headers=h, json=ev).status_code == 409
    client.post(f"{API}/drill/control", headers=h, json={"type": "start"})
    d = client.post(f"{API}/drill/events", headers=h, json=ev).json()
    assert d["fired_event_ids"][-1].startswith("m")
    with dbs.Drill() as db:  # run well past the bridge flood at T+20
        from app.core.database import serialize_writes
        from app.services.drill import advance

        serialize_writes(db)
        repos = Repos(db, "drill")
        advance(repos, 40)
        repos.commit()
    assert "e2" in client.get(f"{API}/drill", headers=h).json()["fired_event_ids"]
    d = client.post(f"{API}/drill/control", headers=h, json={"type": "replay"}).json()
    # Back at T+0 (the server clock may already have ticked once or twice since).
    assert d["sim_minute"] < 20 and "e2" not in d["fired_event_ids"]
    assert any(e.get("manual") for e in d["timeline"]), "injected events are kept for the replay"
    client.post(f"{API}/drill/control", headers=h, json={"type": "end"})
