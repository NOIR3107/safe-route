# Experiment 6 – Implementation of Core Modules

## Objective

To implement the core modules of SafeRoute from the design in Experiments 3–5, following coding
standards that keep the code readable and testable.

## Procedure

1. Set up the stack from the lab file: React (TypeScript, Vite) for the frontend; Python 3.12 +
   FastAPI for the backend; PostgreSQL 16 with SQLAlchemy 2 and Alembic; JWT for authentication.
2. Built the layers bottom-up: models and migrations → repositories → engine → services → API →
   frontend pages.
3. Wrote the engine as pure functions with typed inputs (`engine/model.py`), so the same input always
   gives the same plan (TC-ENG-18).
4. Applied coding standards, checked automatically:
   * Python: ruff for lint and format (`backend/ruff.toml`), type hints on public functions.
   * TypeScript: strict `tsc`, ESLint with zero warnings allowed, zod schemas for every API response.
   * Names from the domain (shelter, zone, route, household); comments explain *why*, not *what*.
5. Kept configuration out of code: planning weights and thresholds in `PlanningConfig`
   (`engine/config.py`, overridable by `backend/planning.json`), and server settings in `.env`.

## Output

### Modules

| Module | Folder / file | What it does |
|---|---|---|
| Authentication & RBAC | `app/core/security.py`, `app/core/rbac.py`, `app/api/auth.py` | bcrypt passwords, JWT bearer tokens, one permission table for 8 roles; shelter managers and field teams are scoped to their own shelter or team |
| Master data | `app/services/catalog.py`, `app/api/catalog.py` | CRUD for disasters, zones, shelters, routes, vehicles, teams, resources; legal status transitions only (`SHELTER_TRANSITIONS`, `ROUTE_TRANSITIONS`, illegal moves are 409) |
| Priority (FR-06) | `app/engine/priority.py` | Weighted score of zone risk, priority code (P1–P4), disaster severity, people still waiting and the vulnerable share (elderly, children, disabled, medical); weights in config |
| Feasibility & ranking (FR-07, FR-08) | `app/engine/allocate.py`, `app/engine/cost.py` | Excludes closed shelters, blocked or flooded routes, missing facilities, no free capacity, walks over `max_walk_km`; ranks the rest by a cost in weighted minutes: travel time × congestion × zone severity, plus penalties for route risk, missing soft facilities and pets, a nearly full shelter, and moving a group that already had a shelter. All weights come from config |
| Allocation (FR-09) | `app/engine/allocate.py`, `app/engine/mcf.py` | Greedy and Min-Cost Flow (successive shortest paths with SPFA); vehicles dispatched by capacity and need (ambulance for medical groups); supplies allocated per person |
| Re-planning (FR-10) | `app/engine/replan.py`, `app/engine/diff.py`, `app/services/planning.py` | Moves only the groups affected by a change and saves a new *Proposed* version with a diff, a notification and an audit entry; approval needs `plan:approve` |
| Shelter status | `app/engine/status.py` | "Open / Near Full / Full / Closed" from load = (present + inbound) / capacity. Thresholds come from config: Near Full at 0.75, Full at 1.0. The 10% walk-in reserve is not counted as full |
| Audit & notifications (FR-12) | `app/services/logbook.py` | Every write that matters is audited; alerts are linked to their audit entry |
| Live data | `app/ingestion`, `app/api/ws.py`, `app/core/events.py` | Feed messages validated by Pydantic and applied through the services; WebSocket push of "changed" topics and a 1 s heartbeat |
| Drills | `app/services/drill.py` | Copy live data to the drill database, run a scripted timeline with a clock, inject events, end and return to live |
| Frontend store and map | `frontend/src/hooks/queries.ts`, `frontend/src/api/live.ts`, `frontend/src/components/map` | One cache fed by REST and refreshed on WebSocket messages; one CesiumJS map with shelters (capacity rings), zones (severity), routes (status styles) and vehicles (moving) |
| Pages | `frontend/src/features/*` | Dashboard, Allocation Plan, Plan Versions, Drill, Zones, Shelters, Vehicles & Teams, Routes, Shelter Check-in, Field Team, Audit, Architecture, Public lookup, Login |

### Size (counted on the final code)

| | Lines |
|---|---:|
| Backend application (`backend/app`, Python) | 7,864 |
| Backend tests (`backend/tests`) | 1,304 |
| Frontend (`frontend/src`, TypeScript/TSX, excluding tests) | 9,095 |

### Example: the "90% shows Full" bug fixed in the status module

At 90% load, a shelter had only its walk-in reserve left and was shown as *Full*. The status now comes
from `shelter_display_status` with thresholds in config. 90% present-plus-inbound on a shelter with a
10% reserve shows **Near Full**, as the Shelters page screenshot in `docs/screenshots` shows. Covered by
TC-ENG-31 and TC-ENG-32.

## Conclusion

The core modules are implemented as designed, in the layers of Experiment 4. Lint, format and type
checks enforce the standards on every change (Experiment 10).
