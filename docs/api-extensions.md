# SafeRoute API extensions (proposed)

The React frontend talks to one interface, `SafeRouteApi` (`frontend/src/api/SafeRouteApi.ts`). In
**live** mode (`VITE_API_MODE=live`) every core feature maps to an endpoint that already exists in this
FastAPI backend. The features below need **new, additive endpoints**. Until those exist, the frontend
serves them from its in-browser mock service (`VITE_API_MODE=mock`, the default), and live mode shows
"Not available in live mode yet".

Nothing below changes an existing table or endpoint. Every extension is keyed by an existing primary
key, so it can be added as new tables (or JSON columns) beside the current models.

## 1. Already supported by the backend (used in live mode)

| Frontend call | Backend endpoint |
|---|---|
| `login` / `me` | `POST /auth/login/json`, `GET /auth/me` |
| `dashboardSummary` | `GET /dashboard/summary` |
| `listDisasters` | `GET /disasters/` |
| `listZones` / `createZone` / `updateZone` | `GET/POST /zones/`, `PUT /zones/{id}` |
| `listShelters` / `createShelter` / `updateShelter` | `GET/POST /shelters/`, `PUT /shelters/{id}` |
| `listRoutes` / `createRoute` / `updateRoute` | `GET/POST /routes/`, `PUT /routes/{id}` |
| `listVehicles` / `createVehicle` / `updateVehicle` | `GET/POST /vehicles/`, `PUT /vehicles/{id}` |
| `listTeams` / `createTeam` / `updateTeam` | `GET/POST /rescue-teams/`, `PUT /rescue-teams/{id}` |
| `listResources` | `GET /resources/` |
| `activePlan` / `listAssignments` | `GET /evacuations/plans` |
| `generatePlan` | `POST /evacuations/generate` |
| `transitionRoute` (Blocked) / `transitionShelter` (Full/Closed) | `PUT` + `POST /evacuations/reallocate` |
| `listAudit`, `listNotifications`, `markNotificationRead` | `GET /logs/audit`, `GET /logs/notifications`, `PUT /logs/notifications/{id}/read` |

## 2. Proposed data additions

| Extension | Keyed by | Fields |
|---|---|---|
| `ZoneExt` | `zone_id` | `code`, `severity` (1–5), `centroid`, `polygon` (GeoJSON / PostGIS `geometry(Polygon)`) |
| `Household` | `household_id` | `zone_id`, `token`, `head_name`, `phone`, `members[]`, `size`, `elderly`, `children`, `disabled`, `medical`, `pets`, `status`, `shelter_id`, `walk_in` |
| `ShelterExt` | `shelter_id` | `reserved_pct` (default 0.10), `walk_ins` |
| `RouteExt` | `route_id` | `zone_id`, `shelter_id`, `path` (PostGIS `LineString`), `via[]` (named segments such as bridges) |
| `VehicleExt` | `vehicle_id` | `team_id`, `depot`, `position` |
| `AssignmentExt` | `assignment_id` | `household_ids[]`, `eta_minutes`, `dispatch_minute`, `vehicle_ids[]`, `explanation` (JSON), `approval`, `override_reason`, `version` |
| `PlanVersion` | (`plan_id`, `version`) | `trigger` (JSON), `strategy`, `status`, `assignment_ids[]`, `unallocated` (JSON), `metrics` (JSON), `diff` (JSON), `approved_by`, `approved_at` |
| `UserScope` | `user_id` | `shelter_id`, `team_id`, `zone_ids[]` (RBAC scoping) |

The JSON shapes are the TypeScript interfaces in `frontend/src/api/extensions.ts`.

## 3. Proposed endpoints

All endpoints sit under `/api/v1` and require a JWT unless marked *public*. Roles follow `require_roles`
(Admin is always allowed).

### Planning and explainability
| Method & path | Roles | Purpose |
|---|---|---|
| `POST /evacuations/generate` *(extend)* | Authority, Coordinator | Accepts `strategy: "greedy" \| "min-cost-flow"`; creates plan version 1 or a new version |
| `GET /evacuations/plans/{id}/versions` | staff | Version timeline with `metrics` and `diff` |
| `GET /evacuations/assignments/{id}/explanation` | staff | Cost breakdown and rejected alternatives |
| `POST /evacuations/compare` | staff | What-if: runs both strategies without committing; returns `PlanMetrics` for each |
| `POST /evacuations/plans/{id}/versions/{v}/approve` | Authority, Coordinator | Human approval; writes `PLAN_APPROVED` to the audit log |
| `POST /evacuations/assignments/{id}/override` | Authority, Coordinator | Body `{shelter_id, reason}` (reason ≥ 10 chars); new version; audit `ASSIGNMENT_OVERRIDE` |

### Operations
| Method & path | Roles | Purpose |
|---|---|---|
| `GET /operations/events` | staff | Live event feed (or a WebSocket at `/ws/operations`) |
| `GET /field/tasks` | Response Team (scoped to team) | Assignments served by the team's vehicles |
| `POST /field/assignments/{id}/pickups` | Response Team | Body `{household_ids[]}`; idempotent, so offline replays are safe |
| `POST /field/assignments/{id}/arrived` | Response Team | Arrival confirmation |
| `GET /shelters/{id}/roster` | Shelter Manager (own shelter) | Expected and present households |
| `POST /shelters/{id}/check-in` | Shelter Manager (own shelter) | Body `{token}`; updates `current_occupancy` |
| `POST /shelters/{id}/walk-ins` | Shelter Manager (own shelter) | Body `{head_name, people}`; consumes the 10% reserve |
| `GET /reunification/search?q=` | staff | Name, household ID or phone search across shelters |
| `GET /public/lookup?q=` | *public* | Zone code or phone → shelter, route, ETA, what to bring (no personal data for zone queries) |

### Drills
| Method & path | Roles | Purpose |
|---|---|---|
| `GET /drills/scenarios` | Authority, Coordinator | Scenario catalogue (scenarios are data, see `frontend/src/seed`) |
| `POST /drills/load` | Authority, Coordinator | Loads a scenario into an isolated drill schema |
| `POST /drills/control` | Authority, Coordinator | `start`, `pause`, `resume`, `speed`, `replay`, `reset` |
| `POST /drills/events` | Authority, Coordinator | Inject an event; recorded for replay |

## 4. Engine parity

The TypeScript engine (`frontend/src/engine`) is pure, deterministic and unit-tested, so it can serve as
the reference for porting into `app/engines`:

* `priority.ts` is a 1:1 port of `priority_engine.py`; a test asserts identical scores.
* `cost.ts` + `allocate.ts` add the Min-Cost Flow strategy (successive shortest paths) next to Greedy,
  behind one `AllocationStrategy` interface.
* `replan.ts` selects only the affected assignments for `RouteBlocked`, `ShelterFull`, `ShelterClosed`
  and `FacilityLost` events.
* `diff.ts` produces the household-level plan diff.

### Semantic note
The backend `AllocationEngine.generate_plan` increments `zone.evacuated_count` and
`shelter.current_occupancy` when a plan is **generated**. The frontend treats these as **actual**
arrivals (incremented by field confirmations, check-ins or the drill clock) and reports planned
arrivals separately as `inbound`. Porting the engine should adopt the same split, so dashboards don't
count people as evacuated before they have left.
