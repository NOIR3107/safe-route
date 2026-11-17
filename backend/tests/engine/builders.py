"""Tiny hand-made inputs for engine unit tests (no database)."""

from __future__ import annotations

import random

from app.engine import EngineHousehold, EngineInput, EngineRoute, EngineShelter, EngineVehicle, EngineZone


def zone(zone_id=1, severity=4, population=100, priority="P1", risk="High", vulnerable=0, centroid=(13.0, 80.2)) -> EngineZone:
    return EngineZone(zone_id, f"Zone {zone_id}", severity, centroid, priority, risk, population, 0, vulnerable)


def household(hid, zone_id=1, size=4, needs=(), pets=False, high=False, vulnerable=0) -> EngineHousehold:
    return EngineHousehold(hid, zone_id, size, list(needs), pets, high, vulnerable)


def shelter(
    sid,
    capacity=100,
    committed=0,
    reserved=0,
    facilities=("Medical", "Power", "Water", "Accessibility", "Food", "Bedding"),
    open_=True,
    degraded=(),
    position=(13.05, 80.25),
) -> EngineShelter:
    return EngineShelter(sid, f"Shelter {sid}", open_, capacity, committed, reserved, list(facilities), list(degraded), position)


def route(rid, zone_id, shelter_id, minutes=10.0, km=3.0, risk="Low", status="Open") -> EngineRoute:
    return EngineRoute(rid, zone_id, shelter_id, f"R{rid}", [], km, minutes, risk, status)


def vehicle(vid, capacity=50, vtype="Bus", position=(13.0, 80.2)) -> EngineVehicle:
    return EngineVehicle(vid, vtype, capacity, position)


def random_input(seed: int) -> EngineInput:
    """A random but valid situation, used to check properties over many cases."""
    rng = random.Random(seed)
    zones = [zone(z, severity=rng.randint(1, 5), population=0) for z in range(1, rng.randint(2, 6) + 1)]
    shelters = [
        shelter(
            s,
            capacity=rng.randint(20, 200),
            committed=rng.randint(0, 20),
            reserved=rng.randint(0, 10),
            facilities=[f for f in ("Medical", "Power", "Water", "Accessibility", "Food", "Pets") if rng.random() < 0.7],
            open_=rng.random() > 0.15,
        )
        for s in range(1, rng.randint(2, 5) + 1)
    ]
    routes, rid = [], 0
    for z in zones:
        for s in shelters:
            if rng.random() < 0.75:
                rid += 1
                routes.append(
                    route(
                        rid,
                        z.zone_id,
                        s.shelter_id,
                        minutes=rng.randint(4, 40),
                        km=rng.uniform(1, 12),
                        risk=rng.choice(["Low", "Moderate", "High"]),
                        status=rng.choice(["Open"] * 5 + ["Congested", "Blocked", "Flooded"]),
                    )
                )
    households, n = [], 0
    for z in zones:
        for _ in range(rng.randint(3, 25)):
            n += 1
            needs = [f for f, p in (("Medical", 0.06), ("Accessibility", 0.06)) if rng.random() < p]
            h = household(f"H{n:04d}", z.zone_id, rng.randint(1, 7), needs, rng.random() < 0.1, high=bool(needs) or z.severity >= 4)
            households.append(h)
            z.population += h.size
    vehicles = [vehicle(v, capacity=rng.choice([6, 12, 40, 70])) for v in range(1, rng.randint(0, 8) + 1)]
    return EngineInput(zones, households, shelters, routes, vehicles)
