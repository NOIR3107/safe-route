"""Writes a scenario (seed data) into a database. Used by `python -m app.seed` and by drills that
load a synthetic stress scenario. Same scenario + seed always gives the same rows."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import Base
from app.core.security import get_password_hash
from app.engine.geo import path_length_km
from app.models import (
    AffectedZone,
    AuditLog,
    Disaster,
    Household,
    HouseholdMember,
    Notification,
    OpsEvent,
    OpsState,
    RescueTeam,
    Resource,
    RoadSegment,
    Route,
    RouteSegment,
    Shelter,
    ShelterFacility,
    User,
    Vehicle,
)

from .prng import Prng

FIRST_NAMES = (
    "Lakshmi Murugan Priya Karthik Meena Senthil Anitha Ravi Kavitha Suresh Divya Ganesh Revathi Arun Selvi "
    "Vignesh Saranya Prakash Deepa Bala Nandhini Rajesh Gayathri Mani Shalini Ramesh Janani Venkat Malathi "
    "Dinesh Fathima Joseph Mary Abdul Sophia Imran Yamuna Hari Pooja Siva"
).split()
LAST_NAMES = (
    "Narayanan Subramanian Krishnan Raman Pillai Iyer Natarajan Sundaram Rajan Kumar Selvam Murthy "
    "Balasubramanian Venkatesan Arumugam Shanmugam Joseph Basha Fernando Devi"
).split()

# Demo accounts. The first two are the accounts the original backend seeded.
DEMO_USERS = [
    ("System Administrator", "admin@saferoute.org", "Admin", "+91-9876543210", "Admin@12345"),
    ("Evacuation Coordinator", "coordinator@saferoute.org", "Evacuation Coordinator", "+91-9876543211", "Coord@12345"),
    ("Incident Commander", "commander@saferoute.org", "Emergency Authority", "+91-9876543212", "Command@12345"),
    ("Shelter Manager – T. Nagar", "shelter.tnagar@saferoute.org", "Shelter Manager", "+91-9876543213", "Shelter@12345"),
    ("Transport Coordinator", "transport@saferoute.org", "Transport Coordinator", "+91-9876543214", "Transport@12345"),
    ("Field Team Alpha Lead", "field.alpha@saferoute.org", "Response Team", "+91-9876543215", "Field@12345"),
    ("Relief Medical Officer", "relief@saferoute.org", "Relief Staff", "+91-9876543216", "Relief@12345"),
    ("NGO Volunteer Desk", "ngo@saferoute.org", "NGO Volunteer", "+91-9876543217", "Ngo@12345"),
]
DEMO_PASSWORDS = {email: pw for _, email, _, _, pw in DEMO_USERS}


def clear_all(db: Session) -> None:
    """Empty every table (keeps the schema) and restart the ids at 1.

    Row DELETEs, not TRUNCATE: TRUNCATE takes exclusive table locks and deadlocked with screens
    reading the same tables while a drill scenario was loading. Readers keep seeing the old rows
    until this transaction commits."""
    pg = db.bind.dialect.name == "postgresql"
    if pg:
        db.execute(text("SET LOCAL session_replication_role = replica"))  # skip FK checks while emptying
    for t in reversed(Base.metadata.sorted_tables):
        db.execute(t.delete())
    if pg:
        db.execute(text("SET LOCAL session_replication_role = DEFAULT"))
        for t in Base.metadata.sorted_tables:
            for col in t.primary_key.columns:
                if len(t.primary_key.columns) == 1 and str(col.type) == "INTEGER":
                    db.execute(text(f"SELECT setval(pg_get_serial_sequence('{t.name}', '{col.name}'), 1, false)"))
    db.flush()


def _count(size: int, p: float, rng: Prng) -> int:
    return sum(1 for _ in range(size) if rng.chance(p))


def _blob(c, radius_km: float, rng: Prng) -> list[list[float]]:
    """Irregular polygon around a centroid (about radius_km), deterministic for a given seed."""
    import math

    d_lat = radius_km / 111
    d_lon = radius_km / (111 * math.cos(math.radians(c[0])))
    pts = []
    for i in range(10):
        a = i / 10 * math.pi * 2
        r = 0.7 + rng.next() * 0.45
        pts.append([round(c[0] + math.sin(a) * d_lat * r, 6), round(c[1] + math.cos(a) * d_lon * r, 6)])
    return pts


def load_scenario(db: Session, sc: dict, now: datetime | None = None, users: bool = True) -> dict:
    """Clear the database and load scenario `sc`. Returns ids by scenario key."""
    now = now or datetime.now(UTC)
    rng = Prng(sc["seed"])
    clear_all(db)

    if users:
        for name, email, role, phone, pw in DEMO_USERS:
            db.add(User(name=name, email=email, role=role, phone_number=phone, hashed_password=get_password_hash(pw), created_at=now))
        db.flush()

    d = sc["disaster"]
    disaster = Disaster(
        type=d["type"],
        title=d["title"],
        description=d["description"],
        severity=d["severity"],
        status="Active",
        start_date=now,
        created_at=now,
        created_by=1 if users else None,
    )
    db.add(disaster)
    db.flush()

    # ---- zones and the households living in them
    zone_ids: dict[str, int] = {}
    demo = sc.get("demo_household") or {}
    for code, name, centroid, radius, population, severity, priority, risk in sc["zones"]:
        zone = AffectedZone(
            disaster_id=disaster.disaster_id,
            code=code,
            name=name,
            location=name,
            state=d["state"],
            district=d["district"],
            population=0,
            priority=priority,
            risk_level=risk,
            severity=severity,
            evacuated_count=0,
            status="Pending",
            centroid_lat=centroid[0],
            centroid_lon=centroid[1],
            polygon=_blob(centroid, radius, rng),
        )
        db.add(zone)
        db.flush()
        zone_ids[code] = zone.zone_id
        people = n = 0
        while people < population:
            n += 1
            size = min(population - people, rng.weighted([(1, 10), (2, 18), (3, 22), (4, 25), (5, 15), (6, 7), (7, 3)]))
            is_demo = n == 1 and demo.get("zone") == code
            last = rng.pick(LAST_NAMES)
            head = demo["head_name"] if is_demo else f"{rng.pick(FIRST_NAMES)} {last}"
            members = [head] + [f"{rng.pick(FIRST_NAMES)} {'Narayanan' if is_demo else last}" for _ in range(1, size)]
            elderly, children = _count(size, 0.12, rng), _count(size, 0.22, rng)
            disabled = 1 if rng.chance(0.05) else 0
            medical = 1 if rng.chance(0.04) else 0
            hid = f"HH-{code}-{n:04d}"
            db.add(
                Household(
                    household_id=hid,
                    zone_id=zone.zone_id,
                    token=f"SR-{code}-{rng.int(1000, 9999)}{n:03d}",
                    head_name=head,
                    phone=demo["phone"] if is_demo else f"+91 9{rng.int(1000, 9999)} {rng.int(10000, 99999)}",
                    size=size,
                    elderly=elderly,
                    children=children,
                    disabled=disabled,
                    medical=medical,
                    pets=rng.chance(0.12),
                    status="Awaiting",
                    walk_in=False,
                    members=[HouseholdMember(position=i, name=m) for i, m in enumerate(members)],
                )
            )
            people += size
        zone.population = people
    db.flush()

    # ---- shelters
    shelter_ids: dict[str, int] = {}
    for key, name, location, pos, capacity, occupancy, facilities in sc["shelters"]:
        s = Shelter(
            name=name,
            location=location,
            capacity=capacity,
            current_occupancy=occupancy,
            status="Active",
            latitude=pos[0],
            longitude=pos[1],
            reserved_pct=0.10,
            walk_ins=0,
            facilities_list=[ShelterFacility(facility_type=f, availability_status="Available") for f in facilities],
        )
        db.add(s)
        db.flush()
        shelter_ids[key] = s.shelter_id

    # ---- road segments and routes (schematic until OSRM geometry is fetched)
    segment_ids: dict[str, int] = {}
    for name, pos in sc["segments"].items():
        seg = RoadSegment(name=name, latitude=pos[0], longitude=pos[1])
        db.add(seg)
        db.flush()
        segment_ids[name] = seg.segment_id
    zones_by_code = {z[0]: z for z in sc["zones"]}
    shelters_by_key = {s[0]: s for s in sc["shelters"]}
    for zone_code, shelter_key, via, risk in sc["corridors"]:
        z, s = zones_by_code[zone_code], shelters_by_key[shelter_key]
        path = [list(z[2]), *[list(sc["segments"][v]) for v in via], list(s[3])]
        distance = max(0.5, round(path_length_km([tuple(p) for p in path]) * 1.3, 1))  # road factor over straight lines
        db.add(
            Route(
                disaster_id=disaster.disaster_id,
                zone_id=zone_ids[zone_code],
                shelter_id=shelter_ids[shelter_key],
                source=z[1],
                destination=s[2],
                distance_km=distance,
                travel_time=max(4, round(distance / 20 * 60)),
                risk_level=risk,
                status="Open",
                path=path,
                geometry_source="schematic",
                segments=[RouteSegment(position=i, segment_id=segment_ids[v]) for i, v in enumerate(via)],
            )
        )
    db.flush()

    # ---- teams and fleet
    teams = []
    for name, members, contact, location in sc["teams"]:
        t = RescueTeam(name=name, members_count=members, contact_number=contact, status="Available", current_location=location)
        db.add(t)
        teams.append(t)
    db.flush()
    depot_idx = 0
    vehicle_no = 0
    for vtype, seats, count, prefix in sc["fleet"]:
        for i in range(count):
            vehicle_no += 1
            depot_name, depot = sc["depots"][depot_idx % len(sc["depots"])]
            depot_idx += 1
            lat = round(depot[0] + (rng.next() - 0.5) * 0.004, 6)
            lon = round(depot[1] + (rng.next() - 0.5) * 0.004, 6)
            db.add(
                Vehicle(
                    disaster_id=disaster.disaster_id,
                    team_id=teams[(vehicle_no - 1) % len(teams)].team_id,
                    vehicle_type=vtype,
                    capacity=seats,
                    status="Available",
                    current_location=depot_name,
                    plate_number=f"{prefix}-{4500 + i}",
                    depot_lat=lat,
                    depot_lon=lon,
                    position_lat=lat,
                    position_lon=lon,
                    position_source="depot",
                )
            )
    if users:  # scopes: the shelter manager runs the first shelter, the field lead belongs to the first team
        for u in db.query(User).all():
            if u.role == "Shelter Manager":
                u.shelter_id = shelter_ids[sc["shelters"][0][0]]
            elif u.role == "Response Team":
                u.team_id = teams[0].team_id
    for rtype, stock, per_person, availability, location in sc["resources"]:
        db.add(
            Resource(
                disaster_id=disaster.disaster_id,
                resource_type=rtype,
                quantity=stock,
                per_person=per_person,
                availability=availability,
                location=location,
            )
        )
    db.flush()

    if users:
        log = AuditLog(
            user_id=1,
            action="CREATE_DISASTER",
            entity_type="Disaster",
            entity_id=disaster.disaster_id,
            details=f'Seeded scenario "{sc["name"]}"',
            timestamp=now,
        )
        db.add(log)
        db.flush()
        db.add(
            Notification(
                user_id=None,
                type="CRITICAL",
                status="Unread",
                timestamp=now,
                log_id=log.log_id,
                message=f"{d['title']}: incident declared. {len(sc['zones'])} zones flagged for assisted evacuation.",
            )
        )
    db.add(OpsEvent(sim_minute=0, timestamp=now, level="critical", title="Incident declared", detail=d["description"]))
    db.add(
        OpsState(
            id=1,
            sim_minute=0,
            phase="idle",
            speed=4,
            scenario_id=sc["id"],
            duration_minutes=sc["duration_minutes"],
            timeline=resolve_events(sc, shelter_ids),
            fired_event_ids=[],
            has_snapshot=False,
        )
    )
    db.flush()
    return {"zones": zone_ids, "shelters": shelter_ids, "disaster_id": disaster.disaster_id}


def resolve_events(sc: dict, shelter_ids: dict[str, int]) -> list[dict]:
    """Scenario events name shelters by key; the drill timeline stores real shelter ids."""
    out = []
    for e in sc["events"]:
        e = dict(e)
        key = e.pop("shelter_key", None)
        if key is not None:
            e["shelter_id"] = shelter_ids[key]
        out.append(e)
    return out
