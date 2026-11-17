"""SEED DATA - not live data.

The Adyar River flood scenario for Greater Chennai (modelled on the 2015 flood corridor) and a
seeded synthetic generator for stress drills. Coordinates are approximate; road corridors are
schematic (zone -> named road segments -> shelter) until OSRM geometry is fetched with
`python -m app.seed --osrm`. Populations are people needing assisted evacuation, not ward totals.
"""

from __future__ import annotations

from app.engine.geo import haversine_km

from .prng import Prng

CHENNAI_FLOOD: dict = {
    "id": "chennai-adyar-flood",
    "name": "Chennai – Adyar River Flood",
    "description": (
        "Overnight cloudburst pushes the Adyar river over its banks. Eight low-lying localities need assisted "
        "evacuation to seven relief shelters while bridges flood and shelters fill."
    ),
    "seed": 2015,
    "duration_minutes": 150,
    "center": [13.02, 80.235],
    "disaster": {
        "type": "Flood",
        "title": "Adyar River Flood – Greater Chennai",
        "description": "Adyar river overtopping after 300 mm overnight rainfall; Chembarambakkam release in progress.",
        "severity": "Critical",
        "state": "Tamil Nadu",
        "district": "Chennai",
    },
    # code, name, centroid, radius km, people needing assisted evacuation, severity 1-5, priority, risk
    "zones": [
        ("VEL", "Velachery", (12.9791, 80.2209), 1.3, 1200, 5, "P1", "Extreme"),
        ("PAL", "Pallikaranai", (12.9405, 80.2137), 1.4, 800, 5, "P1", "Extreme"),
        ("SAI", "Saidapet", (13.0225, 80.2205), 0.9, 900, 4, "P1", "High"),
        ("KOT", "Kotturpuram", (13.0205, 80.2445), 0.8, 650, 4, "P1", "High"),
        ("JAF", "Jafferkhanpet", (13.0335, 80.2075), 0.8, 550, 3, "P2", "High"),
        ("ADY", "Adyar", (13.0040, 80.2565), 1.0, 500, 3, "P2", "Moderate"),
        ("EKK", "Ekkatuthangal", (13.0190, 80.2040), 0.7, 350, 2, "P3", "Moderate"),
        ("TAR", "Taramani", (12.9845, 80.2470), 0.9, 400, 2, "P3", "Moderate"),
    ],
    # key, name, location, position, capacity, occupancy, facilities
    "shelters": [
        (
            "TNG",
            "Govt Girls HSS, T. Nagar",
            "T. Nagar",
            (13.0405, 80.2337),
            1100,
            120,
            ["Medical", "Power", "Water", "Accessibility", "Food", "Bedding"],
        ),
        (
            "NIS",
            "Nehru Indoor Stadium",
            "Periamet",
            (13.0850, 80.271),
            2400,
            200,
            ["Medical", "Power", "Water", "Accessibility", "Food", "Bedding", "Pets"],
        ),
        (
            "LOY",
            "Loyola College Auditorium",
            "Nungambakkam",
            (13.0628, 80.2337),
            1300,
            90,
            ["Medical", "Power", "Water", "Accessibility", "Food", "Bedding"],
        ),
        ("MYL", "Mylapore Community Hall", "Mylapore", (13.0336, 80.2686), 450, 40, ["Power", "Water", "Food", "Bedding", "Pets"]),
        (
            "IIT",
            "IIT Madras Gymkhana",
            "Guindy (IIT Campus)",
            (12.9915, 80.2337),
            1000,
            60,
            ["Medical", "Power", "Water", "Accessibility", "Food", "Bedding"],
        ),
        ("GDY", "Guindy Govt Model School", "Guindy", (13.0075, 80.2125), 500, 30, ["Power", "Water", "Food", "Bedding"]),
        (
            "AU",
            "Anna University Convention Hall",
            "Anna University",
            (13.0112, 80.2355),
            850,
            50,
            ["Medical", "Power", "Water", "Accessibility", "Food", "Bedding"],
        ),
    ],
    "segments": {
        "Maraimalai Adigal Bridge": (13.0235, 80.2245),
        "Kotturpuram Bridge": (13.016, 80.2385),
        "Thiru Vi Ka Bridge": (13.013, 80.256),
        "Jafferkhanpet Causeway": (13.0262, 80.212),
        "Velachery Main Rd": (12.995, 80.219),
        "Velachery–Tambaram Rd": (12.956, 80.217),
        "Sardar Patel Rd": (13.008, 80.242),
        "Gandhi Mandapam Rd": (13.003, 80.243),
        "Anna Salai": (13.03, 80.229),
        "Kotturpuram Rd": (13.0245, 80.2435),
        "CIT Nagar": (13.03, 80.235),
        "Cathedral Rd": (13.048, 80.252),
        "Kasi Theatre Rd": (13.034, 80.216),
        "Jawaharlal Nehru Rd": (13.05, 80.21),
        "Poonamallee High Rd": (13.078, 80.26),
        "TTK Rd": (13.03, 80.255),
        "RK Mutt Rd": (13.027, 80.264),
        "Inner Ring Rd": (13.012, 80.208),
        "Taramani Link Rd": (12.988, 80.238),
        "Rajiv Gandhi Salai": (12.995, 80.252),
    },
    # zone code, shelter key, named segments, route risk
    "corridors": [
        ("VEL", "IIT", ["Velachery Main Rd"], "Moderate"),
        ("VEL", "GDY", ["Velachery Main Rd", "Inner Ring Rd"], "Moderate"),
        ("VEL", "AU", ["Velachery Main Rd", "Sardar Patel Rd"], "Low"),
        ("VEL", "TNG", ["Velachery Main Rd", "Maraimalai Adigal Bridge"], "Moderate"),
        ("VEL", "LOY", ["Velachery Main Rd", "Kotturpuram Bridge", "Cathedral Rd"], "Moderate"),
        ("VEL", "MYL", ["Taramani Link Rd", "Kotturpuram Bridge", "TTK Rd"], "Moderate"),
        ("PAL", "IIT", ["Velachery–Tambaram Rd", "Velachery Main Rd"], "High"),
        ("PAL", "GDY", ["Velachery–Tambaram Rd", "Velachery Main Rd", "Inner Ring Rd"], "High"),
        ("PAL", "AU", ["Velachery–Tambaram Rd", "Taramani Link Rd", "Sardar Patel Rd"], "Moderate"),
        ("PAL", "TNG", ["Velachery–Tambaram Rd", "Velachery Main Rd", "Maraimalai Adigal Bridge"], "High"),
        ("PAL", "NIS", ["Velachery–Tambaram Rd", "Rajiv Gandhi Salai", "Kotturpuram Bridge", "Poonamallee High Rd"], "High"),
        ("SAI", "TNG", ["Anna Salai"], "Low"),
        ("SAI", "LOY", ["Anna Salai", "Jawaharlal Nehru Rd"], "Low"),
        ("SAI", "NIS", ["Anna Salai", "Poonamallee High Rd"], "Low"),
        ("SAI", "GDY", ["Maraimalai Adigal Bridge", "Inner Ring Rd"], "Moderate"),
        ("SAI", "AU", ["Maraimalai Adigal Bridge", "Sardar Patel Rd"], "Moderate"),
        ("KOT", "MYL", ["Kotturpuram Rd", "RK Mutt Rd"], "Low"),
        ("KOT", "TNG", ["Kotturpuram Rd", "CIT Nagar"], "Low"),
        ("KOT", "LOY", ["Kotturpuram Rd", "Cathedral Rd"], "Low"),
        ("KOT", "AU", ["Kotturpuram Bridge"], "Moderate"),
        ("KOT", "IIT", ["Kotturpuram Bridge", "Gandhi Mandapam Rd"], "Moderate"),
        ("JAF", "TNG", ["Kasi Theatre Rd"], "Low"),
        ("JAF", "LOY", ["Kasi Theatre Rd", "Jawaharlal Nehru Rd"], "Low"),
        ("JAF", "NIS", ["Jawaharlal Nehru Rd", "Poonamallee High Rd"], "Low"),
        ("JAF", "GDY", ["Jafferkhanpet Causeway", "Inner Ring Rd"], "High"),
        ("ADY", "AU", ["Sardar Patel Rd"], "Low"),
        ("ADY", "IIT", ["Gandhi Mandapam Rd"], "Low"),
        ("ADY", "MYL", ["Thiru Vi Ka Bridge", "RK Mutt Rd"], "Moderate"),
        ("ADY", "TNG", ["Thiru Vi Ka Bridge", "TTK Rd"], "Moderate"),
        ("EKK", "GDY", ["Inner Ring Rd"], "Low"),
        ("EKK", "TNG", ["Jafferkhanpet Causeway", "Kasi Theatre Rd"], "Moderate"),
        ("EKK", "LOY", ["Jafferkhanpet Causeway", "Jawaharlal Nehru Rd"], "Moderate"),
        ("TAR", "IIT", ["Taramani Link Rd"], "Low"),
        ("TAR", "AU", ["Taramani Link Rd", "Sardar Patel Rd"], "Low"),
        ("TAR", "MYL", ["Rajiv Gandhi Salai", "Thiru Vi Ka Bridge", "RK Mutt Rd"], "Moderate"),
        # Long-haul corridors to the big stadium in the north (used when nearer options fail).
        ("VEL", "NIS", ["Velachery Main Rd", "Maraimalai Adigal Bridge", "Anna Salai", "Poonamallee High Rd"], "Moderate"),
        ("TAR", "NIS", ["Rajiv Gandhi Salai", "Kotturpuram Bridge", "Cathedral Rd", "Poonamallee High Rd"], "Moderate"),
        ("ADY", "LOY", ["Gandhi Mandapam Rd", "Kotturpuram Bridge", "Cathedral Rd"], "Moderate"),
        ("ADY", "NIS", ["Gandhi Mandapam Rd", "Kotturpuram Bridge", "Cathedral Rd", "Poonamallee High Rd"], "Moderate"),
        ("EKK", "NIS", ["Jafferkhanpet Causeway", "Jawaharlal Nehru Rd", "Poonamallee High Rd"], "Moderate"),
    ],
    "depots": [
        ("Guindy Fire Station", (13.008, 80.215)),
        ("Teynampet MTC Depot", (13.042, 80.25)),
        ("Velachery MTC Depot", (12.98, 80.218)),
        ("Adyar MTC Depot", (13.004, 80.256)),
    ],
    # type, seats, count, plate prefix
    "fleet": [
        ("Bus", 70, 30, "TN-01-N"),
        ("Truck", 40, 8, "TN-09-T"),
        ("Van", 12, 6, "TN-07-V"),
        ("Ambulance", 6, 8, "TN-108"),
        ("Boat", 12, 6, "NDRF-B"),
    ],
    "teams": [
        ("NDRF 4th Bn – Alpha", 8, "+91 44 2345 0001", "Velachery"),
        ("TNFRS Guindy – Bravo", 6, "+91 44 2345 0002", "Guindy"),
        ("GCC Rescue – Charlie", 7, "+91 44 2345 0003", "Saidapet"),
        ("NDRF 4th Bn – Delta", 8, "+91 44 2345 0004", "Adyar"),
    ],
    # resource, stock, per evacuee, availability, location
    "resources": [
        ("Drinking Water (L)", 18000, 3.0, "Available", "Corporation Store, Saidapet"),
        ("Food Packs", 6200, 1.0, "Available", "Amma Canteen Hub, T. Nagar"),
        ("Medical Kits", 140, 0.02, "Low Stock", "GH Chennai"),
        ("Blankets", 4100, 1.0, "Available", "Red Cross Godown, Egmore"),
        ("Diesel for Generators (L)", 900, 0.15, "Low Stock", "IOCL Depot, Guindy"),
    ],
    # Scripted disruptions for the drill (minutes after the drill starts).
    "events": [
        {
            "id": "e1",
            "at_minute": 8,
            "kind": "RouteSegmentCongested",
            "segment": "Velachery Main Rd",
            "label": "Heavy rain: Velachery Main Rd congested",
        },
        {
            "id": "e2",
            "at_minute": 20,
            "kind": "RouteSegmentBlocked",
            "segment": "Thiru Vi Ka Bridge",
            "label": "Thiru Vi Ka Bridge (Adyar) flooded – river overtops",
        },
        {
            "id": "e3",
            "at_minute": 32,
            "kind": "WalkIns",
            "shelter_key": "IIT",
            "people": 300,
            "label": "300 walk-ins from Velachery arrive at IIT Madras Gymkhana",
        },
        {
            "id": "e4",
            "at_minute": 45,
            "kind": "FacilityLost",
            "shelter_key": "LOY",
            "facilities": ["Power", "Medical"],
            "label": "Loyola College Auditorium loses power – medical unit offline",
        },
        {
            "id": "e5",
            "at_minute": 70,
            "kind": "ShelterClosed",
            "shelter_key": "GDY",
            "label": "Guindy Govt Model School closed – structural crack reported",
        },
        {
            "id": "e6",
            "at_minute": 110,
            "kind": "RouteSegmentCleared",
            "segment": "Thiru Vi Ka Bridge",
            "label": "Thiru Vi Ka Bridge cleared by GCC engineers",
        },
    ],
    # Known household used in the README and tests for the public lookup page.
    "demo_household": {"zone": "VEL", "head_name": "Lakshmi Narayanan", "phone": "+91 98400 12345"},
}


