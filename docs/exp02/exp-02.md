# Experiment 2 – Requirements Elicitation & SRS

## Objective

To gather stakeholder requirements through interviews/questionnaires and convert them into a structured
Software Requirements Specification.

## Procedure

1. Identified the stakeholder groups.
2. Prepared the interview questionnaire below.
3. Wrote the functional requirements (FR-01..FR-12), non-functional requirements and acceptance criteria.
4. After implementation, traced every requirement to the use case, code, endpoint, table and tests that
   satisfy it (traceability matrix below).

> The questionnaire is the one in the lab file. This document does not report interview answers. TODO
> (team): if interviews were held, add who was asked, when, and what changed because of their answers.

## Output

### Stakeholder groups

Emergency Management Authority · Evacuation Coordinator · Shelter Manager · Transportation Coordinator ·
Rescue/Response Team · Medical/Relief Personnel · NGOs/Volunteers · System Administrator.

### Questionnaire

1. What information is needed to initiate an evacuation?
2. How should affected zones and their severity be recorded?
3. How is shelter capacity currently monitored?
4. What should happen when a shelter reaches capacity?
5. How should blocked or unsafe routes be reported?
6. What information is required for vehicle assignment?
7. Which categories of evacuees require higher priority?
8. Which alerts should emergency coordinators receive?
9. What information should be visible on the monitoring dashboard?
10. Which actions should be restricted to authorized roles?

### Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | The system shall allow authorized users to create and manage disaster incidents. |
| FR-02 | The system shall allow users to register and update affected zones. |
| FR-03 | The system shall maintain shelter capacity, occupancy and facilities. |
| FR-04 | The system shall maintain route status and route risk information. |
| FR-05 | The system shall maintain vehicles and response-team availability. |
| FR-06 | The system shall calculate evacuation priority for affected populations. |
| FR-07 | The system shall identify feasible shelters using hard constraints. |
| FR-08 | The system shall rank feasible shelters using configurable suitability factors. |
| FR-09 | The system shall generate evacuation assignments and resource assignments. |
| FR-10 | The system shall dynamically reallocate assignments when critical conditions change. |
| FR-11 | The system shall provide role-based access control. |
| FR-12 | The system shall record notifications and audit events. |

### Non-functional requirements

