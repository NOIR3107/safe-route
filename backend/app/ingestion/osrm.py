"""Road geometry from OSRM, the routing service god's-eye-view uses for its directions layer.

`python -m app.seed --osrm` asks OSRM for the real road between each zone and shelter (through the
route's named segments) and records the answers in samples/osrm_routes.json. Seeding later reads that
file, so tests and CI never call the internet. Only public coordinates are sent.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx

SAMPLE_FILE = Path(__file__).parent / "samples" / "osrm_routes.json"


def fetch_route(base_url: str, waypoints: list[tuple[float, float]], client: httpx.Client) -> dict:
    """Driving route through the waypoints. Returns path [[lat, lon]...], distance_km, travel_time (min)."""
    coords = ";".join(f"{lon:.5f},{lat:.5f}" for lat, lon in waypoints)
    r = client.get(f"{base_url.rstrip('/')}/route/v1/driving/{coords}", params={"overview": "simplified", "geometries": "geojson"})
    r.raise_for_status()
    data = r.json()
    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError(f"OSRM returned {data.get('code')}")
    route = data["routes"][0]
    return {
        "path": [[round(lat, 5), round(lon, 5)] for lon, lat in route["geometry"]["coordinates"]],
        "distance_km": round(route["distance"] / 1000, 2),
        "travel_time": round(route["duration"] / 60, 1),
    }


def load_recorded() -> dict[str, dict]:
    """Recorded OSRM answers keyed by "<zone code>-><shelter location>"."""
    if not SAMPLE_FILE.exists():
        return {}
    return json.loads(SAMPLE_FILE.read_text(encoding="utf-8"))


def save_recorded(data: dict[str, dict]) -> None:
    SAMPLE_FILE.parent.mkdir(parents=True, exist_ok=True)
    SAMPLE_FILE.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