PRIORITY_BY_SEV = {5: "P1", 4: "P1", 3: "P2", 2: "P3", 1: "P4"}
RISK_BY_SEV = {5: "Extreme", 4: "High", 3: "High", 2: "Moderate", 1: "Low"}


def synthetic_scenario(seed: int, zones: int, shelters: int, center: tuple[float, float] = (13.03, 80.24)) -> dict:
    """Seeded synthetic flood for stress drills. Same seed and sizes give the same scenario."""
    rng = Prng(seed)
    river_lat = center[0]
    spread = 0.06 + zones * 0.002

    def point():
        return (center[0] + (rng.next() - 0.5) * spread, center[1] + (rng.next() - 0.5) * spread * 1.2)

    bridge_count = max(2, round(zones / 6))
    bridges = {
        f"Bridge {chr(65 + i)}": (river_lat, center[1] - spread * 0.5 + spread * (i + 0.5) / bridge_count) for i in range(bridge_count)
    }
    zone_rows = []
    for i in range(zones):
        sev = rng.weighted([(5, 2), (4, 3), (3, 3), (2, 2), (1, 1)])
        zone_rows.append(
            (
                f"Z{i + 1:02d}",
                f"Sector {i + 1}",
                point(),
                0.5 + rng.next() * 0.6,
                rng.int(150, 900),
                sev,
                PRIORITY_BY_SEV[sev],
                RISK_BY_SEV[sev],
            )
        )
    total = sum(z[4] for z in zone_rows)
    shelter_rows = []
    for i in range(shelters):
        facilities = ["Water", "Food", "Bedding"]
        for name, p in (("Power", 0.8), ("Medical", 0.55), ("Accessibility", 0.6), ("Pets", 0.3)):
            if rng.chance(p):
                facilities.append(name)
        shelter_rows.append(
            (
                f"S{i + 1}",
                f"Relief Camp {i + 1}",
                f"Camp Site {i + 1}",
                point(),
                round(total * 1.15 / shelters * (0.6 + rng.next() * 0.8)),
                rng.int(0, 60),
                facilities,
            )
        )
    corridors = []
    for z in zone_rows:
        nearest = sorted(shelter_rows, key=lambda s: haversine_km(z[2], s[3]))[:4]
        for s in nearest:
            via = []
            if (z[2][0] < river_lat) != (s[3][0] < river_lat):
                via.append(min(bridges.items(), key=lambda b: abs(b[1][1] - z[2][1]))[0])
            corridors.append((z[0], s[0], via, rng.weighted([("Low", 4), ("Moderate", 3), ("High", 1)])))
    names = list(bridges)
    events = [
        {"id": "s1", "at_minute": 15, "kind": "RouteSegmentBlocked", "segment": names[0], "label": f"{names[0]} washed out"},
        {
            "id": "s2",
            "at_minute": 35,
            "kind": "FacilityLost",
            "shelter_key": "S1",
            "facilities": ["Power", "Medical"],
            "label": "Relief Camp 1 loses power",
        },
        {
            "id": "s3",
            "at_minute": 55,
            "kind": "ShelterClosed",
            "shelter_key": f"S{min(2, shelters)}",
            "label": "Relief Camp 2 closed – access road unsafe",
        },
    ]
    if len(names) > 1:
        events.append({"id": "s4", "at_minute": 80, "kind": "RouteSegmentBlocked", "segment": names[1], "label": f"{names[1]} closed"})
    return {
        "id": f"synthetic-{seed}-{zones}x{shelters}",
        "name": f"Synthetic stress test (seed {seed}, {zones} zones)",
        "description": f"Seeded synthetic flood with {zones} zones, {shelters} shelters and {len(names)} river crossings.",
        "seed": seed,
        "duration_minutes": 120,
        "center": list(center),
        "disaster": {
            "type": "Flood",
            "title": f"Synthetic Flood (seed {seed})",
            "description": "Generated scenario for load and regression testing of the allocation engine.",
            "severity": "High",
            "state": "Tamil Nadu",
            "district": "Chennai",
        },
        "zones": zone_rows,
        "shelters": shelter_rows,
        "segments": bridges,
        "corridors": corridors,
        "depots": [("North Depot", (center[0] + spread * 0.3, center[1])), ("South Depot", (center[0] - spread * 0.3, center[1]))],
        "fleet": [
            ("Bus", 60, max(6, round(zones * 1.5)), "SYN-B"),
            ("Van", 12, max(3, round(zones / 3)), "SYN-V"),
            ("Ambulance", 6, max(2, round(zones / 4)), "SYN-A"),
        ],
        "teams": [
            ("Synthetic Team Alpha", 6, "+91 44 0000 0001", "North Depot"),
            ("Synthetic Team Bravo", 6, "+91 44 0000 0002", "South Depot"),
        ],
        "resources": CHENNAI_FLOOD["resources"],
        "events": events,
    }


SCENARIOS = {
    CHENNAI_FLOOD["id"]: lambda: CHENNAI_FLOOD,
    "synthetic-42-24x8": lambda: synthetic_scenario(42, 24, 8),
    "synthetic-7-40x12": lambda: synthetic_scenario(7, 40, 12),
}


def scenario_by_id(scenario_id: str) -> dict:
    return SCENARIOS.get(scenario_id, SCENARIOS[CHENNAI_FLOOD["id"]])()