Security · Usability · Maintainability · Reliability · Performance · Scalability · Testability · Availability.
How each one was addressed is listed in [Experiment 12](../exp12/exp-12.md#non-functional-requirements).

### Acceptance criteria

1. Authorized users can create a disaster and affected zones. → TC-API-09
2. Shelters with no capacity or inaccessible routes are excluded from allocation. → TC-API-11, TC-ENG-02, TC-ENG-06
3. A valid evacuation plan can be generated and stored. → TC-API-11
4. Changing shelter or route status can trigger reallocation. → TC-API-12, TC-API-13, TC-SVC-01, TC-SVC-04
5. Unauthorized users cannot access restricted operations. → TC-API-03, TC-API-05, TC-API-07

### Traceability matrix

Use case numbers refer to the use case diagram in [Experiment 3](../exp03/exp-03.md). Paths are
relative to `backend/app` unless they start with `frontend/`. Endpoints are under `/api/v1`. Test IDs
are listed in [docs/exp11/test-cases.md](../exp11/test-cases.md).

| FR | Use case | Service / engine | Endpoint(s) | Table(s) | Screen | Tests |
|---|---|---|---|---|---|---|
| FR-01 | UC1 Manage disaster incidents | `services/catalog.py` create_disaster, update_disaster | `GET/POST /disasters`, `PUT /disasters/{id}` | disasters | Dashboard header | TC-API-09, TC-API-35 |
| FR-02 | UC2 Register/update zones | `services/catalog.py` create_zone, update_zone | `GET/POST /zones`, `PUT /zones/{id}` | affected_zones, households, household_members | Zones | TC-API-09, TC-API-10, TC-API-37 |
| FR-03 | UC3 Manage shelters | `services/catalog.py` create/update/transition_shelter, set_facility_availability; `engine/status.py` | `/shelters`, `/shelters/{id}/status`, `/shelters/{id}/facilities`, `/shelters/{id}/checkin`, `/shelters/{id}/walk-ins` | shelters, shelter_facilities | Shelters, Shelter Check-in | TC-API-19, TC-API-29, TC-API-31, TC-ENG-31, TC-ENG-32, TC-SVC-06, TC-SVC-07 |
| FR-04 | UC4 Update route status | `services/catalog.py` create_route, transition_route, apply_route_status | `/routes`, `/routes/{id}/status`, `/routes/segments` | routes, road_segments, route_segments | Routes, map | TC-API-13, TC-API-14, TC-API-32, TC-SVC-04, TC-SVC-05 |
| FR-05 | UC5 Manage vehicles and teams | `services/catalog.py` create/update_vehicle, create/update_team; `services/operations.py` | `/vehicles`, `/rescue-teams`, `/field/vehicles/{id}/position` | vehicles, rescue_teams | Vehicles & Teams, Field Team | TC-API-33, TC-API-34 |
| FR-06 | UC6 Generate plan | `engine/priority.py`, `engine/allocate.py` build_groups | `POST /evacuations/generate` | affected_zones, households | Allocation Plan ("why") | TC-ENG-10..14 |
| FR-07 | UC6 Generate plan | `engine/allocate.py` (feasibility, vehicle constraint), `engine/cost.py` | `POST /evacuations/generate` | shelters, routes, vehicles | Allocation Plan | TC-ENG-01..06, TC-ENG-15..17, TC-ENG-21..23, TC-API-11 |
| FR-08 | UC6, UC6b Explain choice | `engine/cost.py`, `engine/config.py` PlanningConfig (`backend/planning.json`) | `POST /evacuations/generate`, `GET /evacuations/compare` | plan_versions (metrics) | Allocation Plan, strategy comparison | TC-ENG-07..09, TC-ENG-19, TC-ENG-20, TC-API-17 |
| FR-09 | UC6 Generate plan | `engine/allocate.py` dispatch_vehicles; `services/planning.py` allocate_resources | `GET /evacuations/assignments`, `GET /evacuations/resource-allocations` | evacuation_assignments, vehicle_assignments, assignment_households, resource_allocations, resources | Allocation Plan, Field Team | TC-API-20, TC-API-18, TC-ENG-34..36 |
| FR-10 | UC9 Reallocate on change | `services/planning.py` replan, check_shelter_overflow, retry_unallocated; `engine/replan.py`, `engine/diff.py` | `POST /routes/{id}/status`, `POST /shelters/{id}/status`, `POST /evacuations/reallocate`, `POST /ingest` | plan_versions, plan_version_assignments | Plan Versions (diff), Drill | TC-ENG-24..30, TC-API-12, TC-API-13, TC-API-22, TC-SVC-01, TC-SVC-04 |
| FR-11 | UC0 Log in | `core/security.py`, `core/rbac.py`, `api/deps.py` require | `POST /auth/login`, `GET /auth/me`, every protected route | users | Login, navigation per role | TC-API-01..08, TC-SVC-03 |
| FR-12 | UC14 Audit and notifications | `services/logbook.py` audit, notify | `GET /logs/audit`, `GET /notifications`, `POST /notifications/{id}/read` | audit_logs, notifications | Audit & Notifications, bell | TC-API-12, TC-API-38, TC-SVC-01, TC-SVC-09 |

Live-data features that support the FRs: ingestion (`POST /ingest`, table ingest_log, TC-API-21..25),
WebSocket push (`/ws`, TC-API-26) and drills on a copy (`/drill/*`, tables ops_state and ops_events,
TC-API-27, TC-API-28).

## Conclusion

The SRS gave twelve testable functional requirements and five acceptance criteria. Every requirement is
now traced to code, an endpoint, a table and at least one passing automated test.
