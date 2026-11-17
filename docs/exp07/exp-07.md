# Experiment 7 – Integration of Modules

## Objective

To integrate the frontend, API, services, engine, database and live-data feed into one working system,
and to check that data moves correctly across every boundary.

## Procedure

1. Defined the contract: FastAPI generates OpenAPI from the Pydantic response models
   (`app/schemas/responses.py`). The frontend mirrors each response as a zod schema
   (`src/api/viewSchemas.ts`) and validates every reply.
2. Removed the in-browser mock API. The frontend has one client (`src/api/http/HttpApi.ts`) that talks
   to the backend only.
3. Connected live updates: after every committed write the backend publishes the changed topics on
   `/ws`. The browser refetches only queries for those topics (`shouldRefetch`, TC-UI-04, TC-UI-05).
4. Connected the live feed: `POST /api/v1/ingest` with `X-Ingest-Token`. Messages go through the same
   services as user actions.
5. Integration-tested the API on a real PostgreSQL database migrated with Alembic (TC-API-01..39). The
   whole UI was swept per role with Playwright.
6. Traced one value end to end by hand (below).

## Output

### Interfaces

| Boundary | Mechanism | Checked by |
|---|---|---|
| Browser ↔ API | REST/JSON under `/api/v1` (61 operations + `/health`), JWT bearer | zod in the browser; TC-API tests |
| API → browser | WebSocket `/ws`: `hello`, `changed {topics, mode}`, `tick` every 1 s | TC-API-26; TC-UI-01..05 |
| Feed → API | `POST /api/v1/ingest`, `FeedBatch` of typed messages (route_status, shelter_status, shelter_occupancy, walk_ins, facility_status, vehicle_position, pickup_confirmed, arrival_confirmed, route_geometry) | TC-API-21..25 |
| Services → engine | `EngineInput` dataclasses in, `AllocationResult` out | TC-ENG tests |
| Repositories → PostgreSQL | SQLAlchemy 2; writes serialized by a PostgreSQL advisory lock | TC-API tests on PostgreSQL |
| Road geometry | OSRM (`router.project-osrm.org`), recorded once into `ingestion/samples/osrm_routes.json` (40 routes) and applied as `route_geometry` messages | TC-API-25 |

### One value end to end (run on 17 Nov 2026)

A script sent one feed message and watched the Shelters page in a headless browser, signed in as the
Evacuation Coordinator:

```
API before: shelter 4 current_occupancy=40; sending feed value 57
POST /ingest -> 200 {"accepted":1,"rejected":0,"errors":[]}
UI shows 57 after 1828 ms (no reload)
API after: current_occupancy=57
ingest status: {"source":"verify-script", ..., "stale":false, "messages":41, "replay":false}
```

Path: feed → `POST /ingest` → Pydantic `ShelterOccupancyMsg` → adapter → `catalog` service →
`shelters.current_occupancy` in PostgreSQL → commit → WebSocket `changed` → browser refetch → Shelters
table and map ring. The 1.8 s includes the headless browser re-rendering the page. Full log:
[verification-log.txt](../exp12/verification-log.txt).

### Connection loss and recovery (same run)

The backend was stopped and restarted while the page was open:

```
15:16:47  state=live          "Live"
15:16:55  state=disconnected  "Disconnected · retrying in 3 s"   (backend stopped)
15:17:10  state=live          "Live"                             (backend back; data refetched)
page errors: none
```

When the socket closes, the state goes straight to *Disconnected*. *Stale* (socket open, no heartbeat
for 5 s) did not occur in this run; that path is covered by the unit test TC-UI-02.

### Integration issues found and fixed

| Issue | Fix |
|---|---|
| Deadlock between the drill clock and API writes | One PostgreSQL advisory lock for all writers (`serialize_writes`) |
| Shelter Manager saw no shelter after seeding | Seed links user scopes after shelters and teams exist |
| The CesiumJS bundle failed to load after a dependency update (`@zip.js/zip.js` 2.25 export change) | npm override pinning 2.7.73 |
| A test failed depending on how fast the replay ran against the clock | Test asserts on the drill clock, not on wall time |

Details in the [debugging log](../exp12/debugging-log.md).

## Conclusion

All modules work together on live data. A value from the feed reaches the database, the API and the
open screens without a reload, and the UI recovers after losing the backend.
