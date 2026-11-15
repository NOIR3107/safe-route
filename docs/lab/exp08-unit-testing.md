# Experiment 8 – Unit tests and basic integration testing

| Suite | Framework | Where | Tests | How to run |
|---|---|---|---|---|
| Backend unit + API integration | **PyTest** + FastAPI `TestClient` | `tests/` | 36 | `pytest` |
| Frontend engine + adapters + mock service | **Vitest** | `frontend/src/**/*.test.ts` | 42 | `cd frontend && npm test` |
| End-to-end (browser) | **Playwright** | `frontend/e2e/` | 5 | `cd frontend && npm run e2e` |

Results of the latest run are in [Experiment 11](exp11-test-plan-and-report.md#5-test-report).

## Backend (PyTest)

The tests run against an in-memory SQLite database (`tests/conftest.py`), recreated for every test, so
they never touch `saferoute.db`.

Fixtures: `client`, `db_session`, `admin_headers`, `coordinator_headers`, and `headers_for(role)`, which
creates a user with any role and returns a bearer header.

| File | What it covers |
|---|---|
| `test_auth.py` | health check, register + login + `/auth/me`, wrong password → 401 |
| `test_disasters_zones.py` | create/read disasters, register zones |
| `test_shelters_routes.py` | create a shelter and add a facility; create a route and update it to Blocked |
| `test_allocation_engine.py` | priority ranking; blocked route and full shelter excluded |
| `test_engines_extra.py` | exact priority score (0.855), zero for evacuated zones, `P1-Critical` parsing, flooded/blocked routes never chosen, suitability ordering, population split across shelters without exceeding capacity |
| `test_dynamic_replanning.py` | route blocked → people moved to the alternative shelter |
| `test_reallocation_api.py` | the same through `/evacuations/reallocate`; audit `DYNAMIC_REALLOCATION` + CRITICAL notification written; unknown plan → 400; full shelter → move; invalid payloads → 422 |
| `test_rbac.py` | no/invalid token → 401; which roles may create disasters (parametrised over 5 roles); Admin always allowed; shelter manager can't generate a plan; response team can update but not create routes; audit log only for Admin/Authority; users list only for Admin; inactive user blocked |
| `test_api_integration.py` | full workflow: disaster → zone → shelter → route → vehicle → generate → dashboard |

Coverage (`pytest --cov=app`): **86 %** of 1,479 statements. Engines: priority 100 %, replanning
97 %, allocation 91 %. The lowest are the user-admin router (48 %) and resource/shelter services
(45–55 %), mostly update paths.

## Frontend (Vitest)

| File | What it covers |
|---|---|
| `engine/__tests__/cost.test.ts` | severity weighting, congestion, risk/facility/utilisation/stability penalties; hard constraints (blocked route, missing or degraded facility, closed shelter, no capacity, walk-in reserve) |
| `engine/__tests__/allocate.test.ts` | both strategies: households never split, capacity respected, medical households only to medical shelters, blocked edges explained, unallocated reported; Min-Cost Flow beats Greedy where Greedy is short-sighted; low-severity zones cut first; ambulances for medical groups; ETA formula |
| `engine/__tests__/replan.test.ts` | only affected assignments selected per event type; stability order; plan diff; min-cost-flow solver; priority score parity with Python |
| `features/godseye/gev.test.ts` | god's-eye-view adapter: ≤ 24 annotations, closed roads as red arrows, camera placement, embed URL |
| `api/mock/__tests__/demoFlow.test.ts` | the whole demo at service level: seed data, generate → explain → approve → drill → re-plan → override audited; replay; RBAC; check-in, walk-ins, reunification; public lookup |

## End-to-end (Playwright)

`e2e/demo-flow.spec.ts` drives a real Chromium through the demo (login → plan → why → approve → drill →
block route → diff → override → audit), plus shelter-manager scoping and the Tamil public page. Any
console error fails the test. `e2e/gods-eye.spec.ts` checks the 3D integration (skipped when
god's-eye-view isn't running).
