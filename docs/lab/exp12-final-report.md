# Experiment 12 – Final implementation, debugging, documentation and retrospective

## What was built

| Part | Status |
|---|---|
| FastAPI backend: auth/RBAC, 12 routers, services, 3 engines (FR-01 to FR-12) | Done |
| PyTest suite: 36 tests, 86 % coverage | Done |
| React frontend: 14 screens for 6 roles + public page | Done |
| Allocation engine in TypeScript (Greedy + Min-Cost Flow, explainability, re-planning, plan versions) | Done |
| Chennai flood drill scenario with scripted events and replay | Done |
| Offline-first field view (PWA, sync queue) | Done |
| English / Hindi / Tamil public page | Done |
| god's-eye-view 3D globe integration (submodule + embed) | Done |
| CI: Backend CI + Frontend CI on GitHub Actions | Done |
| Lab documentation for all 13 experiments | Done (a few TODOs for the team below) |

Requirement coverage and test results: [Experiment 11](exp11-test-plan-and-report.md).

## Debugging log (main issues)

| Issue | How we found it | Root cause | Fix |
|---|---|---|---|
| Some re-planned groups got 4-hour ETAs | Printing the drill minute by minute | Groups without a free vehicle were sent on foot, and the vehicle rebalancer compared bus trips using the *walking* time, so a bus never looked better | Use road travel time for vehicles; collect several vehicles for a walking group if that beats walking |
| Average arrival 2 h 45 min even without incidents | Same drill printout | Vehicles that finished their trips were never reused | Fleet rebalancing: freed vehicles go to the group with the biggest severity-weighted time saving (avg dropped to ~1 h 25 min) |
| Flooding a bridge did nothing in the drill | Drill test | The engine (correctly) avoided the risky bridge, so nobody used it | Scenario event changed to the bridge that actually carries traffic (Thiru Vi Ka) |
| Displaced people became "unallocated" instead of moving | Plan diff showed `0 moved` | Shelters were filled to 100 %, no slack anywhere | More realistic shelter capacities and long-haul corridors to the stadium |
| Blank map tiles on the drill page | Playwright screenshot | Leaflet measured its container before the grid layout settled | `ResizeObserver` → `invalidateSize()` |
| "Vitest failed to find the runner" on Windows | Running tests from VS Code's terminal | Path `c:\…` vs `C:\…` made Node load Vitest twice | Run from `C:\…` (documented) |
| god's-eye-view refused to load in our page | Browser console | It sends `X-Frame-Options: DENY` unless told otherwise | Start it with `GEV_EMBED_FRAME_ANCESTORS` for our origin |

## Documentation

* `README.md` (repo) and `frontend/README.md`: setup, demo flow, screenshots.
* `CONTRIBUTING.md`: branches, commits, PRs, review checklist.
* `docs/api-extensions.md`: endpoints the backend needs for the new features.
* `docs/lab/`: one file per experiment (this folder).
* FastAPI's own docs at `/docs` (Swagger) and `/redoc`.

## Retrospective

### What went well

* Keeping the engines free of HTTP/UI code made them easy to test in both Python and TypeScript.
* The mock API meant the frontend could be built and demoed without waiting for every endpoint.
* Writing the drill as data (events at T+N minutes) made bugs reproducible: same seed, same result.
* Printing the whole drill timeline exposed problems that unit tests didn't (D-01, ETAs).

### What didn't go so well

* The backend and frontend disagree on what "evacuated" means (plan time vs arrival). We noticed this
  late; it is written up but not fixed in the backend yet.
* Some backend update paths (user admin, resources) have low test coverage (45–55 %).
* Two copies of the allocation logic (Python and TypeScript) need to be kept in sync by hand. Right now
  only the priority score is checked in both.

### What we would do next

1. Implement the extension endpoints in FastAPI (plan versions, explanations, check-in) and port the
   Min-Cost Flow strategy to Python, then drop the TypeScript copy for live mode.
2. PostGIS for routes and zones (real road geometry instead of schematic corridors).
3. Raise backend coverage on the update endpoints to 80 %+.
4. A WebSocket for live updates instead of polling in live mode.

> **TODO (team):**
> * Individual contributions table (who did what).
> * Each member's personal reflection (2–3 lines): what you learned, what you'd do differently.
