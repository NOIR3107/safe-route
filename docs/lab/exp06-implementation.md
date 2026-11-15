# Experiment 6 – Implementation of core modules

**Stack:** Python 3.12 + FastAPI + SQLAlchemy 2 + Pydantic v2 for the backend; React + TypeScript +
Vite for the frontend.

## Backend modules (`app/`)

| Module | What it does | FRs |
|---|---|---|
| `core/security.py`, `core/dependencies.py` | bcrypt hashing, JWT create/decode, `get_current_user`, `require_roles([...])` | FR-11 |
| `routers/auth.py`, `routers/users.py` | register, login (form + JSON), `/auth/me`, admin user management | FR-11 |
| `routers/disasters.py`, `routers/zones.py` + `services/disaster_service.py` | disaster incidents and affected zones | FR-01, FR-02 |
| `routers/shelters.py` + `services/shelter_service.py` | shelters, occupancy, facilities | FR-03 |
| `routers/routes.py` + `services/route_service.py` | routes, status and risk | FR-04 |
| `routers/vehicles.py`, `routers/rescue_teams.py`, `routers/resources.py` + `services/resource_service.py` | fleet, teams, relief stock | FR-05 |
| `engines/priority_engine.py` | weighted priority score per zone (risk 35%, priority 30%, severity 20%, population 15%) | FR-06 |
| `engines/allocation_engine.py` | hard constraints, suitability score, allocation, vehicle assignment | FR-07, 08, 09 |
| `engines/replanning_engine.py` | rolls back affected assignments and re-allocates when a route is blocked or a shelter is full | FR-10 |
| `routers/evacuations.py` + `services/evacuation_service.py` | `/generate`, `/reallocate`, plans, dashboard summary | FR-09, FR-10 |
| `services/audit_service.py`, `routers/logs.py` | audit log and notifications | FR-12 |

### How the allocation works (short version)

1. Rank zones with the priority engine.
2. For each zone, drop shelters that are not Active or have no space, and drop routes that are Blocked
   or Flooded (hard constraints, FR-07).
3. Score what is left: 45% capacity headroom, 35% travel time, 20% route risk (FR-08).
4. Fill the best shelter first, spill over to the next, and attach available vehicles (FR-09).

## Frontend modules (`frontend/src/`)

| Folder | What it does |
|---|---|
| `api/` | `schemas.ts` (zod copies of the Pydantic models), `SafeRouteApi` interface, `HttpApi` (live) and `MockApi` (in-browser) |
| `engine/` | TypeScript allocation engine: cost function, Greedy and Min-Cost Flow strategies, re-planning, plan diff |
| `features/dashboard` | map + KPIs + live feed |
| `features/plan` | assignment table, "Why this shelter?" drawer, strategy comparison, plan versions |
| `features/drill` | drill mode with the Chennai flood scenario |
| `features/resources` | CRUD for zones, shelters, routes, vehicles/teams |
| `features/checkin`, `features/field`, `features/public` | shelter manager, field team (offline), evacuee lookup |
| `features/godseye` | god's-eye-view 3D globe integration |
| `features/audit`, `features/architecture` | audit log, FR traceability |

### Why there is a second engine in TypeScript

The demo has to work without a running backend (and without internet for the field view), and drills
need to re-plan every simulated minute. So the engine is also written in TypeScript, as pure functions.
It extends the Python one with:

* a cost function per person: `travel_time × congestion × severity_weight + risk + facility + utilisation + stability` penalties;
* two strategies behind one interface: **Greedy** and **Min-Cost Flow** (successive shortest paths);
* households are never split between shelters or vehicles;
* every assignment stores *why* it was picked and why each other shelter was rejected.

The priority score is ported 1:1, and a test in each language checks the same input gives `0.855`.

## Seed data

`frontend/src/seed/chennaiFlood.ts` is a realistic scenario: 8 flood-prone localities along the Adyar
(Velachery, Pallikaranai, Saidapet, …), 7 shelters, 40 road corridors via named bridges, 58 vehicles,
4 teams and ~5,350 people in generated households with elderly/children/disabled/medical counts. It is
deterministic (seeded random numbers), so a drill can be replayed exactly.
