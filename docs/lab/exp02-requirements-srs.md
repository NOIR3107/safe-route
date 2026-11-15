# Experiment 2 – Requirements elicitation and SRS

## How we gathered requirements

We wrote a short questionnaire covering each stakeholder group and used it for interviews. The answers
were grouped by stakeholder and turned into the requirements below.

> **TODO (team):** list who was interviewed / filled the questionnaire (role, not personal details) and when.

### Questionnaire

1. What information do you need before starting an evacuation?
2. How should affected zones and their severity be recorded?
3. How is shelter capacity monitored today?
4. What should happen when a shelter reaches capacity?
5. How should blocked or unsafe routes be reported?
6. What do you need to know to assign a vehicle?
7. Which groups of evacuees need higher priority?
8. Which alerts should a coordinator receive?
9. What should be visible on the monitoring dashboard?
10. Which actions should only certain roles be allowed to do?

### Key points the design is based on

* Elderly, disabled and medical patients must be moved first, and families should not be split.
* Shelters should keep some space free for people who walk in on their own (we used 10%).
* When a road closes, coordinators want to see *only what changed*, not a brand new plan.
* Nobody wanted the software to dispatch vehicles by itself: "show me, I'll approve it".
* Field teams often have bad network, so their screen has to work offline.

## Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | Authorised users can create and manage disaster incidents. |
| FR-02 | Users can register and update affected zones. |
| FR-03 | The system maintains shelter capacity, occupancy and facilities. |
| FR-04 | The system maintains route status and route risk. |
| FR-05 | The system maintains vehicle and response-team availability. |
| FR-06 | The system calculates evacuation priority for affected populations. |
| FR-07 | The system identifies feasible shelters using hard constraints. |
| FR-08 | The system ranks feasible shelters using configurable suitability factors. |
| FR-09 | The system generates evacuation and resource assignments. |
| FR-10 | The system re-allocates dynamically when critical conditions change. |
| FR-11 | The system provides role-based access control. |
| FR-12 | The system records notifications and audit events. |

Where each FR is implemented and tested is tracked on the *Architecture & FRs* page of the app and in
[Experiment 11](exp11-test-plan-and-report.md).

## Non-functional requirements

| Category | What we committed to |
|---|---|
| Security | JWT auth, bcrypt password hashing, role checks on every write endpoint, scoped access for shelter managers and field teams |
| Usability | Status shown with icon + text (never colour alone), keyboard navigation, English/Hindi/Tamil on the public page |
| Maintainability | Layered backend, one API interface in the frontend, engine code separated from UI |
| Reliability | Offline queue in the field view; re-planning never drops people silently (they show up as "unallocated") |
| Performance | Plan for ~5,000 people and ~60 vehicles in well under a second in the browser |
| Scalability | Stateless API; PostgreSQL in production |
| Testability | Engines are pure functions with unit tests; API covered by PyTest integration tests |
| Availability | PWA caches the app shell so the field view loads without network |

## Acceptance criteria

* An authorised user can create a disaster and affected zones.
* Shelters with no capacity, or reachable only through blocked routes, are excluded from allocation.
* A valid evacuation plan can be generated and stored.
* Changing a shelter or route status can trigger re-allocation.
* Unauthorised users cannot perform restricted operations.
