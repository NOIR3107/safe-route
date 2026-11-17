"""Load SEED DATA into the live database.

    python -m app.seed               # Chennai Adyar flood + recorded OSRM road geometry (if recorded)
    python -m app.seed --osrm        # also fetch real road geometry from OSRM and record it
    python -m app.seed --schematic   # keep the straight-line corridor sketches

Run `alembic upgrade head` first. This EMPTIES the live database before loading.
"""

from __future__ import annotations

import argparse

import httpx

from app.core.config import settings
from app.core.database import dbs
from app.ingestion import osrm
from app.ingestion.adapter import ingest
from app.ingestion.schemas import RouteGeometryMsg
from app.repositories import Repos

from .loader import load_scenario
from .scenarios import CHENNAI_FLOOD


def route_key(repos: Repos, route) -> str:
    zone = repos.zones.get(route.zone_id)
    shelter = repos.shelters.get(route.shelter_id)
    return f"{zone.code}->{shelter.name}"


def fetch_osrm(repos: Repos) -> dict:
    """Ask OSRM for the real road through each route's waypoints and record the answers."""
    recorded = osrm.load_recorded()
    with httpx.Client(timeout=20, headers={"User-Agent": "SafeRoute-lab-seed/1.0"}) as client:
        for r in repos.routes.list():
            key = route_key(repos, r)
            if key in recorded:
                continue
            waypoints = [tuple(p) for p in r.path]  # zone centroid -> named segments -> shelter
            try:
                recorded[key] = osrm.fetch_route(settings.OSRM_URL, waypoints, client)
                print(f"  OSRM {key}: {recorded[key]['distance_km']} km, {recorded[key]['travel_time']} min")
            except (httpx.HTTPError, ValueError) as e:
                print(f"  OSRM {key}: failed ({e}); keeping the schematic corridor")
    osrm.save_recorded(recorded)
    return recorded


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--osrm", action="store_true", help="fetch road geometry from OSRM and record it")
    p.add_argument("--schematic", action="store_true", help="do not apply recorded OSRM geometry")
    args = p.parse_args()

    with dbs.Live() as db:
        load_scenario(db, CHENNAI_FLOOD)
        db.commit()
        repos = Repos(db, "live")
        print(
            f"Seeded '{CHENNAI_FLOOD['name']}': {len(repos.zones.list())} zones, {len(repos.households.list())} households, "
            f"{len(repos.shelters.list())} shelters, {len(repos.routes.list())} routes, {len(repos.vehicles.list())} vehicles."
        )
        if args.schematic:
            return
        recorded = fetch_osrm(repos) if args.osrm else osrm.load_recorded()
        msgs = [
            RouteGeometryMsg(
                kind="route_geometry",
                route_id=r.route_id,
                path=[tuple(x) for x in recorded[k]["path"]],
                distance_km=recorded[k]["distance_km"],
                travel_time=recorded[k]["travel_time"],
            )
            for r in repos.routes.list()
            if (k := route_key(repos, r)) in recorded
        ]
        if msgs:
            accepted, errors = ingest(repos, "osrm", msgs)
            db.commit()
            print(f"Applied OSRM road geometry to {accepted} routes" + (f" ({len(errors)} rejected)" if errors else "") + ".")
        else:
            print("No recorded OSRM geometry; routes are schematic. Run with --osrm to fetch it.")


if __name__ == "__main__":
    main()
